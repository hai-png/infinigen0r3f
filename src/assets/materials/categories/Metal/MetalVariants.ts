import { createCanvas } from '../../../utils/CanvasUtils';
/**
 * Metal Material Variants
 *
 * Expanded metal materials ported from original Infinigen:
 * BrushedMetal, BrushedBlackMetal, GalvanizedMetal, GrainedMetal,
 * GrainedAndPolishedMetal, HammeredMetal, Mirror, Aluminum,
 * Appliance, WhiteMetal
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
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { NoiseUtils } from '../../../../core/util/math/noise';

// ============================================================================
// Shared Types
// ============================================================================

export type MetalVariantType =
  | 'brushed_metal'
  | 'brushed_black_metal'
  | 'galvanized_metal'
  | 'grained_metal'
  | 'grained_polished_metal'
  | 'hammered_metal'
  | 'mirror'
  | 'aluminum'
  | 'appliance'
  | 'white_metal';

export interface MetalVariantParams {
  [key: string]: unknown;
  variant: MetalVariantType;
  color: Color;
  roughness: number;
  metalness: number;
  brushDirection: number; // radians
  brushIntensity: number;
  grainScale: number;
  hammerScale: number;
  oxidation: number;
  clearcoat: number;
}

// ============================================================================
// MetalVariants Generator
// ============================================================================

export class MetalVariants extends BaseMaterialGenerator<MetalVariantParams> {
  private static readonly DEFAULT_PARAMS: MetalVariantParams = {
    variant: 'brushed_metal',
    color: new Color(0x888888),
    roughness: 0.3,
    metalness: 1.0,
    brushDirection: 0,
    brushIntensity: 0.5,
    grainScale: 1.0,
    hammerScale: 1.0,
    oxidation: 0.0,
    clearcoat: 0.0,
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): MetalVariantParams {
    return { ...MetalVariants.DEFAULT_PARAMS };
  }

  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 1.0,
    });
  }

  generate(params: Partial<MetalVariantParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(MetalVariants.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    // Use MeshPhysicalMaterial for variants needing clearcoat
    const usePhysical = finalParams.clearcoat > 0 || finalParams.variant === 'mirror';
    const material = usePhysical
      ? new MeshPhysicalMaterial({
          color: finalParams.color,
          roughness: finalParams.roughness,
          metalness: finalParams.metalness,
          clearcoat: finalParams.clearcoat,
          clearcoatRoughness: 0.05,
        })
      : new MeshStandardMaterial({
          color: finalParams.color,
          roughness: finalParams.roughness,
          metalness: finalParams.metalness,
        });

    // Variant-specific adjustments
    this.applyVariantDefaults(material, finalParams);

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
  // Variant Defaults
  // --------------------------------------------------------------------------

  private applyVariantDefaults(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: MetalVariantParams,
  ): void {
    switch (params.variant) {
      case 'brushed_metal':
        material.roughness = 0.25;
        break;
      case 'brushed_black_metal':
        material.roughness = 0.3;
        material.color = new Color(0x1a1a1a);
        break;
      case 'galvanized_metal':
        material.roughness = 0.45;
        break;
      case 'grained_metal':
        material.roughness = 0.4;
        break;
      case 'grained_polished_metal':
        material.roughness = 0.15;
        break;
      case 'hammered_metal':
        material.roughness = 0.35;
        break;
      case 'mirror':
        material.roughness = 0.0;
        if (material instanceof MeshPhysicalMaterial) {
          material.clearcoat = 1.0;
          material.clearcoatRoughness = 0.0;
        }
        break;
      case 'aluminum':
        material.roughness = 0.35;
        material.color = new Color(0xd4d4d4);
        break;
      case 'appliance':
        material.roughness = 0.2;
        material.color = new Color(0xe8e8e8);
        break;
      case 'white_metal':
        material.roughness = 0.4;
        material.color = new Color(0xf0efe8);
        material.metalness = 0.6;
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Color Map
  // --------------------------------------------------------------------------

  private generateColorMap(params: MetalVariantParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new NoiseUtils(rng.seed);

    switch (params.variant) {
      case 'brushed_metal':
      case 'brushed_black_metal':
        this.drawBrushedColorMap(ctx, size, params, noise);
        break;
      case 'galvanized_metal':
        this.drawGalvanizedColorMap(ctx, size, params, noise, rng);
        break;
      case 'grained_metal':
      case 'grained_polished_metal':
        this.drawGrainedColorMap(ctx, size, params, noise);
        break;
      case 'hammered_metal':
        this.drawHammeredColorMap(ctx, size, params, noise, rng);
        break;
      case 'mirror':
        this.drawMirrorColorMap(ctx, size, params, noise);
        break;
      case 'aluminum':
        this.drawAluminumColorMap(ctx, size, params, noise);
        break;
      case 'appliance':
        this.drawApplianceColorMap(ctx, size, params, noise);
        break;
      case 'white_metal':
        this.drawWhiteMetalColorMap(ctx, size, params, noise);
        break;
      default:
        ctx.fillStyle = `#${params.color.getHexString()}`;
        ctx.fillRect(0, 0, size, size);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Variant Color Map Implementations
  // --------------------------------------------------------------------------

  private drawBrushedColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);
    const dir = params.brushDirection;
    const isVertical = Math.abs(Math.sin(dir)) > Math.abs(Math.cos(dir));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const along = isVertical ? y : x;
        const across = isVertical ? x : y;

        // Fine parallel scratches along brush direction
        const scratch = Math.sin(along * 0.8) * 4 + noise.perlin2D(along / 30, across / 200) * 8;
        const n = noise.perlin2D(x / 60, y / 60) * 6;

        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + scratch + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + scratch + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + scratch + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawGalvanizedColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Spangle / crystalline pattern using Voronoi
        const scale = 12 * params.grainScale;
        const cellX = Math.floor(x / size * scale);
        const cellY = Math.floor(y / size * scale);

        let minDist = Infinity;
        let secondDist = Infinity;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nx = cellX + dx;
            const ny = cellY + dy;
            const hash = noise.seededRandom(nx + 50, ny + 50);
            const fx = nx + hash;
            const fy = ny + noise.seededRandom(nx + 100, ny + 100);
            const dist = Math.sqrt(
              (x / size * scale - fx) ** 2 +
              (y / size * scale - fy) ** 2,
            );
            if (dist < minDist) {
              secondDist = minDist;
              minDist = dist;
            } else if (dist < secondDist) {
              secondDist = dist;
            }
          }
        }

        // Crystalline variation within each spangle
        const spangle = noise.perlin2D(x / 20, y / 20) * 8;
        const edge = (secondDist - minDist) * 40;
        const n = spangle + edge;

        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawGrainedColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Fine grain — small-scale noise
        const grain = noise.perlin2D(x / 15 * params.grainScale, y / 15 * params.grainScale) * 12;
        const coarse = noise.perlin2D(x / 60, y / 60) * 5;
        const n = grain + coarse;

        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawHammeredColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.createImageData(size, size);
    const dimpleCount = Math.floor(40 * params.hammerScale);

    // Pre-generate dimple centers
    const dimples: Array<{ cx: number; cy: number; r: number }> = [];
    for (let i = 0; i < dimpleCount; i++) {
      dimples.push({
        cx: rng.nextFloat() * size,
        cy: rng.nextFloat() * size,
        r: 8 + rng.nextFloat() * 15,
      });
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Base noise
        let n = noise.perlin2D(x / 60, y / 60) * 8;

        // Dimple influence
        for (const d of dimples) {
          const dist = Math.sqrt((x - d.cx) ** 2 + (y - d.cy) ** 2);
          if (dist < d.r) {
            const t = dist / d.r;
            // Dimple: darker in center, bright rim
            n += (1 - t * t) * -15 + (t > 0.8 ? (t - 0.8) * 50 : 0);
          }
        }

        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawMirrorColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Near-perfect mirror — extremely subtle variation
        const n = noise.perlin2D(x / 100, y / 100) * 2;
        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawAluminumColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n = noise.perlin2D(x / 50, y / 50) * 10;
        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawApplianceColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Appliance white/chrome — very smooth with subtle noise
        const n = noise.perlin2D(x / 80, y / 80) * 5;
        const r = Math.min(255, Math.max(0, Math.floor(params.color.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(params.color.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(params.color.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawWhiteMetalColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Whitewashed metal — paint with metal showing through
        const paintWear = noise.perlin2D(x / 40, y / 40);
        const isWorn = paintWear > 0.4;
        const baseColor = isWorn ? new Color(0x999999) : params.color;
        const n = noise.perlin2D(x / 50, y / 50) * 8;

        const r = Math.min(255, Math.max(0, Math.floor(baseColor.r * 255 + n)));
        const g = Math.min(255, Math.max(0, Math.floor(baseColor.g * 255 + n)));
        const b = Math.min(255, Math.max(0, Math.floor(baseColor.b * 255 + n)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // --------------------------------------------------------------------------
  // Normal Map
  // --------------------------------------------------------------------------

  private generateNormalMap(params: MetalVariantParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    switch (params.variant) {
      case 'brushed_metal':
      case 'brushed_black_metal':
        this.drawBrushedNormals(imageData, size, params, noise);
        break;
      case 'galvanized_metal':
        this.drawGalvanizedNormals(imageData, size, params, noise);
        break;
      case 'grained_metal':
      case 'grained_polished_metal':
        this.drawGrainedNormals(imageData, size, params, noise);
        break;
      case 'hammered_metal':
        this.drawHammeredNormals(imageData, size, params, noise, rng);
        break;
      case 'mirror':
        // Near-flat normal map
        for (let i = 0; i < size * size * 4; i += 4) {
          imageData.data[i] = 128;
          imageData.data[i + 1] = 128;
          imageData.data[i + 2] = 255;
          imageData.data[i + 3] = 255;
        }
        break;
      default:
        this.drawDefaultMetalNormals(imageData, size, params, noise);
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private drawBrushedNormals(
    imageData: ImageData,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    const dir = params.brushDirection;
    const isVertical = Math.abs(Math.sin(dir)) > Math.abs(Math.cos(dir));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const along = isVertical ? y : x;

        const scratchN = Math.sin(along * 0.8) * 0.05 + noise.perlin2D(along / 30, 0) * 0.03;
        const nx = isVertical ? scratchN : 0;
        const ny = isVertical ? 0 : scratchN;

        imageData.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }
  }

  private drawGalvanizedNormals(
    imageData: ImageData,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        const nx = noise.perlin2D(x / 15 * params.grainScale, y / 15 * params.grainScale) * 0.2;
        const ny = noise.perlin2D(x / 15 * params.grainScale + 50, y / 15 * params.grainScale + 50) * 0.2;

        imageData.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }
  }

  private drawGrainedNormals(
    imageData: ImageData,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        const nx = noise.perlin2D(x / 10 * params.grainScale, y / 10 * params.grainScale) * 0.15;
        const ny = noise.perlin2D(x / 10 * params.grainScale + 100, y / 10 * params.grainScale + 100) * 0.15;

        imageData.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }
  }

  private drawHammeredNormals(
    imageData: ImageData,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
    rng: SeededRandom,
  ): void {
    const dimpleCount = Math.floor(40 * params.hammerScale);
    const dimples: Array<{ cx: number; cy: number; r: number }> = [];
    for (let i = 0; i < dimpleCount; i++) {
      dimples.push({
        cx: rng.nextFloat() * size,
        cy: rng.nextFloat() * size,
        r: 8 + rng.nextFloat() * 15,
      });
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        let nx = noise.perlin2D(x / 60, y / 60) * 0.1;
        let ny = noise.perlin2D(x / 60 + 50, y / 60 + 50) * 0.1;

        for (const d of dimples) {
          const dist = Math.sqrt((x - d.cx) ** 2 + (y - d.cy) ** 2);
          if (dist < d.r) {
            const t = dist / d.r;
            const dimpleNx = (x - d.cx) / d.r * (1 - t) * 0.4;
            const dimpleNy = (y - d.cy) / d.r * (1 - t) * 0.4;
            nx += dimpleNx;
            ny += dimpleNy;
          }
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }
  }

  private drawDefaultMetalNormals(
    imageData: ImageData,
    size: number,
    params: MetalVariantParams,
    noise: NoiseUtils,
  ): void {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = noise.perlin2D(x / 80, y / 80) * 0.08;
        const ny = noise.perlin2D(x / 80 + 50, y / 80 + 50) * 0.08;

        imageData.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = 255;
        imageData.data[idx + 3] = 255;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Roughness Map
  // --------------------------------------------------------------------------

  private generateRoughnessMap(params: MetalVariantParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const base = Math.floor(params.roughness * 255);
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        let n = noise.perlin2D(x / 40, y / 40) * 20;

        // Polished areas for grained_polished
        if (params.variant === 'grained_polished_metal') {
          const polishMask = noise.perlin2D(x / 100, y / 100);
          if (polishMask > 0.2) {
            n -= 40;
          }
        }

        const value = Math.max(0, Math.min(255, base + n));
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

  getVariations(count: number): MetalVariantParams[] {
    const variants: MetalVariantType[] = [
      'brushed_metal', 'brushed_black_metal', 'galvanized_metal',
      'grained_metal', 'grained_polished_metal', 'hammered_metal',
      'mirror', 'aluminum', 'appliance', 'white_metal',
    ];

    const results: MetalVariantParams[] = [];
    for (let i = 0; i < count; i++) {
      const variant = variants[this.rng.nextInt(0, variants.length - 1)];
      results.push({
        variant,
        color: new Color().setHSL(0, 0, 0.3 + this.rng.nextFloat() * 0.5),
        roughness: 0.05 + this.rng.nextFloat() * 0.4,
        metalness: 0.8 + this.rng.nextFloat() * 0.2,
        brushDirection: this.rng.nextFloat() * Math.PI,
        brushIntensity: 0.3 + this.rng.nextFloat() * 0.5,
        grainScale: 0.5 + this.rng.nextFloat() * 1.5,
        hammerScale: 0.5 + this.rng.nextFloat() * 1.5,
        oxidation: this.rng.nextFloat() * 0.3,
        clearcoat: variant === 'mirror' ? 1.0 : this.rng.nextFloat() * 0.3,
      });
    }
    return results;
  }

  static createPreset(preset: MetalVariantType): Partial<MetalVariantParams> {
    switch (preset) {
      case 'brushed_metal':
        return {
          variant: 'brushed_metal',
          color: new Color(0xaaaaaa),
          roughness: 0.25,
          metalness: 1.0,
          brushDirection: 0,
          brushIntensity: 0.5,
        };
      case 'brushed_black_metal':
        return {
          variant: 'brushed_black_metal',
          color: new Color(0x1a1a1a),
          roughness: 0.3,
          metalness: 0.95,
          brushDirection: 0,
          brushIntensity: 0.6,
        };
      case 'galvanized_metal':
        return {
          variant: 'galvanized_metal',
          color: new Color(0xb8b8b8),
          roughness: 0.45,
          metalness: 0.9,
          grainScale: 1.0,
        };
      case 'grained_metal':
        return {
          variant: 'grained_metal',
          color: new Color(0x999999),
          roughness: 0.4,
          metalness: 1.0,
          grainScale: 1.0,
        };
      case 'grained_polished_metal':
        return {
          variant: 'grained_polished_metal',
          color: new Color(0xbbbbbb),
          roughness: 0.15,
          metalness: 1.0,
          grainScale: 0.8,
        };
      case 'hammered_metal':
        return {
          variant: 'hammered_metal',
          color: new Color(0x8a8a8a),
          roughness: 0.35,
          metalness: 0.95,
          hammerScale: 1.0,
        };
      case 'mirror':
        return {
          variant: 'mirror',
          color: new Color(0xffffff),
          roughness: 0.0,
          metalness: 1.0,
          clearcoat: 1.0,
        };
      case 'aluminum':
        return {
          variant: 'aluminum',
          color: new Color(0xd4d4d4),
          roughness: 0.35,
          metalness: 0.95,
        };
      case 'appliance':
        return {
          variant: 'appliance',
          color: new Color(0xe8e8e8),
          roughness: 0.2,
          metalness: 0.85,
          clearcoat: 0.5,
        };
      case 'white_metal':
        return {
          variant: 'white_metal',
          color: new Color(0xf0efe8),
          roughness: 0.4,
          metalness: 0.6,
        };
      default:
        return {};
    }
  }
}
