/**
 * WaterfallRenderer — P3.5: Waterfall Renderer (Enhanced)
 *
 * Detects elevation drops along river paths that exceed a threshold,
 * generates waterfall meshes with UV animation for downward flow, adds
 * particle-based mist and spray at the waterfall base, and uses
 * MeshPhysicalMaterial with high roughness + emissive for foam effects.
 *
 * Phase 3 — P3.5: Waterfall Renderer
 *
 * @module terrain/water
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import { createWaterMaterial, type WaterMaterialPreset } from './PathTracedWaterMaterial';
import type { RiverPath } from './RiverNetworkV2';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the waterfall renderer.
 */
export interface WaterfallConfig {
  /** RNG seed (default 42) */
  seed: number;
  /** Minimum elevation drop (world units) to classify as a waterfall (default 5.0) */
  minElevationDrop: number;
  /** Maximum elevation drop for single-tier waterfalls (default 100) */
  maxElevationDrop: number;
  /** Slope threshold for waterfall detection (default 1.5) */
  slopeThreshold: number;
  /** Number of vertical mesh segments per tier (default 16) */
  verticalSegments: number;
  /** Number of horizontal mesh segments (default 12) */
  horizontalSegments: number;
  /** Waterfall surface curvature (default 0.3) */
  curvature: number;
  /** Flow UV animation speed (default 2.0) */
  flowSpeed: number;
  /** Foam intensity (default 0.8) */
  foamIntensity: number;
  /** Number of mist particles per waterfall (default 200) */
  mistParticleCount: number;
  /** Number of spray particles per waterfall (default 150) */
  sprayParticleCount: number;
  /** Mist spread radius (default 5.0) */
  mistRadius: number;
  /** Water material preset for the waterfall surface (default 'river') */
  materialPreset: WaterMaterialPreset;
  /** Whether to use path-traced material (default true) */
  usePathTracedMaterial: boolean;
}

/**
 * Information about a detected and rendered waterfall.
 */
export interface WaterfallInfo {
  /** Unique identifier */
  id: number;
  /** Top of the waterfall */
  topPosition: THREE.Vector3;
  /** Base of the waterfall */
  basePosition: THREE.Vector3;
  /** Total height of the waterfall */
  height: number;
  /** Width of the waterfall */
  width: number;
  /** Number of tiers */
  tierCount: number;
  /** The waterfall surface mesh */
  mesh: THREE.Mesh;
  /** Mist particle system */
  mistSystem: THREE.Points;
  /** Spray particle system */
  spraySystem: THREE.Points;
  /** Flow animation time */
  flowTime: number;
}

// ============================================================================
// WaterfallRenderer
// ============================================================================

export class WaterfallRenderer {
  private config: WaterfallConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private group: THREE.Group;
  private waterfalls: WaterfallInfo[] = [];
  private mistVelocities: Float32Array[] = [];
  private sprayVelocities: Float32Array[] = [];
  private time: number = 0;

  constructor(config: Partial<WaterfallConfig> = {}) {
    this.config = {
      seed: 42,
      minElevationDrop: 5.0,
      maxElevationDrop: 100,
      slopeThreshold: 1.5,
      verticalSegments: 16,
      horizontalSegments: 12,
      curvature: 0.3,
      flowSpeed: 2.0,
      foamIntensity: 0.8,
      mistParticleCount: 200,
      sprayParticleCount: 150,
      mistRadius: 5.0,
      materialPreset: 'river',
      usePathTracedMaterial: true,
      ...config,
    };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.group = new THREE.Group();
  }

  // ------------------------------------------------------------------
  // Waterfall Detection
  // ------------------------------------------------------------------

  /**
   * Detect elevation drops along river paths that exceed the threshold.
   * Returns candidate locations where waterfalls should be placed.
   */
  detectWaterfalls(
    rivers: RiverPath[][],
  ): { topIndex: number; baseIndex: number; height: number; slope: number; river: RiverPath[] }[] {
    const candidates: { topIndex: number; baseIndex: number; height: number; slope: number; river: RiverPath[] }[] = [];

    for (const river of rivers) {
      for (let i = 0; i < river.length - 1; i++) {
        const current = river[i];
        const next = river[i + 1];

        const dx = next.position.x - current.position.x;
        const dz = next.position.z - current.position.z;
        const dy = next.position.y - current.position.y;
        const horizDist = Math.sqrt(dx * dx + dz * dz);
        if (horizDist < 0.001) continue;

        const slope = Math.abs(dy) / horizDist;
        const elevationDrop = Math.abs(dy);

        if (slope > this.config.slopeThreshold && elevationDrop >= this.config.minElevationDrop) {
          candidates.push({
            topIndex: i,
            baseIndex: i + 1,
            height: Math.min(elevationDrop, this.config.maxElevationDrop),
            slope,
            river,
          });
        }
      }
    }

    return candidates;
  }

  // ------------------------------------------------------------------
  // Waterfall Mesh Generation
  // ------------------------------------------------------------------

  /**
   * Build a curved plane mesh for a waterfall with UV coordinates
   * aligned for downward flow animation.
   */
  private buildWaterfallGeometry(
    topPos: THREE.Vector3,
    basePos: THREE.Vector3,
    width: number,
    overhang: number,
  ): THREE.BufferGeometry {
    const vSegs = this.config.verticalSegments;
    const hSegs = this.config.horizontalSegments;
    const height = topPos.y - basePos.y;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    for (let j = 0; j <= vSegs; j++) {
      const v = j / vSegs; // 0 = top, 1 = bottom
      const y = topPos.y - v * height;

      // Curvature: outward bulge in the middle
      const curveFactor = Math.sin(v * Math.PI) * this.config.curvature * overhang;
      const zOffset = curveFactor;

      // Width narrows slightly in the middle (acceleration)
      const widthFactor = 1.0 - Math.sin(v * Math.PI) * 0.1;
      const currentWidth = width * widthFactor;

      for (let i = 0; i <= hSegs; i++) {
        const u = i / hSegs;
        const lateralOffset = (u - 0.5) * currentWidth;

        const vx = topPos.x + right.x * lateralOffset;
        const vy = y;
        const vz = topPos.z + forward.z * zOffset + right.z * lateralOffset;

        positions.push(vx, vy, vz);
        normals.push(0, 0, 1);

        // UV: v increases downward for flow animation
        uvs.push(u, v);

        // Colour: white foam at top/bottom, slightly blue in middle
        const foamAtTop = Math.max(0, 1.0 - Math.abs(v) * 3);
        const foamAtBottom = Math.max(0, 1.0 - Math.abs(v - 1.0) * 3);
        const foamAmount = Math.max(foamAtTop, foamAtBottom) * this.config.foamIntensity;
        const waterAmount = 1.0 - foamAmount;
        colors.push(
          foamAmount * 1.0 + waterAmount * 0.6,
          foamAmount * 1.0 + waterAmount * 0.8,
          foamAmount * 1.0 + waterAmount * 0.95,
        );
      }
    }

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
  // Particle Systems (Mist & Spray)
  // ------------------------------------------------------------------

  /**
   * Create mist particle system at the waterfall base.
   * Mist particles rise slowly with slight outward drift and turbulence.
   */
  private createMistParticles(
    basePosition: THREE.Vector3,
    height: number,
    width: number,
  ): { points: THREE.Points; velocities: Float32Array } {
    const count = this.config.mistParticleCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = this.rng.next() * this.config.mistRadius;

      positions[i * 3] = basePosition.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = basePosition.y + this.rng.next() * height * 0.3;
      positions[i * 3 + 2] = basePosition.z + Math.sin(angle) * radius;

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

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 995;

    return { points, velocities };
  }

  /**
   * Create spray particle system at the waterfall base.
   * Spray particles are ejected upward with gravity pulling them back.
   */
  private createSprayParticles(
    basePosition: THREE.Vector3,
  ): { points: THREE.Points; velocities: Float32Array } {
    const count = this.config.sprayParticleCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = basePosition.x;
      positions[i * 3 + 1] = basePosition.y;
      positions[i * 3 + 2] = basePosition.z;

      const angle = this.rng.next() * Math.PI * 2;
      const speed = this.rng.next() * 2 + 1;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = this.rng.next() * 4 + 2;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xcceeff,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 995;

    return { points, velocities };
  }

  // ------------------------------------------------------------------
  // Waterfall Material
  // ------------------------------------------------------------------

  /**
   * Create a waterfall material.
   * For path-traced mode: MeshPhysicalMaterial with high roughness +
   * emissive for foam appearance.
   * For rasterize mode: same material works well with vertex colours.
   */
  private createWaterfallMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xddeeff),
      transparent: true,
      opacity: 0.75,
      roughness: 0.15,
      metalness: 0.0,
      transmission: 0.5,
      thickness: 0.2,
      ior: 1.33,
      clearcoat: 0.5,
      clearcoatRoughness: 0.1,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Emissive for foam glow — makes foam look luminous in both modes
      emissive: new THREE.Color(0x4488cc),
      emissiveIntensity: 0.08,
      // Attenuation for path-traced depth tinting
      attenuationColor: new THREE.Color(0x4488cc),
      attenuationDistance: 0.5,
    });
  }

  // ------------------------------------------------------------------
  // Main Generation Entry Point
  // ------------------------------------------------------------------

  /**
   * Detect and generate waterfalls from river path data.
   */
  generate(
    rivers: RiverPath[][],
  ): {
    waterfalls: WaterfallInfo[];
    group: THREE.Group;
  } {
    this.dispose();
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);

    // 1. Detect waterfall candidates
    const candidates = this.detectWaterfalls(rivers);

    // 2. Generate waterfall for each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const river = candidate.river;
      const topPoint = river[candidate.topIndex];
      const basePoint = river[candidate.baseIndex];

      // Compute overhang
      const overhang = candidate.height * 0.1 + this.noise.perlin2D(topPoint.position.x * 0.1, topPoint.position.z * 0.1) * candidate.height * 0.05;

      // Build waterfall mesh
      const geometry = this.buildWaterfallGeometry(
        topPoint.position,
        basePoint.position,
        topPoint.width,
        overhang,
      );
      const material = this.createWaterfallMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 996;
      mesh.frustumCulled = false;

      // Build particle systems
      const { points: mist, velocities: mistVel } = this.createMistParticles(
        basePoint.position, candidate.height, topPoint.width,
      );
      const { points: spray, velocities: sprayVel } = this.createSprayParticles(
        basePoint.position,
      );

      this.group.add(mesh);
      this.group.add(mist);
      this.group.add(spray);

      this.mistVelocities.push(mistVel);
      this.sprayVelocities.push(sprayVel);

      const info: WaterfallInfo = {
        id: i,
        topPosition: topPoint.position.clone(),
        basePosition: basePoint.position.clone(),
        height: candidate.height,
        width: topPoint.width,
        tierCount: 1,
        mesh,
        mistSystem: mist,
        spraySystem: spray,
        flowTime: 0,
      };

      this.waterfalls.push(info);
    }

    return { waterfalls: this.waterfalls, group: this.group };
  }

  // ------------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------------

  /**
   * Advance waterfall animations — mist drift, spray gravity, UV flow.
   * Call from useFrame each frame.
   */
  update(dt: number): void {
    this.time += dt;

    // Animate mist
    for (let i = 0; i < this.waterfalls.length; i++) {
      const wf = this.waterfalls[i];
      wf.flowTime += dt * this.config.flowSpeed;

      // Mist
      const mistPositions = wf.mistSystem.geometry.attributes.position as THREE.BufferAttribute;
      const mistVel = this.mistVelocities[i];
      for (let j = 0; j < mistPositions.count; j++) {
        const x = mistPositions.getX(j);
        const y = mistPositions.getY(j);
        const z = mistPositions.getZ(j);

        const turbX = this.noise.perlin2D(x * 0.1, this.time * 0.5) * 0.02;
        const turbZ = this.noise.perlin2D(z * 0.1, this.time * 0.5 + 50) * 0.02;

        mistPositions.setX(j, x + mistVel[j * 3] * dt + turbX);
        mistPositions.setY(j, y + mistVel[j * 3 + 1] * dt);
        mistPositions.setZ(j, z + mistVel[j * 3 + 2] * dt + turbZ);

        // Reset particles that drift too far
        const dist = Math.sqrt(x * x + (y - wf.basePosition.y) ** 2 + z * z);
        if (dist > this.config.mistRadius * 3 || y > wf.basePosition.y + wf.height) {
          mistPositions.setX(j, wf.basePosition.x);
          mistPositions.setY(j, wf.basePosition.y);
          mistPositions.setZ(j, wf.basePosition.z);
        }
      }
      mistPositions.needsUpdate = true;

      // Spray
      const sprayPositions = wf.spraySystem.geometry.attributes.position as THREE.BufferAttribute;
      const sprayVel = this.sprayVelocities[i];
      for (let j = 0; j < sprayPositions.count; j++) {
        const x = sprayPositions.getX(j);
        const y = sprayPositions.getY(j);
        const z = sprayPositions.getZ(j);

        // Gravity
        sprayVel[j * 3 + 1] -= 9.81 * dt;

        sprayPositions.setX(j, x + sprayVel[j * 3] * dt);
        sprayPositions.setY(j, y + sprayVel[j * 3 + 1] * dt);
        sprayPositions.setZ(j, z + sprayVel[j * 3 + 2] * dt);

        // Reset if below base
        if (sprayPositions.getY(j) < wf.basePosition.y - 2) {
          const angle = this.rng.next() * Math.PI * 2;
          const speed = this.rng.next() * 2 + 1;
          sprayPositions.setX(j, wf.basePosition.x);
          sprayPositions.setY(j, wf.basePosition.y);
          sprayPositions.setZ(j, wf.basePosition.z);
          sprayVel[j * 3] = Math.cos(angle) * speed;
          sprayVel[j * 3 + 1] = this.rng.next() * 4 + 2;
          sprayVel[j * 3 + 2] = Math.sin(angle) * speed;
        }
      }
      sprayPositions.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  getGroup(): THREE.Group { return this.group; }
  getWaterfalls(): WaterfallInfo[] { return this.waterfalls; }

  updateConfig(partial: Partial<WaterfallConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): WaterfallConfig { return { ...this.config }; }

  dispose(): void {
    for (const wf of this.waterfalls) {
      wf.mesh.geometry.dispose();
      if (Array.isArray(wf.mesh.material)) {
        wf.mesh.material.forEach(m => m.dispose());
      } else {
        wf.mesh.material.dispose();
      }
      wf.mistSystem.geometry.dispose();
      (wf.mistSystem.material as THREE.PointsMaterial).dispose();
      wf.spraySystem.geometry.dispose();
      (wf.spraySystem.material as THREE.PointsMaterial).dispose();
    }
    this.waterfalls = [];
    this.mistVelocities = [];
    this.sprayVelocities = [];
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }
}
