# Phase 4.1 & 4.2 — Camera System and Ground Truth

## Task ID: phase-4-camera-gt
## Agent: Main

## Summary

Implemented Phase 4.1 (Camera System) and Phase 4.2 (Ground Truth) for the infinigen-r3f project. All files compile and the build passes.

## Files Created

### Phase 4.1 — Camera System

1. **`src/core/placement/camera/CameraPoseProposer.ts`**
   - Generates candidate camera positions with configurable altitude/yaw/pitch/focal-length/f-stop ranges
   - Terrain collision avoidance via raycasting (camera stays above terrain)
   - Minimum distance from objects
   - Camera pose scoring: terrain coverage, visible object count, composition quality (rule of thirds), tag-based ratios
   - Selects best N views from many candidates

2. **`src/core/placement/camera/trajectories/TrajectoryImplementations.ts`**
   - All 7 trajectory types as functional classes:
     - **OrbitShot**: Orbits around target at constant radius
     - **PanTilt**: Pans horizontally while tilting vertically
     - **DollyShot**: Linear push-in/pull-out with dolly zoom support
     - **TrackingShot**: Follows a moving subject with look-ahead
     - **CraneShot**: Vertical rise/lower with arc option
     - **HandheldSim**: Brownian noise jitter (multi-octave sine)
     - **GoToProposals**: Visits pre-computed viewpoints with pause
   - Each generates keyframes → catmull-rom interpolation via TrajectoryGenerator
   - Collision avoidance during path (terrain sampler callback)
   - Factory function `createTrajectory()` by type name

3. **`src/core/placement/camera/CameraParameterExporter.ts`**
   - Exports camera intrinsics K (3×3) in OpenCV convention
   - Exports camera extrinsics T (4×4) in OpenCV convention (Y/Z flip from WebGL)
   - Per-frame: position, rotation, focal length, FOV, near/far
   - JSON export with full frame data
   - TUM format for SLAM evaluation
   - IMU format (with intrinsics per frame)
   - NPZ-compatible binary data (Float64Array for positions, rotations, intrinsics, timestamps)
   - Stereo pair computation from baseline config

4. **`src/core/placement/camera/DepthOfField.ts`**
   - Physical DOF model: sensor size, focal length, f-stop, focus distance, circle of confusion
   - `calculateDOF()` returns near/far/total/hyperfocal
   - Bokeh shape control: circular, hexagonal, octagonal, custom blade count
   - Bokeh kernel generation for post-processing
   - Bokeh rotation and chromatic aberration support
   - Auto-focus via raycasting from camera center
   - R3F post-processing integration: `createDOFShader()` returns a ShaderMaterial

### Phase 4.2 — Ground Truth

5. **`src/datagen/pipeline/GroundTruthRenderer.ts`**
   - MRT (Multiple Render Targets) ground truth rendering using WebGL2
   - Renders all GT channels in a single pass (6 render targets):
     - Depth (linear Z, Float32)
     - Normal (camera-space, RGB = XYZ → [0,1])
     - Flow (optical flow placeholder, RG = XY)
     - Object Segmentation (unique color per object, 16-bit encoding)
     - Instance Segmentation (unique color per instance)
     - Material Segmentation (unique color per material type)
   - MRT support detection with graceful fallback to multi-pass rendering
   - Fallback: renders each channel separately (depth, normal, per-object segmentation)
   - Uses `createCanvas()` from CanvasUtils for PNG export
   - `resultToPNGs()` static method: converts GT result to downloadable PNG data URLs
   - Each object gets a unique integer ID encoded as R + G×256

6. **`src/datagen/pipeline/AnnotationExporter.ts`**
   - COCO format: bounding boxes from segmentation masks, polygon segmentation, category labels
   - YOLO format: normalized bounding boxes, class IDs, dataset.yaml
   - Depth map: NPY binary format, jet-colormap PNG
   - Normal map: NPY binary, camera-space → RGB PNG
   - Optical flow: NPY binary, HSV colorized PNG
   - Camera parameters: JSON and TUM formats (via CameraParameterExporter)
   - `downloadAll()` static method for browser download

## Files Updated

7. **`src/core/placement/camera/index.ts`** — Added exports for all new camera system modules
8. **`src/datagen/pipeline/index.ts`** — Added exports for GroundTruthRenderer and AnnotationExporter
9. **`src/components/InfinigenScene.tsx`** — Added:
   - Camera trajectory playback (TrajectoryPlayer component, `L` key to toggle)
   - DOF toggle (`D` key)
   - Camera path visualization (`V` key)
   - "Capture GT" button (`X` key)
   - Trajectory type selector (orbit/dolly/crane/handheld/pantilt/tracking/goto)
   - New feature flags: `dof`, `cameraPath`

## Build Status
✅ `npm run build` passes successfully with no errors.
