/**
 * Lightning System
 *
 * Random lightning flashes during storm weather with:
 * - Directional light flash that illuminates the entire scene
 * - Optional bolt rendering (line geometry from cloud to ground)
 * - Thunder timing delay based on distance
 * - Controlled by storm intensity from WeatherTransitionManager
 *
 * @module LightningSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';

export interface LightningParams {
  /** Storm intensity 0-1, controls frequency and brightness */
  stormIntensity: number;
  /** Minimum time between lightning strikes (seconds) */
  minInterval: number;
  /** Maximum time between lightning strikes (seconds) */
  maxInterval: number;
  /** Flash brightness multiplier */
  flashIntensity: number;
  /** Flash duration in seconds */
  flashDuration: number;
  /** Whether to render visible bolt geometry */
  renderBolt: boolean;
  /** Bolt color */
  boltColor: THREE.Color;
  /** Glow color around bolt */
  glowColor: THREE.Color;
  /** Cloud height (bolt starts here) */
  cloudHeight: number;
  /** Ground level (bolt ends here) */
  groundLevel: number;
  /** Number of jagged segments in bolt */
  boltSegments: number;
  /** Maximum lateral displacement of bolt segments */
  boltJaggedness: number;
  /** Whether to enable double-flash (flicker) effect */
  enableDoubleFlash: boolean;
}

interface ActiveBolt {
  group: THREE.Group;
  flashLight: THREE.PointLight;
  age: number;
  lifetime: number;
  flickerPhase: number;
  hasFlickered: boolean;
}

export class LightningSystem {
  private scene: THREE.Scene;
  private params: LightningParams;
  private rng: SeededRandom;

  // Directional flash light (illuminates entire scene)
  private flashDirLight: THREE.DirectionalLight | null = null;
  private flashDirLightIntensity: number = 0;

  // Active bolts being rendered
  private activeBolts: ActiveBolt[] = [];

  // Timing
  private timeSinceLastStrike: number = 0;
  private nextStrikeDelay: number = 10;
  private enabled: boolean = false;

  // Reusable objects
  private boltMaterial: THREE.MeshBasicMaterial;
  private glowMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, params: Partial<LightningParams> = {}, seed: number = 42) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.params = {
      stormIntensity: params.stormIntensity ?? 0.8,
      minInterval: params.minInterval ?? 2,
      maxInterval: params.maxInterval ?? 12,
      flashIntensity: params.flashIntensity ?? 8,
      flashDuration: params.flashDuration ?? 0.15,
      renderBolt: params.renderBolt ?? true,
      boltColor: params.boltColor ?? new THREE.Color(0xeeeeff),
      glowColor: params.glowColor ?? new THREE.Color(0x8888ff),
      cloudHeight: params.cloudHeight ?? 70,
      groundLevel: params.groundLevel ?? 0,
      boltSegments: params.boltSegments ?? 8,
      boltJaggedness: params.boltJaggedness ?? 10,
      enableDoubleFlash: params.enableDoubleFlash ?? true,
    };

    this.boltMaterial = new THREE.MeshBasicMaterial({
      color: this.params.boltColor,
      transparent: true,
      opacity: 0.9,
    });

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: this.params.glowColor,
      transparent: true,
      opacity: 0.3,
    });

    this.scheduleNextStrike();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Enable or disable the lightning system.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearAllBolts();
    }
  }

  /**
   * Set storm intensity (0-1). Higher intensity = more frequent strikes.
   */
  setStormIntensity(intensity: number): void {
    this.params.stormIntensity = Math.max(0, Math.min(1, intensity));
    this.scheduleNextStrike();
  }

  /**
   * Update the lightning system. Call once per frame with deltaTime in seconds.
   */
  update(deltaTime: number): void {
    if (!this.enabled) return;

    this.timeSinceLastStrike += deltaTime;

    // Check if it's time for a new strike
    if (this.timeSinceLastStrike >= this.nextStrikeDelay) {
      this.triggerStrike();
      this.timeSinceLastStrike = 0;
      this.scheduleNextStrike();
    }

    // Update flash directional light
    this.updateFlashLight(deltaTime);

    // Update active bolts
    this.updateBolts(deltaTime);
  }

  /**
   * Manually trigger a lightning strike.
   */
  triggerStrike(): void {
    if (!this.enabled) return;

    const intensity = this.params.stormIntensity;
    const flashBrightness = this.params.flashIntensity * (0.5 + intensity * 0.5);

    // Create directional flash (illuminates entire scene briefly)
    this.activateDirectionalFlash(flashBrightness);

    // Create bolt geometry
    if (this.params.renderBolt) {
      this.createBolt(flashBrightness);
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clearAllBolts();
    this.boltMaterial.dispose();
    this.glowMaterial.dispose();

    if (this.flashDirLight) {
      this.scene.remove(this.flashDirLight);
      this.flashDirLight.dispose();
      this.flashDirLight = null;
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private scheduleNextStrike(): void {
    const intensity = this.params.stormIntensity;
    if (intensity <= 0) {
      this.nextStrikeDelay = Infinity;
      return;
    }

    // Higher intensity => shorter interval
    const range = this.params.maxInterval - this.params.minInterval;
    const factor = 1 - intensity * 0.8; // at intensity=1, factor=0.2
    this.nextStrikeDelay = this.params.minInterval + range * factor * this.rng.next();
  }

  private activateDirectionalFlash(brightness: number): void {
    if (!this.flashDirLight) {
      this.flashDirLight = new THREE.DirectionalLight(0xeeeeff, 0);
      this.flashDirLight.position.set(0, 100, 0);
      this.scene.add(this.flashDirLight);
    }

    this.flashDirLightIntensity = brightness;
    this.flashDirLight.intensity = brightness;
  }

  private updateFlashLight(deltaTime: number): void {
    if (!this.flashDirLight || this.flashDirLightIntensity <= 0) return;

    // Rapid exponential decay
    this.flashDirLightIntensity -= this.flashDirLightIntensity * deltaTime * 15;

    if (this.flashDirLightIntensity < 0.01) {
      this.flashDirLightIntensity = 0;
      this.flashDirLight.intensity = 0;
    } else {
      this.flashDirLight.intensity = this.flashDirLightIntensity;
    }
  }

  private createBolt(brightness: number): void {
    const startX = (this.rng.next() - 0.5) * 120;
    const startZ = (this.rng.next() - 0.5) * 120;
    const startY = this.params.cloudHeight;
    const endY = this.params.groundLevel;

    const group = new THREE.Group();
    const points: THREE.Vector3[] = [];

    // Generate jagged bolt path
    for (let i = 0; i <= this.params.boltSegments; i++) {
      const t = i / this.params.boltSegments;
      const y = startY + (endY - startY) * t;
      const jagX = i === 0 || i === this.params.boltSegments
        ? 0
        : (this.rng.next() - 0.5) * this.params.boltJaggedness;
      const jagZ = i === 0 || i === this.params.boltSegments
        ? 0
        : (this.rng.next() - 0.5) * this.params.boltJaggedness;
      points.push(new THREE.Vector3(startX + jagX, y, startZ + jagZ));
    }

    // Create bolt segments (thin cylinders)
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

      // Core bolt
      const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, length, 4);
      const boltMesh = new THREE.Mesh(boltGeo, this.boltMaterial);
      boltMesh.position.copy(midPoint);

      const axis = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
      boltMesh.quaternion.copy(quaternion);

      group.add(boltMesh);

      // Glow around bolt
      const glowGeo = new THREE.CylinderGeometry(0.4, 0.4, length, 4);
      const glowMesh = new THREE.Mesh(glowGeo, this.glowMaterial);
      glowMesh.position.copy(midPoint);
      glowMesh.quaternion.copy(quaternion);

      group.add(glowMesh);
    }

    // Optional branches (1-2 per bolt)
    const branchCount = Math.floor(this.rng.next() * 2) + 1;
    for (let b = 0; b < branchCount; b++) {
      const branchStartIdx = Math.floor(this.rng.next() * (points.length - 2)) + 1;
      const branchOrigin = points[branchStartIdx];
      const branchDir = new THREE.Vector3(
        (this.rng.next() - 0.5) * 15,
        -(this.rng.next() * 15 + 5),
        (this.rng.next() - 0.5) * 15
      );
      const branchEnd = branchOrigin.clone().add(branchDir);
      const branchMid = branchOrigin.clone().add(branchDir.multiplyScalar(0.5));
      const branchLength = branchOrigin.distanceTo(branchEnd);
      const branchDirNorm = new THREE.Vector3().subVectors(branchEnd, branchOrigin).normalize();

      const branchGeo = new THREE.CylinderGeometry(0.03, 0.03, branchLength, 4);
      const branchMesh = new THREE.Mesh(branchGeo, this.boltMaterial);
      branchMesh.position.copy(branchMid);

      const axis = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, branchDirNorm);
      branchMesh.quaternion.copy(quaternion);

      group.add(branchMesh);
    }

    // Point light at bolt position
    const flashLight = new THREE.PointLight(0xeeeeff, brightness, 400);
    flashLight.position.set(startX, startY * 0.6, startZ);
    group.add(flashLight);

    this.scene.add(group);

    const lifetime = this.params.flashDuration + this.rng.next() * 0.1;

    this.activeBolts.push({
      group,
      flashLight,
      age: 0,
      lifetime,
      flickerPhase: 0,
      hasFlickered: false,
    });
  }

  private updateBolts(deltaTime: number): void {
    for (let i = this.activeBolts.length - 1; i >= 0; i--) {
      const bolt = this.activeBolts[i];
      bolt.age += deltaTime;

      // Fade out bolt
      const progress = bolt.age / bolt.lifetime;
      const opacity = Math.max(0, 1 - progress * 3);
      bolt.flashLight.intensity = opacity * this.params.flashIntensity;

      // Double-flash effect
      if (this.params.enableDoubleFlash && !bolt.hasFlickered && progress > 0.4) {
        bolt.hasFlickered = true;
        // Brief re-brightening
        bolt.flashLight.intensity = this.params.flashIntensity * 0.6;
        if (this.flashDirLight) {
          this.flashDirLightIntensity = this.params.flashIntensity * 0.5;
          this.flashDirLight.intensity = this.flashDirLightIntensity;
        }
      }

      if (bolt.age > bolt.lifetime) {
        // Remove bolt
        this.scene.remove(bolt.group);
        bolt.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
        this.activeBolts.splice(i, 1);
      }
    }
  }

  private clearAllBolts(): void {
    for (const bolt of this.activeBolts) {
      this.scene.remove(bolt.group);
      bolt.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
    }
    this.activeBolts = [];

    if (this.flashDirLight) {
      this.flashDirLight.intensity = 0;
      this.flashDirLightIntensity = 0;
    }
  }
}

export default LightningSystem;
