/**
 * WaterfallMeshRenderer - Generates visible waterfall meshes with effects
 *
 * Creates waterfall geometry as curved plane meshes positioned at terrain
 * height transitions with:
 * - Fast downward flow animation
 * - White foam/spray color
 * - Mist particle emitter at base
 * - Splash particle system at waterfall base
 * - Multi-tier waterfall support
 *
 * Uses THREE.MeshPhysicalMaterial for water and THREE.Points for particles.
 */

import * as THREE from 'three';
import { Waterfall, WaterfallTier } from './WaterfallGenerator';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/math/index';

// ============================================================================
// Configuration
// ============================================================================

export interface WaterfallMeshConfig {
  /** Flow animation speed (default 2.0) */
  flowSpeed: number;
  /** Number of vertical segments per tier (default 16) */
  verticalSegments: number;
  /** Number of horizontal segments across width (default 12) */
  horizontalSegments: number;
  /** Waterfall surface curvature amount (default 0.3) */
  curvature: number;
  /** Foam intensity (default 0.8) */
  foamIntensity: number;
  /** Number of mist particles per waterfall (default 200) */
  mistParticleCount: number;
  /** Number of splash particles per waterfall (default 150) */
  splashParticleCount: number;
  /** Mist spread radius (default 5.0) */
  mistRadius: number;
  /** Splash spread radius (default 3.0) */
  splashRadius: number;
}

// ============================================================================
// WaterfallMeshRenderer
// ============================================================================

export class WaterfallMeshRenderer {
  private config: WaterfallMeshConfig;
  private noise: NoiseUtils;
  private rng: SeededRandom;
  private time: number = 0;
  private group: THREE.Group;
  private waterfallMeshes: THREE.Mesh[] = [];
  private waterfallMaterials: THREE.MeshPhysicalMaterial[] = [];
  private mistSystems: THREE.Points[] = [];
  private splashSystems: THREE.Points[] = [];
  private mistVelocities: Float32Array[] = [];
  private splashVelocities: Float32Array[] = [];

  constructor(config: Partial<WaterfallMeshConfig> = {}) {
    this.config = {
      flowSpeed: 2.0,
      verticalSegments: 16,
      horizontalSegments: 12,
      curvature: 0.3,
      foamIntensity: 0.8,
      mistParticleCount: 200,
      splashParticleCount: 150,
      mistRadius: 5.0,
      splashRadius: 3.0,
      ...config,
    };
    this.noise = new NoiseUtils(42);
    this.rng = new SeededRandom(42);
    this.group = new THREE.Group();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Build meshes for an array of waterfalls.
   * Returns a Three.js Group containing waterfall surfaces and particles.
   */
  buildMeshes(waterfalls: Waterfall[]): THREE.Group {
    this.dispose();

    for (const waterfall of waterfalls) {
      this.buildSingleWaterfall(waterfall);
    }

    return this.group;
  }

  /**
   * Advance animation. Call from useFrame.
   */
  update(dt: number): void {
    this.time += dt;

    // Animate mist particles
    for (let i = 0; i < this.mistSystems.length; i++) {
      const mist = this.mistSystems[i];
      const velocities = this.mistVelocities[i];
      const positions = mist.geometry.attributes.position as THREE.BufferAttribute;

      for (let j = 0; j < positions.count; j++) {
        const x = positions.getX(j);
        const y = positions.getY(j);
        const z = positions.getZ(j);

        // Move upward and outward with turbulence
        const turbX = this.noise.perlin2D(x * 0.1, this.time * 0.5) * 0.02;
        const turbZ = this.noise.perlin2D(z * 0.1, this.time * 0.5 + 50) * 0.02;

        positions.setX(j, x + velocities[j * 3] * dt + turbX);
        positions.setY(j, y + velocities[j * 3 + 1] * dt);
        positions.setZ(j, z + velocities[j * 3 + 2] * dt + turbZ);

        // Reset particles that drift too far
        const dist = Math.sqrt(
          (positions.getX(j)) ** 2 +
          (positions.getY(j)) ** 2 +
          (positions.getZ(j)) ** 2
        );
        if (dist > this.config.mistRadius * 3 || y > 20) {
          positions.setX(j, 0);
          positions.setY(j, 0);
          positions.setZ(j, 0);
        }
      }
      positions.needsUpdate = true;
    }

    // Animate splash particles
    for (let i = 0; i < this.splashSystems.length; i++) {
      const splash = this.splashSystems[i];
      const velocities = this.splashVelocities[i];
      const positions = splash.geometry.attributes.position as THREE.BufferAttribute;

      for (let j = 0; j < positions.count; j++) {
        const x = positions.getX(j);
        const y = positions.getY(j);
        const z = positions.getZ(j);

        // Gravity + outward motion
        velocities[j * 3 + 1] -= 9.81 * dt; // gravity

        positions.setX(j, x + velocities[j * 3] * dt);
        positions.setY(j, y + velocities[j * 3 + 1] * dt);
        positions.setZ(j, z + velocities[j * 3 + 2] * dt);

        // Reset particles that fall below base
        if (positions.getY(j) < -2) {
          const angle = this.rng.next() * Math.PI * 2;
          const speed = this.rng.next() * 2 + 1;
          positions.setX(j, 0);
          positions.setY(j, 0);
          positions.setZ(j, 0);
          velocities[j * 3] = Math.cos(angle) * speed;
          velocities[j * 3 + 1] = this.rng.next() * 4 + 2;
          velocities[j * 3 + 2] = Math.sin(angle) * speed;
        }
      }
      positions.needsUpdate = true;
    }
  }

  /**
   * Get the group containing all waterfall meshes and particles
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    for (const mesh of this.waterfallMeshes) {
      mesh.geometry.dispose();
    }
    for (const mat of this.waterfallMaterials) {
      mat.dispose();
    }
    for (const mist of this.mistSystems) {
      mist.geometry.dispose();
      (mist.material as THREE.PointsMaterial).dispose();
    }
    for (const splash of this.splashSystems) {
      splash.geometry.dispose();
      (splash.material as THREE.PointsMaterial).dispose();
    }
    this.waterfallMeshes = [];
    this.waterfallMaterials = [];
    this.mistSystems = [];
    this.splashSystems = [];
    this.mistVelocities = [];
    this.splashVelocities = [];
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  // ------------------------------------------------------------------
  // Waterfall Geometry
  // ------------------------------------------------------------------

  /**
   * Build a single waterfall with mesh, mist, and splash
   */
  private buildSingleWaterfall(waterfall: Waterfall): void {
    // Build waterfall surface mesh for each tier
    for (const tier of waterfall.tiers) {
      const geometry = this.buildTierGeometry(tier);
      const material = this.createWaterfallMaterial();
      const mesh = new THREE.Mesh(geometry, material);

      mesh.renderOrder = 996;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.waterfallMeshes.push(mesh);
      this.waterfallMaterials.push(material);
    }

    // Build mist particle system at base
    const mist = this.createMistParticles(waterfall);
    this.group.add(mist);
    this.mistSystems.push(mist);

    // Build splash particle system at base
    const splash = this.createSplashParticles(waterfall);
    this.group.add(splash);
    this.splashSystems.push(splash);
  }

  /**
   * Build geometry for a single waterfall tier (curved plane)
   */
  private buildTierGeometry(tier: WaterfallTier): THREE.BufferGeometry {
    const vSegs = this.config.verticalSegments;
    const hSegs = this.config.horizontalSegments;
    const { position, height, width, overhang } = tier;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // Direction from the waterfall position (assuming forward is -Z)
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    for (let j = 0; j <= vSegs; j++) {
      const v = j / vSegs; // 0 = top, 1 = bottom
      const y = position.y - v * height;

      // Curvature: waterfall curves outward (overhang) in the middle
      const curveFactor = Math.sin(v * Math.PI) * this.config.curvature * overhang;
      const zOffset = curveFactor;

      // Width narrows slightly at the middle (acceleration)
      const widthFactor = 1.0 - Math.sin(v * Math.PI) * 0.1;
      const currentWidth = width * widthFactor;

      for (let i = 0; i <= hSegs; i++) {
        const u = i / hSegs; // 0 = left, 1 = right
        const lateralOffset = (u - 0.5) * currentWidth;

        const vx = position.x + right.x * lateralOffset;
        const vy = y;
        const vz = position.z + forward.z * zOffset + right.z * lateralOffset;

        positions.push(vx, vy, vz);
        normals.push(0, 0, 1); // Will be recomputed

        // UV: v increases downward for flow animation
        uvs.push(u, v);

        // Color: white foam at top and bottom, slightly blue in middle
        const foamAtTop = 1.0 - Math.abs(v - 0.0) * 2;
        const foamAtBottom = 1.0 - Math.abs(v - 1.0) * 2;
        const foamAmount = Math.max(foamAtTop, foamAtBottom) * this.config.foamIntensity;
        const waterAmount = 1.0 - foamAmount;

        // Foam = white, water = light blue
        const r = foamAmount * 1.0 + waterAmount * 0.6;
        const g = foamAmount * 1.0 + waterAmount * 0.8;
        const b = foamAmount * 1.0 + waterAmount * 0.95;
        colors.push(r, g, b);
      }
    }

    // Create indices
    for (let j = 0; j < vSegs; j++) {
      for (let i = 0; i < hSegs; i++) {
        const a = j * (hSegs + 1) + i;
        const b = a + 1;
        const c = a + (hSegs + 1);
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // ------------------------------------------------------------------
  // Material
  // ------------------------------------------------------------------

  /**
   * Create waterfall material with fast downward flow appearance
   */
  private createWaterfallMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xddeeff),
      transparent: true,
      opacity: 0.75,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.5,
      thickness: 0.2,
      ior: 1.33,
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: new THREE.Color(0x4488cc),
      emissiveIntensity: 0.05,
    });
  }

  // ------------------------------------------------------------------
  // Particle Systems
  // ------------------------------------------------------------------

  /**
   * Create mist particle system at waterfall base
   */
  private createMistParticles(waterfall: Waterfall): THREE.Points {
    const count = this.config.mistParticleCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    const basePos = waterfall.plungePool.position;

    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = this.rng.next() * this.config.mistRadius;

      positions[i * 3] = basePos.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = basePos.y + this.rng.next() * waterfall.height * 0.3;
      positions[i * 3 + 2] = basePos.z + Math.sin(angle) * radius;

      // Mist rises slowly with slight outward drift
      velocities[i * 3] = Math.cos(angle) * 0.3;
      velocities[i * 3 + 1] = this.rng.next() * 0.5 + 0.2;
      velocities[i * 3 + 2] = Math.sin(angle) * 0.3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mistVelocities.push(velocities);

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 995;
    return points;
  }

  /**
   * Create splash particle system at waterfall base
   */
  private createSplashParticles(waterfall: Waterfall): THREE.Points {
    const count = this.config.splashParticleCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    const basePos = waterfall.plungePool.position;

    for (let i = 0; i < count; i++) {
      // Start at base position
      positions[i * 3] = basePos.x;
      positions[i * 3 + 1] = basePos.y;
      positions[i * 3 + 2] = basePos.z;

      // Random upward + outward velocity
      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.next() * 2 + 1;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = this.rng.next() * 4 + 2;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xcceeFF,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.splashVelocities.push(velocities);

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 995;
    return points;
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  updateConfig(partial: Partial<WaterfallMeshConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): WaterfallMeshConfig {
    return { ...this.config };
  }
}
