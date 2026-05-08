/**
 * Occlusion Detection System
 *
 * Determines which objects in a scene are occluded (partially or fully hidden)
 * from the camera's viewpoint using raycasting. This replaces the previous
 * stub that always returned `visible: 1.0`.
 *
 * Algorithm:
 * 1. For each object, compute its axis-aligned bounding box (AABB)
 * 2. Cast rays from the camera through the bounding box center and multiple
 *    sample points on the bounding box faces
 * 3. Count how many rays reach the object vs. hit something else first
 * 4. visibilityFraction = rays_reaching_object / total_rays
 * 5. Track which objects are doing the occluding
 *
 * @see https://github.com/princeton-vl/infinigen/blob/main/infinigen/core/generate.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of occlusion detection for a single object.
 */
export interface OcclusionResult {
  /** Unique identifier for the object */
  objectId: string;
  /** Whether the object is considered visible (visibilityFraction > threshold) */
  visible: boolean;
  /** Fraction of sample rays that reach the object (0.0 to 1.0) */
  visibilityFraction: number;
  /** List of object IDs that are occluding this object */
  occluders: string[];
}

/**
 * Configuration for the OcclusionDetector.
 */
export interface OcclusionDetectorConfig {
  /** Number of sample rays per object (default: 20). More = more accurate but slower. */
  sampleCount?: number;
  /** Visibility threshold below which an object is considered occluded (default: 0.1) */
  visibilityThreshold?: number;
  /** Small offset along ray direction to avoid self-intersection (default: 0.01) */
  rayOffset?: number;
  /** Maximum distance for ray casting (default: 1000) */
  maxRayDistance?: number;
  /** Whether to include bounding box corner and edge samples (default: true) */
  includeEdgeSamples?: boolean;
  /** Seed for deterministic sampling of bounding box points (default: 42) */
  seed?: number;
}

// ============================================================================
// OcclusionDetector Class
// ============================================================================

/**
 * Detects occlusion of objects in a 3D scene from a camera's viewpoint.
 *
 * Uses THREE.Raycaster to cast rays from the camera through sample points
 * on each object's bounding box. The ratio of rays that reach the target
 * object vs. rays that hit another object first determines the visibility
 * fraction.
 */
export class OcclusionDetector {
  private camera: THREE.Camera;
  private config: Required<OcclusionDetectorConfig>;
  private raycaster: THREE.Raycaster;

  constructor(camera: THREE.Camera, config?: OcclusionDetectorConfig) {
    this.camera = camera;
    this.config = {
      sampleCount: config?.sampleCount ?? 20,
      visibilityThreshold: config?.visibilityThreshold ?? 0.1,
      rayOffset: config?.rayOffset ?? 0.01,
      maxRayDistance: config?.maxRayDistance ?? 1000,
      includeEdgeSamples: config?.includeEdgeSamples ?? true,
      seed: config?.seed ?? 42,
    };
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.001;
    this.raycaster.far = this.config.maxRayDistance;
  }

  /**
   * Update the camera used for occlusion detection.
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Detect occlusion for a list of objects in the scene.
   *
   * @param scene - The THREE.Scene containing the objects
   * @param objects - Array of objects to check for occlusion
   * @returns Map from object ID to OcclusionResult
   */
  detectOcclusion(
    scene: THREE.Scene,
    objects: THREE.Object3D[]
  ): Map<string, OcclusionResult> {
    const results = new Map<string, OcclusionResult>();

    // Get camera position once
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);

    // Build a lookup of all meshes in the scene for raycasting
    const allMeshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        allMeshes.push(child as THREE.Mesh);
      }
    });

    // Build a map from mesh to its root object (one of our `objects`)
    const meshToRoot = new Map<THREE.Object3D, THREE.Object3D>();
    for (const obj of objects) {
      obj.traverse((child) => {
        meshToRoot.set(child, obj);
      });
    }

    for (const obj of objects) {
      const objectId = obj.uuid;
      const samplePoints = this.generateSamplePoints(obj);

      if (samplePoints.length === 0) {
        // Object has no bounding box — treat as fully visible
        results.set(objectId, {
          objectId,
          visible: true,
          visibilityFraction: 1.0,
          occluders: [],
        });
        continue;
      }

      let raysReachingObject = 0;
      const occluderSet = new Set<string>();

      for (const point of samplePoints) {
        const direction = new THREE.Vector3()
          .subVectors(point, cameraPos)
          .normalize();

        // Offset the ray origin slightly to avoid self-intersection
        const rayOrigin = cameraPos.clone().add(
          direction.clone().multiplyScalar(this.config.rayOffset)
        );

        this.raycaster.set(rayOrigin, direction);
        const intersects = this.raycaster.intersectObjects(allMeshes, false);

        if (intersects.length === 0) {
          // No hit at all — ray goes to infinity, can't reach object
          continue;
        }

        const firstHit = intersects[0];
        const hitObject = firstHit.object;

        // Check if the hit object belongs to the target object
        const hitRoot = meshToRoot.get(hitObject);
        if (hitRoot === obj) {
          raysReachingObject++;
        } else {
          // Something else was hit first — it's an occluder
          if (hitRoot) {
            occluderSet.add(hitRoot.uuid);
          } else {
            occluderSet.add(hitObject.uuid);
          }
        }
      }

      const visibilityFraction = samplePoints.length > 0
        ? raysReachingObject / samplePoints.length
        : 1.0;

      results.set(objectId, {
        objectId,
        visible: visibilityFraction > this.config.visibilityThreshold,
        visibilityFraction,
        occluders: Array.from(occluderSet),
      });
    }

    return results;
  }

  /**
   * Compute a visibility map for all objects in the scene.
   *
   * @param scene - The THREE.Scene containing the objects
   * @param objects - Array of objects to check
   * @returns Map from object ID to visibility fraction (0.0 to 1.0)
   */
  computeVisibilityMap(
    scene: THREE.Scene,
    objects: THREE.Object3D[]
  ): Map<string, number> {
    const occlusionResults = this.detectOcclusion(scene, objects);
    const visibilityMap = new Map<string, number>();

    for (const [objectId, result] of occlusionResults) {
      visibilityMap.set(objectId, result.visibilityFraction);
    }

    return visibilityMap;
  }

  /**
   * Generate sample points on and around an object's bounding box.
   *
   * Always includes the bounding box center. If `includeEdgeSamples` is true,
   * also includes the 8 corners and the center of each of the 6 faces.
   * Additional random samples are distributed on the bounding box surface
   * using the configured seed for determinism.
   *
   * @param object - The THREE.Object3D to sample
   * @returns Array of world-space sample points
   */
  private generateSamplePoints(object: THREE.Object3D): THREE.Vector3[] {
    const bbox = new THREE.Box3().setFromObject(object);

    if (bbox.isEmpty()) {
      return [];
    }

    const points: THREE.Vector3[] = [];
    const rng = new SeededRandom(this.config.seed + hashString(object.uuid));

    // 1. Always include the center
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    points.push(center);

    if (this.config.includeEdgeSamples) {
      // 2. Include the 8 corners
      const corners = this.getBoxCorners(bbox);
      points.push(...corners);

      // 3. Include the 6 face centers
      const faceCenters = this.getFaceCenters(bbox);
      points.push(...faceCenters);
    }

    // 4. Add random samples on the bounding box surface
    const remainingSamples = Math.max(
      0,
      this.config.sampleCount - points.length
    );
    for (let i = 0; i < remainingSamples; i++) {
      points.push(this.randomPointOnBoxSurface(bbox, rng));
    }

    return points;
  }

  /**
   * Get the 8 corners of a bounding box in world space.
   */
  private getBoxCorners(bbox: THREE.Box3): THREE.Vector3[] {
    const { min, max } = bbox;
    return [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, max.z),
      new THREE.Vector3(max.x, max.y, max.z),
    ];
  }

  /**
   * Get the 6 face center points of a bounding box.
   */
  private getFaceCenters(bbox: THREE.Box3): THREE.Vector3[] {
    const { min, max } = bbox;
    const cx = (min.x + max.x) / 2;
    const cy = (min.y + max.y) / 2;
    const cz = (min.z + max.z) / 2;

    return [
      new THREE.Vector3(min.x, cy, cz), // -X face
      new THREE.Vector3(max.x, cy, cz), // +X face
      new THREE.Vector3(cx, min.y, cz), // -Y face
      new THREE.Vector3(cx, max.y, cz), // +Y face
      new THREE.Vector3(cx, cy, min.z), // -Z face
      new THREE.Vector3(cx, cy, max.z), // +Z face
    ];
  }

  /**
   * Generate a random point on the surface of a bounding box.
   */
  private randomPointOnBoxSurface(
    bbox: THREE.Box3,
    rng: SeededRandom
  ): THREE.Vector3 {
    const { min, max } = bbox;
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Surface areas of the 6 faces
    const ax = size.y * size.z; // ±X faces
    const ay = size.x * size.z; // ±Y faces
    const az = size.x * size.y; // ±Z faces
    const totalArea = 2 * (ax + ay + az);

    // Pick a face weighted by surface area
    let r = rng.next() * totalArea;
    let face: number; // 0-5

    if (r < ax) {
      face = 0; // -X
    } else if (r < 2 * ax) {
      face = 1; // +X
      r -= ax;
    } else if (r < 2 * ax + ay) {
      face = 2; // -Y
      r -= 2 * ax;
    } else if (r < 2 * ax + 2 * ay) {
      face = 3; // +Y
      r -= 2 * ax + ay;
    } else if (r < 2 * ax + 2 * ay + az) {
      face = 4; // -Z
      r -= 2 * ax + 2 * ay;
    } else {
      face = 5; // +Z
      r -= 2 * ax + 2 * ay + az;
    }

    const u = rng.next();
    const v = rng.next();

    switch (face) {
      case 0: return new THREE.Vector3(min.x, min.y + u * size.y, min.z + v * size.z);
      case 1: return new THREE.Vector3(max.x, min.y + u * size.y, min.z + v * size.z);
      case 2: return new THREE.Vector3(min.x + u * size.x, min.y, min.z + v * size.z);
      case 3: return new THREE.Vector3(min.x + u * size.x, max.y, min.z + v * size.z);
      case 4: return new THREE.Vector3(min.x + u * size.x, min.y + v * size.y, min.z);
      default: return new THREE.Vector3(min.x + u * size.x, min.y + v * size.y, max.z);
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Simple deterministic hash of a string to a number.
 * Used to vary the seed per object for sample point generation.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export default OcclusionDetector;
