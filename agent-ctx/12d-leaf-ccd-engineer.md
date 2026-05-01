# Task 12-d: Per-Leaf Geometry & CCD Integration

## Agent: leaf-ccd-engineer

## Summary
Implemented per-leaf geometry for trees and enabled CCD in the physics pipeline.

## Changes

### 1. LeafGeometry.ts (NEW FILE)
- **LeafGeometry** class with static `createLeaf(type, config)` method
- 9 leaf types: broad, narrow, needle, palm, oak, maple, birch, willow, fern
- Each leaf has position, normal, uv attributes with UV maps covering [0,1] range
- Subtle midrib bend (curvature) for realism
- **LeafCluster** class with `createCluster()` and `createMergedCluster()` methods
- Deterministic placement using SeededRandom
- Orientation bias: up, outward, random

### 2. TreeGenerator.ts (MODIFIED)
- Added `leafType: LeafType` and `leafCount: number` to TreeSpeciesConfig
- Added `usePerLeafGeometry` option to generateTree()
- All 5 species presets now map to leaf types:
  - oak → 'oak', pine → 'needle', birch → 'birch', palm → 'palm', willow → 'willow'
- New `createPerLeafFoliage()` method: distributes LeafCluster instances across crown volume
- Fallback to primitive shapes when leafType not specified

### 3. RigidBody.ts (MODIFIED)
- Added `ccdMotionThreshold` to RigidBodyConfig (default 1.0)
- Added `ccdMotionThreshold` public property on RigidBody class
- Body uses CCD when: `body.ccdEnabled === true AND body.linearVelocity.length() > body.ccdMotionThreshold`

### 4. CCD.ts (MODIFIED)
- Changed CCD eligibility check from `speed * dt > CCD_VELOCITY_THRESHOLD` to `speed > body.ccdMotionThreshold`
- Per-body threshold replaces global constant

### 5. PhysicsWorld.ts (MODIFIED)
- Reorganized fixedStep() pipeline:
  1. Integrate
  2. Update AABBs
  3. Broad phase
  4. **CCD** (after broad phase, before collision response)
  5. Re-update AABBs for CCD-adjusted bodies
  6. Narrow phase
  7. Resolve collisions
  8. Solve joints
- runCCD() now also updates AABBs for CCD-adjusted bodies

## Compilation
- TypeScript compilation passes with no new errors
