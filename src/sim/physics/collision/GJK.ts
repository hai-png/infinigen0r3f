/**
 * GJK (Gilbert-Johnson-Keerthi) + EPA (Expanding Polytope Algorithm)
 *
 * GJK determines if two convex shapes overlap by operating on their
 * Minkowski difference. EPA finds the penetration depth and normal
 * from GJK's terminating simplex.
 *
 * Reference: "Game Physics" by Eberly, "Real-Time Collision Detection" by Ericson
 */
import { Vector3 } from 'three';
import { Collider } from '../Collider';

// ============================================================================
// Support Function Type
// ============================================================================

/**
 * Support function for a convex shape: returns the farthest point
 * in the given direction.
 */
export type SupportFunction = (direction: Vector3) => Vector3;

// ============================================================================
// GJK/EPA Result Types
// ============================================================================

export interface GJKResult {
  intersects: boolean;
  simplex: Vector3[];
}

export interface EPAResult {
  depth: number;
  normal: Vector3;
  point: Vector3;
}

// ============================================================================
// Support Functions for Collider Shapes
// ============================================================================

/**
 * Create a support function for a box collider.
 * The farthest point in direction d is: center + sign(d) * halfExtents (component-wise).
 */
export function boxSupport(collider: Collider): SupportFunction {
  const center = new Vector3();
  const he = collider.halfExtents;

  return (direction: Vector3): Vector3 => {
    center.addVectors(collider.aabbMin, collider.aabbMax).multiplyScalar(0.5);
    return new Vector3(
      center.x + Math.sign(direction.x) * he.x,
      center.y + Math.sign(direction.y) * he.y,
      center.z + Math.sign(direction.z) * he.z
    );
  };
}

/**
 * Create a support function for a sphere collider.
 * Farthest point = center + radius * normalize(direction).
 */
export function sphereSupport(collider: Collider): SupportFunction {
  return (direction: Vector3): Vector3 => {
    const center = new Vector3().addVectors(collider.aabbMin, collider.aabbMax).multiplyScalar(0.5);
    const len = direction.length();
    if (len < 1e-8) return center.clone();
    return center.clone().add(direction.clone().normalize().multiplyScalar(collider.radius));
  };
}

/**
 * Create a support function for a cylinder collider (Y-axis aligned).
 * Support = center + (radial part) + (Y part).
 */
export function cylinderSupport(collider: Collider): SupportFunction {
  const halfHeight = collider.height / 2;
  const r = collider.radius;

  return (direction: Vector3): Vector3 => {
    const center = new Vector3().addVectors(collider.aabbMin, collider.aabbMax).multiplyScalar(0.5);
    // Radial direction (XZ plane)
    const radialDir = new Vector3(direction.x, 0, direction.z);
    const radialLen = radialDir.length();
    const result = center.clone();

    // Radial component: project onto cylinder rim
    if (radialLen > 1e-8) {
      result.x += (radialDir.x / radialLen) * r;
      result.z += (radialDir.z / radialLen) * r;
    }

    // Y component: top or bottom cap
    result.y += Math.sign(direction.y) * halfHeight;

    return result;
  };
}

/**
 * Create a support function for a capsule collider (Y-axis aligned).
 * A capsule = cylinder + two hemispherical caps.
 */
export function capsuleSupport(collider: Collider): SupportFunction {
  // For this we need both radius and height from the collider
  // The Collider type has radius and height for cylinder, we reuse them for capsule
  const halfHeight = (collider.height || 1) / 2;
  const r = collider.radius;

  return (direction: Vector3): Vector3 => {
    const center = new Vector3().addVectors(collider.aabbMin, collider.aabbMax).multiplyScalar(0.5);
    const len = direction.length();
    if (len < 1e-8) return center.clone();

    const dir = direction.clone().normalize();
    const result = center.clone();

    // Hemispherical caps dominate the support
    result.add(dir.clone().multiplyScalar(r));

    // Cylinder body contribution: shift Y towards the far end of the capsule
    if (Math.abs(dir.y) > 1e-8) {
      result.y += Math.sign(dir.y) * halfHeight;
    }

    return result;
  };
}

/**
 * Get the support function for a collider based on its shape type.
 */
export function getSupportFunction(collider: Collider): SupportFunction {
  switch (collider.shape) {
    case 'sphere': return sphereSupport(collider);
    case 'box': return boxSupport(collider);
    case 'cylinder': return cylinderSupport(collider);
    default: return sphereSupport(collider); // fallback
  }
}

// ============================================================================
// Minkowski Difference Support
// ============================================================================

/**
 * Minkowski difference support function: S_A-B(d) = S_A(d) - S_B(-d)
 * Returns the farthest point on the Minkowski difference in direction d.
 */
export function minkowskiSupport(
  supportA: SupportFunction,
  supportB: SupportFunction,
  direction: Vector3
): Vector3 {
  const pA = supportA(direction);
  const negDir = direction.clone().negate();
  const pB = supportB(negDir);
  return new Vector3().subVectors(pA, pB);
}

// ============================================================================
// GJK Algorithm
// ============================================================================

const GJK_MAX_ITERATIONS = 32;
const GJK_TOLERANCE = 1e-6;

/**
 * GJK algorithm: determines if two convex shapes overlap.
 *
 * @param supportA Support function for shape A
 * @param supportB Support function for shape B
 * @param initialDirection Optional initial search direction (default: center difference)
 * @returns { intersects, simplex } where simplex is the final simplex if intersecting
 */
export function gjkIntersect(
  supportA: SupportFunction,
  supportB: SupportFunction,
  initialDirection?: Vector3
): GJKResult {
  // Initial direction: arbitrary (use center difference or Y-up)
  let direction = initialDirection
    ? initialDirection.clone()
    : new Vector3(0, 1, 0);

  // Build initial simplex
  const simplex: Vector3[] = [];

  // Get first point on Minkowski difference
  let point = minkowskiSupport(supportA, supportB, direction);

  // If the first point is at the origin, we're overlapping
  if (point.lengthSq() < GJK_TOLERANCE * GJK_TOLERANCE) {
    simplex.push(point);
    return { intersects: true, simplex };
  }

  simplex.push(point);

  // Direction toward origin from the first point
  direction = point.clone().negate();

  for (let iteration = 0; iteration < GJK_MAX_ITERATIONS; iteration++) {
    point = minkowskiSupport(supportA, supportB, direction);

    // If the new point doesn't pass the origin in the search direction, no intersection
    if (point.dot(direction) < 0) {
      return { intersects: false, simplex };
    }

    simplex.push(point);

    // Reduce the simplex and find new search direction
    const result = reduceSimplex(simplex, direction);
    direction = result.direction;

    if (result.containsOrigin) {
      return { intersects: true, simplex: result.simplex };
    }
  }

  // Max iterations reached — treat as intersecting if close
  return { intersects: false, simplex };
}

/**
 * Reduce the simplex by checking which Voronoi region the origin is in,
 * and return the new search direction.
 */
function reduceSimplex(
  simplex: Vector3[],
  direction: Vector3
): { containsOrigin: boolean; simplex: Vector3[]; direction: Vector3 } {
  const origin = new Vector3(0, 0, 0);

  switch (simplex.length) {
    case 1: {
      // Point: direction toward origin
      direction = simplex[0].clone().negate();
      return { containsOrigin: false, simplex, direction };
    }

    case 2: {
      // Line segment
      const a = simplex[1];
      const b = simplex[0];
      const ab = new Vector3().subVectors(b, a);
      const ao = new Vector3().subVectors(origin, a);

      // If origin is past A along AB
      if (ab.dot(ao) > 0) {
        // Origin is in the region of the line — perpendicular toward origin
        direction = new Vector3().crossVectors(ab, new Vector3().crossVectors(ao, ab));
        if (direction.lengthSq() < GJK_TOLERANCE * GJK_TOLERANCE) {
          // Origin is on the line segment
          return { containsOrigin: true, simplex, direction: new Vector3() };
        }
        return { containsOrigin: false, simplex: [a, b], direction };
      } else {
        // Origin is past A — discard B, keep A
        direction = ao;
        return { containsOrigin: false, simplex: [a], direction };
      }
    }

    case 3: {
      // Triangle
      const a = simplex[2];
      const b = simplex[1];
      const c = simplex[0];
      const ab = new Vector3().subVectors(b, a);
      const ac = new Vector3().subVectors(c, a);
      const ao = new Vector3().subVectors(origin, a);

      const abc = new Vector3().crossVectors(ab, ac);

      // Check which side of the triangle the origin is on
      const acPerp = new Vector3().crossVectors(ac, abc);
      const abPerp = new Vector3().crossVectors(abc, ab);

      if (acPerp.dot(ao) > 0) {
        // Origin is on the AC side
        if (ac.dot(ao) > 0) {
          // Origin in region of AC edge
          simplex.length = 0;
          simplex.push(c, a);
          direction = new Vector3().crossVectors(ac, new Vector3().crossVectors(ao, ac));
          if (direction.lengthSq() < GJK_TOLERANCE * GJK_TOLERANCE) {
            return { containsOrigin: true, simplex, direction: new Vector3() };
          }
          return { containsOrigin: false, simplex, direction };
        } else {
          // Check AB edge
          if (ab.dot(ao) > 0) {
            simplex.length = 0;
            simplex.push(b, a);
            direction = new Vector3().crossVectors(ab, new Vector3().crossVectors(ao, ab));
            return { containsOrigin: false, simplex, direction };
          } else {
            // Just point A
            simplex.length = 0;
            simplex.push(a);
            direction = ao;
            return { containsOrigin: false, simplex, direction };
          }
        }
      } else {
        if (abPerp.dot(ao) > 0) {
          // Origin on AB side
          if (ab.dot(ao) > 0) {
            simplex.length = 0;
            simplex.push(b, a);
            direction = new Vector3().crossVectors(ab, new Vector3().crossVectors(ao, ab));
            return { containsOrigin: false, simplex, direction };
          } else {
            simplex.length = 0;
            simplex.push(a);
            direction = ao;
            return { containsOrigin: false, simplex, direction };
          }
        } else {
          // Origin is inside the triangle — check which face of the tetrahedron it's on
          if (abc.dot(ao) > 0) {
            // Origin is above the triangle (positive side of the normal)
            // Keep triangle, search upward
            simplex.length = 0;
            simplex.push(c, b, a);
            direction = abc.clone();
            return { containsOrigin: false, simplex, direction };
          } else {
            // Origin is below the triangle (negative side)
            // Flip winding and search downward
            simplex.length = 0;
            simplex.push(b, c, a);
            direction = abc.clone().negate();
            return { containsOrigin: false, simplex, direction };
          }
        }
      }
    }

    case 4: {
      // Tetrahedron
      const a = simplex[3];
      const b = simplex[2];
      const c = simplex[1];
      const d = simplex[0];

      const ab = new Vector3().subVectors(b, a);
      const ac = new Vector3().subVectors(c, a);
      const ad = new Vector3().subVectors(d, a);
      const ao = new Vector3().subVectors(origin, a);

      const abc = new Vector3().crossVectors(ab, ac);
      const acd = new Vector3().crossVectors(ac, ad);
      const adb = new Vector3().crossVectors(ad, ab);

      // Check which face the origin is outside of
      const abcDot = abc.dot(ao);
      const acdDot = acd.dot(ao);
      const adbDot = adb.dot(ao);

      // If origin is inside all three faces, it's contained
      if (abcDot <= 0 && acdDot <= 0 && adbDot <= 0) {
        return { containsOrigin: true, simplex, direction: new Vector3() };
      }

      // Find the face the origin is most outside of and reduce to that triangle
      let bestFace = abc.clone();
      let bestDot = abcDot;
      let bestSimplex = [c, b, a]; // triangle ABC

      if (acdDot > bestDot) {
        bestDot = acdDot;
        bestFace = acd.clone();
        bestSimplex = [d, c, a]; // triangle ACD
      }

      if (adbDot > bestDot) {
        bestDot = adbDot;
        bestFace = adb.clone();
        bestSimplex = [b, d, a]; // triangle ADB
      }

      simplex.length = 0;
      simplex.push(...bestSimplex);
      direction = bestFace;

      // If direction is near zero, origin is on the face
      if (direction.lengthSq() < GJK_TOLERANCE * GJK_TOLERANCE) {
        return { containsOrigin: true, simplex, direction: new Vector3() };
      }

      return { containsOrigin: false, simplex, direction };
    }

    default:
      // Shouldn't happen
      return { containsOrigin: false, simplex: [simplex[0]], direction: direction.clone() };
  }
}

// ============================================================================
// EPA Algorithm
// ============================================================================

const EPA_MAX_ITERATIONS = 32;
const EPA_TOLERANCE = 1e-4;

/**
 * EPA (Expanding Polytope Algorithm): finds the penetration depth and normal
 * from GJK's intersecting simplex.
 *
 * @param supportA Support function for shape A
 * @param supportB Support function for shape B
 * @param simplex The terminating simplex from GJK (must have at least 3 points)
 * @returns { depth, normal, point } or null if degenerate
 */
export function epaPenetration(
  supportA: SupportFunction,
  supportB: SupportFunction,
  simplex: Vector3[]
): EPAResult | null {
  // Ensure we have a tetrahedron (need at least 4 points for 3D EPA)
  const polytope = simplex.map(v => v.clone());

  if (polytope.length < 4) {
    // Need to expand to a tetrahedron by adding support points
    const directions = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, -1, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ];

    while (polytope.length < 4) {
      for (const dir of directions) {
        const pt = minkowskiSupport(supportA, supportB, dir);
        // Check if this point is not already in the polytope
        let isDuplicate = false;
        for (const existing of polytope) {
          if (existing.distanceTo(pt) < EPA_TOLERANCE) {
            isDuplicate = true;
            break;
          }
        }
        if (!isDuplicate) {
          polytope.push(pt);
          break;
        }
      }
      if (polytope.length < 4) break; // Can't form tetrahedron
    }

    if (polytope.length < 4) {
      // Degenerate — return approximate result from the simplex
      if (polytope.length === 0) return null;
      let closest = polytope[0];
      let minDist = closest.length();
      for (let i = 1; i < polytope.length; i++) {
        const d = polytope[i].length();
        if (d < minDist) {
          minDist = d;
          closest = polytope[i];
        }
      }
      const normal = minDist > 1e-8 ? closest.clone().normalize() : new Vector3(0, 1, 0);
      return { depth: minDist, normal, point: closest };
    }
  }

  // Build initial face list from the tetrahedron
  let faces = buildTetrahedronFaces(polytope);

  for (let iteration = 0; iteration < EPA_MAX_ITERATIONS; iteration++) {
    // Find the face closest to the origin
    let minDist = Infinity;
    let minFaceIdx = -1;
    let minNormal = new Vector3();

    for (let i = 0; i < faces.length; i += 3) {
      const a = polytope[faces[i]];
      const b = polytope[faces[i + 1]];
      const c = polytope[faces[i + 2]];

      const normal = new Vector3().crossVectors(
        new Vector3().subVectors(b, a),
        new Vector3().subVectors(c, a)
      );
      const len = normal.length();
      if (len < 1e-10) continue;
      normal.divideScalar(len);

      // Ensure normal points outward (away from the 4th vertex if tetrahedron)
      const center = new Vector3().addVectors(a, b).add(c).divideScalar(3);
      if (normal.dot(center) < 0) {
        normal.negate();
      }

      const dist = normal.dot(a); // Distance from origin to face

      if (dist < minDist) {
        minDist = dist;
        minFaceIdx = i;
        minNormal = normal;
      }
    }

    if (minFaceIdx < 0) {
      // Degenerate polytope
      return { depth: 0, normal: new Vector3(0, 1, 0), point: new Vector3() };
    }

    // Get a new support point in the direction of the closest face normal
    const newPoint = minkowskiSupport(supportA, supportB, minNormal);
    const newDist = minNormal.dot(newPoint);

    // Check convergence
    if (newDist - minDist < EPA_TOLERANCE) {
      // Converged — compute contact point (approximate)
      const faceA = polytope[faces[minFaceIdx]];
      const faceB = polytope[faces[minFaceIdx + 1]];
      const faceC = polytope[faces[minFaceIdx + 2]];
      const contactPoint = new Vector3().addVectors(faceA, faceB).add(faceC).divideScalar(3);

      return {
        depth: minDist,
        normal: minNormal,
        point: contactPoint,
      };
    }

    // Add the new point and reconstruct the polytope
    polytope.push(newPoint);
    const newIdx = polytope.length - 1;

    // Remove faces that can see the new point and add new faces
    const newFaces: number[] = [];
    const removedFaces = new Set<number>();

    for (let i = 0; i < faces.length; i += 3) {
      const a = polytope[faces[i]];
      const ab = new Vector3().subVectors(polytope[faces[i + 1]], a);
      const ac = new Vector3().subVectors(polytope[faces[i + 2]], a);
      const faceNormal = new Vector3().crossVectors(ab, ac);
      const toNew = new Vector3().subVectors(newPoint, a);

      if (faceNormal.dot(toNew) > 0) {
        // This face can see the new point — mark for removal
        removedFaces.add(i);
      }
    }

    // Keep faces not removed
    for (let i = 0; i < faces.length; i += 3) {
      if (removedFaces.has(i)) continue;
      newFaces.push(faces[i], faces[i + 1], faces[i + 2]);
    }

    // For each edge of removed faces, if the edge is not shared with another removed face,
    // create a new triangle with the new point
    const edgeCount = new Map<string, { a: number; b: number; count: number }>();
    for (const fi of removedFaces) {
      const a = faces[fi];
      const b = faces[fi + 1];
      const c = faces[fi + 2];
      addEdge(edgeCount, a, b);
      addEdge(edgeCount, b, c);
      addEdge(edgeCount, c, a);
    }

    // Edges that appear exactly once are boundary edges — create new face
    for (const [, edge] of edgeCount) {
      if (edge.count === 1) {
        newFaces.push(edge.a, edge.b, newIdx);
      }
    }

    faces = newFaces;
  }

  // Max iterations — return best estimate
  let minDist = Infinity;
  let minNormal = new Vector3(0, 1, 0);
  let contactPoint = new Vector3();

  for (let i = 0; i < faces.length; i += 3) {
    const a = polytope[faces[i]];
    const b = polytope[faces[i + 1]];
    const c = polytope[faces[i + 2]];

    const normal = new Vector3().crossVectors(
      new Vector3().subVectors(b, a),
      new Vector3().subVectors(c, a)
    );
    const len = normal.length();
    if (len < 1e-10) continue;
    normal.divideScalar(len);

    const center = new Vector3().addVectors(a, b).add(c).divideScalar(3);
    if (normal.dot(center) < 0) normal.negate();

    const dist = normal.dot(a);
    if (dist < minDist) {
      minDist = dist;
      minNormal = normal;
      contactPoint = center;
    }
  }

  return { depth: minDist, normal: minNormal, point: contactPoint };
}

/**
 * Build face indices for a tetrahedron from 4 vertices.
 * Returns an array of triangle indices (3 per face, 4 faces = 12 entries).
 */
function buildTetrahedronFaces(vertices: Vector3[]): number[] {
  if (vertices.length < 4) return [];

  const faces: number[] = [];
  const indices = [0, 1, 2, 3];

  // Ensure consistent winding: all face normals should point outward
  const center = new Vector3();
  for (let i = 0; i < 4; i++) {
    center.add(vertices[i]);
  }
  center.divideScalar(4);

  // 4 faces of the tetrahedron
  const faceIndices = [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ];

  for (const fi of faceIndices) {
    const a = vertices[fi[0]];
    const b = vertices[fi[1]];
    const c = vertices[fi[2]];
    const normal = new Vector3().crossVectors(
      new Vector3().subVectors(b, a),
      new Vector3().subVectors(c, a)
    );
    const toCenter = new Vector3().subVectors(center, a);

    if (normal.dot(toCenter) > 0) {
      // Normal points inward — flip winding
      faces.push(fi[0], fi[2], fi[1]);
    } else {
      faces.push(fi[0], fi[1], fi[2]);
    }
  }

  return faces;
}

/**
 * Helper: track edge counts for EPA horizon detection.
 */
function addEdge(
  edgeCount: Map<string, { a: number; b: number; count: number }>,
  a: number,
  b: number
): void {
  const key = Math.min(a, b) + ':' + Math.max(a, b);
  const entry = edgeCount.get(key);
  if (entry) {
    entry.count++;
  } else {
    edgeCount.set(key, { a, b, count: 1 });
  }
}

// ============================================================================
// Convenience: Full GJK + EPA Pipeline
// ============================================================================

/**
 * Detect collision between two colliders using GJK + EPA.
 * Returns the penetration info or null if not colliding.
 */
export function detectCollisionGJK(
  colliderA: Collider,
  colliderB: Collider
): EPAResult | null {
  const supportA = getSupportFunction(colliderA);
  const supportB = getSupportFunction(colliderB);

  // Initial direction: center of A toward center of B
  const centerA = new Vector3().addVectors(colliderA.aabbMin, colliderA.aabbMax).multiplyScalar(0.5);
  const centerB = new Vector3().addVectors(colliderB.aabbMin, colliderB.aabbMax).multiplyScalar(0.5);
  const initialDir = new Vector3().subVectors(centerB, centerA);
  if (initialDir.lengthSq() < 1e-8) {
    initialDir.set(0, 1, 0);
  }

  const gjkResult = gjkIntersect(supportA, supportB, initialDir);

  if (!gjkResult.intersects) {
    return null;
  }

  // Run EPA to get penetration info
  return epaPenetration(supportA, supportB, gjkResult.simplex);
}
