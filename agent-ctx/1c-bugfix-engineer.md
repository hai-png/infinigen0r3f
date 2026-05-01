# Task 1c: Fix Lighting, Fog, Water, and Physics Bugs

## Agent: bugfix-engineer

## Work Log

- Fixed FogSystem.ts: CRITICAL - sampler3D in fragment shader but DataTexture (2D) was provided, causing shader compilation failure. Changed shader to use sampler2D with Y-slice blending to simulate 3D noise from 2D texture. Fixed createNoiseTexture() to allocate width*height (2D) data instead of width*height*depth (3D).
- Fixed LightingSystem.ts: Two bugs fixed. (a) PMREMGenerator(null as any) crashed at runtime. Made setupHDRI accept optional renderer parameter; if provided, creates PMREMGenerator from renderer and uses fromEquirectangular() for proper environment map generation; if not, uses texture directly. (b) Added texture.mapping = THREE.EquirectangularReflectionMapping after loading HDR texture so Three.js knows how to project the equirectangular map.
- Fixed WaterMaterial.ts: CRITICAL - update() regenerated 512x512 canvas texture every frame causing severe performance hit. Added dirty flag and time-based throttling (100ms interval via performance.now()). Added markDirty() method for explicit invalidation. Canvas texture now only regenerates when dirty or at throttled intervals.
- Fixed PhysicsWorld.ts: removeBody() read body?.colliderId after deleting body from map (always undefined). Fixed to read colliderId BEFORE deleting from the map, then use the saved value for collider cleanup.
- Fixed full-solver-loop.ts: evaluateProposal() used (evaluateNode as any).evaluateAll?.() which is optional chaining on a non-existent method, always returning 0. Replaced with actual energy evaluation using violCount() from the evaluator module: iterates over all constraints in the problem, sums violation counts, with fallback to domain containment checking when state is unavailable.
- Fixed CaveGenerator.ts: createInstancedMesh() used first decoration type's geometry (ConeGeometry for stalactites) for ALL decoration types (crystals should use OctahedronGeometry, rocks DodecahedronGeometry, puddles CircleGeometry). Changed return type from single InstancedMesh to THREE.Group containing separate InstancedMesh per decoration type, each with correct geometry and type-appropriate material properties (e.g., crystal has low roughness + metalness, puddle is transparent).
- Fixed ErosionEnhanced.ts: HydraulicErosion used Math.random() for droplet positions instead of SeededRandom, making erosion non-reproducible. Added seed field to ErosionConfig, imported SeededRandom from core/util/MathUtils, created rng instance in HydraulicErosion constructor, replaced all Math.random() calls with this.rng.next() for droplet position/direction generation.
- Fixed Collider.ts: Box AABB computation ignored rotation entirely (used max half-extent as conservative bound). Replaced with proper 8-corner rotation: transform all 8 corners of the box by the rotation matrix, then compute axis-aligned min/max from rotated corners. Also fixed cylinder AABB to account for rotation the same way.
- Fixed Joint.ts: Ball-socket velocity correction only applied to bodyA. Fixed to compute velocity correction based on relative velocity at both anchor points, then split the correction between bodyA and bodyB proportionally to their inverse mass ratio (invMassA/totalInvMass and invMassB/totalInvMass).
- Fixed domain.ts: Weak PRNG in sampleRange() using Math.abs(Math.sin(seed * 9301 + 49297)) % 1. Replaced with Mulberry32 seeded PRNG (same algorithm used by SeededRandom class in MathUtils.ts) for proper statistical distribution and full 32-bit entropy.
- Fixed BalconyGenerator.ts (pre-existing): Missing ConeGeometry import caused TypeScript error.

## Stage Summary

- 10 critical bugs fixed across lighting, fog, water, physics, constraints, terrain, and domain reasoning systems
- Shader compilation now works (sampler3D to sampler2D fix)
- HDRI environment mapping now works correctly (PMREMGenerator + EquirectangularReflectionMapping)
- Water rendering no longer drops frames (100ms throttle instead of per-frame regeneration)
- Physics body removal now properly cleans up colliders
- Constraint solver now actually evaluates energy (violCount instead of always-0 evaluateAll)
- Cave decorations now render with correct geometry per type
- Erosion is now deterministic and reproducible (SeededRandom)
- Box colliders now have rotation-aware AABBs
- Ball-socket joints now properly distribute velocity to both bodies
- Domain sampling now uses proper Mulberry32 PRNG
- Zero TypeScript compilation errors
