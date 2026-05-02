# Phase 3.3 — Material & Texture Pipeline

## Summary
Implemented the complete Material and Texture Pipeline for the infinigen-r3f project.

## Files Created

### 1. ProceduralTextureGraph
**Path:** `src/assets/materials/textures/ProceduralTextureGraph.ts`
- A graph-based texture generation system with nodes: Noise, Voronoi, Gradient, ColorRamp, Math, Blend, Warp, Filter, Output
- Executes texture graphs to produce canvas-based textures
- Supports all PBR channels: albedo, normal, roughness, metallic, AO, height, emission
- Output as Float32Array + HTMLCanvasElement
- Caching based on graph + parameters hash
- Static factory methods for common graph patterns (noise, warped noise, blended, normal map)
- Index file: `src/assets/materials/textures/index.ts`

### 2. TextureBakePipeline
**Path:** `src/assets/materials/textures/TextureBakePipeline.ts`
- Bakes material parameters into full PBR texture sets
- Generates all PBR channels: albedo (RGB with noise variation), normal (Sobel from height), roughness, metallic, AO, height, emission
- Configurable resolution (256, 512, 1024, 2048)
- Tileable texture generation (seamless wrapping via edge blending)
- Creates MeshPhysicalMaterial from baked textures
- Category defaults for: metal, wood, stone, fabric, ceramic, glass, terrain, nature, creature
- Caching of baked texture sets

### 3. MaterialPresetLibrary
**Path:** `src/assets/materials/MaterialPresetLibrary.ts`
- 58 material presets organized by 9 categories:
  - **Terrain (12)**: mud, cracked_ground, sandstone, cobblestone, dirt, mountain_rock, soil, ice, sand, chunky_rock, lava, mossy_stone
  - **Wood (8)**: oak, pine, birch, mahogany, plywood, hardwood_floor, old_wood, bark
  - **Metal (7)**: steel, aluminum, copper, brass, chrome, rusted_iron, brushed_metal
  - **Ceramic (5)**: porcelain, terracotta, marble, glazed_tile, pottery
  - **Fabric (6)**: cotton, silk, velvet, leather, denim, canvas
  - **Plastic (4)**: glossy_plastic, matte_plastic, rubber, translucent_plastic
  - **Glass (3)**: clear_glass, frosted_glass, stained_glass
  - **Nature (8)**: grass, leaves, bark_birch, moss, lichen, snow, ice_crystal, coral
  - **Creature (5)**: snake_scale, fish_scale, feathers, fur, chitin
- Each preset has full PBR parameters and optional physical overrides (clearcoat, transmission, sheen, etc.)
- Variation system (age, wear, moisture, color shift)
- Simple material mode (no textures, for performance)
- Singleton access via `getDefaultLibrary()`

### 4. Enhanced WearGenerator
**Path:** `src/assets/materials/wear/WearGenerator.ts`
- All original features preserved (scratches, scuffs, dents, edge wear, dirt)
- New: Edge wear detection using noise-based curvature simulation
- New: Directional scratches (aligned in one direction)
- New: Grouped scratches (clusters of parallel scratches)
- New: Rust overlay (metal-specific, patchy noise-driven)
- New: Patina overlay (copper/bronze, bluish-green)
- New: Dirt in crevices (noise-driven low areas)
- New: Dirt on horizontal surfaces (gravity-based accumulation)
- New: Paint peeling (layered materials, reveals underlayer)
- Convenience methods: getMetalWearParams(), getStoneWearParams(), getWoodWearParams(), getPaintedWearParams()

### 5. MaterialBlendingSystem
**Path:** `src/assets/materials/blending/MaterialBlendingSystem.ts`
- Blend 2-4 materials using masks:
  - Slope mask (flat = material A, steep = material B, with falloff)
  - Altitude mask (low = sand, mid = grass, high = rock, with breakpoints)
  - Noise mask (organic transitions)
  - Custom mask (user-provided Float32Array)
- Generates blended PBR texture sets by per-pixel weighted blending
- Smooth transitions with configurable falloff
- Quick terrain blend method (sand → grass → rock → snow)
- Integration with TextureBakePipeline

### 6. Updated InfinigenScene.tsx
- Added imports for MaterialPresetLibrary and WearGenerator
- New feature flags: `pbrMaterials` (M key) and `materialInfo` (N key)
- MaterialPreviewSpheres component: displays 12 material presets as spheres
- MaterialInfoPanel component: shows material info overlay
- IvyOnRock enhanced: uses PBR material + wear when `pbrMaterials` is enabled
- Feature indicators for PBR Materials and Mat Info in the HUD

### 7. Updated materials index
**Path:** `src/assets/materials/index.ts`
- Added exports for all new systems with proper type renaming to avoid conflicts

## Build Status
✅ `npm run build` passes successfully with no TypeScript errors
