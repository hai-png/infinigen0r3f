# Task: Two-Phase Terrain Pipeline Enhancement

## Task ID
task-two-phase-terrain-enhancement

## Agent
main

## Summary
Enhanced the `TwoPhaseTerrainPipeline` to achieve feature parity with the original Infinigen's two-phase terrain pipeline. Added 7 new methods and updated both `coarseTerrain()` and `fineTerrain()` methods.

## Changes Made

### File: `/home/z/my-project/infinigen-r3f/src/terrain/core/TwoPhaseTerrainPipeline.ts`

#### New Imports
- `TerrainSurfaceKernel` from `@/terrain/surface/TerrainSurfaceKernel`
- `TerrainSurfaceRegistry`, `SurfaceType`, `getEffectiveSurfaceType`, `SurfaceAttributeType` from `@/terrain/surface/SurfaceRegistry`
- `TerrainTagSystem`, `TagResult` from `@/terrain/tags`

#### New Class Members
- `private surfaceKernel: TerrainSurfaceKernel` — for SDF-level perturbation
- `private tagSystem: TerrainTagSystem` — for face-level tag generation

#### New Methods (7 total)

1. **`surfacesIntoSDF()`** (private) — Converts SDFPerturb surface templates to SDF displacement functions and applies them to the SDF grid before meshing. This is the critical `surfaces_into_sdf()` step that avoids "floating rocks" by modifying the isosurface shape before Marching Cubes extraction.

2. **`buildSpatialHash()`** (private) — Builds a spatial hash grid for O(1) amortized nearest-vertex lookup, replacing O(V×A) linear search.

3. **`findNearestVertex()`** (private) — Finds the nearest vertex in a spatial hash grid using 3×3×3 neighborhood search with fallback expansion.

4. **`transferAttributes()`** (private) — Transfers material and attribute data from coarse to fine mesh using spatial hashing for O(V_fine) amortized efficiency.

5. **`annotateWaterCovered()`** (private) — Annotates vertices covered by water by comparing vertex Y position against the water plane height.

6. **`computeCameraAdaptiveResolution()`** (private) — Computes camera-adaptive resolution based on camera frustum and pixel budget. Supports both PerspectiveCamera and OrthographicCamera.

7. **`applySDFPerturbation()`** (public) — Public API for applying SDF perturbation from surface templates, combining `surfacesIntoSDF()` and `TerrainSurfaceKernel.applySDFPerturbation()`. Supports optional selection mask for modulated perturbation.

8. **`tagTerrain()`** (public) — Applies terrain tags to geometry using the TerrainTagSystem, matching Infinigen's `tag_terrain()`.

9. **`createSurfaceRegistry()`** (public) — Creates a new TerrainSurfaceRegistry seeded with the pipeline's seed.

#### Updated Methods

- **`coarseTerrain()`** — Now creates a `TerrainSurfaceRegistry`, samples surface templates, and applies SDF perturbation BEFORE meshing via `surfacesIntoSDF()`. The perturbed SDF data is written back to the SDF object before `extractIsosurface()`.

- **`fineTerrain()`** — Major enhancement:
  - Applies SDF perturbation at fine resolution for consistent detail
  - Uses `transferAttributes()` with spatial hashing instead of O(V×A) linear search for attribute transfer from coarse to fine mesh
  - Calls `annotateWaterCovered()` to tag vertices covered by water
  - Uses `computeCameraAdaptiveResolution()` for frustum-aware LOD computation
  - Calls `tagTerrain()` to convert per-vertex tags to per-face TAG_* attributes

## Verification
- TypeScript compilation: No errors in the modified file or its imports
- All new methods have JSDoc comments
- All new methods integrate with existing infrastructure (TerrainSurfaceKernel, TerrainSurfaceRegistry, TerrainTagSystem)
