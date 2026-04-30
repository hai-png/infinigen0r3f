/**
 * Constraint Evaluator - Main Evaluation Engine
 * 
 * Ports: infinigen/core/constraints/evaluator/evaluate.py
 * 
 * Evaluates constraint language nodes against solver state.
 * Supports loss computation, violation counting, and memoization.
 */

import { Node, Domain, Problem as ProblemType } from '../language/types';
import { BoolOperatorExpression, BoolConstant, ScalarConstant } from '../language/expression';
import { Domain as DomainClass } from '../reasoning/domain';
import { constraintDomain, domainFinalized } from '../reasoning/constraint-domain';
import { State, ObjectState } from './state';
import { memoKey, evictMemoForMove, resetBVHCache } from './eval-memo';
import { nodeImpls } from './node-impl/index';
import * as cl from '../language/index';

// Special case nodes that require custom evaluation logic
const SPECIAL_CASE_NODES = new Set([
  'ForAll',
  'SumOver', 
  'MeanOver',
  'Item',
  'Problem',
  'SceneConstant',
  'DebugPrint'
]);

// Quantifier node types for string-based checking
const QUANTIFIER_TYPES = new Set(['ForAll', 'SumOver', 'MeanOver', 'MaxOver', 'MinOver']);

// Aggregation functions for gather operations
const gatherFuncs: Record<string, (values: number[]) => number> = {
  'ForAll': (vs) => vs.every(v => !!(v as any)) ? 1 : 0,
  'SumOver': (vs) => vs.reduce((a, b) => a + b, 0),
  'MeanOver': (vs) => vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : 0
};

/**
 * Compute the value of a constraint node
 */
function computeNodeVal(node: Node, state: State, memo: Map<any, any>): any {
  // Handle special case nodes using type string checks
  if (node.type === 'SceneConstant') {
    return new Set(
      Array.from(state.objs.entries())
        .filter(([_, obj]) => obj.active)
        .map(([name, _]) => name)
    );
  }

  if (QUANTIFIER_TYPES.has(node.type)) {
    const { objs, var: varName, pred } = node as any;
    const loopOverObjs = evaluateNode(objs, state, memo);
    
    const results: number[] = [];
    for (const o of loopOverObjs) {
      const memoSub = new Map(memo);
      memoSub.set(varName, new Set([o]));
      results.push(evaluateNode(pred, state, memoSub));
    }
    
    const gatherFunc = gatherFuncs[node.type];
    return gatherFunc(results);
  }

  if (node.type === 'Item') {
    throw new Error(`_computeNodeVal encountered undefined variable ${node}. Available: ${Array.from(memo.keys())}`);
  }

  // Check if node has a registered implementation
  const implFunc = nodeImpls.get(node.constructor as any);
  if (implFunc) {
    const childVals = new Map(
      Array.from(node.children().entries()).map(([name, child]) => [
        name,
        evaluateNode(child, state, memo)
      ])
    );
    
    const kwargs: any = {};
    if ('othersTags' in node) {
      kwargs.othersTags = (node as any).othersTags;
    }
    
    return implFunc(node, state, childVals, kwargs);
  }

  if (node.type === 'Problem') {
    throw new TypeError('evaluateNode is invalid for Problem nodes, please use evaluateProblem');
  }

  if (node.type === 'DebugPrint') {
    const res = evaluateNode((node as any).val, state, memo);
    const varAssignments = Array.from(memo.entries())
      .filter(([k, _]) => typeof k === 'string' && k.startsWith('var_'))
      .map(([_, v]) => v);
    console.log(`cl.debugprint ${(node as any).msg}: ${res}`, varAssignments);
    return res;
  }

  throw new NotImplementedError(
    `Couldnt compute value for ${node.constructor.name}. Please add it to nodeImpls or add a special case.`
  );
}

/**
 * Check if a node is relevant to a given domain filter
 */
export function relevant(node: Node, filter: Domain | null): boolean {
  if (filter === null) {
    return true;
  }

  if (!(node instanceof Node)) {
    throw new TypeError(`Invalid node: ${node}`);
  }

  // Handle object set expressions
  if (node instanceof cl.ObjectSetExpression) {
    const d = constraintDomain(node);
    if (!domainFinalized(d as any)) {
      throw new RuntimeError(`relevant encountered unfinalized domain: ${d}`);
    }
    const res = d.intersects(filter as unknown as import('../language/types').Domain);
    console.debug(`relevant got ${res} for domain=${d}, filter=${filter}`);
    return res;
  }

  // Recursively check children
  for (const [_, child] of node.children()) {
    if (relevant(child, filter)) {
      return true;
    }
  }
  return false;
}

/**
 * Count violations for binary operations on integers
 */
function violCountBinopInteger(
  node: BoolOperatorExpression,
  lhs: number,
  rhs: number
): number {
  const func = node.func as string;
  let err: number;

  switch (func) {
    case 'gte': case 'ge': // ge
      err = rhs - lhs;
      break;
    case 'lte': case 'le': // le
      err = lhs - rhs;
      break;
    case 'gt': // gt
      err = rhs - lhs + 1;
      break;
    case 'lt': // lt
      err = lhs - rhs + 1;
      break;
    default:
      throw new ValueError(`Unhandled operator function: ${func}`);
  }

  return Math.max(err, 0);
}

/**
 * Count violations for binary operations
 */
function violCountBinop(node: BoolOperatorExpression, lhs: any, rhs: any): number {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return violCountBinopInteger(node, lhs, rhs);
  } else {
    const func = node.func as string;
    let satisfied: boolean;
    switch (func) {
      case 'eq': satisfied = lhs === rhs; break;
      case 'neq': case 'ne': satisfied = lhs !== rhs; break;
      case 'lt': satisfied = lhs < rhs; break;
      case 'lte': case 'le': satisfied = lhs <= rhs; break;
      case 'gt': satisfied = lhs > rhs; break;
      case 'gte': case 'ge': satisfied = lhs >= rhs; break;
      default: satisfied = false;
    }
    return satisfied ? 0 : 1;
  }
}

/**
 * Count constraint violations
 */
export function violCount(
  node: Node,
  state: State,
  memo: Map<any, any>,
  filter: Domain | null = null
): number {
  let res: number;

  // Handle conjunctions and problems
  if ((node instanceof BoolOperatorExpression && (node.func as string) === 'and') ||
      node.type === 'Problem') {
    const constraints = node.type === 'Problem' ? (node as any).constraints : (node as any).operands;
    res = constraints.reduce((sum: number, c: Node) => sum + violCount(c, state, memo, filter), 0);
  }
  
  // Handle in_range
  else if (node.type === 'in_range') {
    const valRes = evaluateNode((node as any).val, state, memo);
    
    if (valRes < (node as any).low) {
      res = (node as any).low - valRes;
    } else if (valRes > (node as any).high) {
      res = valRes - (node as any).high;
    } else {
      res = 0;
    }
    
    if (!relevant((node as any).val, filter)) {
      res = 0;
    }
  }
  
  // Handle equality
  else if (node instanceof BoolOperatorExpression && 
           (node.func as string) === 'eq') {
    const [lhs, rhs] = node.operands;
    res = Math.abs(evaluateNode(lhs, state, memo) - evaluateNode(rhs, state, memo));
    if (!relevant(lhs, filter) && !relevant(rhs, filter)) {
      res = 0;
    }
  }
  
  // Handle ForAll
  else if (QUANTIFIER_TYPES.has(node.type)) {
    const { objs, var: varName, pred } = node as any;
    let viol = 0;
    const loopObjs = evaluateNode(objs, state, memo);
    
    for (const o of loopObjs) {
      const memoSub = new Map(memo);
      memoSub.set(varName, new Set([o]));
      viol += violCount(pred, state, memoSub, filter);
    }
    res = viol;
  }
  
  // Handle comparison operators
  else if (node instanceof BoolOperatorExpression) {
    const func = node.func as string;
    const isComparison = 
      func === 'gte' || func === 'ge' ||
      func === 'lte' || func === 'le' ||
      func === 'gt' ||
      func === 'lt';
    
    if (isComparison) {
      const [lhs, rhs] = node.operands;
      const eitherRelevant = relevant(lhs, filter) || relevant(rhs, filter);
      
      if (eitherRelevant) {
        const lRes = evaluateNode(lhs, state, memo);
        const rRes = evaluateNode(rhs, state, memo);
        res = violCountBinop(node, lRes, rRes);
      } else {
        res = 0;
      }
    } else {
      throw new NotImplementedError(`Unhandled BoolOperatorExpression with func ${func}`);
    }
  }
  
  // Handle boolean constants
  else if ((node instanceof BoolConstant) || (node instanceof ScalarConstant && typeof node.value === 'boolean')) {
    const boolVal = node instanceof BoolConstant ? node.value : (node as ScalarConstant).value;
    res = boolVal ? 0 : 1;
  }
  
  // Handle OR
  else if (node instanceof BoolOperatorExpression && 
           (node.func as string) === 'or') {
    const [lhs, rhs] = node.operands;
    res = Math.min(violCount(rhs, state, memo), violCount(lhs, state, memo));
  }
  
  // Handle NOT
  else if (node instanceof BoolOperatorExpression && 
           (node.func as string) === 'not') {
    const [lhs] = node.operands;
    const lhsRes = evaluateNode(lhs, state, memo);
    res = lhsRes === true ? 0 : 1;
  }
  
  // Default: evaluate normally
  else if (node instanceof Node) {
    return evaluateNode(node, state, memo);
  }
  
  else {
    throw new NotImplementedError(
      `Node is not supported for hard constraints. Please use an alternative.`
    );
  }

  return res;
}

/**
 * Evaluate a single node with memoization
 */
export function evaluateNode(node: Node, state: State, memo: Map<any, any> | null = null): any {
  const key = memoKey(node);
  
  if (memo === null) {
    memo = new Map();
  } else if (memo.has(key)) {
    return memo.get(key);
  }
  
  const val = computeNodeVal(node, state, memo);
  memo.set(key, val);
  
  return val;
}

/**
 * Result of evaluating a problem
 */
export class EvalResult {
  constructor(
    public lossVals: Map<string, number>,
    public violations: Map<string, boolean>
  ) {}

  loss(): number {
    let sum = 0;
    for (const v of this.lossVals.values()) {
      sum += v;
    }
    return sum;
  }

  violCount(): number {
    let count = 0;
    for (const v of this.violations.values()) {
      if (v) count++;
    }
    return count;
  }

  toDF(): any {
    const keys = new Set([...this.lossVals.keys(), ...this.violations.keys()]);
    const data: any = {};
    for (const k of keys) {
      data[k] = {
        loss: this.lossVals.get(k),
        viol_count: this.violations.get(k)
      };
    }
    return data;
  }

  *[Symbol.iterator]() {
    yield this.loss();
    yield this.violCount();
  }
}

/**
 * Evaluate an entire constraint problem
 */
export function evaluateProblem(
  problem: ProblemType,
  state: State,
  filter: Domain | null = null,
  memo: Map<any, any> | null = null,
  enableLoss: boolean = true,
  enableViolated: boolean = true
): EvalResult {
  if (memo === null) {
    memo = new Map();
  }

  const lossVals = new Map<string, number>();
  const violations = new Map<string, boolean>();

  for (const constraint of problem.constraints) {
    const constraintName = constraint.constructor.name;
    
    if (enableLoss) {
      const loss = violCount(constraint as any, state, memo, filter);
      lossVals.set(constraintName, loss);
    }
    
    if (enableViolated) {
      const violated = violCount(constraint as any, state, memo, filter) > 0;
      violations.set(constraintName, violated);
    }
  }

  return new EvalResult(lossVals, violations);
}

// Custom error classes
class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

export { computeNodeVal };
