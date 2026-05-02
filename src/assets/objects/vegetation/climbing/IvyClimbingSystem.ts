/**
 * IvyClimbingSystem - Surface-conforming climbing plant system
 *
 * Features:
 * - Surface-conforming ivy growth with gravity influence
 * - Branch at intervals with random direction
 * - Root attachment points and tip climbing points
 * - Leaf placement along vine paths
 * - Different leaf shapes for ivy vs vine vs climbing rose
 * - Performance: InstancedMesh for leaves, single geometry for stems
 *
 * All geometries use Mesh(geometry, MeshStandardMaterial). Uses SeededRandom.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Types
// ============================================================================

export type ClimbingPlantType = 'ivy' | 'vine' | 'climbing_rose' | 'wisteria' | 'creeper';

export interface IvyGrowthConfig {
  /** Plant type */
  plantType: ClimbingPlantType;
  /** Maximum vine length */
  maxLength: number;
  /** Number of growth iterations */
  iterations: number;
  /** Step size per iteration */
  stepSize: number;
  /** Gravity influence (0 = none, 1 = full) */
  gravity: number;
  /** Branch probability per step */
  branchProbability: number;
  /** Maximum branch depth */
  maxBranchDepth: number;
  /** Branch length multiplier per depth */
  branchLengthDecay: number;
  /** Surface adherence strength */
  surfaceAdherence: number;
  /** Random wander strength */
  wanderStrength: number;
  /** Leaf density (0-1) */
  leafDensity: number;
  /** Leaf size */
  leafSize: number;
}

export interface IvyPathPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  direction: THREE.Vector3;
  depth: number;
  hasLeaf: boolean;
}

// ============================================================================
// Plant Presets
// ============================================================================

export const ClimbingPlantPresets: Record<ClimbingPlantType, Partial<IvyGrowthConfig>> = {
  ivy: {
    plantType: 'ivy',
    maxLength: 3.0,
    iterations: 60,
    stepSize: 0.05,
    gravity: 0.02,
    branchProbability: 0.08,
    maxBranchDepth: 3,
    branchLengthDecay: 0.6,
    surfaceAdherence: 0.9,
    wanderStrength: 0.15,
    leafDensity: 0.8,
    leafSize: 0.04,
  },
  vine: {
    plantType: 'vine',
    maxLength: 4.0,
    iterations: 80,
    stepSize: 0.05,
    gravity: 0.01,
    branchProbability: 0.05,
    maxBranchDepth: 2,
    branchLengthDecay: 0.5,
    surfaceAdherence: 0.7,
    wanderStrength: 0.2,
    leafDensity: 0.5,
    leafSize: 0.05,
  },
  climbing_rose: {
    plantType: 'climbing_rose',
    maxLength: 2.5,
    iterations: 50,
    stepSize: 0.05,
    gravity: 0.03,
    branchProbability: 0.12,
    maxBranchDepth: 2,
    branchLengthDecay: 0.55,
    surfaceAdherence: 0.8,
    wanderStrength: 0.18,
    leafDensity: 0.6,
    leafSize: 0.035,
  },
  wisteria: {
    plantType: 'wisteria',
    maxLength: 3.5,
    iterations: 70,
    stepSize: 0.05,
    gravity: 0.04,
    branchProbability: 0.06,
    maxBranchDepth: 2,
    branchLengthDecay: 0.5,
    surfaceAdherence: 0.6,
    wanderStrength: 0.25,
    leafDensity: 0.4,
    leafSize: 0.03,
  },
  creeper: {
    plantType: 'creeper',
    maxLength: 5.0,
    iterations: 100,
    stepSize: 0.05,
    gravity: 0.01,
    branchProbability: 0.1,
    maxBranchDepth: 4,
    branchLengthDecay: 0.65,
    surfaceAdherence: 0.85,
    wanderStrength: 0.12,
    leafDensity: 0.9,
    leafSize: 0.025,
  },
};

// ============================================================================
// IvyClimbingSystem
// ============================================================================

export class IvyClimbingSystem {
  private rng: SeededRandom;
  private noise: NoiseUtils;
  private config: IvyGrowthConfig;
  private paths: IvyPathPoint[][] = [];

  constructor(seed: number = 42, config: Partial<IvyGrowthConfig> = {}) {
    this.rng = new SeededRandom(seed);
    this.noise = new NoiseUtils(seed);

    const plantType = config.plantType ?? 'ivy';
    const preset = ClimbingPlantPresets[plantType] ?? {};
    this.config = {
      plantType: 'ivy',
      maxLength: 3.0,
      iterations: 60,
      stepSize: 0.05,
      gravity: 0.02,
      branchProbability: 0.08,
      maxBranchDepth: 3,
      branchLengthDecay: 0.6,
      surfaceAdherence: 0.9,
      wanderStrength: 0.15,
      leafDensity: 0.8,
      leafSize: 0.04,
      ...preset,
      ...config,
    };
  }

  /**
   * Generate climbing plant geometry
   * @param startPosition Root position on the surface
   * @param surfaceNormal Surface normal at the root
   * @param initialDirection Initial growth direction (up)
   */
  generate(
    startPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    surfaceNormal: THREE.Vector3 = new THREE.Vector3(0, 0, -1),
    initialDirection: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
  ): THREE.Group {
    this.paths = [];
    const group = new THREE.Group();

    // Grow main vine
    const mainPath = this.growVine(startPosition, surfaceNormal, initialDirection, 0);
    this.paths.push(mainPath);

    // Grow branches from the main vine
    this.growBranches(mainPath);

    // Build stem geometry from all paths
    const stemGroup = this.buildStemGeometry();
    group.add(stemGroup);

    // Build leaf instanced mesh
    const leavesMesh = this.buildLeafGeometry();
    if (leavesMesh) group.add(leavesMesh);

    // Add flowers for climbing rose and wisteria
    if (this.config.plantType === 'climbing_rose' || this.config.plantType === 'wisteria') {
      const flowers = this.buildFlowerGeometry();
      if (flowers) group.add(flowers);
    }

    group.userData.tags = ['vegetation', 'climbing', this.config.plantType];
    return group;
  }

  /**
   * Convenience: generate ivy on a wall/rock face
   */
  generateOnWall(
    wallCenter: THREE.Vector3 = new THREE.Vector3(0, 1.5, -0.5),
    wallNormal: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
    rootCount: number = 3
  ): THREE.Group {
    const group = new THREE.Group();

    for (let i = 0; i < rootCount; i++) {
      const offset = new THREE.Vector3(
        this.rng.uniform(-0.5, 0.5),
        this.rng.uniform(-0.5, 0.5),
        0
      );

      const rootPos = wallCenter.clone().add(offset);
      const direction = new THREE.Vector3(0, 1, 0); // Always grow upward

      const ivy = this.generate(rootPos, wallNormal, direction);
      group.add(ivy);
    }

    return group;
  }

  // ------------------------------------------------------------------
  // Vine Growth Algorithm
  // ------------------------------------------------------------------

  private growVine(
    startPos: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
    initialDir: THREE.Vector3,
    depth: number
  ): IvyPathPoint[] {
    const path: IvyPathPoint[] = [];
    let position = startPos.clone();
    let direction = initialDir.clone().normalize();
    let normal = surfaceNormal.clone().normalize();

    const maxSteps = depth === 0
      ? this.config.iterations
      : Math.floor(this.config.iterations * Math.pow(this.config.branchLengthDecay, depth));

    for (let step = 0; step < maxSteps; step++) {
      // Apply gravity (tends to pull downward for overhangs)
      const gravityForce = new THREE.Vector3(0, -this.config.gravity, 0);
      direction.add(gravityForce);

      // Surface adherence: pull toward the surface
      const surfacePull = normal.clone().multiplyScalar(this.config.surfaceAdherence * 0.05);
      direction.add(surfacePull);

      // Random wander
      const wanderX = this.noise.perlin(position.x * 3, position.y * 3, position.z * 3 + this.rng.next() * 0.1);
      const wanderZ = this.noise.perlin(position.x * 3 + 100, position.y * 3, position.z * 3);
      const wander = new THREE.Vector3(
        wanderX * this.config.wanderStrength,
        0,
        wanderZ * this.config.wanderStrength
      );
      direction.add(wander);

      // Keep direction roughly upward (plants grow up)
      direction.y = Math.max(direction.y, 0.3);
      direction.normalize();

      // Advance position
      position = position.clone().add(direction.clone().multiplyScalar(this.config.stepSize));

      // Determine if this point should have a leaf
      const hasLeaf = this.rng.next() < this.config.leafDensity;

      path.push({
        position: position.clone(),
        normal: normal.clone(),
        direction: direction.clone(),
        depth,
        hasLeaf,
      });

      // Update normal (simulate following surface curvature)
      normal.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.uniform(-0.05, 0.05));
      normal.normalize();
    }

    return path;
  }

  private growBranches(mainPath: IvyPathPoint[]): void {
    for (let i = 0; i < mainPath.length; i++) {
      const point = mainPath[i];

      if (this.rng.next() < this.config.branchProbability && point.depth < this.config.maxBranchDepth) {
        // Create a branch direction
        const branchAngle = this.rng.uniform(Math.PI / 6, Math.PI / 3);
        const branchRotation = this.rng.uniform(0, Math.PI * 2);

        const branchDir = point.direction.clone();
        const axis = new THREE.Vector3(Math.cos(branchRotation), 0, Math.sin(branchRotation));
        branchDir.applyAxisAngle(axis, branchAngle);
        branchDir.normalize();

        const branchPath = this.growVine(point.position, point.normal, branchDir, point.depth + 1);
        this.paths.push(branchPath);
      }
    }
  }

  // ------------------------------------------------------------------
  // Stem Geometry
  // ------------------------------------------------------------------

  private buildStemGeometry(): THREE.Group {
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({
      color: this.getStemColor(),
      roughness: 0.8,
      metalness: 0.0,
    });

    for (const path of this.paths) {
      if (path.length < 2) continue;

      const points = path.map(p => p.position);
      const curve = new THREE.CatmullRomCurve3(points);

      const thickness = 0.005 * (1 / (path[0]?.depth + 1));
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(4, path.length), thickness, 5, false);
      const tube = new THREE.Mesh(tubeGeo, stemMat);
      tube.castShadow = true;
      group.add(tube);
    }

    return group;
  }

  private getStemColor(): number {
    const colors: Record<ClimbingPlantType, number> = {
      ivy: 0x2d4a1f,
      vine: 0x4a3d23,
      climbing_rose: 0x3d5a2d,
      wisteria: 0x5c4a3d,
      creeper: 0x2d3a18,
    };
    return colors[this.config.plantType] ?? 0x3d5a23;
  }

  // ------------------------------------------------------------------
  // Leaf Geometry (InstancedMesh)
  // ------------------------------------------------------------------

  private buildLeafGeometry(): THREE.InstancedMesh | null {
    const leafPoints = this.paths.flat().filter(p => p.hasLeaf);
    if (leafPoints.length === 0) return null;

    const leafGeo = this.createLeafShape();
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.getLeafColor(),
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const instancedMesh = new THREE.InstancedMesh(leafGeo, leafMat, leafPoints.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < leafPoints.length; i++) {
      const point = leafPoints[i];

      dummy.position.copy(point.position);

      // Orient leaf to face outward from the surface
      const up = point.normal.clone();
      const forward = point.direction.clone();
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);

      // Random rotation around normal
      dummy.rotateZ(this.rng.uniform(0, Math.PI * 2));

      // Slight random tilt
      dummy.rotateX(this.rng.uniform(-0.3, 0.3));
      dummy.rotateY(this.rng.uniform(-0.3, 0.3));

      const scale = this.config.leafSize * this.rng.uniform(0.7, 1.3);
      dummy.scale.setScalar(scale / 0.05); // normalize to leaf geo size

      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    return instancedMesh;
  }

  private createLeafShape(): THREE.BufferGeometry {
    const s = 0.05; // base size
    const shape = new THREE.Shape();

    switch (this.config.plantType) {
      case 'ivy': {
        // Ivy: 3-5 pointed lobes
        const lobes = 5;
        shape.moveTo(0, 0);
        for (let i = 0; i < lobes; i++) {
          const angle = (i / lobes) * Math.PI;
          const nextAngle = ((i + 0.5) / lobes) * Math.PI;
          shape.lineTo(
            Math.sin(angle) * s * 0.4 + Math.sin(nextAngle) * s * 0.8,
            (i / lobes) * s * 2
          );
          shape.lineTo(
            Math.sin(angle) * s * 0.4 - Math.sin(nextAngle) * s * 0.3,
            ((i + 0.5) / lobes) * s * 2
          );
        }
        shape.lineTo(0, s * 2);
        // Mirror other side
        for (let i = lobes - 1; i >= 0; i--) {
          const angle = (i / lobes) * Math.PI;
          const nextAngle = ((i + 0.5) / lobes) * Math.PI;
          shape.lineTo(
            -Math.sin(angle) * s * 0.4 - Math.sin(nextAngle) * s * 0.8,
            (i / lobes) * s * 2
          );
          shape.lineTo(
            -Math.sin(angle) * s * 0.4 + Math.sin(nextAngle) * s * 0.3,
            ((i + 0.5) / lobes) * s * 2
          );
        }
        shape.closePath();
        break;
      }

      case 'climbing_rose': {
        // Compound leaf: oval with serrated edge
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(s * 1.2, s * 0.4, s * 0.8, s);
        shape.quadraticCurveTo(s * 0.4, s * 1.5, 0, s * 2);
        shape.quadraticCurveTo(-s * 0.4, s * 1.5, -s * 0.8, s);
        shape.quadraticCurveTo(-s * 1.2, s * 0.4, 0, 0);
        break;
      }

      case 'wisteria': {
        // Small, narrow compound leaf
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(s * 0.4, s * 0.5, s * 0.2, s * 1.2);
        shape.lineTo(0, s * 1.5);
        shape.lineTo(-s * 0.2, s * 1.2);
        shape.quadraticCurveTo(-s * 0.4, s * 0.5, 0, 0);
        break;
      }

      default: {
        // Default: simple pointed leaf
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(s * 0.6, s * 0.5, 0, s * 2);
        shape.quadraticCurveTo(-s * 0.6, s * 0.5, 0, 0);
        break;
      }
    }

    const geometry = new THREE.ShapeGeometry(shape, 3);

    // Add slight curvature
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const t = y / (s * 2);
      positions.setZ(i, Math.sin(t * Math.PI) * s * 0.15);
    }
    geometry.computeVertexNormals();

    return geometry;
  }

  private getLeafColor(): number {
    const colors: Record<ClimbingPlantType, number> = {
      ivy: 0x2d6a2d,
      vine: 0x3d7a2d,
      climbing_rose: 0x3d7a2d,
      wisteria: 0x4a8a3a,
      creeper: 0x2d5a1a,
    };
    return colors[this.config.plantType] ?? 0x3d7a2d;
  }

  // ------------------------------------------------------------------
  // Flower Geometry (for climbing rose & wisteria)
  // ------------------------------------------------------------------

  private buildFlowerGeometry(): THREE.InstancedMesh | null {
    if (this.config.plantType !== 'climbing_rose' && this.config.plantType !== 'wisteria') {
      return null;
    }

    // Place flowers at branch tips
    const flowerPoints: IvyPathPoint[] = [];
    for (const path of this.paths) {
      if (path.length > 0 && path[0].depth > 0) {
        // Place flower near the end of each branch
        const tip = path[path.length - 1];
        if (this.rng.next() < 0.5) {
          flowerPoints.push(tip);
        }
      }
    }

    if (flowerPoints.length === 0) return null;

    const flowerGeo = new THREE.SphereGeometry(0.015, 6, 6);
    const flowerColor = this.config.plantType === 'climbing_rose' ? 0xff4488 : 0xcc66ff;
    const flowerMat = new THREE.MeshStandardMaterial({
      color: flowerColor,
      roughness: 0.4,
      metalness: 0.0,
    });

    const instancedMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerPoints.length);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < flowerPoints.length; i++) {
      const point = flowerPoints[i];
      dummy.position.copy(point.position);
      dummy.position.add(point.normal.clone().multiplyScalar(0.02));
      dummy.scale.setScalar(this.rng.uniform(0.7, 1.3));
      dummy.rotation.set(
        this.rng.uniform(0, Math.PI),
        this.rng.uniform(0, Math.PI),
        this.rng.uniform(0, Math.PI)
      );
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }
}
