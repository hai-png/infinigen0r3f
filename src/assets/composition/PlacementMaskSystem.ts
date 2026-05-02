/**
 * Placement Mask System for Infinigen R3F
 *
 * Generates placement masks for scatter systems:
 * - Noise-based, Normal-based, Altitude-based, Slope-based
 * - Tag-based, Distance-from-feature
 * - Combine masks with AND/OR/NOT operations
 * - Support both binary (0/1) and scalar (0.0-1.0) masks
 * - Generate Float32Array mask maps for GPU-based placement
 */

import { Vector3, Vector2, MathUtils } from 'three';

// ---------------------------------------------------------------------------
// Mask types
// ---------------------------------------------------------------------------

export type MaskMode = 'binary' | 'scalar';

export type MaskCombinOp = 'and' | 'or' | 'not' | 'multiply' | 'min' | 'max';

export type TerrainTag = 'landscape' | 'cave' | 'underwater' | 'beach' | 'forest' | 'mountain' | 'plains';

export interface NoiseMaskParams {
  type: 'noise';
  /** Perlin noise scale */
  scale: number;
  /** Noise threshold (values above are 1.0 in binary mode) */
  threshold: number;
  /** Number of octaves */
  octaves: number;
  /** Persistence per octave */
  persistence: number;
  /** Seed for noise */
  seed: number;
}

export interface NormalMaskParams {
  type: 'normal';
  /** Minimum Y component of surface normal (0=any, 1=perfectly up) */
  minUp: number;
  /** Maximum Y component of surface normal (for steep surfaces) */
  maxUp: number;
  /** Invert: true means select surfaces NOT facing up (e.g., cliff faces for rocks) */
  invert: boolean;
}

export interface AltitudeMaskParams {
  type: 'altitude';
  /** Minimum height (0-1 range, normalized terrain height) */
  minAltitude: number;
  /** Maximum height (0-1 range) */
  maxAltitude: number;
  /** Softness of altitude edges (0 = hard, 1 = gradual over entire range) */
  softness: number;
}

export interface SlopeMaskParams {
  type: 'slope';
  /** Minimum slope (0=flat, 1=vertical) */
  minSlope: number;
  /** Maximum slope */
  maxSlope: number;
  /** Softness of slope edges */
  softness: number;
}

export interface TagMaskParams {
  type: 'tag';
  /** Tags to include (any match = 1) */
  includeTags: TerrainTag[];
  /** Tags to exclude (any match = 0) */
  excludeTags: TerrainTag[];
}

export interface DistanceFromFeatureParams {
  type: 'distance';
  /** Feature positions (rivers, lakes, paths) */
  featurePositions: Vector3[];
  /** Inner radius (within = full density) */
  innerRadius: number;
  /** Outer radius (beyond = zero density) */
  outerRadius: number;
  /** Falloff curve */
  falloff: 'linear' | 'exponential' | 'quadratic';
}

export type MaskParams =
  | NoiseMaskParams
  | NormalMaskParams
  | AltitudeMaskParams
  | SlopeMaskParams
  | TagMaskParams
  | DistanceFromFeatureParams;

export interface PlacementMask {
  name: string;
  resolution: number;
  width: number;
  height: number;
  mode: MaskMode;
  data: Float32Array;
  params: MaskParams;
}

export interface TerrainDataInput {
  heightData: Float32Array;
  normalData?: Float32Array; // (x,y,z) per pixel
  slopeData?: Float32Array;
  tagData?: Uint8Array; // Tag index per pixel
  width: number;
  height: number;
  worldSize: number;
  heightScale: number;
  seaLevel: number;
}

// ---------------------------------------------------------------------------
// Simple Perlin noise (for noise masks)
// ---------------------------------------------------------------------------

class PerlinNoise2D {
  private perm: number[];

  constructor(seed: number = 42) {
    this.perm = [];
    const rng = new SeededRNG(seed);
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    this.perm = [...this.perm, ...this.perm];
  }

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(t: number, a: number, b: number): number { return a + t * (b - a); }
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.perm[X] + Y;
    const B = this.perm[X + 1] + Y;
    return this.lerp(
      v,
      this.lerp(u, this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y)),
      this.lerp(u, this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1)),
    );
  }

  octave(x: number, y: number, octaves: number, persistence: number): number {
    let total = 0, frequency = 1, amplitude = 1, maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxVal += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return total / maxVal;
  }
}

class SeededRNG {
  private s: number;
  constructor(seed: number) { this.s = seed; }
  next(): number { const x = Math.sin(this.s++) * 10000; return x - Math.floor(x); }
}

// ---------------------------------------------------------------------------
// PlacementMaskSystem
// ---------------------------------------------------------------------------

export class PlacementMaskSystem {
  private terrain: TerrainDataInput;
  private noiseGen: PerlinNoise2D;
  private masks: Map<string, PlacementMask> = new Map();

  constructor(terrain: TerrainDataInput) {
    this.terrain = terrain;
    this.noiseGen = new PerlinNoise2D(42);
  }

  // -----------------------------------------------------------------------
  // Mask generation
  // -----------------------------------------------------------------------

  /**
   * Generate a placement mask from the given parameters
   */
  generateMask(name: string, params: MaskParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    const data = new Float32Array(resolution * resolution);
    const { width: tw, height: th } = this.terrain;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        // Map mask pixel to terrain pixel
        const tx = Math.floor(x / resolution * tw);
        const ty = Math.floor(y / resolution * th);
        const tIdx = Math.min(ty, th - 1) * tw + Math.min(tx, tw - 1);

        let value = this.evaluateMaskAt(params, tx, ty, tIdx, x, y, resolution);

        if (mode === 'binary') {
          value = value >= 0.5 ? 1.0 : 0.0;
        }

        data[y * resolution + x] = MathUtils.clamp(value, 0, 1);
      }
    }

    const mask: PlacementMask = {
      name,
      resolution,
      width: resolution,
      height: resolution,
      mode,
      data,
      params,
    };

    this.masks.set(name, mask);
    return mask;
  }

  /**
   * Generate noise-based mask
   */
  generateNoiseMask(name: string, params: NoiseMaskParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  /**
   * Generate normal-based mask
   */
  generateNormalMask(name: string, params: NormalMaskParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  /**
   * Generate altitude-based mask
   */
  generateAltitudeMask(name: string, params: AltitudeMaskParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  /**
   * Generate slope-based mask
   */
  generateSlopeMask(name: string, params: SlopeMaskParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  /**
   * Generate tag-based mask
   */
  generateTagMask(name: string, params: TagMaskParams, resolution: number = 128, mode: MaskMode = 'binary'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  /**
   * Generate distance-from-feature mask
   */
  generateDistanceMask(name: string, params: DistanceFromFeatureParams, resolution: number = 128, mode: MaskMode = 'scalar'): PlacementMask {
    return this.generateMask(name, params, resolution, mode);
  }

  // -----------------------------------------------------------------------
  // Mask combination
  // -----------------------------------------------------------------------

  /**
   * Combine two masks with an operation
   */
  combineMasks(
    name: string,
    maskA: PlacementMask,
    maskB: PlacementMask,
    op: MaskCombinOp,
    mode: MaskMode = 'scalar',
  ): PlacementMask {
    const res = maskA.resolution;
    const data = new Float32Array(res * res);

    for (let i = 0; i < res * res; i++) {
      const a = maskA.data[i] ?? 0;
      const b = maskB.data[i] ?? 0;

      let value: number;
      switch (op) {
        case 'and':
          value = Math.min(a, b);
          break;
        case 'or':
          value = Math.max(a, b);
          break;
        case 'not':
          value = a * (1 - b);
          break;
        case 'multiply':
          value = a * b;
          break;
        case 'min':
          value = Math.min(a, b);
          break;
        case 'max':
          value = Math.max(a, b);
          break;
        default:
          value = a;
      }

      if (mode === 'binary') {
        value = value >= 0.5 ? 1.0 : 0.0;
      }

      data[i] = MathUtils.clamp(value, 0, 1);
    }

    const result: PlacementMask = {
      name,
      resolution: res,
      width: res,
      height: res,
      mode,
      data,
      params: maskA.params, // Keep first mask's params as reference
    };

    this.masks.set(name, result);
    return result;
  }

  /**
   * Invert a mask
   */
  invertMask(name: string, source: PlacementMask, mode: MaskMode = 'scalar'): PlacementMask {
    const res = source.resolution;
    const data = new Float32Array(res * res);

    for (let i = 0; i < res * res; i++) {
      let value = 1.0 - (source.data[i] ?? 0);
      if (mode === 'binary') value = value >= 0.5 ? 1.0 : 0.0;
      data[i] = value;
    }

    const result: PlacementMask = {
      name,
      resolution: res,
      width: res,
      height: res,
      mode,
      data,
      params: source.params,
    };

    this.masks.set(name, result);
    return result;
  }

  /**
   * Threshold a mask
   */
  thresholdMask(name: string, source: PlacementMask, threshold: number, mode: MaskMode = 'binary'): PlacementMask {
    const res = source.resolution;
    const data = new Float32Array(res * res);

    for (let i = 0; i < res * res; i++) {
      let value = source.data[i] ?? 0;
      if (mode === 'binary' || threshold > 0) {
        value = value >= threshold ? 1.0 : 0.0;
      }
      data[i] = value;
    }

    const result: PlacementMask = {
      name,
      resolution: res,
      width: res,
      height: res,
      mode,
      data,
      params: source.params,
    };

    this.masks.set(name, result);
    return result;
  }

  /**
   * Chain combine multiple masks with same operation
   */
  chainCombine(name: string, masks: PlacementMask[], op: MaskCombinOp, mode: MaskMode = 'scalar'): PlacementMask {
    if (masks.length === 0) {
      throw new Error('Need at least one mask to combine');
    }
    if (masks.length === 1) {
      return masks[0];
    }

    let result = masks[0];
    for (let i = 1; i < masks.length; i++) {
      result = this.combineMasks(`_chain_${i}`, result, masks[i], op, mode);
    }

    // Rename final result
    result.name = name;
    this.masks.set(name, result);
    return result;
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Get a stored mask by name
   */
  getMask(name: string): PlacementMask | undefined {
    return this.masks.get(name);
  }

  /**
   * Get all stored masks
   */
  getAllMasks(): Map<string, PlacementMask> {
    return this.masks;
  }

  /**
   * Sample a mask at a world position
   */
  sampleMaskAtWorldPos(mask: PlacementMask, worldPos: Vector3, worldSize: number): number {
    const u = (worldPos.x / worldSize + 0.5);
    const v = (worldPos.z / worldSize + 0.5);

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const px = Math.floor(u * (mask.resolution - 1));
    const py = Math.floor(v * (mask.resolution - 1));

    return mask.data[py * mask.resolution + px] ?? 0;
  }

  /**
   * Generate a combined "vegetation placement" mask
   * Uses altitude, slope, noise and tags for a complete vegetation suitability map
   */
  generateVegetationMask(
    name: string,
    opts: {
      minAltitude?: number;
      maxAltitude?: number;
      maxSlope?: number;
      noiseScale?: number;
      noiseThreshold?: number;
      noiseSeed?: number;
      includeTags?: TerrainTag[];
      excludeTags?: TerrainTag[];
    } = {},
    resolution: number = 128,
  ): PlacementMask {
    const masks: PlacementMask[] = [];

    // Altitude mask
    const altMask = this.generateAltitudeMask(`${name}_alt`, {
      type: 'altitude',
      minAltitude: opts.minAltitude ?? 0.3,
      maxAltitude: opts.maxAltitude ?? 0.8,
      softness: 0.1,
    }, resolution);
    masks.push(altMask);

    // Slope mask (vegetation avoids steep slopes)
    const slopeMask = this.generateSlopeMask(`${name}_slope`, {
      type: 'slope',
      minSlope: 0,
      maxSlope: opts.maxSlope ?? 0.4,
      softness: 0.1,
    }, resolution);
    masks.push(slopeMask);

    // Noise mask for organic distribution
    const noiseMask = this.generateNoiseMask(`${name}_noise`, {
      type: 'noise',
      scale: opts.noiseScale ?? 3,
      threshold: opts.noiseThreshold ?? 0.3,
      octaves: 4,
      persistence: 0.5,
      seed: opts.noiseSeed ?? 42,
    }, resolution);
    masks.push(noiseMask);

    // Tag mask
    if (opts.includeTags || opts.excludeTags) {
      const tagMask = this.generateTagMask(`${name}_tag`, {
        type: 'tag',
        includeTags: opts.includeTags ?? ['landscape', 'forest', 'plains'],
        excludeTags: opts.excludeTags ?? ['underwater'],
      }, resolution);
      masks.push(tagMask);
    }

    // Combine all masks with AND (multiply)
    return this.chainCombine(name, masks, 'and', 'scalar');
  }

  // -----------------------------------------------------------------------
  // Internal evaluation
  // -----------------------------------------------------------------------

  private evaluateMaskAt(
    params: MaskParams,
    _tx: number,
    _ty: number,
    tIdx: number,
    mx: number,
    my: number,
    _res: number,
  ): number {
    switch (params.type) {
      case 'noise': {
        const p = params as NoiseMaskParams;
        this.noiseGen = new PerlinNoise2D(p.seed);
        const nx = mx / _res * p.scale;
        const ny = my / _res * p.scale;
        const raw = this.noiseGen.octave(nx, ny, p.octaves, p.persistence);
        // Normalize from [-1,1] to [0,1]
        const normalized = (raw + 1) * 0.5;
        return normalized >= p.threshold ? normalized : normalized * 0.5;
      }

      case 'normal': {
        const p = params as NormalMaskParams;
        if (!this.terrain.normalData) return 1;
        const ni = tIdx * 3;
        const ny2 = this.terrain.normalData[ni + 1] ?? 1; // Y component of normal
        let value: number;
        if (p.invert) {
          // Select steep surfaces (low Y normal)
          value = 1 - MathUtils.clamp((ny2 - p.minUp) / Math.max(0.01, p.maxUp - p.minUp), 0, 1);
        } else {
          // Select flat surfaces (high Y normal)
          value = MathUtils.clamp((ny2 - p.minUp) / Math.max(0.01, p.maxUp - p.minUp), 0, 1);
        }
        return value;
      }

      case 'altitude': {
        const p = params as AltitudeMaskParams;
        const h = this.terrain.heightData[tIdx] ?? 0;
        const normalizedH = h; // Already 0-1
        if (normalizedH < p.minAltitude || normalizedH > p.maxAltitude) {
          if (p.softness > 0) {
            const distBelow = p.minAltitude - normalizedH;
            const distAbove = normalizedH - p.maxAltitude;
            const softRange = p.softness * (p.maxAltitude - p.minAltitude);
            if (distBelow > 0 && distBelow < softRange) return 1 - distBelow / softRange;
            if (distAbove > 0 && distAbove < softRange) return 1 - distAbove / softRange;
          }
          return 0;
        }
        return 1;
      }

      case 'slope': {
        const p = params as SlopeMaskParams;
        if (!this.terrain.slopeData) return 1;
        const slope = this.terrain.slopeData[tIdx] ?? 0;
        if (slope < p.minSlope || slope > p.maxSlope) {
          if (p.softness > 0) {
            const distBelow = p.minSlope - slope;
            const distAbove = slope - p.maxSlope;
            const softRange = p.softness * (p.maxSlope - p.minSlope);
            if (distBelow > 0 && distBelow < softRange) return 1 - distBelow / softRange;
            if (distAbove > 0 && distAbove < softRange) return 1 - distAbove / softRange;
          }
          return 0;
        }
        return 1;
      }

      case 'tag': {
        const p = params as TagMaskParams;
        if (!this.terrain.tagData) return 1;
        const tagIdx = this.terrain.tagData[tIdx] ?? 0;
        const tagNames: TerrainTag[] = ['landscape', 'cave', 'underwater', 'beach', 'forest', 'mountain', 'plains'];
        const tag = tagNames[tagIdx] ?? 'landscape';

        if (p.excludeTags.includes(tag)) return 0;
        if (p.includeTags.length === 0 || p.includeTags.includes(tag)) return 1;
        return 0;
      }

      case 'distance': {
        const p = params as DistanceFromFeatureParams;
        // Map terrain pixel to world position
        const worldX = (_tx / this.terrain.width - 0.5) * this.terrain.worldSize;
        const worldZ = (_ty / this.terrain.height - 0.5) * this.terrain.worldSize;
        const pos = new Vector2(worldX, worldZ);

        let minDist = Infinity;
        for (const fp of p.featurePositions) {
          const d = pos.distanceTo(new Vector2(fp.x, fp.z));
          minDist = Math.min(minDist, d);
        }

        if (minDist <= p.innerRadius) return 1.0;
        if (minDist >= p.outerRadius) return 0.0;

        const t = (minDist - p.innerRadius) / Math.max(0.01, p.outerRadius - p.innerRadius);
        switch (p.falloff) {
          case 'linear': return 1 - t;
          case 'exponential': return Math.exp(-3 * t);
          case 'quadratic': return (1 - t) * (1 - t);
          default: return 1 - t;
        }
      }

      default:
        return 1;
    }
  }
}
