/**
 * SkeletonBuilder - Builds anatomically-correct THREE.Bone hierarchies for creature types
 * Each creature type has a distinct skeleton with proper bone positions and parent-child relationships
 */

import { Bone, Skeleton, Matrix4, Vector3 } from 'three';

export interface CreatureSkeletonConfig {
  size?: number;
  legCount?: number;
  tailSegments?: number;
  spineSegments?: number;
  hasWings?: boolean;
  hasAntennae?: boolean;
}

type CreatureType = 'mammal' | 'bird' | 'fish' | 'reptile' | 'insect' | 'amphibian';

export class SkeletonBuilder {
  private boneIndex: number = 0;

  constructor(private seed?: number) {}

  /**
   * Build a skeleton from a creature type
   */
  buildSkeleton(
    type: CreatureType,
    config: CreatureSkeletonConfig = {}
  ): Skeleton {
    this.boneIndex = 0;
    const cfg = {
      size: config.size ?? 1.0,
      legCount: config.legCount,
      tailSegments: config.tailSegments,
      spineSegments: config.spineSegments,
      hasWings: config.hasWings,
      hasAntennae: config.hasAntennae,
    };

    let rootBone: Bone;

    switch (type) {
      case 'mammal':
        rootBone = this.buildMammalSkeleton(cfg);
        break;
      case 'bird':
        rootBone = this.buildBirdSkeleton(cfg);
        break;
      case 'fish':
        rootBone = this.buildFishSkeleton(cfg);
        break;
      case 'reptile':
        rootBone = this.buildReptileSkeleton(cfg);
        break;
      case 'insect':
        rootBone = this.buildInsectSkeleton(cfg);
        break;
      case 'amphibian':
        rootBone = this.buildAmphibianSkeleton(cfg);
        break;
      default:
        rootBone = this.buildMammalSkeleton(cfg);
    }

    // Collect all bones in hierarchy order
    const bones: Bone[] = [];
    this.collectBones(rootBone, bones);

    // Compute inverse bind matrices
    const boneMatrices: Matrix4[] = [];
    for (const bone of bones) {
      const m = new Matrix4();
      m.copy(bone.matrixWorld).invert();
      boneMatrices.push(m);
    }

    const skeleton = new Skeleton(bones, boneMatrices);
    skeleton.calculateInverses();
    return skeleton;
  }

  /**
   * Build bones and return flat array (legacy API)
   */
  buildBones(creatureType: string): Bone[] {
    const type = creatureType as CreatureType;
    const skeleton = this.buildSkeleton(type, { size: 1.0 });
    return skeleton.bones;
  }

  /**
   * Create a rig group containing the bones and a skinned mesh placeholder
   */
  createRigFromSkeleton(skeleton: Skeleton): { root: Bone; bones: Bone[] } {
    const root = skeleton.bones[0];
    return { root, bones: skeleton.bones };
  }

  // ── Mammal Skeleton ──────────────────────────────────────────────

  private buildMammalSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;
    const spineCount = cfg.spineSegments ?? 6;
    const tailCount = cfg.tailSegments ?? 5;

    // Root
    const root = this.makeBone('root', 0, 0, 0);

    // Spine chain
    const spineBones: Bone[] = [];
    let parent: Bone = root;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const spine = this.makeBone(`spine_${i}`, 0, s * (0.3 + t * 0.15), -s * 0.3 + t * s * 0.6);
      parent.add(spine);
      spineBones.push(spine);
      parent = spine;
    }

    // Skull attached to last spine
    const skull = this.makeBone('skull', 0, s * 0.45, s * 0.35);
    spineBones[spineBones.length - 1].add(skull);

    // Jaw
    const jaw = this.makeBone('jaw', 0, s * 0.38, s * 0.45);
    skull.add(jaw);

    // Ribs (pairs from spine segments 1-4)
    for (let i = 1; i < Math.min(5, spineCount); i++) {
      const ribL = this.makeBone(`rib_L_${i}`, -s * 0.15, 0, 0);
      spineBones[i].add(ribL);
      const ribR = this.makeBone(`rib_R_${i}`, s * 0.15, 0, 0);
      spineBones[i].add(ribR);
    }

    // Scapula (shoulder blades) at front spine
    const scapulaL = this.makeBone('scapula_L', -s * 0.18, s * 0.1, s * 0.15);
    spineBones[1].add(scapulaL);
    const scapulaR = this.makeBone('scapula_R', s * 0.18, s * 0.1, s * 0.15);
    spineBones[1].add(scapulaR);

    // Pelvis at rear spine
    const pelvis = this.makeBone('pelvis', 0, s * 0.2, -s * 0.2);
    spineBones[spineCount - 2].add(pelvis);

    // Front legs (attached to scapula)
    this.buildLeg(scapulaL, 'front_L', s, s * 0.2, s * 0.2, s * 0.08);
    this.buildLeg(scapulaR, 'front_R', s, s * 0.2, s * 0.2, s * 0.08);

    // Hind legs (attached to pelvis)
    this.buildLeg(pelvis, 'hind_L', -s * 0.18, s * 0.25, s * 0.22, s * 0.1);
    this.buildHindLeg(pelvis, 'hind_L', s, s * 0.25, s * 0.22);
    this.buildHindLeg(pelvis, 'hind_R', s, s * 0.25, s * 0.22);

    // Tail
    let tailParent: Bone = spineBones[spineCount - 1];
    for (let i = 0; i < tailCount; i++) {
      const tail = this.makeBone(`tail_${i}`, 0, s * 0.05, -s * 0.08 * (1 - i * 0.15));
      tailParent.add(tail);
      tailParent = tail;
    }

    return root;
  }

  // ── Bird Skeleton ────────────────────────────────────────────────

  private buildBirdSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;
    const spineCount = cfg.spineSegments ?? 5;

    const root = this.makeBone('root', 0, 0, 0);

    // Spine
    const spineBones: Bone[] = [];
    let parent: Bone = root;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const spine = this.makeBone(`spine_${i}`, 0, s * (0.35 + t * 0.1), -s * 0.2 + t * s * 0.4);
      parent.add(spine);
      spineBones.push(spine);
      parent = spine;
    }

    // Skull
    const skull = this.makeBone('skull', 0, s * 0.45, s * 0.35);
    spineBones[spineBones.length - 1].add(skull);

    // Beak
    const beak = this.makeBone('beak', 0, s * 0.43, s * 0.5);
    skull.add(beak);

    // Keel (breastbone)
    const keel = this.makeBone('keel', 0, s * 0.2, s * 0.05);
    spineBones[2].add(keel);

    // Wings (attached to front spine segments)
    const wingRootL = this.makeBone('wing_root_L', -s * 0.15, s * 0.1, s * 0.1);
    spineBones[1].add(wingRootL);
    this.buildWing(wingRootL, 'L', s);

    const wingRootR = this.makeBone('wing_root_R', s * 0.15, s * 0.1, s * 0.1);
    spineBones[1].add(wingRootR);
    this.buildWing(wingRootR, 'R', s);

    // Legs (2, from pelvis)
    const pelvis = this.makeBone('pelvis', 0, s * 0.25, -s * 0.1);
    spineBones[spineCount - 2].add(pelvis);

    // Bird legs: femur → tibiotarsus → tarsometatarsus → toes
    const legPositions = [
      { x: -s * 0.1, side: 'L' },
      { x: s * 0.1, side: 'R' },
    ];
    for (const lp of legPositions) {
      const femur = this.makeBone(`femur_${lp.side}`, lp.x, 0, 0);
      pelvis.add(femur);

      const tibiotarsus = this.makeBone(`tibiotarsus_${lp.side}`, 0, -s * 0.15, 0);
      femur.add(tibiotarsus);

      const tarsometatarsus = this.makeBone(`tarsometatarsus_${lp.side}`, 0, -s * 0.12, s * 0.02);
      tibiotarsus.add(tarsometatarsus);

      const toes = this.makeBone(`toes_${lp.side}`, 0, -s * 0.05, s * 0.03);
      tarsometatarsus.add(toes);
    }

    // Tail (pygostyle)
    const tailRoot = this.makeBone('tail_0', 0, s * 0.1, -s * 0.15);
    spineBones[spineBones.length - 1].add(tailRoot);
    const pygostyle = this.makeBone('pygostyle', 0, s * 0.02, -s * 0.08);
    tailRoot.add(pygostyle);

    return root;
  }

  // ── Fish Skeleton ────────────────────────────────────────────────

  private buildFishSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;
    const spineCount = cfg.spineSegments ?? 8;

    const root = this.makeBone('root', 0, 0, 0);

    // Spine (horizontal for fish)
    const spineBones: Bone[] = [];
    let parent: Bone = root;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const spine = this.makeBone(`spine_${i}`, 0, 0, -s * 0.4 + t * s * 0.8);
      parent.add(spine);
      spineBones.push(spine);
      parent = spine;
    }

    // Skull at front
    const skull = this.makeBone('skull', 0, s * 0.03, s * 0.4);
    spineBones[0].add(skull);

    // Jaw
    const jaw = this.makeBone('jaw', 0, -s * 0.02, s * 0.48);
    skull.add(jaw);

    // Ribs (neural + haemal arches)
    for (let i = 1; i < spineCount - 1; i++) {
      const ribUp = this.makeBone(`neural_arch_${i}`, 0, s * 0.08, 0);
      spineBones[i].add(ribUp);
      const ribDown = this.makeBone(`haemal_arch_${i}`, 0, -s * 0.06, 0);
      spineBones[i].add(ribDown);
    }

    // Dorsal fin spine
    const dorsalBase = this.makeBone('dorsal_base', 0, s * 0.1, 0);
    spineBones[3].add(dorsalBase);
    const dorsalMid = this.makeBone('dorsal_mid', 0, s * 0.12, -s * 0.1);
    dorsalBase.add(dorsalMid);
    const dorsalTip = this.makeBone('dorsal_tip', 0, s * 0.08, -s * 0.1);
    dorsalMid.add(dorsalTip);

    // Caudal peduncle + tail
    const caudalPeduncle = this.makeBone('caudal_peduncle', 0, 0, -s * 0.35);
    spineBones[spineCount - 1].add(caudalPeduncle);

    const caudalUpper = this.makeBone('caudal_upper', 0, s * 0.08, -s * 0.1);
    caudalPeduncle.add(caudalUpper);
    const caudalLower = this.makeBone('caudal_lower', 0, -s * 0.08, -s * 0.1);
    caudalPeduncle.add(caudalLower);

    // Pectoral fins (2)
    const pectoralL = this.makeBone('pectoral_fin_L', -s * 0.1, 0, s * 0.15);
    spineBones[1].add(pectoralL);
    const pectoralR = this.makeBone('pectoral_fin_R', s * 0.1, 0, s * 0.15);
    spineBones[1].add(pectoralR);

    // Pelvic fins
    const pelvicL = this.makeBone('pelvic_fin_L', -s * 0.06, -s * 0.03, 0);
    spineBones[3].add(pelvicL);
    const pelvicR = this.makeBone('pelvic_fin_R', s * 0.06, -s * 0.03, 0);
    spineBones[3].add(pelvicR);

    // Anal fin
    const analFin = this.makeBone('anal_fin', 0, -s * 0.06, -s * 0.15);
    spineBones[spineCount - 2].add(analFin);

    return root;
  }

  // ── Reptile Skeleton ─────────────────────────────────────────────

  private buildReptileSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;
    const spineCount = cfg.spineSegments ?? 8;
    const tailCount = cfg.tailSegments ?? 8;

    const root = this.makeBone('root', 0, 0, 0);

    // Spine
    const spineBones: Bone[] = [];
    let parent: Bone = root;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const spine = this.makeBone(`spine_${i}`, 0, s * (0.12 + t * 0.08), -s * 0.3 + t * s * 0.6);
      parent.add(spine);
      spineBones.push(spine);
      parent = spine;
    }

    // Skull
    const skull = this.makeBone('skull', 0, s * 0.2, s * 0.35);
    spineBones[spineBones.length - 1].add(skull);

    // Jaw
    const jaw = this.makeBone('jaw', 0, s * 0.14, s * 0.42);
    skull.add(jaw);

    // Ribs
    for (let i = 1; i < spineCount - 1; i++) {
      const ribL = this.makeBone(`rib_L_${i}`, -s * 0.1, 0, 0);
      spineBones[i].add(ribL);
      const ribR = this.makeBone(`rib_R_${i}`, s * 0.1, 0, 0);
      spineBones[i].add(ribR);
    }

    // 4 splayed legs
    // Front legs from spine segment 2
    this.buildSplayedLeg(spineBones[2], 'front_L', -s * 0.15, s, 0.7);
    this.buildSplayedLeg(spineBones[2], 'front_R', s * 0.15, s, 0.7);

    // Hind legs from spine segment spineCount-2
    this.buildSplayedLeg(spineBones[spineCount - 2], 'hind_L', -s * 0.15, s, 0.8);
    this.buildSplayedLeg(spineBones[spineCount - 2], 'hind_R', s * 0.15, s, 0.8);

    // Long tail
    let tailParent: Bone = spineBones[spineBones.length - 1];
    for (let i = 0; i < tailCount; i++) {
      const seg = this.makeBone(`tail_${i}`, 0, s * 0.02 * (1 - i / tailCount), -s * 0.06);
      tailParent.add(seg);
      tailParent = seg;
    }

    return root;
  }

  // ── Insect Skeleton ──────────────────────────────────────────────

  private buildInsectSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;

    const root = this.makeBone('root', 0, 0, 0);

    // Head
    const head = this.makeBone('head', 0, s * 0.15, s * 0.25);
    root.add(head);

    // Antennae (2)
    if (cfg.hasAntennae !== false) {
      const antennaL = this.makeBone('antenna_L', -s * 0.04, s * 0.05, s * 0.1);
      head.add(antennaL);
      const antennaLTip = this.makeBone('antenna_L_tip', -s * 0.02, s * 0.06, s * 0.08);
      antennaL.add(antennaLTip);

      const antennaR = this.makeBone('antenna_R', s * 0.04, s * 0.05, s * 0.1);
      head.add(antennaR);
      const antennaRTip = this.makeBone('antenna_R_tip', s * 0.02, s * 0.06, s * 0.08);
      antennaR.add(antennaRTip);
    }

    // Thorax: 3 segments
    const prothorax = this.makeBone('prothorax', 0, s * 0.1, s * 0.08);
    root.add(prothorax);

    const mesothorax = this.makeBone('mesothorax', 0, s * 0.1, -s * 0.02);
    root.add(mesothorax);

    const metathorax = this.makeBone('metathorax', 0, s * 0.1, -s * 0.12);
    root.add(metathorax);

    // 6 legs from thorax segments (2 per segment)
    // Prothorax legs
    this.buildInsectLeg(prothorax, 'pro_L', -s * 0.08, s);
    this.buildInsectLeg(prothorax, 'pro_R', s * 0.08, s);
    // Mesothorax legs
    this.buildInsectLeg(mesothorax, 'meso_L', -s * 0.08, s);
    this.buildInsectLeg(mesothorax, 'meso_R', s * 0.08, s);
    // Metathorax legs
    this.buildInsectLeg(metathorax, 'meta_L', -s * 0.08, s);
    this.buildInsectLeg(metathorax, 'meta_R', s * 0.08, s);

    // Abdomen
    const abdomen = this.makeBone('abdomen', 0, s * 0.08, -s * 0.25);
    root.add(abdomen);
    const abdomenTip = this.makeBone('abdomen_tip', 0, s * 0.05, -s * 0.12);
    abdomen.add(abdomenTip);

    // Optional wings
    if (cfg.hasWings) {
      const wingL = this.makeBone('wing_L', -s * 0.06, s * 0.08, 0);
      mesothorax.add(wingL);
      const wingR = this.makeBone('wing_R', s * 0.06, s * 0.08, 0);
      mesothorax.add(wingR);
    }

    return root;
  }

  // ── Amphibian Skeleton ───────────────────────────────────────────

  private buildAmphibianSkeleton(cfg: CreatureSkeletonConfig): Bone {
    const s = cfg.size ?? 1.0;
    const spineCount = cfg.spineSegments ?? 6;
    const tailCount = cfg.tailSegments ?? 6;

    const root = this.makeBone('root', 0, 0, 0);

    // Spine
    const spineBones: Bone[] = [];
    let parent: Bone = root;
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const spine = this.makeBone(`spine_${i}`, 0, s * (0.15 + t * 0.1), -s * 0.2 + t * s * 0.4);
      parent.add(spine);
      spineBones.push(spine);
      parent = spine;
    }

    // Skull
    const skull = this.makeBone('skull', 0, s * 0.3, s * 0.3);
    spineBones[spineBones.length - 1].add(skull);

    // Jaw
    const jaw = this.makeBone('jaw', 0, s * 0.22, s * 0.38);
    skull.add(jaw);

    // Front legs (smaller) from spine segment 2
    this.buildAmphibianLeg(spineBones[2], 'front_L', -s * 0.12, s * 0.12, s * 0.1);
    this.buildAmphibianLeg(spineBones[2], 'front_R', s * 0.12, s * 0.12, s * 0.1);

    // Hind legs (larger) from pelvis
    const pelvis = this.makeBone('pelvis', 0, s * 0.15, -s * 0.1);
    spineBones[spineCount - 2].add(pelvis);

    this.buildAmphibianLeg(pelvis, 'hind_L', -s * 0.15, s * 0.2, s * 0.18);
    this.buildAmphibianLeg(pelvis, 'hind_R', s * 0.15, s * 0.2, s * 0.18);

    // Tail (for aquatic amphibians)
    let tailParent: Bone = spineBones[spineBones.length - 1];
    for (let i = 0; i < tailCount; i++) {
      const seg = this.makeBone(`tail_${i}`, 0, s * 0.03 * (1 - i / tailCount), -s * 0.06);
      tailParent.add(seg);
      tailParent = seg;
    }

    return root;
  }

  // ── Leg Builders ─────────────────────────────────────────────────

  private buildLeg(parent: Bone, prefix: string, s: number, upperLen: number, lowerLen: number, _footSize: number): void {
    const humerus = this.makeBone(`humerus_${prefix}`, 0, 0, 0);
    parent.add(humerus);

    const radius = this.makeBone(`radius_${prefix}`, 0, -upperLen, 0);
    humerus.add(radius);

    const hand = this.makeBone(`hand_${prefix}`, 0, -lowerLen, 0);
    radius.add(hand);
  }

  private buildHindLeg(parent: Bone, prefix: string, s: number, upperLen: number, lowerLen: number): void {
    // Offset for left/right
    const xOff = prefix.endsWith('L') ? -s * 0.18 : s * 0.18;

    const femur = this.makeBone(`femur_${prefix}`, xOff, 0, 0);
    parent.add(femur);

    const tibia = this.makeBone(`tibia_${prefix}`, 0, -upperLen, 0);
    femur.add(tibia);

    const foot = this.makeBone(`foot_${prefix}`, 0, -lowerLen, s * 0.02);
    tibia.add(foot);
  }

  private buildSplayedLeg(parent: Bone, prefix: string, xOff: number, s: number, scale: number): void {
    const legRoot = this.makeBone(`leg_${prefix}`, xOff, 0, 0);
    parent.add(legRoot);

    const upper = this.makeBone(`upper_${prefix}`, xOff > 0 ? s * 0.05 : -s * 0.05, -s * 0.06 * scale, 0);
    legRoot.add(upper);

    const lower = this.makeBone(`lower_${prefix}`, xOff > 0 ? s * 0.04 : -s * 0.04, -s * 0.06 * scale, 0);
    upper.add(lower);

    const foot = this.makeBone(`foot_${prefix}`, 0, -s * 0.02 * scale, s * 0.02);
    lower.add(foot);
  }

  private buildInsectLeg(parent: Bone, prefix: string, xOff: number, s: number): void {
    const coxa = this.makeBone(`coxa_${prefix}`, xOff, -s * 0.02, 0);
    parent.add(coxa);

    const femur = this.makeBone(`femur_${prefix}`, xOff > 0 ? s * 0.04 : -s * 0.04, -s * 0.04, 0);
    coxa.add(femur);

    const tibia = this.makeBone(`tibia_${prefix}`, xOff > 0 ? s * 0.03 : -s * 0.03, -s * 0.05, 0);
    femur.add(tibia);

    const tarsus = this.makeBone(`tarsus_${prefix}`, 0, -s * 0.02, s * 0.01);
    tibia.add(tarsus);
  }

  private buildWing(parent: Bone, side: string, s: number): void {
    const dir = side === 'L' ? -1 : 1;

    const humerus = this.makeBone(`wing_humerus_${side}`, dir * s * 0.08, s * 0.02, 0);
    parent.add(humerus);

    const radius = this.makeBone(`wing_radius_${side}`, dir * s * 0.12, 0, 0);
    humerus.add(radius);

    const carpals = this.makeBone(`wing_carpals_${side}`, dir * s * 0.1, 0, 0);
    radius.add(carpals);

    const primaries = this.makeBone(`wing_primaries_${side}`, dir * s * 0.08, 0, -s * 0.03);
    carpals.add(primaries);
  }

  private buildAmphibianLeg(parent: Bone, prefix: string, xOff: number, upperLen: number, lowerLen: number): void {
    const legRoot = this.makeBone(`leg_${prefix}`, xOff, 0, 0);
    parent.add(legRoot);

    const upper = this.makeBone(`upper_${prefix}`, 0, -upperLen * 0.5, 0);
    legRoot.add(upper);

    const lower = this.makeBone(`lower_${prefix}`, 0, -upperLen * 0.5, 0);
    upper.add(lower);

    const foot = this.makeBone(`foot_${prefix}`, 0, -lowerLen * 0.3, lowerLen * 0.2);
    lower.add(foot);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private makeBone(name: string, x: number, y: number, z: number): Bone {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    (bone as any).index = this.boneIndex++;
    return bone;
  }

  private collectBones(root: Bone, bones: Bone[]): void {
    bones.push(root);
    for (const child of root.children) {
      if (child instanceof Bone) {
        this.collectBones(child, bones);
      }
    }
  }
}
