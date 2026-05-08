/**
 * Spatial Helper Types and Functions for Constraint Relations
 *
 * Provides the SpatialObject interface and utility functions for computing
 * spatial relationships between objects (distance, overlap, alignment, etc.)
 */

/**
 * Represents a spatial object with position, rotation, bounding box, and optional forward direction.
 * Compatible with THREE.Vector3, arrays, and plain objects.
 */
export interface SpatialObject {
  /** Object center position */
  position: [number, number, number] | { x: number; y: number; z: number };
  /** Object rotation as quaternion or euler */
  rotation?: [number, number, number, number] | [number, number, number] | { x: number; y: number; z: number; w: number };
  /** Axis-aligned bounding box */
  bbox?: {
    min: [number, number, number] | { x: number; y: number; z: number };
    max: [number, number, number] | { x: number; y: number; z: number };
  };
  /** Optional forward/look direction (unit vector) */
  forward?: [number, number, number] | { x: number; y: number; z: number };
  /** Object ID for reference */
  id?: string;
}

// ============================================================================
// Vector helpers
// ============================================================================

/** Extract [x,y,z] from any supported position format */
export function toVec3(v: [number, number, number] | { x: number; y: number; z: number } | number[]): [number, number, number] {
  if (Array.isArray(v)) return [v[0], v[1], v[2]];
  return [(v as any).x, (v as any).y, (v as any).z];
}

/** Euclidean distance between two position-like values */
export function distance(a: [number, number, number] | { x: number; y: number; z: number }, b: [number, number, number] | { x: number; y: number; z: number }): number {
  const [ax, ay, az] = toVec3(a);
  const [bx, by, bz] = toVec3(b);
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Dot product of two direction vectors */
export function dot(a: [number, number, number] | { x: number; y: number; z: number }, b: [number, number, number] | { x: number; y: number; z: number }): number {
  const [ax, ay, az] = toVec3(a);
  const [bx, by, bz] = toVec3(b);
  return ax * bx + ay * by + az * bz;
}

/** Normalize a direction vector */
export function normalize(v: [number, number, number] | { x: number; y: number; z: number }): [number, number, number] {
  const [x, y, z] = toVec3(v);
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-10) return [0, 0, 0];
  return [x / len, y / len, z / len];
}

/** Subtract two vectors */
export function sub(a: [number, number, number] | { x: number; y: number; z: number }, b: [number, number, number] | { x: number; y: number; z: number }): [number, number, number] {
  const [ax, ay, az] = toVec3(a);
  const [bx, by, bz] = toVec3(b);
  return [ax - bx, ay - by, az - bz];
}

/** Angle between two direction vectors in radians */
export function angleBetween(a: [number, number, number] | { x: number; y: number; z: number }, b: [number, number, number] | { x: number; y: number; z: number }): number {
  const na = normalize(a);
  const nb = normalize(b);
  const d = dot(na, nb);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

// ============================================================================
// AABB helpers
// ============================================================================

export interface AABB {
  min: [number, number, number];
  max: [number, number, number];
}

/** Extract an AABB from a SpatialObject's bbox or compute from position */
export function getAABB(obj: SpatialObject): AABB {
  if (obj.bbox) {
    return {
      min: toVec3(obj.bbox.min),
      max: toVec3(obj.bbox.max),
    };
  }
  // If no bbox, assume a point (degenerate AABB at position)
  const p = toVec3(obj.position);
  return { min: [p[0], p[1], p[2]], max: [p[0], p[1], p[2]] };
}

/** Check if two AABBs overlap or are within tolerance distance */
export function aabbOverlapOrNear(a: AABB, b: AABB, tolerance: number = 0): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.max[i] + tolerance < b.min[i] || b.max[i] + tolerance < a.min[i]) {
      return false;
    }
  }
  return true;
}

/** Check if two AABBs overlap in the XZ plane */
export function aabbOverlapXZ(a: AABB, b: AABB): boolean {
  return a.max[0] >= b.min[0] && a.min[0] <= b.max[0] &&
         a.max[2] >= b.min[2] && a.min[2] <= b.max[2];
}

/** Check if aabbA is fully contained in aabbB */
export function aabbContainedIn(a: AABB, b: AABB): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.min[i] < b.min[i] || a.max[i] > b.max[i]) {
      return false;
    }
  }
  return true;
}

/** Compute the XZ overlap area (product of overlap widths in X and Z) */
export function aabbOverlapAreaXZ(a: AABB, b: AABB): number {
  const overlapX = Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]));
  const overlapZ = Math.max(0, Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]));
  return overlapX * overlapZ;
}

/** Minimum distance between two AABBs (0 if overlapping) */
export function aabbDistance(a: AABB, b: AABB): number {
  let distSq = 0;
  for (let i = 0; i < 3; i++) {
    if (a.max[i] < b.min[i]) {
      distSq += (b.min[i] - a.max[i]) ** 2;
    } else if (b.max[i] < a.min[i]) {
      distSq += (a.min[i] - b.max[i]) ** 2;
    }
  }
  return Math.sqrt(distSq);
}

// ============================================================================
// Spatial object retrieval from state
// ============================================================================

const SPATIAL_PREFIX = '__spatial_';

/**
 * Store a SpatialObject in the state map so relations can access it.
 */
export function storeSpatialObject(state: Map<any, any>, obj: SpatialObject): void {
  const id = obj.id ?? String(state.size);
  state.set(`${SPATIAL_PREFIX}${id}`, obj);
}

/**
 * Retrieve a SpatialObject from the state map by ID.
 */
export function retrieveSpatialObject(state: Map<any, any>, id: string): SpatialObject | null {
  return (state.get(`${SPATIAL_PREFIX}${id}`) as SpatialObject) ?? null;
}

/**
 * Retrieve all SpatialObjects for a set of IDs.
 */
export function retrieveSpatialObjects(state: Map<any, any>, ids: Set<string>): SpatialObject[] {
  const objects: SpatialObject[] = [];
  for (const id of ids) {
    const obj = retrieveSpatialObject(state, id);
    if (obj) objects.push(obj);
  }
  return objects;
}

/**
 * Get the forward direction of an object. If not specified, defaults to [0, 0, -1] (Three.js convention).
 */
export function getForward(obj: SpatialObject): [number, number, number] {
  if (obj.forward) return toVec3(obj.forward);
  // Default forward is -Z (Three.js convention)
  return [0, 0, -1];
}

/**
 * Compute direction from objA center to objB center.
 */
export function directionTo(objA: SpatialObject, objB: SpatialObject): [number, number, number] {
  return normalize(sub(objB.position, objA.position));
}

/**
 * Ray-AABB intersection test (simplified: axis-aligned ray from objA center toward objB center).
 * Returns true if the ray from objA position toward objB position intersects the obstacle's AABB.
 */
export function rayAABBIntersection(
  rayOrigin: [number, number, number],
  rayDir: [number, number, number],
  box: AABB
): boolean {
  let tmin = -Infinity;
  let tmax = Infinity;

  for (let i = 0; i < 3; i++) {
    if (Math.abs(rayDir[i]) < 1e-10) {
      // Ray is parallel to this slab
      if (rayOrigin[i] < box.min[i] || rayOrigin[i] > box.max[i]) {
        return false;
      }
    } else {
      const invD = 1.0 / rayDir[i];
      let t1 = (box.min[i] - rayOrigin[i]) * invD;
      let t2 = (box.max[i] - rayOrigin[i]) * invD;
      if (invD < 0) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }

  return tmax >= 0; // Intersection is in front of the ray origin
}
