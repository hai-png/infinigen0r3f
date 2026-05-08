/**
 * Domain Substitution Module
 * 
 * Implements variable substitution in constraints and domains.
 * Ported from: infinigen/core/constraints/reasoning/domain_substitute.py (~1,100 LOC)
 * 
 * This module handles:
 * - Variable substitution in SymbolicDomains (substituteAll)
 * - Variable substitution in expression nodes
 * - Domain substitution when variables are bound
 * - Constraint simplification after substitution
 */

import {
  Node,
  ExpressionNode,
  Variable,
  BinaryOpNode,
  UnaryOpNode,
  ConstantNode,
  RelationNode,
  QuantifierNode,
  SetExpressionNode,
  FilterObjectsNode,
  ArithmeticOperator,
  BooleanOperator,
  ComparisonOperator,
  Domain,
  NumericDomain,
  ObjectSetDomain,
  PoseDomain,
} from '../language/types';
import { constraintDomain } from './constraint-domain';
import { isConstant, evaluateConstant } from './constraint-constancy';
import { SymbolicDomain, DomainTag } from './domain';

// ─── Symbolic Domain Substitution ──────────────────────────────────────────

/**
 * Substitute all Variable tags in a SymbolicDomain with concrete domains
 * from the assignments map.
 *
 * Ported from the original Infinigen's substituteAll():
 *   def substitute_all(dom, assignments):
 *       new_tags = set()
 *       for t in dom.tags:
 *           if isinstance(t, Variable) and t.name in assignments:
 *               sub = assignments[t.name]
 *               new_tags |= sub.tags
 *               dom.relations += sub.relations
 *           else:
 *               new_tags.add(t)
 *       ...
 *
 * This replaces Variable tags with concrete domains from the assignments map.
 * Used during greedy stage execution to bind room/object variables.
 *
 * @param dom - The SymbolicDomain to substitute in
 * @param assignments - Map of variable names to their concrete SymbolicDomains
 * @returns New SymbolicDomain with Variable tags replaced
 */
export function substituteAll(
  dom: SymbolicDomain,
  assignments: Map<string, SymbolicDomain>
): SymbolicDomain {
  return dom.substitute(assignments);
}

/**
 * Domain tag substitution - substitute tags in domain constraints
 *
 * This replaces string tags that match keys in the substitutions map
 * with the tags from the replacement domain. Used for binding symbolic
 * tag references to concrete tag values.
 *
 * @param dom - The SymbolicDomain to substitute in
 * @param tagSubstitutions - Map of tag names to replacement SymbolicDomains
 * @returns New SymbolicDomain with tags substituted
 */
export function domainTagSubstitute(
  dom: SymbolicDomain,
  tagSubstitutions: Map<string, SymbolicDomain>
): SymbolicDomain {
  const newTags = new Set<DomainTag>();
  let newRelations = [...dom.relations];

  for (const tag of dom.tags) {
    if (typeof tag === 'string' && tagSubstitutions.has(tag)) {
      const replacement = tagSubstitutions.get(tag)!;
      // Merge replacement domain's tags
      for (const rTag of replacement.tags) {
        newTags.add(rTag);
      }
      // Merge replacement domain's relations
      newRelations = [...newRelations, ...replacement.relations];
    } else {
      newTags.add(tag);
    }
  }

  // Recursively substitute in nested relation domains
  newRelations = newRelations.map(([rel, nestedDom]) =>
    [rel, domainTagSubstitute(nestedDom, tagSubstitutions)] as const
  );

  return new SymbolicDomain(newTags, newRelations);
}

// ─── Expression Node Substitution ──────────────────────────────────────────

/**
 * Substitution result containing the substituted node and success flag
 */
export interface SubstitutionResult {
  node: ExpressionNode;
  success: boolean;
  /** Variables that were successfully substituted */
  substitutedVars: Set<string>;
}

/**
 * Variable binding mapping variable names to their values/domains
 */
export interface VariableBinding {
  varName: string;
  value?: any;
  domain?: Domain;
}

/**
 * Substitute variables in a node with given bindings
 * 
 * @param node - The node to substitute in
 * @param bindings - Variable bindings (name -> value or domain)
 * @returns SubstitutionResult with the substituted node
 */
export function substituteVariables(
  node: ExpressionNode,
  bindings: Map<string, any | Domain>
): SubstitutionResult {
  const substitutedVars = new Set<string>();
  
  const substitute = (n: ExpressionNode): ExpressionNode => {
    if (n.type === 'Variable') {
      const varNode = n as Variable;
      if (bindings.has(varNode.name)) {
        substitutedVars.add(varNode.name);
        const binding = bindings.get(varNode.name)!;
        
        // If binding is a constant value, return a constant node
        if (typeof binding !== 'object' || binding instanceof Array || 
            (binding.constructor && !binding.type)) {
          return createConstantNode(binding);
        }
        
        // If binding is a domain, keep as variable but mark for domain propagation
        if ((binding as Domain).type) {
          return n; // Keep variable, domain will be handled separately
        }
        
        return n;
      }
      return n;
    }
    
    if (n.type === 'Constant') {
      return n;
    }
    
    if (n.type === 'BinaryOp') {
      const binOp = n as BinaryOpNode;
      const left = substitute(binOp.left);
      const right = substitute(binOp.right);
      
      // Try to simplify if both sides are constant
      if (isConstant(left as Node) && isConstant(right as Node)) {
        const result = evaluateConstant(binOp as unknown as Node);
        if (result !== undefined) {
          return createConstantNode(result);
        }
      }
      
      return {
        ...binOp,
        left,
        right
      } as BinaryOpNode;
    }
    
    if (n.type === 'UnaryOp') {
      const unOp = n as UnaryOpNode;
      const operand = substitute(unOp.operand);
      
      // Simplify if operand is constant
      if (isConstant(operand as Node)) {
        const result = evaluateConstant(unOp as unknown as Node);
        if (result !== undefined) {
          return createConstantNode(result);
        }
      }
      
      return {
        ...unOp,
        operand
      } as UnaryOpNode;
    }
    
    if (n.type === 'Relation') {
      const rel = n as RelationNode;
      const args = rel.args.map(arg => substitute(arg));
      
      return {
        ...rel,
        args
      } as RelationNode;
    }
    
    if (n.type === 'Quantifier' || n.type === 'ForAll' || n.type === 'Exists' || n.type === 'SumOver' || n.type === 'MeanOver' || n.type === 'MaxOver' || n.type === 'MinOver') {
      const quant = n as QuantifierNode;
      // Don't substitute bound variable in quantifier scope
      const filteredBindings = new Map(bindings);
      filteredBindings.delete(quant.boundVar || quant.variable);
      
      const body = substitute(quant.body);
      
      return {
        ...quant,
        body
      } as QuantifierNode;
    }
    
    if (n.type === 'FilterObjects') {
      const filter = n as FilterObjectsNode;
      const source = filter.source ? substitute(filter.source) : undefined;
      const condition = substitute(filter.condition);
      
      return {
        ...filter,
        source,
        condition
      } as FilterObjectsNode;
    }
    
    if (n.type === 'SetExpression') {
      const setExpr = n as SetExpressionNode;
      const elements = setExpr.elements.map(elem => substitute(elem));
      
      return {
        ...setExpr,
        elements
      } as SetExpressionNode;
    }
    
    // Default: return unchanged
    return n;
  };
  
  const result = substitute(node);
  
  return {
    node: result as ExpressionNode,
    success: substitutedVars.size > 0,
    substitutedVars
  };
}

/**
 * Substitute a single variable in a node
 * 
 * @param node - The node to substitute in
 * @param varName - Name of variable to substitute
 * @param replacement - Replacement node or value
 * @returns New node with substitutions
 */
export function substituteVariable(
  node: ExpressionNode,
  varName: string,
  replacement: ExpressionNode | any
): ExpressionNode {
  const bindings = new Map([[varName, replacement]]);
  const result = substituteVariables(node, bindings);
  return result.node;
}

// Re-export alias for compatibility
export { substituteVariable as substituteNode };

/**
 * Apply domain substitution to a constraint
 * 
 * When a variable's domain is known, we can sometimes simplify
 * the constraint or detect contradictions early.
 * 
 * @param node - Constraint node
 * @param domains - Map of variable names to their domains
 * @returns Simplified constraint node
 */
export function applyDomainSubstitution(
  node: ExpressionNode,
  domains: Map<string, Domain>
): ExpressionNode {
  const substituteWithDomains = (n: ExpressionNode): ExpressionNode => {
    if (n.type === 'Variable') {
      return n;
    }
    
    if (n.type === 'BinaryOp') {
      const binOp = n as BinaryOpNode;
      const left = substituteWithDomains(binOp.left);
      const right = substituteWithDomains(binOp.right);
      
      // Check for domain-based simplifications
      const simplified = simplifyWithDomainInfo(binOp, left, right, domains);
      if (simplified) {
        return simplified;
      }
      
      return {
        ...binOp,
        left,
        right
      } as BinaryOpNode;
    }
    
    if (n.type === 'Relation') {
      const rel = n as RelationNode;
      const args = rel.args.map(arg => substituteWithDomains(arg));
      
      return {
        ...rel,
        args
      } as RelationNode;
    }
    
    // Recurse for other node types
    if (n.type === 'UnaryOp') {
      const unOp = n as UnaryOpNode;
      return {
        ...unOp,
        operand: substituteWithDomains(unOp.operand)
      } as UnaryOpNode;
    }
    
    if (n.type === 'Quantifier' || n.type === 'ForAll' || n.type === 'Exists' || n.type === 'SumOver' || n.type === 'MeanOver' || n.type === 'MaxOver' || n.type === 'MinOver') {
      const quant = n as QuantifierNode;
      const filteredDomains = new Map(domains);
      filteredDomains.delete(quant.boundVar || quant.variable);
      
      return {
        ...quant,
        body: substituteWithDomains(quant.body)
      } as QuantifierNode;
    }
    
    if (n.type === 'FilterObjects') {
      const filter = n as FilterObjectsNode;
      return {
        ...filter,
        source: filter.source ? substituteWithDomains(filter.source) : undefined,
        condition: substituteWithDomains(filter.condition)
      } as FilterObjectsNode;
    }
    
    if (n.type === 'SetExpression') {
      const setExpr = n as SetExpressionNode;
      return {
        ...setExpr,
        elements: setExpr.elements.map(elem => substituteWithDomains(elem))
      } as SetExpressionNode;
    }
    
    return n;
  };
  
  return substituteWithDomains(node) as ExpressionNode;
}

/**
 * Simplify binary operation using domain information
 */
function simplifyWithDomainInfo(
  node: BinaryOpNode,
  left: ExpressionNode,
  right: ExpressionNode,
  domains: Map<string, Domain>
): ExpressionNode | null {
  if (node.opType !== 'Comparison') return null;

  const compOp = node.op as ComparisonOperator;
  const leftVars = extractVariablesFromNode(left);
  const rightVars = extractVariablesFromNode(right);

  // Case 1: Variable compared to constant
  for (const varName of leftVars) {
    const domain = domains.get(varName);
    if (!domain || domain.type !== 'numeric') continue;
    const numDomain = domain as NumericDomain;
    if (numDomain.discrete) continue;

    const rightConst = tryGetConstantValue(right);
    if (rightConst === undefined || typeof rightConst !== 'number') continue;

    const result = evaluateComparisonWithDomain(compOp, numDomain, rightConst);
    if (result !== null) {
      return createConstantNode(result);
    }
  }

  // Case 2: Constant compared to variable
  for (const varName of rightVars) {
    const domain = domains.get(varName);
    if (!domain || domain.type !== 'numeric') continue;
    const numDomain = domain as NumericDomain;
    if (numDomain.discrete) continue;

    const leftConst = tryGetConstantValue(left);
    if (leftConst === undefined || typeof leftConst !== 'number') continue;

    const reversedOp = reverseComparison(compOp);
    if (reversedOp) {
      const result = evaluateComparisonWithDomain(reversedOp, numDomain, leftConst);
      if (result !== null) {
        return createConstantNode(result);
      }
    }
  }

  // Case 3: Two variables with known domains
  if (leftVars.size === 1 && rightVars.size === 1) {
    const leftVar = Array.from(leftVars)[0];
    const rightVar = Array.from(rightVars)[0];
    const leftDom = domains.get(leftVar);
    const rightDom = domains.get(rightVar);
    if (leftDom?.type === 'numeric' && rightDom?.type === 'numeric') {
      const lDom = leftDom as NumericDomain;
      const rDom = rightDom as NumericDomain;
      if (!lDom.discrete && !rDom.discrete) {
        // Check if comparison is impossible or always true
        if (compOp === 'lt' && lDom.min >= rDom.max) return createConstantNode(false);
        if (compOp === 'lte' && lDom.min > rDom.max) return createConstantNode(false);
        if (compOp === 'gt' && lDom.max <= rDom.min) return createConstantNode(false);
        if (compOp === 'gte' && lDom.max < rDom.min) return createConstantNode(false);
        if (compOp === 'lt' && lDom.max < rDom.min) return createConstantNode(true);
        if (compOp === 'lte' && lDom.max <= rDom.min) return createConstantNode(true);
        if (compOp === 'gt' && lDom.min > rDom.max) return createConstantNode(true);
        if (compOp === 'gte' && lDom.min >= rDom.max) return createConstantNode(true);
      }
    }
  }

  return null;
}

/**
 * Evaluate whether a comparison between a variable's domain and a constant
 * is always true, always false, or indeterminate.
 */
function evaluateComparisonWithDomain(
  op: ComparisonOperator,
  domain: NumericDomain,
  constant: number
): boolean | null {
  switch (op) {
    case 'lt':
      if (domain.max < constant) return true;
      if (domain.min >= constant) return false;
      return null;
    case 'lte':
      if (domain.max <= constant) return true;
      if (domain.min > constant) return false;
      return null;
    case 'gt':
      if (domain.min > constant) return true;
      if (domain.max <= constant) return false;
      return null;
    case 'gte':
      if (domain.min >= constant) return true;
      if (domain.max < constant) return false;
      return null;
    case 'eq':
      if (domain.min === constant && domain.max === constant) return true;
      if (constant < domain.min || constant > domain.max) return false;
      return null;
    case 'neq':
      if (domain.min === constant && domain.max === constant) return false;
      if (constant < domain.min || constant > domain.max) return true;
      return null;
    default:
      return null;
  }
}

/**
 * Reverse a comparison operator (swap left/right operands)
 */
function reverseComparison(op: ComparisonOperator): ComparisonOperator | null {
  switch (op) {
    case 'lt': return 'gt';
    case 'lte': return 'gte';
    case 'gt': return 'lt';
    case 'gte': return 'lte';
    case 'eq': return 'eq';
    case 'neq': return 'neq';
    default: return null;
  }
}

/**
 * Try to extract a constant numeric value from a node
 */
function tryGetConstantValue(node: ExpressionNode): any {
  if (node.type === 'Constant') {
    return (node as any).value;
  }
  return undefined;
}

/**
 * Extract all variable names from a node
 */
function extractVariablesFromNode(node: ExpressionNode): Set<string> {
  const vars = new Set<string>();
  
  const collect = (n: ExpressionNode) => {
    if (n.type === 'Variable') {
      vars.add((n as Variable).name);
    } else if (n.type === 'BinaryOp') {
      collect((n as BinaryOpNode).left);
      collect((n as BinaryOpNode).right);
    } else if (n.type === 'UnaryOp') {
      collect((n as UnaryOpNode).operand);
    } else if (n.type === 'Relation') {
      (n as RelationNode).args.forEach(collect);
    }
  };
  
  collect(node);
  return vars;
}

/**
 * Create a constant node from a value
 */
function createConstantNode(value: any): ConstantNode {
  return {
    type: 'Constant',
    value,
    constantType: typeof value === 'boolean' ? 'BoolConstant' :
                  typeof value === 'number' ? 'ScalarConstant' :
                  value instanceof Array ? 'VectorConstant' : 'ObjectConstant'
  } as ConstantNode;
}

/**
 * Compose multiple substitutions
 * 
 * @param node - The node to substitute in
 * @param substitutions - Array of {varName, replacement} pairs
 * @returns Final substituted node
 */
export function composeSubstitutions(
  node: ExpressionNode,
  substitutions: Array<{ varName: string; replacement: ExpressionNode | any }>
): ExpressionNode {
  let result = node;
  
  for (const sub of substitutions) {
    result = substituteVariable(result, sub.varName, sub.replacement);
  }
  
  return result;
}

/**
 * Check if a substitution would create circular dependencies
 * 
 * @param varName - Variable to substitute
 * @param replacement - Replacement expression
 * @returns True if substitution would be circular
 */
export function isCircularSubstitution(varName: string, replacement: ExpressionNode): boolean {
  const varsInReplacement = extractVariablesFromNode(replacement);
  return varsInReplacement.has(varName);
}

/**
 * Safe substitution that checks for circularity
 * 
 * @param node - The node to substitute in
 * @param varName - Name of variable to substitute
 * @param replacement - Replacement expression
 * @throws Error if substitution would be circular
 */
export function safeSubstituteVariable(
  node: ExpressionNode,
  varName: string,
  replacement: ExpressionNode | any
): ExpressionNode {
  const replacementNode = typeof replacement === 'object' && replacement.type 
    ? replacement as ExpressionNode 
    : createConstantNode(replacement);
  
  if (isCircularSubstitution(varName, replacementNode)) {
    throw new Error(`Circular substitution detected: ${varName} appears in its own replacement`);
  }
  
  return substituteVariable(node, varName, replacement);
}

/**
 * Normalize a constraint by applying all possible substitutions and simplifications
 * 
 * @param node - Constraint to normalize
 * @param domains - Known variable domains
 * @returns Normalized constraint
 */
export function normalizeConstraint(
  node: ExpressionNode,
  domains: Map<string, Domain> = new Map()
): ExpressionNode {
  // Step 1: Apply domain substitution
  let result = applyDomainSubstitution(node, domains);
  
  // Step 2: Substitute any constant variables
  const constBindings = new Map<string, any>();
  for (const [varName, domain] of domains.entries()) {
    if (domain.type === 'numeric') {
      const numDomain = domain as NumericDomain;
      if (numDomain.lower !== -Infinity && numDomain.lower === numDomain.upper) {
        constBindings.set(varName, numDomain.lower);
      }
    }
  }
  
  if (constBindings.size > 0) {
    const subResult = substituteVariables(result, constBindings);
    result = subResult.node as ExpressionNode;
  }
  
  return result;
}
