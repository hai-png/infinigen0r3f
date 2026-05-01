/**
 * LegGenerator - Procedural jointed legs with upper/lower segments, feet/claws
 * Supports different leg types: insect, mammal, bird, reptile
 */
import * as THREE from 'three';

export type LegType = 'insect' | 'mammal' | 'bird' | 'reptile';

export interface LegConfig {
  type: LegType;
  count: number;
  size: number;
  upperRatio: number;  // ratio of upper segment length to total
  footType: 'claw' | 'hoof' | 'webbed' | 'pad' | 'tarsus';
  jointAngle: number;  // angle at the knee/elbow joint
  spread: number;      // how far apart the legs are
  color?: number;
}

export class LegGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
  }

  generate(type: string, count: number, size: number): THREE.Group;
  generate(config: Partial<LegConfig>): THREE.Group;
  generate(typeOrConfig: string | Partial<LegConfig>, count?: number, size?: number): THREE.Group {
    let config: LegConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as LegType,
        count: count ?? 4,
        size: size ?? 1.0,
        upperRatio: 0.5,
        footType: 'claw',
        jointAngle: 0.4,
        spread: 0.15,
        color: 0x8B4513,
      };
    } else {
      config = {
        type: 'mammal',
        count: 4,
        size: 1.0,
        upperRatio: 0.5,
        footType: 'claw',
        jointAngle: 0.4,
        spread: 0.15,
        color: 0x8B4513,
        ...typeOrConfig,
      };
    }

    const legs = new THREE.Group();
    legs.name = 'legs';

    const legCount = config.count;
    for (let i = 0; i < legCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const pair = Math.floor(i / 2);
      const totalPairs = Math.ceil(legCount / 2);
      const zOffset = (pair / (totalPairs - 1 || 1) - 0.5) * config.size * 0.4;

      const leg = this.createJointedLeg(config, side, zOffset);
      leg.name = `leg_${i}`;
      legs.add(leg);
    }

    return legs;
  }

  private createJointedLeg(config: LegConfig, side: number, zOffset: number): THREE.Group {
    const group = new THREE.Group();
    const s = config.size;
    const upperLen = s * config.upperRatio;
    const lowerLen = s * (1 - config.upperRatio);

    const legMat = new THREE.MeshStandardMaterial({
      color: config.color ?? 0x8B4513,
      roughness: 0.7,
    });

    // Position the leg root
    group.position.set(side * s * config.spread, 0, zOffset);

    switch (config.type) {
      case 'insect':
        this.buildInsectLeg(group, s, upperLen, lowerLen, side, legMat, config);
        break;
      case 'mammal':
        this.buildMammalLeg(group, s, upperLen, lowerLen, side, legMat, config);
        break;
      case 'bird':
        this.buildBirdLeg(group, s, upperLen, lowerLen, side, legMat, config);
        break;
      case 'reptile':
        this.buildReptileLeg(group, s, upperLen, lowerLen, side, legMat, config);
        break;
      default:
        this.buildMammalLeg(group, s, upperLen, lowerLen, side, legMat, config);
    }

    return group;
  }

  /**
   * Insect leg: coxa + femur + tibia + tarsus segments, splayed outward
   */
  private buildInsectLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    const tarsusLen = s * 0.15;

    // Coxa (hip joint) - short, thick
    const coxaGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.025, s * 0.06, 6);
    const coxa = new THREE.Mesh(coxaGeo, mat);
    coxa.position.set(side * s * 0.02, -s * 0.03, 0);
    coxa.rotation.z = side * 0.5;
    coxa.rotation.x = side * 0.3;
    coxa.name = 'coxa';
    group.add(coxa);

    // Femur (upper leg) - thicker
    const femurGeo = new THREE.CylinderGeometry(s * 0.02, s * 0.025, upperLen, 6);
    const femur = new THREE.Mesh(femurGeo, mat);
    femur.position.set(side * s * 0.06, -s * 0.06 - upperLen * 0.4, 0);
    femur.rotation.z = side * 1.0; // Splayed outward
    femur.name = 'femur';
    group.add(femur);

    // Tibia (lower leg) - thinner
    const tibiaGeo = new THREE.CylinderGeometry(s * 0.01, s * 0.018, lowerLen, 6);
    const tibia = new THREE.Mesh(tibiaGeo, mat);
    tibia.position.set(side * s * 0.06, -s * 0.06 - upperLen * 0.8 - lowerLen * 0.4, 0);
    tibia.rotation.z = side * -0.3; // Back inward
    tibia.name = 'tibia';
    group.add(tibia);

    // Tarsus (foot) with claws
    this.buildTarsus(group, s, tarsusLen, side, mat, config);
  }

  /**
   * Mammal leg: upper + lower + paw/hoof
   */
  private buildMammalLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    // Upper leg (femur/humerus)
    const upperGeo = new THREE.CylinderGeometry(s * 0.04, s * 0.05, upperLen, 8);
    const upper = new THREE.Mesh(upperGeo, mat);
    upper.position.set(0, -upperLen * 0.5, 0);
    upper.rotation.z = side * 0.15; // Slight outward angle
    upper.name = 'upperLeg';
    group.add(upper);

    // Joint (knee/elbow) sphere
    const jointGeo = new THREE.SphereGeometry(s * 0.05, 8, 8);
    const joint = new THREE.Mesh(jointGeo, mat);
    joint.position.set(side * s * 0.03, -upperLen, 0);
    joint.name = 'knee';
    group.add(joint);

    // Lower leg (tibia/radius) - slight forward angle
    const lowerGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.04, lowerLen, 8);
    const lower = new THREE.Mesh(lowerGeo, mat);
    lower.position.set(side * s * 0.05, -upperLen - lowerLen * 0.5, s * 0.03);
    lower.rotation.z = side * -0.1;
    lower.rotation.x = 0.2;
    lower.name = 'lowerLeg';
    group.add(lower);

    // Foot
    this.buildFoot(group, s, side, -upperLen - lowerLen, mat, config);
  }

  /**
   * Bird leg: thin, scaly, with toes
   */
  private buildBirdLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    const legMat = new THREE.MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });

    // Thigh (short, feather-covered)
    const thighGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.04, upperLen * 0.7, 6);
    const thigh = new THREE.Mesh(thighGeo, mat);
    thigh.position.set(0, -upperLen * 0.35, 0);
    thigh.name = 'thigh';
    group.add(thigh);

    // Tibiotarsus (long lower leg)
    const tibiotarsusGeo = new THREE.CylinderGeometry(s * 0.015, s * 0.02, lowerLen, 6);
    const tibiotarsus = new THREE.Mesh(tibiotarsusGeo, legMat);
    tibiotarsus.position.set(side * s * 0.02, -upperLen * 0.7 - lowerLen * 0.4, s * 0.05);
    tibiotarsus.rotation.x = 0.3;
    tibiotarsus.name = 'tibiotarsus';
    group.add(tibiotarsus);

    // Tarsometatarsus (foot segment)
    const tarsusGeo = new THREE.CylinderGeometry(s * 0.01, s * 0.012, s * 0.08, 6);
    const tarsus = new THREE.Mesh(tarsusGeo, legMat);
    tarsus.position.set(side * s * 0.02, -upperLen * 0.7 - lowerLen * 0.9, s * 0.08);
    tarsus.rotation.x = Math.PI / 2;
    tarsus.name = 'tarsometatarsus';
    group.add(tarsus);

    // Toes (3 forward, 1 back)
    const toeMat = new THREE.MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });
    const toeGeo = new THREE.CylinderGeometry(s * 0.004, s * 0.006, s * 0.05, 4);
    const footY = -upperLen * 0.7 - lowerLen * 0.9;
    const footZ = s * 0.12;

    for (let t = -1; t <= 1; t++) {
      const toe = new THREE.Mesh(toeGeo, toeMat);
      toe.position.set(side * s * 0.02 + t * s * 0.02, footY, footZ);
      toe.rotation.x = Math.PI / 3;
      toe.name = `toe_${t}`;
      group.add(toe);
    }

    // Back toe
    const backToe = new THREE.Mesh(toeGeo, toeMat);
    backToe.position.set(side * s * 0.02, footY, footZ - s * 0.06);
    backToe.rotation.x = -Math.PI / 4;
    backToe.name = 'backToe';
    group.add(backToe);

    // Claw tips
    const clawGeo = new THREE.ConeGeometry(s * 0.004, s * 0.015, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    for (let t = -1; t <= 1; t++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.02 + t * s * 0.02, footY - s * 0.02, footZ + s * 0.04);
      claw.rotation.x = Math.PI / 2;
      claw.name = `claw_${t}`;
      group.add(claw);
    }
  }

  /**
   * Reptile leg: splayed, with claws
   */
  private buildReptileLeg(
    group: THREE.Group, s: number, upperLen: number, lowerLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    const scaleMat = new THREE.MeshStandardMaterial({
      color: config.color ?? 0x4a6a3a, roughness: 0.6,
    });

    // Upper leg - splayed outward
    const upperGeo = new THREE.CylinderGeometry(s * 0.03, s * 0.04, upperLen, 6);
    const upper = new THREE.Mesh(upperGeo, scaleMat);
    upper.position.set(side * s * 0.04, -upperLen * 0.4, 0);
    upper.rotation.z = side * 0.7; // Strong outward splay
    upper.name = 'upperLeg';
    group.add(upper);

    // Lower leg - angles back down
    const lowerGeo = new THREE.CylinderGeometry(s * 0.02, s * 0.03, lowerLen, 6);
    const lower = new THREE.Mesh(lowerGeo, scaleMat);
    lower.position.set(side * s * 0.08, -upperLen * 0.7 - lowerLen * 0.4, s * 0.03);
    lower.rotation.z = side * -0.3;
    lower.rotation.x = 0.4;
    lower.name = 'lowerLeg';
    group.add(lower);

    // Foot with claws
    const footY = -upperLen * 0.7 - lowerLen * 0.9;
    const footZ = s * 0.06;
    const footGeo = new THREE.BoxGeometry(s * 0.05, s * 0.015, s * 0.08);
    const foot = new THREE.Mesh(footGeo, scaleMat);
    foot.position.set(side * s * 0.08, footY, footZ);
    foot.name = 'foot';
    group.add(foot);

    // Claws
    const clawGeo = new THREE.ConeGeometry(s * 0.006, s * 0.025, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.08 + c * s * 0.015, footY - s * 0.01, footZ + s * 0.05);
      claw.rotation.x = Math.PI / 3;
      claw.name = `claw_${c}`;
      group.add(claw);
    }
  }

  /**
   * Build insect tarsus (foot) with tiny claws
   */
  private buildTarsus(
    group: THREE.Group, s: number, tarsusLen: number,
    side: number, mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    const tarsusGeo = new THREE.CylinderGeometry(s * 0.005, s * 0.008, tarsusLen, 4);
    const tarsus = new THREE.Mesh(tarsusGeo, mat);
    const baseY = -s * 0.06 - s * config.upperRatio * 0.8 - s * (1 - config.upperRatio) * 0.8;
    tarsus.position.set(side * s * 0.04, baseY - tarsusLen * 0.5, s * 0.02);
    tarsus.rotation.z = side * 0.2;
    tarsus.name = 'tarsus';
    group.add(tarsus);

    // Tiny claws at tip
    const clawGeo = new THREE.ConeGeometry(s * 0.004, s * 0.015, 4);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    for (const cSide of [-1, 1]) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * s * 0.04 + cSide * s * 0.005, baseY - tarsusLen, s * 0.04);
      claw.rotation.x = Math.PI / 4;
      claw.name = `tarsalClaw_${cSide}`;
      group.add(claw);
    }
  }

  /**
   * Build mammal foot/paw/hoof
   */
  private buildFoot(
    group: THREE.Group, s: number, side: number, y: number,
    mat: THREE.MeshStandardMaterial, config: LegConfig
  ): void {
    switch (config.footType) {
      case 'hoof': {
        const hoofGeo = new THREE.CylinderGeometry(s * 0.04, s * 0.05, s * 0.04, 8);
        const hoofMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 });
        const hoof = new THREE.Mesh(hoofGeo, hoofMat);
        hoof.position.set(side * s * 0.05, y - s * 0.02, s * 0.05);
        hoof.name = 'hoof';
        group.add(hoof);
        break;
      }
      case 'webbed': {
        // Webbed foot (duck/frog)
        const webGeo = new THREE.CircleGeometry(s * 0.06, 8);
        const webMat = new THREE.MeshStandardMaterial({
          color: 0xcc8833, roughness: 0.5, side: THREE.DoubleSide,
        });
        const web = new THREE.Mesh(webGeo, webMat);
        web.position.set(side * s * 0.05, y - s * 0.02, s * 0.05);
        web.rotation.x = -Math.PI / 3;
        web.name = 'webbedFoot';
        group.add(web);
        break;
      }
      case 'pad': {
        // Paw pad
        const padGeo = new THREE.SphereGeometry(s * 0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x2a1a1a, roughness: 0.9 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(side * s * 0.05, y - s * 0.01, s * 0.05);
        pad.rotation.x = Math.PI;
        pad.name = 'pawPad';
        group.add(pad);

        // Toe pads
        for (let t = -1; t <= 1; t++) {
          const toePadGeo = new THREE.SphereGeometry(s * 0.015, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
          const toePad = new THREE.Mesh(toePadGeo, padMat);
          toePad.position.set(side * s * 0.05 + t * s * 0.02, y - s * 0.015, s * 0.07);
          toePad.rotation.x = Math.PI;
          toePad.name = `toePad_${t}`;
          group.add(toePad);
        }
        break;
      }
      default: {
        // Default claw foot
        const footGeo = new THREE.BoxGeometry(s * 0.05, s * 0.02, s * 0.06);
        const foot = new THREE.Mesh(footGeo, mat);
        foot.position.set(side * s * 0.05, y - s * 0.01, s * 0.05);
        foot.name = 'foot';
        group.add(foot);

        // Claws
        const clawGeo = new THREE.ConeGeometry(s * 0.006, s * 0.02, 4);
        const clawMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
        for (let c = -1; c <= 1; c++) {
          const claw = new THREE.Mesh(clawGeo, clawMat);
          claw.position.set(side * s * 0.05 + c * s * 0.015, y - s * 0.025, s * 0.08);
          claw.rotation.x = Math.PI / 3;
          claw.name = `claw_${c}`;
          group.add(claw);
        }
        break;
      }
    }
  }
}
