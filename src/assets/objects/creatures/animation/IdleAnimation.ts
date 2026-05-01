/**
 * IdleAnimation - Generates idle animation clips with breathing, sway, tail wag, and blink
 * Uses THREE.KeyframeTrack with THREE.NumberKeyframeTrack for all animations
 */

import { AnimationClip, NumberKeyframeTrack, LoopRepeat } from 'three';

export type IdleBehavior = 'breathing' | 'headTracking' | 'tailWagging';

export class IdleAnimation {
  constructor(private seed?: number) {}

  /**
   * Generate an idle animation clip with the specified behaviors
   * Duration: 2-4 seconds, loop mode: LoopRepeat
   */
  generate(behaviors: IdleBehavior[] = ['breathing', 'tailWagging']): AnimationClip {
    const tracks: NumberKeyframeTrack[] = [];
    const duration = 3.0; // 3 second idle loop

    for (const behavior of behaviors) {
      switch (behavior) {
        case 'breathing':
          this.addBreathingTracks(tracks, duration);
          break;
        case 'headTracking':
          this.addSwayTracks(tracks, duration);
          break;
        case 'tailWagging':
          this.addTailWagTracks(tracks, duration);
          break;
      }
    }

    // Always add blink
    this.addBlinkTracks(tracks, duration);

    const clip = new AnimationClip('idle', duration, tracks);
    return clip;
  }

  /**
   * Generate a minimal idle with just breathing and blink
   */
  generateMinimal(): AnimationClip {
    return this.generate(['breathing']);
  }

  // ── Breathing: subtle spine scale oscillation ────────────────────

  private addBreathingTracks(tracks: NumberKeyframeTrack[], duration: number): void {
    const breathCycle = duration / 3; // ~3 breath cycles per idle loop

    // Spine Y scale oscillation - subtle inhale/exhale
    // Scale the spine bones' Y to simulate chest expansion
    const times: number[] = [];
    const scaleY: number[] = [];

    for (let t = 0; t <= duration; t += 0.1) {
      times.push(t);
      // Breathing: sinusoidal oscillation with period = breathCycle
      const breath = 1.0 + 0.015 * Math.sin((2 * Math.PI * t) / breathCycle);
      scaleY.push(breath);
    }

    // Apply to spine_0 through spine_5 scale.y
    for (let i = 0; i < 6; i++) {
      tracks.push(new NumberKeyframeTrack(
        `spine_${i}.scale[y]`,
        times,
        scaleY
      ));
    }

    // Spine Z scale (slight expansion)
    const scaleZ: number[] = [];
    for (let t = 0; t <= duration; t += 0.1) {
      const breath = 1.0 + 0.008 * Math.sin((2 * Math.PI * t) / breathCycle);
      scaleZ.push(breath);
    }

    for (let i = 1; i < 5; i++) {
      tracks.push(new NumberKeyframeTrack(
        `spine_${i}.scale[z]`,
        times.slice(),
        scaleZ
      ));
    }
  }

  // ── Body Sway: rotation around Y axis ────────────────────────────

  private addSwayTracks(tracks: NumberKeyframeTrack[], duration: number): void {
    // Subtle body sway - root rotation around Y
    const swayTimes: number[] = [];
    const swayValues: number[] = [];

    for (let t = 0; t <= duration; t += 0.2) {
      swayTimes.push(t);
      const sway = 0.02 * Math.sin((2 * Math.PI * t) / duration);
      swayValues.push(sway);
    }

    tracks.push(new NumberKeyframeTrack(
      'root.rotation[y]',
      swayTimes,
      swayValues
    ));

    // Head subtle tracking rotation (slightly offset phase)
    const headTimes: number[] = [];
    const headValues: number[] = [];

    for (let t = 0; t <= duration; t += 0.2) {
      headTimes.push(t);
      const headSway = 0.03 * Math.sin((2 * Math.PI * t) / duration + 0.5);
      headValues.push(headSway);
    }

    tracks.push(new NumberKeyframeTrack(
      'skull.rotation[y]',
      headTimes,
      headValues
    ));

    // Head slight nod
    const nodTimes: number[] = [];
    const nodValues: number[] = [];

    for (let t = 0; t <= duration; t += 0.2) {
      nodTimes.push(t);
      const nod = 0.015 * Math.sin((2 * Math.PI * t) / (duration * 0.7) + 1.0);
      nodValues.push(nod);
    }

    tracks.push(new NumberKeyframeTrack(
      'skull.rotation[x]',
      nodTimes,
      nodValues
    ));
  }

  // ── Tail Wag/Sway ────────────────────────────────────────────────

  private addTailWagTracks(tracks: NumberKeyframeTrack[], duration: number): void {
    // Tail sways with sinusoidal Y rotation, with amplitude increasing toward tip
    const tailSegments = 5;
    const tailTimes: number[] = [];

    for (let t = 0; t <= duration; t += 0.1) {
      tailTimes.push(t);
    }

    for (let i = 0; i < tailSegments; i++) {
      const amplitude = 0.08 + i * 0.06; // Increasing sway toward tip
      const phaseOffset = i * 0.3; // Wave propagation down tail

      const rotY: number[] = [];
      const rotZ: number[] = [];

      for (let t = 0; t <= duration; t += 0.1) {
        const sway = amplitude * Math.sin((2 * Math.PI * t * 1.5) / duration + phaseOffset);
        rotY.push(sway);

        // Slight vertical bob
        const bob = amplitude * 0.3 * Math.cos((2 * Math.PI * t * 1.5) / duration + phaseOffset);
        rotZ.push(bob);
      }

      tracks.push(new NumberKeyframeTrack(
        `tail_${i}.rotation[y]`,
        tailTimes.slice(),
        rotY
      ));
      tracks.push(new NumberKeyframeTrack(
        `tail_${i}.rotation[z]`,
        tailTimes.slice(),
        rotZ
      ));
    }
  }

  // ── Eye Blink: scale Y to 0 and back ─────────────────────────────

  private addBlinkTracks(tracks: NumberKeyframeTrack[], duration: number): void {
    // Blink: rapid scale Y to 0 and back, 2-3 blinks per idle cycle
    const blinkTimes: number[] = [0];
    const blinkValues: number[] = [1.0];

    // Generate blink events at random-ish intervals
    const blinkIntervals = [0.8, 1.5, 2.4]; // Approximate blink times
    const blinkDuration = 0.12; // How long a blink takes

    for (const blinkTime of blinkIntervals) {
      if (blinkTime < duration) {
        // Start of blink (eyes closing)
        blinkTimes.push(blinkTime);
        blinkValues.push(1.0);

        // Eyes closed
        blinkTimes.push(blinkTime + blinkDuration * 0.3);
        blinkValues.push(0.05);

        // Eyes reopening
        blinkTimes.push(blinkTime + blinkDuration);
        blinkValues.push(1.0);
      }
    }

    // End
    blinkTimes.push(duration);
    blinkValues.push(1.0);

    // Apply to left and right eye scale Y
    tracks.push(new NumberKeyframeTrack(
      'leftEye.scale[y]',
      blinkTimes,
      blinkValues
    ));
    tracks.push(new NumberKeyframeTrack(
      'rightEye.scale[y]',
      blinkTimes,
      blinkValues
    ));
  }
}
