/**
 * LocomotionSystem - Walk cycle generation for each body plan type
 *
 * Supports:
 * - Quadruped walk: diagonal gait, body sway
 * - Biped walk: alternate leg swing, arm swing, head bob
 * - Serpentine slither: sinusoidal body wave
 * - Avian hop/waddle: two-phase gait
 * - Insectoid crawl: alternating tripod gait
 * - Aquatic swim: body wave + tail fin
 *
 * Speed control (walk, trot, run, sprint), direction changes,
 * and idle animations (breathing, looking around, tail wag)
 */

import { AnimationClip, NumberKeyframeTrack, LoopRepeat } from 'three';
import type { BodyPlanType, LocomotionType } from '../BodyPlanSystem';

// ── Speed Presets ───────────────────────────────────────────────────

export type SpeedLevel = 'walk' | 'trot' | 'run' | 'sprint';

const SPEED_MULTIPLIERS: Record<SpeedLevel, number> = {
  walk:   1.0,
  trot:   1.5,
  run:    2.2,
  sprint: 3.0,
};

// ── Locomotion Config ───────────────────────────────────────────────

export interface LocomotionConfig {
  bodyPlanType: BodyPlanType;
  locomotionType: LocomotionType;
  size: number;
  speed: SpeedLevel;
  speedMultiplier: number;
  strideLength: number;
  bodyScale: number;
  spineSegments: number;
  tailSegments: number;
}

// ── LocomotionSystem ────────────────────────────────────────────────

export class LocomotionSystem {
  /**
   * Generate a walk cycle animation clip for the given body plan
   */
  static generateWalkClip(config: LocomotionConfig): AnimationClip {
    const speed = SPEED_MULTIPLIERS[config.speed] * config.speedMultiplier;
    const stride = config.strideLength * config.bodyScale;
    const scale = config.bodyScale;
    const duration = Math.max(0.4, 1.5 / speed);

    switch (config.locomotionType) {
      case 'quadruped_walk':
        return LocomotionSystem.quadrupedWalk(duration, stride, scale, config.spineSegments, config.tailSegments);
      case 'biped_walk':
        return LocomotionSystem.bipedWalk(duration, stride, scale, config.tailSegments);
      case 'serpentine_slither':
        return LocomotionSystem.serpentineSlither(duration, stride, scale, config.spineSegments);
      case 'avian_hop':
        return LocomotionSystem.avianHop(duration, stride, scale, config.tailSegments);
      case 'insectoid_crawl':
        return LocomotionSystem.insectoidCrawl(duration, stride, scale);
      case 'aquatic_swim':
        return LocomotionSystem.aquaticSwim(duration, stride, scale, config.spineSegments, config.tailSegments);
    }
  }

  /**
   * Generate an idle animation clip
   */
  static generateIdleClip(
    bodyPlanType: BodyPlanType,
    bodyScale: number,
    tailSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const duration = 3.0;
    const scale = bodyScale;
    const stepsPerSecond = 20;

    // Breathing: subtle spine Y scale oscillation
    const breathCycle = duration / 3;
    const breathTimes: number[] = [];
    const breathValues: number[] = [];
    for (let t = 0; t <= duration; t += 1 / stepsPerSecond) {
      breathTimes.push(t);
      breathValues.push(1.0 + 0.015 * scale * Math.sin((2 * Math.PI * t) / breathCycle));
    }

    for (let i = 0; i < 6; i++) {
      tracks.push(new NumberKeyframeTrack(`spine_${i}.scale[y]`, breathTimes, breathValues));
    }

    // Head subtle look-around
    const headTimes: number[] = [];
    const headRotY: number[] = [];
    const headRotX: number[] = [];
    for (let t = 0; t <= duration; t += 0.15) {
      headTimes.push(t);
      headRotY.push(0.03 * scale * Math.sin((2 * Math.PI * t) / duration));
      headRotX.push(0.015 * scale * Math.sin((2 * Math.PI * t) / (duration * 0.7) + 1.0));
    }
    tracks.push(new NumberKeyframeTrack('skull.rotation[y]', headTimes, headRotY));
    tracks.push(new NumberKeyframeTrack('skull.rotation[x]', headTimes, headRotX));

    // Tail wag (for creatures with tails)
    if (tailSegments > 0) {
      for (let i = 0; i < Math.min(tailSegments, 5); i++) {
        const tailTimes: number[] = [];
        const tailRotY: number[] = [];
        const amp = (0.08 + i * 0.06) * scale;
        const phase = i * 0.3;

        for (let t = 0; t <= duration; t += 0.1) {
          tailTimes.push(t);
          tailRotY.push(amp * Math.sin((2 * Math.PI * t * 1.5) / duration + phase));
        }
        tracks.push(new NumberKeyframeTrack(`tail_${i}.rotation[y]`, tailTimes, tailRotY));
      }
    }

    const clip = new AnimationClip('idle', duration, tracks);
    return clip;
  }

  // ── Quadruped Walk ───────────────────────────────────────────────

  private static quadrupedWalk(
    duration: number,
    stride: number,
    scale: number,
    _spineSegments: number,
    tailSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    const legs = [
      { name: 'front_L', phase: 0.0 },
      { name: 'hind_R', phase: 0.25 },
      { name: 'front_R', phase: 0.5 },
      { name: 'hind_L', phase: 0.75 },
    ];

    for (const leg of legs) {
      const hipTimes: number[] = [];
      const hipRotX: number[] = [];
      const kneeTimes: number[] = [];
      const kneeRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;
        const hipAngle = stride * scale * Math.sin(2 * Math.PI * phase) * 0.5;
        hipTimes.push(t);
        hipRotX.push(hipAngle);

        const swing = Math.sin(Math.PI * phase);
        const kneeAngle = -stride * scale * 0.3 * Math.max(0, swing);
        kneeTimes.push(t);
        kneeRotX.push(kneeAngle);
      }

      const upperBone = leg.name.startsWith('front')
        ? `humerus_front_${leg.name.split('_')[1]}`
        : `femur_hind_${leg.name.split('_')[1]}`;
      const lowerBone = leg.name.startsWith('front')
        ? `radius_front_${leg.name.split('_')[1]}`
        : `tibia_hind_${leg.name.split('_')[1]}`;

      tracks.push(new NumberKeyframeTrack(`${upperBone}.rotation[x]`, hipTimes, hipRotX));
      tracks.push(new NumberKeyframeTrack(`${lowerBone}.rotation[x]`, kneeTimes, kneeRotX));
    }

    // Body vertical bob
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      bodyTimes.push(t);
      bodyY.push(0.02 * scale * Math.abs(Math.sin(2 * Math.PI * (t / duration) * 2)));
    }
    tracks.push(new NumberKeyframeTrack('root.position[y]', bodyTimes, bodyY));

    // Head bob
    const headTimes: number[] = [];
    const headRotX: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      headTimes.push(t);
      headRotX.push(-0.03 * scale * Math.sin(2 * Math.PI * (t / duration) * 2));
    }
    tracks.push(new NumberKeyframeTrack('skull.rotation[x]', headTimes, headRotX));

    // Tail sway
    for (let i = 0; i < Math.min(tailSegments, 5); i++) {
      const tailTimes: number[] = [];
      const tailRotY: number[] = [];
      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        tailTimes.push(t);
        const amp = (0.05 + i * 0.04) * scale * stride;
        tailRotY.push(amp * Math.sin(2 * Math.PI * (t / duration) + i * 0.3));
      }
      tracks.push(new NumberKeyframeTrack(`tail_${i}.rotation[y]`, tailTimes, tailRotY));
    }

    return new AnimationClip('walk', duration, tracks);
  }

  // ── Biped Walk ───────────────────────────────────────────────────

  private static bipedWalk(
    duration: number,
    stride: number,
    scale: number,
    tailSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    const legs = [
      { name: 'L', phase: 0.0 },
      { name: 'R', phase: 0.5 },
    ];

    for (const leg of legs) {
      const legTimes: number[] = [];
      const femurRotX: number[] = [];
      const tibiaRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;
        legTimes.push(t);
        femurRotX.push(stride * scale * Math.sin(2 * Math.PI * phase) * 0.4);
        const swing = Math.sin(Math.PI * phase);
        tibiaRotX.push(-stride * scale * 0.25 * Math.max(0, swing));
      }

      tracks.push(new NumberKeyframeTrack(`femur_leg_${leg.name}.rotation[x]`, legTimes, femurRotX));
      tracks.push(new NumberKeyframeTrack(`tibia_leg_${leg.name}.rotation[x]`, legTimes.slice(), tibiaRotX));

      // Arm swing (opposite to leg)
      const armTimes: number[] = [];
      const armRotX: number[] = [];
      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;
        armTimes.push(t);
        armRotX.push(-stride * scale * Math.sin(2 * Math.PI * phase) * 0.25);
      }
      tracks.push(new NumberKeyframeTrack(`humerus_arm_${leg.name}.rotation[x]`, armTimes, armRotX));
    }

    // Body bob
    const bodyYTimes: number[] = [];
    const bodyYValues: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      bodyYTimes.push(t);
      bodyYValues.push(0.015 * scale * Math.abs(Math.sin(2 * Math.PI * (t / duration) * 2)));
    }
    tracks.push(new NumberKeyframeTrack('root.position[y]', bodyYTimes, bodyYValues));

    // Head bob
    const headTimes: number[] = [];
    const headRotX: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      headTimes.push(t);
      headRotX.push(0.02 * scale * Math.sin(2 * Math.PI * (t / duration) * 2));
    }
    tracks.push(new NumberKeyframeTrack('skull.rotation[x]', headTimes, headRotX));

    // Tail
    for (let i = 0; i < Math.min(tailSegments, 3); i++) {
      const tailTimes: number[] = [];
      const tailRotY: number[] = [];
      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        tailTimes.push(t);
        tailRotY.push((0.03 + i * 0.02) * scale * Math.sin(2 * Math.PI * (t / duration) + i * 0.4));
      }
      tracks.push(new NumberKeyframeTrack(`tail_${i}.rotation[y]`, tailTimes, tailRotY));
    }

    return new AnimationClip('walk', duration, tracks);
  }

  // ── Serpentine Slither ───────────────────────────────────────────

  private static serpentineSlither(
    duration: number,
    stride: number,
    scale: number,
    spineSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    // Sinusoidal body wave propagating along spine
    for (let i = 0; i < spineSegments; i++) {
      const times: number[] = [];
      const rotY: number[] = [];
      const amp = stride * scale * 0.3 * (0.3 + (i / spineSegments) * 0.7);

      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        times.push(t);
        const phase = (t / duration) * 2 * Math.PI + i * 0.5;
        rotY.push(amp * Math.sin(phase));
      }
      tracks.push(new NumberKeyframeTrack(`spine_${i}.rotation[y]`, times, rotY));
    }

    // Slight forward motion
    const posTimes: number[] = [];
    const posZ: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      posTimes.push(t);
      posZ.push(stride * scale * 0.1 * t / duration);
    }
    tracks.push(new NumberKeyframeTrack('root.position[z]', posTimes, posZ));

    // Head steering
    const headTimes: number[] = [];
    const headRotY: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      headTimes.push(t);
      headRotY.push(stride * scale * 0.2 * Math.sin((2 * Math.PI * t) / duration));
    }
    tracks.push(new NumberKeyframeTrack('skull.rotation[y]', headTimes, headRotY));

    return new AnimationClip('slither', duration, tracks);
  }

  // ── Avian Hop/Waddle ─────────────────────────────────────────────

  private static avianHop(
    duration: number,
    stride: number,
    scale: number,
    tailSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    // Two-phase gait: both legs push, then both land
    for (const side of ['L', 'R']) {
      const legTimes: number[] = [];
      const femurRotX: number[] = [];
      const tibiaRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration) % 1.0;
        legTimes.push(t);

        // Hop phase: legs push back then forward
        const hopPhase = Math.sin(2 * Math.PI * phase);
        femurRotX.push(stride * scale * 0.3 * hopPhase);
        tibiaRotX.push(-stride * scale * 0.2 * Math.max(0, hopPhase));
      }

      tracks.push(new NumberKeyframeTrack(`femur_leg_${side}.rotation[x]`, legTimes, femurRotX));
      tracks.push(new NumberKeyframeTrack(`tibia_leg_${side}.rotation[x]`, legTimes.slice(), tibiaRotX));
    }

    // Body vertical hop
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = (t / duration) % 1.0;
      bodyTimes.push(t);
      bodyY.push(0.04 * scale * Math.abs(Math.sin(2 * Math.PI * phase)));
    }
    tracks.push(new NumberKeyframeTrack('root.position[y]', bodyTimes, bodyY));

    // Wing flap (subtle balance)
    for (const side of ['L', 'R']) {
      const wingTimes: number[] = [];
      const wingRotZ: number[] = [];
      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        wingTimes.push(t);
        const flap = 0.1 * scale * Math.sin(2 * Math.PI * (t / duration));
        wingRotZ.push(side === 'L' ? flap : -flap);
      }
      tracks.push(new NumberKeyframeTrack(`wing_humerus_${side}.rotation[z]`, wingTimes, wingRotZ));
    }

    // Tail bob
    for (let i = 0; i < Math.min(tailSegments, 2); i++) {
      const tailTimes: number[] = [];
      const tailRotX: number[] = [];
      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        tailTimes.push(t);
        tailRotX.push(0.05 * scale * Math.sin(2 * Math.PI * (t / duration) + i * 0.3));
      }
      tracks.push(new NumberKeyframeTrack(`tail_${i}.rotation[x]`, tailTimes, tailRotX));
    }

    return new AnimationClip('hop', duration, tracks);
  }

  // ── Insectoid Crawl (Tripod Gait) ───────────────────────────────

  private static insectoidCrawl(
    duration: number,
    stride: number,
    scale: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    // Alternating tripod: Group A (pro_L, meso_R, meta_L) vs Group B
    const legs = [
      { name: 'pro_L', phase: 0.0 },
      { name: 'meso_R', phase: 0.0 },
      { name: 'meta_L', phase: 0.0 },
      { name: 'pro_R', phase: 0.5 },
      { name: 'meso_L', phase: 0.5 },
      { name: 'meta_R', phase: 0.5 },
    ];

    for (const leg of legs) {
      const legTimes: number[] = [];
      const coxaRotY: number[] = [];
      const femurRotX: number[] = [];
      const tibiaRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;
        legTimes.push(t);
        coxaRotY.push(stride * scale * 0.3 * Math.sin(2 * Math.PI * phase));
        const swing = Math.sin(Math.PI * phase);
        femurRotX.push(-stride * scale * 0.2 * Math.max(0, swing));
        tibiaRotX.push(stride * scale * 0.15 * Math.max(0, swing));
      }

      tracks.push(new NumberKeyframeTrack(`coxa_${leg.name}.rotation[y]`, legTimes, coxaRotY));
      tracks.push(new NumberKeyframeTrack(`femur_${leg.name}.rotation[x]`, legTimes.slice(), femurRotX));
      tracks.push(new NumberKeyframeTrack(`tibia_${leg.name}.rotation[x]`, legTimes.slice(), tibiaRotX));
    }

    // Minimal body bob (3-point support = smooth)
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      bodyTimes.push(t);
      bodyY.push(0.005 * scale * Math.abs(Math.sin(2 * Math.PI * (t / duration) * 2)));
    }
    tracks.push(new NumberKeyframeTrack('root.position[y]', bodyTimes, bodyY));

    // Antenna sway
    for (const side of ['L', 'R']) {
      const antTimes: number[] = [];
      const antRotX: number[] = [];
      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        antTimes.push(t);
        antRotX.push(0.05 * scale * Math.sin(2 * Math.PI * (t / duration) * 2 + (side === 'R' ? 1.0 : 0)));
      }
      tracks.push(new NumberKeyframeTrack(`antenna_${side}.rotation[x]`, antTimes, antRotX));
    }

    return new AnimationClip('crawl', duration, tracks);
  }

  // ── Aquatic Swim ─────────────────────────────────────────────────

  private static aquaticSwim(
    duration: number,
    stride: number,
    scale: number,
    spineSegments: number,
    tailSegments: number,
  ): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const fps = 30;
    const totalSteps = Math.ceil(duration * fps);
    const dt = duration / totalSteps;

    // Body wave propagating along spine
    for (let i = 0; i < spineSegments; i++) {
      const times: number[] = [];
      const rotY: number[] = [];
      const amp = stride * scale * 0.15 * (0.2 + (i / spineSegments) * 0.8);

      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        times.push(t);
        const phase = (t / duration) * 2 * Math.PI + i * 0.4;
        rotY.push(amp * Math.sin(phase));
      }
      tracks.push(new NumberKeyframeTrack(`spine_${i}.rotation[y]`, times, rotY));
    }

    // Tail fin motion (amplified wave)
    for (let i = 0; i < tailSegments; i++) {
      const tailTimes: number[] = [];
      const tailRotY: number[] = [];
      const amp = stride * scale * 0.3 * (1 + i * 0.3);

      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        tailTimes.push(t);
        const phase = (t / duration) * 2 * Math.PI + (spineSegments + i) * 0.4;
        tailRotY.push(amp * Math.sin(phase));
      }
      tracks.push(new NumberKeyframeTrack(`tail_${i}.rotation[y]`, tailTimes, tailRotY));
    }

    // Pectoral fin flutter
    for (const side of ['L', 'R']) {
      const finTimes: number[] = [];
      const finRotZ: number[] = [];
      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        finTimes.push(t);
        finRotZ.push((side === 'L' ? 1 : -1) * 0.15 * scale * Math.sin(2 * Math.PI * (t / duration) * 3));
      }
      tracks.push(new NumberKeyframeTrack(`pectoral_fin_${side}.rotation[z]`, finTimes, finRotZ));
    }

    // Forward motion
    const posTimes: number[] = [];
    const posZ: number[] = [];
    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      posTimes.push(t);
      posZ.push(stride * scale * 0.15 * t / duration);
    }
    tracks.push(new NumberKeyframeTrack('root.position[z]', posTimes, posZ));

    return new AnimationClip('swim', duration, tracks);
  }
}
