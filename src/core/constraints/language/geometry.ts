/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 * 
 * Ported from infinigen/core/constraints/constraint_language/geometry.py
 */

import { Node, Variable } from './types';
import { ScalarExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance as spatialDistance,
  angleBetween,
  getAABB,
  getForward,
  directionTo,
  dot,
  aabbOverlapAreaXZ,
  aabbDistance,
  aabbContainedIn,
} from './spatial-helpers';

/**
 * Geometric predicate expressions for constraint language
 * These compute scalar values from geometric relationships
 */

export abstract class GeometryPredicate extends ScalarExpression {
  abstract readonly predicateType: string;
}

/**
 * Distance between two objects or sets
 * Computes the minimum distance between any pair of objects from the two sets
 */
export class Distance extends GeometryPredicate {
  readonly type = 'Distance';
  readonly predicateType = 'Distance';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj1', this.obj1],
      ['obj2', this.obj2]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj1.evaluate(state);
    const ids2 = this.obj2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    
    if (objs1.length === 0 || objs2.length === 0) return Infinity;
    
    // Find minimum distance between any pair
    let minDist = Infinity;
    for (const a of objs1) {
      for (const b of objs2) {
        const d = spatialDistance(a.position, b.position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  clone(): Distance {
    return new Distance(
      this.obj1.clone() as ObjectSetExpression,
      this.obj2.clone() as ObjectSetExpression
    );
  }
}

/**
 * Accessibility cost - how difficult it is to access an object
 * Returns the Euclidean distance (simplified cost model)
 */
export class AccessibilityCost extends GeometryPredicate {
  readonly type = 'AccessibilityCost';
  readonly predicateType = 'AccessibilityCost';
  
  constructor(
    public obj: ObjectSetExpression,
    public fromObj: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['fromObj', this.fromObj]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.fromObj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const fromObjs = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || fromObjs.length === 0) return Infinity;
    
    // Accessibility cost = minimum distance to any "from" object
    let minDist = Infinity;
    for (const a of objs) {
      for (const b of fromObjs) {
        const d = spatialDistance(a.position, b.position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  clone(): AccessibilityCost {
    return new AccessibilityCost(
      this.obj.clone() as ObjectSetExpression,
      this.fromObj.clone() as ObjectSetExpression
    );
  }
}

/**
 * Focus score - how much an object is in focus from a viewpoint
 * Returns a score from 0 to 1 (1 = directly facing, 0 = perpendicular or behind)
 */
export class FocusScore extends GeometryPredicate {
  readonly type = 'FocusScore';
  readonly predicateType = 'FocusScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['viewer', this.viewer]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.viewer.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const viewers = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || viewers.length === 0) return 0;
    
    // Focus score based on how directly the viewer faces the object
    let maxScore = 0;
    for (const viewer of viewers) {
      const fwd = getForward(viewer);
      for (const obj of objs) {
        const dir = directionTo(viewer, obj);
        const d = dot(fwd, dir);
        // Score is max of (dot product + 1) / 2, normalized to [0, 1]
        const score = Math.max(0, (d + 1) / 2);
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
  }

  clone(): FocusScore {
    return new FocusScore(
      this.obj.clone() as ObjectSetExpression,
      this.viewer.clone() as ObjectSetExpression
    );
  }
}

/**
 * Angle between two objects or directions
 * Returns the angle in radians between the forward directions of two objects,
 * or the angle between the direction from obj1 to obj2
 */
export class Angle extends GeometryPredicate {
  readonly type = 'Angle';
  readonly predicateType = 'Angle';
  
  constructor(
    public obj1: ObjectSetExpression,
    public obj2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj1', this.obj1],
      ['obj2', this.obj2]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj1.evaluate(state);
    const ids2 = this.obj2.evaluate(state);
    const objs1 = retrieveSpatialObjects(state, ids1);
    const objs2 = retrieveSpatialObjects(state, ids2);
    
    if (objs1.length === 0 || objs2.length === 0) return 0;
    
    // Compute average angle between forward directions of objects
    let totalAngle = 0;
    let count = 0;
    for (const a of objs1) {
      const fwdA = getForward(a);
      for (const b of objs2) {
        const fwdB = getForward(b);
        totalAngle += angleBetween(fwdA, fwdB);
        count++;
      }
    }
    return count > 0 ? totalAngle / count : 0;
  }

  clone(): Angle {
    return new Angle(
      this.obj1.clone() as ObjectSetExpression,
      this.obj2.clone() as ObjectSetExpression
    );
  }
}

/**
 * Surface area of an object (computed from AABB)
 */
export class SurfaceArea extends GeometryPredicate {
  readonly type = 'SurfaceArea';
  readonly predicateType = 'SurfaceArea';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalArea = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      // AABB surface area = 2*(dx*dy + dx*dz + dy*dz)
      totalArea += 2 * (dx * dy + dx * dz + dy * dz);
    }
    return totalArea;
  }

  clone(): SurfaceArea {
    return new SurfaceArea(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Volume of an object (computed from AABB)
 */
export class Volume extends GeometryPredicate {
  readonly type = 'Volume';
  readonly predicateType = 'Volume';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalVolume = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      totalVolume += dx * dy * dz;
    }
    return totalVolume;
  }

  clone(): Volume {
    return new Volume(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Count of objects in a set
 */
export class Count extends GeometryPredicate {
  readonly type = 'Count';
  readonly predicateType = 'Count';
  
  constructor(public objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    return this.objs.evaluate(state).size;
  }

  clone(): Count {
    return new Count(this.objs.clone() as ObjectSetExpression);
  }
}

/**
 * Height of an object above ground (Y coordinate of center)
 */
export class Height extends GeometryPredicate {
  readonly type = 'Height';
  readonly predicateType = 'Height';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    // Return average Y position (height above ground)
    let totalY = 0;
    for (const obj of objs) {
      totalY += toVec3(obj.position)[1];
    }
    return totalY / objs.length;
  }

  clone(): Height {
    return new Height(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Width/bounding box dimension of an object
 */
export class Width extends GeometryPredicate {
  readonly type = 'Width';
  readonly predicateType = 'Width';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'x'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    let totalWidth = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      totalWidth += aabb.max[axisIndex] - aabb.min[axisIndex];
    }
    return totalWidth;
  }

  clone(): Width {
    return new Width(this.obj.clone() as ObjectSetExpression, this.axis);
  }
}

/**
 * Center of mass position component
 */
export class CenterOfMass extends GeometryPredicate {
  readonly type = 'CenterOfMass';
  readonly predicateType = 'CenterOfMass';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    const axisIndex = this.axis === 'x' ? 0 : this.axis === 'y' ? 1 : 2;
    let total = 0;
    for (const obj of objs) {
      total += toVec3(obj.position)[axisIndex];
    }
    return total / objs.length;
  }

  clone(): CenterOfMass {
    return new CenterOfMass(this.obj.clone() as ObjectSetExpression, this.axis);
  }
}

/**
 * Normal direction alignment score
 */
export class NormalAlignment extends GeometryPredicate {
  readonly type = 'NormalAlignment';
  readonly predicateType = 'NormalAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public direction: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    // Average alignment of forward directions with the target direction
    let totalDot = 0;
    for (const obj of objs) {
      const fwd = getForward(obj);
      totalDot += dot(fwd, this.direction);
    }
    return totalDot / objs.length;
  }

  clone(): NormalAlignment {
    return new NormalAlignment(this.obj.clone() as ObjectSetExpression, [...this.direction]);
  }
}

/**
 * Clearance distance - minimum distance to any other object
 */
export class Clearance extends GeometryPredicate {
  readonly type = 'Clearance';
  readonly predicateType = 'Clearance';
  
  constructor(
    public obj: ObjectSetExpression,
    public excludeSet?: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    const children = new Map<string, Node>([['obj', this.obj]]);
    if (this.excludeSet) {
      children.set('excludeSet', this.excludeSet);
    }
    return children;
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return Infinity;
    
    // Get all other objects in the state that aren't in the exclude set
    const excludeIds = this.excludeSet ? this.excludeSet.evaluate(state) : new Set<string>();
    
    // Collect all spatial objects from state that are NOT our objects or excluded
    let minClearance = Infinity;
    for (const obj of objs) {
      const objPos = toVec3(obj.position);
      // Check distance to every object in state (excluding self and excluded)
      for (const [key, value] of state.entries()) {
        const keyStr = String(key);
        if (keyStr.startsWith('__spatial_')) {
          const otherId = keyStr.replace('__spatial_', '');
          if (ids.has(otherId) || excludeIds.has(otherId)) continue;
          const other = value as SpatialObject;
          const d = spatialDistance(objPos, other.position);
          if (d < minClearance) minClearance = d;
        }
      }
    }
    return minClearance;
  }

  clone(): Clearance {
    return new Clearance(
      this.obj.clone() as ObjectSetExpression,
      this.excludeSet?.clone() as ObjectSetExpression | undefined
    );
  }
}

/**
 * Visibility score from a viewpoint
 * Returns a value from 0 to 1 based on distance and facing direction
 */
export class VisibilityScore extends GeometryPredicate {
  readonly type = 'VisibilityScore';
  readonly predicateType = 'VisibilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public viewer: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['viewer', this.viewer]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.viewer.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const viewers = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || viewers.length === 0) return 0;
    
    // Visibility score based on distance (closer = more visible) and facing
    let maxScore = 0;
    for (const viewer of viewers) {
      const fwd = getForward(viewer);
      for (const obj of objs) {
        const dir = directionTo(viewer, obj);
        const dist = spatialDistance(viewer.position, obj.position);
        const facingScore = Math.max(0, dot(fwd, dir)); // 0 to 1
        const distScore = Math.max(0, 1 - dist / 100); // Closer = higher score
        const score = facingScore * distScore;
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
  }

  clone(): VisibilityScore {
    return new VisibilityScore(
      this.obj.clone() as ObjectSetExpression,
      this.viewer.clone() as ObjectSetExpression
    );
  }
}

/**
 * Stability score - how stable an object is in its current pose
 * Returns 1.0 if center of mass is within support base, 0.0 if not
 */
export class StabilityScore extends GeometryPredicate {
  readonly type = 'StabilityScore';
  readonly predicateType = 'StabilityScore';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalScore = 0;
    for (const obj of objs) {
      const pos = toVec3(obj.position);
      const aabb = getAABB(obj);
      // Stable if center of mass (position) is within the XZ footprint of the AABB
      const withinX = pos[0] >= aabb.min[0] && pos[0] <= aabb.max[0];
      const withinZ = pos[2] >= aabb.min[2] && pos[2] <= aabb.max[2];
      const aboveGround = pos[1] >= 0;
      totalScore += (withinX && withinZ && aboveGround) ? 1.0 : 0.0;
    }
    return totalScore / objs.length;
  }

  clone(): StabilityScore {
    return new StabilityScore(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Support contact area between two objects
 * Returns the XZ overlap area between the bottom of the supported object
 * and the top of the supporter object
 */
export class SupportContactArea extends GeometryPredicate {
  readonly type = 'SupportContactArea';
  readonly predicateType = 'SupportContactArea';
  
  constructor(
    public supported: ObjectSetExpression,
    public supporter: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['supported', this.supported],
      ['supporter', this.supporter]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.supported.evaluate(state);
    const ids2 = this.supporter.evaluate(state);
    const supporteds = retrieveSpatialObjects(state, ids1);
    const supporters = retrieveSpatialObjects(state, ids2);
    
    if (supporteds.length === 0 || supporters.length === 0) return 0;
    
    let totalArea = 0;
    for (const a of supporteds) {
      const aabbA = getAABB(a);
      for (const b of supporters) {
        const aabbB = getAABB(b);
        // Check if a is on top of b (bottom of a near top of b)
        const aBottom = aabbA.min[1];
        const bTop = aabbB.max[1];
        if (Math.abs(aBottom - bTop) < 0.15) {
          totalArea += aabbOverlapAreaXZ(aabbA, aabbB);
        }
      }
    }
    return totalArea;
  }

  clone(): SupportContactArea {
    return new SupportContactArea(
      this.supported.clone() as ObjectSetExpression,
      this.supporter.clone() as ObjectSetExpression
    );
  }
}

/**
 * Reachability score - can an agent reach this object
 * Returns 1.0 if reachable, decays with distance
 */
export class ReachabilityScore extends GeometryPredicate {
  readonly type = 'ReachabilityScore';
  readonly predicateType = 'ReachabilityScore';
  
  constructor(
    public obj: ObjectSetExpression,
    public agent: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([
      ['obj', this.obj],
      ['agent', this.agent]
    ]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.obj.evaluate(state);
    const ids2 = this.agent.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids1);
    const agents = retrieveSpatialObjects(state, ids2);
    
    if (objs.length === 0 || agents.length === 0) return 0;
    
    // Reachability score based on inverse distance
    const armLength = 2.0; // Typical human arm reach
    let maxScore = 0;
    for (const agent of agents) {
      for (const obj of objs) {
        const dist = spatialDistance(agent.position, obj.position);
        const score = Math.max(0, 1 - dist / armLength);
        if (score > maxScore) maxScore = score;
      }
    }
    return maxScore;
  }

  clone(): ReachabilityScore {
    return new ReachabilityScore(
      this.obj.clone() as ObjectSetExpression,
      this.agent.clone() as ObjectSetExpression
    );
  }
}

/**
 * Orientation alignment with a target direction
 */
export class OrientationAlignment extends GeometryPredicate {
  readonly type = 'OrientationAlignment';
  readonly predicateType = 'OrientationAlignment';
  
  constructor(
    public obj: ObjectSetExpression,
    public targetDirection: [number, number, number]
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalAlignment = 0;
    for (const obj of objs) {
      const fwd = getForward(obj);
      totalAlignment += dot(fwd, this.targetDirection);
    }
    return totalAlignment / objs.length;
  }

  clone(): OrientationAlignment {
    return new OrientationAlignment(this.obj.clone() as ObjectSetExpression, [...this.targetDirection]);
  }
}

/**
 * Compactness ratio - volume / surface_area^(3/2)
 */
export class Compactness extends GeometryPredicate {
  readonly type = 'Compactness';
  readonly predicateType = 'Compactness';
  
  constructor(public obj: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 0;
    
    let totalCompactness = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const dx = aabb.max[0] - aabb.min[0];
      const dy = aabb.max[1] - aabb.min[1];
      const dz = aabb.max[2] - aabb.min[2];
      const volume = dx * dy * dz;
      const surfaceArea = 2 * (dx * dy + dx * dz + dy * dz);
      if (surfaceArea > 0) {
        totalCompactness += volume / Math.pow(surfaceArea, 1.5);
      }
    }
    return totalCompactness / objs.length;
  }

  clone(): Compactness {
    return new Compactness(this.obj.clone() as ObjectSetExpression);
  }
}

/**
 * Aspect ratio of bounding box
 */
export class AspectRatio extends GeometryPredicate {
  readonly type = 'AspectRatio';
  readonly predicateType = 'AspectRatio';
  
  constructor(
    public obj: ObjectSetExpression,
    public axis1: 'x' | 'y' | 'z' = 'x',
    public axis2: 'x' | 'y' | 'z' = 'y'
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map<string, Node>([['obj', this.obj]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.obj.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return 1;
    
    const ai1 = this.axis1 === 'x' ? 0 : this.axis1 === 'y' ? 1 : 2;
    const ai2 = this.axis2 === 'x' ? 0 : this.axis2 === 'y' ? 1 : 2;
    
    let totalRatio = 0;
    for (const obj of objs) {
      const aabb = getAABB(obj);
      const d1 = aabb.max[ai1] - aabb.min[ai1];
      const d2 = aabb.max[ai2] - aabb.min[ai2];
      totalRatio += d2 > 0 ? d1 / d2 : 1;
    }
    return totalRatio / objs.length;
  }

  clone(): AspectRatio {
    return new AspectRatio(this.obj.clone() as ObjectSetExpression, this.axis1, this.axis2);
  }
}

// ============================================================================
// Missing Geometry Predicates
// Ported from: constraint_language/geometry.py
// ============================================================================

/**
 * MinDistanceInternal - Minimum pairwise distance within a set
 *
 * Port of: min_distance_internal(objs) in constraint_language/geometry.py
 * Returns the minimum distance between any pair of objects in the set.
 * O(n²) but typically small sets.
 */
export class MinDistanceInternal extends GeometryPredicate {
  readonly type = 'MinDistanceInternal';
  readonly predicateType = 'MinDistanceInternal';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return Infinity;

    let minDist = Infinity;
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const d = spatialDistance(objects[i].position, objects[j].position);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }

  clone(): MinDistanceInternal {
    return new MinDistanceInternal(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `MinDistanceInternal(${this.objs})`;
  }
}

/**
 * FreeSpace2D - 2D free space metric
 *
 * Port of: freespace_2d(objs, others) in constraint_language/geometry.py
 * Computes 2D free space metric (area not occupied by others).
 */
export class FreeSpace2D extends GeometryPredicate {
  readonly type = 'FreeSpace2D';
  readonly predicateType = 'FreeSpace2D';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0) return 0;

    // Compute total bounding area of objs
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }
    const totalArea = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    if (totalArea <= 0) return 0;

    // Subtract area occupied by others
    let occupiedArea = 0;
    for (const other of otherObjs) {
      const aabb = getAABB(other);
      const area = Math.max(0, aabb.max[0] - aabb.min[0]) * Math.max(0, aabb.max[2] - aabb.min[2]);
      occupiedArea += area;
    }

    return Math.max(0, totalArea - occupiedArea);
  }

  clone(): FreeSpace2D {
    return new FreeSpace2D(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `FreeSpace2D(${this.objs}, ${this.others})`;
  }
}

/**
 * MinDistance2D - 2D minimum distance
 *
 * Port of: min_dist_2d(objs, others) in constraint_language/geometry.py
 * Computes 2D (XZ plane) minimum distance between object sets.
 */
export class MinDistance2D extends GeometryPredicate {
  readonly type = 'MinDistance2D';
  readonly predicateType = 'MinDistance2D';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0 || otherObjs.length === 0) return Infinity;

    let minDist = Infinity;
    for (const a of objects) {
      const aPos = toVec3(a.position);
      for (const b of otherObjs) {
        const bPos = toVec3(b.position);
        // 2D distance on XZ plane
        const dx = aPos[0] - bPos[0];
        const dz = aPos[2] - bPos[2];
        const d2d = Math.sqrt(dx * dx + dz * dz);
        if (d2d < minDist) minDist = d2d;
      }
    }
    return minDist;
  }

  clone(): MinDistance2D {
    return new MinDistance2D(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `MinDistance2D(${this.objs}, ${this.others})`;
  }
}

/**
 * RotationalAsymmetry - Rotational asymmetry score
 *
 * Port of: rotational_asymmetry(objs) in constraint_language/geometry.py
 * Measures how asymmetric the object arrangement is around its centroid.
 * Returns 0 for perfectly rotationally symmetric arrangements.
 */
export class RotationalAsymmetry extends GeometryPredicate {
  readonly type = 'RotationalAsymmetry';
  readonly predicateType = 'RotationalAsymmetry';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0;

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // Compute angles of each object relative to centroid
    const angles = objects.map(obj => {
      const p = toVec3(obj.position);
      return Math.atan2(p[2] - cz, p[0] - cx);
    });

    // Compute asymmetry as variance of angular distribution
    // Perfect symmetry would have evenly-spaced angles
    const sortedAngles = angles.sort((a, b) => a - b);
    const n = sortedAngles.length;
    const idealSpacing = (2 * Math.PI) / n;

    let asymmetry = 0;
    for (let i = 0; i < n; i++) {
      const nextAngle = sortedAngles[(i + 1) % n];
      const currAngle = sortedAngles[i];
      const actualSpacing = nextAngle >= currAngle
        ? nextAngle - currAngle
        : (2 * Math.PI - currAngle) + nextAngle;
      asymmetry += Math.abs(actualSpacing - idealSpacing);
    }

    return asymmetry / (2 * Math.PI); // Normalize to [0, 1]
  }

  clone(): RotationalAsymmetry {
    return new RotationalAsymmetry(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RotationalAsymmetry(${this.objs})`;
  }
}

/**
 * ReflectionalAsymmetry - Reflectional asymmetry
 *
 * Port of: reflectional_asymmetry(objs, others, use_long_plane) in constraint_language/geometry.py
 * Measures how asymmetric the arrangement is across a reflection plane.
 * Returns 0 for perfectly reflectionally symmetric.
 */
export class ReflectionalAsymmetry extends GeometryPredicate {
  readonly type = 'ReflectionalAsymmetry';
  readonly predicateType = 'ReflectionalAsymmetry';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression,
    public readonly useLongPlane: boolean = true
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    const allObjs = [...objects, ...otherObjs];
    if (allObjs.length <= 1) return 0;

    // Compute centroid
    let cx = 0, cz = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= allObjs.length;
    cz /= allObjs.length;

    // Determine reflection plane axis
    // Use long axis (direction of greatest spread) if useLongPlane
    let spreadX = 0, spreadZ = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      spreadX += (p[0] - cx) ** 2;
      spreadZ += (p[2] - cz) ** 2;
    }

    // Reflection plane is perpendicular to the longer spread
    const reflectAlongX = this.useLongPlane ? spreadX > spreadZ : spreadX <= spreadZ;

    // Compute asymmetry: sum of distances of objects from their reflections
    let asymmetry = 0;
    for (const obj of allObjs) {
      const p = toVec3(obj.position);
      // Reflected position
      const rx = reflectAlongX ? 2 * cx - p[0] : p[0];
      const rz = reflectAlongX ? p[2] : 2 * cz - p[2];

      // Find closest object to reflected position
      let minDist = Infinity;
      for (const other of allObjs) {
        if (other === obj) continue;
        const op = toVec3(other.position);
        const d = Math.sqrt((op[0] - rx) ** 2 + (op[2] - rz) ** 2);
        if (d < minDist) minDist = d;
      }
      asymmetry += minDist;
    }

    return asymmetry / allObjs.length;
  }

  clone(): ReflectionalAsymmetry {
    return new ReflectionalAsymmetry(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression,
      this.useLongPlane
    );
  }

  toString(): string {
    return `ReflectionalAsymmetry(${this.objs}, ${this.others})`;
  }
}

/**
 * CoplanarityCost - Co-planarity violation cost
 *
 * Port of: coplanarity_cost(objs) in constraint_language/geometry.py
 * All objects should be on the same plane; cost = variance in Y positions.
 */
export class CoplanarityCost extends GeometryPredicate {
  readonly type = 'CoplanarityCost';
  readonly predicateType = 'CoplanarityCost';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length <= 1) return 0;

    // Compute mean Y
    let sumY = 0;
    for (const obj of objects) {
      sumY += toVec3(obj.position)[1];
    }
    const meanY = sumY / objects.length;

    // Compute variance
    let variance = 0;
    for (const obj of objects) {
      const y = toVec3(obj.position)[1];
      variance += (y - meanY) ** 2;
    }

    return variance / objects.length; // MSE = variance
  }

  clone(): CoplanarityCost {
    return new CoplanarityCost(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `CoplanarityCost(${this.objs})`;
  }
}

/**
 * CenterStableSurfaceDist - Distance from center of support surface
 *
 * Port of: center_stable_surface_dist(objs) in constraint_language/geometry.py
 * Computes distance of objects from the center of their support surface.
 */
export class CenterStableSurfaceDist extends GeometryPredicate {
  readonly type = 'CenterStableSurfaceDist';
  readonly predicateType = 'CenterStableSurfaceDist';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    // Compute centroid of the support surface (XZ plane)
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    // Compute average distance from centroid
    let totalDist = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      const dx = p[0] - cx;
      const dz = p[2] - cz;
      totalDist += Math.sqrt(dx * dx + dz * dz);
    }

    return totalDist / objects.length;
  }

  clone(): CenterStableSurfaceDist {
    return new CenterStableSurfaceDist(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `CenterStableSurfaceDist(${this.objs})`;
  }
}

/**
 * AngleAlignmentCost - Angular misalignment cost
 *
 * Port of: angle_alignment_cost(objs, others, others_tags) in constraint_language/geometry.py
 * Computes angular misalignment cost between two object sets.
 */
export class AngleAlignmentCost extends GeometryPredicate {
  readonly type = 'AngleAlignmentCost';
  readonly predicateType = 'AngleAlignmentCost';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly others: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['others', this.others]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const objIds = this.objs.evaluate(state);
    const otherIds = this.others.evaluate(state);
    const objects = retrieveSpatialObjects(state, objIds);
    const otherObjs = retrieveSpatialObjects(state, otherIds);
    if (objects.length === 0 || otherObjs.length === 0) return 0;

    // Compute average forward directions for each set
    let totalCost = 0;
    let count = 0;

    for (const a of objects) {
      const fwdA = getForward(a);
      for (const b of otherObjs) {
        const fwdB = getForward(b);
        // Angular misalignment = 1 - |cos(angle)| between forward directions
        const cosAngle = Math.abs(dot(fwdA, fwdB));
        totalCost += 1 - cosAngle;
        count++;
      }
    }

    return count > 0 ? totalCost / count : 0;
  }

  clone(): AngleAlignmentCost {
    return new AngleAlignmentCost(
      this.objs.clone() as ObjectSetExpression,
      this.others.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `AngleAlignmentCost(${this.objs}, ${this.others})`;
  }
}
