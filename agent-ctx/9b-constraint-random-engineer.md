# Task 9b: Constraint Relation Functions + Math.random() Replacement

## Task 1: Implement Constraint Relation Functions

### Files Modified:
1. **src/core/constraints/language/spatial-helpers.ts** — NEW FILE
   - Created `SpatialObject` interface with position, rotation, bbox, forward direction
   - Vector helpers: `toVec3()`, `distance()`, `dot()`, `normalize()`, `sub()`, `angleBetween()`
   - AABB helpers: `getAABB()`, `aabbOverlapOrNear()`, `aabbOverlapXZ()`, `aabbContainedIn()`, `aabbOverlapAreaXZ()`, `aabbDistance()`
   - Spatial object storage/retrieval from state: `storeSpatialObject()`, `retrieveSpatialObject()`, `retrieveSpatialObjects()`
   - Direction/forward helpers: `getForward()`, `directionTo()`
   - Ray-AABB intersection: `rayAABBIntersection()`

2. **src/core/constraints/language/relations.ts** — FULL REWRITE
   - All 12+ placeholder relation classes now have real spatial evaluation
   - Implemented 16 standalone relation functions as well
   - New relation classes added: `Near`, `OnTopOf`, `FarFrom`, `LookAt`, `Occluded`, `PathTo`
   - Existing classes fixed: `Touching`, `SupportedBy`, `Facing`, `Aligned`, `Containment`, `Proximity`, `Coverage`, `Grouped`, `Distributed`, etc.
   - All evaluate() methods now: resolve ObjectSetExpressions → object IDs → SpatialObjects → compute spatial predicate
   - Standalone functions: `near()`, `onTopOf()`, `touching()`, `supportedBy()`, `facing()`, `farFrom()`, `reachable()`, `pathTo()`, `lookAt()`, `alignedWith()`, `occluded()`, `visible()`, `groupedWith()`, `spreadOut()`, `containedIn()`, `distanceBetween()`

3. **src/core/constraints/language/geometry.ts** — FULL REWRITE
   - All 16 geometry predicates now have real spatial computation instead of returning 0
   - `Distance`: minimum distance between any pair of objects from two sets
   - `AccessibilityCost`: minimum Euclidean distance to "from" objects
   - `FocusScore`: dot product of viewer forward direction with direction to object
   - `Angle`: average angle between forward directions of two object sets
   - `SurfaceArea`: AABB surface area (2*(dx*dy + dx*dz + dy*dz))
   - `Volume`: AABB volume (dx*dy*dz)
   - `Height`: average Y position
   - `Width`: AABB dimension along specified axis
   - `CenterOfMass`: average position component along axis
   - `NormalAlignment`: dot product of forward direction with target direction
   - `Clearance`: minimum distance to any non-excluded spatial object in state
   - `VisibilityScore`: facing * distance-weighted score
   - `StabilityScore`: 1.0 if center of mass within AABB footprint and above ground
   - `SupportContactArea`: XZ overlap area between supported and supporter
   - `ReachabilityScore`: inverse-distance score within arm reach
   - `OrientationAlignment`: average dot product of forward direction with target
   - `Compactness`: volume / surface_area^1.5
   - `AspectRatio`: ratio of AABB dimensions along two axes

4. **src/core/constraints/reasoning/domain-substitute.ts** — FIXED
   - `simplifyWithDomainInfo()`: Replaced placeholder with full constraint propagation
   - Detects contradictions: x > 5 when domain of x is [0, 3] → false
   - Simplifies tautologies: x < 10 when domain of x is [0, 5] → true
   - Supports all comparison operators (lt, lte, gt, gte, eq, neq)
   - Handles variable-vs-constant, constant-vs-variable (with operator reversal), and variable-vs-variable cases
   - `simplifyRelationWithDomains()`: Replaced placeholder with domain-aware relation simplification
   - Containment: checks if inner bbox can't fit inside outer bbox
   - `evaluateComparisonWithDomain()`: evaluates comparison against NumericDomain bounds
   - `reverseComparison()`: reverses comparison operators for swapped operands
   - `tryGetConstantValue()`: extracts constant value from expression node

5. **src/core/constraints/language/types.ts** — FIXED
   - `satisfies()` at line 1379: Replaced `return true` placeholder with full constraint evaluation
   - Evaluates constraint.expression if present (recursive expression tree)
   - Evaluates constraint.left/right with all operators: eq, neq, lt, lte, gt, gte, in, not_in, contains, overlaps, aligned, parallel, perpendicular
   - `evaluateExpressionNode()`: recursive evaluator for Constant, Variable, BinaryOp, UnaryOp, FunctionCall, IfElse
   - Supports arithmetic (+,-,*,/,^,%, min, max), logical (and, or, xor, implies), comparison operators
   - Built-in functions: distance, min, max, clamp, lerp

## Task 2: Replace Math.random() with SeededRandom

### Files Modified:
1. **src/assets/weather/WeatherSystem.ts** — 27 Math.random() → rng.next()
   - Added `import { SeededRandom }` from core/util/MathUtils
   - Added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42` parameter
   - All 27 Math.random() calls replaced with this.rng.next()

2. **src/assets/objects/terrain/BoulderGenerator.ts** — 19 Math.random() → rng.next()
   - Added `import { SeededRandom }` from core/util/MathUtils
   - Added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42` parameter
   - All 19 Math.random() calls replaced with this.rng.next()

3. **src/assets/weather/SnowSystem.ts** — 8 Math.random() → rng.next()
   - Added `import { SeededRandom }`
   - Added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42`
   - All 8 Math.random() calls replaced with this.rng.next()

4. **src/assets/weather/RainSystem.ts** — 4 Math.random() → rng.next()
   - Added `import { SeededRandom }`
   - Added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42`
   - All 4 Math.random() calls replaced with this.rng.next()

5. **src/assets/weather/FogSystem.ts** — 1 Math.random() → rng.next()
   - Added `import { SeededRandom }`
   - Added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42`
   - 1 Math.random() call replaced with this.rng.next()

6. **src/assets/objects/creatures/animation/BehaviorTree.ts** — 2 Math.random() → rng.next()
   - Added `import { SeededRandom }` from core/util/MathUtils
   - WanderAction class: added `private rng: SeededRandom` field
   - Constructor takes optional `seed: number = 42`
   - 2 Math.random() calls in wander target generation replaced with this.rng.next()

7. **src/assets/objects/creatures/CreatureBase.ts** — 1 Math.random() improved
   - Changed from `Math.random() * 10000` to `params.seed ?? Math.floor(Date.now() * Math.random()) % 10000`
   - Now uses params.seed if provided, only falls back to random seed generation

### Already Using SeededRandom (no changes needed):
- WoodGenerator.ts — already uses SeededRandom with Noise3D
- MetalGenerator.ts — already uses SeededRandom with Noise3D
- FabricGenerator.ts — no Math.random() calls found
