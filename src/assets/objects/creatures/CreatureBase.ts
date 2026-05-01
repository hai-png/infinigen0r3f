/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, animation hooks,
 * skeleton rigging, and behavior tree for autonomous AI
 */

import {
  Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry,
  MeshStandardMaterial, ConeGeometry, CapsuleGeometry, TorusGeometry,
  BufferGeometry, Float32BufferAttribute, Vector3, Skeleton, Bone,
  SkinnedMesh, AnimationClip, AnimationMixer
} from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { SkeletonBuilder, CreatureSkeletonConfig } from './skeleton/SkeletonBuilder';
import { IdleAnimation, IdleBehavior } from './animation/IdleAnimation';
import { WalkCycle, GaitType, WalkCycleParams } from './animation/WalkCycle';
import { BehaviorTree, CreatureContext, BehaviorState, createDefaultContext } from './animation/BehaviorTree';

export enum CreatureType {
  MAMMAL = 'mammal',
  BIRD = 'bird',
  REPTILE = 'reptile',
  AMPHIBIAN = 'amphibian',
  FISH = 'fish',
  INSECT = 'insect',
  INVERTEBRATE = 'invertebrate'
}

export interface CreatureParams extends BaseGeneratorConfig {
  seed: number;
  species: string;
  size: number;
  age: 'juvenile' | 'adult' | 'elder';
  gender: 'male' | 'female' | 'neutral';
  health: number;
  biome: string;
  creatureType?: CreatureType;
}

export type CreatureParameters = CreatureParams;

export abstract class CreatureBase extends BaseObjectGenerator<CreatureParams> {
  protected params: CreatureParams;
  protected rng: SeededRandom;

  // Skeleton and animation system
  protected skeletonBuilder: SkeletonBuilder;
  protected idleAnimation: IdleAnimation;
  protected walkCycle: WalkCycle;
  protected behaviorTree: BehaviorTree;

  // Stored results
  protected skeleton: Skeleton | null = null;
  protected idleClip: AnimationClip | null = null;
  protected walkClip: AnimationClip | null = null;
  protected animationMixer: AnimationMixer | null = null;

  constructor(params: Partial<CreatureParams> = {}) {
    super(0);
    this.params = {
      seed: params.seed ?? Math.floor(Date.now() * this.rng.next()) % 10000,
      species: 'unknown',
      size: 1.0,
      age: 'adult',
      gender: 'neutral',
      health: 1.0,
      biome: 'temperate',
      ...params
    };
    this.rng = new SeededRandom(this.params.seed);

    // Initialize subsystems
    this.skeletonBuilder = new SkeletonBuilder(this.params.seed);
    this.idleAnimation = new IdleAnimation(this.params.seed);
    this.walkCycle = new WalkCycle(this.params.seed);
    this.behaviorTree = new BehaviorTree(createDefaultContext());
  }

  getDefaultConfig(): CreatureParams {
    return this.params;
  }

  generate(): Group {
    const group = new Group();
    // Base creature: visible ellipsoid body + sphere head
    const bodyMat = this.createStandardMaterial({ color: 0x8b7355, roughness: 0.8 });
    const body = new Mesh(this.createEllipsoidGeometry(0.4, 0.35, 0.5), bodyMat);
    body.name = 'body';
    group.add(body);

    const head = new Mesh(this.createSphereGeometry(0.2), bodyMat);
    head.position.set(0, 0.3, 0.4);
    head.name = 'head';
    group.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(0.04);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 0.35, 0.58);
    leftEye.name = 'leftEye';
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.08, 0.35, 0.58);
    rightEye.name = 'rightEye';
    group.add(rightEye);

    return group;
  }

  // ── Skeleton System ──────────────────────────────────────────────

  /**
   * Build a skeleton for this creature type and store it
   */
  buildSkeleton(config?: CreatureSkeletonConfig): Skeleton {
    const creatureType = this.getCreatureTypeString();
    this.skeleton = this.skeletonBuilder.buildSkeleton(creatureType, {
      size: this.params.size,
      ...config,
    });
    return this.skeleton;
  }

  /**
   * Get the current skeleton (builds one if none exists)
   */
  getSkeleton(config?: CreatureSkeletonConfig): Skeleton {
    if (!this.skeleton) {
      this.buildSkeleton(config);
    }
    return this.skeleton;
  }

  /**
   * Create a skinned mesh using the creature's skeleton
   */
  createSkinnedMesh(geometry: BufferGeometry, material: Material): SkinnedMesh {
    const skeleton = this.getSkeleton();
    const mesh = new SkinnedMesh(geometry, material);
    mesh.add(skeleton.bones[0]); // Add root bone
    mesh.bind(skeleton);
    mesh.name = 'skinnedBody';
    return mesh;
  }

  // ── Animation System ─────────────────────────────────────────────

  /**
   * Build the idle animation clip for this creature
   */
  buildIdleAnimation(behaviors?: IdleBehavior[]): AnimationClip {
    this.idleClip = this.idleAnimation.generate(behaviors ?? ['breathing', 'tailWagging']);
    return this.idleClip;
  }

  /**
   * Build the walk cycle animation clip for this creature
   */
  buildWalkAnimation(gait?: GaitType, speed?: number, params?: WalkCycleParams): AnimationClip {
    const actualGait = gait ?? this.getDefaultGait();
    this.walkClip = this.walkCycle.generate(actualGait, speed ?? 1.0, {
      bodyScale: this.params.size,
      ...params,
    });
    return this.walkClip;
  }

  /**
   * Get all available animation clips
   */
  getAnimationClips(): AnimationClip[] {
    const clips: AnimationClip[] = [];
    if (this.idleClip) clips.push(this.idleClip);
    if (this.walkClip) clips.push(this.walkClip);
    return clips;
  }

  /**
   * Set up the animation mixer on a group
   */
  setupAnimationMixer(group: Group): AnimationMixer {
    this.animationMixer = new AnimationMixer(group);
    return this.animationMixer;
  }

  /**
   * Get the animation mixer
   */
  getAnimationMixer(): AnimationMixer | null {
    return this.animationMixer;
  }

  // ── Behavior Tree System ─────────────────────────────────────────

  /**
   * Tick the behavior tree and return the current behavior
   */
  tickBehavior(deltaTime: number): BehaviorState {
    return this.behaviorTree.execute(deltaTime);
  }

  /**
   * Get the behavior tree context for external manipulation
   */
  getBehaviorContext(): CreatureContext {
    return this.behaviorTree.context;
  }

  /**
   * Update the behavior tree context
   */
  updateBehaviorContext(partial: Partial<CreatureContext>): void {
    this.behaviorTree.updateContext(partial);
  }

  /**
   * Get current behavior name
   */
  getCurrentBehavior(): string {
    return this.behaviorTree.getCurrentBehavior();
  }

  // ── Full Creature Assembly ───────────────────────────────────────

  /**
   * Generate a fully rigged creature with skeleton, animations, and behavior
   */
  generateRigged(config?: CreatureSkeletonConfig): Group {
    const group = this.generate();
    group.name = `${this.params.species}_rigged`;

    // Build and attach skeleton
    const skeleton = this.buildSkeleton(config);

    // Store skeleton reference in userData
    group.userData.skeleton = skeleton;
    group.userData.creatureType = this.getCreatureTypeString();

    // Build animations
    const idleClip = this.buildIdleAnimation();
    const walkClip = this.buildWalkAnimation();

    // Store animations in userData
    group.userData.animations = [idleClip, walkClip];

    // Set up behavior context from creature params
    this.behaviorTree.updateContext({
      health: this.params.health,
      position: { x: 0, y: 0, z: 0 },
      homePosition: { x: 0, y: 0, z: 0 },
    });

    // Store behavior tree reference
    group.userData.behaviorTree = this.behaviorTree;

    // Add skeleton bones to group
    const rootBone = skeleton.bones[0];
    group.add(rootBone);

    // Set up animation mixer
    this.setupAnimationMixer(group);
    group.userData.animationMixer = this.animationMixer;

    return group;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * Get the default gait type based on creature type
   */
  protected getDefaultGait(): GaitType {
    const type = this.params.creatureType;
    switch (type) {
      case CreatureType.BIRD:
        return 'biped';
      case CreatureType.INSECT:
        return 'hexapod';
      case CreatureType.FISH:
        return 'quadruped'; // Fish use a different motion, but quadruped is closest
      default:
        return 'quadruped';
    }
  }

  /**
   * Get creature type as a string for SkeletonBuilder
   */
  protected getCreatureTypeString(): 'mammal' | 'bird' | 'fish' | 'reptile' | 'insect' | 'amphibian' {
    switch (this.params.creatureType) {
      case CreatureType.MAMMAL:
        return 'mammal';
      case CreatureType.BIRD:
        return 'bird';
      case CreatureType.FISH:
        return 'fish';
      case CreatureType.REPTILE:
        return 'reptile';
      case CreatureType.INSECT:
        return 'insect';
      case CreatureType.AMPHIBIAN:
        return 'amphibian';
      default:
        return 'mammal';
    }
  }

  protected createEllipsoidGeometry(x: number, y: number, z: number): SphereGeometry {
    const geometry = new SphereGeometry(1, 32, 32);
    geometry.scale(x, y, z);
    return geometry;
  }

  protected createSphereGeometry(radius: number): SphereGeometry {
    return new SphereGeometry(radius, 16, 16);
  }

  protected createBoxGeometry(width: number, height: number, depth: number): BoxGeometry {
    return new BoxGeometry(width, height, depth);
  }

  protected createCylinderGeometry(radiusTop: number, radiusBottom: number, height: number, segments: number = 16): CylinderGeometry {
    return new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  }

  protected createConeGeometry(radius: number, height: number, segments: number = 16): ConeGeometry {
    return new ConeGeometry(radius, height, segments);
  }

  protected createCapsuleGeometry(radius: number, length: number): CapsuleGeometry {
    return new CapsuleGeometry(radius, length, 8, 16);
  }

  protected createStandardMaterial(params?: Record<string, any>): MeshStandardMaterial {
    return new MeshStandardMaterial({ roughness: 0.7, metalness: 0.0, ...params });
  }

  /**
   * Create a fin-shaped geometry - a tapered flat shape
   */
  protected createFinGeometry(width: number, height: number, depth: number): BufferGeometry {
    const vertices = new Float32Array([
      // Front face - triangular fin
      0, height, 0,       // tip
      -width / 2, 0, -depth / 2,  // base left back
      width / 2, 0, -depth / 2,   // base right back
      // Back face
      0, height, 0,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
      // Left side
      0, height, 0,
      -width / 2, 0, -depth / 2,
      -width / 2, 0, depth / 2,
      // Right side
      0, height, 0,
      width / 2, 0, depth / 2,
      width / 2, 0, -depth / 2,
      // Bottom
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,

      -width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
    ]);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Create an ear-shaped geometry - a curved pointed/cone shape
   */
  protected createEarGeometry(width: number, height: number, depth: number): BufferGeometry {
    // Create a tapered cone-like ear shape
    const geo = new ConeGeometry(width / 2, height, 8);
    geo.scale(1, 1, depth / width);
    return geo;
  }

  /**
   * Create a shell-shaped geometry - a dome/hemisphere
   */
  protected createShellGeometry(radius: number, domeHeight: number): SphereGeometry {
    const geo = new SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    geo.scale(1, domeHeight / radius, 1);
    return geo;
  }

  protected mergeParameters(base: any, override: any): any {
    return { ...base, ...override };
  }

  abstract generateBodyCore(): Mesh;
  abstract generateHead(): Mesh;
  abstract generateLimbs(): Mesh[];
  abstract generateAppendages(): Mesh[];
  abstract applySkin(materials: Material[]): Material[];
}
