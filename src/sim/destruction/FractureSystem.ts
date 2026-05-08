/**
 * FractureSystem.ts
 *
 * Voronoi-based mesh fracture system for destructible objects.
 * Splits a Three.js Mesh into multiple pieces using Voronoi cell decomposition.
 * Deterministic via SeededRandom for reproducible fractures.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the fracture operation.
 */
export interface FractureConfig {
  /** Number of Voronoi seed points / target piece count (default 8) */
  pieceCount: number;
  /** Random seed for deterministic fractures (default 42) */
  seed: number;
  /** Force applied to offset pieces outward from center (default 0) */
  explosionForce: number;
  /** Jitter applied to seed point positions as fraction of bounding box size (default 0.1) */
  voronoiJitter: number;
}

/** Default fracture configuration */
const DEFAULT_CONFIG: FractureConfig = {
  pieceCount: 8,
  seed: 42,
  explosionForce: 0,
  voronoiJitter: 0.1,
};

// ============================================================================
// Internal Types
// ============================================================================

/** A triangle referenced by its three vertex indices in the source geometry */
interface TriangleIndices {
  i0: number;
  i1: number;
  i2: number;
}

/** Mapping from old vertex index to new (remapped) vertex index within a cell */
type IndexRemap = Map<number, number>;

// ============================================================================
// FractureSystem
// ============================================================================

/**
 * Voronoi-based fracture system that splits a Three.js Mesh into separate pieces.
 *
 * Algorithm overview:
 * 1. Generate N random seed points inside the mesh's bounding box (deterministic).
 * 2. For each triangle, compute its centroid and find the nearest Voronoi seed.
 * 3. Group triangles by their assigned Voronoi cell.
 * 4. Extract geometry for each cell (positions, normals, uvs, indices).
 * 5. Create a new Mesh per cell with its own material.
 * 6. Optionally add internal faces along Voronoi boundary planes.
 * 7. Optionally apply an explosion force to offset pieces outward.
 */
export class FractureSystem {
  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Fracture a mesh into Voronoi-based pieces.
   *
   * @param mesh   The Three.js Mesh to fracture.
   * @param config Optional fracture configuration.
   * @returns      Array of new meshes, one per fracture piece.
   */
  fracture(mesh: THREE.Mesh, config?: Partial<FractureConfig>): THREE.Mesh[] {
    const cfg: FractureConfig = { ...DEFAULT_CONFIG, ...config };

    const geometry = mesh.geometry as THREE.BufferGeometry;

    // Ensure the geometry has an index buffer for clean triangle iteration
    const indexedGeometry = this.ensureIndexed(geometry);

    // World-space bounding box (accounts for mesh transforms)
    const bbox = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // 1. Generate Voronoi seed points
    const seedPoints = this.generateSeedPoints(bbox, cfg.pieceCount, cfg.seed, cfg.voronoiJitter);

    // 2. Read geometry data
    const posAttr = indexedGeometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = indexedGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = indexedGeometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const indexAttr = indexedGeometry.getIndex()!;

    const positions = posAttr.array as Float32Array;
    const normals = normalAttr ? (normalAttr.array as Float32Array) : null;
    const uvs = uvAttr ? (uvAttr.array as Float32Array) : null;
    const indices = indexAttr.array as Uint16Array | Uint32Array;

    // 3. Assign each triangle to its nearest Voronoi cell
    const cellAssignments = this.assignTrianglesToCells(
      positions,
      indices,
      seedPoints,
    );

    // 4. Extract cell geometries and create meshes
    const pieces: THREE.Mesh[] = [];

    for (let cellIndex = 0; cellIndex < seedPoints.length; cellIndex++) {
      const cellTriangles = cellAssignments.get(cellIndex);
      if (!cellTriangles || cellTriangles.length === 0) continue;

      // Build sub-geometry for this cell
      const cellGeometry = this.extractCellGeometry(
        positions,
        normals,
        uvs,
        indices,
        cellTriangles,
      );

      // Add internal faces on the Voronoi boundary
      this.addInternalFaces(cellGeometry, seedPoints[cellIndex], center, bbox);

      // Compute normals if they were missing
      if (!normalAttr) {
        cellGeometry.computeVertexNormals();
      }

      // Create material — clone original or create a new MeshStandardMaterial
      const material = this.createCellMaterial(mesh, cellIndex);

      const piece = new THREE.Mesh(cellGeometry, material);
      piece.castShadow = mesh.castShadow;
      piece.receiveShadow = mesh.receiveShadow;
      piece.userData.fractureCell = cellIndex;
      piece.userData.isFracturePiece = true;

      // Preserve world transform from original mesh
      piece.applyMatrix4(mesh.matrixWorld);

      pieces.push(piece);
    }

    // 5. Apply explosion force if requested
    if (cfg.explosionForce !== 0) {
      this.applyExplosion(pieces, center, cfg.explosionForce);
    }

    return pieces;
  }

  /**
   * Aggressive shatter — like fracture but with more pieces by default.
   */
  shatter(mesh: THREE.Mesh, config?: Partial<FractureConfig>): THREE.Mesh[] {
    const shatterConfig: Partial<FractureConfig> = {
      pieceCount: 16,
      explosionForce: 2,
      ...config,
    };
    return this.fracture(mesh, shatterConfig);
  }

  /**
   * Stress fracture — fracture radiating from a specific point.
   * Seed points are biased towards the stress point so that smaller pieces
   * appear near the impact location and larger pieces further out.
   *
   * @param mesh        Mesh to fracture.
   * @param stressPoint World-space point from which the fracture radiates.
   * @param config      Optional fracture configuration.
   */
  stressFracture(
    mesh: THREE.Mesh,
    stressPoint: THREE.Vector3,
    config?: Partial<FractureConfig>,
  ): THREE.Mesh[] {
    const cfg: FractureConfig = { ...DEFAULT_CONFIG, pieceCount: 12, ...config };

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const indexedGeometry = this.ensureIndexed(geometry);
    const bbox = new THREE.Box3().setFromObject(mesh);

    // Convert stress point into local space
    const invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const localStress = stressPoint.clone().applyMatrix4(invMatrix);

    // Generate seed points biased towards stress point using Gaussian distribution
    const rng = new SeededRandom(cfg.seed);
    const seedPoints: THREE.Vector3[] = [];
    const bboxSize = new THREE.Vector3();
    bbox.getSize(bboxSize);
    const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

    for (let i = 0; i < cfg.pieceCount; i++) {
      // Gaussian offset from stress point — closer points get denser seeds
      const spread = maxDim * 0.5 * (1.0 - (i / cfg.pieceCount) * 0.5);
      const x = localStress.x + rng.gaussian(0, spread * 0.3);
      const y = localStress.y + rng.gaussian(0, spread * 0.3);
      const z = localStress.z + rng.gaussian(0, spread * 0.3);
      const pt = new THREE.Vector3(x, y, z);
      // Clamp to bounding box
      pt.clamp(bbox.min, bbox.max);
      seedPoints.push(pt);
    }

    // Read geometry data
    const posAttr = indexedGeometry.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = indexedGeometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = indexedGeometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const indexAttr = indexedGeometry.getIndex()!;

    const positions = posAttr.array as Float32Array;
    const normals = normalAttr ? (normalAttr.array as Float32Array) : null;
    const uvs = uvAttr ? (uvAttr.array as Float32Array) : null;
    const indices = indexAttr.array as Uint16Array | Uint32Array;

    const cellAssignments = this.assignTrianglesToCells(positions, indices, seedPoints);

    const center = new THREE.Vector3();
    bbox.getCenter(center);

    const pieces: THREE.Mesh[] = [];
    for (let cellIndex = 0; cellIndex < seedPoints.length; cellIndex++) {
      const cellTriangles = cellAssignments.get(cellIndex);
      if (!cellTriangles || cellTriangles.length === 0) continue;

      const cellGeometry = this.extractCellGeometry(
        positions,
        normals,
        uvs,
        indices,
        cellTriangles,
      );

      this.addInternalFaces(cellGeometry, seedPoints[cellIndex], center, bbox);

      if (!normalAttr) {
        cellGeometry.computeVertexNormals();
      }

      const material = this.createCellMaterial(mesh, cellIndex);
      const piece = new THREE.Mesh(cellGeometry, material);
      piece.castShadow = mesh.castShadow;
      piece.receiveShadow = mesh.receiveShadow;
      piece.userData.fractureCell = cellIndex;
      piece.userData.isFracturePiece = true;
      piece.applyMatrix4(mesh.matrixWorld);
      pieces.push(piece);
    }

    if (cfg.explosionForce !== 0) {
      // For stress fracture, explosion radiates from stress point
      this.applyExplosion(pieces, stressPoint, cfg.explosionForce);
    }

    return pieces;
  }

  // ------------------------------------------------------------------
  // Seed Point Generation
  // ------------------------------------------------------------------

  /**
   * Generate Voronoi seed points inside a bounding box.
   * Uses SeededRandom for deterministic results.
   *
   * @param bounds  Bounding box to place seed points within.
   * @param count   Number of seed points.
   * @param seed    Random seed for deterministic generation.
   * @param jitter  Fraction of bounding box size to jitter seed positions (0 = grid, 1 = fully random).
   * @returns       Array of Vector3 seed points.
   */
  generateSeedPoints(
    bounds: THREE.Box3,
    count: number,
    seed: number,
    jitter: number = 0.1,
  ): THREE.Vector3[] {
    const rng = new SeededRandom(seed);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    // Determine a roughly uniform grid layout, then jitter each point
    const dims = this.computeGridDimensions(count);
    const points: THREE.Vector3[] = [];

    const stepX = size.x / dims.x;
    const stepY = size.y / dims.y;
    const stepZ = size.z / dims.z;

    for (let iz = 0; iz < dims.z && points.length < count; iz++) {
      for (let iy = 0; iy < dims.y && points.length < count; iy++) {
        for (let ix = 0; ix < dims.x && points.length < count; ix++) {
          // Base position on grid
          const baseX = bounds.min.x + stepX * (ix + 0.5);
          const baseY = bounds.min.y + stepY * (iy + 0.5);
          const baseZ = bounds.min.z + stepZ * (iz + 0.5);

          // Apply jitter
          const jx = (rng.next() - 0.5) * 2 * jitter * stepX;
          const jy = (rng.next() - 0.5) * 2 * jitter * stepY;
          const jz = (rng.next() - 0.5) * 2 * jitter * stepZ;

          const pt = new THREE.Vector3(baseX + jx, baseY + jy, baseZ + jz);
          // Clamp to bounds
          pt.clamp(bounds.min, bounds.max);
          points.push(pt);
        }
      }
    }

    // If we still need more points (grid was too small), add random ones
    while (points.length < count) {
      const x = bounds.min.x + rng.next() * size.x;
      const y = bounds.min.y + rng.next() * size.y;
      const z = bounds.min.z + rng.next() * size.z;
      points.push(new THREE.Vector3(x, y, z));
    }

    return points.slice(0, count);
  }

  // ------------------------------------------------------------------
  // Triangle-to-Cell Assignment
  // ------------------------------------------------------------------

  /**
   * Assign each triangle to its nearest Voronoi seed point based on centroid distance.
   *
   * @param positions   Flat vertex position array (xyz triples).
   * @param indices     Index array (triangle triples).
   * @param seedPoints  Voronoi seed points.
   * @returns           Map from cell index to array of triangle index triples.
   */
  assignTrianglesToCells(
    positions: Float32Array | ArrayLike<number>,
    indices: Uint16Array | Uint32Array | ArrayLike<number>,
    seedPoints: THREE.Vector3[],
  ): Map<number, TriangleIndices[]> {
    const cellMap = new Map<number, TriangleIndices[]>();
    for (let i = 0; i < seedPoints.length; i++) {
      cellMap.set(i, []);
    }

    const triangleCount = indices.length / 3;
    const centroid = new THREE.Vector3();
    const v0 = new THREE.Vector3();
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();

    for (let t = 0; t < triangleCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];

      // Read vertex positions
      v0.set(
        positions[i0 * 3],
        positions[i0 * 3 + 1],
        positions[i0 * 3 + 2],
      );
      v1.set(
        positions[i1 * 3],
        positions[i1 * 3 + 1],
        positions[i1 * 3 + 2],
      );
      v2.set(
        positions[i2 * 3],
        positions[i2 * 3 + 1],
        positions[i2 * 3 + 2],
      );

      // Compute centroid
      centroid.addVectors(v0, v1).add(v2).divideScalar(3);

      // Find nearest seed point
      let nearestCell = 0;
      let nearestDist = Infinity;
      for (let s = 0; s < seedPoints.length; s++) {
        const dist = centroid.distanceToSquared(seedPoints[s]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestCell = s;
        }
      }

      cellMap.get(nearestCell)!.push({ i0, i1, i2 });
    }

    return cellMap;
  }

  // ------------------------------------------------------------------
  // Cell Geometry Extraction
  // ------------------------------------------------------------------

  /**
   * Extract geometry for a single Voronoi cell.
   * Remaps vertex indices so the new geometry is self-contained.
   *
   * @param positions      Source position array.
   * @param normals        Source normal array (or null).
   * @param uvs            Source UV array (or null).
   * @param _indices       Source index array (unused — triangles carry their own indices).
   * @param cellTriangles  Array of triangle descriptors belonging to this cell.
   * @returns              A new BufferGeometry for this cell.
   */
  extractCellGeometry(
    positions: Float32Array | ArrayLike<number>,
    normals: Float32Array | ArrayLike<number> | null,
    uvs: Float32Array | ArrayLike<number> | null,
    _indices: Uint16Array | Uint32Array | ArrayLike<number>,
    cellTriangles: TriangleIndices[],
  ): THREE.BufferGeometry {
    const remap: IndexRemap = new Map();
    const newPos: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndices: number[] = [];
    let nextIndex = 0;

    for (const tri of cellTriangles) {
      const verts = [tri.i0, tri.i1, tri.i2];

      for (const oldIdx of verts) {
        if (!remap.has(oldIdx)) {
          remap.set(oldIdx, nextIndex);

          // Position
          newPos.push(
            positions[oldIdx * 3],
            positions[oldIdx * 3 + 1],
            positions[oldIdx * 3 + 2],
          );

          // Normal
          if (normals) {
            newNormals.push(
              normals[oldIdx * 3],
              normals[oldIdx * 3 + 1],
              normals[oldIdx * 3 + 2],
            );
          }

          // UV
          if (uvs) {
            newUvs.push(
              uvs[oldIdx * 2],
              uvs[oldIdx * 2 + 1],
            );
          }

          nextIndex++;
        }
      }

      // Emit triangle with remapped indices
      newIndices.push(
        remap.get(tri.i0)!,
        remap.get(tri.i1)!,
        remap.get(tri.i2)!,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));

    if (newNormals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }

    if (newUvs.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }

    geometry.setIndex(newIndices);

    return geometry;
  }

  // ------------------------------------------------------------------
  // Explosion
  // ------------------------------------------------------------------

  /**
   * Offset fracture pieces outward from a center point based on explosion force.
   *
   * @param meshes  Array of fracture piece meshes (modified in place).
   * @param center  Center of the explosion.
   * @param force   Explosion force magnitude.
   */
  applyExplosion(meshes: THREE.Mesh[], center: THREE.Vector3, force: number, seed: number = 42): void {
    const pieceCenter = new THREE.Vector3();
    const rng = new SeededRandom(seed);

    for (const piece of meshes) {
      // Compute piece center from its bounding box
      piece.geometry.computeBoundingBox();
      const bbox = piece.geometry.boundingBox!;
      bbox.getCenter(pieceCenter);

      // Direction from explosion center to piece center
      const direction = new THREE.Vector3().subVectors(pieceCenter, center);

      const dist = direction.length();
      if (dist < 0.0001) {
        // Piece is at the center; pick a random direction
        direction.set(rng.nextFloat() - 0.5, rng.nextFloat() - 0.5, rng.nextFloat() - 0.5).normalize();
      } else {
        direction.normalize();
      }

      // Apply offset — inversely proportional to distance for more realistic explosion
      const magnitude = force / (1 + dist * 0.5);
      piece.position.add(direction.multiplyScalar(magnitude));

      // Add slight random rotation for visual interest
      piece.rotation.x += (rng.nextFloat() - 0.5) * force * 0.1;
      piece.rotation.y += (rng.nextFloat() - 0.5) * force * 0.1;
      piece.rotation.z += (rng.nextFloat() - 0.5) * force * 0.1;
    }
  }

  // ------------------------------------------------------------------
  // Internal Faces
  // ------------------------------------------------------------------

  /**
   * Add internal (cap) faces to a cell geometry where the Voronoi boundary plane
   * intersects. This creates a simple "cap" using a fan of triangles from the
   * cell's seed point to the boundary vertices.
   *
   * The approach:
   * - Identify boundary edges (edges shared with triangles from other cells).
   * - Since we already split the mesh into separate cells, boundary vertices are
   *   those that lie on the cut plane. We approximate by creating a fan from the
   *   seed point to boundary-adjacent vertices.
   * - For simplicity, we project the seed point onto the cell's geometry and create
   *   a cap by triangulating the boundary edge loop.
   *
   * @param geometry   The cell geometry to add internal faces to (modified in place).
   * @param seedPoint  The Voronoi seed point for this cell (used as fan center).
   * @param center     Center of the original mesh (for computing internal normal).
   * @param _bbox      Bounding box of the original mesh (for clamping).
   */
  private addInternalFaces(
    geometry: THREE.BufferGeometry,
    seedPoint: THREE.Vector3,
    center: THREE.Vector3,
    _bbox: THREE.Box3,
  ): void {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const idxAttr = geometry.getIndex();
    if (!idxAttr) return;

    const positions = posAttr.array as Float32Array;
    const indices = idxAttr.array as Uint16Array | Uint32Array;
    const vertexCount = posAttr.count;
    const triangleCount = indices.length / 3;

    if (triangleCount === 0 || vertexCount === 0) return;

    // Build edge-face adjacency to find boundary edges
    const edgeFaceCount = new Map<string, number>();

    for (let t = 0; t < triangleCount; t++) {
      const a = indices[t * 3];
      const b = indices[t * 3 + 1];
      const c = indices[t * 3 + 2];

      // Create canonical edge keys (min-max)
      const edges = [
        [Math.min(a, b), Math.max(a, b)],
        [Math.min(b, c), Math.max(b, c)],
        [Math.min(c, a), Math.max(c, a)],
      ];

      for (const [e0, e1] of edges) {
        const key = `${e0}-${e1}`;
        edgeFaceCount.set(key, (edgeFaceCount.get(key) || 0) + 1);
      }
    }

    // Boundary edges are those referenced by only one face
    const boundaryEdges: [number, number][] = [];
    for (const [key, count] of edgeFaceCount) {
      if (count === 1) {
        const parts = key.split('-');
        boundaryEdges.push([parseInt(parts[0], 10), parseInt(parts[1], 10)]);
      }
    }

    if (boundaryEdges.length === 0) return;

    // Collect unique boundary vertex indices
    const boundaryVertexSet = new Set<number>();
    for (const [a, b] of boundaryEdges) {
      boundaryVertexSet.add(a);
      boundaryVertexSet.add(b);
    }
    const boundaryVertices = Array.from(boundaryVertexSet);

    if (boundaryVertices.length < 3) return;

    // Use the seed point as the fan center for internal faces
    // Project seed point into local geometry space
    // Compute average boundary vertex position to use as an approximation of the cut plane center
    const avgBoundary = new THREE.Vector3();
    for (const vi of boundaryVertices) {
      avgBoundary.x += positions[vi * 3];
      avgBoundary.y += positions[vi * 3 + 1];
      avgBoundary.z += positions[vi * 3 + 2];
    }
    avgBoundary.divideScalar(boundaryVertices.length);

    // Internal face center: midpoint between seed point and average boundary
    const internalCenter = new THREE.Vector3()
      .addVectors(seedPoint, avgBoundary)
      .multiplyScalar(0.5);

    // Add the internal center as a new vertex
    const newPositions: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      newPositions.push(positions[i]);
    }
    newPositions.push(internalCenter.x, internalCenter.y, internalCenter.z);
    const centerIndex = vertexCount;

    // Add normals for the new vertex — normal pointing inward (toward center)
    const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
    const newNormalData: number[] = [];
    if (normalAttr) {
      const normalArray = normalAttr.array as Float32Array;
      for (let i = 0; i < normalArray.length; i++) {
        newNormalData.push(normalArray[i]);
      }
      // Internal normal: point from internalCenter toward the mesh center
      const internalNormal = new THREE.Vector3().subVectors(center, internalCenter).normalize();
      newNormalData.push(internalNormal.x, internalNormal.y, internalNormal.z);
    }

    // Add UV for the new vertex
    const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | null;
    const newUvData: number[] = [];
    if (uvAttr) {
      const uvArray = uvAttr.array as Float32Array;
      for (let i = 0; i < uvArray.length; i++) {
        newUvData.push(uvArray[i]);
      }
      // Place the center UV at the average of boundary UVs
      let uAvg = 0, vAvg = 0;
      let count = 0;
      for (const vi of boundaryVertices) {
        uAvg += uvArray[vi * 2];
        vAvg += uvArray[vi * 2 + 1];
        count++;
      }
      newUvData.push(uAvg / count, vAvg / count);
    }

    // Sort boundary vertices by angle around the internal center for proper fan triangulation
    const sortedBoundary = this.sortVerticesByAngle(
      boundaryVertices,
      positions,
      internalCenter,
      center,
    );

    // Create fan triangles: center -> sortedBoundary[i] -> sortedBoundary[i+1]
    const newIndices: number[] = [];
    for (let i = 0; i < indices.length; i++) {
      newIndices.push(indices[i]);
    }

    for (let i = 0; i < sortedBoundary.length; i++) {
      const a = sortedBoundary[i];
      const b = sortedBoundary[(i + 1) % sortedBoundary.length];
      newIndices.push(centerIndex, a, b);
    }

    // Update geometry
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormalData.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormalData, 3));
    }
    if (newUvData.length > 0) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvData, 2));
    }
    geometry.setIndex(newIndices);
  }

  // ------------------------------------------------------------------
  // Private Helpers
  // ------------------------------------------------------------------

  /**
   * Ensure the geometry has an index buffer.
   * If the geometry is non-indexed, create an index buffer by generating
   * sequential indices for every 3 vertices.
   */
  private ensureIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (geometry.index !== null) {
      return geometry;
    }

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = posAttr.count;
    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      indices.push(i);
    }

    // Clone and add index
    const cloned = geometry.clone();
    cloned.setIndex(indices);
    return cloned;
  }

  /**
   * Compute grid dimensions for roughly uniform seed point distribution.
   * Attempts to create a cube-like grid that contains at least `count` cells.
   */
  private computeGridDimensions(count: number): THREE.Vector3 {
    const cubeRoot = Math.cbrt(count);
    const x = Math.max(1, Math.ceil(cubeRoot));
    const y = Math.max(1, Math.ceil(cubeRoot));
    const z = Math.max(1, Math.ceil(count / (x * y)));
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Create a material for a fracture cell piece.
   * Clones the original mesh's material (if MeshStandardMaterial)
   * with a slight color/roughness variation for visual distinction.
   */
  private createCellMaterial(
    originalMesh: THREE.Mesh,
    cellIndex: number,
  ): THREE.MeshStandardMaterial {
    const originalMaterial = originalMesh.material;

    if (
      Array.isArray(originalMaterial)
        ? originalMaterial[0] instanceof THREE.MeshStandardMaterial
        : originalMaterial instanceof THREE.MeshStandardMaterial
    ) {
      const srcMat = Array.isArray(originalMaterial)
        ? (originalMaterial[0] as THREE.MeshStandardMaterial)
        : (originalMaterial as THREE.MeshStandardMaterial);

      const cloned = srcMat.clone();

      // Slight color variation using cell index as hue offset
      const color = new THREE.Color(cloned.color);
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      // Offset hue slightly per cell (wrapping around)
      hsl.h = (hsl.h + cellIndex * 0.02) % 1.0;
      // Slight lightness variation
      hsl.l = Math.max(0, Math.min(1, hsl.l + (cellIndex % 3 - 1) * 0.02));
      color.setHSL(hsl.h, hsl.s, hsl.l);
      cloned.color = color;

      // Increase roughness slightly for internal/edge faces
      cloned.roughness = Math.min(1, cloned.roughness + 0.05);

      return cloned;
    }

    // Fallback: create a fresh MeshStandardMaterial
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL((cellIndex * 0.1) % 1, 0.5, 0.5),
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Sort boundary vertices by their angle around a center point,
   * projected onto a plane perpendicular to the given normal.
   * This enables proper fan triangulation of the cap face.
   */
  private sortVerticesByAngle(
    vertexIndices: number[],
    positions: Float32Array | ArrayLike<number>,
    center: THREE.Vector3,
    normal: THREE.Vector3,
  ): number[] {
    if (vertexIndices.length <= 3) return vertexIndices;

    // Build a local coordinate frame on the plane defined by `normal`
    const n = normal.clone().normalize();
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(n.dot(up)) > 0.99) {
      up = new THREE.Vector3(1, 0, 0);
    }
    const u = new THREE.Vector3().crossVectors(n, up).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();

    // Compute angle for each vertex
    const angled = vertexIndices.map((vi) => {
      const px = positions[vi * 3] - center.x;
      const py = positions[vi * 3 + 1] - center.y;
      const pz = positions[vi * 3 + 2] - center.z;
      const dx = px * u.x + py * u.y + pz * u.z;
      const dy = px * v.x + py * v.y + pz * v.z;
      return { index: vi, angle: Math.atan2(dy, dx) };
    });

    angled.sort((a, b) => a.angle - b.angle);
    return angled.map((item) => item.index);
  }
}

export default FractureSystem;
