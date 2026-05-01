# Task 1b: Fix Creature and Vegetation Bugs

## Agent: full-stack-developer

## Work Log

### CRITICAL Bug Fixes

1. **creatures/index.ts** — Missing 4 generator exports
   - Added: FishGenerator, ReptileGenerator, InsectGenerator, UnderwaterGenerator
   - Added: All body part generators (Wing, Antenna, Leg, Tail, Eye, Mouth, Beak)

2. **MonocotGenerator.ts** — generateField() only instances the stem, losing all leaves
   - Root cause: `stemGroup.children[0]` only took the stem mesh
   - Fix: Now iterates all children, clones each geometry, bakes local transform via `applyMatrix4(mesh.matrix)`, then merges all geometries with `BufferGeometryUtils.mergeGeometries()`
   - Added `group.updateMatrixWorld(true)` in generateStem() to ensure transforms are computed

3. **FishGenerator.ts** — generateHead() returns body instead of head
   - Root cause: `generateHead()` was calling `this.generateBody()` 
   - Fix: Implemented proper head with tapered front section, eyes (sclera + pupil), and mouth

4. **BirdGenerator.ts** — `side: 2` literal instead of `THREE.DoubleSide`
   - Fixed wing material to use `side: THREE.DoubleSide`
   - Added `import * as THREE from 'three'`

5. **FishGenerator.ts** — `side: 2` literal instead of `THREE.DoubleSide`
   - Fixed all 3 fin materials (tail, dorsal, pectoral) to use `side: THREE.DoubleSide`

6. **TropicPlantGenerator.ts** — leafFenestration config never applied to geometry
   - Fix: When leafFenestration > 0, generates Monstera-style holes in the leaf shape
   - Uses `THREE.Shape.holes` with circular `THREE.Path` objects
   - Holes distributed along mid-to-upper leaf, alternating sides, with randomized sizes

7. **GrassGenerator.ts** — Wind params stored but never used in rendering
   - Fix: Replaced MeshStandardMaterial with custom ShaderMaterial
   - Vertex shader applies sine-wave displacement based on blade height and time uniform
   - Added `updateWind(deltaTime)` and `setWindEnabled()` methods for animation
   - Fragment shader includes diffuse lighting and height-based color variation

### Body Part Generator Upgrades (Stubs → Full Implementations)

8. **WingGenerator.ts** — 6 wing types: soaring (slotted primary feathers), flapping (covert rows), folded (drooped), hovering (short elliptical), membrane (bat-like finger bones + skin), butterfly (forewing + hindwing + veins)

9. **AntennaGenerator.ts** — 4 types: filiform (uniform), clubbed (widened tip), feathery (side branches), elbowed (sharp bend). Includes getSegmentPosition() returning Vector3

10. **LegGenerator.ts** — 4 types: insect (coxa/femur/tibia/tarsus), mammal (upper/joint/lower + foot variants: claw/hoof/webbed/pad), bird (thigh/tibiotarsus/toes/claws), reptile (splayed + claws)

11. **TailGenerator.ts** — 7 types: straight, curled (spiral), bushy (fur tufts), paddle (fluke), segmented (rings), prehensile (grasping spiral), scorpion (arch + stinger)

12. **EyeGenerator.ts** — Compound (faceted hemisphere for insects) and Camera (sclera/iris/pupil/cornea/highlight for vertebrates)

13. **MouthGenerator.ts** — 6 types: jaw (teeth/lips/tongue), beak (mandibles/cere/hook), mandible (pincers/maxillae), snout (nostrils), filter (baleen plates), tube (coiled proboscis)

## TypeScript Compilation
- Zero errors in all modified files
- Only pre-existing errors in unrelated example/skill files remain
