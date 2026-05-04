/**
 * StaircaseVariants - 5 specialized staircase type generators
 *
 * Ports the original Infinigen's 6 staircase types (the basic straight already
 * exists in StaircaseGenerator) into standalone generator functions that
 * produce THREE.Group / BufferGeometry with proper normals, UVs, and vertex
 * colors. Each variant uses SeededRandom for deterministic variation.
 *
 * Variants:
 *   1. LShapedStaircase  — Two flights with quarter-turn landing / winders
 *   2. UShapedStaircase  — Two parallel flights with half-turn landing
 *   3. SpiralStaircase   — Circular stairs around a central column
 *   4. CurvedStaircase   — Stairs following an arc path (partial spiral)
 *   5. CantileverStaircase — Wall-mounted free-floating steps
 *
 * @module assets/objects/architectural
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../core/util/math/index';

// ============================================================================
// Shared Types
// ============================================================================

/** Base parameters shared by all staircase variants. */
export interface StaircaseBaseParams {
  /** Total rise (vertical height) of the staircase (default: 3.0) */
  height: number;
  /** Step count (total number of treads) (default: 14) */
  numSteps: number;
  /** Flight width in world units (default: 1.2) */
  width: number;
  /** Tread thickness (default: 0.04) */
  treadThickness: number;
  /** Whether risers are present (default: true) */
  hasRisers: boolean;
  /** Riser thickness (default: 0.02) */
  riserThickness: number;
  /** Whether to add handrails on open sides (default: true) */
  hasHandrails: boolean;
  /** Handrail height above tread (default: 0.9) */
  handrailHeight: number;
  /** Tread material name for color lookup (default: 'wood') */
  treadMaterial: string;
  /** Riser material name (default: 'wood') */
  riserMaterial: string;
  /** Structural material name (default: 'steel') */
  structureMaterial: string;
  /** Optional seed override (default: 42) */
  seed: number;
}

/** Collision / bounding-box hint returned alongside geometry. */
export interface BoundingBoxHint {
  min: THREE.Vector3;
  max: THREE.Vector3;
  collisionGeometry: THREE.BufferGeometry;
}

// ============================================================================
// L-Shaped Staircase
// ============================================================================

export interface LShapedParams extends StaircaseBaseParams {
  /** Number of steps in the first (lower) flight (default: 7) */
  firstFlightSteps: number;
  /** Landing size (square side length) (default: same as width) */
  landingSize: number;
  /** Use winder steps instead of a flat landing (default: false) */
  useWinders: boolean;
  /** Number of winder steps when useWinders is true (default: 3) */
  winderCount: number;
}

const DEFAULT_L_SHAPED: LShapedParams = {
  height: 3.0,
  numSteps: 14,
  width: 1.2,
  treadThickness: 0.04,
  hasRisers: true,
  riserThickness: 0.02,
  hasHandrails: true,
  handrailHeight: 0.9,
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  structureMaterial: 'steel',
  seed: 42,
  firstFlightSteps: 7,
  landingSize: 1.2,
  useWinders: false,
  winderCount: 3,
};

export function generateLShapedStaircase(
  params: Partial<LShapedParams> = {},
): { group: THREE.Group; boundingBox: BoundingBoxHint } {
  const p: LShapedParams = { ...DEFAULT_L_SHAPED, ...params };
  const rng = new SeededRandom(p.seed);
  const group = new THREE.Group();

  const firstSteps = p.firstFlightSteps;
  const secondSteps = p.numSteps - firstSteps;
  const rise = p.height / p.numSteps;
  const run = 0.28; // standard run per step
  const landingSize = p.landingSize;

  const treadMat = makeMaterial(p.treadMaterial);
  const riserMat = makeMaterial(p.riserMaterial);
  const structMat = makeMaterial(p.structureMaterial);

  // --- First flight (along +X) ---
  for (let i = 0; i < firstSteps; i++) {
    const y = i * rise;
    const x = i * run;
    addTread(group, x + run / 2, y + p.treadThickness / 2, 0, run, p.treadThickness, p.width, treadMat, `tread_f1_${i}`);
    if (p.hasRisers && i < firstSteps - 1) {
      addRiser(group, x + run, y + p.treadThickness, 0, p.riserThickness, rise, p.width, riserMat, `riser_f1_${i}`);
    }
  }

  // --- Landing or winders ---
  const landingY = firstSteps * rise;
  const landingX = firstSteps * run;

  if (p.useWinders) {
    // Winder steps: tapered treads that turn the corner
    const winderRise = rise;
    for (let w = 0; w < p.winderCount; w++) {
      const t = (w + 1) / (p.winderCount + 1); // 0..1 progress around the turn
      const angle = t * (Math.PI / 2); // quarter turn
      const spread = rng.nextFloat(0.9, 1.1);

      // Position shifts from +X direction to +Z direction
      const cx = landingX + Math.cos(angle) * landingSize * 0.5 * spread;
      const cz = -Math.sin(angle) * landingSize * 0.5 * spread;
      const cy = landingY + w * winderRise + p.treadThickness / 2;

      // Winder tread is wider at the outer edge, narrower at inner
      const innerWidth = p.width * 0.4;
      const outerWidth = p.width * 1.1;
      const winderShape = createWinderShape(innerWidth, outerWidth, run * 1.2, angle);
      const winderGeom = new THREE.ExtrudeGeometry(winderShape, { depth: p.treadThickness, bevelEnabled: false });
      const winder = new THREE.Mesh(winderGeom, treadMat);
      winder.position.set(cx, cy, cz);
      winder.rotation.x = -Math.PI / 2;
      winder.rotation.z = angle;
      winder.castShadow = true;
      winder.name = `winder_${w}`;
      group.add(winder);
    }
  } else {
    // Flat square landing
    const landingGeom = new THREE.BoxGeometry(landingSize, p.treadThickness, landingSize);
    const landing = new THREE.Mesh(landingGeom, treadMat);
    landing.position.set(landingX + landingSize / 2, landingY + p.treadThickness / 2, landingSize / 2 - p.width / 2);
    landing.castShadow = true;
    landing.name = 'landing';
    group.add(landing);
  }

  // --- Second flight (along +Z, going up) ---
  const secondStartY = landingY + (p.useWinders ? p.winderCount * rise : rise);
  const secondStartZ = landingSize / 2 - p.width / 2;
  for (let i = 0; i < secondSteps; i++) {
    const y = secondStartY + i * rise;
    const z = secondStartZ + i * run;
    addTread(group, landingX + landingSize / 2, y + p.treadThickness / 2, z, p.width, p.treadThickness, run, treadMat, `tread_f2_${i}`);
    if (p.hasRisers && i < secondSteps - 1) {
      addRiser(group, landingX + landingSize / 2, y + p.treadThickness, z + run / 2, p.width, rise, p.riserThickness, riserMat, `riser_f2_${i}`);
    }
  }

  // --- Handrails ---
  if (p.hasHandrails) {
    addLShapedHandrails(group, firstSteps, secondSteps, rise, run, p.width, landingSize, landingY, p.handrailHeight, landingX, structMat, p.useWinders, p.winderCount);
  }

  // --- Bounding box hint ---
  const bbox = new THREE.Box3().setFromObject(group);
  const collisionGeom = new THREE.BoxGeometry(
    bbox.max.x - bbox.min.x,
    bbox.max.y - bbox.min.y,
    bbox.max.z - bbox.min.z,
  );
  return {
    group,
    boundingBox: {
      min: bbox.min.clone(),
      max: bbox.max.clone(),
      collisionGeometry: collisionGeom,
    },
  };
}

// ============================================================================
// U-Shaped Staircase
// ============================================================================

export interface UShapedParams extends StaircaseBaseParams {
  /** Gap between the two parallel flights (default: 0.1) */
  flightGap: number;
  /** Landing width (spanning across both flights) (default: width * 2 + gap) */
  landingWidth: number;
  /** Add a central support column between flights (default: false) */
  centralColumn: boolean;
  /** Switchback variant: minimal gap, adjacent flights (default: false) */
  switchback: boolean;
}

const DEFAULT_U_SHAPED: UShapedParams = {
  height: 3.0,
  numSteps: 14,
  width: 1.2,
  treadThickness: 0.04,
  hasRisers: true,
  riserThickness: 0.02,
  hasHandrails: true,
  handrailHeight: 0.9,
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  structureMaterial: 'steel',
  seed: 42,
  flightGap: 0.1,
  landingWidth: 2.5,
  centralColumn: false,
  switchback: false,
};

export function generateUShapedStaircase(
  params: Partial<UShapedParams> = {},
): { group: THREE.Group; boundingBox: BoundingBoxHint } {
  const p: UShapedParams = { ...DEFAULT_U_SHAPED, ...params };
  const rng = new SeededRandom(p.seed);
  const group = new THREE.Group();

  const firstSteps = Math.floor(p.numSteps / 2);
  const secondSteps = p.numSteps - firstSteps;
  const rise = p.height / p.numSteps;
  const run = 0.28;
  const gap = p.switchback ? 0.02 : p.flightGap;
  const totalWidth = p.width * 2 + gap;
  const landingWidth = p.landingWidth > 0 ? p.landingWidth : totalWidth;

  const treadMat = makeMaterial(p.treadMaterial);
  const riserMat = makeMaterial(p.riserMaterial);
  const structMat = makeMaterial(p.structureMaterial);

  // First flight along +X at z = -p.width/2
  for (let i = 0; i < firstSteps; i++) {
    const y = i * rise;
    const x = i * run;
    addTread(group, x + run / 2, y + p.treadThickness / 2, -p.width / 2, run, p.treadThickness, p.width, treadMat, `tread_f1_${i}`);
    if (p.hasRisers && i < firstSteps - 1) {
      addRiser(group, x + run, y + p.treadThickness, -p.width / 2, p.riserThickness, rise, p.width, riserMat, `riser_f1_${i}`);
    }
  }

  // Landing
  const landingY = firstSteps * rise;
  const landingX = firstSteps * run;
  const landingGeom = new THREE.BoxGeometry(landingWidth, p.treadThickness, totalWidth);
  const landing = new THREE.Mesh(landingGeom, treadMat);
  landing.position.set(landingX + landingWidth / 2, landingY + p.treadThickness / 2, 0);
  landing.castShadow = true;
  landing.name = 'landing';
  group.add(landing);

  // Second flight along -X at z = +p.width/2
  for (let i = 0; i < secondSteps; i++) {
    const y = landingY + (i + 1) * rise;
    const x = landingX + landingWidth - i * run;
    addTread(group, x - run / 2, y + p.treadThickness / 2, p.width / 2, run, p.treadThickness, p.width, treadMat, `tread_f2_${i}`);
    if (p.hasRisers && i < secondSteps - 1) {
      addRiser(group, x - run, y + p.treadThickness, p.width / 2, p.riserThickness, rise, p.width, riserMat, `riser_f2_${i}`);
    }
  }

  // Central support column
  if (p.centralColumn) {
    const colHeight = p.height + 0.3;
    const colRadius = 0.04;
    const colGeom = new THREE.CylinderGeometry(colRadius, colRadius, colHeight, 12);
    const col = new THREE.Mesh(colGeom, structMat);
    col.position.set(landingX + landingWidth / 2, colHeight / 2, 0);
    col.castShadow = true;
    col.name = 'central_column';
    group.add(col);
  }

  // Stringers for both flights
  for (const flight of [1, 2] as const) {
    const steps = flight === 1 ? firstSteps : secondSteps;
    const flightRise = steps * rise;
    const flightRun = steps * run;
    const angle = Math.atan2(flightRise, flightRun);
    const stringerLen = Math.sqrt(flightRise ** 2 + flightRun ** 2);
    const zOffset = flight === 1 ? -p.width / 2 : p.width / 2;

    for (const side of [-1, 1]) {
      const stringerGeom = new THREE.BoxGeometry(flightRun, 0.03, 0.03);
      const stringer = new THREE.Mesh(stringerGeom, structMat);
      const xPos = flight === 1 ? flightRun / 2 : landingX + landingWidth - flightRun / 2;
      const yPos = (flight === 1 ? 0 : landingY + rise) + flightRise / 2;
      stringer.position.set(xPos, yPos, zOffset + side * (p.width / 2 + 0.02));
      stringer.rotation.z = flight === 1 ? -angle : angle;
      stringer.name = `stringer_f${flight}_${side > 0 ? 'R' : 'L'}`;
      group.add(stringer);
    }
  }

  // Handrails
  if (p.hasHandrails) {
    addUShapedHandrails(group, firstSteps, secondSteps, rise, run, p.width, gap, landingWidth, landingX, landingY, p.handrailHeight, structMat);
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const collisionGeom = new THREE.BoxGeometry(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  return { group, boundingBox: { min: bbox.min.clone(), max: bbox.max.clone(), collisionGeometry: collisionGeom } };
}

// ============================================================================
// Spiral Staircase
// ============================================================================

export interface SpiralParams extends StaircaseBaseParams {
  /** Outer radius of the staircase (default: 1.2) */
  radius: number;
  /** Steps per full 360° revolution (default: 12) */
  stepsPerRevolution: number;
  /** Total number of revolutions (default: 0.75) */
  totalRevolutions: number;
  /** Central column radius (default: 0.06) */
  columnRadius: number;
  /** Open center: no column, just a well (default: false) */
  openCenter: boolean;
  /** Center well radius when openCenter is true (default: 0.15) */
  centerWellRadius: number;
}

const DEFAULT_SPIRAL: SpiralParams = {
  height: 3.0,
  numSteps: 12,
  width: 1.2,
  treadThickness: 0.04,
  hasRisers: false,
  riserThickness: 0.02,
  hasHandrails: true,
  handrailHeight: 0.9,
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  structureMaterial: 'steel',
  seed: 42,
  radius: 1.2,
  stepsPerRevolution: 12,
  totalRevolutions: 0.75,
  columnRadius: 0.06,
  openCenter: false,
  centerWellRadius: 0.15,
};

export function generateSpiralStaircase(
  params: Partial<SpiralParams> = {},
): { group: THREE.Group; boundingBox: BoundingBoxHint } {
  const p: SpiralParams = { ...DEFAULT_SPIRAL, ...params };
  const rng = new SeededRandom(p.seed);
  const group = new THREE.Group();

  const rise = p.height / p.numSteps;
  const totalAngle = p.totalRevolutions * Math.PI * 2;
  const angleStep = totalAngle / p.numSteps;
  const innerR = p.openCenter ? p.centerWellRadius : p.columnRadius;
  const outerR = p.radius;
  const treadOverlap = 0.85; // fraction of angle step for tread arc

  const treadMat = makeMaterial(p.treadMaterial);
  const structMat = makeMaterial(p.structureMaterial);

  // Central column
  if (!p.openCenter) {
    const colGeom = new THREE.CylinderGeometry(p.columnRadius, p.columnRadius, p.height + 0.3, 16);
    const col = new THREE.Mesh(colGeom, structMat);
    col.position.set(0, (p.height + 0.3) / 2, 0);
    col.castShadow = true;
    col.name = 'central_column';
    group.add(col);
  }

  // Treads: tapered wedge shapes
  for (let i = 0; i < p.numSteps; i++) {
    const a0 = i * angleStep;
    const a1 = a0 + angleStep * treadOverlap;
    const y = i * rise;

    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    shape.lineTo(Math.cos(a0) * outerR, Math.sin(a0) * outerR);
    shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth: p.treadThickness, bevelEnabled: false });
    const tread = new THREE.Mesh(geom, treadMat);
    tread.position.set(0, y, 0);
    tread.rotation.x = -Math.PI / 2;
    tread.castShadow = true;
    tread.receiveShadow = true;
    tread.name = `tread_${i}`;
    group.add(tread);

    // Slight random rotation offset for organic feel
    const jitter = rng.nextFloat(-0.005, 0.005);
    tread.rotation.z += jitter;
  }

  // Outer handrail: helical rail following the stair curve
  if (p.hasHandrails) {
    addSpiralHandrails(group, p.numSteps, rise, angleStep, outerR, p.handrailHeight, structMat);
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const collisionGeom = new THREE.CylinderGeometry(outerR, outerR, p.height, 16);
  return { group, boundingBox: { min: bbox.min.clone(), max: bbox.max.clone(), collisionGeometry: collisionGeom } };
}

// ============================================================================
// Curved Staircase
// ============================================================================

export interface CurvedParams extends StaircaseBaseParams {
  /** Arc angle in radians (default: PI/2 = 90°) */
  arcAngle: number;
  /** Inner radius of the arc (default: 1.5) */
  innerRadius: number;
  /** Outer radius of the arc (default: 2.7) */
  outerRadius: number;
  /** Flare the bottom steps wider (default: false) */
  flareBottom: boolean;
  /** Flare extra width at base when flareBottom is true (default: 0.3) */
  flareExtraWidth: number;
  /** Number of flared steps at the bottom (default: 3) */
  flareStepCount: number;
}

const DEFAULT_CURVED: CurvedParams = {
  height: 3.0,
  numSteps: 10,
  width: 1.2,
  treadThickness: 0.04,
  hasRisers: true,
  riserThickness: 0.02,
  hasHandrails: true,
  handrailHeight: 0.9,
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  structureMaterial: 'steel',
  seed: 42,
  arcAngle: Math.PI / 2,
  innerRadius: 1.5,
  outerRadius: 2.7,
  flareBottom: false,
  flareExtraWidth: 0.3,
  flareStepCount: 3,
};

export function generateCurvedStaircase(
  params: Partial<CurvedParams> = {},
): { group: THREE.Group; boundingBox: BoundingBoxHint } {
  const p: CurvedParams = { ...DEFAULT_CURVED, ...params };
  const rng = new SeededRandom(p.seed);
  const group = new THREE.Group();

  const rise = p.height / p.numSteps;
  const angleStep = p.arcAngle / p.numSteps;
  const innerR = p.innerRadius;
  const outerR = p.outerRadius;

  const treadMat = makeMaterial(p.treadMaterial);
  const riserMat = makeMaterial(p.riserMaterial);
  const structMat = makeMaterial(p.structureMaterial);

  for (let i = 0; i < p.numSteps; i++) {
    const a0 = i * angleStep;
    const a1 = a0 + angleStep;
    const y = i * rise;

    // Optional flaring at the base steps
    let currentOuterR = outerR;
    let currentInnerR = innerR;
    if (p.flareBottom && i < p.flareStepCount) {
      const flareT = 1 - i / p.flareStepCount; // 1 at bottom, 0 at flareStepCount
      currentOuterR += p.flareExtraWidth * flareT;
      currentInnerR -= p.flareExtraWidth * 0.3 * flareT;
    }

    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a0) * currentInnerR, Math.sin(a0) * currentInnerR);
    shape.lineTo(Math.cos(a0) * currentOuterR, Math.sin(a0) * currentOuterR);
    shape.lineTo(Math.cos(a1) * currentOuterR, Math.sin(a1) * currentOuterR);
    shape.lineTo(Math.cos(a1) * currentInnerR, Math.sin(a1) * currentInnerR);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth: p.treadThickness, bevelEnabled: false });
    const tread = new THREE.Mesh(geom, treadMat);
    tread.position.set(0, y, 0);
    tread.rotation.x = -Math.PI / 2;
    tread.castShadow = true;
    tread.receiveShadow = true;
    tread.name = `tread_${i}`;
    group.add(tread);

    // Riser: thin curved panel between treads (approximated as a flat quad)
    if (p.hasRisers && i < p.numSteps - 1) {
      const midR = (currentInnerR + currentOuterR) / 2;
      const midAngle = (a0 + a1) / 2;
      const riserWidth = currentOuterR - currentInnerR;
      const riserGeom = new THREE.BoxGeometry(riserWidth, rise, p.riserThickness);
      const riser = new THREE.Mesh(riserGeom, riserMat);
      riser.position.set(
        Math.cos(midAngle) * midR,
        y + p.treadThickness + rise / 2,
        Math.sin(midAngle) * midR,
      );
      riser.rotation.y = -midAngle + Math.PI / 2;
      riser.name = `riser_${i}`;
      group.add(riser);
    }

    // Slight random variation
    const jitter = rng.nextFloat(-0.003, 0.003);
    tread.rotation.z += jitter;
  }

  // Smooth continuous handrails on inner and outer edges
  if (p.hasHandrails) {
    addCurvedHandrails(group, p.numSteps, rise, angleStep, innerR, outerR, p.handrailHeight, structMat, p.flareBottom, p.flareStepCount, p.flareExtraWidth);
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const collisionGeom = new THREE.CylinderGeometry(outerR, outerR, p.height, 16, 1, false, 0, p.arcAngle);
  return { group, boundingBox: { min: bbox.min.clone(), max: bbox.max.clone(), collisionGeometry: collisionGeom } };
}

// ============================================================================
// Cantilever Staircase
// ============================================================================

export interface CantileverParams extends StaircaseBaseParams {
  /** Step run depth (default: 0.28) */
  runDepth: number;
  /** How far the step projects from the wall (default: same as width) */
  projectionDepth: number;
  /** Offset distance from the wall surface (default: 0) */
  wallOffset: number;
  /** Thicken step at wall connection to simulate hidden steel (default: 0.02) */
  wallConnectionThickness: number;
  /** Add a thin diagonal tension rod connecting step tips (default: false) */
  tensionRod: boolean;
  /** Tension rod diameter (default: 0.008) */
  tensionRodDiameter: number;
  /** Open riser: gaps between steps (default: true) */
  openRiser: boolean;
  /** Riser gap size when openRiser is true (default: 0.02) */
  riserGap: number;
}

const DEFAULT_CANTILEVER: CantileverParams = {
  height: 3.0,
  numSteps: 14,
  width: 1.2,
  treadThickness: 0.04,
  hasRisers: false,
  riserThickness: 0.02,
  hasHandrails: true,
  handrailHeight: 0.9,
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  structureMaterial: 'steel',
  seed: 42,
  runDepth: 0.28,
  projectionDepth: 1.2,
  wallOffset: 0,
  wallConnectionThickness: 0.02,
  tensionRod: false,
  tensionRodDiameter: 0.008,
  openRiser: true,
  riserGap: 0.02,
};

export function generateCantileverStaircase(
  params: Partial<CantileverParams> = {},
): { group: THREE.Group; boundingBox: BoundingBoxHint } {
  const p: CantileverParams = { ...DEFAULT_CANTILEVER, ...params };
  const rng = new SeededRandom(p.seed);
  const group = new THREE.Group();

  const rise = p.height / p.numSteps;
  const run = p.runDepth;
  const wallZ = -p.projectionDepth / 2 + p.wallOffset;

  const treadMat = makeMaterial(p.treadMaterial);
  const structMat = makeMaterial(p.structureMaterial);

  const treadTips: THREE.Vector3[] = []; // For tension rod

  for (let i = 0; i < p.numSteps; i++) {
    const y = i * rise;
    const x = i * run;

    // Tread with thicker wall-connection end
    const wallEndThick = p.treadThickness + p.wallConnectionThickness;
    const freeEndThick = p.treadThickness;

    // Create a custom geometry: wedge that's thicker at the wall side
    const treadGeom = createCantileverTreadGeometry(run, wallEndThick, freeEndThick, p.projectionDepth);
    applyVertexColors(treadGeom, getMaterialColor(p.treadMaterial));
    const tread = new THREE.Mesh(treadGeom, treadMat);
    tread.position.set(x + run / 2, y + wallEndThick / 2, wallZ + p.projectionDepth / 2);
    tread.castShadow = true;
    tread.receiveShadow = true;
    tread.name = `cantilever_tread_${i}`;
    group.add(tread);

    // Hidden steel bracket embedded in wall
    const bracketGeom = new THREE.BoxGeometry(run * 0.5, wallEndThick * 1.2, 0.03);
    const bracket = new THREE.Mesh(bracketGeom, structMat);
    bracket.position.set(x + run / 2, y, wallZ - 0.015);
    bracket.name = `bracket_${i}`;
    group.add(bracket);

    // Track free-end tip position for tension rod
    treadTips.push(new THREE.Vector3(
      x + run / 2,
      y + freeEndThick / 2,
      wallZ + p.projectionDepth,
    ));

    // Closed riser between steps (if not open riser)
    if (!p.openRiser && i < p.numSteps - 1) {
      const riserGeom = new THREE.BoxGeometry(p.riserThickness, rise - p.riserGap, p.projectionDepth * 0.3);
      const riserMat = makeMaterial(p.riserMaterial);
      const riser = new THREE.Mesh(riserGeom, riserMat);
      riser.position.set(x + run, y + p.treadThickness + (rise - p.riserGap) / 2, wallZ + p.projectionDepth * 0.15);
      riser.name = `riser_${i}`;
      group.add(riser);
    }
  }

  // Wall backing panel
  const wallHeight = p.height + 0.5;
  const wallWidth = p.numSteps * run + 0.5;
  const wallGeom = new THREE.BoxGeometry(wallWidth, wallHeight, 0.05);
  const wallMat = makeMaterial('concrete');
  const wallPanel = new THREE.Mesh(wallGeom, wallMat);
  wallPanel.position.set(p.numSteps * run / 2 - run / 2, wallHeight / 2 - 0.25, wallZ - 0.05);
  wallPanel.receiveShadow = true;
  wallPanel.name = 'wall_panel';
  group.add(wallPanel);

  // Tension rod: thin diagonal rod connecting step tips
  if (p.tensionRod && treadTips.length >= 2) {
    for (let i = 0; i < treadTips.length - 1; i++) {
      const start = treadTips[i];
      const end = treadTips[i + 1];
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      const rodGeom = new THREE.CylinderGeometry(p.tensionRodDiameter, p.tensionRodDiameter, len, 6);
      const rod = new THREE.Mesh(rodGeom, structMat);
      rod.position.copy(start.clone().add(end).multiplyScalar(0.5));
      // Orient cylinder from start to end
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      rod.quaternion.copy(quat);
      rod.name = `tension_rod_${i}`;
      group.add(rod);
    }
  }

  // Handrail on the open (free) side only
  if (p.hasHandrails) {
    addCantileverHandrails(group, p.numSteps, rise, run, p.projectionDepth, wallZ, p.height, p.handrailHeight, structMat);
  }

  const bbox = new THREE.Box3().setFromObject(group);
  const collisionGeom = new THREE.BoxGeometry(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  return { group, boundingBox: { min: bbox.min.clone(), max: bbox.max.clone(), collisionGeometry: collisionGeom } };
}

// ============================================================================
// Internal Helpers — Geometry Construction
// ============================================================================

/** Add a rectangular tread (BoxGeometry) to the group. */
function addTread(
  group: THREE.Group, x: number, y: number, z: number,
  sizeX: number, sizeY: number, sizeZ: number,
  material: THREE.MeshStandardMaterial, name: string,
): void {
  const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
  applyVertexColors(geom, getMaterialColor(material));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  group.add(mesh);
}

/** Add a rectangular riser to the group. */
function addRiser(
  group: THREE.Group, x: number, y: number, z: number,
  sizeX: number, sizeY: number, sizeZ: number,
  material: THREE.MeshStandardMaterial, name: string,
): void {
  const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
  applyVertexColors(geom, getMaterialColor(material));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.name = name;
  group.add(mesh);
}

/** Create a tapered winder tread shape for L-shaped stairs. */
function createWinderShape(
  innerWidth: number, outerWidth: number, depth: number, angle: number,
): THREE.Shape {
  const shape = new THREE.Shape();
  const halfInner = innerWidth / 2;
  const halfOuter = outerWidth / 2;
  shape.moveTo(-halfInner, 0);
  shape.lineTo(-halfOuter, depth);
  shape.lineTo(halfOuter, depth);
  shape.lineTo(halfInner, 0);
  shape.closePath();
  return shape;
}

/** Create a custom tread geometry that's thicker at the wall end (cantilever). */
function createCantileverTreadGeometry(
  run: number, wallThick: number, freeThick: number, depth: number,
): THREE.BufferGeometry {
  // 8 vertices: 4 at wall end (thicker), 4 at free end (thinner)
  const hw = run / 2;
  const hd = depth / 2;
  const wt = wallThick / 2;
  const ft = freeThick / 2;

  const positions = new Float32Array([
    // Wall-side face (z = -hd)
    -hw, -wt, -hd,   hw, -wt, -hd,   hw, wt, -hd,   -hw, wt, -hd,
    // Free-side face (z = +hd)
    -hw, -ft, hd,    hw, -ft, hd,    hw, ft, hd,     -hw, ft, hd,
  ]);

  const normals = new Float32Array([
    // Approximate normals — will be recomputed
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
  ]);

  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 1,
  ]);

  const indices = [
    // Front face (wall side)
    0, 1, 2,  0, 2, 3,
    // Back face (free side)
    4, 6, 5,  4, 7, 6,
    // Top face
    3, 2, 6,  3, 6, 7,
    // Bottom face
    0, 5, 1,  0, 4, 5,
    // Left face
    0, 3, 7,  0, 7, 4,
    // Right face
    1, 5, 6,  1, 6, 2,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ============================================================================
// Internal Helpers — Handrails
// ============================================================================

function addLShapedHandrails(
  group: THREE.Group,
  firstSteps: number, secondSteps: number,
  rise: number, run: number, width: number,
  landingSize: number, landingY: number, handrailHeight: number,
  landingX: number, material: THREE.MeshStandardMaterial,
  useWinders: boolean, winderCount: number,
): void {
  // First flight: both sides
  for (const zSide of [-1, 1]) {
    for (let i = 0; i <= firstSteps; i++) {
      const y = i * rise + handrailHeight / 2;
      const x = i * run;
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(x, y, zSide * width / 2);
      group.add(bal);
    }
    // Top rail
    const fLen = Math.sqrt((firstSteps * run) ** 2 + (firstSteps * rise) ** 2);
    const fAngle = Math.atan2(firstSteps * rise, firstSteps * run);
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, fLen, 8);
    const rail = new THREE.Mesh(railGeo, material);
    rail.position.set(firstSteps * run / 2, firstSteps * rise / 2 + handrailHeight, zSide * width / 2);
    rail.rotation.z = Math.PI / 2 - fAngle;
    group.add(rail);
  }

  // Landing railing (perimeter)
  if (!useWinders) {
    for (let s = 0; s <= 4; s++) {
      const t = s / 4;
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(landingX + landingSize / 2, landingY + handrailHeight / 2, t * landingSize - width / 2);
      group.add(bal);
    }
    const lrGeo = new THREE.CylinderGeometry(0.025, 0.025, landingSize, 8);
    const lr = new THREE.Mesh(lrGeo, material);
    lr.position.set(landingX + landingSize / 2, landingY + handrailHeight, 0);
    lr.rotation.x = Math.PI / 2;
    group.add(lr);
  }

  // Second flight: both sides
  const secondStartY = landingY + (useWinders ? winderCount * rise : rise);
  for (const xSide of [-1, 1]) {
    for (let i = 0; i <= secondSteps; i++) {
      const y = secondStartY + i * rise + handrailHeight / 2;
      const z = landingSize / 2 - width / 2 + i * run;
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(landingX + landingSize / 2 + xSide * width / 2, y, z);
      group.add(bal);
    }
    const sLen = Math.sqrt((secondSteps * run) ** 2 + (secondSteps * rise) ** 2);
    const sAngle = Math.atan2(secondSteps * rise, secondSteps * run);
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, sLen, 8);
    const rail = new THREE.Mesh(railGeo, material);
    rail.position.set(
      landingX + landingSize / 2 + xSide * width / 2,
      secondStartY + secondSteps * rise / 2 + handrailHeight,
      landingSize / 2 - width / 2 + secondSteps * run / 2,
    );
    rail.rotation.x = -(Math.PI / 2 - sAngle);
    group.add(rail);
  }
}

function addUShapedHandrails(
  group: THREE.Group,
  firstSteps: number, secondSteps: number,
  rise: number, run: number, width: number, gap: number,
  landingWidth: number, landingX: number, landingY: number,
  handrailHeight: number, material: THREE.MeshStandardMaterial,
): void {
  // First flight handrails
  for (const zSide of [-1, 1]) {
    for (let i = 0; i <= firstSteps; i++) {
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(i * run, i * rise + handrailHeight / 2, -width / 2 + zSide * width / 2);
      group.add(bal);
    }
    const fLen = Math.sqrt((firstSteps * run) ** 2 + (firstSteps * rise) ** 2);
    const fAngle = Math.atan2(firstSteps * rise, firstSteps * run);
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, fLen, 8);
    const rail = new THREE.Mesh(railGeo, material);
    rail.position.set(firstSteps * run / 2, firstSteps * rise / 2 + handrailHeight, -width / 2 + zSide * width / 2);
    rail.rotation.z = Math.PI / 2 - fAngle;
    group.add(rail);
  }

  // Landing handrails (perimeter)
  for (const zEdge of [-1, 1]) {
    const edgeZ = zEdge * (width + gap / 2) / 2 + zEdge * width / 2;
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(landingX + t * landingWidth, landingY + handrailHeight / 2, zEdge * width / 2);
      group.add(bal);
    }
    const lrGeo = new THREE.CylinderGeometry(0.025, 0.025, landingWidth, 8);
    const lr = new THREE.Mesh(lrGeo, material);
    lr.position.set(landingX + landingWidth / 2, landingY + handrailHeight, zEdge * width / 2);
    lr.rotation.z = Math.PI / 2;
    group.add(lr);
  }

  // Second flight handrails
  for (const zSide of [-1, 1]) {
    for (let i = 0; i <= secondSteps; i++) {
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(
        landingX + landingWidth - i * run,
        landingY + (i + 1) * rise + handrailHeight / 2,
        width / 2 + zSide * width / 2,
      );
      group.add(bal);
    }
    const sLen = Math.sqrt((secondSteps * run) ** 2 + (secondSteps * rise) ** 2);
    const sAngle = Math.atan2(secondSteps * rise, secondSteps * run);
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, sLen, 8);
    const rail = new THREE.Mesh(railGeo, material);
    rail.position.set(
      landingX + landingWidth - secondSteps * run / 2,
      landingY + secondSteps * rise / 2 + rise + handrailHeight,
      width / 2 + zSide * width / 2,
    );
    rail.rotation.z = -(Math.PI / 2 - sAngle);
    group.add(rail);
  }
}

function addSpiralHandrails(
  group: THREE.Group,
  numSteps: number, rise: number, angleStep: number,
  outerR: number, handrailHeight: number,
  material: THREE.MeshStandardMaterial,
): void {
  const railR = outerR + 0.05;

  // Outer balusters at each step
  for (let i = 0; i <= numSteps; i++) {
    const angle = i * angleStep;
    const y = i * rise + handrailHeight / 2;
    const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
    const bal = new THREE.Mesh(balGeo, material);
    bal.position.set(Math.cos(angle) * railR, y, Math.sin(angle) * railR);
    group.add(bal);
  }

  // Helical top rail (segmented)
  for (let i = 0; i < numSteps; i++) {
    const a0 = i * angleStep;
    const a1 = (i + 1) * angleStep;
    const y0 = i * rise + handrailHeight;
    const y1 = (i + 1) * rise + handrailHeight;

    const startX = Math.cos(a0) * railR;
    const startZ = Math.sin(a0) * railR;
    const endX = Math.cos(a1) * railR;
    const endZ = Math.sin(a1) * railR;

    const dx = endX - startX;
    const dy = y1 - y0;
    const dz = endZ - startZ;
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const railGeo = new THREE.CylinderGeometry(0.02, 0.02, segLen, 8);
    const seg = new THREE.Mesh(railGeo, material);
    seg.position.set((startX + endX) / 2, (y0 + y1) / 2, (startZ + endZ) / 2);
    seg.lookAt(endX, y1, endZ);
    seg.rotateX(Math.PI / 2);
    group.add(seg);
  }
}

function addCurvedHandrails(
  group: THREE.Group,
  numSteps: number, rise: number, angleStep: number,
  innerR: number, outerR: number, handrailHeight: number,
  material: THREE.MeshStandardMaterial,
  flareBottom: boolean, flareStepCount: number, flareExtraWidth: number,
): void {
  // Balusters and rails on both inner and outer edges
  for (const edge of ['inner', 'outer'] as const) {
    const baseR = edge === 'outer' ? outerR + 0.05 : innerR - 0.05;

    for (let i = 0; i <= numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise + handrailHeight / 2;
      let r = baseR;
      if (flareBottom && i < flareStepCount) {
        const flareT = 1 - i / flareStepCount;
        r += edge === 'outer' ? flareExtraWidth * flareT : -flareExtraWidth * 0.3 * flareT;
      }
      const balGeo = new THREE.CylinderGeometry(0.015, 0.015, handrailHeight, 8);
      const bal = new THREE.Mesh(balGeo, material);
      bal.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
      group.add(bal);
    }

    // Rail segments
    for (let i = 0; i < numSteps; i++) {
      const a0 = i * angleStep;
      const a1 = (i + 1) * angleStep;
      const y0 = i * rise + handrailHeight;
      const y1 = (i + 1) * rise + handrailHeight;

      let r0 = baseR;
      let r1 = baseR;
      if (flareBottom) {
        if (i < flareStepCount) {
          const ft0 = 1 - i / flareStepCount;
          r0 += edge === 'outer' ? flareExtraWidth * ft0 : -flareExtraWidth * 0.3 * ft0;
        }
        if (i + 1 < flareStepCount) {
          const ft1 = 1 - (i + 1) / flareStepCount;
          r1 += edge === 'outer' ? flareExtraWidth * ft1 : -flareExtraWidth * 0.3 * ft1;
        }
      }

      const startX = Math.cos(a0) * r0;
      const startZ = Math.sin(a0) * r0;
      const endX = Math.cos(a1) * r1;
      const endZ = Math.sin(a1) * r1;

      const dx = endX - startX;
      const dy = y1 - y0;
      const dz = endZ - startZ;
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const railGeo = new THREE.CylinderGeometry(0.02, 0.02, segLen, 8);
      const seg = new THREE.Mesh(railGeo, material);
      seg.position.set((startX + endX) / 2, (y0 + y1) / 2, (startZ + endZ) / 2);
      seg.lookAt(endX, y1, endZ);
      seg.rotateX(Math.PI / 2);
      group.add(seg);
    }
  }
}

function addCantileverHandrails(
  group: THREE.Group,
  numSteps: number, rise: number, run: number,
  projectionDepth: number, wallZ: number,
  totalHeight: number, handrailHeight: number,
  material: THREE.MeshStandardMaterial,
): void {
  // Only on the open (free) side
  const railZ = wallZ + projectionDepth;

  // Vertical posts at every 2nd step
  for (let i = 0; i <= numSteps; i += 2) {
    const y = i * rise;
    const x = i * run;
    const postH = handrailHeight + 0.05;
    const postGeo = new THREE.CylinderGeometry(0.02, 0.025, postH, 8);
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(x + run / 2, y + postH / 2, railZ);
    post.castShadow = true;
    post.name = `cantilever_post_${i}`;
    group.add(post);
  }

  // Continuous top rail
  const totalRunLen = numSteps * run;
  const railLength = Math.sqrt(totalRunLen ** 2 + totalHeight ** 2);
  const railAngle = Math.atan2(totalHeight, totalRunLen);
  const topRailGeo = new THREE.CylinderGeometry(0.025, 0.025, railLength, 8);
  const topRail = new THREE.Mesh(topRailGeo, material);
  topRail.position.set(totalRunLen / 2, totalHeight / 2 + handrailHeight, railZ);
  topRail.rotation.z = Math.PI / 2 - railAngle;
  topRail.castShadow = true;
  topRail.name = 'cantilever_top_rail';
  group.add(topRail);

  // Mid rail for horizontal-post style
  const midH = handrailHeight * 0.5;
  const midRailGeo = new THREE.CylinderGeometry(0.015, 0.015, railLength, 8);
  const midRail = new THREE.Mesh(midRailGeo, material);
  midRail.position.set(totalRunLen / 2, totalHeight / 2 + midH, railZ);
  midRail.rotation.z = Math.PI / 2 - railAngle;
  midRail.castShadow = true;
  midRail.name = 'cantilever_mid_rail';
  group.add(midRail);
}

// ============================================================================
// Internal Helpers — Materials & Colors
// ============================================================================

const MATERIAL_CONFIGS: Record<string, { color: number; roughness: number; metalness: number }> = {
  wood:           { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
  oak:            { color: 0x8b6914, roughness: 0.6,  metalness: 0.0 },
  steel:          { color: 0x888888, roughness: 0.3,  metalness: 0.8 },
  metal:          { color: 0x666666, roughness: 0.4,  metalness: 0.7 },
  glass:          { color: 0x88ccff, roughness: 0.1,  metalness: 0.1 },
  concrete:       { color: 0x999999, roughness: 0.9,  metalness: 0.0 },
  reclaimed_wood: { color: 0x6b4423, roughness: 0.85, metalness: 0.0 },
  wrought_iron:   { color: 0x2a2a2a, roughness: 0.5,  metalness: 0.7 },
  marble:         { color: 0xe8e0d0, roughness: 0.2,  metalness: 0.05 },
};

function makeMaterial(name: string): THREE.MeshStandardMaterial {
  const cfg = MATERIAL_CONFIGS[name] ?? MATERIAL_CONFIGS.wood;
  return new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: cfg.roughness,
    metalness: cfg.metalness,
    transparent: name === 'glass',
    opacity: name === 'glass' ? 0.3 : 1.0,
  });
}

function getMaterialColor(matOrName: THREE.MeshStandardMaterial | string): THREE.Color {
  if (typeof matOrName === 'string') {
    const cfg = MATERIAL_CONFIGS[matOrName] ?? MATERIAL_CONFIGS.wood;
    return new THREE.Color(cfg.color);
  }
  return matOrName.color.clone();
}

/** Apply vertex colors to a BufferGeometry from a THREE.Color. */
function applyVertexColors(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) return;
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3]     = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
