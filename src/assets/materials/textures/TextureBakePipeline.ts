/**
 * TextureBakePipeline - Bake material node graphs into PBR texture sets
 *
 * Generate all PBR channels: albedo (RGB), normal (RGB), roughness (G),
 * metallic (B), AO (R), height (G)
 * Configurable resolution (256, 512, 1024, 2048)
 * Tileable texture generation (seamless wrapping)
 * Export as DataTexture arrays for Three.js materials
 * Integration with MaterialFactory from the node execution layer
 */

import * as THREE from 'three';
import { createCanvas, isDOMAvailable } from '../../utils/CanvasUtils';
import { ProceduralTextureGraph, type TextureChannel, type TextureGraphOutput } from './ProceduralTextureGraph';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export type BakeResolution = 256 | 512 | 1024 | 2048;

export interface PBRTextureSet {
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  metallic: THREE.DataTexture;
  ao: THREE.DataTexture;
  height: THREE.DataTexture;
  emission: THREE.DataTexture | null;
}

export interface BakeConfig {
  resolution: BakeResolution;
  tileable: boolean;
  seed: number;
  /** Material category influences the noise graph presets */
  category: string;
}

export interface MaterialPBRParams {
  baseColor: THREE.Color;
  roughness: number;
  metallic: number;
  aoStrength: number;
  heightScale: number;
  normalStrength: number;
  emissionColor: THREE.Color | null;
  emissionStrength: number;
  noiseScale: number;
  noiseDetail: number;
  distortion: number;
  warpStrength: number;
}

// ============================================================================
// Cache
// ============================================================================

const bakeCache = new Map<string, PBRTextureSet>();

function computeBakeKey(config: BakeConfig, params: MaterialPBRParams): string {
  return [
    config.resolution,
    config.tileable,
    config.seed,
    config.category,
    params.baseColor.getHexString(),
    params.roughness,
    params.metallic,
    params.aoStrength,
    params.heightScale,
    params.normalStrength,
    params.noiseScale,
    params.noiseDetail,
    params.distortion,
    params.warpStrength,
    params.emissionStrength,
  ].join('|');
}

// ============================================================================
// TextureBakePipeline
// ============================================================================

export class TextureBakePipeline {
  private resolution: BakeResolution;
  private seed: number;
  private noise: SeededNoiseGenerator;
  private rng: SeededRandom;

  constructor(resolution: BakeResolution = 512, seed: number = 0) {
    this.resolution = resolution;
    this.seed = seed;
    this.noise = new SeededNoiseGenerator(seed);
    this.rng = new SeededRandom(seed);
  }

  /**
   * Bake a full PBR texture set from material parameters
   */
  bakePBRSet(params: MaterialPBRParams, config?: Partial<BakeConfig>): PBRTextureSet {
    const fullConfig: BakeConfig = {
      resolution: this.resolution,
      tileable: true,
      seed: this.seed,
      category: 'generic',
      ...config,
    };

    // Check cache
    const key = computeBakeKey(fullConfig, params);
    const cached = bakeCache.get(key);
    if (cached) return cached;

    const res = fullConfig.resolution;

    // Generate each channel
    const albedoData = this.generateAlbedo(params, res);
    const normalData = this.generateNormal(params, res);
    const roughnessData = this.generateRoughness(params, res);
    const metallicData = this.generateMetallic(params, res);
    const aoData = this.generateAO(params, res);
    const heightData = this.generateHeight(params, res);
    const emissionData = params.emissionStrength > 0
      ? this.generateEmission(params, res)
      : null;

    // Create DataTextures
    const albedo = this.createDataTexture(albedoData, res, 'Albedo');
    const normal = this.createDataTexture(normalData, res, 'Normal');
    const roughness = this.createDataTexture(roughnessData, res, 'Roughness');
    const metallic = this.createDataTexture(metallicData, res, 'Metallic');
    const ao = this.createDataTexture(aoData, res, 'AO');
    const height = this.createDataTexture(heightData, res, 'Height');
    const emission = emissionData ? this.createDataTexture(emissionData, res, 'Emission') : null;

    // Make tileable if requested
    if (fullConfig.tileable) {
      this.makeTileable(albedo, res);
      this.makeTileable(normal, res);
      this.makeTileable(roughness, res);
      this.makeTileable(metallic, res);
      this.makeTileable(ao, res);
      this.makeTileable(height, res);
      if (emission) this.makeTileable(emission, res);
    }

    const result: PBRTextureSet = { albedo, normal, roughness, metallic, ao, height, emission };
    bakeCache.set(key, result);
    return result;
  }

  /**
   * Generate albedo map (RGB color with noise variation)
   */
  private generateAlbedo(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        // Base color with noise variation
        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
        const variation = 0.9 + noiseVal * 0.2; // +/- 10% variation

        data[idx] = Math.max(0, Math.min(1, params.baseColor.r * variation));
        data[idx + 1] = Math.max(0, Math.min(1, params.baseColor.g * variation));
        data[idx + 2] = Math.max(0, Math.min(1, params.baseColor.b * variation));
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate normal map from height differences
   */
  private generateNormal(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const strength = params.normalStrength;

    // First, generate height field
    const heightField = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const nx = x / res;
        const ny = y / res;
        heightField[y * res + x] = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail }) + 1) / 2;
      }
    }

    // Compute normals from height differences (Sobel filter)
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        const left = heightField[y * res + ((x - 1 + res) % res)];
        const right = heightField[y * res + ((x + 1) % res)];
        const up = heightField[((y - 1 + res) % res) * res + x];
        const down = heightField[((y + 1) % res) * res + x];

        // Normal from finite differences
        const dx = (right - left) * strength;
        const dy = (down - up) * strength;
        const dz = 1.0;

        // Normalize
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx2 = dx / len;
        const ny2 = dy / len;
        const nz = dz / len;

        // Encode as [0,1] range
        data[idx] = nx2 * 0.5 + 0.5;
        data[idx + 1] = ny2 * 0.5 + 0.5;
        data[idx + 2] = nz * 0.5 + 0.5;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate roughness map
   */
  private generateRoughness(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 2; // Higher frequency for roughness detail
    const baseRoughness = params.roughness;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.5 }) + 1) / 2;
        const roughness = Math.max(0, Math.min(1, baseRoughness + (noiseVal - 0.5) * 0.3));

        data[idx] = roughness;
        data[idx + 1] = roughness;
        data[idx + 2] = roughness;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate metallic map
   */
  private generateMetallic(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const baseMetallic = params.metallic;

    // Metallic is usually uniform with slight noise
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.perlin2D(nx * 10, ny * 10) + 1) / 2;
        const metallic = Math.max(0, Math.min(1, baseMetallic + (noiseVal - 0.5) * 0.1));

        data[idx] = metallic;
        data[idx + 1] = metallic;
        data[idx + 2] = metallic;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate ambient occlusion map
   */
  private generateAO(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale * 0.5;
    const aoStrength = params.aoStrength;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        // AO based on low-frequency noise simulating crevices
        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3, gain: 0.7 }) + 1) / 2;

        // Darken crevices (high noise = more occlusion)
        const ao = 1.0 - noiseVal * aoStrength * 0.5;

        data[idx] = Math.max(0, ao);
        data[idx + 1] = Math.max(0, ao);
        data[idx + 2] = Math.max(0, ao);
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate height map
   */
  private generateHeight(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const detail = params.noiseDetail;
    const heightScale = params.heightScale;

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: 0.5 }) + 1) / 2;
        const height = noiseVal * heightScale;

        data[idx] = height;
        data[idx + 1] = height;
        data[idx + 2] = height;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Generate emission map
   */
  private generateEmission(params: MaterialPBRParams, res: number): Float32Array {
    const data = new Float32Array(res * res * 4);
    const scale = params.noiseScale;
    const strength = params.emissionStrength;
    const color = params.emissionColor ?? new THREE.Color(1, 1, 1);

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;
        const nx = x / res;
        const ny = y / res;

        const noiseVal = (this.noise.fbm(nx * scale, ny * scale, 0, { octaves: 3 }) + 1) / 2;

        data[idx] = color.r * noiseVal * strength;
        data[idx + 1] = color.g * noiseVal * strength;
        data[idx + 2] = color.b * noiseVal * strength;
        data[idx + 3] = 1.0;
      }
    }

    return data;
  }

  /**
   * Create a DataTexture from float data
   */
  private createDataTexture(data: Float32Array, res: number, name: string): THREE.DataTexture {
    const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.name = `Bake_${name}_${this.seed}`;
    return texture;
  }

  /**
   * Make a texture tileable by blending edges
   */
  private makeTileable(texture: THREE.DataTexture, res: number): void {
    const data = texture.image.data as Float32Array;
    const blendWidth = Math.max(1, Math.floor(res * 0.05)); // 5% edge blend

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = (y * res + x) * 4;

        // Blend left edge with right edge
        if (x < blendWidth) {
          const t = x / blendWidth;
          const mirrorIdx = (y * res + (res - blendWidth + x)) * 4;
          for (let c = 0; c < 4; c++) {
            data[idx + c] = data[idx + c] * t + data[mirrorIdx + c] * (1 - t);
          }
        }

        // Blend top edge with bottom edge
        if (y < blendWidth) {
          const t = y / blendWidth;
          const mirrorIdx = ((res - blendWidth + y) * res + x) * 4;
          for (let c = 0; c < 4; c++) {
            data[idx + c] = data[idx + c] * t + data[mirrorIdx + c] * (1 - t);
          }
        }
      }
    }

    texture.needsUpdate = true;
  }

  /**
   * Create a MeshPhysicalMaterial from a baked PBR texture set
   */
  createMaterial(textures: PBRTextureSet, params: Partial<MaterialPBRParams> = {}): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      map: textures.albedo,
      normalMap: textures.normal,
      roughnessMap: textures.roughness,
      metalnessMap: textures.metallic,
      aoMap: textures.ao,
      bumpMap: textures.height,
      color: params.baseColor ?? new THREE.Color(1, 1, 1),
      roughness: params.roughness ?? 0.5,
      metalness: params.metallic ?? 0.0,
      bumpScale: params.heightScale ?? 0.02,
      normalScale: new THREE.Vector2(params.normalStrength ?? 1.0, params.normalStrength ?? 1.0),
      aoMapIntensity: params.aoStrength ?? 1.0,
    });

    if (textures.emission && params.emissionStrength && params.emissionStrength > 0) {
      material.emissiveMap = textures.emission;
      material.emissive = params.emissionColor ?? new THREE.Color(1, 1, 1);
      material.emissiveIntensity = params.emissionStrength;
    }

    material.name = 'BakedPBRMaterial';
    return material;
  }

  /**
   * Quick bake: generate a full PBR set with defaults for a material category
   */
  quickBake(category: string, seed: number = 0): PBRTextureSet {
    const categoryDefaults = this.getCategoryDefaults(category);
    return this.bakePBRSet(categoryDefaults, { category, seed });
  }

  /**
   * Get default PBR parameters for a material category
   */
  private getCategoryDefaults(category: string): MaterialPBRParams {
    switch (category) {
      case 'metal':
        return {
          baseColor: new THREE.Color(0.75, 0.75, 0.78),
          roughness: 0.2,
          metallic: 1.0,
          aoStrength: 0.3,
          heightScale: 0.005,
          normalStrength: 0.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 20.0,
          noiseDetail: 5,
          distortion: 0.1,
          warpStrength: 0.2,
        };
      case 'wood':
        return {
          baseColor: new THREE.Color(0.4, 0.25, 0.12),
          roughness: 0.7,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 3.0,
          noiseDetail: 6,
          distortion: 0.3,
          warpStrength: 0.5,
        };
      case 'stone':
        return {
          baseColor: new THREE.Color(0.5, 0.48, 0.44),
          roughness: 0.85,
          metallic: 0.0,
          aoStrength: 0.7,
          heightScale: 0.03,
          normalStrength: 1.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 4.0,
          noiseDetail: 5,
          distortion: 0.2,
          warpStrength: 0.3,
        };
      case 'fabric':
        return {
          baseColor: new THREE.Color(0.4, 0.2, 0.15),
          roughness: 0.9,
          metallic: 0.0,
          aoStrength: 0.4,
          heightScale: 0.005,
          normalStrength: 0.5,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 30.0,
          noiseDetail: 3,
          distortion: 0.0,
          warpStrength: 0.0,
        };
      case 'ceramic':
        return {
          baseColor: new THREE.Color(0.95, 0.93, 0.88),
          roughness: 0.15,
          metallic: 0.0,
          aoStrength: 0.2,
          heightScale: 0.002,
          normalStrength: 0.3,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 8.0,
          noiseDetail: 3,
          distortion: 0.05,
          warpStrength: 0.1,
        };
      case 'glass':
        return {
          baseColor: new THREE.Color(0.95, 0.97, 1.0),
          roughness: 0.02,
          metallic: 0.0,
          aoStrength: 0.1,
          heightScale: 0.001,
          normalStrength: 0.2,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 10.0,
          noiseDetail: 2,
          distortion: 0.0,
          warpStrength: 0.0,
        };
      case 'terrain':
        return {
          baseColor: new THREE.Color(0.35, 0.28, 0.18),
          roughness: 0.9,
          metallic: 0.0,
          aoStrength: 0.8,
          heightScale: 0.05,
          normalStrength: 2.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 3.0,
          noiseDetail: 7,
          distortion: 0.4,
          warpStrength: 0.5,
        };
      case 'nature':
        return {
          baseColor: new THREE.Color(0.15, 0.4, 0.1),
          roughness: 0.65,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 5.0,
          noiseDetail: 5,
          distortion: 0.3,
          warpStrength: 0.4,
        };
      case 'creature':
        return {
          baseColor: new THREE.Color(0.55, 0.42, 0.35),
          roughness: 0.55,
          metallic: 0.0,
          aoStrength: 0.4,
          heightScale: 0.01,
          normalStrength: 0.8,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 8.0,
          noiseDetail: 4,
          distortion: 0.2,
          warpStrength: 0.3,
        };
      default:
        return {
          baseColor: new THREE.Color(0.5, 0.5, 0.5),
          roughness: 0.5,
          metallic: 0.0,
          aoStrength: 0.5,
          heightScale: 0.02,
          normalStrength: 1.0,
          emissionColor: null,
          emissionStrength: 0,
          noiseScale: 5.0,
          noiseDetail: 4,
          distortion: 0.1,
          warpStrength: 0.2,
        };
    }
  }

  /**
   * Clear the bake cache
   */
  static clearCache(): void {
    for (const [, entry] of bakeCache) {
      entry.albedo.dispose();
      entry.normal.dispose();
      entry.roughness.dispose();
      entry.metallic.dispose();
      entry.ao.dispose();
      entry.height.dispose();
      entry.emission?.dispose();
    }
    bakeCache.clear();
  }

  /**
   * Check if baking is possible (requires DOM)
   */
  static canBake(): boolean {
    return isDOMAvailable();
  }
}
