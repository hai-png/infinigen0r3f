# Task: Cave Occupancy Pipeline Implementation

## Summary
Implemented the complete cave mesh-to-SDF occupancy volume pipeline in `/home/z/my-project/infinigen-r3f/src/terrain/caves/CaveOccupancyPipeline.ts`.

## What was done

### New file created
- **`src/terrain/caves/CaveOccupancyPipeline.ts`** (1043 lines)

### Key classes and interfaces implemented

1. **`CaveLSystemRule`** - Production rule interface for cave L-system grammars (named to avoid conflict with vegetation module's `LSystemRule`)

2. **`CaveLatticeConfig`** - Voronoi lattice configuration matching Infinigen's caves.h C++ parameters (latticeLayers, latticeScale, deepestLevel, smoothness, perturbationAmplitude/Frequency)

3. **`CaveInstancePlacement`** - Placement descriptor linking an occupancy volume to a Voronoi cell (volume, cellCenter, cellRadius, rotation, instanceIndex)

4. **`CaveOccupancyVolume`** - 3D SDF occupancy grid with:
   - `sample()` - Trilinear interpolation sampling
   - `sampleCubic()` - Catmull-Rom cubic interpolation (matches Infinigen's ctlerp())
   - `worldToLocal()` - Coordinate transform from world → local space (handles cell center, rotation, normalization)
   - `serialize()` / `deserialize()` - Transferable serialization

5. **`CaveOccupancyPipeline`** - Complete pipeline with:
   - `generateOccupancyVolume()` - SDF from tunnel paths (replaces Blender mesh_to_sdf)
   - `generateCaveInstances()` - PCFG-based instance generation (5 grammar variants)
   - `evaluateCaveSDF()` - Voronoi lattice SDF evaluation (matches caves.h C++ implementation)
   - `generateTunnelPaths()` - L-system grammar wrapper
   - `buildPlacements()` - Convenience method for pre-computing Voronoi cell assignments

6. **`DEFAULT_CAVE_LATTICE_CONFIG`** - Default configuration constant

### Helper functions
- `catmullRomWeight()` - Catmull-Rom basis weight computation
- `deterministicCellHash()` - Deterministic hash for Voronoi cell → instance assignment

### Updated files
- **`src/terrain/caves/index.ts`** - Added exports for all new types and classes

### Design decisions
- Named `CaveLSystemRule` instead of `LSystemRule` to avoid naming conflict with the vegetation module's existing `LSystemRule` (which has a `predecessor` field)
- Used `smoothSubtraction` from SDFCombinators.ts for blending caves into host SDF
- Direct SDF computation from tunnel paths (no intermediate mesh step) for performance
- All methods are fully deterministic given the same seed

### TypeScript verification
- No new TypeScript errors introduced (9 pre-existing errors remain, all unrelated to caves)
- LSystemRule naming conflict resolved
