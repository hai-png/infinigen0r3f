/**
 * USDPhysicsSchema.ts
 *
 * USD Physics Schema extensions for the infinigen-r3f project.
 * Implements the NVIDIA/Pixar USD Physics specification for rigid body
 * dynamics, collision shapes, joint definitions, mass properties, and
 * scene-level physics configuration.
 *
 * This module provides:
 * - RigidBodyAPI: mass, density, velocities, centerOfMass, kinematic state
 * - CollisionAPI: shape types, collision groups, filtering, transforms
 * - JointAPI: Fixed, Revolute, Prismatic, Spherical, D6 joints
 * - MassAPI: inertia tensor computation from geometry
 * - PhysicsSceneAPI: gravity, time step, solver configuration
 * - USDPhysicsWriter: produces valid USDA ASCII output
 *
 * Reference: https://openusd.org/release/wp_rigidbody.html
 *
 * Ported from: infinigen/core/physics/usd_physics_schema.py
 */

import { Vector3, Quaternion, Matrix3 } from 'three';
import { SeededRandom } from '../core/util/MathUtils';
import {
  boxInertiaTensor,
  sphereInertiaTensor,
  cylinderInertiaTensor,
  capsuleInertiaTensor,
} from './physics/RigidBody';

// ============================================================================
// USD Physics Type Definitions
// ============================================================================

/**
 * Supported USD collision shape types.
 * Each maps to a corresponding USD prim type.
 */
export type USDCollisionShape =
  | 'Box'
  | 'Sphere'
  | 'Capsule'
  | 'Cylinder'
  | 'Cone'
  | 'ConvexHull'
  | 'Mesh';

/**
 * Supported USD joint types with their degrees of freedom.
 */
export type USDJointType =
  | 'Fixed'
  | 'Revolute'
  | 'Prismatic'
  | 'Spherical'
  | 'D6';

/**
 * D6 joint degree-of-freedom axis identifier.
 */
export type D6Axis = 'transX' | 'transY' | 'transZ' | 'rotX' | 'rotY' | 'rotZ';

/**
 * D6 joint DOF configuration for a single axis.
 */
export interface D6DOFConfig {
  /** Whether this axis is free, limited, or locked */
  mode: 'free' | 'limited' | 'locked';
  /** Lower limit (only used when mode is 'limited') */
  lowerLimit?: number;
  /** Upper limit (only used when mode is 'limited') */
  upperLimit?: number;
  /** Spring stiffness */
  stiffness?: number;
  /** Damping coefficient */
  damping?: number;
}

// ============================================================================
// RigidBodyAPI
// ============================================================================

/**
 * USD Physics RigidBodyAPI properties.
 * Applied to a prim via `prepend apiSchemas = ["RigidBodyAPI"]`.
 */
export interface USDRigidBodyAPI {
  /** Mass in kg */
  mass: number;
  /** Density in kg/m³ (alternative to explicit mass) */
  density?: number;
  /** Initial linear velocity vector (m/s) */
  linearVelocity: Vector3;
  /** Initial angular velocity vector (rad/s) */
  angularVelocity: Vector3;
  /** Center of mass offset from prim origin */
  centerOfMass: Vector3;
  /** Orientation of inertia tensor principal axes (quaternion) */
  principalAxes: Quaternion;
  /** Diagonal of inertia tensor (kg·m²) */
  inertialDiagonal: Vector3;
  /** Whether gravity applies to this body */
  enableGravity: boolean;
  /** Kinematic bodies are driven by animation; dynamic by forces */
  kinematic: boolean;
  /** Whether body starts in a sleeping state */
  startsAsleep: boolean;
}

/**
 * Create a default USDRigidBodyAPI with sensible initial values.
 */
export function createDefaultRigidBodyAPI(
  rng?: SeededRandom,
  mass: number = 1.0,
): USDRigidBodyAPI {
  const r = rng ?? new SeededRandom(42);
  return {
    mass,
    density: 1000.0,
    linearVelocity: new Vector3(0, 0, 0),
    angularVelocity: new Vector3(0, 0, 0),
    centerOfMass: new Vector3(0, 0, 0),
    principalAxes: new Quaternion(0, 0, 0, 1),
    inertialDiagonal: new Vector3(1, 1, 1),
    enableGravity: true,
    kinematic: false,
    startsAsleep: false,
  };
}

// ============================================================================
// CollisionAPI
// ============================================================================

/**
 * USD collision shape geometry parameters.
 * Each shape type has its own set of parameters.
 */
export interface USDCollisionGeometry {
  /** Shape type */
  shape: USDCollisionShape;
  /** Half-extents for Box */
  halfExtents?: Vector3;
  /** Radius for Sphere, Capsule, Cylinder, Cone */
  radius?: number;
  /** Height for Capsule, Cylinder, Cone */
  height?: number;
  /** Scale transform applied to the collision shape */
  scale?: Vector3;
  /** Local offset from body origin */
  offset?: Vector3;
  /** Local rotation of collision shape (quaternion) */
  rotation?: Quaternion;
  /** Approximate mesh collision via convex decomposition */
  approximate?: 'convexDecomposition' | 'convexHull' | 'none';
}

/**
 * USD CollisionGroup definition for filtering collisions.
 */
export interface USDCollisionGroup {
  /** Unique name for this collision group */
  name: string;
  /** Bitmask for group membership */
  bitmask: number;
  /** Names of groups this group can collide with (empty = collide with all) */
  collideWith: string[];
}

/**
 * USD Physics CollisionAPI properties.
 * Applied via `prepend apiSchemas = ["CollisionAPI"]`.
 */
export interface USDCollisionAPI {
  /** Collision geometry definitions (multiple shapes per body allowed) */
  shapes: USDCollisionGeometry[];
  /** Collision group memberships */
  collisionGroups: string[];
  /** Collision margin for shapes */
  collisionMargin: number;
  /** Contact offset (distance at which contacts are generated) */
  contactOffset: number;
  /** Rest offset (offset between shapes at rest) */
  restOffset: number;
}

/**
 * Create a default USDCollisionAPI.
 */
export function createDefaultCollisionAPI(
  shape: USDCollisionShape = 'Box',
  halfExtents?: Vector3,
): USDCollisionAPI {
  const geo: USDCollisionGeometry = {
    shape,
    halfExtents: halfExtents ?? new Vector3(0.5, 0.5, 0.5),
    scale: new Vector3(1, 1, 1),
    offset: new Vector3(0, 0, 0),
    rotation: new Quaternion(0, 0, 0, 1),
    approximate: 'none',
  };
  return {
    shapes: [geo],
    collisionGroups: ['default'],
    collisionMargin: 0.01,
    contactOffset: 0.02,
    restOffset: 0.0,
  };
}

// ============================================================================
// JointAPI
// ============================================================================

/**
 * Base joint properties shared by all USD joint types.
 */
export interface USDJointBase {
  /** Unique name for this joint */
  name: string;
  /** USD path reference to body0 */
  body0: string;
  /** USD path reference to body1 */
  body1: string;
  /** Local position on body0 */
  localPos0: Vector3;
  /** Local rotation on body0 (quaternion: w, x, y, z stored as float4) */
  localRot0: Quaternion;
  /** Local position on body1 */
  localPos1: Vector3;
  /** Local rotation on body1 */
  localRot1: Quaternion;
  /** Force at which the joint breaks (0 = unbreakable) */
  breakForce: number;
  /** Torque at which the joint breaks (0 = unbreakable) */
  breakTorque: number;
}

/**
 * Fixed joint: zero degrees of freedom.
 */
export interface USDFixedJoint extends USDJointBase {
  type: 'Fixed';
}

/**
 * Revolute joint: one rotational DOF (hinge).
 */
export interface USDRevoluteJoint extends USDJointBase {
  type: 'Revolute';
  /** Joint axis in local space of body0 */
  axis: Vector3;
  /** Lower angular limit (radians) */
  lowerLimit: number;
  /** Upper angular limit (radians) */
  upperLimit: number;
  /** Spring stiffness */
  stiffness: number;
  /** Damping coefficient */
  damping: number;
}

/**
 * Prismatic joint: one translational DOF (slider).
 */
export interface USDPrismaticJoint extends USDJointBase {
  type: 'Prismatic';
  /** Joint axis in local space of body0 */
  axis: Vector3;
  /** Lower linear limit (meters) */
  lowerLimit: number;
  /** Upper linear limit (meters) */
  upperLimit: number;
  /** Spring stiffness */
  stiffness: number;
  /** Damping coefficient */
  damping: number;
}

/**
 * Spherical joint: three rotational DOF (ball-socket).
 */
export interface USDSphericalJoint extends USDJointBase {
  type: 'Spherical';
  /** Cone angle limit (radians, 0 = free rotation) */
  coneAngle0: number;
  /** Second cone angle limit */
  coneAngle1: number;
  /** Spring stiffness */
  stiffness: number;
  /** Damping coefficient */
  damping: number;
}

/**
 * D6 joint: six configurable degrees of freedom.
 */
export interface USDD6Joint extends USDJointBase {
  type: 'D6';
  /** Configuration for each of the 6 axes */
  axes: Partial<Record<D6Axis, D6DOFConfig>>;
}

/**
 * Union of all USD joint types.
 */
export type USDJoint =
  | USDFixedJoint
  | USDRevoluteJoint
  | USDPrismaticJoint
  | USDSphericalJoint
  | USDD6Joint;

/**
 * Create a default USDRevoluteJoint.
 */
export function createDefaultRevoluteJoint(
  name: string,
  body0: string,
  body1: string,
  rng?: SeededRandom,
): USDRevoluteJoint {
  const r = rng ?? new SeededRandom(42);
  return {
    type: 'Revolute',
    name,
    body0,
    body1,
    localPos0: new Vector3(0, 0.5, 0),
    localRot0: new Quaternion(0, 0, 0, 1),
    localPos1: new Vector3(0, -0.5, 0),
    localRot1: new Quaternion(0, 0, 0, 1),
    axis: new Vector3(0, 0, 1),
    lowerLimit: -Math.PI,
    upperLimit: Math.PI,
    stiffness: 0,
    damping: r.nextFloat(0.05, 0.2),
    breakForce: 0,
    breakTorque: 0,
  };
}

/**
 * Create a default USDPrismaticJoint.
 */
export function createDefaultPrismaticJoint(
  name: string,
  body0: string,
  body1: string,
  rng?: SeededRandom,
): USDPrismaticJoint {
  const r = rng ?? new SeededRandom(42);
  return {
    type: 'Prismatic',
    name,
    body0,
    body1,
    localPos0: new Vector3(0, 0.5, 0),
    localRot0: new Quaternion(0, 0, 0, 1),
    localPos1: new Vector3(0, -0.5, 0),
    localRot1: new Quaternion(0, 0, 0, 1),
    axis: new Vector3(0, 1, 0),
    lowerLimit: -1.0,
    upperLimit: 1.0,
    stiffness: 0,
    damping: r.nextFloat(0.05, 0.2),
    breakForce: 0,
    breakTorque: 0,
  };
}

/**
 * Create a default USDSphericalJoint.
 */
export function createDefaultSphericalJoint(
  name: string,
  body0: string,
  body1: string,
): USDSphericalJoint {
  return {
    type: 'Spherical',
    name,
    body0,
    body1,
    localPos0: new Vector3(0, 0.5, 0),
    localRot0: new Quaternion(0, 0, 0, 1),
    localPos1: new Vector3(0, -0.5, 0),
    localRot1: new Quaternion(0, 0, 0, 1),
    coneAngle0: Math.PI,
    coneAngle1: Math.PI,
    stiffness: 0,
    damping: 0.1,
    breakForce: 0,
    breakTorque: 0,
  };
}

/**
 * Create a default USDFixedJoint.
 */
export function createDefaultFixedJoint(
  name: string,
  body0: string,
  body1: string,
): USDFixedJoint {
  return {
    type: 'Fixed',
    name,
    body0,
    body1,
    localPos0: new Vector3(0, 0, 0),
    localRot0: new Quaternion(0, 0, 0, 1),
    localPos1: new Vector3(0, 0, 0),
    localRot1: new Quaternion(0, 0, 0, 1),
    breakForce: 0,
    breakTorque: 0,
  };
}

/**
 * Create a default USDD6Joint with all axes locked.
 */
export function createDefaultD6Joint(
  name: string,
  body0: string,
  body1: string,
): USDD6Joint {
  return {
    type: 'D6',
    name,
    body0,
    body1,
    localPos0: new Vector3(0, 0, 0),
    localRot0: new Quaternion(0, 0, 0, 1),
    localPos1: new Vector3(0, 0, 0),
    localRot1: new Quaternion(0, 0, 0, 1),
    axes: {
      transX: { mode: 'locked' },
      transY: { mode: 'locked' },
      transZ: { mode: 'locked' },
      rotX: { mode: 'locked' },
      rotY: { mode: 'locked' },
      rotZ: { mode: 'locked' },
    },
    breakForce: 0,
    breakTorque: 0,
  };
}

// ============================================================================
// MassAPI — Inertia Tensor Computation
// ============================================================================

/**
 * Mass and inertia properties for a single rigid body part.
 */
export interface USDMassProperties {
  /** Mass in kg */
  mass: number;
  /** Density in kg/m³ */
  density: number;
  /** Center of mass offset */
  centerOfMass: Vector3;
  /** Diagonal inertia tensor (Ixx, Iyy, Izz) */
  inertialDiagonal: Vector3;
  /** Orientation of principal axes */
  principalAxes: Quaternion;
}

/**
 * Compute inertia diagonal for a solid box.
 * Ixx = m/12*(y²+z²), Iyy = m/12*(x²+z²), Izz = m/12*(x²+y²)
 *
 * @param mass - Mass in kg
 * @param width - Full width along X
 * @param height - Full height along Y
 * @param depth - Full depth along Z
 */
export function computeBoxInertia(
  mass: number,
  width: number,
  height: number,
  depth: number,
): Vector3 {
  const tensor = boxInertiaTensor(mass, width, height, depth);
  return new Vector3(tensor.elements[0], tensor.elements[4], tensor.elements[8]);
}

/**
 * Compute inertia diagonal for a solid sphere.
 * Ixx = Iyy = Izz = 2/5 * m * r²
 *
 * @param mass - Mass in kg
 * @param radius - Sphere radius in meters
 */
export function computeSphereInertia(mass: number, radius: number): Vector3 {
  const tensor = sphereInertiaTensor(mass, radius);
  return new Vector3(tensor.elements[0], tensor.elements[4], tensor.elements[8]);
}

/**
 * Compute inertia diagonal for a solid cylinder (Y-axis aligned).
 * Ixx = Izz = m/12*(3r²+h²), Iyy = m/2*r²
 *
 * @param mass - Mass in kg
 * @param radius - Cylinder radius in meters
 * @param height - Cylinder height in meters
 */
export function computeCylinderInertia(
  mass: number,
  radius: number,
  height: number,
): Vector3 {
  const tensor = cylinderInertiaTensor(mass, radius, height);
  return new Vector3(tensor.elements[0], tensor.elements[4], tensor.elements[8]);
}

/**
 * Compute inertia diagonal for a capsule (Y-axis aligned).
 * Approximation: cylinder + hemisphere contributions at each end.
 *
 * @param mass - Mass in kg
 * @param radius - Capsule radius in meters
 * @param height - Cylinder portion height in meters
 */
export function computeCapsuleInertia(
  mass: number,
  radius: number,
  height: number,
): Vector3 {
  const tensor = capsuleInertiaTensor(mass, radius, height);
  return new Vector3(tensor.elements[0], tensor.elements[4], tensor.elements[8]);
}

/**
 * Compute inertia diagonal for a cone (Y-axis aligned).
 * Ixx = Izz = 3/80 * m * (4r² + h²), Iyy = 3/10 * m * r²
 *
 * @param mass - Mass in kg
 * @param radius - Base radius in meters
 * @param height - Cone height in meters
 */
export function computeConeInertia(
  mass: number,
  radius: number,
  height: number,
): Vector3 {
  const r = radius;
  const h = height;
  const Ixx = (3 / 80) * mass * (4 * r * r + h * h);
  const Iyy = (3 / 10) * mass * r * r;
  const Izz = Ixx;
  return new Vector3(Ixx, Iyy, Izz);
}

/**
 * Compute inertia for a convex hull using mesh-based integration.
 * Uses a simplified approximation based on the bounding box of the vertices,
 * then scales by a convex hull factor (0.8).
 *
 * A full implementation would use the actual triangle mesh surface integration
 * with the divergence theorem (Mirtich 1996).
 *
 * @param mass - Mass in kg
 * @param vertices - Array of vertex positions
 */
export function computeConvexHullInertia(
  mass: number,
  vertices: Vector3[],
): Vector3 {
  if (vertices.length === 0) {
    return new Vector3(1, 1, 1);
  }

  // Compute bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;

  // Convex hull inertia is approximately 0.8 of the bounding box inertia
  const factor = 0.8;
  return computeBoxInertia(mass, width, height, depth).multiplyScalar(factor);
}

/**
 * Compute compound body inertia by summing parts.
 * Uses the parallel axis theorem to shift each part's inertia to the
 * composite center of mass.
 *
 * @param parts - Array of mass properties for each sub-part
 */
export function computeCompoundInertia(parts: USDMassProperties[]): USDMassProperties {
  if (parts.length === 0) {
    return {
      mass: 0,
      density: 0,
      centerOfMass: new Vector3(),
      inertialDiagonal: new Vector3(),
      principalAxes: new Quaternion(),
    };
  }

  let totalMass = 0;
  const weightedCOM = new Vector3();

  for (const part of parts) {
    totalMass += part.mass;
    weightedCOM.add(part.centerOfMass.clone().multiplyScalar(part.mass));
  }

  if (totalMass > 0) {
    weightedCOM.divideScalar(totalMass);
  }

  // Sum inertias using parallel axis theorem
  let Ixx = 0, Iyy = 0, Izz = 0;

  for (const part of parts) {
    const d = part.centerOfMass.clone().sub(weightedCOM);
    const d2 = d.lengthSq();
    const m = part.mass;

    // Parallel axis theorem: I_total = I_local + m * d²
    Ixx += part.inertialDiagonal.x + m * (d.y * d.y + d.z * d.z);
    Iyy += part.inertialDiagonal.y + m * (d.x * d.x + d.z * d.z);
    Izz += part.inertialDiagonal.z + m * (d.x * d.x + d.y * d.y);
  }

  return {
    mass: totalMass,
    density: 0, // Compound density is not well-defined
    centerOfMass: weightedCOM,
    inertialDiagonal: new Vector3(Ixx, Iyy, Izz),
    principalAxes: new Quaternion(),
  };
}

/**
 * Compute mass from density and geometry.
 *
 * @param density - Material density in kg/m³
 * @param shape - Shape type
 * @param params - Shape dimensions
 */
export function computeMassFromDensity(
  density: number,
  shape: USDCollisionShape,
  params: { halfExtents?: Vector3; radius?: number; height?: number },
): number {
  switch (shape) {
    case 'Box': {
      const he = params.halfExtents ?? new Vector3(0.5, 0.5, 0.5);
      const volume = (2 * he.x) * (2 * he.y) * (2 * he.z);
      return density * volume;
    }
    case 'Sphere': {
      const r = params.radius ?? 0.5;
      return density * (4 / 3) * Math.PI * r * r * r;
    }
    case 'Cylinder': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      return density * Math.PI * r * r * h;
    }
    case 'Capsule': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      return density * (Math.PI * r * r * h + (4 / 3) * Math.PI * r * r * r);
    }
    case 'Cone': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      return density * (1 / 3) * Math.PI * r * r * h;
    }
    case 'ConvexHull':
    case 'Mesh':
      // Approximate as bounding box
      if (params.halfExtents) {
        const he = params.halfExtents;
        const volume = (2 * he.x) * (2 * he.y) * (2 * he.z);
        return density * volume * 0.6; // Rough fill factor
      }
      return density * 1.0; // Default 1 m³
    default:
      return density * 1.0;
  }
}

/**
 * Compute full mass properties from geometry.
 * Determines mass from density if mass is not given, then computes inertia.
 */
export function computeMassProperties(
  shape: USDCollisionShape,
  params: {
    halfExtents?: Vector3;
    radius?: number;
    height?: number;
    vertices?: Vector3[];
  },
  options: {
    mass?: number;
    density?: number;
    centerOfMass?: Vector3;
  } = {},
): USDMassProperties {
  const density = options.density ?? 1000.0;
  let mass = options.mass ?? computeMassFromDensity(density, shape, params);
  if (mass <= 0) mass = 0.001;

  let inertialDiagonal: Vector3;
  switch (shape) {
    case 'Box': {
      const he = params.halfExtents ?? new Vector3(0.5, 0.5, 0.5);
      inertialDiagonal = computeBoxInertia(mass, 2 * he.x, 2 * he.y, 2 * he.z);
      break;
    }
    case 'Sphere': {
      const r = params.radius ?? 0.5;
      inertialDiagonal = computeSphereInertia(mass, r);
      break;
    }
    case 'Cylinder': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      inertialDiagonal = computeCylinderInertia(mass, r, h);
      break;
    }
    case 'Capsule': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      inertialDiagonal = computeCapsuleInertia(mass, r, h);
      break;
    }
    case 'Cone': {
      const r = params.radius ?? 0.5;
      const h = params.height ?? 1.0;
      inertialDiagonal = computeConeInertia(mass, r, h);
      break;
    }
    case 'ConvexHull': {
      if (params.vertices && params.vertices.length > 0) {
        inertialDiagonal = computeConvexHullInertia(mass, params.vertices);
      } else {
        const he = params.halfExtents ?? new Vector3(0.5, 0.5, 0.5);
        inertialDiagonal = computeBoxInertia(mass, 2 * he.x, 2 * he.y, 2 * he.z);
      }
      break;
    }
    case 'Mesh': {
      // Approximate mesh as bounding box
      const he = params.halfExtents ?? new Vector3(0.5, 0.5, 0.5);
      inertialDiagonal = computeBoxInertia(mass, 2 * he.x, 2 * he.y, 2 * he.z);
      break;
    }
    default: {
      inertialDiagonal = computeBoxInertia(mass, 1, 1, 1);
      break;
    }
  }

  return {
    mass,
    density,
    centerOfMass: options.centerOfMass ?? new Vector3(0, 0, 0),
    inertialDiagonal,
    principalAxes: new Quaternion(0, 0, 0, 1),
  };
}

// ============================================================================
// PhysicsSceneAPI
// ============================================================================

/**
 * USD PhysicsSceneAPI — scene-level physics configuration.
 * Applied to the root Xform via `prepend apiSchemas = ["PhysicsSceneAPI"]`.
 */
export interface USDPhysicsSceneAPI {
  /** Gravity direction (unit vector) and magnitude (m/s²) */
  gravity: Vector3;
  /** Simulation time step per second (Hz) */
  timeStepPerSecond: number;
  /** Number of solver iterations per time step */
  solverIterations: number;
  /** Solver velocity iterations (for contact resolution) */
  solverVelocityIterations: number;
  /** Collision pair margin */
  collisionMargin: number;
  /** Contact offset */
  contactOffset: number;
}

/**
 * Create a default PhysicsSceneAPI with Earth gravity.
 */
export function createDefaultPhysicsScene(): USDPhysicsSceneAPI {
  return {
    gravity: new Vector3(0, 0, -9.81),
    timeStepPerSecond: 60,
    solverIterations: 10,
    solverVelocityIterations: 5,
    collisionMargin: 0.01,
    contactOffset: 0.02,
  };
}

// ============================================================================
// Conversion Utilities — From project physics types to USD physics types
// ============================================================================

/**
 * Map from project ColliderShape to USD collision shape type.
 */
export function toUSDCollisionShape(shape: string): USDCollisionShape {
  switch (shape) {
    case 'box': return 'Box';
    case 'sphere': return 'Sphere';
    case 'cylinder': return 'Cylinder';
    default: return 'Mesh';
  }
}

/**
 * Map from project JointType to USD joint type.
 */
export function toUSDJointType(jointType: string): USDJointType {
  switch (jointType) {
    case 'hinge':
    case 'revolute':
      return 'Revolute';
    case 'prismatic':
      return 'Prismatic';
    case 'ball-socket':
    case 'ball':
      return 'Spherical';
    case 'fixed':
      return 'Fixed';
    default:
      return 'Fixed';
  }
}

/**
 * Convert a project RigidBodyConfig body type to USD kinematic flag.
 */
export function toUSDKinematic(bodyType: string): boolean {
  return bodyType === 'kinematic' || bodyType === 'static';
}

// ============================================================================
// USD Physics Writer — USDA ASCII Format Output
// ============================================================================

/** Format a number for USDA output (4 decimal places) */
function fmt(n: number, decimals: number = 4): string {
  return n.toFixed(decimals);
}

/** Format a Vector3 as USDA float3 tuple */
function fmtVec3(v: Vector3): string {
  return `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
}

/** Format a Quaternion as USDA quatf (w, x, y, z order in USD) */
function fmtQuat(q: Quaternion): string {
  return `(${fmt(q.w)}, ${fmt(q.x)}, ${fmt(q.y)}, ${fmt(q.z)})`;
}

/** Produce indentation string for the given depth level */
function indent(depth: number): string {
  return '    '.repeat(depth);
}

/**
 * USDPhysicsWriter produces valid USDA ASCII format output containing
 * USD Physics schema attributes for rigid bodies, collision shapes,
 * joints, mass properties, and scene-level physics configuration.
 *
 * The output conforms to the NVIDIA USD Physics specification and can
 * be consumed by Isaac Sim, PhysX, and other USD-compatible physics engines.
 */
export class USDPhysicsWriter {
  private lines: string[] = [];
  private depth: number = 0;
  private rng: SeededRandom;
  private sceneAPI: USDPhysicsSceneAPI;
  private collisionGroups: USDCollisionGroup[] = [];

  constructor(seed: number = 42, sceneAPI?: USDPhysicsSceneAPI) {
    this.rng = new SeededRandom(seed);
    this.sceneAPI = sceneAPI ?? createDefaultPhysicsScene();
  }

  /**
   * Register a collision group for the scene.
   */
  addCollisionGroup(group: USDCollisionGroup): void {
    this.collisionGroups.push(group);
  }

  /**
   * Write the complete USDA file for a physics scene.
   *
   * @param sceneName - Root prim name
   * @param bodies - Array of rigid body definitions
   * @param joints - Array of joint definitions
   * @returns Complete USDA ASCII string
   */
  write(
    sceneName: string,
    bodies: USDPhysicsBodyEntry[],
    joints: USDJoint[] = [],
  ): string {
    this.lines = [];
    this.depth = 0;

    this.writeHeader();
    this.writeSceneStart(sceneName);

    // Write collision groups
    this.writeCollisionGroups();

    // Write rigid bodies
    for (const body of bodies) {
      this.writeRigidBody(body);
    }

    // Write joints
    for (const joint of joints) {
      this.writeJoint(joint);
    }

    this.writeSceneEnd();

    return this.lines.join('\n');
  }

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------

  private writeHeader(): void {
    this.lines.push('#usda 1.0');
    this.lines.push('(');
    this.lines.push('    doc = "Generated by infinigen-r3f USDPhysicsSchema"');
    this.lines.push('    metersPerUnit = 1');
    this.lines.push('    upAxis = "Z"');
    this.lines.push('    timeCodesPerSecond = 60');
    this.lines.push(')');
    this.lines.push('');
  }

  // ------------------------------------------------------------------
  // Scene Root
  // ------------------------------------------------------------------

  private writeSceneStart(name: string): void {
    this.lines.push(`def Xform "${name}" (`);
    this.lines.push('    prepend apiSchemas = ["PhysicsSceneAPI"]');
    this.lines.push(')');
    this.lines.push('{');
    this.depth = 1;

    // PhysicsSceneAPI attributes
    this.emit(`float3 physics:gravity = ${fmtVec3(this.sceneAPI.gravity)}`);
    this.emit(`float physics:timeStepPerSecond = ${this.sceneAPI.timeStepPerSecond}`);
    this.emit(`int physics:solverIterations = ${this.sceneAPI.solverIterations}`);
    this.emit(`int physics:solverVelocityIterations = ${this.sceneAPI.solverVelocityIterations}`);
    this.emit(`float physics:collisionMargin = ${fmt(this.sceneAPI.collisionMargin)}`);
    this.emit(`float physics:contactOffset = ${fmt(this.sceneAPI.contactOffset)}`);
    this.lines.push('');
  }

  private writeSceneEnd(): void {
    this.depth = 0;
    this.lines.push('}');
    this.lines.push('');
  }

  // ------------------------------------------------------------------
  // Collision Groups
  // ------------------------------------------------------------------

  private writeCollisionGroups(): void {
    if (this.collisionGroups.length === 0) return;

    this.emit('# Collision Groups');
    for (const group of this.collisionGroups) {
      this.emit(`def PhysicsCollisionGroup "${group.name}"`);
      this.emit('{');
      this.emit(`    uint physics:bitmask = ${group.bitmask}`);
      if (group.collideWith.length > 0) {
        const refs = group.collideWith.map(n => `</${n}>`).join(', ');
        this.emit(`    rel physics:filteredGroups = [${refs}]`);
      }
      this.emit('}');
      this.lines.push('');
    }
  }

  // ------------------------------------------------------------------
  // Rigid Body
  // ------------------------------------------------------------------

  /**
   * Write a single rigid body prim with physics attributes.
   */
  private writeRigidBody(body: USDPhysicsBodyEntry): void {
    const name = body.name;
    const rb = body.rigidBody;
    const collision = body.collision;
    const mass = body.massProperties;

    // Determine API schemas
    const schemas: string[] = ['RigidBodyAPI', 'MassAPI'];
    if (collision) schemas.push('CollisionAPI');

    this.emit(`def Xform "${name}" (`);
    this.emit(`    prepend apiSchemas = [${schemas.map(s => `"${s}"`).join(', ')}]`);
    this.emit(')');
    this.emit('{');

    // Transform
    if (body.position) {
      this.emit(`float3 xformOp:translate = ${fmtVec3(body.position)}`);
    }
    if (body.rotation) {
      this.emit(`quatf xformOp:orient = ${fmtQuat(body.rotation)}`);
    }
    if (body.scale) {
      this.emit(`float3 xformOp:scale = ${fmtVec3(body.scale)}`);
    }

    const xformOps: string[] = [];
    if (body.position) xformOps.push('"xformOp:translate"');
    if (body.rotation) xformOps.push('"xformOp:orient"');
    if (body.scale) xformOps.push('"xformOp:scale"');
    if (xformOps.length > 0) {
      this.emit(`uniform token[] xformOpOrder = [${xformOps.join(', ')}]`);
    }

    // RigidBodyAPI attributes
    this.emit(`float physics:mass = ${fmt(mass.mass, 6)}`);
    if (mass.density > 0) {
      this.emit(`float physics:density = ${fmt(mass.density, 2)}`);
    }
    this.emit(`float3 physics:velocity = ${fmtVec3(rb.linearVelocity)}`);
    this.emit(`float3 physics:angularVelocity = ${fmtVec3(rb.angularVelocity)}`);
    this.emit(`float3 physics:centerOfMass = ${fmtVec3(rb.centerOfMass)}`);
    this.emit(`quatf physics:principalAxes = ${fmtQuat(rb.principalAxes)}`);
    this.emit(`float3 physics:diagonalInertia = ${fmtVec3(mass.inertialDiagonal)}`);
    this.emit(`bool physics:kinematicEnabled = ${rb.kinematic}`);
    this.emit(`bool physics:startsAsleep = ${rb.startsAsleep}`);
    if (!rb.enableGravity) {
      this.emit('bool physics:rigidBodyEnabled = false');
    }

    // Collision shapes
    if (collision) {
      for (let i = 0; i < collision.shapes.length; i++) {
        this.writeCollisionShape(collision.shapes[i], i);
      }
    }

    this.emit('}');
    this.lines.push('');
  }

  // ------------------------------------------------------------------
  // Collision Shape
  // ------------------------------------------------------------------

  private writeCollisionShape(shape: USDCollisionGeometry, index: number): void {
    const shapeName = `Collision_${index}`;

    switch (shape.shape) {
      case 'Box':
        this.emit(`def Cube "${shapeName}"`);
        this.emit('{');
        if (shape.halfExtents) {
          const ext = shape.halfExtents.clone().multiplyScalar(2);
          this.emit(`    float3 physics:center = ${fmtVec3(shape.offset ?? new Vector3())}`);
          this.emit(`    float3 physics:extent = ${fmtVec3(ext)}`);
        }
        if (shape.scale) {
          this.emit(`    float3 physics:scale = ${fmtVec3(shape.scale)}`);
        }
        break;

      case 'Sphere':
        this.emit(`def Sphere "${shapeName}"`);
        this.emit('{');
        this.emit(`    float3 physics:center = ${fmtVec3(shape.offset ?? new Vector3())}`);
        this.emit(`    float physics:radius = ${fmt(shape.radius ?? 0.5)}`);
        break;

      case 'Capsule':
        this.emit(`def Capsule "${shapeName}"`);
        this.emit('{');
        this.emit(`    float3 physics:center = ${fmtVec3(shape.offset ?? new Vector3())}`);
        this.emit(`    float physics:radius = ${fmt(shape.radius ?? 0.5)}`);
        this.emit(`    float physics:halfHeight = ${fmt((shape.height ?? 1.0) / 2)}`);
        break;

      case 'Cylinder':
        this.emit(`def Cylinder "${shapeName}"`);
        this.emit('{');
        this.emit(`    float3 physics:center = ${fmtVec3(shape.offset ?? new Vector3())}`);
        this.emit(`    float physics:radius = ${fmt(shape.radius ?? 0.5)}`);
        this.emit(`    float physics:halfHeight = ${fmt((shape.height ?? 1.0) / 2)}`);
        break;

      case 'Cone':
        this.emit(`def Cone "${shapeName}"`);
        this.emit('{');
        this.emit(`    float3 physics:center = ${fmtVec3(shape.offset ?? new Vector3())}`);
        this.emit(`    float physics:radius = ${fmt(shape.radius ?? 0.5)}`);
        this.emit(`    float physics:halfHeight = ${fmt((shape.height ?? 1.0) / 2)}`);
        break;

      case 'ConvexHull':
        this.emit(`def ConvexHull "${shapeName}"`);
        this.emit('{');
        if (shape.approximate && shape.approximate !== 'none') {
          this.emit(`    uniform token physics:approximation = "${shape.approximate}"`);
        }
        if (shape.offset) {
          this.emit(`    float3 physics:center = ${fmtVec3(shape.offset)}`);
        }
        break;

      case 'Mesh':
        this.emit(`def Mesh "${shapeName}"`);
        this.emit('{');
        if (shape.approximate && shape.approximate !== 'none') {
          this.emit(`    uniform token physics:approximation = "${shape.approximate}"`);
        }
        if (shape.offset) {
          this.emit(`    float3 physics:center = ${fmtVec3(shape.offset)}`);
        }
        break;

      default:
        this.emit(`def Cube "${shapeName}"`);
        this.emit('{');
        this.emit('    float3 physics:center = (0, 0, 0)');
        this.emit('    float3 physics:extent = (1, 1, 1)');
        break;
    }

    this.emit('}');
  }

  // ------------------------------------------------------------------
  // Joints
  // ------------------------------------------------------------------

  /**
   * Write a USD joint prim.
   */
  private writeJoint(joint: USDJoint): void {
    switch (joint.type) {
      case 'Fixed':
        this.writeFixedJoint(joint);
        break;
      case 'Revolute':
        this.writeRevoluteJoint(joint);
        break;
      case 'Prismatic':
        this.writePrismaticJoint(joint);
        break;
      case 'Spherical':
        this.writeSphericalJoint(joint);
        break;
      case 'D6':
        this.writeD6Joint(joint);
        break;
    }
  }

  private writeFixedJoint(joint: USDFixedJoint): void {
    this.emit(`def PhysicsFixedJoint "${joint.name}"`);
    this.emit('{');
    this.emit(`    rel physics:body0 = ${joint.body0}`);
    this.emit(`    rel physics:body1 = ${joint.body1}`);
    this.emit(`    float3 physics:localPos0 = ${fmtVec3(joint.localPos0)}`);
    this.emit(`    float3 physics:localRot0 = ${fmtQuat(joint.localRot0)}`);
    this.emit(`    float3 physics:localPos1 = ${fmtVec3(joint.localPos1)}`);
    this.emit(`    float3 physics:localRot1 = ${fmtQuat(joint.localRot1)}`);
    if (joint.breakForce > 0) {
      this.emit(`    float physics:breakForce = ${fmt(joint.breakForce)}`);
    }
    if (joint.breakTorque > 0) {
      this.emit(`    float physics:breakTorque = ${fmt(joint.breakTorque)}`);
    }
    this.emit('}');
    this.lines.push('');
  }

  private writeRevoluteJoint(joint: USDRevoluteJoint): void {
    this.emit(`def PhysicsRevoluteJoint "${joint.name}"`);
    this.emit('{');
    this.emit(`    rel physics:body0 = ${joint.body0}`);
    this.emit(`    rel physics:body1 = ${joint.body1}`);
    this.emit(`    float3 physics:localPos0 = ${fmtVec3(joint.localPos0)}`);
    this.emit(`    float3 physics:localRot0 = ${fmtQuat(joint.localRot0)}`);
    this.emit(`    float3 physics:localPos1 = ${fmtVec3(joint.localPos1)}`);
    this.emit(`    float3 physics:localRot1 = ${fmtQuat(joint.localRot1)}`);
    this.emit(`    float3 physics:axis = ${fmtVec3(joint.axis)}`);
    this.emit(`    float physics:lowerLimit = ${fmt(joint.lowerLimit, 6)}`);
    this.emit(`    float physics:upperLimit = ${fmt(joint.upperLimit, 6)}`);
    this.emit(`    float physics:stiffness = ${fmt(joint.stiffness)}`);
    this.emit(`    float physics:damping = ${fmt(joint.damping)}`);
    if (joint.breakForce > 0) {
      this.emit(`    float physics:breakForce = ${fmt(joint.breakForce)}`);
    }
    if (joint.breakTorque > 0) {
      this.emit(`    float physics:breakTorque = ${fmt(joint.breakTorque)}`);
    }
    this.emit('}');
    this.lines.push('');
  }

  private writePrismaticJoint(joint: USDPrismaticJoint): void {
    this.emit(`def PhysicsPrismaticJoint "${joint.name}"`);
    this.emit('{');
    this.emit(`    rel physics:body0 = ${joint.body0}`);
    this.emit(`    rel physics:body1 = ${joint.body1}`);
    this.emit(`    float3 physics:localPos0 = ${fmtVec3(joint.localPos0)}`);
    this.emit(`    float3 physics:localRot0 = ${fmtQuat(joint.localRot0)}`);
    this.emit(`    float3 physics:localPos1 = ${fmtVec3(joint.localPos1)}`);
    this.emit(`    float3 physics:localRot1 = ${fmtQuat(joint.localRot1)}`);
    this.emit(`    float3 physics:axis = ${fmtVec3(joint.axis)}`);
    this.emit(`    float physics:lowerLimit = ${fmt(joint.lowerLimit, 6)}`);
    this.emit(`    float physics:upperLimit = ${fmt(joint.upperLimit, 6)}`);
    this.emit(`    float physics:stiffness = ${fmt(joint.stiffness)}`);
    this.emit(`    float physics:damping = ${fmt(joint.damping)}`);
    if (joint.breakForce > 0) {
      this.emit(`    float physics:breakForce = ${fmt(joint.breakForce)}`);
    }
    if (joint.breakTorque > 0) {
      this.emit(`    float physics:breakTorque = ${fmt(joint.breakTorque)}`);
    }
    this.emit('}');
    this.lines.push('');
  }

  private writeSphericalJoint(joint: USDSphericalJoint): void {
    this.emit(`def PhysicsSphericalJoint "${joint.name}"`);
    this.emit('{');
    this.emit(`    rel physics:body0 = ${joint.body0}`);
    this.emit(`    rel physics:body1 = ${joint.body1}`);
    this.emit(`    float3 physics:localPos0 = ${fmtVec3(joint.localPos0)}`);
    this.emit(`    float3 physics:localRot0 = ${fmtQuat(joint.localRot0)}`);
    this.emit(`    float3 physics:localPos1 = ${fmtVec3(joint.localPos1)}`);
    this.emit(`    float3 physics:localRot1 = ${fmtQuat(joint.localRot1)}`);
    this.emit(`    float physics:coneAngle0Limit = ${fmt(joint.coneAngle0, 6)}`);
    this.emit(`    float physics:coneAngle1Limit = ${fmt(joint.coneAngle1, 6)}`);
    this.emit(`    float physics:stiffness = ${fmt(joint.stiffness)}`);
    this.emit(`    float physics:damping = ${fmt(joint.damping)}`);
    if (joint.breakForce > 0) {
      this.emit(`    float physics:breakForce = ${fmt(joint.breakForce)}`);
    }
    if (joint.breakTorque > 0) {
      this.emit(`    float physics:breakTorque = ${fmt(joint.breakTorque)}`);
    }
    this.emit('}');
    this.lines.push('');
  }

  private writeD6Joint(joint: USDD6Joint): void {
    this.emit(`def PhysicsD6Joint "${joint.name}"`);
    this.emit('{');
    this.emit(`    rel physics:body0 = ${joint.body0}`);
    this.emit(`    rel physics:body1 = ${joint.body1}`);
    this.emit(`    float3 physics:localPos0 = ${fmtVec3(joint.localPos0)}`);
    this.emit(`    float3 physics:localRot0 = ${fmtQuat(joint.localRot0)}`);
    this.emit(`    float3 physics:localPos1 = ${fmtVec3(joint.localPos1)}`);
    this.emit(`    float3 physics:localRot1 = ${fmtQuat(joint.localRot1)}`);

    // Write each configured axis
    const axisKeys: D6Axis[] = ['transX', 'transY', 'transZ', 'rotX', 'rotY', 'rotZ'];
    for (const key of axisKeys) {
      const config = joint.axes[key];
      if (config) {
        const prefix = `physics:${key}`;
        this.emit(`    uniform token ${prefix}:mode = "${config.mode}"`);
        if (config.mode === 'limited') {
          if (config.lowerLimit !== undefined) {
            this.emit(`    float ${prefix}:lowerLimit = ${fmt(config.lowerLimit, 6)}`);
          }
          if (config.upperLimit !== undefined) {
            this.emit(`    float ${prefix}:upperLimit = ${fmt(config.upperLimit, 6)}`);
          }
        }
        if (config.stiffness !== undefined && config.stiffness > 0) {
          this.emit(`    float ${prefix}:stiffness = ${fmt(config.stiffness)}`);
        }
        if (config.damping !== undefined && config.damping > 0) {
          this.emit(`    float ${prefix}:damping = ${fmt(config.damping)}`);
        }
      }
    }

    if (joint.breakForce > 0) {
      this.emit(`    float physics:breakForce = ${fmt(joint.breakForce)}`);
    }
    if (joint.breakTorque > 0) {
      this.emit(`    float physics:breakTorque = ${fmt(joint.breakTorque)}`);
    }
    this.emit('}');
    this.lines.push('');
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------

  private emit(line: string): void {
    this.lines.push(`${indent(this.depth)}${line}`);
  }
}

// ============================================================================
// Scene Assembly — Building complete physics scenes
// ============================================================================

/**
 * A complete rigid body entry for the USDPhysicsWriter.
 * Combines rigid body, collision, and mass properties into a single unit.
 */
export interface USDPhysicsBodyEntry {
  /** Unique name for this body (also used as the USD prim name) */
  name: string;
  /** World-space position */
  position?: Vector3;
  /** World-space rotation */
  rotation?: Quaternion;
  /** Scale */
  scale?: Vector3;
  /** Rigid body dynamics properties */
  rigidBody: USDRigidBodyAPI;
  /** Collision properties (null = no collision) */
  collision: USDCollisionAPI | null;
  /** Mass and inertia properties */
  massProperties: USDMassProperties;
}

/**
 * USDPhysicsSceneBuilder helps assemble a complete physics scene by
 * providing convenience methods for adding bodies, joints, and collision groups
 * with deterministic random generation via SeededRandom.
 */
export class USDPhysicsSceneBuilder {
  private bodies: USDPhysicsBodyEntry[] = [];
  private joints: USDJoint[] = [];
  private collisionGroups: USDCollisionGroup[] = [];
  private rng: SeededRandom;
  private sceneAPI: USDPhysicsSceneAPI;
  private bodyNameCounter: number = 0;

  constructor(seed: number = 42, sceneAPI?: USDPhysicsSceneAPI) {
    this.rng = new SeededRandom(seed);
    this.sceneAPI = sceneAPI ?? createDefaultPhysicsScene();
  }

  /**
   * Add a rigid body to the scene.
   */
  addBody(entry: USDPhysicsBodyEntry): this {
    this.bodies.push(entry);
    return this;
  }

  /**
   * Add a simple box rigid body at the given position.
   * Mass properties are computed from the box dimensions and density.
   */
  addBox(
    name: string,
    position: Vector3,
    halfExtents: Vector3,
    options: {
      mass?: number;
      density?: number;
      kinematic?: boolean;
      enableGravity?: boolean;
      collisionGroups?: string[];
    } = {},
  ): this {
    const massProps = computeMassProperties('Box', { halfExtents }, options);
    const rb = createDefaultRigidBodyAPI(this.rng, massProps.mass);
    rb.kinematic = options.kinematic ?? false;
    rb.enableGravity = options.enableGravity ?? true;
    rb.centerOfMass = massProps.centerOfMass;
    rb.inertialDiagonal = massProps.inertialDiagonal;

    const collision = createDefaultCollisionAPI('Box', halfExtents);
    if (options.collisionGroups) {
      collision.collisionGroups = options.collisionGroups;
    }

    this.addBody({
      name,
      position,
      rigidBody: rb,
      collision,
      massProperties: massProps,
    });
    return this;
  }

  /**
   * Add a simple sphere rigid body.
   */
  addSphere(
    name: string,
    position: Vector3,
    radius: number,
    options: {
      mass?: number;
      density?: number;
      kinematic?: boolean;
    } = {},
  ): this {
    const massProps = computeMassProperties('Sphere', { radius }, options);
    const rb = createDefaultRigidBodyAPI(this.rng, massProps.mass);
    rb.kinematic = options.kinematic ?? false;
    rb.centerOfMass = massProps.centerOfMass;
    rb.inertialDiagonal = massProps.inertialDiagonal;

    const collision = createDefaultCollisionAPI('Sphere');
    collision.shapes[0].radius = radius;

    this.addBody({
      name,
      position,
      rigidBody: rb,
      collision,
      massProperties: massProps,
    });
    return this;
  }

  /**
   * Add a simple cylinder rigid body.
   */
  addCylinder(
    name: string,
    position: Vector3,
    radius: number,
    height: number,
    options: {
      mass?: number;
      density?: number;
      kinematic?: boolean;
    } = {},
  ): this {
    const massProps = computeMassProperties('Cylinder', { radius, height }, options);
    const rb = createDefaultRigidBodyAPI(this.rng, massProps.mass);
    rb.kinematic = options.kinematic ?? false;
    rb.centerOfMass = massProps.centerOfMass;
    rb.inertialDiagonal = massProps.inertialDiagonal;

    const collision = createDefaultCollisionAPI('Cylinder');
    collision.shapes[0].radius = radius;
    collision.shapes[0].height = height;

    this.addBody({
      name,
      position,
      rigidBody: rb,
      collision,
      massProperties: massProps,
    });
    return this;
  }

  /**
   * Add a joint to the scene.
   */
  addJoint(joint: USDJoint): this {
    this.joints.push(joint);
    return this;
  }

  /**
   * Add a revolute (hinge) joint between two named bodies.
   */
  addRevoluteJoint(
    name: string,
    body0Name: string,
    body1Name: string,
    options: {
      axis?: Vector3;
      lowerLimit?: number;
      upperLimit?: number;
      stiffness?: number;
      damping?: number;
    } = {},
  ): this {
    const joint = createDefaultRevoluteJoint(name, `</World/${body0Name}>`, `</World/${body1Name}>`, this.rng);
    if (options.axis) joint.axis = options.axis;
    if (options.lowerLimit !== undefined) joint.lowerLimit = options.lowerLimit;
    if (options.upperLimit !== undefined) joint.upperLimit = options.upperLimit;
    if (options.stiffness !== undefined) joint.stiffness = options.stiffness;
    if (options.damping !== undefined) joint.damping = options.damping;
    this.joints.push(joint);
    return this;
  }

  /**
   * Add a prismatic (slider) joint between two named bodies.
   */
  addPrismaticJoint(
    name: string,
    body0Name: string,
    body1Name: string,
    options: {
      axis?: Vector3;
      lowerLimit?: number;
      upperLimit?: number;
      stiffness?: number;
      damping?: number;
    } = {},
  ): this {
    const joint = createDefaultPrismaticJoint(name, `</World/${body0Name}>`, `</World/${body1Name}>`, this.rng);
    if (options.axis) joint.axis = options.axis;
    if (options.lowerLimit !== undefined) joint.lowerLimit = options.lowerLimit;
    if (options.upperLimit !== undefined) joint.upperLimit = options.upperLimit;
    if (options.stiffness !== undefined) joint.stiffness = options.stiffness;
    if (options.damping !== undefined) joint.damping = options.damping;
    this.joints.push(joint);
    return this;
  }

  /**
   * Add a spherical (ball-socket) joint.
   */
  addSphericalJoint(
    name: string,
    body0Name: string,
    body1Name: string,
  ): this {
    this.joints.push(
      createDefaultSphericalJoint(name, `</World/${body0Name}>`, `</World/${body1Name}>`),
    );
    return this;
  }

  /**
   * Add a fixed joint.
   */
  addFixedJoint(
    name: string,
    body0Name: string,
    body1Name: string,
  ): this {
    this.joints.push(
      createDefaultFixedJoint(name, `</World/${body0Name}>`, `</World/${body1Name}>`),
    );
    return this;
  }

  /**
   * Add a collision group.
   */
  addCollisionGroup(group: USDCollisionGroup): this {
    this.collisionGroups.push(group);
    return this;
  }

  /**
   * Generate a unique body name.
   */
  nextBodyName(prefix: string = 'Body'): string {
    return `${prefix}_${this.bodyNameCounter++}`;
  }

  /**
   * Get the seeded RNG for external deterministic generation.
   */
  getRNG(): SeededRandom {
    return this.rng;
  }

  /**
   * Export the assembled scene to USDA format.
   */
  export(sceneName: string = 'World'): string {
    const writer = new USDPhysicsWriter(this.rng.seed, this.sceneAPI);
    for (const group of this.collisionGroups) {
      writer.addCollisionGroup(group);
    }
    return writer.write(sceneName, this.bodies, this.joints);
  }

  /**
   * Get all added bodies.
   */
  getBodies(): readonly USDPhysicsBodyEntry[] {
    return this.bodies;
  }

  /**
   * Get all added joints.
   */
  getJoints(): readonly USDJoint[] {
    return this.joints;
  }
}

// ============================================================================
// Convenience: Full Scene Export Function
// ============================================================================

/**
 * Export a complete physics scene to USDA format with a single function call.
 *
 * @param sceneName - Root prim name (default "World")
 * @param seed - Deterministic seed (default 42)
 * @param configure - Callback to configure the scene builder
 * @returns USDA ASCII string
 *
 * @example
 * ```ts
 * const usda = exportUSDPhysicsScene('MyScene', 123, (builder) => {
 *   builder.addBox('Floor', new Vector3(0, 0, 0), new Vector3(5, 0.1, 5), { kinematic: true });
 *   builder.addBox('Cube', new Vector3(0, 2, 0), new Vector3(0.5, 0.5, 0.5));
 *   builder.addRevoluteJoint('DoorHinge', 'Frame', 'Door', {
 *     axis: new Vector3(0, 0, 1),
 *     lowerLimit: -Math.PI / 2,
 *     upperLimit: Math.PI / 2,
 *   });
 * });
 * ```
 */
export function exportUSDPhysicsScene(
  sceneName: string = 'World',
  seed: number = 42,
  configure: (builder: USDPhysicsSceneBuilder) => void,
): string {
  const builder = new USDPhysicsSceneBuilder(seed);
  configure(builder);
  return builder.export(sceneName);
}
