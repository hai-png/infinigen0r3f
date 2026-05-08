# Task 6: Constraint Solver Features - Work Log

## Agent: Constraint Solver Implementer
## Task ID: 6

### Work Completed

#### 1. Greedy Stage System (`src/core/constraints/solver/greedy/`)
Created new directory with 5 files:

- **`types.ts`** - Defined `GreedyStage` interface with `name`, `domain` (from reasoning/domain.ts), `variables` (string[]), and `nProposals` (number).

- **`active-for-stage.ts`** - Implemented `updateActiveFlags(state, stage)` which iterates all objects in state, sets `obj.active = true` for objects matching the stage's domain filter and `obj.active = false` for all others. Uses multi-strategy domain checking (contains(), satisfies(), includes/excludes sets, tagFilter).

- **`constraint-partition.ts`** - Implemented `partitionConstraints(problem, stage, state)` which filters a Problem's constraints to only those whose ObjectSetExpressions intersect with the stage's domain. Extracts ObjectSetExpression nodes from various constraint representations (Relation instances with objects1/objects2, plain objects, GeometryRelation children).

- **`all-substitutions.ts`** - Implemented `allSubstitutions(stage, state)` which enumerates all valid variable→objectName assignments. For each variable in stage.variables, finds matching objects via domain check, then computes the Cartesian product. Enforces no-duplicate-assignment constraint and caps at 1000 substitutions to avoid combinatorial explosion.

- **`index.ts`** - Re-exports all greedy stage components.

#### 2. DOF Solver (`src/core/constraints/solver/dof.ts`)
Created `DOFSolver` class with 4 static methods:

- **`stableAgainstMatrix(point, normal)`** - Computes 3×3 Matrix3 where rows span the allowed translation subspace for a StableAgainst relation (2 tangent vectors + zero row).

- **`combineRotationConstraints(parentPlanes)`** - Determines allowed rotation axis from multiple parent planes. Returns null for 0 planes (free) or 3+ planes (fully constrained), the normal for 1 plane, or the cross-product for 2 non-parallel planes.

- **`tryApplyRelationConstraints(state, objName)`** - Solves for position/rotation given StableAgainst relations. Collects parent planes, computes DOF matrices, intersects them, and solves position (1 plane: project; 2 planes: line intersection; 3 planes: point intersection).

- **`applyRelationSurfaceSample(state, objName)`** - Samples a random pose on a parent surface with random offset in the tangent plane and random rotation consistent with DOF constraints.

Also includes internal helpers: `intersectDOFMatrices`, `solvePosition`, `solveRotation`, `projectOntoPlane`, `intersectPlanes`, `intersectThreePlanes`, `projectOntoLine`, `alignWithPlane`, `samplePointOnPlane`.

#### 3. Plane Extraction (`src/core/constraints/solver/planes.ts`)
Created `PlaneExtractor` class and `Plane` interface:

- **`Plane` interface** - `{ normal: Vector3, distance: number, tag: string }`
- **`extractPlanes(obj, tags?)`** - Traverses Object3D mesh children, computes face normals (both indexed and non-indexed geometry), extracts planes from faces, and deduplicates coplanar planes. Results are cached by object UUID + geometry hash.
- **`getTaggedPlanes(obj, tag)`** - Convenience filter by tag.
- **`clearCache()`** - Clears the plane cache.
- Deduplication uses static tolerance constants: COPLANAR_NORMAL_TOL (1e-3), COPLANAR_DIST_TOL (1e-2).

#### 4. Stability Checking (`src/core/constraints/solver/stability.ts`)
Created `StabilityChecker` class with 2 static methods:

- **`stableAgainst(state, objName, relationState)`** - Checks 3 conditions: (1) object's face parallel to parent plane (within 0.15 tolerance), (2) object close to parent plane (within 0.1), (3) center of mass projects onto parent surface (bounding box overlap check).

- **`coplanar(state, objName, relationState)`** - Checks if any pair of child/parent planes have parallel normals and equal distances.

#### 5. Updated GreedyPreSolver (`src/core/constraints/solver/GreedyPreSolver.ts`)
Added imports from `./greedy/` and `../evaluator/state`, `../language/types`.

Added `solveWithStages(problem, state, stages)` method to GreedyPreSolver that implements the full Infinigen greedy pipeline:
- For each stage: updateActiveFlags → partitionConstraints → allSubstitutions → evaluate and pick best substitution → apply to state

Added helper methods:
- `evaluateSubProblemViolations(constraints, assignment, state)` 
- `evaluateConstraintWithState(constraint, assignment, state)` - extends evaluateConstraint with State object resolution
- `applySubstitutionToState(state, substitution)` - applies variable→objectName mapping to state

#### 6. Updated Solver Index (`src/core/constraints/solver/index.ts`)
Added exports for:
- `GreedyStage` type, `updateActiveFlags`, `partitionConstraints`, `allSubstitutions` from `./greedy`
- `DOFSolver` from `./dof`
- `PlaneExtractor`, `Plane` type from `./planes`
- `StabilityChecker` from `./stability`

### TypeScript Compilation
All new files compile cleanly with `tsc --noEmit`. The only pre-existing error is in `evaluator/evaluate.ts` (unrelated to this task). No errors in any of the new solver files.
