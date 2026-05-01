# Task 2-a: Seeded Noise System Overhaul

**Agent**: seed-noise-overhaul
**Date**: 2025-01-20
**Status**: ✅ Complete

## Summary

Overhauled the core math utilities to create a proper seeded noise system, eliminating all `Math.random()` usage from noise and random-point functions.

## Files Modified

### 1. `src/core/util/MathUtils.ts`
**Changes:**
- **Added `SeededPermutationTable` class**: Generates deterministic permutation tables from `SeededRandom` instances, replacing the old global `p[]` array that was shuffled with `Math.random()`.
- **Added seeded noise functions**:
  - `seededNoise2D(x, y, scale?, seed?)` — Seeded Perlin 2D noise
  - `seededNoise3D(x, y, z, scale?, seed?)` — Seeded Perlin 3D noise
  - `seededVoronoi2D(x, y, scale?, seed?)` — Seeded Voronoi noise
  - `seededFbm(x, y, z, octaves?, lacunarity?, gain?, seed?)` — Seeded FBM
  - `seededRidgedMultifractal(x, y, z, octaves?, lacunarity?, gain?, roughness?, seed?)` — Seeded ridged multifractal
- **Added `grad2D()` and `hash3D()` internal helpers** for proper 2D gradient computation and deterministic 3D hashing.
- **Fixed `randomPointInSphere()` and `randomPointOnSphere()`**: Added optional `rng: SeededRandom` parameter. If not provided, creates a temporary `SeededRandom(42)` instead of using `Math.random()`.
- **Marked legacy functions as deprecated**: `noise2D`, `noise3D`, `perlin2D`, `voronoi2D`, `ridgedMultifractal` — all now delegate to their seeded counterparts with seed=0.
- **Removed all `Math.random()` usage** from the noise section.

### 2. `src/core/util/math/noise.ts`
**Complete rewrite. Key additions:**
- **`SeededNoiseGenerator` class**: Full-featured deterministic noise generator accepting a seed.
  - `perlin2D()`, `perlin3D()` — Classic Perlin noise
  - `simplex2D()`, `simplex3D()` — Simplex noise with proper gradient tables and skewing
  - `voronoi2D()`, `voronoi3D()` — Worley/Voronoi noise with seeded feature points
  - `fbm()` — Fractional Brownian Motion with configurable noise type
  - `ridgedMultifractal()` — Ridged multifractal with options object
  - `turbulence()` — Absolute-value based turbulence
  - `domainWarp()` — Two-pass domain warping for organic patterns
  - `evaluate()` — Generic evaluation by NoiseType enum
- **`NoiseType` enum**: `Perlin`, `Simplex`, `Voronoi`
- **`defaultNoiseGenerator`**: Global deterministic instance (seed 0)
- **Standalone convenience functions**: `perlin3D`, `perlin2D`, `simplex3D`, `simplex2D`, `voronoi2D`, `voronoi3D`, `fbm`, `ridgedMultifractal`, `turbulence`, `domainWarp` — all delegate to default generator
- **Legacy `Noise3D` class**: Updated to use `SeededNoiseGenerator` internally, no longer uses `Math.random()`
- **Re-exports** from MathUtils: `seededNoise2D`, `seededNoise3D`, `seededVoronoi2D`, `seededFbm`, `seededRidgedMultifractal`, `noise3D`, `noise2D`

### 3. `src/core/util/math/noise-cache.ts` (NEW)
- **`NoiseCache` class**: LRU cache for `SeededNoiseGenerator` instances
  - Keyed by `(seed, noiseType)`
  - Configurable `maxSize` (default 16)
  - LRU eviction when capacity reached
  - `get()`, `has()`, `set()`, `delete()`, `clear()` methods
  - `getStats()` for monitoring cache usage
  - `withLock()` async method for thread-safe access (Web Workers)
- **`defaultNoiseCache`**: Global cache instance

### 4. `src/core/util/math/index.ts`
**Updated exports:**
- Added all new exports from `noise.ts`: `SeededNoiseGenerator`, `NoiseType`, `defaultNoiseGenerator`, all convenience functions, re-exported seeded functions
- Added `NoiseCache`, `defaultNoiseCache` from `noise-cache.ts`

## Backward Compatibility

All existing API signatures are preserved:
- `noise2D()`, `noise3D()`, `voronoi2D()`, `ridgedMultifractal()` still work (deprecated, delegate to seeded variants with seed=0)
- `Noise3D` class still works (now deterministic, constructor default changed from `Math.random()` to seed 0)
- `fbm()` function still works with same signature
- `randomPointInSphere()` and `randomPointOnSphere()` still work with same signature (now deterministic with default seed 42)
- `perlin2D()` alias still works

## Design Decisions

1. **SeededPermutationTable as a class**: Encapsulates the 512-entry permutation table generation, making it easy to create and cache seeded tables independently.
2. **Default seed 0 for legacy functions**: Ensures backward compatibility while making behavior deterministic.
3. **Options objects for complex functions**: `SeededNoiseGenerator.fbm()`, `.ridgedMultifractal()`, `.turbulence()`, `.domainWarp()` use options objects to avoid parameter overload.
4. **Spinlock for NoiseCache**: Simple promise-based mutex suitable for Web Worker environments where `Atomics` may not be available.
5. **No Math.random() anywhere**: All randomness derives from `SeededRandom` (Mulberry32 PRNG).

## Verification

- TypeScript compilation passes (no new errors beyond pre-existing dependency resolution issues)
- Dev server compiles successfully
- All new types are properly exported through the index
