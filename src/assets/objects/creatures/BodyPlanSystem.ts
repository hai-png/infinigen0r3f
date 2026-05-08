/**
 * BodyPlanSystem - Template-based body plans for 6 canonical creature forms
 *
 * Each body plan defines: bone chain layout, proportion ranges, part attachments,
 * and locomotion type. Parameterized with species variation using seeded randomness.
 */

import { Vector3 } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ── Canonical Body Plan Types ────────────────────────────────────────

export type BodyPlanType =
  | 'quadruped'   // 4 legs, horizontal spine, head, tail (dog, deer, horse)
  | 'biped'       // 2 legs, vertical spine, arms, head (humanoid, bird)
  | 'serpentine'  // no legs, elongated body (snake, eel, worm)
  | 'avian'       // 2 legs, 2 wings, beak, tail feathers (bird, bat)
  | 'insectoid'   // 6 legs, segmented body, antennae (beetle, ant)
  | 'aquatic';    // fins, streamlined body, tail fin (fish, dolphin)

// ── Proportion Ranges ───────────────────────────────────────────────

export interface ProportionRange {
  min: number;
  max: number;
}

export interface BodyProportions {
  bodyLength: ProportionRange;      // total body length as multiple of size
  bodyWidth: ProportionRange;       // width relative to length
  bodyHeight: ProportionRange;      // height relative to length
  headSize: ProportionRange;        // head size relative to body
  legLength: ProportionRange;       // leg length relative to body height
  legThickness: ProportionRange;    // leg thickness relative to body width
  tailLength: ProportionRange;      // tail length relative to body length
  neckLength: ProportionRange;      // neck length
  armLength: ProportionRange;       // arm/wing length (for biped/avian)
  snoutLength: ProportionRange;     // snout/beak length relative to head
}

// ── Bone Chain Definition ───────────────────────────────────────────

export interface BoneChainNode {
  name: string;
  offset: Vector3;
  children: BoneChainNode[];
}

// ── Part Attachment Point ───────────────────────────────────────────

export interface PartAttachment {
  partType: 'head' | 'torso' | 'limb' | 'tail' | 'wing' | 'fin' | 'antenna' | 'ear' | 'horn';
  parentBone: string;
  offset: Vector3;
  side?: 'left' | 'right' | 'center';
  symmetry?: 'bilateral' | 'radial' | 'none';
}

// ── Resolved Body Plan (after parameter application) ────────────────

export interface ResolvedBodyPlan {
  type: BodyPlanType;
  size: number;
  proportions: {
    bodyLength: number;
    bodyWidth: number;
    bodyHeight: number;
    headSize: number;
    legLength: number;
    legThickness: number;
    tailLength: number;
    neckLength: number;
    armLength: number;
    snoutLength: number;
  };
  boneChain: BoneChainNode;
  attachments: PartAttachment[];
  legCount: number;
  hasWings: boolean;
  hasTail: boolean;
  locomotionType: LocomotionType;
  spineSegments: number;
  tailSegments: number;
}

export type LocomotionType =
  | 'quadruped_walk'
  | 'biped_walk'
  | 'serpentine_slither'
  | 'avian_hop'
  | 'insectoid_crawl'
  | 'aquatic_swim';

// ── Body Plan Templates ─────────────────────────────────────────────

const QUADRUPED_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 1.2, max: 2.0 },
  bodyWidth:   { min: 0.3, max: 0.5 },
  bodyHeight:  { min: 0.35, max: 0.55 },
  headSize:    { min: 0.2, max: 0.35 },
  legLength:   { min: 0.4, max: 0.7 },
  legThickness:{ min: 0.06, max: 0.12 },
  tailLength:  { min: 0.3, max: 0.8 },
  neckLength:  { min: 0.1, max: 0.3 },
  armLength:   { min: 0.0, max: 0.0 },
  snoutLength: { min: 0.1, max: 0.25 },
};

const BIPED_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 0.4, max: 0.6 },
  bodyWidth:   { min: 0.25, max: 0.4 },
  bodyHeight:  { min: 0.8, max: 1.4 },
  headSize:    { min: 0.15, max: 0.25 },
  legLength:   { min: 0.4, max: 0.6 },
  legThickness:{ min: 0.08, max: 0.14 },
  tailLength:  { min: 0.0, max: 0.15 },
  neckLength:  { min: 0.08, max: 0.15 },
  armLength:   { min: 0.35, max: 0.55 },
  snoutLength: { min: 0.05, max: 0.12 },
};

const SERPENTINE_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 2.0, max: 4.0 },
  bodyWidth:   { min: 0.06, max: 0.15 },
  bodyHeight:  { min: 0.06, max: 0.15 },
  headSize:    { min: 0.08, max: 0.15 },
  legLength:   { min: 0.0, max: 0.0 },
  legThickness:{ min: 0.0, max: 0.0 },
  tailLength:  { min: 0.2, max: 0.5 },
  neckLength:  { min: 0.0, max: 0.05 },
  armLength:   { min: 0.0, max: 0.0 },
  snoutLength: { min: 0.05, max: 0.12 },
};

const AVIAN_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 0.3, max: 0.6 },
  bodyWidth:   { min: 0.2, max: 0.35 },
  bodyHeight:  { min: 0.2, max: 0.35 },
  headSize:    { min: 0.12, max: 0.22 },
  legLength:   { min: 0.2, max: 0.45 },
  legThickness:{ min: 0.03, max: 0.06 },
  tailLength:  { min: 0.15, max: 0.4 },
  neckLength:  { min: 0.1, max: 0.25 },
  armLength:   { min: 0.6, max: 1.5 },
  snoutLength: { min: 0.08, max: 0.3 },
};

const INSECTOID_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 0.3, max: 0.8 },
  bodyWidth:   { min: 0.15, max: 0.3 },
  bodyHeight:  { min: 0.12, max: 0.25 },
  headSize:    { min: 0.12, max: 0.2 },
  legLength:   { min: 0.2, max: 0.5 },
  legThickness:{ min: 0.02, max: 0.05 },
  tailLength:  { min: 0.0, max: 0.15 },
  neckLength:  { min: 0.0, max: 0.03 },
  armLength:   { min: 0.0, max: 0.3 },
  snoutLength: { min: 0.03, max: 0.1 },
};

const AQUATIC_PROPORTIONS: BodyProportions = {
  bodyLength:  { min: 0.8, max: 2.5 },
  bodyWidth:   { min: 0.12, max: 0.3 },
  bodyHeight:  { min: 0.1, max: 0.25 },
  headSize:    { min: 0.1, max: 0.2 },
  legLength:   { min: 0.0, max: 0.0 },
  legThickness:{ min: 0.0, max: 0.0 },
  tailLength:  { min: 0.2, max: 0.5 },
  neckLength:  { min: 0.0, max: 0.05 },
  armLength:   { min: 0.0, max: 0.0 },
  snoutLength: { min: 0.08, max: 0.2 },
};

// ── Body Plan System ────────────────────────────────────────────────

export class BodyPlanSystem {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Create a resolved body plan for the given type with species variation
   */
  createBodyPlan(
    type: BodyPlanType,
    size: number = 1.0,
    overrides?: Partial<BodyProportions>,
  ): ResolvedBodyPlan {
    const template = this.getTemplate(type);
    const proportions = this.applyVariation(template, overrides);

    const spineSegments = this.getSpineSegmentCount(type);
    const tailSegments = this.getTailSegmentCount(type);

    return {
      type,
      size,
      proportions,
      boneChain: this.buildBoneChain(type, proportions, size, spineSegments, tailSegments),
      attachments: this.buildAttachments(type, proportions, size),
      legCount: this.getLegCount(type),
      hasWings: type === 'avian' || type === 'insectoid',
      hasTail: type !== 'biped' || proportions.tailLength > 0.01,
      locomotionType: this.getLocomotionType(type),
      spineSegments,
      tailSegments,
    };
  }

  /**
   * Get all available body plan types
   */
  getAvailableTypes(): BodyPlanType[] {
    return ['quadruped', 'biped', 'serpentine', 'avian', 'insectoid', 'aquatic'];
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private getTemplate(type: BodyPlanType): BodyProportions {
    switch (type) {
      case 'quadruped':   return QUADRUPED_PROPORTIONS;
      case 'biped':       return BIPED_PROPORTIONS;
      case 'serpentine':  return SERPENTINE_PROPORTIONS;
      case 'avian':       return AVIAN_PROPORTIONS;
      case 'insectoid':   return INSECTOID_PROPORTIONS;
      case 'aquatic':     return AQUATIC_PROPORTIONS;
    }
  }

  private applyVariation(
    template: BodyProportions,
    overrides?: Partial<BodyProportions>,
  ): ResolvedBodyPlan['proportions'] {
    const resolve = (range: ProportionRange, override?: ProportionRange): number => {
      const r = override ?? range;
      return this.rng.nextFloat(r.min, r.max);
    };

    return {
      bodyLength:   resolve(template.bodyLength, overrides?.bodyLength),
      bodyWidth:    resolve(template.bodyWidth, overrides?.bodyWidth),
      bodyHeight:   resolve(template.bodyHeight, overrides?.bodyHeight),
      headSize:     resolve(template.headSize, overrides?.headSize),
      legLength:    resolve(template.legLength, overrides?.legLength),
      legThickness: resolve(template.legThickness, overrides?.legThickness),
      tailLength:   resolve(template.tailLength, overrides?.tailLength),
      neckLength:   resolve(template.neckLength, overrides?.neckLength),
      armLength:    resolve(template.armLength, overrides?.armLength),
      snoutLength:  resolve(template.snoutLength, overrides?.snoutLength),
    };
  }

  private getLegCount(type: BodyPlanType): number {
    switch (type) {
      case 'quadruped':   return 4;
      case 'biped':       return 2;
      case 'serpentine':  return 0;
      case 'avian':       return 2;
      case 'insectoid':   return 6;
      case 'aquatic':     return 0;
    }
  }

  private getSpineSegmentCount(type: BodyPlanType): number {
    switch (type) {
      case 'serpentine':  return 12;
      case 'quadruped':   return 6;
      case 'biped':       return 5;
      case 'avian':       return 5;
      case 'insectoid':   return 3;
      case 'aquatic':     return 8;
    }
  }

  private getTailSegmentCount(type: BodyPlanType): number {
    switch (type) {
      case 'serpentine':  return 10;
      case 'quadruped':   return 5;
      case 'biped':       return 3;
      case 'avian':       return 2;
      case 'insectoid':   return 0;
      case 'aquatic':     return 4;
    }
  }

  private getLocomotionType(type: BodyPlanType): LocomotionType {
    switch (type) {
      case 'quadruped':   return 'quadruped_walk';
      case 'biped':       return 'biped_walk';
      case 'serpentine':  return 'serpentine_slither';
      case 'avian':       return 'avian_hop';
      case 'insectoid':   return 'insectoid_crawl';
      case 'aquatic':     return 'aquatic_swim';
    }
  }

  private buildBoneChain(
    type: BodyPlanType,
    p: ResolvedBodyPlan['proportions'],
    size: number,
    spineCount: number,
    tailCount: number,
  ): BoneChainNode {
    const s = size;

    const root: BoneChainNode = {
      name: 'root',
      offset: new Vector3(0, 0, 0),
      children: [],
    };

    // Spine chain
    const spineNodes: BoneChainNode[] = [];
    for (let i = 0; i < spineCount; i++) {
      const t = i / (spineCount - 1);
      const node: BoneChainNode = {
        name: `spine_${i}`,
        offset: new Vector3(
          0,
          s * (type === 'biped' ? p.bodyHeight * (0.5 + t * 0.3) : p.bodyHeight * (0.3 + t * 0.15)),
          type === 'serpentine'
            ? -s * p.bodyLength * 0.5 + t * s * p.bodyLength
            : -s * p.bodyLength * 0.3 + t * s * p.bodyLength * 0.6,
        ),
        children: [],
      };
      spineNodes.push(node);
    }

    // Chain the spine nodes
    for (let i = 1; i < spineNodes.length; i++) {
      spineNodes[i - 1].children.push(spineNodes[i]);
    }

    // Head
    const head: BoneChainNode = {
      name: 'skull',
      offset: new Vector3(0, s * p.bodyHeight * 0.1, s * p.headSize * 0.5),
      children: [
        {
          name: 'jaw',
          offset: new Vector3(0, -s * p.headSize * 0.3, s * p.snoutLength * 0.5),
          children: [],
        },
      ],
    };
    spineNodes[spineNodes.length - 1].children.push(head);

    // Legs for quadruped
    if (type === 'quadruped') {
      const frontSpine = spineNodes[1];
      const hindSpine = spineNodes[spineNodes.length - 2];
      for (const side of ['L', 'R'] as const) {
        const xOff = side === 'L' ? -s * p.bodyWidth * 0.5 : s * p.bodyWidth * 0.5;
        frontSpine.children.push(this.buildLegChain('front', side, xOff, s, p, 'paw'));
        hindSpine.children.push(this.buildLegChain('hind', side, xOff, s, p, 'paw'));
      }
    }

    // Legs for biped
    if (type === 'biped') {
      const pelvisSpine = spineNodes[spineNodes.length - 2];
      for (const side of ['L', 'R'] as const) {
        const xOff = side === 'L' ? -s * p.bodyWidth * 0.3 : s * p.bodyWidth * 0.3;
        pelvisSpine.children.push(this.buildLegChain('leg', side, xOff, s, p, 'hand'));
        // Arms
        const shoulderSpine = spineNodes[1];
        shoulderSpine.children.push(this.buildArmChain(side, xOff * 0.8, s, p));
      }
    }

    // Avian legs + wings
    if (type === 'avian') {
      const pelvisSpine = spineNodes[spineNodes.length - 2];
      for (const side of ['L', 'R'] as const) {
        const xOff = side === 'L' ? -s * p.bodyWidth * 0.3 : s * p.bodyWidth * 0.3;
        pelvisSpine.children.push(this.buildLegChain('leg', side, xOff, s, p, 'claw'));
        // Wings
        const shoulderSpine = spineNodes[1];
        shoulderSpine.children.push(this.buildWingChain(side, xOff, s, p));
      }
    }

    // Insectoid legs
    if (type === 'insectoid') {
      const segments = [spineNodes[0], spineNodes[1], spineNodes[2]];
      const prefixes = ['pro', 'meso', 'meta'];
      for (let i = 0; i < 3; i++) {
        for (const side of ['L', 'R'] as const) {
          const xOff = side === 'L' ? -s * p.bodyWidth * 0.4 : s * p.bodyWidth * 0.4;
          segments[i].children.push(this.buildInsectLegChain(prefixes[i], side, xOff, s, p));
        }
      }
    }

    // Tail
    if (tailCount > 0) {
      let tailParent = spineNodes[spineNodes.length - 1];
      for (let i = 0; i < tailCount; i++) {
        const tNode: BoneChainNode = {
          name: `tail_${i}`,
          offset: new Vector3(0, s * 0.02 * (1 - i / tailCount), -s * p.tailLength / tailCount),
          children: [],
        };
        tailParent.children.push(tNode);
        tailParent = tNode;
      }
    }

    // Aquatic fins
    if (type === 'aquatic') {
      const finSpine = spineNodes[3];
      for (const side of ['L', 'R'] as const) {
        const xOff = side === 'L' ? -s * p.bodyWidth * 0.6 : s * p.bodyWidth * 0.6;
        finSpine.children.push({
          name: `pectoral_fin_${side}`,
          offset: new Vector3(xOff, 0, s * 0.05),
          children: [],
        });
      }
      // Dorsal
      finSpine.children.push({
        name: 'dorsal_fin',
        offset: new Vector3(0, s * p.bodyHeight * 0.5, 0),
        children: [],
      });
    }

    root.children.push(spineNodes[0]);
    return root;
  }

  private buildLegChain(
    prefix: string,
    side: string,
    xOff: number,
    s: number,
    p: ResolvedBodyPlan['proportions'],
    footType: string,
  ): BoneChainNode {
    const upperName = prefix === 'front'
      ? `humerus_front_${side}`
      : `femur_${prefix}_${side}`;
    const lowerName = prefix === 'front'
      ? `radius_front_${side}`
      : `tibia_${prefix}_${side}`;
    const footName = prefix === 'front'
      ? `hand_front_${side}`
      : `foot_${prefix}_${side}`;

    return {
      name: upperName,
      offset: new Vector3(xOff, 0, 0),
      children: [
        {
          name: lowerName,
          offset: new Vector3(0, -s * p.legLength * 0.5, 0),
          children: [
            {
              name: footName,
              offset: new Vector3(0, -s * p.legLength * 0.5, s * 0.02),
              children: [],
            },
          ],
        },
      ],
    };
  }

  private buildArmChain(
    side: string,
    xOff: number,
    s: number,
    p: ResolvedBodyPlan['proportions'],
  ): BoneChainNode {
    return {
      name: `humerus_arm_${side}`,
      offset: new Vector3(xOff, 0, 0),
      children: [
        {
          name: `radius_arm_${side}`,
          offset: new Vector3(side === 'L' ? -s * p.armLength * 0.5 : s * p.armLength * 0.5, -s * 0.05, 0),
          children: [
            {
              name: `hand_arm_${side}`,
              offset: new Vector3(side === 'L' ? -s * p.armLength * 0.4 : s * p.armLength * 0.4, 0, 0),
              children: [],
            },
          ],
        },
      ],
    };
  }

  private buildWingChain(
    side: string,
    xOff: number,
    s: number,
    p: ResolvedBodyPlan['proportions'],
  ): BoneChainNode {
    const dir = side === 'L' ? -1 : 1;
    return {
      name: `wing_humerus_${side}`,
      offset: new Vector3(dir * s * 0.1, s * 0.05, 0),
      children: [
        {
          name: `wing_radius_${side}`,
          offset: new Vector3(dir * s * p.armLength * 0.4, 0, 0),
          children: [
            {
              name: `wing_primaries_${side}`,
              offset: new Vector3(dir * s * p.armLength * 0.3, 0, -s * 0.03),
              children: [],
            },
          ],
        },
      ],
    };
  }

  private buildInsectLegChain(
    prefix: string,
    side: string,
    xOff: number,
    s: number,
    p: ResolvedBodyPlan['proportions'],
  ): BoneChainNode {
    const dir = side === 'L' ? -1 : 1;
    return {
      name: `coxa_${prefix}_${side}`,
      offset: new Vector3(xOff, -s * 0.02, 0),
      children: [
        {
          name: `femur_${prefix}_${side}`,
          offset: new Vector3(dir * s * 0.03, -s * p.legLength * 0.35, 0),
          children: [
            {
              name: `tibia_${prefix}_${side}`,
              offset: new Vector3(dir * s * 0.02, -s * p.legLength * 0.4, 0),
              children: [
                {
                  name: `tarsus_${prefix}_${side}`,
                  offset: new Vector3(0, -s * p.legLength * 0.15, s * 0.01),
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  private buildAttachments(
    type: BodyPlanType,
    p: ResolvedBodyPlan['proportions'],
    s: number,
  ): PartAttachment[] {
    const attachments: PartAttachment[] = [];

    // Head is always attached
    attachments.push({
      partType: 'head',
      parentBone: `spine_${this.getSpineSegmentCount(type) - 1}`,
      offset: new Vector3(0, s * p.bodyHeight * 0.15, s * p.headSize * 0.5),
      side: 'center',
      symmetry: 'none',
    });

    // Ears (quadruped, biped, avian)
    if (type === 'quadruped' || type === 'biped' || type === 'avian') {
      for (const side of ['left', 'right'] as const) {
        const xDir = side === 'left' ? -1 : 1;
        attachments.push({
          partType: 'ear',
          parentBone: 'skull',
          offset: new Vector3(xDir * s * p.headSize * 0.5, s * p.headSize * 0.3, 0),
          side,
          symmetry: 'bilateral',
        });
      }
    }

    // Antennae (insectoid)
    if (type === 'insectoid') {
      for (const side of ['left', 'right'] as const) {
        const xDir = side === 'left' ? -1 : 1;
        attachments.push({
          partType: 'antenna',
          parentBone: 'skull',
          offset: new Vector3(xDir * s * 0.04, s * p.headSize * 0.4, s * 0.08),
          side,
          symmetry: 'bilateral',
        });
      }
    }

    // Tail
    if (p.tailLength > 0.01) {
      attachments.push({
        partType: 'tail',
        parentBone: `spine_${this.getSpineSegmentCount(type) - 1}`,
        offset: new Vector3(0, 0, -s * p.bodyLength * 0.3),
        side: 'center',
        symmetry: 'none',
      });
    }

    // Wings (avian)
    if (type === 'avian') {
      for (const side of ['left', 'right'] as const) {
        attachments.push({
          partType: 'wing',
          parentBone: 'spine_1',
          offset: new Vector3(side === 'left' ? -1 : 1, s * p.bodyHeight * 0.2, 0),
          side,
          symmetry: 'bilateral',
        });
      }
    }

    // Fins (aquatic)
    if (type === 'aquatic') {
      for (const side of ['left', 'right'] as const) {
        attachments.push({
          partType: 'fin',
          parentBone: `pectoral_fin_${side === 'left' ? 'L' : 'R'}`,
          offset: new Vector3(0, 0, 0),
          side,
          symmetry: 'bilateral',
        });
      }
      attachments.push({
        partType: 'fin',
        parentBone: 'dorsal_fin',
        offset: new Vector3(0, 0, 0),
        side: 'center',
        symmetry: 'none',
      });
    }

    return attachments;
  }
}
