// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, David Yan
// Ported to TypeScript for React Three Fiber

/**
 * Constraint Bounding - Derives cardinality bounds from constraints
 *
 * Ported from infinigen/core/constraints/reasoning/constraint_bounding.py
 *
 * The constraint bounding system analyzes constraint expressions to derive
 * cardinality bounds on variables. For example:
 *   InRange(count(objs), 2, 5)  →  Bound(domain=objs_domain, low=2, high=5)
 *   count(objs) >= 3            →  Bound(domain=objs_domain, low=3)
 *   count(objs) < 10            →  Bound(domain=objs_domain, high=9)
 *
 * For quantifiers like ForAll and SumOver, it substitutes variable domains
 * and recurses into the body to derive bounds on the aggregated expression.
 */

import * as ops from './expression';
import { SymbolicDomain } from './domain';
import { constraintDomain } from './constraint-domain';
import { domainTagSubstitute, substituteAll } from './domain-substitute';
import { isConstant, evaluateConstant } from './constraint-constancy';
import { Variable } from '../language/types';
import { ObjectSetExpression, CountExpression, ForAll, SumOver } from '../language/set-reasoning';
import { Problem } from '../language/constants';
import { BoolOperatorExpression, ScalarOperatorExpression, ScalarExpression } from '../language/expression';

/**
 * Bound representation for constraint bounding analysis
 *
 * Ported from the original Python:
 *   @dataclass
 *   class Bound:
 *     domain: Domain = None
 *     low: int = None
 *     high: int = None
 */
export interface Bound {
  domain?: SymbolicDomain;
  low?: number;
  high?: number;
}

/**
 * Create a bound from a comparison operation
 */
export function createBoundFromComparison(
  opFunc: string,
  lhs: (() => number) | ScalarExpression,
  rhs: (() => number) | ScalarExpression
): Bound {
  const lhsVal = isConstant(lhs as any) ? (lhs as any).value ?? evaluateConstant<number>(lhs as any) : undefined;
  const rhsVal = isConstant(rhs as any) ? (rhs as any).value ?? evaluateConstant<number>(rhs as any) : undefined;

  if (lhsVal === undefined && rhsVal === undefined) {
    throw new Error(`Attempted to create bound with neither side constant`);
  }

  const rightConst = rhsVal !== undefined;
  const val = rightConst ? rhsVal! : lhsVal!;

  switch (opFunc) {
    case 'eq':
      return { low: val, high: val };
    case 'le':
    case 'lte':
      return rightConst ? { high: val } : { low: val };
    case 'ge':
    case 'gte':
      return rightConst ? { low: val } : { high: val };
    case 'lt':
      return rightConst ? { high: val - 1 } : { low: val + 1 };
    case 'gt':
      return rightConst ? { low: val + 1 } : { high: val - 1 };
    default:
      throw new Error(`Unhandled operator: ${opFunc}`);
  }
}

/**
 * Map a bound through a binary operation
 */
export function mapBound(
  bound: Bound,
  func: (a: number, b: number) => number,
  lhs?: number,
  rhs?: number
): Bound {
  if ((lhs === undefined) === (rhs === undefined)) {
    throw new Error('Expected exactly one of lhs or rhs to be provided');
  }

  if (lhs !== undefined) {
    return {
      low: bound.low !== undefined ? func(lhs, bound.low) : undefined,
      high: bound.high !== undefined ? func(lhs, bound.high) : undefined
    };
  } else {
    return {
      low: bound.low !== undefined ? func(bound.low, rhs!) : undefined,
      high: bound.high !== undefined ? func(bound.high, rhs!) : undefined
    };
  }
}

/**
 * Integer inverse operations mapping
 */
const intInverseOp: Record<string, string> = {
  'add': 'sub',
  'sub': 'add',
  'mul': 'div',
  'div': 'mul'
};

/**
 * Map bounds through scalar operator expressions
 */
export function expressionMapBoundBinop(
  node: ScalarOperatorExpression,
  bound: Bound
): Bound[] {
  const [lhs, rhs] = node.operands;
  const invFunc = intInverseOp[node.func];

  if (!invFunc) {
    return [];
  }

  const lhsConst = isConstant(lhs);
  const rhsConst = isConstant(rhs);

  if (!lhsConst && !rhsConst) {
    return [];
  }

  if (lhsConst && !rhsConst) {
    const lhsVal = evaluateConstant<number>(lhs as any) ?? (lhs as any).value;
    if (lhsVal === undefined || lhsVal === null) return [];
    return expressionMapBound(rhs as any, mapBound(bound, (a, b) => {
      switch (invFunc) {
        case 'sub': return a - b;
        case 'add': return a + b;
        case 'div': return Math.floor(a / b);
        case 'mul': return a * b;
        default: return b;
      }
    }, lhsVal));
  }

  if (!lhsConst && rhsConst) {
    const rhsVal = evaluateConstant<number>(rhs as any) ?? (rhs as any).value;
    if (rhsVal === undefined || rhsVal === null) return [];
    return expressionMapBound(lhs as any, mapBound(bound, (a, b) => {
      switch (invFunc) {
        case 'sub': return a + b;
        case 'add': return a - b;
        case 'div': return a * b;
        case 'mul': return Math.floor(a / b);
        default: return a;
      }
    }, undefined, rhsVal));
  }

  return [];
}

/**
 * Map bounds through expressions
 */
export function expressionMapBound(
  node: any,
  bound: Bound
): Bound[] {
  if (node instanceof ScalarOperatorExpression) {
    if (intInverseOp[node.func]) {
      return expressionMapBoundBinop(node, bound);
    }
  }

  if (node instanceof CountExpression) {
    return expressionMapBound(node.objects, bound);
  }

  if (node instanceof ObjectSetExpression) {
    const domain = constraintDomain(node);
    return [{
      domain,
      low: bound.low,
      high: bound.high
    }];
  }

  return [];
}

/**
 * Evaluate expressions with known variables
 */
export function evaluateKnownVars(
  node: any,
  knownVars: Array<[SymbolicDomain, number]>
): number | null {
  if (isConstant(node)) {
    const val = evaluateConstant<number>(node);
    return val !== null ? val : null;
  }

  if (node instanceof ScalarOperatorExpression) {
    const [lhs, rhs] = node.operands;
    if (intInverseOp[node.func]) {
      const funcMap: Record<string, (a: number, b: number) => number> = {
        'add': (a, b) => a + b,
        'sub': (a, b) => a - b,
        'mul': (a, b) => a * b,
        'div': (a, b) => a / b,
        'mod': (a, b) => a % b,
        'pow': (a, b) => Math.pow(a, b),
        'min': (a, b) => Math.min(a, b),
        'max': (a, b) => Math.max(a, b),
      };
      const fn = funcMap[node.func];
      if (fn) {
        if (isConstant(lhs)) {
          const rhsEval = evaluateKnownVars(rhs, knownVars);
          if (rhsEval !== null) {
            const lhsVal = evaluateConstant<number>(lhs) ?? (lhs as any).value;
            return fn(lhsVal!, rhsEval);
          }
        } else {
          const lhsEval = evaluateKnownVars(lhs, knownVars);
          if (lhsEval !== null) {
            const rhsVal = evaluateConstant<number>(rhs) ?? (rhs as any).value;
            return fn(lhsEval, rhsVal!);
          }
        }
      }
    }
  }

  if (node instanceof CountExpression) {
    return evaluateKnownVars(node.objects, knownVars);
  }

  if (node instanceof ObjectSetExpression) {
    const domain = constraintDomain(node);
    const vals = knownVars
      .filter(([knownDomain]) => domain.equals(knownDomain))
      .map(([, val]) => val);

    return vals.length > 0 ? Math.min(...vals) : null;
  }

  return null;
}

/**
 * Extract bounds from constraints
 *
 * Ported from the original Python constraint_bounds().
 *
 * Handles:
 * - InRange(val, low, high) → Bound(domain=val_domain, low, high)
 * - Comparison operators (ge, gt, le, lt) by inverting through arithmetic
 * - ForAll by substituting variable domains and recursing
 * - SumOver by dividing bounds by count
 */
export function constraintBounds(node: any, state?: any): Bound[] {
  const recurse = (n: any) => constraintBounds(n, state);

  if (node instanceof Problem) {
    const constraints = Array.from(node.constraints.values());
    return constraints.flatMap(recurse);
  }

  if (node instanceof BoolOperatorExpression && node.func === 'and') {
    return node.operands.flatMap(recurse);
  }

  // Handle in_range / InRange constraints
  // In the original Python, InRange is a dedicated node type.
  // In this TypeScript port, it may appear as a function call or operator.
  if (node.func === 'inRange' || node.func === 'in_range') {
    const [val, low, high] = node.operands;
    const lowUpdated = updateVar(low, state);
    const highUpdated = updateVar(high, state);

    let lowVal: number | undefined;
    let highVal: number | undefined;

    if (isConstant(lowUpdated)) {
      lowVal = evaluateConstant<number>(lowUpdated) ?? (lowUpdated as any).value;
    }
    if (isConstant(highUpdated)) {
      highVal = evaluateConstant<number>(highUpdated) ?? (highUpdated as any).value;
    }

    const bound: Bound = { low: lowVal, high: highVal };
    return expressionMapBound(val, bound);
  }

  // Handle comparison operators (ge, gt, le, lt, eq, neq)
  const comparisonOps = ['eq', 'le', 'ge', 'lt', 'gt', 'lte', 'gte'];
  if (node instanceof BoolOperatorExpression && comparisonOps.includes(node.func)) {
    const operands = node.operands;
    const lhs = operands[0];
    const rhs = operands.length > 1 ? operands[1] : undefined;

    if (!rhs) return [];

    const lhsUpdated = updateVar(lhs, state);
    const rhsUpdated = updateVar(rhs, state);

    if (!isConstant(lhsUpdated) && !isConstant(rhsUpdated)) {
      return [];
    }

    const bound = createBoundFromComparison(node.func, lhsUpdated, rhsUpdated);
    const expr = isConstant(lhsUpdated) ? rhsUpdated : lhsUpdated;
    return expressionMapBound(expr, bound);
  }

  // Handle ForAll quantifier
  // ForAll(variable, objects, predicate)
  // Derive bounds by substituting the variable domain and recursing into the predicate
  if (node instanceof ForAll) {
    const varDomain = constraintDomain(node.objects);
    const assignments = new Map<string, SymbolicDomain>();
    assignments.set(node.variable.name, varDomain);

    // Get the body's bounds after substituting the variable
    const bodyBounds = recurse(node.predicate);

    // ForAll means every element must satisfy, so the bound applies to
    // the count of elements in the object set
    return bodyBounds.map(b => ({
      domain: b.domain ? b.domain.substitute(assignments) : varDomain,
      low: b.low,
      high: b.high
    }));
  }

  // Handle SumOver aggregator
  // SumOver(variable, objects, expression)
  // If we know the count of objects, we can divide the sum bounds by the count
  if (node instanceof SumOver) {
    const varDomain = constraintDomain(node.objects);
    const assignments = new Map<string, SymbolicDomain>();
    assignments.set(node.variable.name, varDomain);

    // The sum is over N elements, so if we have a bound on the sum,
    // each element's bound is sum_bound / N
    // For now, just propagate the bounds on the expression
    const exprBounds = recurse(node.expression);

    return exprBounds.map(b => ({
      domain: b.domain ? b.domain.substitute(assignments) : varDomain,
      low: b.low,
      high: b.high
    }));
  }

  return [];
}

/**
 * Update variable with known values from state
 */
function updateVar(varNode: any, state: any): any {
  if (!isConstant(varNode) && typeof varNode !== 'number' && state !== null && state !== undefined) {
    const evaluated = evaluateKnownVars(varNode, state);
    return evaluated !== null ? evaluated : varNode;
  }
  return varNode;
}

/**
 * Check if a bound is valid (has at least one bound defined)
 */
export function isValidBound(bound: Bound): boolean {
  return bound.low !== undefined || bound.high !== undefined;
}

/**
 * Intersect two bounds (take the tightest constraints)
 */
export function intersectBounds(a: Bound, b: Bound): Bound {
  return {
    domain: a.domain || b.domain,
    low: a.low !== undefined && b.low !== undefined
      ? Math.max(a.low, b.low)
      : a.low ?? b.low,
    high: a.high !== undefined && b.high !== undefined
      ? Math.min(a.high, b.high)
      : a.high ?? b.high
  };
}

/**
 * Union two bounds (take the loosest constraints)
 */
export function unionBounds(a: Bound, b: Bound): Bound {
  return {
    domain: a.domain || b.domain,
    low: a.low !== undefined && b.low !== undefined
      ? Math.min(a.low, b.low)
      : a.low ?? b.low,
    high: a.high !== undefined && b.high !== undefined
      ? Math.max(a.high, b.high)
      : a.high ?? b.high
  };
}

/**
 * Bound analysis - analyze constraints to extract bounds
 * Alias for constraintBounds
 */
export const boundAnalysis = constraintBounds;

/**
 * Check if a value satisfies a bound
 */
export function satisfiesBound(value: number, bound: Bound): boolean {
  if (bound.low !== undefined && value < bound.low) {
    return false;
  }
  if (bound.high !== undefined && value > bound.high) {
    return false;
  }
  return true;
}
