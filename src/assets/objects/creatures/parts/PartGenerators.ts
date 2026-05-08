/**
 * PartGenerators - Procedural body part generators for creatures
 *
 * HeadGenerator: 8 head shapes with eyes, ears, mouth, horns
 * TorsoGenerator: 5 shapes with rib cage width, belly shape, spine curvature
 * LimbGenerator: legs/arms/wings with joint count, tapering, foot type
 * TailGenerator: 6 shapes with length, flexibility, tip shape
 */

import {
  Group, Mesh, MeshStandardMaterial, SphereGeometry, CylinderGeometry,
  ConeGeometry, BoxGeometry, BufferGeometry, Float32BufferAttribute,
  Object3D, DoubleSide, Color,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { ResolvedBodyPlan } from '../BodyPlanSystem';

// ── Head Generator ──────────────────────────────────────────────────

export type HeadShape = 'sphere' | 'wedge' | 'flat' | 'long' | 'pointed' | 'crest' | 'horned' | 'beak';
export type PupilShape = 'round' | 'slit' | 'compound';
export type EarType = 'pointed' | 'round' | 'none' | 'long';
export type MouthType = 'jaw' | 'beak_sharp' | 'beak_flat' | 'tube' | 'fangs';

export interface HeadConfig {
  shape: HeadShape;
  size: number;
  eyeSize: number;
  eyeSpacing: number;
  pupilShape: PupilShape;
  earType: EarType;
  earSize: number;
  mouthType: MouthType;
  snoutLength: number;
  hasHorns: boolean;
  hornCurvature: number;
  color: Color;
  secondaryColor: Color;
}

export class HeadGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(plan: ResolvedBodyPlan, color: Color, secondaryColor: Color): Group {
    const s = plan.size;
    const p = plan.proportions;
    const config = this.createConfig(plan, color, secondaryColor);
    const group = new Group();
    group.name = 'headGroup';

    // Head mesh
    const headMesh = this.generateHeadMesh(config, s, p);
    group.add(headMesh);

    // Eyes
    const eyes = this.generateEyes(config, s, p);
    eyes.forEach(e => group.add(e));

    // Ears
    if (config.earType !== 'none') {
      const ears = this.generateEars(config, s, p);
      ears.forEach(e => group.add(ears.length > 0 ? e : new Object3D()));
    }

    // Mouth/snout
    const mouth = this.generateMouth(config, s, p);
    if (mouth) group.add(mouth);

    // Horns
    if (config.hasHorns) {
      const horns = this.generateHorns(config, s, p);
      horns.forEach(h => group.add(h));
    }

    return group;
  }

  private createConfig(plan: ResolvedBodyPlan, color: Color, secondaryColor: Color): HeadConfig {
    const shapes: HeadShape[] = ['sphere', 'wedge', 'flat', 'long', 'pointed', 'crest', 'horned', 'beak'];
    const earTypes: EarType[] = ['pointed', 'round', 'none', 'long'];
    const pupilShapes: PupilShape[] = ['round', 'slit', 'compound'];
    const mouthTypes: MouthType[] = ['jaw', 'beak_sharp', 'beak_flat', 'tube', 'fangs'];

    // Choose based on body plan type
    let shape: HeadShape;
    let mouth: MouthType;
    switch (plan.type) {
      case 'avian':
        shape = 'beak'; mouth = 'beak_sharp'; break;
      case 'insectoid':
        shape = 'sphere'; mouth = 'fangs'; break;
      case 'aquatic':
        shape = 'pointed'; mouth = 'jaw'; break;
      case 'serpentine':
        shape = 'flat'; mouth = 'fangs'; break;
      default:
        shape = this.rng.choice(shapes);
        mouth = this.rng.choice(mouthTypes);
    }

    return {
      shape,
      size: plan.proportions.headSize,
      eyeSize: this.rng.nextFloat(0.02, 0.06),
      eyeSpacing: this.rng.nextFloat(0.3, 0.6),
      pupilShape: this.rng.choice(pupilShapes),
      earType: plan.type === 'aquatic' ? 'none' : this.rng.choice(earTypes),
      earSize: this.rng.nextFloat(0.03, 0.08),
      mouthType: mouth,
      snoutLength: plan.proportions.snoutLength,
      hasHorns: this.rng.boolean(0.2),
      hornCurvature: this.rng.nextFloat(0.2, 0.8),
      color,
      secondaryColor,
    };
  }

  private generateHeadMesh(config: HeadConfig, s: number, p: ResolvedBodyPlan['proportions']): Mesh {
    const headSize = s * config.size;
    const mat = new MeshStandardMaterial({ color: config.color, roughness: 0.7 });

    let geo: BufferGeometry;
    switch (config.shape) {
      case 'sphere':
        geo = new SphereGeometry(headSize, 24, 24);
        break;
      case 'wedge':
        geo = new SphereGeometry(headSize, 24, 24);
        geo.scale(1, 0.8, 1.3);
        break;
      case 'flat':
        geo = new SphereGeometry(headSize, 24, 24);
        geo.scale(1.4, 0.6, 1.0);
        break;
      case 'long': {
        const longGeo = new SphereGeometry(headSize, 24, 24);
        longGeo.scale(0.8, 0.7, 1.5);
        geo = longGeo;
        break;
      }
      case 'pointed': {
        const pointGeo = new SphereGeometry(headSize, 24, 24);
        pointGeo.scale(0.8, 0.8, 1.4);
        geo = pointGeo;
        break;
      }
      case 'crest':
        geo = new SphereGeometry(headSize, 24, 24);
        break;
      case 'horned':
        geo = new SphereGeometry(headSize, 24, 24);
        break;
      case 'beak': {
        const beakGeo = new SphereGeometry(headSize, 24, 24);
        beakGeo.scale(0.9, 0.8, 1.2);
        geo = beakGeo;
        break;
      }
      default:
        geo = new SphereGeometry(headSize, 24, 24);
    }

    const mesh = new Mesh(geo, mat);
    mesh.name = 'head';
    mesh.position.set(0, s * p.bodyHeight * 0.15, s * p.headSize * 0.5);
    return mesh;
  }

  private generateEyes(config: HeadConfig, s: number, _p: ResolvedBodyPlan['proportions']): Mesh[] {
    const eyes: Mesh[] = [];
    const eyeR = s * config.eyeSize;
    const pupilR = eyeR * 0.5;
    const scleraMat = new MeshStandardMaterial({ color: 0xeeeeee });
    const pupilMat = new MeshStandardMaterial({ color: 0x111111 });

    for (const side of [-1, 1]) {
      const x = side * s * config.eyeSpacing * config.size;
      const y = s * config.size * 0.15;
      const z = s * config.size * 0.4;

      // Sclera
      const scleraGeo = new SphereGeometry(eyeR, 12, 12);
      const sclera = new Mesh(scleraGeo, scleraMat);
      sclera.position.set(x, y, z);
      sclera.name = side === -1 ? 'leftEye' : 'rightEye';
      eyes.push(sclera);

      // Pupil
      const pupilGeo = config.pupilShape === 'slit'
        ? new SphereGeometry(pupilR, 8, 8).scale(0.4, 1, 1) as BufferGeometry
        : new SphereGeometry(pupilR, 8, 8);
      const pupil = new Mesh(pupilGeo, pupilMat);
      pupil.position.set(x + side * eyeR * 0.3, y, z + eyeR * 0.3);
      eyes.push(pupil);
    }

    return eyes;
  }

  private generateEars(config: HeadConfig, s: number, _p: ResolvedBodyPlan['proportions']): Mesh[] {
    const ears: Mesh[] = [];
    const earH = s * config.earSize;
    const earW = s * config.earSize * 0.5;
    const innerMat = new MeshStandardMaterial({ color: 0xffcccc });
    const outerMat = new MeshStandardMaterial({ color: config.secondaryColor, roughness: 0.7 });

    for (const side of [-1, 1]) {
      const geo = config.earType === 'long'
        ? new CylinderGeometry(earW * 0.3, earW * 0.5, earH * 2, 8)
        : config.earType === 'pointed'
          ? new ConeGeometry(earW, earH, 8)
          : new SphereGeometry(earW, 8, 8);

      const ear = new Mesh(geo, outerMat);
      ear.position.set(side * s * config.size * 0.6, s * config.size * 0.4, 0);
      ear.rotation.z = side * (config.earType === 'long' ? 0.3 : 0.2);
      ear.name = side === -1 ? 'leftEar' : 'rightEar';
      ears.push(ear);

      // Inner ear
      const innerGeo = config.earType === 'long'
        ? new CylinderGeometry(earW * 0.15, earW * 0.3, earH * 1.5, 8)
        : new SphereGeometry(earW * 0.6, 8, 8);
      const inner = new Mesh(innerGeo, innerMat);
      inner.position.copy(ear.position);
      inner.position.z += earW * 0.2;
      ears.push(inner);
    }

    return ears;
  }

  private generateMouth(config: HeadConfig, s: number, p: ResolvedBodyPlan['proportions']): Object3D | null {
    const group = new Group();
    group.name = 'mouthGroup';
    const mat = new MeshStandardMaterial({ color: 0x880000, roughness: 0.5 });

    if (config.mouthType === 'beak_sharp' || config.mouthType === 'beak_flat') {
      // Beak
      const beakLen = s * config.snoutLength;
      const beakGeo = new ConeGeometry(s * config.size * 0.1, beakLen, 8);
      const upperBeakMat = new MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4 });
      const upper = new Mesh(beakGeo, upperBeakMat);
      upper.rotation.x = -Math.PI / 2;
      upper.position.set(0, s * p.bodyHeight * 0.1, s * p.headSize * 0.5 + beakLen * 0.5);
      group.add(upper);

      // Lower beak
      const lowerGeo = new ConeGeometry(s * config.size * 0.08, beakLen * 0.8, 8);
      const lower = new Mesh(lowerGeo, upperBeakMat);
      lower.rotation.x = -Math.PI / 2;
      lower.position.set(0, s * p.bodyHeight * 0.05, s * p.headSize * 0.5 + beakLen * 0.4);
      group.add(lower);
    } else {
      // Jaw/snout
      const snoutLen = s * config.snoutLength;
      const snoutGeo = new SphereGeometry(s * config.size * 0.2, 12, 12);
      snoutGeo.scale(0.6, 0.5, 1.5);
      const snoutMat = new MeshStandardMaterial({ color: config.color, roughness: 0.7 });
      const snout = new Mesh(snoutGeo, snoutMat);
      snout.position.set(0, s * p.bodyHeight * 0.05, s * p.headSize * 0.5 + snoutLen * 0.3);
      group.add(snout);

      // Nostrils
      const nostrilMat = new MeshStandardMaterial({ color: 0x222222 });
      for (const side of [-1, 1]) {
        const nostrilGeo = new SphereGeometry(s * 0.01, 8, 8);
        const nostril = new Mesh(nostrilGeo, nostrilMat);
        nostril.position.set(side * s * 0.02, s * p.bodyHeight * 0.05, s * p.headSize * 0.5 + snoutLen * 0.7);
        group.add(nostril);
      }

      // Mouth opening
      if (config.mouthType === 'fangs') {
        const fangMat = new MeshStandardMaterial({ color: 0xffffff });
        for (const side of [-1, 1]) {
          const fangGeo = new ConeGeometry(s * 0.008, s * 0.03, 6);
          const fang = new Mesh(fangGeo, fangMat);
          fang.position.set(side * s * 0.025, s * p.bodyHeight * 0.02, s * p.headSize * 0.5 + snoutLen * 0.5);
          fang.rotation.x = Math.PI;
          group.add(fang);
        }
      }
    }

    return group;
  }

  private generateHorns(config: HeadConfig, s: number, _p: ResolvedBodyPlan['proportions']): Mesh[] {
    const horns: Mesh[] = [];
    const hornMat = new MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.4, metalness: 0.1 });
    const hornLen = s * config.size * 0.4;

    for (const side of [-1, 1]) {
      const hornGeo = new ConeGeometry(s * 0.015, hornLen, 8);
      const horn = new Mesh(hornGeo, hornMat);
      horn.position.set(side * s * config.size * 0.4, s * config.size * 0.5, -s * 0.02);
      horn.rotation.z = side * -config.hornCurvature;
      horn.rotation.x = -0.3;
      horn.name = side === -1 ? 'leftHorn' : 'rightHorn';
      horns.push(horn);
    }

    return horns;
  }
}

// ── Torso Generator ─────────────────────────────────────────────────

export type TorsoShape = 'barrel' | 'slender' | 'elongated' | 'compact' | 'segmented';

export interface TorsoConfig {
  shape: TorsoShape;
  width: number;
  height: number;
  length: number;
  ribCageWidth: number;
  bellyShape: number;  // 0 = flat, 1 = round
  spineCurvature: number; // -1 = concave, 0 = straight, 1 = convex
  color: Color;
}

export class TorsoGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(plan: ResolvedBodyPlan, color: Color): Mesh {
    const s = plan.size;
    const p = plan.proportions;
    const shapes: TorsoShape[] = ['barrel', 'slender', 'elongated', 'compact', 'segmented'];

    let shape: TorsoShape;
    switch (plan.type) {
      case 'serpentine':  shape = 'elongated'; break;
      case 'aquatic':     shape = 'elongated'; break;
      case 'insectoid':   shape = 'segmented'; break;
      case 'avian':       shape = 'compact'; break;
      default:            shape = this.rng.choice(shapes);
    }

    const config: TorsoConfig = {
      shape,
      width: p.bodyWidth,
      height: p.bodyHeight,
      length: p.bodyLength,
      ribCageWidth: this.rng.nextFloat(0.8, 1.1),
      bellyShape: this.rng.nextFloat(0.3, 0.9),
      spineCurvature: this.rng.nextFloat(-0.1, 0.15),
      color,
    };

    return this.generateTorsoMesh(config, s);
  }

  private generateTorsoMesh(config: TorsoConfig, s: number): Mesh {
    const mat = new MeshStandardMaterial({ color: config.color, roughness: 0.7 });

    let geo: BufferGeometry;
    const w = s * config.width;
    const h = s * config.height;
    const l = s * config.length;

    switch (config.shape) {
      case 'barrel':
        geo = new SphereGeometry(1, 24, 24);
        geo.scale(w, h * 0.8, l);
        break;
      case 'slender':
        geo = new SphereGeometry(1, 24, 24);
        geo.scale(w * 0.7, h * 0.7, l);
        break;
      case 'elongated':
        geo = new SphereGeometry(1, 24, 24);
        geo.scale(w * 0.5, h * 0.5, l * 1.2);
        break;
      case 'compact':
        geo = new SphereGeometry(1, 24, 24);
        geo.scale(w, h, l * 0.6);
        break;
      case 'segmented': {
        // Create 3-segment torso for insects
        const group = new Group();
        const segments = [0.25, 0.3, 0.4]; // relative sizes
        let zOff = 0;
        for (let i = 0; i < 3; i++) {
          const segGeo = new SphereGeometry(1, 16, 16);
          const scaleX = w * segments[i];
          const scaleY = h * segments[i];
          const scaleZ = l * 0.25;
          segGeo.scale(scaleX, scaleY, scaleZ);
          const seg = new Mesh(segGeo, mat);
          seg.position.z = zOff;
          seg.name = `torso_segment_${i}`;
          group.add(seg);
          zOff -= s * 0.15;
        }
        // Return the first segment as the main mesh (the group handles the rest)
        const mainGeo = new SphereGeometry(1, 24, 24);
        mainGeo.scale(w * 0.3, h * 0.3, l * 0.8);
        geo = mainGeo;
        break;
      }
      default:
        geo = new SphereGeometry(1, 24, 24);
        geo.scale(w, h, l);
    }

    // Apply belly shape (widen bottom half)
    if (config.bellyShape > 0.5) {
      const posAttr = geo.getAttribute('position');
      for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        if (y < 0) {
          const factor = 1.0 + config.bellyShape * 0.2 * Math.abs(y);
          posAttr.setX(i, posAttr.getX(i) * factor);
          posAttr.setZ(i, posAttr.getZ(i) * factor);
        }
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }

    const mesh = new Mesh(geo, mat);
    mesh.name = 'body';
    return mesh;
  }
}

// ── Limb Generator ──────────────────────────────────────────────────

export type FootType = 'paw' | 'hoof' | 'claw' | 'webbed' | 'hand' | 'pad';
export type WingType = 'feathered' | 'membrane' | 'insect';

export interface LimbConfig {
  jointCount: number;       // 1-3 segments
  segmentLengths: number[];
  thicknessStart: number;
  thicknessEnd: number;
  footType: FootType;
  wingType?: WingType;
}

export class LimbGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generateLegs(plan: ResolvedBodyPlan, color: Color): Group[] {
    const s = plan.size;
    const p = plan.proportions;
    const legs: Group[] = [];
    const legCount = plan.legCount;

    const footType = this.resolveFootType(plan.type);
    const mat = new MeshStandardMaterial({ color, roughness: 0.7 });
    const footMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    if (plan.type === 'quadruped') {
      const positions = [
        { x: -s * p.bodyWidth * 0.5, z: s * p.bodyLength * 0.2, name: 'frontL' },
        { x: s * p.bodyWidth * 0.5, z: s * p.bodyLength * 0.2, name: 'frontR' },
        { x: -s * p.bodyWidth * 0.5, z: -s * p.bodyLength * 0.2, name: 'hindL' },
        { x: s * p.bodyWidth * 0.5, z: -s * p.bodyLength * 0.2, name: 'hindR' },
      ];
      for (const pos of positions) {
        legs.push(this.createLeg(s, p, mat, footMat, footType, pos.x, pos.z, pos.name));
      }
    } else if (plan.type === 'biped') {
      for (const side of [-1, 1]) {
        const x = side * s * p.bodyWidth * 0.3;
        legs.push(this.createLeg(s, p, mat, footMat, footType, x, 0, side === -1 ? 'legL' : 'legR'));
      }
    } else if (plan.type === 'avian') {
      for (const side of [-1, 1]) {
        const x = side * s * p.bodyWidth * 0.25;
        legs.push(this.createLeg(s, p, mat, footMat, 'claw', x, 0, side === -1 ? 'legL' : 'legR'));
      }
    } else if (plan.type === 'insectoid') {
      const prefixes = ['pro', 'meso', 'meta'];
      for (let i = 0; i < 3; i++) {
        for (const side of [-1, 1]) {
          const x = side * s * p.bodyWidth * 0.5;
          const z = s * p.bodyLength * (0.1 - i * 0.15);
          const name = `${prefixes[i]}_${side === -1 ? 'L' : 'R'}`;
          legs.push(this.createInsectLeg(s, p, mat, x, z, name));
        }
      }
    }

    return legs;
  }

  generateWings(plan: ResolvedBodyPlan, color: Color): Group[] {
    if (plan.type !== 'avian') return [];

    const s = plan.size;
    const p = plan.proportions;
    const wings: Group[] = [];
    const wingMat = new MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: DoubleSide,
    });

    for (const side of [-1, 1]) {
      const wingGroup = new Group();
      wingGroup.name = side === -1 ? 'leftWing' : 'rightWing';

      const wingLen = s * p.armLength * 0.5;
      const wingGeo = new BoxGeometry(wingLen, s * 0.01, s * p.bodyLength * 0.15);
      const wing = new Mesh(wingGeo, wingMat);
      wing.position.set(side * wingLen / 2, s * p.bodyHeight * 0.15, -s * 0.03);
      wing.rotation.z = side * -0.1;
      wingGroup.add(wing);

      wings.push(wingGroup);
    }

    return wings;
  }

  generateFins(plan: ResolvedBodyPlan, color: Color): Mesh[] {
    if (plan.type !== 'aquatic') return [];

    const s = plan.size;
    const finMat = new MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      roughness: 0.4,
      side: DoubleSide,
    });
    const fins: Mesh[] = [];

    // Pectoral fins
    for (const side of [-1, 1]) {
      const finGeo = this.createFinGeometry(s * 0.12, s * 0.08, s * 0.005);
      const fin = new Mesh(finGeo, finMat);
      fin.position.set(side * s * plan.proportions.bodyWidth * 0.8, -s * 0.02, s * 0.1);
      fin.rotation.z = side * 0.7;
      fin.name = side === -1 ? 'leftPectoral' : 'rightPectoral';
      fins.push(fin);
    }

    // Dorsal fin
    const dorsalGeo = this.createFinGeometry(s * 0.08, s * 0.12, s * 0.005);
    const dorsal = new Mesh(dorsalGeo, finMat);
    dorsal.position.set(0, s * plan.proportions.bodyHeight * 0.5, -s * 0.05);
    dorsal.rotation.z = -0.2;
    dorsal.name = 'dorsalFin';
    fins.push(dorsal);

    return fins;
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private resolveFootType(planType: string): FootType {
    switch (planType) {
      case 'quadruped': return this.rng.choice(['paw', 'hoof', 'pad'] as FootType[]);
      case 'biped':     return 'hand';
      case 'avian':     return 'claw';
      default:          return 'paw';
    }
  }

  private createLeg(
    s: number,
    p: ResolvedBodyPlan['proportions'],
    mat: MeshStandardMaterial,
    footMat: MeshStandardMaterial,
    footType: FootType,
    x: number,
    z: number,
    name: string,
  ): Group {
    const group = new Group();
    group.name = name;
    group.position.set(x, -s * p.bodyHeight * 0.3, z);

    const upperLen = s * p.legLength * 0.45;
    const lowerLen = s * p.legLength * 0.45;
    const radius = s * p.legThickness;

    // Upper
    const upperGeo = new CylinderGeometry(radius, radius * 0.85, upperLen, 8);
    const upper = new Mesh(upperGeo, mat);
    upper.position.y = -upperLen / 2;
    upper.name = 'upperLeg';
    group.add(upper);

    // Lower
    const lowerGeo = new CylinderGeometry(radius * 0.85, radius * 0.65, lowerLen, 8);
    const lower = new Mesh(lowerGeo, mat);
    lower.position.y = -upperLen - lowerLen / 2;
    lower.name = 'lowerLeg';
    group.add(lower);

    // Foot
    const footSize = s * p.legThickness * 1.2;
    let footGeo: BufferGeometry;
    switch (footType) {
      case 'hoof':
        footGeo = new CylinderGeometry(footSize * 0.6, footSize * 0.8, footSize * 0.4, 8);
        break;
      case 'claw':
        footGeo = new ConeGeometry(footSize * 0.4, footSize * 0.8, 4);
        break;
      default:
        footGeo = new BoxGeometry(footSize, footSize * 0.3, footSize * 1.2);
    }
    const foot = new Mesh(footGeo, footMat);
    foot.position.y = -upperLen - lowerLen - footSize * 0.2;
    foot.name = 'foot';
    group.add(foot);

    return group;
  }

  private createInsectLeg(
    s: number,
    p: ResolvedBodyPlan['proportions'],
    mat: MeshStandardMaterial,
    x: number,
    z: number,
    name: string,
  ): Group {
    const group = new Group();
    group.name = name;
    group.position.set(x, -s * p.bodyHeight * 0.3, z);

    const upperLen = s * p.legLength * 0.35;
    const lowerLen = s * p.legLength * 0.4;
    const tarsusLen = s * p.legLength * 0.2;
    const radius = s * p.legThickness;

    const dir = x < 0 ? -1 : 1;

    // Coxa + femur
    const upperGeo = new CylinderGeometry(radius, radius * 0.7, upperLen, 6);
    const upper = new Mesh(upperGeo, mat);
    upper.position.set(dir * s * 0.02, -upperLen / 2, 0);
    upper.rotation.z = dir * 0.5;
    group.add(upper);

    // Tibia
    const lowerGeo = new CylinderGeometry(radius * 0.7, radius * 0.4, lowerLen, 6);
    const lower = new Mesh(lowerGeo, mat);
    lower.position.set(dir * s * 0.06, -upperLen - lowerLen / 2, 0);
    lower.rotation.z = dir * 0.3;
    group.add(lower);

    // Tarsus
    const tarsusGeo = new CylinderGeometry(radius * 0.4, radius * 0.2, tarsusLen, 6);
    const tarsus = new Mesh(tarsusGeo, mat);
    tarsus.position.set(dir * s * 0.08, -upperLen - lowerLen - tarsusLen / 2, s * 0.01);
    group.add(tarsus);

    return group;
  }

  private createFinGeometry(width: number, height: number, depth: number): BufferGeometry {
    const vertices = new Float32Array([
      0, height, 0,
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      0, height, 0,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
      0, height, 0,
      -width / 2, 0, -depth / 2,
      -width / 2, 0, depth / 2,
      0, height, 0,
      width / 2, 0, depth / 2,
      width / 2, 0, -depth / 2,
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
    ]);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }
}

// ── Tail Generator ──────────────────────────────────────────────────

export type TailShape = 'thin' | 'thick' | 'prehensile' | 'fin' | 'fan' | 'stub';

export interface TailConfig {
  shape: TailShape;
  length: number;
  flexibility: number; // 0 = stiff, 1 = very flexible
  tipShape: 'pointed' | 'rounded' | 'forked' | 'fan' | 'fluke';
  color: Color;
  tipColor: Color;
}

export class TailGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  generate(plan: ResolvedBodyPlan, color: Color, tipColor: Color): Group {
    const s = plan.size;
    const p = plan.proportions;
    const group = new Group();
    group.name = 'tail';

    const shapes: TailShape[] = ['thin', 'thick', 'prehensile', 'fin', 'fan', 'stub'];
    const tipShapes: TailConfig['tipShape'][] = ['pointed', 'rounded', 'forked', 'fan', 'fluke'];

    let shape: TailShape;
    let tip: TailConfig['tipShape'];
    switch (plan.type) {
      case 'aquatic':
        shape = 'fin'; tip = 'fluke'; break;
      case 'avian':
        shape = 'fan'; tip = 'fan'; break;
      case 'serpentine':
        shape = 'thin'; tip = 'pointed'; break;
      default:
        shape = this.rng.choice(shapes);
        tip = this.rng.choice(tipShapes);
    }

    const config: TailConfig = {
      shape,
      length: p.tailLength,
      flexibility: this.rng.nextFloat(0.3, 0.9),
      tipShape: tip,
      color,
      tipColor,
    };

    const tailLen = s * config.length;

    switch (config.shape) {
      case 'thin': {
        const geo = new CylinderGeometry(s * 0.015, s * 0.008, tailLen, 8);
        const tail = new Mesh(geo, new MeshStandardMaterial({ color: config.color, roughness: 0.7 }));
        tail.rotation.x = Math.PI * 0.35;
        tail.position.set(0, 0, -tailLen * 0.3);
        group.add(tail);
        break;
      }
      case 'thick': {
        const geo = new CylinderGeometry(s * 0.04, s * 0.02, tailLen, 8);
        const tail = new Mesh(geo, new MeshStandardMaterial({ color: config.color, roughness: 0.7 }));
        tail.rotation.x = Math.PI * 0.3;
        tail.position.set(0, 0, -tailLen * 0.3);
        group.add(tail);
        // Tip tuft
        const tipGeo = new SphereGeometry(s * 0.04, 8, 8);
        const tipMesh = new Mesh(tipGeo, new MeshStandardMaterial({ color: config.tipColor }));
        tipMesh.position.set(0, s * 0.05, -tailLen * 0.6);
        group.add(tipMesh);
        break;
      }
      case 'fin': {
        const finMat = new MeshStandardMaterial({
          color: config.color,
          transparent: true,
          opacity: 0.8,
          roughness: 0.4,
          side: DoubleSide,
        });
        if (config.tipShape === 'fluke') {
          for (const side of [-1, 1]) {
            const flukeGeo = new SphereGeometry(1, 12, 12);
            flukeGeo.scale(s * 0.12, s * 0.04, s * 0.08);
            const fluke = new Mesh(flukeGeo, finMat);
            fluke.position.set(side * s * 0.08, 0, -tailLen);
            group.add(fluke);
          }
        } else {
          const finGeo = new SphereGeometry(1, 12, 12);
          finGeo.scale(s * 0.1, s * 0.15, s * 0.06);
          const fin = new Mesh(finGeo, finMat);
          fin.position.set(0, 0, -tailLen);
          group.add(fin);
        }
        break;
      }
      case 'fan': {
        const fanMat = new MeshStandardMaterial({ color: config.color, roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
          const angle = ((i / 4) - 0.5) * 0.6;
          const featherGeo = new BoxGeometry(s * 0.015, s * 0.005, tailLen * 0.5);
          const feather = new Mesh(featherGeo, fanMat);
          feather.position.set(Math.sin(angle) * s * 0.05, 0, -tailLen * 0.4 - Math.cos(angle) * s * 0.03);
          feather.rotation.y = angle;
          group.add(feather);
        }
        break;
      }
      case 'stub': {
        const geo = new SphereGeometry(s * 0.03, 8, 8);
        const stub = new Mesh(geo, new MeshStandardMaterial({ color: config.color }));
        stub.position.set(0, 0, -tailLen * 0.2);
        group.add(stub);
        break;
      }
      case 'prehensile': {
        const segments = 6;
        const segLen = tailLen / segments;
        const tailMat = new MeshStandardMaterial({ color: config.color, roughness: 0.7 });
        for (let i = 0; i < segments; i++) {
          const radius = s * 0.025 * (1 - i / segments);
          const segGeo = new SphereGeometry(radius, 8, 8);
          const seg = new Mesh(segGeo, tailMat);
          seg.position.set(0, -Math.sin(i * 0.3) * s * 0.02, -i * segLen);
          group.add(seg);
        }
        break;
      }
    }

    group.position.set(0, s * plan.proportions.bodyHeight * 0.1, -s * plan.proportions.bodyLength * 0.35);
    return group;
  }
}
