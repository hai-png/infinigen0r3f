/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Core Terrain Generator with Multi-Octave Noise, Erosion, and Tectonics
 */

import { Vector2, Vector3 } from 'three';
import { SeededRandom } from '../../core/util/math/index';
import { ErosionSystem } from '../erosion/ErosionSystem';
import type { HeightMap, NormalMap } from '../types';
import { heightMapFromFloat32Array } from '../types';

export type MaskMap = Uint8Array;

export interface TerrainConfig {
  seed: number;
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  elevationOffset: number;
  erosionStrength: number;
  erosionIterations: number;
  tectonicPlates: number;
  seaLevel: number;
}

export interface TerrainData {
  heightMap: HeightMap;
  normalMap: HeightMap;
  slopeMap: HeightMap;
  biomeMask: MaskMap;
  config: TerrainConfig;
  width: number;
  height: number;
}

export class TerrainGenerator {
  private rng: SeededRandom;
  private config: TerrainConfig;
  private width: number;
  private height: number;
  private permutationTable: number[];
  private cachedHeightMap: Float32Array | null = null;

  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = {
      seed: 42,
      width: 512,
      height: 512,
      scale: 100,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      elevationOffset: 0,
      erosionStrength: 0.3,
      erosionIterations: 20,
      tectonicPlates: 4,
      seaLevel: 0.3,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
    this.width = this.config.width;
    this.height = this.config.height;
    this.permutationTable = [];
    this.initPermutationTable();
  }

  /**
   * Generate complete terrain data
   */
  public generate(): TerrainData {
    console.log(`Generating terrain with seed ${this.config.seed}...`);
    
    // 1. Generate base heightmap with noise
    const heightData = this.generateBaseHeightMap();
    
    // 2. Apply tectonic uplift
    this.applyTectonics(heightData);
    
    // 3. Apply erosion via ErosionSystem (consolidated entry point)
    this.applyErosion(heightData);
    
    // 4. Normalize and offset
    this.normalizeHeightMap(heightData);
    
    // 5. Calculate derived maps
    const normalData = this.calculateNormals(heightData);
    const slopeData = this.calculateSlopes(heightData);
    const biomeMask = this.generateBiomeMask(heightData, slopeData);

    // Cache raw heightmap for getHeightAt() lookups
    this.cachedHeightMap = heightData;

    return {
      heightMap: heightMapFromFloat32Array(heightData, this.width, this.height),
      normalMap: heightMapFromFloat32Array(normalData, this.width, this.height),
      slopeMap: heightMapFromFloat32Array(slopeData, this.width, this.height),
      biomeMask,
      config: { ...this.config },
      width: this.width,
      height: this.height,
    };
  }

  /**
   * Generate base heightmap using Fractal Brownian Motion
   */
  private generateBaseHeightMap(): Float32Array {
    const map = new Float32Array(this.width * this.height);
    const amplitude = 1.0;
    const frequency = 1.0 / this.config.scale;
    let maxVal = -Infinity;
    let minVal = Infinity;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let value = 0;
        let amp = amplitude;
        let freq = frequency;

        // Multi-octave noise
        for (let i = 0; i < this.config.octaves; i++) {
          const nx = x * freq;
          const ny = y * freq;
          value += this.perlinNoise(nx, ny) * amp;
          
          maxVal = Math.max(maxVal, value);
          minVal = Math.min(minVal, value);

          amp *= this.config.persistence;
          freq *= this.config.lacunarity;
        }

        map[y * this.width + x] = value;
      }
    }

    // Normalize to 0-1 range
    const range = maxVal - minVal;
    for (let i = 0; i < map.length; i++) {
      map[i] = (map[i] - minVal) / range;
    }

    return map;
  }

  /**
   * Apply tectonic plate simulation for mountain ranges
   */
  private applyTectonics(heightMap: Float32Array): void {
    if (this.config.tectonicPlates <= 0) return;

    // Generate plate centers
    const plates: { x: number; y: number; height: number; radius: number }[] = [];
    for (let i = 0; i < this.config.tectonicPlates; i++) {
      plates.push({
        x: this.rng.next() * this.width,
        y: this.rng.next() * this.height,
        height: 0.5 + this.rng.next() * 0.5,
        radius: (Math.min(this.width, this.height) / 3) * (0.5 + this.rng.next()),
      });
    }

    // Apply plate influence
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let uplift = 0;
        
        for (const plate of plates) {
          const dx = x - plate.x;
          const dy = y - plate.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < plate.radius) {
            const falloff = 1 - (dist / plate.radius);
            uplift += plate.height * falloff * falloff; // Quadratic falloff
          }
        }

        const idx = y * this.width + x;
        heightMap[idx] = Math.min(1.0, heightMap[idx] + uplift * 0.5);
      }
    }
  }

  /**
   * Apply erosion using the consolidated ErosionSystem
   *
   * Previously this method had inline hydraulic erosion code that duplicated
   * the logic in ErosionEnhanced.ts. Now it delegates to ErosionSystem which
   * is the single entry point for all erosion types.
   */
  private applyErosion(heightMap: Float32Array): void {
    const erosionSystem = new ErosionSystem(
      heightMap,
      this.width,
      this.height,
      {
        hydraulicErosionEnabled: this.config.erosionStrength > 0,
        thermalErosionEnabled: true,
        hydraulicIterations: this.config.erosionIterations,
        erodeSpeed: this.config.erosionStrength,
        depositSpeed: 0.3,
        seed: this.config.seed,
      }
    );

    erosionSystem.simulate();

    // Clamp values
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = Math.max(0, Math.min(1, heightMap[i]));
    }
  }

  /**
   * Normalize heightmap to 0-1 range with optional offset
   */
  private normalizeHeightMap(heightMap: Float32Array): void {
    let max = -Infinity;
    let min = Infinity;

    for (let i = 0; i < heightMap.length; i++) {
      max = Math.max(max, heightMap[i]);
      min = Math.min(min, heightMap[i]);
    }

    const range = max - min;
    for (let i = 0; i < heightMap.length; i++) {
      heightMap[i] = ((heightMap[i] - min) / range) + this.config.elevationOffset;
      heightMap[i] = Math.max(0, Math.min(1, heightMap[i]));
    }
  }

  /**
   * Calculate normal vectors for lighting
   */
  private calculateNormals(heightMap: Float32Array): Float32Array {
    const normals = new Float32Array(this.width * this.height * 3);
    const scale = 1.0 / this.config.scale;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const left = x > 0 ? heightMap[y * this.width + (x - 1)] : heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : heightMap[y * this.width + x];
        const top = y > 0 ? heightMap[(y - 1) * this.width + x] : heightMap[y * this.width + x];
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : heightMap[y * this.width + x];

        const dx = (right - left) * scale;
        const dy = (bottom - top) * scale;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        const idx = (y * this.width + x) * 3;
        normals[idx] = -dx / len;     // X
        normals[idx + 1] = -dy / len; // Y
        normals[idx + 2] = dz / len;  // Z
      }
    }

    return normals;
  }

  /**
   * Calculate slope values for biome determination
   */
  private calculateSlopes(heightMap: Float32Array): Float32Array {
    const slopes = new Float32Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const center = heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : center;
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : center;

        const dx = right - center;
        const dy = bottom - center;
        slopes[y * this.width + x] = Math.sqrt(dx * dx + dy * dy);
      }
    }

    // Normalize slopes
    let maxSlope = 0;
    for (let i = 0; i < slopes.length; i++) {
      maxSlope = Math.max(maxSlope, slopes[i]);
    }

    if (maxSlope > 0) {
      for (let i = 0; i < slopes.length; i++) {
        slopes[i] /= maxSlope;
      }
    }

    return slopes;
  }

  /**
   * Generate biome mask based on height and slope
   */
  private generateBiomeMask(heightMap: Float32Array, slopeMap: Float32Array): MaskMap {
    const mask = new Uint8Array(this.width * this.height);

    for (let i = 0; i < heightMap.length; i++) {
      const h = heightMap[i];
      const s = slopeMap[i];

      let biome = 0; // Deep water

      if (h < this.config.seaLevel - 0.1) biome = 0;      // Deep water
      else if (h < this.config.seaLevel) biome = 1;       // Shore
      else if (h < this.config.seaLevel + 0.1 && s < 0.1) biome = 2; // Beach
      else if (h < 0.4 && s < 0.2) biome = 3;             // Plains
      else if (h < 0.4 && s >= 0.2) biome = 4;            // Hills
      else if (h < 0.7 && s < 0.3) biome = 5;             // Forest
      else if (h < 0.7 && s >= 0.3) biome = 6;            // Mountain Forest
      else if (h < 0.85) biome = 7;                       // Mountain
      else biome = 8;                                     // Snow Peak

      mask[i] = biome;
    }

    return mask;
  }

  /**
   * Perlin noise implementation
   */
  private perlinNoise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.permutationTable[X] + Y;
    const B = this.permutationTable[X + 1] + Y;

    return this.lerp(
      v,
      this.lerp(u, this.grad(this.permutationTable[A], x, y), this.grad(this.permutationTable[B], x - 1, y)),
      this.lerp(u, this.grad(this.permutationTable[A + 1], x, y - 1), this.grad(this.permutationTable[B + 1], x - 1, y - 1))
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Initialize permutation table for noise
   */
  private initPermutationTable(): void {
    this.permutationTable = new Array(512);
    const perm = new Array(256);
    
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }

    // Shuffle based on seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.permutationTable[i] = perm[i & 255];
    }
  }

  /**
   * Reseed the generator
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
    this.initPermutationTable();
  }

  /**
   * Get height at specific coordinates
   */
  public getHeightAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    
    if (xi < 0 || xi >= this.width - 1 || yi < 0 || yi >= this.height - 1) {
      return 0;
    }

    if (!this.cachedHeightMap) {
      return 0;
    }

    const xf = x - xi;
    const yf = y - yi;

    const idx00 = yi * this.width + xi;
    const idx10 = yi * this.width + (xi + 1);
    const idx01 = (yi + 1) * this.width + xi;
    const idx11 = (yi + 1) * this.width + (xi + 1);

    // Bilinear interpolation
    const h00 = this.cachedHeightMap[idx00];
    const h10 = this.cachedHeightMap[idx10];
    const h01 = this.cachedHeightMap[idx01];
    const h11 = this.cachedHeightMap[idx11];

    return h00 * (1 - xf) * (1 - yf) +
           h10 * xf * (1 - yf) +
           h01 * (1 - xf) * yf +
           h11 * xf * yf;
  }
}
