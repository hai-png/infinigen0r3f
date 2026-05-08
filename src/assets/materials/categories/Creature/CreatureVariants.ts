import { createCanvas } from '../../../utils/CanvasUtils';
/**
 * Creature Material Variants
 *
 * Expanded creature materials ported from original Infinigen:
 * Beak, Bone, Chitin (detailed), Eyeball, FishBody, FishEye, FishFin,
 * Giraffe, Horn, Nose, ReptileBrownCircle, ReptileGray, ReptileTwoColor,
 * Snake, SnakeScale, Tiger, Tongue, TwoColorSpots, ThreeColorSpots
 *
 * This file provides a unified generator that wraps all creature variant types
 * following the BaseMaterialGenerator pattern. Individual creature materials
 * also exist as standalone classes (e.g., TigerMaterial, GiraffeMaterial).
 *
 * Each variant generates color, normal, and roughness maps procedurally.
 */

import {
  Color,
  Texture,
  CanvasTexture,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  RepeatWrapping,
  Vector2,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { NoiseUtils } from '../../../../core/util/math/noise';

// ============================================================================
// Shared Types
// ============================================================================

export type CreatureVariantType =
  | 'beak'
  | 'bone'
  | 'chitin_detailed'
  | 'eyeball'
  | 'fish_body'
  | 'fish_eye'
  | 'fish_fin'
  | 'giraffe'
  | 'horn'
  | 'nose'
  | 'reptile_brown_circle'
  | 'reptile_gray'
  | 'reptile_two_color'
  | 'snake'
  | 'snake_scale'
  | 'tiger'
  | 'tongue'
  | 'two_color_spots'
  | 'three_color_spots';

export interface CreatureVariantParams {
  [key: string]: unknown;
  variant: CreatureVariantType;
  baseColor: Color;
  secondaryColor: Color;
  tertiaryColor: Color;
  roughness: number;
  patternScale: number;
  patternIntensity: number;
  subsurfaceAmount: number;
  subsurfaceColor: Color;
  clearcoat: number;
  metalness: number;
}

// ============================================================================
// CreatureVariants Generator
// ============================================================================

export class CreatureVariants extends BaseMaterialGenerator<CreatureVariantParams> {
  private static readonly DEFAULT_PARAMS: CreatureVariantParams = {
    variant: 'tiger',
    baseColor: new Color(0x8b6f47),
    secondaryColor: new Color(0x3d2817),
    tertiaryColor: new Color(0x1a1008),
    roughness: 0.75,
    patternScale: 1.0,
    patternIntensity: 0.6,
    subsurfaceAmount: 0.1,
    subsurfaceColor: new Color(0.9, 0.6, 0.3),
    clearcoat: 0.0,
    metalness: 0.0,
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): CreatureVariantParams {
    return { ...CreatureVariants.DEFAULT_PARAMS };
  }

  protected createBaseMaterial(): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
      color: 0x8b6f47,
      roughness: 0.75,
      metalness: 0.0,
      side: 2, // DoubleSide
    });
  }

  generate(params: Partial<CreatureVariantParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(CreatureVariants.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    const material = new MeshPhysicalMaterial({
      color: finalParams.baseColor,
      roughness: finalParams.roughness,
      metalness: finalParams.metalness,
      clearcoat: finalParams.clearcoat,
      clearcoatRoughness: 0.1,
      thickness: 0.5,
      attenuationColor: finalParams.subsurfaceColor,
      attenuationDistance: 0.5 / Math.max(0.01, finalParams.subsurfaceAmount),
      side: 2, // DoubleSide
    });

    // Generate textures
    material.map = this.generateColorMap(finalParams, rng);
    material.normalMap = this.generateNormalMap(finalParams, rng);
    material.roughnessMap = this.generateRoughnessMap(finalParams, rng);

    return {
      material,
      maps: {
        map: material.map,
        roughnessMap: material.roughnessMap,
        normalMap: material.normalMap,
      },
      params: finalParams,
    };
  }

  // --------------------------------------------------------------------------
  // Color Map
  // --------------------------------------------------------------------------

  private generateColorMap(params: CreatureVariantParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    switch (params.variant) {
      case 'beak':
        this.drawBeakColorMap(imageData, size, params, noise);
        break;
      case 'bone':
        this.drawBoneColorMap(imageData, size, params, noise);
        break;
      case 'chitin_detailed':
        this.drawChitinDetailedColorMap(imageData, size, params, noise);
        break;
      case 'eyeball':
        this.drawEyeballColorMap(imageData, size, params, noise, rng);
        break;
      case 'fish_body':
        this.drawFishBodyColorMap(imageData, size, params, noise, rng);
        break;
      case 'fish_eye':
        this.drawFishEyeColorMap(imageData, size, params, noise);
        break;
      case 'fish_fin':
        this.drawFishFinColorMap(imageData, size, params, noise);
        break;
      case 'giraffe':
        this.drawGiraffeColorMap(imageData, size, params, noise);
        break;
      case 'horn':
        this.drawHornColorMap(imageData, size, params, noise);
        break;
      case 'nose':
        this.drawNoseColorMap(imageData, size, params, noise);
        break;
      case 'reptile_brown_circle':
        this.drawReptileBrownCircleColorMap(imageData, size, params, noise);
        break;
      case 'reptile_gray':
        this.drawReptileGrayColorMap(imageData, size, params, noise);
        break;
      case 'reptile_two_color':
        this.drawReptileTwoColorColorMap(imageData, size, params, noise);
        break;
      case 'snake':
        this.drawSnakeColorMap(imageData, size, params, noise);
        break;
      case 'snake_scale':
        this.drawSnakeScaleColorMap(imageData, size, params, noise);
        break;
      case 'tiger':
        this.drawTigerColorMap(imageData, size, params, noise, rng);
        break;
      case 'tongue':
        this.drawTongueColorMap(imageData, size, params, noise);
        break;
      case 'two_color_spots':
        this.drawTwoColorSpotsColorMap(imageData, size, params, noise);
        break;
      case 'three_color_spots':
        this.drawThreeColorSpotsColorMap(imageData, size, params, noise);
        break;
      default:
        this.fillSolidColor(imageData, size, params.baseColor);
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Individual Variant Implementations
  // --------------------------------------------------------------------------

  private fillSolidColor(
    imageData: ImageData,
    size: number,
    color: Color,
  ): void {
    for (let i = 0; i < size * size * 4; i += 4) {
      imageData.data[i] = Math.floor(color.r * 255);
      imageData.data[i + 1] = Math.floor(color.g * 255);
      imageData.data[i + 2] = Math.floor(color.b * 255);
      imageData.data[i + 3] = 255;
    }
  }

  // --- Beak ---
  private drawBeakColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Keratin ridges
        const ridge = Math.sin(v * 60 * params.patternScale) * 0.05;
        const n = noise.perlin2D(u * 10, v * 20) * 0.08;

        // Tip darkening
        const tipFactor = v * 0.3;
        const r = params.baseColor.r + ridge + n - tipFactor;
        const g = params.baseColor.g + ridge * 0.8 + n * 0.7 - tipFactor * 0.6;
        const b = params.baseColor.b + ridge * 0.5 + n * 0.5 - tipFactor * 0.3;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Bone ---
  private drawBoneColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Ivory/cream with subtle grain
        const grain = noise.perlin2D(x * 0.02, y * 0.02) * 0.06;
        const fineGrain = noise.perlin2D(x * 0.1, y * 0.1) * 0.02;

        // Pore spots
        const pore = noise.perlin2D(x * 0.05, y * 0.05);
        const isPore = pore > 0.7;
        const poreDarken = isPore ? 0.1 : 0.0;

        const r = params.baseColor.r + grain + fineGrain - poreDarken;
        const g = params.baseColor.g + grain + fineGrain - poreDarken;
        const b = params.baseColor.b + grain * 0.5 + fineGrain * 0.5 - poreDarken * 0.5;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Chitin Detailed ---
  private drawChitinDetailedColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Cross-hatch segmented pattern
        const freq = 12 * params.patternScale;
        const line1 = Math.abs(Math.sin((u + v) * freq * Math.PI));
        const line2 = Math.abs(Math.sin((u - v) * freq * Math.PI));

        const isSeam = line1 < 0.08 || line2 < 0.08;

        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.08;
        const highlight = Math.max(0, noise.perlin2D(x * 0.005, y * 0.005)) * 0.4;

        let r: number, g: number, b: number;
        if (isSeam) {
          r = params.secondaryColor.r + colorNoise;
          g = params.secondaryColor.g + colorNoise;
          b = params.secondaryColor.b + colorNoise;
        } else {
          r = params.baseColor.r * (1 - highlight) + params.tertiaryColor.r * highlight + colorNoise;
          g = params.baseColor.g * (1 - highlight) + params.tertiaryColor.g * highlight + colorNoise;
          b = params.baseColor.b * (1 - highlight) + params.tertiaryColor.b * highlight + colorNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Eyeball ---
  private drawEyeballColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const irisColor = params.secondaryColor;
    const pupilColor = new Color(0.0, 0.0, 0.0);
    const scleraColor = new Color(0.9, 0.88, 0.82);
    const irisRadius = 0.35;
    const pupilRadius = 0.15;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = (x / size) * 2 - 1;
        const v = (y / size) * 2 - 1;
        const dist = Math.sqrt(u * u + v * v);

        let r: number, g: number, b: number;
        if (dist > 0.95) {
          r = 0.02; g = 0.02; b = 0.02;
        } else if (dist > irisRadius) {
          // Sclera
          const scleraNoise = noise.perlin2D(x * 0.03, y * 0.03) * 0.03;
          r = scleraColor.r + scleraNoise;
          g = scleraColor.g + scleraNoise;
          b = scleraColor.b + scleraNoise;
        } else if (dist > pupilRadius) {
          // Iris
          const irisT = (dist - pupilRadius) / (irisRadius - pupilRadius);
          const angle = Math.atan2(v, u);
          const fiber = noise.perlin2D(angle * 3, irisT * 10) * 0.1;
          r = irisColor.r * (1 - irisT * 0.2) + fiber;
          g = irisColor.g * (1 - irisT * 0.2) + fiber;
          b = irisColor.b * (1 - irisT * 0.2) + fiber;
        } else {
          r = pupilColor.r; g = pupilColor.g; b = pupilColor.b;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Fish Body ---
  private drawFishBodyColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const scaleFreq = 20 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Fish scale pattern using offset semicircles
        const row = Math.floor(v * scaleFreq);
        const colOffset = row % 2 === 0 ? 0 : 0.5 / scaleFreq;
        const localU = (u + colOffset) * scaleFreq;
        const localV = v * scaleFreq * 1.5;

        const cellX = Math.floor(localU);
        const cellY = Math.floor(localV);
        const fracU = localU - cellX;
        const fracV = localV - cellY;

        // Scale shape — semicircle
        const scaleCenterX = 0.5;
        const scaleCenterY = 0.8;
        const dist = Math.sqrt((fracU - scaleCenterX) ** 2 + (fracV - scaleCenterY) ** 2);

        const isScaleEdge = dist > 0.45;
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.06;

        // Belly lighter
        const bellyFactor = Math.max(0, (v - 0.7) * 3.3);

        let r: number, g: number, b: number;
        if (isScaleEdge) {
          r = params.secondaryColor.r + colorNoise;
          g = params.secondaryColor.g + colorNoise;
          b = params.secondaryColor.b + colorNoise;
        } else {
          r = params.baseColor.r * (1 - bellyFactor) + 0.8 * bellyFactor + colorNoise;
          g = params.baseColor.g * (1 - bellyFactor) + 0.75 * bellyFactor + colorNoise;
          b = params.baseColor.b * (1 - bellyFactor) + 0.6 * bellyFactor + colorNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Fish Eye ---
  private drawFishEyeColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    // Similar to eyeball but with larger lens appearance
    const irisRadius = 0.4;
    const pupilRadius = 0.2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = (x / size) * 2 - 1;
        const v = (y / size) * 2 - 1;
        const dist = Math.sqrt(u * u + v * v);

        let r: number, g: number, b: number;
        if (dist > 0.95) {
          r = 0.01; g = 0.01; b = 0.01;
        } else if (dist > irisRadius) {
          r = 0.85; g = 0.88; b = 0.82;
        } else if (dist > pupilRadius) {
          const irisT = (dist - pupilRadius) / (irisRadius - pupilRadius);
          r = params.secondaryColor.r * (1 - irisT * 0.3);
          g = params.secondaryColor.g * (1 - irisT * 0.3);
          b = params.secondaryColor.b * (1 - irisT * 0.3);
        } else {
          r = 0; g = 0; b = 0;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Fish Fin ---
  private drawFishFinColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Fin rays
        const rayCount = 12 * params.patternScale;
        const ray = Math.sin(u * rayCount * Math.PI) * 0.1;

        // Translucency — thinner at edges
        const edgeFade = Math.min(u, 1 - u) * 4;
        const transparency = Math.min(1, edgeFade);

        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        const r = (params.baseColor.r + ray + n) * transparency;
        const g = (params.baseColor.g + ray * 0.7 + n) * transparency;
        const b = (params.baseColor.b + ray * 0.5 + n) * transparency;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Giraffe ---
  private drawGiraffeColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const patchScale = 10 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const scaleU = u * patchScale;
        const scaleV = v * patchScale;
        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        let secondMinDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              secondMinDist = minDist;
              minDist = dist;
            } else if (dist < secondMinDist) {
              secondMinDist = dist;
            }
          }
        }

        const edgeDist = secondMinDist - minDist;
        const isPatch = edgeDist < 0.06;
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        const color = isPatch ? params.secondaryColor : params.baseColor;
        const r = color.r + colorNoise;
        const g = color.g + colorNoise;
        const b = color.b + colorNoise;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Horn ---
  private drawHornColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const v = y / size;

        // Keratin rings along horn
        const ring = Math.sin(v * 80 * params.patternScale) * 0.08;
        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        // Tip darkening
        const tipFactor = (1 - v) * 0.2;

        const r = params.baseColor.r + ring + n - tipFactor;
        const g = params.baseColor.g + ring * 0.7 + n * 0.7 - tipFactor * 0.5;
        const b = params.baseColor.b + ring * 0.5 + n * 0.5 - tipFactor * 0.3;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Nose ---
  private drawNoseColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Soft skin with pore-like texture
        const poreNoise = noise.perlin2D(x * 0.04, y * 0.04);
        const isPore = poreNoise > 0.65;
        const poreDarken = isPore ? 0.08 : 0.0;

        const skinNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        const r = params.baseColor.r + skinNoise - poreDarken;
        const g = params.baseColor.g + skinNoise - poreDarken;
        const b = params.baseColor.b + skinNoise - poreDarken * 0.5;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Reptile Brown Circle ---
  private drawReptileBrownCircleColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const scaleFreq = 15 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Offset grid for scale pattern
        const row = Math.floor(v * scaleFreq);
        const colOffset = row % 2 === 0 ? 0 : 0.5 / scaleFreq;
        const localU = (u + colOffset) * scaleFreq;
        const localV = v * scaleFreq;

        const cellX = Math.floor(localU);
        const cellY = Math.floor(localV);
        const fracU = localU - cellX;
        const fracV = localV - cellY;

        const dist = Math.sqrt((fracU - 0.5) ** 2 + (fracV - 0.5) ** 2);
        const isEdge = dist > 0.42;

        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        let r: number, g: number, b: number;
        if (isEdge) {
          r = params.secondaryColor.r + n;
          g = params.secondaryColor.g + n;
          b = params.secondaryColor.b + n;
        } else {
          r = params.baseColor.r + n;
          g = params.baseColor.g + n;
          b = params.baseColor.b + n;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Reptile Gray ---
  private drawReptileGrayColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const scaleFreq = 18 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const row = Math.floor(v * scaleFreq);
        const colOffset = row % 2 === 0 ? 0 : 0.5 / scaleFreq;
        const localU = (u + colOffset) * scaleFreq;
        const localV = v * scaleFreq;

        const fracU = localU - Math.floor(localU);
        const fracV = localV - Math.floor(localV);

        const dist = Math.sqrt((fracU - 0.5) ** 2 + (fracV - 0.5) ** 2);
        const isEdge = dist > 0.44;

        const n = noise.perlin2D(x * 0.008, y * 0.008) * 0.06;

        let r: number, g: number, b: number;
        if (isEdge) {
          r = 0.3 + n; g = 0.3 + n; b = 0.3 + n;
        } else {
          r = 0.45 + n; g = 0.45 + n; b = 0.42 + n;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Reptile Two Color ---
  private drawReptileTwoColorColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const scaleFreq = 15 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const row = Math.floor(v * scaleFreq);
        const colOffset = row % 2 === 0 ? 0 : 0.5 / scaleFreq;
        const localU = (u + colOffset) * scaleFreq;
        const localV = v * scaleFreq;

        const cellX = Math.floor(localU);
        const cellY = Math.floor(localV);
        const fracU = localU - cellX;
        const fracV = localV - cellY;

        const dist = Math.sqrt((fracU - 0.5) ** 2 + (fracV - 0.5) ** 2);
        const isEdge = dist > 0.4;

        // Alternate color per cell
        const isColor2 = (cellX + cellY) % 3 === 0;
        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        let r: number, g: number, b: number;
        if (isEdge) {
          r = params.secondaryColor.r + n;
          g = params.secondaryColor.g + n;
          b = params.secondaryColor.b + n;
        } else if (isColor2) {
          r = params.tertiaryColor.r + n;
          g = params.tertiaryColor.g + n;
          b = params.tertiaryColor.b + n;
        } else {
          r = params.baseColor.r + n;
          g = params.baseColor.g + n;
          b = params.baseColor.b + n;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Snake ---
  private drawSnakeColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Smooth snake belly pattern — diamond/chevron
        const chevron = Math.sin((u + Math.abs(v - 0.5) * 2) * 20 * params.patternScale) * 0.1;
        const n = noise.perlin2D(u * 5, v * 5) * 0.08;

        // Belly lighter
        const bellyFactor = Math.max(0, 1 - Math.abs(v - 0.5) * 4);

        const r = params.baseColor.r + chevron + n + bellyFactor * 0.1;
        const g = params.baseColor.g + chevron * 0.7 + n * 0.8 + bellyFactor * 0.08;
        const b = params.baseColor.b + chevron * 0.5 + n * 0.5 + bellyFactor * 0.03;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Snake Scale ---
  private drawSnakeScaleColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const scaleFreq = 30 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Detailed snake scale — diamond-shaped
        const row = Math.floor(v * scaleFreq);
        const colOffset = row % 2 === 0 ? 0 : 0.25 / scaleFreq;
        const localU = (u + colOffset) * scaleFreq;
        const localV = v * scaleFreq;

        const fracU = localU - Math.floor(localU);
        const fracV = localV - Math.floor(localV);

        // Diamond distance
        const diamondDist = Math.abs(fracU - 0.5) + Math.abs(fracV - 0.5);
        const isEdge = diamondDist > 0.42;

        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        // Color variation per scale
        const scaleHash = noise.seededRandom(Math.floor(localU), Math.floor(localV));
        const colorVar = (scaleHash - 0.5) * 0.1;

        let r: number, g: number, b: number;
        if (isEdge) {
          r = params.secondaryColor.r + n;
          g = params.secondaryColor.g + n;
          b = params.secondaryColor.b + n;
        } else {
          r = params.baseColor.r + n + colorVar;
          g = params.baseColor.g + n + colorVar;
          b = params.baseColor.b + n + colorVar;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Tiger ---
  private drawTigerColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const stripeWidth = rng.nextFloat(0.08, 0.18);
    const stripeScale = rng.nextFloat(0.8, 1.5) * params.patternScale;
    const distortion = rng.nextFloat(0.5, 1.5);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const distort1 = noise.perlin2D(u * 5, v * 5) * distortion;
        const distort2 = noise.perlin2D(u * 10 + 3.7, v * 10 + 7.3) * distortion * 0.3;
        const stripeCoord = u * stripeScale * 10 + distort1 + distort2;
        const stripeVal = Math.sin(stripeCoord * Math.PI * 2);
        const stripeMask = stripeVal > (1 - stripeWidth * 6) ? 1 : 0;

        const bellyFactor = Math.max(0, (v - 0.7) * 3.3);
        const furNoise = noise.perlin2D(x * 0.08, y * 0.08) * 0.06;

        let r: number, g: number, b: number;
        if (stripeMask > 0.5) {
          r = params.secondaryColor.r;
          g = params.secondaryColor.g;
          b = params.secondaryColor.b;
        } else {
          r = params.baseColor.r * (1 - bellyFactor) + 0.95 * bellyFactor + furNoise;
          g = params.baseColor.g * (1 - bellyFactor) + 0.85 * bellyFactor + furNoise;
          b = params.baseColor.b * (1 - bellyFactor) + 0.6 * bellyFactor + furNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Tongue ---
  private drawTongueColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Pink/red with papillae texture
        const papillae = noise.perlin2D(x * 0.05, y * 0.05) * 0.08;
        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        // Center crease
        const u = x / size;
        const v = y / size;
        const creaseDist = Math.abs(u - 0.5);
        const crease = creaseDist < 0.02 ? 0.1 : 0;

        const r = params.baseColor.r + papillae + n - crease;
        const g = params.baseColor.g + papillae * 0.5 + n * 0.5 - crease * 0.5;
        const b = params.baseColor.b + papillae * 0.3 + n * 0.3 - crease * 0.3;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Two Color Spots ---
  private drawTwoColorSpotsColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const spotScale = 10 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Voronoi spots
        const scaleU = u * spotScale;
        const scaleV = v * spotScale;
        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            minDist = Math.min(minDist, dist);
          }
        }

        const isSpot = minDist < 0.35;
        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        const color = isSpot ? params.secondaryColor : params.baseColor;
        const r = color.r + n;
        const g = color.g + n;
        const b = color.b + n;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --- Three Color Spots ---
  private drawThreeColorSpotsColorMap(
    imageData: ImageData,
    size: number,
    params: CreatureVariantParams,
    noise: NoiseUtils,
  ): void {
    const spotScale = 10 * params.patternScale;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        const scaleU = u * spotScale;
        const scaleV = v * spotScale;
        const cellX = Math.floor(scaleU);
        const cellY = Math.floor(scaleV);

        let minDist = Infinity;
        let nearestCellX = 0;
        let nearestCellY = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx, ny);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 50, ny + 50);
            const dist = Math.sqrt((scaleU - fx) ** 2 + (scaleV - fy) ** 2);
            if (dist < minDist) {
              minDist = dist;
              nearestCellX = nx;
              nearestCellY = ny;
            }
          }
        }

        // Three color zones based on distance and cell hash
        const cellHash = noise.seededRandom(nearestCellX + 200, nearestCellY + 200);
        const n = noise.perlin2D(x * 0.01, y * 0.01) * 0.04;

        let color: Color;
        if (minDist < 0.25) {
          color = cellHash > 0.5 ? params.secondaryColor : params.tertiaryColor;
        } else {
          color = params.baseColor;
        }

        const r = color.r + n;
        const g = color.g + n;
        const b = color.b + n;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Normal Map
  // --------------------------------------------------------------------------

  private generateNormalMap(params: CreatureVariantParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Variant-specific normal detail
        let nx = 0, ny = 0;

        switch (params.variant) {
          case 'beak':
          case 'horn': {
            // Directional normals along Y
            nx = noise.perlin2D(x * 0.05, y * 0.01) * 0.15;
            ny = noise.perlin2D(x * 0.01, y * 0.05) * 0.1;
            break;
          }
          case 'eyeball':
          case 'fish_eye': {
            // Smooth sphere normals
            const u = (x / size) * 2 - 1;
            const v = (y / size) * 2 - 1;
            const r = Math.sqrt(u * u + v * v);
            if (r < 0.95) {
              nx = u * 0.3;
              ny = v * 0.3;
            }
            break;
          }
          case 'fish_body':
          case 'reptile_brown_circle':
          case 'reptile_gray':
          case 'reptile_two_color':
          case 'snake_scale': {
            // Scale bump normals
            nx = noise.perlin2D(x * 0.08, y * 0.08) * 0.3;
            ny = noise.perlin2D(x * 0.08 + 100, y * 0.08 + 100) * 0.25;
            break;
          }
          case 'chitin_detailed': {
            // Hard surface normals
            nx = noise.perlin2D(x * 0.06, y * 0.06) * 0.3;
            ny = noise.perlin2D(x * 0.06 + 100, y * 0.06 + 100) * 0.2;
            break;
          }
          case 'tiger':
          case 'giraffe':
          case 'two_color_spots':
          case 'three_color_spots': {
            // Fur normals
            nx = noise.perlin2D(x * 0.15, y * 0.05) * 0.25;
            ny = noise.perlin2D(x * 0.05, y * 0.15) * 0.15;
            break;
          }
          case 'tongue':
          case 'nose': {
            // Soft skin normals
            nx = noise.perlin2D(x * 0.04, y * 0.04) * 0.15;
            ny = noise.perlin2D(x * 0.04 + 50, y * 0.04 + 50) * 0.1;
            break;
          }
          case 'bone': {
            nx = noise.perlin2D(x * 0.03, y * 0.03) * 0.1;
            ny = noise.perlin2D(x * 0.03 + 50, y * 0.03 + 50) * 0.08;
            break;
          }
          default: {
            nx = noise.perlin2D(x * 0.05, y * 0.05) * 0.2;
            ny = noise.perlin2D(x * 0.05 + 50, y * 0.05 + 50) * 0.15;
          }
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;

    // Set normal scale for some variants
    return texture;
  }

  // --------------------------------------------------------------------------
  // Roughness Map
  // --------------------------------------------------------------------------

  private generateRoughnessMap(params: CreatureVariantParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const baseValue = Math.floor(params.roughness * 255);
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        let n = noise.perlin2D(x / 60, y / 60) * 20;

        // Eyeball and mirror variants are very smooth
        if (params.variant === 'eyeball' || params.variant === 'fish_eye') {
          n -= 60;
        }
        // Wet variants (tongue, nose) are smoother
        if (params.variant === 'tongue' || params.variant === 'nose') {
          n -= 30;
        }
        // Chitin is moderately smooth
        if (params.variant === 'chitin_detailed') {
          n -= 15;
        }

        const value = Math.max(0, Math.min(255, baseValue + n));
        imageData.data[idx] = value;
        imageData.data[idx + 1] = value;
        imageData.data[idx + 2] = value;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Variations & Presets
  // --------------------------------------------------------------------------

  getVariations(count: number): CreatureVariantParams[] {
    const variants: CreatureVariantType[] = [
      'beak', 'bone', 'chitin_detailed', 'eyeball', 'fish_body',
      'fish_eye', 'fish_fin', 'giraffe', 'horn', 'nose',
      'reptile_brown_circle', 'reptile_gray', 'reptile_two_color',
      'snake', 'snake_scale', 'tiger', 'tongue',
      'two_color_spots', 'three_color_spots',
    ];

    const results: CreatureVariantParams[] = [];
    for (let i = 0; i < count; i++) {
      const variant = variants[this.rng.nextInt(0, variants.length - 1)];
      const preset = CreatureVariants.createPreset(variant);
      results.push({
        ...CreatureVariants.DEFAULT_PARAMS,
        ...preset,
      });
    }
    return results;
  }

  static createPreset(preset: CreatureVariantType): Partial<CreatureVariantParams> {
    switch (preset) {
      case 'beak':
        return {
          variant: 'beak',
          baseColor: new Color(0.5, 0.35, 0.15),
          secondaryColor: new Color(0.3, 0.2, 0.08),
          roughness: 0.4,
          clearcoat: 0.3,
          patternScale: 1.0,
        };
      case 'bone':
        return {
          variant: 'bone',
          baseColor: new Color(0.95, 0.92, 0.85),
          secondaryColor: new Color(0.8, 0.75, 0.65),
          roughness: 0.5,
          subsurfaceAmount: 0.2,
          subsurfaceColor: new Color(0.9, 0.85, 0.7),
        };
      case 'chitin_detailed':
        return {
          variant: 'chitin_detailed',
          baseColor: new Color(0.12, 0.08, 0.04),
          secondaryColor: new Color(0.02, 0.01, 0.005),
          tertiaryColor: new Color(0.2, 0.15, 0.08),
          roughness: 0.35,
          clearcoat: 0.4,
          metalness: 0.1,
          patternScale: 1.0,
        };
      case 'eyeball':
        return {
          variant: 'eyeball',
          baseColor: new Color(0.9, 0.88, 0.82),
          secondaryColor: new Color(0.35, 0.25, 0.1),
          roughness: 0.03,
          clearcoat: 1.0,
        };
      case 'fish_body':
        return {
          variant: 'fish_body',
          baseColor: new Color(0.5, 0.55, 0.45),
          secondaryColor: new Color(0.35, 0.38, 0.3),
          roughness: 0.3,
          clearcoat: 0.5,
          patternScale: 1.0,
        };
      case 'fish_eye':
        return {
          variant: 'fish_eye',
          baseColor: new Color(0.9, 0.88, 0.82),
          secondaryColor: new Color(0.4, 0.5, 0.15),
          roughness: 0.02,
          clearcoat: 1.0,
        };
      case 'fish_fin':
        return {
          variant: 'fish_fin',
          baseColor: new Color(0.6, 0.55, 0.4),
          secondaryColor: new Color(0.4, 0.35, 0.25),
          roughness: 0.4,
          subsurfaceAmount: 0.4,
          subsurfaceColor: new Color(0.8, 0.7, 0.4),
          patternScale: 1.0,
        };
      case 'giraffe':
        return {
          variant: 'giraffe',
          baseColor: new Color(0.93, 0.75, 0.45),
          secondaryColor: new Color(0.4, 0.22, 0.08),
          tertiaryColor: new Color(0.65, 0.45, 0.2),
          roughness: 0.75,
          patternScale: 1.0,
        };
      case 'horn':
        return {
          variant: 'horn',
          baseColor: new Color(0.6, 0.5, 0.35),
          secondaryColor: new Color(0.4, 0.3, 0.2),
          roughness: 0.4,
          patternScale: 1.0,
        };
      case 'nose':
        return {
          variant: 'nose',
          baseColor: new Color(0.25, 0.18, 0.15),
          secondaryColor: new Color(0.15, 0.1, 0.08),
          roughness: 0.5,
          subsurfaceAmount: 0.3,
          subsurfaceColor: new Color(0.7, 0.3, 0.2),
        };
      case 'reptile_brown_circle':
        return {
          variant: 'reptile_brown_circle',
          baseColor: new Color(0.45, 0.32, 0.15),
          secondaryColor: new Color(0.3, 0.2, 0.08),
          roughness: 0.6,
          patternScale: 1.0,
        };
      case 'reptile_gray':
        return {
          variant: 'reptile_gray',
          baseColor: new Color(0.45, 0.45, 0.42),
          secondaryColor: new Color(0.3, 0.3, 0.3),
          roughness: 0.55,
          patternScale: 1.0,
        };
      case 'reptile_two_color':
        return {
          variant: 'reptile_two_color',
          baseColor: new Color(0.4, 0.35, 0.2),
          secondaryColor: new Color(0.25, 0.18, 0.08),
          tertiaryColor: new Color(0.5, 0.42, 0.25),
          roughness: 0.6,
          patternScale: 1.0,
        };
      case 'snake':
        return {
          variant: 'snake',
          baseColor: new Color(0.35, 0.4, 0.2),
          secondaryColor: new Color(0.2, 0.22, 0.1),
          roughness: 0.4,
          clearcoat: 0.3,
          patternScale: 1.0,
        };
      case 'snake_scale':
        return {
          variant: 'snake_scale',
          baseColor: new Color(0.3, 0.35, 0.18),
          secondaryColor: new Color(0.18, 0.2, 0.08),
          roughness: 0.35,
          clearcoat: 0.35,
          patternScale: 1.0,
        };
      case 'tiger':
        return {
          variant: 'tiger',
          baseColor: new Color(0.85, 0.55, 0.15),
          secondaryColor: new Color(0.05, 0.03, 0.02),
          tertiaryColor: new Color(0.95, 0.85, 0.6),
          roughness: 0.75,
          subsurfaceAmount: 0.15,
          subsurfaceColor: new Color(0.9, 0.4, 0.15),
          patternScale: 1.0,
        };
      case 'tongue':
        return {
          variant: 'tongue',
          baseColor: new Color(0.85, 0.3, 0.3),
          secondaryColor: new Color(0.7, 0.2, 0.2),
          roughness: 0.45,
          subsurfaceAmount: 0.4,
          subsurfaceColor: new Color(0.9, 0.3, 0.3),
        };
      case 'two_color_spots':
        return {
          variant: 'two_color_spots',
          baseColor: new Color(0.6, 0.55, 0.35),
          secondaryColor: new Color(0.35, 0.25, 0.12),
          roughness: 0.75,
          patternScale: 1.0,
        };
      case 'three_color_spots':
        return {
          variant: 'three_color_spots',
          baseColor: new Color(0.55, 0.5, 0.35),
          secondaryColor: new Color(0.35, 0.22, 0.1),
          tertiaryColor: new Color(0.25, 0.18, 0.08),
          roughness: 0.75,
          patternScale: 1.0,
        };
      default:
        return {};
    }
  }
}
