/**
 * Room-Specific Geometry Predicates
 *
 * Ports: infinigen/core/constraints/constraint_language/rooms.py
 *
 * These predicates are used by the room constraint system for evaluating
 * floor plan quality, room adjacency, and architectural constraints.
 *
 * Missing from the R3F port vs the original:
 *  - grid_line_count: Counts grid lines in a room direction
 *  - narrowness: Erosion-based narrowness metric
 *  - graph_coherent: Checks room graph matches adjacency
 *  - rand: NLL of integer sample distribution
 *  - shared_length: Shared wall length between rooms
 *  - shared_n_verts: Shared vertices between rooms
 *  - intersection: Intersection area between rooms
 *  - access_angle: Angle from root to room
 *  - same_level: Rooms on same floor
 *  - area: Room contour area
 *  - aspect_ratio: Room aspect ratio (always >= 1)
 *  - convexity: Bounding box ratio
 *  - n_verts: Number of contour vertices
 *  - length: Circumference
 */

import { Node, Variable } from './types';
import { ScalarExpression } from './expression';
import { ObjectSetExpression } from './set-reasoning';
import {
  SpatialObject,
  retrieveSpatialObjects,
  toVec3,
  distance as spatialDistance,
  getAABB,
  aabbOverlapAreaXZ,
  dot,
  normalize,
  sub,
} from './spatial-helpers';

// ============================================================================
// Room Polygon Interface
// ============================================================================

/**
 * Represents a 2D room polygon (contour) for room constraint evaluation.
 * Compatible with both Shapely-like polygons and simple vertex arrays.
 */
export interface RoomPolygon {
  /** Ordered vertices of the room contour (x, z) */
  vertices: [number, number][];
  /** Optional room tags */
  tags?: Set<string>;
  /** Room name/ID */
  name?: string;
  /** Floor level (0 = ground) */
  floor?: number;
}

// ============================================================================
// Room Geometry Predicates
// ============================================================================

/**
 * Area - Room contour area
 *
 * Ports: area(objs) in constraint_language/rooms.py
 * Computes the area of a room's 2D polygon using the shoelace formula.
 */
export class RoomArea extends ScalarExpression {
  readonly type = 'RoomArea';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 3) return 0;
    return shoelaceArea(polygon.vertices);
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomArea { return new RoomArea(this.objs.clone() as ObjectSetExpression); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return null;
    // Try to get polygon from state metadata
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    if (poly) return poly as RoomPolygon;
    // Fallback: compute from AABB
    const aabb = getAABB(objs[0]);
    return {
      vertices: [
        [aabb.min[0], aabb.min[2]],
        [aabb.max[0], aabb.min[2]],
        [aabb.max[0], aabb.max[2]],
        [aabb.min[0], aabb.max[2]],
      ],
    };
  }
}

/**
 * AspectRatio - Room aspect ratio (always >= 1)
 *
 * Ports: aspect_ratio(objs) in constraint_language/rooms.py
 * Computes the ratio of the longer dimension to the shorter dimension.
 */
export class RoomAspectRatio extends ScalarExpression {
  readonly type = 'RoomAspectRatio';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 3) return 1;
    const bbox = polygonBBox(polygon.vertices);
    const dx = bbox.maxX - bbox.minX;
    const dz = bbox.maxZ - bbox.minZ;
    if (dx <= 0 || dz <= 0) return 1;
    return Math.max(dx / dz, dz / dx);
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomAspectRatio { return new RoomAspectRatio(this.objs.clone() as ObjectSetExpression); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return null;
    const aabb = getAABB(objs[0]);
    return {
      vertices: [
        [aabb.min[0], aabb.min[2]],
        [aabb.max[0], aabb.min[2]],
        [aabb.max[0], aabb.max[2]],
        [aabb.min[0], aabb.max[2]],
      ],
    };
  }
}

/**
 * Convexity - Bounding box ratio (area / convex hull area)
 *
 * Ports: convexity(objs) in constraint_language/rooms.py
 * Returns ratio of polygon area to its bounding box area.
 * 1.0 = rectangular, lower = more irregular shape.
 */
export class RoomConvexity extends ScalarExpression {
  readonly type = 'RoomConvexity';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 3) return 1;
    const area = shoelaceArea(polygon.vertices);
    const bbox = polygonBBox(polygon.vertices);
    const bboxArea = (bbox.maxX - bbox.minX) * (bbox.maxZ - bbox.minZ);
    return bboxArea > 0 ? area / bboxArea : 1;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomConvexity { return new RoomConvexity(this.objs.clone() as ObjectSetExpression); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return null;
    const aabb = getAABB(objs[0]);
    return {
      vertices: [
        [aabb.min[0], aabb.min[2]],
        [aabb.max[0], aabb.min[2]],
        [aabb.max[0], aabb.max[2]],
        [aabb.min[0], aabb.max[2]],
      ],
    };
  }
}

/**
 * NumVertices - Number of contour vertices
 *
 * Ports: n_verts(objs) in constraint_language/rooms.py
 */
export class RoomNumVertices extends ScalarExpression {
  readonly type = 'RoomNumVertices';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    return polygon ? polygon.vertices.length : 4;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomNumVertices { return new RoomNumVertices(this.objs.clone() as ObjectSetExpression); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    return poly as RoomPolygon | null;
  }
}

/**
 * Circumference - Room polygon perimeter length
 *
 * Ports: length(objs) in constraint_language/rooms.py
 */
export class RoomCircumference extends ScalarExpression {
  readonly type = 'RoomCircumference';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 2) return 0;
    return polygonPerimeter(polygon.vertices);
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomCircumference { return new RoomCircumference(this.objs.clone() as ObjectSetExpression); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    if (poly) return poly as RoomPolygon;
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length === 0) return null;
    const aabb = getAABB(objs[0]);
    return {
      vertices: [
        [aabb.min[0], aabb.min[2]],
        [aabb.max[0], aabb.min[2]],
        [aabb.max[0], aabb.max[2]],
        [aabb.min[0], aabb.max[2]],
      ],
    };
  }
}

/**
 * SharedLength - Shared wall length between two rooms
 *
 * Ports: shared_length(objs, objs_) in constraint_language/rooms.py
 * Computes the length of the shared boundary between two rooms.
 */
export class RoomSharedLength extends ScalarExpression {
  readonly type = 'RoomSharedLength';

  constructor(
    public readonly room1: ObjectSetExpression,
    public readonly room2: ObjectSetExpression
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const poly1 = this.getRoomPolygon(state, this.room1);
    const poly2 = this.getRoomPolygon(state, this.room2);
    if (!poly1 || !poly2) return 0;

    // Find shared edges: edges where both endpoints are within tolerance
    let sharedLen = 0;
    const tol = 0.05;
    for (let i = 0; i < poly1.vertices.length; i++) {
      const a1 = poly1.vertices[i];
      const a2 = poly1.vertices[(i + 1) % poly1.vertices.length];
      for (let j = 0; j < poly2.vertices.length; j++) {
        const b1 = poly2.vertices[j];
        const b2 = poly2.vertices[(j + 1) % poly2.vertices.length];
        // Check if edges overlap (same or reversed direction)
        if (
          (ptDist(a1, b1) < tol && ptDist(a2, b2) < tol) ||
          (ptDist(a1, b2) < tol && ptDist(a2, b1) < tol)
        ) {
          sharedLen += edgeLength(a1, a2);
        }
      }
    }
    return sharedLen;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['room1', this.room1], ['room2', this.room2]]); }
  clone(): RoomSharedLength {
    return new RoomSharedLength(
      this.room1.clone() as ObjectSetExpression,
      this.room2.clone() as ObjectSetExpression
    );
  }

  private getRoomPolygon(state: Map<Variable, any>, objs: ObjectSetExpression): RoomPolygon | null {
    const ids = objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    return poly as RoomPolygon | null;
  }
}

/**
 * IntersectionArea - Intersection area between two rooms
 *
 * Ports: intersection(objs, objs_) in constraint_language/rooms.py
 */
export class RoomIntersectionArea extends ScalarExpression {
  readonly type = 'RoomIntersectionArea';

  constructor(
    public readonly room1: ObjectSetExpression,
    public readonly room2: ObjectSetExpression
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const poly1 = this.getRoomPolygon(state, this.room1);
    const poly2 = this.getRoomPolygon(state, this.room2);
    if (!poly1 || !poly2) return 0;

    // Compute approximate intersection via Sutherland-Hodgman clipping
    const clipped = sutherlandHodgmanClip(poly1.vertices, poly2.vertices);
    if (clipped.length < 3) return 0;
    return shoelaceArea(clipped);
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['room1', this.room1], ['room2', this.room2]]); }
  clone(): RoomIntersectionArea {
    return new RoomIntersectionArea(
      this.room1.clone() as ObjectSetExpression,
      this.room2.clone() as ObjectSetExpression
    );
  }

  private getRoomPolygon(state: Map<Variable, any>, objs: ObjectSetExpression): RoomPolygon | null {
    const ids = objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    return poly as RoomPolygon | null;
  }
}

/**
 * Narrowness - Erosion-based narrowness metric
 *
 * Ports: narrowness(objs, constants, thresh) in constraint_language/rooms.py
 * Compares original circumference with eroded circumference.
 * Higher values = narrower room (more narrow passages).
 */
export class RoomNarrowness extends ScalarExpression {
  readonly type = 'RoomNarrowness';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly erosionDistance: number = 0.5
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 3) return 0;

    const originalPerimeter = polygonPerimeter(polygon.vertices);
    // Simplified erosion: shrink polygon by moving each edge inward
    const eroded = erodePolygon(polygon.vertices, this.erosionDistance);
    if (eroded.length < 3) return 1; // Fully eroded = very narrow
    const erodedPerimeter = polygonPerimeter(eroded);
    const originalArea = shoelaceArea(polygon.vertices);
    const erodedArea = shoelaceArea(eroded);

    // Narrowness = circumference difference / original area
    if (originalArea <= 0) return 0;
    return (originalPerimeter - erodedPerimeter) / originalArea;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomNarrowness { return new RoomNarrowness(this.objs.clone() as ObjectSetExpression, this.erosionDistance); }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    return poly as RoomPolygon | null;
  }
}

/**
 * GridLineCount - Counts grid lines passing through a room in a direction
 *
 * Ports: grid_line_count(objs, constants, direction) in constraint_language/rooms.py
 * Used to ensure rooms have enough wall segments for door/window placement.
 */
export class RoomGridLineCount extends ScalarExpression {
  readonly type = 'RoomGridLineCount';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly direction: 'x' | 'z' = 'x',
    public readonly gridUnit: number = 0.5
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const polygon = this.getRoomPolygon(state);
    if (!polygon || polygon.vertices.length < 3) return 0;

    const bbox = polygonBBox(polygon.vertices);
    const minVal = this.direction === 'x' ? bbox.minX : bbox.minZ;
    const maxVal = this.direction === 'x' ? bbox.maxX : bbox.maxZ;

    // Count grid lines that cross through the polygon
    let count = 0;
    for (let v = Math.ceil(minVal / this.gridUnit) * this.gridUnit; v < maxVal; v += this.gridUnit) {
      // Check if this grid line intersects the polygon
      if (gridLineCrossesPolygon(polygon.vertices, v, this.direction)) {
        count++;
      }
    }
    return count;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomGridLineCount {
    return new RoomGridLineCount(
      this.objs.clone() as ObjectSetExpression,
      this.direction,
      this.gridUnit
    );
  }

  private getRoomPolygon(state: Map<Variable, any>): RoomPolygon | null {
    const ids = this.objs.evaluate(state);
    const poly = (state as any).get('__room_polygon_' + Array.from(ids)[0]);
    return poly as RoomPolygon | null;
  }
}

/**
 * AccessAngle - Angle from root room to this room
 *
 * Ports: access_angle(objs) in constraint_language/rooms.py
 */
export class RoomAccessAngle extends ScalarExpression {
  readonly type = 'RoomAccessAngle';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly root: ObjectSetExpression
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const roomIds = this.objs.evaluate(state);
    const rootIds = this.root.evaluate(state);
    const roomObjs = retrieveSpatialObjects(state, roomIds);
    const rootObjs = retrieveSpatialObjects(state, rootIds);
    if (roomObjs.length === 0 || rootObjs.length === 0) return 0;

    // Angle from root center to room center
    const rootCenter = objectCenter2D(rootObjs[0]);
    const roomCenter = objectCenter2D(roomObjs[0]);
    return Math.atan2(roomCenter[1] - rootCenter[1], roomCenter[0] - rootCenter[0]);
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs], ['root', this.root]]); }
  clone(): RoomAccessAngle {
    return new RoomAccessAngle(
      this.objs.clone() as ObjectSetExpression,
      this.root.clone() as ObjectSetExpression
    );
  }
}

/**
 * SameLevel - Boolean check if rooms are on the same floor
 *
 * Ports: same_level(objs) in constraint_language/rooms.py
 */
export class RoomSameLevel extends ScalarExpression {
  readonly type = 'RoomSameLevel';

  constructor(public readonly objs: ObjectSetExpression) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    const ids = this.objs.evaluate(state);
    const objs = retrieveSpatialObjects(state, ids);
    if (objs.length <= 1) return 1; // Single room is trivially same level

    // Check if all objects have approximately the same Y position
    const yPositions = objs.map(o => toVec3(o.position)[1]);
    const minY = Math.min(...yPositions);
    const maxY = Math.max(...yPositions);
    return maxY - minY < 0.5 ? 1 : 0; // Within 0.5m = same floor
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomSameLevel { return new RoomSameLevel(this.objs.clone() as ObjectSetExpression); }
}

/**
 * GraphCoherent - Check if room adjacency graph matches actual layout
 *
 * Ports: graph_coherent(constants) in constraint_language/rooms.py
 * Returns 1 if the layout graph is coherent (neighbors actually share walls), 0 otherwise.
 */
export class RoomGraphCoherent extends ScalarExpression {
  readonly type = 'RoomGraphCoherent';

  constructor(
    public readonly objs: ObjectSetExpression,
    public readonly adjacencyPairs: [string, string][]
  ) {
    super();
  }

  evaluate(state: Map<Variable, any>): number {
    // For each adjacency pair, check if the rooms share a wall
    let coherent = 0;
    for (const [id1, id2] of this.adjacencyPairs) {
      const poly1 = (state as any).get('__room_polygon_' + id1) as RoomPolygon | undefined;
      const poly2 = (state as any).get('__room_polygon_' + id2) as RoomPolygon | undefined;
      if (poly1 && poly2 && roomsShareWall(poly1, poly2)) {
        coherent++;
      }
    }
    // Return fraction of coherent adjacencies
    return this.adjacencyPairs.length > 0 ? coherent / this.adjacencyPairs.length : 1;
  }

  domain() { return new (require('./types').NumericDomain)(); }
  children(): Map<string, Node> { return new Map([['objs', this.objs]]); }
  clone(): RoomGraphCoherent {
    return new RoomGraphCoherent(this.objs.clone() as ObjectSetExpression, [...this.adjacencyPairs]);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Shoelace formula for 2D polygon area */
function shoelaceArea(vertices: [number, number][]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i][0] * vertices[j][1];
    area -= vertices[j][0] * vertices[i][1];
  }
  return Math.abs(area) / 2;
}

/** Polygon bounding box */
function polygonBBox(vertices: [number, number][]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of vertices) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** Polygon perimeter */
function polygonPerimeter(vertices: [number, number][]): number {
  let length = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    length += edgeLength(vertices[i], vertices[j]);
  }
  return length;
}

/** Edge length */
function edgeLength(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Point distance */
function ptDist(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Object center in 2D (XZ) */
function objectCenter2D(obj: SpatialObject): [number, number] {
  const p = toVec3(obj.position);
  const aabb = getAABB(obj);
  return [(aabb.min[0] + aabb.max[0]) / 2, (aabb.min[2] + aabb.max[2]) / 2];
}

/** Simple polygon erosion by moving edges inward */
function erodePolygon(vertices: [number, number][], distance: number): [number, number][] {
  if (vertices.length < 3) return [];
  const n = vertices.length;
  const result: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i + n - 1) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    // Edge directions
    const dx1 = curr[0] - prev[0], dz1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0], dz2 = next[1] - curr[1];
    const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1);
    const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);

    if (len1 < 1e-10 || len2 < 1e-10) continue;

    // Inward normals (assuming CCW winding)
    const nx1 = -dz1 / len1, nz1 = dx1 / len1;
    const nx2 = -dz2 / len2, nz2 = dx2 / len2;

    // Bisector
    const bx = nx1 + nx2, bz = nz1 + nz2;
    const bLen = Math.sqrt(bx * bx + bz * bz);

    if (bLen < 1e-10) continue;

    // Offset along bisector
    const dot = nx1 * nx2 + nz1 * nz2;
    const sinHalf = Math.sqrt(Math.max(0, (1 - dot) / 2));
    const offsetDist = sinHalf > 1e-10 ? distance / sinHalf : distance;

    const newX = curr[0] + (bx / bLen) * offsetDist;
    const newZ = curr[1] + (bz / bLen) * offsetDist;
    result.push([newX, newZ]);
  }

  return result;
}

/** Check if a grid line crosses a polygon */
function gridLineCrossesPolygon(vertices: [number, number][], linePos: number, direction: 'x' | 'z'): boolean {
  let crossings = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const v1 = direction === 'x' ? vertices[i][0] : vertices[i][1];
    const v2 = direction === 'x' ? vertices[j][0] : vertices[j][1];
    if ((v1 <= linePos && v2 > linePos) || (v2 <= linePos && v1 > linePos)) {
      crossings++;
    }
  }
  return crossings > 0;
}

/** Check if two rooms share a wall */
function roomsShareWall(r1: RoomPolygon, r2: RoomPolygon): boolean {
  const tol = 0.1;
  for (let i = 0; i < r1.vertices.length; i++) {
    const a1 = r1.vertices[i];
    const a2 = r1.vertices[(i + 1) % r1.vertices.length];
    for (let j = 0; j < r2.vertices.length; j++) {
      const b1 = r2.vertices[j];
      const b2 = r2.vertices[(j + 1) % r2.vertices.length];
      if (
        (ptDist(a1, b1) < tol && ptDist(a2, b2) < tol) ||
        (ptDist(a1, b2) < tol && ptDist(a2, b1) < tol)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Sutherland-Hodgman polygon clipping */
function sutherlandHodgmanClip(
  subject: [number, number][],
  clip: [number, number][]
): [number, number][] {
  let output = [...subject];
  const n = clip.length;

  for (let i = 0; i < n; i++) {
    if (output.length === 0) return [];
    const input = [...output];
    output = [];

    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % n];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];

      const currentInside = isInside(current, edgeStart, edgeEnd);
      const previousInside = isInside(previous, edgeStart, edgeEnd);

      if (currentInside) {
        if (!previousInside) {
          const intersection = lineIntersection(previous, current, edgeStart, edgeEnd);
          if (intersection) output.push(intersection);
        }
        output.push(current);
      } else if (previousInside) {
        const intersection = lineIntersection(previous, current, edgeStart, edgeEnd);
        if (intersection) output.push(intersection);
      }
    }
  }

  return output;
}

function isInside(point: [number, number], edgeStart: [number, number], edgeEnd: [number, number]): boolean {
  return (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1]) -
         (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0]) >= 0;
}

function lineIntersection(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number]
): [number, number] | null {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
