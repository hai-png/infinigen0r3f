/**
 * Heightmap Tile Generators for LandTilesElement
 *
 * Implements the 7 tile type generators from original Infinigen that produce
 * heightmaps for the LandTilesElement. Each generator creates a Float32Array
 * heightmap of configurable resolution.
 *
 * Tile types:
 * - MultiMountainsTileGenerator: Large-scale mountain ranges (600m tiles)
 * - CoastTileGenerator: Coastline with beach/seafloor (600m tiles, directional)
 * - MesaTileGenerator: Flat-topped mesa formations (50m tiles)
 * - CanyonTileGenerator: Erosional canyons (200m tiles)
 * - CliffTileGenerator: Cliff faces (50m tiles, directional)
 * - RiverTileGenerator: River channels (50m tiles)
 * - VolcanoTileGenerator: Volcanic cones (50m tiles)
 *
 * Each generator extends the abstract TileGenerator base class and produces
 * deterministic output given the same seed, using SeededRandom and NoiseUtils.
 *
 * @module terrain/tiles/TileGenerators
 */

import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils, SeededNoiseGenerator } from '@/core/util/math/noise';

// ============================================================================
// Tile Type
// ============================================================================

/**
 * Identifies the type of terrain tile to generate.
 * Maps to the original Infinigen tile type names.
 */
export type TileType =
  | 'multi_mountains'
  | 'coast'
  | 'mesa'
  | 'canyon'
  | 'cliff'
  | 'river'
  | 'volcano';

// ============================================================================
// Abstract TileGenerator Base Class
// ============================================================================

/**
 * Abstract base class for heightmap tile generators.
 *
 * Each subclass generates a Float32Array heightmap of size
 * resolution × resolution for a tile of the given world-space size.
 * All randomness is derived from the provided seed, ensuring deterministic
 * and reproducible output.
 *
 * Lifecycle:
 * 1. Instantiate the generator
 * 2. Call `generate(seed, resolution, tileSize)` to produce the heightmap
 *
 * Subclasses MUST NOT use Math.random() or non-deterministic state —
 * all randomness must come from SeededRandom with the given seed.
 */
export abstract class TileGenerator {
  /** Human-readable name of this tile type */
  abstract readonly tileType: TileType;

  /** Default tile size in world units */
  abstract readonly defaultTileSize: number;

  /**
   * Generate a heightmap tile.
   *
   * @param seed - Random seed for deterministic generation
   * @param resolution - Grid resolution (width = height in pixels)
   * @param tileSize - World-space size of the tile
   * @param params - Optional generator-specific parameters
   * @returns Float32Array of size resolution × resolution with height values
   */
  abstract generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array;
}

// ============================================================================
// Thermal Erosion Helper (shared across generators)
// ============================================================================

/**
 * Apply simple thermal erosion to a heightmap.
 *
 * Simulates material sliding down slopes when the slope exceeds the
 * talus angle. This is the same algorithm used in LandTilesElement.
 *
 * @param heightmap - The heightmap to erode (modified in-place)
 * @param resolution - Grid size (width = height)
 * @param iterations - Number of erosion passes
 * @param talusAngle - Maximum stable slope before material slides
 */
function applyThermalErosion(
  heightmap: Float32Array,
  resolution: number,
  iterations: number,
  talusAngle: number = 0.8,
): void {
  const res = resolution;
  for (let iter = 0; iter < iterations; iter++) {
    const newHeightmap = new Float32Array(heightmap);
    for (let y = 1; y < res - 1; y++) {
      for (let x = 1; x < res - 1; x++) {
        const idx = y * res + x;
        const h = heightmap[idx];

        // Check 4-neighbors
        const neighbors = [
          heightmap[(y - 1) * res + x],
          heightmap[(y + 1) * res + x],
          heightmap[y * res + (x - 1)],
          heightmap[y * res + (x + 1)],
        ];

        let maxDiff = 0;
        let totalDiff = 0;
        for (const nh of neighbors) {
          const diff = h - nh;
          if (diff > talusAngle) {
            maxDiff = Math.max(maxDiff, diff);
            totalDiff += diff;
          }
        }

        if (totalDiff > 0) {
          // Erode: move material downhill
          newHeightmap[idx] = h - maxDiff * 0.5;
        }
      }
    }
    heightmap.set(newHeightmap);
  }
}

// ============================================================================
// MultiMountainsTileGenerator
// ============================================================================

/**
 * Large-scale mountain range heightmap generator (600m tiles).
 *
 * Uses MountainsElement's SDF approach: multi-group FBM noise with mask
 * coverage. The heightmap is generated by evaluating FBM noise on a 2D grid
 * with multiple mountain groups at different positions, then applying thermal
 * erosion for natural slope distribution.
 *
 * Parameters:
 * - frequency: FBM noise frequency (default 0.008)
 * - amplitude: Maximum mountain height (default 25)
 * - octaves: FBM octave count (default 8)
 * - groupCount: Number of mountain groups (default 3)
 * - maskThreshold: Mask coverage threshold 0-1 (default 0.3)
 * - erosionEnabled: Whether to apply thermal erosion (default true)
 */
export class MultiMountainsTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'multi_mountains';
  readonly defaultTileSize = 600;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));
    const maskNoise = new SeededNoiseGenerator(rng.nextInt(1, 999999));

    // Extract parameters with defaults
    const frequency = params?.frequency ?? 0.008;
    const amplitude = params?.amplitude ?? 25;
    const octaves = params?.octaves ?? 8;
    const groupCount = params?.groupCount ?? 3;
    const maskThreshold = params?.maskThreshold ?? 0.3;
    const erosionEnabled = params?.erosionEnabled ?? true;
    const lacunarity = 2.0;
    const persistence = 0.5;

    // Pre-compute mountain group positions
    const groups: { cx: number; cz: number; radius: number; height: number }[] = [];
    for (let i = 0; i < groupCount; i++) {
      groups.push({
        cx: rng.nextFloat(-0.3, 0.3), // Normalized coordinates within tile
        cz: rng.nextFloat(-0.3, 0.3),
        radius: rng.nextFloat(0.2, 0.5),
        height: rng.nextFloat(amplitude * 0.5, amplitude),
      });
    }

    const heightmap = new Float32Array(resolution * resolution);
    const cellSize = tileSize / resolution;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        // Normalized coordinates [0, 1]
        const nx = x / resolution;
        const nz = y / resolution;

        // World-space coordinates
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // --- Mask coverage ---
        const maskValue = maskNoise.fbm(
          worldX * 0.01, 0, worldZ * 0.01,
          { octaves: 3, gain: 0.5, lacunarity: 2.0 },
        );
        const maskNormalized = (maskValue + 1.0) * 0.5;

        if (maskNormalized < maskThreshold) {
          heightmap[y * resolution + x] = 0;
          continue;
        }

        // --- Multi-group mountain height ---
        let totalHeight = 0;
        let totalWeight = 0;

        for (const group of groups) {
          // Distance from this point to group center in normalized coords
          const dx = nx - (0.5 + group.cx);
          const dz = nz - (0.5 + group.cz);
          const dist2D = Math.sqrt(dx * dx + dz * dz);

          // Smooth falloff
          const falloff = Math.max(0, 1.0 - dist2D / group.radius);
          const smoothFalloff = falloff * falloff * (3 - 2 * falloff);

          if (smoothFalloff <= 0) continue;

          // FBM height
          let h = 0;
          let amp = group.height;
          let freq = frequency;
          for (let o = 0; o < octaves; o++) {
            h += noise.fbm(worldX * freq, worldZ * freq, 0, 1) * amp;
            amp *= persistence;
            freq *= lacunarity;
          }

          totalHeight += h * smoothFalloff;
          totalWeight += smoothFalloff;
        }

        const finalHeight = totalWeight > 0 ? totalHeight / totalWeight : 0;
        heightmap[y * resolution + x] = finalHeight;
      }
    }

    // Apply thermal erosion
    if (erosionEnabled) {
      const erosionIterations = rng.nextInt(3, 5);
      applyThermalErosion(heightmap, resolution, erosionIterations, 0.8);
    }

    return heightmap;
  }
}

// ============================================================================
// CoastTileGenerator
// ============================================================================

/**
 * Coastline heightmap generator with beach and seafloor (600m tiles, directional).
 *
 * Algorithm: MultiMountains base + Perlin coastline + coast heightmapping.
 * The coast heightmapping creates:
 * - Beach zone: linear slope (beachSlope)
 * - Steep transition: steep slope from beach to seafloor
 * - Deep sea: flat at seaDepth
 *
 * Parameters:
 * - coastFreq: Coastline noise frequency (default 0.005)
 * - beachSize: Beach zone width in world units (default 10)
 * - beachSlope: Beach slope gradient (default 0.05)
 * - steepSlopeSize: Steep transition width in world units (default 5)
 * - seaDepth: Deep sea depth (default -20)
 */
export class CoastTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'coast';
  readonly defaultTileSize = 600;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));
    const coastNoise = new SeededNoiseGenerator(rng.nextInt(1, 999999));

    // Extract parameters
    const coastFreq = params?.coastFreq ?? 0.005;
    const beachSize = params?.beachSize ?? 10;
    const beachSlope = params?.beachSlope ?? 0.05;
    const steepSlopeSize = params?.steepSlopeSize ?? 5;
    const seaDepth = params?.seaDepth ?? -20;

    // First, generate a multi-mountains base
    const mountainGen = new MultiMountainsTileGenerator();
    const baseHeightmap = mountainGen.generate(seed, resolution, tileSize, {
      frequency: 0.006,
      amplitude: 20,
      octaves: 6,
      groupCount: 2,
      maskThreshold: 0.2,
      erosionEnabled: false,
    });

    // Generate coastline mask using Perlin noise
    // Coast runs roughly through the center of the tile with Perlin distortion
    const coastOffset = coastNoise.fbm(
      0, 0, 0,
      { octaves: 3, gain: 0.5, lacunarity: 2.0 },
    ) * 0.1; // Small offset from center

    const heightmap = new Float32Array(resolution * resolution);
    const cellSize = tileSize / resolution;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Coast position: X-based with Perlin distortion
        const coastDistortion = coastNoise.fbm(
          worldZ * coastFreq, 0, 0,
          { octaves: 4, gain: 0.5, lacunarity: 2.0 },
        ) * tileSize * 0.15;
        const coastX = 0.5 * tileSize + coastDistortion + coastOffset * tileSize;

        // Distance from coast line (positive = land, negative = sea)
        const distFromCoast = worldX - coastX;

        const baseHeight = baseHeightmap[y * resolution + x];

        if (distFromCoast > beachSize + steepSlopeSize) {
          // Deep land: use mountain height
          heightmap[y * resolution + x] = Math.max(baseHeight, 2);
        } else if (distFromCoast > beachSize) {
          // Steep transition zone from beach to seafloor
          const t = (distFromCoast - beachSize) / steepSlopeSize;
          const landHeight = Math.max(baseHeight, 2);
          const beachEndHeight = beachSize * beachSlope;
          heightmap[y * resolution + x] = seaDepth + (landHeight - seaDepth) * t;
        } else if (distFromCoast > 0) {
          // Beach zone: linear slope
          heightmap[y * resolution + x] = distFromCoast * beachSlope;
        } else {
          // Deep sea: flat at seaDepth with subtle variation
          const depthNoise = noise.fbm(worldX * 0.003, worldZ * 0.003, 0, 2) * 2;
          heightmap[y * resolution + x] = seaDepth + depthNoise;
        }
      }
    }

    // Apply thermal erosion
    applyThermalErosion(heightmap, resolution, 3, 0.8);

    return heightmap;
  }
}

// ============================================================================
// MesaTileGenerator
// ============================================================================

/**
 * Flat-topped mesa formation heightmap generator (50m tiles).
 *
 * Uses stepped FBM: flat top at a random height, steep sides.
 * The mesa shape is created by applying a smoothstep function to
 * distance from the mesa center, creating the characteristic
 * flat top and steep cliff sides.
 *
 * Parameters:
 * - mesaHeight: Height of the mesa top (default 15)
 * - mesaFrequency: Controls mesa shape variation (default 0.02)
 * - sideSteepness: Steepness of mesa sides (default 3.0)
 */
export class MesaTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'mesa';
  readonly defaultTileSize = 50;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));

    const mesaHeight = params?.mesaHeight ?? rng.nextFloat(10, 20);
    const mesaFrequency = params?.mesaFrequency ?? 0.02;
    const sideSteepness = params?.sideSteepness ?? 3.0;

    // Mesa center and radius
    const centerX = 0.5 + rng.nextFloat(-0.1, 0.1);
    const centerZ = 0.5 + rng.nextFloat(-0.1, 0.1);
    const radius = rng.nextFloat(0.2, 0.4);

    const heightmap = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Distance from mesa center (normalized)
        const dx = nx - centerX;
        const dz = nz - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Add noise variation to the mesa shape
        const shapeNoise = noise.fbm(
          worldX * mesaFrequency,
          worldZ * mesaFrequency,
          0,
          4,
        ) * 0.1;

        const effectiveDist = dist + shapeNoise;

        // Mesa profile: flat top, steep sides using smoothstep
        // Normalized distance from center (0 = center, 1 = edge)
        const normalizedDist = effectiveDist / radius;

        let h: number;
        if (normalizedDist < 0.7) {
          // Flat top with subtle variation
          const topNoise = noise.fbm(
            worldX * 0.05,
            worldZ * 0.05,
            0,
            3,
          ) * 1.0;
          h = mesaHeight + topNoise;
        } else if (normalizedDist < 1.0) {
          // Steep transition (cliff side)
          const t = (normalizedDist - 0.7) / 0.3;
          const sideNoise = noise.fbm(
            worldX * 0.08 + 100,
            worldZ * 0.08 + 100,
            0,
            3,
          ) * 2.0;
          // Apply steepness
          const smoothT = Math.pow(t, sideSteepness);
          h = (mesaHeight + sideNoise) * (1.0 - smoothT);
        } else {
          // Ground level with rolling terrain
          h = noise.fbm(
            worldX * 0.03,
            worldZ * 0.03,
            0,
            3,
          ) * 2.0;
        }

        heightmap[y * resolution + x] = h;
      }
    }

    // Light erosion on the sides
    applyThermalErosion(heightmap, resolution, 2, 0.6);

    return heightmap;
  }
}

// ============================================================================
// CanyonTileGenerator
// ============================================================================

/**
 * Erosional canyon heightmap generator (200m tiles).
 *
 * Creates a V-shaped canyon through the center of the tile with FBM
 * variation. The canyon floor is at the lowest elevation, with steep
 * walls rising to the surrounding terrain. The canyon path meanders
 * using noise-based displacement.
 *
 * Parameters:
 * - canyonDepth: Depth of the canyon floor (default 20)
 * - canyonWidth: Width of the canyon at the top (default 30)
 * - canyonFrequency: Noise frequency for canyon path meandering (default 0.01)
 * - wallSteepness: Steepness of canyon walls (default 2.0)
 */
export class CanyonTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'canyon';
  readonly defaultTileSize = 200;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));
    const pathNoise = new SeededNoiseGenerator(rng.nextInt(1, 999999));

    const canyonDepth = params?.canyonDepth ?? 20;
    const canyonWidth = params?.canyonWidth ?? 30;
    const canyonFrequency = params?.canyonFrequency ?? 0.01;
    const wallSteepness = params?.wallSteepness ?? 2.0;

    // Canyon direction (slightly off-axis for variety)
    const angle = rng.nextFloat(-0.3, 0.3);

    const heightmap = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Base terrain (high plateau)
        let baseHeight = noise.fbm(
          worldX * 0.005,
          worldZ * 0.005,
          0,
          5,
        ) * 5 + 15;

        // Canyon path: meandering line through the center
        // The canyon runs roughly along the Z axis with X displacement
        const pathDisplacement = pathNoise.fbm(
          worldZ * canyonFrequency, 0, 0,
          { octaves: 4, gain: 0.5, lacunarity: 2.0 },
        ) * canyonWidth * 1.5;

        // Distance from the canyon center line
        const canyonCenterX = tileSize * 0.5 + pathDisplacement;
        const rotatedX = (worldX - canyonCenterX) * Math.cos(angle) -
                          worldZ * Math.sin(angle);

        // Normalized distance from canyon center (in world units)
        const distFromCenter = Math.abs(rotatedX);
        const halfWidth = canyonWidth * 0.5;

        let h: number;
        if (distFromCenter < halfWidth * 0.3) {
          // Canyon floor
          const floorNoise = noise.fbm(
            worldX * 0.02,
            worldZ * 0.02,
            0,
            3,
          ) * 1.0;
          h = baseHeight - canyonDepth + floorNoise;
        } else if (distFromCenter < halfWidth) {
          // Canyon wall: V-shape with steepness control
          const t = (distFromCenter - halfWidth * 0.3) / (halfWidth * 0.7);
          const wallNoise = noise.fbm(
            worldX * 0.03 + 200,
            worldZ * 0.03 + 200,
            0,
            3,
          ) * 2.0;
          // Power curve for wall steepness
          const wallProfile = Math.pow(t, wallSteepness);
          h = (baseHeight - canyonDepth + wallNoise) +
              canyonDepth * wallProfile;
        } else {
          // Outside canyon: plateau terrain
          h = baseHeight;
        }

        heightmap[y * resolution + x] = h;
      }
    }

    // Apply erosion to smooth canyon walls
    applyThermalErosion(heightmap, resolution, 3, 0.7);

    return heightmap;
  }
}

// ============================================================================
// CliffTileGenerator
// ============================================================================

/**
 * Cliff face heightmap generator (50m tiles, directional).
 *
 * Creates a sharp elevation change (cliff) with noise variation.
 * The cliff runs across the tile in a configurable orientation,
 * with a steep transition zone from low to high elevation.
 *
 * Parameters:
 * - cliffHeight: Height of the cliff face (default 15)
 * - cliffFrequency: Noise frequency for cliff shape variation (default 0.02)
 * - cliffOrientation: Cliff orientation angle in radians (default random)
 */
export class CliffTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'cliff';
  readonly defaultTileSize = 50;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));
    const cliffNoise = new SeededNoiseGenerator(rng.nextInt(1, 999999));

    const cliffHeight = params?.cliffHeight ?? rng.nextFloat(10, 20);
    const cliffFrequency = params?.cliffFrequency ?? 0.02;
    const cliffOrientation = params?.cliffOrientation ?? rng.nextFloat(0, Math.PI);

    const cosO = Math.cos(cliffOrientation);
    const sinO = Math.sin(cliffOrientation);

    const heightmap = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Project point onto cliff normal direction
        const projected = (nx - 0.5) * cosO + (nz - 0.5) * sinO;

        // Add noise variation to the cliff edge position
        const edgeNoise = cliffNoise.fbm(
          worldX * cliffFrequency,
          worldZ * cliffFrequency,
          0,
          { octaves: 4, gain: 0.5, lacunarity: 2.0 },
        ) * 0.1;

        const effectiveProjected = projected + edgeNoise;

        // Cliff profile: smoothstep transition from low to high
        const transitionWidth = 0.05; // Narrow transition zone
        let h: number;

        if (effectiveProjected < -transitionWidth) {
          // Low side
          const lowNoise = noise.fbm(
            worldX * 0.03,
            worldZ * 0.03,
            0,
            3,
          ) * 2.0;
          h = lowNoise;
        } else if (effectiveProjected > transitionWidth) {
          // High side
          const highNoise = noise.fbm(
            worldX * 0.03 + 300,
            worldZ * 0.03 + 300,
            0,
            3,
          ) * 2.0;
          h = cliffHeight + highNoise;
        } else {
          // Cliff face: steep transition
          const t = (effectiveProjected + transitionWidth) / (2 * transitionWidth);
          const smoothT = t * t * (3 - 2 * t); // smoothstep
          const faceNoise = noise.fbm(
            worldX * 0.05 + 500,
            worldZ * 0.05 + 500,
            0,
            3,
          ) * 1.5;
          h = cliffHeight * smoothT + faceNoise;
        }

        heightmap[y * resolution + x] = h;
      }
    }

    // Light erosion
    applyThermalErosion(heightmap, resolution, 2, 0.5);

    return heightmap;
  }
}

// ============================================================================
// RiverTileGenerator
// ============================================================================

/**
 * River channel heightmap generator (50m tiles).
 *
 * Creates a meandering river channel carved into terrain.
 * The river path follows a sinusoidal curve with noise-based meandering,
 * and the channel has a rounded U-shape cross-section.
 *
 * Parameters:
 * - riverWidth: Width of the river channel in world units (default 8)
 * - riverDepth: Depth of the river channel (default 5)
 * - meanderFrequency: Frequency of river meandering (default 0.02)
 * - meanderAmplitude: Amplitude of meandering displacement (default 15)
 */
export class RiverTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'river';
  readonly defaultTileSize = 50;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));
    const meanderNoise = new SeededNoiseGenerator(rng.nextInt(1, 999999));

    const riverWidth = params?.riverWidth ?? 8;
    const riverDepth = params?.riverDepth ?? 5;
    const meanderFrequency = params?.meanderFrequency ?? 0.02;
    const meanderAmplitude = params?.meanderAmplitude ?? 15;

    const heightmap = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Base terrain
        const baseHeight = noise.fbm(
          worldX * 0.02,
          worldZ * 0.02,
          0,
          5,
        ) * 4 + 5;

        // River path: meandering along the Z axis
        // The river center at this Z position
        const meanderOffset = meanderNoise.fbm(
          worldZ * meanderFrequency, 0, 0,
          { octaves: 4, gain: 0.5, lacunarity: 2.0 },
        ) * meanderAmplitude;

        const riverCenterX = tileSize * 0.5 + meanderOffset;
        const distFromRiver = Math.abs(worldX - riverCenterX);
        const halfWidth = riverWidth * 0.5;

        let h: number;
        if (distFromRiver < halfWidth * 0.5) {
          // River bottom (deepest part)
          const bottomNoise = noise.fbm(
            worldX * 0.05 + 400,
            worldZ * 0.05 + 400,
            0,
            2,
          ) * 0.5;
          h = baseHeight - riverDepth + bottomNoise;
        } else if (distFromRiver < halfWidth) {
          // River bank: smooth transition from bottom to terrain
          const t = (distFromRiver - halfWidth * 0.5) / (halfWidth * 0.5);
          const bankNoise = noise.fbm(
            worldX * 0.04 + 600,
            worldZ * 0.04 + 600,
            0,
            3,
          ) * 1.0;
          h = (baseHeight - riverDepth) + riverDepth * t * t + bankNoise * (1 - t);
        } else {
          // Outside river: normal terrain
          h = baseHeight;
        }

        heightmap[y * resolution + x] = h;
      }
    }

    // Light erosion on river banks
    applyThermalErosion(heightmap, resolution, 2, 0.4);

    return heightmap;
  }
}

// ============================================================================
// VolcanoTileGenerator
// ============================================================================

/**
 * Volcanic cone heightmap generator (50m tiles).
 *
 * Creates a cone-shaped volcano with a crater at the top.
 * The cone has noise-based surface variation and a clearly defined
 * crater rim with a depression at the summit.
 *
 * Parameters:
 * - volcanoHeight: Height of the volcano cone (default 30)
 * - craterRadius: Radius of the summit crater (default 5)
 * - craterDepth: Depth of the crater below the rim (default 8)
 * - coneSteepness: Steepness of the cone slopes (default 1.5)
 */
export class VolcanoTileGenerator extends TileGenerator {
  readonly tileType: TileType = 'volcano';
  readonly defaultTileSize = 50;

  generate(
    seed: number,
    resolution: number,
    tileSize: number,
    params?: Record<string, any>,
  ): Float32Array {
    const rng = new SeededRandom(seed);
    const noise = new NoiseUtils(rng.nextInt(1, 999999));

    const volcanoHeight = params?.volcanoHeight ?? 30;
    const craterRadius = params?.craterRadius ?? 5;
    const craterDepth = params?.craterDepth ?? 8;
    const coneSteepness = params?.coneSteepness ?? 1.5;

    // Volcano center (slightly off-center for variety)
    const centerX = 0.5 + rng.nextFloat(-0.05, 0.05);
    const centerZ = 0.5 + rng.nextFloat(-0.05, 0.05);
    const baseRadius = tileSize * rng.nextFloat(0.3, 0.45);

    const heightmap = new Float32Array(resolution * resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const nx = x / resolution;
        const nz = y / resolution;
        const worldX = nx * tileSize;
        const worldZ = nz * tileSize;

        // Distance from volcano center
        const dx = nx - centerX;
        const dz = nz - centerZ;
        const dist = Math.sqrt(dx * dx + dz * dz) * tileSize;

        // Cone profile: height decreases with distance from center
        const coneProfile = Math.max(0, 1.0 - Math.pow(dist / baseRadius, coneSteepness));

        // Surface noise for natural variation
        const surfaceNoise = noise.fbm(
          worldX * 0.03,
          worldZ * 0.03,
          0,
          4,
        ) * 2.0;

        // Radial noise for ridge-like features on the cone
        const angle = Math.atan2(dz, dx);
        const radialNoise = noise.fbm(
          Math.cos(angle) * 5 + 700,
          Math.sin(angle) * 5 + 700,
          0,
          3,
        ) * 3.0;

        let h = volcanoHeight * coneProfile + surfaceNoise * coneProfile +
                radialNoise * coneProfile * 0.5;

        // Crater at the summit
        if (dist < craterRadius * 2) {
          const craterProfile = dist / craterRadius;
          if (craterProfile < 1.0) {
            // Inside crater: depressed
            const craterFloorNoise = noise.fbm(
              worldX * 0.05 + 800,
              worldZ * 0.05 + 800,
              0,
              2,
            ) * 0.5;
            // Crater rim is at volcanoHeight * coneProfile at the crater edge
            const rimHeight = volcanoHeight * coneProfile;
            const innerHeight = rimHeight - craterDepth + craterFloorNoise;
            // Smooth crater walls
            const craterT = craterProfile;
            h = innerHeight + (rimHeight - innerHeight) * craterT * craterT;
          }
        }

        // Ground level outside the volcano
        if (dist > baseRadius) {
          const groundNoise = noise.fbm(
            worldX * 0.02 + 900,
            worldZ * 0.02 + 900,
            0,
            3,
          ) * 2.0;
          // Smooth transition to ground
          const transitionDist = dist - baseRadius;
          const transitionWidth = tileSize * 0.1;
          if (transitionDist < transitionWidth) {
            const t = transitionDist / transitionWidth;
            h = h * (1 - t) + groundNoise * t;
          } else {
            h = groundNoise;
          }
        }

        heightmap[y * resolution + x] = h;
      }
    }

    // Light erosion on cone slopes
    applyThermalErosion(heightmap, resolution, 2, 0.6);

    return heightmap;
  }
}

// ============================================================================
// TileGeneratorFactory
// ============================================================================

/** Map of tile type strings to generator instances (lazy-initialized) */
const generatorCache = new Map<TileType, TileGenerator>();

/**
 * Factory for creating tile generators by type.
 *
 * Provides a centralized way to instantiate tile generators with
 * optional parameter overrides. Generator instances are cached
 * for reuse.
 *
 * Usage:
 * ```typescript
 * const factory = new TileGeneratorFactory();
 * const generator = factory.createGenerator('volcano', { volcanoHeight: 40 });
 * const heightmap = generator.generate(42, 128, 50);
 * ```
 */
export class TileGeneratorFactory {
  /**
   * Create a tile generator for the given type.
   *
   * @param type - The tile type to generate
   * @param params - Optional parameters (not used for creation, but available for reference)
   * @returns A TileGenerator instance for the requested type
   * @throws Error if the tile type is unknown
   */
  createGenerator(type: TileType, params?: Record<string, any>): TileGenerator {
    // Check cache first
    const cached = generatorCache.get(type);
    if (cached) return cached;

    let generator: TileGenerator;

    switch (type) {
      case 'multi_mountains':
        generator = new MultiMountainsTileGenerator();
        break;
      case 'coast':
        generator = new CoastTileGenerator();
        break;
      case 'mesa':
        generator = new MesaTileGenerator();
        break;
      case 'canyon':
        generator = new CanyonTileGenerator();
        break;
      case 'cliff':
        generator = new CliffTileGenerator();
        break;
      case 'river':
        generator = new RiverTileGenerator();
        break;
      case 'volcano':
        generator = new VolcanoTileGenerator();
        break;
      default:
        throw new Error(`[TileGeneratorFactory] Unknown tile type: ${type}`);
    }

    // Cache the generator
    generatorCache.set(type, generator);

    return generator;
  }

  /**
   * Get all available tile types.
   *
   * @returns Array of all supported tile type identifiers
   */
  static getAvailableTypes(): TileType[] {
    return [
      'multi_mountains',
      'coast',
      'mesa',
      'canyon',
      'cliff',
      'river',
      'volcano',
    ];
  }

  /**
   * Get the default tile size for a given type.
   *
   * @param type - The tile type
   * @returns Default tile size in world units
   */
  static getDefaultTileSize(type: TileType): number {
    const factory = new TileGeneratorFactory();
    return factory.createGenerator(type).defaultTileSize;
  }

  /**
   * Clear the generator cache.
   */
  static clearCache(): void {
    generatorCache.clear();
  }
}
