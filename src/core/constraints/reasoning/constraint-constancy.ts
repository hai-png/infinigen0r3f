// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick
// Ported to TypeScript for React Three Fiber

/**
 * Constraint Constancy Analysis
 *
 * Ported from infinigen/core/constraints/reasoning/constraint_constancy.py
 *
 * Determines whether a constraint language node is a compile-time constant
 * (can be evaluated without any scene state). This is used by:
 * - The constraint bounding system to simplify bounds
 * - The solver to prune constant constraints
 * - The domain substitution system to simplify expressions
 *
 * Rules:
 * - ScalarConstant / BoolConstant → always constant
 * - ScalarOperatorExpression → constant if all operands constant
 * - BoolOperatorExpression → constant if all operands constant
 * - HingeLossExpression → constant if all sub-expressions constant
 * - Everything else (variables, quantifiers, geometry predicates, etc.) → not constant
 */

import { Node } from '../language/types';
import {
  ScalarConstant,
  BoolConstant,
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

/**
 * Check if a constraint language node is a compile-time constant.
 *
 * Returns true if the node can be fully evaluated without any scene state,
 * meaning it contains only literal constants and operations on constants.
 *
 * Examples:
 *   isConstant(new ScalarConstant(5))           → true
 *   isConstant(new BoolConstant(true))           → true
 *   isConstant(new ScalarOperatorExpression(     → true
 *     new ScalarConstant(3), 'add', new ScalarConstant(4)))
 *   isConstant(new ScalarVariable(...))          → false
 *   isConstant(new CountExpression(...))         → false
 */
export function isConstant(node: Node): boolean {
  // Scalar constants are always constant
  if (node instanceof ScalarConstant) {
    return true;
  }

  // Boolean constants are always constant
  if (node instanceof BoolConstant) {
    return true;
  }

  // Scalar operator expressions are constant if all operands are constant
  if (node instanceof ScalarOperatorExpression) {
    return node.operands.every(op => isConstant(op));
  }

  // Boolean operator expressions are constant if all operands are constant
  if (node instanceof BoolOperatorExpression) {
    return node.operands.every(op => isConstant(op));
  }

  // Hinge loss expressions are constant if value, low, and high are all constant
  if (node instanceof HingeLossExpression) {
    return isConstant(node.value) && isConstant(node.low) && isConstant(node.high);
  }

  // Unary scalar expressions (negate, abs) are constant if operand is constant
  if (node instanceof ScalarNegateExpression) {
    return isConstant(node.operand);
  }

  if (node instanceof ScalarAbsExpression) {
    return isConstant(node.operand);
  }

  // Binary scalar min/max are constant if both operands are constant
  if (node instanceof ScalarMinExpression) {
    return isConstant(node.left) && isConstant(node.right);
  }

  if (node instanceof ScalarMaxExpression) {
    return isConstant(node.left) && isConstant(node.right);
  }

  // Boolean NOT is constant if operand is constant
  if (node instanceof BoolNotExpression) {
    return isConstant(node.operand);
  }

  // If-else expressions are constant only if condition and both branches are constant
  if (node instanceof ScalarIfElse) {
    return isConstant(node.condition) && isConstant(node.thenExpr) && isConstant(node.elseExpr);
  }

  if (node instanceof BoolIfElse) {
    return isConstant(node.condition) && isConstant(node.thenExpr) && isConstant(node.elseExpr);
  }

  // Everything else is not constant:
  // - Variables (ScalarVariable, BoolVariable, ObjectSetVariable)
  // - Quantifiers (ForAll, Exists, SumOver, etc.)
  // - Geometry predicates (Distance, Angle, etc.)
  // - Relations (Near, Touching, etc.)
  // - Object set expressions (ItemExpression, TaggedExpression, etc.)
  return false;
}

/**
 * Evaluate a constant expression to its concrete value.
 *
 * Only call this on nodes where isConstant() returns true.
 * Returns null if the node is not constant or evaluation fails.
 */
export function evaluateConstant<T extends number | boolean>(node: any): T | null {
  if (!isConstant(node)) {
    return null;
  }

  if (node instanceof ScalarConstant) {
    return node.value as T;
  }

  if (node instanceof BoolConstant) {
    return node.value as T;
  }

  if (node instanceof ScalarOperatorExpression) {
    const operands = node.operands.map(op => evaluateConstant<T>(op));
    if (operands.some(op => op === null)) {
      return null;
    }

    const ops = operands as Array<number | boolean>;

    switch (node.func) {
      // Scalar operations
      case 'add': return (ops[0] as number) + (ops[1] as number) as T;
      case 'sub': return (ops[0] as number) - (ops[1] as number) as T;
      case 'mul': return (ops[0] as number) * (ops[1] as number) as T;
      case 'div': return Math.floor((ops[0] as number) / (ops[1] as number)) as T;
      case 'mod': return (ops[0] as number) % (ops[1] as number) as T;
      case 'pow': return Math.pow(ops[0] as number, ops[1] as number) as T;
      case 'min': return Math.min(ops[0] as number, ops[1] as number) as T;
      case 'max': return Math.max(ops[0] as number, ops[1] as number) as T;

      default:
        return null;
    }
  }

  if (node instanceof BoolOperatorExpression) {
    const operands = node.operands.map(op => evaluateConstant<T>(op));
    if (operands.some(op => op === null)) {
      return null;
    }

    const ops = operands as Array<number | boolean>;

    switch (node.func) {
      // Boolean operations
      case 'and': return ((ops[0] as boolean) && (ops[1] as boolean)) as T;
      case 'or': return ((ops[0] as boolean) || (ops[1] as boolean)) as T;
      case 'xor': return ((ops[0] as boolean) !== (ops[1] as boolean)) as T;
      case 'implies': return (!(ops[0] as boolean) || (ops[1] as boolean)) as T;
      case 'not': return (!(ops[0] as boolean)) as T;
      case 'eq': return ((ops[0] as any) === (ops[1] as any)) as T;
      case 'neq': return ((ops[0] as any) !== (ops[1] as any)) as T;
      case 'ne': return ((ops[0] as any) !== (ops[1] as any)) as T;
      case 'lt': return ((ops[0] as number) < (ops[1] as number)) as T;
      case 'le':
      case 'lte': return ((ops[0] as number) <= (ops[1] as number)) as T;
      case 'gt': return ((ops[0] as number) > (ops[1] as number)) as T;
      case 'ge':
      case 'gte': return ((ops[0] as number) >= (ops[1] as number)) as T;

      default:
        return null;
    }
  }

  if (node instanceof HingeLossExpression) {
    const val = evaluateConstant<number>(node.value);
    const low = evaluateConstant<number>(node.low);
    const high = evaluateConstant<number>(node.high);
    if (val === null || low === null || high === null) return null;

    const lowPenalty = Math.max(0, low - val);
    const highPenalty = Math.max(0, val - high);
    return (lowPenalty + highPenalty) as T;
  }

  if (node instanceof ScalarNegateExpression) {
    const operand = evaluateConstant<number>(node.operand);
    if (operand === null) return null;
    return (-operand) as T;
  }

  if (node instanceof ScalarAbsExpression) {
    const operand = evaluateConstant<number>(node.operand);
    if (operand === null) return null;
    return Math.abs(operand) as T;
  }

  if (node instanceof ScalarMinExpression) {
    const left = evaluateConstant<number>(node.left);
    const right = evaluateConstant<number>(node.right);
    if (left === null || right === null) return null;
    return Math.min(left, right) as T;
  }

  if (node instanceof ScalarMaxExpression) {
    const left = evaluateConstant<number>(node.left);
    const right = evaluateConstant<number>(node.right);
    if (left === null || right === null) return null;
    return Math.max(left, right) as T;
  }

  if (node instanceof BoolNotExpression) {
    const operand = evaluateConstant<boolean>(node.operand);
    if (operand === null) return null;
    return (!operand) as T;
  }

  if (node instanceof ScalarIfElse) {
    const condition = evaluateConstant<boolean>(node.condition);
    if (condition === null) return null;
    if (condition) {
      return evaluateConstant<T>(node.thenExpr);
    } else {
      return evaluateConstant<T>(node.elseExpr);
    }
  }

  if (node instanceof BoolIfElse) {
    const condition = evaluateConstant<boolean>(node.condition);
    if (condition === null) return null;
    if (condition) {
      return evaluateConstant<T>(node.thenExpr);
    } else {
      return evaluateConstant<T>(node.elseExpr);
    }
  }

  return null;
}

/**
 * Simplify an expression by evaluating constant subexpressions.
 *
 * Recursively traverses the expression tree and replaces any sub-expression
 * that is a compile-time constant with its evaluated value.
 */
export function simplifyConstant(node: any): any {
  if (!isConstant(node)) {
    return node;
  }

  const evaluated = evaluateConstant(node);
  if (evaluated !== null) {
    if (typeof evaluated === 'number') {
      return new ScalarConstant(evaluated);
    } else {
      return new BoolConstant(evaluated);
    }
  }

  return node;
}
