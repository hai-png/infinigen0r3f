# Task: Expanded GLSL Node Coverage & Attribute System

## Agent: main

## Summary

Created two major modules for the infinigen-r3f project:

### Part 1: Expanded GLSL Node Coverage

**File: `src/core/nodes/execution/glsl/ExpandedGLSLFunctions.ts`**

Provides GLSL code generation for 16 additional node types that previously generated passthrough code:

1. **Attribute Nodes** (`ShaderNodeAttribute`, `GeometryNodeInputPosition`, `GeometryNodeInputNormal`, `GeometryNodeInputIndex`) — reading vertex attributes in shaders
2. **Curve Nodes** (`ShaderNodeRGBCurve`) — per-channel color curve with Catmull-Rom interpolation
3. **Light Nodes** (`ShaderNodeLightPath`, `ShaderNodeAmbientOcclusion`) — ray type booleans and SSAO approximation
4. **Bump/Normal Nodes** (`ShaderNodeBump`, `ShaderNodeNormalMap`) — finite-difference normal perturbation and tangent-space decoding
5. **Map Range** (`ShaderNodeMapRange`) — linear/stepped/smoothstep/smootherstep interpolation (float + vec3)
6. **Vector Rotate** (`ShaderNodeVectorRotate`) — axis-angle, euler XYZ, X/Y/Z axis rotation
7. **Volume Nodes** (`ShaderNodeVolumeAbsorption`, `ShaderNodeVolumeScatter`) — absorption/scattering coefficients with Beer-Lambert
8. **Additional Math** (`FunctionNodeCompare`, `FunctionNodeBooleanMath`, `ShaderNodeClamp`) — float comparison, boolean operations, min/max clamping

Each provides:
- GLSL snippet string for function body
- Input/output declarations
- Required uniform declarations
- `EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS` mapping (node type → required snippets)
- `EXPANDED_GLSL_SNIPPET_MAP` for snippet lookup

**File: `src/core/nodes/execution/glsl/GLSLComposerIntegration.ts`**

Integration module that provides:
- `MERGED_GLSL_SNIPPET_MAP` — combined base + expanded snippet map
- `MERGED_NODE_TYPE_GLSL_REQUIREMENTS` — combined node type requirements
- `EXTENDED_VERTEX_SHADER_TEMPLATE` — vertex shader with tangent/bitangent/vertexID varyings
- `EXTENDED_FRAGMENT_VARYINGS_BLOCK` — corresponding fragment varyings
- Helper functions: `isExpandedNodeType`, `getRequiredSnippetsForType`, `requiresExtendedVaryings`, `resolveAllSnippets`, `buildFunctionCode`
- Constants for node modes: `MAP_RANGE_MODES`, `VECTOR_ROTATE_MODES`, `COMPARE_MODES`, `BOOLEAN_MATH_MODES`, `CLAMP_MODES`

### Part 2: Attribute System

**File: `src/core/attributes/AttributeSystem.ts`**

Complete attribute management system for Three.js BufferGeometry, supporting:
- Multiple domains: point, edge, face, corner, spline, instance
- Multiple data types: float, int, float2, float3, float4, boolean, byte_color, string
- `writeAttribute` — write typed array data with domain/dataType metadata
- `readAttribute` — read attribute data (returns copy)
- `removeAttribute` — remove attribute + metadata
- `hasAttribute` — check existence
- `getAttributeDomain` / `getAttributeDataType` — retrieve metadata
- `listAttributes` — list all custom attributes with metadata
- `smoothAttribute` — Laplacian smoothing with configurable iterations/weight
- `transferAttribute` — nearest-vertex and barycentric interpolation transfer
- `createAttributeFromFunction` — create attributes from (index, position, normal) → value functions
- `convertAttributeDomain` — point↔face, point↔corner, corner↔face conversions
- `getElementCount`, `getEdges`, `getFaceVertices`, `ensureNormals` — utility methods

**File: `src/core/attributes/index.ts`**

Barrel export for the attribute system module.

### Updated Index Files

- `src/core/nodes/execution/glsl/index.ts` — added exports for expanded functions, integration module
- `src/core/nodes/execution/index.ts` — added expanded GLSL + attribute system exports
- `src/core/index.ts` — added AttributeSystem, AttributeDomain, AttributeDataType, AttributeInfo exports

### Type Check

All files pass TypeScript type checking with zero errors.
