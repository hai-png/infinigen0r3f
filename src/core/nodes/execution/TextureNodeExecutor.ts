/**
 * TextureNodeExecutor - Evaluates texture nodes to produce actual DataTexture outputs
 *
 * Supported texture types:
 * - Noise texture (Perlin, Simplex, Voronoi) → DataTexture with noise values
 * - Gradient texture (linear, radial, spherical) → DataTexture with gradient
 * - ColorRamp → lookup table DataTexture
 * - Brick/Checker/Voronoi pattern → procedural pattern DataTexture
 *
 * Canvas-based generation for complex textures (using createCanvas())
 * Configurable resolution (default 512x512)
 * Caching based on input parameters
 */

import * as THREE from 'three';
import { createCanvas, isDOMAvailable } from '../../../assets/utils/CanvasUtils';
import { seededNoise3D, seededNoise2D, seededVoronoi2D, seededFbm, seededRidgedMultifractal } from '../../util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export type NoiseType = 'perlin' | 'simplex' | 'voronoi' | 'musgrave' | 'ridged';
export type GradientType = 'linear' | 'quadratic' | 'diagonal' | 'spherical' | 'radial' | 'easing';
export type PatternType = 'brick' | 'checker' | 'voronoi' | 'wave';

export interface TextureExecParams {
  /** Resolution of the output texture (default 512) */
  resolution?: number;
  /** Seed for deterministic generation (default 0) */
  seed?: number;
  /** Scale of the noise/pattern (default 5.0) */
  scale?: number;
  /** Number of octaves for FBM (default 4) */
  octaves?: number;
  /** Lacunarity for FBM (default 2.0) */
  lacunarity?: number;
  /** Gain/persistence for FBM (default 0.5) */
  gain?: number;
  /** Roughness for noise (default 0.5) */
  roughness?: number;
  /** Distortion amount (default 0.0) */
  distortion?: number;
  /** Color A for patterns (default white) */
  colorA?: THREE.Color;
  /** Color B for patterns (default black) */
  colorB?: THREE.Color;
  /** Musgrave type */
  musgraveType?: 'fbm' | 'multifractal' | 'ridged_multifractal' | 'hybrid_multifractal' | 'hetero_terrain';
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  texture: THREE.DataTexture;
  paramsKey: string;
}

const textureCache: Map<string, CacheEntry> = new Map();

function getCacheKey(type: string, params: TextureExecParams): string {
  const parts = [
    type,
    String(params.resolution ?? 512),
    String(params.seed ?? 0),
    String(params.scale ?? 5.0),
    String(params.octaves ?? 4),
    String(params.lacunarity ?? 2.0),
    String(params.gain ?? 0.5),
    String(params.roughness ?? 0.5),
    String(params.distortion ?? 0.0),
    params.colorA ? params.colorA.getHexString() : 'ffffff',
    params.colorB ? params.colorB.getHexString() : '000000',
    params.musgraveType ?? 'fbm',
  ];
  return parts.join('|');
}

// ============================================================================
// TextureNodeExecutor
// ============================================================================

export class TextureNodeExecutor {
  private defaultResolution: number;

  constructor(defaultResolution: number = 512) {
    this.defaultResolution = defaultResolution;
  }

  /**
   * Generate a noise texture DataTexture
   */
  generateNoiseTexture(noiseType: NoiseType, params: TextureExecParams = {}): THREE.DataTexture {
    const cacheKey = getCacheKey(`noise_${noiseType}`, params);
    const cached = textureCache.get(cacheKey);
    if (cached) return cached.texture;

    const resolution = params.resolution ?? this.defaultResolution;
    const seed = params.seed ?? 0;
    const scale = params.scale ?? 5.0;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const nx = x / resolution;
        const ny = y / resolution;

        let value: number;

        switch (noiseType) {
          case 'perlin':
            value = seededNoise3D(nx * scale, ny * scale, 0, 1.0, seed);
            value = (value + 1) / 2; // Normalize to [0,1]
            break;

          case 'voronoi':
            value = seededVoronoi2D(nx, ny, scale, seed);
            value = Math.min(1, value);
            break;

          case 'musgrave':
            value = seededFbm(
              nx * scale, ny * scale, 0,
              params.octaves ?? 4,
              params.lacunarity ?? 2.0,
              params.gain ?? 0.5,
              seed
            );
            value = (value + 1) / 2;
            break;

          case 'ridged':
            value = seededRidgedMultifractal(
              nx * scale, ny * scale, 0,
              params.octaves ?? 4,
              params.lacunarity ?? 2.0,
              params.gain ?? 0.5,
              params.roughness ?? 0.5,
              seed
            );
            break;

          case 'simplex':
          default:
            // Use FBM as simplex approximation
            value = seededFbm(
              nx * scale, ny * scale, 0,
              params.octaves ?? 4,
              params.lacunarity ?? 2.0,
              params.gain ?? 0.5,
              seed
            );
            value = (value + 1) / 2;
            break;
        }

        // Apply distortion
        if (params.distortion && params.distortion > 0) {
          const distNoise = seededNoise3D(nx * scale * 2, ny * scale * 2, seed, 1.0, seed + 1);
          value += distNoise * params.distortion * 0.5;
        }

        // Clamp
        value = Math.max(0, Math.min(1, value));

        const colorA = params.colorA ?? new THREE.Color(1, 1, 1);
        const colorB = params.colorB ?? new THREE.Color(0, 0, 0);
        const color = new THREE.Color().lerpColors(colorB, colorA, value);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Noise_${noiseType}_${seed}`;

    textureCache.set(cacheKey, { texture, paramsKey: cacheKey });
    return texture;
  }

  /**
   * Generate a gradient texture DataTexture
   */
  generateGradientTexture(gradientType: GradientType, params: TextureExecParams = {}): THREE.DataTexture {
    const cacheKey = getCacheKey(`gradient_${gradientType}`, params);
    const cached = textureCache.get(cacheKey);
    if (cached) return cached.texture;

    const resolution = params.resolution ?? this.defaultResolution;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    const colorA = params.colorA ?? new THREE.Color(1, 1, 1);
    const colorB = params.colorB ?? new THREE.Color(0, 0, 0);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const nx = x / resolution;
        const ny = y / resolution;

        let t: number;

        switch (gradientType) {
          case 'linear':
            t = nx;
            break;
          case 'quadratic':
            t = nx * nx;
            break;
          case 'diagonal':
            t = (nx + ny) / 2;
            break;
          case 'spherical': {
            const dx = nx - 0.5;
            const dy = ny - 0.5;
            t = 1.0 - Math.min(1, 2 * Math.sqrt(dx * dx + dy * dy));
            break;
          }
          case 'radial': {
            const ddx = nx - 0.5;
            const ddy = ny - 0.5;
            t = 1.0 - Math.min(1, 2 * Math.sqrt(ddx * ddx + ddy * ddy));
            break;
          }
          case 'easing':
            t = nx * nx * (3 - 2 * nx); // smoothstep
            break;
          default:
            t = nx;
        }

        t = Math.max(0, Math.min(1, t));
        const color = new THREE.Color().lerpColors(colorB, colorA, t);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = `Gradient_${gradientType}`;

    textureCache.set(cacheKey, { texture, paramsKey: cacheKey });
    return texture;
  }

  /**
   * Generate a ColorRamp lookup table DataTexture (1D)
   */
  generateColorRampTexture(
    stops: Array<{ position: number; color: { r: number; g: number; b: number } }>,
    resolution: number = 256
  ): THREE.DataTexture {
    if (stops.length === 0) {
      stops = [
        { position: 0, color: { r: 0, g: 0, b: 0 } },
        { position: 1, color: { r: 1, g: 1, b: 1 } },
      ];
    }

    // Sort stops by position
    const sorted = [...stops].sort((a, b) => a.position - b.position);
    const data = new Float32Array(resolution * 4);

    for (let i = 0; i < resolution; i++) {
      const t = i / (resolution - 1);
      const idx = i * 4;

      // Find surrounding stops
      let lower = sorted[0];
      let upper = sorted[sorted.length - 1];

      for (let s = 0; s < sorted.length - 1; s++) {
        if (t >= sorted[s].position && t <= sorted[s + 1].position) {
          lower = sorted[s];
          upper = sorted[s + 1];
          break;
        }
      }

      const range = upper.position - lower.position;
      const localT = range > 0 ? (t - lower.position) / range : 0;

      data[idx] = lower.color.r + localT * (upper.color.r - lower.color.r);
      data[idx + 1] = lower.color.g + localT * (upper.color.g - lower.color.g);
      data[idx + 2] = lower.color.b + localT * (upper.color.b - lower.color.b);
      data[idx + 3] = 1.0;
    }

    const texture = new THREE.DataTexture(data, resolution, 1, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.name = 'ColorRamp';

    return texture;
  }

  /**
   * Generate a brick pattern DataTexture
   */
  generateBrickTexture(params: TextureExecParams = {}): THREE.DataTexture {
    const cacheKey = getCacheKey('pattern_brick', params);
    const cached = textureCache.get(cacheKey);
    if (cached) return cached.texture;

    const resolution = params.resolution ?? this.defaultResolution;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    const scale = params.scale ?? 5.0;
    const brickWidth = 1.0;
    const brickHeight = 0.5;
    const mortarSize = 0.05;
    const colorA = params.colorA ?? new THREE.Color(0.65, 0.3, 0.2);
    const colorB = params.colorB ?? new THREE.Color(0.6, 0.58, 0.55);
    const seed = params.seed ?? 0;

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const nx = x / resolution * scale;
        const ny = y / resolution * scale;

        // Calculate brick coordinates with row offset
        const row = Math.floor(ny / brickHeight);
        const offset = (row % 2) * 0.5 * brickWidth;
        const adjX = nx + offset;

        // Local position within brick
        const localX = ((adjX % brickWidth) + brickWidth) % brickWidth;
        const localY = ((ny % brickHeight) + brickHeight) % brickHeight;

        // Check if in mortar
        const inMortarX = localX < mortarSize || localX > brickWidth - mortarSize;
        const inMortarY = localY < mortarSize || localY > brickHeight - mortarSize;
        const inMortar = inMortarX || inMortarY;

        // Add slight color variation per brick
        const brickId = Math.floor(adjX / brickWidth) + row * 137;
        const variation = (Math.sin(brickId * 12.9898 + seed) * 43758.5453) % 1;
        const colorVar = 0.9 + variation * 0.2;

        const color = inMortar
          ? colorB.clone()
          : colorA.clone().multiplyScalar(colorVar);

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = 'BrickPattern';

    textureCache.set(cacheKey, { texture, paramsKey: cacheKey });
    return texture;
  }

  /**
   * Generate a checker pattern DataTexture
   */
  generateCheckerTexture(params: TextureExecParams = {}): THREE.DataTexture {
    const cacheKey = getCacheKey('pattern_checker', params);
    const cached = textureCache.get(cacheKey);
    if (cached) return cached.texture;

    const resolution = params.resolution ?? this.defaultResolution;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    const scale = params.scale ?? 5.0;
    const colorA = params.colorA ?? new THREE.Color(1, 1, 1);
    const colorB = params.colorB ?? new THREE.Color(0, 0, 0);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const nx = Math.floor(x / resolution * scale);
        const ny = Math.floor(y / resolution * scale);

        const isColorA = (nx + ny) % 2 === 0;
        const color = isColorA ? colorA : colorB;

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = 'CheckerPattern';

    textureCache.set(cacheKey, { texture, paramsKey: cacheKey });
    return texture;
  }

  /**
   * Generate a Voronoi pattern DataTexture (cell-based coloring)
   */
  generateVoronoiPatternTexture(params: TextureExecParams = {}): THREE.DataTexture {
    const cacheKey = getCacheKey('pattern_voronoi', params);
    const cached = textureCache.get(cacheKey);
    if (cached) return cached.texture;

    const resolution = params.resolution ?? this.defaultResolution;
    const scale = params.scale ?? 5.0;
    const seed = params.seed ?? 0;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const nx = x / resolution;
        const ny = y / resolution;

        const distance = seededVoronoi2D(nx, ny, scale, seed);
        const value = Math.max(0, Math.min(1, distance));

        // Edge detection: cells near edges are darker
        const edge = value < 0.1 ? 0 : 1;

        data[idx] = value * edge;
        data[idx + 1] = value * edge;
        data[idx + 2] = value * edge;
        data[idx + 3] = 1.0;
      }
    }

    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = 'VoronoiPattern';

    textureCache.set(cacheKey, { texture, paramsKey: cacheKey });
    return texture;
  }

  /**
   * Generate a canvas-based texture (for complex patterns that benefit from 2D canvas)
   * Only works in browser environments
   */
  generateCanvasTexture(
    drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
    resolution: number = 512
  ): THREE.CanvasTexture | null {
    if (!isDOMAvailable()) {
      console.warn('Cannot create canvas texture during SSR');
      return null;
    }

    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    drawFn(ctx, resolution, resolution);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.name = 'CanvasTexture';

    return texture;
  }

  /**
   * Clear the texture cache
   */
  static clearCache(): void {
    for (const [, entry] of textureCache) {
      entry.texture.dispose();
    }
    textureCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { count: number; keys: string[] } {
    return {
      count: textureCache.size,
      keys: Array.from(textureCache.keys()),
    };
  }
}
