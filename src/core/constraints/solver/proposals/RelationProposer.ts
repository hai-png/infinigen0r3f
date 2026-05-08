/**
 * Relation-Based Proposal Strategies — SAT-like Assignment Finder
 *
 * Ports: infinigen/core/constraints/example_solver/propose_relations.py
 *
 * Provides two proposal strategies that are constraint-aware rather than
 * purely random:
 *
 * 1. ProposeRelations — SAT-like assignment finder that attempts to find
 *    a complete satisfying assignment for all relation constraints by
 *    iteratively assigning variables, checking constraint satisfaction,
 *    and backtracking when conflicts are detected.
 *
 * 2. DOFProjectedContinuousProposer — Generates continuous move proposals
 *    that are projected onto valid DOF subspaces derived from the object's
 *    relation constraints. Instead of random perturbation, this proposes
 *    moves along the tangent plane of StableAgainst surfaces, aligned
 *    with rotation axes from DOF analysis.
 *
 * These complement the existing ContinuousProposalGenerator and
 * DiscreteProposalGenerator by being constraint-guided rather than
 * purely stochastic.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../util/MathUtils';
import type { Proposal, SolverState } from '../types';
import { DOFSolver } from '../dof';
import { PlaneExtractor, type Plane } from '../planes';
import { State as EvaluatorState } from '../../evaluator/state';
import {
  ObjectState as UnifiedObjectState,
  Tag,
  TagSet,
  DOFConstraints,
  Polygon2D,
  Relation,
  RelationResult,
  StableAgainstRelation,
} from '../../unified/UnifiedConstraintSystem';

// ============================================================================
// Types
// ============================================================================

/**
 * A variable in the SAT-like assignment problem.
 *
 * Each variable represents an object that needs to be assigned
 * a position, rotation, and optional asset selection.
 */
export interface AssignmentVariable {
  /** Unique identifier for this variable */
  id: string;
  /** Object type (e.g., "chair", "table") */
  type: string;
  /** Tags on this object */
  tags: TagSet;
  /** Current assigned position, or null if unassigned */
  position: THREE.Vector3 | null;
  /** Current assigned rotation, or null if unassigned */
  rotation: THREE.Euler | null;
  /** Current assigned scale, or null if unassigned */
  scale: THREE.Vector3 | null;
  /** DOF constraints derived from relations */
  dofConstraints: DOFConstraints | null;
  /** Parent planes from StableAgainst relations */
  parentPlanes: Plane[];
}

/**
 * A relation constraint between two variables.
 */
export interface RelationConstraint {
  /** The relation type */
  relation: Relation;
  /** ID of the child variable */
  childId: string;
  /** ID of the parent variable */
  parentId: string;
  /** Whether this is a hard constraint (must be satisfied) */
  hard: boolean;
}

/**
 * Result of the SAT-like assignment search.
 */
export interface AssignmentResult {
  /** Whether a satisfying assignment was found */
  satisfied: boolean;
  /** Assignments: variable ID → position */
  positions: Map<string, THREE.Vector3>;
  /** Assignments: variable ID → rotation */
  rotations: Map<string, THREE.Euler>;
  /** Number of hard constraint violations remaining */
  hardViolations: number;
  /** Number of soft constraint violations remaining */
  softViolations: number;
  /** Total iterations used */
  iterations: number;
}

// ============================================================================
// ProposeRelations — SAT-like assignment finder
// ============================================================================

/**
 * SAT-like assignment finder for relation constraints.
 *
 * Rather than the random-walk approach of simulated annealing, this
 * proposer attempts to find a satisfying assignment by:
 *
 * 1. Topologically sorting objects by dependency (objects with more
 *    constraints are assigned first)
 * 2. For each object, enumerating candidate positions derived from
 *    its StableAgainst relations (surface sampling)
 * 3. Checking all constraints involving already-assigned objects
 * 4. Backtracking when no valid assignment exists for the current
 *    partial assignment
 *
 * This is inspired by DPLL/SAT solvers but operates on continuous
 * spatial domains with discrete sampling.
 *
 * Key differences from pure SAT:
 * - Domains are continuous (position, rotation) rather than boolean
 * - Sampling is used instead of exhaustive enumeration
 * - Soft constraints are tolerated with violation counting
 * - The search is bounded by maxAttempts and maxBacktracks
 */
export class ProposeRelations {
  private rng: SeededRandom;
  private maxAttempts: number;
  private maxBacktracks: number;
  private samplesPerVariable: number;
  private planeExtractor: PlaneExtractor;

  constructor(opts: {
    seed?: number;
    maxAttempts?: number;
    maxBacktracks?: number;
    samplesPerVariable?: number;
  } = {}) {
    this.rng = new SeededRandom(opts.seed ?? 42);
    this.maxAttempts = opts.maxAttempts ?? 1000;
    this.maxBacktracks = opts.maxBacktracks ?? 50;
    this.samplesPerVariable = opts.samplesPerVariable ?? 20;
    this.planeExtractor = new PlaneExtractor();
  }

  /**
   * Attempt to find a satisfying assignment for all variables and constraints.
   *
   * @param variables - The assignment variables (objects to place)
   * @param constraints - The relation constraints between variables
   * @param parentObjects - Map of parent object ID → ObjectState (for surface sampling)
   * @returns An AssignmentResult with the found assignments
   */
  findAssignment(
    variables: Map<string, AssignmentVariable>,
    constraints: RelationConstraint[],
    parentObjects: Map<string, UnifiedObjectState>,
  ): AssignmentResult {
    const positions = new Map<string, THREE.Vector3>();
    const rotations = new Map<string, THREE.Euler>();
    let hardViolations = 0;
    let softViolations = 0;
    let iterations = 0;

    // Step 1: Compute dependency order — objects with more constraints first
    const order = this.computeAssignmentOrder(variables, constraints);

    // Step 2: Build constraint lookup for quick access
    const constraintsByChild = this.buildConstraintIndex(constraints);

    // Step 3: Iterative assignment with backtracking
    const assignmentStack: Array<{
      varId: string;
      triedPositions: THREE.Vector3[];
    }> = [];

    let idx = 0;
    let backtracks = 0;

    while (idx < order.length && iterations < this.maxAttempts) {
      iterations++;
      const varId = order[idx];
      const variable = variables.get(varId)!;

      // Generate candidate positions for this variable
      const candidates = this.generateCandidates(
        variable,
        constraintsByChild.get(varId) ?? [],
        positions,
        rotations,
        parentObjects,
      );

      if (candidates.length === 0) {
        // No valid candidates — backtrack
        backtracks++;
        if (backtracks > this.maxBacktracks) {
          // Give up on full satisfaction — assign best-effort position
          const fallback = this.fallbackAssignment(variable, parentObjects);
          positions.set(varId, fallback.position);
          rotations.set(varId, fallback.rotation);
          idx++;
          continue;
        }

        // Pop the last assignment and try a different candidate
        if (assignmentStack.length > 0) {
          const last = assignmentStack.pop()!;
          positions.delete(last.varId);
          rotations.delete(last.varId);
          idx--;
        } else {
          // Can't backtrack further — assign anyway
          const fallback = this.fallbackAssignment(variable, parentObjects);
          positions.set(varId, fallback.position);
          rotations.set(varId, fallback.rotation);
          idx++;
        }
        continue;
      }

      // Try candidates in order, checking constraints
      let assigned = false;
      for (const candidate of candidates) {
        positions.set(varId, candidate.position);
        rotations.set(varId, candidate.rotation);

        // Check constraints involving this variable and already-assigned variables
        const violations = this.checkConstraints(
          varId,
          constraintsByChild.get(varId) ?? [],
          variables,
          positions,
          rotations,
        );

        if (violations.hard === 0) {
          // Valid assignment — move to next variable
          assignmentStack.push({ varId, triedPositions: [candidate.position] });
          assigned = true;
          break;
        }

        // Track the best candidate even if it has violations
        if (violations.hard < hardViolations || !assigned) {
          hardViolations = violations.hard;
          softViolations = violations.soft;
        }
      }

      if (!assigned) {
        // All candidates have violations — use the best one
        const bestCandidate = candidates[0];
        positions.set(varId, bestCandidate.position);
        rotations.set(varId, bestCandidate.rotation);
        assignmentStack.push({ varId, triedPositions: [bestCandidate.position] });
      }

      idx++;
    }

    // Final violation count
    const finalViolations = this.countAllViolations(
      variables, constraints, positions, rotations,
    );

    return {
      satisfied: finalViolations.hard === 0,
      positions,
      rotations,
      hardViolations: finalViolations.hard,
      softViolations: finalViolations.soft,
      iterations,
    };
  }

  /**
   * Generate a Proposal from the SAT assignment result.
   *
   * Picks a random unassigned or poorly-assigned variable and proposes
   * its SAT-found position/rotation.
   */
  proposeFromAssignment(
    result: AssignmentResult,
    currentState: SolverState,
  ): Proposal | null {
    if (result.positions.size === 0) return null;

    // Pick a variable that isn't yet at its target position
    const entries = Array.from(result.positions.entries());
    const target = entries[this.rng.nextInt(0, entries.length - 1)];
    const [objectId, position] = target;
    const rotation = result.rotations.get(objectId);

    return {
      objectId,
      variableId: objectId,
      newValue: {
        action: 'assign',
        position: { x: position.x, y: position.y, z: position.z },
        rotation: rotation
          ? { x: rotation.x, y: rotation.y, z: rotation.z }
          : { x: 0, y: 0, z: 0 },
      },
      newState: {} as any,
      score: result.satisfied ? 1.0 : 1.0 / (1 + result.hardViolations),
      metadata: {
        type: 'discrete',
        moveType: 'propose_relations',
        hardViolations: result.hardViolations,
        softViolations: result.softViolations,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Compute assignment order based on constraint density.
   * Objects with more constraints are assigned first (most constrained first).
   */
  private computeAssignmentOrder(
    variables: Map<string, AssignmentVariable>,
    constraints: RelationConstraint[],
  ): string[] {
    const constraintCount = new Map<string, number>();
    for (const [id] of variables) {
      constraintCount.set(id, 0);
    }
    for (const c of constraints) {
      constraintCount.set(c.childId, (constraintCount.get(c.childId) ?? 0) + 1);
      constraintCount.set(c.parentId, (constraintCount.get(c.parentId) ?? 0) + 1);
    }

    return Array.from(variables.keys()).sort((a, b) => {
      return (constraintCount.get(b) ?? 0) - (constraintCount.get(a) ?? 0);
    });
  }

  /**
   * Build an index from child variable ID → constraints involving it.
   */
  private buildConstraintIndex(
    constraints: RelationConstraint[],
  ): Map<string, RelationConstraint[]> {
    const index = new Map<string, RelationConstraint[]>();
    for (const c of constraints) {
      if (!index.has(c.childId)) index.set(c.childId, []);
      if (!index.has(c.parentId)) index.set(c.parentId, []);
      index.get(c.childId)!.push(c);
      index.get(c.parentId)!.push(c);
    }
    return index;
  }

  /**
   * Generate candidate positions for a variable based on its relations.
   */
  private generateCandidates(
    variable: AssignmentVariable,
    constraints: RelationConstraint[],
    assignedPositions: Map<string, THREE.Vector3>,
    assignedRotations: Map<string, THREE.Euler>,
    parentObjects: Map<string, UnifiedObjectState>,
  ): Array<{ position: THREE.Vector3; rotation: THREE.Euler }> {
    const candidates: Array<{ position: THREE.Vector3; rotation: THREE.Euler }> = [];

    // Collect parent planes from StableAgainst relations
    const parentPlanes: Plane[] = [];
    for (const c of constraints) {
      if (c.relation instanceof StableAgainstRelation) {
        const parentObj = parentObjects.get(c.parentId);
        if (parentObj) {
          // For now, use the floor plane as default
          parentPlanes.push({
            normal: new THREE.Vector3(0, 1, 0),
            distance: 0,
            tag: 'floor',
          });
        }
      }
    }

    // If we have parent planes, sample on them
    if (parentPlanes.length > 0) {
      const dofSolver = new DOFSolver();
      for (let i = 0; i < this.samplesPerVariable; i++) {
        // Pick a random parent plane
        const plane = parentPlanes[this.rng.nextInt(0, parentPlanes.length - 1)];

        // Sample a point on the plane
        const n = plane.normal.clone().normalize();
        let t1 = new THREE.Vector3();
        if (Math.abs(n.x) < 0.9) {
          t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
        } else {
          t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
        }
        const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

        const spread = 3.0;
        const position = n.clone().multiplyScalar(plane.distance)
          .add(t1.multiplyScalar(this.rng.nextFloat(-spread, spread)))
          .add(t2.multiplyScalar(this.rng.nextFloat(-spread, spread)));

        // Sample rotation consistent with DOF
        const rotationAxis = DOFSolver.combineRotationConstraints(parentPlanes);
        const rotation = this.sampleRotation(rotationAxis);

        candidates.push({ position, rotation });
      }
    } else {
      // No parent planes — sample freely in the scene volume
      for (let i = 0; i < this.samplesPerVariable; i++) {
        const position = new THREE.Vector3(
          this.rng.nextFloat(-5, 5),
          0,
          this.rng.nextFloat(-5, 5),
        );
        const rotation = new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0);
        candidates.push({ position, rotation });
      }
    }

    // Bias candidates towards already-assigned parent positions
    for (const c of constraints) {
      const parentPos = assignedPositions.get(c.parentId);
      if (parentPos) {
        // Add candidates near the parent
        for (let i = 0; i < 3; i++) {
          const position = parentPos.clone().add(
            new THREE.Vector3(
              this.rng.nextFloat(-1, 1),
              0,
              this.rng.nextFloat(-1, 1),
            ),
          );
          const rotation = new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0);
          candidates.push({ position, rotation });
        }
      }
    }

    return candidates;
  }

  /**
   * Sample a rotation consistent with the given DOF axis.
   */
  private sampleRotation(axis: THREE.Vector3 | null): THREE.Euler {
    if (axis === null) {
      return new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0);
    }

    if (Math.abs(axis.y) > 0.9) {
      return new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0);
    }
    if (Math.abs(axis.x) > 0.9) {
      return new THREE.Euler(this.rng.nextFloat(0, Math.PI * 2), 0, 0);
    }
    if (Math.abs(axis.z) > 0.9) {
      return new THREE.Euler(0, 0, this.rng.nextFloat(0, Math.PI * 2));
    }

    // Arbitrary axis
    const q = new THREE.Quaternion().setFromAxisAngle(
      axis.normalize(),
      this.rng.nextFloat(0, Math.PI * 2),
    );
    return new THREE.Euler().setFromQuaternion(q);
  }

  /**
   * Check constraints for a specific variable against current assignments.
   */
  private checkConstraints(
    varId: string,
    constraints: RelationConstraint[],
    variables: Map<string, AssignmentVariable>,
    positions: Map<string, THREE.Vector3>,
    rotations: Map<string, THREE.Euler>,
  ): { hard: number; soft: number } {
    let hard = 0;
    let soft = 0;

    for (const c of constraints) {
      const childPos = positions.get(c.childId);
      const parentPos = positions.get(c.parentId);
      if (!childPos || !parentPos) continue;

      // Evaluate the relation
      const childObj = new UnifiedObjectState({
        id: c.childId,
        position: childPos,
        rotation: rotations.get(c.childId) ?? new THREE.Euler(),
      });
      const parentObj = new UnifiedObjectState({
        id: c.parentId,
        position: parentPos,
        rotation: rotations.get(c.parentId) ?? new THREE.Euler(),
      });

      const result = c.relation.evaluateIfApplicable(childObj, parentObj);
      if (result !== null && !result.satisfied) {
        if (c.hard) {
          hard++;
        } else {
          soft++;
        }
      }
    }

    return { hard, soft };
  }

  /**
   * Count all violations across all constraints.
   */
  private countAllViolations(
    variables: Map<string, AssignmentVariable>,
    constraints: RelationConstraint[],
    positions: Map<string, THREE.Vector3>,
    rotations: Map<string, THREE.Euler>,
  ): { hard: number; soft: number } {
    let hard = 0;
    let soft = 0;

    for (const c of constraints) {
      const childPos = positions.get(c.childId);
      const parentPos = positions.get(c.parentId);
      if (!childPos || !parentPos) {
        hard++; // Unassigned = violation
        continue;
      }

      const childObj = new UnifiedObjectState({
        id: c.childId,
        position: childPos,
        rotation: rotations.get(c.childId) ?? new THREE.Euler(),
      });
      const parentObj = new UnifiedObjectState({
        id: c.parentId,
        position: parentPos,
        rotation: rotations.get(c.parentId) ?? new THREE.Euler(),
      });

      const result = c.relation.evaluateIfApplicable(childObj, parentObj);
      if (result !== null && !result.satisfied) {
        if (c.hard) hard++;
        else soft++;
      }
    }

    return { hard, soft };
  }

  /**
   * Fallback assignment when SAT search fails.
   */
  private fallbackAssignment(
    variable: AssignmentVariable,
    parentObjects: Map<string, UnifiedObjectState>,
  ): { position: THREE.Vector3; rotation: THREE.Euler } {
    // Try to place near a parent object
    for (const [_, parent] of parentObjects) {
      if (parent.position) {
        return {
          position: parent.position.clone().add(
            new THREE.Vector3(
              this.rng.nextFloat(-0.5, 0.5),
              0,
              this.rng.nextFloat(-0.5, 0.5),
            ),
          ),
          rotation: new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0),
        };
      }
    }

    // Last resort: random position
    return {
      position: new THREE.Vector3(
        this.rng.nextFloat(-3, 3),
        0,
        this.rng.nextFloat(-3, 3),
      ),
      rotation: new THREE.Euler(0, this.rng.nextFloat(0, Math.PI * 2), 0),
    };
  }
}

// ============================================================================
// DOFProjectedContinuousProposer — DOF-aware continuous proposals
// ============================================================================

/**
 * Generates continuous move proposals projected onto valid DOF subspaces.
 *
 * Instead of the random perturbation approach of ContinuousProposalGenerator,
 * this proposer:
 *
 * 1. Reads the object's DOFConstraints (from its relation assignments)
 * 2. Projects the proposed translation onto allowed DOF axes
 * 3. Quantizes rotation to allowed rotation axes/steps
 * 4. Ensures proposals stay within the object's DOF ranges
 *
 * This is the R3F port of Infinigen's DOF-projected move proposals,
 * where moves are always constrained to the manifold of valid poses
 * rather than generating random perturbations and hoping they're valid.
 *
 * Usage:
 * ```typescript
 * const proposer = new DOFProjectedContinuousProposer({ seed: 42 });
 * const proposal = proposer.generate(objectState, evaluatorState);
 * ```
 */
export class DOFProjectedContinuousProposer {
  private rng: SeededRandom;
  private stepSize: number;
  private rotationStep: number;

  constructor(opts: {
    seed?: number;
    stepSize?: number;
    rotationStep?: number;
  } = {}) {
    this.rng = new SeededRandom(opts.seed ?? 42);
    this.stepSize = opts.stepSize ?? 0.3;
    this.rotationStep = opts.rotationStep ?? Math.PI / 8;
  }

  /**
   * Generate a DOF-projected continuous proposal.
   *
   * @param objectState - The current state of the object to move
   * @param dof - The DOF constraints for this object
   * @returns A proposal with DOF-projected position and rotation
   */
  generate(
    objectState: UnifiedObjectState,
    dof: DOFConstraints,
  ): Proposal {
    // Step 1: Generate a random perturbation
    const rawDisplacement = new THREE.Vector3(
      (this.rng.next() - 0.5) * 2 * this.stepSize,
      (this.rng.next() - 0.5) * 2 * this.stepSize,
      (this.rng.next() - 0.5) * 2 * this.stepSize,
    );

    // Step 2: Project onto allowed DOF axes
    const projectedDisplacement = dof.projectTranslation(rawDisplacement);

    // Step 3: Apply to current position
    const newPosition = objectState.position.clone().add(projectedDisplacement);

    // Step 4: Generate rotation proposal
    const rawRotation = new THREE.Euler(
      (this.rng.next() - 0.5) * 2 * this.rotationStep,
      (this.rng.next() - 0.5) * 2 * this.rotationStep,
      (this.rng.next() - 0.5) * 2 * this.rotationStep,
    );

    // Quantize to allowed rotation DOF
    const proposedRotation = objectState.rotation.clone();
    const quantizedDelta = dof.quantizeRotation(rawRotation);

    // Apply only allowed rotation axes
    if (dof.rotationAxes[0]) proposedRotation.x += quantizedDelta.x;
    if (dof.rotationAxes[1]) proposedRotation.y += quantizedDelta.y;
    if (dof.rotationAxes[2]) proposedRotation.z += quantizedDelta.z;

    // Step 5: Clamp position to DOF range
    const [minRange, maxRange] = dof.translationRange;
    newPosition.x = Math.max(minRange.x, Math.min(maxRange.x, newPosition.x));
    newPosition.y = Math.max(minRange.y, Math.min(maxRange.y, newPosition.y));
    newPosition.z = Math.max(minRange.z, Math.min(maxRange.z, newPosition.z));

    // Step 6: Clamp rotation to DOF range
    const [minRot, maxRot] = dof.rotationRange;
    proposedRotation.x = Math.max(minRot.x, Math.min(maxRot.x, proposedRotation.x));
    proposedRotation.y = Math.max(minRot.y, Math.min(maxRot.y, proposedRotation.y));
    proposedRotation.z = Math.max(minRot.z, Math.min(maxRot.z, proposedRotation.z));

    return {
      objectId: objectState.id,
      variableId: objectState.id,
      newValue: {
        action: 'dof_translate_rotate',
        position: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        rotation: { x: proposedRotation.x, y: proposedRotation.y, z: proposedRotation.z },
        rawDisplacement: { x: rawDisplacement.x, y: rawDisplacement.y, z: rawDisplacement.z },
        projectedDisplacement: { x: projectedDisplacement.x, y: projectedDisplacement.y, z: projectedDisplacement.z },
      },
      newState: {} as any,
      score: 0,
      metadata: {
        type: 'continuous',
        moveType: 'dof_projected',
        dofAxes: dof.translationAxes,
        rotationAxes: dof.rotationAxes,
      },
    };
  }

  /**
   * Generate a surface-aligned proposal for an object on a plane.
   *
   * This is the key method for furniture placement: instead of
   * perturbing in arbitrary directions, it moves the object along
   * the surface it's resting on (e.g., floor, table top).
   *
   * @param objectState - The current state of the object
   * @param parentPlanes - The planes the object is stable against
   * @param dof - The DOF constraints
   * @returns A surface-aligned proposal
   */
  generateSurfaceAligned(
    objectState: UnifiedObjectState,
    parentPlanes: Plane[],
    dof: DOFConstraints,
  ): Proposal {
    if (parentPlanes.length === 0) {
      return this.generate(objectState, dof);
    }

    // Pick the primary parent plane (first one, usually the floor)
    const primaryPlane = parentPlanes[0];
    const n = primaryPlane.normal.clone().normalize();

    // Compute tangent vectors for the plane
    let t1 = new THREE.Vector3();
    if (Math.abs(n.x) < 0.9) {
      t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

    // Generate perturbation in tangent plane
    const du = (this.rng.next() - 0.5) * 2 * this.stepSize;
    const dv = (this.rng.next() - 0.5) * 2 * this.stepSize;
    const displacement = t1.multiplyScalar(du).add(t2.multiplyScalar(dv));

    // Project onto DOF constraints
    const projectedDisp = dof.projectTranslation(displacement);

    // Apply to position
    const newPosition = objectState.position.clone().add(projectedDisp);

    // Keep the object on the plane (snap Y to plane distance)
    if (Math.abs(n.y) > 0.9) {
      // Floor/ceiling — snap Y
      newPosition.y = primaryPlane.distance;
    }

    // Generate Y-axis rotation (most common for floor objects)
    const proposedRotation = objectState.rotation.clone();
    const rotationAxis = DOFSolver.combineRotationConstraints(parentPlanes);

    if (rotationAxis && Math.abs(rotationAxis.y) > 0.9) {
      proposedRotation.y += (this.rng.next() - 0.5) * 2 * this.rotationStep;
    } else if (rotationAxis) {
      // Rotate around the allowed axis
      const q = new THREE.Quaternion().setFromAxisAngle(
        rotationAxis.clone().normalize(),
        (this.rng.next() - 0.5) * this.rotationStep,
      );
      const currentQ = new THREE.Quaternion().setFromEuler(proposedRotation);
      currentQ.multiply(q);
      proposedRotation.setFromQuaternion(currentQ);
    }

    // Quantize rotation
    const quantized = dof.quantizeRotation(proposedRotation);

    return {
      objectId: objectState.id,
      variableId: objectState.id,
      newValue: {
        action: 'surface_aligned',
        position: { x: newPosition.x, y: newPosition.y, z: newPosition.z },
        rotation: { x: quantized.x, y: quantized.y, z: quantized.z },
      },
      newState: {} as any,
      score: 0,
      metadata: {
        type: 'continuous',
        moveType: 'surface_aligned',
        planeNormal: { x: n.x, y: n.y, z: n.z },
      },
    };
  }

  /**
   * Generate multiple DOF-projected proposals for comparison.
   */
  generateMultiple(
    objectState: UnifiedObjectState,
    dof: DOFConstraints,
    count: number,
  ): Proposal[] {
    const proposals: Proposal[] = [];
    for (let i = 0; i < count; i++) {
      proposals.push(this.generate(objectState, dof));
    }
    return proposals;
  }
}
