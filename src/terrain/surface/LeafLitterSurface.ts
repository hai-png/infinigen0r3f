/**
 * LeafLitterSurface.ts
 * 
 * Forest floor leaf litter surface kernel.
 * Generates scattered leaf patterns with natural variation.
 * 
 * Based on original Infinigen's leaf litter implementation.
 */

import { Vector3, MathUtils } from 'three';
import { SurfaceKernel, SurfaceSample } from './SurfaceKernel';

export interface LeafLitterConfig {
  scale: number;
  leafDensity: number;
  leafSizeMin: number;
  leafSizeMax: number;
  layerDepth: number;
  coverage: number;
  randomness: number;
  seed: number;
}

const DEFAULT_LEAF_LITTER_CONFIG: LeafLitterConfig = {
  scale: 1.0,
  leafDensity: 50,
  leafSizeMin: 0.05,
  leafSizeMax: 0.2,
  layerDepth: 0.1,
  coverage: 0.7,
  randomness: 0.5,
  seed: 42,
};

interface Leaf {
  position: Vector3;
  size: number;
  rotation: number;
  height: number;
  type: number;
}

/**
 * Procedural leaf litter surface generator
 */
export class LeafLitterSurface implements SurfaceKernel {
  private config: LeafLitterConfig;
  private leaves: Leaf[] | null;
  private cacheValid: boolean;
  private rng: () => number;

  constructor(config: Partial<LeafLitterConfig> = {}) {
    this.config = { ...DEFAULT_LEAF_LITTER_CONFIG, ...config };
    this.leaves = null;
    this.cacheValid = false;
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
   * Evaluate leaf litter surface at given point
   */
  evaluate(point: Vector3, normal: Vector3): SurfaceSample {
    if (!this.cacheValid || !this.leaves) {
      this.generateLeaves();
    }

    const localPoint = point.clone().multiplyScalar(this.config.scale);
    
    // Find overlapping leaves
    const contributions = this.evaluateLeafContributions(localPoint);
    
    // Calculate height from accumulated leaves
    const height = contributions.height;
    
    // Perturb normal based on leaf orientations
    const perturbedNormal = this.perturbNormalFromLeaves(
      normal,
      contributions.leaves,
      localPoint
    );
    
    return {
      height,
      normal: perturbedNormal,
      roughness: 0.9,
      displacement: height,
    };
  }

  /**
   * Generate leaf distribution
   */
  private generateLeaves(): void {
    const count = Math.floor(this.config.leafDensity * this.config.coverage);
    this.leaves = [];

    for (let i = 0; i < count; i++) {
      const size = MathUtils.lerp(
        this.config.leafSizeMin,
        this.config.leafSizeMax,
        this.rng()
      );

      const leaf: Leaf = {
        position: new Vector3(
          (this.rng() - 0.5) * 10,
          0,
          (this.rng() - 0.5) * 10
        ),
        size,
        rotation: this.rng() * Math.PI * 2,
        height: this.rng() * this.config.layerDepth * size,
        type: Math.floor(this.rng() * 3), // 0-2 for different leaf shapes
      };

      this.leaves.push(leaf);
    }

    this.cacheValid = true;
  }

  /**
   * Evaluate contributions from all leaves at a point
   */
  private evaluateLeafContributions(point: Vector3): {
    height: number;
    leaves: Leaf[];
  } {
    const contributingLeaves: Leaf[] = [];
    let totalHeight = 0.0;

    if (!this.leaves) return { height: 0, leaves: [] };

    for (const leaf of this.leaves) {
      const dist = this.distanceToLeaf(point, leaf);
      
      if (dist < leaf.size) {
        contributingLeaves.push(leaf);
        
        // Height contribution falls off with distance from leaf center
        const falloff = Math.max(0, 1 - dist / leaf.size);
        const heightContribution = leaf.height * falloff * falloff;
        
        totalHeight += heightContribution;
      }
    }

    return {
      height: totalHeight,
      leaves: contributingLeaves,
    };
  }

  /**
   * Calculate distance from point to leaf (in leaf's local space)
   */
  private distanceToLeaf(point: Vector3, leaf: Leaf): number {
    // Transform point to leaf's local coordinate system
    const localPoint = point.clone().sub(leaf.position);
    
    // Rotate by leaf's rotation (around Y axis)
    const cosR = Math.cos(-leaf.rotation);
    const sinR = Math.sin(-leaf.rotation);
    
    const rotatedX = localPoint.x * cosR - localPoint.z * sinR;
    const rotatedZ = localPoint.x * sinR + localPoint.z * cosR;
    
    // Different leaf shapes have different distance metrics
    switch (leaf.type) {
      case 0: // Circular leaf
        return Math.sqrt(rotatedX * rotatedX + rotatedZ * rotatedZ);
      
      case 1: // Elliptical leaf
        const ellipseX = rotatedX / (leaf.size * 1.5);
        const ellipseZ = rotatedZ / (leaf.size * 0.8);
        return Math.sqrt(ellipseX * ellipseX + ellipseZ * ellipseZ) * leaf.size;
      
      case 2: // Irregular leaf (simplified)
        const irregularity = Math.sin(rotatedX * 10) * 0.1;
        return Math.sqrt(rotatedX * rotatedX + rotatedZ * rotatedZ) - irregularity * leaf.size;
      
      default:
        return Math.sqrt(rotatedX * rotatedX + rotatedZ * rotatedZ);
    }
  }

  /**
   * Perturb normal based on leaf orientations
   */
  private perturbNormalFromLeaves(
    baseNormal: Vector3,
    leaves: Leaf[],
    point: Vector3
  ): Vector3 {
    if (leaves.length === 0) return baseNormal.clone();

    const perturbation = new Vector3(0, 0, 0);
    let totalWeight = 0;

    for (const leaf of leaves) {
      const dist = this.distanceToLeaf(point, leaf);
      const weight = Math.max(0, 1 - dist / leaf.size);
      
      // Create small normal variation based on leaf curvature
      const localX = (point.x - leaf.position.x) / leaf.size;
      const localZ = (point.z - leaf.position.z) / leaf.size;
      
      perturbation.x += localX * weight * 0.3;
      perturbation.z += localZ * weight * 0.3;
      perturbation.y += weight * 0.1;
      
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      perturbation.divideScalar(totalWeight);
    }

    // Blend perturbation with base normal
    const blendFactor = this.config.randomness * Math.min(1, totalWeight);
    const perturbedNormal = baseNormal.clone().add(perturbation).normalize();
    
    return baseNormal.clone().lerp(perturbedNormal, blendFactor).normalize();
  }

  /**
   * Get kernel type identifier
   */
  getType(): string {
    return 'leaf_litter';
  }

  /**
   * Update configuration and invalidate cache
   */
  setConfig(config: Partial<LeafLitterConfig>): void {
    this.config = { ...this.config, ...config };
    this.cacheValid = false;
    this.leaves = null;
    
    if (config.seed !== undefined) {
      this.rng = this.createRNG(this.config.seed);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LeafLitterConfig {
    return { ...this.config };
  }

  /**
   * Clear leaf cache
   */
  clearCache(): void {
    this.cacheValid = false;
    this.leaves = null;
  }
}

export default LeafLitterSurface;
