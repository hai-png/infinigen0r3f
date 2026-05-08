// Copyright (C) 2024, Princeton University.
// This source code is licensed under the BSD 3-Clause license found in the LICENSE file in the root directory
// of this source tree.

// Authors: Alexander Raistrick, David Yan
// Ported to TypeScript for React Three Fiber

import { Node, Variable } from '../language/types';
import { ScalarExpression, BoolExpression, ScalarConstant, BoolConstant, ScalarVariable, BoolVariable } from '../language/expression';
import { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, FilterObjects, UnionObjects, IntersectionObjects, DifferenceObjects, CountExpression } from '../language/set-reasoning';
import { Problem, ItemExpression, TaggedExpression, SceneExpression } from '../language/constants';
import { BoolOperatorExpression, ScalarOperatorExpression } from '../language/expression';
import { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations } from '../language/relations';
import { GeometryPredicate, Distance, Angle, SurfaceArea, Volume, Count } from '../language/geometry';
import { ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver } from '../language/set-reasoning';
import { SymbolicDomain, DomainTag, domainFinalized } from './domain';

// Re-export domainFinalized from the domain module
export { domainFinalized };

/**
 * Extract the symbolic domain from an ObjectSetExpression node.
 *
 * Ported from infinigen/core/constraints/reasoning/constraint_domain.py
 *
 * This implements the original Infinigen's constraint_domain() function which
 * recursively extracts a symbolic Domain from an ObjectSetExpression AST node:
 *
 *   Scene          → empty Domain (everything)
 *   Tagged(objs, tags) → constraintDomain(objs).withTags(tags)
 *   RelatedTo(child, relation, parent) → constraintDomain(child).addRelation(relation, constraintDomain(parent))
 *   Item(name)     → Domain({Variable(name)})
 *   UnionObjects   → intersection of domains (both must be satisfied)
 *   IntersectionObjects → intersection of domains
 *   DifferenceObjects  → difference of domains
 *   FilterObjects  → intersection with filter domain
 */
export function constraintDomain(node: Node): SymbolicDomain {
  const recurse = (n: Node): SymbolicDomain => constraintDomain(n);

  // Handle Problem - intersect all constraint domains
  if (node instanceof Problem) {
    const domains: SymbolicDomain[] = [];
    for (const constraint of node.constraints.values()) {
      domains.push(recurse(constraint));
    }
    for (const scoreTerm of node.scoreTerms.values()) {
      domains.push(recurse(scoreTerm));
    }
    if (domains.length === 0) return new SymbolicDomain();
    return intersectSymbolicDomains(domains);
  }

  // Handle boolean operators - extract domains from operands
  if (node instanceof BoolOperatorExpression) {
    const operandDomains = node.operands
      .map(op => recurse(op));

    if (operandDomains.length === 0) return new SymbolicDomain();
    return intersectSymbolicDomains(operandDomains);
  }

  // Handle scalar operators
  if (node instanceof ScalarOperatorExpression) {
    const operandDomains = node.operands
      .map(op => recurse(op));

    if (operandDomains.length === 0) return new SymbolicDomain();
    return operandDomains[0];
  }

  // Handle relations - extract domain from relation arguments
  if (node instanceof Relation) {
    return extractRelationDomain(node);
  }

  // Handle object set expressions - the core of constraint_domain
  if (node instanceof ObjectSetExpression) {
    return extractObjectSetDomain(node);
  }

  // Handle geometry predicates
  if (node instanceof GeometryPredicate) {
    return extractGeometryPredicateDomain(node);
  }

  // Handle quantifiers
  if (node instanceof ForAll || node instanceof Exists ||
      node instanceof SumOver || node instanceof MeanOver ||
      node instanceof MaxOver || node instanceof MinOver) {
    return extractQuantifierDomain(node as any);
  }

  // Handle variables directly
  if (node instanceof ScalarVariable) {
    return new SymbolicDomain([node.variable]);
  }

  if (node instanceof BoolVariable) {
    return new SymbolicDomain([node.variable]);
  }

  if (node instanceof ObjectSetVariable) {
    return new SymbolicDomain([node.variable]);
  }

  // Handle constants - they don't constrain domains
  if (node instanceof ScalarConstant || node instanceof BoolConstant) {
    return new SymbolicDomain();
  }

  if (node instanceof ObjectSetConstant) {
    return new SymbolicDomain();
  }

  // Default: empty domain
  return new SymbolicDomain();
}

/**
 * Extract domain from a relation node
 */
function extractRelationDomain(relation: Relation): SymbolicDomain {
  if (relation instanceof NegatedRelation) {
    return constraintDomain(relation.relation);
  }

  if (relation instanceof AndRelations || relation instanceof OrRelations) {
    const domains = relation.relations
      .map(r => constraintDomain(r));
    return intersectSymbolicDomains(domains);
  }

  // For geometry-based relations (Near, Touching, etc.), extract domain from
  // the child ObjectSetExpressions and add the relation constraint
  if ('objects1' in relation && 'objects2' in relation) {
    const geoRel = relation as any;
    const childDomain = constraintDomain(geoRel.objects1);
    const parentDomain = constraintDomain(geoRel.objects2);
    return childDomain.addRelation(relation, parentDomain);
  }

  // For single-object relations (Hidden, Visible, etc.)
  if ('objects' in relation) {
    return constraintDomain((relation as any).objects);
  }

  // For other relations, extract domains from arguments
  const children = Array.from(relation.children().values());
  const domains = children
    .map(child => constraintDomain(child));

  if (domains.length === 0) return new SymbolicDomain();
  return intersectSymbolicDomains(domains);
}

/**
 * Extract domain from an ObjectSetExpression node.
 *
 * This is the core function matching the original Infinigen:
 *
 *   SceneExpression    → empty Domain (matches everything)
 *   TaggedExpression   → recurse + add tags
 *   ItemExpression     → Domain with Variable tag
 *   ObjectSetVariable  → Domain with Variable tag
 *   UnionObjects       → intersection of domains (both constraints must hold)
 *   IntersectionObjects → intersection of domains
 *   DifferenceObjects  → difference of domains
 *   FilterObjects      → intersection with filter domain
 */
function extractObjectSetDomain(objSet: ObjectSetExpression): SymbolicDomain {
  // SceneExpression → empty Domain (everything)
  if (objSet instanceof SceneExpression) {
    return new SymbolicDomain();
  }

  // TaggedExpression → recurse + add tags
  if (objSet instanceof TaggedExpression) {
    const innerDomain = constraintDomain(objSet.objs);
    return innerDomain.withTags(objSet.tags);
  }

  // ItemExpression → Domain({Variable(name)})
  // Item references a single variable in the constraint system
  if (objSet instanceof ItemExpression) {
    const varNode = new Variable(objSet.name);
    return new SymbolicDomain([varNode]);
  }

  // ObjectSetVariable → Domain with Variable tag
  if (objSet instanceof ObjectSetVariable) {
    return new SymbolicDomain([objSet.variable]);
  }

  // ObjectSetConstant → empty domain (fully determined)
  if (objSet instanceof ObjectSetConstant) {
    return new SymbolicDomain();
  }

  // UnionObjects → intersection of domains
  // In the original Infinigen, union of object sets corresponds to
  // intersection of their domains (both tag constraints must be satisfiable)
  if (objSet instanceof UnionObjects) {
    const leftDomain = constraintDomain(objSet.left);
    const rightDomain = constraintDomain(objSet.right);
    return leftDomain.intersect(rightDomain);
  }

  // IntersectionObjects → intersection of domains
  if (objSet instanceof IntersectionObjects) {
    const leftDomain = constraintDomain(objSet.left);
    const rightDomain = constraintDomain(objSet.right);
    return leftDomain.intersect(rightDomain);
  }

  // DifferenceObjects → difference of domains
  if (objSet instanceof DifferenceObjects) {
    const leftDomain = constraintDomain(objSet.left);
    const rightDomain = constraintDomain(objSet.right);
    return leftDomain.difference(rightDomain);
  }

  // FilterObjects → intersection with filter domain
  if (objSet instanceof FilterObjects) {
    const objDomain = constraintDomain(objSet.objects);
    // The condition may contribute additional tag constraints
    const conditionDomain = extractFilterConditionDomain(objSet.condition);
    return objDomain.intersect(conditionDomain);
  }

  // CountExpression → recurse on inner object set
  if (objSet instanceof CountExpression) {
    return constraintDomain(objSet.objects);
  }

  // Default: empty domain
  return new SymbolicDomain();
}

/**
 * Extract domain constraints from an ObjectCondition
 */
function extractFilterConditionDomain(condition: any): SymbolicDomain {
  // If the condition is a TagCondition, add its required tags
  if (condition.requiredTags) {
    return new SymbolicDomain(Array.from(condition.requiredTags));
  }
  return new SymbolicDomain();
}

/**
 * Extract domain from geometry predicates
 */
function extractGeometryPredicateDomain(pred: GeometryPredicate): SymbolicDomain {
  // Geometry predicates reference object sets - extract domains from them
  if ('obj1' in pred && 'obj2' in pred) {
    const geoPred = pred as any;
    return constraintDomain(geoPred.obj1).intersect(constraintDomain(geoPred.obj2));
  }
  if ('obj' in pred) {
    return constraintDomain((pred as any).obj);
  }
  if ('objs' in pred) {
    return constraintDomain((pred as any).objs);
  }
  return new SymbolicDomain();
}

/**
 * Extract domain from quantifier expression
 */
function extractQuantifierDomain(quantifier: any): SymbolicDomain {
  // Quantifiers bind a variable over an object set
  // The domain is derived from the objects set, with the bound variable
  // substituted into the body's domain
  if ('objects' in quantifier) {
    return constraintDomain(quantifier.objects);
  }
  return new SymbolicDomain();
}

/**
 * Intersect multiple SymbolicDomains
 */
function intersectSymbolicDomains(domains: SymbolicDomain[]): SymbolicDomain {
  if (domains.length === 0) {
    return new SymbolicDomain();
  }

  let result = domains[0];
  for (let i = 1; i < domains.length; i++) {
    result = result.intersect(domains[i]);
  }
  return result;
}

/**
 * Extract all variable names from a constraint expression
 */
export function extractVariables(node: Node): Set<string> {
  const variables = new Set<string>();

  for (const child of node.traverse()) {
    if (child instanceof ScalarVariable ||
        child instanceof BoolVariable ||
        child instanceof ObjectSetVariable) {
      variables.add(child.variable.name);
    } else if (child instanceof ItemExpression) {
      variables.add(child.name);
    }
  }

  return variables;
}

/**
 * Check if a node contains a specific variable
 */
export function containsVariable(node: Node, varName: string): boolean {
  for (const child of node.traverse()) {
    if (child instanceof ScalarVariable ||
        child instanceof BoolVariable ||
        child instanceof ObjectSetVariable) {
      if (child.variable.name === varName) return true;
    } else if (child instanceof ItemExpression) {
      if (child.name === varName) return true;
    }
  }
  return false;
}

/**
 * Get free variables (variables not bound by quantifiers)
 */
export function getFreeVariables(node: Node): Set<string> {
  const allVars = extractVariables(node);
  const boundVars = new Set<string>();

  // Find all bound variables from quantifiers
  for (const child of node.traverse()) {
    if ((child instanceof ForAll || child instanceof Exists ||
         child instanceof SumOver || child instanceof MeanOver ||
         child instanceof MaxOver || child instanceof MinOver)) {
      boundVars.add(child.variable.name);
    }
  }

  const freeVars = new Set<string>();
  for (const v of allVars) {
    if (!boundVars.has(v)) {
      freeVars.add(v);
    }
  }

  return freeVars;
}

/**
 * Analyze constraint complexity for solver optimization
 */
export interface ConstraintComplexity {
  numVariables: number;
  numConstants: number;
  depth: number;
  hasQuantifiers: boolean;
  hasGeometryPredicates: boolean;
  domainType?: string;
}

export function analyzeConstraintComplexity(node: Node): ConstraintComplexity {
  let numVariables = 0;
  let numConstants = 0;
  let maxDepth = 0;
  let hasQuantifiers = false;
  let hasGeometryPredicates = false;

  function traverse(n: Node, depth: number): void {
    maxDepth = Math.max(maxDepth, depth);

    if (n instanceof ScalarVariable || n instanceof BoolVariable ||
        n instanceof ObjectSetVariable || n instanceof ItemExpression) {
      numVariables++;
    }

    if (n instanceof ScalarConstant || n instanceof BoolConstant ||
        n instanceof ObjectSetConstant) {
      numConstants++;
    }

    if (n instanceof ForAll || n instanceof Exists ||
        n instanceof SumOver || n instanceof MeanOver ||
        n instanceof MaxOver || n instanceof MinOver) {
      hasQuantifiers = true;
    }

    if (n instanceof GeometryPredicate) {
      hasGeometryPredicates = true;
    }

    for (const [, child] of n.children()) {
      traverse(child, depth + 1);
    }
  }

  traverse(node, 0);

  const domain = constraintDomain(node);

  return {
    numVariables,
    numConstants,
    depth: maxDepth,
    hasQuantifiers,
    hasGeometryPredicates,
    domainType: domain.isFinalized() ? 'finalized' : 'symbolic'
  };
}
