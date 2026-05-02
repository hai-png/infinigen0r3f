/**
 * Snow Particle System
 *
 * Realistic snow simulation with fluttering flakes,
 * wind drift, accumulation on terrain surfaces (normal-based),
 * and melting effects. Uses InstancedMesh for performance.
 *
 * @module SnowSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';
import { createCanvas } from '../utils/CanvasUtils';

export interface SnowParams {
  intensity: number;
  windSpeed: number;
  windDirection: THREE.Vector3;
  flakeSize: number;
  fallSpeed: number;
  turbulence: number;
  accumulationEnabled: boolean;
  meltEnabled: boolean;
  temperature: number;
}

interface Snowflake {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rotationSpeed: number;
  phase: number;
}

export class SnowSystem {
  private scene: THREE.Scene;
  private params: SnowParams;
  private rng: SeededRandom;
  private snowMesh: THREE.InstancedMesh | null = null;
  private accumulationMesh: THREE.InstancedMesh | null = null;
  private snowflakes: Snowflake[] = [];
  private readonly maxFlakes = 8000;
  private readonly maxAccumulation = 400;
  private accumulationMap: Map<string, number> = new Map();

  // Terrain height callback for collision detection
  private terrainHeightFn: ((x: number, z: number) => number) | null;
  // Terrain normal callback for accumulation direction
  private terrainNormalFn: ((x: number, z: number) => THREE.Vector3) | null;

  private dummy: THREE.Object3D;

  constructor(
    scene: THREE.Scene,
    params: Partial<SnowParams> = {},
    seed: number = 42,
    terrainHeightFn: ((x: number, z: number) => number) | null = null,
    terrainNormalFn: ((x: number, z: number) => THREE.Vector3) | null = null
  ) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.terrainHeightFn = terrainHeightFn;
    this.terrainNormalFn = terrainNormalFn;
    this.params = {
      intensity: params.intensity ?? 0.6,
      windSpeed: params.windSpeed ?? 3,
      windDirection: params.windDirection || new THREE.Vector3(1, 0, 0.5),
      flakeSize: params.flakeSize ?? 0.15,
      fallSpeed: params.fallSpeed ?? 3,
      turbulence: params.turbulence ?? 0.5,
      accumulationEnabled: params.accumulationEnabled ?? true,
      meltEnabled: params.meltEnabled ?? true,
      temperature: params.temperature ?? -2,
    };

    this.dummy = new THREE.Object3D();
    this.initializeSnow();
    if (this.params.accumulationEnabled) {
      this.initializeAccumulation();
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private initializeSnow(): void {
    // Use a small sprite-like geometry for each flake
    const geometry = new THREE.PlaneGeometry(0.15, 0.15);

    // Create snowflake texture using CanvasUtils
    const canvas = createCanvas();
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.snowMesh = new THREE.InstancedMesh(geometry, material, this.maxFlakes);
    this.snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.snowMesh.frustumCulled = false;
    this.scene.add(this.snowMesh);

    // Create snowflake data
    for (let i = 0; i < this.maxFlakes; i++) {
      const x = (this.rng.next() - 0.5) * 100;
      const y = this.rng.next() * 50 + 10;
      const z = (this.rng.next() - 0.5) * 100;
      const size = this.params.flakeSize * (0.5 + this.rng.next() * 0.5);
      const phase = this.rng.next() * Math.PI * 2;

      this.snowflakes.push({
        x, y, z,
        vx: 0,
        vy: -this.params.fallSpeed,
        vz: 0,
        size,
        rotationSpeed: (this.rng.next() - 0.5) * 2,
        phase,
      });

      // Initialize instance matrix
      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(size, size, size);
      this.dummy.updateMatrix();
      this.snowMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.snowMesh.instanceMatrix.needsUpdate = true;
  }

  private initializeAccumulation(): void {
    const geometry = new THREE.BoxGeometry(3, 1, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
    });

    this.accumulationMesh = new THREE.InstancedMesh(geometry, material, this.maxAccumulation);
    this.accumulationMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.accumulationMesh.frustumCulled = false;
    this.scene.add(this.accumulationMesh);

    // Initialize as invisible
    for (let i = 0; i < this.maxAccumulation; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.accumulationMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.accumulationMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.snowMesh) return;

    const activeFlakes = Math.floor(this.maxFlakes * this.params.intensity);

    // Wind components
    const windX = this.params.windDirection.x * this.params.windSpeed;
    const windZ = this.params.windDirection.z * this.params.windSpeed;

    const time = typeof performance !== 'undefined' ? performance.now() * 0.001 : Date.now() * 0.001;

    for (let i = 0; i < activeFlakes; i++) {
      const flake = this.snowflakes[i];

      // Update velocity with wind and turbulence
      flake.vx += (windX - flake.vx) * 0.1 * deltaTime;
      flake.vz += (windZ - flake.vz) * 0.1 * deltaTime;

      // Add turbulence (swirling motion)
      flake.vx += Math.sin(time + flake.phase) * this.params.turbulence * deltaTime;
      flake.vz += Math.cos(time * 0.7 + flake.phase) * this.params.turbulence * deltaTime;

      // Update position
      flake.x += flake.vx * deltaTime;
      flake.y += flake.vy * deltaTime;
      flake.z += flake.vz * deltaTime;

      // Boundary wrapping
      if (flake.x < -50) flake.x = 50;
      if (flake.x > 50) flake.x = -50;
      if (flake.z < -50) flake.z = 50;
      if (flake.z > 50) flake.z = -50;

      // Terrain collision
      const groundY = this.getTerrainHeight(flake.x, flake.z);

      if (flake.y < groundY) {
        // Track accumulation (normal-based: accumulates on flat/upward surfaces)
        if (this.params.accumulationEnabled) {
          this.addAccumulation(flake.x, flake.z, groundY, deltaTime);
        }

        // Reset flake to top
        flake.y = 50 + this.rng.next() * 10;
        flake.x = (this.rng.next() - 0.5) * 100;
        flake.z = (this.rng.next() - 0.5) * 100;
        flake.vx = 0;
        flake.vz = 0;
      }

      // Update instance matrix
      this.dummy.position.set(flake.x, flake.y, flake.z);
      this.dummy.rotation.set(
        Math.sin(time * flake.rotationSpeed + flake.phase) * 0.5,
        time * flake.rotationSpeed,
        0
      );
      this.dummy.scale.set(flake.size, flake.size, flake.size);
      this.dummy.updateMatrix();
      this.snowMesh.setMatrixAt(i, this.dummy.matrix);
    }

    // Hide inactive flakes
    for (let i = activeFlakes; i < this.maxFlakes; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.snowMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.snowMesh.instanceMatrix.needsUpdate = true;

    // Update accumulation
    if (this.params.accumulationEnabled) {
      this.updateAccumulationMeshes(deltaTime);
    }

    // Handle melting
    if (this.params.meltEnabled && this.params.temperature > 0) {
      this.handleMelting(deltaTime);
    }
  }

  // -------------------------------------------------------------------------
  // Terrain Helpers
  // -------------------------------------------------------------------------

  private getTerrainHeight(x: number, z: number): number {
    if (this.terrainHeightFn) {
      return this.terrainHeightFn(x, z);
    }
    return 0;
  }

  private getTerrainNormal(x: number, z: number): THREE.Vector3 {
    if (this.terrainNormalFn) {
      return this.terrainNormalFn(x, z);
    }
    return new THREE.Vector3(0, 1, 0);
  }

  // -------------------------------------------------------------------------
  // Accumulation
  // -------------------------------------------------------------------------

  private addAccumulation(x: number, z: number, groundY: number, deltaTime: number): void {
    const normal = this.getTerrainNormal(x, z);
    // Snow accumulates on flat/upward surfaces (normal.y close to 1)
    // Steep surfaces (normal.y close to 0) shed snow
    const accumulationFactor = Math.max(0, normal.y);
    if (accumulationFactor < 0.3) return; // Too steep for snow

    const cellSize = 4;
    const key = `${Math.round(x / cellSize) * cellSize},${Math.round(z / cellSize) * cellSize}`;
    const current = this.accumulationMap.get(key) || 0;
    this.accumulationMap.set(key, Math.min(current + deltaTime * 0.5 * accumulationFactor, 2.0));
  }

  private updateAccumulationMeshes(deltaTime: number): void {
    if (!this.accumulationMesh) return;

    let idx = 0;
    for (const [key, height] of this.accumulationMap) {
      if (idx >= this.maxAccumulation) break;
      if (height < 0.01) continue;

      const [xStr, zStr] = key.split(',');
      const x = parseFloat(xStr);
      const z = parseFloat(zStr);
      const groundY = this.getTerrainHeight(x, z);

      this.dummy.position.set(x, groundY + height * 0.5, z);
      this.dummy.scale.set(1, height, 1);
      this.dummy.updateMatrix();
      this.accumulationMesh.setMatrixAt(idx, this.dummy.matrix);

      idx++;
    }

    // Hide unused slots
    for (let i = idx; i < this.maxAccumulation; i++) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.accumulationMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.accumulationMesh.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Melting
  // -------------------------------------------------------------------------

  private handleMelting(deltaTime: number): void {
    const meltRate = (this.params.temperature / 10) * deltaTime;

    for (const [key, value] of this.accumulationMap.entries()) {
      const newValue = value - meltRate;
      if (newValue <= 0) {
        this.accumulationMap.delete(key);
      } else {
        this.accumulationMap.set(key, newValue);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getAccumulationHeight(x: number, z: number): number {
    const cellSize = 4;
    const key = `${Math.round(x / cellSize) * cellSize},${Math.round(z / cellSize) * cellSize}`;
    return this.accumulationMap.get(key) || 0;
  }

  setIntensity(intensity: number): void {
    this.params.intensity = Math.max(0, Math.min(1, intensity));
  }

  setWind(speed: number, direction: THREE.Vector3): void {
    this.params.windSpeed = speed;
    this.params.windDirection = direction.normalize();
  }

  setTemperature(temp: number): void {
    this.params.temperature = temp;
  }

  setAccumulationEnabled(enabled: boolean): void {
    this.params.accumulationEnabled = enabled;
    if (this.accumulationMesh) {
      this.accumulationMesh.visible = enabled;
    }
    if (!enabled) {
      this.accumulationMap.clear();
    }
  }

  setTerrainHeightFn(fn: (x: number, z: number) => number): void {
    this.terrainHeightFn = fn;
  }

  setTerrainNormalFn(fn: (x: number, z: number) => THREE.Vector3): void {
    this.terrainNormalFn = fn;
  }

  clearAccumulation(): void {
    this.accumulationMap.clear();
  }

  dispose(): void {
    if (this.snowMesh) {
      this.snowMesh.geometry.dispose();
      (this.snowMesh.material as THREE.Material).dispose();
      this.scene.remove(this.snowMesh);
    }

    if (this.accumulationMesh) {
      this.accumulationMesh.geometry.dispose();
      (this.accumulationMesh.material as THREE.Material).dispose();
      this.scene.remove(this.accumulationMesh);
    }

    this.accumulationMap.clear();
  }
}

export default SnowSystem;
