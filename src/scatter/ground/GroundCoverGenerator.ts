/**
 * GroundCoverGenerator - Procedural ground cover scattering
 * 
 * Generates realistic ground cover including:
 * - Grass blades with variation
 * - Moss patches
 * - Clover and small plants
 * - Ground debris integration
 * 
 * Ported from: infinigen/scatter/ground/ground_cover.py
 */

import * as THREE from 'three';
import { NoiseUtils } from '../../terrain/utils/NoiseUtils';

export interface GroundCoverConfig {
  seed: number;
  grassDensity: number;
  mossDensity: number;
  cloverDensity: number;
  grassHeightMin: number;
  grassHeightMax: number;
  grassColorVariation: number;
  mossPatchSize: number;
  mossCoverage: number;
  windInfluence: number;
  slopeLimit: number; // Maximum slope for grass growth (radians)
  altitudeLimit: [number, number]; // Min/max altitude for growth
}

export interface GroundCoverInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  type: 'grass' | 'moss' | 'clover';
  color: THREE.Color;
  windOffset: number;
}

export class GroundCoverGenerator {
  private config: GroundCoverConfig;
  private noise: NoiseUtils;

  constructor(config?: Partial<GroundCoverConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      grassDensity: 50, // blades per square meter
      mossDensity: 0.3, // coverage factor
      cloverDensity: 5, // patches per square meter
      grassHeightMin: 0.05,
      grassHeightMax: 0.3,
      grassColorVariation: 0.2,
      mossPatchSize: 0.5,
      mossCoverage: 0.4,
      windInfluence: 0.1,
      slopeLimit: Math.PI / 3, // 60 degrees
      altitudeLimit: [-100, 2000],
      ...config,
    };

    this.noise = new NoiseUtils(this.config.seed);
  }

  /**
   * Generate ground cover instances over a terrain area
   */
  generate(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number
  ): GroundCoverInstance[] {
    const instances: GroundCoverInstance[] = [];
    const cellSize = worldSize / resolution;
    const totalArea = worldSize * worldSize;

    // Calculate expected instance counts
    const expectedGrass = Math.floor(this.config.grassDensity * totalArea);
    const expectedClover = Math.floor(this.config.cloverDensity * totalArea);

    // Generate grass blades
    for (let i = 0; i < expectedGrass; i++) {
      const sampleX = Math.random() * resolution;
      const sampleZ = Math.random() * resolution;
      
      const gridX = Math.floor(sampleX);
      const gridZ = Math.floor(sampleZ);
      
      if (gridX >= 0 && gridX < resolution && gridZ >= 0 && gridZ < resolution) {
        const idx = gridZ * resolution + gridX;
        const height = heights[idx];
        
        // Check altitude limits
        if (height < this.config.altitudeLimit[0] || 
            height > this.config.altitudeLimit[1]) {
          continue;
        }

        // Get position and normal
        const x = (gridX / resolution) * worldSize - worldSize / 2;
        const z = (gridZ / resolution) * worldSize - worldSize / 2;
        
        // Find nearest position from provided positions
        const posIndex = this.findNearestPosition(x, z, positions);
        if (posIndex === -1) continue;

        const position = positions[posIndex];
        const normal = normals[posIndex];

        // Check slope limit
        const slope = Math.acos(normal.y);
        if (slope > this.config.slopeLimit) continue;

        // Generate grass instance
        const instance = this.createGrassInstance(position, normal);
        instances.push(instance);
      }
    }

    // Generate moss patches
    const mossInstances = this.generateMossPatches(positions, normals, heights, resolution, worldSize);
    instances.push(...mossInstances);

    // Generate clover patches
    for (let i = 0; i < expectedClover; i++) {
      const sampleX = Math.random() * resolution;
      const sampleZ = Math.random() * resolution;
      
      const gridX = Math.floor(sampleX);
      const gridZ = Math.floor(sampleZ);
      
      if (gridX >= 0 && gridX < resolution && gridZ >= 0 && gridZ < resolution) {
        const idx = gridZ * resolution + gridX;
        const height = heights[idx];
        
        if (height < this.config.altitudeLimit[0] || 
            height > this.config.altitudeLimit[1]) {
          continue;
        }

        const x = (gridX / resolution) * worldSize - worldSize / 2;
        const z = (gridZ / resolution) * worldSize - worldSize / 2;
        
        const posIndex = this.findNearestPosition(x, z, positions);
        if (posIndex === -1) continue;

        const position = positions[posIndex];
        const normal = normals[posIndex];

        const slope = Math.acos(normal.y);
        if (slope > this.config.slopeLimit) continue;

        const instance = this.createCloverInstance(position, normal);
        instances.push(instance);
      }
    }

    return instances;
  }

  /**
   * Generate moss patches using noise-based distribution
   */
  private generateMossPatches(
    positions: THREE.Vector3[],
    normals: THREE.Vector3[],
    heights: Float32Array,
    resolution: number,
    worldSize: number
  ): GroundCoverInstance[] {
    const instances: GroundCoverInstance[] = [];
    const cellSize = worldSize / resolution;
    const patchRadius = this.config.mossPatchSize;

    // Sample grid for moss
    for (let z = 0; z < resolution; z += 2) {
      for (let x = 0; x < resolution; x += 2) {
        const idx = z * resolution + x;
        const height = heights[idx];

        if (height < this.config.altitudeLimit[0] || 
            height > this.config.altitudeLimit[1]) {
          continue;
        }

        // Use noise to determine moss presence
        const worldX = (x / resolution) * worldSize - worldSize / 2;
        const worldZ = (z / resolution) * worldSize - worldSize / 2;
        
        const noiseValue = this.noise.perlin2D(
          worldX * 0.1,
          worldZ * 0.1
        );

        // Moss prefers shaded, moist areas (lower noise values)
        const mossThreshold = this.config.mossCoverage;
        if (noiseValue > mossThreshold) continue;

        const posIndex = this.findNearestPosition(worldX, worldZ, positions);
        if (posIndex === -1) continue;

        const position = positions[posIndex];
        const normal = normals[posIndex];

        // Create moss patch
        const instance = this.createMossInstance(position, normal, patchRadius);
        instances.push(instance);
      }
    }

    return instances;
  }

  /**
   * Create a single grass blade instance
   */
  private createGrassInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3
  ): GroundCoverInstance {
    // Height variation
    const height = THREE.MathUtils.lerp(
      this.config.grassHeightMin,
      this.config.grassHeightMax,
      Math.random()
    );

    // Color variation
    const baseGreen = 0.3 + Math.random() * 0.3;
    const colorVariation = this.config.grassColorVariation;
    const r = baseGreen - colorVariation * 0.5 + Math.random() * colorVariation;
    const g = baseGreen + 0.2 - colorVariation * 0.5 + Math.random() * colorVariation;
    const b = baseGreen - 0.1 - colorVariation * 0.5 + Math.random() * colorVariation;
    const color = new THREE.Color(r, g, b);

    // Calculate rotation to align with normal
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    // Add slight random rotation around normal
    euler.z += (Math.random() - 0.5) * 0.5;

    // Wind offset for animation
    const windOffset = Math.random() * Math.PI * 2;

    return {
      position: position.clone(),
      rotation: euler,
      scale: new THREE.Vector3(0.02, height, 0.02),
      type: 'grass',
      color,
      windOffset,
    };
  }

  /**
   * Create a moss patch instance
   */
  private createMossInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3,
    radius: number
  ): GroundCoverInstance {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    // Moss color (darker green)
    const color = new THREE.Color(0.15, 0.35, 0.15);

    return {
      position: position.clone(),
      rotation: euler,
      scale: new THREE.Vector3(radius, 0.02, radius),
      type: 'moss',
      color,
      windOffset: 0, // Moss doesn't move in wind
    };
  }

  /**
   * Create a clover instance
   */
  private createCloverInstance(
    position: THREE.Vector3,
    normal: THREE.Vector3
  ): GroundCoverInstance {
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    // Clover color (brighter green)
    const color = new THREE.Color(0.2, 0.5, 0.2);

    return {
      position: position.clone(),
      rotation: euler,
      scale: new THREE.Vector3(0.08, 0.05, 0.08),
      type: 'clover',
      color,
      windOffset: Math.random() * Math.PI * 2,
    };
  }

  /**
   * Find nearest position from array
   */
  private findNearestPosition(
    x: number,
    z: number,
    positions: THREE.Vector3[]
  ): number {
    let minDist = Infinity;
    let nearestIndex = -1;

    // Simple linear search (could be optimized with spatial hash)
    for (let i = 0; i < positions.length; i++) {
      const dx = positions[i].x - x;
      const dz = positions[i].z - z;
      const dist = dx * dx + dz * dz;

      if (dist < minDist) {
        minDist = dist;
        nearestIndex = i;
      }
    }

    // Only return if within reasonable distance
    return minDist < 1.0 ? nearestIndex : -1;
  }

  /**
   * Create instanced mesh for rendering
   */
  createInstancedMesh(
    instances: GroundCoverInstance[],
    geometry: THREE.BufferGeometry,
    material: THREE.Material
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];

      matrix.makeRotationFromEuler(instance.rotation);
      matrix.scale(instance.scale);
      matrix.setPosition(instance.position);

      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, instance.color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    return mesh;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GroundCoverConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
  }

  /**
   * Get current configuration
   */
  getConfig(): GroundCoverConfig {
    return { ...this.config };
  }
}

export default GroundCoverGenerator;
