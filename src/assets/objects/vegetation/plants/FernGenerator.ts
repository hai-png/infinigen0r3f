/**
 * FernGenerator - Enhanced procedural fern with fractal frond generation
 *
 * Features:
 * - Fractal frond generation with recursive branching
 * - Multiple frond shapes: strap, lance, triangular
 * - Fiddlehead (curled new growth) support
 * - Spore clusters on underside
 * - Species-specific frond configurations
 *
 * All geometries use Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '../../../../core/util/math/index';

// ============================================================================
// Types
// ============================================================================

export type FernFrondShape = 'strap' | 'lance' | 'triangular';
export type FernSpecies = 'boston' | 'maidenhair' | 'bird_nest' | 'staghorn' | 'tree_fern' | 'sword' | 'ostrich';

export interface FernFrondConfig {
  /** Frond length (world units) */
  length: number;
  /** Maximum frond width */
  width: number;
  /** Frond shape type */
  shape: FernFrondShape;
  /** Number of pinnae per side */
  pinnaeCount: number;
  /** Curvature along the rachis (0 = straight, 1 = strongly curved) */
  curvature: number;
  /** Pinnae angle relative to rachis (radians) */
  pinnaeAngle: number;
  /** Recursive depth for sub-pinnae (0 = no sub-divisions) */
  recursionDepth: number;
  /** Length reduction per recursion level */
  lengthDecay: number;
}

export interface FernConfig extends BaseGeneratorConfig {
  /** Number of fronds from the base */
  frondCount: number;
  /** Frond configuration */
  frond: FernFrondConfig;
  /** Fern species */
  species: FernSpecies;
  /** Overall size multiplier */
  size: number;
  /** Whether to include fiddleheads */
  includeFiddleheads: boolean;
  /** Whether to include spore clusters */
  includeSpores: boolean;
}

// ============================================================================
// Species Presets
// ============================================================================

export const FernSpeciesPresets: Record<FernSpecies, Partial<FernConfig>> = {
  boston: {
    frondCount: 12,
    frond: {
      length: 0.5,
      width: 0.12,
      shape: 'lance',
      pinnaeCount: 18,
      curvature: 0.4,
      pinnaeAngle: Math.PI / 3,
      recursionDepth: 1,
      lengthDecay: 0.3,
    },
    size: 1.0,
    includeFiddleheads: true,
    includeSpores: false,
  },
  maidenhair: {
    frondCount: 16,
    frond: {
      length: 0.35,
      width: 0.08,
      shape: 'triangular',
      pinnaeCount: 12,
      curvature: 0.3,
      pinnaeAngle: Math.PI / 2.5,
      recursionDepth: 2,
      lengthDecay: 0.35,
    },
    size: 0.8,
    includeFiddleheads: true,
    includeSpores: false,
  },
  bird_nest: {
    frondCount: 8,
    frond: {
      length: 0.6,
      width: 0.15,
      shape: 'strap',
      pinnaeCount: 24,
      curvature: 0.15,
      pinnaeAngle: Math.PI / 4,
      recursionDepth: 0,
      lengthDecay: 0.2,
    },
    size: 1.2,
    includeFiddleheads: false,
    includeSpores: true,
  },
  staghorn: {
    frondCount: 6,
    frond: {
      length: 0.7,
      width: 0.2,
      shape: 'triangular',
      pinnaeCount: 10,
      curvature: 0.5,
      pinnaeAngle: Math.PI / 2,
      recursionDepth: 1,
      lengthDecay: 0.4,
    },
    size: 1.5,
    includeFiddleheads: true,
    includeSpores: false,
  },
  tree_fern: {
    frondCount: 14,
    frond: {
      length: 1.2,
      width: 0.25,
      shape: 'lance',
      pinnaeCount: 28,
      curvature: 0.35,
      pinnaeAngle: Math.PI / 2.8,
      recursionDepth: 1,
      lengthDecay: 0.25,
    },
    size: 2.0,
    includeFiddleheads: true,
    includeSpores: true,
  },
  sword: {
    frondCount: 10,
    frond: {
      length: 0.55,
      width: 0.06,
      shape: 'strap',
      pinnaeCount: 0,
      curvature: 0.2,
      pinnaeAngle: 0,
      recursionDepth: 0,
      lengthDecay: 0.3,
    },
    size: 0.9,
    includeFiddleheads: true,
    includeSpores: true,
  },
  ostrich: {
    frondCount: 8,
    frond: {
      length: 0.9,
      width: 0.18,
      shape: 'lance',
      pinnaeCount: 22,
      curvature: 0.3,
      pinnaeAngle: Math.PI / 3,
      recursionDepth: 1,
      lengthDecay: 0.3,
    },
    size: 1.6,
    includeFiddleheads: true,
    includeSpores: true,
  },
};

// ============================================================================
// FernGenerator
// ============================================================================

export class FernGenerator extends BaseObjectGenerator<FernConfig> {
  getDefaultConfig(): FernConfig {
    return {
      frondCount: 12,
      frond: {
        length: 0.4,
        width: 0.12,
        shape: 'lance',
        pinnaeCount: 16,
        curvature: 0.5,
        pinnaeAngle: Math.PI / 3,
        recursionDepth: 1,
        lengthDecay: 0.3,
      },
      species: 'boston',
      size: 1.0,
      includeFiddleheads: true,
      includeSpores: false,
    };
  }

  generate(config: Partial<FernConfig> = {}): THREE.Group {
    // Merge with species preset
    const speciesDefaults = FernSpeciesPresets[config.species ?? this.getDefaultConfig().species] ?? {};
    const fullConfig = { ...this.getDefaultConfig(), ...speciesDefaults, ...config };
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();

    // Central stem base (crown)
    const baseGeom = new THREE.CylinderGeometry(0.015, 0.02, 0.06, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.7, metalness: 0.0 });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.03;
    base.castShadow = true;
    group.add(base);

    // Generate fronds radiating outward and upward
    for (let i = 0; i < fullConfig.frondCount; i++) {
      const frond = this.createFrond(fullConfig, rng, i);
      group.add(frond);
    }

    // Fiddleheads (curled new growth)
    if (fullConfig.includeFiddleheads) {
      const fiddleheadCount = rng.nextInt(1, 3);
      for (let i = 0; i < fiddleheadCount; i++) {
        const fiddlehead = this.createFiddlehead(rng, fullConfig.size);
        const angle = rng.uniform(0, Math.PI * 2);
        fiddlehead.position.set(
          Math.cos(angle) * 0.02,
          0.04,
          Math.sin(angle) * 0.02
        );
        fiddlehead.rotation.set(rng.uniform(-0.3, 0.3), angle, rng.uniform(-0.2, 0.2));
        group.add(fiddlehead);
      }
    }

    group.userData.tags = ['vegetation', 'fern', fullConfig.species];
    return group;
  }

  // ------------------------------------------------------------------
  // Frond Generation
  // ------------------------------------------------------------------

  private createFrond(config: FernConfig, rng: SeededRandom, index: number): THREE.Group {
    const frondGroup = new THREE.Group();
    const frondConfig = config.frond;

    // Spread fronds in a fan around the base
    const baseAngle = (index / config.frondCount) * Math.PI * 2;
    const tiltAngle = rng.uniform(0.2, 0.7);

    frondGroup.rotation.y = baseAngle;
    frondGroup.rotation.x = -tiltAngle;

    // Create rachis (central stem of frond) as a curved tube
    const rachisCurve = this.createRachisCurve(frondConfig, rng);
    const rachisGeo = new THREE.TubeGeometry(rachisCurve, 16, 0.005, 5, false);
    const rachisMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1f, roughness: 0.7, metalness: 0.0 });
    const rachis = new THREE.Mesh(rachisGeo, rachisMat);
    rachis.castShadow = true;
    frondGroup.add(rachis);

    // Create pinnae along the rachis
    if (frondConfig.pinnaeCount > 0) {
      this.createPinnae(frondGroup, frondConfig, rachisCurve, rng);
    }

    // Spore clusters on the underside of pinnae
    if (config.includeSpores) {
      this.createSporeClusters(frondGroup, frondConfig, rachisCurve, rng);
    }

    const scale = config.size * rng.uniform(0.85, 1.15);
    frondGroup.scale.setScalar(scale);

    return frondGroup;
  }

  private createRachisCurve(config: FernFrondConfig, rng: SeededRandom): THREE.CatmullRomCurve3 {
    const points: THREE.Vector3[] = [];
    const segments = 8;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = Math.sin(t * Math.PI * 0.3) * config.curvature * 0.05 * rng.uniform(0.8, 1.2);
      const y = t * config.length;
      const z = config.curvature * t * t * config.length * 0.3;
      points.push(new THREE.Vector3(x, y, z));
    }

    return new THREE.CatmullRomCurve3(points);
  }

  private createPinnae(
    frondGroup: THREE.Group,
    config: FernFrondConfig,
    rachisCurve: THREE.CatmullRomCurve3,
    rng: SeededRandom
  ): void {
    const pinnaeMat = new THREE.MeshStandardMaterial({
      color: 0x3d7a2f,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < config.pinnaeCount; i++) {
      const t = (i + 1) / (config.pinnaeCount + 1);
      const point = rachisCurve.getPoint(t);
      const tangent = rachisCurve.getTangent(t);

      // Pinnae get shorter toward the tip
      const pinnaLength = config.width * (1 - t * 0.6) * rng.uniform(0.8, 1.2);

      // Alternate sides
      for (const side of [-1, 1]) {
        const pinnaGeo = this.createPinnaGeometry(config.shape, pinnaLength, t);
        const pinna = new THREE.Mesh(pinnaGeo, pinnaeMat);

        // Position at the rachis point
        pinna.position.copy(point);

        // Orient: angle out from the rachis
        pinna.rotation.z = side * config.pinnaeAngle;
        pinna.rotation.y = side * 0.15;
        pinna.rotation.x = (rng.next() - 0.5) * 0.2;

        frondGroup.add(pinna);

        // Recursive sub-pinnae for maidenhair and similar
        if (config.recursionDepth > 0 && pinnaLength > 0.02) {
          this.createSubPinnae(frondGroup, pinna, config, pinnaLength, side, rng, config.recursionDepth - 1);
        }
      }
    }
  }

  private createPinnaGeometry(shape: FernFrondShape, length: number, t: number): THREE.BufferGeometry {
    const shapeGeom = new THREE.Shape();
    const w = length * 0.35;

    switch (shape) {
      case 'strap':
        // Long, narrow pinna
        shapeGeom.moveTo(0, 0);
        shapeGeom.lineTo(w * 0.8, length * 0.3);
        shapeGeom.lineTo(w * 0.6, length * 0.7);
        shapeGeom.lineTo(0, length);
        shapeGeom.lineTo(-w * 0.6, length * 0.7);
        shapeGeom.lineTo(-w * 0.8, length * 0.3);
        shapeGeom.closePath();
        break;

      case 'lance':
        // Pointed oval
        shapeGeom.moveTo(0, 0);
        shapeGeom.quadraticCurveTo(w * 1.2, length * 0.35, w * 0.4, length * 0.7);
        shapeGeom.lineTo(0, length);
        shapeGeom.lineTo(-w * 0.4, length * 0.7);
        shapeGeom.quadraticCurveTo(-w * 1.2, length * 0.35, 0, 0);
        break;

      case 'triangular':
        // Broad at base, pointed at tip
        shapeGeom.moveTo(0, 0);
        shapeGeom.lineTo(w * 1.5, length * 0.2);
        shapeGeom.quadraticCurveTo(w * 0.8, length * 0.5, 0, length);
        shapeGeom.quadraticCurveTo(-w * 0.8, length * 0.5, -w * 1.5, length * 0.2);
        shapeGeom.closePath();
        break;
    }

    return new THREE.ShapeGeometry(shapeGeom, 3);
  }

  private createSubPinnae(
    frondGroup: THREE.Group,
    parentPinna: THREE.Mesh,
    config: FernFrondConfig,
    parentLength: number,
    side: number,
    rng: SeededRandom,
    depth: number
  ): void {
    const subCount = Math.max(2, Math.floor(parentLength / 0.03));
    const subMat = new THREE.MeshStandardMaterial({
      color: 0x4a8a3f,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < subCount; i++) {
      const t = (i + 1) / (subCount + 1);
      const subLength = parentLength * config.lengthDecay * (1 - t * 0.5);

      const subGeo = this.createPinnaGeometry('lance', subLength * 0.5, t);
      const sub = new THREE.Mesh(subGeo, subMat);

      // Position along the parent pinna
      const yPos = t * parentLength;
      sub.position.copy(parentPinna.position);
      sub.position.y += yPos * 0.3;
      sub.position.x += side * 0.01 * (i % 2 === 0 ? 1 : -1);

      sub.rotation.z = side * config.pinnaeAngle * 0.6;
      sub.scale.setScalar(0.5);

      frondGroup.add(sub);
    }
  }

  // ------------------------------------------------------------------
  // Fiddlehead Generation
  // ------------------------------------------------------------------

  private createFiddlehead(rng: SeededRandom, size: number): THREE.Group {
    const group = new THREE.Group();
    const turns = rng.uniform(1.5, 2.5);
    const radius = 0.01 * size;
    const height = 0.04 * size;
    const segments = 30;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * turns * Math.PI * 2;
      const r = radius * (1 - t * 0.8);
      const y = t * height;
      points.push(new THREE.Vector3(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r
      ));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.003 * size, 4, false);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a8a2f,
      roughness: 0.6,
      metalness: 0.0,
    });

    const mesh = new THREE.Mesh(tubeGeo, mat);
    mesh.castShadow = true;
    group.add(mesh);

    return group;
  }

  // ------------------------------------------------------------------
  // Spore Clusters
  // ------------------------------------------------------------------

  private createSporeClusters(
    frondGroup: THREE.Group,
    config: FernFrondConfig,
    rachisCurve: THREE.CatmullRomCurve3,
    rng: SeededRandom
  ): void {
    const sporeMat = new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      roughness: 0.8,
      metalness: 0.0,
    });

    const sporeCount = Math.floor(config.pinnaeCount * 0.4);
    for (let i = 0; i < sporeCount; i++) {
      const t = rng.uniform(0.4, 0.9);
      const point = rachisCurve.getPoint(t);
      const side = rng.boolean() ? 1 : -1;

      const sporeGeo = new THREE.SphereGeometry(0.004, 4, 3);
      const spore = new THREE.Mesh(sporeGeo, sporeMat);
      spore.position.set(
        point.x + side * config.width * 0.3 * (1 - t),
        point.y,
        point.z - 0.01
      );
      frondGroup.add(spore);
    }
  }
}
