/**
 * Cave Mesh-to-SDF Occupancy Volume Pipeline
 *
 * Bridges the gap between the L-system cave path generator (LSystemCave.ts)
 * and the terrain SDF evaluation system. Implements the original Infinigen
 * approach where:
 *
 *   1. PCFG grammar generates turtle-graphics strings → 3D tunnel paths
 *   2. Paths are converted to occupancy volumes (SDF float grids)
 *   3. Occupancy volumes are placed in Voronoi lattice cells
 *   4. Trilinear/cubic interpolation samples the occupancy grid for SDF evaluation
 *
 * This replaces Infinigen's Blender Skin modifier + mesh_to_sdf pipeline with
 * a direct analytical SDF computation from tunnel path geometry.
 *
 * @module terrain/caves/CaveOccupancyPipeline
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import { LSystemCaveGenerator } from '../sdf/LSystemCave';
import type { CaveGrammarConfig } from '../sdf/LSystemCave';
import { smoothSubtraction } from '../sdf/SDFCombinators';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * A production rule in the cave L-system grammar.
 * Each rule maps a predecessor symbol to a successor string with an
 * associated probability (for stochastic / PCFG grammars).
 *
 * Named `CaveLSystemRule` to avoid collision with the vegetation module's
 * `LSystemRule` (which has a `predecessor` field for tree grammars).
 */
export interface CaveLSystemRule {
  /** Successor string produced when this rule fires */
  successor: string;
  /** Probability of this rule being selected (0–1); all rules for a
   *  given predecessor should sum to 1.0 */
  probability: number;
}

/**
 * Configuration for the Voronoi lattice used to distribute cave instances
 * across the terrain. Matches the original Infinigen caves.h C++ parameters.
 */
export interface CaveLatticeConfig {
  /** Number of independent Voronoi lattice layers (more = denser caves) */
  latticeLayers: number;
  /** World-space scale of each Voronoi cell */
  latticeScale: number;
  /** Vertical depth below which caves no longer appear */
  deepestLevel: number;
  /** Smoothness parameter for boolean subtraction blending */
  smoothness: number;
  /** Amplitude of Perlin noise perturbation applied to cave boundaries */
  perturbationAmplitude: number;
  /** Frequency of Perlin noise perturbation */
  perturbationFrequency: number;
}

/**
 * Placement descriptor for a single cave instance within a Voronoi cell.
 * Associates an occupancy volume with a world-space position and orientation.
 */
export interface CaveInstancePlacement {
  /** The pre-computed occupancy volume for this cave instance */
  volume: CaveOccupancyVolume;
  /** Center of the Voronoi cell in world space */
  cellCenter: THREE.Vector3;
  /** Radius (half-extent) of the Voronoi cell */
  cellRadius: number;
  /** Random rotation applied to this instance for variety */
  rotation: THREE.Quaternion;
  /** Deterministic instance index (used for seeding sub-features) */
  instanceIndex: number;
}

// ============================================================================
// CaveOccupancyVolume
// ============================================================================

/**
 * A 3D occupancy grid storing SDF (signed distance field) values for a
 * single cave instance. Negative values represent the interior of the cave
 * (inside a tunnel), positive values represent solid rock (outside).
 *
 * The grid is axis-aligned in local space and can be placed into the world
 * via an affine transform (translation + rotation + scale) determined by
 * the Voronoi cell it occupies.
 */
export class CaveOccupancyVolume {
  /** The flattened 3D occupancy grid – SDF values at each voxel */
  data: Float32Array;
  /** Grid resolution per axis (e.g. 128 → 128³ voxels) */
  resolution: number;
  /** Axis-aligned bounding box in local space */
  bounds: THREE.Box3;

  /**
   * @param data     - Flattened SDF grid (length must be resolution³)
   * @param resolution - Voxel count per axis
   * @param bounds   - Local-space bounding box
   */
  constructor(data: Float32Array, resolution: number, bounds: THREE.Box3) {
    this.data = data;
    this.resolution = resolution;
    this.bounds = bounds;
  }

  // -----------------------------------------------------------------------
  // Sampling
  // -----------------------------------------------------------------------

  /**
   * Sample the occupancy volume at a local-space position using trilinear
   * interpolation.
   *
   * Coordinates outside the bounding box are clamped to the grid boundary,
   * so the returned value smoothly degrades toward the exterior SDF.
   *
   * @param position - Query position in the volume's local coordinate system
   * @returns SDF value: negative = inside cave, positive = outside
   */
  sample(position: THREE.Vector3): number {
    const N = this.resolution;
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, this.bounds.min);

    // Normalized coordinates in [0, 1]
    const u = (position.x - min.x) / size.x;
    const v = (position.y - min.y) / size.y;
    const w = (position.z - min.z) / size.z;

    // Grid-space continuous coordinates
    const gx = u * (N - 1);
    const gy = v * (N - 1);
    const gz = w * (N - 1);

    // Integer indices of the lower corner of the containing cell
    const ix = Math.max(0, Math.min(N - 2, Math.floor(gx)));
    const iy = Math.max(0, Math.min(N - 2, Math.floor(gy)));
    const iz = Math.max(0, Math.min(N - 2, Math.floor(gz)));

    // Fractional part within the cell
    const fx = gx - ix;
    const fy = gy - iy;
    const fz = gz - iz;

    // Fetch the 8 corner values
    const v000 = this.data[iz * N * N + iy * N + ix];
    const v100 = this.data[iz * N * N + iy * N + ix + 1];
    const v010 = this.data[iz * N * N + (iy + 1) * N + ix];
    const v110 = this.data[iz * N * N + (iy + 1) * N + ix + 1];
    const v001 = this.data[(iz + 1) * N * N + iy * N + ix];
    const v101 = this.data[(iz + 1) * N * N + iy * N + ix + 1];
    const v011 = this.data[(iz + 1) * N * N + (iy + 1) * N + ix];
    const v111 = this.data[(iz + 1) * N * N + (iy + 1) * N + ix + 1];

    // Trilinear interpolation
    const c00 = v000 * (1 - fx) + v100 * fx;
    const c10 = v010 * (1 - fx) + v110 * fx;
    const c01 = v001 * (1 - fx) + v101 * fx;
    const c11 = v011 * (1 - fx) + v111 * fx;

    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;

    return c0 * (1 - fz) + c1 * fz;
  }

  /**
   * Sample with Catmull-Rom cubic interpolation for smoother results.
   * Matches Infinigen's `ctlerp()` function – uses a 4-point stencil
   * per axis (64 total lookups for 3D) to produce C¹-continuous
   * interpolation rather than the C⁰ trilinear result.
   *
   * @param position - Query position in the volume's local coordinate system
   * @returns SDF value: negative = inside cave, positive = outside
   */
  sampleCubic(position: THREE.Vector3): number {
    const N = this.resolution;
    const min = this.bounds.min;
    const size = new THREE.Vector3().subVectors(this.bounds.max, this.bounds.min);

    // Normalized coordinates
    const u = (position.x - min.x) / size.x;
    const v = (position.y - min.y) / size.y;
    const w = (position.z - min.z) / size.z;

    // Grid-space continuous coordinates
    const gx = u * (N - 1);
    const gy = v * (N - 1);
    const gz = w * (N - 1);

    // Central cell index
    const ix = Math.max(1, Math.min(N - 3, Math.floor(gx)));
    const iy = Math.max(1, Math.min(N - 3, Math.floor(gy)));
    const iz = Math.max(1, Math.min(N - 3, Math.floor(gz)));

    // Fractional offsets
    const fx = gx - ix;
    const fy = gy - iy;
    const fz = gz - iz;

    // Sample the 4×4×4 neighborhood using Catmull-Rom basis weights
    // This produces C¹-continuous interpolation (smoother than trilinear C⁰)
    let result = 0;
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -1; dz <= 2; dz++) {
          const sx = Math.max(0, Math.min(N - 1, ix + dx));
          const sy = Math.max(0, Math.min(N - 1, iy + dy));
          const sz = Math.max(0, Math.min(N - 1, iz + dz));
          const val = this.data[sz * N * N + sy * N + sx];

          // Catmull-Rom basis weight per axis
          const wx = catmullRomWeight(fx, dx);
          const wy = catmullRomWeight(fy, dy);
          const wz = catmullRomWeight(fz, dz);

          result += val * wx * wy * wz;
        }
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Coordinate Transforms
  // -----------------------------------------------------------------------

  /**
   * Transform a world-space position into the volume's local coordinate
   * system, accounting for the cell center, cell radius, and random
   * rotation of the instance.
   *
   * @param worldPos  - Query position in world space
   * @param cellCenter - Center of the Voronoi cell
   * @param cellRadius - Half-extent of the cell
   * @param rotation  - Rotation applied to the instance
   * @returns Position in the volume's local space (inside `bounds`)
   */
  worldToLocal(
    worldPos: THREE.Vector3,
    cellCenter: THREE.Vector3,
    cellRadius: number,
    rotation: THREE.Quaternion,
  ): THREE.Vector3 {
    // 1. Translate into cell-centered coordinates
    const centered = new THREE.Vector3().subVectors(worldPos, cellCenter);

    // 2. Apply inverse rotation so the cave orientation is undone
    const invRotation = rotation.clone().invert();
    centered.applyQuaternion(invRotation);

    // 3. Normalize from [-cellRadius, +cellRadius] to [0, 1] then map to bounds
    const normalized = new THREE.Vector3(
      (centered.x / cellRadius + 1) * 0.5,
      (centered.y / cellRadius + 1) * 0.5,
      (centered.z / cellRadius + 1) * 0.5,
    );

    // 4. Map [0, 1] → bounds
    const local = new THREE.Vector3(
      this.bounds.min.x + normalized.x * (this.bounds.max.x - this.bounds.min.x),
      this.bounds.min.y + normalized.y * (this.bounds.max.y - this.bounds.min.y),
      this.bounds.min.z + normalized.z * (this.bounds.max.z - this.bounds.min.z),
    );

    return local;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  /**
   * Serialize the occupancy volume to a plain-object format suitable for
   * structured cloning / transferable messaging.
   */
  serialize(): {
    data: Float32Array;
    resolution: number;
    boundsMin: [number, number, number];
    boundsMax: [number, number, number];
  } {
    return {
      data: new Float32Array(this.data),
      resolution: this.resolution,
      boundsMin: [this.bounds.min.x, this.bounds.min.y, this.bounds.min.z],
      boundsMax: [this.bounds.max.x, this.bounds.max.y, this.bounds.max.z],
    };
  }

  /**
   * Deserialize an occupancy volume from its serialized form.
   */
  static deserialize(
    serialized: ReturnType<CaveOccupancyVolume['serialize']>,
  ): CaveOccupancyVolume {
    const bounds = new THREE.Box3(
      new THREE.Vector3(...serialized.boundsMin),
      new THREE.Vector3(...serialized.boundsMax),
    );
    return new CaveOccupancyVolume(
      new Float32Array(serialized.data),
      serialized.resolution,
      bounds,
    );
  }
}

// ============================================================================
// Catmull-Rom Weight Helper
// ============================================================================

/**
 * Compute the Catmull-Rom interpolation weight for a given fractional
 * offset and integer offset. Used by {@link CaveOccupancyVolume.sampleCubic}.
 *
 * @param frac  - Fractional part within the cell [0, 1)
 * @param offset - Integer offset from the central sample (-1, 0, 1, 2)
 */
function catmullRomWeight(frac: number, offset: number): number {
  const t = frac;
  const t2 = t * t;
  const t3 = t2 * t;

  switch (offset) {
    case -1:
      return -0.5 * t + t2 - 0.5 * t3;
    case 0:
      return 1.0 - 2.5 * t2 + 1.5 * t3;
    case 1:
      return 0.5 * t + 2.0 * t2 - 1.5 * t3;
    case 2:
      return -0.5 * t2 + 0.5 * t3;
    default:
      return 0;
  }
}

// ============================================================================
// Deterministic Hash
// ============================================================================

/**
 * Deterministic integer hash for 3D cell coordinates.
 * Produces a well-distributed non-negative integer.
 * Used for Voronoi cell → cave instance assignment.
 *
 * @param x - Cell X coordinate
 * @param y - Cell Y coordinate
 * @param z - Cell Z coordinate
 * @param layer - Lattice layer index (to separate layers)
 */
function deterministicCellHash(x: number, y: number, z: number, layer: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1013904223 + layer * 15485863) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16));
  return Math.abs(h & 0x7fffffff);
}

// ============================================================================
// Default Lattice Config
// ============================================================================

/**
 * Default Voronoi lattice configuration matching Infinigen's caves.h defaults.
 */
export const DEFAULT_CAVE_LATTICE_CONFIG: CaveLatticeConfig = {
  latticeLayers: 3,
  latticeScale: 20.0,
  deepestLevel: -50.0,
  smoothness: 1.0,
  perturbationAmplitude: 0.3,
  perturbationFrequency: 0.15,
};

// ============================================================================
// CaveOccupancyPipeline
// ============================================================================

/**
 * Complete pipeline that bridges L-system cave path generation with the
 * terrain SDF evaluation system.
 *
 * Implements the original Infinigen cave generation approach:
 * 1. PCFG grammar produces turtle-graphics strings → 3D tunnel paths
 * 2. Tunnel paths are converted to occupancy volumes (SDF float grids)
 *    by directly computing the distance field (no intermediate mesh step)
 * 3. Occupancy volumes are instanced and placed into Voronoi lattice cells
 * 4. During terrain evaluation, the SDF contribution from caves is sampled
 *    via trilinear/cubic interpolation and combined with the host element
 *    using smooth boolean subtraction.
 *
 * All methods are deterministic for a given seed — no Math.random().
 */
export class CaveOccupancyPipeline {
  private seed: number;
  private rng: SeededRandom;
  private noise: NoiseUtils;

  /**
   * @param seed - Master seed for deterministic generation
   */
  constructor(seed: number) {
    this.seed = seed;
    this.rng = new SeededRandom(seed);
    this.noise = new NoiseUtils(seed);
  }

  // -----------------------------------------------------------------------
  // Occupancy Volume Generation
  // -----------------------------------------------------------------------

  /**
   * Generate a cave occupancy volume from tunnel paths.
   *
   * This replaces Infinigen's mesh_to_sdf approach. Instead of creating a
   * Blender mesh and then converting to SDF, we directly compute the SDF
   * by evaluating the distance to the nearest tunnel segment at each grid
   * point and subtracting the tunnel radius.
   *
   * Algorithm:
   * 1. Compute the bounding box of all paths (with radius padding)
   * 2. For each grid point, compute minimum distance to any path segment
   * 3. At the nearest segment, interpolate the local tunnel radius
   * 4. Apply noise-based radius variation for organic feel
   * 5. Store `distance - radius` as the SDF value (negative = inside)
   * 6. Smooth-blend at tunnel junctions using smooth-min
   *
   * @param paths            - Array of tunnel paths (each an array of 3D points)
   * @param resolution       - Grid resolution per axis (default 128)
   * @param baseRadius       - Base tunnel radius (default 2.0)
   * @param radiusVariation  - Noise-based radius variation amount (default 0.5)
   * @returns A fully populated CaveOccupancyVolume
   */
  generateOccupancyVolume(
    paths: THREE.Vector3[][],
    resolution: number = 128,
    baseRadius: number = 2.0,
    radiusVariation: number = 0.5,
  ): CaveOccupancyVolume {
    // --- Step 1: Compute bounding box of all paths with radius margin ---
    const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (const path of paths) {
      for (const pt of path) {
        minBound.min(pt);
        maxBound.max(pt);
      }
    }

    // Add generous margin for the radius + noise variation
    const margin = baseRadius * (1.0 + radiusVariation) * 2.0;
    minBound.addScalar(-margin);
    maxBound.addScalar(margin);

    // Ensure the bounding box is cubic (simplifies grid indexing)
    const extent = new THREE.Vector3().subVectors(maxBound, minBound);
    const maxExtent = Math.max(extent.x, extent.y, extent.z);
    const center = new THREE.Vector3().addVectors(minBound, maxBound).multiplyScalar(0.5);
    const halfExtent = maxExtent * 0.5;
    const cubeMin = new THREE.Vector3(
      center.x - halfExtent,
      center.y - halfExtent,
      center.z - halfExtent,
    );
    const cubeMax = new THREE.Vector3(
      center.x + halfExtent,
      center.y + halfExtent,
      center.z + halfExtent,
    );

    const bounds = new THREE.Box3(cubeMin, cubeMax);
    const N = resolution;
    const data = new Float32Array(N * N * N);

    // Pre-compute step sizes
    const size = new THREE.Vector3().subVectors(cubeMax, cubeMin);
    const dx = size.x / N;
    const dy = size.y / N;
    const dz = size.z / N;

    // Build a flat list of all segments for efficient iteration
    const segments: Array<{
      a: THREE.Vector3;
      b: THREE.Vector3;
      radiusA: number;
      radiusB: number;
      dir: THREE.Vector3;
      lenSq: number;
    }> = [];

    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dir = new THREE.Vector3().subVectors(b, a);
        const lenSq = dir.lengthSq();

        // Assign radius along path (can be varied later)
        const radiusA = baseRadius;
        const radiusB = baseRadius;

        segments.push({
          a, b,
          radiusA, radiusB,
          dir, lenSq,
        });
      }
    }

    // Create a noise instance for radius variation (deterministic)
    const radiusNoise = new NoiseUtils(this.seed + 999);

    // --- Step 2: For each grid point, compute SDF ---
    for (let iz = 0; iz < N; iz++) {
      const worldZ = cubeMin.z + (iz + 0.5) * dz;

      for (let iy = 0; iy < N; iy++) {
        const worldY = cubeMin.y + (iy + 0.5) * dy;

        for (let ix = 0; ix < N; ix++) {
          const worldX = cubeMin.x + (ix + 0.5) * dx;
          const gridIdx = iz * N * N + iy * N + ix;

          const point = new THREE.Vector3(worldX, worldY, worldZ);
          let minSDF = Infinity;

          // Evaluate distance to each tunnel segment
          for (const seg of segments) {
            const sdf = this.computeSegmentSDF(
              point,
              seg.a,
              seg.b,
              seg.radiusA,
              seg.radiusB,
              seg.dir,
              seg.lenSq,
              radiusNoise,
              radiusVariation,
            );

            // Smooth-min to blend overlapping tunnels at junctions
            if (minSDF === Infinity) {
              minSDF = sdf;
            } else {
              // Polynomial smooth minimum (k = 1.0)
              const k = baseRadius * 0.5;
              const h = Math.max(0, Math.min(1, (minSDF - sdf + k) / (2 * k)));
              minSDF = minSDF - h * (minSDF - sdf) + k * h * (1 - h);
            }
          }

          data[gridIdx] = minSDF === Infinity ? baseRadius * 2 : minSDF;
        }
      }
    }

    return new CaveOccupancyVolume(data, N, bounds);
  }

  /**
   * Compute the SDF value for a point relative to a single tunnel segment.
   *
   * The SDF is `distance_to_axis - interpolated_radius`, which yields
   * negative values inside the tunnel and positive outside.
   *
   * @param point         - Query point
   * @param a             - Segment start
   * @param b             - Segment end
   * @param radiusA       - Tunnel radius at segment start
   * @param radiusB       - Tunnel radius at segment end
   * @param dir           - Segment direction vector (B - A)
   * @param lenSq         - Squared length of the segment
   * @param noise         - Noise utility for radius variation
   * @param radiusVar     - Radius variation amplitude
   */
  private computeSegmentSDF(
    point: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radiusA: number,
    radiusB: number,
    dir: THREE.Vector3,
    lenSq: number,
    noise: NoiseUtils,
    radiusVar: number,
  ): number {
    // Project point onto the line segment
    let t = 0;
    if (lenSq > 1e-10) {
      const pa = new THREE.Vector3().subVectors(point, a);
      t = Math.max(0, Math.min(1, pa.dot(dir) / lenSq));
    }

    // Closest point on segment
    const closest = new THREE.Vector3().addVectors(
      a,
      dir.clone().multiplyScalar(t),
    );

    const distance = point.distanceTo(closest);

    // Interpolate radius along the segment
    let radius = radiusA + (radiusB - radiusA) * t;

    // Add noise-based radius variation for organic walls
    const noiseVal = noise.perlin3D(
      point.x * 0.3,
      point.y * 0.3,
      point.z * 0.3,
    );
    radius += noiseVal * radiusVar;

    // Ensure radius stays positive (floor at 30% of the interpolated base radius)
    const baseInterpRadius = radiusA + (radiusB - radiusA) * t;
    radius = Math.max(baseInterpRadius * 0.3, radius);

    return distance - radius;
  }

  // -----------------------------------------------------------------------
  // Cave Instance Generation (PCFG)
  // -----------------------------------------------------------------------

  /**
   * Generate multiple cave instances using PCFG grammar.
   * Each instance gets a unique L-system configuration derived from the
   * master seed, producing varied cave shapes.
   *
   * Matches Infinigen's cave asset generation pipeline where multiple
   * cave "templates" are pre-computed and then instantiated across the
   * Voronoi lattice.
   *
   * @param instanceCount - Number of distinct cave shapes to generate (default 5)
   * @param resolution    - Occupancy grid resolution per instance (default 64)
   * @returns Array of CaveOccupancyVolume instances with varied geometries
   */
  generateCaveInstances(
    instanceCount: number = 5,
    resolution: number = 64,
  ): CaveOccupancyVolume[] {
    const instances: CaveOccupancyVolume[] = [];

    // Grammar configurations that produce different cave styles
    const grammarVariants: Partial<CaveGrammarConfig>[] = [
      // Straight tunnels with occasional branching
      {
        axiom: 'f',
        rules: { 'f': ['ff', 'f[rf]f', 'fuf'] },
        ruleProbabilities: { 'f': [0.4, 0.3, 0.3] },
        baseAngle: Math.PI / 12,
        baseStepSize: 2.0,
        baseRadius: 2.0,
        radiusVariation: 0.3,
      },
      // Winding, sinuous caves
      {
        axiom: 'frf',
        rules: { 'f': ['frf', 'flf', 'f[uf]f'] },
        ruleProbabilities: { 'f': [0.35, 0.35, 0.3] },
        baseAngle: Math.PI / 8,
        baseStepSize: 1.5,
        baseRadius: 2.5,
        radiusVariation: 0.4,
      },
      // Vertical shafts with horizontal branches
      {
        axiom: 'f',
        rules: { 'f': ['ff', 'f[uf]f', 'f[df]f', 'f[rf]f'] },
        ruleProbabilities: { 'f': [0.25, 0.25, 0.25, 0.25] },
        baseAngle: Math.PI / 10,
        baseStepSize: 1.8,
        baseRadius: 1.8,
        radiusVariation: 0.35,
      },
      // Large chambers connected by narrow passages
      {
        axiom: 'f',
        rules: { 'f': ['fobf', 'f[rf]saf', 'ffbbsf'] },
        ruleProbabilities: { 'f': [0.4, 0.3, 0.3] },
        baseAngle: Math.PI / 6,
        baseStepSize: 1.0,
        baseRadius: 3.0,
        radiusVariation: 0.5,
      },
      // Tight, meandering passages
      {
        axiom: 'frflf',
        rules: { 'f': ['frf', 'flf', 'fudf', 'ff'] },
        ruleProbabilities: { 'f': [0.3, 0.3, 0.2, 0.2] },
        baseAngle: Math.PI / 5,
        baseStepSize: 1.2,
        baseRadius: 1.5,
        radiusVariation: 0.25,
      },
    ];

    for (let i = 0; i < instanceCount; i++) {
      const instanceSeed = this.seed + i * 7919; // Prime offset for uniqueness
      const instanceRng = new SeededRandom(instanceSeed);

      // Select a grammar variant (cycling through available variants,
      // with slight randomization via the instance RNG)
      const variantIdx = i % grammarVariants.length;
      const grammarConfig = grammarVariants[variantIdx];

      // Generate tunnel paths using the L-system generator
      const generator = new LSystemCaveGenerator();
      const caveData = generator.generate(instanceSeed, {
        ...grammarConfig,
        iterations: 2 + instanceRng.nextInt(0, 2), // 2-4 iterations
      });

      // Extract paths from the generated tunnel data.
      // The LSystemCaveGenerator returns a single path; we create
      // additional variation by splitting at branch points.
      const paths: THREE.Vector3[][] = this.splitPathAtBranches(
        caveData.points,
        caveData.radii,
      );

      // Generate the occupancy volume from the tunnel paths
      const volume = this.generateOccupancyVolume(
        paths,
        resolution,
        grammarConfig.baseRadius ?? 2.0,
        grammarConfig.radiusVariation ?? 0.3,
      );

      instances.push(volume);
    }

    return instances;
  }

  /**
   * Split a single tunnel path into sub-paths at branch-like points
   * (where the path changes direction significantly). This provides
   * multiple paths for the occupancy generator, improving the SDF quality
   * at junctions.
   *
   * @param points - Array of 3D points along the tunnel path
   * @param radii  - Array of radii at each point
   * @returns Array of sub-paths
   */
  private splitPathAtBranches(
    points: THREE.Vector3[],
    _radii: number[],
  ): THREE.Vector3[][] {
    if (points.length < 2) {
      return points.length > 0 ? [points] : [];
    }

    const paths: THREE.Vector3[][] = [];
    let currentPath: THREE.Vector3[] = [points[0]];
    const branchAngleThreshold = Math.PI / 4; // 45°

    for (let i = 1; i < points.length; i++) {
      currentPath.push(points[i]);

      // Check if there's a sharp direction change
      if (i < points.length - 1 && currentPath.length >= 3) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        const dir1 = new THREE.Vector3().subVectors(curr, prev).normalize();
        const dir2 = new THREE.Vector3().subVectors(next, curr).normalize();
        const angle = dir1.angleTo(dir2);

        if (angle > branchAngleThreshold) {
          // Split here — end current path and start a new one
          // with an overlap of 2 points for continuity
          paths.push(currentPath);
          currentPath = [points[i - 1], points[i]];
        }
      }
    }

    // Add the last path
    if (currentPath.length >= 2) {
      paths.push(currentPath);
    }

    return paths;
  }

  // -----------------------------------------------------------------------
  // Voronoi Lattice SDF Evaluation
  // -----------------------------------------------------------------------

  /**
   * Compute the SDF contribution from cave instances placed in a Voronoi
   * lattice. This is the main entry point for integrating caves into the
   * terrain SDF evaluation, matching Infinigen's `caves.h` C++ implementation.
   *
   * Algorithm:
   * 1. For each lattice layer, determine which Voronoi cell the query
   *    point belongs to
   * 2. Check the cell and its 26 neighbors (3×3×3 block)
   * 3. For each relevant cell, look up the assigned cave instance
   * 4. Transform the query point to the instance's local space
   * 5. Sample the occupancy volume with trilinear interpolation
   * 6. Apply Perlin noise perturbation for organic wall variation
   * 7. Combine using smooth boolean subtraction
   *
   * @param position      - World-space query position
   * @param instances     - Cave instances with placement info
   * @param latticeConfig - Voronoi lattice configuration
   * @returns SDF value contribution from caves (negative = inside cave)
   */
  evaluateCaveSDF(
    position: THREE.Vector3,
    instances: CaveInstancePlacement[],
    latticeConfig: CaveLatticeConfig = DEFAULT_CAVE_LATTICE_CONFIG,
  ): number {
    if (instances.length === 0) return Infinity;

    let combinedSDF = Infinity;

    for (let layer = 0; layer < latticeConfig.latticeLayers; layer++) {
      const layerOffset = layer * 1000;

      // Determine which Voronoi cell this point falls in
      const cellX = Math.floor(position.x / latticeConfig.latticeScale);
      const cellY = Math.floor(position.y / latticeConfig.latticeScale);
      const cellZ = Math.floor(position.z / latticeConfig.latticeScale);

      // Check 3×3×3 neighborhood of cells
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const nz = cellZ + dz;

            // Deterministic hash → instance index
            const hash = deterministicCellHash(nx, ny, nz, layerOffset);
            const instanceIdx = hash % instances.length;

            const instance = instances[instanceIdx];

            // Compute cell center
            const cellCenter = new THREE.Vector3(
              (nx + 0.5) * latticeConfig.latticeScale,
              (ny + 0.5) * latticeConfig.latticeScale,
              (nz + 0.5) * latticeConfig.latticeScale,
            );

            const cellRadius = latticeConfig.latticeScale * 0.5;

            // Quick reject: skip if point is far from this cell
            const distToCell = position.distanceTo(cellCenter);
            if (distToCell > cellRadius * 2.0) continue;

            // Skip caves below the deepest allowed level
            if (cellCenter.y < latticeConfig.deepestLevel) continue;

            // Transform world position to instance local space
            const localPos = instance.volume.worldToLocal(
              position,
              cellCenter,
              cellRadius,
              instance.rotation,
            );

            // Check if the local position is within the volume bounds
            if (!instance.volume.bounds.containsPoint(localPos)) continue;

            // Sample the occupancy volume (trilinear interpolation)
            let caveSDF = instance.volume.sample(localPos);

            // Apply Perlin noise perturbation for organic wall variation
            if (latticeConfig.perturbationAmplitude > 0) {
              const perturbation = this.noise.perlin3D(
                position.x * latticeConfig.perturbationFrequency,
                position.y * latticeConfig.perturbationFrequency,
                position.z * latticeConfig.perturbationFrequency,
              ) * latticeConfig.perturbationAmplitude;
              caveSDF += perturbation;
            }

            // Combine with running result using smooth boolean subtraction
            if (combinedSDF === Infinity) {
              combinedSDF = caveSDF;
            } else {
              combinedSDF = smoothSubtraction(
                combinedSDF,
                caveSDF,
                latticeConfig.smoothness,
              );
            }
          }
        }
      }
    }

    return combinedSDF;
  }

  // -----------------------------------------------------------------------
  // L-System Tunnel Path Generation
  // -----------------------------------------------------------------------

  /**
   * Generate tunnel paths using L-system grammar.
   * Wraps LSystemCave for integration with the occupancy pipeline,
   * converting its output into the format expected by
   * {@link generateOccupancyVolume}.
   *
   * @param axiom        - Starting symbol string (e.g. 'f')
   * @param rules        - Production rules as a Map of predecessor → alternatives
   * @param iterations   - Number of grammar expansion iterations (default 3)
   * @param defaultAngle - Base rotation angle in radians (default π/12 = 15°)
   * @param defaultStep  - Base step size for forward movements (default 2.0)
   * @returns Array of tunnel paths (each path is an array of 3D points)
   */
  generateTunnelPaths(
    axiom: string,
    rules: Map<string, CaveLSystemRule[]>,
    iterations: number = 3,
    defaultAngle: number = Math.PI / 12,
    defaultStep: number = 2.0,
  ): THREE.Vector3[][] {
    // Convert Map<string, LSystemRule[]> to the format expected by LSystemCave
    const rulesRecord: Record<string, string[]> = {};
    const probRecord: Record<string, number[]> = {};

    rules.forEach((ruleList, predecessor) => {
      rulesRecord[predecessor] = ruleList.map(r => r.successor);
      probRecord[predecessor] = ruleList.map(r => r.probability);
    });

    const config: Partial<CaveGrammarConfig> = {
      axiom,
      rules: rulesRecord,
      ruleProbabilities: probRecord,
      iterations,
      baseAngle: defaultAngle,
      baseStepSize: defaultStep,
    };

    const generator = new LSystemCaveGenerator();
    const caveData = generator.generate(this.seed, config);

    // Return as a single path array (caller can split if needed)
    if (caveData.points.length === 0) return [];
    return [caveData.points];
  }

  // -----------------------------------------------------------------------
  // Utility: Build Placements from Instances
  // -----------------------------------------------------------------------

  /**
   * Create placement descriptors for a set of cave instances distributed
   * across a region. Each instance is assigned to a Voronoi cell
   * determined by the lattice configuration.
   *
   * This is a convenience method that pre-computes the rotation and cell
   * assignment for all instances, producing a flat array that can be
   * passed directly to {@link evaluateCaveSDF}.
   *
   * @param volumes      - Pre-generated cave occupancy volumes
   * @param latticeConfig - Voronoi lattice configuration
   * @param regionMin    - Minimum corner of the world region to populate
   * @param regionMax    - Maximum corner of the world region to populate
   * @returns Array of placement descriptors
   */
  buildPlacements(
    volumes: CaveOccupancyVolume[],
    latticeConfig: CaveLatticeConfig = DEFAULT_CAVE_LATTICE_CONFIG,
    regionMin: THREE.Vector3 = new THREE.Vector3(-100, -50, -100),
    regionMax: THREE.Vector3 = new THREE.Vector3(100, 50, 100),
  ): CaveInstancePlacement[] {
    const placements: CaveInstancePlacement[] = [];
    const scale = latticeConfig.latticeScale;

    // Determine the range of Voronoi cells that overlap the region
    const minCell = new THREE.Vector3(
      Math.floor(regionMin.x / scale),
      Math.floor(regionMin.y / scale),
      Math.floor(regionMin.z / scale),
    );
    const maxCell = new THREE.Vector3(
      Math.ceil(regionMax.x / scale),
      Math.ceil(regionMax.y / scale),
      Math.ceil(regionMax.z / scale),
    );

    for (let layer = 0; layer < latticeConfig.latticeLayers; layer++) {
      const layerOffset = layer * 1000;

      for (let cx = minCell.x; cx <= maxCell.x; cx++) {
        for (let cy = minCell.y; cy <= maxCell.y; cy++) {
          for (let cz = minCell.z; cz <= maxCell.z; cz++) {
            // Skip if below deepest level
            const cellCenterY = (cy + 0.5) * scale;
            if (cellCenterY < latticeConfig.deepestLevel) continue;

            const hash = deterministicCellHash(cx, cy, cz, layerOffset);
            const instanceIdx = hash % volumes.length;

            const cellCenter = new THREE.Vector3(
              (cx + 0.5) * scale,
              cellCenterY,
              (cz + 0.5) * scale,
            );

            // Deterministic rotation from hash
            const rng = new SeededRandom(hash);
            const rotEuler = new THREE.Euler(
              rng.nextFloat(0, Math.PI * 2),
              rng.nextFloat(0, Math.PI * 2),
              rng.nextFloat(0, Math.PI * 2),
            );
            const rotation = new THREE.Quaternion().setFromEuler(rotEuler);

            placements.push({
              volume: volumes[instanceIdx],
              cellCenter,
              cellRadius: scale * 0.5,
              rotation,
              instanceIndex: instanceIdx,
            });
          }
        }
      }
    }

    return placements;
  }
}
