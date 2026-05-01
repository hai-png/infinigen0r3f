# Task 3-b: Per-Vertex Streaming in Node Evaluation System

## Agent: 3b-per-vertex-streaming-engineer

## Summary

Implemented per-vertex streaming in the node evaluation system, the core capability that moves node evaluation from object-level (single value per node) to per-vertex-level (one AttributeStream per node output, with one value per geometry element). This matches Blender's geometry node execution model.

## Files Created

1. **`src/core/nodes/core/attribute-stream.ts`** (~310 lines)
   - `AttributeStream` class: typed array of values backed by Float32Array
   - Supports 8 data types: FLOAT, INT, BOOLEAN, VECTOR, COLOR, QUATERNION, MATRIX, STRING
   - Full accessor API, transform operations (mapFloat/mapVector/mapColor), reductions (min/max/mean/reduceFloat), clone/slice

2. **`src/core/nodes/core/geometry-context.ts`** (~290 lines)
   - `GeometryContext` class: holds all attribute streams for a geometry
   - Built-in position, normal, UV streams with direct accessors
   - Index buffer, face/edge queries
   - `toBufferGeometry()` / `fromBufferGeometry()` Three.js interop
   - Deep clone

3. **`src/core/nodes/core/per-vertex-evaluator.ts`** (~460 lines)
   - `PerVertexEvaluator` class: evaluates node graph per-vertex
   - Built-in per-vertex executors for 11+ node types
   - Vectorization fallback for nodes with only scalar executors
   - `EvaluationContext` interface, `PerVertexExecutor` type, `perVertexExecutors` registry

## Files Modified

4. **`src/core/nodes/core/node-wrangler.ts`**
   - Added `evaluatePerVertex(geometry)` method to NodeWrangler class
   - Uses lazy require() to avoid circular dependency

5. **`src/core/nodes/core/index.ts`**
   - Added exports: AttributeStream, AttributeDataType, StreamAttributeDomain, GeometryContext, PerVertexEvaluator, perVertexExecutors, EvaluationContext

6. **`package.json`** (via bun add)
   - Added `three@0.184.0` and `@types/three@0.184.0` as dependencies

## Key Design Decisions

- Float32Array backing for WebGL/Three.js interop and 100k+ vertex performance
- readonly name on AttributeStream to prevent mutation during evaluation
- Framework-agnostic core with Three.js conversion at the boundary
- Separate perVertexExecutors map (not mixed with scalar NodeWrangler.executors)
- Lazy require() in evaluatePerVertex() to break circular dependency cycle

## Verification

- 0 TypeScript errors: `npx tsc --noEmit` shows no errors in our files
- Existing `evaluate()` method untouched — both paths coexist
