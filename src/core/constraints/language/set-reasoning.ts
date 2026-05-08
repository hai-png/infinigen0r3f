/**
 * Set Reasoning for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/set_reasoning.py
 */

import { Node, Variable, Domain, ObjectSetDomain } from './types';
import { ScalarExpression, BoolExpression, ScalarConstant, ScalarOperatorExpression } from './expression';
import { TagSet as UnifiedTagSet, Tag as UnifiedTag } from '@/core/UnifiedTagSystem';
import type { Relation } from './relations';

/**
 * Base class for object set expressions
 */
export abstract class ObjectSetExpression extends Node {
  /**
   * Get the domain of this expression
   */
  abstract domain(): ObjectSetDomain;

  /**
   * Evaluate this expression to get actual object IDs
   */
  abstract evaluate(state: Map<Variable, any>): Set<string>;

  /**
   * Get variables used in this expression
   */
  abstract getVariables(): Set<Variable>;

  /**
   * Union with another set
   */
  union(other: ObjectSetExpression): UnionObjects {
    return new UnionObjects(this, other);
  }

  /**
   * Intersection with another set
   */
  intersection(other: ObjectSetExpression): IntersectionObjects {
    return new IntersectionObjects(this, other);
  }

  /**
   * Difference with another set
   */
  difference(other: ObjectSetExpression): DifferenceObjects {
    return new DifferenceObjects(this, other);
  }

  /**
   * Filter by condition
   */
  filter(condition: ObjectCondition): FilterObjects {
    return new FilterObjects(this, condition);
  }

  /**
   * Count objects in set
   */
  count(): CountExpression {
    return new CountExpression(this);
  }

  /**
   * Minimize: return a ScalarExpression that negates the count by weight.
   * In the original Infinigen, minimize(w) multiplies the expression by -w.
   * This is used for objective functions where we want to minimize a quantity.
   *
   * @param weight - The weight factor (default 1.0)
   */
  minimize(weight: number = 1.0): ScalarExpression {
    const countExpr = this.count();
    const weightExpr = new ScalarConstant(weight);
    return new ScalarOperatorExpression(countExpr, 'mul', weightExpr).negate();
  }

  /**
   * Maximize: return a ScalarExpression that multiplies the count by +weight.
   * In the original Infinigen, maximize(w) multiplies the expression by +w.
   * This is used for objective functions where we want to maximize a quantity.
   *
   * @param weight - The weight factor (default 1.0)
   */
  maximize(weight: number = 1.0): ScalarExpression {
    const countExpr = this.count();
    const weightExpr = new ScalarConstant(weight);
    return new ScalarOperatorExpression(countExpr, 'mul', weightExpr);
  }

  /**
   * Tagged: filter this object set by a set of required tags.
   * Equivalent to the [] operator in the original Infinigen DSL.
   * Since TypeScript doesn't support operator overloading, this is a method.
   *
   * @param tags - Tags that objects must have
   */
  taggedWith(tags: Set<string>): TaggedSetExpression {
    return new TaggedSetExpression(this, tags);
  }

  /**
   * Excludes: filter out objects that have any of the given tags.
   * Equivalent to the excludes() function in the original Infinigen DSL.
   *
   * @param excludedTags - Tags that disqualify objects
   */
  excludes(excludedTags: Set<string>): ExcludesExpression {
    return new ExcludesExpression(this, excludedTags);
  }
}

/**
 * Constant set of object IDs
 */
export class ObjectSetConstant extends ObjectSetExpression {
  readonly type = 'ObjectSetConstant';
  constructor(public readonly objectIds: Set<string>) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain(this.objectIds);
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    return new Set(this.objectIds);
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): ObjectSetConstant {
    return new ObjectSetConstant(new Set(this.objectIds));
  }

  toString(): string {
    return `Set{${Array.from(this.objectIds).join(', ')}}`;
  }
}

/**
 * Variable reference as object set
 */
export class ObjectSetVariable extends ObjectSetExpression {
  readonly type = 'ObjectSetVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const value = state.get(this.variable);
    if (!(value instanceof Set)) {
      throw new Error(`Expected Set for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value as Set<string>;
  }

  getVariables(): Set<Variable> {
    return new Set([this.variable]);
  }

  clone(): ObjectSetVariable {
    return new ObjectSetVariable(this.variable.clone());
  }

  toString(): string {
    return `ObjSetVar(${this.variable.name})`;
  }
}

/**
 * Union of two object sets
 */
export class UnionObjects extends ObjectSetExpression {
  readonly type = 'UnionObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    return new Set([...leftSet, ...rightSet]);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): UnionObjects {
    return new UnionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Union(${this.left}, ${this.right})`;
  }
}

/**
 * Intersection of two object sets
 */
export class IntersectionObjects extends ObjectSetExpression {
  readonly type = 'IntersectionObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    const intersection = new Set<string>();
    for (const obj of leftSet) {
      if (rightSet.has(obj)) {
        intersection.add(obj);
      }
    }
    return intersection;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): IntersectionObjects {
    return new IntersectionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Intersection(${this.left}, ${this.right})`;
  }
}

/**
 * Difference of two object sets (left - right)
 */
export class DifferenceObjects extends ObjectSetExpression {
  readonly type = 'DifferenceObjects';
  constructor(
    public readonly left: ObjectSetExpression,
    public readonly right: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const leftSet = this.left.evaluate(state);
    const rightSet = this.right.evaluate(state);
    const difference = new Set<string>(leftSet);
    for (const obj of rightSet) {
      difference.delete(obj);
    }
    return difference;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.left.getVariables()) vars.add(v);
    for (const v of this.right.getVariables()) vars.add(v);
    return vars;
  }

  clone(): DifferenceObjects {
    return new DifferenceObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Difference(${this.left}, ${this.right})`;
  }
}

/**
 * Condition for filtering objects
 */
export abstract class ObjectCondition extends Node {
  abstract evaluate(objectId: string, state: Map<Variable, any>): boolean;
  abstract getVariables(): Set<Variable>;
}

/**
 * Filter objects by condition
 */
export class FilterObjects extends ObjectSetExpression {
  readonly type = 'FilterObjects';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly condition: ObjectCondition
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['condition', this.condition as Node]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const objectSet = this.objects.evaluate(state);
    const filtered = new Set<string>();
    for (const obj of objectSet) {
      if (this.condition.evaluate(obj, state)) {
        filtered.add(obj);
      }
    }
    return filtered;
  }

  getVariables(): Set<Variable> {
    const vars = this.objects.getVariables();
    for (const v of this.condition.getVariables()) {
      vars.add(v);
    }
    return vars;
  }

  clone(): FilterObjects {
    return new FilterObjects(
      this.objects.clone() as ObjectSetExpression,
      this.condition.clone() as ObjectCondition
    );
  }

  toString(): string {
    return `Filter(${this.objects}, ${this.condition})`;
  }
}

/**
 * Tag-based object condition
 */
export class TagCondition extends ObjectCondition {
  readonly type = 'TagCondition';
  constructor(
    public readonly requiredTags: Set<string>,
    public readonly excludedTags?: Set<string>
  ) {
    super();
  }

  /**
   * Convenience constructor for a single tag key-value pair
   */
  static fromKeyValue(key: string, value: string): TagCondition {
    return new TagCondition(new Set([`${key}:${value}`]));
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(objectId: string, state: Map<Variable, any>): boolean {
    // Look up the object's tags from the state.
    // The state map may contain:
    //  - '__tagRegistry': a UnifiedTaggingSystem instance
    //  - '__solverState': the evaluator State instance (with objects Map)
    // The Map<Variable, any> type is used for variable bindings but callers
    // may inject special string-keyed entries for infrastructure access.
    const stateAny = state as Map<any, any>;
    const tagRegistry = stateAny.get('__tagRegistry');
    const solverState = stateAny.get('__solverState');

    let objectTagSet: UnifiedTagSet | null = null;

    if (tagRegistry && typeof tagRegistry === 'object' && 'getObjectTags' in (tagRegistry as object)) {
      objectTagSet = (tagRegistry as any).getObjectTags(objectId);
    } else if (solverState && typeof solverState === 'object' && 'objects' in (solverState as object)) {
      const objState = (solverState as any).objects.get(objectId);
      if (!objState) return false;
      // Convert legacy tags to unified TagSet
      objectTagSet = new UnifiedTagSet(
        objState.tags.toArray().map((t: any) => {
          const str = t.toString();
          // Strip type prefix like Semantics(...), Material(...), etc.
          const match = str.match(/^[A-Z][a-z]+\((.+)\)$/);
          const name = match ? match[1] : str;
          return new UnifiedTag(name);
        })
      );
    }

    if (!objectTagSet) {
      // No tag information available in state — fall back to true
      // (preserves backward compatibility with code that doesn't inject a registry)
      return true;
    }

    // All required tags must be effectively contained in the object's TagSet
    for (const requiredTag of this.requiredTags) {
      if (!objectTagSet.contains(new UnifiedTag(requiredTag))) {
        return false;
      }
    }

    // No excluded tags may be present
    if (this.excludedTags) {
      for (const excludedTag of this.excludedTags) {
        if (objectTagSet.contains(new UnifiedTag(excludedTag))) {
          return false;
        }
      }
    }

    return true;
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): TagCondition {
    return new TagCondition(
      new Set(this.requiredTags),
      this.excludedTags ? new Set(this.excludedTags) : undefined
    );
  }

  toString(): string {
    return `TagCondition(req=[${Array.from(this.requiredTags).join(', ')}])`;
  }
}

/**
 * ForAll quantifier: ∀x ∈ objects. predicate(x)
 */
export class ForAll extends BoolExpression {
  readonly type = 'ForAll';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly predicate: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['predicate', this.predicate as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objectSet = this.objects.evaluate(state);
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      if (!this.predicate.evaluate(extendedState)) {
        return false;
      }
    }
    return true;
  }

  clone(): ForAll {
    return new ForAll(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.predicate.clone() as BoolExpression
    );
  }

  toString(): string {
    return `ForAll(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
  }
}

/**
 * Exists quantifier: ∃x ∈ objects. predicate(x)
 */
export class Exists extends BoolExpression {
  readonly type = 'Exists';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly predicate: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['predicate', this.predicate as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objectSet = this.objects.evaluate(state);
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      if (this.predicate.evaluate(extendedState)) {
        return true;
      }
    }
    return false;
  }

  clone(): Exists {
    return new Exists(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.predicate.clone() as BoolExpression
    );
  }

  toString(): string {
    return `Exists(${this.variable.name} ∈ ${this.objects}. ${this.predicate})`;
  }
}

/**
 * SumOver aggregator: Σx ∈ objects. scalar_expr(x)
 */
export class SumOver extends ScalarExpression {
  readonly type = 'SumOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    let sum = 0;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      sum += this.expression.evaluate(extendedState);
    }
    return sum;
  }

  clone(): SumOver {
    return new SumOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `SumOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MeanOver aggregator: mean of scalar_expr over objects
 */
export class MeanOver extends ScalarExpression {
  readonly type = 'MeanOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return 0;
    }
    
    let sum = 0;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      sum += this.expression.evaluate(extendedState);
    }
    return sum / objectSet.size;
  }

  clone(): MeanOver {
    return new MeanOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MeanOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MaxOver aggregator: max of scalar_expr over objects
 */
export class MaxOver extends ScalarExpression {
  readonly type = 'MaxOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return -Infinity;
    }
    
    let maxVal = -Infinity;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      const val = this.expression.evaluate(extendedState);
      if (val > maxVal) {
        maxVal = val;
      }
    }
    return maxVal;
  }

  clone(): MaxOver {
    return new MaxOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MaxOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * MinOver aggregator: min of scalar_expr over objects
 */
export class MinOver extends ScalarExpression {
  readonly type = 'MinOver';
  constructor(
    public readonly variable: Variable,
    public readonly objects: ObjectSetExpression,
    public readonly expression: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node],
      ['expression', this.expression as Node]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objectSet = this.objects.evaluate(state);
    if (objectSet.size === 0) {
      return Infinity;
    }
    
    let minVal = Infinity;
    for (const obj of objectSet) {
      const extendedState = new Map(state);
      extendedState.set(this.variable, obj);
      const val = this.expression.evaluate(extendedState);
      if (val < minVal) {
        minVal = val;
      }
    }
    return minVal;
  }

  clone(): MinOver {
    return new MinOver(
      this.variable.clone(),
      this.objects.clone() as ObjectSetExpression,
      this.expression.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `MinOver(${this.variable.name} ∈ ${this.objects}. ${this.expression})`;
  }
}

/**
 * Count expression: |objects|
 */
export class CountExpression extends ScalarExpression {
  readonly type = 'CountExpression';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return this.objects.evaluate(state).size;
  }

  clone(): CountExpression {
    return new CountExpression(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Count(${this.objects})`;
  }
}

// ============================================================================
// New Set Reasoning Expressions - Ported from Infinigen constraint_language
// ============================================================================

/**
 * Scene expression: returns the set of all active object names in the state.
 *
 * Ported from the original Infinigen's scene() DSL function.
 * Unlike the basic SceneExpression in constants.ts which looks for '__scene__'
 * in the state, this version properly queries the solver State object for
 * all active objects.
 *
 * evaluate(state) returns the set of all active object names from the state.
 * domain() returns an empty ObjectSetDomain (everything is possible).
 * getVariables() returns empty set.
 */
export class SceneSetExpression extends ObjectSetExpression {
  readonly type = 'SceneSetExpression';

  children(): Map<string, Node> {
    return new Map();
  }

  domain(): ObjectSetDomain {
    // Empty domain = everything is possible (no restrictions)
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    // Try to get active object names from the solver State
    const stateAny = state as Map<any, any>;
    const solverState = stateAny.get('__solverState');

    if (solverState && typeof solverState === 'object' && 'getActiveObjectNames' in (solverState as object)) {
      const activeNames = (solverState as any).getActiveObjectNames();
      if (Array.isArray(activeNames)) {
        return new Set(activeNames);
      }
    }

    // Fallback: look for '__scene__' key in state
    const sceneObjs = stateAny.get('__scene__');
    if (sceneObjs instanceof Set) {
      return sceneObjs;
    }

    // Fallback: look for objects Map in solverState
    if (solverState && typeof solverState === 'object' && 'objects' in (solverState as object)) {
      const objects = (solverState as any).objects;
      if (objects instanceof Map) {
        const activeNames = new Set<string>();
        for (const [name, obj] of objects.entries()) {
          if (obj && (obj.active === undefined || obj.active === true)) {
            activeNames.add(name);
          }
        }
        return activeNames;
      }
    }

    return new Set();
  }

  getVariables(): Set<Variable> {
    return new Set();
  }

  clone(): SceneSetExpression {
    return new SceneSetExpression();
  }

  toString(): string {
    return 'scene()';
  }
}

/**
 * RelatedTo expression: filters a child object set to only those objects
 * that have a given relation to any object in a parent object set.
 *
 * Ported from the original Infinigen's related_to() DSL function.
 * This requires looking at the State's ObjectState.relations array.
 *
 * Example: related_to(chairs, tables, 'supported_by')
 *   → returns only chairs that are supported_by some table
 */
export class RelatedToExpression extends ObjectSetExpression {
  readonly type = 'RelatedToExpression';

  constructor(
    public readonly childSet: ObjectSetExpression,
    public readonly parentSet: ObjectSetExpression,
    public readonly relation: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['childSet', this.childSet as Node],
      ['parentSet', this.parentSet as Node],
      ['relation', this.relation as Node]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const childIds = this.childSet.evaluate(state);
    const parentIds = this.parentSet.evaluate(state);
    const stateAny = state as Map<any, any>;
    const solverState = stateAny.get('__solverState');

    if (!solverState || typeof solverState !== 'object' || !('objects' in (solverState as object))) {
      // No solver state available — return empty set (can't determine relations)
      return new Set();
    }

    const result = new Set<string>();
    const relationTypeName = this.relation.constructor.name;

    for (const childId of childIds) {
      const childObj = (solverState as any).objects.get(childId);
      if (!childObj || !childObj.relations) continue;

      // Check if this child has a relation of the given type to any parent
      for (const rel of childObj.relations) {
        const relTypeName = rel.relation?.constructor?.name;
        if (relTypeName === relationTypeName && parentIds.has(rel.targetName)) {
          result.add(childId);
          break;
        }
      }
    }

    return result;
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.childSet.getVariables()) vars.add(v);
    for (const v of this.parentSet.getVariables()) vars.add(v);
    return vars;
  }

  clone(): RelatedToExpression {
    return new RelatedToExpression(
      this.childSet.clone() as ObjectSetExpression,
      this.parentSet.clone() as ObjectSetExpression,
      this.relation.clone() as Relation
    );
  }

  toString(): string {
    return `related_to(${this.childSet}, ${this.parentSet}, ${this.relation})`;
  }
}

/**
 * Tagged expression: filters an object set to only those objects matching
 * ALL required tags.
 *
 * Ported from the original Infinigen's tagged() / [] operator DSL function.
 * Unlike the basic TaggedExpression in constants.ts which doesn't actually
 * filter by tags in evaluate(), this version properly looks up object tags
 * from the state and filters accordingly.
 *
 * evaluate(state) returns objects that have ALL the required tags.
 */
export class TaggedSetExpression extends ObjectSetExpression {
  readonly type = 'TaggedSetExpression';

  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly tags: Set<string>
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const allObjects = this.objects.evaluate(state);

    if (this.tags.size === 0) {
      return allObjects;
    }

    const stateAny = state as Map<any, any>;
    const tagRegistry = stateAny.get('__tagRegistry');
    const solverState = stateAny.get('__solverState');

    const result = new Set<string>();

    for (const objId of allObjects) {
      let objectTagSet: UnifiedTagSet | null = null;

      if (tagRegistry && typeof tagRegistry === 'object' && 'getObjectTags' in (tagRegistry as object)) {
        objectTagSet = (tagRegistry as any).getObjectTags(objId);
      } else if (solverState && typeof solverState === 'object' && 'objects' in (solverState as object)) {
        const objState = (solverState as any).objects.get(objId);
        if (!objState) continue;
        objectTagSet = new UnifiedTagSet(
          objState.tags.toArray().map((t: any) => {
            const str = t.toString();
            const match = str.match(/^[A-Z][a-z]+\((.+)\)$/);
            const name = match ? match[1] : str;
            return new UnifiedTag(name);
          })
        );
      }

      if (!objectTagSet) {
        // No tag info available — skip (don't include by default)
        continue;
      }

      // Check that ALL required tags are present
      let allMatch = true;
      for (const requiredTag of this.tags) {
        if (!objectTagSet.contains(new UnifiedTag(requiredTag))) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        result.add(objId);
      }
    }

    return result;
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): TaggedSetExpression {
    return new TaggedSetExpression(
      this.objects.clone() as ObjectSetExpression,
      new Set(this.tags)
    );
  }

  toString(): string {
    return `tagged(${this.objects}, [${Array.from(this.tags).join(', ')}])`;
  }
}

/**
 * Excludes expression: filters an object set to EXCLUDE objects that have
 * ANY of the specified excluded tags.
 *
 * Ported from the original Infinigen's excludes() DSL function.
 * This is the complement of TaggedSetExpression — instead of requiring tags,
 * it removes objects with certain tags.
 *
 * evaluate(state) returns objects that do NOT have any of the excluded tags.
 */
export class ExcludesExpression extends ObjectSetExpression {
  readonly type = 'ExcludesExpression';

  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly excludedTags: Set<string>
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['objects', this.objects as Node]
    ]);
  }

  domain(): ObjectSetDomain {
    return new ObjectSetDomain();
  }

  evaluate(state: Map<Variable, any>): Set<string> {
    const allObjects = this.objects.evaluate(state);

    if (this.excludedTags.size === 0) {
      return allObjects;
    }

    const stateAny = state as Map<any, any>;
    const tagRegistry = stateAny.get('__tagRegistry');
    const solverState = stateAny.get('__solverState');

    const result = new Set<string>();

    for (const objId of allObjects) {
      let objectTagSet: UnifiedTagSet | null = null;

      if (tagRegistry && typeof tagRegistry === 'object' && 'getObjectTags' in (tagRegistry as object)) {
        objectTagSet = (tagRegistry as any).getObjectTags(objId);
      } else if (solverState && typeof solverState === 'object' && 'objects' in (solverState as object)) {
        const objState = (solverState as any).objects.get(objId);
        if (!objState) {
          // No state for this object — include by default
          result.add(objId);
          continue;
        }
        objectTagSet = new UnifiedTagSet(
          objState.tags.toArray().map((t: any) => {
            const str = t.toString();
            const match = str.match(/^[A-Z][a-z]+\((.+)\)$/);
            const name = match ? match[1] : str;
            return new UnifiedTag(name);
          })
        );
      }

      if (!objectTagSet) {
        // No tag info — include by default (can't exclude without tag data)
        result.add(objId);
        continue;
      }

      // Check that NONE of the excluded tags are present
      let hasExcluded = false;
      for (const excludedTag of this.excludedTags) {
        if (objectTagSet.contains(new UnifiedTag(excludedTag))) {
          hasExcluded = true;
          break;
        }
      }

      if (!hasExcluded) {
        result.add(objId);
      }
    }

    return result;
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): ExcludesExpression {
    return new ExcludesExpression(
      this.objects.clone() as ObjectSetExpression,
      new Set(this.excludedTags)
    );
  }

  toString(): string {
    return `excludes(${this.objects}, [${Array.from(this.excludedTags).join(', ')}])`;
  }
}
