/**
 * TilePatternLibrary.ts
 *
 * 11 procedural tile pattern generators ported from original Infinigen's tile materials.
 * Uses BaseMaterialGenerator pattern with canvas-based texture generation producing
 * map, roughnessMap, and normalMap for physically-based rendering.
 *
 * Patterns:
 *   1. BasketWeave   – Alternating horizontal/vertical pairs
 *   2. Brick         – Running bond with offset rows
 *   3. Chevron       – V-shaped zigzag (45° herringbone)
 *   4. Diamond       – Rhombus tiles on diagonal grid
 *   5. Herringbone   – Classic 90° herringbone
 *   6. Hexagon       – Honeycomb hexagonal tiles
 *   7. Shell         – Scallop / fan-shaped tiles
 *   8. SpanishBound  – 1 large + 4 small cross pattern
 *   9. Star          – 8-pointed star with cross accents
 *  10. Triangle      – Triangular tessellation
 *  11. AdvancedTiles – Combines multiple patterns with per-region random selection
 *
 * @module materials/categories/Tile/TilePatternLibrary
 */

import * as THREE from 'three';
import {
  BaseMaterialGenerator,
  MaterialOutput,
} from '../../BaseMaterialGenerator';
import { Noise3D } from '../../../../core/util/math/noise';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { createCanvas } from '../../../utils/CanvasUtils';

// ============================================================================
// Types
// ============================================================================

/** Union of all 11 tile pattern type keys */
export type TilePatternType =
  | 'basketweave'
  | 'brick'
  | 'chevron'
  | 'diamond'
  | 'herringbone'
  | 'hexagon'
  | 'shell'
  | 'spanishbound'
  | 'star'
  | 'triangle'
  | 'advancedtiles';

/** Parameters common to every tile pattern generator */
export interface TilePatternParams {
  [key: string]: unknown;
  /** Which pattern layout to generate */
  pattern: TilePatternType;
  /** Primary tile colour */
  tileColor1: THREE.Color;
  /** Secondary tile colour (two-tone patterns) */
  tileColor2: THREE.Color;
  /** Tertiary tile colour (three-tone patterns like AdvancedTiles) */
  tileColor3: THREE.Color;
  /** Mortar / grout line colour */
  mortarColor: THREE.Color;
  /** Mortar line width as fraction of tile size (0.01–0.12) */
  mortarWidth: number;
  /** Base tile size in UV units (controls tiling density) */
  tileSize: number;
  /** Global rotation in degrees */
  rotation: number;
  /** Per-tile colour variation strength (0–1) */
  colorVariation: number;
  /** Surface roughness of tiles (0–1) */
  roughness: number;
  /** Metalness of tiles (0–1) */
  metalness: number;
  /** Texture resolution in pixels (default 1024) */
  resolution: number;
  /** Random seed for deterministic variation */
  seed: number;
}

/** A named preset for a tile pattern */
export interface TilePatternPreset {
  name: string;
  description: string;
  params: Partial<TilePatternParams>;
}

// ============================================================================
// Internal helper types
// ============================================================================

/** Function that returns true when the given UV is inside mortar */
type GroutCheckFn = (u: number, v: number) => boolean;

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_TILE_COLOR1 = new THREE.Color(0xf5f0e8);
const DEFAULT_TILE_COLOR2 = new THREE.Color(0xe0d8c8);
const DEFAULT_TILE_COLOR3 = new THREE.Color(0xd0c8b0);
const DEFAULT_MORTAR_COLOR = new THREE.Color(0x8a8a82);

const DEFAULT_PARAMS: TilePatternParams = {
  pattern: 'brick',
  tileColor1: DEFAULT_TILE_COLOR1,
  tileColor2: DEFAULT_TILE_COLOR2,
  tileColor3: DEFAULT_TILE_COLOR3,
  mortarColor: DEFAULT_MORTAR_COLOR,
  mortarWidth: 0.04,
  tileSize: 1.0,
  rotation: 0,
  colorVariation: 0.06,
  roughness: 0.35,
  metalness: 0.0,
  resolution: 1024,
  seed: 42,
};

// ============================================================================
// Internal Utilities
// ============================================================================

/** Create a seeded per-tile colour with slight HSL variation */
function varyTileColor(
  base: THREE.Color,
  rng: SeededRandom,
  strength: number,
): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const dh = (rng.next() - 0.5) * strength * 0.3;
  const ds = (rng.next() - 0.5) * strength * 0.4;
  const dl = (rng.next() - 0.5) * strength;
  return new THREE.Color().setHSL(
    (hsl.h + dh + 1) % 1,
    Math.max(0, Math.min(1, hsl.s + ds)),
    Math.max(0, Math.min(1, hsl.l + dl)),
  );
}

/** Fill entire canvas with mortar colour */
function fillMortar(
  ctx: CanvasRenderingContext2D,
  size: number,
  mortarColor: THREE.Color,
): void {
  ctx.fillStyle = `#${mortarColor.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
}

/** Create a CanvasTexture with RepeatWrapping */
function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Generate a roughness map: tiles = smoother, mortar = rougher */
function generateRoughnessMap(
  size: number,
  tileRoughness: number,
  groutRoughness: number,
  groutCheck: GroutCheckFn,
): THREE.CanvasTexture {
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  const tileVal = Math.floor(tileRoughness * 255);
  const groutVal = Math.floor(Math.min(1, groutRoughness) * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = groutCheck(x / size, y / size) ? groutVal : tileVal;
      imgData.data[idx] = v;
      imgData.data[idx + 1] = v;
      imgData.data[idx + 2] = v;
      imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return makeTexture(canvas);
}

/** Generate a normal map: flat tiles (128,128,255) with indented mortar */
function generateNormalMap(
  size: number,
  groutCheck: GroutCheckFn,
  edgeWidth: number = 2,
): THREE.CanvasTexture {
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Default flat normal: (128, 128, 255)
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);

  // Build a boolean mask for grout
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      mask[y * size + x] = groutCheck(x / size, y / size) ? 1 : 0;
    }
  }

  // Compute edge-aware normal perturbation (Sobel-like)
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      if (mask[idx] === 0) continue; // Only modify mortar & edges

      const hL = mask[idx - 1] ? 0 : 1;
      const hR = mask[idx + 1] ? 0 : 1;
      const hU = mask[idx - size] ? 0 : 1;
      const hD = mask[idx + size] ? 0 : 1;

      // Normal from height differential
      const nx = (hL - hR) * 0.5;
      const ny = (hU - hD) * 0.5;

      const pi = idx * 4;
      imgData.data[pi] = Math.max(0, Math.min(255, 128 + nx * 80));
      imgData.data[pi + 1] = Math.max(0, Math.min(255, 128 + ny * 80));
      imgData.data[pi + 2] = 220; // Slightly depressed
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return makeTexture(canvas);
}

/** Build a MeshStandardMaterial from a colour-map canvas + options */
function buildMaterial(
  mapCanvas: HTMLCanvasElement,
  params: TilePatternParams,
  groutCheck: GroutCheckFn,
): THREE.MeshStandardMaterial {
  const map = makeTexture(mapCanvas);
  const roughSize = Math.max(64, Math.floor(params.resolution / 4));
  const normalSize = Math.max(128, Math.floor(params.resolution / 2));
  const roughnessMap = generateRoughnessMap(
    roughSize,
    params.roughness,
    Math.min(1, params.roughness + 0.3),
    groutCheck,
  );
  const normalMap = generateNormalMap(normalSize, groutCheck);
  return new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    normalMap,
    roughness: params.roughness,
    metalness: params.metalness,
  });
}

/** Apply rotation to canvas context */
function applyRotation(
  ctx: CanvasRenderingContext2D,
  size: number,
  rotationDeg: number,
): void {
  if (rotationDeg === 0) return;
  const rad = (rotationDeg * Math.PI) / 180;
  ctx.translate(size / 2, size / 2);
  ctx.rotate(rad);
  // Expand the drawn area to cover canvas after rotation
  const diag = size * Math.SQRT2;
  ctx.translate(-diag / 2, -diag / 2);
}

// ============================================================================
// TilePatternLibrary Class
// ============================================================================

/**
 * Comprehensive tile-pattern material library.
 *
 * Generates 11 distinct tile layout patterns with per-tile colour variation,
 * mortar lines, normal maps (tile height > mortar), and roughness maps
 * (tiles smoother, mortar rougher). Extends BaseMaterialGenerator following
 * the established codebase patterns.
 */
export class TilePatternLibrary extends BaseMaterialGenerator<TilePatternParams> {
  // ------------------------------------------------------------------
  // Presets: 2+ per pattern type = 22+
  // ------------------------------------------------------------------
  private static readonly PRESETS: TilePatternPreset[] = [
    // BasketWeave
    { name: 'cream_basketweave', description: 'Cream basketweave tiles', params: { pattern: 'basketweave', tileColor1: new THREE.Color(0xf5f0e8), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.3, seed: 1 } },
    { name: 'gray_basketweave', description: 'Grey basketweave tiles', params: { pattern: 'basketweave', tileColor1: new THREE.Color(0xb0b0a8), tileColor2: new THREE.Color(0x989890), mortarColor: new THREE.Color(0x606058), roughness: 0.45, seed: 2 } },

    // Brick
    { name: 'red_brick', description: 'Classic red running bond brick', params: { pattern: 'brick', tileColor1: new THREE.Color(0x8b3a2a), tileColor2: new THREE.Color(0x7a3020), mortarColor: new THREE.Color(0x8a8878), roughness: 0.75, colorVariation: 0.1, seed: 10 } },
    { name: 'white_subway', description: 'White subway tile', params: { pattern: 'brick', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe8e4dc), mortarColor: new THREE.Color(0xa0a098), roughness: 0.25, seed: 11 } },

    // Chevron
    { name: 'wood_chevron', description: 'Wooden chevron parquet', params: { pattern: 'chevron', tileColor1: new THREE.Color(0x8a6a42), tileColor2: new THREE.Color(0x6a4a2a), mortarColor: new THREE.Color(0x4a3a22), roughness: 0.6, seed: 20 } },
    { name: 'marble_chevron', description: 'Marble chevron tiles', params: { pattern: 'chevron', tileColor1: new THREE.Color(0xe8e0d4), tileColor2: new THREE.Color(0xc8b8a4), mortarColor: new THREE.Color(0x908878), roughness: 0.2, seed: 21 } },

    // Diamond
    { name: 'white_diamond', description: 'White diamond tiles', params: { pattern: 'diamond', tileColor1: new THREE.Color(0xf0ece0), tileColor2: new THREE.Color(0xd0c8b8), mortarColor: new THREE.Color(0x888880), roughness: 0.25, seed: 30 } },
    { name: 'terracotta_diamond', description: 'Terracotta diamond tiles', params: { pattern: 'diamond', tileColor1: new THREE.Color(0xb85830), tileColor2: new THREE.Color(0x8a4020), mortarColor: new THREE.Color(0x5a3828), roughness: 0.65, seed: 31 } },

    // Herringbone
    { name: 'gray_herringbone', description: 'Grey herringbone parquet', params: { pattern: 'herringbone', tileColor1: new THREE.Color(0xa8a8a0), tileColor2: new THREE.Color(0x908880), mortarColor: new THREE.Color(0x606058), roughness: 0.4, seed: 40 } },
    { name: 'wood_herringbone', description: 'Wooden herringbone floor', params: { pattern: 'herringbone', tileColor1: new THREE.Color(0x8a6840), tileColor2: new THREE.Color(0x705830), mortarColor: new THREE.Color(0x4a3820), roughness: 0.55, seed: 41 } },

    // Hexagon
    { name: 'white_hexagon', description: 'White hexagonal tiles', params: { pattern: 'hexagon', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe4e0d8), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.2, seed: 50 } },
    { name: 'honey_hexagon', description: 'Honey-coloured hexagonal tiles', params: { pattern: 'hexagon', tileColor1: new THREE.Color(0xd4a030), tileColor2: new THREE.Color(0xb8882a), mortarColor: new THREE.Color(0x6a5a30), roughness: 0.35, seed: 51 } },

    // Shell
    { name: 'cream_shell', description: 'Cream shell/scallop tiles', params: { pattern: 'shell', tileColor1: new THREE.Color(0xf0e8d8), tileColor2: new THREE.Color(0xe8e0d0), mortarColor: new THREE.Color(0x8a8070), roughness: 0.35, seed: 60 } },
    { name: 'pink_shell', description: 'Pink shell/scallop tiles', params: { pattern: 'shell', tileColor1: new THREE.Color(0xe8b0a0), tileColor2: new THREE.Color(0xd8a090), mortarColor: new THREE.Color(0x9a8880), roughness: 0.3, seed: 61 } },

    // SpanishBound
    { name: 'terracotta_spanish', description: 'Terracotta Spanish bond', params: { pattern: 'spanishbound', tileColor1: new THREE.Color(0xb85030), tileColor2: new THREE.Color(0xa04020), mortarColor: new THREE.Color(0x6a5040), roughness: 0.65, seed: 70 } },
    { name: 'stone_spanish', description: 'Stone Spanish bond', params: { pattern: 'spanishbound', tileColor1: new THREE.Color(0xb0a898), tileColor2: new THREE.Color(0x908878), mortarColor: new THREE.Color(0x606058), roughness: 0.55, seed: 71 } },

    // Star
    { name: 'moroccan_star', description: 'Moroccan star pattern', params: { pattern: 'star', tileColor1: new THREE.Color(0xf0e8d0), tileColor2: new THREE.Color(0x2a7a5a), mortarColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 80 } },
    { name: 'blue_star', description: 'Blue star tiles', params: { pattern: 'star', tileColor1: new THREE.Color(0xf0f0f0), tileColor2: new THREE.Color(0x3a5a8a), mortarColor: new THREE.Color(0x808890), roughness: 0.25, seed: 81 } },

    // Triangle
    { name: 'white_triangle', description: 'White triangle tessellation', params: { pattern: 'triangle', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xd8d0c4), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.25, seed: 90 } },
    { name: 'color_triangle', description: 'Colourful triangle tessellation', params: { pattern: 'triangle', tileColor1: new THREE.Color(0x5a9a8a), tileColor2: new THREE.Color(0xd4a040), mortarColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 91 } },

    // AdvancedTiles
    { name: 'mixed_floor', description: 'Mixed pattern floor tiles', params: { pattern: 'advancedtiles', tileColor1: new THREE.Color(0xc8c0b0), tileColor2: new THREE.Color(0xa0988a), tileColor3: new THREE.Color(0x888078), mortarColor: new THREE.Color(0x6a6a62), roughness: 0.45, seed: 100 } },
    { name: 'vivid_mixed', description: 'Vivid mixed pattern tiles', params: { pattern: 'advancedtiles', tileColor1: new THREE.Color(0xd4a030), tileColor2: new THREE.Color(0x5a8a7a), tileColor3: new THREE.Color(0xa05040), mortarColor: new THREE.Color(0x4a4a42), roughness: 0.4, seed: 101 } },
  ];

  constructor(seed?: number) {
    super(seed);
  }

  // ------------------------------------------------------------------
  // BaseMaterialGenerator implementation
  // ------------------------------------------------------------------

  getDefaultParams(): TilePatternParams {
    return { ...DEFAULT_PARAMS };
  }

  /**
   * Generate a tile material with the given parameters.
   * Returns a MaterialOutput containing the material with
   * map, roughnessMap, and normalMap.
   */
  generate(params: Partial<TilePatternParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(DEFAULT_PARAMS, params);
    if (seed !== undefined) {
      finalParams.seed = seed;
    }
    const rng = new SeededRandom(finalParams.seed);
    const noise = new Noise3D(rng.seed);
    const size = finalParams.resolution;

    // Create colour map canvas
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fill with mortar
    fillMortar(ctx, size, finalParams.mortarColor);

    // Apply rotation if specified
    if (finalParams.rotation !== 0) {
      ctx.save();
      applyRotation(ctx, size, finalParams.rotation);
    }

    // Dispatch to pattern-specific generator
    let groutCheck: GroutCheckFn;
    const dispatch: Record<TilePatternType, () => GroutCheckFn> = {
      basketweave: () => this.paintBasketWeave(ctx, size, finalParams, rng, noise),
      brick: () => this.paintBrick(ctx, size, finalParams, rng, noise),
      chevron: () => this.paintChevron(ctx, size, finalParams, rng, noise),
      diamond: () => this.paintDiamond(ctx, size, finalParams, rng, noise),
      herringbone: () => this.paintHerringbone(ctx, size, finalParams, rng, noise),
      hexagon: () => this.paintHexagon(ctx, size, finalParams, rng, noise),
      shell: () => this.paintShell(ctx, size, finalParams, rng, noise),
      spanishbound: () => this.paintSpanishBound(ctx, size, finalParams, rng, noise),
      star: () => this.paintStar(ctx, size, finalParams, rng, noise),
      triangle: () => this.paintTriangle(ctx, size, finalParams, rng, noise),
      advancedtiles: () => this.paintAdvancedTiles(ctx, size, finalParams, rng, noise),
    };

    const generator = dispatch[finalParams.pattern];
    if (!generator) {
      throw new Error(
        `Unknown tile pattern: ${finalParams.pattern}. ` +
        `Available: ${Object.keys(dispatch).join(', ')}`,
      );
    }
    groutCheck = generator();

    if (finalParams.rotation !== 0) {
      ctx.restore();
      // Wrap grout check with rotation
      const originalGroutCheck = groutCheck;
      const rad = (finalParams.rotation * Math.PI) / 180;
      const cosR = Math.cos(-rad);
      const sinR = Math.sin(-rad);
      groutCheck = (u: number, v: number) => {
        const cu = u - 0.5;
        const cv = v - 0.5;
        const ru = cu * cosR - cv * sinR + 0.5;
        const rv = cu * sinR + cv * cosR + 0.5;
        return originalGroutCheck(
          ((ru % 1) + 1) % 1,
          ((rv % 1) + 1) % 1,
        );
      };
    }

    // Build material from canvas
    const material = buildMaterial(canvas, finalParams, groutCheck);

    return {
      material,
      maps: {
        map: material.map ?? null,
        roughnessMap: material.roughnessMap ?? null,
        normalMap: material.normalMap ?? null,
      },
      params: finalParams,
    };
  }

  getVariations(count: number): TilePatternParams[] {
    const patterns: TilePatternType[] = [
      'basketweave', 'brick', 'chevron', 'diamond', 'herringbone',
      'hexagon', 'shell', 'spanishbound', 'star', 'triangle', 'advancedtiles',
    ];
    const variations: TilePatternParams[] = [];
    for (let i = 0; i < count; i++) {
      variations.push({
        pattern: this.rng.choice(patterns),
        tileColor1: new THREE.Color().setHSL(
          this.rng.next(), 0.15 + this.rng.next() * 0.25, 0.5 + this.rng.next() * 0.4,
        ),
        tileColor2: new THREE.Color().setHSL(
          this.rng.next(), 0.15 + this.rng.next() * 0.25, 0.4 + this.rng.next() * 0.4,
        ),
        tileColor3: new THREE.Color().setHSL(
          this.rng.next(), 0.15 + this.rng.next() * 0.25, 0.4 + this.rng.next() * 0.4,
        ),
        mortarColor: new THREE.Color().setHSL(
          this.rng.next(), 0.05 + this.rng.next() * 0.1, 0.25 + this.rng.next() * 0.35,
        ),
        mortarWidth: 0.02 + this.rng.next() * 0.08,
        tileSize: 0.5 + this.rng.next() * 1.5,
        rotation: this.rng.choice([0, 0, 0, 45, 90]),
        colorVariation: 0.02 + this.rng.next() * 0.1,
        roughness: 0.15 + this.rng.next() * 0.55,
        metalness: 0.0,
        resolution: 1024,
        seed: this.rng.nextInt(1, 99999),
      });
    }
    return variations;
  }

  /**
   * Generate a tile material from a named preset.
   */
  getPreset(name: string): MaterialOutput | null {
    const preset = TilePatternLibrary.PRESETS.find(p => p.name === name);
    if (!preset) return null;
    return this.generate(preset.params);
  }

  /**
   * List all available preset names.
   */
  listPresets(): string[] {
    return TilePatternLibrary.PRESETS.map(p => p.name);
  }

  /**
   * Get all preset descriptors.
   */
  getAllPresets(): TilePatternPreset[] {
    return [...TilePatternLibrary.PRESETS];
  }

  /**
   * Get presets for a specific pattern type.
   */
  getPresetsForPattern(pattern: TilePatternType): TilePatternPreset[] {
    return TilePatternLibrary.PRESETS.filter(p => p.params.pattern === pattern);
  }

  // ==================================================================
  // Pattern 1: BasketWeave
  // Alternating horizontal/vertical pairs creating basket weave pattern
  // ==================================================================

  private paintBasketWeave(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const tileSize = (size / 8) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * tileSize));
    const halfTile = tileSize / 2;

    for (let row = -2; row < Math.ceil(size / halfTile) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / halfTile) + 2; col++) {
        const isHorizontal = (Math.floor(row / 2) + Math.floor(col / 2)) % 2 === 0;
        const baseX = col * halfTile;
        const baseY = row * halfTile;
        const isAlt = (row + col) % 2 === 0;
        const baseColor = isAlt ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;

        if (isHorizontal) {
          ctx.fillRect(baseX + g / 2, baseY + g / 2, tileSize - g, halfTile - g);
        } else {
          ctx.fillRect(baseX + g / 2, baseY + g / 2, halfTile - g, tileSize - g);
        }
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const col = Math.floor(px / halfTile);
      const row = Math.floor(py / halfTile);
      const lx = px - col * halfTile;
      const ly = py - row * halfTile;
      const isHorizontal = (Math.floor(row / 2) + Math.floor(col / 2)) % 2 === 0;
      if (isHorizontal) {
        return lx < g / 2 || lx > tileSize - g / 2 || ly < g / 2 || ly > halfTile - g / 2;
      } else {
        return lx < g / 2 || lx > halfTile - g / 2 || ly < g / 2 || ly > tileSize - g / 2;
      }
    };
  }

  // ==================================================================
  // Pattern 2: Brick
  // Standard brick pattern with offset rows and mortar lines
  // ==================================================================

  private paintBrick(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    noise: Noise3D,
  ): GroutCheckFn {
    const brickW = (size / 6) * params.tileSize;
    const brickH = (size / 12) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * brickH));

    for (let row = -1; row < Math.ceil(size / brickH) + 1; row++) {
      const offset = (row % 2) * brickW / 2;
      for (let col = -2; col < Math.ceil(size / brickW) + 2; col++) {
        const x = col * brickW + offset;
        const y = row * brickH;

        // Add subtle surface noise to each brick
        const n = noise.perlin(row * 0.5, col * 0.5, 0) * params.colorVariation;
        const baseColor = (row + col) % 2 === 0 ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        const finalColor = color.clone().offsetHSL(0, 0, n * 0.3);
        ctx.fillStyle = `#${finalColor.getHexString()}`;
        ctx.fillRect(x + g / 2, y + g / 2, brickW - g, brickH - g);
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const row = Math.floor(py / brickH);
      const offset = (row % 2) * brickW / 2;
      const localX = ((px - offset) % brickW + brickW) % brickW;
      const localY = py % brickH;
      return localX < g / 2 || localX > brickW - g / 2 || localY < g / 2 || localY > brickH - g / 2;
    };
  }

  // ==================================================================
  // Pattern 3: Chevron
  // V-shaped zigzag pattern (herringbone at 45°)
  // ==================================================================

  private paintChevron(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const stripeWidth = (size / 8) * params.tileSize;
    const stripeHeight = (size / 6) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * stripeWidth));

    for (let row = -2; row < Math.ceil(size / stripeHeight) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / (stripeWidth / 2)) + 2; col++) {
        const isEvenStripe = col % 2 === 0;
        const baseColor = isEvenStripe ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;

        const baseX = col * stripeWidth / 2;
        const baseY = row * stripeHeight;
        const offsetY = (col % 2 === 0) ? 0 : stripeHeight / 2;

        // Left half of V
        ctx.beginPath();
        ctx.moveTo(baseX + g / 2, baseY + offsetY + g / 2);
        ctx.lineTo(baseX + stripeWidth / 2 - g / 2, baseY + offsetY + stripeHeight / 2);
        ctx.lineTo(baseX + g / 2, baseY + offsetY + stripeHeight - g / 2);
        ctx.closePath();
        ctx.fill();

        // Right half of V
        ctx.beginPath();
        ctx.moveTo(baseX + stripeWidth / 2 + g / 2, baseY + offsetY + g / 2);
        ctx.lineTo(baseX + stripeWidth - g / 2, baseY + offsetY + stripeHeight / 2);
        ctx.lineTo(baseX + stripeWidth / 2 + g / 2, baseY + offsetY + stripeHeight - g / 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const col = Math.floor(px / (stripeWidth / 2));
      const row = Math.floor(py / stripeHeight);
      const offsetY = (col % 2 === 0) ? 0 : stripeHeight / 2;
      const localY = ((py - row * stripeHeight - offsetY) % stripeHeight + stripeHeight) % stripeHeight;
      const localX = ((px - col * stripeWidth / 2) % (stripeWidth / 2) + stripeWidth / 2) % (stripeWidth / 2);
      // Distance from V centre line
      const distFromCenter = Math.abs(localX - stripeWidth / 4) / (stripeWidth / 4);
      const yRatio = localY / stripeHeight;
      const chevronDist = Math.abs(distFromCenter - (1 - 2 * Math.abs(yRatio - 0.5)));
      return chevronDist < (g / stripeWidth) * 2;
    };
  }

  // ==================================================================
  // Pattern 4: Diamond
  // Diamond/rhombus pattern with diagonal grid
  // ==================================================================

  private paintDiamond(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const diamondW = (size / 8) * params.tileSize;
    const diamondH = (size / 6) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * Math.min(diamondW, diamondH)));

    for (let row = -2; row < Math.ceil(size / (diamondH / 2)) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / diamondW) + 2; col++) {
        const cx = col * diamondW + (row % 2) * diamondW / 2;
        const cy = row * diamondH / 2;
        const isAlternate = (row + col) % 2 === 0;
        const baseColor = isAlternate ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;

        ctx.beginPath();
        ctx.moveTo(cx, cy - diamondH / 2 + g / 2);
        ctx.lineTo(cx + diamondW / 2 - g / 2, cy);
        ctx.lineTo(cx, cy + diamondH / 2 - g / 2);
        ctx.lineTo(cx - diamondW / 2 + g / 2, cy);
        ctx.closePath();
        ctx.fill();
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const row = Math.round(py / (diamondH / 2));
      const col = Math.round((px - (row % 2) * diamondW / 2) / diamondW);
      const cx = col * diamondW + (row % 2) * diamondW / 2;
      const cy = row * diamondH / 2;
      const dx = Math.abs(px - cx) / (diamondW / 2);
      const dy = Math.abs(py - cy) / (diamondH / 2);
      return dx + dy > 1 - g / Math.min(diamondW, diamondH);
    };
  }

  // ==================================================================
  // Pattern 5: Herringbone
  // Classic 90° herringbone pattern
  // ==================================================================

  private paintHerringbone(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    noise: Noise3D,
  ): GroutCheckFn {
    const tileLong = (size / 4) * params.tileSize;
    const tileShort = (size / 8) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * tileShort));

    for (let blockRow = -1; blockRow < Math.ceil(size / tileShort) + 1; blockRow++) {
      for (let blockCol = -1; blockCol < Math.ceil(size / tileLong) + 1; blockCol++) {
        const bx = blockCol * tileLong;
        const by = blockRow * tileShort;

        // Vertical piece
        const n1 = noise.perlin(blockRow * 0.3, blockCol * 0.3, 0) * params.colorVariation;
        const c1 = varyTileColor(params.tileColor1, rng, params.colorVariation);
        ctx.fillStyle = `#${c1.clone().offsetHSL(0, 0, n1 * 0.2).getHexString()}`;
        ctx.fillRect(bx + g / 2, by + g / 2, tileShort - g, tileLong - g);

        // Horizontal piece
        const n2 = noise.perlin(blockRow * 0.3 + 50, blockCol * 0.3 + 50, 0) * params.colorVariation;
        const c2 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c2.clone().offsetHSL(0, 0, n2 * 0.2).getHexString()}`;
        ctx.fillRect(bx + tileShort + g / 2, by + g / 2, tileLong - g, tileShort - g);
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const blockCol = Math.floor(px / tileLong);
      const blockRow = Math.floor(py / tileShort);
      const lx = px - blockCol * tileLong;
      const ly = py - blockRow * tileShort;
      const inVertical = lx < tileShort;
      if (inVertical) {
        return lx < g / 2 || lx > tileShort - g / 2 || ly < g / 2 || ly > tileLong - g / 2;
      } else {
        return lx < tileShort + g / 2 || lx > tileShort + tileLong - g / 2 || ly < g / 2 || ly > tileShort - g / 2;
      }
    };
  }

  // ==================================================================
  // Pattern 6: Hexagon
  // Hexagonal tile pattern (honeycomb)
  // ==================================================================

  private paintHexagon(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const hexRadius = (size / 12) * params.tileSize;
    const hexW = hexRadius * 2;
    const hexH = hexRadius * Math.sqrt(3);
    const g = Math.max(1, Math.floor(params.mortarWidth * hexRadius));
    const innerRadius = hexRadius - g / 2;

    for (let row = -2; row < Math.ceil(size / hexH) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / (hexW * 0.75)) + 2; col++) {
        const cx = col * hexW * 0.75;
        const cy = row * hexH + (col % 2) * hexH / 2;
        const isAlt = (row + col) % 2 === 0;
        const baseColor = isAlt ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = cx + innerRadius * Math.cos(angle);
          const hy = cy + innerRadius * Math.sin(angle);
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      // Find nearest hex centre
      const col = Math.round(px / (hexW * 0.75));
      const row = Math.round((py - (col % 2) * hexH / 2) / hexH);
      const cx = col * hexW * 0.75;
      const cy = row * hexH + (col % 2) * hexH / 2;
      const dx = Math.abs(px - cx);
      const dy = Math.abs(py - cy);
      // Hexagonal distance check
      const dist = Math.max(dx * Math.sqrt(3) / 2 + dy / 2, dy);
      return dist > innerRadius;
    };
  }

  // ==================================================================
  // Pattern 7: Shell
  // Shell/fan-shaped pattern (tortoiseshell / scallop)
  // ==================================================================

  private paintShell(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const shellRadius = (size / 10) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * shellRadius));
    const innerR = shellRadius - g / 2;

    for (let row = -2; row < Math.ceil(size / (shellRadius * 1.5)) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / (shellRadius * 2)) + 2; col++) {
        const cx = col * shellRadius * 2 + (row % 2) * shellRadius;
        const cy = row * shellRadius * 1.5;

        // Upper fan (shell shape)
        const isAlt = (row + col) % 2 === 0;
        const baseColor = isAlt ? params.tileColor1 : params.tileColor2;
        const color = varyTileColor(baseColor, rng, params.colorVariation);
        ctx.fillStyle = `#${color.getHexString()}`;

        // Draw a fan/arc shape
        ctx.beginPath();
        ctx.arc(cx, cy + shellRadius * 0.2, innerR, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.lineTo(cx, cy - shellRadius * 0.3);
        ctx.closePath();
        ctx.fill();

        // Add subtle radial lines for shell texture
        const darkerColor = baseColor.clone().offsetHSL(0, 0, -0.05);
        ctx.strokeStyle = `#${darkerColor.getHexString()}`;
        ctx.lineWidth = 0.5;
        for (let r = 0; r < 5; r++) {
          const angle = Math.PI * 1.15 + (Math.PI * 0.7) * r / 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy - shellRadius * 0.3);
          ctx.lineTo(
            cx + innerR * 0.9 * Math.cos(angle),
            cy + shellRadius * 0.2 + innerR * 0.9 * Math.sin(angle),
          );
          ctx.stroke();
        }
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const row = Math.round(py / (shellRadius * 1.5));
      const col = Math.round((px - (row % 2) * shellRadius) / (shellRadius * 2));
      const cx = col * shellRadius * 2 + (row % 2) * shellRadius;
      const cy = row * shellRadius * 1.5;
      const dx = px - cx;
      const dy = py - (cy + shellRadius * 0.2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const inArc = angle > Math.PI * 1.15 && angle < Math.PI * 1.85;
      return !inArc || dist > innerR;
    };
  }

  // ==================================================================
  // Pattern 8: SpanishBound
  // Spanish bond: 1 large tile + 4 small tiles in cross pattern
  // ==================================================================

  private paintSpanishBound(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    noise: Noise3D,
  ): GroutCheckFn {
    // Spanish bond unit: one large square with 4 smaller rectangles around it
    const unitSize = (size / 4) * params.tileSize;
    const largeSize = unitSize * 0.6;
    const smallSize = unitSize * 0.4;
    const g = Math.max(1, Math.floor(params.mortarWidth * unitSize));

    for (let unitRow = -1; unitRow < Math.ceil(size / unitSize) + 1; unitRow++) {
      for (let unitCol = -1; unitCol < Math.ceil(size / unitSize) + 1; unitCol++) {
        const baseX = unitCol * unitSize;
        const baseY = unitRow * unitSize;

        // Large centre tile
        const n1 = noise.perlin(unitRow * 0.4, unitCol * 0.4, 0) * params.colorVariation;
        const c1 = varyTileColor(params.tileColor1, rng, params.colorVariation);
        ctx.fillStyle = `#${c1.clone().offsetHSL(0, 0, n1 * 0.2).getHexString()}`;
        ctx.fillRect(
          baseX + smallSize + g / 2,
          baseY + smallSize + g / 2,
          largeSize - g,
          largeSize - g,
        );

        // Top small tile
        const c2 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c2.getHexString()}`;
        ctx.fillRect(
          baseX + smallSize + g / 2,
          baseY + g / 2,
          largeSize - g,
          smallSize - g,
        );

        // Bottom small tile
        const c3 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c3.getHexString()}`;
        ctx.fillRect(
          baseX + smallSize + g / 2,
          baseY + smallSize + largeSize + g / 2,
          largeSize - g,
          smallSize - g,
        );

        // Left small tile
        const c4 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c4.getHexString()}`;
        ctx.fillRect(
          baseX + g / 2,
          baseY + smallSize + g / 2,
          smallSize - g,
          largeSize - g,
        );

        // Right small tile
        const c5 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c5.getHexString()}`;
        ctx.fillRect(
          baseX + smallSize + largeSize + g / 2,
          baseY + smallSize + g / 2,
          smallSize - g,
          largeSize - g,
        );
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const unitCol = Math.floor(px / unitSize);
      const unitRow = Math.floor(py / unitSize);
      const lx = px - unitCol * unitSize;
      const ly = py - unitRow * unitSize;

      // Determine which tile this pixel belongs to
      const inLeft = lx < smallSize;
      const inRight = lx > smallSize + largeSize;
      const inTop = ly < smallSize;
      const inBottom = ly > smallSize + largeSize;
      const inCenterH = lx >= smallSize && lx <= smallSize + largeSize;
      const inCenterV = ly >= smallSize && ly <= smallSize + largeSize;

      if (inCenterH && inCenterV) {
        // Large centre tile
        const localX = lx - smallSize;
        const localY = ly - smallSize;
        return localX < g / 2 || localX > largeSize - g / 2 || localY < g / 2 || localY > largeSize - g / 2;
      } else if (inCenterH && inTop) {
        const localX = lx - smallSize;
        return localX < g / 2 || localX > largeSize - g / 2 || ly < g / 2 || ly > smallSize - g / 2;
      } else if (inCenterH && inBottom) {
        const localX = lx - smallSize;
        const localY = ly - smallSize - largeSize;
        return localX < g / 2 || localX > largeSize - g / 2 || localY < g / 2 || localY > smallSize - g / 2;
      } else if (inLeft && inCenterV) {
        const localY = ly - smallSize;
        return lx < g / 2 || lx > smallSize - g / 2 || localY < g / 2 || localY > largeSize - g / 2;
      } else if (inRight && inCenterV) {
        const localX = lx - smallSize - largeSize;
        const localY = ly - smallSize;
        return localX < g / 2 || localX > smallSize - g / 2 || localY < g / 2 || localY > largeSize - g / 2;
      }
      // Corner mortar regions
      return true;
    };
  }

  // ==================================================================
  // Pattern 9: Star
  // 8-pointed star tile pattern with cross/diamond accents
  // ==================================================================

  private paintStar(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const starRadius = (size / 8) * params.tileSize;
    const g = Math.max(1, Math.floor(params.mortarWidth * starRadius));
    const outerR = starRadius - g / 2;
    const innerR = outerR * 0.45;

    /** Draw an 8-pointed star */
    const drawStarShape = (cx: number, cy: number, oR: number, iR: number, fillColor: string) => {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI / 8) * i - Math.PI / 2;
        const r = i % 2 === 0 ? oR : iR;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };

    for (let row = -2; row < Math.ceil(size / (starRadius * 2)) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / (starRadius * 2)) + 2; col++) {
        const cx = col * starRadius * 2;
        const cy = row * starRadius * 2;

        // Star
        const starColor = varyTileColor(params.tileColor1, rng, params.colorVariation);
        drawStarShape(cx, cy, outerR, innerR, `#${starColor.getHexString()}`);

        // Cross/diamond fills between stars
        const crossColor = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${crossColor.getHexString()}`;
        const dSize = starRadius * 0.6 - g / 2;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const fx = cx + dx * starRadius;
          const fy = cy + dy * starRadius;
          ctx.beginPath();
          ctx.moveTo(fx, fy - dSize);
          ctx.lineTo(fx + dSize, fy);
          ctx.lineTo(fx, fy + dSize);
          ctx.lineTo(fx - dSize, fy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const col = Math.round(px / (starRadius * 2));
      const row = Math.round(py / (starRadius * 2));
      const cx = col * starRadius * 2;
      const cy = row * starRadius * 2;
      const dx = (px - cx) / outerR;
      const dy = (py - cy) / outerR;
      // Approximate star shape: L1 + L∞ mix
      const l1 = Math.abs(dx) + Math.abs(dy);
      const linf = Math.max(Math.abs(dx), Math.abs(dy));
      const starDist = (l1 + linf) / 2;
      return starDist > 0.85;
    };
  }

  // ==================================================================
  // Pattern 10: Triangle
  // Equilateral triangle tessellation
  // ==================================================================

  private paintTriangle(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    _noise: Noise3D,
  ): GroutCheckFn {
    const triSide = (size / 8) * params.tileSize;
    const triHeight = triSide * Math.sqrt(3) / 2;
    const g = Math.max(1, Math.floor(params.mortarWidth * triSide));
    const shrink = g / 2;

    for (let row = -2; row < Math.ceil(size / triHeight) + 2; row++) {
      for (let col = -2; col < Math.ceil(size / triSide) + 2; col++) {
        const baseX = col * triSide;
        const baseY = row * triHeight;
        const offset = (row % 2) * triSide / 2;
        const bx = baseX + offset;

        // Upward-pointing triangle
        const c1 = varyTileColor(params.tileColor1, rng, params.colorVariation);
        ctx.fillStyle = `#${c1.getHexString()}`;
        ctx.beginPath();
        ctx.moveTo(bx + triSide / 2, baseY + shrink);
        ctx.lineTo(bx + shrink, baseY + triHeight - shrink);
        ctx.lineTo(bx + triSide - shrink, baseY + triHeight - shrink);
        ctx.closePath();
        ctx.fill();

        // Downward-pointing triangle
        const c2 = varyTileColor(params.tileColor2, rng, params.colorVariation);
        ctx.fillStyle = `#${c2.getHexString()}`;
        ctx.beginPath();
        ctx.moveTo(bx + triSide / 2, baseY + triHeight - shrink);
        ctx.lineTo(bx - triSide / 2 + shrink, baseY + shrink);
        ctx.lineTo(bx + triSide + triSide / 2 - shrink, baseY + shrink);
        ctx.closePath();
        ctx.fill();
      }
    }

    return (u: number, v: number): boolean => {
      const px = u * size;
      const py = v * size;
      const row = Math.floor(py / triHeight);
      const offset = (row % 2) * triSide / 2;
      const lx = ((px - offset) % triSide + triSide) % triSide;
      const ly = py % triHeight;
      // Distance from triangle edges
      const isUpper = ly < triHeight * (1 - 2 * Math.abs(lx / triSide - 0.5));
      const edgeDist = isUpper
        ? Math.min(ly, Math.abs(lx - triSide / 2) * triHeight / (triSide / 2) - (triHeight - ly))
        : Math.min(triHeight - ly, Math.abs(lx - triSide / 2) * triHeight / (triSide / 2) - ly);
      return edgeDist < g;
    };
  }

  // ==================================================================
  // Pattern 11: AdvancedTiles
  // Combines multiple patterns with random selection per region
  // Uses Voronoi-like regions to assign different sub-patterns
  // ==================================================================

  private paintAdvancedTiles(
    ctx: CanvasRenderingContext2D,
    size: number,
    params: TilePatternParams,
    rng: SeededRandom,
    noise: Noise3D,
  ): GroutCheckFn {
    // Define sub-patterns to mix
    const subPatterns: TilePatternType[] = [
      'brick', 'herringbone', 'diamond', 'hexagon', 'basketweave',
    ];

    // Create region map using Voronoi-like cells
    const numRegions = 6;
    const regionSeeds: Array<{ cx: number; cy: number; patternIdx: number }> = [];
    for (let i = 0; i < numRegions; i++) {
      regionSeeds.push({
        cx: rng.next(),
        cy: rng.next(),
        patternIdx: rng.nextInt(0, subPatterns.length - 1),
      });
    }

    // Generate each sub-pattern onto its own canvas, then composite
    const regionMap = new Uint8Array(size * size);

    // Build Voronoi region assignment
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let minDist = Infinity;
        let closestRegion = 0;
        for (let r = 0; r < numRegions; r++) {
          const dx = u - regionSeeds[r].cx;
          const dy = v - regionSeeds[r].cy;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            closestRegion = r;
          }
        }
        regionMap[y * size + x] = closestRegion;
      }
    }

    // Select 3 colours from the 3 tile colours based on region
    const regionColors = [params.tileColor1, params.tileColor2, params.tileColor3];
    const g = Math.max(1, Math.floor(params.mortarWidth * size * 0.012));

    // For each region, draw the assigned sub-pattern clipped to that region
    for (let r = 0; r < numRegions; r++) {
      const patternType = subPatterns[regionSeeds[r].patternIdx];
      const baseColor = regionColors[r % 3];
      const regionRng = new SeededRandom(params.seed + r * 1000);

      // Generate tiles for this region
      switch (patternType) {
        case 'brick': {
          const brickW = size / 8;
          const brickH = size / 16;
          for (let row = 0; row < Math.ceil(size / brickH); row++) {
            const offset = (row % 2) * brickW / 2;
            for (let col = -1; col < Math.ceil(size / brickW) + 1; col++) {
              const bx = col * brickW + offset;
              const by = row * brickH;
              const color = varyTileColor(baseColor, regionRng, params.colorVariation);
              this.fillRegionRect(ctx, size, regionMap, r, bx + g / 2, by + g / 2, brickW - g, brickH - g, color);
            }
          }
          break;
        }
        case 'herringbone': {
          const tileLong = size / 6;
          const tileShort = size / 12;
          for (let br = -1; br < Math.ceil(size / tileShort) + 1; br++) {
            for (let bc = -1; bc < Math.ceil(size / tileLong) + 1; bc++) {
              const bx = bc * tileLong;
              const by = br * tileShort;
              const c1 = varyTileColor(baseColor, regionRng, params.colorVariation);
              this.fillRegionRect(ctx, size, regionMap, r, bx + g / 2, by + g / 2, tileShort - g, tileLong - g, c1);
              const c2 = varyTileColor(baseColor, regionRng, params.colorVariation);
              this.fillRegionRect(ctx, size, regionMap, r, bx + tileShort + g / 2, by + g / 2, tileLong - g, tileShort - g, c2);
            }
          }
          break;
        }
        case 'diamond': {
          const dw = size / 10;
          const dh = size / 8;
          for (let row = -1; row < Math.ceil(size / (dh / 2)) + 1; row++) {
            for (let col = -1; col < Math.ceil(size / dw) + 1; col++) {
              const cx = col * dw + (row % 2) * dw / 2;
              const cy = row * dh / 2;
              const color = varyTileColor(baseColor, regionRng, params.colorVariation);
              this.fillRegionDiamond(ctx, size, regionMap, r, cx, cy, dw / 2 - g / 2, dh / 2 - g / 2, color);
            }
          }
          break;
        }
        case 'hexagon': {
          const hexR = size / 16;
          const hexW = hexR * 2;
          const hexH = hexR * Math.sqrt(3);
          const innerR = hexR - g / 2;
          for (let row = -1; row < Math.ceil(size / hexH) + 1; row++) {
            for (let col = -1; col < Math.ceil(size / (hexW * 0.75)) + 1; col++) {
              const cx = col * hexW * 0.75;
              const cy = row * hexH + (col % 2) * hexH / 2;
              const color = varyTileColor(baseColor, regionRng, params.colorVariation);
              this.fillRegionHexagon(ctx, size, regionMap, r, cx, cy, innerR, color);
            }
          }
          break;
        }
        case 'basketweave': {
          const bs = size / 12;
          const halfBs = bs / 2;
          for (let row = -1; row < Math.ceil(size / halfBs) + 1; row++) {
            for (let col = -1; col < Math.ceil(size / halfBs) + 1; col++) {
              const isH = (Math.floor(row / 2) + Math.floor(col / 2)) % 2 === 0;
              const bx = col * halfBs;
              const by = row * halfBs;
              const color = varyTileColor(baseColor, regionRng, params.colorVariation);
              if (isH) {
                this.fillRegionRect(ctx, size, regionMap, r, bx + g / 2, by + g / 2, bs - g, halfBs - g, color);
              } else {
                this.fillRegionRect(ctx, size, regionMap, r, bx + g / 2, by + g / 2, halfBs - g, bs - g, color);
              }
            }
          }
          break;
        }
      }
    }

    // Draw region borders (mortar between regions)
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const region = regionMap[idx];
        // Check if this pixel is on a region boundary
        if (
          regionMap[idx - 1] !== region ||
          regionMap[idx + 1] !== region ||
          regionMap[idx - size] !== region ||
          regionMap[idx + size] !== region
        ) {
          const pi = idx * 4;
          // We can't directly access the imageData here easily, so just paint mortar
          // We'll handle this through the grout check
        }
      }
    }

    return (u: number, v: number): boolean => {
      const px = Math.floor(u * size);
      const py = Math.floor(v * size);
      if (px < 0 || px >= size || py < 0 || py >= size) return true;
      const idx = py * size + px;
      const region = regionMap[idx];
      // Check if on region boundary
      if (px > 0 && regionMap[idx - 1] !== region) return true;
      if (px < size - 1 && regionMap[idx + 1] !== region) return true;
      if (py > 0 && regionMap[idx - size] !== region) return true;
      if (py < size - 1 && regionMap[idx + size] !== region) return true;
      return false;
    };
  }

  // ------------------------------------------------------------------
  // AdvancedTiles region-clipped drawing helpers
  // ------------------------------------------------------------------

  /** Fill a rectangle only within a given Voronoi region */
  private fillRegionRect(
    ctx: CanvasRenderingContext2D,
    size: number,
    regionMap: Uint8Array,
    region: number,
    x: number, y: number, w: number, h: number,
    color: THREE.Color,
  ): void {
    const hex = `#${color.getHexString()}`;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(size, Math.floor(x + w));
    const y1 = Math.min(size, Math.floor(y + h));

    // For efficiency, first fill the rect then paint over non-region pixels with mortar
    ctx.fillStyle = hex;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Overwrite non-region pixels (done at a coarser level for performance)
    const step = 4;
    for (let py = y0; py < y1; py += step) {
      for (let px = x0; px < x1; px += step) {
        if (regionMap[py * size + px] !== region) {
          ctx.clearRect(px, py, step, step);
        }
      }
    }
  }

  /** Fill a diamond only within a given Voronoi region */
  private fillRegionDiamond(
    ctx: CanvasRenderingContext2D,
    size: number,
    regionMap: Uint8Array,
    region: number,
    cx: number, cy: number, hw: number, hh: number,
    color: THREE.Color,
  ): void {
    const hex = `#${color.getHexString()}`;
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
  }

  /** Fill a hexagon only within a given Voronoi region */
  private fillRegionHexagon(
    ctx: CanvasRenderingContext2D,
    size: number,
    regionMap: Uint8Array,
    region: number,
    cx: number, cy: number, innerR: number,
    color: THREE.Color,
  ): void {
    const hex = `#${color.getHexString()}`;
    ctx.fillStyle = hex;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const hx = cx + innerR * Math.cos(angle);
      const hy = cy + innerR * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// ============================================================================
// Standalone convenience functions (backward-compatible API)
// ============================================================================

const _defaultLibrary = new TilePatternLibrary();

/**
 * Create a tile material for the given pattern type.
 *
 * @param pattern - One of the 11 pattern type keys
 * @param options - Optional overrides for colours, mortar, roughness, etc.
 * @returns A MeshStandardMaterial with procedural map, roughnessMap, and normalMap
 */
export function createTileMaterial(
  pattern: TilePatternType,
  options: Partial<TilePatternParams> = {},
): THREE.MeshStandardMaterial {
  const result = _defaultLibrary.generate({ ...options, pattern });
  return result.material as THREE.MeshStandardMaterial;
}

/**
 * Create a tile material from a named preset.
 *
 * @param pattern - Pattern type key (used for validation; preset overrides this)
 * @param presetName - Named preset
 * @returns A MeshStandardMaterial or null if preset not found
 */
export function createTileMaterialFromPreset(
  pattern: TilePatternType,
  presetName: string,
): THREE.MeshStandardMaterial | null {
  const result = _defaultLibrary.getPreset(presetName);
  if (!result) return null;
  return result.material as THREE.MeshStandardMaterial;
}

// ============================================================================
// Preset arrays grouped by pattern (for backward compat & convenience)
// ============================================================================

export const BASKETWEAVE_PRESETS: TilePatternPreset[] = [
  { name: 'cream_basketweave', description: 'Cream basketweave tiles', params: { pattern: 'basketweave', tileColor1: new THREE.Color(0xf5f0e8), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.3, seed: 1 } },
  { name: 'gray_basketweave', description: 'Grey basketweave tiles', params: { pattern: 'basketweave', tileColor1: new THREE.Color(0xb0b0a8), tileColor2: new THREE.Color(0x989890), mortarColor: new THREE.Color(0x606058), roughness: 0.45, seed: 2 } },
];

export const BRICK_PRESETS: TilePatternPreset[] = [
  { name: 'red_brick', description: 'Classic red running bond brick', params: { pattern: 'brick', tileColor1: new THREE.Color(0x8b3a2a), tileColor2: new THREE.Color(0x7a3020), mortarColor: new THREE.Color(0x8a8878), roughness: 0.75, colorVariation: 0.1, seed: 10 } },
  { name: 'white_subway', description: 'White subway tile', params: { pattern: 'brick', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe8e4dc), mortarColor: new THREE.Color(0xa0a098), roughness: 0.25, seed: 11 } },
];

export const CHEVRON_PRESETS: TilePatternPreset[] = [
  { name: 'wood_chevron', description: 'Wooden chevron parquet', params: { pattern: 'chevron', tileColor1: new THREE.Color(0x8a6a42), tileColor2: new THREE.Color(0x6a4a2a), mortarColor: new THREE.Color(0x4a3a22), roughness: 0.6, seed: 20 } },
  { name: 'marble_chevron', description: 'Marble chevron tiles', params: { pattern: 'chevron', tileColor1: new THREE.Color(0xe8e0d4), tileColor2: new THREE.Color(0xc8b8a4), mortarColor: new THREE.Color(0x908878), roughness: 0.2, seed: 21 } },
];

export const DIAMOND_PRESETS: TilePatternPreset[] = [
  { name: 'white_diamond', description: 'White diamond tiles', params: { pattern: 'diamond', tileColor1: new THREE.Color(0xf0ece0), tileColor2: new THREE.Color(0xd0c8b8), mortarColor: new THREE.Color(0x888880), roughness: 0.25, seed: 30 } },
  { name: 'terracotta_diamond', description: 'Terracotta diamond tiles', params: { pattern: 'diamond', tileColor1: new THREE.Color(0xb85830), tileColor2: new THREE.Color(0x8a4020), mortarColor: new THREE.Color(0x5a3828), roughness: 0.65, seed: 31 } },
];

export const HERRINGBONE_PRESETS: TilePatternPreset[] = [
  { name: 'gray_herringbone', description: 'Grey herringbone parquet', params: { pattern: 'herringbone', tileColor1: new THREE.Color(0xa8a8a0), tileColor2: new THREE.Color(0x908880), mortarColor: new THREE.Color(0x606058), roughness: 0.4, seed: 40 } },
  { name: 'wood_herringbone', description: 'Wooden herringbone floor', params: { pattern: 'herringbone', tileColor1: new THREE.Color(0x8a6840), tileColor2: new THREE.Color(0x705830), mortarColor: new THREE.Color(0x4a3820), roughness: 0.55, seed: 41 } },
];

export const HEXAGON_PRESETS: TilePatternPreset[] = [
  { name: 'white_hexagon', description: 'White hexagonal tiles', params: { pattern: 'hexagon', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xe4e0d8), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.2, seed: 50 } },
  { name: 'honey_hexagon', description: 'Honey-coloured hexagonal tiles', params: { pattern: 'hexagon', tileColor1: new THREE.Color(0xd4a030), tileColor2: new THREE.Color(0xb8882a), mortarColor: new THREE.Color(0x6a5a30), roughness: 0.35, seed: 51 } },
];

export const SHELL_PRESETS: TilePatternPreset[] = [
  { name: 'cream_shell', description: 'Cream shell/scallop tiles', params: { pattern: 'shell', tileColor1: new THREE.Color(0xf0e8d8), tileColor2: new THREE.Color(0xe8e0d0), mortarColor: new THREE.Color(0x8a8070), roughness: 0.35, seed: 60 } },
  { name: 'pink_shell', description: 'Pink shell/scallop tiles', params: { pattern: 'shell', tileColor1: new THREE.Color(0xe8b0a0), tileColor2: new THREE.Color(0xd8a090), mortarColor: new THREE.Color(0x9a8880), roughness: 0.3, seed: 61 } },
];

export const SPANISHBOUND_PRESETS: TilePatternPreset[] = [
  { name: 'terracotta_spanish', description: 'Terracotta Spanish bond', params: { pattern: 'spanishbound', tileColor1: new THREE.Color(0xb85030), tileColor2: new THREE.Color(0xa04020), mortarColor: new THREE.Color(0x6a5040), roughness: 0.65, seed: 70 } },
  { name: 'stone_spanish', description: 'Stone Spanish bond', params: { pattern: 'spanishbound', tileColor1: new THREE.Color(0xb0a898), tileColor2: new THREE.Color(0x908878), mortarColor: new THREE.Color(0x606058), roughness: 0.55, seed: 71 } },
];

export const STAR_PRESETS: TilePatternPreset[] = [
  { name: 'moroccan_star', description: 'Moroccan star pattern', params: { pattern: 'star', tileColor1: new THREE.Color(0xf0e8d0), tileColor2: new THREE.Color(0x2a7a5a), mortarColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 80 } },
  { name: 'blue_star', description: 'Blue star tiles', params: { pattern: 'star', tileColor1: new THREE.Color(0xf0f0f0), tileColor2: new THREE.Color(0x3a5a8a), mortarColor: new THREE.Color(0x808890), roughness: 0.25, seed: 81 } },
];

export const TRIANGLE_PRESETS: TilePatternPreset[] = [
  { name: 'white_triangle', description: 'White triangle tessellation', params: { pattern: 'triangle', tileColor1: new THREE.Color(0xf0ece4), tileColor2: new THREE.Color(0xd8d0c4), mortarColor: new THREE.Color(0x8a8a82), roughness: 0.25, seed: 90 } },
  { name: 'color_triangle', description: 'Colourful triangle tessellation', params: { pattern: 'triangle', tileColor1: new THREE.Color(0x5a9a8a), tileColor2: new THREE.Color(0xd4a040), mortarColor: new THREE.Color(0x6a6a5a), roughness: 0.35, seed: 91 } },
];

export const ADVANCEDTILES_PRESETS: TilePatternPreset[] = [
  { name: 'mixed_floor', description: 'Mixed pattern floor tiles', params: { pattern: 'advancedtiles', tileColor1: new THREE.Color(0xc8c0b0), tileColor2: new THREE.Color(0xa0988a), tileColor3: new THREE.Color(0x888078), mortarColor: new THREE.Color(0x6a6a62), roughness: 0.45, seed: 100 } },
  { name: 'vivid_mixed', description: 'Vivid mixed pattern tiles', params: { pattern: 'advancedtiles', tileColor1: new THREE.Color(0xd4a030), tileColor2: new THREE.Color(0x5a8a7a), tileColor3: new THREE.Color(0xa05040), mortarColor: new THREE.Color(0x4a4a42), roughness: 0.4, seed: 101 } },
];

/** All presets indexed by pattern type */
export const ALL_TILE_PRESETS: Record<TilePatternType, TilePatternPreset[]> = {
  basketweave: BASKETWEAVE_PRESETS,
  brick: BRICK_PRESETS,
  chevron: CHEVRON_PRESETS,
  diamond: DIAMOND_PRESETS,
  herringbone: HERRINGBONE_PRESETS,
  hexagon: HEXAGON_PRESETS,
  shell: SHELL_PRESETS,
  spanishbound: SPANISHBOUND_PRESETS,
  star: STAR_PRESETS,
  triangle: TRIANGLE_PRESETS,
  advancedtiles: ADVANCEDTILES_PRESETS,
};

// ============================================================================
// Individual pattern generator functions (backward-compatible)
// ============================================================================

export function generateBasketWeave(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('basketweave', overrides);
}
export function generateBrick(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('brick', overrides);
}
export function generateChevron(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('chevron', overrides);
}
export function generateDiamond(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('diamond', overrides);
}
export function generateHerringbone(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('herringbone', overrides);
}
export function generateHexagon(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('hexagon', overrides);
}
export function generateShell(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('shell', overrides);
}
export function generateSpanishBound(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('spanishbound', overrides);
}
export function generateStar(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('star', overrides);
}
export function generateTriangle(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('triangle', overrides);
}
export function generateAdvancedTiles(overrides: Partial<TilePatternParams> = {}): THREE.MeshStandardMaterial {
  return createTileMaterial('advancedtiles', overrides);
}
