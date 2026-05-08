/**
 * RigidBody - Physics rigid body with position, rotation, velocity,
 * force accumulation, semi-implicit Euler integration, and full 3x3 inertia tensor
 */
import { Vector3, Quaternion, Matrix3, Matrix4 } from 'three';

export type BodyType = 'static' | 'dynamic' | 'kinematic';

export interface RigidBodyConfig {
  id: string;
  bodyType: BodyType;
  position?: Vector3;
  rotation?: Quaternion;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  ccdEnabled?: boolean;
  /** Velocity threshold above which CCD is activated (default 1.0). Only used when ccdEnabled is true. */
  ccdMotionThreshold?: number;
  sleepThreshold?: number;
  /** Override local-space inertia tensor (3x3). If not provided, computed from mass+shape. */
  inertiaTensor?: Matrix3;
}

// ============================================================================
// Inertia Tensor Computation Helpers
// ============================================================================

/**
 * Compute the local-space inertia tensor for a solid box.
 * Ixx = m/12*(y²+z²), Iyy = m/12*(x²+z²), Izz = m/12*(x²+y²)
 */
export function boxInertiaTensor(mass: number, width: number, height: number, depth: number): Matrix3 {
  const m = mass;
  const x = width, y = height, z = depth;
  const Ixx = m / 12 * (y * y + z * z);
  const Iyy = m / 12 * (x * x + z * z);
  const Izz = m / 12 * (x * x + y * y);
  return new Matrix3().set(
    Ixx, 0, 0,
    0, Iyy, 0,
    0, 0, Izz
  );
}

/**
 * Compute the local-space inertia tensor for a solid sphere.
 * Ixx = Iyy = Izz = 2/5*m*r²
 */
export function sphereInertiaTensor(mass: number, radius: number): Matrix3 {
  const I = 0.4 * mass * radius * radius; // 2/5 * m * r^2
  return new Matrix3().set(
    I, 0, 0,
    0, I, 0,
    0, 0, I
  );
}

/**
 * Compute the local-space inertia tensor for a solid cylinder (Y-axis aligned).
 * Ixx = Izz = m/12*(3r²+h²), Iyy = m/2*r²
 */
export function cylinderInertiaTensor(mass: number, radius: number, height: number): Matrix3 {
  const m = mass;
  const r = radius;
  const h = height;
  const Ixx = m / 12 * (3 * r * r + h * h);
  const Iyy = m / 2 * r * r;
  const Izz = Ixx;
  return new Matrix3().set(
    Ixx, 0, 0,
    0, Iyy, 0,
    0, 0, Izz
  );
}

/**
 * Compute the local-space inertia tensor for a capsule (Y-axis aligned).
 * Approximate: cylinder + hemisphere contributions at each end.
 */
export function capsuleInertiaTensor(mass: number, radius: number, height: number): Matrix3 {
  const m = mass;
  const r = radius;
  const h = height; // cylinder portion height
  const hemiMass = m * (2 * (2 / 3) * Math.PI * r * r * r) /
    (Math.PI * r * r * h + 2 * (2 / 3) * Math.PI * r * r * r);
  const cylMass = m - 2 * hemiMass;

  // Cylinder part
  const cylIxx = cylMass / 12 * (3 * r * r + h * h);
  const cylIyy = cylMass / 2 * r * r;

  // Hemisphere part (each): Ixx_hemi = 2/5 * hemiMass * r^2 - offset by half-cylinder height
  const hemiIxx = 2 / 5 * hemiMass * r * r;
  const hemiIyy = 2 / 5 * hemiMass * r * r;
  // Parallel axis theorem for hemispheres offset by h/2
  const offset = h / 2;
  const totalIxx = cylIxx + 2 * (hemiIxx + hemiMass * offset * offset);
  const totalIyy = cylIyy + 2 * hemiIyy;
  const totalIzz = totalIxx;

  return new Matrix3().set(
    totalIxx, 0, 0,
    0, totalIyy, 0,
    0, 0, totalIzz
  );
}

/**
 * Compute a diagonal inertia tensor from individual axis values
 */
export function diagonalInertiaTensor(Ixx: number, Iyy: number, Izz: number): Matrix3 {
  return new Matrix3().set(
    Ixx, 0, 0,
    0, Iyy, 0,
    0, 0, Izz
  );
}

// ============================================================================
// Matrix3 utility functions
// ============================================================================

/**
 * Invert a 3x3 matrix. Returns null if singular.
 */
export function invertMatrix3(m: Matrix3): Matrix3 | null {
  const te = m.elements;
  const a11 = te[0], a12 = te[3], a13 = te[6];
  const a21 = te[1], a22 = te[4], a23 = te[7];
  const a31 = te[2], a32 = te[5], a33 = te[8];

  const det =
    a11 * (a22 * a33 - a23 * a32) -
    a12 * (a21 * a33 - a23 * a31) +
    a13 * (a21 * a32 - a22 * a31);

  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1.0 / det;

  return new Matrix3().set(
    (a22 * a33 - a23 * a32) * invDet, (a13 * a32 - a12 * a33) * invDet, (a12 * a23 - a13 * a22) * invDet,
    (a23 * a31 - a21 * a33) * invDet, (a11 * a33 - a13 * a31) * invDet, (a13 * a21 - a11 * a23) * invDet,
    (a21 * a32 - a22 * a31) * invDet, (a12 * a31 - a11 * a32) * invDet, (a11 * a22 - a12 * a21) * invDet
  );
}

/**
 * Multiply Matrix3 * Vector3, returning a new Vector3.
 */
export function mulMatrix3Vector3(m: Matrix3, v: Vector3): Vector3 {
  const te = m.elements;
  return new Vector3(
    te[0] * v.x + te[3] * v.y + te[6] * v.z,
    te[1] * v.x + te[4] * v.y + te[7] * v.z,
    te[2] * v.x + te[5] * v.y + te[8] * v.z
  );
}

/**
 * Multiply transpose(Matrix3) * Vector3, returning a new Vector3.
 */
export function mulMatrix3TransposeVector3(m: Matrix3, v: Vector3): Vector3 {
  const te = m.elements;
  return new Vector3(
    te[0] * v.x + te[1] * v.y + te[2] * v.z,
    te[3] * v.x + te[4] * v.y + te[5] * v.z,
    te[6] * v.x + te[7] * v.y + te[8] * v.z
  );
}

/**
 * Compute R * M * R^T where R is a rotation (represented as a Matrix3 extracted from a Quaternion).
 * This transforms a local-space inertia tensor to world-space.
 */
export function rotateInertiaTensor(localInertia: Matrix3, rotation: Quaternion): Matrix3 {
  // Extract 3x3 rotation from quaternion
  const R = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromQuaternion(rotation));
  // result = R * localInertia * R^T
  const temp = R.clone().multiply(localInertia);
  const Rt = R.clone().transpose();
  return temp.multiply(Rt);
}

// ============================================================================
// RigidBody class
// ============================================================================

export class RigidBody {
  public id: string;
  public bodyType: BodyType;

  // State
  public position: Vector3;
  public rotation: Quaternion;
  public linearVelocity: Vector3;
  public angularVelocity: Vector3;

  // Forces (accumulated per frame, cleared after integration)
  public force: Vector3;
  public torque: Vector3;

  // Mass properties
  public mass: number;
  public inverseMass: number;

  // 3x3 Inertia tensor (local-space)
  public inertiaTensor: Matrix3;
  public inverseInertiaTensor: Matrix3;       // Local-space inverse
  public worldInverseInertiaTensor: Matrix3;   // World-space inverse (updated each frame)

  // Kept for backward compatibility — scalar approximation of the diagonal
  public inertia: number;
  public inverseInertia: number;

  // Properties
  public linearDamping: number;
  public angularDamping: number;
  public gravityScale: number;
  public ccdEnabled: boolean;
  /** Velocity threshold above which CCD is activated. Body uses CCD when ccdEnabled AND linearVelocity.length() > ccdMotionThreshold. */
  public ccdMotionThreshold: number;
  public sleepThreshold: number;

  // Sleeping
  public awake: boolean = true;
  public sleepTimer: number = 0;

  // Collider reference
  public colliderId: string | null = null;

  // User data
  public userData: Record<string, unknown> = {};

  constructor(config: RigidBodyConfig) {
    this.id = config.id;
    this.bodyType = config.bodyType;

    this.position = config.position?.clone() || new Vector3();
    this.rotation = config.rotation?.clone() || new Quaternion();
    this.linearVelocity = new Vector3();
    this.angularVelocity = new Vector3();
    this.force = new Vector3();
    this.torque = new Vector3();

    if (config.bodyType === 'static') {
      this.mass = 0;
      this.inverseMass = 0;
      this.inertiaTensor = new Matrix3();
      this.inverseInertiaTensor = new Matrix3();
      this.worldInverseInertiaTensor = new Matrix3();
      this.inertia = 0;
      this.inverseInertia = 0;
      this.awake = false;
    } else {
      this.mass = config.mass || 1.0;
      this.inverseMass = 1.0 / this.mass;

      if (config.inertiaTensor) {
        this.inertiaTensor = config.inertiaTensor.clone();
      } else {
        // Default: sphere with r=1
        this.inertiaTensor = sphereInertiaTensor(this.mass, 1.0);
      }

      const invTensor = invertMatrix3(this.inertiaTensor);
      this.inverseInertiaTensor = invTensor || new Matrix3();
      this.worldInverseInertiaTensor = new Matrix3();

      // Backward-compatible scalar approximation
      const te = this.inertiaTensor.elements;
      this.inertia = (te[0] + te[4] + te[8]) / 3;
      this.inverseInertia = this.inertia > 0 ? 1.0 / this.inertia : 0;

      this.updateInertiaWorld();
    }

    this.linearDamping = config.linearDamping ?? 0.05;
    this.angularDamping = config.angularDamping ?? 0.05;
    this.gravityScale = config.gravityScale ?? 1.0;
    this.ccdEnabled = config.ccdEnabled ?? false;
    this.ccdMotionThreshold = config.ccdMotionThreshold ?? 1.0;
    this.sleepThreshold = config.sleepThreshold ?? 0.01;
  }

  /**
   * Set the local-space inertia tensor and recompute inverses.
   */
  setInertiaTensor(tensor: Matrix3): void {
    this.inertiaTensor = tensor.clone();
    const invTensor = invertMatrix3(this.inertiaTensor);
    this.inverseInertiaTensor = invTensor || new Matrix3();
    // Update scalar approximation
    const te = this.inertiaTensor.elements;
    this.inertia = (te[0] + te[4] + te[8]) / 3;
    this.inverseInertia = this.inertia > 0 ? 1.0 / this.inertia : 0;
    this.updateInertiaWorld();
  }

  /**
   * Recompute worldInverseInertiaTensor from current body rotation.
   * Must be called after rotation changes.
   */
  updateInertiaWorld(): void {
    if (this.bodyType === 'static') {
      this.worldInverseInertiaTensor = new Matrix3();
      return;
    }
    // worldInvInertia = R * localInvInertia * R^T
    this.worldInverseInertiaTensor = rotateInertiaTensor(this.inverseInertiaTensor, this.rotation);
  }

  /**
   * Apply a force at center of mass
   */
  applyForce(force: Vector3): void {
    if (this.bodyType === 'static') return;
    this.force.add(force);
    this.wake();
  }

  /**
   * Apply a force at a specific world point (generates torque)
   */
  applyForceAtPoint(force: Vector3, point: Vector3): void {
    if (this.bodyType === 'static') return;
    this.force.add(force);
    const leverArm = new Vector3().subVectors(point, this.position);
    const torque = new Vector3().crossVectors(leverArm, force);
    this.torque.add(torque);
    this.wake();
  }

  /**
   * Apply an impulse (instantaneous velocity change)
   */
  applyImpulse(impulse: Vector3): void {
    if (this.bodyType === 'static') return;
    this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
    this.wake();
  }

  /**
   * Apply an impulse at a specific world point.
   * Uses worldInverseInertiaTensor for proper angular response.
   */
  applyImpulseAtPoint(impulse: Vector3, point: Vector3): void {
    if (this.bodyType === 'static') return;
    // Linear impulse
    this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));

    // Angular impulse: Δω = I_world^-1 * (r × J)
    const leverArm = new Vector3().subVectors(point, this.position);
    const angularImpulse = new Vector3().crossVectors(leverArm, impulse);
    const deltaOmega = mulMatrix3Vector3(this.worldInverseInertiaTensor, angularImpulse);
    this.angularVelocity.add(deltaOmega);
    this.wake();
  }

  /**
   * Apply torque
   */
  applyTorque(torque: Vector3): void {
    if (this.bodyType === 'static') return;
    this.torque.add(torque);
    this.wake();
  }

  /**
   * Semi-implicit Euler integration step.
   * Uses 3x3 inertia tensor for angular integration.
   */
  integrate(dt: number, gravity: Vector3): void {
    if (!this.awake || this.bodyType === 'static') return;

    // Apply gravity
    const gravityForce = gravity.clone().multiplyScalar(this.mass * this.gravityScale);
    this.force.add(gravityForce);

    // Semi-implicit Euler: update velocity first, then position
    // Linear
    const linearAcceleration = this.force.clone().multiplyScalar(this.inverseMass);
    this.linearVelocity.add(linearAcceleration.multiplyScalar(dt));
    this.linearVelocity.multiplyScalar(1.0 - this.linearDamping * dt);

    // Angular: α = I_world^-1 * τ
    const angularAcceleration = mulMatrix3Vector3(this.worldInverseInertiaTensor, this.torque);
    this.angularVelocity.add(angularAcceleration.multiplyScalar(dt));
    this.angularVelocity.multiplyScalar(1.0 - this.angularDamping * dt);

    // Update position using new velocity (semi-implicit)
    this.position.add(this.linearVelocity.clone().multiplyScalar(dt));

    // Update rotation using new angular velocity
    if (this.angularVelocity.lengthSq() > 1e-8) {
      const angle = this.angularVelocity.length() * dt;
      const axis = this.angularVelocity.clone().normalize();
      const deltaQuat = new Quaternion().setFromAxisAngle(axis, angle);
      this.rotation.multiply(deltaQuat);
      this.rotation.normalize();
    }

    // Update world-space inverse inertia tensor for the new rotation
    this.updateInertiaWorld();

    // Clear accumulated forces
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);

    // Sleep check
    this.checkSleep(dt);
  }

  /**
   * Check if body should go to sleep
   */
  private checkSleep(dt: number): void {
    const energy = this.linearVelocity.lengthSq() + this.angularVelocity.lengthSq();
    if (energy < this.sleepThreshold) {
      this.sleepTimer += dt;
      if (this.sleepTimer > 1.0) {
        this.awake = false;
        this.linearVelocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
      }
    } else {
      this.sleepTimer = 0;
    }
  }

  /**
   * Wake the body up
   */
  wake(): void {
    this.awake = true;
    this.sleepTimer = 0;
  }

  /**
   * Get the transformation matrix
   */
  getTransform(): Matrix4 {
    return new Matrix4().compose(this.position, this.rotation, new Vector3(1, 1, 1));
  }

  /**
   * Get world-space velocity at a point
   */
  getVelocityAtPoint(point: Vector3): Vector3 {
    const r = new Vector3().subVectors(point, this.position);
    return this.linearVelocity.clone().add(new Vector3().crossVectors(this.angularVelocity, r));
  }

  /**
   * Compute the effective inverse mass for an impulse at a point along a normal.
   * Used by collision response: 1/m + n·(I^-1 * (r × n)) × r
   */
  getEffectiveInverseMass(point: Vector3, normal: Vector3): number {
    if (this.bodyType === 'static') return 0;
    const r = new Vector3().subVectors(point, this.position);
    const rn = new Vector3().crossVectors(r, normal);
    const invInertiaRn = mulMatrix3Vector3(this.worldInverseInertiaTensor, rn);
    const rnCrossN = new Vector3().crossVectors(invInertiaRn, r);
    return this.inverseMass + normal.dot(rnCrossN);
  }

  /**
   * Set position directly (for kinematic bodies)
   */
  setPosition(pos: Vector3): void {
    this.position.copy(pos);
  }

  /**
   * Set rotation directly (for kinematic bodies)
   */
  setRotation(rot: Quaternion): void {
    this.rotation.copy(rot);
    this.updateInertiaWorld();
  }

  /**
   * Set linear velocity
   */
  setLinearVelocity(vel: Vector3): void {
    this.linearVelocity.copy(vel);
    this.wake();
  }

  /**
   * Set angular velocity
   */
  setAngularVelocity(vel: Vector3): void {
    this.angularVelocity.copy(vel);
    this.wake();
  }
}

export default RigidBody;
