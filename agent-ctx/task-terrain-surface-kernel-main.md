# Task: TerrainSurfaceKernel Implementation

## Summary
Implemented the `TerrainSurfaceKernel` class at `/home/z/my-project/infinigen-r3f/src/terrain/surface/TerrainSurfaceKernel.ts`. This is the critical bridge between the node graph evaluation system and the terrain surface shader pipeline, matching Infinigen's SurfaceKernel which transpiles Blender node trees into C++ evaluation kernels.

## What Was Implemented

### Core Classes and Types

1. **`TerrainSurfaceKernelConfig`** — Configuration interface with:
   - `displacementMode`: 'sdf_perturb' | 'vertex' | 'texture'
   - `displacementScale`, `displacementMidLevel`, `textureResolution`
   - `materialChannels`, `normalEpsilon`, `seed`

2. **`SurfaceEvaluationContext`** — Per-vertex evaluation context with:
   - Position, Normal, UV (standard)
   - materialId, elementTag (from element evaluation)
   - slope, height (terrain-specific)
   - caveDistance, waterDistance (for material blending)

3. **`TerrainComposedShader`** — Extends ComposedShader with:
   - graphValid, graphType, usedFallback metadata

4. **`TerrainSurfaceKernel`** — Main class with all required methods:

### Methods Implemented

- **`applySDFPerturbation()`** — Modifies SDF grid before meshing using formula: `modified_sdf = original_sdf - displacement * scale`
- **`applyVertexDisplacement()`** — Displaces vertices along normals after meshing, recomputes normals
- **`generateMaterialChannels()`** — Generates PBR texture maps (albedo, normal, roughness, metallic, AO, height)
- **`transpileToGLSL()`** — Converts ShaderGraphDescriptor to GLSL via GLSLShaderComposer with fallback
- **`applySurfaceTemplate()`** — Integrates with SurfaceRegistry for SDFPerturb/Displacement/BlenderDisplacement surface types

### Helper Methods

- `evaluateDisplacementAtPoint()` — Evaluates NodeGroup per-point for displacement
- `evaluateGraphTypeDisplacement()` — Type-based displacement (NOISE, VORONOI_CRACK, LAYERED_BLEND, ALTITUDE_BLEND)
- `computeFallbackDisplacement()` — Seeded noise FBM fallback when graph evaluation fails
- `generateChannelTexture()` / `generateChannelTextureFromGraph()` — Material channel texture generation
- `convertDescriptorToShaderGraph()` — Bridges ShaderGraphDescriptor to ComposableNode format
- `generateFallbackShader()` — GLSL noise shader fallback
- `buildEvaluationContext()` — Constructs SurfaceEvaluationContext from geometry
- `computeDisplacementNormal()` — Finite-difference normal computation

### Integration Points

- Imports `MaterialChannel`, `DisplacementMode`, `ShaderGraphContext`, `SurfaceKernelConfig` from `SurfaceKernelPipeline`
- Imports `SurfaceTemplate`, `SurfaceType`, `SurfaceDisplacementConfig`, `getEffectiveSurfaceType` from `SurfaceRegistry`
- Imports `ShaderGraphDescriptor`, `ShaderGraphType` from `ShaderGraphSurfaceBridge`
- Imports `GLSLShaderComposer`, `ComposedShader`, `ShaderGraph`, `ComposableNode` from GLSL module
- Imports `NodeGroup` from `NodeGeometryModifierBridge`
- Imports `NoiseUtils` from noise module and `SeededRandom` from MathUtils

## Verification

- TypeScript type-checking passes with zero new errors for the TerrainSurfaceKernel file
- All 9 pre-existing TypeScript errors in the project are in unrelated files (ColorSystem, constraints, integration)
- All methods are deterministic for a given seed
- Fallback paths handle GLSLShaderComposer unavailability gracefully
