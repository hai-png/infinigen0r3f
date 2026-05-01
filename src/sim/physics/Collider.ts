/**
 * Collider - Collision shapes for physics bodies
 * Supports box, sphere, and cylinder shapes
 */
import { Vector3, Matrix4 } from 'three';

export type ColliderShape = 'box' | 'sphere' | 'cylinder';

export interface ColliderConfig {
  id: string;
  shape: ColliderShape;
  /** Half-extents for box */
  halfExtents?: Vector3;
  /** Radius for sphere, cylinder */
  radius?: number;
  /** Height for cylinder */
  height?: number;
  /** Local offset from body position */
  offset?: Vector3;
  /** Collision layer bits */
  collisionLayers?: number;
  /** Collision mask bits */
  collisionMask?: number;
  /** Is this a trigger (no physical response) */
  isTrigger?: boolean;
  /** Friction coefficient */
  friction?: number;
  /** Restitution (bounciness) */
  restitution?: number;
}

export class Collider {
  public id: string;
  public shape: ColliderShape;
  public halfExtents: Vector3;
  public radius: number;
  public height: number;
  public offset: Vector3;
  public collisionLayers: number;
  public collisionMask: number;
  public isTrigger: boolean;
  public friction: number;
  public restitution: number;

  // World-space AABB (computed during broadphase)
  public aabbMin: Vector3 = new Vector3();
  public aabbMax: Vector3 = new Vector3();

  // Reference to the body this collider is attached to
  public bodyId: string | null = null;

  constructor(config: ColliderConfig) {
    this.id = config.id;
    this.shape = config.shape;
    this.halfExtents = config.halfExtents?.clone() || new Vector3(0.5, 0.5, 0.5);
    this.radius = config.radius ?? 0.5;
    this.height = config.height ?? 1.0;
    this.offset = config.offset?.clone() || new Vector3();
    this.collisionLayers = config.collisionLayers ?? 0x1;
    this.collisionMask = config.collisionMask ?? 0xFFFFFFFF;
    this.isTrigger = config.isTrigger ?? false;
    this.friction = config.friction ?? 0.5;
    this.restitution = config.restitution ?? 0.3;
  }

  /**
   * Update the AABB based on the body's world transform
   * For boxes, properly accounts for rotation by transforming all 8 corners.
   */
  updateAABB(position: Vector3, rotation: Matrix4): void {
    const worldPos = position.clone().add(this.offset);

    switch (this.shape) {
      case 'box': {
        // Transform all 8 corners of the box by the rotation matrix,
        // then compute axis-aligned bounds from the rotated corners
        const hx = this.halfExtents.x;
        const hy = this.halfExtents.y;
        const hz = this.halfExtents.z;

        const corners = [
          new Vector3(-hx, -hy, -hz),
          new Vector3(-hx, -hy,  hz),
          new Vector3(-hx,  hy, -hz),
          new Vector3(-hx,  hy,  hz),
          new Vector3( hx, -hy, -hz),
          new Vector3( hx, -hy,  hz),
          new Vector3( hx,  hy, -hz),
          new Vector3( hx,  hy,  hz),
        ];

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const corner of corners) {
          corner.applyMatrix4(rotation);
          corner.add(worldPos);
          if (corner.x < minX) minX = corner.x;
          if (corner.y < minY) minY = corner.y;
          if (corner.z < minZ) minZ = corner.z;
          if (corner.x > maxX) maxX = corner.x;
          if (corner.y > maxY) maxY = corner.y;
          if (corner.z > maxZ) maxZ = corner.z;
        }

        this.aabbMin.set(minX, minY, minZ);
        this.aabbMax.set(maxX, maxY, maxZ);
        break;
      }
      case 'sphere': {
        this.aabbMin.set(worldPos.x - this.radius, worldPos.y - this.radius, worldPos.z - this.radius);
        this.aabbMax.set(worldPos.x + this.radius, worldPos.y + this.radius, worldPos.z + this.radius);
        break;
      }
      case 'cylinder': {
        // Conservative: treat as box with appropriate half-extents after rotation
        const halfH = this.height / 2;
        const r = this.radius;
        const corners = [
          new Vector3(-r, -halfH, -r),
          new Vector3(-r, -halfH,  r),
          new Vector3(-r,  halfH, -r),
          new Vector3(-r,  halfH,  r),
          new Vector3( r, -halfH, -r),
          new Vector3( r, -halfH,  r),
          new Vector3( r,  halfH, -r),
          new Vector3( r,  halfH,  r),
        ];

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const corner of corners) {
          corner.applyMatrix4(rotation);
          corner.add(worldPos);
          if (corner.x < minX) minX = corner.x;
          if (corner.y < minY) minY = corner.y;
          if (corner.z < minZ) minZ = corner.z;
          if (corner.x > maxX) maxX = corner.x;
          if (corner.y > maxY) maxY = corner.y;
          if (corner.z > maxZ) maxZ = corner.z;
        }

        this.aabbMin.set(minX, minY, minZ);
        this.aabbMax.set(maxX, maxY, maxZ);
        break;
      }
    }
  }

  /**
   * Get the world-space center of the collider
   */
  getWorldCenter(position: Vector3): Vector3 {
    return position.clone().add(this.offset);
  }

  /**
   * Check if this collider can collide with another based on layer masks
   */
  canCollideWith(other: Collider): boolean {
    if (this.isTrigger && other.isTrigger) return false;
    return (this.collisionLayers & other.collisionMask) !== 0 &&
           (other.collisionLayers & this.collisionMask) !== 0;
  }
}

export default Collider;
