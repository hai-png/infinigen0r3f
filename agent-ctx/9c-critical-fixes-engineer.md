# Task 9c - Critical Fixes: RenderTask, MJCF Export, NodeWrangler, Boolean CSG

## Summary

Fixed 4 critical placeholder/stub implementations across the infinigen-r3f project.

## Files Modified

1. **src/core/rendering/RenderTask.ts** — Complete rewrite from placeholder to actual pixel rendering
2. **src/sim/physics-exporters.ts** — Fixed exportJoint (always fixed→correct mapping), exportActuators (placeholder→real motors), exportSensors (placeholder→real sensors), exportCollisionGeom/exportVisualGeom (mesh name references), exportJointURDF (always fixed→correct types)
3. **src/assets/objects/articulated/types.ts** — Added 'continuous' and 'ball_socket' to JointType, fixed jointTypeToMJCF() for limited/unlimited, added sensor export, added mesh asset section, added ctrllimited to motors
4. **src/core/nodes/core/node-wrangler.ts** — Added topologicalSort(), evaluate(), getOutput() methods, static executor registry
5. **src/core/nodes/boolean/BooleanNodes.ts** — Complete rewrite from placeholder to functional CSG operations

## Key Changes

### RenderTask
- OffscreenCanvas + WebGLRenderer for headless rendering
- 6 render passes: color, depth, normals, segmentation, albedo, flow
- Camera trajectory interpolation from AnimationPolicySystem keyframes
- Output: actual PNG/JPEG data URLs per pass per frame

### MJCF Export
- exportJoint() now reads userData.joint and maps: hinge→hinge, prismatic→slide, ball/ball_socket→ball, continuous→hinge(limited=false)
- exportActuators() generates <motor> elements with ctrlrange, ctrllimited="true"
- exportSensors() generates <jointpos> and <jointvel> per non-fixed joint
- Geom export uses <geom type="mesh" mesh="name"/> for mesh references
- URDF export also fixed with proper joint types, axis, limits, dynamics

### NodeWrangler
- topologicalSort() uses Kahn's algorithm with cycle detection
- evaluate() resolves inputs from connections, executes nodes in order
- getOutput() finds GroupOutput node or returns last node's output
- Static executor registry for per-node-type execution functions

### Boolean CSG
- booleanUnion: mergeAttributes() combining both geometries
- booleanIntersect: bbox intersection + vertex filtering inside overlap
- booleanDifference: bbox subtraction + vertex filtering outside overlap
- All preserve normals, UVs, indices; noted as simplified (manifold-3d for production)
