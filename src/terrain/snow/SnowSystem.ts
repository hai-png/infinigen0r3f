/**
 * Snow System for Terrain
 * Implements snow accumulation, slope-based sliding, wind-driven patterns, and melting
 */

import * as THREE from 'three';

export interface SnowParams {
  /** Base snow depth in meters */
  baseDepth: number;
  /** Maximum snow depth on flat surfaces */
  maxDepth: number;
  /** Slope angle threshold for snow sliding (degrees) */
  slideThreshold: number;
  /** Wind strength (0-1) */
  windStrength: number;
  /** Wind direction vector */
  windDirection: THREE.Vector3;
  /** Temperature for melting simulation */
  temperature: number;
  /** Melting rate per second */
  meltRate: number;
  /** Accumulation rate per second */
  accumulateRate: number;
  /** Enable wind-driven drifts */
  enableDrifts: boolean;
  /** Drift scale */
  driftScale: number;
}

export class SnowSystem {
  private params: SnowParams;
  private snowDepthMap: Float32Array | null = null;
  private width: number = 0;
  private height: number = 0;

  constructor(params: Partial<SnowParams> = {}) {
    this.params = {
      baseDepth: 0.1,
      maxDepth: 2.0,
      slideThreshold: 45,
      windStrength: 0.3,
      windDirection: new THREE.Vector3(1, 0, 0),
      temperature: -5,
      meltRate: 0.001,
      accumulateRate: 0.01,
      enableDrifts: true,
      driftScale: 10,
      ...params,
    };
  }

  /**
   * Initialize snow depth map
   */
  initialize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.snowDepthMap = new Float32Array(width * height);
    
    // Initialize with base depth
    for (let i = 0; i < width * height; i++) {
      this.snowDepthMap[i] = this.params.baseDepth;
    }
  }

  /**
   * Simulate snow accumulation based on slope and wind
   */
  simulate(
    heightMap: Float32Array,
    normalMap: Float32Array,
    deltaTime: number
  ): Float32Array {
    if (!this.snowDepthMap) {
      throw new Error('Snow system not initialized');
    }

    const newDepthMap = new Float32Array(this.snowDepthMap.length);
    const slideThresholdRad = (this.params.slideThreshold * Math.PI) / 180;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        
        // Get surface normal
        const nx = normalMap[idx * 3];
        const ny = normalMap[idx * 3 + 1];
        const nz = normalMap[idx * 3 + 2];
        
        // Calculate slope angle from normal
        const slopeAngle = Math.acos(Math.max(0, ny));
        
        let depth = this.snowDepthMap[idx];
        
        // Accumulation
        depth += this.params.accumulateRate * deltaTime;
        
        // Slope-based sliding
        if (slopeAngle > slideThresholdRad) {
          const slideFactor = (slopeAngle - slideThresholdRad) / (Math.PI / 2 - slideThresholdRad);
          depth *= (1 - slideFactor * 0.5);
        }
        
        // Wind-driven patterns
        if (this.params.enableDrifts) {
          const windDot = nx * this.params.windDirection.x + nz * this.params.windDirection.z;
          if (windDot > 0) {
            // Windward side - less accumulation
            depth *= 0.8;
          } else {
            // Leeward side - more accumulation (drifts)
            const driftNoise = Math.sin(x / this.params.driftScale) * Math.cos(y / this.params.driftScale);
            depth += this.params.windStrength * this.params.driftScale * Math.max(0, driftNoise) * deltaTime;
          }
        }
        
        // Temperature-based melting
        if (this.params.temperature > 0) {
          depth -= this.params.meltRate * (this.params.temperature / 10) * deltaTime;
        }
        
        // Clamp depth
        depth = Math.max(0, Math.min(depth, this.params.maxDepth));
        
        newDepthMap[idx] = depth;
      }
    }

    this.snowDepthMap = newDepthMap;
    return newDepthMap;
  }

  /**
   * Get snow depth at a specific position
   */
  getDepth(x: number, y: number): number {
    if (!this.snowDepthMap || x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return this.params.baseDepth;
    }
    return this.snowDepthMap[y * this.width + x];
  }

  /**
   * Apply snow to geometry by displacing vertices using bilinear interpolation
   */
  applyToGeometry(geometry: THREE.BufferGeometry, heightMap: Float32Array): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const newPositions = new Float32Array(positions.length);
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 2]; // Z is Y in terrain space
      const z = positions[i + 1];
      
      // Sample snow depth from the depth map using bilinear interpolation
      let snowDepth = this.params.baseDepth;
      if (this.snowDepthMap && this.width > 0 && this.height > 0) {
        snowDepth = this.sampleDepthBilinear(x, y);
      }
      
      newPositions[i] = x;
      newPositions[i + 1] = z + snowDepth;
      newPositions[i + 2] = y;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }

  /**
   * Sample snow depth using bilinear interpolation between the 4 nearest texels
   */
  private sampleDepthBilinear(x: number, y: number): number {
    if (!this.snowDepthMap || this.width <= 0 || this.height <= 0) {
      return this.params.baseDepth;
    }

    // Clamp to valid range
    if (x < 0 || x >= this.width - 1 || y < 0 || y >= this.height - 1) {
      // Fall back to nearest for boundary pixels
      const mapX = Math.min(Math.max(Math.round(x), 0), this.width - 1);
      const mapY = Math.min(Math.max(Math.round(y), 0), this.height - 1);
      return this.snowDepthMap[mapY * this.width + mapX];
    }

    // Integer part (top-left corner of the interpolation cell)
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    // Fractional parts
    const fx = x - x0;
    const fy = y - y0;

    // Fetch the 4 surrounding texels
    const v00 = this.snowDepthMap[y0 * this.width + x0];
    const v10 = this.snowDepthMap[y0 * this.width + x1];
    const v01 = this.snowDepthMap[y1 * this.width + x0];
    const v11 = this.snowDepthMap[y1 * this.width + x1];

    // Bilinear interpolation
    const top = v00 * (1 - fx) + v10 * fx;
    const bottom = v01 * (1 - fx) + v11 * fx;
    return top * (1 - fy) + bottom * fy;
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<SnowParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Get current snow depth map
   */
  getDepthMap(): Float32Array | null {
    return this.snowDepthMap;
  }
}

export default SnowSystem;
