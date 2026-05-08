/**
 * Evaluation Memoization
 * 
 * Ports: infinigen/core/constraints/evaluator/eval_memo.py
 * 
 * Manages memoization cache for constraint evaluation.
 * Handles cache invalidation when objects move or change.
 */

import { Node, Problem } from '../language/types';
import { State, ObjectState } from './state';
import { Move, TranslateMove, RotateMove, AdditionMove, DeletionMove } from '../solver/moves';
import { Semantics } from '../tags/index';

// Static tags that don't change during solving
const STATIC_TAGS = new Set([Semantics.Room, Semantics.Cutter]);

/**
 * Type guard to check if a value looks like a SceneConstant
 */
function isSceneConstantLike(n: any): boolean {
  return n != null && typeof n === 'object' && n.type && 
    (n.type === 'numeric' || n.type === 'string' || n.type === 'boolean') &&
    'name' in n && 'value' in n;
}

/**
 * Type guard to check if a move looks like a ReinitPoseMove
 */
function isReinitPoseMove(m: Move): boolean {
  return (m as any).variable !== undefined && (m as any).newDomain !== undefined;
}

/**
 * Type guard to check if a move looks like a RelationPlaneChange
 */
function isRelationPlaneChange(m: Move): boolean {
  return (m as any).relation !== undefined && (m as any).fromPlane !== undefined && (m as any).toPlane !== undefined;
}

/**
 * Type guard to check if a move looks like a Resample
 */
function isResample(m: Move): boolean {
  return (m as any).variable !== undefined && (m as any).domain !== undefined && (m as any).fromPlane === undefined;
}

/**
 * Generate a memoization key for a node
 */
export function memoKey(n: Node): any {
  if (n.constructor.name === 'Item') {
    return (n as any).var;
  }
  
  if (isSceneConstantLike(n)) {
    return 'SceneConstant';
  }
  
  return n; // Use object identity
}

/**
 * Evict memo entries related to a specific object
 */
export function evictMemoForObj(node: Problem, memo: Map<any, any>, obj: ObjectState): boolean {
  let res = false;
  
  // Recursively process children (Problem.children is an array, not a method)
  if (node.children) {
    for (const child of node.children) {
      const childRes = evictMemoForObj(child, memo, obj);
      if (childRes) res = true;
    }
  }

  // Handle tagged nodes - check if the node has tags property
  const nodeTags = (node as any).tags;
  if (nodeTags) {
    const objTags = obj.tags instanceof Set ? obj.tags : (obj.tags as any).tags || new Set();
    const requiredTags = nodeTags instanceof Set ? nodeTags : new Set(Array.isArray(nodeTags) ? nodeTags : []);
    if (!implies(objTags, requiredTags)) {
      res = false;
    }
  }
  
  // Scene nodes always need invalidation
  if (isSceneConstantLike(node)) {
    res = true;
  }

  // Remove from memo if needed
  const key = memoKey(node as unknown as Node);
  if (res && memo.has(key)) {
    memo.delete(key);
  }

  return res;
}

/**
 * Reset BVH cache for moved objects
 */
export function resetBVHCache(state: State, filterName?: string): void {
  const prevKeys = Array.from(state.bvhCache.keys());
  let evictedCount = 0;

  for (const k of prevKeys) {
    const [names, tags] = k;
    
    if (filterName !== undefined) {
      // Keep only entries not containing the filtered object
      if (!(names as string[]).includes(filterName)) {
        continue;
      }
    } else {
      // Keep only entries with static objects
      let keep = true;
      for (const n of names as string[]) {
        const ostate = state.objects.get(n);
        if (!ostate || !ostate.tags.has(Semantics.Room) && !ostate.tags.has(Semantics.Cutter)) {
          keep = false;
          break;
        }
      }
      if (keep) continue;
    }
    
    state.bvhCache.delete(k);
    evictedCount++;
  }

  console.debug(
    `resetBVHCache evicted ${evictedCount} out of ${prevKeys.length} original entries`
  );
}

/**
 * Evict memo entries after applying a move
 */
export function evictMemoForMove(
  problem: Problem,
  state: State,
  memo: Map<any, any>,
  move: Move
): void {
  if (move instanceof TranslateMove ||
      move instanceof RotateMove ||
      move instanceof AdditionMove ||
      isReinitPoseMove(move) ||
      isRelationPlaneChange(move) ||
      isResample(move)) {
    
    for (const name of move.names) {
      if (name === null) {
        throw new Error(`Invalid null name in move: ${move}`);
      }
      
      const obj = state.objects.get(name);
      if (obj) {
        evictMemoForObj(problem, memo, obj);
        resetBVHCache(state, name);
      }
    }
  } else if (move instanceof DeletionMove) {
    // For deletion, evict entries related to the deleted object and its relations
    for (const name of move.names) {
      if (name === null) {
        throw new Error(`Invalid null name in move: ${move}`);
      }
      
      const obj = state.objects.get(name);
      if (obj) {
        evictMemoForObj(problem, memo, obj);
      }
      
      // Also evict entries that reference the deleted object
      resetBVHCache(state, name);
      
      // Clear memo entries where the deleted object is a target
      for (const [key, value] of memo.entries()) {
        // Simple heuristic: clear all scene-level caches
        if (isSceneConstantLike(key) || 
            (typeof key === 'object' && key !== null)) {
          memo.delete(key);
        }
      }
    }
  } else {
    throw new UnsupportedOperationError(`Unsure what to evict for move: ${move}`);
  }
}

/**
 * Check if one tag set implies another
 */
function implies(tags: Set<any>, required: Set<any>): boolean {
  for (const req of required) {
    if (!tags.has(req)) {
      return false;
    }
  }
  return true;
}

class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOperationError';
  }
}
