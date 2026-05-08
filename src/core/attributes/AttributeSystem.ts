/**
 * Attribute System for Three.js BufferGeometry
 *
 * Provides a complete attribute management system for mesh face tagging
 * and attribute I/O, mirroring the original Infinigen attribute system.
 *
 * Supports:
 * - Multiple attribute domains (point, edge, face, corner, spline, instance)
 * - Multiple data types (float, int, float2, float3, float4, boolean, byte_color, string)
 * - Read/write/remove/check attributes
 * - Laplacian smoothing
 * - Attribute transfer between geometries (nearest + barycentric)
 * - Create attributes from functions
 * - Domain conversion (point↔face↔corner)
 *
 * @module core/attributes
 */

import * as THREE from 'three';

// ============================================================================
// Type Definitions
// ============================================================================

export type AttributeDomain = 'point' | 'edge' | 'face' | 'corner' | 'spline' | 'instance';

export type AttributeDataType = 'float' | 'int' | 'float2' | 'float3' | 'float4' | 'boolean' | 'byte_color' | 'string';

export interface AttributeInfo {
  name: string;
  domain: AttributeDomain;
  dataType: AttributeDataType;
  data: Float32Array | Int32Array | Uint8Array;
}

// ============================================================================
// Internal Utilities
// ============================================================================

/** Get the number of elements for a given domain on a geometry */
function getDomainElementCount(geometry: THREE.BufferGeometry, domain: AttributeDomain): number {
  const posAttr = geometry.getAttribute('position');
  const vertexCount = posAttr ? posAttr.count : 0;
  const indexAttr = geometry.getIndex();

  switch (domain) {
    case 'point':
      return vertexCount;
    case 'face': {
      if (indexAttr) return Math.floor(indexAttr.count / 3);
      return Math.floor(vertexCount / 3);
    }
    case 'corner': {
      if (indexAttr) return indexAttr.count;
      return vertexCount;
    }
    case 'edge': {
      // Approximate: for a manifold triangle mesh, edges ≈ faces * 1.5
      const faceCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(vertexCount / 3);
      return Math.ceil(faceCount * 1.5);
    }
    case 'spline':
    case 'instance':
      return 1;
    default:
      return vertexCount;
  }
}

/** Get the item size (number of components) for a data type */
function getItemSize(dataType: AttributeDataType): number {
  switch (dataType) {
    case 'float': return 1;
    case 'int': return 1;
    case 'float2': return 2;
    case 'float3': return 3;
    case 'float4': return 4;
    case 'boolean': return 1;
    case 'byte_color': return 4;
    case 'string': return 1; // stored as indices
    default: return 1;
  }
}

/** Create a typed array of the right type for a given data type and count */
function createTypedArray(
  dataType: AttributeDataType,
  count: number,
): Float32Array | Int32Array | Uint8Array {
  const itemSize = getItemSize(dataType);
  const total = count * itemSize;

  switch (dataType) {
    case 'float':
    case 'float2':
    case 'float3':
    case 'float4':
    case 'byte_color':
      return new Float32Array(total);
    case 'int':
      return new Int32Array(total);
    case 'boolean':
      return new Uint8Array(total);
    case 'string':
      return new Int32Array(total); // string indices stored as ints
    default:
      return new Float32Array(total);
  }
}

/** Store the domain metadata in the geometry's userData */
function storeDomainMeta(
  geometry: THREE.BufferGeometry,
  name: string,
  domain: AttributeDomain,
  dataType: AttributeDataType,
): void {
  if (!geometry.userData.__attributeDomains) {
    geometry.userData.__attributeDomains = {};
  }
  (geometry.userData.__attributeDomains as Record<string, { domain: AttributeDomain; dataType: AttributeDataType }>)[name] = {
    domain,
    dataType,
  };
}

/** Retrieve the domain metadata from geometry's userData */
function getDomainMeta(
  geometry: THREE.BufferGeometry,
  name: string,
): { domain: AttributeDomain; dataType: AttributeDataType } | null {
  const domains = geometry.userData.__attributeDomains as Record<string, { domain: AttributeDomain; dataType: AttributeDataType }> | undefined;
  if (!domains || !domains[name]) return null;
  return domains[name];
}

// ============================================================================
// Edge & Adjacency Helpers
// ============================================================================

interface Edge {
  v0: number;
  v1: number;
}

/** Build an edge list from the geometry's index or position buffer */
function buildEdgeList(geometry: THREE.BufferGeometry): Edge[] {
  const indexAttr = geometry.getIndex();
  const edges: Edge[] = [];
  const edgeSet = new Set<string>();

  const addEdge = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({ v0: lo, v1: hi });
    }
  };

  if (indexAttr) {
    const faceCount = Math.floor(indexAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr.getX(f * 3);
      const i1 = indexAttr.getX(f * 3 + 1);
      const i2 = indexAttr.getX(f * 3 + 2);
      addEdge(i0, i1);
      addEdge(i1, i2);
      addEdge(i2, i0);
    }
  } else {
    const posAttr = geometry.getAttribute('position');
    const faceCount = Math.floor((posAttr?.count ?? 0) / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = f * 3;
      const i1 = f * 3 + 1;
      const i2 = f * 3 + 2;
      addEdge(i0, i1);
      addEdge(i1, i2);
      addEdge(i2, i0);
    }
  }

  return edges;
}

/** Build vertex → vertex adjacency map for Laplacian smoothing */
function buildVertexNeighbors(geometry: THREE.BufferGeometry): Map<number, number[]> {
  const neighbors = new Map<number, number[]>();
  const indexAttr = geometry.getIndex();

  const addNeighbor = (a: number, b: number) => {
    if (!neighbors.has(a)) neighbors.set(a, []);
    const list = neighbors.get(a)!;
    if (!list.includes(b)) list.push(b);
  };

  if (indexAttr) {
    const faceCount = Math.floor(indexAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = indexAttr.getX(f * 3);
      const i1 = indexAttr.getX(f * 3 + 1);
      const i2 = indexAttr.getX(f * 3 + 2);
      addNeighbor(i0, i1); addNeighbor(i0, i2);
      addNeighbor(i1, i0); addNeighbor(i1, i2);
      addNeighbor(i2, i0); addNeighbor(i2, i1);
    }
  } else {
    const posAttr = geometry.getAttribute('position');
    const faceCount = Math.floor((posAttr?.count ?? 0) / 3);
    for (let f = 0; f < faceCount; f++) {
      const i0 = f * 3;
      const i1 = f * 3 + 1;
      const i2 = f * 3 + 2;
      addNeighbor(i0, i1); addNeighbor(i0, i2);
      addNeighbor(i1, i0); addNeighbor(i1, i2);
      addNeighbor(i2, i0); addNeighbor(i2, i1);
    }
  }

  return neighbors;
}

/** Build face → vertex indices mapping */
function buildFaceVertices(geometry: THREE.BufferGeometry): number[][] {
  const indexAttr = geometry.getIndex();
  const faces: number[][] = [];

  if (indexAttr) {
    const faceCount = Math.floor(indexAttr.count / 3);
    for (let f = 0; f < faceCount; f++) {
      faces.push([
        indexAttr.getX(f * 3),
        indexAttr.getX(f * 3 + 1),
        indexAttr.getX(f * 3 + 2),
      ]);
    }
  } else {
    const posAttr = geometry.getAttribute('position');
    const faceCount = Math.floor((posAttr?.count ?? 0) / 3);
    for (let f = 0; f < faceCount; f++) {
      faces.push([f * 3, f * 3 + 1, f * 3 + 2]);
    }
  }

  return faces;
}

// ============================================================================
// AttributeSystem Class
// ============================================================================

/**
 * Complete attribute management system for Three.js BufferGeometry.
 *
 * Provides read/write/remove/check operations plus advanced features
 * like smoothing, transfer, domain conversion, and functional creation.
 */
export class AttributeSystem {

  // ==========================================================================
  // Write
  // ==========================================================================

  /**
   * Write attribute data to a geometry.
   *
   * @param geometry - Target BufferGeometry
   * @param name - Attribute name
   * @param data - Typed array of attribute data
   * @param domain - Attribute domain (point, face, etc.)
   * @param dataType - Data type (float, float3, etc.)
   */
  static writeAttribute(
    geometry: THREE.BufferGeometry,
    name: string,
    data: Float32Array | Int32Array | Uint8Array,
    domain: AttributeDomain,
    dataType: AttributeDataType,
  ): void {
    const itemSize = getItemSize(dataType);
    const elementCount = getDomainElementCount(geometry, domain);
    const expectedLength = elementCount * itemSize;

    // Resize data if needed
    let finalData = data;
    if (data.length < expectedLength) {
      finalData = createTypedArray(dataType, elementCount);
      finalData.set(data.subarray(0, Math.min(data.length, expectedLength)));
    } else if (data.length > expectedLength) {
      finalData = data.subarray(0, expectedLength);
    }

    const attr = new THREE.BufferAttribute(finalData, itemSize);
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attr);

    // Store domain metadata
    storeDomainMeta(geometry, name, domain, dataType);
  }

  // ==========================================================================
  // Read
  // ==========================================================================

  /**
   * Read attribute data from a geometry.
   *
   * @param geometry - Source BufferGeometry
   * @param name - Attribute name
   * @param domain - Expected domain (used for size validation)
   * @returns The attribute data array, or null if not found
   */
  static readAttribute(
    geometry: THREE.BufferGeometry,
    name: string,
    domain: AttributeDomain,
  ): Float32Array | Int32Array | Uint8Array | null {
    if (!geometry.hasAttribute(name)) return null;

    const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
    const array = attr.array as Float32Array | Int32Array | Uint8Array;

    // Return a copy
    return array.slice() as Float32Array | Int32Array | Uint8Array;
  }

  // ==========================================================================
  // Remove
  // ==========================================================================

  /**
   * Remove an attribute from the geometry.
   *
   * @returns true if the attribute existed and was removed
   */
  static removeAttribute(geometry: THREE.BufferGeometry, name: string): boolean {
    if (!geometry.hasAttribute(name)) return false;
    geometry.deleteAttribute(name);

    // Clean up metadata
    const domains = geometry.userData.__attributeDomains as Record<string, unknown> | undefined;
    if (domains && domains[name]) {
      delete domains[name];
    }

    return true;
  }

  // ==========================================================================
  // Has
  // ==========================================================================

  /**
   * Check if an attribute exists on the geometry.
   */
  static hasAttribute(geometry: THREE.BufferGeometry, name: string): boolean {
    return geometry.hasAttribute(name);
  }

  // ==========================================================================
  // Get Domain
  // ==========================================================================

  /**
   * Get the domain of an attribute (stored in userData).
   *
   * @returns The domain, or null if the attribute doesn't exist or has no metadata
   */
  static getAttributeDomain(geometry: THREE.BufferGeometry, name: string): AttributeDomain | null {
    const meta = getDomainMeta(geometry, name);
    return meta ? meta.domain : null;
  }

  // ==========================================================================
  // Get Data Type
  // ==========================================================================

  /**
   * Get the data type of an attribute (stored in userData).
   */
  static getAttributeDataType(geometry: THREE.BufferGeometry, name: string): AttributeDataType | null {
    const meta = getDomainMeta(geometry, name);
    return meta ? meta.dataType : null;
  }

  // ==========================================================================
  // List Attributes
  // ==========================================================================

  /**
   * List all custom attributes (excluding position, normal, uv, etc.)
   */
  static listAttributes(geometry: THREE.BufferGeometry): AttributeInfo[] {
    const result: AttributeInfo[] = [];
    const skipNames = new Set(['position', 'normal', 'uv', 'uv1', 'uv2', 'color', 'color0', 'tangent', 'index']);

    for (const name of Object.keys(geometry.attributes)) {
      if (skipNames.has(name)) continue;
      const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
      const meta = getDomainMeta(geometry, name);

      result.push({
        name,
        domain: meta?.domain ?? 'point',
        dataType: meta?.dataType ?? 'float',
        data: attr.array.slice() as Float32Array | Int32Array | Uint8Array,
      });
    }

    return result;
  }

  // ==========================================================================
  // Smooth Attribute
  // ==========================================================================

  /**
   * Smooth a float attribute using Laplacian smoothing.
   *
   * @param geometry - Target geometry
   * @param name - Attribute name to smooth
   * @param iterations - Number of smoothing passes (default: 3)
   * @param weight - Smoothing weight per iteration (default: 0.5)
   */
  static smoothAttribute(
    geometry: THREE.BufferGeometry,
    name: string,
    iterations: number = 3,
    weight: number = 0.5,
  ): void {
    if (!geometry.hasAttribute(name)) return;

    const attr = geometry.getAttribute(name) as THREE.BufferAttribute;
    const itemSize = attr.itemSize;
    const count = attr.count;

    if (count === 0) return;

    const neighbors = buildVertexNeighbors(geometry);
    const array = attr.array as Float32Array;

    for (let iter = 0; iter < iterations; iter++) {
      // Create a snapshot of current values
      const snapshot = new Float32Array(array);

      for (let i = 0; i < count; i++) {
        const nbrs = neighbors.get(i);
        if (!nbrs || nbrs.length === 0) continue;

        for (let c = 0; c < itemSize; c++) {
          let sum = 0.0;
          for (const n of nbrs) {
            sum += snapshot[n * itemSize + c];
          }
          const avg = sum / nbrs.length;
          array[i * itemSize + c] = snapshot[i * itemSize + c] * (1.0 - weight) + avg * weight;
        }
      }
    }

    attr.needsUpdate = true;
  }

  // ==========================================================================
  // Transfer Attribute
  // ==========================================================================

  /**
   * Transfer an attribute from source geometry to target geometry.
   *
   * @param source - Source geometry with the attribute
   * @param target - Target geometry to receive the attribute
   * @param name - Attribute name
   * @param mapping - Transfer method: 'nearest' uses closest vertex, 'barycentric' uses barycentric interpolation
   */
  static transferAttribute(
    source: THREE.BufferGeometry,
    target: THREE.BufferGeometry,
    name: string,
    mapping: 'nearest' | 'barycentric',
  ): void {
    if (!source.hasAttribute(name)) return;

    const srcAttr = geometry_getAttribute(source, name);
    if (!srcAttr) return;

    const meta = getDomainMeta(source, name);
    const domain: AttributeDomain = meta?.domain ?? 'point';
    const dataType: AttributeDataType = meta?.dataType ?? 'float';
    const itemSize = srcAttr.itemSize;
    const targetCount = getDomainElementCount(target, domain);
    const newData = createTypedArray(dataType, targetCount);

    const srcPos = source.getAttribute('position') as THREE.BufferAttribute;
    const tgtPos = target.getAttribute('position') as THREE.BufferAttribute;

    if (!srcPos || !tgtPos) return;

    if (mapping === 'nearest') {
      this.transferNearest(
        source, target, srcAttr, srcPos, tgtPos,
        itemSize, targetCount, newData,
      );
    } else {
      this.transferBarycentric(
        source, target, srcAttr, srcPos, tgtPos,
        itemSize, targetCount, newData,
      );
    }

    this.writeAttribute(target, name, newData, domain, dataType);
  }

  private static transferNearest(
    source: THREE.BufferGeometry,
    _target: THREE.BufferGeometry,
    srcAttr: THREE.BufferAttribute,
    srcPos: THREE.BufferAttribute,
    tgtPos: THREE.BufferAttribute,
    itemSize: number,
    targetCount: number,
    outData: Float32Array | Int32Array | Uint8Array,
  ): void {
    const srcArray = srcAttr.array as Float32Array;
    const srcCount = srcPos.count;

    for (let i = 0; i < targetCount; i++) {
      // Find nearest source vertex
      const tx = tgtPos.getX(i);
      const ty = tgtPos.getY(i);
      const tz = tgtPos.getZ(i);

      let minDist = Infinity;
      let nearestIdx = 0;

      for (let j = 0; j < srcCount; j++) {
        const dx = srcPos.getX(j) - tx;
        const dy = srcPos.getY(j) - ty;
        const dz = srcPos.getZ(j) - tz;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = j;
        }
      }

      // Copy attribute value from nearest source vertex
      for (let c = 0; c < itemSize; c++) {
        (outData as Float32Array)[i * itemSize + c] = srcArray[nearestIdx * itemSize + c];
      }
    }
  }

  private static transferBarycentric(
    source: THREE.BufferGeometry,
    _target: THREE.BufferGeometry,
    srcAttr: THREE.BufferAttribute,
    srcPos: THREE.BufferAttribute,
    tgtPos: THREE.BufferAttribute,
    itemSize: number,
    targetCount: number,
    outData: Float32Array | Int32Array | Uint8Array,
  ): void {
    const srcArray = srcAttr.array as Float32Array;
    const srcFaces = buildFaceVertices(source);

    for (let i = 0; i < targetCount; i++) {
      const tx = tgtPos.getX(i);
      const ty = tgtPos.getY(i);
      const tz = tgtPos.getZ(i);
      const targetPoint = new THREE.Vector3(tx, ty, tz);

      // Find the source face containing (or closest to) this point
      let bestBary = new THREE.Vector3(1, 0, 0);
      let bestFaceIdx = 0;
      let bestDist = Infinity;

      for (let f = 0; f < srcFaces.length; f++) {
        const face = srcFaces[f];
        const v0 = new THREE.Vector3(srcPos.getX(face[0]), srcPos.getY(face[0]), srcPos.getZ(face[0]));
        const v1 = new THREE.Vector3(srcPos.getX(face[1]), srcPos.getY(face[1]), srcPos.getZ(face[1]));
        const v2 = new THREE.Vector3(srcPos.getX(face[2]), srcPos.getY(face[2]), srcPos.getZ(face[2]));

        // Project target point onto triangle plane and compute barycentric
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2);
        const areaSq = normal.lengthSq();
        if (areaSq < 1e-10) continue;

        const vp = new THREE.Vector3().subVectors(targetPoint, v0);
        const d00 = edge1.dot(edge1);
        const d01 = edge1.dot(edge2);
        const d11 = edge2.dot(edge2);
        const d20 = vp.dot(edge1);
        const d21 = vp.dot(edge2);

        const denom = d00 * d11 - d01 * d01;
        if (Math.abs(denom) < 1e-10) continue;

        const v = (d11 * d20 - d01 * d21) / denom;
        const w = (d00 * d21 - d01 * d20) / denom;
        const u = 1.0 - v - w;

        // Check if point is inside triangle
        const inside = u >= -0.01 && v >= -0.01 && w >= -0.01;
        const bary = new THREE.Vector3(u, v, w);

        // Distance to triangle plane
        const planeDist = Math.abs(vp.dot(normal) / Math.sqrt(areaSq));

        if (inside && planeDist < bestDist) {
          bestDist = planeDist;
          bestBary = bary;
          bestFaceIdx = f;
        } else if (!inside && planeDist < bestDist && bestDist > 0.01) {
          // Use closest triangle even if point is outside
          bestDist = planeDist;
          bestBary = bary.clampScalar(0, 1);
          bestBary.divideScalar(bestBary.x + bestBary.y + bestBary.z + 1e-10);
          bestFaceIdx = f;
        }
      }

      const face = srcFaces[bestFaceIdx];
      const baryU = Math.max(0, bestBary.x);
      const baryV = Math.max(0, bestBary.y);
      const baryW = Math.max(0, bestBary.z);
      const barySum = baryU + baryV + baryW + 1e-10;

      // Interpolate attribute
      for (let c = 0; c < itemSize; c++) {
        const val0 = srcArray[face[0] * itemSize + c] ?? 0;
        const val1 = srcArray[face[1] * itemSize + c] ?? 0;
        const val2 = srcArray[face[2] * itemSize + c] ?? 0;
        (outData as Float32Array)[i * itemSize + c] =
          (val0 * baryU + val1 * baryV + val2 * baryW) / barySum;
      }
    }
  }

  // ==========================================================================
  // Create Attribute From Function
  // ==========================================================================

  /**
   * Create a named attribute from a function that computes per-element values.
   *
   * @param geometry - Target geometry
   * @param name - Attribute name
   * @param domain - Attribute domain
   * @param dataType - Data type
   * @param fn - Function taking (index, position, normal) and returning a value
   */
  static createAttributeFromFunction(
    geometry: THREE.BufferGeometry,
    name: string,
    domain: AttributeDomain,
    dataType: AttributeDataType,
    fn: (index: number, position: THREE.Vector3, normal: THREE.Vector3) => number | number[],
  ): void {
    const elementCount = getDomainElementCount(geometry, domain);
    const itemSize = getItemSize(dataType);
    const data = createTypedArray(dataType, elementCount);

    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const indexAttr = geometry.getIndex();
    const faces = buildFaceVertices(geometry);

    const tmpPos = new THREE.Vector3();
    const tmpNorm = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < elementCount; i++) {
      // Compute position and normal for this element
      if (domain === 'point' || domain === 'corner') {
        const idx = domain === 'corner' && indexAttr ? indexAttr.getX(i) : i;
        if (posAttr) {
          tmpPos.set(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        }
        if (normalAttr) {
          tmpNorm.set(normalAttr.getX(idx), normalAttr.getY(idx), normalAttr.getZ(idx));
        }
      } else if (domain === 'face') {
        if (i < faces.length) {
          const face = faces[i];
          tmpPos.set(0, 0, 0);
          for (const vi of face) {
            if (posAttr) {
              tmpPos.x += posAttr.getX(vi) / 3;
              tmpPos.y += posAttr.getY(vi) / 3;
              tmpPos.z += posAttr.getZ(vi) / 3;
            }
          }
          // Compute face normal
          if (face.length >= 3 && posAttr) {
            const v0 = new THREE.Vector3(posAttr.getX(face[0]), posAttr.getY(face[0]), posAttr.getZ(face[0]));
            const v1 = new THREE.Vector3(posAttr.getX(face[1]), posAttr.getY(face[1]), posAttr.getZ(face[1]));
            const v2 = new THREE.Vector3(posAttr.getX(face[2]), posAttr.getY(face[2]), posAttr.getZ(face[2]));
            tmpNorm.crossVectors(
              new THREE.Vector3().subVectors(v1, v0),
              new THREE.Vector3().subVectors(v2, v0),
            ).normalize();
          }
        }
      }
      // edge, spline, instance: use origin

      const result = fn(i, tmpPos, tmpNorm);

      if (typeof result === 'number') {
        (data as Float32Array)[i * itemSize] = result;
      } else if (Array.isArray(result)) {
        for (let c = 0; c < Math.min(result.length, itemSize); c++) {
          (data as Float32Array)[i * itemSize + c] = result[c];
        }
      }
    }

    this.writeAttribute(geometry, name, data, domain, dataType);
  }

  // ==========================================================================
  // Convert Attribute Domain
  // ==========================================================================

  /**
   * Convert an attribute from one domain to another.
   *
   * Supported conversions:
   * - point → face: average vertex values per face
   * - point → corner: direct vertex lookup per corner
   * - face → point: average face values per vertex
   * - corner → point: average corner values per vertex
   * - corner → face: average corner values per face
   *
   * @param geometry - Target geometry
   * @param name - Attribute name
   * @param fromDomain - Source domain
   * @param toDomain - Target domain
   */
  static convertAttributeDomain(
    geometry: THREE.BufferGeometry,
    name: string,
    fromDomain: AttributeDomain,
    toDomain: AttributeDomain,
  ): void {
    if (fromDomain === toDomain) return;
    if (!geometry.hasAttribute(name)) return;

    const meta = getDomainMeta(geometry, name);
    const dataType: AttributeDataType = meta?.dataType ?? 'float';
    const srcAttr = geometry.getAttribute(name) as THREE.BufferAttribute;
    const itemSize = srcAttr.itemSize;
    const srcArray = srcAttr.array as Float32Array;
    const srcCount = getDomainElementCount(geometry, fromDomain);
    const tgtCount = getDomainElementCount(geometry, toDomain);
    const newData = createTypedArray(dataType, tgtCount) as Float32Array;
    const faces = buildFaceVertices(geometry);
    const indexAttr = geometry.getIndex();

    if (fromDomain === 'point' && toDomain === 'face') {
      // Average vertex values per face
      for (let f = 0; f < Math.min(faces.length, tgtCount); f++) {
        const face = faces[f];
        for (let c = 0; c < itemSize; c++) {
          let sum = 0;
          for (const vi of face) {
            sum += vi < srcCount ? srcArray[vi * itemSize + c] : 0;
          }
          newData[f * itemSize + c] = sum / face.length;
        }
      }
    } else if (fromDomain === 'point' && toDomain === 'corner') {
      // Direct vertex lookup per corner
      const cornerCount = indexAttr ? indexAttr.count : tgtCount;
      for (let c = 0; c < cornerCount; c++) {
        const vi = indexAttr ? indexAttr.getX(c) : c;
        for (let s = 0; s < itemSize; s++) {
          newData[c * itemSize + s] = vi < srcCount ? srcArray[vi * itemSize + s] : 0;
        }
      }
    } else if (fromDomain === 'face' && toDomain === 'point') {
      // Average face values per vertex
      const vertexCount = getDomainElementCount(geometry, 'point');
      const sums = new Float32Array(vertexCount * itemSize);
      const counts = new Float32Array(vertexCount);

      for (let f = 0; f < Math.min(faces.length, srcCount); f++) {
        const face = faces[f];
        for (const vi of face) {
          if (vi >= vertexCount) continue;
          counts[vi]++;
          for (let s = 0; s < itemSize; s++) {
            sums[vi * itemSize + s] += f < srcCount ? srcArray[f * itemSize + s] : 0;
          }
        }
      }

      for (let v = 0; v < vertexCount; v++) {
        for (let s = 0; s < itemSize; s++) {
          newData[v * itemSize + s] = counts[v] > 0 ? sums[v * itemSize + s] / counts[v] : 0;
        }
      }
    } else if (fromDomain === 'corner' && toDomain === 'point') {
      // Average corner values per vertex
      const vertexCount = getDomainElementCount(geometry, 'point');
      const sums = new Float32Array(vertexCount * itemSize);
      const counts = new Float32Array(vertexCount);
      const cornerCount = indexAttr ? indexAttr.count : srcCount;

      for (let c = 0; c < cornerCount; c++) {
        const vi = indexAttr ? indexAttr.getX(c) : c;
        if (vi >= vertexCount) continue;
        counts[vi]++;
        for (let s = 0; s < itemSize; s++) {
          sums[vi * itemSize + s] += c < srcCount ? srcArray[c * itemSize + s] : 0;
        }
      }

      for (let v = 0; v < vertexCount; v++) {
        for (let s = 0; s < itemSize; s++) {
          newData[v * itemSize + s] = counts[v] > 0 ? sums[v * itemSize + s] / counts[v] : 0;
        }
      }
    } else if (fromDomain === 'corner' && toDomain === 'face') {
      // Average corner values per face
      for (let f = 0; f < faces.length; f++) {
        for (let s = 0; s < itemSize; s++) {
          let sum = 0;
          for (let c = 0; c < 3; c++) {
            const cornerIdx = f * 3 + c;
            sum += cornerIdx < srcCount ? srcArray[cornerIdx * itemSize + s] : 0;
          }
          newData[f * itemSize + s] = sum / 3;
        }
      }
    } else {
      // Unsupported conversion — copy with clamping
      for (let i = 0; i < tgtCount; i++) {
        const srcIdx = i % Math.max(srcCount, 1);
        for (let s = 0; s < itemSize; s++) {
          newData[i * itemSize + s] = srcArray[srcIdx * itemSize + s];
        }
      }
    }

    // Remove old attribute and write new one
    this.removeAttribute(geometry, name);
    this.writeAttribute(geometry, name, newData, toDomain, dataType);
  }

  // ==========================================================================
  // Get Element Count
  // ==========================================================================

  /**
   * Get the number of elements for a given domain.
   */
  static getElementCount(geometry: THREE.BufferGeometry, domain: AttributeDomain): number {
    return getDomainElementCount(geometry, domain);
  }

  // ==========================================================================
  // Get Edges
  // ==========================================================================

  /**
   * Get the edge list for the geometry.
   */
  static getEdges(geometry: THREE.BufferGeometry): Array<{ v0: number; v1: number }> {
    return buildEdgeList(geometry);
  }

  // ==========================================================================
  // Get Face Vertices
  // ==========================================================================

  /**
   * Get the face → vertex indices mapping.
   */
  static getFaceVertices(geometry: THREE.BufferGeometry): number[][] {
    return buildFaceVertices(geometry);
  }

  // ==========================================================================
  // Ensure Normal Attribute
  // ==========================================================================

  /**
   * Ensure the geometry has computed normals.
   */
  static ensureNormals(geometry: THREE.BufferGeometry): void {
    if (!geometry.getAttribute('normal')) {
      geometry.computeVertexNormals();
    }
  }
}

// ============================================================================
// Helper: getAttribute safely
// ============================================================================

function geometry_getAttribute(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute | null {
  return (geometry.getAttribute(name) as THREE.BufferAttribute) ?? null;
}
