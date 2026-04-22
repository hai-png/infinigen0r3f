/**
 * BarkSurface.ts
 * 
 * Tree bark surface kernel with realistic ridges and fissures.
 * Generates procedural bark patterns for tree trunks and wooden surfaces.
 * 
 * Based on original Infinigen's bark surface implementation.
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceSample } from './SurfaceKernel';

export interface BarkConfig {
  scale: number;
  ridgeHeight: number;
  ridgeFrequency: number;
  fissureDepth: number;
  fissureSpacing: number;
  roughness: number;
  anisotropy: number;
  seed: number;
}

const DEFAULT_BARK_CONFIG: BarkConfig = {
  scale: 1.0,
  ridgeHeight: 0.1,
  ridgeFrequency: 10.0,
  fissureDepth: 0.2,
  fissureSpacing: 0.5,
  roughness: 0.8,
  anisotropy: 0.7,
  seed: 42,
};

/**
 * Procedural bark surface generator
 */
export class BarkSurface implements SurfaceKernel {
  private config: BarkConfig;
  private rng: () => number;

  constructor(config: Partial<BarkConfig> = {}) {
    this.config = { ...DEFAULT_BARK_CONFIG, ...config };
    this.rng = this.createRNG(this.config.seed);
  }

  /**
   * Create seeded random number generator
   */
  private createRNG(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Evaluate bark surface at given point
   */
  evaluate(point: Vector3, normal: Vector3): SurfaceSample {
    const localPoint = point.clone().multiplyScalar(this.config.scale);
    
    // Generate base ridge pattern
    const ridges = this.generateRidges(localPoint);
    
    // Add fissures (deep cracks)
    const fissures = this.generateFissures(localPoint);
    
    // Combine with anisotropic stretching along normal
    const height = this.applyAnisotropy(ridges + fissures, normal);
    
    // Calculate derivatives for normal perturbation
    const derivativeX = this.evaluateDerivative(localPoint, normal, 'x');
    const derivativeZ = this.evaluateDerivative(localPoint, normal, 'z');
    
    // Perturb normal based on surface gradient
    const perturbedNormal = this.perturbNormal(normal, derivativeX, derivativeZ);
    
    return {
      height,
      normal: perturbedNormal,
      roughness: this.config.roughness,
      displacement: height,
    };
  }

  /**
   * Generate ridge pattern using noise functions
   */
  private generateRidges(point: Vector3): number {
    const freq = this.config.ridgeFrequency;
    let ridges = 0.0;
    
    // Multi-octave ridge noise
    for (let i = 0; i < 4; i++) {
      const octaveFreq = freq * Math.pow(2, i);
      const octaveAmp = Math.pow(0.5, i);
      
      const noiseVal = this.ridgeNoise(point.clone().multiplyScalar(octaveFreq));
      ridges += noiseVal * octaveAmp;
    }
    
    return ridges * this.config.ridgeHeight;
  }

  /**
   * Ridge noise function (absolute value of gradient noise)
   */
  private ridgeNoise(point: Vector3): number {
    const noiseVal = this.simplexNoise(point);
    return Math.abs(1.0 - 2.0 * Math.abs(noiseVal));
  }

  /**
   * Generate deep fissures/cracks in bark
   */
  private generateFissures(point: Vector3): number {
    const spacing = this.config.fissureSpacing;
    let fissures = 0.0;
    
    // Create crack pattern using Voronoi-like approach
    const cellX = Math.floor(point.x / spacing);
    const cellY = Math.floor(point.y / spacing);
    const cellZ = Math.floor(point.z / spacing);
    
    // Check neighboring cells for closest crack
    let minDist = Infinity;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborCell = new Vector3(
            cellX + dx,
            cellY + dy,
            cellZ + dz
          );
          
          // Generate random crack position within cell
          const crackPos = this.getCellCrackPosition(neighborCell, spacing);
          const dist = point.distanceTo(crackPos);
          
          if (dist < minDist) {
            minDist = dist;
          }
        }
      }
    }
    
    // Convert distance to fissure depth
    fissures = -Math.exp(-minDist * 5.0) * this.config.fissureDepth;
    
    return fissures;
  }

  /**
   * Get random crack position for a cell
   */
  private getCellCrackPosition(cell: Vector3, spacing: number): Vector3 {
    // Use cell coordinates as seed
    const seed = Math.abs(cell.x * 1000 + cell.y * 100 + cell.z);
    const rng = this.createRNG(seed);
    
    return new Vector3(
      cell.x * spacing + rng() * spacing,
      cell.y * spacing + rng() * spacing,
      cell.z * spacing + rng() * spacing
    );
  }

  /**
   * Apply anisotropic stretching based on surface normal
   */
  private applyAnisotropy(height: number, normal: Vector3): number {
    if (this.config.anisotropy <= 0) return height;
    
    // Stretch pattern along the dominant normal axis
    const stretchFactor = 1.0 + this.config.anisotropy * Math.abs(normal.y);
    return height * stretchFactor;
  }

  /**
   * Evaluate surface derivative in specified direction
   */
  private evaluateDerivative(
    point: Vector3,
    normal: Vector3,
    direction: 'x' | 'z'
  ): number {
    const epsilon = 0.01;
    const offset = direction === 'x' 
      ? new Vector3(epsilon, 0, 0)
      : new Vector3(0, 0, epsilon);
    
    const pointPlus = point.clone().add(offset);
    const pointMinus = point.clone().sub(offset);
    
    const heightPlus = this.generateRidges(pointPlus) + this.generateFissures(pointPlus);
    const heightMinus = this.generateRidges(pointMinus) + this.generateFissures(pointMinus);
    
    return (heightPlus - heightMinus) / (2 * epsilon);
  }

  /**
   * Perturb normal based on surface gradient
   */
  private perturbNormal(
    normal: Vector3,
    derivativeX: number,
    derivativeZ: number
  ): Vector3 {
    const tangent = new Vector3(1, derivativeX, 0).normalize();
    const bitangent = new Vector3(0, derivativeZ, 1).normalize();
    
    const perturbed = new Vector3()
      .crossVectors(tangent, bitangent)
      .normalize();
    
    // Blend between original and perturbed normal
    const blend = this.config.roughness;
    return normal.clone().lerp(perturbed, blend).normalize();
  }

  /**
   * Simplex noise implementation (simplified)
   */
  private simplexNoise(point: Vector3): number {
    // Simplified noise using hash-based approach
    const X = Math.floor(point.x) & 255;
    const Y = Math.floor(point.y) & 255;
    const Z = Math.floor(point.z) & 255;
    
    const hash = ((X * 374761393 + Y * 668265263 + Z * 1440656099) & 0xFFFFFFFF) / 0xFFFFFFFF;
    return hash * 2.0 - 1.0;
  }

  /**
   * Get kernel type identifier
   */
  getType(): string {
    return 'bark';
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<BarkConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.seed !== undefined) {
      this.rng = this.createRNG(this.config.seed);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): BarkConfig {
    return { ...this.config };
  }
}

export default BarkSurface;
