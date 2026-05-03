/**
 * AdaptiveMesher — Camera-Adaptive Terrain Meshing Pipeline
 *
 * Implements camera-adaptive terrain meshing using marching cubes on SDF
 * grids with variable resolution per chunk. Uses three-mesh-bvh for LOD
 * transitions and ray intersection. Implements chunk stitching to avoid
 * seams between resolution levels.
 *
 * Phase 2 — P2.6: Adaptive Meshing Pipeline
 *
 * @module terrain/mesher
 */

import * as THREE from 'three';
import { SignedDistanceField, extractIsosurface } from '../sdf/sdf-operations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdaptiveMesherConfig {
  /** High resolution near camera (meters per voxel) */
  highResolution: number;
  /** Low resolution in distance (meters per voxel) */
  lowResolution: number;
  /** Distance from camera where high resolution applies */
  highResDistance: number;
  /** Distance from camera where low resolution starts */
  lowResDistance: number;
  /** Chunk size in world units */
  chunkSize: number;
  /** Maximum number of visible chunks */
  maxChunks: number;
}

export const DEFAULT_ADAPTIVE_MESHER_CONFIG: AdaptiveMesherConfig = {
  highResolution: 1.0,
  lowResolution: 16.0,
  highResDistance: 50,
  lowResDistance: 200,
  chunkSize: 64,
  maxChunks: 64,
};

export interface TerrainChunk {
  /** Chunk coordinates (grid index) */
  coord: { x: number; z: number };
  /** The mesh for this chunk */
  mesh: THREE.Mesh | null;
  /** The SDF for this chunk */
  sdf: SignedDistanceField | null;
  /** Resolution of this chunk */
  resolution: number;
  /** Whether this chunk needs re-meshing */
  dirty: boolean;
  /** Distance from camera (updated per frame) */
  cameraDistance: number;
  /** Bounding box of this chunk */
  bounds: THREE.Box3;
}

// ---------------------------------------------------------------------------
// Adaptive Mesher
// ---------------------------------------------------------------------------

/**
 * Manages adaptive terrain meshing based on camera distance.
 * Chunks close to the camera use high-resolution SDF evaluation,
 * while distant chunks use lower resolution.
 */
export class AdaptiveMesher {
  private config: AdaptiveMesherConfig;
  private chunks: Map<string, TerrainChunk> = new Map();
  private group: THREE.Group;
  private sdfEvaluator: ((point: THREE.Vector3) => number) | null = null;
  private material: THREE.Material;

  constructor(config: Partial<AdaptiveMesherConfig> = {}, material?: THREE.Material) {
    this.config = { ...DEFAULT_ADAPTIVE_MESHER_CONFIG, ...config };
    this.group = new THREE.Group();
    this.group.name = 'adaptive-terrain';
    this.material = material ?? new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Set the SDF evaluator function for terrain generation.
   */
  setSDFEvaluator(evaluator: (point: THREE.Vector3) => number): void {
    this.sdfEvaluator = evaluator;
    // Mark all chunks as dirty
    for (const chunk of this.chunks.values()) {
      chunk.dirty = true;
    }
  }

  /**
   * Update the terrain mesh based on current camera position.
   * Adds/removes/re-meshes chunks as needed.
   */
  update(camera: THREE.Camera): void {
    if (!this.sdfEvaluator) return;

    const cameraPos = camera.position;

    // Determine which chunks should be visible
    const visibleCoords = this.getVisibleChunkCoords(cameraPos);

    // Remove chunks that are too far away
    for (const [key, chunk] of this.chunks.entries()) {
      const coord = chunk.coord;
      const worldX = coord.x * this.config.chunkSize;
      const worldZ = coord.z * this.config.chunkSize;
      const chunkCenter = new THREE.Vector3(
        worldX + this.config.chunkSize / 2,
        0,
        worldZ + this.config.chunkSize / 2,
      );
      const dist = chunkCenter.distanceTo(cameraPos);

      if (dist > this.config.lowResDistance * 1.5) {
        this.removeChunk(key);
      } else {
        chunk.cameraDistance = dist;
      }
    }

    // Add missing chunks
    for (const coord of visibleCoords) {
      const key = this.getChunkKey(coord.x, coord.z);
      if (!this.chunks.has(key)) {
        this.addChunk(coord.x, coord.z);
      }
    }

    // Re-mesh dirty chunks (limit per frame for performance)
    let meshedThisFrame = 0;
    const maxMeshPerFrame = 2;

    for (const chunk of this.chunks.values()) {
      if (chunk.dirty && meshedThisFrame < maxMeshPerFrame) {
        this.remeshChunk(chunk);
        meshedThisFrame++;
      }
    }
  }

  /**
   * Get the terrain group to add to the scene.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Calculate the appropriate resolution for a chunk based on camera distance.
   */
  getResolutionForDistance(distance: number): number {
    const { highResolution, lowResolution, highResDistance, lowResDistance } = this.config;

    if (distance <= highResDistance) {
      return highResolution;
    }

    if (distance >= lowResDistance) {
      return lowResolution;
    }

    // Linear interpolation between high and low resolution
    const t = (distance - highResDistance) / (lowResDistance - highResDistance);
    return THREE.MathUtils.lerp(highResolution, lowResolution, t);
  }

  /**
   * Get visible chunk coordinates based on camera position.
   */
  private getVisibleChunkCoords(cameraPos: THREE.Vector3): Array<{ x: number; z: number }> {
    const coords: Array<{ x: number; z: number }> = [];
    const cameraChunkX = Math.floor(cameraPos.x / this.config.chunkSize);
    const cameraChunkZ = Math.floor(cameraPos.z / this.config.chunkSize);

    // Determine view radius based on low res distance
    const viewRadius = Math.ceil(this.config.lowResDistance / this.config.chunkSize);

    for (let dx = -viewRadius; dx <= viewRadius; dx++) {
      for (let dz = -viewRadius; dz <= viewRadius; dz++) {
        const cx = cameraChunkX + dx;
        const cz = cameraChunkZ + dz;

        // Check if this chunk is within the visible distance
        const chunkCenter = new THREE.Vector3(
          cx * this.config.chunkSize + this.config.chunkSize / 2,
          0,
          cz * this.config.chunkSize + this.config.chunkSize / 2,
        );
        const dist = chunkCenter.distanceTo(new THREE.Vector3(cameraPos.x, 0, cameraPos.z));

        if (dist <= this.config.lowResDistance) {
          coords.push({ x: cx, z: cz });
        }
      }
    }

    // Limit total chunks
    if (coords.length > this.config.maxChunks) {
      // Sort by distance and keep the closest
      coords.sort((a, b) => {
        const da = new THREE.Vector2(a.x - cameraChunkX, a.z - cameraChunkZ).length();
        const db = new THREE.Vector2(b.x - cameraChunkX, b.z - cameraChunkZ).length();
        return da - db;
      });
      coords.length = this.config.maxChunks;
    }

    return coords;
  }

  /**
   * Add a new terrain chunk.
   */
  private addChunk(cx: number, cz: number): void {
    const key = this.getChunkKey(cx, cz);
    const worldX = cx * this.config.chunkSize;
    const worldZ = cz * this.config.chunkSize;

    const bounds = new THREE.Box3(
      new THREE.Vector3(worldX, -20, worldZ),
      new THREE.Vector3(worldX + this.config.chunkSize, 40, worldZ + this.config.chunkSize),
    );

    const chunk: TerrainChunk = {
      coord: { x: cx, z: cz },
      mesh: null,
      sdf: null,
      resolution: this.config.highResolution,
      dirty: true,
      cameraDistance: 0,
      bounds,
    };

    this.chunks.set(key, chunk);
  }

  /**
   * Remove a terrain chunk.
   */
  private removeChunk(key: string): void {
    const chunk = this.chunks.get(key);
    if (!chunk) return;

    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }

    this.chunks.delete(key);
  }

  /**
   * Re-mesh a terrain chunk at the appropriate resolution.
   */
  private remeshChunk(chunk: TerrainChunk): void {
    if (!this.sdfEvaluator) return;

    const targetResolution = this.getResolutionForDistance(chunk.cameraDistance);

    // Only re-mesh if resolution changed or chunk is dirty
    if (!chunk.dirty && Math.abs(chunk.resolution - targetResolution) < 0.01) {
      return;
    }

    // Create SDF for this chunk at the target resolution
    const sdf = new SignedDistanceField({
      resolution: targetResolution,
      bounds: chunk.bounds,
      maxDistance: 1000,
    });

    // Evaluate SDF at each voxel
    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const pos = sdf.getPosition(gx, gy, gz);
          const distance = this.sdfEvaluator(pos);
          sdf.setValueAtGrid(gx, gy, gz, distance);
        }
      }
    }

    // Extract isosurface via marching cubes
    const geometry = extractIsosurface(sdf, 0);

    // Remove old mesh
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }

    // Create new mesh
    if (geometry.attributes.position.count > 0) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `terrain-chunk-${chunk.coord.x}-${chunk.coord.z}`;
      this.group.add(mesh);
      chunk.mesh = mesh;
    }

    chunk.sdf = sdf;
    chunk.resolution = targetResolution;
    chunk.dirty = false;
  }

  /**
   * Get a chunk key from grid coordinates.
   */
  private getChunkKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /**
   * Force all chunks to be re-meshed.
   */
  invalidateAll(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dirty = true;
    }
  }

  /**
   * Get the number of active chunks.
   */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get statistics about the current terrain.
   */
  getStats(): {
    chunkCount: number;
    dirtyChunks: number;
    minResolution: number;
    maxResolution: number;
  } {
    let dirtyCount = 0;
    let minRes = Infinity;
    let maxRes = 0;

    for (const chunk of this.chunks.values()) {
      if (chunk.dirty) dirtyCount++;
      minRes = Math.min(minRes, chunk.resolution);
      maxRes = Math.max(maxRes, chunk.resolution);
    }

    return {
      chunkCount: this.chunks.size,
      dirtyChunks: dirtyCount,
      minResolution: minRes === Infinity ? 0 : minRes,
      maxResolution: maxRes,
    };
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const [key, chunk] of this.chunks.entries()) {
      if (chunk.mesh) {
        chunk.mesh.geometry.dispose();
      }
    }
    this.chunks.clear();
    this.group.clear();
  }
}

// ---------------------------------------------------------------------------
// Chunk Stitching
// ---------------------------------------------------------------------------

/**
 * Stitch terrain chunks at boundaries to avoid seams.
 * This modifies the vertices at chunk edges to ensure continuity
 * between adjacent chunks at different resolutions.
 */
export function stitchChunkBoundaries(
  chunks: TerrainChunk[],
  stitchWidth: number = 2,
): void {
  // For each pair of adjacent chunks, align the boundary vertices
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const chunkA = chunks[i];
      const chunkB = chunks[j];

      if (!chunkA.mesh || !chunkB.mesh) continue;

      // Check if chunks are adjacent
      const dx = Math.abs(chunkA.coord.x - chunkB.coord.x);
      const dz = Math.abs(chunkA.coord.z - chunkB.coord.z);

      if (dx <= 1 && dz <= 1 && (dx + dz === 1)) {
        stitchAdjacentChunks(chunkA, chunkB, stitchWidth);
      }
    }
  }
}

/**
 * Stitch two adjacent chunks together.
 * Aligns boundary vertices of the higher-resolution chunk
 * to match the lower-resolution chunk's edge.
 */
function stitchAdjacentChunks(
  chunkA: TerrainChunk,
  chunkB: TerrainChunk,
  stitchWidth: number,
): void {
  // Determine which chunk has higher resolution
  const [highRes, lowRes] = chunkA.resolution < chunkB.resolution
    ? [chunkA, chunkB]
    : [chunkB, chunkA];

  if (!highRes.mesh || !lowRes.mesh) return;

  // Get boundary positions
  const highGeom = highRes.mesh.geometry;
  const lowGeom = lowRes.mesh.geometry;

  const highPositions = highGeom.attributes.position;
  const lowPositions = lowGeom.attributes.position;

  // For each vertex in the high-res mesh near the boundary,
  // find the closest vertex in the low-res mesh and average heights
  const highBounds = highRes.bounds;
  const lowBounds = lowRes.bounds;

  // Find the shared boundary edge
  const sharedMin = new THREE.Vector3(
    Math.max(highBounds.min.x, lowBounds.min.x),
    Math.max(highBounds.min.y, lowBounds.min.y),
    Math.max(highBounds.min.z, lowBounds.min.z),
  );
  const sharedMax = new THREE.Vector3(
    Math.min(highBounds.max.x, lowBounds.max.x),
    Math.min(highBounds.max.y, lowBounds.max.y),
    Math.min(highBounds.max.z, lowBounds.max.z),
  );

  // Adjust high-res vertices near the boundary
  for (let i = 0; i < highPositions.count; i++) {
    const x = highPositions.getX(i);
    const y = highPositions.getY(i);
    const z = highPositions.getZ(i);

    // Check if near the boundary
    const nearXBoundary = Math.abs(x - sharedMin.x) < stitchWidth || Math.abs(x - sharedMax.x) < stitchWidth;
    const nearZBoundary = Math.abs(z - sharedMin.z) < stitchWidth || Math.abs(z - sharedMax.z) < stitchWidth;

    if (nearXBoundary || nearZBoundary) {
      // Find closest vertex in low-res mesh
      let closestDist = Infinity;
      let closestY = y;

      for (let j = 0; j < lowPositions.count; j++) {
        const lx = lowPositions.getX(j);
        const lz = lowPositions.getZ(j);
        const dist = Math.sqrt((x - lx) ** 2 + (z - lz) ** 2);

        if (dist < closestDist) {
          closestDist = dist;
          closestY = lowPositions.getY(j);
        }
      }

      // Blend heights
      if (closestDist < stitchWidth) {
        const blend = closestDist / stitchWidth;
        highPositions.setY(i, THREE.MathUtils.lerp(closestY, y, blend));
      }
    }
  }

  highPositions.needsUpdate = true;
  highGeom.computeVertexNormals();
}
