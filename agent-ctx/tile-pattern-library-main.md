# Task: Tile Pattern Material Library

## Summary

Created the comprehensive Tile Pattern Material Library for the infinigen-r3f project at `/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Tile/TilePatternLibrary.ts`.

## What was done

1. **Analyzed existing codebase**: Reviewed BaseMaterialGenerator, CanvasUtils, MathUtils, Noise3D, existing CeramicTileMaterial, TileGenerator, and the previous TilePatternLibrary (10 patterns, functional API).

2. **Created new TilePatternLibrary.ts** with:
   - **11 tile pattern generators**: BasketWeave, Brick, Chevron, Diamond, Herringbone, Hexagon, Shell, SpanishBound, Star, Triangle, AdvancedTiles
   - **`TilePatternLibrary` class** extending `BaseMaterialGenerator<TilePatternParams>` with:
     - `TilePatternParams` interface (pattern, tileColor1/2/3, mortarColor, mortarWidth, tileSize, rotation, colorVariation, roughness, metalness, resolution, seed)
     - `generate(params)` method creating tile texture + normal/roughness maps
     - Per-pattern generation methods (`paintBasketWeave`, `paintBrick`, etc.)
     - Mortar/grout rendering between tiles
     - Color variation per tile (HSL shift via `varyTileColor`)
     - Normal map generation from tile height differences (Sobel-like edge detection)
     - Roughness map (tiles smoother, mortar rougher)
     - `getVariations(count)`, `getPreset(name)`, `listPresets()` methods
     - 22 presets (2 per pattern type)
   - **Backward-compatible standalone functions**: `generateBasketWeave`, `generateBrick`, etc., plus `createTileMaterial` and `createTileMaterialFromPreset`
   - **Preset arrays** grouped by pattern: `BASKETWEAVE_PRESETS`, `BRICK_PRESETS`, etc., plus `ALL_TILE_PRESETS`
   - **`AdvancedTiles` pattern**: Uses Voronoi-like regions to randomly assign different sub-patterns (brick, herringbone, diamond, hexagon, basketweave) per region, with 3 tile colours and mortar at region boundaries

3. **Updated index.ts** at `/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Tile/index.ts`:
   - Exports the new `TilePatternLibrary` class alongside existing `CeramicTileMaterial`
   - Exports all 11 generator functions, all preset arrays, convenience functions
   - Exports `TilePatternParams`, `TilePatternPreset`, `TilePatternType` types
   - Added `ADVANCEDTILES_PRESETS` export

4. **Verification**: TypeScript compilation passes with zero errors (`tsc --noEmit`).

## Key design decisions

- Followed existing code patterns: `BaseMaterialGenerator`, `Noise3D`, `SeededRandom`, `createCanvas`
- Used canvas-based texture generation with proper mortar rendering
- Normal maps use Sobel-like edge detection for realistic tile-to-mortar transitions
- `GroutCheckFn` type used consistently for roughness/normal map generation
- AdvancedTiles uses Voronoi region assignment with region-clipped drawing helpers
- Full backward compatibility with previous functional API preserved
