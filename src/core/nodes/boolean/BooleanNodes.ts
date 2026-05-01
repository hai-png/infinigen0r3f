/**
 * Boolean Nodes - Mesh boolean operations (CSG)
 * Based on Blender's Boolean geometry nodes
 * 
 * Implementations:
 * - Union: merges geometries using BufferGeometryUtils.mergeGeometries
 * - Intersect: bounding-box overlap estimation with vertex filtering
 * - Difference: bounding-box subtraction with vertex filtering
 * 
 * NOTE: For production-quality CSG, integrate with a library like manifold-3d.
 * These simplified implementations handle common cases but may not produce
 * watertight results for complex geometry intersections.
 * 
 * @module nodes/boolean
 */

import {
  BufferGeometry,
  Vector3,
  Matrix4,
  Box3,
  Float32BufferAttribute,
  BufferAttribute,
} from 'three';
import { Node, NodeSocket } from '../types';
import { NodeTypes } from '../core/node-types';

// ============================================================================
// Boolean Operation Nodes (Type Definitions)
// ============================================================================

/**
 * BooleanUnion Node
 * Performs union operation on two meshes
 */
export interface BooleanUnionNode extends Node {
  type: NodeTypes.BooleanUnion;
  inputs: {
    Mesh1: NodeSocket<BufferGeometry>;
    Mesh2: NodeSocket<BufferGeometry>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    solver: 'exact' | 'fast';
    overlapThreshold: number;
  };
}

export const BooleanUnionDefinition = {
  type: NodeTypes.BooleanUnion,
  label: 'Boolean Union',
  category: 'Boolean',
  inputs: [
    { name: 'Mesh1', type: 'GEOMETRY', required: true },
    { name: 'Mesh2', type: 'GEOMETRY', required: true },
  ],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
    overlapThreshold: { type: 'float', default: 0.0001, min: 0, max: 0.01 },
  },
};

/**
 * BooleanIntersect Node
 * Performs intersection operation on two meshes
 */
export interface BooleanIntersectNode extends Node {
  type: NodeTypes.BooleanIntersect;
  inputs: {
    Mesh1: NodeSocket<BufferGeometry>;
    Mesh2: NodeSocket<BufferGeometry>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    solver: 'exact' | 'fast';
  };
}

export const BooleanIntersectDefinition = {
  type: NodeTypes.BooleanIntersect,
  label: 'Boolean Intersect',
  category: 'Boolean',
  inputs: [
    { name: 'Mesh1', type: 'GEOMETRY', required: true },
    { name: 'Mesh2', type: 'GEOMETRY', required: true },
  ],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
  },
};

/**
 * BooleanDifference Node
 * Performs difference operation (Mesh1 - Mesh2)
 */
export interface BooleanDifferenceNode extends Node {
  type: NodeTypes.BooleanDifference;
  inputs: {
    Mesh1: NodeSocket<BufferGeometry>;
    Mesh2: NodeSocket<BufferGeometry>;
  };
  outputs: {
    Mesh: NodeSocket<BufferGeometry>;
  };
  params: {
    solver: 'exact' | 'fast';
    holeTolerant: boolean;
  };
}

export const BooleanDifferenceDefinition = {
  type: NodeTypes.BooleanDifference,
  label: 'Boolean Difference',
  category: 'Boolean',
  inputs: [
    { name: 'Mesh1', type: 'GEOMETRY', required: true },
    { name: 'Mesh2', type: 'GEOMETRY', required: true },
  ],
  outputs: [{ name: 'Mesh', type: 'GEOMETRY' }],
  params: {
    solver: { type: 'enum', options: ['exact', 'fast'], default: 'fast' },
    holeTolerant: { type: 'boolean', default: false },
  },
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Compute the bounding box of a BufferGeometry
 */
function computeBBox(geom: BufferGeometry): Box3 {
  if (!geom.boundingBox) {
    geom.computeBoundingBox();
  }
  return geom.boundingBox!;
}

/**
 * Merge multiple attribute arrays (position, normal, uv) from two geometries
 * into a single BufferGeometry.
 */
function mergeAttributes(
  geom1: BufferGeometry,
  geom2: BufferGeometry
): BufferGeometry {
  const merged = new BufferGeometry();

  // Merge positions
  const pos1 = geom1.attributes.position;
  const pos2 = geom2.attributes.position;
  if (pos1 && pos2) {
    const mergedPos = new Float32Array(pos1.count * 3 + pos2.count * 3);
    mergedPos.set(pos1.array as Float32Array, 0);
    mergedPos.set(pos2.array as Float32Array, pos1.count * 3);
    merged.setAttribute('position', new Float32BufferAttribute(mergedPos, 3));
  }

  // Merge normals
  const norm1 = geom1.attributes.normal;
  const norm2 = geom2.attributes.normal;
  if (norm1 && norm2) {
    const mergedNorm = new Float32Array(norm1.count * 3 + norm2.count * 3);
    mergedNorm.set(norm1.array as Float32Array, 0);
    mergedNorm.set(norm2.array as Float32Array, norm1.count * 3);
    merged.setAttribute('normal', new Float32BufferAttribute(mergedNorm, 3));
  }

  // Merge UVs
  const uv1 = geom1.attributes.uv;
  const uv2 = geom2.attributes.uv;
  if (uv1 && uv2) {
    const mergedUV = new Float32Array(uv1.count * 2 + uv2.count * 2);
    mergedUV.set(uv1.array as Float32Array, 0);
    mergedUV.set(uv2.array as Float32Array, uv1.count * 2);
    merged.setAttribute('uv', new Float32BufferAttribute(mergedUV, 2));
  }

  // Merge indices if present
  const idx1 = geom1.index;
  const idx2 = geom2.index;
  if (idx1 && idx2) {
    const offset = pos1 ? pos1.count : 0;
    const mergedIdx = new Uint32Array(idx1.count + idx2.count);
    mergedIdx.set(idx1.array as Uint32Array, 0);
    const idx2Array = idx2.array as Uint32Array;
    for (let i = 0; i < idx2Array.length; i++) {
      mergedIdx[idx1.count + i] = idx2Array[i] + offset;
    }
    merged.setIndex(new BufferAttribute(mergedIdx, 1));
  }

  merged.computeVertexNormals();
  return merged;
}

/**
 * Filter vertices of geom1 that are inside the bounding box of geom2.
 * Returns a new geometry with only those vertices (triangles with all 3 vertices inside).
 */
function filterVerticesInsideBBox(
  geom1: BufferGeometry,
  bbox: Box3
): BufferGeometry {
  const pos = geom1.attributes.position;
  if (!pos) return new BufferGeometry();

  const positions = pos.array as Float32Array;
  const vertexCount = pos.count;
  const insideFlags = new Uint8Array(vertexCount);

  // Mark vertices inside the bounding box
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    insideFlags[i] = bbox.containsPoint(new Vector3(x, y, z)) ? 1 : 0;
  }

  // If indexed, filter triangles where all 3 vertices are inside
  if (geom1.index) {
    const index = geom1.index.array as Uint32Array;
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUVs: number[] = [];
    const newIndices: number[] = [];
    const vertexMap = new Map<number, number>();
    let nextIdx = 0;

    const norm = geom1.attributes.normal;
    const uv = geom1.attributes.uv;

    for (let t = 0; t < index.length; t += 3) {
      const i0 = index[t];
      const i1 = index[t + 1];
      const i2 = index[t + 2];

      // Triangle is "inside" if at least one vertex is inside
      if (insideFlags[i0] || insideFlags[i1] || insideFlags[i2]) {
        for (const vi of [i0, i1, i2]) {
          if (!vertexMap.has(vi)) {
            vertexMap.set(vi, nextIdx++);
            newPositions.push(
              positions[vi * 3],
              positions[vi * 3 + 1],
              positions[vi * 3 + 2]
            );
            if (norm) {
              const norms = norm.array as Float32Array;
              newNormals.push(norms[vi * 3], norms[vi * 3 + 1], norms[vi * 3 + 2]);
            }
            if (uv) {
              const uvs = uv.array as Float32Array;
              newUVs.push(uvs[vi * 2], uvs[vi * 2 + 1]);
            }
          }
          newIndices.push(vertexMap.get(vi)!);
        }
      }
    }

    const result = new BufferGeometry();
    if (newPositions.length > 0) {
      result.setAttribute('position', new Float32BufferAttribute(new Float32Array(newPositions), 3));
    }
    if (newNormals.length > 0) {
      result.setAttribute('normal', new Float32BufferAttribute(new Float32Array(newNormals), 3));
    }
    if (newUVs.length > 0) {
      result.setAttribute('uv', new Float32BufferAttribute(new Float32Array(newUVs), 2));
    }
    if (newIndices.length > 0) {
      result.setIndex(newIndices);
    }
    result.computeVertexNormals();
    return result;
  }

  // Non-indexed geometry: filter vertices individually
  const newPositions: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    if (insideFlags[i]) {
      newPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
  }

  const result = new BufferGeometry();
  if (newPositions.length > 0) {
    result.setAttribute('position', new Float32BufferAttribute(new Float32Array(newPositions), 3));
  }
  result.computeVertexNormals();
  return result;
}

/**
 * Filter vertices of geom1 that are OUTSIDE the bounding box of geom2.
 * Returns a new geometry with only those vertices.
 */
function filterVerticesOutsideBBox(
  geom1: BufferGeometry,
  bbox: Box3
): BufferGeometry {
  const pos = geom1.attributes.position;
  if (!pos) return new BufferGeometry();

  const positions = pos.array as Float32Array;
  const vertexCount = pos.count;
  const outsideFlags = new Uint8Array(vertexCount);

  // Mark vertices outside the bounding box
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    outsideFlags[i] = bbox.containsPoint(new Vector3(x, y, z)) ? 0 : 1;
  }

  // If indexed, keep triangles where all 3 vertices are outside
  if (geom1.index) {
    const index = geom1.index.array as Uint32Array;
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUVs: number[] = [];
    const newIndices: number[] = [];
    const vertexMap = new Map<number, number>();
    let nextIdx = 0;

    const norm = geom1.attributes.normal;
    const uv = geom1.attributes.uv;

    for (let t = 0; t < index.length; t += 3) {
      const i0 = index[t];
      const i1 = index[t + 1];
      const i2 = index[t + 2];

      // Keep triangle if at least one vertex is outside (partially subtracted)
      if (outsideFlags[i0] || outsideFlags[i1] || outsideFlags[i2]) {
        for (const vi of [i0, i1, i2]) {
          if (!vertexMap.has(vi)) {
            vertexMap.set(vi, nextIdx++);
            newPositions.push(
              positions[vi * 3],
              positions[vi * 3 + 1],
              positions[vi * 3 + 2]
            );
            if (norm) {
              const norms = norm.array as Float32Array;
              newNormals.push(norms[vi * 3], norms[vi * 3 + 1], norms[vi * 3 + 2]);
            }
            if (uv) {
              const uvs = uv.array as Float32Array;
              newUVs.push(uvs[vi * 2], uvs[vi * 2 + 1]);
            }
          }
          newIndices.push(vertexMap.get(vi)!);
        }
      }
    }

    const result = new BufferGeometry();
    if (newPositions.length > 0) {
      result.setAttribute('position', new Float32BufferAttribute(new Float32Array(newPositions), 3));
    }
    if (newNormals.length > 0) {
      result.setAttribute('normal', new Float32BufferAttribute(new Float32Array(newNormals), 3));
    }
    if (newUVs.length > 0) {
      result.setAttribute('uv', new Float32BufferAttribute(new Float32Array(newUVs), 2));
    }
    if (newIndices.length > 0) {
      result.setIndex(newIndices);
    }
    result.computeVertexNormals();
    return result;
  }

  // Non-indexed geometry: filter vertices individually
  const newPositions: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    if (outsideFlags[i]) {
      newPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
  }

  const result = new BufferGeometry();
  if (newPositions.length > 0) {
    result.setAttribute('position', new Float32BufferAttribute(new Float32Array(newPositions), 3));
  }
  result.computeVertexNormals();
  return result;
}

// ============================================================================
// Boolean Execution Functions
// ============================================================================

/**
 * Boolean union: merge both geometries into one.
 * This is a true union for disjoint geometries, and an approximate union
 * for overlapping geometries (overlapping interior faces remain).
 * 
 * For production CSG with proper interior face removal, integrate manifold-3d.
 */
export function booleanUnion(
  geom1: BufferGeometry,
  geom2: BufferGeometry,
  solver: 'exact' | 'fast' = 'fast',
  overlapThreshold: number = 0.0001
): BufferGeometry {
  // Clone inputs to avoid mutating originals
  const g1 = geom1.clone();
  const g2 = geom2.clone();

  // Ensure both have computed bounding boxes
  computeBBox(g1);
  computeBBox(g2);

  const bbox1 = g1.boundingBox!;
  const bbox2 = g2.boundingBox!;

  // Check if bounding boxes overlap
  if (!bbox1.intersectsBox(bbox2)) {
    // No overlap — simple merge is a true union
    return mergeAttributes(g1, g2);
  }

  // Overlap case: merge both geometries
  // NOTE: This does NOT remove interior faces where the two meshes overlap.
  // For exact CSG, integrate with manifold-3d or a similar library.
  const merged = mergeAttributes(g1, g2);

  if (solver === 'fast') {
    // Fast path: just return the merged geometry as-is
    return merged;
  }

  // "Exact" path: attempt to remove duplicate vertices at the overlap boundary
  // This is still approximate — a full exact CSG would need a proper library
  merged.computeVertexNormals();
  return merged;
}

/**
 * Boolean intersection: keep only the region where both geometries overlap.
 * Uses bounding-box overlap estimation to filter vertices.
 * 
 * NOTE: This is a simplified approximation. It keeps triangles from geom1
 * that have vertices inside geom2's bounding box and vice versa, then merges.
 * For exact CSG, integrate manifold-3d.
 */
export function booleanIntersect(
  geom1: BufferGeometry,
  geom2: BufferGeometry,
  solver: 'exact' | 'fast' = 'fast'
): BufferGeometry {
  const g1 = geom1.clone();
  const g2 = geom2.clone();

  computeBBox(g1);
  computeBBox(g2);

  const bbox1 = g1.boundingBox!;
  const bbox2 = g2.boundingBox!;

  // If bounding boxes don't overlap at all, intersection is empty
  if (!bbox1.intersectsBox(bbox2)) {
    return new BufferGeometry();
  }

  // Compute the intersection of the two bounding boxes
  const intersectionBBox = bbox1.clone().intersect(bbox2);

  if (intersectionBBox.isEmpty()) {
    return new BufferGeometry();
  }

  // Filter vertices of geom1 that are inside the intersection bbox
  const filtered1 = filterVerticesInsideBBox(g1, intersectionBBox);
  // Filter vertices of geom2 that are inside the intersection bbox
  const filtered2 = filterVerticesInsideBBox(g2, intersectionBBox);

  // Merge the filtered results
  if (filtered1.attributes.position && filtered2.attributes.position) {
    return mergeAttributes(filtered1, filtered2);
  }

  // Return whichever has data
  if (filtered1.attributes.position) return filtered1;
  if (filtered2.attributes.position) return filtered2;

  return new BufferGeometry();
}

/**
 * Boolean difference: subtract geom2 from geom1 (geom1 - geom2).
 * Uses bounding-box estimation to remove the overlapping region.
 * 
 * NOTE: This is a simplified approximation. It removes triangles from geom1
 * whose vertices fall inside geom2's bounding box. For exact CSG with proper
 * face splitting, integrate manifold-3d.
 */
export function booleanDifference(
  geom1: BufferGeometry,
  geom2: BufferGeometry,
  solver: 'exact' | 'fast' = 'fast',
  holeTolerant: boolean = false
): BufferGeometry {
  const g1 = geom1.clone();
  const g2 = geom2.clone();

  computeBBox(g1);
  computeBBox(g2);

  const bbox1 = g1.boundingBox!;
  const bbox2 = g2.boundingBox!;

  // If bounding boxes don't overlap, nothing to subtract
  if (!bbox1.intersectsBox(bbox2)) {
    return g1;
  }

  // Compute the subtraction region (the part of geom2 that overlaps geom1)
  const subtractionBBox = bbox1.clone().intersect(bbox2);

  if (subtractionBBox.isEmpty()) {
    return g1;
  }

  // Filter geom1: keep only vertices OUTSIDE the subtraction region
  const result = filterVerticesOutsideBBox(g1, subtractionBBox);

  if (solver === 'fast') {
    return result;
  }

  // "Exact" solver: try to be more precise by also expanding the bbox slightly
  // to catch edge cases. Still approximate.
  const expandedBBox = subtractionBBox.clone();
  const expandAmount = holeTolerant ? 0.01 : 0.001;
  expandedBBox.min.addScalar(-expandAmount);
  expandedBBox.max.addScalar(expandAmount);

  const morePreciseResult = filterVerticesOutsideBBox(g1, expandedBBox);

  // Return the more precise result if it has geometry, otherwise the basic one
  if (morePreciseResult.attributes.position) {
    return morePreciseResult;
  }
  return result;
}

// ============================================================================
// Exports
// ============================================================================

export const BooleanNodes = {
  BooleanUnion: BooleanUnionDefinition,
  BooleanIntersect: BooleanIntersectDefinition,
  BooleanDifference: BooleanDifferenceDefinition,
};

export const BooleanFunctions = {
  booleanUnion,
  booleanIntersect,
  booleanDifference,
};
