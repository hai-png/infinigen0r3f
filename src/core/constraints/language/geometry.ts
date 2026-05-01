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
