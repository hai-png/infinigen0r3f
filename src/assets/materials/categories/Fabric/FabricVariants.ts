import { createCanvas } from '../../../utils/CanvasUtils';
/**
 * Fabric Material Variants
 *
 * Expanded fabric materials ported from original Infinigen:
 * CoarseKnitFabric, FineKnitFabric, LinedFabric, PlaidFabric,
 * Rug, SofaFabric, Velvet
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

export type FabricVariantType =
  | 'coarse_knit'
  | 'fine_knit'
  | 'lined'
  | 'plaid'
  | 'rug'
  | 'sofa_fabric'
  | 'velvet';

export interface FabricVariantParams {
  [key: string]: unknown;
  variant: FabricVariantType;
  color: Color;
  secondaryColor: Color;
  tertiaryColor: Color;
  roughness: number;
  weaveScale: number;
  patternScale: number;
  loopSize: number;
  pileHeight: number;
  wearLevel: number;
  sheenAmount: number;
}

// ============================================================================
// FabricVariants Generator
// ============================================================================

export class FabricVariants extends BaseMaterialGenerator<FabricVariantParams> {
  private static readonly DEFAULT_PARAMS: FabricVariantParams = {
    variant: 'coarse_knit',
    color: new Color(0x888888),
    secondaryColor: new Color(0x666666),
    tertiaryColor: new Color(0x444444),
    roughness: 0.7,
    weaveScale: 1.0,
    patternScale: 1.0,
    loopSize: 1.0,
    pileHeight: 1.0,
    wearLevel: 0.0,
    sheenAmount: 0.0,
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): FabricVariantParams {
    return { ...FabricVariants.DEFAULT_PARAMS };
  }

  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.7,
      metalness: 0.0,
    });
  }

  generate(params: Partial<FabricVariantParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(FabricVariants.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    // Use MeshPhysicalMaterial for velvet sheen
    const usePhysical = finalParams.variant === 'velvet' || finalParams.sheenAmount > 0;
    const material = usePhysical
      ? new MeshPhysicalMaterial({
          color: finalParams.color,
          roughness: finalParams.roughness,
          metalness: 0.0,
          sheen: finalParams.sheenAmount > 0 ? finalParams.sheenAmount : (finalParams.variant === 'velvet' ? 0.8 : 0),
          sheenRoughness: 0.5,
          sheenColor: finalParams.color.clone().multiplyScalar(1.3),
        })
      : new MeshStandardMaterial({
          color: finalParams.color,
          roughness: finalParams.roughness,
          metalness: 0.0,
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
    params: FabricVariantParams,
  ): void {
    switch (params.variant) {
      case 'coarse_knit':
        material.roughness = 0.85;
        break;
      case 'fine_knit':
        material.roughness = 0.8;
        break;
      case 'lined':
        material.roughness = 0.65;
        break;
      case 'plaid':
        material.roughness = 0.7;
        break;
      case 'rug':
        material.roughness = 0.9;
        break;
      case 'sofa_fabric':
        material.roughness = 0.75;
        break;
      case 'velvet':
        material.roughness = 0.5;
        break;
    }

    if (params.wearLevel > 0) {
      material.roughness = Math.min(1.0, material.roughness + params.wearLevel * 0.15);
    }
  }

  // --------------------------------------------------------------------------
  // Color Map
  // --------------------------------------------------------------------------

  private generateColorMap(params: FabricVariantParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    switch (params.variant) {
      case 'coarse_knit':
        this.drawCoarseKnitColorMap(ctx, size, params, rng);
        break;
      case 'fine_knit':
        this.drawFineKnitColorMap(ctx, size, params, rng);
        break;
      case 'lined':
        this.drawLinedColorMap(ctx, size, params, rng);
        break;
      case 'plaid':
        this.drawPlaidColorMap(ctx, size, params, rng);
        break;
      case 'rug':
        this.drawRugColorMap(ctx, size, params, rng);
        break;
      case 'sofa_fabric':
        this.drawSofaFabricColorMap(ctx, size, params, rng);
        break;
      case 'velvet':
        this.drawVelvetColorMap(ctx, size, params, rng);
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

  private drawCoarseKnitColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const loopRadius = 12 * params.loopSize;
    const rowSpacing = loopRadius * 2.2;
    const colSpacing = loopRadius * 1.2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const row = Math.floor(y / rowSpacing);
        const col = Math.floor(x / colSpacing);
        const offsetX = row % 2 === 0 ? 0 : colSpacing / 2;

        // Loop center
        const cx = col * colSpacing + offsetX + colSpacing / 2;
        const cy = row * rowSpacing + rowSpacing / 2;

        // Distance to nearest loop center (horizontal oval)
        const dx = (x - cx) / loopRadius;
        const dy = (y - cy) / (loopRadius * 0.7);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Loop pattern: inside loop is darker (shadow), yarn is lighter
        const isYarn = dist < 1.2 && dist > 0.4;
        const isShadow = dist <= 0.4;

        const colorNoise = noise.perlin2D(x * 0.008, y * 0.008) * 0.08;

        let r: number, g: number, b: number;
        if (isShadow) {
          r = params.color.r * 0.7 + colorNoise;
          g = params.color.g * 0.7 + colorNoise;
          b = params.color.b * 0.7 + colorNoise;
        } else if (isYarn) {
          r = params.color.r * 1.05 + colorNoise;
          g = params.color.g * 1.05 + colorNoise;
          b = params.color.b * 1.05 + colorNoise;
        } else {
          r = params.color.r * 0.9 + colorNoise;
          g = params.color.g * 0.9 + colorNoise;
          b = params.color.b * 0.9 + colorNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawFineKnitColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const loopRadius = 5 * params.loopSize;
    const rowSpacing = loopRadius * 2.0;
    const colSpacing = loopRadius * 1.1;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const row = Math.floor(y / rowSpacing);
        const col = Math.floor(x / colSpacing);
        const offsetX = row % 2 === 0 ? 0 : colSpacing / 2;

        const cx = col * colSpacing + offsetX + colSpacing / 2;
        const cy = row * rowSpacing + rowSpacing / 2;

        const dx = (x - cx) / loopRadius;
        const dy = (y - cy) / (loopRadius * 0.6);
        const dist = Math.sqrt(dx * dx + dy * dy);

        const isYarn = dist < 1.0 && dist > 0.3;
        const isShadow = dist <= 0.3;

        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.06;

        let r: number, g: number, b: number;
        if (isShadow) {
          r = params.color.r * 0.75 + colorNoise;
          g = params.color.g * 0.75 + colorNoise;
          b = params.color.b * 0.75 + colorNoise;
        } else if (isYarn) {
          r = params.color.r * 1.03 + colorNoise;
          g = params.color.g * 1.03 + colorNoise;
          b = params.color.b * 1.03 + colorNoise;
        } else {
          r = params.color.r * 0.92 + colorNoise;
          g = params.color.g * 0.92 + colorNoise;
          b = params.color.b * 0.92 + colorNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawLinedColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const lineWidth = Math.floor(8 / params.patternScale);
    const lineSpacing = Math.floor(30 / params.patternScale);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Pinstripe pattern
        const stripePos = x % lineSpacing;
        const isLine = stripePos < lineWidth || stripePos > lineSpacing - lineWidth / 2;

        // Subtle fabric noise
        const fabricNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.06;

        const color = isLine ? params.secondaryColor : params.color;
        const r = color.r + fabricNoise;
        const g = color.g + fabricNoise;
        const b = color.b + fabricNoise;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawPlaidColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const bandWidth = Math.floor(40 / params.patternScale);
    const bandSpacing = Math.floor(80 / params.patternScale);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Horizontal bands
        const hPos = y % bandSpacing;
        const isHBand = hPos < bandWidth;
        const isHThinBand = hPos >= bandWidth && hPos < bandWidth + bandWidth / 4;

        // Vertical bands
        const vPos = x % bandSpacing;
        const isVBand = vPos < bandWidth;
        const isVThinBand = vPos >= bandWidth && vPos < bandWidth + bandWidth / 4;

        // Plaid intersection logic
        let r: number, g: number, b: number;
        const fabricNoise = noise.perlin2D(x * 0.015, y * 0.015) * 0.05;

        if ((isHBand || isHThinBand) && (isVBand || isVThinBand)) {
          // Crossing area — darkest
          const crossColor = params.tertiaryColor;
          r = crossColor.r + fabricNoise;
          g = crossColor.g + fabricNoise;
          b = crossColor.b + fabricNoise;
        } else if (isHBand || isHThinBand) {
          r = params.secondaryColor.r + fabricNoise;
          g = params.secondaryColor.g + fabricNoise;
          b = params.secondaryColor.b + fabricNoise;
        } else if (isVBand || isVThinBand) {
          r = params.secondaryColor.r + fabricNoise;
          g = params.secondaryColor.g + fabricNoise;
          b = params.secondaryColor.b + fabricNoise;
        } else {
          r = params.color.r + fabricNoise;
          g = params.color.g + fabricNoise;
          b = params.color.b + fabricNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawRugColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Thick pile — large-scale noise for pile variation
        const pileNoise = noise.perlin2D(x * 0.005 * params.pileHeight, y * 0.005 * params.pileHeight) * 0.15;

        // Border pattern
        const u = x / size;
        const v = y / size;
        const borderWidth = 0.1;
        const isBorder =
          u < borderWidth || u > 1 - borderWidth ||
          v < borderWidth || v > 1 - borderWidth;
        const isInnerBorder =
          u < borderWidth * 0.6 || u > 1 - borderWidth * 0.6 ||
          v < borderWidth * 0.6 || v > 1 - borderWidth * 0.6;

        const fineNoise = noise.perlin2D(x * 0.03, y * 0.03) * 0.08;

        let r: number, g: number, b: number;
        if (isInnerBorder) {
          r = params.tertiaryColor.r + pileNoise + fineNoise;
          g = params.tertiaryColor.g + pileNoise + fineNoise;
          b = params.tertiaryColor.b + pileNoise + fineNoise;
        } else if (isBorder) {
          r = params.secondaryColor.r + pileNoise + fineNoise;
          g = params.secondaryColor.g + pileNoise + fineNoise;
          b = params.secondaryColor.b + pileNoise + fineNoise;
        } else {
          r = params.color.r + pileNoise + fineNoise;
          g = params.color.g + pileNoise + fineNoise;
          b = params.color.b + pileNoise + fineNoise;
        }

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawSofaFabricColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const threadSpacing = Math.floor(8 * params.weaveScale);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Tight woven upholstery fabric
        const threadX = (x % threadSpacing) / threadSpacing;
        const threadY = (y % threadSpacing) / threadSpacing;

        // Weave pattern
        const isWarp = (Math.floor(x / threadSpacing) + Math.floor(y / threadSpacing)) % 2 === 0;
        const brightness = isWarp ? 1.05 : 0.95;

        // Wear patches
        const wearNoise = noise.perlin2D(x * 0.003, y * 0.003);
        const isWorn = wearNoise > (0.5 - params.wearLevel * 0.4);
        const wearFactor = isWorn ? 0.85 : 1.0;

        // Fabric color noise
        const colorNoise = noise.perlin2D(x * 0.01, y * 0.01) * 0.05;

        const r = params.color.r * brightness * wearFactor + colorNoise;
        const g = params.color.g * brightness * wearFactor + colorNoise;
        const b = params.color.b * brightness * wearFactor + colorNoise;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawVelvetColorMap(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: FabricVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Velvet — very fine, dense pile with directional sheen
        const pileNoise = noise.perlin2D(x * 0.02, y * 0.02) * 0.04;

        // Directional lighting effect (simulate pile direction)
        const gradient = (y / size - 0.5) * 0.1;

        const r = params.color.r + pileNoise + gradient;
        const g = params.color.g + pileNoise + gradient;
        const b = params.color.b + pileNoise + gradient;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // --------------------------------------------------------------------------
  // Normal Map
  // --------------------------------------------------------------------------

  private generateNormalMap(params: FabricVariantParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    switch (params.variant) {
      case 'coarse_knit':
      case 'fine_knit': {
        const loopR = params.variant === 'coarse_knit' ? 8 * params.loopSize : 4 * params.loopSize;
        const rowSp = loopR * 2.2;
        const colSp = loopR * 1.2;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const row = Math.floor(y / rowSp);
            const col = Math.floor(x / colSp);
            const offX = row % 2 === 0 ? 0 : colSp / 2;
            const cx = col * colSp + offX + colSp / 2;
            const cy = row * rowSp + rowSp / 2;

            const dx = (x - cx) / loopR;
            const dy = (y - cy) / (loopR * 0.7);
            const dist = Math.sqrt(dx * dx + dy * dy);

            const isYarn = dist < 1.2 && dist > 0.4;
            let nx = 0, ny = 0;
            if (isYarn) {
              nx = dx * 0.3;
              ny = dy * 0.3;
            }

            const fineNoise = noise.perlin2D(x * 0.03, y * 0.03) * 0.08;
            nx += fineNoise;
            ny += fineNoise;

            imageData.data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
            imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
            imageData.data[idx + 2] = 255;
            imageData.data[idx + 3] = 255;
          }
        }
        break;
      }
      case 'rug': {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            // Pile bumps
            const nx = noise.perlin2D(x * 0.015 * params.pileHeight, y * 0.015 * params.pileHeight) * 0.35;
            const ny = noise.perlin2D(x * 0.015 * params.pileHeight + 50, y * 0.015 * params.pileHeight + 50) * 0.35;

            imageData.data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
            imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
            imageData.data[idx + 2] = 255;
            imageData.data[idx + 3] = 255;
          }
        }
        break;
      }
      case 'velvet': {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            // Fine velvet pile — very subtle normals, mostly Y-direction
            const nx = noise.perlin2D(x * 0.04, y * 0.04) * 0.05;
            const ny = 0.1 + noise.perlin2D(x * 0.04 + 50, y * 0.04 + 50) * 0.05;

            imageData.data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
            imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
            imageData.data[idx + 2] = 255;
            imageData.data[idx + 3] = 255;
          }
        }
        break;
      }
      default: {
        // Weave-based normals for lined, plaid, sofa
        const threadSp = Math.floor(15 * params.weaveScale);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const threadX = (x % threadSp) / threadSp;
            const threadY = (y % threadSp) / threadSp;
            const nx = (threadX - 0.5) * 0.2;
            const ny = (threadY - 0.5) * 0.2;
            const n = noise.perlin2D(x * 0.03, y * 0.03) * 0.08;

            imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(((nx + n) * 0.5 + 0.5) * 255)));
            imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(((ny + n) * 0.5 + 0.5) * 255)));
            imageData.data[idx + 2] = 255;
            imageData.data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Roughness Map
  // --------------------------------------------------------------------------

  private generateRoughnessMap(params: FabricVariantParams, rng: SeededRandom): Texture {
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
        let n = noise.perlin2D(x / 50, y / 50) * 30;

        // Wear reduces roughness in worn areas (polished)
        if (params.wearLevel > 0) {
          const wearNoise = noise.perlin2D(x * 0.005, y * 0.005);
          if (wearNoise > 0.4) {
            n -= params.wearLevel * 40;
          }
        }

        // Velvet is smoother
        if (params.variant === 'velvet') {
          n -= 30;
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

  getVariations(count: number): FabricVariantParams[] {
    const variants: FabricVariantType[] = [
      'coarse_knit', 'fine_knit', 'lined', 'plaid',
      'rug', 'sofa_fabric', 'velvet',
    ];

    const results: FabricVariantParams[] = [];
    for (let i = 0; i < count; i++) {
      const variant = variants[this.rng.nextInt(0, variants.length - 1)];
      const hue = this.rng.nextFloat();
      results.push({
        variant,
        color: new Color().setHSL(hue, 0.4 + this.rng.nextFloat() * 0.3, 0.3 + this.rng.nextFloat() * 0.3),
        secondaryColor: new Color().setHSL(hue + 0.05, 0.35 + this.rng.nextFloat() * 0.2, 0.2 + this.rng.nextFloat() * 0.2),
        tertiaryColor: new Color().setHSL(hue + 0.1, 0.3 + this.rng.nextFloat() * 0.2, 0.15 + this.rng.nextFloat() * 0.15),
        roughness: 0.5 + this.rng.nextFloat() * 0.4,
        weaveScale: 0.5 + this.rng.nextFloat() * 1.5,
        patternScale: 0.5 + this.rng.nextFloat() * 1.5,
        loopSize: 0.5 + this.rng.nextFloat() * 1.5,
        pileHeight: 0.5 + this.rng.nextFloat() * 1.5,
        wearLevel: this.rng.nextFloat() * 0.4,
        sheenAmount: variant === 'velvet' ? 0.8 : this.rng.nextFloat() * 0.3,
      });
    }
    return results;
  }

  static createPreset(preset: FabricVariantType): Partial<FabricVariantParams> {
    switch (preset) {
      case 'coarse_knit':
        return {
          variant: 'coarse_knit',
          color: new Color(0x8b7355),
          roughness: 0.85,
          loopSize: 1.2,
        };
      case 'fine_knit':
        return {
          variant: 'fine_knit',
          color: new Color(0x6a5a4a),
          roughness: 0.8,
          loopSize: 0.7,
        };
      case 'lined':
        return {
          variant: 'lined',
          color: new Color(0x2c3e50),
          secondaryColor: new Color(0x1a252f),
          roughness: 0.65,
          patternScale: 1.0,
        };
      case 'plaid':
        return {
          variant: 'plaid',
          color: new Color(0x8b2500),
          secondaryColor: new Color(0x2c5f2d),
          tertiaryColor: new Color(0x1a3a1b),
          roughness: 0.7,
          patternScale: 1.0,
        };
      case 'rug':
        return {
          variant: 'rug',
          color: new Color(0x8b4513),
          secondaryColor: new Color(0x654321),
          tertiaryColor: new Color(0x3e2723),
          roughness: 0.9,
          pileHeight: 1.2,
        };
      case 'sofa_fabric':
        return {
          variant: 'sofa_fabric',
          color: new Color(0x556b2f),
          roughness: 0.75,
          wearLevel: 0.15,
          weaveScale: 0.8,
        };
      case 'velvet':
        return {
          variant: 'velvet',
          color: new Color(0x800020),
          roughness: 0.5,
          sheenAmount: 0.8,
        };
      default:
        return {};
    }
  }
}
