# Task 5-a - Critical Bug Fixes (First Batch)

## Summary

Verified and improved fixes for 13 critical bugs across the infinigen-r3f project. Most bugs had already been fixed by previous agents; I upgraded one fix and discovered/fixed an additional bug.

## Bugs Verified & Fixed

### Bug 1: FogSystem.ts - sampler3D crash
- **File**: `src/assets/weather/FogSystem.ts`
- **Previous fix**: Replaced `sampler3D` with `sampler2D` + Y-slice blending in shader, created `DataTexture` (2D)
- **My improvement**: Upgraded to proper `Data3DTexture` (Three.js 0.184 supports it) with `sampler3D` in the shader, enabling true 3D noise sampling instead of the approximate 2D slice-blending approach
- **Changes**:
  - Changed `noiseTexture` field type from `DataTexture | null` to `Data3DTexture | null`
  - Changed shader uniform from `sampler2D` to `sampler3D`
  - Replaced Y-slice blending `noise()` function with direct `texture(noiseTexture, coord)` 3D sampling
  - Updated `createNoiseTexture()` to create `Data3DTexture` with 3D data (width * height * depth), including `wrapR` for 3D tiling

### Bug 2 & 3: LightingSystem.ts - HDRI crashes
- **File**: `src/assets/lighting/LightingSystem.ts`
- **Previous fix**: Accept optional `renderer` parameter instead of `null as any`, added `texture.mapping = THREE.EquirectangularReflectionMapping`, wrapped in try-catch
- **My fix**: Removed dead `environment: WebGLCubeRenderTarget | null` field that was never assigned in `setupHDRI()` and only referenced in `dispose()`

### Bug 4-8: Five architectural generators missing materials
- **Files**: RailingGenerator.ts, BalconyGenerator.ts, FenceGenerator.ts, ChimneyGenerator.ts, BeamGenerator.ts
- **Previous fix**: All generators now have proper material helpers (getPostMaterial, getRailMaterial, getFloorMaterial, getBodyMaterial, getBeamMaterial, etc.) with appropriate metalness/roughness/color for metal, wood, glass, stone, concrete parts
- **Status**: Verified — all fixes correct, no changes needed

### Bug 9: PlasticGenerator - wrong material type
- **File**: `src/assets/materials/categories/Plastic/PlasticGenerator.ts`
- **Previous fix**: Uses `MeshPhysicalMaterial` when `transmission > 0` or type is 'translucent'/'metallic', uses `MeshStandardMaterial` for opaque matte/glossy types
- **Status**: Verified — fix correct, no changes needed

### Bug 10: StoneGenerator - wrong material type
- **File**: `src/assets/materials/categories/Stone/StoneGenerator.ts`
- **Previous fix**: Uses `MeshPhysicalMaterial` when `polishLevel > 0.7` (for clearcoat), uses `MeshStandardMaterial` for unpolished stone
- **Status**: Verified — fix correct, no changes needed

### Bug 11: creatures/index.ts - Missing exports
- **File**: `src/assets/objects/creatures/index.ts`
- **Previous fix**: All 4 generators (Fish, Reptile, Insect, Underwater) properly exported
- **Status**: Verified — fix correct, no changes needed

### Bug 12: MonocotGenerator - leaf loss
- **File**: `src/assets/objects/vegetation/plants/MonocotGenerator.ts`
- **Previous fix**: `generateField()` now iterates over all children of `generateStem()`, clones and bakes each child's transform, then merges all geometries (stem + leaves) into one before creating the InstancedMesh
- **Status**: Verified — fix correct, no changes needed

### Bug 13: FishGenerator - wrong head mesh
- **File**: `src/assets/objects/creatures/FishGenerator.ts`
- **Previous fix**: `generateHead()` now creates proper head geometry (`createEllipsoidGeometry(s*0.1, s*0.1, s*0.15)` — tapered) instead of body geometry (`createEllipsoidGeometry(s*0.15, s*0.12, s*0.35)` — wider)
- **Additional fix found**: `UnderwaterGenerator.generateHead()` was returning `this.generateBodyCore()` — returning a body mesh instead of a head mesh. Fixed to create a distinct head mesh (`createEllipsoidGeometry(s*0.08, s*0.08, s*0.12)`)
- **Status**: Verified FishGenerator fix, fixed UnderwaterGenerator

## Files Modified

1. `src/assets/weather/FogSystem.ts` — Upgraded from DataTexture/sampler2D to Data3DTexture/sampler3D
2. `src/assets/lighting/LightingSystem.ts` — Removed dead `environment` field
3. `src/assets/objects/creatures/UnderwaterGenerator.ts` — Fixed `generateHead()` to return head mesh instead of body mesh

## TypeScript Check

Ran `npx tsc --noEmit` — no new errors introduced (only pre-existing baseUrl deprecation warning).
