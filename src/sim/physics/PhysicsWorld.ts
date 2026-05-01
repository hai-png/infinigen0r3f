/**
 * PhysicsWorld - Main physics simulation engine
 *
 * Features:
 * - Body management (add/remove)
 * - Fixed timestep with accumulator
 * - Full collision pipeline (broad + narrow phase)
 * - GJK/EPA fallback for unsupported shape pairs
 * - Multi-contact manifold persistence for stable stacking
 * - Continuous Collision Detection (CCD) for fast-moving bodies
 * - 3x3 inertia tensor integration
 * - Gravity
 * - Collision response with friction/restitution
 * - Joint system
 */
import { Vector3, Matrix3 } from 'three';
import { RigidBody, RigidBodyConfig, BodyType, mulMatrix3Vector3 } from './RigidBody';
import { Collider, ColliderConfig } from './Collider';
import { Joint, JointConfig } from './Joint';
import { BroadPhase, BroadPhasePair } from './collision/BroadPhase';
import { NarrowPhase, CollisionPair, ContactPoint } from './collision/NarrowPhase';
import { PhysicsMaterial, materialPresets, combineFriction, combineRestitution } from './Material';
import { ContinuousCollisionDetector, CCDEvent } from './CCD';

// ============================================================================
// Shape Utilities (consolidated from RigidBodyDynamics.ts)
// ============================================================================

export type PhysicsShapeType =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'convexHull'
  | 'trimesh'
  | 'heightfield';

export interface PhysicsShape {
  type: PhysicsShapeType;
  dimensions?: Vector3; // For box, capsule, cylinder
  radius?: number;      // For sphere, capsule, cylinder
  height?: number;      // For capsule, cylinder
  vertices?: Float32Array; // For convexHull, trimesh
  indices?: Uint32Array;   // For trimesh
  heights?: Float32Array;  // For heightfield
  size?: Vector3;          // For heightfield
}

/**
 * Create a box shape
 */
export function createBoxShape(width: number, height: number, depth: number): PhysicsShape {
  return {
    type: 'box',
    dimensions: new Vector3(width, height, depth),
  };
}

/**
 * Create a sphere shape
 */
export function createSphereShape(radius: number): PhysicsShape {
  return {
    type: 'sphere',
    radius,
  };
}

/**
 * Create a capsule shape
 */
export function createCapsuleShape(radius: number, height: number): PhysicsShape {
  return {
    type: 'capsule',
    radius,
    height,
  };
}

/**
 * Create a cylinder shape
 */
export function createCylinderShape(radius: number, height: number): PhysicsShape {
  return {
    type: 'cylinder',
    radius,
    height,
  };
}

/**
 * Create a convex hull from vertices
 */
export function createConvexHullShape(vertices: Float32Array): PhysicsShape {
  return {
    type: 'convexHull',
    vertices,
  };
}

/**
 * Create a trimesh shape
 */
export function createTrimeshShape(vertices: Float32Array, indices: Uint32Array): PhysicsShape {
  return {
    type: 'trimesh',
    vertices,
    indices,
  };
}

/**
 * Convert Three.js mesh/geometry to physics shape.
 *
 * If useConvexHull is true (default), creates a convex hull approximation.
 * Otherwise, creates a trimesh shape for detailed collision.
 */
export function meshToPhysicsShape(
  geometry: any,
  useConvexHull: boolean = true
): PhysicsShape {
  // Extract vertices from geometry
  const positions = geometry.attributes.position.array;
  const vertices = new Float32Array(positions.length);

  for (let i = 0; i < positions.length; i++) {
    vertices[i] = positions[i];
  }

  if (useConvexHull) {
    return createConvexHullShape(vertices);
  } else {
    const indices = geometry.index?.array || new Uint32Array(positions.length / 3);
    return createTrimeshShape(vertices, indices);
  }
}

// ============================================================================
// PhysicsWorld
// ============================================================================

export interface PhysicsWorldConfig {
  gravity?: Vector3;
  fixedTimestep?: number;
  maxSubSteps?: number;
  velocityIterations?: number;
  positionIterations?: number;
  enableCCD?: boolean;
  useManifolds?: boolean;
}

export interface CollisionEvent {
  bodyA: RigidBody;
  bodyB: RigidBody;
  contacts: ContactPoint[];
  combinedFriction: number;
  combinedRestitution: number;
}

export class PhysicsWorld {
  // Bodies and colliders
  private bodies: Map<string, RigidBody> = new Map();
  private colliders: Map<string, Collider> = new Map();
  private joints: Map<string, Joint> = new Map();

  // Collision pipeline
  private broadPhase: BroadPhase;
  private narrowPhase: NarrowPhase;

  // Continuous Collision Detection
  private ccd: ContinuousCollisionDetector;
  public enableCCD: boolean;

  // Configuration
  public gravity: Vector3;
  public fixedTimestep: number;
  public maxSubSteps: number;
  public velocityIterations: number;
  public positionIterations: number;

  // Accumulator for fixed timestep
  private accumulator: number = 0;

  // Callbacks
  public onCollision?: (event: CollisionEvent) => void;

  constructor(config: PhysicsWorldConfig = {}) {
    this.gravity = config.gravity ?? new Vector3(0, -9.81, 0);
    this.fixedTimestep = config.fixedTimestep ?? 1 / 60;
    this.maxSubSteps = config.maxSubSteps ?? 4;
    this.velocityIterations = config.velocityIterations ?? 8;
    this.positionIterations = config.positionIterations ?? 3;
    this.enableCCD = config.enableCCD ?? true;

    this.broadPhase = new BroadPhase();
    this.narrowPhase = new NarrowPhase();
    this.narrowPhase.useManifolds = config.useManifolds ?? true;

    this.ccd = new ContinuousCollisionDetector();
  }

  /**
   * Add a rigid body to the world
   */
  addBody(config: RigidBodyConfig): RigidBody {
    const body = new RigidBody(config);
    this.bodies.set(body.id, body);
    return body;
  }

  /**
   * Remove a rigid body from the world
   */
  removeBody(bodyId: string): void {
    // Read colliderId BEFORE deleting from the map
    const body = this.bodies.get(bodyId);
    const colliderId = body?.colliderId;
    this.bodies.delete(bodyId);
    // Remove associated collider
    if (colliderId) {
      this.colliders.delete(colliderId);
    }
  }

  /**
   * Get a body by ID
   */
  getBody(bodyId: string): RigidBody | undefined {
    return this.bodies.get(bodyId);
  }

  /**
   * Add a collider to the world and attach it to a body
   */
  addCollider(config: ColliderConfig, bodyId: string): Collider {
    const collider = new Collider(config);
    collider.bodyId = bodyId;
    this.colliders.set(collider.id, collider);

    // Link collider to body
    const body = this.bodies.get(bodyId);
    if (body) {
      body.colliderId = collider.id;
    }

    return collider;
  }

  /**
   * Remove a collider
   */
  removeCollider(colliderId: string): void {
    const collider = this.colliders.get(colliderId);
    if (collider?.bodyId) {
      const body = this.bodies.get(collider.bodyId);
      if (body) body.colliderId = null;
    }
    this.colliders.delete(colliderId);
  }

  /**
   * Add a joint
   */
  addJoint(config: JointConfig): Joint {
    const joint = new Joint(config);
    this.joints.set(joint.id, joint);
    return joint;
  }

  /**
   * Remove a joint
   */
  removeJoint(jointId: string): void {
    this.joints.delete(jointId);
  }

  /**
   * Step the simulation forward by dt
   * Uses fixed timestep with accumulator pattern
   */
  step(dt: number): void {
    // Clamp dt to avoid spiral of death
    dt = Math.min(dt, this.fixedTimestep * this.maxSubSteps);
    this.accumulator += dt;

    let subSteps = 0;
    while (this.accumulator >= this.fixedTimestep && subSteps < this.maxSubSteps) {
      this.fixedStep(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      subSteps++;
    }
  }

  /**
   * Perform a single fixed-timestep physics step
   */
  private fixedStep(dt: number): void {
    // 1. Integrate velocities and positions (semi-implicit Euler)
    for (const body of this.bodies.values()) {
      body.integrate(dt, this.gravity);
    }

    // 2. Update collider AABBs
    for (const collider of this.colliders.values()) {
      const body = collider.bodyId ? this.bodies.get(collider.bodyId) : null;
      if (body) {
        collider.updateAABB(body.position, body.getTransform());
      }
    }

    // 3. Broad phase - find potentially colliding pairs
    const colliderList = Array.from(this.colliders.values());
    this.broadPhase.update(colliderList);
    const broadPairs = this.broadPhase.findPairs();

    // 4. Narrow phase - find actual contacts (with manifold persistence)
    const collisionPairs = this.narrowPhase.useManifolds
      ? this.narrowPhase.detectWithManifolds(broadPairs, this.bodies)
      : this.narrowPhase.detect(broadPairs);

    // 5. Resolve collisions
    this.resolveCollisions(collisionPairs, dt);

    // 6. Solve joints
    this.solveJoints(dt);

    // 7. Continuous Collision Detection for fast-moving bodies
    if (this.enableCCD) {
      this.runCCD(dt);
    }
  }

  /**
   * Run CCD for fast-moving bodies
   */
  private runCCD(dt: number): void {
    const ccdEvents = this.ccd.detect(this.bodies, this.colliders, dt);

    // Process CCD events in order of increasing TOI
    for (const event of ccdEvents) {
      this.ccd.applyCCDResponse(event, dt);
    }
  }

  /**
   * Resolve all collision pairs
   */
  private resolveCollisions(pairs: CollisionPair[], dt: number): void {
    for (const pair of pairs) {
      const bodyA = pair.colliderA.bodyId ? this.bodies.get(pair.colliderA.bodyId) : null;
      const bodyB = pair.colliderB.bodyId ? this.bodies.get(pair.colliderB.bodyId) : null;

      if (!bodyA || !bodyB) continue;

      // Skip if both are static or sleeping
      if (bodyA.bodyType === 'static' && bodyB.bodyType === 'static') continue;
      if (!bodyA.awake && !bodyB.awake) continue;

      // Skip triggers
      if (pair.colliderA.isTrigger || pair.colliderB.isTrigger) {
        // Fire callback but no physical response
        this.fireCollisionEvent(bodyA, bodyB, pair.contacts, pair.colliderA, pair.colliderB);
        continue;
      }

      for (const contact of pair.contacts) {
        this.resolveContact(bodyA, bodyB, contact, pair.colliderA, pair.colliderB);
      }

      // Fire collision callback
      this.fireCollisionEvent(bodyA, bodyB, pair.contacts, pair.colliderA, pair.colliderB);

      // Wake both bodies
      bodyA.wake();
      bodyB.wake();
    }
  }

  /**
   * Resolve a single contact between two bodies.
   * Uses the full 3x3 inertia tensor for rotational response.
   */
  private resolveContact(
    bodyA: RigidBody, bodyB: RigidBody,
    contact: ContactPoint,
    colliderA: Collider, colliderB: Collider
  ): void {
    // Compute relative velocity at contact point
    const velA = bodyA.getVelocityAtPoint(contact.point);
    const velB = bodyB.getVelocityAtPoint(contact.point);
    const relVel = new Vector3().subVectors(velB, velA);
    const velAlongNormal = relVel.dot(contact.normal);

    // Only resolve if bodies are moving towards each other
    if (velAlongNormal > 0) return;

    // Get combined material properties
    const friction = combineFriction(
      { friction: colliderA.friction, restitution: colliderA.restitution, density: 1 },
      { friction: colliderB.friction, restitution: colliderB.restitution, density: 1 }
    );
    const restitution = combineRestitution(
      { friction: 1, restitution: colliderA.restitution, density: 1 },
      { friction: 1, restitution: colliderB.restitution, density: 1 }
    );

    // Compute effective inverse mass along the normal using 3x3 inertia tensor
    const invMassA = bodyA.bodyType === 'static' ? 0 : bodyA.inverseMass;
    const invMassB = bodyB.bodyType === 'static' ? 0 : bodyB.inverseMass;

    const effectiveInvMassA = bodyA.bodyType === 'static' ? 0 :
      bodyA.getEffectiveInverseMass(contact.point, contact.normal);
    const effectiveInvMassB = bodyB.bodyType === 'static' ? 0 :
      bodyB.getEffectiveInverseMass(contact.point, contact.normal);

    // Compute impulse magnitude
    let impulseScalar = -(1 + restitution) * velAlongNormal;
    impulseScalar /= (effectiveInvMassA + effectiveInvMassB);

    // Apply normal impulse
    const impulse = contact.normal.clone().multiplyScalar(impulseScalar);

    if (bodyA.bodyType !== 'static') {
      bodyA.applyImpulseAtPoint(impulse.clone().negate(), contact.point);
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.applyImpulseAtPoint(impulse.clone(), contact.point);
    }

    // Friction impulse (using tangential velocity)
    const tangent = relVel.clone().sub(contact.normal.clone().multiplyScalar(velAlongNormal));
    const tangentLen = tangent.length();
    if (tangentLen > 1e-6) {
      tangent.normalize();

      // Compute effective inverse mass along tangent
      const tangentEffectiveInvMassA = bodyA.bodyType === 'static' ? 0 :
        bodyA.getEffectiveInverseMass(contact.point, tangent);
      const tangentEffectiveInvMassB = bodyB.bodyType === 'static' ? 0 :
        bodyB.getEffectiveInverseMass(contact.point, tangent);

      const frictionImpulseScalar = Math.min(
        Math.abs(impulseScalar) * friction,
        tangentLen / (tangentEffectiveInvMassA + tangentEffectiveInvMassB)
      );
      const frictionVec = tangent.clone().multiplyScalar(-frictionImpulseScalar);

      if (bodyA.bodyType !== 'static') {
        bodyA.applyImpulseAtPoint(frictionVec.clone().negate(), contact.point);
      }
      if (bodyB.bodyType !== 'static') {
        bodyB.applyImpulseAtPoint(frictionVec.clone(), contact.point);
      }
    }

    // Positional correction (Baumgarte stabilization)
    const slop = 0.005;
    const percent = 0.4;
    const correction = contact.normal.clone().multiplyScalar(
      Math.max(contact.depth - slop, 0) / (invMassA + invMassB) * percent
    );
    if (bodyA.bodyType !== 'static') {
      bodyA.position.sub(correction.clone().multiplyScalar(invMassA));
    }
    if (bodyB.bodyType !== 'static') {
      bodyB.position.add(correction.clone().multiplyScalar(invMassB));
    }
  }

  /**
   * Solve all joint constraints
   */
  private solveJoints(dt: number): void {
    const brokenJoints: string[] = [];

    for (const [id, joint] of this.joints) {
      const bodyA = this.bodies.get(joint.bodyAId);
      const bodyB = this.bodies.get(joint.bodyBId);

      if (!bodyA || !bodyB) {
        brokenJoints.push(id);
        continue;
      }

      const broken = joint.solve(bodyA, bodyB, dt);
      if (broken) {
        brokenJoints.push(id);
      }
    }

    // Remove broken joints
    for (const id of brokenJoints) {
      this.joints.delete(id);
    }
  }

  /**
   * Fire collision event callback
   */
  private fireCollisionEvent(
    bodyA: RigidBody, bodyB: RigidBody,
    contacts: ContactPoint[],
    colliderA: Collider, colliderB: Collider
  ): void {
    if (this.onCollision) {
      this.onCollision({
        bodyA,
        bodyB,
        contacts,
        combinedFriction: combineFriction(
          { friction: colliderA.friction, restitution: 0, density: 0 },
          { friction: colliderB.friction, restitution: 0, density: 0 }
        ),
        combinedRestitution: combineRestitution(
          { friction: 0, restitution: colliderA.restitution, density: 0 },
          { friction: 0, restitution: colliderB.restitution, density: 0 }
        ),
      });
    }
  }

  /**
   * Get all bodies
   */
  getBodies(): RigidBody[] {
    return Array.from(this.bodies.values());
  }

  /**
   * Get all colliders
   */
  getColliders(): Collider[] {
    return Array.from(this.colliders.values());
  }

  /**
   * Get all joints
   */
  getJoints(): Joint[] {
    return Array.from(this.joints.values());
  }

  /**
   * Set gravity
   */
  setGravity(gravity: Vector3): void {
    this.gravity.copy(gravity);
  }

  /**
   * Raycast - find the closest body hit by a ray
   */
  raycast(origin: Vector3, direction: Vector3, maxDistance: number = Infinity): { body: RigidBody; point: Vector3; distance: number } | null {
    let closest: { body: RigidBody; point: Vector3; distance: number } | null = null;

    for (const collider of this.colliders.values()) {
      const body = collider.bodyId ? this.bodies.get(collider.bodyId) : null;
      if (!body) continue;

      const center = collider.aabbMin.clone().add(collider.aabbMax).multiplyScalar(0.5);
      const toCenter = new Vector3().subVectors(center, origin);
      const proj = toCenter.dot(direction);

      if (proj < 0) continue; // Behind the ray
      if (proj > maxDistance) continue;

      const closestPoint = origin.clone().add(direction.clone().multiplyScalar(proj));
      const distToCenter = closestPoint.distanceTo(center);

      let hitRadius: number;
      switch (collider.shape) {
        case 'sphere': hitRadius = collider.radius; break;
        case 'box': hitRadius = collider.halfExtents.length(); break;
        case 'cylinder': hitRadius = Math.max(collider.radius, collider.height / 2); break;
        default: hitRadius = 0.5;
      }

      if (distToCenter <= hitRadius) {
        const distance = proj - Math.sqrt(Math.max(0, hitRadius * hitRadius - distToCenter * distToCenter));
        if (distance < (closest?.distance ?? Infinity)) {
          const point = origin.clone().add(direction.clone().multiplyScalar(distance));
          closest = { body, point, distance };
        }
      }
    }

    return closest;
  }

  /**
   * Clear the entire physics world
   */
  clear(): void {
    this.bodies.clear();
    this.colliders.clear();
    this.joints.clear();
    this.accumulator = 0;
  }
}

export default PhysicsWorld;
