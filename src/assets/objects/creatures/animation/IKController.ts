/**
 * IKController - Inverse Kinematics controller using the FABRIK algorithm
 *
 * Manages multiple IK chains on a creature skeleton, allowing end-effectors
 * (hands, feet, head) to reach toward target positions while respecting
 * bone-length constraints.
 *
 * FABRIK (Forward And Backward Reaching Inverse Kinematics) iterates:
 *   1. Forward pass  – pull the end-effector toward the target, then adjust
 *                      each parent bone outward from the root
 *   2. Backward pass – push from the root back toward the end-effector,
 *                      respecting bone lengths
 *   3. Repeat until convergence or max iterations
 */

import { Bone, Vector3, Quaternion, Matrix4 } from 'three';

// ── Public Types ────────────────────────────────────────────────────────

/** An end-effector that drives an IK chain toward a world-space target */
export interface IKEffector {
  /** The bone acting as the end-effector (typically the last bone in a chain) */
  bone: Bone;
  /** Desired world-space position for the effector */
  targetPosition: Vector3;
  /** Blend weight 0–1 (1 = fully reach toward target, 0 = no influence) */
  weight: number;
}

/** A single IK chain: a sequence of bones from root to end-effector */
export interface IKChain {
  /** Ordered list of bones from root to tip (inclusive) */
  bones: Bone[];
  /** The end-effector definition */
  effector: IKEffector;
}

// ── Internal Helpers ────────────────────────────────────────────────────

/** Per-chain working data for the FABRIK solver */
interface FABRIKChainData {
  /** Snapshot of bone world positions (mutated during solve) */
  positions: Vector3[];
  /** Resting bone lengths (distance between consecutive bones) */
  lengths: number[];
  /** Original bone rotations (rest pose) for computing delta rotations */
  restRotations: Quaternion[];
}

// ── IKController ────────────────────────────────────────────────────────

export class IKController {
  private chains: IKChain[] = [];
  private chainData: FABRIKChainData[] = [];

  /** Convergence tolerance (world units) */
  private tolerance: number = 0.001;
  /** Default maximum iterations per solve call */
  private defaultIterations: number = 10;

  // ── Chain Management ──────────────────────────────────────────────

  /**
   * Add an IK chain to the controller.
   * The chain's bones must be ordered from root → tip.
   */
  addChain(chain: IKChain): number {
    const index = this.chains.length;
    this.chains.push(chain);
    this.chainData.push(this.buildChainData(chain));
    return index;
  }

  /**
   * Remove a chain by index.
   */
  removeChain(index: number): void {
    if (index >= 0 && index < this.chains.length) {
      this.chains.splice(index, 1);
      this.chainData.splice(index, 1);
    }
  }

  /**
   * Get the number of registered chains.
   */
  getChainCount(): number {
    return this.chains.length;
  }

  // ── Effector API ──────────────────────────────────────────────────

  /**
   * Set the target world-space position for a chain's effector.
   */
  setEffectorTarget(chainIndex: number, target: Vector3): void {
    if (chainIndex < 0 || chainIndex >= this.chains.length) return;
    this.chains[chainIndex].effector.targetPosition.copy(target);
  }

  /**
   * Get the current world-space position of a chain's effector bone.
   */
  getEffectorPosition(chainIndex: number): Vector3 {
    if (chainIndex < 0 || chainIndex >= this.chains.length) {
      return new Vector3();
    }
    const pos = new Vector3();
    this.chains[chainIndex].effector.bone.getWorldPosition(pos);
    return pos;
  }

  /**
   * Set the blend weight for a chain's effector.
   */
  setEffectorWeight(chainIndex: number, weight: number): void {
    if (chainIndex < 0 || chainIndex >= this.chains.length) return;
    this.chains[chainIndex].effector.weight = Math.max(0, Math.min(1, weight));
  }

  // ── FABRIK Solver ─────────────────────────────────────────────────

  /**
   * Solve all IK chains using the FABRIK algorithm.
   *
   * @param iterations - Maximum iterations per chain (default: 10)
   */
  solve(iterations?: number): void {
    const maxIter = iterations ?? this.defaultIterations;

    for (let c = 0; c < this.chains.length; c++) {
      const chain = this.chains[c];
      const data = this.chainData[c];
      const weight = chain.effector.weight;

      // Skip chains with zero weight
      if (weight <= 0) continue;

      // Refresh bone world positions
      this.refreshPositions(chain, data);

      // The effective target (blended between current position and target by weight)
      const effectorPos = data.positions[data.positions.length - 1];
      const target = new Vector3().lerpVectors(
        effectorPos,
        chain.effector.targetPosition,
        weight,
      );

      // Run FABRIK iterations
      for (let iter = 0; iter < maxIter; iter++) {
        // Forward reaching: pull end-effector toward target
        this.forwardReaching(data, target);

        // Backward reaching: push root back to its original position
        this.backwardReaching(data);

        // Check convergence
        const endPos = data.positions[data.positions.length - 1];
        if (endPos.distanceTo(target) < this.tolerance) {
          break;
        }
      }

      // Apply computed positions back to the bones
      this.applyPositions(chain, data);
    }
  }

  // ── FABRIK Internal ───────────────────────────────────────────────

  /**
   * Forward reaching pass: start from the end-effector and work toward the root.
   * Set the last position to the target, then adjust each parent to maintain bone length.
   */
  private forwardReaching(data: FABRIKChainData, target: Vector3): void {
    const { positions, lengths } = data;
    const n = positions.length;

    // Move end-effector to target
    positions[n - 1].copy(target);

    // Adjust each preceding bone to maintain its original distance
    for (let i = n - 2; i >= 0; i--) {
      const direction = new Vector3().subVectors(positions[i], positions[i + 1]);
      const dist = direction.length();
      if (dist < 0.0001) {
        direction.set(0, 1, 0); // fallback direction
      } else {
        direction.normalize();
      }
      // Place bone i at the correct distance from bone i+1
      positions[i].copy(positions[i + 1]).add(direction.multiplyScalar(lengths[i]));
    }
  }

  /**
   * Backward reaching pass: start from the root and work toward the end-effector.
   * Fix the root, then adjust each child to maintain bone length.
   */
  private backwardReaching(data: FABRIKChainData): void {
    const { positions, lengths } = data;
    const n = positions.length;

    // Root stays at its original position (already set)
    // positions[0] is anchored

    for (let i = 1; i < n; i++) {
      const direction = new Vector3().subVectors(positions[i], positions[i - 1]);
      const dist = direction.length();
      if (dist < 0.0001) {
        direction.set(0, 1, 0); // fallback direction
      } else {
        direction.normalize();
      }
      // Place bone i at the correct distance from bone i-1
      positions[i].copy(positions[i - 1]).add(direction.multiplyScalar(lengths[i - 1]));
    }
  }

  // ── Position Management ───────────────────────────────────────────

  /**
   * Refresh working positions from the actual bone world positions.
   */
  private refreshPositions(chain: IKChain, data: FABRIKChainData): void {
    for (let i = 0; i < chain.bones.length; i++) {
      chain.bones[i].getWorldPosition(data.positions[i]);
    }
  }

  /**
   * Apply the solved positions back to the bones as local transformations.
   *
   * For each bone, we compute the new local position relative to its parent
   * by transforming the new world position into the parent's local space.
   */
  private applyPositions(chain: IKChain, data: FABRIKChainData): void {
    const { positions } = data;

    for (let i = 0; i < chain.bones.length; i++) {
      const bone = chain.bones[i];
      const parent = bone.parent as Bone | null;

      if (parent && parent.isBone) {
        // Compute the new position in the parent's local space
        const parentWorldInverse = new Matrix4();
        parent.updateWorldMatrix(true, false);
        parentWorldInverse.copy(parent.matrixWorld).invert();

        const localPos = positions[i].clone().applyMatrix4(parentWorldInverse);

        // Compute the direction vector from parent to this bone (in parent local space)
        const oldLocalPos = new Vector3();
        bone.getWorldPosition(oldLocalPos);
        oldLocalPos.applyMatrix4(parentWorldInverse);

        // Determine rotation delta: old local direction → new local direction
        const oldDir = oldLocalPos.clone().normalize();
        const newDir = localPos.clone().normalize();

        if (oldDir.lengthSq() > 0.0001 && newDir.lengthSq() > 0.0001) {
          const quat = new Quaternion().setFromUnitVectors(oldDir, newDir);
          bone.quaternion.premultiply(quat);
        }

        // Update position
        bone.position.copy(localPos);
      } else {
        // Root bone: set world position directly
        bone.position.copy(positions[i]);
      }

      // Mark for update
      bone.updateMatrix();
    }
  }

  /**
   * Build the initial working data for a chain.
   */
  private buildChainData(chain: IKChain): FABRIKChainData {
    const n = chain.bones.length;
    const positions: Vector3[] = [];
    const lengths: number[] = [];
    const restRotations: Quaternion[] = [];

    // Ensure world matrices are up to date
    if (n > 0) {
      chain.bones[0].updateWorldMatrix(true, true);
    }

    for (let i = 0; i < n; i++) {
      const bone = chain.bones[i];
      const wp = new Vector3();
      bone.getWorldPosition(wp);
      positions.push(wp);

      restRotations.push(bone.quaternion.clone());

      if (i < n - 1) {
        const nextWp = new Vector3();
        chain.bones[i + 1].getWorldPosition(nextWp);
        lengths.push(wp.distanceTo(nextWp));
      } else {
        // Last bone has no child; store zero length (won't be used)
        lengths.push(0);
      }
    }

    return { positions, lengths, restRotations };
  }
}
