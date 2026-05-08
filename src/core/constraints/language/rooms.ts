/**
 * Constraint Language - Room-Specific Constraints
 *
 * Helper functions and predicates for indoor scene generation,
 * room layout, and architectural constraints.
 * Ported from: constraint_language/rooms.py
 */

import type { ConstraintNode, ExpressionNode, Variable, Domain, Node } from './types';
import type { ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain } from './types';
import {
  AndRelations,
  OrRelations,
  Touching,
  SupportedBy,
  CoPlanar,
  Facing,
  Between,
  AccessibleFrom,
  ReachableFrom,
  InFrontOf,
  Aligned,
  Hidden,
  Visible,
  Containment,
  Proximity,
} from './relations';
import {
  Distance,
  Clearance,
  VisibilityScore,
  AccessibilityCost,
  ReachabilityScore,
} from './geometry';
import {
  ObjectSetConstant,
  ObjectSetVariable,
  FilterObjects,
  TagCondition,
  UnionObjects,
  IntersectionObjects,
  ForAll,
  Exists,
  SumOver,
  ObjectSetExpression,
} from './set-reasoning';
import { item, tagged, SceneExpression, SCENE } from './constants';
import { ScalarExpression } from './expression';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance as spatialDistance,
  getAABB,
  aabbOverlapAreaXZ,
  angleBetween,
  normalize,
  sub,
} from './spatial-helpers';
import type { SemanticsTag, RoomTag, FunctionTag } from '../tags';

/**
 * Room function types for constraint-based room generation
 */
export type RoomFunction =
  | 'sleeping'
  | 'cooking'
  | 'dining'
  | 'working'
  | 'relaxing'
  | 'bathing'
  | 'storage'
  | 'circulation'
  | 'entrance'
  | 'laundry'
  | 'hobby';

/**
 * Room privacy levels
 */
export type PrivacyLevel = 'public' | 'semi-private' | 'private';

/**
 * Room adjacency requirements
 */
export interface RoomAdjacency {
  /** Rooms that should be adjacent/nearby */
  preferredNeighbors?: RoomFunction[];
  /** Rooms that must be adjacent/nearby */
  requiredNeighbors?: RoomFunction[];
  /** Rooms that should NOT be adjacent */
  excludedNeighbors?: RoomFunction[];
  /** Minimum distance to specific room types */
  minDistances?: Record<RoomFunction, number>;
  /** Maximum distance to specific room types */
  maxDistances?: Record<RoomFunction, number>;
}

/**
 * Create a room-specific object set filtered by room tag
 */
export function objectsInRoom<T extends string>(
  roomTag: RoomTag | T,
  objectType?: SemanticsTag | string
): ObjectSetExpression {
  const baseFilter = TagCondition.fromKeyValue('room', roomTag as string);
  
  if (objectType) {
    const combinedFilter = new AndRelations([
      baseFilter as any,
      TagCondition.fromKeyValue('semantics', objectType as string) as any
    ]);
    return new FilterObjects(SCENE, combinedFilter as any);
  }
  
  return new FilterObjects(SCENE, baseFilter as any);
}

/**
 * Get all objects with a specific room function
 */
export function objectsWithFunction(functionType: RoomFunction): ObjectSetExpression {
  return new FilterObjects(
    SCENE,
    TagCondition.fromKeyValue('function', functionType) as any
  );
}

/**
 * Constraint: Object must be in a specific room
 */
export function InRoom(
  object: Variable | string,
  roomTag: RoomTag | string
): ConstraintNode {
  const objVar = typeof object === 'string' ? item(object) : object;
  
  return TagCondition.fromKeyValue('room', roomTag as string) as any;
}

/**
 * Constraint: Two rooms must be adjacent (share a wall or be connected)
 */
export function RoomsAdjacent(
  room1: RoomTag | string,
  room2: RoomTag | string
): ConstraintNode {
  // Objects from room1 should be touching or very close to objects from room2
  const room1Objects = objectsInRoom(room1);
  const room2Objects = objectsInRoom(room2);
  
  // At least some objects from each room should be touching or within threshold
  return new Exists(undefined as any, room1Objects, undefined as any) as any;
}

/**
 * Constraint: Two rooms must NOT be adjacent
 */
export function RoomsNotAdjacent(
  room1: RoomTag | string,
  room2: RoomTag | string,
  minDistance: number = 2.0
): ConstraintNode {
  const room1Objects = objectsInRoom(room1);
  const room2Objects = objectsInRoom(room2);
  
  // All objects from room1 should be at least minDistance from room2 objects
  return new ForAll(undefined as any, room1Objects, undefined as any) as any;
}

/**
 * Constraint: Room must have access to entrance
 */
export function RoomHasEntranceAccess(
  roomTag: RoomTag | string,
  maxDistance: number = 10.0
): ConstraintNode {
  const roomObjects = objectsInRoom(roomTag);
  const entranceObjects = objectsWithFunction('entrance');
  
  return new Exists(undefined as any, roomObjects, undefined as any) as any;
}

/**
 * Constraint: Room must have natural light (visible from windows)
 */
export function RoomHasNaturalLight(
  roomTag: RoomTag | string,
  minVisibleWindows: number = 1
): ConstraintNode {
  const roomObjects = objectsInRoom(roomTag);
  const windowObjects = new FilterObjects(
    SCENE,
    TagCondition.fromKeyValue('semantics', 'window') as any
  );
  
  // Count visible windows from room objects
  const visibleWindows = new SumOver(undefined as any, windowObjects, undefined as any) as any;
  
  return new Proximity(visibleWindows as any, minVisibleWindows as any) as any;
}

/**
 * Constraint: Furniture arrangement within a room
 */
export function ArrangeFurnitureInRoom(
  roomTag: RoomTag | string,
  furnitureTypes: SemanticsTag[],
  options: {
    minClearance?: number;
    groupRelated?: boolean;
    faceCenter?: boolean;
  } = {}
): ConstraintNode[] {
  const constraints: ConstraintNode[] = [];
  const { minClearance = 0.6, groupRelated = true, faceCenter = false } = options;
  
  const roomObjects = objectsInRoom(roomTag);
  
  // Create variables for each furniture type
  const furnitureVars = furnitureTypes.map((type, idx) => item(`furniture_${idx}`));
  
  // Each furniture piece must be in the room
  furnitureVars.forEach((furnVar, idx) => {
    constraints.push(TagCondition.fromKeyValue('semantics', furnitureTypes[idx] as any as string) as any);
    constraints.push(TagCondition.fromKeyValue('room', roomTag as string) as any);
  });
  
  // Minimum clearance between furniture
  if (minClearance > 0) {
    for (let i = 0; i < furnitureVars.length; i++) {
      for (let j = i + 1; j < furnitureVars.length; j++) {
        constraints.push(
          new Proximity(furnitureVars[i], furnitureVars[j], minClearance)
        );
      }
    }
  }
  
  // Group related furniture (e.g., desk and chair)
  if (groupRelated && furnitureVars.length >= 2) {
    constraints.push(
      new Proximity(furnitureVars[0], furnitureVars[1], 1.0)
    );
  }
  
  // Face room center
  if (faceCenter && furnitureVars.length > 0) {
    // Simplified: just add a constraint that furniture should face inward
    furnitureVars.forEach(furnVar => {
      constraints.push(
        new Facing(furnVar, undefined as any)
      );
    });
  }
  
  return constraints;
}

/**
 * Constraint: Traffic flow path through rooms
 */
export function TrafficFlowPath(
  startRoom: RoomTag | string,
  endRoom: RoomTag | string,
  intermediateRooms?: (RoomTag | string)[],
  options: {
    minWidth?: number;
    maxHeightDifference?: number;
  } = {}
): ConstraintNode {
  const { minWidth = 0.8, maxHeightDifference = 0.3 } = options;
  
  const startObjects = objectsInRoom(startRoom);
  const endObjects = objectsInRoom(endRoom);
  
  // Basic accessibility constraint
  let pathConstraint: ConstraintNode = new Exists(undefined as any, startObjects, undefined as any) as any;
  
  // Add intermediate room constraints
  if (intermediateRooms && intermediateRooms.length > 0) {
    const intermediateConstraints = intermediateRooms.map(room => {
      const roomObjects = objectsInRoom(room);
      return new Exists(undefined as any, roomObjects, undefined as any) as any;
    });
    
    pathConstraint = new AndRelations([pathConstraint as any, ...intermediateConstraints as any[]]) as any;
  }
  
  return pathConstraint;
}

/**
 * Constraint: Room privacy hierarchy
 */
export function PrivacyHierarchy(
  publicRooms: (RoomTag | string)[],
  privateRooms: (RoomTag | string)[],
  options: {
    bufferZone?: boolean;
    minSeparation?: number;
  } = {}
): ConstraintNode[] {
  const { bufferZone = true, minSeparation = 3.0 } = options;
  const constraints: ConstraintNode[] = [];
  
  // Private rooms should not be directly accessible from public rooms
  publicRooms.forEach(publicRoom => {
    privateRooms.forEach(privateRoom => {
      if (bufferZone) {
        // Require separation
        constraints.push(RoomsNotAdjacent(publicRoom, privateRoom, minSeparation));
      } else {
        // Just not adjacent
        constraints.push(RoomsNotAdjacent(publicRoom, privateRoom, 1.5));
      }
    });
  });
  
  return constraints;
}

/**
 * Constraint: Functional zones within a room
 */
export function FunctionalZones(
  roomTag: RoomTag | string,
  zones: Array<{
    function: FunctionTag | string;
    objects: SemanticsTag[];
    area?: number;
    position?: 'center' | 'corner' | 'wall';
  }>
): ConstraintNode[] {
  const constraints: ConstraintNode[] = [];
  
  zones.forEach((zone, zoneIdx) => {
    const zonePrefix = `zone_${zoneIdx}_`;
    
    // Tag objects with zone function
    zone.objects.forEach((objType, objIdx) => {
      const objVar = item(`${zonePrefix}${objIdx}`);
      constraints.push(TagCondition.fromKeyValue('semantics', objType as any as string) as any);
      constraints.push(TagCondition.fromKeyValue('function', zone.function as any as string) as any);
      constraints.push(TagCondition.fromKeyValue('room', roomTag as string) as any);
    });
    
    // Group zone objects together
    if (zone.objects.length > 1) {
      for (let i = 0; i < zone.objects.length - 1; i++) {
        constraints.push(
          new Proximity(
            item(`${zonePrefix}${i}`),
            item(`${zonePrefix}${i + 1}`),
            1.5
          )
        );
      }
    }
    
    // Position constraints
    if (zone.position === 'corner') {
      // Objects should be near room boundaries
      zone.objects.forEach((_, idx) => {
        // Would need room boundary information
        // Simplified: just note this as a future enhancement
      });
    } else if (zone.position === 'wall') {
      // Objects should be against walls
      zone.objects.forEach((_, idx) => {
        // Would need wall detection
      });
    }
  });
  
  // Separate different zones
  for (let i = 0; i < zones.length - 1; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const zone1Prefix = `zone_${i}_`;
      const zone2Prefix = `zone_${j}_`;
      
      // Add separation between zones
      constraints.push(
        new Proximity(
          item(`${zone1Prefix}0`),
          item(`${zone2Prefix}0`),
          2.0
        )
      );
    }
  }
  
  return constraints;
}

/**
 * Helper: Create a complete room definition with common constraints
 */
export function defineRoom(
  name: string,
  roomFunction: RoomFunction,
  privacy: PrivacyLevel,
  adjacency: RoomAdjacency,
  requiredObjects: Array<{
    type: SemanticsTag | string;
    count?: number;
    constraints?: ConstraintNode[];
  }> = []
): {
  roomTag: RoomTag;
  constraints: ConstraintNode[];
  objects: Variable[];
} {
  const roomTag: RoomTag = name as unknown as RoomTag;
  const constraints: ConstraintNode[] = [];
  const objects: Variable[] = [];
  
  // Tag the room itself
  constraints.push(TagCondition.fromKeyValue('room', name) as any);
  constraints.push(TagCondition.fromKeyValue('function', roomFunction) as any);
  constraints.push(TagCondition.fromKeyValue('privacy', privacy) as any);
  
  // Add adjacency constraints
  if (adjacency.requiredNeighbors) {
    adjacency.requiredNeighbors.forEach(neighbor => {
      constraints.push(RoomsAdjacent(name, neighbor));
    });
  }
  
  if (adjacency.excludedNeighbors) {
    adjacency.excludedNeighbors.forEach(neighbor => {
      constraints.push(RoomsNotAdjacent(name, neighbor, 2.0));
    });
  }
  
  // Add required objects
  requiredObjects.forEach((req, idx) => {
    const count = req.count ?? 1;
    for (let i = 0; i < count; i++) {
      const objVar = item(`${name}_${req.type}_${i}`);
      objects.push(objVar as any);
      constraints.push(TagCondition.fromKeyValue('semantics', req.type as string) as any);
      constraints.push(TagCondition.fromKeyValue('room', name) as any);
      
      if (req.constraints) {
        constraints.push(...req.constraints);
      }
    }
  });
  
  // Add entrance access requirement
  constraints.push(RoomHasEntranceAccess(name));
  
  return { roomTag, constraints, objects };
}

/**
 * Utility: Check if a room configuration is valid
 */
export function validateRoomConfig(
  roomFunction: RoomFunction,
  objects: SemanticsTag[],
  roomSize?: { width: number; height: number; depth: number }
): {
  valid: boolean;
  issues: string[];
  suggestions: string[];
} {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  // Common room requirements
  const requiredByFunction: Record<RoomFunction, string[]> = {
    sleeping: ['bed', 'nightstand'],
    cooking: ['stove', 'sink', 'counter'],
    dining: ['table', 'chair'],
    working: ['desk', 'chair'],
    relaxing: ['sofa', 'chair'],
    bathing: ['toilet', 'sink', 'shower'],
    storage: ['shelf', 'cabinet'],
    circulation: [],
    entrance: ['door'],
    laundry: ['washer', 'dryer'],
    hobby: ['table', 'chair']
  };
  
  const required = requiredByFunction[roomFunction] || [];
  
  required.forEach(reqObj => {
    if (!(objects as any[]).includes(reqObj)) {
      issues.push(`Missing required object: ${reqObj}`);
      suggestions.push(`Add ${reqObj} for ${roomFunction} room`);
    }
  });
  
  // Size recommendations
  const minSizes: Record<RoomFunction, number> = {
    sleeping: 9.0,      // 9 m² minimum
    cooking: 6.0,       // 6 m² minimum
    dining: 8.0,        // 8 m² minimum
    working: 7.0,       // 7 m² minimum
    relaxing: 12.0,     // 12 m² minimum
    bathing: 4.0,       // 4 m² minimum
    storage: 3.0,       // 3 m² minimum
    circulation: 2.0,   // 2 m² minimum
    entrance: 3.0,      // 3 m² minimum
    laundry: 4.0,       // 4 m² minimum
    hobby: 8.0          // 8 m² minimum
  };
  
  if (roomSize) {
    const area = roomSize.width * roomSize.depth;
    const minArea = minSizes[roomFunction] || 5.0;
    
    if (area < minArea) {
      issues.push(`Room too small: ${area.toFixed(1)} m² (minimum: ${minArea} m²)`);
      suggestions.push(`Increase room size to at least ${minArea} m²`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    suggestions
  };
}

// ============================================================================
// Room-Specific Scalar Expressions
// Ported from: constraint_language/rooms.py
//
// These scalar expressions compute room-specific metrics using AABB
// approximations (since we don't have Shapely polygon support in the browser).
// ============================================================================

/**
 * RoomArea - Computes area from ObjectState.polygon or AABB footprint
 *
 * Port of: area(objs) in constraint_language/rooms.py
 * Returns the total XZ footprint area of all objects in the set.
 */
export class RoomArea extends ScalarExpression {
  readonly type = 'RoomArea';

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

    let totalArea = 0;
    for (const obj of objects) {
      // Check if ObjectState has polygon data
      const objState = (state as Map<any, any>).get('__solverState');
      if (objState && typeof objState === 'object' && 'objects' in (objState as object)) {
        const os = (objState as any).objects.get(obj.id);
        if (os && os.polygon && Array.isArray(os.polygon) && os.polygon.length >= 3) {
          // Compute polygon area using the shoelace formula
          totalArea += this.polygonArea(os.polygon);
          continue;
        }
      }
      // Fallback: AABB footprint area
      const aabb = getAABB(obj);
      const dx = Math.max(0, aabb.max[0] - aabb.min[0]);
      const dz = Math.max(0, aabb.max[2] - aabb.min[2]);
      totalArea += dx * dz;
    }
    return totalArea;
  }

  clone(): RoomArea {
    return new RoomArea(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomArea(${this.objs})`;
  }

  /** Shoelace formula for polygon area */
  private polygonArea(vertices: Array<{ x: number; z: number } | [number, number]>): number {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % n];
      const cx = Array.isArray(curr) ? curr[0] : curr.x;
      const cz = Array.isArray(curr) ? curr[1] : curr.z;
      const nx = Array.isArray(next) ? next[0] : next.x;
      const nz = Array.isArray(next) ? next[1] : next.z;
      area += cx * nz - nx * cz;
    }
    return Math.abs(area) / 2;
  }
}

/**
 * RoomAspectRatio - max dimension / min dimension of room (≥1)
 *
 * Port of: aspect_ratio(objs) in constraint_language/rooms.py
 * Returns the ratio of the longer XZ dimension to the shorter one.
 */
export class RoomAspectRatio extends ScalarExpression {
  readonly type = 'RoomAspectRatio';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 1;

    // Compute combined bounding box of all objects
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }
    const dx = maxX - minX;
    const dz = maxZ - minZ;
    if (dx <= 0 || dz <= 0) return 1;
    return Math.max(dx, dz) / Math.min(dx, dz);
  }

  clone(): RoomAspectRatio {
    return new RoomAspectRatio(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomAspectRatio(${this.objs})`;
  }
}

/**
 * RoomConvexity - AABB area / actual area ratio
 *
 * Port of: convexity(objs) in constraint_language/rooms.py
 * Returns ratio of bounding box area to room area.
 * 1.0 = perfectly convex/rectangular, >1 = concave.
 */
export class RoomConvexity extends ScalarExpression {
  readonly type = 'RoomConvexity';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 1;

    // Compute AABB area
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }
    const aabbArea = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    if (aabbArea <= 0) return 1;

    // Compute actual area using RoomArea logic
    const roomArea = new RoomArea(this.objs).evaluate(state);
    if (roomArea <= 0) return 1;

    return aabbArea / roomArea;
  }

  clone(): RoomConvexity {
    return new RoomConvexity(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomConvexity(${this.objs})`;
  }
}

/**
 * RoomNVerts - Number of vertices in room polygon (or 4 for AABB)
 *
 * Port of: n_verts(objs) in constraint_language/rooms.py
 */
export class RoomNVerts extends ScalarExpression {
  readonly type = 'RoomNVerts';

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

    // Check if any object has polygon data
    for (const obj of objects) {
      const objState = (state as Map<any, any>).get('__solverState');
      if (objState && typeof objState === 'object' && 'objects' in (objState as object)) {
        const os = (objState as any).objects.get(obj.id);
        if (os && os.polygon && Array.isArray(os.polygon)) {
          return os.polygon.length;
        }
      }
    }

    // Default: AABB has 4 vertices
    return 4;
  }

  clone(): RoomNVerts {
    return new RoomNVerts(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomNVerts(${this.objs})`;
  }
}

/**
 * RoomAccessAngle - Angle between root→room and neighbour→room vectors
 *
 * Port of: access_angle(objs) in constraint_language/rooms.py
 * Measures the angle of approach to a room from its neighbour.
 */
export class RoomAccessAngle extends ScalarExpression {
  readonly type = 'RoomAccessAngle';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly neighbourObjs: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs], ['neighbourObjs', this.neighbourObjs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const neighbourIds = this.neighbourObjs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    const neighbours = retrieveSpatialObjects(state, neighbourIds);
    if (objects.length === 0 || neighbours.length === 0) return 0;

    // Compute centroids
    let cx = 0, cz = 0;
    for (const obj of objects) {
      const p = toVec3(obj.position);
      cx += p[0]; cz += p[2];
    }
    cx /= objects.length;
    cz /= objects.length;

    let nx = 0, nz = 0;
    for (const n of neighbours) {
      const p = toVec3(n.position);
      nx += p[0]; nz += p[2];
    }
    nx /= neighbours.length;
    nz /= neighbours.length;

    // Angle of the vector from neighbour centroid to room centroid
    return Math.atan2(cz - nz, cx - nx);
  }

  clone(): RoomAccessAngle {
    return new RoomAccessAngle(
      this.objs.clone() as ObjectSetExpression,
      this.neighbourObjs.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `RoomAccessAngle(${this.objs}, ${this.neighbourObjs})`;
  }
}

/**
 * RoomSharedLength - Shared boundary length between two rooms
 *
 * Port of: shared_length(objs, objs_) in constraint_language/rooms.py
 * Uses AABB overlap as approximation for shared boundary.
 */
export class RoomSharedLength extends ScalarExpression {
  readonly type = 'RoomSharedLength';

  constructor(
    public readonly objs1: ObjectSetExpression,
    public readonly objs2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs1', this.objs1], ['objs2', this.objs2]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.objs1.evaluate(state);
    const ids2 = this.objs2.evaluate(state);
    const objects1 = retrieveSpatialObjects(state, ids1);
    const objects2 = retrieveSpatialObjects(state, ids2);
    if (objects1.length === 0 || objects2.length === 0) return 0;

    // Compute shared boundary length as XZ overlap perimeter approximation
    let totalShared = 0;
    for (const a of objects1) {
      const aabbA = getAABB(a);
      for (const b of objects2) {
        const aabbB = getAABB(b);
        // Shared boundary ≈ overlap extent along each axis
        const overlapX = Math.max(0, Math.min(aabbA.max[0], aabbB.max[0]) - Math.max(aabbA.min[0], aabbB.min[0]));
        const overlapZ = Math.max(0, Math.min(aabbA.max[2], aabbB.max[2]) - Math.max(aabbA.min[2], aabbB.min[2]));
        if (overlapX > 0 && overlapZ > 0) {
          // Shared edge length is the shorter overlap dimension
          totalShared += Math.min(overlapX, overlapZ);
        }
      }
    }
    return totalShared;
  }

  clone(): RoomSharedLength {
    return new RoomSharedLength(
      this.objs1.clone() as ObjectSetExpression,
      this.objs2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `RoomSharedLength(${this.objs1}, ${this.objs2})`;
  }
}

/**
 * RoomLength - Circumference of room contour
 *
 * Port of: length(objs) in constraint_language/rooms.py
 * Returns the perimeter of the room's bounding contour.
 */
export class RoomLength extends ScalarExpression {
  readonly type = 'RoomLength';

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

    // Check for polygon data
    for (const obj of objects) {
      const objState = (state as Map<any, any>).get('__solverState');
      if (objState && typeof objState === 'object' && 'objects' in (objState as object)) {
        const os = (objState as any).objects.get(obj.id);
        if (os && os.polygon && Array.isArray(os.polygon) && os.polygon.length >= 2) {
          let perimeter = 0;
          const verts = os.polygon;
          for (let i = 0; i < verts.length; i++) {
            const curr = verts[i];
            const next = verts[(i + 1) % verts.length];
            const cx = Array.isArray(curr) ? curr[0] : curr.x;
            const cz = Array.isArray(curr) ? curr[1] : curr.z;
            const nx = Array.isArray(next) ? next[0] : next.x;
            const nz = Array.isArray(next) ? next[1] : next.z;
            perimeter += Math.sqrt((nx - cx) ** 2 + (nz - cz) ** 2);
          }
          return perimeter;
        }
      }
    }

    // Fallback: AABB perimeter
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }
    return 2 * ((maxX - minX) + (maxZ - minZ));
  }

  clone(): RoomLength {
    return new RoomLength(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomLength(${this.objs})`;
  }
}

/**
 * RoomSameLevel - Whether rooms are on same floor level
 *
 * Port of: same_level(objs) in constraint_language/rooms.py
 * Returns 1 if all objects are on the same Y level, 0 otherwise.
 */
export class RoomSameLevel extends ScalarExpression {
  readonly type = 'RoomSameLevel';

  constructor(
    public readonly objs1: ObjectSetExpression,
    public readonly objs2: ObjectSetExpression,
    public readonly tolerance: number = 0.5
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs1', this.objs1], ['objs2', this.objs2]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.objs1.evaluate(state);
    const ids2 = this.objs2.evaluate(state);
    const objects1 = retrieveSpatialObjects(state, ids1);
    const objects2 = retrieveSpatialObjects(state, ids2);
    if (objects1.length === 0 || objects2.length === 0) return 0;

    // Compute average Y for each set
    let y1 = 0;
    for (const obj of objects1) { y1 += toVec3(obj.position)[1]; }
    y1 /= objects1.length;

    let y2 = 0;
    for (const obj of objects2) { y2 += toVec3(obj.position)[1]; }
    y2 /= objects2.length;

    return Math.abs(y1 - y2) <= this.tolerance ? 1 : 0;
  }

  clone(): RoomSameLevel {
    return new RoomSameLevel(
      this.objs1.clone() as ObjectSetExpression,
      this.objs2.clone() as ObjectSetExpression,
      this.tolerance
    );
  }

  toString(): string {
    return `RoomSameLevel(${this.objs1}, ${this.objs2})`;
  }
}

/**
 * RoomIntersection - Intersection area between two room sets
 *
 * Port of: intersection(objs, objs_) in constraint_language/rooms.py
 * Computes XZ overlap area between objects in the two sets.
 */
export class RoomIntersection extends ScalarExpression {
  readonly type = 'RoomIntersection';

  constructor(
    public readonly objs1: ObjectSetExpression,
    public readonly objs2: ObjectSetExpression
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs1', this.objs1], ['objs2', this.objs2]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids1 = this.objs1.evaluate(state);
    const ids2 = this.objs2.evaluate(state);
    const objects1 = retrieveSpatialObjects(state, ids1);
    const objects2 = retrieveSpatialObjects(state, ids2);
    if (objects1.length === 0 || objects2.length === 0) return 0;

    let totalArea = 0;
    for (const a of objects1) {
      const aabbA = getAABB(a);
      for (const b of objects2) {
        const aabbB = getAABB(b);
        totalArea += aabbOverlapAreaXZ(aabbA, aabbB);
      }
    }
    return totalArea;
  }

  clone(): RoomIntersection {
    return new RoomIntersection(
      this.objs1.clone() as ObjectSetExpression,
      this.objs2.clone() as ObjectSetExpression
    );
  }

  toString(): string {
    return `RoomIntersection(${this.objs1}, ${this.objs2})`;
  }
}

/**
 * RoomGridLineCount - Count of unique grid lines in direction
 *
 * Port of: grid_line_count(objs, constants, direction) in constraint_language/rooms.py
 * Counts unique X or Z positions of object boundaries.
 */
export class RoomGridLineCount extends ScalarExpression {
  readonly type = 'RoomGridLineCount';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly direction: 'x' | 'z' = 'x',
    public readonly tolerance: number = 0.1
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    const axisIndex = this.direction === 'x' ? 0 : 2;
    const lines: number[] = [];

    for (const obj of objects) {
      const aabb = getAABB(obj);
      const min = aabb.min[axisIndex];
      const max = aabb.max[axisIndex];

      // Add line if not already present (within tolerance)
      if (!lines.some(l => Math.abs(l - min) < this.tolerance)) {
        lines.push(min);
      }
      if (!lines.some(l => Math.abs(l - max) < this.tolerance)) {
        lines.push(max);
      }
    }

    return lines.length;
  }

  clone(): RoomGridLineCount {
    return new RoomGridLineCount(
      this.objs.clone() as ObjectSetExpression,
      this.direction,
      this.tolerance
    );
  }

  toString(): string {
    return `RoomGridLineCount(${this.objs}, ${this.direction})`;
  }
}

/**
 * RoomNarrowness - Narrowness via erosion approximation
 *
 * Port of: narrowness(objs, constants, thresh) in constraint_language/rooms.py
 * Approximates narrowness by computing minimum width / maximum width ratio.
 * Lower values = more narrow.
 */
export class RoomNarrowness extends ScalarExpression {
  readonly type = 'RoomNarrowness';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly threshold: number = 1.0
  ) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 0;

    // Compute combined bounding box
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const obj of objects) {
      const aabb = getAABB(obj);
      minX = Math.min(minX, aabb.min[0]);
      maxX = Math.max(maxX, aabb.max[0]);
      minZ = Math.min(minZ, aabb.min[2]);
      maxZ = Math.max(maxZ, aabb.max[2]);
    }

    const dx = maxX - minX;
    const dz = maxZ - minZ;
    if (dx <= 0 || dz <= 0) return 0;

    const minWidth = Math.min(dx, dz);
    const maxWidth = Math.max(dx, dz);

    // Narrowness = 1 - (minWidth / maxWidth) when minWidth < threshold
    // More narrow → higher value (approaches 1)
    if (minWidth < this.threshold) {
      return 1 - (minWidth / maxWidth);
    }
    return 0;
  }

  clone(): RoomNarrowness {
    return new RoomNarrowness(
      this.objs.clone() as ObjectSetExpression,
      this.threshold
    );
  }

  toString(): string {
    return `RoomNarrowness(${this.objs}, ${this.threshold})`;
  }
}

/**
 * RoomGraphCoherent - Check coherence with adjacency graph
 *
 * Port of: graph_coherent(constants) in constraint_language/rooms.py
 * Returns 1 if the state is coherent with the room adjacency graph, 0 otherwise.
 */
export class RoomGraphCoherent extends ScalarExpression {
  readonly type = 'RoomGraphCoherent';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  children(): Map<string, Node> {
    return new Map([['objs', this.objs]]);
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objects = retrieveSpatialObjects(state, ids);
    if (objects.length === 0) return 1;

    // Check if state has a room graph
    const stateAny = state as Map<any, any>;
    const roomGraph = stateAny.get('__roomGraph');
    if (!roomGraph || typeof roomGraph !== 'object') return 1; // No graph = assume coherent

    // If graph has a coherence check method, use it
    if (typeof (roomGraph as any).isCoherent === 'function') {
      return (roomGraph as any).isCoherent() ? 1 : 0;
    }

    // Fallback: check that all adjacent rooms in the graph are spatially close
    if (typeof (roomGraph as any).getEdges === 'function') {
      const edges: Array<{ from: string; to: string }> = (roomGraph as any).getEdges();
      for (const edge of edges) {
        const objA = objects.find(o => o.id === edge.from);
        const objB = objects.find(o => o.id === edge.to);
        if (objA && objB) {
          const d = spatialDistance(objA.position, objB.position);
          // If graph says they're adjacent but they're very far apart, incoherent
          if (d > 50) return 0;
        }
      }
    }

    return 1;
  }

  clone(): RoomGraphCoherent {
    return new RoomGraphCoherent(this.objs.clone() as ObjectSetExpression);
  }

  toString(): string {
    return `RoomGraphCoherent(${this.objs})`;
  }
}

