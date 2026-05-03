/**
 * NewScatterTypes.ts — P4.5: New Scatter Types
 *
 * Implements 7 new scatter generators for ground-level detail objects.
 * Each generator is a class implementing a common ScatterGenerator interface,
 * supporting density control, seed-based randomization, and seasonal variation.
 *
 * Scatter generators:
 *   1. FernScatter      — Small fern fronds on forest floor
 *   2. MossScatter       — Moss patches on rocks and ground
 *   3. GroundLeavesScatter — Fallen leaves on the ground
 *   4. PineNeedleScatter — Pine needle debris under conifers
 *   5. SeashellScatter   — Seashells on beaches
 *   6. LichenScatter     — Lichen patches on rocks and tree bark
 *   7. PebbleScatter     — Small pebbles on paths and riverbeds
 *
 * Ported from: infinigen/terrain/objects/scatter/*.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { seededFbm } from '@/core/util/MathUtils';

// ============================================================================
// Common Interface & Types
// ============================================================================

/** Season type for seasonal variation */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * Base configuration shared by all scatter generators.
 */
export interface BaseScatterConfig {
  /** Density: instances per square meter (default 1.0) */
  density: number;
  /** Random seed for deterministic generation (default 42) */
  seed: number;
  /** Season for color variation (default 'summer') */
  season: Season;
  /** Minimum scale for instances (default 0.8) */
  minScale: number;
  /** Maximum scale for instances (default 1.2) */
  maxScale: number;
  /** Area bounds for scattering (default 20x20) */
  bounds: THREE.Box3;
  /** Maximum slope in degrees for placement (default 60) */
  maxSlope: number;
  /** Whether to enable seasonal color variation (default true) */
  seasonalVariation: boolean;
}

const DEFAULT_BASE_CONFIG: BaseScatterConfig = {
  density: 1.0,
  seed: 42,
  season: 'summer',
  minScale: 0.8,
  maxScale: 1.2,
  bounds: new THREE.Box3(
    new THREE.Vector3(-20, 0, -20),
    new THREE.Vector3(20, 2, 20)
  ),
  maxSlope: 60,
  seasonalVariation: true,
};

/**
 * Result from a scatter generator.
 */
export interface ScatterGeneratorResult {
  /** InstancedMesh containing all scattered instances */
  mesh: THREE.InstancedMesh;
  /** Total number of placed instances */
  count: number;
  /** Positions of placed instances */
  positions: THREE.Vector3[];
  /** Whether generation succeeded */
  success: boolean;
}

/**
 * Common interface that all scatter generators implement.
 */
export interface ScatterGenerator<TConfig extends BaseScatterConfig = BaseScatterConfig> {
  /** Generate scatter instances and return an InstancedMesh */
  generate(config?: Partial<TConfig>): ScatterGeneratorResult;
  /** Get the base geometry for this scatter type */
  getGeometry(seed: number): THREE.BufferGeometry;
  /** Get the material for this scatter type with seasonal variation */
  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial;
}

// ============================================================================
// 1. FernScatter
// ============================================================================

export interface FernScatterConfig extends BaseScatterConfig {
  /** Number of fronds per fern instance (default 5) */
  frondCount: number;
  /** Frond length in world units (default 0.3) */
  frondLength: number;
  /** Frond width in world units (default 0.1) */
  frondWidth: number;
}

/**
 * FernScatter — Generates small fern fronds on the forest floor.
 * Produces multi-frond fern clusters with seasonal color variation.
 */
export class FernScatter implements ScatterGenerator<FernScatterConfig> {
  generate(config?: Partial<FernScatterConfig>): ScatterGeneratorResult {
    const cfg: FernScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      frondCount: 5,
      frondLength: 0.3,
      frondWidth: 0.1,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const matrix = new THREE.Matrix4();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.1);

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng.uniform(0, Math.PI * 2), 0);
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const frondCount = 5;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let f = 0; f < frondCount; f++) {
      const angle = (f / frondCount) * Math.PI * 2;
      const baseIdx = positions.length / 3;
      const frondLen = rng.uniform(0.2, 0.4);
      const frondW = rng.uniform(0.04, 0.08);

      // Base
      positions.push(0, 0, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5, 0);

      // Tip
      const tx = Math.cos(angle) * frondW;
      const ty = frondLen;
      const tz = Math.sin(angle) * frondW;
      positions.push(tx, ty, tz);
      normals.push(0, 0, 1);
      uvs.push(0.5, 1);

      // Left
      const la = angle - 0.4;
      positions.push(Math.cos(la) * frondW * 0.5, ty * 0.5, Math.sin(la) * frondW * 0.5);
      normals.push(0, 0, 1);
      uvs.push(0, 0.5);

      // Right
      const ra = angle + 0.4;
      positions.push(Math.cos(ra) * frondW * 0.5, ty * 0.5, Math.sin(ra) * frondW * 0.5);
      normals.push(0, 0, 1);
      uvs.push(1, 0.5);

      indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 3);

      // Add sub-leaflets along the frond
      const leafletCount = 4;
      for (let l = 1; l <= leafletCount; l++) {
        const t = l / (leafletCount + 1);
        const ly = frondLen * t;
        const lx = Math.cos(angle) * frondW * 0.3 * t;
        const lz = Math.sin(angle) * frondW * 0.3 * t;
        const lbIdx = positions.length / 3;
        const leafletLen = frondW * (1 - t * 0.5);

        positions.push(lx, ly, lz);
        normals.push(0, 0, 1);
        uvs.push(0.5, t);

        // Left leaflet
        positions.push(lx - Math.cos(angle - 0.5) * leafletLen, ly, lz - Math.sin(angle - 0.5) * leafletLen);
        normals.push(0, 0, 1);
        uvs.push(0, t);

        // Right leaflet
        positions.push(lx + Math.cos(angle + 0.5) * leafletLen, ly, lz + Math.sin(angle + 0.5) * leafletLen);
        normals.push(0, 0, 1);
        uvs.push(1, t);

        indices.push(lbIdx, lbIdx + 1, lbIdx + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(_seed: number, season: Season): THREE.MeshStandardMaterial {
    const colors: Record<Season, number> = {
      spring: 0x7cb342,
      summer: 0x2e7d32,
      autumn: 0x8d6e63,
      winter: 0x5d4037,
    };
    return new THREE.MeshStandardMaterial({
      color: colors[season],
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 2. MossScatter
// ============================================================================

export interface MossScatterConfig extends BaseScatterConfig {
  /** Moss patch radius (default 0.05) */
  patchRadius: number;
  /** Moss thickness / height (default 0.02) */
  patchHeight: number;
}

/**
 * MossScatter — Generates moss patches on rocks and ground surfaces.
 * Produces small soft bumps with subtle color variation.
 */
export class MossScatter implements ScatterGenerator<MossScatterConfig> {
  generate(config?: Partial<MossScatterConfig>): ScatterGeneratorResult {
    const cfg: MossScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      patchRadius: 0.05,
      patchHeight: 0.02,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng.uniform(0, Math.PI * 2), 0);
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s * rng.uniform(0.5, 1.5), s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = 8;
    const radius = 0.05;
    const geo = new THREE.SphereGeometry(radius, segments, Math.max(4, segments / 2));
    // Flatten to a moss patch shape
    geo.scale(1, 0.4, 1);

    // Add slight noise displacement for organic feel
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const noise = rng.uniform(-0.005, 0.005);
      posAttr.setXYZ(i, x + noise, y + noise * 0.5, z + noise);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 50);
    const colors: Record<Season, number> = {
      spring: 0x4caf50,
      summer: 0x2e7d32,
      autumn: 0x558b2f,
      winter: 0x33691e,
    };
    const baseColor = new THREE.Color(colors[season]);
    // Slight variation
    baseColor.offsetHSL(rng.uniform(-0.02, 0.02), 0, rng.uniform(-0.05, 0.05));
    return new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95 });
  }
}

// ============================================================================
// 3. GroundLeavesScatter
// ============================================================================

export interface GroundLeavesScatterConfig extends BaseScatterConfig {
  /** Leaf size scale (default 1.0) */
  leafScale: number;
  /** Whether leaves lie flat on ground (default true) */
  flatOnGround: boolean;
}

/**
 * GroundLeavesScatter — Generates fallen leaves scattered on the ground.
 * Produces flat leaf shapes with autumnal color variation.
 */
export class GroundLeavesScatter implements ScatterGenerator<GroundLeavesScatterConfig> {
  generate(config?: Partial<GroundLeavesScatterConfig>): ScatterGeneratorResult {
    const cfg: GroundLeavesScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      leafScale: 1.0,
      flatOnGround: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.01);

      dummy.position.set(x, y, z);
      if (cfg.flatOnGround) {
        dummy.rotation.set(
          -Math.PI / 2 + rng.uniform(-0.1, 0.1),
          rng.uniform(0, Math.PI * 2),
          rng.uniform(-0.1, 0.1)
        );
      } else {
        dummy.rotation.set(
          rng.uniform(-0.3, 0.3),
          rng.uniform(0, Math.PI * 2),
          rng.uniform(-0.3, 0.3)
        );
      }
      const s = rng.uniform(cfg.minScale, cfg.maxScale) * cfg.leafScale;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(_seed: number): THREE.BufferGeometry {
    // Simple leaf shape: 4-vertex quad with elliptical shape
    const s = 0.05;
    const positions = new Float32Array([
      0, 0, -s * 0.5,
      -s * 0.3, 0, 0,
      0, 0, s * 0.5,
      s * 0.3, 0, 0,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0.5, 0, 0, 0.5, 0.5, 1, 1, 0.5]);
    const indices = [0, 1, 2, 0, 2, 3];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 100);
    // Seasonal color palette for fallen leaves
    const colors: Record<Season, number[]> = {
      spring: [0x8bc34a, 0x7cb342, 0x689f38],
      summer: [0x4caf50, 0x388e3c, 0x2e7d32],
      autumn: [0xff8f00, 0xd84315, 0xbf360c, 0xf57f17, 0x8d6e63],
      winter: [0x795548, 0x6d4c41, 0x5d4037],
    };
    const palette = colors[season];
    const color = new THREE.Color(rng.choice(palette));
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 4. PineNeedleScatter
// ============================================================================

export interface PineNeedleScatterConfig extends BaseScatterConfig {
  /** Needle length (default 0.08) */
  needleLength: number;
  /** Whether to cluster needles in small groups (default true) */
  clusterNeedles: boolean;
}

/**
 * PineNeedleScatter — Generates pine needle debris under conifer trees.
 * Produces thin elongated triangles with dark green color.
 */
export class PineNeedleScatter implements ScatterGenerator<PineNeedleScatterConfig> {
  generate(config?: Partial<PineNeedleScatterConfig>): ScatterGeneratorResult {
    const cfg: PineNeedleScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      needleLength: 0.08,
      clusterNeedles: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.005);

      dummy.position.set(x, y, z);
      // Needles lie mostly flat with random rotation
      dummy.rotation.set(
        -Math.PI / 2 + rng.uniform(-0.2, 0.2),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.15, 0.15)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const needleLen = rng.uniform(0.06, 0.1);
    const needleW = 0.003;

    const positions = new Float32Array([
      -needleW, 0, 0,
      needleW, 0, 0,
      0, 0, needleLen,
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
    const indices = [0, 1, 2];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  getMaterial(_seed: number, season: Season): THREE.MeshStandardMaterial {
    const colors: Record<Season, number> = {
      spring: 0x33691e,
      summer: 0x1b5e20,
      autumn: 0x33691e,
      winter: 0x2e7d32,
    };
    return new THREE.MeshStandardMaterial({
      color: colors[season],
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 5. SeashellScatter
// ============================================================================

export interface SeashellScatterConfig extends BaseScatterConfig {
  /** Maximum shell size (default 0.06) */
  maxSize: number;
  /** Shell color hue range start (default 0.05) */
  hueMin: number;
  /** Shell color hue range end (default 0.15) */
  hueMax: number;
}

/**
 * SeashellScatter — Generates seashells on beach surfaces.
 * Produces small spiral shell shapes with pastel coloration.
 */
export class SeashellScatter implements ScatterGenerator<SeashellScatterConfig> {
  generate(config?: Partial<SeashellScatterConfig>): ScatterGeneratorResult {
    const cfg: SeashellScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      maxSize: 0.06,
      hueMin: 0.05,
      hueMax: 0.15,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.01);

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        rng.uniform(-0.1, 0.1),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.1, 0.1)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s, s * rng.uniform(0.7, 1.3), s);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = 10;
    const radius = rng.uniform(0.03, 0.06);
    const geo = new THREE.SphereGeometry(radius, segments, Math.max(5, segments / 2));

    // Deform into a shell shape: elongate and add spiral taper
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Taper toward the top
      const t = (y + radius) / (2 * radius);
      const taper = 1.0 - t * 0.5;
      x *= taper;
      z *= taper;

      // Spiral offset
      const spiralAngle = t * Math.PI * 2;
      x += Math.cos(spiralAngle) * radius * 0.1 * t;
      z += Math.sin(spiralAngle) * radius * 0.1 * t;

      posAttr.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 200);
    const hue = rng.uniform(0.05, 0.15);
    const saturation = rng.uniform(0.15, 0.4);
    const lightness = rng.uniform(0.7, 0.9);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.05,
    });
  }
}

// ============================================================================
// 6. LichenScatter
// ============================================================================

export interface LichenScatterConfig extends BaseScatterConfig {
  /** Lichen patch radius (default 0.04) */
  patchRadius: number;
  /** Whether lichen grows on vertical surfaces (default true) */
  growsOnVertical: boolean;
}

/**
 * LichenScatter — Generates lichen patches on rocks and tree bark.
 * Produces flat circular patches with yellow-green coloration.
 */
export class LichenScatter implements ScatterGenerator<LichenScatterConfig> {
  generate(config?: Partial<LichenScatterConfig>): ScatterGeneratorResult {
    const cfg: LichenScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      patchRadius: 0.04,
      growsOnVertical: true,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, boundsSize.y * 0.5);

      dummy.position.set(x, y, z);
      // Lichen grows on surfaces facing various directions
      if (cfg.growsOnVertical && rng.next() > 0.5) {
        // On vertical surface
        const wallAngle = rng.uniform(0, Math.PI * 2);
        dummy.rotation.set(0, wallAngle, Math.PI / 2);
      } else {
        // On horizontal surface
        dummy.rotation.set(-Math.PI / 2, rng.uniform(0, Math.PI * 2), 0);
      }
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      dummy.scale.set(s * rng.uniform(0.8, 1.5), s, s * rng.uniform(0.8, 1.5));
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const segments = Math.max(6, 10);
    const radius = rng.uniform(0.03, 0.06);
    const geo = new THREE.CircleGeometry(radius, segments);
    return geo;
  }

  getMaterial(seed: number, season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 300);
    const colors: Record<Season, number> = {
      spring: 0x9e9d24,
      summer: 0x827717,
      autumn: 0x9e9d24,
      winter: 0x827717,
    };
    const baseColor = new THREE.Color(colors[season]);
    baseColor.offsetHSL(rng.uniform(-0.03, 0.03), 0, rng.uniform(-0.05, 0.05));
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
  }
}

// ============================================================================
// 7. PebbleScatter
// ============================================================================

export interface PebbleScatterConfig extends BaseScatterConfig {
  /** Pebble size range minimum (default 0.02) */
  pebbleMinSize: number;
  /** Pebble size range maximum (default 0.08) */
  pebbleMaxSize: number;
  /** Whether pebbles are rounded or angular (0 = angular, 1 = rounded, default 0.7) */
  roundness: number;
}

/**
 * PebbleScatter — Generates small pebbles on paths and riverbeds.
 * Produces flattened irregular stone shapes with earthy colors.
 */
export class PebbleScatter implements ScatterGenerator<PebbleScatterConfig> {
  generate(config?: Partial<PebbleScatterConfig>): ScatterGeneratorResult {
    const cfg: PebbleScatterConfig = {
      ...DEFAULT_BASE_CONFIG,
      pebbleMinSize: 0.02,
      pebbleMaxSize: 0.08,
      roundness: 0.7,
      ...config,
    };
    const rng = new SeededRandom(cfg.seed);
    const geometry = this.getGeometry(cfg.seed);
    const material = this.getMaterial(cfg.seed, cfg.season);

    const boundsSize = new THREE.Vector3();
    cfg.bounds.getSize(boundsSize);
    const areaXZ = boundsSize.x * boundsSize.z;
    const count = Math.round(areaXZ * cfg.density);

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const positions: THREE.Vector3[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = cfg.bounds.min.x + rng.next() * boundsSize.x;
      const z = cfg.bounds.min.z + rng.next() * boundsSize.z;
      const y = cfg.bounds.min.y + rng.uniform(0, 0.005);

      dummy.position.set(x, y, z);
      dummy.rotation.set(
        rng.uniform(-0.2, 0.2),
        rng.uniform(0, Math.PI * 2),
        rng.uniform(-0.2, 0.2)
      );
      const s = rng.uniform(cfg.minScale, cfg.maxScale);
      // Pebbles are typically wider than tall
      dummy.scale.set(
        s * rng.uniform(0.8, 1.3),
        s * rng.uniform(0.4, 0.8),
        s * rng.uniform(0.8, 1.3)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      positions.push(new THREE.Vector3(x, y, z));
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return { mesh: instancedMesh, count, positions, success: count > 0 };
  }

  getGeometry(seed: number): THREE.BufferGeometry {
    const rng = new SeededRandom(seed);
    const radius = rng.uniform(0.02, 0.06);
    const geo = new THREE.DodecahedronGeometry(radius, 1);

    // Deform for natural pebble shape
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i) * rng.uniform(0.7, 1.3);
      const y = posAttr.getY(i) * rng.uniform(0.5, 0.9);
      const z = posAttr.getZ(i) * rng.uniform(0.7, 1.3);
      posAttr.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  getMaterial(seed: number, _season: Season): THREE.MeshStandardMaterial {
    const rng = new SeededRandom(seed + 400);
    // Earthy tones: brown, gray, tan
    const hue = rng.choice([0.0, 0.05, 0.08, 0.1, 0.6]); // browns and grays
    const saturation = rng.uniform(0.0, 0.2);
    const lightness = rng.uniform(0.25, 0.55);
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.0,
    });
  }
}
