/**
 * MaterialBlendingSystem - Advanced material blending with masks
 *
 * Blend between materials using:
 * - Slope mask (flat = material A, steep = material B)
 * - Altitude mask (low = sand, mid = grass, high = rock)
 * - Noise mask (organic transition between materials)
 * - Custom mask (user-provided Float32Array)
 *
 * Generate blended PBR texture sets
 * Support for 2-4 material blending
 * Smooth transitions with configurable falloff
 */

import * as THREE from 'three';
import { createCanvas, isDOMAvailable } from '../../utils/CanvasUtils';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';
import { TextureBakePipeline, type PBRTextureSet, type MaterialPBRParams } from '../textures/TextureBakePipeline';

// ============================================================================
// Types
// ============================================================================

export type BlendMaskType = 'slope' | 'altitude' | 'noise' | 'custom';

export interface BlendLayer {
  material: MaterialPBRParams;
  weight: number;
}

export interface SlopeMaskParams {
  /** Angle in degrees below which material A is used (flat) */
  flatAngle: number;
  /** Angle in degrees above which material B is used (steep) */
  steepAngle: number;
  /** Falloff smoothness between transitions (0-1) */
  falloff: number;
}

export interface AltitudeMaskParams {
  /** Altitude breakpoints for each material layer */
  breakpoints: number[];
  /** Falloff smoothness between zones */
  falloff: number;
}

export interface NoiseMaskParams {
  /** Noise scale */
  scale: number;
  /** Noise octaves */
  octaves: number;
  /** Seed for noise generation */
  seed: number;
}

export interface BlendConfig {
  maskType: BlendMaskType;
  slopeParams?: SlopeMaskParams;
  altitudeParams?: AltitudeMaskParams;
  noiseParams?: NoiseMaskParams;
  customMask?: Float32Array;
  resolution: number;
  seed: number;
}

export interface BlendedResult {
  material: THREE.MeshPhysicalMaterial;
  maskTexture: THREE.DataTexture;
  blendWeights: Float32Array;
}

// ============================================================================
// Mask Generation
// ============================================================================

function generateSlopeMask(
  size: number,
  params: SlopeMaskParams,
  noise: SeededNoiseGenerator
): Float32Array {
  const mask = new Float32Array(size * size);
  const flatRad = (params.flatAngle / 180) * Math.PI;
  const steepRad = (params.steepAngle / 180) * Math.PI;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Simulate slope from noise-based heightfield
      const h = noise.fbm(nx * 3, ny * 3, 0, { octaves: 4 });
      const hx = noise.fbm((nx + 0.01) * 3, ny * 3, 0, { octaves: 4 });
      const hy = noise.fbm(nx * 3, (ny + 0.01) * 3, 0, { octaves: 4 });

      const gradient = Math.sqrt((hx - h) ** 2 + (hy - h) ** 2) * 100;
      const slopeAngle = Math.atan(gradient);

      // Smooth transition between flat and steep
      const falloff = params.falloff * 0.5;
      let weight: number;
      if (slopeAngle < flatRad - falloff) {
        weight = 0; // Flat → material A
      } else if (slopeAngle > steepRad + falloff) {
        weight = 1; // Steep → material B
      } else if (slopeAngle < flatRad + falloff) {
        const t = (slopeAngle - (flatRad - falloff)) / (2 * falloff);
        weight = t * t * (3 - 2 * t); // Smoothstep
      } else if (slopeAngle > steepRad - falloff) {
        const t = (slopeAngle - (steepRad - falloff)) / (2 * falloff);
        weight = 0.5 + t * 0.5;
      } else {
        weight = 0.5 + (slopeAngle - flatRad) / (steepRad - flatRad) * 0.5;
      }

      mask[y * size + x] = Math.max(0, Math.min(1, weight));
    }
  }

  return mask;
}

function generateAltitudeMask(
  size: number,
  params: AltitudeMaskParams,
  noise: SeededNoiseGenerator,
  numMaterials: number
): Float32Array[] {
  const masks: Float32Array[] = [];
  for (let i = 0; i < numMaterials; i++) {
    masks.push(new Float32Array(size * size));
  }

  const breakpoints = params.breakpoints;
  const falloff = params.falloff * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Altitude from noise
      const altitude = (noise.fbm(nx * 2, ny * 2, 0, { octaves: 5 }) + 1) / 2;

      // Calculate weights for each material
      let totalWeight = 0;
      const weights: number[] = new Array(numMaterials).fill(0);

      for (let i = 0; i < numMaterials; i++) {
        const lower = i > 0 ? breakpoints[i - 1] : 0;
        const upper = i < breakpoints.length ? breakpoints[i] : 1;

        if (altitude >= lower - falloff && altitude <= upper + falloff) {
          const center = (lower + upper) / 2;
          const halfWidth = (upper - lower) / 2 + falloff;
          const dist = Math.abs(altitude - center);
          weights[i] = Math.max(0, 1 - dist / halfWidth);
          totalWeight += weights[i];
        }
      }

      // Normalize weights
      if (totalWeight > 0) {
        for (let i = 0; i < numMaterials; i++) {
          masks[i][y * size + x] = weights[i] / totalWeight;
        }
      } else {
        // Fallback to closest material
        const closestIdx = Math.min(numMaterials - 1, Math.floor(altitude * numMaterials));
        masks[closestIdx][y * size + x] = 1;
      }
    }
  }

  return masks;
}

function generateNoiseMask(
  size: number,
  params: NoiseMaskParams
): Float32Array {
  const mask = new Float32Array(size * size);
  const noise = new SeededNoiseGenerator(params.seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      const n = noise.fbm(nx * params.scale, ny * params.scale, 0, {
        octaves: params.octaves,
        gain: 0.5,
      });

      // Normalize from [-1,1] to [0,1]
      mask[y * size + x] = Math.max(0, Math.min(1, (n + 1) / 2));
    }
  }

  return mask;
}

// ============================================================================
// Texture Blending
// ============================================================================

function blendFloat32Arrays(
  arrays: Float32Array[],
  weights: Float32Array[],
  size: number
): Float32Array {
  const result = new Float32Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const pixelIdx = y * size + x;

      for (let c = 0; c < 4; c++) {
        let value = 0;
        let totalWeight = 0;

        for (let m = 0; m < arrays.length; m++) {
          const w = weights[m][pixelIdx];
          value += arrays[m][idx + c] * w;
          totalWeight += w;
        }

        result[idx + c] = totalWeight > 0 ? value / totalWeight : 0;
      }
    }
  }

  return result;
}

// ============================================================================
// MaterialBlendingSystem
// ============================================================================

export class MaterialBlendingSystem {
  private pipeline: TextureBakePipeline;

  constructor(resolution: number = 512) {
    this.pipeline = new TextureBakePipeline(resolution as any);
  }

  /**
   * Blend two materials with a mask
   */
  blendTwoMaterials(
    materialA: MaterialPBRParams,
    materialB: MaterialPBRParams,
    config: BlendConfig
  ): BlendedResult {
    const { resolution } = config;
    const noise = new SeededNoiseGenerator(config.seed);

    // Generate mask
    let mask: Float32Array;
    switch (config.maskType) {
      case 'slope':
        mask = generateSlopeMask(resolution, config.slopeParams ?? { flatAngle: 15, steepAngle: 45, falloff: 0.3 }, noise);
        break;
      case 'altitude':
        // For two materials, altitude mask generates a single blend weight
        const altMasks = generateAltitudeMask(resolution, config.altitudeParams ?? { breakpoints: [0.5], falloff: 0.2 }, noise, 2);
        mask = altMasks[1]; // Weight for material B
        break;
      case 'custom':
        mask = config.customMask ?? new Float32Array(resolution * resolution).fill(0.5);
        break;
      case 'noise':
      default:
        mask = generateNoiseMask(resolution, config.noiseParams ?? { scale: 3.0, octaves: 4, seed: config.seed });
        break;
    }

    // Bake both materials
    const texturesA = this.pipeline.bakePBRSet(materialA, { seed: config.seed });
    const texturesB = this.pipeline.bakePBRSet(materialB, { seed: config.seed + 1000 });

    // Blend each channel
    const weightA = new Float32Array(resolution * resolution);
    const weightB = new Float32Array(resolution * resolution);
    for (let i = 0; i < resolution * resolution; i++) {
      weightB[i] = mask[i];
      weightA[i] = 1 - mask[i];
    }

    const blendedAlbedo = blendFloat32Arrays(
      [texturesA.albedo.image.data as Float32Array, texturesB.albedo.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    const blendedNormal = blendFloat32Arrays(
      [texturesA.normal.image.data as Float32Array, texturesB.normal.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    const blendedRoughness = blendFloat32Arrays(
      [texturesA.roughness.image.data as Float32Array, texturesB.roughness.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    const blendedMetallic = blendFloat32Arrays(
      [texturesA.metallic.image.data as Float32Array, texturesB.metallic.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    const blendedAO = blendFloat32Arrays(
      [texturesA.ao.image.data as Float32Array, texturesB.ao.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    const blendedHeight = blendFloat32Arrays(
      [texturesA.height.image.data as Float32Array, texturesB.height.image.data as Float32Array],
      [weightA, weightB],
      resolution
    );

    // Create DataTextures
    const createTex = (data: Float32Array, name: string) => {
      const tex = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.name = name;
      return tex;
    };

    const blendedTextures: PBRTextureSet = {
      albedo: createTex(blendedAlbedo, 'Blended_Albedo'),
      normal: createTex(blendedNormal, 'Blended_Normal'),
      roughness: createTex(blendedRoughness, 'Blended_Roughness'),
      metallic: createTex(blendedMetallic, 'Blended_Metallic'),
      ao: createTex(blendedAO, 'Blended_AO'),
      height: createTex(blendedHeight, 'Blended_Height'),
      emission: null,
    };

    // Create mask texture
    const maskData = new Float32Array(resolution * resolution * 4);
    for (let i = 0; i < resolution * resolution; i++) {
      maskData[i * 4] = mask[i];
      maskData[i * 4 + 1] = mask[i];
      maskData[i * 4 + 2] = mask[i];
      maskData[i * 4 + 3] = 1;
    }
    const maskTexture = createTex(maskData, 'BlendMask');

    // Create blended material
    const material = this.pipeline.createMaterial(blendedTextures, {
      baseColor: new THREE.Color(1, 1, 1),
      roughness: 0.5,
      metallic: 0.0,
      aoStrength: 1.0,
      heightScale: 0.02,
      normalStrength: 1.0,
      noiseScale: 5,
      noiseDetail: 4,
      distortion: 0.1,
      warpStrength: 0.2,
      emissionColor: null,
      emissionStrength: 0,
    });
    material.name = 'BlendedMaterial';

    return {
      material,
      maskTexture,
      blendWeights: mask,
    };
  }

  /**
   * Blend multiple materials (2-4) using altitude-based masking
   * Common use: sand → grass → rock → snow
   */
  blendMultipleMaterials(
    materials: MaterialPBRParams[],
    config: Omit<BlendConfig, 'maskType'> & { maskType: 'altitude' | 'noise' }
  ): BlendedResult {
    if (materials.length < 2) throw new Error('Need at least 2 materials to blend');
    if (materials.length > 4) throw new Error('Maximum 4 materials supported');

    const { resolution } = config;
    const noise = new SeededNoiseGenerator(config.seed);

    // Generate weight masks for each material
    let weightMasks: Float32Array[];
    if (config.maskType === 'altitude') {
      const breakpoints = config.altitudeParams?.breakpoints ?? 
        Array.from({ length: materials.length - 1 }, (_, i) => (i + 1) / materials.length);
      weightMasks = generateAltitudeMask(
        resolution,
        { breakpoints, falloff: config.altitudeParams?.falloff ?? 0.2 },
        noise,
        materials.length
      );
    } else {
      // Noise-based multi-material blending
      weightMasks = [];
      const baseNoise = generateNoiseMask(resolution, config.noiseParams ?? { scale: 3, octaves: 4, seed: config.seed });

      for (let m = 0; m < materials.length; m++) {
        const mask = new Float32Array(resolution * resolution);
        const lower = m / materials.length;
        const upper = (m + 1) / materials.length;
        const falloff = 0.15;

        for (let i = 0; i < resolution * resolution; i++) {
          const n = baseNoise[i];
          if (n >= lower && n < upper) {
            mask[i] = 1;
          } else if (n >= lower - falloff && n < lower) {
            mask[i] = (n - (lower - falloff)) / falloff;
          } else if (n >= upper && n < upper + falloff) {
            mask[i] = 1 - (n - upper) / falloff;
          }
        }
        weightMasks.push(mask);
      }

      // Normalize weights
      for (let i = 0; i < resolution * resolution; i++) {
        let total = 0;
        for (let m = 0; m < materials.length; m++) {
          total += weightMasks[m][i];
        }
        if (total > 0) {
          for (let m = 0; m < materials.length; m++) {
            weightMasks[m][i] /= total;
          }
        }
      }
    }

    // Bake all materials
    const allTextures = materials.map((m, i) =>
      this.pipeline.bakePBRSet(m, { seed: config.seed + i * 1000 })
    );

    // Blend all channels
    const blendChannel = (channel: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'height'): Float32Array => {
      const arrays = allTextures.map(t => t[channel].image.data as Float32Array);
      return blendFloat32Arrays(arrays, weightMasks, resolution);
    };

    const createTex = (data: Float32Array, name: string) => {
      const tex = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat, THREE.FloatType);
      tex.needsUpdate = true;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.name = name;
      return tex;
    };

    const blendedTextures: PBRTextureSet = {
      albedo: createTex(blendChannel('albedo'), 'MultiBlend_Albedo'),
      normal: createTex(blendChannel('normal'), 'MultiBlend_Normal'),
      roughness: createTex(blendChannel('roughness'), 'MultiBlend_Roughness'),
      metallic: createTex(blendChannel('metallic'), 'MultiBlend_Metallic'),
      ao: createTex(blendChannel('ao'), 'MultiBlend_AO'),
      height: createTex(blendChannel('height'), 'MultiBlend_Height'),
      emission: null,
    };

    // Create a mask texture showing primary material
    const primaryMask = new Float32Array(resolution * resolution * 4);
    for (let i = 0; i < resolution * resolution; i++) {
      primaryMask[i * 4] = weightMasks[0][i];
      primaryMask[i * 4 + 1] = weightMasks.length > 1 ? weightMasks[1][i] : 0;
      primaryMask[i * 4 + 2] = weightMasks.length > 2 ? weightMasks[2][i] : 0;
      primaryMask[i * 4 + 3] = 1;
    }

    const material = this.pipeline.createMaterial(blendedTextures, {
      baseColor: new THREE.Color(1, 1, 1),
      roughness: 0.5,
      metallic: 0.0,
      aoStrength: 1.0,
      heightScale: 0.02,
      normalStrength: 1.0,
      noiseScale: 5,
      noiseDetail: 4,
      distortion: 0.1,
      warpStrength: 0.2,
      emissionColor: null,
      emissionStrength: 0,
    });
    material.name = 'MultiBlendedMaterial';

    return {
      material,
      maskTexture: createTex(primaryMask, 'MultiBlendMask'),
      blendWeights: weightMasks[0],
    };
  }

  /**
   * Quick terrain blend: sand → grass → rock → snow
   */
  createTerrainBlend(seed: number = 0, resolution: number = 512): BlendedResult {
    const sand: MaterialPBRParams = {
      baseColor: new THREE.Color(0.82, 0.72, 0.52),
      roughness: 0.9, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.8,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 15, noiseDetail: 4, distortion: 0.1, warpStrength: 0.1,
    };

    const grass: MaterialPBRParams = {
      baseColor: new THREE.Color(0.2, 0.45, 0.12),
      roughness: 0.75, metallic: 0.0,
      aoStrength: 0.4, heightScale: 0.02, normalStrength: 1.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 6, noiseDetail: 5, distortion: 0.3, warpStrength: 0.4,
    };

    const rock: MaterialPBRParams = {
      baseColor: new THREE.Color(0.48, 0.45, 0.4),
      roughness: 0.85, metallic: 0.0,
      aoStrength: 0.7, heightScale: 0.05, normalStrength: 2.0,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 3, noiseDetail: 7, distortion: 0.4, warpStrength: 0.5,
    };

    const snow: MaterialPBRParams = {
      baseColor: new THREE.Color(0.92, 0.94, 0.98),
      roughness: 0.7, metallic: 0.0,
      aoStrength: 0.3, heightScale: 0.01, normalStrength: 0.5,
      emissionColor: null, emissionStrength: 0,
      noiseScale: 4, noiseDetail: 4, distortion: 0.2, warpStrength: 0.3,
    };

    return this.blendMultipleMaterials(
      [sand, grass, rock, snow],
      {
        maskType: 'altitude',
        altitudeParams: { breakpoints: [0.2, 0.55, 0.8], falloff: 0.15 },
        resolution,
        seed,
      }
    );
  }

  /**
   * Check if blending is possible (requires DOM)
   */
  static canBlend(): boolean {
    return isDOMAvailable();
  }
}
