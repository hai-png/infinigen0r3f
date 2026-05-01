import { SeededRandom } from '../core/util/MathUtils';
/**
 * Boulder Factory - Procedural boulder generation
 * 
 * Creates various boulder and rock geometries with
 * different shapes, sizes, and surface characteristics.
 */

import * as THREE from 'three';

export interface BoulderConfig {
  size: number;
  roughness: number;
  flatness: number;
  detail: number;
  seed: number;
  /** Radius alias for size */
  radius?: number;
  /** Displacement scale for surface detail */
  displacementScale?: number;
}

export class BoulderFactory {
  private config: BoulderConfig;
  private _rng = new SeededRandom(42);

  constructor(config: Partial<BoulderConfig> = {}) {
    this.config = {
      size: 1,
      roughness: 0.5,
      flatness: 0.7,
      detail: 2,
      seed: 42,
      ...config,
    };
    // Apply radius as size if provided
    if (config.radius) this.config.size = config.radius;
  }

  /** Generate asset as a THREE.Group */
  async generateAsset(): Promise<THREE.Group> {
    const group = new THREE.Group();
    const geometry = this.generate();
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: this.config.roughness });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  /** Generate a collection of boulders */
  async generateCollection(count: number, options?: { seed?: number }): Promise<THREE.Group[]> {
    const boulders: THREE.Group[] = [];
    for (let i = 0; i < count; i++) {
      const boulder = await this.generateAsset();
      // Randomize scale
      const scale = 0.5 + this._rng.next() * 1.5;
      boulder.scale.set(scale, scale * this.config.flatness, scale);
      boulders.push(boulder);
    }
    return boulders;
  }

  generate(config: Partial<BoulderConfig> = {}): THREE.BufferGeometry {
    const fullConfig = { ...this.config, ...config };
    // Create a deformed icosahedron as a boulder
    const geometry = new THREE.IcosahedronGeometry(fullConfig.size, fullConfig.detail);
    return geometry;
  }

  createInstancedBoulders(
    count: number,
    area: { width: number; depth: number },
    config?: Partial<BoulderConfig>
  ): THREE.InstancedMesh {
    const geometry = this.generate(config);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    return mesh;
  }
}
