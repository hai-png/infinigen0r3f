/**
 * Seeded Noise Generator Module
 *
 * Provides a comprehensive, fully-deterministic noise generation system.
 * All noise functions use SeededRandom internally — no Math.random() anywhere.
 * The same seed always produces the same output.
 *
 * Ported and overhauled from Princeton's Infinigen procedural generation system.
 */

import { SeededRandom, SeededPermutationTable } from '../MathUtils';

// ============================================================================
// Noise Type Enum
// ============================================================================

/**
 * Supported noise algorithm types.
 */
export enum NoiseType {
  Perlin = 'perlin',
  Simplex = 'simplex',
  Voronoi = 'voronoi',
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Perlin's improved fade curve: 6t^5 - 15t^4 + 10t^3 */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Linear interpolation */
function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

/** Perlin 3D gradient dot product */
function grad3D(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Perlin 2D gradient dot product */
function grad2D(hash: number, x: number, y: number): number {
  const h = hash & 3;
  switch (h) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    default: return 0;
  }
}

/** Simplex 3D gradient table */
const SIMPLEX_GRAD3: readonly [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

/** Simplex 3D skewing factors */
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

/** Simplex 2D skewing factors */
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

/** Deterministic integer hash (3 inputs) */
function hash3D(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1013904223) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16));
  return Math.abs(h & 0x7fffffff);
}

// ============================================================================
// SeededNoiseGenerator
// ============================================================================

/**
 * A fully-deterministic noise generator that produces the same output
 * for the same seed every time. Supports Perlin, Simplex, and Worley/Voronoi
 * noise, plus layered variants (FBM, ridged multifractal, turbulence,
 * domain warping).
 *
 * Usage:
 *   const gen = new SeededNoiseGenerator(42);
 *   const val = gen.perlin3D(1.5, 2.3, 0.7);
 *   const terrain = gen.fbm(10, 20, 30, { octaves: 8 });
 */
export class SeededNoiseGenerator {
  private readonly perm: SeededPermutationTable;
  private readonly seed: number;

  constructor(seed: number = 0) {
    this.seed = seed;
    this.perm = new SeededPermutationTable(seed);
  }

  /** Return the seed this generator was created with. */
  getSeed(): number {
    return this.seed;
  }

  // --------------------------------------------------------------------------
  // Perlin Noise
  // --------------------------------------------------------------------------

  /**
   * 2D Perlin noise.
   * @returns Value in approximately [-1, 1]
   */
  perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const A = this.perm.get(X) + Y;
    const B = this.perm.get(X + 1) + Y;

    return lerp(
      v,
      lerp(u, grad2D(this.perm.get(A), xf, yf), grad2D(this.perm.get(B), xf - 1, yf)),
      lerp(u, grad2D(this.perm.get(A + 1), xf, yf - 1), grad2D(this.perm.get(B + 1), xf - 1, yf - 1))
    );
  }

  /**
   * 3D Perlin noise.
   * @returns Value in approximately [-1, 1]
   */
  perlin3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const A = this.perm.get(X) + Y;
    const AA = this.perm.get(A) + Z;
    const AB = this.perm.get(A + 1) + Z;
    const B = this.perm.get(X + 1) + Y;
    const BA = this.perm.get(B) + Z;
    const BB = this.perm.get(B + 1) + Z;

    return lerp(
      w,
      lerp(
        v,
        lerp(u, grad3D(this.perm.get(AA), xf, yf, zf), grad3D(this.perm.get(BA), xf - 1, yf, zf)),
        lerp(u, grad3D(this.perm.get(AB), xf, yf - 1, zf), grad3D(this.perm.get(BB), xf - 1, yf - 1, zf))
      ),
      lerp(
        v,
        lerp(u, grad3D(this.perm.get(AA + 1), xf, yf, zf - 1), grad3D(this.perm.get(BA + 1), xf - 1, yf, zf - 1)),
        lerp(u, grad3D(this.perm.get(AB + 1), xf, yf - 1, zf - 1), grad3D(this.perm.get(BB + 1), xf - 1, yf - 1, zf - 1))
      )
    );
  }

  // --------------------------------------------------------------------------
  // Simplex Noise
  // --------------------------------------------------------------------------

  /**
   * 2D Simplex noise.
   * @returns Value in approximately [-1, 1]
   */
  simplex2D(x: number, y: number): number {
    // Skew input space to determine which simplex cell we're in
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t; // Unskew the cell origin back to (x,y) space
    const Y0 = j - t;
    const x0 = x - X0; // The x,y distances from the cell origin
    const y0 = y - Y0;

    // Determine which simplex we are in
    let i1: number, j1: number;
    if (x0 > y0) {
      i1 = 1; j1 = 0; // Lower triangle: XY order
    } else {
      i1 = 0; j1 = 1; // Upper triangle: YX order
    }

    const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
    const y2 = y0 - 1.0 + 2.0 * G2;

    // Work out the hashed gradient indices of the three simplex corners
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm.get(ii + this.perm.get(jj)) % 12;
    const gi1 = this.perm.get(ii + i1 + this.perm.get(jj + j1)) % 12;
    const gi2 = this.perm.get(ii + 1 + this.perm.get(jj + 1)) % 12;

    // Calculate contributions from the three corners
    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = SIMPLEX_GRAD3[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = SIMPLEX_GRAD3[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = SIMPLEX_GRAD3[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }

    // Scale to [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * 3D Simplex noise.
   * @returns Value in approximately [-1, 1]
   */
  simplex3D(x: number, y: number, z: number): number {
    // Skew input space to determine which simplex cell we're in
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;

    // Determine which simplex we are in
    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;

    // Work out the hashed gradient indices
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = this.perm.get(ii + this.perm.get(jj + this.perm.get(kk))) % 12;
    const gi1 = this.perm.get(ii + i1 + this.perm.get(jj + j1 + this.perm.get(kk + k1))) % 12;
    const gi2 = this.perm.get(ii + i2 + this.perm.get(jj + j2 + this.perm.get(kk + k2))) % 12;
    const gi3 = this.perm.get(ii + 1 + this.perm.get(jj + 1 + this.perm.get(kk + 1))) % 12;

    // Calculate contributions from the four corners
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const g = SIMPLEX_GRAD3[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const g = SIMPLEX_GRAD3[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const g = SIMPLEX_GRAD3[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const g = SIMPLEX_GRAD3[gi3];
      t3 *= t3;
      n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
    }

    // Scale to [-1, 1]
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  // --------------------------------------------------------------------------
  // Worley / Voronoi Noise
  // --------------------------------------------------------------------------

  /**
   * 2D Worley (Voronoi) noise — distance to nearest feature point.
   * @returns Distance to nearest feature point
   */
  voronoi2D(x: number, y: number, scale: number = 1.0): number {
    const sx = x * scale;
    const sy = y * scale;
    const cellX = Math.floor(sx);
    const cellY = Math.floor(sy);

    let minDist = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cellX + dx;
        const ny = cellY + dy;

        // Seeded hash for feature point position within cell
        const h = hash3D(nx, ny, this.seed);
        const fx = nx + (h % 1000) / 1000;
        const fy = ny + ((Math.floor(h / 1000)) % 1000) / 1000;

        const distX = sx - fx;
        const distY = sy - fy;
        minDist = Math.min(minDist, Math.sqrt(distX * distX + distY * distY));
      }
    }

    return minDist;
  }

  /**
   * 3D Worley (Voronoi) noise — distance to nearest feature point.
   * @returns Distance to nearest feature point
   */
  voronoi3D(x: number, y: number, z: number, scale: number = 1.0): number {
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;
    const cellX = Math.floor(sx);
    const cellY = Math.floor(sy);
    const cellZ = Math.floor(sz);

    let minDist = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = cellX + dx;
          const ny = cellY + dy;
          const nz = cellZ + dz;

          // Seeded hash for feature point position within cell
          const rng = new SeededRandom(hash3D(nx, ny, nz + this.seed));
          const fx = nx + rng.next();
          const fy = ny + rng.next();
          const fz = nz + rng.next();

          const distX = sx - fx;
          const distY = sy - fy;
          const distZ = sz - fz;
          minDist = Math.min(minDist, Math.sqrt(distX * distX + distY * distY + distZ * distZ));
        }
      }
    }

    return minDist;
  }

  // --------------------------------------------------------------------------
  // Layered / Composite Noise
  // --------------------------------------------------------------------------

  /**
   * Fractional Brownian Motion (FBM).
   * Layers multiple octaves of the chosen base noise type.
   * @returns Normalized value in approximately [-1, 1]
   */
  fbm(
    x: number,
    y: number,
    z: number,
    options: {
      octaves?: number;
      lacunarity?: number;
      gain?: number;    // aka persistence
      scale?: number;
      noiseType?: NoiseType;
    } = {}
  ): number {
    const {
      octaves = 6,
      lacunarity = 2.0,
      gain = 0.5,
      scale = 1.0,
      noiseType = NoiseType.Perlin,
    } = options;

    const baseNoise = this.getBaseNoiseFn3D(noiseType);

    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * baseNoise(x * frequency, y * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  /**
   * Ridged Multifractal noise.
   * Creates sharp ridges by taking the absolute value of each octave and
   * inverting it, producing mountain-like features.
   * @returns Value in [0, 1]
   */
  ridgedMultifractal(
    x: number,
    y: number,
    z: number,
    options: {
      octaves?: number;
      lacunarity?: number;
      gain?: number;
      roughness?: number;
      offset?: number;
      scale?: number;
      noiseType?: NoiseType;
    } = {}
  ): number {
    const {
      octaves = 6,
      lacunarity = 2.0,
      gain = 0.5,
      roughness = 0.5,
      offset = 1.0,
      scale = 1.0,
      noiseType = NoiseType.Perlin,
    } = options;

    const baseNoise = this.getBaseNoiseFn3D(noiseType);

    let signal = 0;
    let weight = 1.0;
    let frequency = scale;
    let amplitude = 1.0;

    for (let i = 0; i < octaves; i++) {
      let n = baseNoise(x * frequency, y * frequency, z * frequency);
      n = offset - Math.abs(n);
      n *= weight;
      signal += n * amplitude;
      weight = Math.min(Math.max(n * gain, 0), 1.0);
      frequency *= lacunarity;
      amplitude *= gain;
    }

    const maxSignal = 1.0 / (1.0 - gain);
    return Math.max(0, Math.min(1, signal / maxSignal)) * roughness;
  }

  /**
   * Turbulence noise.
   * Sum of absolute values of noise at multiple octaves.
   * Produces a swirling, turbulent pattern.
   * @returns Value in [0, ~1]
   */
  turbulence(
    x: number,
    y: number,
    z: number,
    options: {
      octaves?: number;
      lacunarity?: number;
      gain?: number;
      scale?: number;
      noiseType?: NoiseType;
    } = {}
  ): number {
    const {
      octaves = 6,
      lacunarity = 2.0,
      gain = 0.5,
      scale = 1.0,
      noiseType = NoiseType.Perlin,
    } = options;

    const baseNoise = this.getBaseNoiseFn3D(noiseType);

    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * Math.abs(baseNoise(x * frequency, y * frequency, z * frequency));
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  /**
   * Domain warping — uses one noise field to offset the input of another.
   * Creates organic, flowing patterns reminiscent of marble or wood grain.
   * @returns Warped noise value
   */
  domainWarp(
    x: number,
    y: number,
    z: number,
    options: {
      warpStrength?: number;
      warpScale?: number;
      octaves?: number;
      lacunarity?: number;
      gain?: number;
      scale?: number;
      noiseType?: NoiseType;
    } = {}
  ): number {
    const {
      warpStrength = 1.0,
      warpScale = 4.0,
      octaves = 6,
      lacunarity = 2.0,
      gain = 0.5,
      scale = 1.0,
      noiseType = NoiseType.Perlin,
    } = options;

    const baseNoise = this.getBaseNoiseFn3D(noiseType);

    // First warp pass: offset coordinates using noise
    const qx = baseNoise(x * scale, y * scale, z * scale);
    const qy = baseNoise(x * scale + 5.2, y * scale + 1.3, z * scale + 2.8);
    const qz = baseNoise(x * scale + 9.1, y * scale + 3.7, z * scale + 7.4);

    // Second warp pass for more organic distortion
    const rx = baseNoise(
      (x * scale + warpStrength * qx) * warpScale,
      (y * scale + warpStrength * qy) * warpScale,
      (z * scale + warpStrength * qz) * warpScale
    );
    const ry = baseNoise(
      (x * scale + warpStrength * qx + 1.7) * warpScale,
      (y * scale + warpStrength * qy + 9.2) * warpScale,
      (z * scale + warpStrength * qz + 3.4) * warpScale
    );
    const rz = baseNoise(
      (x * scale + warpStrength * qx + 8.3) * warpScale,
      (y * scale + warpStrength * qy + 2.8) * warpScale,
      (z * scale + warpStrength * qz + 5.1) * warpScale
    );

    // Final FBM using warped coordinates
    return this.fbm(
      x + warpStrength * rx,
      y + warpStrength * ry,
      z + warpStrength * rz,
      { octaves, lacunarity, gain, scale, noiseType }
    );
  }

  // --------------------------------------------------------------------------
  // Convenience / Generic
  // --------------------------------------------------------------------------

  /**
   * Evaluate noise using the specified type.
   * For 3D coordinates with optional scale.
   */
  evaluate(
    x: number,
    y: number,
    z: number,
    scale: number = 1.0,
    noiseType: NoiseType = NoiseType.Perlin
  ): number {
    const fn = this.getBaseNoiseFn3D(noiseType);
    return fn(x * scale, y * scale, z * scale);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /** Get the base 3D noise function for the given type. */
  private getBaseNoiseFn3D(type: NoiseType): (x: number, y: number, z: number) => number {
    switch (type) {
      case NoiseType.Simplex:
        return (x, y, z) => this.simplex3D(x, y, z);
      case NoiseType.Voronoi:
        return (x, y, z) => this.voronoi3D(x, y, z);
      case NoiseType.Perlin:
      default:
        return (x, y, z) => this.perlin3D(x, y, z);
    }
  }
}

// ============================================================================
// Default Global Instance (deterministic — seed 0)
// ============================================================================

/**
 * Default global SeededNoiseGenerator instance with seed 0.
 * Deterministic: always produces the same output for the same inputs.
 * For reproducible results across your application, prefer creating your
 * own SeededNoiseGenerator with an explicit seed.
 */
export const defaultNoiseGenerator = new SeededNoiseGenerator(0);

// ============================================================================
// Standalone Convenience Functions (delegating to default generator)
// ============================================================================

/**
 * 3D Perlin noise using the default generator (seed 0).
 * @deprecated Prefer creating a SeededNoiseGenerator with your own seed.
 */
export function perlin3D(x: number, y: number, z: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.perlin3D(x * scale, y * scale, z * scale);
}

/**
 * 2D Perlin noise using the default generator (seed 0).
 * @deprecated Prefer creating a SeededNoiseGenerator with your own seed.
 */
export function perlin2D(x: number, y: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.perlin2D(x * scale, y * scale);
}

/**
 * 3D Simplex noise using the default generator (seed 0).
 */
export function simplex3D(x: number, y: number, z: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.simplex3D(x * scale, y * scale, z * scale);
}

/**
 * 2D Simplex noise using the default generator (seed 0).
 */
export function simplex2D(x: number, y: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.simplex2D(x * scale, y * scale);
}

/**
 * 2D Voronoi noise using the default generator (seed 0).
 */
export function voronoi2D(x: number, y: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.voronoi2D(x, y, scale);
}

/**
 * 3D Voronoi noise using the default generator (seed 0).
 */
export function voronoi3D(x: number, y: number, z: number, scale: number = 1.0): number {
  return defaultNoiseGenerator.voronoi3D(x, y, z, scale);
}

/**
 * FBM using the default generator (seed 0).
 */
export function fbm(
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  persistence: number = 0.5,
  scale: number = 1.0
): number {
  return defaultNoiseGenerator.fbm(x, y, z, { octaves, lacunarity, gain: persistence, scale });
}

/**
 * Ridged multifractal using the default generator (seed 0).
 */
export function ridgedMultifractal(
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  gain: number = 0.5,
  roughness: number = 0.5
): number {
  return defaultNoiseGenerator.ridgedMultifractal(x, y, z, { octaves, lacunarity, gain, roughness });
}

/**
 * Turbulence using the default generator (seed 0).
 */
export function turbulence(
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  gain: number = 0.5,
  scale: number = 1.0
): number {
  return defaultNoiseGenerator.turbulence(x, y, z, { octaves, lacunarity, gain, scale });
}

/**
 * Domain warping using the default generator (seed 0).
 */
export function domainWarp(
  x: number,
  y: number,
  z: number,
  warpStrength: number = 1.0,
  warpScale: number = 4.0
): number {
  return defaultNoiseGenerator.domainWarp(x, y, z, { warpStrength, warpScale });
}

// ============================================================================
// Legacy Noise3D Class (backward compatibility)
// ============================================================================

/**
 * @deprecated Use SeededNoiseGenerator instead.
 * Legacy wrapper class for backward compatibility.
 * Now deterministic — does NOT use Math.random().
 */
export class Noise3D {
  private generator: SeededNoiseGenerator;

  constructor(seed: number = 0) {
    this.generator = new SeededNoiseGenerator(seed);
  }

  perlin(x: number, y: number, z: number): number {
    return this.generator.perlin3D(x, y, z);
  }

  evaluate(x: number, y: number, z: number): number {
    return this.perlin(x, y, z);
  }

  setSeed(seed: number): void {
    this.generator = new SeededNoiseGenerator(seed);
  }
}

/**
 * Noise function type signature
 */
export type NoiseFunction = (x: number, y: number, z: number, scale?: number) => number;

// ============================================================================
// NoiseUtils — Unified convenience class (consolidated from duplicates)
// ============================================================================

/**
 * NoiseUtils class for procedural noise generation.
 * Compatible with original InfiniGen Python API.
 * Wraps SeededNoiseGenerator for a simpler, unified interface.
 *
 * Provides both instance and static methods for 2D/3D Perlin noise,
 * FBM, octave noise, and coordinate-seeded random values.
 */
export class NoiseUtils {
  private seed: number;
  private generator: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.generator = new SeededNoiseGenerator(seed);
  }

  /**
   * Evaluate Perlin noise at given coordinates
   */
  perlin(x: number, y: number, z: number = 0): number {
    return this.generator.perlin3D(x, y, z);
  }

  /**
   * Alias for perlin - evaluate noise at coordinates
   */
  evaluate(x: number, y: number, z: number = 0): number {
    return this.generator.perlin3D(x, y, z);
  }

  /**
   * 2D Perlin noise
   */
  perlin2D(x: number, y: number): number {
    return this.generator.perlin2D(x, y);
  }

  /**
   * 3D Perlin noise
   */
  perlin3D(x: number, y: number, z: number): number {
    return this.generator.perlin3D(x, y, z);
  }

  /**
   * Set the seed for noise generation
   */
  setSeed(seed: number): void {
    this.seed = seed;
    this.generator = new SeededNoiseGenerator(seed);
  }

  /**
   * Get the current seed
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Generate noise value with octaves (fractal Brownian motion)
   */
  fbm(x: number, y: number, z: number = 0, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.generator.perlin3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  /**
   * Generate multi-octave noise for more natural patterns (2D)
   */
  octaveNoise(
    x: number,
    y: number,
    octaves: number = 4,
    persistence: number = 0.5,
    lacunarity: number = 2.0
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.generator.perlin2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }

  /**
   * Generate random value seeded by coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Random value in range [0, 1]
   */
  seededRandom(x: number, y: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Clamp value between min and max
   */
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Remap value from one range to another
   */
  remap(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
  ): number {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  /**
   * Static method for 2D Perlin noise without instantiation
   */
  static perlin2D(x: number, y: number, _octaves?: number): number {
    return _defaultNoiseUtils.perlin2D(x, y);
  }

  /**
   * Static method for 3D Perlin noise without instantiation
   */
  static perlin3D(x: number, y: number, z: number, _octaves?: number): number {
    return _defaultNoiseUtils.perlin3D(x, y, z);
  }
}

/** Internal default NoiseUtils instance for static methods */
const _defaultNoiseUtils = new NoiseUtils();

// ============================================================================
// Additional convenience functions (consolidated from terrain/utils/NoiseUtils)
// ============================================================================

/**
 * Sample noise at given coordinates using the default generator.
 */
export function sampleNoise(x: number, y: number, z: number = 0): number {
  return defaultNoiseGenerator.perlin3D(x, y, z);
}

/**
 * Standalone octave noise function using the default generator (seed 0).
 * 2D multi-octave Perlin noise.
 */
export function octaveNoise(
  x: number,
  y: number,
  octaves: number = 4,
  persistence: number = 0.5,
  lacunarity: number = 2.0
): number {
  return _defaultNoiseUtils.octaveNoise(x, y, octaves, persistence, lacunarity);
}

/**
 * Standalone seeded random function using a deterministic hash.
 * @returns Random value in range [0, 1]
 */
export function seededRandom(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Generate a 2D noise map (Float32Array) of the given dimensions.
 */
export function generateNoiseMap(
  width: number,
  height: number,
  scale: number = 1.0,
  octaves: number = 4
): Float32Array {
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;

      for (let i = 0; i < octaves; i++) {
        value += defaultNoiseGenerator.perlin3D(
          (x / width) * scale * frequency,
          (y / height) * scale * frequency,
          0
        ) * amplitude;
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      map[y * width + x] = value / maxValue;
    }
  }
  return map;
}

// Re-export seeded noise functions from MathUtils for convenience
export {
  seededNoise2D,
  seededNoise3D,
  seededVoronoi2D,
  seededFbm,
  seededRidgedMultifractal,
} from '../MathUtils';

// Re-export legacy functions for backward compatibility
export { noise3D, noise2D } from '../MathUtils';
