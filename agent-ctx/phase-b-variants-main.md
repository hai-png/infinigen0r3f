# Task: Phase B - StaircaseVariants & ClothSceneIntegrator

## Task ID: phase-b-variants

## Summary

Created two new self-contained modules for the infinigen-r3f project:

### 1. StaircaseVariants.ts (1135 lines)
**Path:** `src/assets/objects/architectural/StaircaseVariants.ts`

Implemented 5 specialized staircase types:

1. **LShapedStaircase** (`generateLShapedStaircase`)
   - Two flights connected by a quarter-turn landing
   - Configurable: firstFlightSteps, landingSize, useWinders, winderCount
   - Optional winder steps (curved) instead of flat landing at the turn
   - Full handrail system on both flights + landing perimeter

2. **UShapedStaircase** (`generateUShapedStaircase`)
   - Two parallel flights connected by a half-turn landing
   - Configurable: flightGap, landingWidth, centralColumn, switchback
   - Central support column option
   - Switchback variant with minimal gap

3. **SpiralStaircase** (`generateSpiralStaircase`)
   - Circular stairs around a central column
   - Configurable: radius, stepsPerRevolution, totalRevolutions, columnRadius
   - Tapered treads (wider outer, narrower inner)
   - Open center option with center well
   - Helical handrail on outer edge

4. **CurvedStaircase** (`generateCurvedStaircase`)
   - Stairs following an arc path (not full spiral)
   - Configurable: arcAngle, innerRadius, outerRadius
   - Tapered treads following the curve
   - Flared bottom steps option (wider at base)
   - Continuous handrails on inner and outer edges

5. **CantileverStaircase** (`generateCantileverStaircase`)
   - Steps projecting from a wall with no visible support
   - Thicker step at wall connection (hidden steel simulation)
   - Tension rod option: thin diagonal rod connecting step tips
   - Open riser with configurable gaps
   - Handrail only on open side

Each variant:
- Exports a generate function returning `{ group: THREE.Group; boundingBox: BoundingBoxHint }`
- Accepts a typed params interface with sensible defaults
- Uses `SeededRandom` for deterministic variation
- Generates proper normals, UVs, and vertex colors
- Provides collision geometry hints

### 2. ClothSceneIntegrator.ts (1175 lines)
**Path:** `src/sim/cloth/ClothSceneIntegrator.ts`

Implemented 5 subsystems:

1. **ClothStaticMeshCollision**
   - BVH-based ray casting from cloth particles toward scene geometry
   - Push particles out of intersecting geometry
   - Friction handling: cloth slides on surfaces with configurable friction
   - Multiple collision objects support
   - Self-collision via sparse spatial hash

2. **ClothWindInteraction**
   - Wind forces on cloth particles based on face normals
   - Gust simulation: time-varying wind strength via sinusoidal modulation
   - Turbulence: Perlin noise-based wind variation across cloth surface
   - Wind shadow: reduced wind behind obstacles via ray-casting

3. **ClothAttachmentSystem**
   - Pin constraints: attach cloth vertices to positions
   - Animated attachments: pins that move with parent objects
   - Partial pinning: pin subsets (collar, cuffs, waistband)
   - Soft/hard pin support with configurable stiffness

4. **ClothCreatureValidator**
   - Validates ClothCreatureBridge with mammals, quadrupeds, birds
   - Birds correctly flagged as not supporting cloth
   - Attachment point mismatch error reporting
   - Full validation suite across all creature types
   - Garment-specific validation (shirt, pants, cape, skirt)

5. **ClothRestConfiguration**
   - T-shirt topology: cylinder with arm holes
   - Pants topology: two leg cylinders joined at waist
   - Cape topology: rectangular sheet with shoulder attachments
   - Skirt topology: conical sheet with waistband
   - Each generates particles, UVs, pin groups, and constraints

## Verification
- TypeScript compilation: `npx tsc --noEmit` passes with zero errors
- No existing files were modified
- Both files follow project code style (TypeScript with explicit types)
