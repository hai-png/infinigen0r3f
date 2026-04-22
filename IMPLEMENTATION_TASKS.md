# Infinigen R3F Port: Implementation Task Tracker

This document breaks down the implementation plan into actionable GitHub-ready issues with detailed specifications.

---

## Phase 1: Foundation (Weeks 1-4)

### Sprint 1.1: Node System Completion (Week 1-2)

#### Issue #101: Complete Node Type Enumeration
**Priority**: P0  
**Estimate**: 3 days  
**Labels**: `nodes`, `P0`, `foundation`

**Description**:  
The current node type enumeration is incomplete. We need to catalog all Blender geometry node types and create corresponding TypeScript enums/types.

**Tasks**:
- [ ] Audit `original_infinigen/infinigen/core/nodes/node_info.py` for complete node list
- [ ] Create comprehensive `NodeType` enum in `src/nodes/core/node-types.ts`
- [ ] Add node category classifications (Input, Output, Geometry, Attribute, etc.)
- [ ] Document each node type with Blender equivalent

**Acceptance Criteria**:
- All 200+ Blender geometry nodes enumerated
- TypeScript types are exhaustive and well-documented
- Unit tests verify enum completeness

**Reference Files**:
- `original_infinigen/infinigen/core/nodes/node_info.py`
- `src/nodes/core/node-types.ts`

---

#### Issue #102: Socket Type Inference System
**Priority**: P0  
**Estimate**: 4 days  
**Labels**: `nodes`, `P0`, `type-system`

**Description**:  
Implement automatic socket type inference for node connections, matching Blender's type system.

**Tasks**:
- [ ] Define socket type hierarchy (Geometry, Value, Vector, Color, Boolean, Integer, String)
- [ ] Implement type inference from node outputs
- [ ] Create type compatibility checking
- [ ] Add runtime type validation for connections
- [ ] Build type error reporting

**Acceptance Criteria**:
- Can infer output type from any node
- Type mismatches caught at connection time
- Clear error messages for type violations

**Reference Files**:
- `original_infinigen/infinigen/core/nodes/node_info.py` (DATATYPE_FIELDS, DATATYPE_TO_PYTYPE)
- `src/nodes/core/socket-inference.ts` (new)

---

#### Issue #103: Node Tree Manipulation API
**Priority**: P0  
**Estimate**: 5 days  
**Labels**: `nodes`, `P0`, `api`

**Description**:  
Build comprehensive API for creating, modifying, and traversing node trees.

**Tasks**:
- [ ] Create `NodeTree` class with CRUD operations
- [ ] Implement node creation with typed inputs
- [ ] Build link management (connect/disconnect)
- [ ] Add tree traversal utilities (DFS, BFS)
- [ ] Create node search/filter functions
- [ ] Implement tree duplication/cloning
- [ ] Add tree serialization/deserialization

**Acceptance Criteria**:
- Full programmatic control over node trees
- Efficient tree traversal
- Round-trip serialization works correctly

**Reference Files**:
- `original_infinigen/infinigen/core/nodes/node_wrangler.py` (NodeWrangler class)
- `src/nodes/core/tree-manipulation.ts` (new)

---

#### Issue #104: Group Input/Output Management
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `nodes`, `P1`, `groups`

**Description**:  
Implement geometry node group input/output socket management.

**Tasks**:
- [ ] Create `NodeGroup` class
- [ ] Implement input socket addition/removal
- [ ] Implement output socket addition/removal
- [ ] Add socket renaming functionality
- [ ] Build default value management
- [ ] Create socket type specification
- [ ] Implement group instantiation

**Acceptance Criteria**:
- Can create reusable node groups
- I/O sockets properly typed
- Groups can be instantiated in other trees

**Reference Files**:
- `original_infinigen/infinigen/core/nodes/node_wrangler.py` (ng_inputs, ng_outputs)
- `src/nodes/groups/group-io.ts`

---

#### Issue #105: Attribute Node Helpers
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `nodes`, `P1`, `attributes`

**Description**:  
Create helper functions for common attribute operations (read, write, capture).

**Tasks**:
- [ ] Implement `captureAttribute()` helper
- [ ] Create `namedAttribute()` read helper
- [ ] Build `storeNamedAttribute()` write helper
- [ ] Add domain conversion utilities
- [ ] Create attribute existence checks

**Acceptance Criteria**:
- Simple API for attribute operations
- Correct domain handling
- Type-safe attribute access

**Reference Files**:
- `original_infinigen/infinigen/core/surface.py` (write_attribute function)
- `src/nodes/helpers/attribute-helpers.ts` (new)

---

### Sprint 1.2: Surface & Tagging System (Week 3-4)

#### Issue #106: Surface Module - Core Functions
**Priority**: P0  
**Estimate**: 5 days  
**Labels**: `surface`, `P0`, `core`

**Description**:  
Port core surface manipulation functions from Blender to Three.js.

**Tasks**:
- [ ] Implement `writeAttribute(obj, attributeFunc, name, dataType)` 
- [ ] Implement `readAttrData(obj, attr, domain, resultDtype)`
- [ ] Create `addGeoMod(objs, nodeFunc, name, apply, attributes)`
- [ ] Build `removeMaterials(obj)` utility
- [ ] Implement domain conversion (POINT, EDGE, FACE, CORNER)
- [ ] Add attribute data type conversions

**Technical Notes**:
- Three.js uses BufferAttributes instead of Blender attributes
- Domain mapping: POINT → position, FACE → groups (limited support)
- May need custom attribute storage for face-domain data

**Acceptance Criteria**:
- Can write custom attributes to geometries
- Can read back attribute data accurately
- Domain handling works correctly
- Memory-efficient for large meshes

**Reference Files**:
- `original_infinigen/infinigen/core/surface.py` (entire file)
- `src/assets/core/surface.ts` (new)

---

#### Issue #107: AutoTag Class Implementation
**Priority**: P0  
**Estimate**: 5 days  
**Labels**: `tagging`, `P0`, `core`

**Description**:  
Implement the AutoTag system for managing semantic tags on mesh faces.

**Tasks**:
- [ ] Create `AutoTag` class with tag dictionary
- [ ] Implement `_extractIncomingTagMasks(obj)`
- [ ] Build `_specializeTagName(vi, name, lookup)`
- [ ] Create `saveTag(path)` and `loadTag(path)`
- [ ] Implement tag combination logic
- [ ] Add tag validation

**Acceptance Criteria**:
- Can extract tags from incoming objects
- Tag names properly specialized per instance
- Save/load works with JSON format
- Tags combine correctly across scattered instances

**Reference Files**:
- `original_infinigen/infinigen/core/tagging.py` (AutoTag class)
- `src/tags/auto-tag.ts` (new)

---

#### Issue #108: Face-Based Tag Extraction
**Priority**: P0  
**Estimate**: 4 days  
**Labels**: `tagging`, `P0`, `segmentation`

**Description**:  
Implement face-based tag mask extraction for segmentation ground truth.

**Tasks**:
- [ ] Create face iteration utility for Three.js geometries
- [ ] Implement tag mask extraction per face
- [ ] Build combined mask attribute generation
- [ ] Add boolean mask operations (AND, OR, NOT)
- [ ] Create mask visualization helpers
- [ ] Implement mask compression (run-length encoding)

**Technical Notes**:
- Three.js doesn't have native face attributes like Blender
- Need to use group indices or custom buffer attributes
- Consider using texture-based storage for face data

**Acceptance Criteria**:
- Can extract per-face tag masks
- Combined masks generated correctly
- Boolean operations work as expected
- Masks exportable for ground truth

**Reference Files**:
- `original_infinigen/infinigen/core/tagging.py` (mask extraction logic)
- `src/tags/mask-extraction.ts` (new)

---

#### Issue #109: Support Surface Detection
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `tagging`, `P1`, `physics`

**Description**:  
Implement support surface detection for object placement constraints.

**Tasks**:
- [ ] Create surface normal analysis
- [ ] Implement "up" direction detection
- [ ] Build support region identification
- [ ] Add angle threshold filtering
- [ ] Create support surface caching

**Acceptance Criteria**:
- Can identify horizontal surfaces
- Support regions correctly marked
- Works with complex geometry
- Cached for performance

**Reference Files**:
- `original_infinigen/infinigen/core/tagging.py` (support surface logic)
- `src/tags/support-surfaces.ts` (new)

---

#### Issue #110: Canonical Surface Tagging
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `tagging`, `P1`, `advanced`

**Description**:  
Implement canonical surface tagging for consistent material/property assignment.

**Tasks**:
- [ ] Define canonical surface taxonomy
- [ ] Create surface classification algorithm
- [ ] Implement canonical tag assignment
- [ ] Build tag inheritance system
- [ ] Add override mechanism

**Acceptance Criteria**:
- Surfaces classified consistently
- Canonical tags propagate correctly
- Overrides work as expected

**Reference Files**:
- `original_infinigen/infinigen/core/tagging.py` (canonical tagging)
- `src/tags/canonical-surfaces.ts` (new)

---

## Phase 2: Task Execution & Rendering (Weeks 5-8)

### Sprint 2.1: Task Execution Framework (Week 5-6)

#### Issue #201: Task Function Registry
**Priority**: P0  
**Estimate**: 3 days  
**Labels**: `pipeline`, `P0`, `architecture`

**Description**:  
Create registry system for task functions with configuration support.

**Tasks**:
- [ ] Design task function interface
- [ ] Create task registry singleton
- [ ] Implement task discovery
- [ ] Add configuration binding (gin equivalent)
- [ ] Build task validation
- [ ] Create task metadata system

**Acceptance Criteria**:
- Tasks can be registered and discovered
- Configuration binds correctly
- Invalid tasks rejected with clear errors

**Reference Files**:
- `original_infinigen/infinigen/core/execute_tasks.py` (decorator patterns)
- `src/pipeline/task-registry.ts` (new)

---

#### Issue #202: Render Task Implementation
**Priority**: P0  
**Estimate**: 4 days  
**Labels**: `rendering`, `P0`, `task`

**Description**:  
Implement the main render task with multi-frame support.

**Tasks**:
- [ ] Create `render()` task function
- [ ] Implement frame range handling
- [ ] Add camera configuration
- [ ] Build output folder management
- [ ] Implement resampling integration
- [ ] Add water hide option
- [ ] Create render progress tracking

**Acceptance Criteria**:
- Renders sequences of frames
- Handles resampling correctly
- Output organized by frame
- Progress reported accurately

**Reference Files**:
- `original_infinigen/infinigen/core/execute_tasks.py` (render function)
- `src/rendering/render-task.ts` (new)

---

#### Issue #203: Save Meshes Task
**Priority**: P0  
**Estimate**: 4 days  
**Labels**: `pipeline`, `P0`, `export`

**Description**:  
Implement mesh export task with triangulation and formatting.

**Tasks**:
- [ ] Create `saveMeshes()` task function
- [ ] Implement mesh triangulation
- [ ] Add LOD selection
- [ ] Build export format selection
- [ ] Create filename templating
- [ ] Implement polycount saving
- [ ] Add export validation

**Acceptance Criteria**:
- Meshes exported in multiple formats
- All meshes triangulated
- Polycounts recorded
- Exports validated

**Reference Files**:
- `original_infinigen/infinigen/core/execute_tasks.py` (save_meshes function)
- `original_infinigen/infinigen/tools/export.py` (triangulate_meshes)
- `src/pipeline/mesh-export-task.ts` (new)

---

#### Issue #204: Static Object Detection
**Priority**: P1  
**Estimate**: 2 days  
**Labels**: `pipeline`, `P1`, `optimization`

**Description**:  
Implement static object detection for optimization.

**Tasks**:
- [ ] Create `isStatic(obj)` function
- [ ] Check for scatter modifiers
- [ ] Check for asset collection membership
- [ ] Detect constraints
- [ ] Detect animation data
- [ ] Detect animated geometry nodes
- [ ] Detect armature modifiers
- [ ] Traverse parent hierarchy

**Acceptance Criteria**:
- Static objects correctly identified
- Dynamic objects flagged appropriately
- Hierarchy traversal works correctly

**Reference Files**:
- `original_infinigen/infinigen/core/execute_tasks.py` (is_static function)
- `src/pipeline/static-detection.ts` (new)

---

#### Issue #205: Scene Tagging Integration
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `tagging`, `P1`, `integration`

**Description**:  
Integrate tagging system with scene generation workflow.

**Tasks**:
- [ ] Create scene tag extraction
- [ ] Implement tag-based object filtering
- [ ] Build tag query language
- [ ] Add tag statistics generation
- [ ] Create tag visualization

**Acceptance Criteria**:
- Scene tags accessible via query
- Objects filterable by tags
- Statistics generated correctly

**Reference Files**:
- `original_infinigen/infinigen/core/execute_tasks.py` (get_scene_tag)
- `src/tags/scene-tags.ts` (new)

---

### Sprint 2.2: Rendering Pipeline Enhancement (Week 7-8)

#### Issue #206: Multi-Pass Renderer
**Priority**: P0  
**Estimate**: 5 days  
**Labels**: `rendering`, `P0`, `core`

**Description**:  
Implement multi-pass rendering system for ground truth generation.

**Tasks**:
- [ ] Create `MultiPassRenderer` class
- [ ] Implement pass configuration
- [ ] Build pass dependency graph
- [ ] Create pass execution order
- [ ] Implement pass caching
- [ ] Add AOV (Arbitrary Output Variable) support
- [ ] Build render layer system

**Acceptance Criteria**:
- Multiple passes rendered in single scene pass
- Dependencies respected
- AOVs captured correctly
- Performance acceptable (<2x single pass)

**Reference Files**:
- `original_infinigen/infinigen/core/rendering/render.py`
- `src/rendering/multi-pass-renderer.ts` (new)

---

#### Issue #207: Depth Pass Generation
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `rendering`, `P1`, `ground-truth`

**Description**:  
Implement depth map rendering pass.

**Tasks**:
- [ ] Create depth shader material
- [ ] Implement perspective depth encoding
- [ ] Add orthographic depth support
- [ ] Build depth normalization
- [ ] Create 16-bit PNG export
- [ ] Add EXR export for HDR depth

**Acceptance Criteria**:
- Depth maps accurate to camera
- Encoding matches standard formats
- Export formats interoperable

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/glsl/` (depth shaders)
- `src/rendering/passes/depth-pass.ts` (new)

---

#### Issue #208: Normal Pass Generation
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `rendering`, `P1`, `ground-truth`

**Description**:  
Implement normal map rendering pass.

**Tasks**:
- [ ] Create normal shader material
- [ ] Implement world-space normals
- [ ] Add tangent-space normals
- [ ] Build normal encoding (RGB)
- [ ] Create visualization mode

**Acceptance Criteria**:
- Normals encoded correctly
- Both coordinate spaces supported
- Visualizable for debugging

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/glsl/` (normal shaders)
- `src/rendering/passes/normal-pass.ts` (new)

---

#### Issue #209: Instance ID Pass
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `rendering`, `P1`, `ground-truth`

**Description**:  
Implement instance segmentation ID rendering.

**Tasks**:
- [ ] Create instance ID shader
- [ ] Implement unique ID assignment
- [ ] Build ID encoding (RGB packing)
- [ ] Add ID-to-object lookup table
- [ ] Create ID visualization
- [ ] Implement hierarchical IDs (category + instance)

**Technical Notes**:
- Pack 32-bit IDs into RGB (8 bits per channel = 16M IDs)
- Or use floating point texture for full 32-bit precision

**Acceptance Criteria**:
- Each instance has unique ID
- IDs decode back to object references
- Supports >1M instances

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/main.cpp` (instance ID logic)
- `src/rendering/passes/instance-id-pass.ts` (new)

---

#### Issue #210: Semantic Segmentation Pass
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `rendering`, `P1`, `ground-truth`

**Description**:  
Implement semantic segmentation rendering.

**Tasks**:
- [ ] Create semantic tag-to-color mapping
- [ ] Implement per-object semantic assignment
- [ ] Build segmentation shader
- [ ] Add color legend generation
- [ ] Create COCO-format label mapping
- [ ] Implement hierarchical semantics

**Acceptance Criteria**:
- Each pixel colored by semantic class
- Mapping configurable
- Compatible with standard datasets

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/` (semantic logic)
- `src/rendering/passes/semantic-pass.ts` (new)

---

#### Issue #211: Optical Flow Pass
**Priority**: P2  
**Estimate**: 5 days  
**Labels**: `rendering`, `P2`, `ground-truth`

**Description**:  
Implement optical flow ground truth generation.

**Tasks**:
- [ ] Create flow computation shader
- [ ] Implement frame-to-frame tracking
- [ ] Build flow vector encoding
- [ ] Add occlusion detection
- [ ] Create flow visualization
- [ ] Implement forward/backward flow

**Technical Notes**:
- Requires two-frame rendering
- Store motion vectors during animation
- Handle disocclusions properly

**Acceptance Criteria**:
- Flow vectors accurate
- Occlusions marked correctly
- Standard encoding format

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/` (flow computation)
- `src/rendering/passes/optical-flow-pass.ts` (new)

---

#### Issue #212: EXR Export Implementation
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `rendering`, `P1`, `export`

**Description**:  
Implement OpenEXR export for HDR data.

**Tasks**:
- [ ] Integrate EXR library (openexr-js or similar)
- [ ] Create EXR encoder wrapper
- [ ] Implement multi-layer EXR
- [ ] Add channel configuration
- [ ] Build compression options
- [ ] Create EXR metadata support

**Acceptance Criteria**:
- EXR files readable by standard tools
- Multi-layer support works
- Compression efficient
- Metadata preserved

**Reference Files**:
- `original_infinigen/infinigen/core/rendering/render.py` (EXR export)
- `src/rendering/exr-exporter.ts` (new)

---

## Phase 3: Ground Truth & Export (Weeks 9-12)

### Sprint 3.1: Shader System (Week 9-10)

#### Issue #301: Shader Compilation Pipeline
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `shaders`, `P1`, `infrastructure`

**Description**:  
Build shader compilation and management system.

**Tasks**:
- [ ] Create shader source loader
- [ ] Implement GLSL preprocessing
- [ ] Build shader variant system
- [ ] Add shader caching
- [ ] Create hot-reload for development
- [ ] Implement shader validation
- [ ] Build error reporting

**Acceptance Criteria**:
- Shaders compile without errors
- Variants generated efficiently
- Hot-reload works in dev mode
- Clear error messages

**Files to Create**:
- `src/rendering/shader-compiler.ts`

---

#### Issue #302: Instance ID Shader
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `shaders`, `P1`, `ground-truth`

**Description**:  
Port instance ID rendering shader from C++/GLSL to Three.js.

**Tasks**:
- [ ] Translate GLSL to Three.js shader chunks
- [ ] Implement ID packing in vertex shader
- [ ] Create fragment shader output
- [ ] Add instancing support
- [ ] Test with large scenes

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/glsl/instance_id.glsl`
- `src/rendering/shaders/instance-id.shader.ts`

---

#### Issue #303: Semantic Segmentation Shader
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `shaders`, `P1`, `ground-truth`

**Description**:  
Port semantic segmentation shader.

**Tasks**:
- [ ] Translate semantic GLSL shaders
- [ ] Implement uniform-based class colors
- [ ] Add material override system
- [ ] Create batch rendering support
- [ ] Test color accuracy

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/glsl/semantic.glsl`
- `src/rendering/shaders/semantic-seg.shader.ts`

---

#### Issue #304: Depth/Normal Encoding Shaders
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `shaders`, `P1`, `ground-truth`

**Description**:  
Create shaders for depth and normal encoding.

**Tasks**:
- [ ] Implement depth encoding (linear/logarithmic)
- [ ] Create normal encoding (world/tangent space)
- [ ] Add bit-depth optimization
- [ ] Build precision controls
- [ ] Test against reference implementations

**Reference Files**:
- `original_infinigen/infinigen/datagen/customgt/glsl/depth.glsl`
- `original_infinigen/infinigen/datagen/customgt/glsl/normal.glsl`
- `src/rendering/shaders/depth-normal.shader.ts`

---

### Sprint 3.2: Export Formats (Week 11-12)

#### Issue #305: COCO Format Exporter
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `export`, `P1`, `coco`

**Description**:  
Implement COCO dataset format export.

**Tasks**:
- [ ] Create COCO schema types
- [ ] Implement annotation generation
- [ ] Build image metadata export
- [ ] Add category mapping
- [ ] Create segmentation polygon conversion
- [ ] Implement bbox computation
- [ ] Add keypoint support (optional)
- [ ] Write JSON with proper structure

**Acceptance Criteria**:
- Valid COCO JSON output
- All required fields present
- Interoperable with COCO tools
- Tested with COCO API

**Reference Files**:
- `original_infinigen/infinigen/tools/export.py` (COCO export section)
- `src/pipeline/exports/coco-exporter.ts` (new)

---

#### Issue #306: YOLO Format Exporter
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `export`, `P1`, `yolo`

**Description**:  
Implement YOLO object detection format export.

**Tasks**:
- [ ] Create YOLO text format writer
- [ ] Implement normalized bbox computation
- [ ] Build class index mapping
- [ ] Add YOLOv5/v8 variant support
- [ ] Create dataset.yaml generator
- [ ] Implement train/val/test split

**Acceptance Criteria**:
- Valid YOLO format output
- Bboxes normalized correctly
- Compatible with YOLO training

**Reference Files**:
- `original_infinigen/infinigen/tools/export.py` (YOLO export)
- `src/pipeline/exports/yolo-exporter.ts` (new)

---

#### Issue #307: Pascal VOC Exporter
**Priority**: P2  
**Estimate**: 3 days  
**Labels**: `export`, `P2`, `voc`

**Description**:  
Implement Pascal VOC format export.

**Tasks**:
- [ ] Create XML annotation writer
- [ ] Implement bbox export
- [ ] Add segmentation mask export
- [ ] Build ImageSets generation
- [ ] Create label map files

**Acceptance Criteria**:
- Valid VOC XML output
- Directory structure correct
- Compatible with VOC tools

**Reference Files**:
- `original_infinigen/infinigen/tools/export.py` (VOC export)
- `src/pipeline/exports/voc-exporter.ts` (new)

---

#### Issue #308: Point Cloud Exporter
**Priority**: P2  
**Estimate**: 4 days  
**Labels**: `export`, `P2`, `pointcloud`

**Description**:  
Implement point cloud export formats (PLY, LAS, XYZ).

**Tasks**:
- [ ] Create PLY format writer (ASCII + binary)
- [ ] Implement LAS/LAZ support (via library)
- [ ] Add XYZ simple format
- [ ] Build normal/color attribute export
- [ ] Create intensity channel support
- [ ] Add GPS time for LiDAR simulation

**Acceptance Criteria**:
- Valid PLY/LAS files
- Attributes preserved
- Readable by CloudCompare, PDAL

**Reference Files**:
- `original_infinigen/infinigen/tools/export.py` (point cloud export)
- `src/pipeline/exports/pointcloud-exporter.ts` (new)

---

#### Issue #309: Mesh Sequence Cache
**Priority**: P2  
**Estimate**: 3 days  
**Labels**: `export`, `P2`, `animation`

**Description**:  
Implement animated mesh sequence export.

**Tasks**:
- [ ] Create Alembic (.abc) export
- [ ] Implement USD export
- [ ] Add FBX animation export
- [ ] Build glTF animation support
- [ ] Create cache manifest file

**Acceptance Criteria**:
- Animation preserved in export
- Compatible with DCC tools
- Efficient file sizes

**Reference Files**:
- `original_infinigen/infinigen/tools/export.py` (animation export)
- `src/pipeline/exports/mesh-sequence-cache.ts` (new)

---

## Phase 4: Animation & Advanced Features (Weeks 13-16)

### Sprint 4.1: Animation System (Week 13-14)

#### Issue #401: Animation Curve Generator
**Priority**: P2  
**Estimate**: 4 days  
**Labels**: `animation`, `P2`, `curves`

**Description**:  
Create animation curve generation system.

**Tasks**:
- [ ] Define curve data structures
- [ ] Implement keyframe storage
- [ ] Create curve evaluation engine
- [ ] Add curve visualization
- [ ] Build curve editing API
- [ ] Implement curve presets (ease-in, ease-out, etc.)

**Acceptance Criteria**:
- Curves evaluate correctly
- Multiple interpolation modes
- Real-time preview

**Reference Files**:
- `original_infinigen/infinigen/core/placement/animation_policy.py` (curve logic)
- `src/animation/curve-generator.ts` (new)

---

#### Issue #402: Keyframe Interpolation
**Priority**: P2  
**Estimate**: 3 days  
**Labels**: `animation`, `P2`, `interpolation`

**Description**:  
Implement multiple interpolation methods.

**Tasks**:
- [ ] Linear interpolation
- [ ] Bezier interpolation (with handles)
- [ ] Step interpolation (discrete)
- [ ] Catmull-Rom splines
- [ ] Hermite curves
- [ ] Add tangent computation

**Acceptance Criteria**:
- All interpolation types work
- Smooth transitions
- No artifacts at keyframes

**Reference Files**:
- `original_infinigen/infinigen/core/placement/animation_policy.py` (interpolation)
- `src/animation/interpolators.ts` (new)

---

#### Issue #403: Procedural Animation Policies
**Priority**: P2  
**Estimate**: 5 days  
**Labels**: `animation`, `P2`, `procedural`

**Description**:  
Build procedural animation policy system.

**Tasks**:
- [ ] Create policy base class
- [ ] Implement noise-driven animation
- [ ] Add physics-based policies
- [ ] Build constraint-based policies
- [ ] Create policy composition
- [ ] Add policy blending

**Acceptance Criteria**:
- Policies generate valid animations
- Composable and blendable
- Performant for many objects

**Reference Files**:
- `original_infinigen/infinigen/core/placement/animation_policy.py` (policies)
- `src/animation/procedural-policies.ts` (new)

---

#### Issue #404: Time-Based Transformations
**Priority**: P2  
**Estimate**: 3 days  
**Labels**: `animation`, `P2`, `transforms`

**Description**:  
Implement time-based transformation system.

**Tasks**:
- [ ] Create timeline manager
- [ ] Implement time scaling
- [ ] Add time offset support
- [ ] Build looping modes
- [ ] Create time warping
- [ ] Add pause/resume functionality

**Acceptance Criteria**:
- Time manipulation works correctly
- Multiple timelines supported
- Synchronization accurate

**Reference Files**:
- `original_infinigen/infinigen/core/placement/animation_policy.py` (time handling)
- `src/animation/time-transforms.ts` (new)

---

### Sprint 4.2: Camera & Kinematics (Week 15-16)

#### Issue #405: Spline Camera Trajectories
**Priority**: P2  
**Estimate**: 4 days  
**Labels**: `camera`, `P2`, `trajectories`

**Description**:  
Implement spline-based camera path system.

**Tasks**:
- [ ] Create spline path definition
- [ ] Implement path following
- [ ] Add look-at target system
- [ ] Build bank/roll control
- [ ] Create speed profiles
- [ ] Add path visualization

**Acceptance Criteria**:
- Smooth camera movement
- Configurable look-at behavior
- Speed control works

**Reference Files**:
- `original_infinigen/infinigen/core/placement/camera_trajectories.py`
- `src/placement/camera/trajectories.ts` (expand)

---

#### Issue #406: Specialized Camera Shots
**Priority**: P2  
**Estimate**: 4 days  
**Labels**: `camera`, `P2`, `cinematography`

**Description**:  
Create library of cinematic camera shots.

**Tasks**:
- [ ] Circular orbit controller
- [ ] Tracking shot system
- [ ] Dolly zoom effect
- [ ] Handheld camera simulation
- [ ] Crane/jib shot
- [ ] FPV drone style

**Acceptance Criteria**:
- Each shot type works independently
- Parameters adjustable
- Professional results

**Reference Files**:
- `original_infinigen/infinigen/core/placement/camera.py` (shot types)
- `src/placement/camera/tracking-shots.ts` (new)
- `src/placement/camera/orbit-controller.ts` (new)

---

#### Issue #407: Kinematic Compiler Completion
**Priority**: P2  
**Estimate**: 5 days  
**Labels**: `kinematic`, `P2`, `compiler`

**Description**:  
Complete the kinematic chain compiler.

**Tasks**:
- [ ] Finish chain parsing
- [ ] Implement constraint compilation
- [ ] Add joint limit enforcement
- [ ] Create chain validation
- [ ] Build optimization passes
- [ ] Add caching

**Acceptance Criteria**:
- Complex chains compile correctly
- Constraints enforced
- Efficient execution

**Reference Files**:
- `original_infinigen/infinigen/core/sim/kinematic_compiler.py`
- `src/sim/kinematic/compiler.ts` (expand)

---

#### Issue #408: IK/FK Solver
**Priority**: P2  
**Estimate**: 5 days  
**Labels**: `kinematic`, `P2`, `solver`

**Description**:  
Implement inverse and forward kinematics solvers.

**Tasks**:
- [ ] Forward kinematics implementation
- [ ] CCD IK solver
- [ ] FABRIK solver
- [ ] Jacobian-based IK
- [ ] FK/IK switching
- [ ] Pole vector support

**Acceptance Criteria**:
- Both IK and FK work
- Switching seamless
- Converges reliably

**Reference Files**:
- `original_infinigen/infinigen/core/sim/kinematic_compiler.py` (IK/FK logic)
- `src/sim/kinematic/ik-solver.ts` (new)

---

## Phase 5: Polish & Optimization (Weeks 17-20)

### Sprint 5.1: Performance (Week 17-18)

#### Issue #501: Performance Profiling Setup
**Priority**: P1  
**Estimate**: 2 days  
**Labels**: `performance`, `P1`, `tooling`

**Description**:  
Set up performance profiling infrastructure.

**Tasks**:
- [ ] Integrate performance monitoring library
- [ ] Create benchmark suite
- [ ] Set up automated profiling
- [ ] Build performance dashboard
- [ ] Add memory profiling

**Acceptance Criteria**:
- Can profile any code path
- Benchmarks run automatically
- Results visualized clearly

---

#### Issue #502: Geometry Instancing Optimization
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `performance`, `P1`, `rendering`

**Description**:  
Optimize rendering with geometry instancing.

**Tasks**:
- [ ] Identify instancing candidates
- [ ] Implement instanced mesh conversion
- [ ] Add LOD with instancing
- [ ] Build frustum culling for instances
- [ ] Create instance batching

**Acceptance Criteria**:
- 10x more objects at same FPS
- Quality maintained
- Memory reduced

---

#### Issue #503: Memory Management Audit
**Priority**: P1  
**Estimate**: 3 days  
**Labels**: `performance`, `P1`, `memory`

**Description**:  
Audit and optimize memory usage.

**Tasks**:
- [ ] Profile memory hotspots
- [ ] Implement geometry disposal
- [ ] Add texture cleanup
- [ ] Create memory budgets
- [ ] Build leak detection
- [ ] Optimize buffer allocations

**Acceptance Criteria**:
- No memory leaks
- Stable memory over time
- Large scenes feasible

---

#### Issue #504: Worker Thread Offloading
**Priority**: P2  
**Estimate**: 5 days  
**Labels**: `performance`, `P2`, `parallelism`

**Description**:  
Offload heavy computations to worker threads.

**Tasks**:
- [ ] Identify parallelizable tasks
- [ ] Create worker pool
- [ ] Implement task queuing
- [ ] Add progress reporting
- [ ] Build result aggregation
- [ ] Handle errors gracefully

**Acceptance Criteria**:
- UI remains responsive
- Throughput increased
- Error handling robust

---

### Sprint 5.2: Testing & Documentation (Week 19-20)

#### Issue #505: Unit Test Suite
**Priority**: P1  
**Estimate**: 5 days  
**Labels**: `testing`, `P1`, `quality`

**Description**:  
Create comprehensive unit test suite.

**Tasks**:
- [ ] Set up testing framework (Jest/Vitest)
- [ ] Write tests for core modules
- [ ] Add snapshot tests
- [ ] Create mock objects
- [ ] Implement CI integration
- [ ] Achieve >80% coverage

**Acceptance Criteria**:
- All critical paths tested
- Coverage targets met
- Tests run in CI

---

#### Issue #506: Integration Test Suite
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `testing`, `P1`, `e2e`

**Description**:  
Build end-to-end integration tests.

**Tasks**:
- [ ] Create test scene definitions
- [ ] Implement visual regression testing
- [ ] Add screenshot comparison
- [ ] Build tolerance thresholds
- [ ] Create test report generation
- [ ] Set up nightly runs

**Acceptance Criteria**:
- Full pipeline tested
- Regressions caught early
- Reports actionable

---

#### Issue #507: API Documentation
**Priority**: P1  
**Estimate**: 4 days  
**Labels**: `documentation`, `P1`, `api`

**Description**:  
Generate comprehensive API documentation.

**Tasks**:
- [ ] Set up TypeDoc
- [ ] Write JSDoc comments
- [ ] Create usage examples
- [ ] Build documentation site
- [ ] Add search functionality
- [ ] Create PDF export

**Acceptance Criteria**:
- All public APIs documented
- Examples working
- Search functional

---

#### Issue #508: Example Gallery
**Priority**: P2  
**Estimate**: 4 days  
**Labels**: `documentation`, `P2`, `examples`

**Description**:  
Create library of example scenes.

**Tasks**:
- [ ] Create basic terrain example
- [ ] Build indoor scene example
- [ ] Add creature animation demo
- [ ] Create dataset generation example
- [ ] Build interactive playground
- [ ] Document each example

**Acceptance Criteria**:
- Examples run out-of-box
- Well documented
- Showcase features

---

#### Issue #509: Migration Guide
**Priority**: P2  
**Estimate**: 3 days  
**Labels**: `documentation`, `P2`, `migration`

**Description**:  
Write guide for migrating from Blender Infinigen.

**Tasks**:
- [ ] Document API differences
- [ ] Create migration checklist
- [ ] Provide code translation examples
- [ ] List unsupported features
- [ ] Add troubleshooting section
- [ ] Create FAQ

**Acceptance Criteria**:
- Users can migrate successfully
- Common issues addressed
- Clear expectations set

---

## Summary Statistics

| Phase | Issues | Total Estimate | Priority Breakdown |
|-------|--------|----------------|-------------------|
| Phase 1 | 10 | 43 days | 6×P0, 4×P1 |
| Phase 2 | 12 | 45 days | 5×P0, 6×P1, 1×P2 |
| Phase 3 | 9 | 32 days | 0×P0, 7×P1, 2×P2 |
| Phase 4 | 8 | 33 days | 0×P0, 0×P1, 8×P2 |
| Phase 5 | 9 | 34 days | 0×P0, 6×P1, 3×P2 |
| **Total** | **48** | **187 days** | **11×P0, 23×P1, 14×P2** |

**Note**: Estimates assume 1 developer working full-time. With multiple developers, phases can be parallelized to reduce calendar time.

---

*Last Updated: April 2025*  
*Version: 1.0*
