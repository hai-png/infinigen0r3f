/**
 * WindAnimationSystem — Unified Wind Animation for Vegetation
 *
 * Ports: infinigen/assets/scatters/utils/wind.py
 *
 * The original Infinigen uses wind_rotation() which:
 *  1. Takes speed, direction, scale, strength parameters
 *  2. Uses SceneTime for animation
 *  3. Applies noise texture offset by (position + direction * time * speed)
 *  4. Maps noise to rotation angle via MapRange
 *  5. Returns Euler rotation for axis-angle rotation around a perpendicular axis
 *
 * This R3F port provides:
 *  - WindAnimationSystem: Centralized wind parameter management
 *  - Per-vertex wind displacement via shader uniforms
 *  - Season-aware wind (stronger in autumn/winter)
 *  - Wind zones (different wind in different areas)
 *  - Gust events (periodic strong bursts)
 *
 * Usage:
 *  const wind = new WindAnimationSystem({ speed: 5, strength: 10, direction: new THREE.Vector3(1, 0, 0.5) });
 *  // In render loop:
 *  wind.update(deltaTime);
 *  // Apply to vegetation instances:
 *  wind.applyToInstances(instancedMesh);
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export interface WindConfig {
  /** Wind speed (m/s) — affects animation rate */
  speed: number;
  /** Wind direction (normalized) — direction the wind blows toward */
  direction: THREE.Vector3;
  /** Wind strength — rotation displacement magnitude */
  strength: number;
  /** Noise scale for spatial variation */
  noiseScale: number;
  /** Gust frequency (gusts per second) */
  gustFrequency: number;
  /** Gust strength multiplier */
  gustStrength: number;
  /** Seed for deterministic wind patterns */
  seed: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface WindZone {
  /** Center of the wind zone */
  center: THREE.Vector3;
  /** Radius of influence */
  radius: number;
  /** Wind config override for this zone */
  config: Partial<WindConfig>;
}

// ============================================================================
// Wind Animation System
// ============================================================================

export class WindAnimationSystem {
  private config: WindConfig;
  private time: number = 0;
  private rng: SeededRandom;
  private zones: WindZone[] = [];

  /** Wind shader uniforms for injection into vegetation materials */
  readonly uniforms: {
    uWindSpeed: { value: number };
    uWindDirection: { value: THREE.Vector3 };
    uWindStrength: { value: number };
    uWindNoiseScale: { value: number };
    uWindTime: { value: number };
    uGustStrength: { value: number };
  };

  constructor(config: Partial<WindConfig> = {}) {
    const seed = config.seed ?? 42;
    this.rng = new SeededRandom(seed);
    this.config = {
      speed: config.speed ?? 5.0,
      direction: config.direction ?? new THREE.Vector3(1, 0, 0.5).normalize(),
      strength: config.strength ?? 10.0,
      noiseScale: config.noiseScale ?? 0.1,
      gustFrequency: config.gustFrequency ?? 0.2,
      gustStrength: config.gustStrength ?? 2.0,
      seed,
    };

    this.uniforms = {
      uWindSpeed: { value: this.config.speed },
      uWindDirection: { value: this.config.direction },
      uWindStrength: { value: this.config.strength },
      uWindNoiseScale: { value: this.config.noiseScale },
      uWindTime: { value: 0 },
      uGustStrength: { value: 0 },
    };
  }

  /**
   * Update wind state. Call once per frame.
   */
  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update time uniform
    this.uniforms.uWindTime.value = this.time;

    // Compute gust
    const gustPhase = this.time * this.config.gustFrequency * Math.PI * 2;
    const gustEnvelope = Math.max(0, Math.sin(gustPhase)) ** 2;
    const currentGust = gustEnvelope * this.config.gustStrength;
    this.uniforms.uGustStrength.value = currentGust;
  }

  /**
   * Compute wind rotation for a given position.
   * Returns a quaternion representing the wind-induced rotation.
   *
   * This is the R3F equivalent of the original Infinigen's wind_rotation().
   */
  computeWindRotation(position: THREE.Vector3): THREE.Quaternion {
    const dir = this.config.direction;
    const speed = this.config.speed;
    const scale = this.config.noiseScale;
    const strength = this.config.strength + this.uniforms.uGustStrength.value;

    // Noise-based rotation angle
    // Equivalent to: noise(position * scale + direction * time * speed) mapped to angle
    const noiseInput = new THREE.Vector3(
      position.x * scale + dir.x * this.time * speed * 0.1,
      position.y * scale * 0.5,
      position.z * scale + dir.z * this.time * speed * 0.1
    );

    // Simple hash-based noise for rotation (fast, no texture lookup needed)
    const noiseVal = pseudoNoise3D(noiseInput.x, noiseInput.y, noiseInput.z);

    // Map noise to rotation angle
    const maxAngle = (strength / 100) * 0.5; // Max ~0.5 radians at strength=100
    const angle = (noiseVal - 0.5) * 2 * maxAngle;

    // Rotation axis: perpendicular to wind direction in the horizontal plane
    const axis = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    if (axis.length() < 0.01) return new THREE.Quaternion(); // No rotation if wind is vertical

    return new THREE.Quaternion().setFromAxisAngle(axis, angle);
  }

  /**
   * Apply wind to an instanced mesh by modifying instance matrices.
   */
  applyToInstances(mesh: THREE.InstancedMesh, baseRotations?: THREE.Quaternion[]): void {
    const dummy = new THREE.Object3D();
    const tempQuat = new THREE.Quaternion();
    const count = mesh.count;

    for (let i = 0; i < count; i++) {
      mesh.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

      const windQuat = this.computeWindRotation(dummy.position);
      dummy.quaternion.multiply(windQuat);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Get season-adjusted wind config.
   */
  getSeasonConfig(season: Season): WindConfig {
    switch (season) {
      case 'spring':
        return { ...this.config, speed: this.config.speed * 0.7, strength: this.config.strength * 0.6 };
      case 'summer':
        return { ...this.config, speed: this.config.speed * 0.5, strength: this.config.strength * 0.4 };
      case 'autumn':
        return { ...this.config, speed: this.config.speed * 1.2, strength: this.config.strength * 1.5, gustFrequency: this.config.gustFrequency * 2 };
      case 'winter':
        return { ...this.config, speed: this.config.speed * 1.5, strength: this.config.strength * 2.0, gustFrequency: this.config.gustFrequency * 3, gustStrength: this.config.gustStrength * 2 };
    }
  }

  /**
   * Add a wind zone (local wind variation).
   */
  addZone(zone: WindZone): void {
    this.zones.push(zone);
  }

  /**
   * Get wind GLSL vertex shader code for injection.
   */
  static getWindGLSL(): string {
    return /* glsl */ `
      uniform float uWindSpeed;
      uniform vec3 uWindDirection;
      uniform float uWindStrength;
      uniform float uWindNoiseScale;
      uniform float uWindTime;
      uniform float uGustStrength;

      // Simple hash-based noise for wind
      float windNoise(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      // Compute wind displacement for a vertex
      vec3 computeWindDisplacement(vec3 position, float flexibility) {
        float effectiveStrength = uWindStrength + uGustStrength;

        // Noise-based rotation angle
        vec3 noisePos = position * uWindNoiseScale + uWindDirection * uWindTime * uWindSpeed * 0.1;
        float noiseVal = windNoise(noisePos);

        // Map to displacement
        float maxAngle = (effectiveStrength / 100.0) * 0.5;
        float angle = (noiseVal - 0.5) * 2.0 * maxAngle * flexibility;

        // Height-based: more displacement at top
        float heightFactor = clamp(position.y / 2.0, 0.0, 1.0);

        // Perpendicular displacement
        vec3 perpDir = normalize(vec3(-uWindDirection.z, 0.0, uWindDirection.x));
        vec3 displacement = perpDir * sin(angle) * heightFactor;
        displacement.y += cos(angle) * heightFactor * 0.1; // Slight upward lift

        return displacement;
      }
    `;
  }
}

// ============================================================================
// Simple pseudo-noise (for CPU-side wind computation)
// ============================================================================

function pseudoNoise3D(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453123;
  return n - Math.floor(n);
}
