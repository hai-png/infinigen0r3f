# Vegetation System Consolidation Plan

## Current State Analysis

### Duplicate Generators Identified

| Concept | Location 1 (Primary) | Location 2 (Duplicate) | Resolution |
|---------|---------------------|----------------------|------------|
| **Grass** | `/objects/plants/GrassGenerator.ts` (202 lines, advanced) | `/objects/scatter/vegetation/GrassGenerator.ts` (222 lines, simpler) | Keep plants/, remove scatter/ |
| **Flower** | `/objects/plants/FlowerGenerator.ts` (advanced, instanced) | `/objects/scatter/vegetation/FlowerGenerator.ts` (simpler) | Keep plants/, remove scatter/ |
| **Shrub** | `/objects/plants/ShrubGenerator.ts` (species presets, seasonal) | `/objects/scatter/vegetation/ShrubGenerator.ts` (basic) | Keep plants/, remove scatter/ |

### Fragmented Directory Structure

```
Current:
├── /objects/plants/ (9 files) - High-quality generators with species presets
├── /objects/scatter/vegetation/ (12 files) - Simpler duplicates + unique items
├── /objects/climbing/ (VineGenerator)
├── /objects/grassland/ (GrasslandGenerator)
└── /procedural/ (legacy TreeGenerator, PlantGenerator, RockGenerator)

Issues:
- Same generators in multiple locations
- Unclear which to import
- Different APIs for same concepts
- Maintenance burden
```

## Recommended Architecture

### Target Structure

```
/workspace/src/assets/objects/vegetation/
├── index.ts (unified exports)
├── core/
│   ├── BaseVegetationGenerator.ts (extends BaseObjectGenerator)
│   ├── types.ts (shared interfaces)
│   └── constants.ts (species presets)
├── trees/
│   ├── TreeGenerator.ts (canonical tree implementation)
│   ├── ConiferGenerator.ts
│   ├── DeciduousGenerator.ts
│   ├── PalmGenerator.ts
│   └── FruitTreeGenerator.ts
├── plants/
│   ├── GrassGenerator.ts (canonical)
│   ├── FlowerGenerator.ts (canonical)
│   ├── ShrubGenerator.ts (canonical)
│   ├── FernGenerator.ts
│   ├── MossGenerator.ts
│   ├── MushroomGenerator.ts
│   ├── MonocotGenerator.ts
│   ├── SmallPlantGenerator.ts
│   └── TropicPlantGenerator.ts
├── climbing/
│   ├── VineGenerator.ts (canonical)
│   ├── CreeperGenerator.ts
│   └── IvyGenerator.ts
└── scatter/
    └── VegetationScatterSystem.ts (placement system, NOT generators)
```

## Migration Strategy

### Phase 1: Create Unified Structure (Current Session)
1. ✅ Create BaseObjectGenerator if missing
2. Create new `/vegetation/` directory structure
3. Move canonical implementations to new locations
4. Update all imports in codebase

### Phase 2: Remove Duplicates
1. Delete `/objects/scatter/vegetation/` duplicate generators
2. Delete legacy `/procedural/` generators
3. Update any remaining imports

### Phase 3: Create Scatter System
1. Create `VegetationScatterSystem` for placement
2. Separate generation logic from placement logic
3. Add LOD and instancing support

## Implementation Status

- [x] Created BaseObjectGenerator at `/objects/utils/BaseObjectGenerator.ts`
- [ ] Create unified vegetation directory structure
- [ ] Migrate canonical generators
- [ ] Update all imports
- [ ] Remove duplicate files
- [ ] Create scatter placement system
- [ ] Update documentation

## Import Path Changes

### Before:
```typescript
import { GrassGenerator } from '../objects/plants/GrassGenerator';
import { GrassGenerator } from '../objects/scatter/vegetation/GrassGenerator'; // Confusing!
```

### After:
```typescript
import { GrassGenerator } from '../objects/vegetation/plants/GrassGenerator';
// Single canonical source
```

