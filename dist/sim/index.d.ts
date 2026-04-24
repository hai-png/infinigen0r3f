/**
 * SIM (Scene Interaction Model) Module
 *
 * Physics simulation and kinematic node system for dynamic scenes.
 * Ports: core/sim/ components (algorithmic logic only, no bpy)
 *
 * Provides:
 * - Kinematic tree representation for articulated objects
 * - Joint dynamics and constraints
 * - Material physics properties
 * - R3F physics integration helpers
 */
import { Vector3, Quaternion, Matrix4 } from 'three';
export declare enum JointType {
    FIXED = "fixed",
    REVOLUTE = "revolute",
    PRISMATIC = "prismatic",
    SPHERICAL = "spherical",
    PLANAR = "planar",
    CONTINUOUS = "continuous"
}
export interface JointLimits {
    lower?: number;
    upper?: number;
    velocity?: number;
    effort?: number;
}
export interface KinematicNode {
    id: string;
    name: string;
    parent?: string;
    children: string[];
    jointType: JointType;
    jointAxis: Vector3;
    jointLimits?: JointLimits;
    transform: Matrix4;
    mass: number;
    inertia: Vector3;
    friction?: number;
    restitution?: number;
}
export interface KinematicTree {
    nodes: Map<string, KinematicNode>;
    root: string;
}
export declare class KinematicChain {
    private tree;
    constructor();
    addNode(node: KinematicNode): void;
    getNode(id: string): KinematicNode | undefined;
    getRoot(): string;
    getAllNodes(): KinematicNode[];
    /**
     * Compute forward kinematics for the chain
     */
    computeForwardKinematics(jointPositions: Map<string, number>): Map<string, Matrix4>;
    /**
     * Compute joint transformation based on joint type
     */
    private computeJointTransform;
    /**
     * Get degrees of freedom count
     */
    getDOF(): number;
    /**
     * Export to JSON for serialization
     */
    toJSON(): object;
}
export interface PhysicsMaterial {
    id: string;
    name: string;
    density: number;
    friction: number;
    restitution: number;
    staticFriction?: number;
    dynamicFriction?: number;
    youngsModulus?: number;
    poissonRatio?: number;
}
export declare const DEFAULT_MATERIALS: Record<string, PhysicsMaterial>;
export interface RigidBodyConfig {
    mass: number;
    position: Vector3;
    rotation: Quaternion;
    linearVelocity?: Vector3;
    angularVelocity?: Vector3;
    material?: PhysicsMaterial;
    collider?: ColliderType;
}
export declare enum ColliderType {
    BOX = "box",
    SPHERE = "sphere",
    CAPSULE = "capsule",
    CYLINDER = "cylinder",
    CONVEX = "convex",
    TRIMESH = "trimesh"
}
export interface ColliderDimensions {
    halfExtents?: Vector3;
    radius?: number;
    height?: number;
    vertices?: Float32Array;
    indices?: Uint32Array;
}
export declare class PhysicsBody {
    config: RigidBodyConfig;
    collider: ColliderType;
    dimensions: ColliderDimensions;
    constructor(config: RigidBodyConfig, dimensions?: ColliderDimensions);
    /**
     * Convert to Rapier.js rigid body descriptor
     */
    toRapierDescriptor(): object;
    /**
     * Compute moment of inertia for simple shapes
     */
    computeInertia(): Vector3;
}
export interface JointConfig {
    bodyA: string;
    bodyB: string;
    jointType: JointType;
    anchorA: Vector3;
    anchorB: Vector3;
    axis?: Vector3;
    limits?: JointLimits;
    motor?: {
        targetVelocity: number;
        maxForce: number;
    };
    spring?: {
        stiffness: number;
        damping: number;
        restLength: number;
    };
}
export declare class SimJoint {
    config: JointConfig;
    constructor(config: JointConfig);
    /**
     * Convert to Rapier.js joint descriptor
     */
    toRapierDescriptor(): object;
    /**
     * Check if joint is within limits
     */
    isWithinLimits(position: number): boolean;
    /**
     * Compute constraint force for limit violation
     */
    computeLimitForce(position: number, velocity: number): number;
}
/**
 * Export kinematic chain to URDF format
 */
export declare function exportToURDF(chain: KinematicChain): string;
/**
 * Create R3F-compatible physics world configuration
 */
export declare function createPhysicsWorldConfig(): object;
//# sourceMappingURL=index.d.ts.map