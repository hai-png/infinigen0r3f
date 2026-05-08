/**
 * Rain Particle System
 *
 * High-performance rain simulation using instanced rendering
 * with wind effects, splash particles, terrain collision, puddle formation,
 * and intensity control.
 *
 * @module RainSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';

export interface RainParams {
  intensity: number;
  windSpeed: number;
  windDirection: THREE.Vector3;
  dropSize: number;
  fallSpeed: number;
  splashEnabled: boolean;
  dripFromSurfaces: boolean;
  puddleEnabled: boolean;
}

interface SplashData {
  x: number;
  y: number;
  z: number;
  age: number;
  lifetime: number;
  scale: number;
}

export class RainSystem {
  private scene: THREE.Scene;
  private params: RainParams;
  private rng: SeededRandom;
  private rainMesh: THREE.InstancedMesh | null = null;
  private splashMesh: THREE.InstancedMesh | null = null;
  private puddleMesh: THREE.InstancedMesh | null = null;
  private dummy: THREE.Object3D;
  private rainData: Float32Array;
  private readonly maxDrops = 10000;
  private readonly maxSplashes = 2000;
  private readonly maxPuddles = 200;

  // Splash tracking
  private splashes: SplashData[];
  private nextSplashIdx: number = 0;

  // Puddle tracking
  private puddleData: Map<string, { intensity: number; x: number; z: number }>;

  // Terrain height callback (returns terrain height at world x,z)
  private terrainHeightFn: ((x: number, z: number) => number) | null;

  constructor(
    scene: THREE.Scene,
    params: Partial<RainParams> = {},
    seed: number = 42,
    terrainHeightFn: ((x: number, z: number) => number) | null = null
  ) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.terrainHeightFn = terrainHeightFn;
    this.params = {
      intensity: params.intensity ?? 0.7,
      windSpeed: params.windSpeed ?? 5,
      windDirection: params.windDirection || new THREE.Vector3(1, 0, 0),
      dropSize: params.dropSize ?? 0.02,
      fallSpeed: params.fallSpeed ?? 15,
      splashEnabled: params.splashEnabled ?? true,
      dripFromSurfaces: params.dripFromSurfaces ?? false,
      puddleEnabled: params.puddleEnabled ?? true,
    };

    this.dummy = new THREE.Object3D();
    this.rainData = new Float32Array(this.maxDrops * 4); // x, y, z, velocity
    this.splashes = new Array(this.maxSplashes).fill(null).map(() => ({
      x: 0, y: -1000, z: 0, age: 999, lifetime: 0.3, scale: 0,
    }));
    this.puddleData = new Map();

    this.initializeRain();
    if (this.params.splashEnabled) {
      this.initializeSplashes();
    }
    if (this.params.puddleEnabled) {
      this.initializePuddles();
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private initializeRain(): void {
    const geometry = new THREE.CylinderGeometry(0.005, 0.01, 0.3, 4);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.rainMesh = new THREE.InstancedMesh(geometry, material, this.maxDrops);
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.frustumCulled = false;
    this.scene.add(this.rainMesh);

    // Initialize drop positions
    for (let i = 0; i < this.maxDrops; i++) {
      this.resetDrop(i);
    }
  }

  private initializeSplashes(): void {
    const geometry = new THREE.SphereGeometry(0.04, 4, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    this.splashMesh = new THREE.InstancedMesh(geometry, material, this.maxSplashes);
    this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splashMesh.frustumCulled = false;
    this.scene.add(this.splashMesh);

    // Initialize splashes as inactive
    for (let i = 0; i < this.maxSplashes; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  private initializePuddles(): void {
    const geometry = new THREE.CircleGeometry(1, 12);
    geometry.rotateX(-Math.PI / 2);

    // Puddle material with reflective look
    const material = new THREE.MeshStandardMaterial({
      color: 0x557799,
      transparent: true,
      opacity: 0.0,
      roughness: 0.1,
      metalness: 0.3,
      depthWrite: false,
    });

    this.puddleMesh = new THREE.InstancedMesh(geometry, material, this.maxPuddles);
    this.puddleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puddleMesh.frustumCulled = false;
    this.scene.add(this.puddleMesh);

    // Initialize puddles as invisible
    for (let i = 0; i < this.maxPuddles; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.puddleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.puddleMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Rain Drop Logic
  // -------------------------------------------------------------------------

  private resetDrop(index: number): void {
    const x = (this.rng.next() - 0.5) * 100;
    const y = this.rng.next() * 50 + 20;
    const z = (this.rng.next() - 0.5) * 100;
    const velocity = this.params.fallSpeed * (0.8 + this.rng.next() * 0.4);

    this.rainData[index * 4] = x;
    this.rainData[index * 4 + 1] = y;
    this.rainData[index * 4 + 2] = z;
    this.rainData[index * 4 + 3] = velocity;
  }

  private getTerrainHeight(x: number, z: number): number {
    if (this.terrainHeightFn) {
      return this.terrainHeightFn(x, z);
    }
    return 0;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.rainMesh) return;

    const activeDrops = Math.floor(this.maxDrops * this.params.intensity);
    const windX = this.params.windDirection.x * this.params.windSpeed * deltaTime;
    const windZ = this.params.windDirection.z * this.params.windSpeed * deltaTime;

    // Wind angle for tilting rain drops
    const windAngle = Math.atan2(this.params.windDirection.z * this.params.windSpeed,
      this.params.fallSpeed) * 0.3;

    for (let i = 0; i < activeDrops; i++) {
      let y = this.rainData[i * 4 + 1];
      let x = this.rainData[i * 4];
      let z = this.rainData[i * 4 + 2];
      const velocity = this.rainData[i * 4 + 3];

      // Update position
      y -= velocity * deltaTime;
      x += windX;
      z += windZ;

      // Check for terrain collision
      const groundY = this.getTerrainHeight(x, z);

      if (y < groundY) {
        // Create splash at collision point
        if (this.params.splashEnabled) {
          this.createSplash(x, groundY, z);
        }

        // Track puddle formation
        if (this.params.puddleEnabled && this.rng.next() < 0.05) {
          this.addPuddleContribution(x, z, deltaTime);
        }

        // Reset drop
        this.resetDrop(i);
        x = this.rainData[i * 4];
        y = this.rainData[i * 4 + 1];
        z = this.rainData[i * 4 + 2];
      }

      // Update stored data
      this.rainData[i * 4] = x;
      this.rainData[i * 4 + 1] = y;
      this.rainData[i * 4 + 2] = z;

      // Update instance matrix with wind-tilted orientation
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, 0, windAngle);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.rainMesh!.setMatrixAt(i, this.dummy.matrix);
    }

    // Hide inactive drops
    for (let i = activeDrops; i < this.maxDrops; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.rainMesh!.setMatrixAt(i, this.dummy.matrix);
    }

    this.rainMesh.instanceMatrix.needsUpdate = true;

    // Update sub-systems
    if (this.params.splashEnabled) {
      this.updateSplashes(deltaTime);
    }
    if (this.params.puddleEnabled) {
      this.updatePuddles(deltaTime);
    }
  }

  // -------------------------------------------------------------------------
  // Splash Particles
  // -------------------------------------------------------------------------

  private createSplash(x: number, y: number, z: number): void {
    if (!this.splashMesh) return;
    if (this.rng.next() > 0.3) return; // 30% chance of visible splash

    const idx = this.nextSplashIdx % this.maxSplashes;
    this.nextSplashIdx++;

    this.splashes[idx] = {
      x, y: y + 0.02, z,
      age: 0,
      lifetime: 0.2 + this.rng.next() * 0.15,
      scale: 0.3 + this.rng.next() * 0.4,
    };
  }

  private updateSplashes(deltaTime: number): void {
    if (!this.splashMesh) return;

    for (let i = 0; i < this.maxSplashes; i++) {
      const splash = this.splashes[i];

      splash.age += deltaTime;

      if (splash.age > splash.lifetime || splash.y < -500) {
        // Inactive
        this.dummy.position.set(0, -1000, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        // Animate: expand and fade
        const progress = splash.age / splash.lifetime;
        const scale = splash.scale * (0.5 + progress * 0.5);

        this.dummy.position.set(splash.x, splash.y, splash.z);
        this.dummy.scale.set(scale, 0.05, scale);
        this.dummy.updateMatrix();
        this.splashMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }

    this.splashMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Puddle Formation
  // -------------------------------------------------------------------------

  private addPuddleContribution(x: number, z: number, deltaTime: number): void {
    const cellSize = 5;
    const key = `${Math.round(x / cellSize) * cellSize},${Math.round(z / cellSize) * cellSize}`;
    const current = this.puddleData.get(key);

    if (current) {
      current.intensity = Math.min(current.intensity + deltaTime * 0.2, 1.0);
    } else {
      this.puddleData.set(key, {
        intensity: deltaTime * 0.2,
        x: Math.round(x / cellSize) * cellSize,
        z: Math.round(z / cellSize) * cellSize,
      });
    }
  }

  private updatePuddles(deltaTime: number): void {
    if (!this.puddleMesh) return;

    // Evaporate puddles slowly
    for (const [key, data] of this.puddleData.entries()) {
      // If rain is active, grow; otherwise, evaporate
      if (this.params.intensity < 0.1) {
        data.intensity -= deltaTime * 0.05;
        if (data.intensity <= 0) {
          this.puddleData.delete(key);
        }
      }
    }

    // Update puddle mesh instances
    let puddleIdx = 0;
    for (const [, data] of this.puddleData) {
      if (puddleIdx >= this.maxPuddles) break;

      const groundY = this.getTerrainHeight(data.x, data.z);
      const puddleScale = 1 + data.intensity * 3;
      const opacity = Math.min(data.intensity * 0.5, 0.4);

      this.dummy.position.set(data.x, groundY + 0.05, data.z);
      this.dummy.scale.set(puddleScale, 1, puddleScale);
      this.dummy.updateMatrix();
      this.puddleMesh.setMatrixAt(puddleIdx, this.dummy.matrix);

      puddleIdx++;
    }

    // Hide unused puddle slots
    for (let i = puddleIdx; i < this.maxPuddles; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.puddleMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.puddleMesh.instanceMatrix.needsUpdate = true;

    // Update puddle material opacity based on average intensity
    const avgIntensity = this.puddleData.size > 0
      ? Array.from(this.puddleData.values()).reduce((sum, d) => sum + d.intensity, 0) / this.puddleData.size
      : 0;
    (this.puddleMesh.material as THREE.MeshStandardMaterial).opacity = Math.min(avgIntensity * 0.5, 0.4);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setIntensity(intensity: number): void {
    this.params.intensity = Math.max(0, Math.min(1, intensity));
  }

  setWind(speed: number, direction: THREE.Vector3): void {
    this.params.windSpeed = speed;
    this.params.windDirection = direction.normalize();
  }

  setSplashesEnabled(enabled: boolean): void {
    this.params.splashEnabled = enabled;
    if (this.splashMesh) {
      this.splashMesh.visible = enabled;
    }
  }

  setPuddlesEnabled(enabled: boolean): void {
    this.params.puddleEnabled = enabled;
    if (this.puddleMesh) {
      this.puddleMesh.visible = enabled;
    }
    if (!enabled) {
      this.puddleData.clear();
    }
  }

  setTerrainHeightFn(fn: (x: number, z: number) => number): void {
    this.terrainHeightFn = fn;
  }

  /**
   * Get current rain intensity.
   */
  getIntensity(): number {
    return this.params.intensity;
  }

  dispose(): void {
    if (this.rainMesh) {
      this.rainMesh.geometry.dispose();
      (this.rainMesh.material as THREE.Material).dispose();
      this.scene.remove(this.rainMesh);
    }

    if (this.splashMesh) {
      this.splashMesh.geometry.dispose();
      (this.splashMesh.material as THREE.Material).dispose();
      this.scene.remove(this.splashMesh);
    }

    if (this.puddleMesh) {
      this.puddleMesh.geometry.dispose();
      (this.puddleMesh.material as THREE.Material).dispose();
      this.scene.remove(this.puddleMesh);
    }

    this.puddleData.clear();
  }
}

export default RainSystem;
