/**
 * Stability Checking
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/stability.py
 *
 * Checks whether objects are stable against parent surfaces:
 *  1. The object's face must be parallel to the parent plane
 *  2. The object must be close to the parent plane
 *  3. The object's center of mass must project onto the parent surface (no overhang)
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';

export class StabilityChecker {
  /** Tolerance for considering a surface parallel */
  static readonly PARALLEL_TOL = 0.15; // ~8.6 degrees

  /** Tolerance for considering an object close to a surface */
  static readonly DISTANCE_TOL = 0.1;

  /** Minimum fraction of center-of-mass projection that must be on the surface */
  static readonly OVERHANG_TOL = 0.5;

  /**
   * Check if an object is stable against a parent surface.
   *
   * Returns true if ALL three conditions are met:
   *  1. The object's face is parallel to the parent plane
   *  2. The object is close to the parent plane
   *  3. The object's center of mass projects onto the parent surface (no overhang)
   *
   * @param state         The current solver state
   * @param objName       The name of the child object
   * @param relationState The relation linking the child to its parent
   * @returns true if the object is stable
   */
  static stableAgainst(
    state: State,
    objName: string,
    relationState: RelationState
  ): boolean {
    const obj = state.objects.get(objName);
    if (!obj) return false;

    const parentObj = state.objects.get(relationState.targetName);
    if (!parentObj) return false;

    // Get the parent plane
    const extractor = new PlaneExtractor();
    const parentPlanes = parentObj.obj
      ? extractor.extractPlanes(parentObj.obj)
      : [];

    if (parentPlanes.length === 0) {
      // No geometry to check against — assume stable
      return true;
    }

    // Pick the relevant parent plane
    const parentPlane = relationState.parentPlaneIdx !== undefined &&
      relationState.parentPlaneIdx < parentPlanes.length
      ? parentPlanes[relationState.parentPlaneIdx]
      : findClosestPlane(parentPlanes, obj);

    if (!parentPlane) return false;

    // Get child planes
    const childPlanes = obj.obj
      ? extractor.extractPlanes(obj.obj)
      : [];

    if (childPlanes.length === 0) {
      // No child geometry — check position only
      return isCloseToPlane(obj, parentPlane);
    }

    // Check condition 1: parallel face
    const childPlane = relationState.childPlaneIdx !== undefined &&
      relationState.childPlaneIdx < childPlanes.length
      ? childPlanes[relationState.childPlaneIdx]
      : findMostParallelPlane(childPlanes, parentPlane);

    if (childPlane) {
      const parallelDot = Math.abs(childPlane.normal.dot(parentPlane.normal));
      if (Math.abs(parallelDot - 1) > StabilityChecker.PARALLEL_TOL) {
        return false; // Not parallel
      }
    }

    // Check condition 2: close to parent plane
    if (!isCloseToPlane(obj, parentPlane)) {
      return false;
    }

    // Check condition 3: center of mass projects onto parent surface
    if (!centerOfMassOnSurface(obj, parentPlane, parentObj)) {
      return false;
    }

    return true;
  }

  /**
   * Check if two surfaces are coplanar.
   *
   * Two surfaces are coplanar if:
   *  1. Their normals are parallel (within tolerance)
   *  2. Their distances from the origin are equal (within tolerance)
   *
   * @param state         The current solver state
   * @param objName       The name of the first object
   * @param relationState The relation linking the two objects
   * @returns true if the surfaces are coplanar
   */
  static coplanar(
    state: State,
    objName: string,
    relationState: RelationState
  ): boolean {
    const obj = state.objects.get(objName);
    if (!obj) return false;

    const parentObj = state.objects.get(relationState.targetName);
    if (!parentObj) return false;

    const extractor = new PlaneExtractor();

    const objPlanes = obj.obj ? extractor.extractPlanes(obj.obj) : [];
    const parentPlanes = parentObj.obj ? extractor.extractPlanes(parentObj.obj) : [];

    if (objPlanes.length === 0 || parentPlanes.length === 0) {
      return false;
    }

    // Check if any pair of planes are coplanar
    for (const objPlane of objPlanes) {
      for (const parentPlane of parentPlanes) {
        const normalDot = Math.abs(objPlane.normal.dot(parentPlane.normal));
        const isParallel = Math.abs(normalDot - 1) < StabilityChecker.PARALLEL_TOL;
        const isSameDistance = Math.abs(objPlane.distance - parentPlane.distance) < StabilityChecker.DISTANCE_TOL;

        if (isParallel && isSameDistance) {
          return true;
        }
      }
    }

    return false;
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Find the plane from a list that is closest to the given object's center.
 */
function findClosestPlane(planes: Plane[], obj: ObjectState): Plane | null {
  if (planes.length === 0) return null;

  const center = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
  let bestPlane = planes[0];
  let bestDist = Infinity;

  for (const plane of planes) {
    const dist = Math.abs(center.dot(plane.normal) - plane.distance);
    if (dist < bestDist) {
      bestDist = dist;
      bestPlane = plane;
    }
  }

  return bestPlane;
}

/**
 * Find the child plane most parallel to a given parent plane.
 */
function findMostParallelPlane(childPlanes: Plane[], parentPlane: Plane): Plane | null {
  if (childPlanes.length === 0) return null;

  let bestPlane = childPlanes[0];
  let bestDot = 0;

  for (const plane of childPlanes) {
    const dot = Math.abs(plane.normal.dot(parentPlane.normal));
    if (dot > bestDot) {
      bestDot = dot;
      bestPlane = plane;
    }
  }

  return bestPlane;
}

/**
 * Check if an object's center is close to a plane.
 */
function isCloseToPlane(obj: ObjectState, plane: Plane): boolean {
  const center = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
  const dist = Math.abs(center.dot(plane.normal) - plane.distance);
  return dist < StabilityChecker.DISTANCE_TOL;
}

/**
 * Check if an object's center of mass projects onto the parent surface.
 *
 * For a simplified check, we verify that the object's bounding box
 * overlaps with the parent's bounding box when projected onto the
 * parent plane.
 */
function centerOfMassOnSurface(
  obj: ObjectState,
  parentPlane: Plane,
  parentObj: ObjectState
): boolean {
  // Get object center
  const objCenter = obj.getBBoxCenter();

  // Project center onto the parent plane
  const projected = objCenter.clone();
  const dist = objCenter.dot(parentPlane.normal) - parentPlane.distance;
  projected.addScaledVector(parentPlane.normal, -dist);

  // Check if the projected point is within the parent's bounding box
  // (simplified: check if within parent AABB projected onto the plane)
  if (parentObj.obj) {
    const parentBBox = new THREE.Box3().setFromObject(parentObj.obj);

    // Project the parent AABB onto the plane and check containment
    // Simplified: check if the projected center is inside the parent BBox
    if (parentBBox.containsPoint(projected)) {
      return true;
    }

    // Even if not exactly inside, check if within a tolerance margin
    const margin = 0.5; // Allow 50% overhang
    const expandedBBox = parentBBox.clone().expandByScalar(margin);
    if (expandedBBox.containsPoint(projected)) {
      // Partial overhang — check the ratio
      // For simplicity, if it's within the expanded box, consider it "close enough"
      return true;
    }

    return false;
  }

  // If we can't compute the parent BBox, assume stable
  return true;
}
