# Task: Wear/Tear Material System & Fruit Surface Material Library

## Summary

Created 4 new files implementing the Wear/Tear material system and Fruit Surface material library for the infinigen-r3f project.

### Files Created

1. **`/home/z/my-project/infinigen-r3f/src/assets/materials/wear/EdgeWearMaterial.ts`**
   - `EdgeWearParams` interface with wearColor, wearIntensity, edgeWidth, scratchDensity, scratchDepth, scratchDirection, rustIntensity, seed
   - `EdgeWearMaterial` class with:
     - `applyToMaterial()` — applies edge wear to existing MeshStandardMaterial/MeshPhysicalMaterial
     - `generateEdgeWearMap()` — standalone edge wear grayscale mask (simulated bevel via noise gradient + Voronoi cell-edge detection)
     - `generateScratchMap()` — standalone scratch map (directional Voronoi-based scratch lines as normal perturbations)
     - Internal compositing: `compositeWearColor()`, `compositeWearRoughness()`, `compositeScratchNormals()`, `compositeRustOverlay()`
     - Static presets: `chippedPaint`, `wornMetal`, `weatheredWood`, `agedStone` (via `EDGE_WEAR_PRESETS`)

2. **`/home/z/my-project/infinigen-r3f/src/assets/materials/wear/ScratchesMaterial.ts`**
   - `ScratchParams` interface with direction, density, depth, width, curvature, crosshatch, color, seed
   - `ScratchesMaterial` class with:
     - `applyToMaterial()` — applies scratch effects to existing materials
     - `generateScratchNormalMap()` — scratch lines as normal perturbations (RG = tangent-space XY, B = Z-up)
     - `generateScratchRoughnessMap()` — scratches as roughness variations
     - Noise-driven curved scratch paths via `generateCurvedPath()`
     - Crosshatch support for perpendicular scratch set
     - Default params constant: `DEFAULT_SCRATCH_PARAMS`

3. **`/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Fruit/FruitMaterialLibrary.ts`**
   - `FruitType` union type: apple | blackberry | coconutGreen | coconutHairy | durian | pineapple | starfruit | strawberry
   - `FruitMaterialParams` interface with type, baseColor, secondaryColor, roughness, bumpIntensity, patternScale, ripeness, seed
   - `FruitMaterialLibrary` extends `BaseMaterialGenerator<FruitMaterialParams>` with:
     - 8 fruit material generators with per-pixel procedural color, normal, and roughness maps:
       1. **Apple** — Smooth skin with lenticels (Voronoi dots), gradient green→red based on ripeness, clearcoat
       2. **Blackberry** — Bumpy drupelet pattern (Voronoi cells), dark purple with highlight centers
       3. **CoconutGreen** — Fibrous cross-hatch texture (stretched noise), green
       4. **CoconutHairy** — Brown hairy strands (high-frequency directional noise), rough surface
       5. **Durian** — Spiky thorn pattern (Voronoi cells as thorns), green-brown
       6. **Pineapple** — Diamond grid pattern with spike tips, golden-brown
       7. **Starfruit** — Smooth waxy skin (clearcoat), yellow-green with subtle ridges
       8. **Strawberry** — Seed pits (Voronoi), red with yellow seeds, rib pattern
     - `generate()` and `getVariations()` from BaseMaterialGenerator
     - Type-specific default colors via `applyTypeDefaults()`

4. **`/home/z/my-project/infinigen-r3f/src/assets/materials/categories/Fruit/index.ts`**
   - Exports `FruitMaterialLibrary`, `FruitMaterialParams`, `FruitType`

### Files Modified

- **`src/assets/materials/categories/index.ts`** — Added Fruit material exports
- **`src/assets/materials/index.ts`** — Added EdgeWearMaterial, ScratchesMaterial, FruitMaterialLibrary exports

### Key Patterns Used

- `SeededNoiseGenerator` and `Noise3D` from `core/util/math/noise` for procedural noise
- `SeededRandom` from `core/util/MathUtils` for deterministic RNG
- `createCanvas` from `utils/CanvasUtils` for SSR-safe canvas creation
- `BaseMaterialGenerator<T>` with `generate()` / `getVariations()` / `getDefaultParams()`
- `MeshPhysicalMaterial` with clearcoat for waxy/glossy fruit surfaces
- Per-pixel `ImageData` manipulation for detailed procedural textures
- `CanvasTexture` with `RepeatWrapping` for seamless tiling

### Type Check

- `bunx tsc -p tsconfig.json --noEmit` passes with **0 errors**
