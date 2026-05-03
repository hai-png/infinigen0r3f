/**
 * SDF Primitives — Core SDF Primitive Functions
 *
 * Implements core SDF primitive functions matching the original Infinigen's
 * terrain elements. All functions are pure (no side effects) and work with
 * the SeededRandom system for deterministic generation.
 *
 * Phase 2 — P2.1: SDF Primitive Library
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SDFPrimitiveResult {
  /** Signed distance value at the query point */
  distance: number;
  /** Material ID for multi-material support */
  materialId: number;
}

export type SDFEvaluator = (point: THREE.Vector3) => SDFPrimitiveResult;

// Material IDs for terrain multi-material support
export const TERRAIN_MATERIALS = {
  STONE: 0,
  SAND: 1,
  SOIL: 2,
  DIRT: 3,
  MUD: 4,
  SNOW: 5,
  ICE: 6,
  COBBLESTONE: 7,
  GRASS: 8,
  WATER: 9,
  LAVA: 10,
} as const;

// ---------------------------------------------------------------------------
// Basic SDF Primitives
// ---------------------------------------------------------------------------

/** SDF of a sphere centered at origin */
export function sdSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

/** SDF of a box with half-extents */
export function sdBox(point: THREE.Vector3, halfSize: THREE.Vector3): number {
  const q = new THREE.Vector3(
    Math.abs(point.x) - halfSize.x,
    Math.abs(point.y) - halfSize.y,
    Math.abs(point.z) - halfSize.z,
  );
  const outside = new THREE.Vector3(
    Math.max(q.x, 0),
    Math.max(q.y, 0),
    Math.max(q.z, 0),
  ).length();
  const inside = Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
  return outside + inside;
}

/** SDF of a torus in the XZ plane */
export function sdTorus(point: THREE.Vector3, majorRadius: number, minorRadius: number): number {
  const q = new THREE.Vector2(
    new THREE.Vector2(point.x, point.z).length() - majorRadius,
    point.y,
  );
  return q.length() - minorRadius;
}

/** SDF of a cylinder along the Y axis */
export function sdCylinder(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const d = new THREE.Vector2(point.x, point.z).length() - radius;
  const h = Math.abs(point.y) - halfHeight;
  const outside = new THREE.Vector2(Math.max(d, 0), Math.max(h, 0)).length();
  const inside = Math.min(Math.max(d, h), 0);
  return outside + inside;
}

/** SDF of a cone (tip at origin, base at y=-height) */
export function sdCone(point: THREE.Vector3, radius: number, height: number): number {
  const q = new THREE.Vector2(
    new THREE.Vector2(point.x, point.z).length(),
    point.y,
  );
  const tip = q.clone().sub(new THREE.Vector2(0, -height));
  const base = q.clone().sub(new THREE.Vector2(radius, 0));
  const h = tip.dot(base) < 0 ? tip.length() : base.dot(tip) < 0 ? base.length() : Math.abs(q.x * radius - q.y * height) / Math.sqrt(radius * radius + height * height);
  return h * Math.sign(q.y);
}

/** SDF of a capsule (cylinder with hemispherical caps) */
export function sdCapsule(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const p = new THREE.Vector3(point.x, Math.abs(point.y) - halfHeight, point.z);
  const d = new THREE.Vector2(
    new THREE.Vector2(p.x, p.z).length() - radius,
    p.y,
  );
  return Math.min(Math.max(d.x, d.y), 0.0) + new THREE.Vector2(Math.max(d.x, 0), Math.max(d.y, 0)).length();
}

/** SDF of an infinite ground plane at y=0 */
export function sdGroundPlane(point: THREE.Vector3): number {
  return point.y;
}

// ---------------------------------------------------------------------------
// Terrain-Specific SDF Primitives
// ---------------------------------------------------------------------------

/**
 * SDF of a mountain ridge — a stretched, noise-displaced cone shape.
 * The ridge extends along the X axis with a peak at the center.
 */
export function sdMountainRidge(
  point: THREE.Vector3,
  params: {
    height: number;
    width: number;
    depth: number;
    ridgeSharpness: number;
  },
  rng: SeededRandom,
): number {
  // Scale point to normalized coordinates
  const p = new THREE.Vector3(
    point.x / params.width,
    point.y / params.height,
    point.z / params.depth,
  );

  // Base cone shape
  const coneDist = sdCone(p, 1.0, 1.0);

  // Add ridge displacement along X
  const ridgeNoise = rng.next() * 0.2; // Deterministic slight variation
  const ridge = Math.abs(p.x) * params.ridgeSharpness + ridgeNoise;

  return coneDist + ridge * params.height * 0.1;
}

/**
 * SDF of a Voronoi rock formation — multiple scattered spheres
 * with noise-based displacement creating a rocky cluster.
 */
export function sdVoronoiRock(
  point: THREE.Vector3,
  params: {
    center: THREE.Vector3;
    baseRadius: number;
    cellCount: number;
    irregularity: number;
  },
  rng: SeededRandom,
): number {
  let minDist = Infinity;

  const localPoint = point.clone().sub(params.center);

  for (let i = 0; i < params.cellCount; i++) {
    // Generate cell center positions deterministically
    const cx = (rng.next() - 0.5) * params.baseRadius * 2;
    const cy = (rng.next() - 0.5) * params.baseRadius;
    const cz = (rng.next() - 0.5) * params.baseRadius * 2;
    const cellCenter = new THREE.Vector3(cx, cy, cz);

    // Cell radius varies
    const cellRadius = params.baseRadius * (0.3 + rng.next() * 0.7);

    const dist = localPoint.clone().sub(cellCenter).length() - cellRadius;
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

/**
 * SDF of a warped rock — a sphere with domain warping for organic deformation.
 * Uses fractal noise displacement to create eroded, natural-looking rock shapes.
 */
export function sdWarpedRock(
  point: THREE.Vector3,
  params: {
    center: THREE.Vector3;
    radius: number;
    warpStrength: number;
    warpFrequency: number;
    warpOctaves: number;
  },
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): number {
  const localPoint = point.clone().sub(params.center);

  // Domain warping: displace the input point with noise
  const warpX = noiseFn(
    localPoint.x * params.warpFrequency,
    localPoint.y * params.warpFrequency,
    localPoint.z * params.warpFrequency,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpY = noiseFn(
    localPoint.x * params.warpFrequency + 100,
    localPoint.y * params.warpFrequency + 100,
    localPoint.z * params.warpFrequency + 100,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpZ = noiseFn(
    localPoint.x * params.warpFrequency + 200,
    localPoint.y * params.warpFrequency + 200,
    localPoint.z * params.warpFrequency + 200,
    params.warpOctaves,
  ) * params.warpStrength;

  const warpedPoint = localPoint.clone().add(new THREE.Vector3(warpX, warpY, warpZ));

  return warpedPoint.length() - params.radius;
}

// ---------------------------------------------------------------------------
// SDF with Material ID
// ---------------------------------------------------------------------------

/**
 * Create an SDF evaluator function for a terrain element.
 * The evaluator returns both distance and material ID.
 */
export function createTerrainSDF(
  type: 'mountain' | 'cave' | 'rock' | 'ground' | 'waterbody' | 'arch',
  params: Record<string, any>,
  rng: SeededRandom,
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
): SDFEvaluator {
  switch (type) {
    case 'mountain':
      return (point: THREE.Vector3) => ({
        distance: sdMountainRidge(point, {
          height: params.height ?? 20,
          width: params.width ?? 30,
          depth: params.depth ?? 25,
          ridgeSharpness: params.ridgeSharpness ?? 2.0,
        }, rng),
        materialId: TERRAIN_MATERIALS.STONE,
      });

    case 'cave':
      return (point: THREE.Vector3) => {
        // Cave is a tunnel-like structure
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        const tunnelDist = sdCylinder(
          localPoint,
          params.radius ?? 3,
          params.halfLength ?? 15,
        );
        return {
          distance: tunnelDist,
          materialId: TERRAIN_MATERIALS.STONE,
        };
      };

    case 'rock':
      return (point: THREE.Vector3) => {
        if (params.warped) {
          return {
            distance: sdWarpedRock(point, {
              center: params.center ?? new THREE.Vector3(),
              radius: params.radius ?? 2,
              warpStrength: params.warpStrength ?? 0.5,
              warpFrequency: params.warpFrequency ?? 0.3,
              warpOctaves: params.warpOctaves ?? 3,
            }, noiseFn),
            materialId: TERRAIN_MATERIALS.STONE,
          };
        }
        return {
          distance: sdVoronoiRock(point, {
            center: params.center ?? new THREE.Vector3(),
            baseRadius: params.radius ?? 2,
            cellCount: params.cellCount ?? 5,
            irregularity: params.irregularity ?? 0.3,
          }, rng),
          materialId: TERRAIN_MATERIALS.COBBLESTONE,
        };
      };

    case 'ground':
      return (point: THREE.Vector3) => ({
        distance: sdGroundPlane(point),
        materialId: TERRAIN_MATERIALS.SOIL,
      });

    case 'waterbody':
      return (point: THREE.Vector3) => {
        // Water body is an ellipsoid below the water level
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        const scaledPoint = new THREE.Vector3(
          localPoint.x / (params.radiusX ?? 15),
          localPoint.y / (params.depth ?? 3),
          localPoint.z / (params.radiusZ ?? 15),
        );
        return {
          distance: scaledPoint.length() - 1.0,
          materialId: TERRAIN_MATERIALS.WATER,
        };
      };

    case 'arch':
      return (point: THREE.Vector3) => {
        const localPoint = point.clone().sub(params.center ?? new THREE.Vector3());
        return {
          distance: sdTorus(localPoint, params.majorRadius ?? 5, params.minorRadius ?? 1),
          materialId: TERRAIN_MATERIALS.STONE,
        };
      };

    default:
      return (_point: THREE.Vector3) => ({
        distance: Infinity,
        materialId: TERRAIN_MATERIALS.STONE,
      });
  }
}
