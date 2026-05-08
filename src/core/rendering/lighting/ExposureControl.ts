/**
 * ExposureControl — Automatic & Manual Exposure with Tone Mapping
 *
 * Provides automatic exposure based on scene luminance with smooth eye
 * adaptation, plus manual exposure override. Supports multiple tone mapping
 * presets for artistic control.
 *
 * Features:
 *   - Automatic exposure: measures average scene luminance and computes
 *     target exposure for "middle grey" (18% reflectance)
 *   - Eye adaptation: exposure smoothly transitions when the camera moves
 *     between bright and dark areas, simulating the human eye's adaptation
 *   - Manual exposure override: set a fixed exposure value
 *   - Tone mapping presets: Linear, Reinhard, ACES Filmic, Uncharted 2
 *   - Time-of-day integration: adjusts target exposure based on sun elevation
 *
 * Usage:
 *   const exposure = new ExposureControl();
 *   // In render loop:
 *   exposure.update(deltaTime, averageLuminance);
 *   renderer.toneMappingExposure = exposure.getExposure();
 *
 * @module rendering/lighting
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneMappingPreset =
  | 'linear'
  | 'reinhard'
  | 'aces'
  | 'uncharted2';

export interface ExposureConfig {
  /** Whether auto-exposure is enabled (default true) */
  autoExposure: boolean;
  /** Manual exposure value (used when autoExposure is false, default 1.0) */
  manualExposure: number;
  /** Key value for auto-exposure (default 0.18 = 18% middle grey) */
  keyValue: number;
  /** Minimum allowed exposure (default 0.1) */
  minExposure: number;
  /** Maximum allowed exposure (default 10.0) */
  maxExposure: number;
  /** Eye adaptation speed when brightening (default 3.0) — faster adaptation */
  adaptationSpeedUp: number;
  /** Eye adaptation speed when darkening (default 1.0) — slower adaptation */
  adaptationSpeedDown: number;
  /** Tone mapping preset (default 'aces') */
  toneMapping: ToneMappingPreset;
  /** Minimum average luminance to avoid log(0) (default 0.001) */
  minLuminance: number;
  /** White point for Reinhard/Uncharted2 (default 4.0) */
  whitePoint: number;
}

const DEFAULT_CONFIG: ExposureConfig = {
  autoExposure: true,
  manualExposure: 1.0,
  keyValue: 0.18,
  minExposure: 0.1,
  maxExposure: 10.0,
  adaptationSpeedUp: 3.0,
  adaptationSpeedDown: 1.0,
  toneMapping: 'aces',
  minLuminance: 0.001,
  whitePoint: 4.0,
};

// ---------------------------------------------------------------------------
// Tone mapping shader fragments (for custom shader integration)
// ---------------------------------------------------------------------------

export const TONE_MAPPING_SHADERS: Record<ToneMappingPreset, string> = {
  linear: /* glsl */ `
    vec3 toneMap(vec3 color) {
      return color;
    }
  `,
  reinhard: /* glsl */ `
    uniform float uWhitePoint;
    vec3 toneMap(vec3 color) {
      vec3 mapped = color / (color + vec3(1.0));
      mapped = mapped * (1.0 + mapped / (uWhitePoint * uWhitePoint));
      mapped = mapped / (1.0 + 1.0 / (uWhitePoint * uWhitePoint));
      return mapped;
    }
  `,
  aces: /* glsl */ `
    // ACES Filmic tone mapping (Stephen Hill's fit)
    vec3 toneMap(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
  `,
  uncharted2: /* glsl */ `
    uniform float uWhitePoint;
    vec3 uncharted2Tonemap(vec3 x) {
      float A = 0.15;
      float B = 0.50;
      float C = 0.10;
      float D = 0.20;
      float E = 0.02;
      float F = 0.30;
      return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
    }
    vec3 toneMap(vec3 color) {
      vec3 curr = uncharted2Tonemap(color);
      vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(uWhitePoint));
      return curr * whiteScale;
    }
  `,
};

// ---------------------------------------------------------------------------
// Three.js tone mapping constants
// ---------------------------------------------------------------------------

export const TONE_MAPPING_THREEJS: Record<ToneMappingPreset, THREE.ToneMapping> = {
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  uncharted2: THREE.ACESFilmicToneMapping, // Three.js doesn't have Uncharted2 built-in; ACES is closest
};

// ---------------------------------------------------------------------------
// ExposureControl
// ---------------------------------------------------------------------------

export class ExposureControl {
  readonly config: ExposureConfig;

  /** Current exposure value (smoothed) */
  private currentExposure: number;

  /** Target exposure value (before smoothing) */
  private targetExposure: number;

  /** Current average luminance (for debugging) */
  private currentLuminance: number = 0.5;

  /** Whether exposure has been initialized */
  private initialized: boolean = false;

  /** Luminance history for temporal stability */
  private luminanceHistory: number[] = [];
  private readonly HISTORY_SIZE = 8;

  constructor(config: Partial<ExposureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentExposure = this.config.manualExposure;
    this.targetExposure = this.config.manualExposure;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Update exposure based on scene luminance.
   *
   * @param deltaTime - Time since last frame in seconds
   * @param averageLuminance - Average scene luminance (0 to ~10+)
   */
  update(deltaTime: number, averageLuminance?: number): void {
    if (this.config.autoExposure && averageLuminance !== undefined) {
      this.currentLuminance = averageLuminance;

      // Add to history for temporal smoothing
      this.luminanceHistory.push(averageLuminance);
      if (this.luminanceHistory.length > this.HISTORY_SIZE) {
        this.luminanceHistory.shift();
      }

      // Use median of history for stability
      const sortedHistory = [...this.luminanceHistory].sort((a, b) => a - b);
      const medianLuminance = sortedHistory[Math.floor(sortedHistory.length / 2)] ?? averageLuminance;

      // Auto-exposure formula:
      // EV = log2(L_avg / key_value)
      // exposure = 2^EV = L_avg / key_value ... simplified:
      const safeLuminance = Math.max(medianLuminance, this.config.minLuminance);
      this.targetExposure = this.config.keyValue / safeLuminance;

      // Clamp to allowed range
      this.targetExposure = Math.max(
        this.config.minExposure,
        Math.min(this.config.maxExposure, this.targetExposure),
      );

      // First frame — snap to target (no interpolation)
      if (!this.initialized) {
        this.currentExposure = this.targetExposure;
        this.initialized = true;
        return;
      }

      // Eye adaptation: smooth transition
      // Use different speeds for brightening (going dark → bright) and darkening
      const isBrightening = this.targetExposure < this.currentExposure;
      const adaptationSpeed = isBrightening
        ? this.config.adaptationSpeedUp
        : this.config.adaptationSpeedDown;

      // Exponential smoothing
      const t = 1.0 - Math.exp(-deltaTime * adaptationSpeed);
      this.currentExposure += (this.targetExposure - this.currentExposure) * t;
    } else {
      // Manual exposure
      this.currentExposure = this.config.manualExposure;
    }
  }

  /**
   * Get the current exposure value.
   * Apply this to `renderer.toneMappingExposure`.
   */
  getExposure(): number {
    return this.currentExposure;
  }

  /**
   * Get the current average luminance.
   */
  getLuminance(): number {
    return this.currentLuminance;
  }

  /**
   * Get the target exposure (before smoothing).
   */
  getTargetExposure(): number {
    return this.targetExposure;
  }

  /**
   * Get the Three.js ToneMapping constant for the current preset.
   */
  getThreeJSToneMapping(): THREE.ToneMapping {
    return TONE_MAPPING_THREEJS[this.config.toneMapping];
  }

  /**
   * Get the tone mapping shader fragment for the current preset.
   * Useful for custom post-processing shaders.
   */
  getToneMappingShader(): string {
    return TONE_MAPPING_SHADERS[this.config.toneMapping];
  }

  /**
   * Apply exposure and tone mapping to the renderer.
   */
  applyToRenderer(renderer: THREE.WebGLRenderer): void {
    renderer.toneMapping = this.getThreeJSToneMapping();
    renderer.toneMappingExposure = this.getExposure();
  }

  /**
   * Update exposure for time-of-day changes.
   * Adjusts the target exposure based on sun elevation.
   *
   * @param sunElevation - Sun elevation angle in degrees (0=horizon, 90=zenith)
   */
  updateTimeOfDay(sunElevation: number): void {
    // At dawn/dusk (low elevation), we need more exposure
    // At noon (high elevation), we need less
    // This creates a multiplier that adjusts the auto-exposure
    const elevationRad = sunElevation * (Math.PI / 180);
    const dayFactor = Math.max(0, Math.sin(elevationRad)); // 0 at horizon, 1 at zenith

    // During golden hour (10-25 degrees), slightly boost exposure for warmth
    const goldenHourBoost = sunElevation > 10 && sunElevation < 25 ? 1.2 : 1.0;

    // Night time (below horizon) needs much more exposure
    if (sunElevation <= 0) {
      this.config.keyValue = 0.5; // Higher key value = more exposure
    } else {
      this.config.keyValue = 0.18 * goldenHourBoost / (0.5 + dayFactor * 0.5);
    }
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<ExposureConfig>): void {
    Object.assign(this.config, partial);

    if (!this.config.autoExposure) {
      this.currentExposure = this.config.manualExposure;
      this.targetExposure = this.config.manualExposure;
    }
  }

  /**
   * Force the current exposure to a specific value (bypasses adaptation).
   */
  forceExposure(exposure: number): void {
    this.currentExposure = exposure;
    this.targetExposure = exposure;
  }

  /**
   * Reset the adaptation state.
   */
  reset(): void {
    this.currentExposure = this.config.manualExposure;
    this.targetExposure = this.config.manualExposure;
    this.luminanceHistory = [];
    this.initialized = false;
  }

  /** Release resources. */
  dispose(): void {
    this.luminanceHistory = [];
  }
}

export default ExposureControl;
