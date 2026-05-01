# Worklog — infinigen-r3f Project

## [2-b] Comprehensive Statistical Distributions Module

**Date**: Current session  
**Agent**: 2b-distributions-engineer  
**Files Modified**:
- `src/core/util/math/distributions.ts` — Complete rewrite (7-line stub → ~990 lines)
- `src/core/util/math/index.ts` — Added distribution exports

### What was done

Replaced the re-export stub with a full statistical distribution module ported from Princeton Infinigen's procedural generation pipeline:

**15 Core Distributions**: uniform, gaussian (Box-Muller), exponential, poisson (Knuth + normal approx for large λ), binomial, gamma (Marsaglia-Tsang), beta (via gamma), chiSquared, logNormal, weibull, pareto, cauchy, geometric, negativeBinomial, hypergeometric

**5 Sampling Methods**: weightedChoice, sampleWithoutReplacement (partial Fisher-Yates), shuffle (Fisher-Yates), reservoirSample, rejectionSample (auto-peak estimation)

**4 Statistical Utilities**: normalCDF (Abramowitz-Stegun erfc), normalPDF, normalInvCDF (Acklam + Newton refinement), clampToDistribution

**DistributionSampler Class**: Stateful seeded interface with all distributions as instance methods, fork()/reset() for state management, and procedural generation convenience methods (color, unitVector, pointInSphere, pointOnSphere, euler, quaternion)

**Key Fix**: Resolved TypeScript name-shadowing where class methods (e.g., `gamma()`) would recursively call themselves instead of standalone functions. Used local aliases (`_gamma`, `_beta`, etc.).

**Verification**: 0 TypeScript errors in our files. ESLint not configured in project.

---

## [3-b] Per-Vertex Streaming in Node Evaluation System

**Date**: Current session  
**Agent**: 3b-per-vertex-streaming-engineer  
**Files Created**:
- `src/core/nodes/core/attribute-stream.ts` — Core per-vertex data structure (~310 lines)
- `src/core/nodes/core/geometry-context.ts` — Geometry data container with Three.js interop (~290 lines)
- `src/core/nodes/core/per-vertex-evaluator.ts` — Per-vertex node evaluation engine (~460 lines)

**Files Modified**:
- `src/core/nodes/core/node-wrangler.ts` — Added `evaluatePerVertex()` method
- `src/core/nodes/core/index.ts` — Added exports for new modules
- `package.json` — Added `three` and `@types/three` as runtime dependencies

### What was done

Implemented per-vertex streaming in the node evaluation system — the core capability that makes Blender's geometry nodes powerful. Previously, the node evaluator (`evaluate()`) worked at the **object level**, producing a single value per node. Now, `evaluatePerVertex()` operates at the **per-vertex level**, producing an `AttributeStream` per node output with one value per geometry element.

**AttributeStream class** — The fundamental data unit for per-vertex data flow:
- Internally backed by `Float32Array` for performance with 100k+ vertex meshes
- Supports 8 data types: FLOAT, INT, BOOLEAN, VECTOR (3), COLOR (4), QUATERNION (4), MATRIX (16), STRING
- Full accessor API: `getFloat/setFloat`, `getVector/setVector`, `getColor/setColor`, `getInt/setInt`, `getBoolean/setBoolean`, `getQuaternion/setQuaternion`, `getMatrix/setMatrix`
- Transform operations: `mapFloat`, `mapVector`, `mapColor` — return new streams
- Reduction operations: `reduceFloat`, `min`, `max`, `mean`
- Clone/slice for creating subsets

**GeometryContext class** — Holds all attribute streams for a geometry:
- Built-in `position`, `normal`, `uv` streams with direct accessors
- Generic `addAttribute/getAttribute/removeAttribute/listAttributes` API
- Index buffer for triangle faces with `getFaceVertices`/`getEdgeVertices` queries
- Full `toBufferGeometry()` / `fromBufferGeometry()` conversion to/from Three.js
- Deep `clone()` support

**PerVertexEvaluator class** — The evaluation engine:
- Reuses the same topological sort from `NodeWrangler.topologicalSort()`
- Evaluates each node per-vertex, passing `AttributeStream` objects through connections
- Registered built-in per-vertex executors for 11 node types: InputPosition, InputNormal, Index, InputID, Value, Vector, Boolean, Integer, RGB, SetPosition, Mix, Compare, RandomValue, GroupInput, GroupOutput
- **Vectorization fallback**: For node types that only have a scalar executor registered via `NodeWrangler.executors`, automatically runs it per-vertex (O(vertices) scalar calls) — slower but compatible
- `resolveInput()` resolves connected streams or fills default values as constant streams
- `applyResults()` writes output streams back to a cloned GeometryContext

**NodeWrangler.evaluatePerVertex()** — New public method:
- Entry point for per-vertex evaluation
- Uses lazy `require()` to avoid circular dependency (PerVertexEvaluator imports NodeWrangler)
- Does not modify existing `evaluate()` method — both paths coexist

**Key design decisions**:
- `AttributeStream` uses `Float32Array` for zero-overhead interop with WebGL/Three.js
- `readonly name` on AttributeStream prevents accidental mutation during evaluation
- GeometryContext is framework-agnostic at the core level, with Three.js conversion at the boundary
- Per-vertex executors are registered in a separate `perVertexExecutors` map, not mixed with scalar `NodeWrangler.executors`

**Verification**: 0 TypeScript errors across all new/modified files (`npx tsc --noEmit`). Installed `three@0.184.0` and `@types/three@0.184.0` as needed by `geometry-context.ts`.

---

## [3-a] Comprehensive Node Definitions Registry

**Date**: Current session  
**Agent**: 3a-node-registry-engineer  
**Files Created**:
- `src/core/nodes/core/node-definition-registry.ts` — Central registry mapping all node types to proper socket definitions (~2600 lines)

**Files Modified**:
- `src/core/nodes/core/node-wrangler.ts` — Replaced stub `getNodeDefinition()` with registry-backed implementation
- `src/core/nodes/core/index.ts` — Added export for `node-definition-registry`

### What was done

Replaced the stub `NodeWrangler.getNodeDefinition()` that returned a generic `{Value input, Value output}` for ALL node types with a comprehensive registry providing proper Blender-style socket definitions for every single `NodeTypes` enum member.

**NodeDefinitionRegistry class** — Singleton registry with:
- `register(type, definition)` — Add or overwrite a definition
- `get(type)` — Retrieve by type string
- `getByCategory(category)` — Filter by category
- `getAll()` — Return all definitions
- `has(type)` — Check existence
- `size` property — Total registered count

**PropertyDefinition interface** — Typed property metadata:
- Supports `float`, `int`, `boolean`, `enum`, `vector`, `color`, `string` types
- Includes `min`, `max`, `items` (for enums), and `description`
- Default values match Blender's defaults

**299 registered node definitions** across all categories:
- **Input (22)**: Value, Boolean, Integer, Vector, RGB, RandomValue, Index, InputPosition, InputNormal, InputID, etc.
- **Texture (10)**: Noise, Voronoi, Musgrave, Wave, Brick, Checker, Gradient, Magic, WhiteNoise, Gabor
- **Geometry (12)**: SetPosition, JoinGeometry, Transform, DeleteGeometry, Proximity, Raycast, etc.
- **Curve (16)**: CurveToMesh, CurveToPoints, ResampleCurve, TrimCurve, FillCurve, FilletCurve, etc.
- **Curve Primitives (4)**: QuadraticBezier, CurveCircle, CurveLine, CurveBezierSegment
- **Color (10)**: ColorRamp, MixRGB, RGBCurve, BrightContrast, Exposure, CombineHSV, etc.
- **Mesh (30+)**: SubdivideMesh, ExtrudeMesh, FlipFaces, UVMap, EdgeVertices, Corner*, etc.
- **Point (30+)**: DistributePointsOnFaces, PointsToCurves, PointScale, PointRotation, etc.
- **Volume (24)**: VolumeToMesh, VolumeSample, VolumePrincipled, VolumeScattering, etc.
- **Vector (30+)**: VectorMath, VectorRotate, Mapping, Bump, Displacement, CombineXYZ, SeparateXYZ, etc.
- **Shader (10+)**: PrincipledBSDF (30+ inputs), plus light and ray-type nodes
- **Output (28)**: GroupOutput, MaterialOutput, Composite, Debug, Depth, Normal, etc.
- **Boolean (3)**: Union, Intersect, Difference
- **Converter/Math (20+)**: Trigonometry, PowerLog, Compare, Modulo, Wrap, Snap, etc.

**NodeWrangler.getNodeDefinition() update**:
- Now queries `nodeDefinitionRegistry.get(String(type))`
- Converts `PropertyDefinition` entries to simple `default` value map for runtime use
- Falls back to `{type, inputs: [], outputs: []}` for unregistered types

**Helper utilities**:
- `createNodeFromRegistry(nw, type, name?, location?, props?)` — Convenience function
- `findMissingDefinitions()` — Returns NodeTypes values with no registered definition (empty after this work)
- `inp()` / `out()` shorthands — Keep the 299-entry definition table compact

**Verification**: 0 TypeScript errors (`npx tsc --noEmit`). `findMissingDefinitions()` returns `[]` confirming 100% coverage of all 299 unique NodeTypes string values.

---

## [4-b] Replace Math.random() with SeededRandom

**Date**: Current session  
**Agent**: 4b-seeded-random-engineer  
**Files Modified**:
- `src/assets/objects/appliances/ApplianceBase.ts` — 10 Math.random() → this.rng calls
- `src/assets/objects/appliances/KitchenAppliances.ts` — Added import; 5 Math.random() → this.rng calls
- `src/assets/objects/appliances/LaundryAppliances.ts` — Added import; 5 Math.random() → this.rng calls
- `src/assets/objects/bathroom/BathroomFixtures.ts` — Added import; 7 Math.random() → this.rng calls
- `src/assets/objects/creatures/BirdGenerator.ts` — Added import; seed default → 42
- `src/assets/objects/creatures/FishGenerator.ts` — Added import; seed default → 42
- `src/assets/objects/creatures/parts/EyeGenerator.ts` — Added import + rng field; 3 Math.random() → this.rng
- `src/assets/objects/creatures/parts/TailGenerator.ts` — Added import + rng field; 1 Math.random() → this.rng
- `src/assets/objects/tableware/CutleryGenerator.ts` — seed default → 42
- `src/assets/objects/tableware/GlasswareGenerator.ts` — seed default → 42
- `src/assets/objects/articulated/types.ts` — Added import; replaced Math.random() + LCG with SeededRandom
- `src/assets/utils/AssetFactory.ts` — seed default → 42

### What was done

Systematically replaced all `Math.random()` calls with `SeededRandom` across 15 asset generation files. Default seed is always 42 when none is provided, ensuring deterministic procedural generation.

**Replacement patterns applied**:
- `Math.random()` → `this.rng.next()`
- `a + Math.random() * (b - a)` → `this.rng.nextFloat(a, b)`
- `arr[Math.floor(Math.random() * arr.length)]` → `this.rng.choice(arr)`
- `Math.random() > threshold` → `this.rng.boolean(1 - threshold)`
- `Math.floor(Math.random() * N)` → `this.rng.nextInt(0, N-1)`
- `Math.random() * 10000` (seed default) → `42`

**Key changes**:
- Appliance/bathroom generators use inherited `this.rng` from `BaseObjectGenerator`
- EyeGenerator and TailGenerator gained `private rng: SeededRandom` field
- `articulated/types.ts`: Replaced custom LCG rng (`() => number`) with `SeededRandom` instance
- InstanceScatterSystem, RockScatterSystem, RockGenerator already clean (Math.random() in comments only)

**Verification**: `rg 'Math\.random\(\)'` across all target directories returns 0 code matches (3 comment-only matches remain).

---

## [4-a] Replace Math.random() with SeededRandom in Scatter Ground & Lighting Files

**Date**: Current session  
**Agent**: 4a-seeded-random-scatter-lighting  
**Files Modified** (7 scatter ground files):
- `src/assets/objects/scatter/ground/PineDebrisGenerator.ts` — Already had import; replaced ~16 Math.random() calls in generatePinecones, createPineconeGeometry, generateSeeds, generateNeedleClusters
- `src/assets/objects/scatter/ground/TwigGenerator.ts` — Added import; added seed to TwigConfig; replaced ~12 Math.random() calls in generate, generateClusters, addMossGrowth, addLichenGrowth
- `src/assets/objects/scatter/ground/PebbleGenerator.ts` — Added import + rng property; changed seed default from Math.random()*10000 → 42; replaced ~13 Math.random() calls
- `src/assets/objects/scatter/ground/MushroomVarieties.ts` — Added import; added seed to MushroomVarietyConfig; replaced ~14 Math.random() calls across 5 methods
- `src/assets/objects/scatter/ground/GravelGenerator.ts` — Added import + rng property + seed to GravelConfig; replaced ~16 Math.random() calls across 3 methods
- `src/assets/objects/scatter/ground/StoneGenerator.ts` — Added import + rng property + seed to StoneConfig; replaced ~8 Math.random() calls across 4 methods
- `src/assets/objects/scatter/ground/LeafLitterGenerator.ts` — Added import; added seed to LeafLitterConfig; replaced ~10 Math.random() calls

**Lighting Files (5 files — No changes needed)**:
- CeilingLights.ts, TableLamps.ts, FloorLamps.ts, LampBase.ts — Already use `this.rng` from BaseObjectGenerator
- ChandelierGenerator.ts — Already has SeededRandom import and `private rng` property

### What was done

Replaced all `Math.random()` calls with `SeededRandom` across 7 scatter ground generator files. The 5 lighting generator files were already clean — they use `SeededRandom` via `BaseObjectGenerator.rng` or directly.

**Replacement patterns**:
- `Math.random()` → `rng.next()` / `this.rng.next()`
- `Math.floor(Math.random() * arr.length)` → `rng.nextInt(0, arr.length - 1)`
- `a + Math.random() * (b - a)` → `rng.nextFloat(a, b)`
- `0.85 + Math.random() * 0.3` → `rng.nextFloat(0.85, 1.15)`
- Default seed `Math.random() * 10000` → `42`

**Backward compatibility**:
- All `seed` fields are optional (`seed?: number`), default `42`
- `addMossGrowth()` and `addLichenGrowth()` in TwigGenerator gained optional `seed` param (default 42)
- Different methods use offset seeds (`seed + 1`, `seed + 2`, etc.) to avoid correlated output

**Verification**: `rg 'Math\.random\(\)' src/assets/objects/scatter/ground/ src/assets/objects/lighting/ --type ts -c` returns 0 matches.
