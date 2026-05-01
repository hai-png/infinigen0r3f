# Task 4a: Consolidation Engineer — Duplicate/Conflicting Implementation Consolidation

## Summary

Consolidated 5 categories of duplicate/conflicting implementations across the infinigen-r3f codebase, eliminating code duplication, resolving type conflicts, and establishing clear canonical sources for each subsystem.

## Work Completed

### 1. Physics Engine Consolidation

**Problem**: `RigidBodyDynamics.ts` contained duplicate `RigidBodyDynamics` class, `CollisionDetectionSystem` class, conflicting `PhysicsMaterial` interface, and shape utility functions that overlapped with `PhysicsWorld.ts` and the `collision/` pipeline.

**Solution**:
- Merged `meshToPhysicsShape()`, `createBoxShape()`, `createSphereShape()`, `createCapsuleShape()`, `createCylinderShape()`, `createConvexHullShape()`, `createTrimeshShape()`, `PhysicsShapeType`, `PhysicsShape` into `PhysicsWorld.ts`
- Removed duplicate `RigidBodyDynamics` class (redundant with `PhysicsWorld`)
- Removed duplicate `CollisionDetectionSystem` class (redundant with `BroadPhase` + `NarrowPhase`)
- Removed conflicting `PhysicsMaterial` interface (canonical is in `Material.ts`)
- Kept `KinematicCompiler` and `COLLISION_LAYERS` in `RigidBodyDynamics.ts` (unique functionality)
- Updated `index.ts` to clean barrel exports only

### 2. SA Solver Consolidation

**Problem**: `SimulatedAnnealingSolver` existed in both `sa-solver.ts` (clean standalone) and `moves.ts` (extending Solver base class, different constructor/step interface).

**Solution**:
- Removed duplicate `SimulatedAnnealingSolver` class and `SimulatedAnnealingConfig` from `moves.ts`
- `moves.ts` now re-exports from `sa-solver.ts` for backward compatibility
- Kept all move types (`Move`, `TranslateMove`, `RotateMove`, `SwapMove`, etc.), `Solver` base, `GreedySolver`, `SolverState` in `moves.ts`
- Updated `solver/index.ts` to export canonical SA solver from `sa-solver.ts`
- Fixed `use-solver.ts` React hook to work with canonical `SimulatedAnnealingSolver`

### 3. Erosion Consolidation

**Problem**: Four erosion implementations with duplicated logic: inline in `TerrainGenerator.ts`, `ErosionEnhanced.ts`, `ErosionSystem.ts`, and `HydraulicErosionGPU.ts`.

**Solution**:
- Made `ErosionSystem.ts` the single entry point delegating to subsystems
- Hydraulic erosion → `ErosionEnhanced.ts` (most complete implementation)
- Thermal erosion → `ThermalErosion` in `ErosionSystem.ts` (canonical location)
- River formation → `RiverFormation` in `ErosionSystem.ts` (canonical location)
- Removed duplicate `ThermalErosion` from `ErosionEnhanced.ts`
- Replaced inline erosion in `TerrainGenerator.ts` with call to `ErosionSystem`
- Added NOTE that `HydraulicErosionGPU` is actually CPU-only
- Updated barrel exports to avoid `ErosionConfig`/`ErosionData` name conflicts

### 4. SeededRandom Consolidation

**Problem**: Three SeededRandom implementations — canonical Mulberry32 in `core/util/MathUtils.ts`, and two inline LCGs in `HydraulicErosionGPU.ts` and `ErosionSystem.ts`.

**Solution**:
- Removed inline `class SeededRandom` (LCG) from `HydraulicErosionGPU.ts` → import from `core/util/MathUtils`
- Removed inline LCG closure `() => { seed = (seed * 9301 + 49297) % 233280; ... }` from `RiverFormation` constructor in `ErosionSystem.ts` → replaced with `new SeededRandom(this.params.seed)`

### 5. HeightMap Type Unification

**Problem**: Two incompatible `HeightMap` types — `type HeightMap = Float32Array` (core) vs `interface HeightMap { data, width, height, bounds }` (mesher).

**Solution**:
- Created unified `HeightMap` interface in `src/terrain/types.ts` with `{ data: Float32Array; width: number; height: number; bounds?: {...} }`
- Added helper functions: `heightMapFromFloat32Array()`, `sampleHeightAt()`, `getHeightValueAt()`, `setHeightValueAt()`
- Updated core `TerrainGenerator.ts` to use unified type, returning structured `HeightMap` objects
- Updated mesher `TerrainGenerator.ts` to import from `../types`
- Updated `TerrainMesher.ts`: `heightMap[idx]` → `heightMap.data[idx]`
- Updated `TerrainUtils.ts`: `heightMap[idx]` → `heightMap.data[idx]`
- Updated all barrel exports (`core/index.ts`, `generator/index.ts`, `terrain/index.ts`)
- Resolved barrel export name conflicts (`ErosionConfig`/`ErosionData` aliased for GPU version)

## TypeScript Compilation

After all changes, only 3 pre-existing errors remain (FloorGenerator.ts, DataPipeline.ts — not introduced by this task). All consolidation changes compile cleanly.
