# Task 4-a: Replace Math.random() with SeededRandom in Scatter Ground & Lighting Files

**Agent**: 4a-seeded-random-scatter-lighting  
**Date**: Current session

## Summary

Replaced all `Math.random()` calls with `SeededRandom` instances across 7 scatter ground generator files. Verified that all 5 lighting generator files already use `SeededRandom` (via `BaseObjectGenerator.rng` or direct `SeededRandom` usage) and contain zero `Math.random()` calls.

## Files Modified (7 scatter ground files)

### 1. `src/assets/objects/scatter/ground/PineDebrisGenerator.ts`
- **Already had** `import { SeededRandom }` — no import change needed
- `generatePinecones()`: Replaced 8 `Math.random()` calls with `rng.next()`, `rng.nextFloat()`, `rng.nextInt()`
- `createPineconeGeometry()`: Added `rng: SeededRandom` parameter; replaced `Math.random()` with `rng.nextFloat()`, `rng.next()`
- `generateSeeds()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 2)`; replaced 6 `Math.random()` calls
- `generateNeedleClusters()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 3)`; replaced 2 `Math.random()` calls

### 2. `src/assets/objects/scatter/ground/TwigGenerator.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `seed?: number` to `TwigConfig` interface
- `generate()`: Added `const rng = new SeededRandom(config.seed ?? 42)`; replaced 8 `Math.random()` calls
- `generateClusters()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 1)`; replaced 2 `Math.random()` calls
- `addMossGrowth()`: Added `seed: number = 42` parameter; replaced 2 `Math.random()` calls
- `addLichenGrowth()`: Added `seed: number = 42` parameter; replaced 2 `Math.random()` calls

### 3. `src/assets/objects/scatter/ground/PebbleGenerator.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `private rng: SeededRandom` property
- Changed default seed from `Math.random() * 10000` → `42` in constructor
- `constructor()`: Initialize `this.rng = new SeededRandom(this.config.seed)`
- `generate()`: Replaced 7 `Math.random()` calls with `this.rng.next()`, `this.rng.nextInt()`, `this.rng.next()`
- `generateInstances()`: Replaced 6 `Math.random()` calls similarly
- `setConfig()`: Added `this.rng = new SeededRandom(this.config.seed)` to re-seed on config change

### 4. `src/assets/objects/scatter/ground/MushroomVarieties.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `seed?: number` to `MushroomVarietyConfig` interface
- `generateMushroom()`: Added `const rng = new SeededRandom(config.seed ?? 42)`
- `createCapSpots()`: Added `rng: SeededRandom` parameter; replaced 3 `Math.random()` calls
- `createSporeCloud()`: Added `rng: SeededRandom` parameter; replaced 3 `Math.random()` calls
- `generateCluster()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 1)`; replaced 3 `Math.random()` calls
- `generateScattered()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 2)`; replaced 5 `Math.random()` calls
- `getRandomGrowthStage()`: Changed signature to accept `rng: SeededRandom`; replaced `Math.random()`

### 5. `src/assets/objects/scatter/ground/GravelGenerator.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `seed?: number` to `GravelConfig` interface
- **Added** `private rng: SeededRandom` property
- `constructor()`: Added `seed: number = 42` parameter; initialize `this.rng`
- `generateGravelInstanced()`: Added `const rng = new SeededRandom(finalConfig.seed ?? 42)`; replaced 7 `Math.random()` calls
- `generateGravelPath()`: Added `const rng = new SeededRandom(pathConfig.seed ?? 42)`; replaced 8 `Math.random()` calls
- `createGravelGeometry()`: Replaced `Math.random()` with `this.rng.nextFloat(0.85, 1.15)`

### 6. `src/assets/objects/scatter/ground/StoneGenerator.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `seed?: number` to `StoneConfig` interface
- **Added** `private rng: SeededRandom` property
- `constructor()`: Added `seed: number = 42` parameter; initialize `this.rng`
- `generateStone()`: Replaced default `size`/`roughness` with `this.rng.nextFloat()`; added `const rng = new SeededRandom(finalConfig.seed ?? 42)` for rotation
- `generateStoneCluster()`: Added `const rng = new SeededRandom(clusterConfig.seed ?? 42)`; replaced 4 `Math.random()` calls
- `createStoneGeometry()`: Replaced `Math.random()` with `this.rng.nextFloat()`
- `getStoneMaterial()`: Replaced `Math.random() > 0.5` with `this.rng.next() > 0.5`
- `generateStandingStone()`: Added `const rng = new SeededRandom(42)`; replaced 2 `Math.random()` calls

### 7. `src/assets/objects/scatter/ground/LeafLitterGenerator.ts`
- **Added** `import { SeededRandom } from '../../../../core/util/MathUtils'`
- **Added** `seed?: number` to `LeafLitterConfig` interface
- `generate()`: Added `const rng = new SeededRandom(config.seed ?? 42)`; replaced 8 `Math.random()` calls
- `generateClusters()`: Added `const rng = new SeededRandom((config.seed ?? 42) + 1)`; replaced 2 `Math.random()` calls

## Lighting Files (5 files — No changes needed)

All 5 lighting files already use `SeededRandom` and contain zero `Math.random()` calls:

1. **CeilingLights.ts** — Extends `BaseObjectGenerator` (has `this.rng: SeededRandom`); uses `this.rng` in `addCrystalCluster()` and `getRandomParams()`
2. **TableLamps.ts** — Extends `BaseObjectGenerator`; uses `this.rng` in `getRandomParams()`
3. **FloorLamps.ts** — Extends `BaseObjectGenerator`; uses `this.rng` in `getRandomParams()`
4. **LampBase.ts** — Extends `BaseObjectGenerator`; uses `this.rng` in `getRandomParams()`
5. **ChandelierGenerator.ts** — Already imports `SeededRandom` directly; has `private rng: SeededRandom` property; uses `this.rng` throughout

## Pattern Applied

| Original | Replacement |
|----------|-------------|
| `Math.random()` | `rng.next()` or `this.rng.next()` |
| `Math.floor(Math.random() * arr.length)` | `rng.nextInt(0, arr.length - 1)` |
| `a + Math.random() * (b - a)` | `rng.nextFloat(a, b)` |
| `Math.random() * 10000` (seed) | `42` (default seed) |

## Verification

```
rg 'Math\.random\(\)' src/assets/objects/scatter/ground/ src/assets/objects/lighting/ --type ts -c
# Returns empty (0 matches) — all Math.random() calls eliminated
```

## Backward Compatibility

- All `seed` fields are optional (`seed?: number`)
- Default seed is `42` everywhere (not `Math.random() * 10000`)
- Existing callers that don't pass a seed get deterministic output with seed 42
- `addMossGrowth` and `addLichenGrowth` in TwigGenerator gained an optional `seed` parameter (default 42)
