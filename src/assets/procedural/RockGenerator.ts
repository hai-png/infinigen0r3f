import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Configuration for procedural rock generation
 */
export interface RockConfig {
  // Size properties
  size: number;
  width: number;
  height: number;
  depth: number;
  
  // Shape properties
  segments: number;
  irregularity: number;
  noiseScale: number;
  noiseDetail: number;
  
  // Material properties
  rockColor: THREE.Color;
  roughness: number;
  metalness: number;
  
  // Variation
  seed?: number;
  randomness: number;
}

/**
 * Procedural Rock Generator
 * Generates realistic rocks using noise-based displacement on spheres/icosahedrons
 */
export class RockGenerator {
  private config: RockConfig;
  
  constructor(config: Partial<RockConfig> = {}) {
    this.config = {
      size: 1,
      width: 1,
      height: 0.6,
      depth: 0.8,
      segments: 3,
      irregularity: 0.4,
      noiseScale: 1.5,
      noiseDetail: 2,
      rockColor: new THREE.Color(0x808080),
      roughness: 0.9,
      metalness: 0.1,
      randomness: 0.3,
      ...config
    };
  }

  /**
   * Generate a single rock mesh
   */
  generate(): THREE.Mesh {
    // Start with an icosahedron for good base topology
    const geometry = new THREE.IcosahedronGeometry(1, this.config.segments);
    
    // Apply noise-based displacement
    this.displaceVertices(geometry);
    
    // Scale to desired dimensions
    geometry.scale(
      this.config.width * this.config.size,
      this.config.height * this.config.size,
      this.config.depth * this.config.size
    );
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: this.config.rockColor,
      roughness: this.config.roughness,
      metalness: this.config.metalness,
      bumpScale: 0.02
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Generate multiple rocks with variation
   */
  generateCluster(count: number, spread: number): THREE.Group {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < count; i++) {
      const rockGeo = new THREE.IcosahedronGeometry(1, this.config.segments);
      this.displaceVertices(rockGeo, i); // Use index as seed offset
      
      // Random position within spread
      const x = (Math.random() - 0.5) * spread;
      const z = (Math.random() - 0.5) * spread;
      const y = Math.abs(x + z) * 0.1; // Slight height variation
      
      rockGeo.translate(x, y, z);
      
      // Random rotation
      const rotation = new THREE.Euler(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      rockGeo.rotateX(rotation.x);
      rockGeo.rotateY(rotation.y);
      rockGeo.rotateZ(rotation.z);
      
      // Random scale variation
      const scale = 0.7 + Math.random() * 0.6;
      rockGeo.scale(
        scale * this.config.width * this.config.size,
        scale * this.config.height * this.config.size,
        scale * this.config.depth * this.config.size
      );
      
      geometries.push(rockGeo);
    }
    
    if (geometries.length > 0) {
      const mergedGeo = mergeGeometries(geometries);
      const material = new THREE.MeshStandardMaterial({
        color: this.config.rockColor,
        roughness: this.config.roughness,
        metalness: this.config.metalness
      });
      
      const mesh = new THREE.Mesh(mergedGeo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    
    return group;
  }

  /**
   * Apply noise-based vertex displacement
   */
  private displaceVertices(geometry: THREE.BufferGeometry, seedOffset: number = 0): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Get original direction and distance
      const direction = vertex.clone().normalize();
      const originalDistance = vertex.length();
      
      // Calculate noise-based displacement
      const noise = this.simpleNoise(
        vertex.x * this.config.noiseScale + seedOffset,
        vertex.y * this.config.noiseScale,
        vertex.z * this.config.noiseScale
      );
      
      // Apply irregularity
      const displacement = 1 + (noise - 0.5) * this.config.irregularity;
      const newDistance = originalDistance * displacement;
      
      // Set new position
      vertex.copy(direction.multiplyScalar(newDistance));
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geometry.computeVertexNormals();
  }

  /**
   * Simple pseudo-random noise function (Perlin-like)
   */
  private simpleNoise(x: number, y: number, z: number): number {
    // Combine coordinates with prime numbers for better distribution
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Generate layered noise for more detail
   */
  private layeredNoise(x: number, y: number, z: number, octaves: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.simpleNoise(
        x * frequency,
        y * frequency,
        z * frequency
      );
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value / maxValue;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RockConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create boulder variant (larger, smoother)
   */
  generateBoulder(): THREE.Mesh {
    const originalConfig = { ...this.config };
    
    this.config = {
      ...this.config,
      irregularity: this.config.irregularity * 0.5, // Smoother
      size: this.config.size * 2, // Larger
      segments: Math.max(2, this.config.segments - 1) // Lower poly
    };
    
    const boulder = this.generate();
    
    // Restore config
    this.config = originalConfig;
    
    return boulder;
  }

  /**
   * Create gravel variant (small rocks)
   */
  generateGravel(count: number, area: number): THREE.Group {
    const originalConfig = { ...this.config };
    
    this.config = {
      ...this.config,
      size: this.config.size * 0.1, // Much smaller
      irregularity: this.config.irregularity * 1.5 // More irregular
    };
    
    const gravel = this.generateCluster(count, area);
    
    // Restore config
    this.config = originalConfig;
    
    return gravel;
  }
}
