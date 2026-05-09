/**
 * Expression System for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/expression.py
 */

import { Node, Variable, Domain, NumericDomain, BooleanDomain, ObjectSetDomain } from './types';

/**
 * Flexible state type for expression evaluation.
 *
 * Supports both Variable-keyed maps (legacy) and string-keyed maps (object set
 * and quantifier expressions need to set dynamic keys like 'scene', 'obj',
 * 'current_object').
 */
export type EvalState = Map<Variable | string, any>;

/**
 * Base class for all expressions
 */
export abstract class Expression extends Node {
  /**
   * Get the domain of this expression
   */
  abstract domain(): Domain;

  /**
   * Evaluate this expression given a state
   */
  abstract evaluate(state: EvalState): any;
}

/**
 * Scalar (numeric) expression base class
 */
export abstract class ScalarExpression extends Expression {
  domain(): Domain {
    return new NumericDomain();
  }

  /**
   * Addition: this + other
   */
  add(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'add', other);
  }

  /**
   * Subtraction: this - other
   */
  sub(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'sub', other);
  }

  /**
   * Multiplication: this * other
   */
  multiply(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'mul', other);
  }

  /**
   * Division: this / other
   */
  div(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'div', other);
  }

  /**
   * Modulo: this % other
   */
  mod(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'mod', other);
  }

  /**
   * Power: this ^ other
   */
  pow(other: ScalarExpression): ScalarOperatorExpression {
    return new ScalarOperatorExpression(this, 'pow', other);
  }

  /**
   * Negation: -this
   */
  negate(): ScalarNegateExpression {
    return new ScalarNegateExpression(this);
  }

  /**
   * Absolute value: |this|
   */
  abs(): ScalarAbsExpression {
    return new ScalarAbsExpression(this);
  }

  /**
   * Minimum: min(this, other)
   */
  min(other: ScalarExpression): ScalarMinExpression {
    return new ScalarMinExpression(this, other);
  }

  /**
   * Maximum: max(this, other)
   */
  max(other: ScalarExpression): ScalarMaxExpression {
    return new ScalarMaxExpression(this, other);
  }

  /**
   * Equality: this == other
   */
  equals(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'eq', other);
  }

  /**
   * Inequality: this != other
   */
  notEquals(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'neq', other);
  }

  /**
   * Less than: this < other
   */
  lessThan(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'lt', other);
  }

  /**
   * Less than or equal: this <= other
   */
  lessThanOrEqual(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'lte', other);
  }

  /**
   * Greater than: this > other
   */
  greaterThan(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'gt', other);
  }

  /**
   * Greater than or equal: this >= other
   */
  greaterThanOrEqual(other: ScalarExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'gte', other);
  }

  /**
   * Hinge loss: penalizes deviation of a value from a range [low, high].
   *
   * This is the primary mechanism for soft constraints in the original Infinigen.
   * The original Python implementation uses hinge(val, low, high) which returns:
   *   - 0 if val is in [low, high]
   *   - (low - val) if val < low  (penalty for being below range)
   *   - (val - high) if val > high (penalty for being above range)
   *
   * This is used pervasively for "prefer X between A and B" constraints:
   *   - distance between objects should be in [0.5, 2.0]
   *   - coverage ratio should be in [0.3, 1.0]
   *   - alignment offset should be in [-0.1, 0.1]
   *
   * Without hinge loss, the constraint system cannot naturally express
   * soft preference constraints and falls back to hard binary checks.
   */
  hinge(low: number | ScalarExpression, high: number | ScalarExpression): HingeLossExpression {
    const lowExpr = typeof low === 'number' ? new ScalarConstant(low) : low;
    const highExpr = typeof high === 'number' ? new ScalarConstant(high) : high;
    return new HingeLossExpression(this, lowExpr, highExpr);
  }

  /**
   * Safe division: division that returns fallback when divisor is zero
   */
  safeDiv(other: ScalarExpression, fallback: number = 0): ScalarIfElse {
    return new ScalarIfElse(
      this.equals(other).not(),  // if divisor != 0
      this.div(other),            // then: this / other
      new ScalarConstant(fallback) // else: fallback
    );
  }

  /**
   * Clip/clamp: constrain value to [min, max] range
   */
  clip(minVal: number | ScalarExpression, maxVal: number | ScalarExpression): ScalarExpression {
    const minExpr = typeof minVal === 'number' ? new ScalarConstant(minVal) : minVal;
    const maxExpr = typeof maxVal === 'number' ? new ScalarConstant(maxVal) : maxVal;
    return this.max(minExpr).min(maxExpr);
  }
}

/**
 * Boolean expression base class
 */
export abstract class BoolExpression extends Expression {
  domain(): Domain {
    return new BooleanDomain();
  }

  /**
   * Logical AND: this && other
   */
  and(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'and', other);
  }

  /**
   * Logical OR: this || other
   */
  or(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'or', other);
  }

  /**
   * Logical XOR: this XOR other
   */
  xor(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'xor', other);
  }

  /**
   * Logical NOT: !this
   */
  not(): BoolNotExpression {
    return new BoolNotExpression(this);
  }

  /**
   * Implication: this => other
   */
  implies(other: BoolExpression): BoolOperatorExpression {
    return new BoolOperatorExpression(this, 'implies', other);
  }
}

/**
 * Hinge Loss Expression
 *
 * The most critical missing expression for constraint-based scene composition.
 * Implements hinge(val, low, high) which penalizes deviation from a preferred range.
 *
 * Mathematical definition:
 *   hinge(val, low, high) = max(0, low - val) + max(0, val - high)
 *
 * This produces:
 *   - 0 when val is in [low, high] (satisfied, no penalty)
 *   - (low - val) when val < low (below range, linear penalty)
 *   - (val - high) when val > high (above range, linear penalty)
 *
 * This matches the original Infinigen's hinge loss behavior and enables
 * soft constraint expressions like "prefer distance between 0.5 and 2.0"
 * which are fundamental to scene composition.
 */
export class HingeLossExpression extends ScalarExpression {
  readonly type = 'HingeLossExpression';

  constructor(
    public readonly value: ScalarExpression,
    public readonly low: ScalarExpression,
    public readonly high: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['value', this.value],
      ['low', this.low],
      ['high', this.high]
    ]);
  }

  evaluate(state: EvalState): number {
    const val = this.value.evaluate(state);
    const low = this.low.evaluate(state);
    const high = this.high.evaluate(state);

    // hinge(val, low, high) = max(0, low - val) + max(0, val - high)
    const lowPenalty = Math.max(0, low - val);  // Penalty for being below range
    const highPenalty = Math.max(0, val - high); // Penalty for being above range
    return lowPenalty + highPenalty;
  }

  clone(): HingeLossExpression {
    return new HingeLossExpression(
      this.value.clone() as ScalarExpression,
      this.low.clone() as ScalarExpression,
      this.high.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `hinge(${this.value}, ${this.low}, ${this.high})`;
  }
}

/**
 * Constant scalar value
 */
export class ScalarConstant extends ScalarExpression {
  readonly type = 'ScalarConstant';
  constructor(public readonly value: number) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): number {
    return this.value;
  }

  clone(): ScalarConstant {
    return new ScalarConstant(this.value);
  }

  toString(): string {
    return `${this.value}`;
  }
}

/**
 * Constant boolean value
 */
export class BoolConstant extends BoolExpression {
  readonly type = 'BoolConstant';
  constructor(public readonly value: boolean) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): boolean {
    return this.value;
  }

  clone(): BoolConstant {
    return new BoolConstant(this.value);
  }

  toString(): string {
    return `${this.value}`;
  }
}

/**
 * Variable reference as scalar expression
 */
export class ScalarVariable extends ScalarExpression {
  readonly type = 'ScalarVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): number {
    const value = state.get(this.variable);
    if (typeof value !== 'number') {
      throw new Error(`Expected numeric value for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value;
  }

  clone(): ScalarVariable {
    return new ScalarVariable(this.variable.clone());
  }

  toString(): string {
    return `ScalarVar(${this.variable.name})`;
  }
}

/**
 * Variable reference as boolean expression
 */
export class BoolVariable extends BoolExpression {
  readonly type = 'BoolVariable';
  constructor(public readonly variable: Variable) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): boolean {
    const value = state.get(this.variable);
    if (typeof value !== 'boolean') {
      throw new Error(`Expected boolean value for variable ${this.variable.name}, got ${typeof value}`);
    }
    return value;
  }

  clone(): BoolVariable {
    return new BoolVariable(this.variable.clone());
  }

  toString(): string {
    return `BoolVar(${this.variable.name})`;
  }
}

/**
 * Binary operator for scalar expressions
 */
export type ScalarOperator = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow' | 'min' | 'max';

/**
 * Binary operator for boolean expressions
 */
export type BoolOperator = 'and' | 'or' | 'xor' | 'implies' | 'eq' | 'neq' | 'ne' | 'lt' | 'lte' | 'le' | 'gt' | 'gte' | 'ge' | 'not';

/**
 * Binary scalar operator expression
 */
export class ScalarOperatorExpression extends ScalarExpression {
  readonly type = 'ScalarOperatorExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly operator: ScalarOperator,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  /** Alias for operator - used by reasoning modules */
  get func(): ScalarOperator {
    return this.operator;
  }

  /** Alias for operands as array - used by reasoning modules */
  get operands(): ScalarExpression[] {
    return [this.left, this.right];
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: EvalState): number {
    const leftVal = this.left.evaluate(state);
    const rightVal = this.right.evaluate(state);

    switch (this.operator) {
      case 'add': return leftVal + rightVal;
      case 'sub': return leftVal - rightVal;
      case 'mul': return leftVal * rightVal;
      case 'div': return leftVal / rightVal;
      case 'mod': return leftVal % rightVal;
      case 'pow': return Math.pow(leftVal, rightVal);
      default: throw new Error(`Unknown scalar operator: ${this.operator}`);
    }
  }

  clone(): ScalarOperatorExpression {
    return new ScalarOperatorExpression(
      this.left.clone() as ScalarExpression,
      this.operator,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    const opMap: Record<ScalarOperator, string> = {
      add: '+', sub: '-', mul: '*', div: '/', mod: '%', pow: '^', min: 'min', max: 'max'
    };
    return `(${this.left} ${opMap[this.operator]} ${this.right})`;
  }
}

/**
 * Binary boolean operator expression
 */
export class BoolOperatorExpression extends BoolExpression {
  readonly type = 'BoolOperatorExpression';
  constructor(
    public readonly left: Expression,
    public readonly operator: BoolOperator,
    public readonly right?: Expression
  ) {
    super();
  }

  /** Alias for operator - used by reasoning modules */
  get func(): BoolOperator {
    return this.operator;
  }

  /** Operands as array - used by reasoning modules */
  get operands(): Expression[] {
    return this.right ? [this.left, this.right] : [this.left];
  }

  children(): Map<string, Node> {
    const children = new Map<string, Node>([['left', this.left]]);
    if (this.right) {
      children.set('right', this.right);
    }
    return children;
  }

  evaluate(state: EvalState): boolean {
    const leftVal = this.left.evaluate(state);

    if (!this.right) {
      // Unary operators
      if ((this.operator as string) === 'not') {
        return !leftVal;
      }
      throw new Error(`Binary operator ${this.operator} requires right operand`);
    }

    const rightVal = this.right.evaluate(state);

    switch (this.operator) {
      case 'and': return leftVal && rightVal;
      case 'or': return leftVal || rightVal;
      case 'xor': return leftVal !== rightVal;
      case 'implies': return !leftVal || rightVal;
      case 'eq': return leftVal === rightVal;
      case 'neq': return leftVal !== rightVal;
      case 'lt': return leftVal < rightVal;
      case 'lte': return leftVal <= rightVal;
      case 'gt': return leftVal > rightVal;
      case 'gte': return leftVal >= rightVal;
      default: throw new Error(`Unknown boolean operator: ${this.operator}`);
    }
  }

  clone(): BoolOperatorExpression {
    return new BoolOperatorExpression(
      this.left.clone() as Expression,
      this.operator,
      this.right?.clone() as Expression | undefined
    );
  }

  toString(): string {
    const opMap: Record<BoolOperator, string> = {
      and: '&&', or: '||', xor: '^', implies: '=>',
      eq: '==', neq: '!=', ne: '!=', lt: '<', lte: '<=', le: '<=', gt: '>', gte: '>=', ge: '>=', not: '!'
    };
    if (this.right) {
      return `(${this.left} ${opMap[this.operator]} ${this.right})`;
    }
    return `(${opMap[this.operator]}${this.left})`;
  }
}

/**
 * Scalar negation expression
 */
export class ScalarNegateExpression extends ScalarExpression {
  readonly type = 'ScalarNegateExpression';
  constructor(public readonly operand: ScalarExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: EvalState): number {
    return -this.operand.evaluate(state);
  }

  clone(): ScalarNegateExpression {
    return new ScalarNegateExpression(this.operand.clone() as ScalarExpression);
  }

  toString(): string {
    return `(-${this.operand})`;
  }
}

/**
 * Absolute value expression
 */
export class ScalarAbsExpression extends ScalarExpression {
  readonly type = 'ScalarAbsExpression';
  constructor(public readonly operand: ScalarExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: EvalState): number {
    return Math.abs(this.operand.evaluate(state));
  }

  clone(): ScalarAbsExpression {
    return new ScalarAbsExpression(this.operand.clone() as ScalarExpression);
  }

  toString(): string {
    return `abs(${this.operand})`;
  }
}

/**
 * Minimum of two scalars
 */
export class ScalarMinExpression extends ScalarExpression {
  readonly type = 'ScalarMinExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: EvalState): number {
    return Math.min(this.left.evaluate(state), this.right.evaluate(state));
  }

  clone(): ScalarMinExpression {
    return new ScalarMinExpression(
      this.left.clone() as ScalarExpression,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `min(${this.left}, ${this.right})`;
  }
}

/**
 * Maximum of two scalars
 */
export class ScalarMaxExpression extends ScalarExpression {
  readonly type = 'ScalarMaxExpression';
  constructor(
    public readonly left: ScalarExpression,
    public readonly right: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['left', this.left],
      ['right', this.right]
    ]);
  }

  evaluate(state: EvalState): number {
    return Math.max(this.left.evaluate(state), this.right.evaluate(state));
  }

  clone(): ScalarMaxExpression {
    return new ScalarMaxExpression(
      this.left.clone() as ScalarExpression,
      this.right.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `max(${this.left}, ${this.right})`;
  }
}

/**
 * Boolean NOT expression
 */
export class BoolNotExpression extends BoolExpression {
  readonly type = 'BoolNotExpression';
  constructor(public readonly operand: BoolExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['operand', this.operand]]);
  }

  evaluate(state: EvalState): boolean {
    return !this.operand.evaluate(state);
  }

  clone(): BoolNotExpression {
    return new BoolNotExpression(this.operand.clone() as BoolExpression);
  }

  toString(): string {
    return `(!${this.operand})`;
  }
}

/**
 * If-then-else expression for scalars
 */
export class ScalarIfElse extends ScalarExpression {
  readonly type = 'ScalarIfElse';
  constructor(
    public readonly condition: BoolExpression,
    public readonly thenExpr: ScalarExpression,
    public readonly elseExpr: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['condition', this.condition as Node],
      ['then', this.thenExpr as Node],
      ['else', this.elseExpr as Node]
    ]);
  }

  evaluate(state: EvalState): number {
    return this.condition.evaluate(state)
      ? this.thenExpr.evaluate(state)
      : this.elseExpr.evaluate(state);
  }

  clone(): ScalarIfElse {
    return new ScalarIfElse(
      this.condition.clone() as BoolExpression,
      this.thenExpr.clone() as ScalarExpression,
      this.elseExpr.clone() as ScalarExpression
    );
  }

  toString(): string {
    return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
  }
}

/**
 * If-then-else expression for booleans
 */
export class BoolIfElse extends BoolExpression {
  readonly type = 'BoolIfElse';
  constructor(
    public readonly condition: BoolExpression,
    public readonly thenExpr: BoolExpression,
    public readonly elseExpr: BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['condition', this.condition],
      ['then', this.thenExpr],
      ['else', this.elseExpr]
    ]);
  }

  evaluate(state: EvalState): boolean {
    return this.condition.evaluate(state)
      ? this.thenExpr.evaluate(state)
      : this.elseExpr.evaluate(state);
  }

  clone(): BoolIfElse {
    return new BoolIfElse(
      this.condition.clone() as BoolExpression,
      this.thenExpr.clone() as BoolExpression,
      this.elseExpr.clone() as BoolExpression
    );
  }

  toString(): string {
    return `if(${this.condition}, ${this.thenExpr}, ${this.elseExpr})`;
  }
}

/**
 * InRange expression: checks if a value falls within [low, high]
 *
 * Ported from the original Infinigen's constraint_bounding system.
 * Used to derive cardinality bounds and express soft range constraints.
 * When a mean is provided, it can be used for preferential optimization.
 *
 * evaluate(state) returns true iff value ∈ [low, high]
 */
export class InRangeExpression extends BoolExpression {
  readonly type = 'InRangeExpression';

  constructor(
    public readonly value: ScalarExpression,
    public readonly low: ScalarExpression,
    public readonly high: ScalarExpression,
    public readonly mean?: ScalarExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const children = new Map<string, Node>([
      ['value', this.value],
      ['low', this.low],
      ['high', this.high]
    ]);
    if (this.mean) {
      children.set('mean', this.mean);
    }
    return children;
  }

  evaluate(state: EvalState): boolean {
    const val = this.value.evaluate(state);
    const lo = this.low.evaluate(state);
    const hi = this.high.evaluate(state);
    return val >= lo && val <= hi;
  }

  clone(): InRangeExpression {
    return new InRangeExpression(
      this.value.clone() as ScalarExpression,
      this.low.clone() as ScalarExpression,
      this.high.clone() as ScalarExpression,
      this.mean?.clone() as ScalarExpression | undefined
    );
  }

  toString(): string {
    if (this.mean) {
      return `inRange(${this.value}, ${this.low}, ${this.high}, mean=${this.mean})`;
    }
    return `inRange(${this.value}, ${this.low}, ${this.high})`;
  }
}

// Re-export InRange from types for convenience
export type { InRange } from './types';

// Re-export Constant type alias for convenience
export type { Constant } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Object Set Expressions
// Ported from infinigen/core/constraints/constraint_language/object_set.py
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base class for expressions that evaluate to a set of scene objects.
 *
 * In the original Infinigen, object set expressions are central to the constraint
 * language. They allow constraints to quantify over collections of objects:
 *   - SceneSetExpression: all objects in the scene
 *   - TaggedSetExpression: objects matching a tag predicate
 *   - UnionObjects: union of two object sets
 *   - ExcludesObjects: set difference (objects in A but not in B)
 *
 * These are used with quantifiers like ForAll, Exists, SumOver, MeanOver.
 */
export abstract class ObjectSetExpression extends Expression {
  domain(): Domain {
    return new ObjectSetDomain();
  }

  /**
   * Union of this set with another set
   */
  union(other: ObjectSetExpression): UnionObjects {
    return new UnionObjects(this, other);
  }

  /**
   * Exclude objects in another set from this set
   */
  excludes(other: ObjectSetExpression): ExcludesObjects {
    return new ExcludesObjects(this, other);
  }

  /**
   * Intersection of this set with another set
   */
  intersect(other: ObjectSetExpression): IntersectionObjects {
    return new IntersectionObjects(this, other);
  }

  /**
   * Filter objects in this set by a boolean predicate
   */
  filter(predicate: (obj: any) => BoolExpression): FilteredSet {
    return new FilteredSet(this, predicate);
  }
}

/**
 * Represents all objects in the scene.
 *
 * In the original Infinigen, this is written as `scene()` in the constraint DSL.
 * It evaluates to the set of all objects currently in the scene graph.
 *
 * Example usage in constraints:
 *   ForAll(scene(), lambda obj: obj.accessibility > 0.5)
 */
export class SceneSetExpression extends ObjectSetExpression {
  readonly type = 'SceneSetExpression';

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): any[] {
    // Return all objects from the state's scene graph
    const scene = state.get('scene');
    if (Array.isArray(scene)) return scene;
    if (scene && typeof scene === 'object' && 'objects' in scene) return scene.objects;
    return [];
  }

  clone(): SceneSetExpression {
    return new SceneSetExpression();
  }

  toString(): string {
    return 'scene()';
  }
}

/**
 * Represents objects matching a specific tag or tag combination.
 *
 * In the original Infinigen, this is written as `tagged("furniture")` in the
 * constraint DSL. It evaluates to the set of all objects whose tags include
 * the specified tag expression.
 *
 * Supports:
 * - Single tag: tagged("chair")
 * - Tag union: tagged("chair", "table")
 * - Tag negation: tagged("furniture").excludes(tagged("bed"))
 *
 * Example usage in constraints:
 *   ForAll(tagged("furniture"), lambda obj: obj.in_room)
 */
export class TaggedSetExpression extends ObjectSetExpression {
  readonly type = 'TaggedSetExpression';

  constructor(
    public readonly tags: string[],
    public readonly matchMode: 'any' | 'all' | 'none' = 'any'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map();
  }

  evaluate(state: EvalState): any[] {
    const scene = state.get('scene');
    const objects: any[] = Array.isArray(scene)
      ? scene
      : (scene && typeof scene === 'object' && 'objects' in scene) ? scene.objects : [];

    return objects.filter((obj: any) => {
      const objTags: string[] = obj.tags ?? obj.tag ?? [];
      switch (this.matchMode) {
        case 'any': return this.tags.some(t => objTags.includes(t));
        case 'all': return this.tags.every(t => objTags.includes(t));
        case 'none': return !this.tags.some(t => objTags.includes(t));
        default: return false;
      }
    });
  }

  clone(): TaggedSetExpression {
    return new TaggedSetExpression([...this.tags], this.matchMode);
  }

  toString(): string {
    const tagStr = this.tags.map(t => `"${t}"`).join(', ');
    return `tagged(${tagStr}, mode="${this.matchMode}")`;
  }
}

/**
 * Union of two object sets.
 *
 * Returns all objects that are in either set A or set B.
 * In the original Infinigen DSL: `union_of(set_a, set_b)`
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

  evaluate(state: EvalState): any[] {
    const leftResult = this.left.evaluate(state);
    const rightResult = this.right.evaluate(state);
    // Union by ID to avoid duplicates
    const seen = new Set<string>();
    const result: any[] = [];
    for (const obj of [...leftResult, ...rightResult]) {
      const id = obj.id ?? obj.name ?? String(obj);
      if (!seen.has(id)) {
        seen.add(id);
        result.push(obj);
      }
    }
    return result;
  }

  clone(): UnionObjects {
    return new UnionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `union(${this.left}, ${this.right})`;
  }
}

/**
 * Set difference: objects in set A but not in set B.
 *
 * In the original Infinigen DSL: `excludes(set_a, set_b)` or `set_a - set_b`
 */
export class ExcludesObjects extends ObjectSetExpression {
  readonly type = 'ExcludesObjects';

  constructor(
    public readonly include: ObjectSetExpression,
    public readonly exclude: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['include', this.include],
      ['exclude', this.exclude]
    ]);
  }

  evaluate(state: EvalState): any[] {
    const includeResult = this.include.evaluate(state);
    const excludeResult = this.exclude.evaluate(state);
    const excludeIds = new Set(
      excludeResult.map((obj: any) => obj.id ?? obj.name ?? String(obj))
    );
    return includeResult.filter((obj: any) => {
      const id = obj.id ?? obj.name ?? String(obj);
      return !excludeIds.has(id);
    });
  }

  clone(): ExcludesObjects {
    return new ExcludesObjects(
      this.include.clone() as ObjectSetExpression,
      this.exclude.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `excludes(${this.include}, ${this.exclude})`;
  }
}

/**
 * Intersection of two object sets.
 *
 * Returns only objects that are in both set A and set B.
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

  evaluate(state: EvalState): any[] {
    const leftResult = this.left.evaluate(state);
    const rightResult = this.right.evaluate(state);
    const rightIds = new Set(
      rightResult.map((obj: any) => obj.id ?? obj.name ?? String(obj))
    );
    return leftResult.filter((obj: any) => {
      const id = obj.id ?? obj.name ?? String(obj);
      return rightIds.has(id);
    });
  }

  clone(): IntersectionObjects {
    return new IntersectionObjects(
      this.left.clone() as ObjectSetExpression,
      this.right.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `intersection(${this.left}, ${this.right})`;
  }
}

/**
 * Filtered set: objects from a source set that satisfy a boolean predicate.
 */
export class FilteredSet extends ObjectSetExpression {
  readonly type = 'FilteredSet';

  constructor(
    public readonly source: ObjectSetExpression,
    public readonly predicate: (obj: any) => BoolExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['source', this.source]]);
  }

  evaluate(state: EvalState): any[] {
    const sourceResult = this.source.evaluate(state);
    return sourceResult.filter((obj: any) => {
      const predicateExpr = this.predicate(obj);
      const objState = new Map(state);
      objState.set('current_object', obj);
      return predicateExpr.evaluate(objState);
    });
  }

  clone(): FilteredSet {
    return new FilteredSet(
      this.source.clone() as ObjectSetExpression,
      this.predicate
    );
  }

  toString(): string {
    return `filter(${this.source}, predicate)`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quantifier Expressions
// Ported from infinigen/core/constraints/constraint_language/quantifier.py
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SumOver: aggregates a scalar expression over all objects in a set.
 *
 * In the original Infinigen, this is written as:
 *   SumOver(object_set, lambda obj: expression(obj))
 *
 * It evaluates to the sum of applying a scalar expression to each object
 * in the object set. This is essential for constraints like:
 *   - "Total weight of all furniture should be less than 100"
 *   - "Sum of areas covered by rugs should be at least 5m²"
 *
 * Mathematical definition:
 *   SumOver(S, f) = Σ_{x ∈ S} f(x)
 */
export class SumOver extends ScalarExpression {
  readonly type = 'SumOver';

  constructor(
    public readonly objectSet: ObjectSetExpression,
    public readonly body: (obj: any) => ScalarExpression,
    public readonly boundVarName: string = 'obj'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objectSet', this.objectSet]]);
  }

  evaluate(state: EvalState): number {
    const objects = this.objectSet.evaluate(state);
    let total = 0;

    for (const obj of objects) {
      const bodyExpr = this.body(obj);
      const objState = new Map(state);
      objState.set(this.boundVarName, obj);
      objState.set('current_object', obj);
      total += bodyExpr.evaluate(objState);
    }

    return total;
  }

  clone(): SumOver {
    return new SumOver(
      this.objectSet.clone() as ObjectSetExpression,
      this.body,
      this.boundVarName
    );
  }

  toString(): string {
    return `SumOver(${this.objectSet}, ${this.boundVarName} => ...)`;
  }
}

/**
 * MeanOver: computes the mean of a scalar expression over all objects in a set.
 *
 * In the original Infinigen, this is written as:
 *   MeanOver(object_set, lambda obj: expression(obj))
 *
 * It evaluates to the average value of applying a scalar expression to each
 * object in the object set. Essential for constraints like:
 *   - "Average distance between chairs should be around 1m"
 *   - "Mean coverage of surfaces by objects should be between 30-60%"
 *
 * Mathematical definition:
 *   MeanOver(S, f) = (1/|S|) * Σ_{x ∈ S} f(x)
 *
 * Returns 0 if the set is empty.
 */
export class MeanOver extends ScalarExpression {
  readonly type = 'MeanOver';

  constructor(
    public readonly objectSet: ObjectSetExpression,
    public readonly body: (obj: any) => ScalarExpression,
    public readonly boundVarName: string = 'obj'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objectSet', this.objectSet]]);
  }

  evaluate(state: EvalState): number {
    const objects = this.objectSet.evaluate(state);

    if (objects.length === 0) return 0;

    let total = 0;
    for (const obj of objects) {
      const bodyExpr = this.body(obj);
      const objState = new Map(state);
      objState.set(this.boundVarName, obj);
      objState.set('current_object', obj);
      total += bodyExpr.evaluate(objState);
    }

    return total / objects.length;
  }

  clone(): MeanOver {
    return new MeanOver(
      this.objectSet.clone() as ObjectSetExpression,
      this.body,
      this.boundVarName
    );
  }

  toString(): string {
    return `MeanOver(${this.objectSet}, ${this.boundVarName} => ...)`;
  }
}

/**
 * MaxOver: finds the maximum value of a scalar expression over all objects in a set.
 *
 * Mathematical definition:
 *   MaxOver(S, f) = max_{x ∈ S} f(x)
 */
export class MaxOver extends ScalarExpression {
  readonly type = 'MaxOver';

  constructor(
    public readonly objectSet: ObjectSetExpression,
    public readonly body: (obj: any) => ScalarExpression,
    public readonly boundVarName: string = 'obj'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objectSet', this.objectSet]]);
  }

  evaluate(state: EvalState): number {
    const objects = this.objectSet.evaluate(state);
    if (objects.length === 0) return -Infinity;

    let maxVal = -Infinity;
    for (const obj of objects) {
      const bodyExpr = this.body(obj);
      const objState = new Map(state);
      objState.set(this.boundVarName, obj);
      objState.set('current_object', obj);
      maxVal = Math.max(maxVal, bodyExpr.evaluate(objState));
    }

    return maxVal;
  }

  clone(): MaxOver {
    return new MaxOver(
      this.objectSet.clone() as ObjectSetExpression,
      this.body,
      this.boundVarName
    );
  }

  toString(): string {
    return `MaxOver(${this.objectSet}, ${this.boundVarName} => ...)`;
  }
}

/**
 * MinOver: finds the minimum value of a scalar expression over all objects in a set.
 *
 * Mathematical definition:
 *   MinOver(S, f) = min_{x ∈ S} f(x)
 */
export class MinOver extends ScalarExpression {
  readonly type = 'MinOver';

  constructor(
    public readonly objectSet: ObjectSetExpression,
    public readonly body: (obj: any) => ScalarExpression,
    public readonly boundVarName: string = 'obj'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objectSet', this.objectSet]]);
  }

  evaluate(state: EvalState): number {
    const objects = this.objectSet.evaluate(state);
    if (objects.length === 0) return Infinity;

    let minVal = Infinity;
    for (const obj of objects) {
      const bodyExpr = this.body(obj);
      const objState = new Map(state);
      objState.set(this.boundVarName, obj);
      objState.set('current_object', obj);
      minVal = Math.min(minVal, bodyExpr.evaluate(objState));
    }

    return minVal;
  }

  clone(): MinOver {
    return new MinOver(
      this.objectSet.clone() as ObjectSetExpression,
      this.body,
      this.boundVarName
    );
  }

  toString(): string {
    return `MinOver(${this.objectSet}, ${this.boundVarName} => ...)`;
  }
}
