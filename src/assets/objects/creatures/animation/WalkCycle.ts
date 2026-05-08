/**
 * WalkCycle - Generates walk cycle animation clips for different gaits
 * Supports quadruped walk, biped walk, and insect tripod gait
 * Duration: 1-2 seconds per cycle, loop mode: LoopRepeat
 */

import { AnimationClip, NumberKeyframeTrack } from 'three';

export type GaitType = 'biped' | 'quadruped' | 'hexapod';

export interface WalkCycleParams {
  speed?: number;        // Movement speed multiplier (0.5 - 2.0)
  strideLength?: number; // How far each stride reaches (0.1 - 1.0)
  bodyScale?: number;    // Scale of the creature for proportionate movement
}

export class WalkCycle {
  constructor(private seed?: number) {}

  /**
   * Generate a walk cycle animation clip for the given gait type
   */
  generate(gait: GaitType = 'quadruped', speed: number = 1.0, params: WalkCycleParams = {}): AnimationClip {
    const strideLength = params.strideLength ?? 0.3;
    const bodyScale = params.bodyScale ?? 1.0;
    const duration = Math.max(0.5, 1.5 / speed); // 1-2 seconds at normal speed

    switch (gait) {
      case 'quadruped':
        return this.generateQuadrupedWalk(duration, strideLength, bodyScale);
      case 'biped':
        return this.generateBipedWalk(duration, strideLength, bodyScale);
      case 'hexapod':
        return this.generateHexapodWalk(duration, strideLength, bodyScale);
      default:
        return this.generateQuadrupedWalk(duration, strideLength, bodyScale);
    }
  }

  // ── Quadruped Walk (4-phase gait: LF → RH → RF → LH) ───────────

  private generateQuadrupedWalk(duration: number, stride: number, scale: number): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const stepsPerSecond = 30;
    const totalSteps = Math.ceil(duration * stepsPerSecond);
    const dt = duration / totalSteps;

    // 4-phase gait timing: each leg is offset by 25% of the cycle
    // Phase order: LF(0.00) → RH(0.25) → RF(0.50) → LH(0.75)
    const legs = [
      { name: 'front_L', phase: 0.00 },
      { name: 'hind_R',  phase: 0.25 },
      { name: 'front_R', phase: 0.50 },
      { name: 'hind_L',  phase: 0.75 },
    ];

    // Generate per-leg tracks
    for (const leg of legs) {
      const hipTimes: number[] = [];
      const hipRotX: number[] = [];
      const kneeTimes: number[] = [];
      const kneeRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;

        // Hip flexion/extension: swing forward then back
        // During swing phase (0-0.5): flex forward (negative rotation)
        // During stance phase (0.5-1.0): extend backward (positive rotation)
        const hipAngle = stride * scale * Math.sin(2 * Math.PI * phase) * 0.5;

        hipTimes.push(t);
        hipRotX.push(hipAngle);

        // Knee: flexes during swing, extends during stance
        // More flexion during swing phase
        const swingPhase = Math.sin(Math.PI * phase);
        const kneeAngle = -stride * scale * 0.3 * Math.max(0, swingPhase);

        kneeTimes.push(t);
        kneeRotX.push(kneeAngle);
      }

      // Upper leg (humerus/femur) rotation
      const upperBoneName = leg.name.startsWith('front') ? `humerus_${leg.name}` : `femur_${leg.name}`;
      const lowerBoneName = leg.name.startsWith('front') ? `radius_${leg.name}` : `tibia_${leg.name}`;

      tracks.push(new NumberKeyframeTrack(
        `${upperBoneName}.rotation[x]`,
        hipTimes,
        hipRotX
      ));
      tracks.push(new NumberKeyframeTrack(
        `${lowerBoneName}.rotation[x]`,
        kneeTimes,
        kneeRotX
      ));
    }

    // Body vertical bob (up-down oscillation synced to gait)
    // Two bobs per full cycle (each diagonal pair)
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      bodyTimes.push(t);
      // Bob frequency is 2x the gait frequency (each pair causes a bob)
      const bob = 0.02 * scale * Math.abs(Math.sin(2 * Math.PI * phase * 2));
      bodyY.push(bob);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.position[y]',
      bodyTimes,
      bodyY
    ));

    // Head bob (opposite phase to body)
    const headTimes: number[] = [];
    const headRotX: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      headTimes.push(t);
      const headBob = -0.03 * scale * Math.sin(2 * Math.PI * phase * 2);
      headRotX.push(headBob);
    }

    tracks.push(new NumberKeyframeTrack(
      'skull.rotation[x]',
      headTimes,
      headRotX
    ));

    // Tail counter-sway
    const tailSegments = 5;
    for (let i = 0; i < tailSegments; i++) {
      const tailTimes: number[] = [];
      const tailRotY: number[] = [];

      for (let j = 0; j <= totalSteps; j++) {
        const t = j * dt;
        const phase = t / duration;
        tailTimes.push(t);
        // Tail sways opposite to body, increasing amplitude toward tip
        const amp = (0.05 + i * 0.04) * scale * stride;
        const sway = amp * Math.sin(2 * Math.PI * phase + i * 0.3);
        tailRotY.push(sway);
      }

      tracks.push(new NumberKeyframeTrack(
        `tail_${i}.rotation[y]`,
        tailTimes,
        tailRotY
      ));
    }

    return new AnimationClip('walk', duration, tracks);
  }

  // ── Biped Walk (2-phase gait) ────────────────────────────────────

  private generateBipedWalk(duration: number, stride: number, scale: number): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const stepsPerSecond = 30;
    const totalSteps = Math.ceil(duration * stepsPerSecond);
    const dt = duration / totalSteps;

    // Two legs, 50% phase offset
    const legs = [
      { name: 'L', phase: 0.0 },
      { name: 'R', phase: 0.5 },
    ];

    for (const leg of legs) {
      const legTimes: number[] = [];
      const femurRotX: number[] = [];
      const tibiaRotX: number[] = [];
      const footRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        const phase = (t / duration + leg.phase) % 1.0;

        // Femur swing
        const femurAngle = stride * scale * Math.sin(2 * Math.PI * phase) * 0.4;
        legTimes.push(t);
        femurRotX.push(femurAngle);

        // Tibia (knee flexion during swing)
        const swing = Math.sin(Math.PI * phase);
        const tibiaAngle = -stride * scale * 0.25 * Math.max(0, swing);
        tibiaRotX.push(tibiaAngle);

        // Foot (dorsiflexion during swing)
        const footAngle = stride * scale * 0.15 * Math.max(0, swing);
        footRotX.push(footAngle);
      }

      tracks.push(new NumberKeyframeTrack(
        `femur_${leg.name}.rotation[x]`,
        legTimes,
        femurRotX
      ));
      tracks.push(new NumberKeyframeTrack(
        `tibiotarsus_${leg.name}.rotation[x]`,
        legTimes.slice(),
        tibiaRotX
      ));
      tracks.push(new NumberKeyframeTrack(
        `tarsometatarsus_${leg.name}.rotation[x]`,
        legTimes.slice(),
        footRotX
      ));
    }

    // Body lean (slight lateral sway)
    const bodyTimes: number[] = [];
    const bodyRotZ: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      bodyTimes.push(t);
      const lean = 0.02 * scale * Math.sin(2 * Math.PI * phase);
      bodyRotZ.push(lean);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.rotation[z]',
      bodyTimes,
      bodyRotZ
    ));

    // Body vertical bob
    const bodyYTimes: number[] = [];
    const bodyYValues: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      bodyYTimes.push(t);
      // Bob at 2x frequency (each step)
      const bob = 0.015 * scale * Math.abs(Math.sin(2 * Math.PI * phase * 2));
      bodyYValues.push(bob);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.position[y]',
      bodyYTimes,
      bodyYValues
    ));

    // Wing flap for birds (subtle)
    for (const side of ['L', 'R']) {
      const wingTimes: number[] = [];
      const wingRotZ: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        wingTimes.push(t);
        const flap = 0.05 * scale * Math.sin(2 * Math.PI * t / duration * 2);
        wingRotZ.push(side === 'L' ? flap : -flap);
      }

      tracks.push(new NumberKeyframeTrack(
        `wing_humerus_${side}.rotation[z]`,
        wingTimes,
        wingRotZ
      ));
    }

    return new AnimationClip('walk', duration, tracks);
  }

  // ── Hexapod Walk (Alternating Tripod Gait) ───────────────────────

  private generateHexapodWalk(duration: number, stride: number, scale: number): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const stepsPerSecond = 30;
    const totalSteps = Math.ceil(duration * stepsPerSecond);
    const dt = duration / totalSteps;

    // Alternating tripod: Group A (pro_L, meso_R, meta_L) vs Group B (pro_R, meso_L, meta_R)
    const legs = [
      // Group A: phase 0
      { name: 'pro_L',  phase: 0.0,  segment: 'pro' },
      { name: 'meso_R', phase: 0.0,  segment: 'meso' },
      { name: 'meta_L', phase: 0.0,  segment: 'meta' },
      // Group B: phase 0.5
      { name: 'pro_R',  phase: 0.5,  segment: 'pro' },
      { name: 'meso_L', phase: 0.5,  segment: 'meso' },
      { name: 'meta_R', phase: 0.5,  segment: 'meta' },
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

        // Coxa (hip): forward/backward swing in Y rotation
        const coxaAngle = stride * scale * 0.3 * Math.sin(2 * Math.PI * phase);
        coxaRotY.push(coxaAngle);

        // Femur: lift during swing
        const swing = Math.sin(Math.PI * phase);
        const femurAngle = -stride * scale * 0.2 * Math.max(0, swing);
        femurRotX.push(femurAngle);

        // Tibia: flex during swing
        const tibiaAngle = stride * scale * 0.15 * Math.max(0, swing);
        tibiaRotX.push(tibiaAngle);
      }

      tracks.push(new NumberKeyframeTrack(
        `coxa_${leg.name}.rotation[y]`,
        legTimes,
        coxaRotY
      ));
      tracks.push(new NumberKeyframeTrack(
        `femur_${leg.name}.rotation[x]`,
        legTimes.slice(),
        femurRotX
      ));
      tracks.push(new NumberKeyframeTrack(
        `tibia_${leg.name}.rotation[x]`,
        legTimes.slice(),
        tibiaRotX
      ));
    }

    // Body bob for hexapod (3-point support = smoother)
    const bodyTimes: number[] = [];
    const bodyY: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      bodyTimes.push(t);
      const bob = 0.008 * scale * Math.abs(Math.sin(2 * Math.PI * phase * 2));
      bodyY.push(bob);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.position[y]',
      bodyTimes,
      bodyY
    ));

    // Slight body pitch
    const pitchTimes: number[] = [];
    const pitchValues: number[] = [];

    for (let i = 0; i <= totalSteps; i++) {
      const t = i * dt;
      const phase = t / duration;
      pitchTimes.push(t);
      const pitch = 0.01 * scale * Math.sin(2 * Math.PI * phase);
      pitchValues.push(pitch);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.rotation[x]',
      pitchTimes,
      pitchValues
    ));

    // Antenna sway
    for (const side of ['L', 'R']) {
      const antTimes: number[] = [];
      const antRotX: number[] = [];

      for (let i = 0; i <= totalSteps; i++) {
        const t = i * dt;
        antTimes.push(t);
        const sway = 0.05 * scale * Math.sin(2 * Math.PI * t / duration * 2 + (side === 'R' ? 1.0 : 0));
        antRotX.push(sway);
      }

      tracks.push(new NumberKeyframeTrack(
        `antenna_${side}.rotation[x]`,
        antTimes,
        antRotX
      ));
    }

    return new AnimationClip('walk', duration, tracks);
  }
}
