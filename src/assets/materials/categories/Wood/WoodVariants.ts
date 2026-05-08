import { createCanvas } from '../../../utils/CanvasUtils';
/**
 * Wood Material Variants
 *
 * Expanded wood materials ported from original Infinigen:
 * WoodOld, Plywood (White/Black/Blonde), HardwoodFloor, TiledWood,
 * SquareWoodTile, HexagonWoodTile, CrossedWoodTile, StaggeredWoodTile,
 * CompositeWoodTile, TableWood, ShelfWood
 *
 * Each variant generates color, normal, and roughness maps procedurally.
 */

import {
  Color,
  Texture,
  CanvasTexture,
  MeshStandardMaterial,
  RepeatWrapping,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { NoiseUtils } from '../../../../core/util/math/noise';

// ============================================================================
// Shared Types
// ============================================================================

export type WoodVariantType =
  | 'wood_old'
  | 'plywood_white'
  | 'plywood_black'
  | 'plywood_blonde'
  | 'hardwood_floor'
  | 'tiled_wood'
  | 'square_wood_tile'
  | 'hexagon_wood_tile'
  | 'crossed_wood_tile'
  | 'staggered_wood_tile'
  | 'composite_wood_tile'
  | 'table_wood'
  | 'shelf_wood';

export interface WoodVariantParams {
  [key: string]: unknown;
  variant: WoodVariantType;
  baseColor: Color;
  accentColor: Color;
  grainIntensity: number;
  grainScale: number;
  roughness: number;
  weathering: number;
  tileSize: number;
  plankWidth: number;
  finishType: 'matte' | 'satin' | 'gloss';
}

// ============================================================================
// WoodVariants Generator
// ============================================================================

export class WoodVariants extends BaseMaterialGenerator<WoodVariantParams> {
  private static readonly DEFAULT_PARAMS: WoodVariantParams = {
    variant: 'wood_old',
    baseColor: new Color(0x8b6f47),
    accentColor: new Color(0x6b4f30),
    grainIntensity: 0.6,
    grainScale: 1.0,
    roughness: 0.5,
    weathering: 0.0,
    tileSize: 4,
    plankWidth: 3,
    finishType: 'satin',
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): WoodVariantParams {
    return { ...WoodVariants.DEFAULT_PARAMS };
  }

  protected createBaseMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: 0x8b6f47,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  generate(params: Partial<WoodVariantParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(WoodVariants.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
    const material = this.createBaseMaterial();

    material.color = finalParams.baseColor;
    material.roughness = finalParams.roughness;
    material.metalness = 0.0;

    // Apply finish type
    if (finalParams.finishType === 'gloss') material.roughness = 0.15;
    else if (finalParams.finishType === 'matte') material.roughness = 0.7;

    // Generate variant-specific textures
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

  private generateColorMap(params: WoodVariantParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    switch (params.variant) {
      case 'wood_old':
        this.drawWoodOld(ctx, size, params, rng);
        break;
      case 'plywood_white':
        this.drawPlywood(ctx, size, params, rng, new Color(0xd4c9b0));
        break;
      case 'plywood_black':
        this.drawPlywood(ctx, size, params, rng, new Color(0x2a2218));
        break;
      case 'plywood_blonde':
        this.drawPlywood(ctx, size, params, rng, new Color(0xc4a87a));
        break;
      case 'hardwood_floor':
        this.drawHardwoodFloor(ctx, size, params, rng);
        break;
      case 'tiled_wood':
        this.drawTiledWood(ctx, size, params, rng);
        break;
      case 'square_wood_tile':
        this.drawSquareWoodTile(ctx, size, params, rng);
        break;
      case 'hexagon_wood_tile':
        this.drawHexagonWoodTile(ctx, size, params, rng);
        break;
      case 'crossed_wood_tile':
        this.drawCrossedWoodTile(ctx, size, params, rng);
        break;
      case 'staggered_wood_tile':
        this.drawStaggeredWoodTile(ctx, size, params, rng);
        break;
      case 'composite_wood_tile':
        this.drawCompositeWoodTile(ctx, size, params, rng);
        break;
      case 'table_wood':
        this.drawTableWood(ctx, size, params, rng);
        break;
      case 'shelf_wood':
        this.drawShelfWood(ctx, size, params, rng);
        break;
      default:
        ctx.fillStyle = `#${params.baseColor.getHexString()}`;
        ctx.fillRect(0, 0, size, size);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Variant Implementations
  // --------------------------------------------------------------------------

  private drawWoodOld(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Aged gray overtones
        const grainWarp = noise.perlin2D(u * 5 * params.grainScale, v * 30 * params.grainScale) * 0.15;
        const grain = noise.perlin2D(
          (u + grainWarp) * 20 * params.grainScale,
          v * 3 * params.grainScale,
        ) * params.grainIntensity;

        // Cracks — ridged noise
        const crack = Math.abs(noise.perlin2D(u * 15, v * 15));
        const crackLine = crack < 0.03 ? 0.3 : 0.0;

        // Discoloration — large scale
        const discolor = noise.perlin2D(u * 2, v * 2) * 0.15;

        // Gray weathering
        const gray = 0.45 + grain * 0.2 + discolor + crackLine;

        // Mix with base color
        const r = params.baseColor.r * (1 - params.weathering) + gray * params.weathering + grain * 0.1;
        const g = params.baseColor.g * (1 - params.weathering) + gray * params.weathering + grain * 0.08;
        const b = params.baseColor.b * (1 - params.weathering) + (gray + 0.03) * params.weathering + grain * 0.06;

        imageData.data[idx] = Math.min(255, Math.max(0, Math.floor(r * 255)));
        imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.floor(g * 255)));
        imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.floor(b * 255)));
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawPlywood(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
    tintColor: Color,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const layerHeight = 15 + rng.nextFloat() * 25;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const layerIndex = Math.floor(y / layerHeight);
        const isAltLayer = layerIndex % 2 === 1;

        // Alternate grain direction per layer
        const gx = isAltLayer ? y : x;
        const gy = isAltLayer ? x : y;

        const n = noise.perlin2D(gx / 80, gy / 80) * params.grainIntensity * 25;
        const layerTint = isAltLayer ? 12 : -8;

        const r = Math.min(255, Math.max(0, Math.floor(tintColor.r * 255 + n + layerTint)));
        const g = Math.min(255, Math.max(0, Math.floor(tintColor.g * 255 + n * 0.8 + layerTint)));
        const b = Math.min(255, Math.max(0, Math.floor(tintColor.b * 255 + n * 0.6 + layerTint)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawHardwoodFloor(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const plankWidthPx = Math.floor(size / params.plankWidth);
    const numPlanks = Math.ceil(size / plankWidthPx);

    // Per-plank color seeds for grain variation
    const plankSeeds: number[] = [];
    for (let i = 0; i < numPlanks * 2; i++) {
      plankSeeds.push(rng.nextFloat(0.85, 1.15));
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const plankIdx = Math.floor(x / plankWidthPx);
        const localX = (x % plankWidthPx) / plankWidthPx;

        const colorMul = plankSeeds[plankIdx % plankSeeds.length];
        const grainNoise = new NoiseUtils(rng.seed + plankIdx * 137);

        // Grain runs along plank length
        const grain = grainNoise.perlin2D(localX * 2, y / size * 8 * params.grainScale) * params.grainIntensity * 0.15;

        // Plank edge darkening
        const edgeDist = Math.min(localX, 1 - localX);
        const edgeDarken = edgeDist < 0.02 ? 0.7 : 1.0;

        const r = Math.min(255, Math.max(0, Math.floor(params.baseColor.r * 255 * colorMul * edgeDarken + grain * 255)));
        const g = Math.min(255, Math.max(0, Math.floor(params.baseColor.g * 255 * colorMul * edgeDarken + grain * 200)));
        const b = Math.min(255, Math.max(0, Math.floor(params.baseColor.b * 255 * colorMul * edgeDarken + grain * 150)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawTiledWood(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const tileSize = size / params.tileSize;
    const gapWidth = 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const tileX = Math.floor(x / tileSize);
        const tileY = Math.floor(y / tileSize);
        const localX = x % Math.floor(tileSize);
        const localY = y % Math.floor(tileSize);

        // Gap between tiles
        const isGap = localX < gapWidth || localY < gapWidth;

        if (isGap) {
          imageData.data[idx] = 30;
          imageData.data[idx + 1] = 25;
          imageData.data[idx + 2] = 20;
          imageData.data[idx + 3] = 255;
          continue;
        }

        // Per-tile grain variation
        const tileNoise = new NoiseUtils(rng.seed + tileX * 53 + tileY * 97);
        const grain = tileNoise.perlin2D(
          (x + tileX * 200) / 80 * params.grainScale,
          (y + tileY * 200) / 300 * params.grainScale,
        ) * params.grainIntensity * 30;

        const r = Math.min(255, Math.max(0, Math.floor(params.baseColor.r * 255 + grain)));
        const g = Math.min(255, Math.max(0, Math.floor(params.baseColor.g * 255 + grain * 0.8)));
        const b = Math.min(255, Math.max(0, Math.floor(params.baseColor.b * 255 + grain * 0.6)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawSquareWoodTile(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    this.drawTiledWood(ctx, size, { ...params, tileSize: Math.max(2, params.tileSize - 1) }, rng);
  }

  private drawHexagonWoodTile(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const hexRadius = size / (params.tileSize * 2);
    const hexHeight = hexRadius * Math.sqrt(3);
    const gapWidth = 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Hex grid coordinates
        const row = Math.floor(y / hexHeight);
        const colOffset = row % 2 === 0 ? 0 : hexRadius * 1.5;
        const col = Math.floor((x - colOffset) / (hexRadius * 3));

        // Distance to hex center
        const cx = col * hexRadius * 3 + colOffset + hexRadius * 1.5;
        const cy = row * hexHeight + hexHeight / 2;

        // Hex distance approximation
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        const hexDist = Math.max(dx / (hexRadius * 1.5), dy / hexHeight);

        const isGap = hexDist > 0.9;

        if (isGap) {
          imageData.data[idx] = 30;
          imageData.data[idx + 1] = 25;
          imageData.data[idx + 2] = 20;
          imageData.data[idx + 3] = 255;
          continue;
        }

        const tileNoise = new NoiseUtils(rng.seed + Math.floor(cx) * 13 + Math.floor(cy) * 29);
        const grain = tileNoise.perlin2D(
          x / 80 * params.grainScale,
          y / 300 * params.grainScale,
        ) * params.grainIntensity * 25;

        const r = Math.min(255, Math.max(0, Math.floor(params.baseColor.r * 255 + grain)));
        const g = Math.min(255, Math.max(0, Math.floor(params.baseColor.g * 255 + grain * 0.8)));
        const b = Math.min(255, Math.max(0, Math.floor(params.baseColor.b * 255 + grain * 0.6)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawCrossedWoodTile(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const tileSize = size / params.tileSize;
    const gapWidth = 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const localX = x % Math.floor(tileSize);
        const localY = y % Math.floor(tileSize);

        // Diamond / cross pattern — rotate tile coords 45°
        const halfTile = tileSize / 2;
        const diagDist = Math.abs(localX - halfTile) + Math.abs(localY - halfTile);
        const isDiamond = diagDist < halfTile * 0.9;

        // Gap detection
        const isGap = localX < gapWidth || localY < gapWidth;

        if (isGap) {
          imageData.data[idx] = 30;
          imageData.data[idx + 1] = 25;
          imageData.data[idx + 2] = 20;
          imageData.data[idx + 3] = 255;
          continue;
        }

        const tileX = Math.floor(x / tileSize);
        const tileY = Math.floor(y / tileSize);
        const tileNoise = new NoiseUtils(rng.seed + tileX * 53 + tileY * 97);

        const grainDir = isDiamond ? 1 : 0;
        const gx = grainDir ? y : x;
        const grain = tileNoise.perlin2D(gx / 80 * params.grainScale, y / 300 * params.grainScale) * params.grainIntensity * 25;

        const color = isDiamond ? params.accentColor : params.baseColor;
        const r = Math.min(255, Math.max(0, Math.floor(color.r * 255 + grain)));
        const g = Math.min(255, Math.max(0, Math.floor(color.g * 255 + grain * 0.8)));
        const b = Math.min(255, Math.max(0, Math.floor(color.b * 255 + grain * 0.6)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawStaggeredWoodTile(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const tileSize = size / params.tileSize;
    const gapWidth = 2;
    const halfOffset = tileSize / 2;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const row = Math.floor(y / tileSize);
        const stagger = row % 2 === 0 ? 0 : halfOffset;
        const localX = (x + stagger) % Math.floor(tileSize);
        const localY = y % Math.floor(tileSize);

        const isGap = localX < gapWidth || localY < gapWidth;

        if (isGap) {
          imageData.data[idx] = 30;
          imageData.data[idx + 1] = 25;
          imageData.data[idx + 2] = 20;
          imageData.data[idx + 3] = 255;
          continue;
        }

        const col = Math.floor((x + stagger) / tileSize);
        const tileNoise = new NoiseUtils(rng.seed + row * 53 + col * 97);
        const grain = tileNoise.perlin2D(
          x / 80 * params.grainScale,
          y / 300 * params.grainScale,
        ) * params.grainIntensity * 25;

        const r = Math.min(255, Math.max(0, Math.floor(params.baseColor.r * 255 + grain)));
        const g = Math.min(255, Math.max(0, Math.floor(params.baseColor.g * 255 + grain * 0.8)));
        const b = Math.min(255, Math.max(0, Math.floor(params.baseColor.b * 255 + grain * 0.6)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawCompositeWoodTile(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const imageData = ctx.createImageData(size, size);
    const tileSize = size / params.tileSize;
    const gapWidth = 2;

    // Multiple wood tones for composite effect
    const woodColors = [
      new Color(0x8b6f47),
      new Color(0x6b4f30),
      new Color(0xa08060),
      new Color(0x5a3a20),
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const tileX = Math.floor(x / tileSize);
        const tileY = Math.floor(y / tileSize);
        const localX = x % Math.floor(tileSize);
        const localY = y % Math.floor(tileSize);

        const isGap = localX < gapWidth || localY < gapWidth;

        if (isGap) {
          imageData.data[idx] = 25;
          imageData.data[idx + 1] = 20;
          imageData.data[idx + 2] = 15;
          imageData.data[idx + 3] = 255;
          continue;
        }

        // Each tile gets a different wood type
        const colorIdx = (tileX * 3 + tileY * 7) % woodColors.length;
        const tileColor = woodColors[colorIdx];
        const tileNoise = new NoiseUtils(rng.seed + tileX * 53 + tileY * 97 + colorIdx * 200);
        const grain = tileNoise.perlin2D(
          x / 80 * params.grainScale,
          y / 300 * params.grainScale,
        ) * params.grainIntensity * 25;

        const r = Math.min(255, Math.max(0, Math.floor(tileColor.r * 255 + grain)));
        const g = Math.min(255, Math.max(0, Math.floor(tileColor.g * 255 + grain * 0.8)));
        const b = Math.min(255, Math.max(0, Math.floor(tileColor.b * 255 + grain * 0.6)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawTableWood(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Fine furniture grain — smoother, tighter
        const warp = noise.perlin2D(u * 3 * params.grainScale, v * 40 * params.grainScale) * 0.03;
        const grain = noise.perlin2D(
          (u + warp) * 25 * params.grainScale,
          v * 4 * params.grainScale,
        ) * params.grainIntensity * 0.08;

        // Subtle sheen variation
        const sheen = noise.perlin2D(u * 2, v * 2) * 0.03;

        const r = Math.min(255, Math.max(0, Math.floor((params.baseColor.r + grain + sheen) * 255)));
        const g = Math.min(255, Math.max(0, Math.floor((params.baseColor.g + grain * 0.8 + sheen) * 255)));
        const b = Math.min(255, Math.max(0, Math.floor((params.baseColor.b + grain * 0.6 + sheen) * 255)));

        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private drawShelfWood(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: WoodVariantParams,
    rng: SeededRandom,
  ): void {
    const noise = new NoiseUtils(rng.seed);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Long grain along shelf (horizontal), edge grain at top/bottom
        const isEdge = v < 0.08 || v > 0.92;
        let grain: number;

        if (isEdge) {
          // End grain — tighter, circular pattern
          const localV = v < 0.08 ? v / 0.08 : (v - 0.92) / 0.08;
          const ring = Math.sin(localV * 40) * 0.1;
          grain = noise.perlin2D(u * 10, localV * 30) * params.grainIntensity * 0.15 + ring;
        } else {
          // Long grain
          const warp = noise.perlin2D(u * 3 * params.grainScale, v * 50 * params.grainScale) * 0.02;
          grain = noise.perlin2D(
            (u + warp) * 20 * params.grainScale,
            v * 3 * params.grainScale,
          ) * params.grainIntensity * 0.12;
        }

        const r = Math.min(255, Math.max(0, Math.floor((params.baseColor.r + grain) * 255)));
        const g = Math.min(255, Math.max(0, Math.floor((params.baseColor.g + grain * 0.8) * 255)));
        const b = Math.min(255, Math.max(0, Math.floor((params.baseColor.b + grain * 0.6) * 255)));

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

  private generateNormalMap(params: WoodVariantParams, rng: SeededRandom): Texture {
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

        // Grain-direction perturbation
        const warp = noise.perlin2D(x / size * 5, y / size * 50) * 10;
        const nx = noise.perlin2D((x + warp) / 80, y / 80) * 0.3;
        const ny = noise.perlin2D((x + warp) / 80, y / 80 + 100) * 0.15;
        const nz = 1.0;

        imageData.data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        imageData.data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        imageData.data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        imageData.data[idx + 3] = 255;
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

  private generateRoughnessMap(params: WoodVariantParams, rng: SeededRandom): Texture {
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
        const n = noise.perlin2D(x / 100, y / 100) * 30;
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

  getVariations(count: number): WoodVariantParams[] {
    const variants: WoodVariantType[] = [
      'wood_old', 'plywood_white', 'plywood_black', 'plywood_blonde',
      'hardwood_floor', 'tiled_wood', 'square_wood_tile', 'hexagon_wood_tile',
      'crossed_wood_tile', 'staggered_wood_tile', 'composite_wood_tile',
      'table_wood', 'shelf_wood',
    ];

    const results: WoodVariantParams[] = [];
    for (let i = 0; i < count; i++) {
      const variant = variants[this.rng.nextInt(0, variants.length - 1)];
      results.push({
        variant,
        baseColor: new Color().setHSL(
          0.05 + this.rng.nextFloat() * 0.1,
          0.3 + this.rng.nextFloat() * 0.3,
          0.25 + this.rng.nextFloat() * 0.4,
        ),
        accentColor: new Color().setHSL(
          0.06 + this.rng.nextFloat() * 0.08,
          0.35 + this.rng.nextFloat() * 0.25,
          0.2 + this.rng.nextFloat() * 0.3,
        ),
        grainIntensity: 0.4 + this.rng.nextFloat() * 0.5,
        grainScale: 0.5 + this.rng.nextFloat() * 1.5,
        roughness: 0.3 + this.rng.nextFloat() * 0.4,
        weathering: variant === 'wood_old' ? 0.3 + this.rng.nextFloat() * 0.5 : this.rng.nextFloat() * 0.2,
        tileSize: 3 + this.rng.nextInt(0, 4),
        plankWidth: 2 + this.rng.nextInt(0, 5),
        finishType: ['matte', 'satin', 'gloss'][this.rng.nextInt(0, 2)] as WoodVariantParams['finishType'],
      });
    }
    return results;
  }

  /** Create a preset configuration for a named variant */
  static createPreset(preset: WoodVariantType): Partial<WoodVariantParams> {
    switch (preset) {
      case 'wood_old':
        return {
          variant: 'wood_old',
          baseColor: new Color(0x7a6b5a),
          roughness: 0.75,
          weathering: 0.6,
          grainIntensity: 0.8,
          finishType: 'matte',
        };
      case 'plywood_white':
        return {
          variant: 'plywood_white',
          baseColor: new Color(0xd4c9b0),
          roughness: 0.55,
          grainIntensity: 0.4,
          finishType: 'satin',
        };
      case 'plywood_black':
        return {
          variant: 'plywood_black',
          baseColor: new Color(0x2a2218),
          roughness: 0.6,
          grainIntensity: 0.5,
          finishType: 'satin',
        };
      case 'plywood_blonde':
        return {
          variant: 'plywood_blonde',
          baseColor: new Color(0xc4a87a),
          roughness: 0.5,
          grainIntensity: 0.45,
          finishType: 'satin',
        };
      case 'hardwood_floor':
        return {
          variant: 'hardwood_floor',
          baseColor: new Color(0x8b6f47),
          roughness: 0.4,
          plankWidth: 5,
          finishType: 'gloss',
        };
      case 'tiled_wood':
        return {
          variant: 'tiled_wood',
          baseColor: new Color(0x9a7e5a),
          roughness: 0.45,
          tileSize: 4,
          finishType: 'satin',
        };
      case 'square_wood_tile':
        return {
          variant: 'square_wood_tile',
          baseColor: new Color(0x7a6040),
          roughness: 0.5,
          tileSize: 3,
          finishType: 'satin',
        };
      case 'hexagon_wood_tile':
        return {
          variant: 'hexagon_wood_tile',
          baseColor: new Color(0x8a7050),
          roughness: 0.45,
          tileSize: 3,
          finishType: 'satin',
        };
      case 'crossed_wood_tile':
        return {
          variant: 'crossed_wood_tile',
          baseColor: new Color(0x8b6f47),
          accentColor: new Color(0x6b4f30),
          roughness: 0.5,
          tileSize: 4,
          finishType: 'satin',
        };
      case 'staggered_wood_tile':
        return {
          variant: 'staggered_wood_tile',
          baseColor: new Color(0x7a6040),
          roughness: 0.5,
          tileSize: 4,
          finishType: 'satin',
        };
      case 'composite_wood_tile':
        return {
          variant: 'composite_wood_tile',
          baseColor: new Color(0x8b6f47),
          roughness: 0.55,
          tileSize: 4,
          finishType: 'matte',
        };
      case 'table_wood':
        return {
          variant: 'table_wood',
          baseColor: new Color(0x6b4226),
          roughness: 0.3,
          grainIntensity: 0.5,
          finishType: 'gloss',
        };
      case 'shelf_wood':
        return {
          variant: 'shelf_wood',
          baseColor: new Color(0x9a7e5a),
          roughness: 0.4,
          grainIntensity: 0.55,
          finishType: 'satin',
        };
      default:
        return {};
    }
  }
}
