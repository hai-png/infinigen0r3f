/**
 * Tile Materials Module Index
 *
 * Procedural tile materials including ceramic tiles,
 * stone tiles, mosaics, and patterned surfaces.
 *
 * @module materials/categories/tile
 */

export { CeramicTileMaterial } from './CeramicTileMaterial';
export type { CeramicTileMaterialConfig as CeramicTileParams, CeramicTileMaterialConfig as CeramicTilePreset } from './CeramicTileMaterial';

export { TileGenerator } from './TileGenerator';
export type { TileParams } from './TileGenerator';

// Tile Pattern Library — 11 procedural tile patterns
export {
  // Main class
  TilePatternLibrary,

  // Standalone convenience functions
  createTileMaterial,
  createTileMaterialFromPreset,
  generateBasketWeave,
  generateBrick,
  generateChevron,
  generateDiamond,
  generateHerringbone,
  generateHexagon,
  generateShell,
  generateSpanishBound,
  generateStar,
  generateTriangle,
  generateAdvancedTiles,

  // Preset arrays
  BASKETWEAVE_PRESETS,
  BRICK_PRESETS,
  CHEVRON_PRESETS,
  DIAMOND_PRESETS,
  HERRINGBONE_PRESETS,
  HEXAGON_PRESETS,
  SHELL_PRESETS,
  SPANISHBOUND_PRESETS,
  STAR_PRESETS,
  TRIANGLE_PRESETS,
  ADVANCEDTILES_PRESETS,
  ALL_TILE_PRESETS,
} from './TilePatternLibrary';

export type {
  TilePatternParams,
  TilePatternPreset,
  TilePatternType,
} from './TilePatternLibrary';
