/**
 * ClothSceneIntegrator — Cloth-vs-Static-Mesh Collision & Scene Integration
 *
 * Provides five subsystems for integrating cloth simulation with the scene:
 *
 *   1. ClothStaticMeshCollision — BVH ray-cast collision + friction + self-collision
 *   2. ClothWindInteraction      — Wind forces with gusts, turbulence, and wind shadow
 *   3. ClothAttachmentSystem     — Pin constraints, animated attachments, partial pinning
 *   4. ClothCreatureValidator    — Validate ClothCreatureBridge with multiple creature types
 *   5. ClothRestConfiguration    — Compute rest-state topology for common garments
 *
 * @module sim/cloth
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/math/index';
import type { VerletParticle, VerletConstraint } from './VerletCloth';

// ============================================================================
// 1. ClothStaticMeshCollision
// ============================================================================

export interface StaticMeshCollisionConfig {
  /** Collision margin — how far particles are pushed out (default: 0.02) */
  margin: number;
  /** Maximum collision iterations per frame (default: 4) */
  maxIterations: number;
  /** Friction coefficient 0–1 (default: 0.3) */
  friction: number;
  /** Enable self-collision between cloth particles (default: true) */
  selfCollision: boolean;
  /** Self-collision minimum distance (default: 0.05) */
  selfCollisionRadius: number;
  /** Spatial hash cell size for self-collision (default: 0.2) */
  spatialHashCellSize: number;
}

const DEFAULT_COLLISION_CONFIG: StaticMeshCollisionConfig = {
  margin: 0.02,
  maxIterations: 4,
  friction: 0.3,
  selfCollision: true,
  selfCollisionRadius: 0.05,
  spatialHashCellSize: 0.2,
};

/**
 * BVH-based ray-casting collision between cloth particles and scene geometry.
 * Pushes cloth particles out of intersecting geometry with friction handling
 * and sparse spatial-hash self-collision between cloth particles.
 */
export class ClothStaticMeshCollision {
  private config: StaticMeshCollisionConfig;
  private collisionMeshes: THREE.Mesh[] = [];
  private spatialHash: Map<string, number[]> = new Map();

  // Reusable temp objects to avoid GC
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _tmpVec = new THREE.Vector3();
  private readonly _tmpVec2 = new THREE.Vector3();

  constructor(config: Partial<StaticMeshCollisionConfig> = {}) {
    this.config = { ...DEFAULT_COLLISION_CONFIG, ...config };
  }

  /** Register a static mesh for collision. BVH is auto-built by Three.js. */
  addCollisionMesh(mesh: THREE.Mesh): void {
    mesh.updateMatrixWorld(true);
    this.collisionMeshes.push(mesh);
  }

  /** Remove all registered collision meshes. */
  clearCollisionMeshes(): void {
    this.collisionMeshes = [];
  }

  /** Get the current list of collision meshes. */
  getCollisionMeshes(): ReadonlyArray<THREE.Mesh> {
    return this.collisionMeshes;
  }

  /**
   * Resolve cloth-vs-static-mesh collisions for a set of particles.
   *
   * For each non-pinned particle, cast rays from multiple directions toward
   * scene geometry. If a ray hits close to the particle, push it out along
   * the surface normal with friction.
   */
  resolveCollisions(particles: VerletParticle[]): void {
    const { margin, maxIterations, friction } = this.config;
    if (this.collisionMeshes.length === 0 && !this.config.selfCollision) return;

    // Ray directions for 6-axis collision detection
    const rayDirections: THREE.Vector3[] = [
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];

    for (let iter = 0; iter < maxIterations; iter++) {
      let anyCollision = false;

      for (const mesh of this.collisionMeshes) {
        mesh.updateMatrixWorld(true);

        for (let i = 0; i < particles.length; i++) {
          const particle = particles[i];
          if (particle.pinned) continue;

          for (const dir of rayDirections) {
            this._rayOrigin.copy(particle.position).addScaledVector(dir, margin * 0.5);
            this._rayDir.copy(dir).negate();

            this._raycaster.set(this._rayOrigin, this._rayDir);
            this._raycaster.far = 2.0;
            this._raycaster.near = 0;

            const hits = this._raycaster.intersectObject(mesh, false);
            if (hits.length === 0) continue;

            const hit = hits[0];
            const distToParticle = hit.distance - margin * 0.5;

            if (distToParticle < margin) {
              if (hit.face && hit.face.normal) {
                const normalWorld = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
                const pushDist = margin - distToParticle;
                particle.position.addScaledVector(normalWorld, pushDist);

                // Friction: reduce tangential velocity
                this.applyFriction(particle, normalWorld, friction);
                anyCollision = true;
              }
            }
          }
        }
      }

      // Self-collision
      if (this.config.selfCollision) {
        anyCollision = this.resolveSelfCollision(particles) || anyCollision;
      }

      if (!anyCollision) break;
    }
  }

  /**
   * Apply friction to a particle: reduce its velocity component tangential
   * to the collision surface normal.
   */
  private applyFriction(
    particle: VerletParticle,
    normal: THREE.Vector3,
    friction: number,
  ): void {
    // Velocity in Verlet = position - previousPosition
    this._tmpVec.copy(particle.position).sub(particle.previousPosition);
    // Project velocity onto normal
    const vNormal = this._tmpVec2.copy(normal).multiplyScalar(this._tmpVec.dot(normal));
    // Tangential velocity = velocity - normal component
    this._tmpVec.sub(vNormal);
    // Scale tangential velocity by (1 - friction)
    this._tmpVec.multiplyScalar(1 - friction);
    // Reconstruct: previousPosition = position - (vNormal + modified tangent)
    particle.previousPosition.copy(particle.position).sub(vNormal.add(this._tmpVec));
  }

  /**
   * Sparse spatial-hash self-collision between cloth particles.
   * Pushes nearby particles apart to prevent interpenetration.
   */
  private resolveSelfCollision(particles: VerletParticle[]): boolean {
    const radius = this.config.selfCollisionRadius;
    const cellSize = this.config.spatialHashCellSize;
    let anyCollision = false;

    // Build spatial hash
    this.spatialHash.clear();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const cx = Math.floor(p.position.x / cellSize);
      const cy = Math.floor(p.position.y / cellSize);
      const cz = Math.floor(p.position.z / cellSize);
      const key = `${cx},${cy},${cz}`;
      if (!this.spatialHash.has(key)) {
        this.spatialHash.set(key, []);
      }
      this.spatialHash.get(key)!.push(i);
    }

    // Check neighboring cells
    for (let i = 0; i < particles.length; i++) {
      const pi = particles[i];
      if (pi.pinned) continue;

      const cx = Math.floor(pi.position.x / cellSize);
      const cy = Math.floor(pi.position.y / cellSize);
      const cz = Math.floor(pi.position.z / cellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const key = `${cx + dx},${cy + dy},${cz + dz}`;
            const cell = this.spatialHash.get(key);
            if (!cell) continue;

            for (const j of cell) {
              if (j <= i) continue; // avoid duplicate pairs
              const pj = particles[j];
              if (pj.pinned) continue;

              // Skip if connected by a constraint (structural neighbors)
              // Simple distance check
              this._tmpVec.copy(pi.position).sub(pj.position);
              const dist = this._tmpVec.length();

              if (dist < radius && dist > 1e-8) {
                // Push apart
                const overlap = (radius - dist) * 0.5;
                const correction = this._tmpVec.normalize().multiplyScalar(overlap);
                pi.position.add(correction);
                pj.position.sub(correction);
                anyCollision = true;
              }
            }
          }
        }
      }
    }

    return anyCollision;
  }
}

// ============================================================================
// 2. ClothWindInteraction
// ============================================================================

export interface WindInteractionConfig {
  /** Base wind direction (default: [1, 0, 0]) */
  baseWindDirection: THREE.Vector3;
  /** Base wind strength (default: 2.0) */
  baseStrength: number;
  /** Gust amplitude multiplier (default: 0.5) */
  gustAmplitude: number;
  /** Gust frequency in Hz (default: 0.3) */
  gustFrequency: number;
  /** Turbulence noise scale (default: 2.0) */
  turbulenceScale: number;
  /** Turbulence intensity (default: 0.4) */
  turbulenceIntensity: number;
  /** Wind shadow: objects blocking wind (default: []) */
  shadowCasters: THREE.Object3D[];
  /** Wind shadow reduction factor 0-1 (default: 0.7) */
  shadowReduction: number;
}

const DEFAULT_WIND_CONFIG: WindInteractionConfig = {
  baseWindDirection: new THREE.Vector3(1, 0, 0),
  baseStrength: 2.0,
  gustAmplitude: 0.5,
  gustFrequency: 0.3,
  turbulenceScale: 2.0,
  turbulenceIntensity: 0.4,
  shadowCasters: [],
  shadowReduction: 0.7,
};

/**
 * Wind forces on cloth particles based on face normals, with gust
 * simulation, Perlin-noise turbulence, and wind shadow behind obstacles.
 */
export class ClothWindInteraction {
  private config: WindInteractionConfig;
  private time: number = 0;
  private rng: SeededRandom;
  private permTable: number[];

  // Reusable temp
  private readonly _windForce = new THREE.Vector3();
  private readonly _faceNormal = new THREE.Vector3();

  constructor(config: Partial<WindInteractionConfig> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_WIND_CONFIG, ...config };
    this.rng = new SeededRandom(seed);
    this.permTable = this.rng.getPermutationTable();
  }

  /**
   * Compute wind force for a single cloth particle.
   * Accounts for face-normal alignment, gusts, turbulence, and wind shadow.
   *
   * @param position     Particle world position
   * @param faceNormal   Approximate face normal at this particle
   * @param dt           Delta time for gust phase update
   * @returns            Wind force vector for this particle
   */
  computeWindForce(position: THREE.Vector3, faceNormal: THREE.Vector3, dt: number): THREE.Vector3 {
    this.time += dt;

    // Base wind
    this._windForce.copy(this.config.baseWindDirection).normalize().multiplyScalar(this.config.baseStrength);

    // Gust: time-varying wind strength
    const gustPhase = this.time * this.config.gustFrequency * Math.PI * 2;
    const gustFactor = 1.0 + this.config.gustAmplitude * Math.sin(gustPhase);
    this._windForce.multiplyScalar(gustFactor);

    // Turbulence: Perlin-noise-based wind variation across cloth surface
    const noiseVal = this.perlinNoise3D(
      position.x * this.config.turbulenceScale,
      position.y * this.config.turbulenceScale,
      position.z * this.config.turbulenceScale,
    );
    const turbulenceOffset = noiseVal * this.config.turbulenceIntensity;
    this._windForce.y += turbulenceOffset * this.config.baseStrength;
    this._windForce.z += turbulenceOffset * this.config.baseStrength * 0.5;

    // Face-normal alignment: wind is stronger on surfaces facing the wind
    const dot = this._windForce.dot(faceNormal);
    const alignmentFactor = Math.max(0, dot / this._windForce.length());
    this._windForce.multiplyScalar(0.3 + 0.7 * alignmentFactor);

    // Wind shadow: reduce wind behind obstacles
    const shadowFactor = this.computeWindShadow(position);
    this._windForce.multiplyScalar(shadowFactor);

    return this._windForce.clone();
  }

  /**
   * Compute a wind-shadow factor for a position.
   * Ray-casts from the position against the wind direction toward shadow casters.
   * Returns 1.0 if unobstructed, reduced if behind an obstacle.
   */
  private computeWindShadow(position: THREE.Vector3): number {
    if (this.config.shadowCasters.length === 0) return 1.0;

    const raycaster = new THREE.Raycaster();
    const windDir = this.config.baseWindDirection.clone().normalize();
    // Cast ray INTO the wind (from position, toward where the wind comes from)
    raycaster.set(position, windDir.clone().negate());
    raycaster.far = 10.0;

    for (const caster of this.config.shadowCasters) {
      const hits = raycaster.intersectObject(caster, true);
      if (hits.length > 0) {
        return 1.0 - this.config.shadowReduction;
      }
    }

    return 1.0;
  }

  /**
   * Simple 3D Perlin noise using the seeded permutation table.
   */
  private perlinNoise3D(x: number, y: number, z: number): number {
    const p = this.permTable;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (t: number, a: number, b: number) => a + t * (b - a);
    const grad = (hash: number, x: number, y: number, z: number): number => {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };

    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const A  = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B  = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    return lerp(w,
      lerp(v,
        lerp(u, grad(p[AA], xf, yf, zf), grad(p[BA], xf - 1, yf, zf)),
        lerp(u, grad(p[AB], xf, yf - 1, zf), grad(p[BB], xf - 1, yf - 1, zf)),
      ),
      lerp(v,
        lerp(u, grad(p[AA + 1], xf, yf, zf - 1), grad(p[BA + 1], xf - 1, yf, zf - 1)),
        lerp(u, grad(p[AB + 1], xf, yf - 1, zf - 1), grad(p[BB + 1], xf - 1, yf - 1, zf - 1)),
      ),
    );
  }

  /** Set the base wind direction. */
  setWindDirection(dir: THREE.Vector3): void {
    this.config.baseWindDirection.copy(dir);
  }

  /** Set the base wind strength. */
  setWindStrength(strength: number): void {
    this.config.baseStrength = strength;
  }
}

// ============================================================================
// 3. ClothAttachmentSystem
// ============================================================================

export interface AttachmentConfig {
  /** Pin constraint stiffness 0–1 (default: 1.0) */
  stiffness: number;
  /** Whether to allow animated (moving) pins (default: true) */
  allowAnimated: boolean;
}

const DEFAULT_ATTACHMENT_CONFIG: AttachmentConfig = {
  stiffness: 1.0,
  allowAnimated: true,
};

/** Describes a single attachment point. */
export interface ClothAttachmentPoint {
  /** Index of the cloth particle to pin. */
  particleIndex: number;
  /** Target position for the pin. */
  position: THREE.Vector3;
  /** Whether this attachment is animated (moves with parent object). */
  animated: boolean;
  /** Optional parent Object3D to follow (for animated attachments). */
  parentObject?: THREE.Object3D;
  /** Local-space offset from the parent object's world position. */
  localOffset: THREE.Vector3;
  /** Constraint stiffness 0–1. */
  stiffness: number;
}

/**
 * Pin constraints for attaching cloth vertices to specific positions.
 * Supports animated attachments that move with parent objects (characters,
 * doors), partial pinning of subsets (collar, cuffs, waistband), and
 * configurable constraint stiffness.
 */
export class ClothAttachmentSystem {
  private config: AttachmentConfig;
  private attachments: ClothAttachmentPoint[] = [];
  private readonly _tmpPos = new THREE.Vector3();
  private readonly _tmpQuat = new THREE.Quaternion();

  constructor(config: Partial<AttachmentConfig> = {}) {
    this.config = { ...DEFAULT_ATTACHMENT_CONFIG, ...config };
  }

  /**
   * Add a static pin constraint.
   * The particle is pinned at the given position.
   */
  addPin(particleIndex: number, position: THREE.Vector3, stiffness: number = 1.0): void {
    this.attachments.push({
      particleIndex,
      position: position.clone(),
      animated: false,
      localOffset: new THREE.Vector3(),
      stiffness,
    });
  }

  /**
   * Add an animated pin that follows a parent Object3D.
   * Each frame, the pin position is updated from the parent's world transform.
   */
  addAnimatedPin(
    particleIndex: number,
    parentObject: THREE.Object3D,
    localOffset: THREE.Vector3 = new THREE.Vector3(),
    stiffness: number = 1.0,
  ): void {
    if (!this.config.allowAnimated) return;

    // Compute initial position from parent
    parentObject.updateMatrixWorld(true);
    parentObject.getWorldPosition(this._tmpPos);
    const worldQuat = new THREE.Quaternion();
    parentObject.getWorldQuaternion(worldQuat);
    const offset = localOffset.clone().applyQuaternion(worldQuat);
    const worldPos = this._tmpPos.add(offset);

    this.attachments.push({
      particleIndex,
      position: worldPos.clone(),
      animated: true,
      parentObject,
      localOffset: localOffset.clone(),
      stiffness,
    });
  }

  /**
   * Partial pinning: pin a subset of cloth particles by index.
   * Useful for pinning specific garment regions (collar, cuffs, waistband).
   */
  addPartialPins(
    particleIndices: number[],
    positions: THREE.Vector3[],
    stiffness: number = 1.0,
  ): void {
    for (let i = 0; i < particleIndices.length; i++) {
      this.addPin(particleIndices[i], positions[i], stiffness);
    }
  }

  /**
   * Remove all attachments for a given particle index.
   */
  removeAttachment(particleIndex: number): void {
    this.attachments = this.attachments.filter(a => a.particleIndex !== particleIndex);
  }

  /**
   * Update all animated attachment positions from their parent objects.
   * Call this once per frame before the simulation step.
   */
  updateAnimatedAttachments(): void {
    for (const attachment of this.attachments) {
      if (!attachment.animated || !attachment.parentObject) continue;

      attachment.parentObject.updateMatrixWorld(true);
      attachment.parentObject.getWorldPosition(this._tmpPos);
      attachment.parentObject.getWorldQuaternion(this._tmpQuat);

      const offset = attachment.localOffset.clone().applyQuaternion(this._tmpQuat);
      attachment.position.copy(this._tmpPos).add(offset);
    }
  }

  /**
   * Apply pin constraints to particles.
   * Soft pins (stiffness < 1) move the particle partway toward the target.
   */
  applyConstraints(particles: VerletParticle[]): void {
    for (const attachment of this.attachments) {
      const idx = attachment.particleIndex;
      if (idx < 0 || idx >= particles.length) continue;

      const particle = particles[idx];

      if (attachment.stiffness >= 1.0) {
        // Hard pin: snap to target
        particle.position.copy(attachment.position);
        particle.previousPosition.copy(attachment.position);
        particle.pinned = true;
        particle.inverseMass = 0;
      } else {
        // Soft pin: move partway toward target
        const diff = this._tmpPos.copy(attachment.position).sub(particle.position);
        const correction = diff.multiplyScalar(attachment.stiffness);
        particle.position.add(correction);
      }
    }
  }

  /** Get all current attachments (read-only snapshot). */
  getAttachments(): ReadonlyArray<ClothAttachmentPoint> {
    return this.attachments;
  }

  /** Get the number of active attachments. */
  getAttachmentCount(): number {
    return this.attachments.length;
  }

  /** Clear all attachments. */
  clear(): void {
    this.attachments = [];
  }
}

// ============================================================================
// 4. ClothCreatureValidator
// ============================================================================

export interface CreatureTypeInfo {
  /** Creature type identifier */
  type: 'mammal' | 'quadruped' | 'bird' | 'fish' | 'reptile';
  /** Whether this creature type supports cloth clothing */
  supportsClothing: boolean;
  /** Expected attachment bone names */
  expectedBones: string[];
  /** Typical body proportions (relative scale) */
  bodyScale: { width: number; height: number; depth: number };
}

export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Creature type that was tested */
  creatureType: string;
  /** Errors encountered */
  errors: string[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Attachment point coverage (0–1) */
  attachmentCoverage: number;
}

/** Predefined creature type information. */
const CREATURE_TYPES: Record<string, CreatureTypeInfo> = {
  mammal: {
    type: 'mammal',
    supportsClothing: true,
    expectedBones: ['spine', 'chest', 'left_shoulder', 'right_shoulder', 'hips', 'left_hip', 'right_hip'],
    bodyScale: { width: 0.5, height: 1.7, depth: 0.3 },
  },
  quadruped: {
    type: 'quadruped',
    supportsClothing: true,
    expectedBones: ['spine', 'chest', 'neck', 'tail', 'left_front_shoulder', 'right_front_shoulder'],
    bodyScale: { width: 0.4, height: 0.8, depth: 1.2 },
  },
  bird: {
    type: 'bird',
    supportsClothing: false,
    expectedBones: ['spine', 'left_wing', 'right_wing', 'tail'],
    bodyScale: { width: 0.3, height: 0.3, depth: 0.4 },
  },
};

/**
 * Validates ClothCreatureBridge integration with different creature types.
 * Tests clothing on mammals, capes on quadrupeds, and verifies birds
 * are correctly skipped (no fabric).
 */
export class ClothCreatureValidator {
  /**
   * Validate that a skeleton has the expected bones for a creature type.
   *
   * @param creatureType  The creature type to validate against
   * @param skeleton      The creature skeleton (or null)
   * @param pinBindings   The pin bindings that were configured
   * @returns             Validation result with errors and coverage
   */
  validateCreature(
    creatureType: string,
    skeleton: THREE.Skeleton | null,
    pinBindings: Array<{ boneName: string }>,
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const typeInfo = CREATURE_TYPES[creatureType];

    if (!typeInfo) {
      return {
        valid: false,
        creatureType,
        errors: [`Unknown creature type: ${creatureType}`],
        warnings: [],
        attachmentCoverage: 0,
      };
    }

    // Birds should not have cloth
    if (!typeInfo.supportsClothing) {
      if (pinBindings.length > 0) {
        errors.push(
          `Creature type "${creatureType}" does not support clothing, but ${pinBindings.length} pin bindings were provided.`,
        );
      }
      return {
        valid: pinBindings.length === 0,
        creatureType,
        errors,
        warnings,
        attachmentCoverage: 0,
      };
    }

    // Check skeleton
    if (!skeleton) {
      errors.push('Skeleton is null; cannot validate bone attachments.');
      return { valid: false, creatureType, errors, warnings, attachmentCoverage: 0 };
    }

    // Check expected bones exist in the skeleton
    const availableBoneNames = new Set(skeleton.bones.map(b => b.name));
    const matchedBones: string[] = [];

    for (const expectedBone of typeInfo.expectedBones) {
      if (availableBoneNames.has(expectedBone)) {
        matchedBones.push(expectedBone);
      } else {
        warnings.push(`Expected bone "${expectedBone}" not found in skeleton.`);
      }
    }

    // Check pin bindings reference valid bones
    for (const binding of pinBindings) {
      if (!availableBoneNames.has(binding.boneName)) {
        errors.push(
          `Pin binding references bone "${binding.boneName}" which does not exist in the skeleton.`,
        );
      }
    }

    // Compute attachment coverage
    const totalExpected = typeInfo.expectedBones.length;
    const coverage = totalExpected > 0 ? matchedBones.length / totalExpected : 0;

    if (coverage < 0.5) {
      warnings.push(
        `Low attachment coverage (${(coverage * 100).toFixed(0)}%). Clothing may not fit well.`,
      );
    }

    return {
      valid: errors.length === 0,
      creatureType,
      errors,
      warnings,
      attachmentCoverage: coverage,
    };
  }

  /**
   * Run a full validation suite across all supported creature types.
   */
  validateAll(
    skeleton: THREE.Skeleton | null,
    pinBindings: Array<{ boneName: string }>,
  ): ValidationResult[] {
    const results: ValidationResult[] = [];
    for (const typeKey of Object.keys(CREATURE_TYPES)) {
      results.push(this.validateCreature(typeKey, skeleton, pinBindings));
    }
    return results;
  }

  /**
   * Test a specific garment scenario.
   */
  testGarment(
    garmentType: 'shirt' | 'pants' | 'cape' | 'skirt',
    creatureType: string,
    skeleton: THREE.Skeleton | null,
    pinBindings: Array<{ boneName: string }>,
  ): ValidationResult {
    const baseResult = this.validateCreature(creatureType, skeleton, pinBindings);

    // Garment-specific checks
    const garmentBoneRequirements: Record<string, string[]> = {
      shirt:  ['chest', 'left_shoulder', 'right_shoulder'],
      pants:  ['hips', 'left_hip', 'right_hip'],
      cape:   ['chest', 'spine'],
      skirt:  ['hips'],
    };

    const requiredBones = garmentBoneRequirements[garmentType] ?? [];
    if (skeleton) {
      const availableBones = new Set(skeleton.bones.map(b => b.name));
      for (const reqBone of requiredBones) {
        if (!availableBones.has(reqBone)) {
          baseResult.errors.push(
            `Garment "${garmentType}" requires bone "${reqBone}" which is missing.`,
          );
          baseResult.valid = false;
        }
      }
    }

    return baseResult;
  }
}

// ============================================================================
// 5. ClothRestConfiguration
// ============================================================================

export interface RestTopologyConfig {
  /** Garment type */
  garmentType: 'tshirt' | 'pants' | 'cape' | 'skirt';
  /** Grid resolution (width x height) for the cloth particle system */
  resolution: { width: number; height: number };
  /** Physical dimensions of the garment */
  dimensions: {
    torsoCircumference: number;
    shoulderWidth: number;
    torsoLength: number;
    armHoleRadius: number;
    waistCircumference: number;
    hipCircumference: number;
    inseamLength: number;
    capeWidth: number;
    capeLength: number;
    skirtWaistCircumference: number;
    skirtLength: number;
  };
  /** Seed for deterministic generation */
  seed: number;
}

/** Particle rest-state output. */
export interface RestParticle {
  /** Index of the particle */
  index: number;
  /** Rest position in local space */
  position: THREE.Vector3;
  /** UV coordinates on the garment surface */
  uv: { u: number; v: number };
  /** Whether this particle should be pinned */
  pinned: boolean;
  /** Pin group name (e.g., 'collar', 'cuff_left', 'waistband') */
  pinGroup: string | null;
}

/** Constraint rest-state output. */
export interface RestConstraint {
  particleA: number;
  particleB: number;
  restLength: number;
  type: 'structural' | 'shear' | 'bending';
}

/**
 * Computes rest-state topology for common garment types.
 * Generates particle positions and constraint connectivity for:
 * - T-shirt: cylinder with arm holes
 * - Pants: two leg cylinders joined at waist
 * - Cape: rectangular sheet with shoulder attachments
 * - Skirt: conical sheet with waistband
 */
export class ClothRestConfiguration {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a T-shirt topology.
   * A cylinder for the torso with two circular holes cut for the arms.
   * The collar (top row) and arm holes are pinned.
   */
  generateTShirt(config: Partial<RestTopologyConfig> = {}): {
    particles: RestParticle[];
    constraints: RestConstraint[];
  } {
    const resW = config.resolution?.width ?? 16;
    const resH = config.resolution?.height ?? 20;
    const torsoCirc = config.dimensions?.torsoCircumference ?? 0.9;
    const torsoLen = config.dimensions?.torsoLength ?? 0.6;
    const shoulderW = config.dimensions?.shoulderWidth ?? 0.4;
    const armHoleR = config.dimensions?.armHoleRadius ?? 0.08;

    const particles: RestParticle[] = [];
    const constraints: RestConstraint[] = [];
    const radius = torsoCirc / (2 * Math.PI);

    // Generate particles on a cylinder
    for (let row = 0; row <= resH; row++) {
      for (let col = 0; col <= resW; col++) {
        const u = col / resW; // around circumference
        const v = row / resH; // along length (top = 0)
        const angle = u * Math.PI * 2;
        const y = (0.5 - v) * torsoLen;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        // Check if this particle falls inside an arm hole
        const shoulderAngle = shoulderW / (2 * radius);
        const leftArmAngle = Math.PI - shoulderAngle;
        const rightArmAngle = shoulderAngle;
        const armY = torsoLen * 0.35; // arm holes at ~35% from top

        const inArmHole =
          Math.abs(y - (0.5 * torsoLen - armY)) < armHoleR &&
          (Math.abs(angle - leftArmAngle) < armHoleR / radius ||
           Math.abs(angle - rightArmAngle) < armHoleR / radius);

        const isCollar = row === 0;
        const pinGroup = isCollar ? 'collar' : null;

        particles.push({
          index: row * (resW + 1) + col,
          position: new THREE.Vector3(x, y, z),
          uv: { u, v },
          pinned: isCollar || inArmHole,
          pinGroup,
        });
      }
    }

    // Generate constraints
    this.generateGridConstraints(particles, constraints, resW, resH);

    return { particles, constraints };
  }

  /**
   * Generate a pants topology.
   * Two leg cylinders joined at the waist.
   * The waistband (top row) is pinned.
   */
  generatePants(config: Partial<RestTopologyConfig> = {}): {
    particles: RestParticle[];
    constraints: RestConstraint[];
  } {
    const resW = config.resolution?.width ?? 12;
    const resH = config.resolution?.height ?? 24;
    const waistCirc = config.dimensions?.waistCircumference ?? 0.8;
    const hipCirc = config.dimensions?.hipCircumference ?? 0.9;
    const inseamLen = config.dimensions?.inseamLength ?? 0.75;

    const particles: RestParticle[] = [];
    const constraints: RestConstraint[] = [];

    // Upper section: single cylinder from waist to crotch
    const upperRows = Math.floor(resH * 0.35);
    const upperHeight = inseamLen * 0.35;

    for (let row = 0; row <= upperRows; row++) {
      const v = row / upperRows;
      const circ = waistCirc + (hipCirc - waistCirc) * v;
      const radius = circ / (2 * Math.PI);
      const y = (0.5 - v * 0.35) * inseamLen;

      for (let col = 0; col <= resW; col++) {
        const u = col / resW;
        const angle = u * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        const isWaist = row === 0;
        particles.push({
          index: particles.length,
          position: new THREE.Vector3(x, y, z),
          uv: { u, v: v * 0.35 },
          pinned: isWaist,
          pinGroup: isWaist ? 'waistband' : null,
        });
      }
    }

    // Lower section: two leg cylinders from crotch to ankles
    const legRows = resH - upperRows;
    const legHeight = inseamLen * 0.65;
    const legCirc = hipCirc * 0.55; // each leg ~55% of hip circumference
    const legRadius = legCirc / (2 * Math.PI);

    for (const leg of [0, 1] as const) {
      const offsetX = leg === 0 ? -0.08 : 0.08; // leg offset from center

      for (let row = 0; row <= legRows; row++) {
        const v = row / legRows;
        const y = (0.5 - 0.35 - v * 0.65) * inseamLen;
        const taper = 1.0 - v * 0.15; // legs taper slightly

        for (let col = 0; col <= Math.floor(resW / 2); col++) {
          const u = col / Math.floor(resW / 2);
          const angle = u * Math.PI * 2;
          const x = Math.cos(angle) * legRadius * taper + offsetX;
          const z = Math.sin(angle) * legRadius * taper;

          particles.push({
            index: particles.length,
            position: new THREE.Vector3(x, y, z),
            uv: { u, v: 0.35 + v * 0.65 },
            pinned: false,
            pinGroup: null,
          });
        }
      }
    }

    // Generate constraints within the grid
    this.generateGridConstraints(particles, constraints, resW, resH);

    return { particles, constraints };
  }

  /**
   * Generate a cape topology.
   * A rectangular sheet with shoulder attachment points at the top corners.
   */
  generateCape(config: Partial<RestTopologyConfig> = {}): {
    particles: RestParticle[];
    constraints: RestConstraint[];
  } {
    const resW = config.resolution?.width ?? 14;
    const resH = config.resolution?.height ?? 18;
    const capeW = config.dimensions?.capeWidth ?? 0.8;
    const capeL = config.dimensions?.capeLength ?? 1.0;

    const particles: RestParticle[] = [];
    const constraints: RestConstraint[] = [];

    for (let row = 0; row <= resH; row++) {
      for (let col = 0; col <= resW; col++) {
        const u = col / resW;
        const v = row / resH;
        const x = (u - 0.5) * capeW;
        const y = (0.5 - v) * capeL;
        const z = 0;

        // Pin the top row (shoulder attachments)
        const isShoulder = row === 0;
        const isCorner = isShoulder && (col === 0 || col === resW);
        const isNearCorner = isShoulder && (col <= 1 || col >= resW - 1);

        particles.push({
          index: row * (resW + 1) + col,
          position: new THREE.Vector3(x, y, z),
          uv: { u, v },
          pinned: isNearCorner,
          pinGroup: isCorner ? 'shoulder' : (isShoulder ? 'collar' : null),
        });
      }
    }

    this.generateGridConstraints(particles, constraints, resW, resH);

    return { particles, constraints };
  }

  /**
   * Generate a skirt topology.
   * A conical sheet with waistband at the top.
   */
  generateSkirt(config: Partial<RestTopologyConfig> = {}): {
    particles: RestParticle[];
    constraints: RestConstraint[];
  } {
    const resW = config.resolution?.width ?? 16;
    const resH = config.resolution?.height ?? 12;
    const waistCirc = config.dimensions?.skirtWaistCircumference ?? 0.7;
    const skirtLen = config.dimensions?.skirtLength ?? 0.6;

    const particles: RestParticle[] = [];
    const constraints: RestConstraint[] = [];
    const waistRadius = waistCirc / (2 * Math.PI);

    for (let row = 0; row <= resH; row++) {
      const v = row / resH;
      const y = (0.5 - v) * skirtLen;
      // Conical flare: radius increases toward the bottom
      const flareFactor = 1.0 + v * 0.6;
      const radius = waistRadius * flareFactor;

      for (let col = 0; col <= resW; col++) {
        const u = col / resW;
        const angle = u * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        const isWaistband = row === 0;

        particles.push({
          index: row * (resW + 1) + col,
          position: new THREE.Vector3(x, y, z),
          uv: { u, v },
          pinned: isWaistband,
          pinGroup: isWaistband ? 'waistband' : null,
        });
      }
    }

    this.generateGridConstraints(particles, constraints, resW, resH);

    return { particles, constraints };
  }

  /**
   * Generate structural, shear, and bending constraints for a grid topology.
   */
  private generateGridConstraints(
    particles: RestParticle[],
    constraints: RestConstraint[],
    segW: number,
    segH: number,
  ): void {
    const cols = segW + 1;

    for (let row = 0; row <= segH; row++) {
      for (let col = 0; col <= segW; col++) {
        const idx = row * cols + col;
        if (idx >= particles.length) continue;

        // Structural — horizontal
        if (col < segW) {
          const right = idx + 1;
          if (right < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: right,
              restLength: particles[idx].position.distanceTo(particles[right].position),
              type: 'structural',
            });
          }
        }

        // Structural — vertical
        if (row < segH) {
          const below = (row + 1) * cols + col;
          if (below < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: below,
              restLength: particles[idx].position.distanceTo(particles[below].position),
              type: 'structural',
            });
          }
        }

        // Shear — diagonals
        if (col < segW && row < segH) {
          const diagA = (row + 1) * cols + (col + 1);
          if (diagA < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: diagA,
              restLength: particles[idx].position.distanceTo(particles[diagA].position),
              type: 'shear',
            });
          }
        }

        if (col > 0 && row < segH) {
          const diagB = (row + 1) * cols + (col - 1);
          if (diagB < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: diagB,
              restLength: particles[idx].position.distanceTo(particles[diagB].position),
              type: 'shear',
            });
          }
        }

        // Bending — skip one horizontally
        if (col < segW - 1) {
          const skipH = row * cols + (col + 2);
          if (skipH < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: skipH,
              restLength: particles[idx].position.distanceTo(particles[skipH].position),
              type: 'bending',
            });
          }
        }

        // Bending — skip one vertically
        if (row < segH - 1) {
          const skipV = (row + 2) * cols + col;
          if (skipV < particles.length) {
            constraints.push({
              particleA: idx,
              particleB: skipV,
              restLength: particles[idx].position.distanceTo(particles[skipV].position),
              type: 'bending',
            });
          }
        }
      }
    }
  }
}
