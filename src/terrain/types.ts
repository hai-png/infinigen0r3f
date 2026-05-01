/**
 * Unified Terrain Types
 *
 * This module defines shared terrain data types used across the terrain
 * generation pipeline. Previously, HeightMap was defined as two incompatible
 * types in different files:
 *
 * - core/TerrainGenerator.ts: type HeightMap = Float32Array
 * - mesher/TerrainGenerator.ts: interface HeightMap { data, width, height, bounds }
 *
 * This unified type reconciles both: it carries the structured metadata
 * (width, height, bounds) while also providing convenient indexed access
 * through a Proxy or helper functions.
 */

/**
 * Unified HeightMap interface
 *
 * Contains the raw float data plus dimensions and optional world-space bounds.
 * Use `heightMapFromFloat32Array()` to create one from raw data,
 * or access `.data` directly for raw array operations.
 */
export interface HeightMap {
  /** Raw height values as a flat Float32Array (row-major: y * width + x) */
  data: Float32Array;
  /** Number of columns */
  width: number;
  /** Number of rows */
  height: number;
  /** Optional world-space bounds for the heightmap */
  bounds?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

/**
 * Normal map data structure
 */
export interface NormalMap {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * Create a HeightMap from a raw Float32Array with dimensions.
 *
 * @param data   Flat array of height values (row-major order)
 * @param width  Number of columns
 * @param height Number of rows
 * @param bounds Optional world-space bounds
 * @returns A properly structured HeightMap
 */
export function heightMapFromFloat32Array(
  data: Float32Array,
  width: number,
  height: number,
  bounds?: HeightMap['bounds']
): HeightMap {
  return { data, width, height, bounds };
}

/**
 * Sample height at fractional coordinates using bilinear interpolation.
 *
 * @param heightMap The height map
 * @param x         X coordinate (column)
 * @param y         Y coordinate (row)
 * @returns Interpolated height value
 */
export function sampleHeightAt(heightMap: HeightMap, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);

  if (xi < 0 || xi >= heightMap.width - 1 || yi < 0 || yi >= heightMap.height - 1) {
    return 0;
  }

  const xf = x - xi;
  const yf = y - yi;

  const idx00 = yi * heightMap.width + xi;
  const idx10 = yi * heightMap.width + (xi + 1);
  const idx01 = (yi + 1) * heightMap.width + xi;
  const idx11 = (yi + 1) * heightMap.width + (xi + 1);

  return (
    heightMap.data[idx00] * (1 - xf) * (1 - yf) +
    heightMap.data[idx10] * xf * (1 - yf) +
    heightMap.data[idx01] * (1 - xf) * yf +
    heightMap.data[idx11] * xf * yf
  );
}

/**
 * Get the raw value at integer coordinates (no interpolation).
 *
 * @param heightMap The height map
 * @param x         X coordinate (column)
 * @param y         Y coordinate (row)
 * @returns Height value, or 0 if out of bounds
 */
export function getHeightValueAt(heightMap: HeightMap, x: number, y: number): number {
  if (x < 0 || x >= heightMap.width || y < 0 || y >= heightMap.height) {
    return 0;
  }
  return heightMap.data[y * heightMap.width + x];
}

/**
 * Set the raw value at integer coordinates.
 *
 * @param heightMap The height map
 * @param x         X coordinate (column)
 * @param y         Y coordinate (row)
 * @param value     Height value to set
 */
export function setHeightValueAt(heightMap: HeightMap, x: number, y: number, value: number): void {
  if (x >= 0 && x < heightMap.width && y >= 0 && y < heightMap.height) {
    heightMap.data[y * heightMap.width + x] = value;
  }
}
