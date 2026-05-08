/**
 * Rigid Body Dynamics - Kinematic Compiler and Collision Layers
 *
 * This file previously contained duplicate RigidBodyDynamics and
 * CollisionDetectionSystem classes that overlapped with PhysicsWorld.ts
 * and the collision/ pipeline. Those duplicates have been removed.
 *
 * The primary physics engine is now PhysicsWorld.ts + collision/ pipeline.
 *
 * This file retains:
 * - KinematicCompiler: Unique kinematic chain compilation for robotics
 * - Collision layers: Bitfield collision filter constants
 * - Kinematic-related types
 *
 * Shape utilities (meshToPhysicsShape, createBoxShape, etc.) have been
 * consolidated into PhysicsWorld.ts. The PhysicsMaterial interface has
 * been consolidated into Material.ts.
 */

import { Vector3, Quaternion, Matrix4 } from 'three';

// ============================================================================
// Collision Layers (used by collision/CollisionFilter.ts and consumers)
// ============================================================================

export type CollisionLayer = number;

export const COLLISION_LAYERS = {
  DEFAULT: 1,
  STATIC: 2,
  DYNAMIC: 4,
  TRIGGER: 8,
  CHARACTER: 16,
  VEHICLE: 32,
  PROJECTILE: 64,
  SENSOR: 128,
};

// ============================================================================
// Kinematic Compiler
// ============================================================================

/**
 * Shape type used by kinematic system for link geometry definitions.
 * Re-exported from PhysicsWorld.ts for convenience.
 */
export type { PhysicsShapeType, PhysicsShape } from './PhysicsWorld';

export interface KinematicJoint {
  id: string;
  type: 'revolute' | 'prismatic' | 'spherical' | 'fixed';
  parentLink: string;
  childLink: string;
  origin: Vector3;
  axis?: Vector3;
  limits?: { lower: number; upper: number; effort: number; velocity: number };
  mimic?: { joint: string; multiplier: number; offset: number };
}

export interface KinematicLink {
  id: string;
  name: string;
  inertia: {
    ixx: number; ixy: number; ixz: number;
    iyy: number; iyz: number; izz: number;
  };
  mass: number;
  visual?: {
    geometry: import('./PhysicsWorld').PhysicsShape;
    material?: string;
  };
  collision?: {
    geometry: import('./PhysicsWorld').PhysicsShape;
  };
}

export interface KinematicChain {
  id: string;
  name: string;
  links: Map<string, KinematicLink>;
  joints: Map<string, KinematicJoint>;
  rootLink: string;
}

export interface CompiledKinematicChain {
  id: string;
  name: string;
  links: Map<string, KinematicLink>;
  joints: Map<string, KinematicJoint>;
  jointTree: Map<string, KinematicJoint[]>;
  forwardKinematicsCache: Map<string, Matrix4>;
  jacobianCache: Map<string, Matrix4[]>;
  dofCount: number;
}

export class KinematicCompiler {
  private chains: Map<string, KinematicChain> = new Map();
  private compiledChains: Map<string, CompiledKinematicChain> = new Map();

  /**
   * Register a kinematic chain
   */
  registerChain(chain: KinematicChain): void {
    this.chains.set(chain.id, chain);
    this.compiledChains.delete(chain.id); // Invalidate compiled version
  }

  /**
   * Compile a kinematic chain for runtime optimization
   */
  compileChain(chainId: string): CompiledKinematicChain {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Kinematic chain ${chainId} not found`);
    }

    // Build link hierarchy
    const linkHierarchy = new Map<string, KinematicLink>();
    const jointTree = new Map<string, KinematicJoint[]>();
    
    // Find root and build tree
    const rootLink = chain.links.get(chain.rootLink);
    if (!rootLink) {
      throw new Error(`Root link ${chain.rootLink} not found`);
    }
    
    linkHierarchy.set(chain.rootLink, rootLink);
    jointTree.set(chain.rootLink, []);

    // Build parent-child relationships
    for (const [jointId, joint] of chain.joints) {
      const parentJoints = jointTree.get(joint.parentLink) || [];
      parentJoints.push(joint);
      jointTree.set(joint.parentLink, parentJoints);
      
      if (!linkHierarchy.has(joint.childLink)) {
        const childLink = chain.links.get(joint.childLink);
        if (childLink) {
          linkHierarchy.set(joint.childLink, childLink);
        }
      }
    }

    // Compute forward kinematics cache
    const fkCache = this.computeForwardKinematicsCache(chain, jointTree);
    
    // Compute Jacobians for efficient inverse kinematics
    const jacobianCache = this.computeJacobianCache(chain, jointTree);

    const compiled: CompiledKinematicChain = {
      id: chain.id,
      name: chain.name,
      links: linkHierarchy,
      joints: chain.joints,
      jointTree,
      forwardKinematicsCache: fkCache,
      jacobianCache,
      dofCount: this.countDegreesOfFreedom(chain),
    };

    this.compiledChains.set(chainId, compiled);
    return compiled;
  }

  private computeForwardKinematicsCache(
    chain: KinematicChain,
    jointTree: Map<string, KinematicJoint[]>
  ): Map<string, Matrix4> {
    const cache = new Map<string, Matrix4>();
    
    const computeTransform = (linkId: string, parentTransform: Matrix4): Matrix4 => {
      const link = chain.links.get(linkId);
      if (!link) return parentTransform;

      // Find joint connecting to this link
      let jointTransform = new Matrix4().identity();
      for (const [parentId, joints] of jointTree.entries()) {
        for (const joint of joints) {
          if (joint.childLink === linkId) {
            jointTransform = this.jointToMatrix(joint);
            break;
          }
        }
      }

      const worldTransform = parentTransform.clone().multiply(jointTransform);
      cache.set(linkId, worldTransform);

      // Process children
      const children = jointTree.get(linkId) || [];
      for (const childJoint of children) {
        computeTransform(childJoint.childLink, worldTransform);
      }

      return worldTransform;
    };

    computeTransform(chain.rootLink, new Matrix4().identity());
    return cache;
  }

  private computeJacobianCache(
    chain: KinematicChain,
    jointTree: Map<string, KinematicJoint[]>
  ): Map<string, Matrix4[]> {
    // Simplified Jacobian cache - in production would compute full analytical Jacobians
    const cache = new Map<string, Matrix4[]>();
    
    for (const [linkId] of chain.links) {
      const jacobians: Matrix4[] = [];
      // Compute Jacobian for each DOF affecting this link
      cache.set(linkId, jacobians);
    }
    
    return cache;
  }

  private jointToMatrix(joint: KinematicJoint): Matrix4 {
    const matrix = new Matrix4().makeTranslation(
      joint.origin.x,
      joint.origin.y,
      joint.origin.z
    );
    
    if (joint.axis) {
      // Apply rotation based on joint type and axis
      // Simplified - would need full rotation matrix based on joint angle
    }
    
    return matrix;
  }

  private countDegreesOfFreedom(chain: KinematicChain): number {
    let dof = 0;
    for (const joint of chain.joints.values()) {
      switch (joint.type) {
        case 'revolute':
        case 'prismatic':
          dof += 1;
          break;
        case 'spherical':
          dof += 3;
          break;
        case 'fixed':
          dof += 0;
          break;
      }
    }
    return dof;
  }

  getCompiledChain(chainId: string): CompiledKinematicChain | null {
    return this.compiledChains.get(chainId) || null;
  }

  /**
   * Update joint positions and recompute forward kinematics
   */
  updateJointPositions(chainId: string, jointPositions: Map<string, number>): Matrix4[] {
    const compiled = this.compiledChains.get(chainId);
    if (!compiled) {
      throw new Error(`Compiled chain ${chainId} not found`);
    }

    // Update joint transforms based on positions
    // Recompute forward kinematics cache
    const updatedFk = new Map<string, Matrix4>();
    
    // Implementation would update each joint transform and propagate
    // This is a simplified placeholder
    
    return Array.from(updatedFk.values());
  }
}
