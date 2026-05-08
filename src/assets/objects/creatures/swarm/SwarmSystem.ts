/**
 * SwarmSystem - Boid algorithm for fish schools and insect swarms
 *
 * Features:
 * - 3 boid rules: separation, alignment, cohesion
 * - Boundary avoidance (stay within terrain bounds)
 * - Predator avoidance (optional, flee from larger creatures)
 * - InstancedMesh rendering for up to 200 individuals
 * - Configurable: count, speed, rules strength, bounds
 */

import {
  InstancedMesh,
  BufferGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Matrix4,
  Vector3,
  Quaternion,
  Color,
  Group,
  BoxGeometry,
  DoubleSide,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ── Configuration ───────────────────────────────────────────────────

export interface SwarmConfig {
  /** Number of individuals (default 50, max 200) */
  count: number;
  /** Base speed (default 2.0) */
  speed: number;
  /** Separation rule strength (default 1.5) */
  separationStrength: number;
  /** Alignment rule strength (default 1.0) */
  alignmentStrength: number;
  /** Cohesion rule strength (default 1.0) */
  cohesionStrength: number;
  /** Boundary avoidance strength (default 2.0) */
  boundaryStrength: number;
  /** Center of the swarm */
  center: Vector3;
  /** Half-extents of the boundary box */
  bounds: Vector3;
  /** Individual size */
  individualSize: number;
  /** Color of individuals */
  color: Color;
  /** Secondary color (belly/tip) */
  secondaryColor: Color;
  /** Predator position (optional) */
  predatorPosition?: Vector3;
  /** Predator avoidance radius */
  predatorAvoidanceRadius: number;
  /** Predator avoidance strength */
  predatorAvoidanceStrength: number;
  /** Separation distance */
  separationDistance: number;
  /** Neighbor perception radius */
  neighborRadius: number;
  /** Type of swarm: 'fish' or 'insect' */
  swarmType: 'fish' | 'insect';
}

const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  count: 50,
  speed: 2.0,
  separationStrength: 1.5,
  alignmentStrength: 1.0,
  cohesionStrength: 1.0,
  boundaryStrength: 2.0,
  center: new Vector3(0, 0, 0),
  bounds: new Vector3(15, 5, 15),
  individualSize: 0.15,
  color: new Color(0x4682b4),
  secondaryColor: new Color(0xc0c0c0),
  predatorAvoidanceRadius: 5.0,
  predatorAvoidanceStrength: 3.0,
  separationDistance: 0.8,
  neighborRadius: 3.0,
  swarmType: 'fish',
};

// ── Individual Boid ─────────────────────────────────────────────────

interface Boid {
  position: Vector3;
  velocity: Vector3;
  acceleration: Vector3;
}

// ── SwarmSystem ─────────────────────────────────────────────────────

export class SwarmSystem {
  private config: SwarmConfig;
  private boids: Boid[] = [];
  private instancedMesh: InstancedMesh;
  private group: Group;
  private rng: SeededRandom;
  private tempMatrix: Matrix4;
  private tempPosition: Vector3;
  private tempQuaternion: Quaternion;
  private elapsedTime: number = 0;

  constructor(config: Partial<SwarmConfig> = {}, seed: number = 42) {
    this.config = { ...DEFAULT_SWARM_CONFIG, ...config };
    this.config.count = Math.min(this.config.count, 200);
    this.rng = new SeededRandom(seed);
    this.tempMatrix = new Matrix4();
    this.tempPosition = new Vector3();
    this.tempQuaternion = new Quaternion();
    this.group = new Group();
    this.group.name = 'SwarmGroup';

    // Create instanced mesh
    const geometry = this.createIndividualGeometry();
    const material = new MeshStandardMaterial({
      color: this.config.color,
      roughness: 0.4,
      metalness: 0.1,
      side: DoubleSide,
    });

    this.instancedMesh = new InstancedMesh(geometry, material, this.config.count);
    this.instancedMesh.name = 'swarmInstances';
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;

    // Initialize boids
    this.initializeBoids();

    this.group.add(this.instancedMesh);
  }

  /**
   * Update all boids and the instanced mesh
   */
  update(deltaTime: number): void {
    this.elapsedTime += deltaTime;

    // Apply boid rules
    for (let i = 0; i < this.boids.length; i++) {
      const boid = this.boids[i];

      // Reset acceleration
      boid.acceleration.set(0, 0, 0);

      // Compute boid forces
      const separation = this.computeSeparation(i);
      const alignment = this.computeAlignment(i);
      const cohesion = this.computeCohesion(i);
      const boundary = this.computeBoundary(i);

      // Apply forces
      boid.acceleration.add(separation.multiplyScalar(this.config.separationStrength));
      boid.acceleration.add(alignment.multiplyScalar(this.config.alignmentStrength));
      boid.acceleration.add(cohesion.multiplyScalar(this.config.cohesionStrength));
      boid.acceleration.add(boundary.multiplyScalar(this.config.boundaryStrength));

      // Predator avoidance
      if (this.config.predatorPosition) {
        const predatorForce = this.computePredatorAvoidance(i);
        boid.acceleration.add(predatorForce.multiplyScalar(this.config.predatorAvoidanceStrength));
      }

      // Add slight wandering
      boid.acceleration.x += (this.rng.next() - 0.5) * 0.5;
      boid.acceleration.y += (this.rng.next() - 0.5) * 0.3;
      boid.acceleration.z += (this.rng.next() - 0.5) * 0.5;

      // Integrate
      boid.velocity.add(boid.acceleration.clone().multiplyScalar(deltaTime));

      // Limit speed
      const speed = boid.velocity.length();
      if (speed > this.config.speed) {
        boid.velocity.multiplyScalar(this.config.speed / speed);
      }
      // Minimum speed (keep them moving)
      if (speed < this.config.speed * 0.3) {
        boid.velocity.normalize().multiplyScalar(this.config.speed * 0.3);
      }

      boid.position.add(boid.velocity.clone().multiplyScalar(deltaTime));
    }

    // Update instanced mesh transforms
    this.updateInstancedMesh();
  }

  /**
   * Get the swarm group for adding to the scene
   */
  getGroup(): Group {
    return this.group;
  }

  /**
   * Set predator position for avoidance
   */
  setPredatorPosition(position: Vector3): void {
    this.config.predatorPosition = position;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as MeshStandardMaterial).dispose();
    this.group.clear();
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private initializeBoids(): void {
    const center = this.config.center;
    const bounds = this.config.bounds;

    for (let i = 0; i < this.config.count; i++) {
      const position = new Vector3(
        center.x + (this.rng.next() - 0.5) * bounds.x * 0.5,
        center.y + (this.rng.next() - 0.5) * bounds.y * 0.5,
        center.z + (this.rng.next() - 0.5) * bounds.z * 0.5,
      );

      const angle = this.rng.next() * Math.PI * 2;
      const velocity = new Vector3(
        Math.cos(angle) * this.config.speed,
        (this.rng.next() - 0.5) * 0.5,
        Math.sin(angle) * this.config.speed,
      );

      this.boids.push({
        position,
        velocity,
        acceleration: new Vector3(),
      });
    }

    // Set initial transforms
    this.updateInstancedMesh();
  }

  private createIndividualGeometry(): BufferGeometry {
    const s = this.config.individualSize;

    if (this.config.swarmType === 'fish') {
      // Streamlined fish body
      const geo = new SphereGeometry(s, 8, 8);
      geo.scale(0.5, 0.4, 1.0); // Elongated along Z
      return geo;
    } else {
      // Insect body
      const geo = new BoxGeometry(s * 0.5, s * 0.3, s * 0.8);
      return geo;
    }
  }

  private computeSeparation(index: number): Vector3 {
    const boid = this.boids[index];
    const steer = new Vector3();
    let count = 0;

    for (let i = 0; i < this.boids.length; i++) {
      if (i === index) continue;
      const dist = boid.position.distanceTo(this.boids[i].position);
      if (dist < this.config.separationDistance && dist > 0) {
        const diff = boid.position.clone().sub(this.boids[i].position);
        diff.divideScalar(dist * dist); // Weight by inverse distance
        steer.add(diff);
        count++;
      }
    }

    if (count > 0) {
      steer.divideScalar(count);
    }

    return steer;
  }

  private computeAlignment(index: number): Vector3 {
    const boid = this.boids[index];
    const avgVelocity = new Vector3();
    let count = 0;

    for (let i = 0; i < this.boids.length; i++) {
      if (i === index) continue;
      const dist = boid.position.distanceTo(this.boids[i].position);
      if (dist < this.config.neighborRadius) {
        avgVelocity.add(this.boids[i].velocity);
        count++;
      }
    }

    if (count > 0) {
      avgVelocity.divideScalar(count);
      // Steer towards average velocity
      return avgVelocity.sub(boid.velocity).multiplyScalar(0.1);
    }

    return avgVelocity;
  }

  private computeCohesion(index: number): Vector3 {
    const boid = this.boids[index];
    const centerOfMass = new Vector3();
    let count = 0;

    for (let i = 0; i < this.boids.length; i++) {
      if (i === index) continue;
      const dist = boid.position.distanceTo(this.boids[i].position);
      if (dist < this.config.neighborRadius) {
        centerOfMass.add(this.boids[i].position);
        count++;
      }
    }

    if (count > 0) {
      centerOfMass.divideScalar(count);
      // Steer towards center of mass
      return centerOfMass.sub(boid.position).multiplyScalar(0.05);
    }

    return centerOfMass;
  }

  private computeBoundary(index: number): Vector3 {
    const boid = this.boids[index];
    const steer = new Vector3();
    const center = this.config.center;
    const bounds = this.config.bounds;

    // Soft boundary: increase force as distance from center increases
    const dx = boid.position.x - center.x;
    const dy = boid.position.y - center.y;
    const dz = boid.position.z - center.z;

    const margin = 0.8; // Start pushing back at 80% of boundary

    if (Math.abs(dx) > bounds.x * margin) {
      steer.x -= dx * 0.1;
    }
    if (Math.abs(dy) > bounds.y * margin) {
      steer.y -= dy * 0.1;
    }
    if (Math.abs(dz) > bounds.z * margin) {
      steer.z -= dz * 0.1;
    }

    return steer;
  }

  private computePredatorAvoidance(index: number): Vector3 {
    if (!this.config.predatorPosition) return new Vector3();

    const boid = this.boids[index];
    const dist = boid.position.distanceTo(this.config.predatorPosition);

    if (dist < this.config.predatorAvoidanceRadius && dist > 0) {
      const flee = boid.position.clone().sub(this.config.predatorPosition);
      flee.normalize().multiplyScalar(this.config.predatorAvoidanceRadius / dist);
      return flee;
    }

    return new Vector3();
  }

  private updateInstancedMesh(): void {
    for (let i = 0; i < this.boids.length; i++) {
      const boid = this.boids[i];

      this.tempPosition.copy(boid.position);

      // Orient the boid in the direction of its velocity
      if (boid.velocity.lengthSq() > 0.001) {
        const forward = boid.velocity.clone().normalize();
        this.tempQuaternion.setFromUnitVectors(
          new Vector3(0, 0, 1),
          forward,
        );
      }

      // Add slight body oscillation for swimming/flying
      if (this.config.swarmType === 'fish') {
        this.tempPosition.y += Math.sin(this.elapsedTime * 5 + i * 0.5) * 0.02;
      }

      this.tempMatrix.compose(
        this.tempPosition,
        this.tempQuaternion,
        new Vector3(1, 1, 1),
      );

      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
