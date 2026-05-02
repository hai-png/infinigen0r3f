/**
 * Visibility Culler for Infinigen R3F
 *
 * Determines which objects are visible from a given camera:
 * - Frustum culling: skip objects outside camera view
 * - Distance culling: skip objects beyond max distance
 * - Occlusion culling: basic occlusion query (if implemented)
 * - Horizon culling: skip objects below terrain horizon
 * - Priority-based: keep important objects (large trees, creatures) longer
 * - Integration with LOD system
 */

import { Vector3, Box3, Sphere, Frustum, Matrix4, Plane, Ray } from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CullReason = 'frustum' | 'distance' | 'occlusion' | 'horizon' | 'none';

export interface CullableObject {
  id: string;
  bounds: Box3;
  center: Vector3;
  position: Vector3;
  priority: number; // 0-1, higher = kept longer
  category: string; // e.g. 'tree', 'creature', 'rock', 'grass'
  lodLevel: number; // Current LOD level (0=high, 3=culled)
  boundingRadius: number;
}

export interface CullingConfig {
  /** Maximum render distance */
  maxDistance: number;
  /** Distance at which LOD transitions begin */
  lodStartDistance: number;
  /** Distance multipliers per priority level */
  priorityDistanceMultipliers: Record<string, number>;
  /** Whether to perform frustum culling */
  frustumCulling: boolean;
  /** Whether to perform distance culling */
  distanceCulling: boolean;
  /** Whether to perform occlusion culling (expensive) */
  occlusionCulling: boolean;
  /** Whether to perform horizon culling */
  horizonCulling: boolean;
  /** Terrain height function for horizon culling */
  terrainHeightFn?: (x: number, z: number) => number;
  /** Number of occlusion samples per frame (0 = disabled) */
  occlusionSamples: number;
}

export interface CullingResult {
  visible: CullableObject[];
  culled: CullableObject[];
  stats: CullingStats;
}

export interface CullingStats {
  totalObjects: number;
  visibleCount: number;
  culledCount: number;
  frustumCulled: number;
  distanceCulled: number;
  occlusionCulled: number;
  horizonCulled: number;
  priorityPreserved: number;
  processingTimeMs: number;
}

export interface LODLevel {
  minDistance: number;
  maxDistance: number;
  lodLevel: number;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CullingConfig = {
  maxDistance: 300,
  lodStartDistance: 30,
  priorityDistanceMultipliers: {
    tree: 1.5,
    creature: 2.0,
    rock: 1.2,
    grass: 0.7,
    flower: 0.6,
    mushroom: 0.5,
    pebble: 0.4,
    default: 1.0,
  },
  frustumCulling: true,
  distanceCulling: true,
  occlusionCulling: false,
  horizonCulling: true,
  occlusionSamples: 0,
};

// ---------------------------------------------------------------------------
// VisibilityCuller
// ---------------------------------------------------------------------------

export class VisibilityCuller {
  private config: CullingConfig;
  private frustum: Frustum;
  private projScreenMatrix: Matrix4;
  private lodLevels: LODLevel[];

  constructor(config: Partial<CullingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.frustum = new Frustum();
    this.projScreenMatrix = new Matrix4();
    this.lodLevels = [
      { minDistance: 0, maxDistance: 30, lodLevel: 0 },    // High detail
      { minDistance: 30, maxDistance: 80, lodLevel: 1 },   // Medium detail
      { minDistance: 80, maxDistance: 200, lodLevel: 2 },  // Low detail
      { minDistance: 200, maxDistance: 400, lodLevel: 3 },  // Billboard / culled
    ];
  }

  // -----------------------------------------------------------------------
  // Main culling pass
  // -----------------------------------------------------------------------

  cull(
    objects: CullableObject[],
    cameraPosition: Vector3,
    cameraProjectionMatrix: Matrix4,
    cameraWorldMatrix: Matrix4,
  ): CullingResult {
    const startTime = performance.now();

    // Update frustum
    this.projScreenMatrix.multiplyMatrices(cameraProjectionMatrix, cameraWorldMatrix);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const visible: CullableObject[] = [];
    const culled: CullableObject[] = [];
    const stats: CullingStats = {
      totalObjects: objects.length,
      visibleCount: 0,
      culledCount: 0,
      frustumCulled: 0,
      distanceCulled: 0,
      occlusionCulled: 0,
      horizonCulled: 0,
      priorityPreserved: 0,
      processingTimeMs: 0,
    };

    for (const obj of objects) {
      const result = this.testVisibility(obj, cameraPosition);

      if (result.visible) {
        // Update LOD level
        obj.lodLevel = this.calculateLOD(obj, cameraPosition);
        visible.push(obj);
      } else {
        obj.lodLevel = 3; // Mark as culled
        culled.push(obj);

        switch (result.reason) {
          case 'frustum': stats.frustumCulled++; break;
          case 'distance': stats.distanceCulled++; break;
          case 'occlusion': stats.occlusionCulled++; break;
          case 'horizon': stats.horizonCulled++; break;
        }
      }
    }

    stats.visibleCount = visible.length;
    stats.culledCount = culled.length;
    stats.priorityPreserved = visible.filter(o => o.priority > 0.7).length;
    stats.processingTimeMs = performance.now() - startTime;

    return { visible, culled, stats };
  }

  // -----------------------------------------------------------------------
  // Individual visibility tests
  // -----------------------------------------------------------------------

  private testVisibility(obj: CullableObject, cameraPosition: Vector3): { visible: boolean; reason: CullReason } {
    // 1. Distance culling (with priority extension)
    if (this.config.distanceCulling) {
      const distance = cameraPosition.distanceTo(obj.position);
      const maxDist = this.getMaxDistanceForObject(obj);
      if (distance > maxDist) {
        return { visible: false, reason: 'distance' };
      }
    }

    // 2. Frustum culling
    if (this.config.frustumCulling) {
      if (!this.isInFrustum(obj)) {
        return { visible: false, reason: 'frustum' };
      }
    }

    // 3. Horizon culling
    if (this.config.horizonCulling && this.config.terrainHeightFn) {
      if (this.isBelowHorizon(obj, cameraPosition)) {
        return { visible: false, reason: 'horizon' };
      }
    }

    // 4. Occlusion culling (basic, optional)
    if (this.config.occlusionCulling && this.config.occlusionSamples > 0) {
      if (this.isOccluded(obj, cameraPosition)) {
        return { visible: false, reason: 'occlusion' };
      }
    }

    return { visible: true, reason: 'none' };
  }

  /**
   * Test if object is within the camera frustum
   */
  private isInFrustum(obj: CullableObject): boolean {
    // Create a sphere from the object bounds
    const sphere = new Sphere();
    obj.bounds.getBoundingSphere(sphere);

    return this.frustum.intersectsSphere(sphere);
  }

  /**
   * Get maximum visible distance for an object (considering priority)
   */
  private getMaxDistanceForObject(obj: CullableObject): number {
    const multiplier = this.config.priorityDistanceMultipliers[obj.category]
      ?? this.config.priorityDistanceMultipliers.default
      ?? 1.0;

    // Priority also extends distance
    const priorityBoost = 1 + obj.priority * 0.5;

    return this.config.maxDistance * multiplier * priorityBoost;
  }

  /**
   * Test if object is below the terrain horizon as seen from the camera
   */
  private isBelowHorizon(obj: CullableObject, cameraPosition: Vector3): boolean {
    if (!this.config.terrainHeightFn) return false;

    const terrainHeight = this.config.terrainHeightFn(obj.position.x, obj.position.z);
    const objBottom = obj.bounds.min.y;

    // If object is above terrain, it's not below horizon
    if (objBottom >= terrainHeight) return false;

    // Check if the line of sight is blocked by terrain
    const direction = obj.position.clone().sub(cameraPosition);
    const distance = direction.length();
    direction.normalize();

    // Sample along the ray
    const samples = Math.min(20, Math.floor(distance / 2));
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const samplePoint = cameraPosition.clone().add(direction.clone().multiplyScalar(distance * t));
      const sampleTerrainH = this.config.terrainHeightFn(samplePoint.x, samplePoint.z);

      if (samplePoint.y < sampleTerrainH) {
        return true; // Blocked by terrain
      }
    }

    return false;
  }

  /**
   * Basic occlusion culling - test if object is occluded by closer objects
   */
  private isOccluded(obj: CullableObject, _cameraPosition: Vector3): boolean {
    // Basic implementation: objects with very small screen-space size and low priority
    // are considered occluded if there are many closer objects
    if (obj.priority > 0.7) return false; // High priority objects are never occluded
    if (obj.category === 'creature' || obj.category === 'tree') return false;

    // Simple heuristic: very small objects far away are likely occluded
    const distance = _cameraPosition.distanceTo(obj.position);
    const screenSize = obj.boundingRadius / distance;

    if (screenSize < 0.005 && obj.priority < 0.3) {
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // LOD calculation
  // -----------------------------------------------------------------------

  /**
   * Calculate the appropriate LOD level for an object
   */
  calculateLOD(obj: CullableObject, cameraPosition: Vector3): number {
    const distance = cameraPosition.distanceTo(obj.position);
    const priorityBoost = 1 - obj.priority * 0.3; // High priority keeps high LOD longer

    for (const level of this.lodLevels) {
      const adjustedMin = level.minDistance * priorityBoost;
      const adjustedMax = level.maxDistance * priorityBoost;

      if (distance >= adjustedMin && distance < adjustedMax) {
        return level.lodLevel;
      }
    }

    return 3; // Cull
  }

  /**
   * Update LOD levels for all visible objects
   */
  updateLODLevels(objects: CullableObject[], cameraPosition: Vector3): void {
    for (const obj of objects) {
      obj.lodLevel = this.calculateLOD(obj, cameraPosition);
    }
  }

  // -----------------------------------------------------------------------
  // Batch operations
  // -----------------------------------------------------------------------

  /**
   * Get only objects that should be rendered (LOD < 3)
   */
  getRenderableObjects(objects: CullableObject[], cameraPosition: Vector3, cameraProjectionMatrix: Matrix4, cameraWorldMatrix: Matrix4): CullableObject[] {
    const result = this.cull(objects, cameraPosition, cameraProjectionMatrix, cameraWorldMatrix);
    return result.visible.filter(o => o.lodLevel < 3);
  }

  /**
   * Get objects grouped by LOD level
   */
  getObjectsByLOD(objects: CullableObject[]): Map<number, CullableObject[]> {
    const groups = new Map<number, CullableObject[]>();
    for (const obj of objects) {
      const lod = obj.lodLevel;
      if (!groups.has(lod)) groups.set(lod, []);
      groups.get(lod)!.push(obj);
    }
    return groups;
  }

  // -----------------------------------------------------------------------
  // Config
  // -----------------------------------------------------------------------

  updateConfig(partial: Partial<CullingConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): CullingConfig {
    return { ...this.config };
  }

  setLODLevels(levels: LODLevel[]): void {
    this.lodLevels = levels.sort((a, b) => a.minDistance - b.minDistance);
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a CullableObject from basic data
 */
export function createCullableObject(
  id: string,
  position: Vector3,
  size: number,
  category: string,
  priority: number = 0.5,
): CullableObject {
  const halfSize = size * 0.5;
  const bounds = new Box3(
    new Vector3(position.x - halfSize, position.y - halfSize, position.z - halfSize),
    new Vector3(position.x + halfSize, position.y + halfSize, position.z + halfSize),
  );

  return {
    id,
    bounds,
    center: position.clone(),
    position: position.clone(),
    priority,
    category,
    lodLevel: 0,
    boundingRadius: size * 0.5,
  };
}
