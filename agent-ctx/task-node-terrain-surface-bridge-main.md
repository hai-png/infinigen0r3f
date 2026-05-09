# Task: NodeTerrainSurfaceBridge Implementation

## Summary
Created `/home/z/my-project/infinigen-r3f/src/terrain/surface/NodeTerrainSurfaceBridge.ts` — a bridge module connecting the node graph evaluation system with the terrain surface shader pipeline, providing the R3F equivalent of Infinigen's `surface.py`.

## What Was Implemented

### Types & Enums
- **`SurfaceApplicationMode`** enum: `Replace`, `Blend`, `DisplacementOnly`, `SDFPerturb`
- **`SurfaceSelection`** type: `null | string | Float32Array | ((vertexIndex, position) => number)`

### NodeTerrainSurfaceBridge Class
All required methods from the spec were implemented:

1. **`applyMaterial(mesh, shaderGraph, selection?, mode?)`** — Applies a shader graph as material, supporting all 4 application modes
2. **`applyGeometryModifier(mesh, geoGraph, selection?)`** — Evaluates geometry graph per-vertex for displacement, applies along normals with selection masking
3. **`shaderGraphToMaterial(shaderGraph, params?)`** — Converts shader graph to THREE.MeshPhysicalMaterial with PBR properties
4. **`applySurface(mesh, displacementGraph, materialGraph, surfaceType, selection?)`** — Combined surface treatment (displacement + material)
5. **`readAttribute(mesh, attributeName)`** — Read named attribute from geometry
6. **`writeAttribute(mesh, attributeName, data, itemSize?)`** — Write named attribute to geometry
7. **`evaluateSelection(mesh, selection)`** — Evaluate SurfaceSelection into per-vertex weights (handles all 4 types)
8. **`dispose()`** — Clean up resources

### Private Helpers
- `applyMaterialBlend()` — Blend mode with weight normalization
- `createBlendedMaterial()` — Weighted PBR property averaging
- `applySDFPerturbationMode()` — SDF perturbation via kernel with fallback
- `applyGeometryModifierWithSDFConvention()` — Inverted displacement convention
- `isUniformWeights()` — Optimization check
- `deriveColor/deriveRoughness/deriveMetalness()` — PBR property derivation from graph
- `applyGraphTextures()` — Texture map generation via kernel

## Dependencies Used
- `TerrainSurfaceKernel` from `@/terrain/surface/TerrainSurfaceKernel`
- `ShaderGraphDescriptor` from `@/terrain/surface/ShaderGraphSurfaceBridge`
- `SurfaceType`, `TerrainSurfaceRegistry`, `getEffectiveSurfaceType` from `@/terrain/surface/SurfaceRegistry`
- `NoiseUtils` from `@/core/util/math/noise`
- `SeededRandom` from `@/core/util/MathUtils`

## Compilation
TypeScript compilation passes with zero errors for this file.
