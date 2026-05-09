/**
 * Enhanced Voronoi Noise Module
 *
 * Provides a comprehensive Voronoi noise system that matches the original
 * Infinigen's Voronoi capabilities. Supports F1/F2/F3/F4 distance features,
 * edge distances (crack patterns), cell IDs (tile assignment), and multiple
 * distance metrics (Euclidean, Manhattan, Chebyshev, Minkowski).
 *
 * All functions are fully deterministic — the same seed and inputs always
 * produce the same output. No Math.random() anywhere.
 *
 * Ported from Princeton's Infinigen procedural generation system.
 */

import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types & Enums
// ============================================================================

/**
 * Result of a Voronoi feature computation containing all distance orders,
 * edge distance, and cell identification information.
 */
export interface VoronoiFeatureResult {
  /** F1 distance (nearest feature point) */
  f1: number;
  /** F2 distance (2nd nearest feature point) */
  f2: number;
  /** F3 distance (3rd nearest feature point) */
  f3: number;
  /** F4 distance (4th nearest feature point) */
  f4: number;
  /** F2 - F1 edge distance (crack pattern intensity) */
  edgeDistance: number;
  /** Cell ID of the nearest feature point (for tile assignment) */
  cellId: number;
  /** Position of the nearest feature point */
  nearestPosition: [number, number, number];
  /** Distance from query point to nearest feature point (same as f1) */
  distance: number;
}

/**
 * Supported distance metrics for Voronoi computation.
 *
 * - **Euclidean**: Straight-line distance (L2 norm)
 * - **Manhattan**: Sum of absolute differences (L1 norm)
 * - **Chebyshev**: Maximum of absolute differences (L-infinity norm)
 * - **Minkowski**: Generalized Lp norm with configurable exponent
 */
export enum VoronoiDistanceMetric {
  Euclidean = 'euclidean',
  Manhattan = 'manhattan',
  Chebyshev = 'chebyshev',
  Minkowski = 'minkowski',
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Deterministic integer hash (2 inputs) */
function cellHash2D(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h & 0x7fffffff);
}

/** Deterministic integer hash (3 inputs) */
function cellHash3D(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1013904223) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16));
  return Math.abs(h & 0x7fffffff);
}

/**
 * Compute distance between two points using the specified metric.
 * For 2D, set dz = 0.
 */
function computeDistance(
  dx: number,
  dy: number,
  dz: number,
  metric: VoronoiDistanceMetric,
  minkowskiExponent: number
): number {
  switch (metric) {
    case VoronoiDistanceMetric.Euclidean:
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    case VoronoiDistanceMetric.Manhattan:
      return Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    case VoronoiDistanceMetric.Chebyshev:
      return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    case VoronoiDistanceMetric.Minkowski: {
      const p = minkowskiExponent;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const adz = Math.abs(dz);
      if (p >= 100) {
        // For very large exponents, approach Chebyshev
        return Math.max(adx, ady, adz);
      }
      return Math.pow(Math.pow(adx, p) + Math.pow(ady, p) + Math.pow(adz, p), 1.0 / p);
    }
    default:
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

/**
 * Insert a distance into a sorted array of the 4 smallest distances.
 * Returns the updated array [f1, f2, f3, f4] in ascending order.
 */
function insertDistance(
  distances: [number, number, number, number],
  d: number
): [number, number, number, number] {
  if (d < distances[0]) {
    return [d, distances[0], distances[1], distances[2]];
  }
  if (d < distances[1]) {
    return [distances[0], d, distances[1], distances[2]];
  }
  if (d < distances[2]) {
    return [distances[0], distances[1], d, distances[2]];
  }
  if (d < distances[3]) {
    return [distances[0], distances[1], distances[2], d];
  }
  return distances;
}

// ============================================================================
// VoronoiFeatureCalculator
// ============================================================================

/**
 * A fully-deterministic enhanced Voronoi noise calculator that computes
 * F1/F2/F3/F4 distance features, edge distances (for crack patterns),
 * and cell IDs (for tile/patch assignment).
 *
 * Designed to match the original Infinigen Voronoi capabilities used
 * for rock fracture patterns, tile generation, and cellular structures.
 *
 * Usage:
 *   const calc = new VoronoiFeatureCalculator(42);
 *   const result = calc.compute2D(1.5, 2.3, 4.0);
 *   console.log(result.f1, result.edgeDistance, result.cellId);
 *
 *   const calc3d = new VoronoiFeatureCalculator(7, VoronoiDistanceMetric.Manhattan);
 *   const result3d = calc3d.compute3D(1.0, 2.0, 3.0, 2.0);
 */
export class VoronoiFeatureCalculator {
  private readonly seed: number;
  private readonly metric: VoronoiDistanceMetric;
  private readonly minkowskiExponent: number;

  /**
   * Create a new VoronoiFeatureCalculator.
   *
   * @param seed - Deterministic seed for feature point generation
   * @param metric - Distance metric to use (default: Euclidean)
   * @param minkowskiExponent - Exponent for Minkowski metric (default: 3.0).
   *                            Only used when metric is Minkowski.
   */
  constructor(
    seed: number = 0,
    metric: VoronoiDistanceMetric = VoronoiDistanceMetric.Euclidean,
    minkowskiExponent: number = 3.0
  ) {
    this.seed = seed;
    this.metric = metric;
    this.minkowskiExponent = minkowskiExponent;
  }

  /** Return the seed this calculator was created with. */
  getSeed(): number {
    return this.seed;
  }

  /** Return the distance metric being used. */
  getMetric(): VoronoiDistanceMetric {
    return this.metric;
  }

  // --------------------------------------------------------------------------
  // 2D Voronoi Feature Computation
  // --------------------------------------------------------------------------

  /**
   * Compute all Voronoi features for a 2D query point.
   *
   * Searches a 3x3 neighborhood of cells for feature points, tracks the
   * 4 smallest distances (F1-F4), and returns the full feature result
   * including edge distance and cell ID.
   *
   * @param x - X coordinate of the query point
   * @param y - Y coordinate of the query point
   * @param scale - Scale factor applied to coordinates (default 1.0).
   *                Higher values create smaller, denser cells.
   * @returns VoronoiFeatureResult with all computed features
   */
  compute2D(x: number, y: number, scale: number = 1.0): VoronoiFeatureResult {
    const sx = x * scale;
    const sy = y * scale;
    const cellX = Math.floor(sx);
    const cellY = Math.floor(sy);

    // Track the 4 smallest distances
    let distances: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity];
    let nearestCellX = cellX;
    let nearestCellY = cellY;
    let nearestFeatureX = 0;
    let nearestFeatureY = 0;

    // Search 3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cellX + dx;
        const ny = cellY + dy;

        // Use SeededRandom with deterministic hash for feature point position
        const cellSeed = cellHash2D(nx, ny) ^ this.seed;
        const rng = new SeededRandom(cellSeed);

        // Generate feature point position within this cell
        const fx = nx + rng.next();
        const fy = ny + rng.next();

        // Compute distance to feature point
        const distX = sx - fx;
        const distY = sy - fy;
        const dist = computeDistance(distX, distY, 0, this.metric, this.minkowskiExponent);

        // Update nearest tracking
        if (dist < distances[0]) {
          nearestCellX = nx;
          nearestCellY = ny;
          nearestFeatureX = fx;
          nearestFeatureY = fy;
        }

        distances = insertDistance(distances, dist);
      }
    }

    const f1 = distances[0];
    const f2 = distances[1];
    const edgeDistance = f2 - f1;
    const cellId = cellHash2D(nearestCellX, nearestCellY);

    return {
      f1,
      f2,
      f3: distances[2],
      f4: distances[3],
      edgeDistance,
      cellId,
      nearestPosition: [nearestFeatureX, nearestFeatureY, 0],
      distance: f1,
    };
  }

  // --------------------------------------------------------------------------
  // 3D Voronoi Feature Computation
  // --------------------------------------------------------------------------

  /**
   * Compute all Voronoi features for a 3D query point.
   *
   * Searches a 3x3x3 neighborhood of cells for feature points, tracks the
   * 4 smallest distances (F1-F4), and returns the full feature result
   * including edge distance and cell ID.
   *
   * @param x - X coordinate of the query point
   * @param y - Y coordinate of the query point
   * @param z - Z coordinate of the query point
   * @param scale - Scale factor applied to coordinates (default 1.0).
   *                Higher values create smaller, denser cells.
   * @returns VoronoiFeatureResult with all computed features
   */
  compute3D(x: number, y: number, z: number, scale: number = 1.0): VoronoiFeatureResult {
    const sx = x * scale;
    const sy = y * scale;
    const sz = z * scale;
    const cellX = Math.floor(sx);
    const cellY = Math.floor(sy);
    const cellZ = Math.floor(sz);

    // Track the 4 smallest distances
    let distances: [number, number, number, number] = [Infinity, Infinity, Infinity, Infinity];
    let nearestCellX = cellX;
    let nearestCellY = cellY;
    let nearestCellZ = cellZ;
    let nearestFeatureX = 0;
    let nearestFeatureY = 0;
    let nearestFeatureZ = 0;

    // Search 3x3x3 neighborhood
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const nx = cellX + dx;
          const ny = cellY + dy;
          const nz = cellZ + dz;

          // Use SeededRandom with deterministic hash for feature point position
          const cellSeed = cellHash3D(nx, ny, nz) ^ this.seed;
          const rng = new SeededRandom(cellSeed);

          // Generate feature point position within this cell
          const fx = nx + rng.next();
          const fy = ny + rng.next();
          const fz = nz + rng.next();

          // Compute distance to feature point
          const distX = sx - fx;
          const distY = sy - fy;
          const distZ = sz - fz;
          const dist = computeDistance(distX, distY, distZ, this.metric, this.minkowskiExponent);

          // Update nearest tracking
          if (dist < distances[0]) {
            nearestCellX = nx;
            nearestCellY = ny;
            nearestCellZ = nz;
            nearestFeatureX = fx;
            nearestFeatureY = fy;
            nearestFeatureZ = fz;
          }

          distances = insertDistance(distances, dist);
        }
      }
    }

    const f1 = distances[0];
    const f2 = distances[1];
    const edgeDistance = f2 - f1;
    const cellId = cellHash3D(nearestCellX, nearestCellY, nearestCellZ);

    return {
      f1,
      f2,
      f3: distances[2],
      f4: distances[3],
      edgeDistance,
      cellId,
      nearestPosition: [nearestFeatureX, nearestFeatureY, nearestFeatureZ],
      distance: f1,
    };
  }
}

// ============================================================================
// Default Global Instance (deterministic — seed 0, Euclidean metric)
// ============================================================================

/**
 * Default global VoronoiFeatureCalculator instance with seed 0 and
 * Euclidean metric. Deterministic: always produces the same output for
 * the same inputs. For reproducible results across your application,
 * prefer creating your own VoronoiFeatureCalculator with an explicit seed.
 */
export const defaultVoronoiCalculator = new VoronoiFeatureCalculator(0);

// ============================================================================
// Standalone Convenience Functions
// ============================================================================

/**
 * Compute all 2D Voronoi features using the default calculator (seed 0).
 */
export function voronoiFeatures2D(x: number, y: number, scale: number = 1.0): VoronoiFeatureResult {
  return defaultVoronoiCalculator.compute2D(x, y, scale);
}

/**
 * Compute all 3D Voronoi features using the default calculator (seed 0).
 */
export function voronoiFeatures3D(
  x: number,
  y: number,
  z: number,
  scale: number = 1.0
): VoronoiFeatureResult {
  return defaultVoronoiCalculator.compute3D(x, y, z, scale);
}

/**
 * 2D Voronoi edge distance (F2 - F1) using the default calculator (seed 0).
 *
 * Edge distance is small near cell boundaries and large near cell centers,
 * making it ideal for crack and fracture patterns in Infinigen.
 *
 * @returns Edge distance (F2 - F1)
 */
export function voronoiEdge2D(x: number, y: number, scale: number = 1.0): number {
  return defaultVoronoiCalculator.compute2D(x, y, scale).edgeDistance;
}

/**
 * 3D Voronoi edge distance (F2 - F1) using the default calculator (seed 0).
 *
 * Edge distance is small near cell boundaries and large near cell centers,
 * making it ideal for crack and fracture patterns in Infinigen.
 *
 * @returns Edge distance (F2 - F1)
 */
export function voronoiEdge3D(x: number, y: number, z: number, scale: number = 1.0): number {
  return defaultVoronoiCalculator.compute3D(x, y, z, scale).edgeDistance;
}

/**
 * 2D Voronoi cell ID using the default calculator (seed 0).
 *
 * Cell ID is a deterministic hash of the nearest cell's coordinates,
 * allowing consistent tile/patch assignment per Voronoi cell.
 *
 * @returns Cell ID (deterministic hash)
 */
export function voronoiCellId2D(x: number, y: number, scale: number = 1.0): number {
  return defaultVoronoiCalculator.compute2D(x, y, scale).cellId;
}

/**
 * 3D Voronoi cell ID using the default calculator (seed 0).
 *
 * Cell ID is a deterministic hash of the nearest cell's coordinates,
 * allowing consistent tile/patch assignment per Voronoi cell.
 *
 * @returns Cell ID (deterministic hash)
 */
export function voronoiCellId3D(x: number, y: number, z: number, scale: number = 1.0): number {
  return defaultVoronoiCalculator.compute3D(x, y, z, scale).cellId;
}
