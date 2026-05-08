/**
 * Expression Equality - Structural equality for constraint nodes
 *
 * Provides exprEqual() for structural comparison of constraint AST nodes.
 *
 * Since the constraint DSL's `==` operator returns an expression node
 * (a BoolOperatorExpression with 'eq' operator) rather than a boolean,
 * we need a separate function for structural equality comparison.
 *
 * This is used by:
 * - The solver to detect duplicate constraints
 * - The constraint deduplication system
 * - The caching/memoization layer
 */

import { Node, Variable } from '../language/types';
import {
  ScalarConstant,
  BoolConstant,
  ScalarVariable,
  BoolVariable,
  ScalarOperatorExpression,
  BoolOperatorExpression,
  HingeLossExpression,
  ScalarNegateExpression,
  ScalarAbsExpression,
  ScalarMinExpression,
  ScalarMaxExpression,
  BoolNotExpression,
  ScalarIfElse,
  BoolIfElse,
} from '../language/expression';
import {
  ObjectSetConstant,
  ObjectSetVariable,
  UnionObjects,
  IntersectionObjects,
  DifferenceObjects,
  FilterObjects,
  TagCondition,
  CountExpression,
  ForAll,
  Exists,
  SumOver,
  MeanOver,
  MaxOver,
  MinOver,
} from '../language/set-reasoning';
import {
  ItemExpression,
  TaggedExpression,
  SceneExpression,
  Problem,
} from '../language/constants';
import {
  Relation,
  AnyRelation,
  NegatedRelation,
  AndRelations,
  OrRelations,
} from '../language/relations';
import { GeometryPredicate } from '../language/geometry';
import { SymbolicDomain } from './domain';

/**
 * Result type for structural equality comparison.
 * Returns true if structurally equal, or an object with a reason
 * explaining why they differ.
 */
export type ExprEqualResult = boolean | { reason: string };

/**
 * Check structural equality of two constraint AST nodes.
 *
 * Since `==` in the constraint DSL returns an expression node (not a boolean),
 * we need this separate function for structural equality comparison.
 * This is used by the solver to detect duplicate constraints.
 *
 * @param a - First node to compare
 * @param b - Second node to compare
 * @returns true if structurally equal, or {reason} explaining the difference
 */
export function exprEqual(a: Node, b: Node): ExprEqualResult {
  // Quick reference check
  if (a === b) return true;

  // Type mismatch
  if (a.type !== b.type) {
    return { reason: `Type mismatch: ${a.type} vs ${b.type}` };
  }

  // Scalar constants
  if (a instanceof ScalarConstant && b instanceof ScalarConstant) {
    if (a.value === b.value) return true;
    return { reason: `ScalarConstant value mismatch: ${a.value} vs ${b.value}` };
  }

  // Boolean constants
  if (a instanceof BoolConstant && b instanceof BoolConstant) {
    if (a.value === b.value) return true;
    return { reason: `BoolConstant value mismatch: ${a.value} vs ${b.value}` };
  }

  // Scalar variables
  if (a instanceof ScalarVariable && b instanceof ScalarVariable) {
    if (a.variable.name === b.variable.name) return true;
    return { reason: `ScalarVariable name mismatch: ${a.variable.name} vs ${b.variable.name}` };
  }

  // Boolean variables
  if (a instanceof BoolVariable && b instanceof BoolVariable) {
    if (a.variable.name === b.variable.name) return true;
    return { reason: `BoolVariable name mismatch: ${a.variable.name} vs ${b.variable.name}` };
  }

  // Scalar operator expressions
  if (a instanceof ScalarOperatorExpression && b instanceof ScalarOperatorExpression) {
    if (a.func !== b.func) {
      return { reason: `ScalarOperator func mismatch: ${a.func} vs ${b.func}` };
    }
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    const rightEq = exprEqual(a.right, b.right);
    if (rightEq !== true) return rightEq;
    return true;
  }

  // Boolean operator expressions
  if (a instanceof BoolOperatorExpression && b instanceof BoolOperatorExpression) {
    if (a.func !== b.func) {
      return { reason: `BoolOperator func mismatch: ${a.func} vs ${b.func}` };
    }
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    if (a.right && b.right) {
      const rightEq = exprEqual(a.right, b.right);
      if (rightEq !== true) return rightEq;
    } else if (a.right !== b.right) {
      return { reason: 'BoolOperator right operand mismatch: one is undefined' };
    }
    return true;
  }

  // Hinge loss expressions
  if (a instanceof HingeLossExpression && b instanceof HingeLossExpression) {
    const valEq = exprEqual(a.value, b.value);
    if (valEq !== true) return valEq;
    const lowEq = exprEqual(a.low, b.low);
    if (lowEq !== true) return lowEq;
    const highEq = exprEqual(a.high, b.high);
    if (highEq !== true) return highEq;
    return true;
  }

  // Unary scalar expressions
  if (a instanceof ScalarNegateExpression && b instanceof ScalarNegateExpression) {
    return exprEqual(a.operand, b.operand);
  }
  if (a instanceof ScalarAbsExpression && b instanceof ScalarAbsExpression) {
    return exprEqual(a.operand, b.operand);
  }
  if (a instanceof ScalarMinExpression && b instanceof ScalarMinExpression) {
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    return exprEqual(a.right, b.right);
  }
  if (a instanceof ScalarMaxExpression && b instanceof ScalarMaxExpression) {
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    return exprEqual(a.right, b.right);
  }
  if (a instanceof BoolNotExpression && b instanceof BoolNotExpression) {
    return exprEqual(a.operand, b.operand);
  }

  // If-else expressions
  if (a instanceof ScalarIfElse && b instanceof ScalarIfElse) {
    const condEq = exprEqual(a.condition, b.condition);
    if (condEq !== true) return condEq;
    const thenEq = exprEqual(a.thenExpr, b.thenExpr);
    if (thenEq !== true) return thenEq;
    return exprEqual(a.elseExpr, b.elseExpr);
  }
  if (a instanceof BoolIfElse && b instanceof BoolIfElse) {
    const condEq = exprEqual(a.condition, b.condition);
    if (condEq !== true) return condEq;
    const thenEq = exprEqual(a.thenExpr, b.thenExpr);
    if (thenEq !== true) return thenEq;
    return exprEqual(a.elseExpr, b.elseExpr);
  }

  // Item expressions
  if (a instanceof ItemExpression && b instanceof ItemExpression) {
    if (a.name !== b.name) {
      return { reason: `ItemExpression name mismatch: ${a.name} vs ${b.name}` };
    }
    if (a.memberOf && b.memberOf) {
      return exprEqual(a.memberOf, b.memberOf);
    } else if (a.memberOf !== b.memberOf) {
      return { reason: 'ItemExpression memberOf mismatch' };
    }
    return true;
  }

  // Tagged expressions
  if (a instanceof TaggedExpression && b instanceof TaggedExpression) {
    const objsEq = exprEqual(a.objs, b.objs);
    if (objsEq !== true) return objsEq;
    if (a.tags.length !== b.tags.length) {
      return { reason: `TaggedExpression tags length mismatch: ${a.tags.length} vs ${b.tags.length}` };
    }
    for (let i = 0; i < a.tags.length; i++) {
      if (a.tags[i] !== b.tags[i]) {
        return { reason: `TaggedExpression tag mismatch at index ${i}: ${a.tags[i]} vs ${b.tags[i]}` };
      }
    }
    return true;
  }

  // Scene expressions (singletons, always equal)
  if (a instanceof SceneExpression && b instanceof SceneExpression) {
    return true;
  }

  // Object set constant
  if (a instanceof ObjectSetConstant && b instanceof ObjectSetConstant) {
    if (a.objectIds.size !== b.objectIds.size) {
      return { reason: `ObjectSetConstant size mismatch: ${a.objectIds.size} vs ${b.objectIds.size}` };
    }
    for (const id of a.objectIds) {
      if (!b.objectIds.has(id)) {
        return { reason: `ObjectSetConstant id mismatch: ${id} not in both` };
      }
    }
    return true;
  }

  // Object set variable
  if (a instanceof ObjectSetVariable && b instanceof ObjectSetVariable) {
    if (a.variable.name === b.variable.name) return true;
    return { reason: `ObjectSetVariable name mismatch: ${a.variable.name} vs ${b.variable.name}` };
  }

  // Set operations (Union, Intersection, Difference)
  if (a instanceof UnionObjects && b instanceof UnionObjects) {
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    return exprEqual(a.right, b.right);
  }
  if (a instanceof IntersectionObjects && b instanceof IntersectionObjects) {
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    return exprEqual(a.right, b.right);
  }
  if (a instanceof DifferenceObjects && b instanceof DifferenceObjects) {
    const leftEq = exprEqual(a.left, b.left);
    if (leftEq !== true) return leftEq;
    return exprEqual(a.right, b.right);
  }

  // Filter objects
  if (a instanceof FilterObjects && b instanceof FilterObjects) {
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.condition, b.condition);
  }

  // Count expression
  if (a instanceof CountExpression && b instanceof CountExpression) {
    return exprEqual(a.objects, b.objects);
  }

  // Quantifiers
  if (a instanceof ForAll && b instanceof ForAll) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `ForAll variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.predicate, b.predicate);
  }
  if (a instanceof Exists && b instanceof Exists) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `Exists variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.predicate, b.predicate);
  }
  if (a instanceof SumOver && b instanceof SumOver) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `SumOver variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.expression, b.expression);
  }
  if (a instanceof MeanOver && b instanceof MeanOver) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `MeanOver variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.expression, b.expression);
  }
  if (a instanceof MaxOver && b instanceof MaxOver) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `MaxOver variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.expression, b.expression);
  }
  if (a instanceof MinOver && b instanceof MinOver) {
    if (a.variable.name !== b.variable.name) {
      return { reason: `MinOver variable mismatch: ${a.variable.name} vs ${b.variable.name}` };
    }
    const objsEq = exprEqual(a.objects, b.objects);
    if (objsEq !== true) return objsEq;
    return exprEqual(a.expression, b.expression);
  }

  // Relations
  if (a instanceof NegatedRelation && b instanceof NegatedRelation) {
    return exprEqual(a.relation, b.relation);
  }
  if (a instanceof AndRelations && b instanceof AndRelations) {
    if (a.relations.length !== b.relations.length) {
      return { reason: `AndRelations length mismatch: ${a.relations.length} vs ${b.relations.length}` };
    }
    for (let i = 0; i < a.relations.length; i++) {
      const eq = exprEqual(a.relations[i], b.relations[i]);
      if (eq !== true) return eq;
    }
    return true;
  }
  if (a instanceof OrRelations && b instanceof OrRelations) {
    if (a.relations.length !== b.relations.length) {
      return { reason: `OrRelations length mismatch: ${a.relations.length} vs ${b.relations.length}` };
    }
    for (let i = 0; i < a.relations.length; i++) {
      const eq = exprEqual(a.relations[i], b.relations[i]);
      if (eq !== true) return eq;
    }
    return true;
  }
  if (a instanceof AnyRelation && b instanceof AnyRelation) {
    return exprEqual(a.objects, b.objects);
  }

  // Generic Relation comparison
  if (a instanceof Relation && b instanceof Relation) {
    // Compare by children if no specific handler matched
    const aChildren = Array.from(a.children().entries());
    const bChildren = Array.from(b.children().entries());
    if (aChildren.length !== bChildren.length) {
      return { reason: `Relation children count mismatch: ${aChildren.length} vs ${bChildren.length}` };
    }
    for (let i = 0; i < aChildren.length; i++) {
      const [aKey, aVal] = aChildren[i];
      const [bKey, bVal] = bChildren[i];
      if (aKey !== bKey) {
        return { reason: `Relation child key mismatch: ${aKey} vs ${bKey}` };
      }
      const eq = exprEqual(aVal, bVal);
      if (eq !== true) return eq;
    }
    return true;
  }

  // Geometry predicates
  if (a instanceof GeometryPredicate && b instanceof GeometryPredicate) {
    const aChildren = Array.from(a.children().entries());
    const bChildren = Array.from(b.children().entries());
    if (aChildren.length !== bChildren.length) {
      return { reason: `GeometryPredicate children count mismatch` };
    }
    for (let i = 0; i < aChildren.length; i++) {
      const [aKey, aVal] = aChildren[i];
      const [bKey, bVal] = bChildren[i];
      if (aKey !== bKey) {
        return { reason: `GeometryPredicate child key mismatch` };
      }
      const eq = exprEqual(aVal, bVal);
      if (eq !== true) return eq;
    }
    return true;
  }

  // Generic fallback: compare by type and children
  const aChildren = Array.from(a.children().entries());
  const bChildren = Array.from(b.children().entries());
  if (aChildren.length !== bChildren.length) {
    return { reason: `Node children count mismatch for type ${a.type}` };
  }
  for (let i = 0; i < aChildren.length; i++) {
    const [aKey, aVal] = aChildren[i];
    const [bKey, bVal] = bChildren[i];
    if (aKey !== bKey) {
      return { reason: `Node child key mismatch for type ${a.type}: ${aKey} vs ${bKey}` };
    }
    const eq = exprEqual(aVal, bVal);
    if (eq !== true) return eq;
  }
  return true;
}

/**
 * Convenience function that returns a simple boolean for equality
 */
export function exprEqualBool(a: Node, b: Node): boolean {
  const result = exprEqual(a, b);
  return result === true;
}
