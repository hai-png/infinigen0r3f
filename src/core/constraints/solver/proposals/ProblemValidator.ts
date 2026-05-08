/**
 * Pre-Solve Problem Validation
 *
 * Ports: infinigen/core/constraints/example_solver/validation.py
 *
 * Validates constraint problems before solving to catch common issues
 * that would waste solver time or produce invalid results.
 *
 * Checks include:
 * 1. Constraint consistency: No contradictory hard constraints
 * 2. Domain feasibility: Variables have non-empty domains
 * 3. Graph connectivity: All objects are reachable via constraints
 * 4. Tag compatibility: Required tags are satisfiable by available factories
 * 5. Spatial feasibility: Bounding volumes are consistent
 * 6. Cycle detection: No circular dependencies in StableAgainst chains
 * 7. Overconstraint detection: More constraints than DOF for an object
 *
 * Usage:
 * ```typescript
 * const validator = new ProblemValidator(factoryRegistry, usageLookup);
 * const result = validator.validate(constraintProblem);
 * if (!result.valid) {
 *   console.error('Problem validation failed:', result.errors);
 *   // Fix or reject the problem before solving
 * }
 * ```
 */

import * as THREE from 'three';
import {
  Tag,
  TagSet,
  ObjectState,
  Relation,
  DOFConstraints,
} from '../../unified/UnifiedConstraintSystem';
import { AssetFactoryRegistry, TagUsageLookup } from './UsageLookup';

// ============================================================================
// Types
// ============================================================================

/**
 * A constraint problem to validate.
 */
export interface ConstraintProblem {
  /** Objects that need to be placed */
  objects: Map<string, ObjectState>;
  /** Relations between objects */
  relations: Array<{
    relation: Relation;
    childId: string;
    parentId: string;
    hard: boolean;
  }>;
  /** Available factory IDs for each object type */
  availableFactories: Map<string, string[]>;
  /** Scene bounds */
  sceneBounds: THREE.Box3;
}

/**
 * Result of problem validation.
 */
export interface ValidationResult {
  /** Whether the problem is valid (no critical errors) */
  valid: boolean;
  /** Critical errors that prevent solving */
  errors: ValidationError[];
  /** Non-critical warnings */
  warnings: ValidationWarning[];
  /** Statistics about the problem */
  stats: ProblemStats;
}

export interface ValidationError {
  code: string;
  message: string;
  objectId?: string;
  constraintIndex?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  objectId?: string;
}

export interface ProblemStats {
  /** Total number of objects */
  objectCount: number;
  /** Total number of constraints */
  constraintCount: number;
  /** Number of hard constraints */
  hardConstraintCount: number;
  /** Number of soft constraints */
  softConstraintCount: number;
  /** Number of objects with at least one constraint */
  constrainedObjectCount: number;
  /** Number of unconstrained objects */
  unconstrainedObjectCount: number;
  /** Average constraints per object */
  avgConstraintsPerObject: number;
  /** Estimated total DOF in the problem */
  totalDOF: number;
  /** Number of constraint satisfaction variables */
  variableCount: number;
  /** Ratio of constraints to DOF (overconstraint ratio) */
  constraintToDOFRatio: number;
}

// ============================================================================
// ProblemValidator — Main validator class
// ============================================================================

/**
 * Validates constraint problems before solving.
 *
 * Catches common issues early to avoid wasting solver time on
 * unsolvable problems. Each check produces either errors (critical)
 * or warnings (non-critical).
 */
export class ProblemValidator {
  private factoryRegistry: AssetFactoryRegistry | null;
  private usageLookup: TagUsageLookup | null;

  constructor(
    factoryRegistry?: AssetFactoryRegistry,
    usageLookup?: TagUsageLookup,
  ) {
    this.factoryRegistry = factoryRegistry ?? null;
    this.usageLookup = usageLookup ?? null;
  }

  /**
   * Validate a constraint problem.
   *
   * Runs all validation checks and returns a comprehensive result.
   */
  validate(problem: ConstraintProblem): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Run all checks
    this.checkObjectConsistency(problem, errors, warnings);
    this.checkConstraintConsistency(problem, errors, warnings);
    this.checkDomainFeasibility(problem, errors, warnings);
    this.checkGraphConnectivity(problem, errors, warnings);
    this.checkTagCompatibility(problem, errors, warnings);
    this.checkSpatialFeasibility(problem, errors, warnings);
    this.checkCycleDetection(problem, errors, warnings);
    this.checkOverconstraint(problem, errors, warnings);
    this.checkDOFConsistency(problem, errors, warnings);

    // Compute statistics
    const stats = this.computeStats(problem);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats,
    };
  }

  // ── Validation Checks ───────────────────────────────────────────────

  /**
   * Check that all referenced objects exist and have valid properties.
   */
  private checkObjectConsistency(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    for (const [id, obj] of problem.objects) {
      // Check for objects with no type
      if (!obj.type || obj.type.trim() === '') {
        warnings.push({
          code: 'EMPTY_TYPE',
          message: `Object "${id}" has no type specified`,
          objectId: id,
        });
      }

      // Check for objects with empty tag sets
      if (obj.tags.isEmpty()) {
        warnings.push({
          code: 'NO_TAGS',
          message: `Object "${id}" has no tags — it may not match any constraints`,
          objectId: id,
        });
      }

      // Check for objects with degenerate bounding boxes
      if (obj.boundingBox && !obj.boundingBox.isEmpty()) {
        const size = new THREE.Vector3();
        obj.boundingBox.getSize(size);
        if (size.x < 0.01 || size.y < 0.01 || size.z < 0.01) {
          warnings.push({
            code: 'DEGENERATE_BOUNDS',
            message: `Object "${id}" has degenerate bounding box (${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)})`,
            objectId: id,
          });
        }
      }

      // Check for objects outside scene bounds
      if (obj.position && !problem.sceneBounds.containsPoint(obj.position)) {
        warnings.push({
          code: 'OUTSIDE_BOUNDS',
          message: `Object "${id}" is outside scene bounds at (${obj.position.x.toFixed(2)}, ${obj.position.y.toFixed(2)}, ${obj.position.z.toFixed(2)})`,
          objectId: id,
        });
      }
    }
  }

  /**
   * Check for contradictory or duplicate constraints.
   */
  private checkConstraintConsistency(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const seenConstraints = new Set<string>();

    for (let i = 0; i < problem.relations.length; i++) {
      const rel = problem.relations[i];

      // Check that referenced objects exist
      if (!problem.objects.has(rel.childId)) {
        errors.push({
          code: 'MISSING_CHILD',
          message: `Constraint ${i} references non-existent child object "${rel.childId}"`,
          constraintIndex: i,
        });
      }
      if (!problem.objects.has(rel.parentId)) {
        errors.push({
          code: 'MISSING_PARENT',
          message: `Constraint ${i} references non-existent parent object "${rel.parentId}"`,
          constraintIndex: i,
        });
      }

      // Check for self-referencing constraints
      if (rel.childId === rel.parentId) {
        errors.push({
          code: 'SELF_REFERENCE',
          message: `Constraint ${i} has the same object as both child and parent ("${rel.childId}")`,
          constraintIndex: i,
        });
      }

      // Check for duplicate constraints
      const key = `${rel.relation.name}|${rel.childId}|${rel.parentId}`;
      if (seenConstraints.has(key)) {
        warnings.push({
          code: 'DUPLICATE_CONSTRAINT',
          message: `Duplicate constraint: ${rel.relation.name} between ${rel.childId} and ${rel.parentId}`,
        });
      }
      seenConstraints.add(key);
    }
  }

  /**
   * Check that variables have non-empty domains (at least one valid assignment exists).
   */
  private checkDomainFeasibility(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    for (const [id, obj] of problem.objects) {
      // Check DOF constraints have valid ranges
      if (obj.dofConstraints) {
        const [minRange, maxRange] = obj.dofConstraints.translationRange;
        if (minRange.x > maxRange.x || minRange.y > maxRange.y || minRange.z > maxRange.z) {
          errors.push({
            code: 'INVALID_DOF_RANGE',
            message: `Object "${id}" has invalid DOF translation range (min > max)`,
            objectId: id,
          });
        }
      }

      // Check factory availability
      const availableFactories = problem.availableFactories.get(obj.type);
      if (availableFactories && availableFactories.length === 0) {
        warnings.push({
          code: 'NO_FACTORY',
          message: `Object "${id}" of type "${obj.type}" has no available factories`,
          objectId: id,
        });
      }
    }
  }

  /**
   * Check that all objects are reachable via the constraint graph.
   */
  private checkGraphConnectivity(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (problem.objects.size <= 1) return;

    // Build adjacency list from constraints
    const adjacency = new Map<string, Set<string>>();
    for (const [id] of problem.objects) {
      adjacency.set(id, new Set());
    }

    for (const rel of problem.relations) {
      adjacency.get(rel.childId)?.add(rel.parentId);
      adjacency.get(rel.parentId)?.add(rel.childId);
    }

    // BFS to find connected components
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const [id] of problem.objects) {
      if (visited.has(id)) continue;

      const component: string[] = [];
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push(component);
    }

    // Warn if there are disconnected components
    if (components.length > 1) {
      const unconstrained = components
        .filter(c => c.length === 1)
        .map(c => c[0]);
      if (unconstrained.length > 0) {
        warnings.push({
          code: 'DISCONNECTED_OBJECTS',
          message: `${unconstrained.length} objects are not connected to any other object via constraints: ${unconstrained.slice(0, 5).join(', ')}${unconstrained.length > 5 ? '...' : ''}`,
        });
      }
    }
  }

  /**
   * Check that required tags are satisfiable by available factories.
   */
  private checkTagCompatibility(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    if (!this.usageLookup || !this.factoryRegistry) return;

    for (const [id, obj] of problem.objects) {
      // Check that there's at least one factory that provides this object's tags
      const compatibleFactories = this.usageLookup.findCompatibleFactories(obj.tags);
      if (compatibleFactories.length === 0 && !obj.tags.isEmpty()) {
        warnings.push({
          code: 'NO_MATCHING_FACTORY',
          message: `Object "${id}" with tags [${Array.from(obj.tags).map(t => t.toString()).join(', ')}] has no matching factory`,
          objectId: id,
        });
      }
    }
  }

  /**
   * Check that spatial constraints are physically feasible.
   */
  private checkSpatialFeasibility(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    // Check that the scene bounds are reasonable
    const size = new THREE.Vector3();
    problem.sceneBounds.getSize(size);
    if (size.x < 1 || size.y < 1 || size.z < 1) {
      errors.push({
        code: 'TINY_SCENE',
        message: `Scene bounds are too small (${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)})`,
      });
    }

    // Check for objects that are too large for the scene
    for (const [id, obj] of problem.objects) {
      if (obj.boundingBox && !obj.boundingBox.isEmpty()) {
        const objSize = new THREE.Vector3();
        obj.boundingBox.getSize(objSize);
        if (objSize.x > size.x * 0.5 || objSize.z > size.z * 0.5) {
          warnings.push({
            code: 'OVERSIZED_OBJECT',
            message: `Object "${id}" may be too large for the scene (${objSize.x.toFixed(1)} x ${objSize.z.toFixed(1)})`,
            objectId: id,
          });
        }
      }
    }
  }

  /**
   * Detect circular dependencies in StableAgainst chains.
   */
  private checkCycleDetection(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    // Build directed graph of StableAgainst relationships
    const graph = new Map<string, Set<string>>();
    for (const [id] of problem.objects) {
      graph.set(id, new Set());
    }

    for (const rel of problem.relations) {
      if (rel.relation.name === 'stable_against') {
        graph.get(rel.childId)?.add(rel.parentId);
      }
    }

    // Detect cycles using DFS
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const [id] of problem.objects) {
      color.set(id, WHITE);
    }

    const hasCycle = (node: string): boolean => {
      color.set(node, GRAY);
      for (const neighbor of graph.get(node) ?? []) {
        const neighborColor = color.get(neighbor) ?? WHITE;
        if (neighborColor === GRAY) return true; // Back edge = cycle
        if (neighborColor === WHITE && hasCycle(neighbor)) return true;
      }
      color.set(node, BLACK);
      return false;
    };

    for (const [id] of problem.objects) {
      if (color.get(id) === WHITE) {
        if (hasCycle(id)) {
          errors.push({
            code: 'CYCLIC_DEPENDENCY',
            message: `Circular dependency detected in StableAgainst chain involving "${id}"`,
            objectId: id,
          });
          break; // Only report one cycle
        }
      }
    }
  }

  /**
   * Check for overconstrained objects (more constraints than DOF).
   */
  private checkOverconstraint(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    // Count constraints per object
    const constraintCount = new Map<string, number>();
    for (const [id] of problem.objects) {
      constraintCount.set(id, 0);
    }
    for (const rel of problem.relations) {
      constraintCount.set(rel.childId, (constraintCount.get(rel.childId) ?? 0) + 1);
    }

    // Check each object's DOF vs constraint count
    for (const [id, obj] of problem.objects) {
      const numConstraints = constraintCount.get(id) ?? 0;
      const dof = obj.dofConstraints;

      if (dof && numConstraints > 0) {
        // Count available DOF
        let translationDOF = 0;
        let rotationDOF = 0;

        if (dof.translationAxes[0]) translationDOF++;
        if (dof.translationAxes[1]) translationDOF++;
        if (dof.translationAxes[2]) translationDOF++;
        if (dof.rotationAxes[0]) rotationDOF++;
        if (dof.rotationAxes[1]) rotationDOF++;
        if (dof.rotationAxes[2]) rotationDOF++;

        const totalDOF = translationDOF + rotationDOF;

        // Each StableAgainst constraint removes at least 1 DOF
        if (numConstraints > totalDOF && totalDOF > 0) {
          warnings.push({
            code: 'OVERCONSTRAINED',
            message: `Object "${id}" may be overconstrained: ${numConstraints} constraints vs ${totalDOF} DOF`,
            objectId: id,
          });
        }

        // Zero DOF with constraints = fully constrained, no solving needed
        if (totalDOF === 0 && numConstraints > 0) {
          warnings.push({
            code: 'ZERO_DOF_CONSTRAINED',
            message: `Object "${id}" has 0 DOF but ${numConstraints} constraints — it's fully determined`,
            objectId: id,
          });
        }
      }
    }
  }

  /**
   * Check DOF constraints are consistent with relations.
   */
  private checkDOFConsistency(
    problem: ConstraintProblem,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    for (const [id, obj] of problem.objects) {
      if (!obj.dofConstraints) continue;

      // Check that a floor object doesn't allow Y translation
      const hasFloorRelation = problem.relations.some(
        r => r.childId === id && r.relation.name === 'stable_against'
      );
      if (hasFloorRelation && obj.dofConstraints.translationAxes[1]) {
        warnings.push({
          code: 'FLOOR_OBJECT_Y_DOF',
          message: `Object "${id}" has StableAgainst relation but allows Y translation DOF`,
          objectId: id,
        });
      }
    }
  }

  // ── Statistics ──────────────────────────────────────────────────────

  /**
   * Compute statistics about the constraint problem.
   */
  private computeStats(problem: ConstraintProblem): ProblemStats {
    const objectCount = problem.objects.size;
    const constraintCount = problem.relations.length;
    const hardConstraintCount = problem.relations.filter(r => r.hard).length;
    const softConstraintCount = constraintCount - hardConstraintCount;

    // Count constrained objects
    const constrainedObjects = new Set<string>();
    for (const rel of problem.relations) {
      constrainedObjects.add(rel.childId);
      constrainedObjects.add(rel.parentId);
    }
    const constrainedObjectCount = constrainedObjects.size;
    const unconstrainedObjectCount = objectCount - constrainedObjectCount;

    // Average constraints per object
    const avgConstraintsPerObject = objectCount > 0
      ? constraintCount / objectCount
      : 0;

    // Estimate total DOF
    let totalDOF = 0;
    for (const [, obj] of problem.objects) {
      if (obj.dofConstraints) {
        const dof = obj.dofConstraints;
        if (dof.translationAxes[0]) totalDOF++;
        if (dof.translationAxes[1]) totalDOF++;
        if (dof.translationAxes[2]) totalDOF++;
        if (dof.rotationAxes[0]) totalDOF++;
        if (dof.rotationAxes[1]) totalDOF++;
        if (dof.rotationAxes[2]) totalDOF++;
      } else {
        totalDOF += 6; // Assume full DOF
      }
    }

    const constraintToDOFRatio = totalDOF > 0 ? hardConstraintCount / totalDOF : 0;

    return {
      objectCount,
      constraintCount,
      hardConstraintCount,
      softConstraintCount,
      constrainedObjectCount,
      unconstrainedObjectCount,
      avgConstraintsPerObject,
      totalDOF,
      variableCount: objectCount,
      constraintToDOFRatio,
    };
  }
}
