# Task 5-b: Fix High-Priority Bugs

## Agent: bug-fixer

## Work Summary

Fixed 2 bugs that required code changes. The remaining 8 bugs were already fixed in previous sessions.

## Bugs Requiring Code Changes

### Bug 14: WindowGenerator - type param ignored
**File**: `src/assets/objects/architectural/WindowGenerator.ts`
**Problem**: The 6 window types in the code (`casement`, `double-hung`, `sliding`, `bay`, `skylight`, `arched`) didn't match the required types from the bug spec (`casement`, `doubleHung`, `awning`, `picture`, `sliding`, `bay`). The `awning` and `picture` types were missing entirely.
**Fix**:
- Updated the type union from `'casement' | 'double-hung' | 'sliding' | 'bay' | 'skylight' | 'arched'` to `'casement' | 'doubleHung' | 'awning' | 'picture' | 'sliding' | 'bay'`
- Implemented `createAwningWindow()`: top-hinged panel that pushes outward from the bottom, with hinge hardware and crank handle
- Implemented `createPictureWindow()`: large fixed pane with minimal thin frame and glazing beads around the edge
- Removed `skylight` and `arched` implementations (replaced by `awning` and `picture`)
- Updated switch statement, default config, shutter/sill logic to match new types

### Bug 23: full-solver-loop - evaluateAll method
**File**: `src/core/constraints/solver/full-solver-loop.ts`
**Problem**: `evaluateProposal()` used `(this.state as any)?.state` to get the evaluator State object, but `SolverState` has no `state` field, so it was always `undefined`. This caused the primary constraint evaluation path (using `violCount`) to be skipped, and energy was always computed via the simple fallback or just stayed at 0.
**Fix**:
- Added `evaluatorState: EvaluatorState | null` field to `FullSolverLoop`
- Implemented `evaluateAll()` method that properly evaluates all constraints using `violCount()` with the evaluator state
- Added `setEvaluatorState()` method to set the evaluator state externally
- Updated `evaluateProposal()` to use `evaluateAll()` instead of the broken `(this.state as any)?.state` path
- Added initial energy computation in `solve()` using `evaluateAll()` instead of assuming 0
- Imported `State as EvaluatorState` from `../evaluator/state`

## Bugs Already Fixed (No Changes Needed)

### Bug 15: FloorGenerator - pattern types not rendered
Already implemented: `addHerringbonePattern()`, `addParquetPattern()`, `addBasketweavePattern()`, carpet handled in `addUniformPattern()`.

### Bug 16: CeilingGenerator - vaulted type missing
Already implemented: `addVaultedCeiling()` with parabolic arch cross-section and rib lines.

### Bug 17: RoofGenerator - dormers and gable ends
Already implemented: `addDormers()` with mini gabled structures, `createTriangularGableGeo()` using BufferGeometry.

### Bug 18: RailingGenerator - glass/cable/ornate infill
Already implemented: `addGlassPanels()`, `addCableInfill()`, `addOrnateBalusters()` with MeshPhysicalMaterial for glass.

### Bug 19: FenceGenerator - missing type geometries
Already implemented: `addChainLinkFence()`, `addWroughtIronFence()`, `addRanchFence()` with distinct geometry for each.

### Bug 20: LeatherGenerator - wrong material type
Already implemented: MeshPhysicalMaterial with clearcoat for patent leather, sheen/sheenColor/sheenRoughness for other types.

### Bug 22: PhysicsWorld - removeBody bug
Already fixed: `colliderId` is read before `this.bodies.delete(bodyId)`.

### Bug 25: WaterMaterial - texture regeneration
Already fixed: Throttled regeneration with `dirty` flag and `REGEN_INTERVAL_MS = 100`.

## Compilation Verification
- TypeScript compilation (`tsc --noEmit`) shows only pre-existing errors (MathUtils module resolution, getAttributeNames)
- No new errors introduced by the bug fixes
- Dev server runs without issues
