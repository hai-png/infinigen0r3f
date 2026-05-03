/**
 * LakeGeneratorV2 — P3.4: Lake Generator (Enhanced)
 *
 * Detects depressions in the terrain heightmap using a watershed algorithm,
 * fills depressions to their water level, and generates lake surface meshes
 * with MeshPhysicalMaterial + transmission for path-traced rendering and
 * depth-based attenuationColor for realistic depth tinting.
 *
 * Improvements over the Phase 2 LakeGenerator:
 * - Depression detection via watershed / pit-filling algorithm
 * - Automatic water-level determination per depression
 * - Depth-based attenuationColor for path-traced volumetric tinting
 * - Path-traced material support with transmission
 *
 * Phase 3 — P3.4: Lake Generator
 *
 * @module terrain/water
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import { createWaterMaterial, type WaterMaterialPreset } from './PathTracedWaterMaterial';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the lake generator.
 */
export interface LakeGeneratorConfig {
  /** RNG seed (default 42) */
  seed: number;
  /** Minimum depression area (in grid cells) to qualify as a lake (default 20) */
  minDepressionArea: number;
  /** Minimum depression depth (world units) to qualify as a lake (default 2.0) */
  minDepressionDepth: number;
  /** Maximum number of lakes to generate (default 10) */
  maxLakes: number;
  /** Water level offset above the depression rim (default 0.5 — slightly overfilled) */
  waterLevelOffset: number;
  /** Shoreline noise scale (default 0.02) */
  shorelineNoiseScale: number;
  /** Shoreline noise amplitude (default 0.15) */
  shorelineNoiseAmplitude: number;
  /** Lake surface resolution (vertices per side) (default 64) */
  surfaceResolution: number;
  /** Wave amplitude for lake surface (default 0.05) */
  waveAmplitude: number;
  /** Wave frequency for lake surface (default 0.3) */
  waveFrequency: number;
  /** Deep water colour (for attenuation) */
  deepColor: THREE.Color;
  /** Shallow water colour (for attenuation) */
  shallowColor: THREE.Color;
  /** Water material preset (default 'lake') */
  materialPreset: WaterMaterialPreset;
  /** Whether to use path-traced material (default true) */
  usePathTracedMaterial: boolean;
  /** Attenuation distance for deep water tinting (default 2.0) */
  attenuationDistance: number;
}

/**
 * Information about a detected and filled lake.
 */
export interface LakeInfo {
  /** Unique identifier */
  id: number;
  /** Centre of the lake in world coordinates */
  center: THREE.Vector3;
  /** Water surface altitude (Y) */
  waterLevel: number;
  /** Approximate radius of the lake */
  radius: number;
  /** Maximum depth of the lake */
  maxDepth: number;
  /** Surface area in square world units */
  surfaceArea: number;
  /** Grid cells belonging to this lake (row * resolution + col) */
  cells: number[];
  /** Depth at each cell (parallel to cells array) */
  depths: Float32Array;
  /** The generated water mesh */
  mesh: THREE.Mesh;
}

// ============================================================================
// LakeGeneratorV2
// ============================================================================

export class LakeGeneratorV2 {
  private config: LakeGeneratorConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private lakes: LakeInfo[] = [];
  private time: number = 0;

  constructor(config: Partial<LakeGeneratorConfig> = {}) {
    this.config = {
      seed: 42,
      minDepressionArea: 20,
      minDepressionDepth: 2.0,
      maxLakes: 10,
      waterLevelOffset: 0.5,
      shorelineNoiseScale: 0.02,
      shorelineNoiseAmplitude: 0.15,
      surfaceResolution: 64,
      waveAmplitude: 0.05,
      waveFrequency: 0.3,
      deepColor: new THREE.Color(0x001830),
      shallowColor: new THREE.Color(0x40c0b0),
      materialPreset: 'lake',
      usePathTracedMaterial: true,
      attenuationDistance: 2.0,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // ------------------------------------------------------------------
  // Depression Detection (Watershed / Pit-Filling)
  // ------------------------------------------------------------------

  /**
   * Detect depressions (pits) in the heightmap using a priority-flood
   * watershed algorithm. Returns an array of depression objects, each
   * containing the cells, rim height, and minimum interior height.
   */
  private detectDepressions(
    heightmap: Float32Array,
    resolution: number,
  ): {
    cells: number[];
    rimHeight: number;
    minInteriorHeight: number;
    centerCol: number;
    centerRow: number;
  }[] {
    const N = resolution;
    const visited = new Uint8Array(N * N);
    const labeled = new Int32Array(N * N).fill(-1); // -1 = unlabeled
    const depressions: { cells: number[]; rimHeight: number; minInteriorHeight: number; centerCol: number; centerRow: number }[] = [];

    // Find local minima as seed points
    const seeds: number[] = [];
    for (let row = 1; row < N - 1; row++) {
      for (let col = 1; col < N - 1; col++) {
        const idx = row * N + col;
        const h = heightmap[idx];
        let isMinimum = true;
        for (let dr = -1; dr <= 1 && isMinimum; dr++) {
          for (let dc = -1; dc <= 1 && isMinimum; dc++) {
            if (dr === 0 && dc === 0) continue;
            const ni = (row + dr) * N + (col + dc);
            if (heightmap[ni] < h) isMinimum = false;
          }
        }
        if (isMinimum) seeds.push(idx);
      }
    }

    // For each seed, flood-fill outward to find the depression extent
    let lakeId = 0;
    for (const seed of seeds) {
      if (labeled[seed] >= 0) continue; // already assigned

      const cells: number[] = [];
      const queue: number[] = [seed];
      const inQueue = new Uint8Array(N * N);
      inQueue[seed] = 1;

      let rimHeight = Infinity;
      const seedH = heightmap[seed];

      while (queue.length > 0) {
        const idx = queue.shift()!;
        const row = Math.floor(idx / N);
        const col = idx % N;
        const h = heightmap[idx];

        // If this cell is higher than the seed, it could be a rim cell
        if (h > seedH) {
          rimHeight = Math.min(rimHeight, h);
          continue; // Don't expand beyond rim
        }

        cells.push(idx);
        labeled[idx] = lakeId;

        // Expand to 4-connected neighbours
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dc, dr] of dirs) {
          const nc = col + dc;
          const nr = row + dr;
          if (nc < 0 || nc >= N || nr < 0 || nr >= N) continue;
          const ni = nr * N + nc;
          if (inQueue[ni] || labeled[ni] >= 0) continue;
          inQueue[ni] = 1;
          queue.push(ni);
        }
      }

      // Filter: only keep depressions that are large and deep enough
      if (cells.length >= this.config.minDepressionArea && rimHeight !== Infinity) {
        const depth = rimHeight - seedH;
        if (depth >= this.config.minDepressionDepth) {
          // Compute centroid
          let sumCol = 0;
          let sumRow = 0;
          for (const c of cells) {
            sumCol += c % N;
            sumRow += Math.floor(c / N);
          }
          depressions.push({
            cells,
            rimHeight,
            minInteriorHeight: seedH,
            centerCol: Math.round(sumCol / cells.length),
            centerRow: Math.round(sumRow / cells.length),
          });
          lakeId++;
        }
      }
    }

    // Sort by area descending and limit count
    depressions.sort((a, b) => b.cells.length - a.cells.length);
    return depressions.slice(0, this.config.maxLakes);
  }

  // ------------------------------------------------------------------
  // Lake Surface Mesh Construction
  // ------------------------------------------------------------------

  /**
   * Build a lake surface mesh for a single depression.
   * The mesh is a disc with noise-deformed shoreline, lying at the
   * computed water level.
   */
  private buildLakeMesh(
    depression: {
      cells: number[];
      rimHeight: number;
      minInteriorHeight: number;
      centerCol: number;
      centerRow: number;
    },
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
    lakeId: number,
  ): { mesh: THREE.Mesh; info: LakeInfo } {
    const cellSize = worldSize / resolution;
    const N = resolution;
    const centerX = depression.centerCol * cellSize;
    const centerZ = depression.centerRow * cellSize;
    const waterLevel = depression.rimHeight - this.config.waterLevelOffset;

    // Compute approximate radius
    let maxDist = 0;
    for (const c of depression.cells) {
      const cx = (c % N) * cellSize;
      const cz = Math.floor(c / N) * cellSize;
      const d = Math.sqrt((cx - centerX) ** 2 + (cz - centerZ) ** 2);
      if (d > maxDist) maxDist = d;
    }
    const radius = maxDist + cellSize;

    // Compute depth per cell and max depth
    const depths = new Float32Array(depression.cells.length);
    let maxDepth = 0;
    for (let i = 0; i < depression.cells.length; i++) {
      const h = heightmap[depression.cells[i]];
      depths[i] = waterLevel - h;
      if (depths[i] > maxDepth) maxDepth = depths[i];
    }

    const surfaceArea = depression.cells.length * cellSize * cellSize;

    // Create disc geometry with noise-deformed shoreline
    const res = this.config.surfaceResolution;
    const geometry = new THREE.CircleGeometry(radius, res);
    geometry.rotateX(-Math.PI / 2);

    // Deform shoreline and set position
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colorArray = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
      let x = positions.getX(i);
      let z = positions.getZ(i);

      const worldX = x + centerX;
      const worldZ = z + centerZ;

      // Shoreline noise deformation
      const shoreNoise = this.noise.perlin2D(
        worldX * this.config.shorelineNoiseScale,
        worldZ * this.config.shorelineNoiseScale,
      );
      const shoreOffset = shoreNoise * radius * this.config.shorelineNoiseAmplitude;

      const dist = Math.sqrt(x * x + z * z);
      const effectiveRadius = radius + shoreOffset;

      if (dist > effectiveRadius && dist > 0.001) {
        const scale = effectiveRadius / dist;
        x *= scale;
        z *= scale;
      }

      positions.setX(i, x);
      positions.setZ(i, z);
      positions.setY(i, 0); // Y is relative; mesh.position.y = waterLevel

      // Vertex colour: depth-based attenuation tint
      const normalizedDist = Math.min(dist / Math.max(radius, 0.001), 1.0);
      const depthFactor = 1.0 - normalizedDist;
      const r = this.config.shallowColor.r + (this.config.deepColor.r - this.config.shallowColor.r) * depthFactor;
      const g = this.config.shallowColor.g + (this.config.deepColor.g - this.config.shallowColor.g) * depthFactor;
      const b = this.config.shallowColor.b + (this.config.deepColor.b - this.config.shallowColor.b) * depthFactor;
      colorArray[i * 3] = Math.min(r, 1);
      colorArray[i * 3 + 1] = Math.min(g, 1);
      colorArray[i * 3 + 2] = Math.min(b, 1);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
    geometry.computeVertexNormals();

    // Create material with depth-based attenuation for path tracing
    const attenuationColor = this.config.deepColor.clone();
    const material = createWaterMaterial(this.config.materialPreset, {
      attenuationColor,
      attenuationDistance: this.config.attenuationDistance,
      thickness: maxDepth > 0 ? Math.min(maxDepth, 10) : 2.0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, waterLevel, centerZ);
    mesh.renderOrder = 997;
    mesh.frustumCulled = false;

    const info: LakeInfo = {
      id: lakeId,
      center: new THREE.Vector3(centerX, waterLevel, centerZ),
      waterLevel,
      radius,
      maxDepth,
      surfaceArea,
      cells: depression.cells,
      depths,
      mesh,
    };

    return { mesh, info };
  }

  // ------------------------------------------------------------------
  // Fill Depressions (Terrain Modification)
  // ------------------------------------------------------------------

  /**
   * Fill depression cells in the heightmap up to the water level.
   * Returns a new heightmap with filled lake beds.
   */
  fillDepressions(
    heightmap: Float32Array,
    resolution: number,
  ): Float32Array {
    const result = new Float32Array(heightmap);

    for (const lake of this.lakes) {
      for (let i = 0; i < lake.cells.length; i++) {
        const idx = lake.cells[i];
        result[idx] = Math.min(result[idx], lake.waterLevel);
      }
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------------

  /**
   * Animate gentle wave displacement on all lake surfaces.
   * Call from useFrame each frame.
   */
  update(dt: number): void {
    this.time += dt;

    for (const lake of this.lakes) {
      const positions = lake.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const w1 = Math.sin(x * this.config.waveFrequency + this.time * 0.5) * this.config.waveAmplitude;
        const w2 = Math.sin(z * this.config.waveFrequency * 1.3 + this.time * 0.35) * this.config.waveAmplitude * 0.5;
        positions.setY(i, w1 + w2);
      }
      positions.needsUpdate = true;
      lake.mesh.geometry.computeVertexNormals();
    }
  }

  // ------------------------------------------------------------------
  // Main Generation Entry Point
  // ------------------------------------------------------------------

  /**
   * Generate lakes from a terrain heightmap.
   *
   * @returns Array of LakeInfo objects, the modified terrain, and a
   *          Three.js Group containing all lake meshes.
   */
  generate(
    heightmap: Float32Array,
    resolution: number,
    worldSize: number,
  ): {
    lakes: LakeInfo[];
    filledTerrain: Float32Array;
    meshGroup: THREE.Group;
  } {
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.lakes = [];

    // 1. Detect depressions
    const depressions = this.detectDepressions(heightmap, resolution);

    // 2. Build lake meshes
    const meshGroup = new THREE.Group();
    for (let i = 0; i < depressions.length; i++) {
      const { mesh, info } = this.buildLakeMesh(depressions[i], heightmap, resolution, worldSize, i);
      this.lakes.push(info);
      meshGroup.add(mesh);
    }

    // 3. Fill terrain depressions
    const filledTerrain = this.fillDepressions(heightmap, resolution);

    return { lakes: this.lakes, filledTerrain, meshGroup };
  }

  // ------------------------------------------------------------------
  // Water Level Query
  // ------------------------------------------------------------------

  /**
   * Check if a world position is inside any lake.
   * Returns the LakeInfo if found, or null.
   */
  getLakeAtPosition(x: number, z: number, resolution: number, worldSize: number): LakeInfo | null {
    const cellSize = worldSize / resolution;
    for (const lake of this.lakes) {
      const dx = x - lake.center.x;
      const dz = z - lake.center.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const noiseVal = this.noise.perlin2D(
        x * this.config.shorelineNoiseScale,
        z * this.config.shorelineNoiseScale,
      );
      const effectiveRadius = lake.radius * (1.0 + noiseVal * this.config.shorelineNoiseAmplitude);
      if (dist < effectiveRadius) return lake;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  getLakes(): LakeInfo[] { return this.lakes; }

  updateConfig(partial: Partial<LakeGeneratorConfig>): void {
    Object.assign(this.config, partial);
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  getConfig(): LakeGeneratorConfig { return { ...this.config }; }

  dispose(): void {
    for (const lake of this.lakes) {
      lake.mesh.geometry.dispose();
      if (Array.isArray(lake.mesh.material)) {
        lake.mesh.material.forEach(m => m.dispose());
      } else {
        lake.mesh.material.dispose();
      }
    }
    this.lakes = [];
  }
}
