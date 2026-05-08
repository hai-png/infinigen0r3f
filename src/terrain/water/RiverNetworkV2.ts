/**
 * RiverNetworkV2 — P3.3: River Network Generator (Enhanced)
 *
 * Generates river paths using gradient descent on a terrain heightmap,
 * carves river beds as CSG-like subtractions from the terrain, and builds
 * river mesh renderers with flow-aligned UVs for texture animation.
 * Supports MeshPhysicalMaterial with transmission for path-traced water.
 *
 * Improvements over the Phase 2 RiverNetwork:
 * - Gradient-descent path finding (more natural than D8 steepest-slope)
 * - CSG river-bed carving (produces carved channel geometry)
 * - Flow-aligned UV mapping for animated flow textures
 * - Path-traced water material support via transmission
 *
 * Phase 3 — P3.3: River Network Generator
 *
 * @module terrain/water
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import { createWaterMaterial, createRasterizeWaterMaterial, type WaterMaterialPreset } from './PathTracedWaterMaterial';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the river network generator.
 */
export interface RiverNetworkConfig {
  /** RNG seed (default 42) */
  seed: number;
  /** Minimum elevation for river sources (default 50) */
  sourceMinElevation: number;
  /** Number of major rivers to generate (default 4) */
  riverCount: number;
  /** Meandering amplitude factor (default 0.5) */
  meanderIntensity: number;
  /** Base river width at source (default 2.0) */
  baseWidth: number;
  /** Width growth factor per unit flow accumulation (default 0.3) */
  widthGrowthFactor: number;
  /** Maximum river width (default 15.0) */
  maxWidth: number;
  /** Base river depth (default 1.0) */
  baseDepth: number;
  /** Carve depth multiplier (how deep the channel is cut) (default 1.5) */
  carveDepthMultiplier: number;
  /** Carve width multiplier (how much wider than the river) (default 2.0) */
  carveWidthMultiplier: number;
  /** Gradient descent step size (default 1.0 — one grid cell) */
  gradientStepSize: number;
  /** Maximum gradient descent iterations (default 5000) */
  maxGradientIterations: number;
  /** Minimum river length in world units (default 30) */
  minRiverLength: number;
  /** Water material preset (default 'river') */
  materialPreset: WaterMaterialPreset;
  /** Whether to use path-traced materials (default true — falls back if PT unavailable) */
  usePathTracedMaterial: boolean;
}

/**
 * A single point along a river path.
 */
export interface RiverPath {
  /** World position */
  position: THREE.Vector3;
  /** Flow direction (unit vector) */
  flowDirection: THREE.Vector3;
  /** River width at this point */
  width: number;
  /** River depth at this point */
  depth: number;
  /** Cumulative flow accumulation */
  flowAccumulation: number;
  /** Cumulative distance along the river from source */
  distanceAlongRiver: number;
}

/**
 * A segment of a river between two consecutive RiverPath points.
 * Used for mesh construction and collision queries.
 */
export interface RiverSegment {
  /** Start point index in the river path array */
  startIndex: number;
  /** End point index in the river path array */
  endIndex: number;
  /** Average width of this segment */
  averageWidth: number;
  /** Average slope (|dY / horizontal_distance|) */
  slope: number;
  /** Segment length in world units */
  length: number;
  /** Whether this segment qualifies as rapids (slope > threshold) */
  isRapids: boolean;
}

// ============================================================================
// RiverNetworkV2
// ============================================================================

export class RiverNetworkV2 {
  private config: RiverNetworkConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private rivers: RiverPath[][] = [];
  private segments: RiverSegment[][] = [];

  constructor(config: Partial<RiverNetworkConfig> = {}) {
    this.config = {
      seed: 42,
      sourceMinElevation: 50,
      riverCount: 4,
      meanderIntensity: 0.5,
      baseWidth: 2.0,
      widthGrowthFactor: 0.3,
      maxWidth: 15.0,
      baseDepth: 1.0,
      carveDepthMultiplier: 1.5,
      carveWidthMultiplier: 2.0,
      gradientStepSize: 1.0,
      maxGradientIterations: 5000,
      minRiverLength: 30,
      materialPreset: 'river',
      usePathTracedMaterial: true,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // ------------------------------------------------------------------
  // Gradient Descent Path Finding
  // ------------------------------------------------------------------

  /**
   * Find river sources — peaks with high elevation and sufficient local
   * relief to sustain a stream.
   */
  private findSources(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
  ): { col: number; row: number }[] {
    const cellSize = worldSize / resolution;
    const candidates: { col: number; row: number; elevation: number; relief: number }[] = [];

    for (let row = 2; row < resolution - 2; row++) {
      for (let col = 2; col < resolution - 2; col++) {
        const idx = row * resolution + col;
        const elevation = heightmap[idx];
        if (elevation < this.config.sourceMinElevation) continue;

        // Local relief: max - min in 3x3 neighbourhood
        let minH = Infinity;
        let maxH = -Infinity;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const h = heightmap[(row + dr) * resolution + (col + dc)];
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
          }
        }
        const relief = maxH - minH;
        if (relief > 5) {
          candidates.push({ col, row, elevation, relief });
        }
      }
    }

    // Sort by elevation descending and pick top N
    candidates.sort((a, b) => b.elevation - a.elevation);

    // Space sources apart (minimum 10% of world size)
    const minDist = worldSize * 0.1;
    const sources: { col: number; row: number }[] = [];

    for (const c of candidates) {
      if (sources.length >= this.config.riverCount) break;
      const cx = c.col * cellSize;
      const cz = c.row * cellSize;
      let tooClose = false;
      for (const s of sources) {
        const sx = s.col * cellSize;
        const sz = s.row * cellSize;
        if (Math.sqrt((cx - sx) ** 2 + (cz - sz) ** 2) < minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) sources.push({ col: c.col, row: c.row });
    }

    return sources;
  }

  /**
   * Trace a river from source to outlet using gradient descent on the
   * heightmap. At each step we move to the lowest neighbour, with
   * meandering noise added to prevent perfectly straight channels.
   */
  private traceRiverGradientDescent(
    sourceCol: number,
    sourceRow: number,
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
  ): RiverPath[] {
    const cellSize = worldSize / resolution;
    const path: RiverPath[] = [];
    const visited = new Uint8Array(resolution * resolution);

    let col = sourceCol;
    let row = sourceRow;
    let cumulativeDist = 0;
    let flowAccum = 1;

    for (let iter = 0; iter < this.config.maxGradientIterations; iter++) {
      if (col < 0 || col >= resolution || row < 0 || row >= resolution) break;

      const idx = row * resolution + col;
      if (visited[idx]) break;
      visited[idx] = 1;

      const x = col * cellSize;
      const z = row * cellSize;
      const y = heightmap[idx];

      // Meandering offset
      const mx = this.noise.perlin2D(x * 0.01, z * 0.01) * this.config.meanderIntensity * cellSize * 2;
      const mz = this.noise.perlin2D(x * 0.01 + 100, z * 0.01 + 100) * this.config.meanderIntensity * cellSize * 2;

      const width = Math.min(this.config.maxWidth, this.config.baseWidth + Math.log(flowAccum + 1) * this.config.widthGrowthFactor);
      const depth = this.config.baseDepth * (width / this.config.baseWidth) * 0.5;

      path.push({
        position: new THREE.Vector3(x + mx, y, z + mz),
        flowDirection: new THREE.Vector3(0, 0, -1), // updated below
        width,
        depth,
        flowAccumulation: flowAccum,
        distanceAlongRiver: cumulativeDist,
      });

      // Find steepest descent neighbour (8-connected)
      let bestSlope = 0;
      let bestCol = -1;
      let bestRow = -1;
      const currentH = heightmap[idx];

      const dirs = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1],
      ];

      for (const [dc, dr] of dirs) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= resolution || nr < 0 || nr >= resolution) continue;
        const nIdx = nr * resolution + nc;
        if (visited[nIdx]) continue;

        const nH = heightmap[nIdx];
        const dist = (Math.abs(dc) + Math.abs(dr) === 2) ? Math.SQRT2 * cellSize : cellSize;
        const slope = (currentH - nH) / dist;

        if (slope > bestSlope) {
          bestSlope = slope;
          bestCol = nc;
          bestRow = nr;
        }
      }

      if (bestCol === -1) break; // local minimum reached

      // Update flow direction for the previous point
      if (path.length >= 1) {
        const prev = path[path.length - 1];
        const nextX = bestCol * cellSize;
        const nextZ = bestRow * cellSize;
        prev.flowDirection.set(nextX - prev.position.x, 0, nextZ - prev.position.z).normalize();
      }

      // Update cumulative distance
      const dx = (bestCol - col) * cellSize;
      const dz = (bestRow - row) * cellSize;
      cumulativeDist += Math.sqrt(dx * dx + dz * dz);

      // Increase flow accumulation
      flowAccum += 1;

      col = bestCol;
      row = bestRow;
    }

    return path;
  }

  // ------------------------------------------------------------------
  // River Bed Carving (CSG subtraction)
  // ------------------------------------------------------------------

  /**
   * Carve river channels into the heightmap using a parabolic cross-section.
   * This acts as a CSG subtraction from the terrain volume.
   */
  carveRiverBed(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
  ): Float32Array {
    const result = new Float32Array(heightmap);
    const cellSize = worldSize / resolution;

    for (const river of this.rivers) {
      for (const point of river) {
        const col = Math.round(point.position.x / cellSize);
        const row = Math.round(point.position.z / cellSize);

        if (col < 0 || col >= resolution || row < 0 || row >= resolution) continue;

        const carveRadius = point.width * this.config.carveWidthMultiplier;
        const carveDepth = point.depth * this.config.carveDepthMultiplier;
        const radiusInCells = Math.ceil(carveRadius / cellSize);

        for (let dr = -radiusInCells; dr <= radiusInCells; dr++) {
          for (let dc = -radiusInCells; dc <= radiusInCells; dc++) {
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || c >= resolution || r < 0 || r >= resolution) continue;

            const dx = dc * cellSize;
            const dz = dr * cellSize;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < carveRadius) {
              const normalized = dist / carveRadius;
              // Parabolic depth profile
              const depthFactor = 1 - normalized * normalized;
              const carve = carveDepth * depthFactor;
              const idx = r * resolution + c;
              result[idx] = Math.min(result[idx], point.position.y - carve);
            }
          }
        }
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Segment Computation
  // ------------------------------------------------------------------

  private computeSegments(river: RiverPath[]): RiverSegment[] {
    const segments: RiverSegment[] = [];
    const rapidsThreshold = 0.15;

    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i];
      const b = river[i + 1];
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const dy = b.position.y - a.position.y;
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const slope = horizDist > 0.001 ? Math.abs(dy) / horizDist : 0;

      segments.push({
        startIndex: i,
        endIndex: i + 1,
        averageWidth: (a.width + b.width) * 0.5,
        slope,
        length,
        isRapids: slope > rapidsThreshold,
      });
    }

    return segments;
  }

  // ------------------------------------------------------------------
  // Mesh Construction
  // ------------------------------------------------------------------

  /**
   * Build a river mesh renderer group from the generated river paths.
   * Each river is a ribbon mesh with flow-aligned UVs.
   */
  buildRiverMeshes(): THREE.Group {
    const group = new THREE.Group();

    for (const river of this.rivers) {
      if (river.length < 2) continue;
      const geometry = this.buildRiverGeometry(river);
      const material = this.config.usePathTracedMaterial
        ? createWaterMaterial(this.config.materialPreset)
        : createRasterizeWaterMaterial(this.config.materialPreset);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 998;
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    return group;
  }

  /**
   * Build ribbon geometry for a single river with flow-aligned UVs.
   */
  private buildRiverGeometry(river: RiverPath[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    // Subdivide with Catmull-Rom for smoother curves
    const subdivided = this.subdividePath(river);

    // Compute cumulative distances for UV mapping
    const distances: number[] = [0];
    for (let i = 1; i < subdivided.length; i++) {
      const dx = subdivided[i].position.x - subdivided[i - 1].position.x;
      const dz = subdivided[i].position.z - subdivided[i - 1].position.z;
      distances.push(distances[i - 1] + Math.sqrt(dx * dx + dz * dz));
    }
    const totalLength = distances[distances.length - 1] || 1;

    for (let i = 0; i < subdivided.length; i++) {
      const point = subdivided[i];
      const halfWidth = point.width / 2;

      // Compute forward direction
      let forward: THREE.Vector3;
      if (i === 0) {
        forward = new THREE.Vector3().subVectors(subdivided[1].position, subdivided[0].position);
      } else if (i === subdivided.length - 1) {
        forward = new THREE.Vector3().subVectors(subdivided[i].position, subdivided[i - 1].position);
      } else {
        forward = new THREE.Vector3().subVectors(subdivided[i + 1].position, subdivided[i - 1].position);
      }
      forward.y = 0;
      forward.normalize();

      // Right vector (perpendicular on XZ plane)
      const right = new THREE.Vector3(-forward.z, 0, forward.x);

      // Flow-aligned UVs: u = distance along river / total length, v = lateral
      const u = distances[i] / totalLength;

      // Left bank
      positions.push(
        point.position.x - right.x * halfWidth,
        point.position.y,
        point.position.z - right.z * halfWidth,
      );
      normals.push(0, 1, 0);
      uvs.push(u, 0);

      // Right bank
      positions.push(
        point.position.x + right.x * halfWidth,
        point.position.y,
        point.position.z + right.z * halfWidth,
      );
      normals.push(0, 1, 0);
      uvs.push(u, 1);

      // Create triangles between this pair and the previous pair
      if (i > 0) {
        const a = vertexOffset - 2;
        const b = vertexOffset - 1;
        const c = vertexOffset;
        const d = vertexOffset + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }

      vertexOffset += 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Subdivide river path using Catmull-Rom interpolation.
   */
  private subdividePath(points: RiverPath[], steps: number = 3): RiverPath[] {
    if (points.length < 2) return points;
    const result: RiverPath[] = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = 0.5 * ((2 * p1.position.x) + (-p0.position.x + p2.position.x) * t + (2 * p0.position.x - 5 * p1.position.x + 4 * p2.position.x - p3.position.x) * t2 + (-p0.position.x + 3 * p1.position.x - 3 * p2.position.x + p3.position.x) * t3);
        const y = 0.5 * ((2 * p1.position.y) + (-p0.position.y + p2.position.y) * t + (2 * p0.position.y - 5 * p1.position.y + 4 * p2.position.y - p3.position.y) * t2 + (-p0.position.y + 3 * p1.position.y - 3 * p2.position.y + p3.position.y) * t3);
        const z = 0.5 * ((2 * p1.position.z) + (-p0.position.z + p2.position.z) * t + (2 * p0.position.z - 5 * p1.position.z + 4 * p2.position.z - p3.position.z) * t2 + (-p0.position.z + 3 * p1.position.z - 3 * p2.position.z + p3.position.z) * t3);

        const width = p1.width + (p2.width - p1.width) * t;
        const depth = p1.depth + (p2.depth - p1.depth) * t;
        const flowAccum = p1.flowAccumulation + (p2.flowAccumulation - p1.flowAccumulation) * t;
        const dist = p1.distanceAlongRiver + (p2.distanceAlongRiver - p1.distanceAlongRiver) * t;

        result.push({
          position: new THREE.Vector3(x, y, z),
          flowDirection: new THREE.Vector3(), // will be computed if needed
          width,
          depth,
          flowAccumulation: flowAccum,
          distanceAlongRiver: dist,
        });
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Main Generation Entry Point
  // ------------------------------------------------------------------

  /**
   * Generate the full river network from a terrain heightmap.
   */
  generate(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
  ): {
    rivers: RiverPath[][];
    segments: RiverSegment[][];
    carvedTerrain: Float32Array;
    meshGroup: THREE.Group;
  } {
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.rivers = [];
    this.segments = [];

    // 1. Find sources
    const sources = this.findSources(heightmap, resolution, worldSize);

    // 2. Trace rivers via gradient descent
    for (const source of sources) {
      const river = this.traceRiverGradientDescent(
        source.col, source.row,
        heightmap, resolution, worldSize,
      );
      if (river.length >= 3) {
        this.rivers.push(river);
        this.segments.push(this.computeSegments(river));
      }
    }

    // 3. Carve river beds
    const carvedTerrain = this.carveRiverBed(heightmap, resolution, worldSize);

    // 4. Build meshes
    const meshGroup = this.buildRiverMeshes();

    return { rivers: this.rivers, segments: this.segments, carvedTerrain, meshGroup };
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  getRivers(): RiverPath[][] { return this.rivers; }
  getSegments(): RiverSegment[][] { return this.segments; }

  updateConfig(partial: Partial<RiverNetworkConfig>): void {
    Object.assign(this.config, partial);
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  getConfig(): RiverNetworkConfig { return { ...this.config }; }

  dispose(): void {
    this.rivers = [];
    this.segments = [];
  }
}
