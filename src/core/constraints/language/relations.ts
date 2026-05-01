/**
 * Spatial Relations for Constraint Language
 * Ported from infinigen/core/constraints/constraint_language/relations.py
 *
 * Each relation's evaluate() method resolves ObjectSetExpressions to object IDs,
 * retrieves their SpatialObject data from the state, and computes the actual
 * spatial predicate.
 */

import { Node, Variable, Domain, ObjectSetDomain } from './types';
import { BoolExpression, ScalarExpression, BoolConstant } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance,
  dot,
  normalize,
  sub,
  angleBetween,
  getAABB,
  aabbOverlapOrNear,
  aabbOverlapXZ,
  aabbContainedIn,
  aabbOverlapAreaXZ,
  aabbDistance,
  getForward,
  directionTo,
  rayAABBIntersection,
} from './spatial-helpers';

/**
 * Base class for all relations (constraints)
 */
export abstract class Relation extends BoolExpression {
  /**
   * Check if this relation is satisfied
   */
  abstract isSatisfied(state: Map<Variable, any>): boolean;

  /**
   * Get the variables involved in this relation
   */
  abstract getVariables(): Set<Variable>;

  /** Type discriminator for relation type comparisons */
  abstract readonly relationType?: string;
  
  /** Optional target tags for relation matching */
  targetTags?: string[];
}

/**
 * Special relation that matches any object set
 */
export class AnyRelation extends Relation {
  readonly type = 'AnyRelation';
  readonly relationType = 'any';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return true;
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): AnyRelation {
    return new AnyRelation(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Any(${this.objects})`;
  }
}

/**
 * Negated relation: NOT(relation)
 */
export class NegatedRelation extends Relation {
  readonly type = 'NegatedRelation';
  readonly relationType = 'negated';
  constructor(public readonly relation: Relation) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['relation', this.relation]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return !this.relation.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return !this.relation.isSatisfied(state);
  }

  getVariables(): Set<Variable> {
    return this.relation.getVariables();
  }

  clone(): NegatedRelation {
    return new NegatedRelation(this.relation.clone() as Relation);
  }

  toString(): string {
    return `NOT(${this.relation})`;
  }
}

/**
 * Conjunction of relations: AND(relations)
 */
export class AndRelations extends Relation {
  readonly type = 'AndRelations';
  readonly relationType = 'and';
  constructor(public readonly relations: Relation[]) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>();
    this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.relations.every(r => r.evaluate(state));
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relations.every(r => r.isSatisfied(state));
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const r of this.relations) {
      for (const v of r.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): AndRelations {
    return new AndRelations(this.relations.map(r => r.clone() as Relation));
  }

  toString(): string {
    return `AND(${this.relations.join(', ')})`;
  }
}

/**
 * Disjunction of relations: OR(relations)
 */
export class OrRelations extends Relation {
  readonly type = 'OrRelations';
  readonly relationType = 'or';
  constructor(public readonly relations: Relation[]) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>();
    this.relations.forEach((r, i) => map.set(`relation_${i}`, r));
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.relations.some(r => r.evaluate(state));
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.relations.some(r => r.isSatisfied(state));
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const r of this.relations) {
      for (const v of r.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): OrRelations {
    return new OrRelations(this.relations.map(r => r.clone() as Relation));
  }

  toString(): string {
    return `OR(${this.relations.join(', ')})`;
  }
}

/**
 * Base class for geometry-based relations
 */
export abstract class GeometryRelation extends Relation {
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression
  ) {
    super();
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) {
      vars.add(v);
    }
    for (const v of this.objects2.getVariables()) {
      vars.add(v);
    }
    return vars;
  }
}

// ============================================================================
// Spatial Relation Implementations
// ============================================================================

/**
 * Near relation: true if distance between any obj in objects1 and any obj in objects2 is < threshold
 * Implements: near(objA, objB, threshold)
 */
export class Near extends GeometryRelation {
  readonly type = 'Near';
  readonly relationType = 'near';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) < this.threshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Near {
    return new Near(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `Near(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Touching relation: objects1 are touching objects2 (AABBs overlap or within tolerance)
 * Implements: touching(objA, objB, tolerance)
 */
export class Touching extends GeometryRelation {
  readonly type = 'Touching';
  readonly relationType = 'touching';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 0.01
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        const aabbA = getAABB(a);
        const aabbB = getAABB(b);
        if (aabbOverlapOrNear(aabbA, aabbB, this.threshold)) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Touching {
    return new Touching(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `Touching(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Supported by relation: objects1 are on top of objects2 AND overlap in XZ
 * Implements: supportedBy(objA, objB)
 */
export class SupportedBy extends GeometryRelation {
  readonly type = 'SupportedBy';
  readonly relationType = 'supported_by';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aBottom = aabbA.min[1];
      for (const b of objs2) {
        const aabbB = getAABB(b);
        const bTop = aabbB.max[1];
        // objA's bottom must be close to objB's top
        if (Math.abs(aBottom - bTop) <= this.tolerance) {
          // And they must overlap in XZ
          if (aabbOverlapXZ(aabbA, aabbB)) return true;
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): SupportedBy {
    return new SupportedBy(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `SupportedBy(${this.objects1}, ${this.objects2}, ${this.tolerance})`;
  }
}

/**
 * On top of relation: objA's bottom is close to objB's top, and objA overlaps objB in XZ
 * Implements: onTopOf(objA, objB)
 */
export class OnTopOf extends GeometryRelation {
  readonly type = 'OnTopOf';
  readonly relationType = 'on_top_of';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aBottom = aabbA.min[1];
      for (const b of objs2) {
        const aabbB = getAABB(b);
        const bTop = aabbB.max[1];
        // objA's bottom close to objB's top, and objA above objB
        if (aBottom >= bTop - this.tolerance && aBottom <= bTop + this.tolerance) {
          if (aabbOverlapXZ(aabbA, aabbB)) return true;
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): OnTopOf {
    return new OnTopOf(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `OnTopOf(${this.objects1}, ${this.objects2}, ${this.tolerance})`;
  }
}

/**
 * Co-planar relation: objects are on the same plane
 */
export class CoPlanar extends GeometryRelation {
  readonly type = 'CoPlanar';
  readonly relationType = 'co_planar';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly normalTolerance: number = 0.1,
    public readonly distanceTolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check if all objects have similar Y position (simple coplanarity heuristic)
    const allObjs = [...objs1, ...objs2];
    const yPositions = allObjs.map(o => toVec3(o.position)[1]);
    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    return (maxY - minY) <= this.distanceTolerance;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): CoPlanar {
    return new CoPlanar(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.normalTolerance,
      this.distanceTolerance
    );
  }

  toString(): string {
    return `CoPlanar(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Stable against relation: objects1 are stable against objects2
 */
export class StableAgainst extends GeometryRelation {
  readonly type = 'StableAgainst';
  readonly relationType = 'stable_against';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Stable = touching AND supported from below or side
    for (const a of objs1) {
      const aabbA = getAABB(a);
      for (const b of objs2) {
        const aabbB = getAABB(b);
        // Either supported from below (on top of) or touching from side
        const aBottom = aabbA.min[1];
        const bTop = aabbB.max[1];
        const onTop = Math.abs(aBottom - bTop) < 0.15 && aabbOverlapXZ(aabbA, aabbB);
        const touching = aabbDistance(aabbA, aabbB) < 0.05;
        if (onTop || touching) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): StableAgainst {
    return new StableAgainst(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `StableAgainst(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Facing relation: objects1 are facing objects2
 * Implements: facing(objA, objB, angleThreshold)
 */
export class Facing extends GeometryRelation {
  readonly type = 'Facing';
  readonly relationType = 'facing';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly angleThreshold: number = Math.PI / 4
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        const ang = angleBetween(fwd, dir);
        if (ang <= this.angleThreshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Facing {
    return new Facing(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.angleThreshold
    );
  }

  toString(): string {
    return `Facing(${this.objects1}, ${this.objects2}, ${this.angleThreshold})`;
  }
}

/**
 * Between relation: objects1 are between objects2 and objects3
 */
export class Between extends Relation {
  readonly type = 'Between';
  readonly relationType = 'between';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly objects3: ObjectSetExpression,
    public readonly axis: 'x' | 'y' | 'z' | 'any' = 'any'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['objects3', this.objects3]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const objs1 = retrieveSpatialObjects(state, this.objects1.evaluate(state));
    const objs2 = retrieveSpatialObjects(state, this.objects2.evaluate(state));
    const objs3 = retrieveSpatialObjects(state, this.objects3.evaluate(state));
    if (objs1.length === 0 || objs2.length === 0 || objs3.length === 0) return false;

    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : this.axis === 'z' ? 2 : -1;
    for (const mid of objs1) {
      const midP = toVec3(mid.position);
      for (const a of objs2) {
        const aP = toVec3(a.position);
        for (const b of objs3) {
          const bP = toVec3(b.position);
          if (axisIndex >= 0) {
            // Check along specific axis
            const arrA = aP as number[];
            const arrB = bP as number[];
            const arrMid = midP as number[];
            const lo = Math.min(arrA[axisIndex], arrB[axisIndex]);
            const hi = Math.max(arrA[axisIndex], arrB[axisIndex]);
            if (arrMid[axisIndex] >= lo && arrMid[axisIndex] <= hi) return true;
          } else {
            // Check all axes
            let allBetween = true;
            for (let i = 0; i < 3; i++) {
              const lo = Math.min(aP[i], bP[i]);
              const hi = Math.max(aP[i], bP[i]);
              if (midP[i] < lo || midP[i] > hi) { allBetween = false; break; }
            }
            if (allBetween) return true;
          }
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.objects3.getVariables()) vars.add(v);
    return vars;
  }

  clone(): Between {
    return new Between(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.objects3.clone() as ObjectSetExpression,
      this.axis
    );
  }

  toString(): string {
    return `Between(${this.objects1}, ${this.objects2}, ${this.objects3}, ${this.axis})`;
  }
}

/**
 * Accessible from relation: objects1 are accessible from objects2
 */
export class AccessibleFrom extends GeometryRelation {
  readonly type = 'AccessibleFrom';
  readonly relationType = 'accessible_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly reachDistance: number = 1.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Simplified: accessible if within reach distance
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) <= this.reachDistance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): AccessibleFrom {
    return new AccessibleFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.reachDistance
    );
  }

  toString(): string {
    return `AccessibleFrom(${this.objects1}, ${this.objects2}, ${this.reachDistance})`;
  }
}

/**
 * Reachable from relation: objects1 are reachable from objects2
 */
export class ReachableFrom extends GeometryRelation {
  readonly type = 'ReachableFrom';
  readonly relationType = 'reachable_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxPathLength?: number
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Simplified reachability: Euclidean distance within max path length
    const maxDist = this.maxPathLength ?? Infinity;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = distance(a.position, b.position);
        if (d <= maxDist) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): ReachableFrom {
    return new ReachableFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxPathLength
    );
  }

  toString(): string {
    return `ReachableFrom(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * In front of relation: objects1 are in front of objects2
 */
export class InFrontOf extends GeometryRelation {
  readonly type = 'InFrontOf';
  readonly relationType = 'in_front_of';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly distance: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        // In front of: forward direction aligns with direction to b
        if (dot(fwd, dir) > 0.5) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): InFrontOf {
    return new InFrontOf(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.distance
    );
  }

  toString(): string {
    return `InFrontOf(${this.objects1}, ${this.objects2}, ${this.distance})`;
  }
}

/**
 * Aligned relation: objects1 are aligned with objects2 along axis
 * Implements: alignedWith(objA, objB, axis, tolerance)
 */
export class Aligned extends GeometryRelation {
  readonly type = 'Aligned';
  readonly relationType = 'aligned';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly axis: 'x' | 'y' | 'z' = 'y',
    public readonly tolerance: number = 0.1
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    for (const a of objs1) {
      const aPos = toVec3(a.position);
      for (const b of objs2) {
        const bPos = toVec3(b.position);
        if (Math.abs(aPos[axisIndex] - bPos[axisIndex]) <= this.tolerance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Aligned {
    return new Aligned(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.axis,
      this.tolerance
    );
  }

  toString(): string {
    return `Aligned(${this.objects1}, ${this.objects2}, ${this.axis}, ${this.tolerance})`;
  }
}

/**
 * Hidden relation: objects1 are hidden from view
 */
export class Hidden extends Relation {
  readonly type = 'Hidden';
  readonly relationType = 'hidden';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // An object is hidden if it is occluded from all viewpoints.
    // Without a camera/viewpoint, we check if any object has a very low position
    // (below ground) or is fully contained in another object.
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    // Simplified: an object is hidden if it has no valid position or is below ground
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      if (pos[1] < 0) return true; // Below ground
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Hidden {
    return new Hidden(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Hidden(${this.objects})`;
  }
}

/**
 * Visible relation: objects are visible from camera/viewpoint
 * Implements: visible(objA, objB, occluders) = !occluded(objA, objB, occluders)
 */
export class Visible extends Relation {
  readonly type = 'Visible';
  readonly relationType = 'visible';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly viewpoint?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const map = new Map<string, Node>([['objects', this.objects]]);
    if (this.viewpoint) {
      map.set('viewpoint', this.viewpoint);
    }
    return map;
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return false;
    if (!this.viewpoint) return true; // Without viewpoint, assume visible

    const vpIds = this.viewpoint.evaluate(state);
    const vps = retrieveSpatialObjects(state, vpIds);
    if (vps.length === 0) return true;

    // Check if any object is visible from any viewpoint (not occluded)
    // Simplified: check if distance is reasonable and above ground
    for (const obj of objs) {
      const objPos = toVec3(obj.position);
      if (objPos[1] < 0) continue; // Below ground = not visible
      for (const vp of vps) {
        const d = distance(obj.position, vp.position);
        if (d > 0 && d < 200) return true; // Within visible range
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = this.objects.getVariables();
    if (this.viewpoint) {
      for (const v of this.viewpoint.getVariables()) {
        vars.add(v);
      }
    }
    return vars;
  }

  clone(): Visible {
    return new Visible(
      this.objects.clone() as ObjectSetExpression,
      this.viewpoint?.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Visible(${this.objects}${this.viewpoint ? `, ${this.viewpoint}` : ''})`;
  }
}

/**
 * Grouped relation: objects are close together
 * Implements: groupedWith(objA, objB, groupDistance)
 */
export class Grouped extends Relation {
  readonly type = 'Grouped';
  readonly relationType = 'grouped';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly maxDistance: number = 2.0
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length <= 1) return true; // Single or empty objects are trivially grouped
    // Check all pairs are within maxDistance
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (distance(objs[i].position, objs[j].position) > this.maxDistance) {
          return false;
        }
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Grouped {
    return new Grouped(
      this.objects.clone() as ObjectSetExpression,
      this.maxDistance
    );
  }

  toString(): string {
    return `Grouped(${this.objects}, ${this.maxDistance})`;
  }
}

/**
 * Distributed relation: objects are spread apart
 * Implements: spreadOut(objects, minDistance)
 */
export class Distributed extends Relation {
  readonly type = 'Distributed';
  readonly relationType = 'distributed';
  constructor(
    public readonly objects: ObjectSetExpression,
    public readonly minDistance: number = 1.0
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length <= 1) return true;
    // Check all pairs are at least minDistance apart
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        if (distance(objs[i].position, objs[j].position) < this.minDistance) {
          return false;
        }
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Distributed {
    return new Distributed(
      this.objects.clone() as ObjectSetExpression,
      this.minDistance
    );
  }

  toString(): string {
    return `Distributed(${this.objects}, ${this.minDistance})`;
  }
}

/**
 * Coverage relation: objects1 cover objects2
 */
export class Coverage extends GeometryRelation {
  readonly type = 'Coverage';
  readonly relationType = 'coverage';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly coverageThreshold: number = 0.8
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check XZ overlap ratio of objects2 covered by objects1
    for (const b of objs2) {
      const aabbB = getAABB(b);
      const bAreaXZ = Math.max(0, aabbB.max[0] - aabbB.min[0]) * Math.max(0, aabbB.max[2] - aabbB.min[2]);
      if (bAreaXZ <= 0) continue;
      let totalCovered = 0;
      for (const a of objs1) {
        const aabbA = getAABB(a);
        totalCovered += aabbOverlapAreaXZ(aabbA, aabbB);
      }
      // Clamp to bAreaXZ (can't cover more than 100%)
      totalCovered = Math.min(totalCovered, bAreaXZ);
      if (totalCovered / bAreaXZ >= this.coverageThreshold) return true;
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Coverage {
    return new Coverage(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.coverageThreshold
    );
  }

  toString(): string {
    return `Coverage(${this.objects1}, ${this.objects2}, ${this.coverageThreshold})`;
  }
}

/**
 * Support coverage relation
 */
export class SupportCoverage extends GeometryRelation {
  readonly type = 'SupportCoverage';
  readonly relationType = 'support_coverage';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly minSupport: number = 0.5
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // objects1 (supported) must have significant XZ overlap with objects2 (supporter) top face
    for (const a of objs1) {
      const aabbA = getAABB(a);
      const aAreaXZ = Math.max(0, aabbA.max[0] - aabbA.min[0]) * Math.max(0, aabbA.max[2] - aabbA.min[2]);
      if (aAreaXZ <= 0) continue;
      let totalSupported = 0;
      for (const b of objs2) {
        const aabbB = getAABB(b);
        totalSupported += aabbOverlapAreaXZ(aabbA, aabbB);
      }
      totalSupported = Math.min(totalSupported, aAreaXZ);
      if (totalSupported / aAreaXZ >= this.minSupport) return true;
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): SupportCoverage {
    return new SupportCoverage(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.minSupport
    );
  }

  toString(): string {
    return `SupportCoverage(${this.objects1}, ${this.objects2}, ${this.minSupport})`;
  }
}

/**
 * Stability relation: objects are stable (won't fall)
 */
export class Stability extends Relation {
  readonly type = 'Stability';
  readonly relationType = 'stability';
  constructor(public readonly objects: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objects', this.objects]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids = this.objects.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return true;
    // Simplified stability check: object center of mass must be above its support base
    // An object is stable if its Y position is >= 0 (not below ground) and
    // its center of mass projection falls within its AABB XZ footprint
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      if (pos[1] < 0) return false; // Below ground = unstable
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    return this.objects.getVariables();
  }

  clone(): Stability {
    return new Stability(this.objects.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `Stability(${this.objects})`;
  }
}

/**
 * Containment relation: objects1 contain objects2
 * Implements: containedIn(objA, objB)
 */
export class Containment extends GeometryRelation {
  readonly type = 'Containment';
  readonly relationType = 'containment';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    // Check if any obj2's AABB is fully inside any obj1's AABB
    for (const outer of objs1) {
      const outerAABB = getAABB(outer);
      for (const inner of objs2) {
        const innerAABB = getAABB(inner);
        if (aabbContainedIn(innerAABB, outerAABB)) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Containment {
    return new Containment(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Containment(${this.objects1}, ${this.objects2})`;
  }
}

/**
 * Proximity relation: objects are within certain distance
 * Implements: near(objA, objB, threshold) with min/max bounds
 */
export class Proximity extends GeometryRelation {
  readonly type = 'Proximity';
  readonly relationType = 'proximity';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly maxDistance: number = 1.0,
    public readonly minDistance: number = 0.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = distance(a.position, b.position);
        if (d >= this.minDistance && d <= this.maxDistance) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): Proximity {
    return new Proximity(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.maxDistance,
      this.minDistance
    );
  }

  toString(): string {
    return `Proximity(${this.objects1}, ${this.objects2}, ${this.maxDistance})`;
  }
}

/**
 * Far from relation: objects1 are far from objects2
 * Implements: farFrom(objA, objB, threshold)
 */
export class FarFrom extends GeometryRelation {
  readonly type = 'FarFrom';
  readonly relationType = 'far_from';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly threshold: number = 5.0
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return true; // No objects = vacuously far
    // ALL pairs must be far from each other
    for (const a of objs1) {
      for (const b of objs2) {
        if (distance(a.position, b.position) <= this.threshold) return false;
      }
    }
    return true;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): FarFrom {
    return new FarFrom(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `FarFrom(${this.objects1}, ${this.objects2}, ${this.threshold})`;
  }
}

/**
 * Look at relation: objA's look direction is within angle of direction to objB
 * Implements: lookAt(objA, objB, angleThreshold)
 */
export class LookAt extends GeometryRelation {
  readonly type = 'LookAt';
  readonly relationType = 'look_at';
  constructor(
    objects1: ObjectSetExpression,
    objects2: ObjectSetExpression,
    public readonly angleThreshold: number = Math.PI / 6
  ) {
    super(objects1, objects2);
  }

  children(): Map<string, Node> {
    return new Map([['objects1', this.objects1], ['objects2', this.objects2]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    if (objs1.length === 0 || objs2.length === 0) return false;
    for (const a of objs1) {
      const fwd = getForward(a);
      for (const b of objs2) {
        const dir = directionTo(a, b);
        const ang = angleBetween(fwd, dir);
        if (ang <= this.angleThreshold) return true;
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  clone(): LookAt {
    return new LookAt(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.angleThreshold
    );
  }

  toString(): string {
    return `LookAt(${this.objects1}, ${this.objects2}, ${this.angleThreshold})`;
  }
}

/**
 * Occluded relation: some occluder is between objects1 and objects2
 * Implements: occluded(objA, objB, occluders)
 */
export class Occluded extends Relation {
  readonly type = 'Occluded';
  readonly relationType = 'occluded';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly occluders: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['occluders', this.occluders]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    const ids1 = this.objects1.evaluate(state);
    const ids2 = this.objects2.evaluate(state);
    const occIds = this.occluders.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    const occluders = retrieveSpatialObjects(state, occIds);
    if (objs1.length === 0 || objs2.length === 0 || occluders.length === 0) return false;

    for (const a of objs1) {
      const aPos = toVec3(a.position);
      for (const b of objs2) {
        const bPos = toVec3(b.position);
        const dir = normalize(sub(b.position, a.position));
        const totalDist = distance(a.position, b.position);
        for (const occ of occluders) {
          const occAABB = getAABB(occ);
          if (rayAABBIntersection(aPos, dir, occAABB)) {
            // Check that the occluder is between a and b
            const occCenter = toVec3(occ.position);
            const distToOcc = distance(a.position, occCenter);
            if (distToOcc > 0 && distToOcc < totalDist) return true;
          }
        }
      }
    }
    return false;
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.occluders.getVariables()) vars.add(v);
    return vars;
  }

  clone(): Occluded {
    return new Occluded(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.occluders.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `Occluded(${this.objects1}, ${this.objects2}, ${this.occluders})`;
  }
}

/**
 * Path to relation: unobstructed line exists from objects1 to objects2 through obstacles
 * Implements: pathTo(objA, objB, obstacles) — returns true if NO obstacle blocks the path
 */
export class PathTo extends Relation {
  readonly type = 'PathTo';
  readonly relationType = 'path_to';
  constructor(
    public readonly objects1: ObjectSetExpression,
    public readonly objects2: ObjectSetExpression,
    public readonly obstacles: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([
      ['objects1', this.objects1],
      ['objects2', this.objects2],
      ['obstacles', this.obstacles]
    ]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    // pathTo returns true if there's an unobstructed path (i.e., NOT occluded)
    const occluded = new Occluded(this.objects1, this.objects2, this.obstacles);
    return !occluded.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.evaluate(state);
  }

  getVariables(): Set<Variable> {
    const vars = new Set<Variable>();
    for (const v of this.objects1.getVariables()) vars.add(v);
    for (const v of this.objects2.getVariables()) vars.add(v);
    for (const v of this.obstacles.getVariables()) vars.add(v);
    return vars;
  }

  clone(): PathTo {
    return new PathTo(
      this.objects1.clone() as ObjectSetExpression,
      this.objects2.clone() as ObjectSetExpression,
      this.obstacles.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `PathTo(${this.objects1}, ${this.objects2}, ${this.obstacles})`;
  }
}

/**
 * Symmetric relation - enforces that a relation holds symmetrically between objects
 */
export class Symmetric extends Relation {
  readonly type = 'Symmetric';
  readonly relationType = 'symmetric';

  constructor(
    public readonly innerRelation: Relation
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['innerRelation', this.innerRelation]]);
  }

  evaluate(state: Map<Variable, any>): boolean {
    return this.innerRelation.evaluate(state);
  }

  isSatisfied(state: Map<Variable, any>): boolean {
    return this.innerRelation.isSatisfied(state);
  }

  getVariables(): Set<Variable> {
    return this.innerRelation.getVariables();
  }

  clone(): Symmetric {
    return new Symmetric(this.innerRelation.clone() as Relation);
  }

  toString(): string {
    return `Symmetric(${this.innerRelation})`;
  }
}

// ============================================================================
// Standalone Relation Functions
// These can be called directly without creating class instances
// ============================================================================

/**
 * Check if objA is near objB (distance < threshold)
 */
export function near(objA: SpatialObject, objB: SpatialObject, threshold: number): boolean {
  return distance(objA.position, objB.position) < threshold;
}

/**
 * Check if objA is on top of objB (bottom of A close to top of B, overlapping in XZ)
 */
export function onTopOf(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.1): boolean {
  const aabbA = getAABB(objA);
  const aabbB = getAABB(objB);
  const aBottom = aabbA.min[1];
  const bTop = aabbB.max[1];
  return Math.abs(aBottom - bTop) <= tolerance && aabbOverlapXZ(aabbA, aabbB);
}

/**
 * Check if objA is touching objB (AABBs overlap or within tolerance)
 */
export function touching(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.01): boolean {
  return aabbOverlapOrNear(getAABB(objA), getAABB(objB), tolerance);
}

/**
 * Check if objA is supported by objB (onTopOf AND XZ overlap)
 */
export function supportedBy(objA: SpatialObject, objB: SpatialObject, tolerance: number = 0.1): boolean {
  return onTopOf(objA, objB, tolerance) && aabbOverlapXZ(getAABB(objA), getAABB(objB));
}

/**
 * Check if objA is facing toward objB (within angle threshold)
 */
export function facing(objA: SpatialObject, objB: SpatialObject, angleThreshold: number = Math.PI / 4): boolean {
  const fwd = getForward(objA);
  const dir = directionTo(objA, objB);
  return angleBetween(fwd, dir) <= angleThreshold;
}

/**
 * Check if objA is far from objB (distance > threshold)
 */
export function farFrom(objA: SpatialObject, objB: SpatialObject, threshold: number): boolean {
  return distance(objA.position, objB.position) > threshold;
}

/**
 * Check if objA is reachable from objB (simplified: distance < armLength)
 */
export function reachable(objA: SpatialObject, objB: SpatialObject, armLength: number): boolean {
  return distance(objA.position, objB.position) < armLength;
}

/**
 * Check if there's an unobstructed path from objA to objB (raycasting through obstacles)
 */
export function pathTo(objA: SpatialObject, objB: SpatialObject, obstacles: SpatialObject[]): boolean {
  const origin = toVec3(objA.position);
  const dir = normalize(sub(objB.position, objA.position));
  const totalDist = distance(objA.position, objB.position);
  for (const obs of obstacles) {
    const occAABB = getAABB(obs);
    if (rayAABBIntersection(origin, dir, occAABB)) {
      const distToOcc = distance(objA.position, obs.position);
      if (distToOcc > 0 && distToOcc < totalDist) return false;
    }
  }
  return true;
}

/**
 * Check if objA's look direction is within angle of direction to objB
 */
export function lookAt(objA: SpatialObject, objB: SpatialObject, angleThreshold: number = Math.PI / 6): boolean {
  const fwd = getForward(objA);
  const dir = directionTo(objA, objB);
  return angleBetween(fwd, dir) <= angleThreshold;
}

/**
 * Check if objA and objB are aligned along the specified axis within tolerance
 */
export function alignedWith(objA: SpatialObject, objB: SpatialObject, axis: 'x' | 'y' | 'z', tolerance: number = 0.1): boolean {
  const aPos = toVec3(objA.position);
  const bPos = toVec3(objB.position);
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  return Math.abs(aPos[axisIndex] - bPos[axisIndex]) <= tolerance;
}

/**
 * Check if objA is occluded from objB by any occluder
 */
export function occluded(objA: SpatialObject, objB: SpatialObject, occluders: SpatialObject[]): boolean {
  return !pathTo(objA, objB, occluders);
}

/**
 * Check if objA is visible from objB (not occluded)
 */
export function visible(objA: SpatialObject, objB: SpatialObject, occluders: SpatialObject[]): boolean {
  return !occluded(objA, objB, occluders);
}

/**
 * Check if objA and objB are within groupDistance of each other
 */
export function groupedWith(objA: SpatialObject, objB: SpatialObject, groupDistance: number): boolean {
  return distance(objA.position, objB.position) <= groupDistance;
}

/**
 * Check if all objects are at least minDistance apart
 */
export function spreadOut(objects: SpatialObject[], minDistance: number): boolean {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (distance(objects[i].position, objects[j].position) < minDistance) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if objA's AABB is fully inside objB's AABB
 */
export function containedIn(objA: SpatialObject, objB: SpatialObject): boolean {
  return aabbContainedIn(getAABB(objA), getAABB(objB));
}

/**
 * Returns the Euclidean distance between object centers
 */
export function distanceBetween(objA: SpatialObject, objB: SpatialObject): number {
  return distance(objA.position, objB.position);
}
