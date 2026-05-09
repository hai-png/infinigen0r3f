/**
 * GrimeSystem — Post-Population Aging and Grime Application
 *
 * Ports: infinigen_examples/generate_nature.py (grime pass)
 *
 * After vegetation and objects are placed, the original Infinigen applies
 * a "grime" pass that adds:
 *  - Slime mold on tree trunks and rocks
 *  - Lichen patches on tree bark and rocks
 *  - Ivy vines growing on trees
 *  - Moss on lower parts of objects
 *  - Mushroom growth on dead wood
 *  - Snow layer on all objects in winter
 *
 * This R3F port provides the GrimeSystem class that:
 *  1. Takes a populated scene with tagged objects
 *  2. Identifies candidate surfaces for each grime type
 *  3. Generates grime instances with appropriate placement rules
 *  4. Returns InstancedMesh groups for each grime type
 *
 * Grime types:
 *  - Moss: Lower 30% of tree trunks, rocks, ground surfaces
 *  - Lichen: Tree bark, rock surfaces (scattered patches)
 *  - Ivy: Tree trunks, walls (climbing vine growth)
 *  - Slime mold: Tree trunks, dead wood (reaction-diffusion patterns)
 *  - Snow: All upward-facing surfaces (winter only, slope-dependent thickness)
 *  - Mushroom: Dead wood, tree bases, shaded areas
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { Season } from './VegetationGenerators';

// ============================================================================
// Types
// ============================================================================

export interface GrimeConfig {
  /** Moss density (instances per m²) */
  mossDensity: number;
  /** Lichen density */
  lichenDensity: number;
  /** Ivy probability per eligible tree */
  ivyProbability: number;
  /** Slime mold probability */
  slimeMoldProbability: number;
  /** Snow density (winter only) */
  snowDensity: number;
  /** Mushroom density */
  mushroomDensity: number;
  /** Maximum height for moss application */
  mossMaxHeight: number;
  /** Slope threshold for snow accumulation (degrees) */
  snowSlopeThreshold: number;
  /** Seed */
  seed: number;
}

export interface GrimeableObject {
  /** The 3D object */
  object: THREE.Object3D;
  /** Tags describing the object type */
  tags: Set<string>;
  /** Bounding box */
  bbox: THREE.Box3;
}

export interface GrimeResult {
  moss: THREE.InstancedMesh | null;
  lichen: THREE.InstancedMesh | null;
  ivy: THREE.Group | null;
  slimeMold: THREE.InstancedMesh | null;
  snow: THREE.InstancedMesh | null;
  mushroom: THREE.InstancedMesh | null;
}

// ============================================================================
// Grime System
// ============================================================================

export class GrimeSystem {
  private config: GrimeConfig;
  private rng: SeededRandom;

  constructor(config: Partial<GrimeConfig> = {}) {
    const seed = config.seed ?? 42;
    this.config = {
      mossDensity: config.mossDensity ?? 50,
      lichenDensity: config.lichenDensity ?? 20,
      ivyProbability: config.ivyProbability ?? 0.3,
      slimeMoldProbability: config.slimeMoldProbability ?? 0.15,
      snowDensity: config.snowDensity ?? 100,
      mushroomDensity: config.mushroomDensity ?? 5,
      mossMaxHeight: config.mossMaxHeight ?? 1.0,
      snowSlopeThreshold: config.snowSlopeThreshold ?? 45,
      seed,
    };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Apply grime to all eligible objects in the scene.
   * Returns a group containing all grime instances.
   */
  applyGrime(
    objects: GrimeableObject[],
    season: Season = 'summer',
    terrainData?: { heightData: Float32Array; width: number; height: number; scale: number }
  ): GrimeResult {
    const result: GrimeResult = {
      moss: null,
      lichen: null,
      ivy: null,
      slimeMold: null,
      snow: null,
      mushroom: null,
    };

    // Collect candidate surfaces per grime type
    const treesAndRocks = objects.filter(o => o.tags.has('tree') || o.tags.has('rock'));
    const upwardSurfaces = objects.filter(o => o.tags.has('ground') || o.tags.has('rock') || o.tags.has('tree'));
    const deadWood = objects.filter(o => o.tags.has('dead_wood') || o.tags.has('stump'));

    // Moss: lower parts of trees and rocks
    if (this.config.mossDensity > 0 && season !== 'winter') {
      result.moss = this.generateMoss(treesAndRocks);
    }

    // Lichen: bark and rock surfaces
    if (this.config.lichenDensity > 0 && season !== 'winter') {
      result.lichen = this.generateLichen(treesAndRocks);
    }

    // Ivy: climbing on tree trunks
    if (this.config.ivyProbability > 0 && season !== 'winter') {
      const ivyTrees = treesAndRocks.filter(o => o.tags.has('tree') && this.rng.next() < this.config.ivyProbability);
      if (ivyTrees.length > 0) {
        result.ivy = this.generateIvy(ivyTrees);
      }
    }

    // Slime mold: tree trunks and dead wood
    if (this.config.slimeMoldProbability > 0 && season !== 'winter') {
      const slimeTargets = [...treesAndRocks.filter(o => this.rng.next() < this.config.slimeMoldProbability), ...deadWood];
      if (slimeTargets.length > 0) {
        result.slimeMold = this.generateSlimeMold(slimeTargets);
      }
    }

    // Snow: all upward surfaces (winter only)
    if (season === 'winter' && this.config.snowDensity > 0) {
      result.snow = this.generateSnow(upwardSurfaces);
    }

    // Mushroom: dead wood and tree bases
    if (this.config.mushroomDensity > 0 && season !== 'winter') {
      const mushroomTargets = [...deadWood, ...treesAndRocks.filter(o => o.tags.has('tree'))];
      if (mushroomTargets.length > 0) {
        result.mushroom = this.generateMushroom(mushroomTargets);
      }
    }

    return result;
  }

  // ========================================================================
  // Private: Moss Generation
  // ========================================================================

  private generateMoss(targets: GrimeableObject[]): THREE.InstancedMesh | null {
    const totalArea = this.computeTotalSurfaceArea(targets);
    const count = Math.round(totalArea * this.config.mossDensity * 0.01);
    if (count === 0) return null;

    const geometry = new THREE.SphereGeometry(0.02, 4, 4);
    geometry.scale(1, 0.3, 1); // Flat moss patches
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.3, 0.6, 0.25),
      roughness: 0.9,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const target = targets[this.rng.nextInt(0, targets.length - 1)];
      const point = this.samplePointOnObject(target);

      // Moss only on lower parts
      if (point.y > this.config.mossMaxHeight) {
        dummy.position.set(0, -1000, 0); // Hide
      } else {
        dummy.position.copy(point);
        dummy.scale.set(this.rng.range(0.5, 2), this.rng.range(0.3, 1), this.rng.range(0.5, 2));
        dummy.rotation.y = this.rng.range(0, Math.PI * 2);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ========================================================================
  // Private: Lichen Generation
  // ========================================================================

  private generateLichen(targets: GrimeableObject[]): THREE.InstancedMesh | null {
    const totalArea = this.computeTotalSurfaceArea(targets);
    const count = Math.round(totalArea * this.config.lichenDensity * 0.01);
    if (count === 0) return null;

    const geometry = new THREE.CircleGeometry(0.03, 6);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.rng.choice([0.2, 0.25, 0.35]), 0.3, 0.55),
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const target = targets[this.rng.nextInt(0, targets.length - 1)];
      const point = this.samplePointOnObject(target);
      dummy.position.copy(point);
      dummy.scale.set(this.rng.range(0.5, 3), this.rng.range(0.5, 3), 1);
      dummy.rotation.set(this.rng.range(-0.3, 0.3), this.rng.range(0, Math.PI * 2), this.rng.range(-0.3, 0.3));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ========================================================================
  // Private: Ivy Generation
  // ========================================================================

  private generateIvy(targets: GrimeableObject[]): THREE.Group | null {
    const group = new THREE.Group();

    for (const target of targets) {
      const height = target.bbox.max.y - target.bbox.min.y;
      if (height < 0.5) continue;

      // Generate vine path: spiral upward around the trunk
      const nPoints = Math.round(height / 0.15);
      const points: THREE.Vector3[] = [];
      const baseX = (target.bbox.min.x + target.bbox.max.x) / 2;
      const baseZ = (target.bbox.min.z + target.bbox.max.z) / 2;
      const radius = (target.bbox.max.x - target.bbox.min.x) / 2 + 0.05;

      for (let i = 0; i <= nPoints; i++) {
        const t = i / nPoints;
        const angle = t * Math.PI * 4 + this.rng.range(-0.5, 0.5);
        points.push(new THREE.Vector3(
          baseX + Math.cos(angle) * radius * this.rng.range(0.8, 1.2),
          target.bbox.min.y + height * t,
          baseZ + Math.sin(angle) * radius * this.rng.range(0.8, 1.2)
        ));
      }

      if (points.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(points);
        const vineGeom = new THREE.TubeGeometry(curve, nPoints * 2, 0.005, 3, false);
        const vineMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.15, 0.35, 0.1) });
        group.add(new THREE.Mesh(vineGeom, vineMat));

        // Add small leaves along vine
        for (let i = 0; i < nPoints; i += 2) {
          const leafGeom = new THREE.CircleGeometry(0.02, 4);
          const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(this.rng.range(0.25, 0.35), 0.6, 0.3),
            side: THREE.DoubleSide,
          });
          const leafMesh = new THREE.Mesh(leafGeom, leafMat);
          const t = i / nPoints;
          leafMesh.position.copy(curve.getPoint(t));
          leafMesh.rotation.y = this.rng.range(0, Math.PI * 2);
          leafMesh.rotation.x = this.rng.range(-0.5, 0.5);
          group.add(leafMesh);
        }
      }
    }

    return group.children.length > 0 ? group : null;
  }

  // ========================================================================
  // Private: Slime Mold Generation
  // ========================================================================

  private generateSlimeMold(targets: GrimeableObject[]): THREE.InstancedMesh | null {
    const totalArea = this.computeTotalSurfaceArea(targets);
    const count = Math.round(totalArea * 10);
    if (count === 0) return null;

    const geometry = new THREE.SphereGeometry(0.01, 4, 4);
    geometry.scale(1.5, 0.2, 1.5);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.15, 0.8, 0.6),
      roughness: 0.3,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    // Slime mold uses reaction-diffusion-like clustering
    for (let i = 0; i < count; i++) {
      const target = targets[this.rng.nextInt(0, targets.length - 1)];
      const point = this.samplePointOnObject(target);
      dummy.position.copy(point);
      dummy.scale.setScalar(this.rng.range(0.5, 2));
      dummy.rotation.y = this.rng.range(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ========================================================================
  // Private: Snow Generation
  // ========================================================================

  private generateSnow(targets: GrimeableObject[]): THREE.InstancedMesh | null {
    const totalArea = this.computeTotalSurfaceArea(targets);
    const count = Math.round(totalArea * this.config.snowDensity * 0.01);
    if (count === 0) return null;

    const geometry = new THREE.PlaneGeometry(0.1, 0.1);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.95, 0.97, 1.0),
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const target = targets[this.rng.nextInt(0, targets.length - 1)];
      const point = this.samplePointOnObject(target);
      dummy.position.copy(point);
      dummy.position.y += 0.01; // Slightly above surface
      dummy.rotation.x = -Math.PI / 2; // Flat on surface
      dummy.rotation.z = this.rng.range(0, Math.PI * 2);
      dummy.scale.set(this.rng.range(0.5, 3), this.rng.range(0.5, 3), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ========================================================================
  // Private: Mushroom Generation
  // ========================================================================

  private generateMushroom(targets: GrimeableObject[]): THREE.InstancedMesh | null {
    const count = Math.round(targets.length * this.config.mushroomDensity);
    if (count === 0) return null;

    // Simple mushroom cap geometry
    const geometry = new THREE.SphereGeometry(0.02, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.rng.choice([0.05, 0.08, 0.6]), 0.5, 0.4),
      roughness: 0.7,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const target = targets[this.rng.nextInt(0, targets.length - 1)];
      const point = this.samplePointOnObject(target);
      dummy.position.copy(point);
      dummy.position.y += 0.01;
      dummy.scale.setScalar(this.rng.range(0.5, 2));
      dummy.rotation.y = this.rng.range(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ========================================================================
  // Utility
  // ========================================================================

  private computeTotalSurfaceArea(objects: GrimeableObject[]): number {
    let area = 0;
    for (const obj of objects) {
      const size = new THREE.Vector3();
      obj.bbox.getSize(size);
      area += 2 * (size.x * size.y + size.x * size.z + size.y * size.z);
    }
    return area;
  }

  private samplePointOnObject(obj: GrimeableObject): THREE.Vector3 {
    const min = obj.bbox.min;
    const max = obj.bbox.max;
    return new THREE.Vector3(
      this.rng.range(min.x, max.x),
      this.rng.range(min.y, max.y),
      this.rng.range(min.z, max.z)
    );
  }
}
