/**
 * Plane Extraction from Tagged Mesh Faces
 *
 * Ports: infinigen/core/constraints/example_solver/geometry/planes.py
 *
 * Extracts unique planes from an object's tagged mesh faces. Uses THREE.Box3
 * and face normals to identify planes, then groups coplanar faces (same normal
 * + distance within tolerance) into single Plane objects.
 *
 * Results are cached keyed by object ID + mesh hash.
 */

import * as THREE from 'three';

// ─── Public Types ───────────────────────────────────────────────────────────

/**
 * Represents an infinite plane extracted from geometry.
 *
 * The plane equation is:  normal · x = distance
 */
export interface Plane {
  /** Unit normal of the plane */
  normal: THREE.Vector3;
  /** Signed distance from the origin along the normal */
  distance: number;
  /** Face tag that this plane was extracted from (e.g. 'wall', 'floor', 'ceiling') */
  tag: string;
}

// ─── PlaneExtractor ─────────────────────────────────────────────────────────

export class PlaneExtractor {
  private cache: Map<string, Plane[]> = new Map();

  /** Tolerance for considering two planes coplanar */
  static readonly COPLANAR_NORMAL_TOL = 1e-3;
  static readonly COPLANAR_DIST_TOL = 1e-2;

  /**
   * Extract unique planes from an object's tagged mesh faces.
   *
   * Traverses the object's mesh children, computes face normals, and groups
   * coplanar faces into Plane objects. Results are cached.
   *
   * @param obj  The THREE.Object3D to extract planes from
   * @param tags Optional array of tag strings to filter by (currently unused,
   *             but reserved for tag-based filtering)
   * @returns Array of unique Plane objects
   */
  extractPlanes(obj: THREE.Object3D, tags?: string[]): Plane[] {
    const cacheKey = this.computeCacheKey(obj, tags);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const planes: Plane[] = [];

    obj.updateMatrixWorld(true);
    obj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const geometry = child.geometry;
      if (!geometry) return;

      // Apply the world matrix to get geometry in world space
      const matrixWorld = child.matrixWorld;

      // Get position attribute
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return;

      // Compute or get normals
      let normals: Float32Array | THREE.BufferAttribute;

      if (geometry.index) {
        // Indexed geometry — compute face normals manually
        normals = computeFaceNormals(geometry, matrixWorld);
        extractPlanesFromFaces(
          geometry, matrixWorld, normals,
          child.userData?.tag ?? child.userData?.tags ?? '',
          planes
        );
      } else {
        // Non-indexed — use vertex normals if available
        const normalAttr = geometry.getAttribute('normal');
        if (normalAttr) {
          extractPlanesFromVertices(
            geometry, matrixWorld, normalAttr,
            child.userData?.tag ?? child.userData?.tags ?? '',
            planes
          );
        } else {
          // Compute face normals from vertex positions
          normals = computeFaceNormals(geometry, matrixWorld);
          extractPlanesFromFaces(
            geometry, matrixWorld, normals,
            child.userData?.tag ?? child.userData?.tags ?? '',
            planes
          );
        }
      }
    });

    // Deduplicate coplanar planes
    const uniquePlanes = deduplicatePlanes(planes);

    // Filter by tags if specified
    const filteredPlanes = tags && tags.length > 0
      ? uniquePlanes.filter(p => tags.includes(p.tag))
      : uniquePlanes;

    this.cache.set(cacheKey, filteredPlanes);
    return filteredPlanes;
  }

  /**
   * Get planes for a specific tag.
   *
   * Convenience method that calls extractPlanes and filters by tag.
   *
   * @param obj The object to extract planes from
   * @param tag The tag string to filter by
   * @returns Array of Plane objects with the given tag
   */
  getTaggedPlanes(obj: THREE.Object3D, tag: string): Plane[] {
    return this.extractPlanes(obj, [tag]);
  }

  /**
   * Clear the plane cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Compute a cache key from an object and optional tags.
   */
  private computeCacheKey(obj: THREE.Object3D, tags?: string[]): string {
    const tagSuffix = tags ? `:${tags.sort().join(',')}` : '';
    // Use object UUID + a hash of its geometry
    let geometryHash = '';
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        const geo = child.geometry;
        geometryHash += `${geo.id}:${geo.version}:`;
      }
    });
    return `${obj.uuid}:${geometryHash}${tagSuffix}`;
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Compute face normals for an indexed or non-indexed geometry.
 * Returns a Float32Array with one normal per face (3 components each).
 */
function computeFaceNormals(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4
): Float32Array {
  const posAttr = geometry.getAttribute('position');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

  const index = geometry.index;
  const faceCount = index ? index.count / 3 : posAttr.count / 3;
  const normals = new Float32Array(faceCount * 3);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  let outIdx = 0;

  const getVertex = (idx: number, target: THREE.Vector3) => {
    const i = index ? index.getX(idx) : idx;
    target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    target.applyMatrix4(matrixWorld);
  };

  const faceIndices = index ? index.count : posAttr.count;

  for (let i = 0; i < faceIndices; i += 3) {
    getVertex(i, vA);
    getVertex(i + 1, vB);
    getVertex(i + 2, vC);

    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    cb.cross(ab);

    cb.applyMatrix3(normalMatrix);
    cb.normalize();

    normals[outIdx++] = cb.x;
    normals[outIdx++] = cb.y;
    normals[outIdx++] = cb.z;
  }

  return normals;
}

/**
 * Extract planes from faces of indexed geometry.
 */
function extractPlanesFromFaces(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  faceNormals: Float32Array,
  tag: string | string[],
  planes: Plane[]
): void {
  const posAttr = geometry.getAttribute('position');
  const index = geometry.index;

  const tagStr = Array.isArray(tag) ? tag.join(',') : String(tag);
  const vA = new THREE.Vector3();

  const faceCount = faceNormals.length / 3;
  const getVertex = (idx: number, target: THREE.Vector3) => {
    const i = index ? index.getX(idx) : idx;
    target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    target.applyMatrix4(matrixWorld);
  };

  for (let f = 0; f < faceCount; f++) {
    const nx = faceNormals[f * 3];
    const ny = faceNormals[f * 3 + 1];
    const nz = faceNormals[f * 3 + 2];

    const normal = new THREE.Vector3(nx, ny, nz);
    if (normal.lengthSq() < 1e-10) continue;
    normal.normalize();

    // Use the first vertex of the face as a point on the plane
    getVertex(f * 3, vA);

    const distance = vA.dot(normal);

    planes.push({
      normal,
      distance,
      tag: tagStr || 'untagged',
    });
  }
}

/**
 * Extract planes from vertices with normals (non-indexed geometry).
 */
function extractPlanesFromVertices(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  normalAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  tag: string | string[],
  planes: Plane[]
): void {
  const posAttr = geometry.getAttribute('position');
  const tagStr = Array.isArray(tag) ? tag.join(',') : String(tag);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld);

  const vertexCount = posAttr.count;

  // Group vertices by similar normal + distance (coplanar groups)
  for (let i = 0; i < vertexCount; i += 3) {
    // Get face normal (average of 3 vertex normals)
    const n = new THREE.Vector3(0, 0, 0);
    for (let j = 0; j < 3; j++) {
      const vn = new THREE.Vector3(
        normalAttr.getX(i + j),
        normalAttr.getY(i + j),
        normalAttr.getZ(i + j)
      );
      vn.applyMatrix3(normalMatrix);
      n.add(vn);
    }
    n.normalize();
    if (n.lengthSq() < 1e-10) continue;

    // Get a point on the face
    const point = new THREE.Vector3(
      posAttr.getX(i),
      posAttr.getY(i),
      posAttr.getZ(i)
    );
    point.applyMatrix4(matrixWorld);

    const distance = point.dot(n);

    planes.push({
      normal: n,
      distance,
      tag: tagStr || 'untagged',
    });
  }
}

/**
 * Deduplicate coplanar planes.
 *
 * Two planes are considered the same if their normals are parallel
 * (within tolerance) and their distances are within tolerance.
 */
function deduplicatePlanes(planes: Plane[]): Plane[] {
  const result: Plane[] = [];

  for (const plane of planes) {
    let found = false;
    for (const existing of result) {
      const normalDot = plane.normal.dot(existing.normal);
      const isSameNormal = Math.abs(Math.abs(normalDot) - 1) < PlaneExtractor.COPLANAR_NORMAL_TOL;
      const isSameDistance = Math.abs(plane.distance - existing.distance) < PlaneExtractor.COPLANAR_DIST_TOL;

      if (isSameNormal && isSameDistance) {
        found = true;
        break;
      }
    }

    if (!found) {
      result.push(plane);
    }
  }

  return result;
}
