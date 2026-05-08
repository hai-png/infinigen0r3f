/**
 * Complete Move Proposal System
 *
 * Ports: infinigen/core/constraints/example_solver/moves/
 * Original move types: addition, deletion, swap, reassignment, pose,
 *   plane_change, resample, translate, rotate
 *
 * Provides a comprehensive set of move operators for constraint-based
 * scene optimization. Each operator proposes, validates, and applies
 * a specific type of modification to the scene state.
 *
 * The MoveOperatorFactory manages weights and selection probabilities,
 * implementing Infinigen's weight decay schedule where addition/deletion
 * weights decrease as the scene stabilizes.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../util/MathUtils';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Enumeration of all move types in the solver.
 *
 * Each move type represents a different way the solver can modify
 * the scene to explore the search space:
 *
 * - ADDITION: Add a new object to the scene
 * - DELETION: Remove an existing object from the scene
 * - SWAP: Swap positions/types of two objects
 * - REASSIGNMENT: Change the type/parameters of an existing object
 * - POSE: Randomize position/rotation of an object
 * - PLANE_CHANGE: Move object from one surface to another
 * - RESAMPLE: Regenerate object with different parameters
 * - TRANSLATE: Small positional perturbation
 * - ROTATE: Small rotational perturbation
 */
export enum MoveType {
  ADDITION = 'ADDITION',
  DELETION = 'DELETION',
  SWAP = 'SWAP',
  REASSIGNMENT = 'REASSIGNMENT',
  POSE = 'POSE',
  PLANE_CHANGE = 'PLANE_CHANGE',
  RESAMPLE = 'RESAMPLE',
  TRANSLATE = 'TRANSLATE',
  ROTATE = 'ROTATE',
}

/**
 * A proposed move to be evaluated by the solver.
 */
export interface MoveProposal {
  /** Type of move */
  type: MoveType;
  /** ID of the object being modified (if applicable) */
  objectId?: string;
  /** Target type for reassignment/addition */
  targetType?: string;
  /** Source plane index for plane change */
  fromPlane?: number;
  /** Destination plane index for plane change */
  toPlane?: number;
  /** Translation vector for translate/pose moves */
  translation?: THREE.Vector3;
  /** Rotation for rotate/pose moves */
  rotation?: THREE.Euler;
  /** Additional move-specific parameters */
  params?: Record<string, any>;
}

// ============================================================================
// MoveOperator Abstract Base
// ============================================================================

/**
 * Abstract base class for move operators.
 *
 * Each operator handles a specific type of scene modification.
 * The weight property controls how likely this operator is to be
 * selected during the solve loop, and can decay over iterations.
 */
export abstract class MoveOperator {
  /** The type of move this operator produces */
  abstract readonly type: MoveType;

  /** Current weight for selection probability (higher = more likely) */
  weight: number;

  /** Initial weight (for reset) */
  protected initialWeight: number;

  constructor(weight: number) {
    this.weight = weight;
    this.initialWeight = weight;
  }

  /**
   * Propose a move given the current state.
   *
   * @param state - Current solver/scene state
   * @param rng - Seeded random number generator
   * @returns A proposed move, or null if no valid proposal can be made
   */
  abstract propose(state: any, rng: SeededRandom): MoveProposal | null;

  /**
   * Apply a proposed move to the state.
   *
   * @param state - Current state (will be modified or cloned)
   * @param proposal - The move to apply
   * @returns true if the move was successfully applied
   */
  abstract apply(state: any, proposal: MoveProposal): boolean;

  /**
   * Check if a proposed move is valid in the current state.
   *
   * @param state - Current state
   * @param proposal - The move to validate
   * @returns true if the move is valid
   */
  abstract isValid(state: any, proposal: MoveProposal): boolean;

  /**
   * Reset the operator's weight to its initial value.
   */
  resetWeight(): void {
    this.weight = this.initialWeight;
  }
}

// ============================================================================
// Concrete Move Operators
// ============================================================================

/**
 * Addition Move: Add a new object to the scene.
 *
 * Selects an object type from available generators and places it
 * on a random valid surface. Weight starts high and decays as
 * the scene fills with objects.
 */
export class AdditionMove extends MoveOperator {
  readonly type = MoveType.ADDITION;

  /** Maximum number of objects in the scene (weight decays toward this) */
  private maxObjects: number;

  /** Available object types to add */
  private availableTypes: string[];

  constructor(
    weight: number = 10,
    maxObjects: number = 50,
    availableTypes: string[] = []
  ) {
    super(weight);
    this.maxObjects = maxObjects;
    this.availableTypes = availableTypes.length > 0
      ? availableTypes
      : ['chair', 'table', 'lamp', 'shelf', 'rug', 'sofa', 'book', 'vase', 'plant', 'picture'];
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objectCount = this.getObjectCount(state);

    // Don't propose additions if scene is full
    if (objectCount >= this.maxObjects) return null;

    const targetType = rng.choice(this.availableTypes);
    const objectId = `${targetType}_${Date.now()}_${rng.nextInt(0, 9999)}`;

    // Find a valid surface to place on
    const surfacePoint = this.findRandomSurface(state, rng);

    return {
      type: MoveType.ADDITION,
      objectId,
      targetType,
      translation: surfacePoint ?? new THREE.Vector3(
        rng.nextFloat(-5, 5),
        0,
        rng.nextFloat(-5, 5)
      ),
      params: { objectCount },
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId || !proposal.targetType) return false;

    const objects = this.getObjectsMap(state);
    if (!objects) return false;

    // Create a new object state entry
    const newObj = {
      name: proposal.objectId,
      type: proposal.targetType,
      tags: new Set([proposal.targetType]),
      pose: {
        position: proposal.translation
          ? { x: proposal.translation.x, y: proposal.translation.y, z: proposal.translation.z }
          : { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      position: proposal.translation
        ? { x: proposal.translation.x, y: proposal.translation.y, z: proposal.translation.z }
        : { x: 0, y: 0, z: 0 },
      active: true,
    };

    objects.set(proposal.objectId, newObj);
    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects) return false;
    // Valid only if object doesn't already exist
    return !objects.has(proposal.objectId);
  }

  /** Decay weight as scene fills */
  decayWeight(iteration: number): void {
    const objectCount = this.getObjectCount(null); // approximate
    const fillRatio = Math.min(1, objectCount / this.maxObjects);
    this.weight = this.initialWeight * (1 - fillRatio * 0.8); // Decays to 20% at max
  }

  private getObjectCount(state: any): number {
    const objects = this.getObjectsMap(state);
    return objects ? objects.size : 0;
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    if (state.assignments instanceof Map) return state.assignments;
    return null;
  }

  private findRandomSurface(state: any, rng: SeededRandom): THREE.Vector3 | null {
    if (state && state.supportSurfaces && state.supportSurfaces.length > 0) {
      const surface: any = rng.choice(state.supportSurfaces);
      const sx = surface.x ?? surface.position?.x ?? rng.nextFloat(-5, 5);
      const sy = surface.y ?? surface.position?.y ?? 0;
      const sz = surface.z ?? surface.position?.z ?? rng.nextFloat(-5, 5);
      return new THREE.Vector3(sx, sy, sz);
    }
    return null;
  }
}

/**
 * Deletion Move: Remove a random object from the scene.
 *
 * Weight starts medium and decays to 0 as the scene stabilizes
 * (fewer objects = fewer valid deletions).
 */
export class DeletionMove extends MoveOperator {
  readonly type = MoveType.DELETION;

  /** Object types that should not be deleted (e.g., walls, floors) */
  private protectedTypes: Set<string>;

  constructor(
    weight: number = 5,
    protectedTypes: string[] = ['wall', 'floor', 'ceiling', 'room']
  ) {
    super(weight);
    this.protectedTypes = new Set(protectedTypes);
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size === 0) return null;

    // Get deletable objects
    const deletableIds: string[] = [];
    for (const [id, obj] of objects) {
      const type = obj.type ?? obj.tags?.toArray?.()?.[0]?.toString() ?? '';
      if (!this.protectedTypes.has(type) && !this.protectedTypes.has(id)) {
        deletableIds.push(id);
      }
    }

    if (deletableIds.length === 0) return null;

    const objectId = rng.choice(deletableIds);
    return { type: MoveType.DELETION, objectId };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects || !objects.has(proposal.objectId)) return false;
    objects.delete(proposal.objectId);
    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    return objects ? objects.has(proposal.objectId) : false;
  }

  /** Decay weight toward 0 as scene stabilizes */
  decayWeight(iteration: number): void {
    this.weight = this.initialWeight * Math.exp(-iteration / 500);
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }
}

/**
 * Swap Move: Swap positions/types of two objects.
 *
 * Constant weight throughout solving. Useful for exploring
 * combinatorial arrangements (e.g., swapping two chairs).
 */
export class SwapMove extends MoveOperator {
  readonly type = MoveType.SWAP;

  constructor(weight: number = 3) {
    super(weight);
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size < 2) return null;

    const ids = Array.from(objects.keys());
    const i1 = rng.nextInt(0, ids.length - 1);
    let i2 = rng.nextInt(0, ids.length - 1);
    while (i2 === i1) i2 = rng.nextInt(0, ids.length - 1);

    return {
      type: MoveType.SWAP,
      objectId: ids[i1],
      params: { swapWithId: ids[i2] },
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId || !proposal.params?.swapWithId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects) return false;

    const obj1 = objects.get(proposal.objectId);
    const obj2 = objects.get(proposal.params.swapWithId);
    if (!obj1 || !obj2) return false;

    // Swap poses
    const pose1 = obj1.pose ?? obj1.position;
    const pose2 = obj2.pose ?? obj2.position;

    if (obj1.pose) obj1.pose = { ...pose2 };
    if (obj2.pose) obj2.pose = { ...pose1 };
    if (obj1.position) obj1.position = pose2?.position ?? pose2;
    if (obj2.position) obj2.position = pose1?.position ?? pose1;

    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId || !proposal.params?.swapWithId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects) return false;
    return objects.has(proposal.objectId) && objects.has(proposal.params.swapWithId);
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }
}

/**
 * Reassignment Move: Change the type/parameters of an existing object.
 *
 * Resamples the object from its generator, keeping its position
 * but changing its semantic type or parameters.
 */
export class ReassignmentMove extends MoveOperator {
  readonly type = MoveType.REASSIGNMENT;

  private availableTypes: string[];

  constructor(
    weight: number = 4,
    availableTypes: string[] = []
  ) {
    super(weight);
    this.availableTypes = availableTypes.length > 0
      ? availableTypes
      : ['chair', 'table', 'lamp', 'shelf', 'rug', 'sofa', 'book', 'vase', 'plant', 'picture'];
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size === 0) return null;

    const ids = Array.from(objects.keys());
    const objectId = rng.choice(ids);
    const targetType = rng.choice(this.availableTypes);

    return {
      type: MoveType.REASSIGNMENT,
      objectId,
      targetType,
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId || !proposal.targetType) return false;
    const objects = this.getObjectsMap(state);
    if (!objects || !objects.has(proposal.objectId)) return false;

    const obj = objects.get(proposal.objectId);
    if (obj.tags && typeof obj.tags.add === 'function') {
      obj.tags.add(proposal.targetType);
    }
    obj.type = proposal.targetType;
    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    return objects ? objects.has(proposal.objectId) : false;
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }
}

/**
 * Pose Move: Randomize position/rotation of an object.
 *
 * Sub-types:
 * - translate: Small positional perturbation (default)
 * - rotate: Small rotational perturbation
 * - reinit_pose: Complete random reinitialization of pose
 */
export class PoseMove extends MoveOperator {
  readonly type = MoveType.POSE;

  /** Magnitude of translation perturbation */
  private translateScale: number;
  /** Magnitude of rotation perturbation (radians) */
  private rotateScale: number;
  /** Probability of reinit vs small perturbation */
  private reinitProb: number;

  constructor(
    weight: number = 8,
    translateScale: number = 0.3,
    rotateScale: number = 0.2,
    reinitProb: number = 0.1
  ) {
    super(weight);
    this.translateScale = translateScale;
    this.rotateScale = rotateScale;
    this.reinitProb = reinitProb;
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size === 0) return null;

    const ids = Array.from(objects.keys());
    const objectId = rng.choice(ids);

    // Decide sub-type
    const r = rng.next();
    let subType: 'translate' | 'rotate' | 'reinit_pose';

    if (r < this.reinitProb) {
      subType = 'reinit_pose';
    } else if (r < this.reinitProb + 0.5) {
      subType = 'translate';
    } else {
      subType = 'rotate';
    }

    const translation = new THREE.Vector3(
      (rng.next() - 0.5) * 2 * this.translateScale,
      (rng.next() - 0.5) * 2 * this.translateScale * 0.3,
      (rng.next() - 0.5) * 2 * this.translateScale
    );

    const rotation = new THREE.Euler(
      (rng.next() - 0.5) * 2 * this.rotateScale,
      (rng.next() - 0.5) * 2 * Math.PI, // Full Y rotation range
      (rng.next() - 0.5) * 2 * this.rotateScale
    );

    if (subType === 'reinit_pose') {
      // Full random reinit
      translation.set(
        rng.nextFloat(-5, 5),
        rng.nextFloat(0, 3),
        rng.nextFloat(-5, 5)
      );
      rotation.set(
        0,
        rng.nextFloat(0, 2 * Math.PI),
        0
      );
    }

    return {
      type: subType === 'rotate' ? MoveType.ROTATE : subType === 'translate' ? MoveType.TRANSLATE : MoveType.POSE,
      objectId,
      translation,
      rotation,
      params: { subType },
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects || !objects.has(proposal.objectId)) return false;

    const obj = objects.get(proposal.objectId);
    const subType = proposal.params?.subType ?? 'translate';

    if (subType === 'reinit_pose') {
      // Replace entire pose
      if (proposal.translation) {
        const pos = proposal.translation;
        if (obj.pose) {
          obj.pose.position = { x: pos.x, y: pos.y, z: pos.z };
        }
        obj.position = { x: pos.x, y: pos.y, z: pos.z };
      }
      if (proposal.rotation && obj.pose) {
        obj.pose.rotation = { x: proposal.rotation.x, y: proposal.rotation.y, z: proposal.rotation.z };
      }
    } else if (subType === 'translate' || proposal.type === MoveType.TRANSLATE) {
      // Small translation
      if (proposal.translation) {
        const dx = proposal.translation.x;
        const dy = proposal.translation.y;
        const dz = proposal.translation.z;
        if (obj.pose?.position) {
          obj.pose.position.x += dx;
          obj.pose.position.y += dy;
          obj.pose.position.z += dz;
        }
        if (obj.position) {
          obj.position.x += dx;
          obj.position.y += dy;
          obj.position.z += dz;
        }
      }
    } else if (subType === 'rotate' || proposal.type === MoveType.ROTATE) {
      // Small rotation
      if (proposal.rotation && obj.pose?.rotation) {
        obj.pose.rotation.x += proposal.rotation.x;
        obj.pose.rotation.y += proposal.rotation.y;
        obj.pose.rotation.z += proposal.rotation.z;
      }
    }

    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    return objects ? objects.has(proposal.objectId) : false;
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }
}

/**
 * PlaneChange Move: Move object from one surface/plane to another.
 *
 * Selects a new support surface from the available planes
 * and repositions the object on it.
 */
export class PlaneChangeMove extends MoveOperator {
  readonly type = MoveType.PLANE_CHANGE;

  constructor(weight: number = 5) {
    super(weight);
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size === 0) return null;

    const ids = Array.from(objects.keys());
    const objectId = rng.choice(ids);

    // Get available planes/surfaces
    const planes = this.getPlanes(state);
    if (planes.length < 2) return null;

    const currentPlane = rng.nextInt(0, planes.length - 1);
    let targetPlane = rng.nextInt(0, planes.length - 1);
    while (targetPlane === currentPlane && planes.length > 1) {
      targetPlane = rng.nextInt(0, planes.length - 1);
    }

    const targetSurface = planes[targetPlane];
    const translation = new THREE.Vector3(
      targetSurface.x ?? targetSurface.position?.x ?? 0,
      targetSurface.y ?? targetSurface.position?.y ?? 0,
      targetSurface.z ?? targetSurface.position?.z ?? 0
    );

    return {
      type: MoveType.PLANE_CHANGE,
      objectId,
      fromPlane: currentPlane,
      toPlane: targetPlane,
      translation,
      params: { surfaceNormal: targetSurface.normal },
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId || !proposal.translation) return false;
    const objects = this.getObjectsMap(state);
    if (!objects || !objects.has(proposal.objectId)) return false;

    const obj = objects.get(proposal.objectId);
    const pos = proposal.translation;

    if (obj.pose) {
      obj.pose.position = { x: pos.x, y: pos.y, z: pos.z };
    }
    obj.position = { x: pos.x, y: pos.y, z: pos.z };

    // Update relation plane indices if present
    if (obj.relations) {
      for (const rel of obj.relations) {
        if (rel.childPlaneIdx === proposal.fromPlane) {
          rel.childPlaneIdx = proposal.toPlane;
        }
      }
    }

    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    return objects ? objects.has(proposal.objectId) : false;
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }

  private getPlanes(state: any): any[] {
    if (state && state.supportSurfaces) return state.supportSurfaces;
    if (state && state.planes) {
      if (Array.isArray(state.planes)) return state.planes;
    }
    // Default: a floor surface at y=0
    return [
      { position: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
    ];
  }
}

/**
 * Resample Move: Regenerate object with different parameters.
 *
 * Keeps the object's position but changes its geometry/parameters
 * by resampling from its generator.
 */
export class ResampleMove extends MoveOperator {
  readonly type = MoveType.RESAMPLE;

  constructor(weight: number = 3) {
    super(weight);
  }

  propose(state: any, rng: SeededRandom): MoveProposal | null {
    const objects = this.getObjectsMap(state);
    if (!objects || objects.size === 0) return null;

    const ids = Array.from(objects.keys());
    const objectId = rng.choice(ids);

    // Generate new random parameters
    const newParams: Record<string, any> = {};
    const paramCount = rng.nextInt(1, 4);
    for (let i = 0; i < paramCount; i++) {
      const key = `param_${i}`;
      newParams[key] = rng.nextFloat(0, 1);
    }

    return {
      type: MoveType.RESAMPLE,
      objectId,
      params: { newParams, seed: rng.nextInt(0, 1000000) },
    };
  }

  apply(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    if (!objects || !objects.has(proposal.objectId)) return false;

    const obj = objects.get(proposal.objectId);

    // Apply new parameters to the object
    if (proposal.params?.newParams) {
      obj.generatorParams = { ...obj.generatorParams, ...proposal.params.newParams };
    }
    if (proposal.params?.seed !== undefined) {
      obj.seed = proposal.params.seed;
    }

    // Mark for re-generation (actual mesh update happens elsewhere)
    obj.needsRegeneration = true;

    return true;
  }

  isValid(state: any, proposal: MoveProposal): boolean {
    if (!proposal.objectId) return false;
    const objects = this.getObjectsMap(state);
    return objects ? objects.has(proposal.objectId) : false;
  }

  private getObjectsMap(state: any): Map<string, any> | null {
    if (!state) return null;
    if (state.objects instanceof Map) return state.objects;
    return null;
  }
}

// ============================================================================
// MoveOperatorFactory
// ============================================================================

/**
 * Factory that creates all move operators, manages their weights,
 * and handles weighted random selection during solving.
 *
 * Weight decay schedule (matching Infinigen):
 * - ADDITION weight decays as scene fills
 * - DELETION weight decays exponentially over iterations
 * - POSE moves have constant weight (always useful for fine-tuning)
 * - SWAP/REASSIGNMENT have moderate constant weight
 * - PLANE_CHANGE and RESAMPLE have low-moderate weight
 */
export class MoveOperatorFactory {
  private operators: MoveOperator[] = [];
  private additionOp: AdditionMove;
  private deletionOp: DeletionMove;

  constructor(config?: {
    additionWeight?: number;
    deletionWeight?: number;
    swapWeight?: number;
    reassignmentWeight?: number;
    poseWeight?: number;
    planeChangeWeight?: number;
    resampleWeight?: number;
    maxObjects?: number;
    availableTypes?: string[];
  }) {
    const c = config ?? {};

    this.additionOp = new AdditionMove(
      c.additionWeight ?? 10,
      c.maxObjects ?? 50,
      c.availableTypes
    );
    this.deletionOp = new DeletionMove(c.deletionWeight ?? 5);

    this.operators = [
      this.additionOp,
      this.deletionOp,
      new SwapMove(c.swapWeight ?? 3),
      new ReassignmentMove(c.reassignmentWeight ?? 4, c.availableTypes),
      new PoseMove(c.poseWeight ?? 8),
      new PlaneChangeMove(c.planeChangeWeight ?? 5),
      new ResampleMove(c.resampleWeight ?? 3),
    ];
  }

  /**
   * Create all move operators with default weights.
   */
  createAll(): MoveOperator[] {
    return [...this.operators];
  }

  /**
   * Apply weight decay schedule based on iteration number.
   *
   * @param iteration - Current iteration number
   */
  decayWeights(iteration: number): void {
    this.additionOp.decayWeight(iteration);
    this.deletionOp.decayWeight(iteration);
    // Other operators maintain constant weight
  }

  /**
   * Select an operator using weighted random sampling.
   *
   * @param rng - Seeded random number generator
   * @returns A selected move operator
   */
  selectOperator(rng: SeededRandom): MoveOperator {
    const totalWeight = this.operators.reduce((sum, op) => sum + op.weight, 0);
    let r = rng.next() * totalWeight;

    for (const op of this.operators) {
      r -= op.weight;
      if (r <= 0) return op;
    }

    // Fallback (should not happen due to floating point)
    return this.operators[this.operators.length - 1];
  }

  /**
   * Get the total weight of all operators.
   */
  getTotalWeight(): number {
    return this.operators.reduce((sum, op) => sum + op.weight, 0);
  }

  /**
   * Get a specific operator by move type.
   */
  getOperator(type: MoveType): MoveOperator | undefined {
    return this.operators.find(op => op.type === type);
  }

  /**
   * Reset all operator weights to their initial values.
   */
  resetWeights(): void {
    for (const op of this.operators) {
      op.resetWeight();
    }
  }
}

// ============================================================================
// Retry Attempt Proposals
// ============================================================================

/**
 * Try to propose a valid move, retrying up to maxInvalid times
 * if proposals are invalid.
 *
 * This matches Infinigen's retry loop where invalid proposals
 * (e.g., adding to a full scene, deleting protected objects)
 * are discarded and new proposals are generated.
 *
 * @param maxInvalid - Maximum number of invalid proposals before giving up
 * @param factory - The move operator factory for selecting operators
 * @param state - Current solver/scene state
 * @param rng - Seeded random number generator
 * @returns A valid { proposal, operator } pair, or null if no valid proposal found
 */
export function retryAttemptProposals(
  maxInvalid: number,
  factory: MoveOperatorFactory,
  state: any,
  rng: SeededRandom
): { proposal: MoveProposal; operator: MoveOperator } | null {
  for (let attempt = 0; attempt < maxInvalid; attempt++) {
    // Select an operator by weight
    const operator = factory.selectOperator(rng);

    // Propose a move
    const proposal = operator.propose(state, rng);
    if (!proposal) continue;

    // Validate
    if (operator.isValid(state, proposal)) {
      return { proposal, operator };
    }
  }

  // Failed to find a valid proposal within budget
  return null;
}
