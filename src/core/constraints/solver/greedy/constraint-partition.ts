/**
 * Constraint Partition for Greedy Stages
 *
 * Ports: infinigen/core/constraints/example_solver/greedy/constraint_partition.py
 *
 * Filters a Problem's constraints to only those relevant to a given greedy stage.
 * A constraint is relevant if any of its ObjectSetExpressions intersect with the
 * stage's domain. Returns a new Problem with only the relevant constraints.
 */

import { Problem, Constraint } from '../../language/types';
import { GreedyStage } from './types';
import { ObjectSetExpression } from '../../language/set-reasoning';
import { State, ObjectState } from '../../evaluator/state';
import { Variable } from '../../language/types';

/**
 * Check whether an ObjectSetExpression has any overlap with a stage's domain.
 *
 * We extract the set of variable names referenced by the expression and
 * check whether any object in `state` that matches those variable assignments
 * also falls within the stage's domain. In practice this is done by checking:
 *
 *  1. If the expression references a constant set of IDs, check those IDs
 *     against the objects in the state that satisfy the domain.
 *  2. If the expression is a variable reference, it always potentially
 *     intersects (since the variable is unbound).
 *  3. For compound expressions (union/intersection/difference), check children.
 */
function objectSetIntersectsDomain(
  expr: ObjectSetExpression,
  stage: GreedyStage,
  state: State
): boolean {
  // For variable references, always consider them as potentially intersecting
  // since they will be bound at solve time.
  const vars = expr.getVariables();
  if (vars.size > 0) {
    return true;
  }

  // For constant expressions, try to evaluate and check against domain objects
  try {
    const varMap = new Map<Variable, any>();
    const objectIds = expr.evaluate(varMap);

    // Check if any of the object IDs in the expression correspond to
    // objects in the state that satisfy the stage domain
    for (const id of objectIds) {
      const objState = state.objects.get(id);
      if (objState) {
        // Object exists in state — check if it matches the stage domain
        if (stageDomainContainsObject(stage, objState)) {
          return true;
        }
      } else {
        // Object ID in expression but not in state — could match later
        return true;
      }
    }

    // No overlap found
    return objectIds.size === 0; // Empty set is vacuously relevant
  } catch {
    // If evaluation fails (unbound variables, etc.), consider it relevant
    return true;
  }
}

/**
 * Check if an ObjectState falls within a stage's domain.
 * Reuses the same logic as active-for-stage.ts
 */
function stageDomainContainsObject(stage: GreedyStage, obj: ObjectState): boolean {
  const domain = stage.domain;
  if (!domain) return true;

  if (typeof domain.contains === 'function') {
    const pos = [obj.position.x, obj.position.y, obj.position.z];
    if (domain.contains(pos)) return true;
    try { if (domain.contains(obj)) return true; } catch { /* ignore */ }
  }

  if (typeof domain.satisfies === 'function') {
    try { if (domain.satisfies(obj)) return true; } catch { /* ignore */ }
    try { if (domain.satisfies(obj.name)) return true; } catch { /* ignore */ }
  }

  if (domain.includes instanceof Set) {
    return domain.includes.has(obj.name) || domain.includes.has(obj.id);
  }
  if (domain.objects instanceof Set) {
    return domain.objects.has(obj.name) || domain.objects.has(obj.id);
  }

  return true;
}

/**
 * Extract ObjectSetExpression nodes from a constraint.
 *
 * Constraints can be Relation instances (which have `objects1`, `objects2`,
 * `objects` properties of type ObjectSetExpression) or plain objects with
 * various structures. We walk the constraint tree to find all
 * ObjectSetExpression instances.
 */
function extractObjectSetExpressions(constraint: any): ObjectSetExpression[] {
  const result: ObjectSetExpression[] = [];

  if (!constraint) return result;

  // Direct ObjectSetExpression instance
  if (constraint instanceof ObjectSetExpression) {
    result.push(constraint);
    return result;
  }

  // Relation with objects1, objects2
  if (constraint.objects1 instanceof ObjectSetExpression) {
    result.push(constraint.objects1);
  }
  if (constraint.objects2 instanceof ObjectSetExpression) {
    result.push(constraint.objects2);
  }

  // Relation with single objects property
  if (constraint.objects instanceof ObjectSetExpression) {
    result.push(constraint.objects);
  }

  // GeometryRelation children
  if (typeof constraint.children === 'function') {
    try {
      for (const [, child] of constraint.children()) {
        if (child instanceof ObjectSetExpression) {
          result.push(child);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Plain constraint objects with expression/objectSet fields
  if (constraint.left instanceof ObjectSetExpression) {
    result.push(constraint.left);
  }
  if (constraint.right instanceof ObjectSetExpression) {
    result.push(constraint.right);
  }
  if (constraint.expression instanceof ObjectSetExpression) {
    result.push(constraint.expression);
  }
  if (Array.isArray(constraint.args)) {
    for (const arg of constraint.args) {
      if (arg instanceof ObjectSetExpression) {
        result.push(arg);
      }
    }
  }

  return result;
}

/**
 * Check whether a constraint is relevant to a given greedy stage.
 *
 * A constraint is relevant if any of its ObjectSetExpression children
 * intersect with the stage's domain.
 */
function isConstraintRelevant(
  constraint: any,
  stage: GreedyStage,
  state: State
): boolean {
  const objSets = extractObjectSetExpressions(constraint);

  // If no ObjectSetExpressions found, include the constraint by default
  // (it may use a different representation or be a global constraint)
  if (objSets.length === 0) {
    return true;
  }

  // A constraint is relevant if ANY of its object set expressions
  // intersects with the stage's domain
  for (const objSet of objSets) {
    if (objectSetIntersectsDomain(objSet, stage, state)) {
      return true;
    }
  }

  return false;
}

/**
 * Partition constraints for a greedy stage.
 *
 * Filters a Problem's constraints to only those relevant to the given stage.
 * A constraint is relevant if any of its ObjectSetExpressions intersect with
 * the stage's domain. Returns a new Problem with only the relevant constraints.
 *
 * @param problem - The full constraint problem
 * @param stage - The greedy stage to filter for
 * @param state - The current solver state (used to resolve object IDs)
 * @returns A new Problem containing only the constraints relevant to this stage
 */
export function partitionConstraints(
  problem: Problem,
  stage: GreedyStage,
  state: State
): Problem {
  const constraints = problem.constraints ?? [];
  const relevantConstraints = constraints.filter((c: Constraint) =>
    isConstraintRelevant(c, stage, state)
  );

  return {
    ...problem,
    id: `${problem.id}__stage_${stage.name}`,
    name: `${problem.name} [stage: ${stage.name}]`,
    constraints: relevantConstraints,
    // Remove children since we've already flattened
    children: undefined,
  };
}
