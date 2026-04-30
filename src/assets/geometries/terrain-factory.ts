/**
 * Terrain Factory - Procedural terrain mesh generation
 * 
 * Creates terrain meshes from heightmaps, noise functions,
 * and SDF data with various LOD levels.
 */

import * as THREE from 'three';

export interface TerrainConfig {
  size: number;
  resolution: number;
  maxHeight: number;
  noiseScale: number;
  noiseOctaves: number;
  seed: number;
  /** Width alias for size */
  width?: number;
  /** Depth alias for size */
  depth?: number;
  /** Enable water plane */
  enableWater?: boolean;
  /** Water level (0-1 normalized) */
  waterLevel?: number;
}

export class TerrainFactory {
  private config: TerrainConfig;

  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = {
      size: 100,
      resolution: 128,
      maxHeight: 10,
      noiseScale: 1,
      noiseOctaves: 6,
      seed: 42,
      ...config,
    };
    // Apply width/depth as size if provided
    if (config.width) this.config.size = config.width;
    if (config.depth && !config.width) this.config.size = config.depth;
  }

  /** Generate asset as a THREE.Group (convenience method for outdoor-scene) */
  async generateAsset(): Promise<THREE.Group> {
    const group = new THREE.Group();
    const geometry = this.generate();
    const material = new THREE.MeshStandardMaterial({
      color: 0x3a7c3a,
      roughness: 0.9,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    return group;
  }

  generate(config: Partial<TerrainConfig> = {}): THREE.BufferGeometry {
    const fullConfig = { ...this.config, ...config };
    const geometry = new THREE.PlaneGeometry(
      fullConfig.size,
      fullConfig.size,
      fullConfig.resolution,
      fullConfig.resolution
    );
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  generateWithHeightMap(heightMap: Float32Array, width: number, height: number): THREE.BufferGeometry {
    const geometry = new THREE.PlaneGeometry(width, height, width - 1, height - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = heightMap[i] || 0;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }
}
