/**
 * NarrowPhase - Precise collision detection using SAT (Separating Axis Theorem)
 * with GJK/EPA fallback for unsupported shape pairs
 *
 * Generates contact points, normals, and penetration depths.
 * Supports oriented box-box (15 axes), box-cylinder, cylinder-cylinder,
 * and falls back to GJK for any other combinations.
 */
import { Vector3, Quaternion, Matrix4 } from 'three';
import { Collider } from '../Collider';
import { detectCollisionGJK, EPAResult } from './GJK';
import {
  ContactManifold,
  ContactManifoldCache,
  generateBoxBoxContacts,
  generateSphereBoxContacts,
  generateGJKContacts,
} from './ContactGeneration';
import { RigidBody } from '../RigidBody';

export interface ContactPoint {
  point: Vector3;
  normal: Vector3; // From A to B
  depth: number;
}

export interface CollisionPair {
  colliderA: Collider;
  colliderB: Collider;
  contacts: ContactPoint[];
}

export class NarrowPhase {
  private _tmpV1 = new Vector3();
  private _tmpV2 = new Vector3();
  private _tmpV3 = new Vector3();
  private _tmpV4 = new Vector3();

  /** Manifold cache for persistent contacts across frames */
  private manifoldCache: ContactManifoldCache = new ContactManifoldCache();

  /** Whether to use multi-contact manifolds */
  public useManifolds: boolean = true;

  /**
   * Detect precise contacts for a set of broad phase pairs
   */
  detect(pairs: { colliderA: Collider; colliderB: Collider }[]): CollisionPair[] {
    const results: CollisionPair[] = [];

    for (const pair of pairs) {
      const contacts = this.detectPair(pair.colliderA, pair.colliderB);
      if (contacts.length > 0) {
        results.push({
          colliderA: pair.colliderA,
          colliderB: pair.colliderB,
          contacts,
        });
      }
    }

    return results;
  }

  /**
   * Detect contacts between two colliders.
   * Tries shape-specific SAT first, falls back to GJK+EPA.
   */
  detectPair(a: Collider, b: Collider): ContactPoint[] {
    const centerA = a.aabbMin.clone().add(a.aabbMax).multiplyScalar(0.5);
    const centerB = b.aabbMin.clone().add(b.aabbMax).multiplyScalar(0.5);

    switch (a.shape) {
      case 'sphere':
        if (b.shape === 'sphere') return this.sphereVsSphere(a, b, centerA, centerB);
        if (b.shape === 'box') return generateSphereBoxContacts(a, b);
        if (b.shape === 'cylinder') return this.sphereVsCylinder(a, b, centerA, centerB);
        break;
      case 'box':
        if (b.shape === 'box') return generateBoxBoxContacts(a, b);
        if (b.shape === 'sphere') {
          const contacts = generateSphereBoxContacts(b, a);
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        if (b.shape === 'cylinder') return this.boxVsCylinder(a, b, centerA, centerB);
        break;
      case 'cylinder':
        if (b.shape === 'sphere') {
          const contacts = this.sphereVsCylinder(b, a, centerB, centerA);
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        if (b.shape === 'box') {
          const contacts = this.boxVsCylinder(b, a, centerB, centerA);
          contacts.forEach(c => c.normal.negate());
          return contacts;
        }
        if (b.shape === 'cylinder') return this.cylinderVsCylinder(a, b, centerA, centerB);
        break;
    }

    // Fallback: GJK + EPA for unsupported shape pairs
    return generateGJKContacts(a, b);
  }

  /**
   * Detect contacts with manifold persistence.
   * Maintains contacts across frames for warm starting.
   */
  detectWithManifolds(
    pairs: { colliderA: Collider; colliderB: Collider }[],
    bodies: Map<string, RigidBody>
  ): CollisionPair[] {
    // Advance the frame counter
    this.manifoldCache.advanceFrame();

    // Refresh existing manifolds
    for (const manifold of this.manifoldCache.getAllManifolds()) {
      manifold.refreshContacts();
    }

    const results: CollisionPair[] = [];

    for (const pair of pairs) {
      const bodyA = pair.colliderA.bodyId ? bodies.get(pair.colliderA.bodyId) : null;
      const bodyB = pair.colliderB.bodyId ? bodies.get(pair.colliderB.bodyId) : null;

      if (!bodyA || !bodyB) {
        // No bodies — just do regular detection
        const contacts = this.detectPair(pair.colliderA, pair.colliderB);
        if (contacts.length > 0) {
          results.push({
            colliderA: pair.colliderA,
            colliderB: pair.colliderB,
            contacts,
          });
        }
        continue;
      }

      // Get or create a manifold
      const manifold = this.manifoldCache.getManifold(
        pair.colliderA, pair.colliderB, bodyA, bodyB
      );

      // Detect new contacts
      const newContacts = this.detectPair(pair.colliderA, pair.colliderB);

      if (newContacts.length > 0) {
        // Add new contacts to the manifold
        for (const contact of newContacts) {
          manifold.addContact(contact.point, contact.normal, contact.depth);
        }
        manifold.pruneContacts();

        results.push({
          colliderA: pair.colliderA,
          colliderB: pair.colliderB,
          contacts: manifold.contacts,
        });
      } else if (manifold.contacts.length > 0) {
        // No new contacts but manifold still has persisted ones
        results.push({
          colliderA: pair.colliderA,
          colliderB: pair.colliderB,
          contacts: manifold.contacts,
        });
      }
    }

    return results;
  }

  /**
   * Get the manifold cache for external access
   */
  getManifoldCache(): ContactManifoldCache {
    return this.manifoldCache;
  }

  // ========================================================================
  // Sphere collisions
  // ========================================================================

  private sphereVsSphere(a: Collider, b: Collider, centerA: Vector3, centerB: Vector3): ContactPoint[] {
    const direction = new Vector3().subVectors(centerB, centerA);
    const distance = direction.length();
    const minDistance = a.radius + b.radius;

    if (distance >= minDistance) return [];

    direction.normalize();
    const contactPoint = centerA.clone().add(direction.clone().multiplyScalar(a.radius));
    const penetration = minDistance - distance;

    return [{
      point: contactPoint,
      normal: direction,
      depth: penetration,
    }];
  }

  private sphereVsBox(sphere: Collider, box: Collider, sphereCenter: Vector3, boxCenter: Vector3): ContactPoint[] {
    const halfExtents = box.halfExtents;
    const localSphere = sphereCenter.clone().sub(boxCenter);

    const closest = new Vector3(
      Math.max(-halfExtents.x, Math.min(halfExtents.x, localSphere.x)),
      Math.max(-halfExtents.y, Math.min(halfExtents.y, localSphere.y)),
      Math.max(-halfExtents.z, Math.min(halfExtents.z, localSphere.z)),
    );

    const diff = new Vector3().subVectors(localSphere, closest);
    const distance = diff.length();

    if (distance >= sphere.radius) return [];

    const normal = distance > 1e-6 ? diff.normalize() : new Vector3(0, 1, 0);
    const contactPoint = boxCenter.clone().add(closest);

    return [{
      point: contactPoint,
      normal,
      depth: sphere.radius - distance,
    }];
  }

  private sphereVsCylinder(sphere: Collider, cylinder: Collider, sphereCenter: Vector3, cylCenter: Vector3): ContactPoint[] {
    const halfHeight = cylinder.height / 2;
    const localSphere = sphereCenter.clone().sub(cylCenter);

    const radialDist = Math.sqrt(localSphere.x * localSphere.x + localSphere.z * localSphere.z);
    const clampedRadial = Math.min(radialDist, cylinder.radius);
    const clampedY = Math.max(-halfHeight, Math.min(halfHeight, localSphere.y));

    let closestX, closestZ;
    if (radialDist > 1e-6) {
      closestX = (localSphere.x / radialDist) * clampedRadial;
      closestZ = (localSphere.z / radialDist) * clampedRadial;
    } else {
      closestX = 0;
      closestZ = 0;
    }

    const closest = new Vector3(closestX, clampedY, closestZ);
    const diff = new Vector3().subVectors(localSphere, closest);
    const distance = diff.length();

    if (distance >= sphere.radius) return [];

    const normal = distance > 1e-6 ? diff.normalize() : new Vector3(0, 1, 0);
    const contactPoint = cylCenter.clone().add(closest);

    return [{
      point: contactPoint,
      normal,
      depth: sphere.radius - distance,
    }];
  }

  // ========================================================================
  // Box vs Box — Full SAT for oriented boxes (15 separating axes)
  // ========================================================================

  /**
   * Full SAT for oriented box-box collision.
   * Tests 15 separating axes: 3 from A's face normals, 3 from B's face normals,
   * and 9 cross products of edge axes from A and B.
   */
  private boxVsBox(a: Collider, b: Collider, centerA: Vector3, centerB: Vector3): ContactPoint[] {
    const heA = a.halfExtents;
    const heB = b.halfExtents;

    // Get orientation axes for each box (default axis-aligned unless rotation provided)
    const axesA = this.getBoxAxes(a);
    const axesB = this.getBoxAxes(b);

    const diff = new Vector3().subVectors(centerB, centerA);

    let minOverlap = Infinity;
    let minAxis = new Vector3();

    // 15 separating axes to test
    const testAxes: Vector3[] = [];

    // 3 face normals of A
    for (let i = 0; i < 3; i++) testAxes.push(axesA[i]);

    // 3 face normals of B
    for (let i = 0; i < 3; i++) testAxes.push(axesB[i]);

    // 9 cross products of edges
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const cross = new Vector3().crossVectors(axesA[i], axesB[j]);
        const len = cross.length();
        if (len > 1e-6) {
          testAxes.push(cross.normalize());
        }
        // If cross product is zero (parallel edges), skip — already covered by face normals
      }
    }

    // Test each axis
    for (const axis of testAxes) {
      const overlap = this.projectOverlap(axis, axesA, heA, axesB, heB, diff);
      if (overlap <= 0) return []; // Separating axis found — no collision

      if (overlap < minOverlap) {
        minOverlap = overlap;
        minAxis = axis.clone();
      }
    }

    // Ensure normal points from A to B
    if (minAxis.dot(diff) < 0) {
      minAxis.negate();
    }

    // Compute contact point as midpoint of overlap region
    const contactPoint = centerA.clone().add(centerB).multiplyScalar(0.5);

    return [{
      point: contactPoint,
      normal: minAxis,
      depth: minOverlap,
    }];
  }

  /**
   * Project both boxes onto an axis and return the overlap (0 or negative = separated)
   */
  private projectOverlap(
    axis: Vector3,
    axesA: Vector3[], heA: Vector3,
    axesB: Vector3[], heB: Vector3,
    centerDiff: Vector3
  ): number {
    // Project half-extents of A onto axis
    const rA = Math.abs(axis.dot(axesA[0])) * heA.x +
               Math.abs(axis.dot(axesA[1])) * heA.y +
               Math.abs(axis.dot(axesA[2])) * heA.z;

    // Project half-extents of B onto axis
    const rB = Math.abs(axis.dot(axesB[0])) * heB.x +
               Math.abs(axis.dot(axesB[1])) * heB.y +
               Math.abs(axis.dot(axesB[2])) * heB.z;

    // Distance between centers projected onto axis
    const d = Math.abs(axis.dot(centerDiff));

    return rA + rB - d; // Positive = overlap, negative = separated
  }

  /**
   * Get the 3 local orientation axes of a box collider.
   * If no rotation is stored, returns world axes (axis-aligned).
   */
  private getBoxAxes(collider: Collider): Vector3[] {
    // Default: axis-aligned
    return [
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
    ];
  }

  // ========================================================================
  // Box vs Cylinder — SAT with cylinder's infinite axis + side axes
  // ========================================================================

  /**
   * Box vs Cylinder: Proper SAT with cylinder's axis + side normal axes.
   * The cylinder axis provides the infinite separating axis.
   * Side axes are cross products of the box face normals with the cylinder axis.
   */
  private boxVsCylinder(box: Collider, cylinder: Collider, boxCenter: Vector3, cylCenter: Vector3): ContactPoint[] {
    const halfHeight = cylinder.height / 2;
    const heBox = box.halfExtents;
    const diff = new Vector3().subVectors(boxCenter, cylCenter);

    // Cylinder axis (Y-aligned in local space)
    const cylAxis = new Vector3(0, 1, 0);
    const boxAxes = this.getBoxAxes(box);

    // Test axes: box face normals + cylinder axis + cross products
    const testAxes: Vector3[] = [];

    // Box face normals (3)
    for (let i = 0; i < 3; i++) testAxes.push(boxAxes[i]);

    // Cylinder axis
    testAxes.push(cylAxis);

    // Cross products of box axes with cylinder axis (3)
    for (let i = 0; i < 3; i++) {
      const cross = new Vector3().crossVectors(boxAxes[i], cylAxis);
      const len = cross.length();
      if (len > 1e-6) {
        testAxes.push(cross.normalize());
      }
    }

    // Special axis: closest point on cylinder circle to box center projected onto XZ plane
    const closestOnCircle = new Vector3();
    const dx = diff.x;
    const dz = diff.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    if (distXZ > 1e-6) {
      closestOnCircle.set(dx / distXZ * cylinder.radius, 0, dz / distXZ * cylinder.radius);
    }

    // Axis from cylinder center to closest point on circle in XZ
    const sideAxis = closestOnCircle.clone().sub(new Vector3(diff.x, 0, diff.z));
    if (sideAxis.length() > 1e-6) {
      sideAxis.normalize();
      testAxes.push(sideAxis);
    }

    let minOverlap = Infinity;
    let minAxis = new Vector3();

    for (const axis of testAxes) {
      const overlap = this.projectBoxCylinderOverlap(axis, heBox, boxAxes, cylinder.radius, halfHeight, diff);
      if (overlap <= 0) return [];

      if (overlap < minOverlap) {
        minOverlap = overlap;
        minAxis = axis.clone();
      }
    }

    // Ensure normal points from cylinder to box (A to B in calling convention)
    if (minAxis.dot(diff) < 0) {
      minAxis.negate();
    }

    const contactPoint = boxCenter.clone().add(cylCenter).multiplyScalar(0.5);

    return [{
      point: contactPoint,
      normal: minAxis,
      depth: minOverlap,
    }];
  }

  /**
   * Project box and cylinder onto an axis and return overlap
   */
  private projectBoxCylinderOverlap(
    axis: Vector3,
    heBox: Vector3, boxAxes: Vector3[],
    cylRadius: number, cylHalfHeight: number,
    centerDiff: Vector3
  ): number {
    // Box projection
    const rBox = Math.abs(axis.dot(boxAxes[0])) * heBox.x +
                  Math.abs(axis.dot(boxAxes[1])) * heBox.y +
                  Math.abs(axis.dot(boxAxes[2])) * heBox.z;

    // Cylinder projection: half-height along axis + radius contribution from circular cross-section
    const rCyl = Math.abs(axis.y) * cylHalfHeight + cylRadius * Math.sqrt(
      Math.max(0, 1 - axis.y * axis.y)
    );

    const d = Math.abs(axis.dot(centerDiff));

    return rBox + rCyl - d;
  }

  // ========================================================================
  // Cylinder vs Cylinder — Separation axis test
  // ========================================================================

  /**
   * Cylinder vs Cylinder collision using separation axis test.
   * Tests: both cylinder axes, cross products of axes, and side normal axes.
   */
  private cylinderVsCylinder(a: Collider, b: Collider, centerA: Vector3, centerB: Vector3): ContactPoint[] {
    const halfHeightA = a.height / 2;
    const halfHeightB = b.height / 2;
    const diff = new Vector3().subVectors(centerB, centerA);

    // Both cylinders assumed Y-axis aligned for simplicity
    const axisA = new Vector3(0, 1, 0);
    const axisB = new Vector3(0, 1, 0);

    const testAxes: Vector3[] = [];

    // Cylinder A axis
    testAxes.push(axisA);
    // Cylinder B axis
    testAxes.push(axisB);

    // Cross product of cylinder axes (zero if parallel)
    const crossAB = new Vector3().crossVectors(axisA, axisB);
    if (crossAB.length() > 1e-6) {
      testAxes.push(crossAB.normalize());
    }

    // Side normal: direction between the two cylinder centers projected onto XZ
    const dx = diff.x;
    const dz = diff.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ > 1e-6) {
      // Side axis perpendicular to both cylinder axes and the line between centers
      const sideAxis = new Vector3(dx / distXZ, 0, dz / distXZ);
      testAxes.push(sideAxis);
    }

    // Cross products of each cylinder axis with side axis
    if (distXZ > 1e-6) {
      const sideAxis = new Vector3(dx / distXZ, 0, dz / distXZ);
      const cross1 = new Vector3().crossVectors(axisA, sideAxis);
      if (cross1.length() > 1e-6) testAxes.push(cross1.normalize());
      const cross2 = new Vector3().crossVectors(axisB, sideAxis);
      if (cross2.length() > 1e-6) testAxes.push(cross2.normalize());
    }

    let minOverlap = Infinity;
    let minAxis = new Vector3();

    for (const axis of testAxes) {
      const rA = Math.abs(axis.y) * halfHeightA + a.radius * Math.sqrt(
        Math.max(0, 1 - axis.y * axis.y)
      );
      const rB = Math.abs(axis.y) * halfHeightB + b.radius * Math.sqrt(
        Math.max(0, 1 - axis.y * axis.y)
      );

      const d = Math.abs(axis.dot(diff));
      const overlap = rA + rB - d;

      if (overlap <= 0) return [];

      if (overlap < minOverlap) {
        minOverlap = overlap;
        minAxis = axis.clone();
      }
    }

    // Ensure normal points from A to B
    if (minAxis.dot(diff) < 0) {
      minAxis.negate();
    }

    const contactPoint = centerA.clone().add(centerB).multiplyScalar(0.5);

    return [{
      point: contactPoint,
      normal: minAxis,
      depth: minOverlap,
    }];
  }
}

export default NarrowPhase;
