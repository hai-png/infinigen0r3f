# Task: Consolidate Duplicate Creature Generators

## Agent: Main Agent
## Status: COMPLETED

## Summary

Consolidated 4 duplicate creature generators and 3 coral systems into a single canonical source per generator.

## Changes Made

### 1. Creature Generators (4 duplications resolved)

For each pair, the `vegetation/` version was made canonical (it was already more detailed) and the `creatures/` version was replaced with a thin adapter class that:
- Extends `CreatureBase` for backward compatibility
- Maps legacy parameter types to the new config types
- Delegates `generate()` to the canonical vegetation/ implementation
- Includes `@deprecated` JSDoc annotations
- Re-exports canonical types for convenience

| Generator | creatures/ (old, now adapter) | vegetation/ (canonical) |
|-----------|------------------------------|------------------------|
| BeetleGenerator | 274→90 lines, adapter wrapping vegetation/ | 710 lines, 3 species, canvas textures |
| JellyfishGenerator | 367→95 lines, adapter wrapping vegetation/ | 534 lines, 3 species, MeshPhysicalMaterial |
| CrustaceanGenerator | 440→105 lines, adapter wrapping vegetation/ | 829 lines, 3 species, articulated claws |
| DragonflyGenerator | 372→90 lines, adapter wrapping vegetation/ | 460 lines, recursive venation, iridescence |

**Key API mapping decisions:**
- `BeetleParams.hornType` → `BeetleConfig.species` (rhinoceros→rhinoceros_beetle, stag→stag_beetle, none/hercules→ladybug)
- `JellyfishParams.pulseSpeed` → `JellyfishConfig.pulseFrequency`
- `JellyfishParams.transparency` → `JellyfishConfig.transmission`
- `CrustaceanGenerator.generate(species, params)` two-arg form preserved in adapter
- `DragonflyParams.abdomenPattern='spotted'` → `'striped'` (no direct equivalent)

### 2. Coral Systems (3 locations consolidated)

Made `objects/coral/` the single canonical import location for ALL coral generators:

| Location | What it contains | Status |
|----------|-----------------|--------|
| `objects/coral/` | 3 class generators (Branching, Fan, Brain) + re-exports from vegetation/coral/ | **CANONICAL** |
| `objects/vegetation/coral/` | 4 algorithm generators (DifferentialGrowth, ReactionDiffusion, Wave3, GrowthAlgorithms) | Source code stays, re-exported from objects/coral/ |
| `objects/underwater/CoralGenerator.ts` | Static API, returns BufferGeometry | **@deprecated**, kept for backward compat |

### 3. Index/Barrel Files Updated

| File | Change |
|------|--------|
| `creatures/index.ts` | Added `@deprecated` exports for 4 consolidated generators |
| `vegetation/index.ts` | Added `@deprecated` comments on coral sections pointing to objects/coral/ |
| `vegetation/beetle/index.ts` | Added "Canonical Location" header |
| `vegetation/jellyfish/index.ts` | Added "Canonical Location" header |
| `vegetation/crustacean/index.ts` | Added "Canonical Location" header |
| `vegetation/dragonfly/index.ts` | Added "Canonical Location" header |
| `objects/coral/index.ts` | Expanded to include all coral generators (class-based + algorithm-based from vegetation/coral/) |
| `objects/vegetation/coral/index.ts` | Added `@deprecated` header pointing to objects/coral/ |
| `objects/underwater/index.ts` | Added `@deprecated` on CoralGenerator exports |
| `composition/SceneObjectFactory.ts` | Added `@deprecated` comment on CoralGenerator import |

### 4. Verification

- `tsc --noEmit` passes with exit code 0 (no new type errors)
- `tsc --noEmit --strict` shows only pre-existing errors (none in modified files)
- All 14 key files verified to exist
