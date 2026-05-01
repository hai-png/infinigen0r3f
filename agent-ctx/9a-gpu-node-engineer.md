# Task 9a - GPU Marching Cubes + Node Material Generator

## Task 1: Complete GPU Marching Cubes

### File Modified
- `src/terrain/gpu/MarchingCubesCompute.ts` — Complete rewrite from placeholder to production implementation

### What was wrong
- Old `edgeTable` values were incorrect (0x0100, 0x0200 instead of Paul Bourke standard)
- Old `triTable` was a flat Int32Array but accessed as 2D: `triTable[config][ti]` — would always fail
- Old WGSL shader was a stub that only computed case index, never generated triangle vertices
- Old `execute()` GPU path had no atomic counters, no prefix sum, no proper readback
- Old CPU path had no normal computation and used wrong table data

### What was done
- **CPU path (primary)**: Rewrote to use correct `EDGE_TABLE`, `TRIANGLE_TABLE`, `EDGE_VERTICES`, `CORNER_OFFSETS` from `MarchingCubesLUTs.ts`. Added SDF gradient-based normal computation. Proper flat-array indexing for tri table.
- **GPU path (optional)**: Two-pass WGSL compute pipeline:
  - Pass 1 (classify): Count triangles per cell using atomic counters + tri table lookup
  - Pass 2 (generate): Write vertex positions + normals using CPU prefix-sum offsets
- **Fallback**: `execute()` tries GPU first, falls back to CPU on any error
- **`initialize()`**: Returns false if WebGPU unavailable

### Integration
- `src/terrain/gpu/index.ts` — Already exports `MarchingCubesCompute`, `GPUComputeConfig`, `MarchingCubesResult` — no changes needed
- `src/terrain/sdf/sdf-operations.ts` — `extractIsosurface()` has its own CPU marching cubes using the same LUTs — still works independently

---

## Task 2: Wire Node System → Material Generators

### Files Created
- `src/assets/materials/node-materials/NodeMaterialGenerator.ts` — Main generator class
- `src/assets/materials/node-materials/index.ts` — Barrel exports

### File Modified
- `src/assets/materials/index.ts` — Added NodeMaterialGenerator exports

### Architecture
- `NodeMaterialGenerator.generate(params)`:
  1. Look up `CategoryTemplate` for the material category
  2. Build node graph using `ShaderGraphBuilder`: TexCoord → Mapping → Noise/Voronoi → ColorRamp → PrincipledBSDF → MaterialOutput
  3. Set BSDF parameters (roughness, metalness, clearcoat, transmission, sheen, IOR) on the node
  4. Resolve node graph → `MeshPhysicalMaterial` settings
  5. Delegate canvas texture generation to existing category generators (WoodGenerator, MetalGenerator, etc.)
  6. Overlay node-graph-determined parameters on the resulting material
  7. Return `{ material, params, graph }`

### 9 Category Templates
- Wood, Metal, Stone, Fabric, Glass, Ceramic, Leather, Plastic, Tile
- Each has: node graph builder, default params, resolveMaterialSettings()
- Categories needing MeshPhysicalMaterial: stone (clearcoat), fabric (sheen), glass (transmission), ceramic (clearcoat), leather (clearcoat), plastic (transmission)

### TypeScript
- Zero new compilation errors
- 8 pre-existing errors in `src/core/constraints/language/` remain unchanged
