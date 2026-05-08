/**
 * Degrees-of-Freedom (DOF) Solver
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/dof.py
 *
 * Computes valid poses given relation constraints (StableAgainst, etc.).
 *
 * Key concepts from the original Infinigen:
 *  - A `StableAgainst` relation constrains an object to lie on a plane
 *    (wall, floor, ceiling).
 *  - The DOF matrix encodes which translation directions are allowed:
 *      • 1 plane  → 2 DOF translation + 1 DOF rotation
 *      • 2 planes → 1 DOF translation + 0 or 1 DOF rotation
 *      • 3 planes → 0 DOF (fully constrained position)
 *  - `combineRotationConstraints` determines whether rotation is still
 *    free after imposing multiple parent planes.
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Plane } from './planes';
import { PlaneExtractor } from './planes';

// ─── Public API ─────────────────────────────────────────────────────────────

export class DOFSolver {
  /**
   * Compute the restriction matrix for a StableAgainst relation.
   *
   * The returned 3×3 matrix has rows that span the subspace of allowed
   * translations. A plane with normal `n` removes the DOF along `n`,
   * leaving the tangent plane as the allowed translation subspace.
   *
   * @param point  A point on the plane (not used for direction, but kept
   *               for API compatibility with the original Python).
   * @param normal The plane normal (unit vector).
   * @returns A Matrix3 whose rows are the basis vectors of the allowed
   *          translation subspace.
   */
  static stableAgainstMatrix(point: THREE.Vector3, normal: THREE.Vector3): THREE.Matrix3 {
    const n = normal.clone().normalize();

    // Find two orthogonal vectors in the tangent plane
    let t1 = new THREE.Vector3();
    if (Math.abs(n.x) < 0.9) {
      t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

    // Build matrix with tangent vectors as rows
    return new THREE.Matrix3(
      t1.x, t1.y, t1.z,
      t2.x, t2.y, t2.z,
      0, 0, 0 // Third row zero (plane removes 1 DOF)
    );
  }

  /**
   * Combine rotation constraints from multiple parent planes.
   *
   * Each parent plane constrains rotation to its normal axis (rotation
   * around the normal is free, other rotations are blocked).
   *
   * - 0 planes: fully free rotation → returns null
   * - 1 plane: rotation around normal → returns normal
   * - 2 non-parallel planes: only rotation around the cross product
   *   of the two normals is allowed (if any)
   * - 2 parallel planes: same as 1 plane → returns the normal
   * - 3+ planes: typically fully constrained → returns null
   *
   * @param parentPlanes Array of parent planes
   * @returns The allowed rotation axis, or null if rotation is fully free
   *          or fully constrained (no rotation DOF remains)
   */
  static combineRotationConstraints(parentPlanes: Plane[]): THREE.Vector3 | null {
    if (parentPlanes.length === 0) {
      // No constraints → fully free rotation
      return null;
    }

    if (parentPlanes.length === 1) {
      // Rotation around the plane's normal is allowed
      return parentPlanes[0].normal.clone().normalize();
    }

    // Collect unique normals (within tolerance)
    const normals: THREE.Vector3[] = [];
    const PARALLEL_TOLERANCE = 1e-4;

    for (const plane of parentPlanes) {
      const n = plane.normal.clone().normalize();
      let isParallel = false;
      for (const existing of normals) {
        if (Math.abs(n.dot(existing)) > 1 - PARALLEL_TOLERANCE) {
          isParallel = true;
          break;
        }
      }
      if (!isParallel) {
        normals.push(n);
      }
    }

    if (normals.length === 1) {
      // All planes are parallel → same as single plane
      return normals[0].clone();
    }

    if (normals.length === 2) {
      // Two non-parallel planes: rotation is only allowed around
      // the intersection line (cross product of normals)
      const cross = new THREE.Vector3().crossVectors(normals[0], normals[1]);
      if (cross.lengthSq() < 1e-8) {
        // Normals are actually parallel (shouldn't reach here due to filtering)
        return normals[0].clone();
      }
      cross.normalize();
      return cross;
    }

    // 3+ non-parallel normals → fully constrained rotation
    return null;
  }

  /**
   * Try to solve for position/rotation given the relation constraints
   * on a specific object.
   *
   * Walks the object's relations, extracts parent planes for each
   * StableAgainst relation, computes DOF matrices, and attempts to
   * find a valid pose that satisfies all constraints simultaneously.
   *
   * @param state   The current solver state
   * @param objName The name of the object to solve for
   * @returns A valid {position, rotation} or null if no valid pose exists
   */
  static tryApplyRelationConstraints(
    state: State,
    objName: string
  ): { position: THREE.Vector3; rotation: THREE.Euler } | null {
    const obj = state.objects.get(objName);
    if (!obj) return null;

    // Collect parent planes from StableAgainst relations
    const parentPlanes: Plane[] = [];
    const extractor = new PlaneExtractor();

    for (const rel of obj.relations) {
      const relType = rel.relation?.constructor?.name ?? (rel.relation as any)?.type;
      if (relType === 'StableAgainst' || relType === 'stable_against') {
        const targetObj = state.objects.get(rel.targetName);
        if (targetObj?.obj) {
          const planes = extractor.extractPlanes(targetObj.obj);
          if (rel.parentPlaneIdx !== undefined && rel.parentPlaneIdx < planes.length) {
            parentPlanes.push(planes[rel.parentPlaneIdx]);
          } else if (planes.length > 0) {
            // Use the closest plane by default
            parentPlanes.push(planes[0]);
          }
        }
      }
    }

    if (parentPlanes.length === 0) {
      // No StableAgainst constraints → keep current pose
      return {
        position: new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
        rotation: new THREE.Euler(obj.rotation.x, obj.rotation.y, obj.rotation.z),
      };
    }

    // Compute combined translation DOF
    // Start with full 3D freedom, then intersect each plane's restriction
    let doFTranslation: THREE.Matrix3 | null = null;

    for (const plane of parentPlanes) {
      const planeDOF = DOFSolver.stableAgainstMatrix(
        new THREE.Vector3(), // point not needed for direction
        plane.normal
      );

      if (doFTranslation === null) {
        doFTranslation = planeDOF;
      } else {
        // Intersect the DOF subspaces by combining their constraints
        doFTranslation = intersectDOFMatrices(doFTranslation, planeDOF);
      }
    }

    // Compute rotation constraint
    const rotationAxis = DOFSolver.combineRotationConstraints(parentPlanes);

    // Determine position: intersect all planes to find the allowed point
    const position = solvePosition(parentPlanes, obj, doFTranslation);

    if (!position) return null;

    // Determine rotation
    const rotation = solveRotation(rotationAxis, obj, parentPlanes);

    return { position, rotation };
  }

  /**
   * Sample a random pose on a parent surface.
   *
   * Picks a random point on one of the parent planes and a random
   * rotation consistent with the DOF constraints.
   *
   * @param state   The current solver state
   * @param objName The name of the object to sample a pose for
   * @returns A sampled {position, rotation} or null if no parent surface
   */
  static applyRelationSurfaceSample(
    state: State,
    objName: string
  ): { position: THREE.Vector3; rotation: THREE.Euler } | null {
    const obj = state.objects.get(objName);
    if (!obj) return null;

    const extractor = new PlaneExtractor();
    const parentPlanes: Plane[] = [];

    for (const rel of obj.relations) {
      const relType = rel.relation?.constructor?.name ?? (rel.relation as any)?.type;
      if (relType === 'StableAgainst' || relType === 'stable_against') {
        const targetObj = state.objects.get(rel.targetName);
        if (targetObj?.obj) {
          const planes = extractor.extractPlanes(targetObj.obj);
          for (const p of planes) {
            parentPlanes.push(p);
          }
        }
      }
    }

    if (parentPlanes.length === 0) {
      // No parent surface — return current position with small random offset
      return {
        position: new THREE.Vector3(
          obj.position.x + (Math.random() - 0.5) * 0.1,
          obj.position.y + (Math.random() - 0.5) * 0.1,
          obj.position.z + (Math.random() - 0.5) * 0.1
        ),
        rotation: new THREE.Euler(
          obj.rotation.x,
          obj.rotation.y + (Math.random() - 0.5) * Math.PI * 0.1,
          obj.rotation.z
        ),
      };
    }

    // Pick a random parent plane
    const plane = parentPlanes[Math.floor(Math.random() * parentPlanes.length)];

    // Sample a point on the plane within its bounding region
    const position = samplePointOnPlane(plane, obj);

    // Determine rotation axis
    const rotationAxis = DOFSolver.combineRotationConstraints(parentPlanes);
    const rotation = solveRotation(rotationAxis, obj, parentPlanes);

    return { position, rotation };
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Intersect two DOF matrices by stacking their constraint rows and
 * computing the resulting subspace.
 */
function intersectDOFMatrices(
  a: THREE.Matrix3,
  b: THREE.Matrix3
): THREE.Matrix3 {
  // Collect non-zero rows from both matrices
  const rows: THREE.Vector3[] = [];

  for (const m of [a, b]) {
    const e = m.elements;
    // Matrix3 elements are stored column-major in three.js
    for (let row = 0; row < 3; row++) {
      const v = new THREE.Vector3(
        e[row],       // column 0, row
        e[row + 3],   // column 1, row
        e[row + 6]    // column 2, row
      );
      if (v.lengthSq() > 1e-10) {
        rows.push(v.normalize());
      }
    }
  }

  if (rows.length === 0) {
    return new THREE.Matrix3(); // No DOF
  }

  // Find the null space of the constraint normals
  // (i.e., directions that satisfy all constraints)
  const constraints: THREE.Vector3[] = [];
  const seen: THREE.Vector3[] = [];

  for (const row of rows) {
    let isDuplicate = false;
    for (const s of seen) {
      if (Math.abs(row.dot(s)) > 1 - 1e-4) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      seen.push(row);
      constraints.push(row);
    }
  }

  // Compute orthogonal complement of constraint normals
  const doFVectors: THREE.Vector3[] = [];

  if (constraints.length === 1) {
    // 1 constraint → 2 DOF
    const n = constraints[0];
    let t1 = new THREE.Vector3();
    if (Math.abs(n.x) < 0.9) {
      t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    }
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    doFVectors.push(t1, t2);
  } else if (constraints.length === 2) {
    // 2 constraints → 1 DOF (intersection line)
    const cross = new THREE.Vector3().crossVectors(constraints[0], constraints[1]);
    if (cross.lengthSq() > 1e-10) {
      doFVectors.push(cross.normalize());
    }
    // else: parallel constraints → same as 1 constraint
    else {
      const n = constraints[0];
      let t1 = new THREE.Vector3();
      if (Math.abs(n.x) < 0.9) {
        t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
      } else {
        t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
      }
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      doFVectors.push(t1, t2);
    }
  }
  // 3+ constraints → 0 DOF (empty matrix)

  // Pack DOF vectors into matrix rows
  const v0 = doFVectors[0] ?? new THREE.Vector3();
  const v1 = doFVectors[1] ?? new THREE.Vector3();
  const v2 = doFVectors[2] ?? new THREE.Vector3();

  return new THREE.Matrix3(
    v0.x, v0.y, v0.z,
    v1.x, v1.y, v1.z,
    v2.x, v2.y, v2.z
  );
}

/**
 * Solve for the position of an object given parent planes and DOF constraints.
 */
function solvePosition(
  parentPlanes: Plane[],
  obj: ObjectState,
  doFMatrix: THREE.Matrix3 | null
): THREE.Vector3 | null {
  if (parentPlanes.length === 0) {
    return new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
  }

  if (parentPlanes.length === 1) {
    // Project current position onto the plane
    const plane = parentPlanes[0];
    const currentPos = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
    return projectOntoPlane(currentPos, plane);
  }

  if (parentPlanes.length === 2) {
    // Intersect two planes → a line; project current position onto the line
    const line = intersectPlanes(parentPlanes[0], parentPlanes[1]);
    if (!line) return null;
    return projectOntoLine(
      new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
      line.origin,
      line.direction
    );
  }

  if (parentPlanes.length >= 3) {
    // Intersect three planes → a point
    const point = intersectThreePlanes(parentPlanes[0], parentPlanes[1], parentPlanes[2]);
    return point;
  }

  return null;
}

/**
 * Solve for the rotation of an object given rotation constraints.
 */
function solveRotation(
  rotationAxis: THREE.Vector3 | null,
  obj: ObjectState,
  parentPlanes: Plane[]
): THREE.Euler {
  const currentYaw = obj.yaw ?? obj.rotation.y;

  if (rotationAxis === null) {
    // Free rotation or fully constrained
    if (parentPlanes.length === 0) {
      // Free rotation — keep current + small random perturbation
      return new THREE.Euler(
        obj.rotation.x,
        currentYaw + (Math.random() - 0.5) * 0.1,
        obj.rotation.z
      );
    }
    // Fully constrained — align with first plane's normal
    if (parentPlanes.length >= 3) {
      // No rotation DOF — set rotation to align with first parent plane
      return alignWithPlane(parentPlanes[0]);
    }
    return new THREE.Euler(obj.rotation.x, currentYaw, obj.rotation.z);
  }

  // Rotation around the given axis is free
  // Compute the angle that keeps the object facing the parent plane
  const randomAngle = Math.random() * Math.PI * 2;

  if (Math.abs(rotationAxis.y) > 0.9) {
    // Rotation around Y axis — yaw is free
    return new THREE.Euler(0, randomAngle, 0);
  } else if (Math.abs(rotationAxis.x) > 0.9) {
    // Rotation around X axis — pitch is free
    return new THREE.Euler(randomAngle, 0, 0);
  } else if (Math.abs(rotationAxis.z) > 0.9) {
    // Rotation around Z axis — roll is free
    return new THREE.Euler(0, 0, randomAngle);
  }

  // Arbitrary axis — use quaternion
  const q = new THREE.Quaternion().setFromAxisAngle(rotationAxis.normalize(), randomAngle);
  const euler = new THREE.Euler().setFromQuaternion(q);
  return euler;
}

/**
 * Project a point onto a plane.
 */
function projectOntoPlane(point: THREE.Vector3, plane: Plane): THREE.Vector3 {
  const n = plane.normal.clone().normalize();
  const d = plane.distance;
  // point projected onto plane: point - (point·n - d) * n
  const dist = point.dot(n) - d;
  return point.clone().sub(n.multiplyScalar(dist));
}

/**
 * Intersect two planes → returns a line {origin, direction} or null if parallel.
 */
function intersectPlanes(
  p1: Plane,
  p2: Plane
): { origin: THREE.Vector3; direction: THREE.Vector3 } | null {
  const n1 = p1.normal.clone().normalize();
  const n2 = p2.normal.clone().normalize();
  const direction = new THREE.Vector3().crossVectors(n1, n2);

  if (direction.lengthSq() < 1e-10) {
    return null; // Planes are parallel
  }

  direction.normalize();

  // Find a point on the line using the formula:
  // origin = (d1 * n2 - d2 * n1) × (n1 × n2) / |n1 × n2|²
  const denom = direction.lengthSq();
  const d1 = p1.distance;
  const d2 = p2.distance;

  const origin = new THREE.Vector3()
    .addScaledVector(n2, d1)
    .sub(n1.clone().multiplyScalar(d2))
    .cross(direction)
    .divideScalar(denom);

  return { origin, direction };
}

/**
 * Intersect three planes → returns a point or null.
 */
function intersectThreePlanes(
  p1: Plane,
  p2: Plane,
  p3: Plane
): THREE.Vector3 | null {
  const n1 = p1.normal.clone().normalize();
  const n2 = p2.normal.clone().normalize();
  const n3 = p3.normal.clone().normalize();

  const denom = new THREE.Vector3().crossVectors(n1, n2).dot(n3);
  if (Math.abs(denom) < 1e-10) {
    return null; // Planes don't intersect at a single point
  }

  // P = (d1*(n2×n3) + d2*(n3×n1) + d3*(n1×n2)) / (n1·(n2×n3))
  const point = new THREE.Vector3()
    .addScaledVector(new THREE.Vector3().crossVectors(n2, n3), p1.distance)
    .addScaledVector(new THREE.Vector3().crossVectors(n3, n1), p2.distance)
    .addScaledVector(new THREE.Vector3().crossVectors(n1, n2), p3.distance)
    .divideScalar(denom);

  return point;
}

/**
 * Project a point onto a line defined by origin + t*direction.
 */
function projectOntoLine(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  direction: THREE.Vector3
): THREE.Vector3 {
  const v = point.clone().sub(origin);
  const t = v.dot(direction);
  return origin.clone().addScaledVector(direction, t);
}

/**
 * Align rotation so the object faces the given plane.
 */
function alignWithPlane(plane: Plane): THREE.Euler {
  const n = plane.normal;

  // Simple alignment: if the plane normal is mostly Y (floor/ceiling),
  // no rotation needed. If mostly X or Z, rotate to face the wall.
  if (Math.abs(n.y) > 0.9) {
    return new THREE.Euler(0, 0, 0);
  }
  if (Math.abs(n.x) > 0.9) {
    return new THREE.Euler(0, n.x > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  }
  if (Math.abs(n.z) > 0.9) {
    return new THREE.Euler(0, n.z > 0 ? 0 : Math.PI, 0);
  }
  return new THREE.Euler(0, 0, 0);
}

/**
 * Sample a random point on a plane within a reasonable region.
 */
function samplePointOnPlane(plane: Plane, obj: ObjectState): THREE.Vector3 {
  const n = plane.normal.clone().normalize();

  // Start from the current position projected onto the plane
  const currentPos = new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z);
  const projected = projectOntoPlane(currentPos, plane);

  // Add a random offset within the tangent plane
  let t1 = new THREE.Vector3();
  if (Math.abs(n.x) < 0.9) {
    t1.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
  } else {
    t1.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
  }
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

  const spread = 0.5; // Random offset magnitude
  const offset = t1.multiplyScalar((Math.random() - 0.5) * spread * 2)
    .add(t2.multiplyScalar((Math.random() - 0.5) * spread * 2));

  return projected.add(offset);
}
