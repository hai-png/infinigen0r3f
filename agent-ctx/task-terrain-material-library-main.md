# Task: Terrain Material Library

## Agent: main

## Summary
Created a comprehensive Terrain Material Library for the infinigen-r3f project with 12 terrain material generators matching Infinigen's terrain materials.

## Files Created

### `/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Terrain/TerrainMaterialLibrary.ts` (1518 lines)
- **Class**: `TerrainMaterialLibrary` extending `BaseMaterialGenerator<TerrainParams>`
- **Interface**: `TerrainParams` with type, color, roughness, moisture, scale, detail, seed
- **Type**: `TerrainType` union of all 12 terrain type names

### 12 Terrain Texture Generators (private methods)
1. **ChunkyRock** - Large boulder shapes via ridged noise, deep crevices, warm/cool rock tones, mineral deposits
2. **CobbleStone** - Voronoi-like cobble pattern, gap detection, moss in gaps, weathering
3. **CrackedGround** - Domain-warped polygonal cracks via ridged multifractal, pebble accents
4. **Dirt** - Multi-scale patch/clump/grain noise, organic matter specks, stone inclusions
5. **Ice** - Fracture lines from fbm, crystalline structure, frost patches, bubble inclusions, blue tint
6. **Mountain** - Ridged multifractal rock face, snow accumulation, lichen patches, rock strata
7. **Mud** - Puddle regions, drying cracks around puddles, animal track impressions, sheen
8. **Sand** - Wind ripple patterns with warping, fine grain, wet sand bands, shell accents
9. **Sandstone** - Horizontal sedimentary layers with warping, erosion pockets, cross-bedding, desert varnish
10. **Soil** - Organic root channels, humus-rich zones, crumbly particles, bioturbation marks
11. **Stone** - Broad/medium/fine grain noise, mineral veins, moss/lichen, water staining
12. **Snow** - Gentle drift undulations, wind-sculpted details, ice crystal sparkle, blue shadows, dust contamination

### Additional Features
- **generateNormalMap()** - Per-type normal map config with terrain-specific features (crevice depressions, cobble gaps, crack depressions, fracture ridges, etc.)
- **generateRoughnessMap()** - Per-type roughness config with terrain-specific modifications (puddle smoothness, ice frost patches, sand ripples, etc.)
- **getVariations()** - Generates random variations with per-type roughness/hue/lightness ranges
- **24 static presets** in TERRAIN_PRESETS (2 per terrain type)
- **Static getPreset()/listPresets()** methods
- MeshPhysicalMaterial used for Ice (transmission, IOR), Snow (sheen), Mud (clearcoat)
- Color maps at 1024x1024, normal/roughness maps at 512x512

### `/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Terrain/index.ts`
- Exports `TerrainMaterialLibrary`, `TerrainType`, `TerrainParams`

## Pattern Compliance
- Follows exact same code patterns as `StoneGenerator.ts`
- Uses `Noise3D` and `fbm` from `../../../../core/util/math/noise`
- Uses `SeededRandom` from `../../../../core/util/MathUtils`
- Uses `createCanvas` from `../../../utils/CanvasUtils`
- Extends `BaseMaterialGenerator` from `../../BaseMaterialGenerator`
- Returns `MaterialOutput` with material, maps, params

## Verification
- TypeScript type-check passes (`npx tsc --noEmit` - no errors)
