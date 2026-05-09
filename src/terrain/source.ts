/**
 * Terrain Source - Noise sources and sampling for terrain generation
 *
 * Provides noise generation functions, heightfield sources,
 * and sampling utilities for terrain data.
 *
 * Now uses the full SeededNoiseGenerator from @/core/util/math/noise
 * for proper Perlin and Simplex noise — matching the original Infinigen
 * C++ FastNoiseLite noise quality.
 */

import { SeededNoiseGenerator, NoiseType } from '@/core/util/math/noise';

export interface NoiseSource {
  sample(x: number, y: number, z?: number): number;
  sample2D(x: number, y: number): number;
  sample3D(x: number, y: number, z: number): number;
}

/**
 * Perlin noise source using the proper gradient noise algorithm.
 *
 * Matches the quality of Infinigen's C++ FastNoiseLite Perlin implementation.
 * Uses SeededNoiseGenerator with seeded permutation tables for full
 * determinism and seamless tiling support.
 */
export class PerlinNoiseSource implements NoiseSource {
  private generator: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.generator = new SeededNoiseGenerator(seed);
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.generator.perlin3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.generator.perlin2D(x, y);
  }

  sample3D(x: number, y: number, z: number): number {
    return this.generator.perlin3D(x, y, z);
  }

  /**
   * FBM (Fractional Brownian Motion) using Perlin as the base noise.
   * This is the primary method used by terrain generation for natural
   * heightfield variation, matching Infinigen's multi-octave approach.
   */
  fbm(
    x: number, y: number, z: number = 0,
    octaves: number = 6,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
    scale: number = 1.0,
  ): number {
    return this.generator.fbm(x, y, z, {
      octaves,
      lacunarity,
      gain: persistence,
      scale,
      noiseType: NoiseType.Perlin,
    });
  }

  /**
   * Ridged multifractal noise — creates sharp mountain ridges.
   * Matches Infinigen's ridge_noise used in MountainElement.
   */
  ridgedMultifractal(
    x: number, y: number, z: number = 0,
    octaves: number = 6,
    lacunarity: number = 2.0,
    gain: number = 0.5,
    offset: number = 1.0,
    scale: number = 1.0,
  ): number {
    return this.generator.ridgedMultifractal(x, y, z, {
      octaves,
      lacunarity,
      gain,
      offset,
      scale,
      noiseType: NoiseType.Perlin,
    });
  }

  /**
   * Domain-warped Perlin noise for organic terrain variation.
   * Matches Infinigen's domain_warp used in WarpedRocksElement.
   */
  domainWarp(
    x: number, y: number, z: number = 0,
    warpStrength: number = 1.0,
    warpScale: number = 4.0,
    octaves: number = 6,
    scale: number = 1.0,
  ): number {
    return this.generator.domainWarp(x, y, z, {
      warpStrength,
      warpScale,
      octaves,
      scale,
      noiseType: NoiseType.Perlin,
    });
  }
}

/**
 * Simplex noise source using the proper simplex algorithm.
 *
 * Simplex noise has better visual isotropy and fewer directional
 * artifacts than Perlin noise, making it suitable for fine detail
 * and texture generation in terrain surfaces.
 */
export class SimplexNoiseSource implements NoiseSource {
  private generator: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.generator = new SeededNoiseGenerator(seed);
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.generator.simplex3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.generator.simplex2D(x, y);
  }

  sample3D(x: number, y: number, z: number): number {
    return this.generator.simplex3D(x, y, z);
  }

  /**
   * FBM using Simplex as the base noise.
   * Produces smoother, more isotropic terrain than Perlin FBM.
   */
  fbm(
    x: number, y: number, z: number = 0,
    octaves: number = 6,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
    scale: number = 1.0,
  ): number {
    return this.generator.fbm(x, y, z, {
      octaves,
      lacunarity,
      gain: persistence,
      scale,
      noiseType: NoiseType.Simplex,
    });
  }

  /**
   * Turbulence noise using Simplex — sum of absolute values.
   * Produces swirling, cloud-like patterns useful for cave
   * and rock surface textures.
   */
  turbulence(
    x: number, y: number, z: number = 0,
    octaves: number = 6,
    lacunarity: number = 2.0,
    gain: number = 0.5,
    scale: number = 1.0,
  ): number {
    return this.generator.turbulence(x, y, z, {
      octaves,
      lacunarity,
      gain,
      scale,
      noiseType: NoiseType.Simplex,
    });
  }
}

/**
 * Voronoi/Worley noise source for cell-based terrain patterns.
 *
 * Used in Infinigen for:
 * - VoronoiRocks element (cell-based rock formations)
 * - Voronoi lattice placement of cave instances
 * - Sand dune displacement patterns
 * - Tile-based terrain (LandTiles element)
 */
export class VoronoiNoiseSource implements NoiseSource {
  private generator: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.generator = new SeededNoiseGenerator(seed);
  }

  sample(x: number, y: number, z: number = 0): number {
    return this.generator.voronoi3D(x, y, z);
  }

  sample2D(x: number, y: number): number {
    return this.generator.voronoi2D(x, y);
  }

  sample3D(x: number, y: number, z: number): number {
    return this.generator.voronoi3D(x, y, z);
  }
}

/**
 * Sample a heightfield using fractal Brownian motion.
 *
 * This is the primary terrain heightfield generation function,
 * producing natural terrain variation through multi-octave noise.
 * Matches the FBM approach used throughout Infinigen's terrain
 * elements (Ground, Mountains, WarpedRocks, etc.).
 *
 * @param source - Noise source to use for the base signal
 * @param x - X coordinate in terrain space
 * @param y - Y coordinate in terrain space
 * @param octaves - Number of noise octaves (more = finer detail)
 * @param persistence - Amplitude multiplier per octave (0.5 typical)
 * @param lacunarity - Frequency multiplier per octave (2.0 typical)
 * @param scale - Base frequency scale
 * @returns Height value in approximately [-1, 1]
 */
export function sampleHeightField(
  source: NoiseSource,
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0
): number {
  // Use optimized FBM method if available (PerlinNoiseSource/SimplexNoiseSource)
  if (source instanceof PerlinNoiseSource) {
    return source.fbm(x, 0, y, octaves, lacunarity, persistence, scale);
  }
  if (source instanceof SimplexNoiseSource) {
    return source.fbm(x, 0, y, octaves, lacunarity, persistence, scale);
  }

  // Generic fallback for unknown NoiseSource implementations
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += source.sample2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Sample a 3D heightfield using FBM — used for volumetric terrain
 * and SDF-based terrain generation where 3D noise is needed.
 *
 * @param source - Noise source to use for the base signal
 * @param x - X coordinate in terrain space
 * @param y - Y coordinate (height) in terrain space
 * @param z - Z coordinate in terrain space
 * @param octaves - Number of noise octaves
 * @param persistence - Amplitude multiplier per octave
 * @param lacunarity - Frequency multiplier per octave
 * @param scale - Base frequency scale
 * @returns Noise value in approximately [-1, 1]
 */
export function sampleHeightField3D(
  source: NoiseSource,
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0
): number {
  if (source instanceof PerlinNoiseSource) {
    return source.fbm(x, y, z, octaves, lacunarity, persistence, scale);
  }
  if (source instanceof SimplexNoiseSource) {
    return source.fbm(x, y, z, octaves, lacunarity, persistence, scale);
  }

  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += source.sample3D(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}
