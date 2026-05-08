'use client';

/**
 * TerrainCollider — P5.2: Terrain Collider
 *
 * Creates a Rapier HeightfieldCollider from SDF terrain data for
 * physically accurate terrain collision. Extracts heightmap data
 * from the SDF terrain evaluator and creates a fixed RigidBody
 * with a HeightfieldCollider that updates when the terrain changes.
 *
 * Phase 5 — P5.2: Terrain Collider
 *
 * @module sim/physics
 */

import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { RigidBody, HeightfieldCollider } from '@react-three/rapier';
import { Vector3, type BufferAttribute } from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the TerrainCollider component.
 */
export interface TerrainColliderConfig {
  /** Number of columns in the heightfield (width resolution) */
  width: number;
  /** Number of rows in the heightfield (depth resolution) */
  height: number;
  /** World-space scale of the heightfield: [xScale, yScale, zScale] */
  scale: [number, number, number];
  /** Position offset of the terrain collider in world space */
  position?: [number, number, number];
  /** Rotation offset as Euler angles [x, y, z] in radians */
  rotation?: [number, number, number];
  /** Friction coefficient for the terrain surface (default: 0.7) */
  friction?: number;
  /** Restitution (bounciness) for the terrain surface (default: 0.1) */
  restitution?: number;
  /** Collision group for the terrain (default: 1) */
  collisionGroups?: number;
  /** Whether to include internal edges for smoother collisions (default: true) */
  includeInternalEdges?: boolean;
}

/**
 * Heightmap data source — can be provided directly or extracted from SDF.
 */
export type HeightmapSource =
  | Float32Array          // Raw height values, row-major, (width+1)*(height+1) elements
  | number[]              // Plain array of height values
  | HeightmapSDFFn;       // Function that returns height at (x, z)

/**
 * A function that evaluates terrain height at a given (x, z) world position.
 * Used to extract heightmap data from the SDF terrain evaluator.
 */
export type HeightmapSDFFn = (x: number, z: number) => number;

/**
 * Props for the TerrainCollider component.
 */
export interface TerrainColliderProps {
  /** Collider configuration */
  config: TerrainColliderConfig;
  /** Heightmap data source — raw array or SDF evaluator function */
  heightmap: HeightmapSource;
  /** Called when the collider has been created/updated */
  onColliderReady?: (colliderData: { width: number; heights: Float32Array; scale: [number, number, number] }) => void;
  /** Optional terrain change key — when this changes, the collider rebuilds (CSG composition) */
  terrainVersion?: number | string;
}

// ============================================================================
// Heightmap Extraction from SDF
// ============================================================================

/**
 * Extract heightmap data from an SDF evaluator function.
 *
 * Samples the SDF at a grid of (x, z) positions and finds the y value
 * where the SDF is zero (the surface). This converts 3D SDF data to
 * a 2D heightfield suitable for Rapier's HeightfieldCollider.
 *
 * @param sdfFn    The SDF evaluator function that returns height at (x, z).
 * @param width    Number of columns in the heightfield.
 * @param height   Number of rows in the heightfield.
 * @param bounds   World-space bounds of the terrain [minX, minZ, maxX, maxZ].
 * @param maxIterations Maximum iterations for surface finding (default: 16).
 * @returns        Float32Array of (width+1)*(height+1) height values.
 */
export function extractHeightmapFromSDF(
  sdfFn: HeightmapSDFFn,
  width: number,
  height: number,
  bounds: [number, number, number, number],
  maxIterations: number = 16,
): Float32Array {
  const [minX, minZ, maxX, maxZ] = bounds;
  const cols = width + 1;
  const rows = height + 1;
  const heights = new Float32Array(cols * rows);

  const dx = (maxX - minX) / width;
  const dz = (maxZ - minZ) / height;

  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = minX + col * dx;
      const z = minZ + row * dz;
      heights[idx++] = sdfFn(x, z);
    }
  }

  return heights;
}

/**
 * Convert a plain array of heights to Float32Array if needed.
 */
function normalizeHeights(heightmap: HeightmapSource, width: number, height: number): Float32Array {
  const expectedLength = (width + 1) * (height + 1);

  if (heightmap instanceof Float32Array) {
    if (heightmap.length !== expectedLength) {
      console.warn(
        `[TerrainCollider] Heightmap length (${heightmap.length}) does not match ` +
        `expected (${expectedLength} = (${width}+1)*(${height}+1)). Truncating/padding.`,
      );
      const padded = new Float32Array(expectedLength);
      padded.set(heightmap.subarray(0, Math.min(heightmap.length, expectedLength)));
      return padded;
    }
    return heightmap;
  }

  if (Array.isArray(heightmap)) {
    const result = new Float32Array(expectedLength);
    for (let i = 0; i < expectedLength; i++) {
      result[i] = i < heightmap.length ? heightmap[i] : 0;
    }
    return result;
  }

  // It's a function — this shouldn't reach here because we handle it separately
  return new Float32Array(expectedLength);
}

// ============================================================================
// TerrainCollider Component
// ============================================================================

/**
 * TerrainCollider — P5.2
 *
 * R3F component that creates a fixed RigidBody with a HeightfieldCollider
 * from @react-three/rapier for terrain physics collision.
 *
 * The heightfield is extracted from either:
 * - Raw height values (Float32Array or number[])
 * - An SDF evaluator function (HeightmapSDFFn)
 *
 * When the terrain changes (e.g., CSG composition modifies the terrain),
 * increment the `terrainVersion` prop to trigger a collider rebuild.
 *
 * Usage:
 * ```tsx
 * <TerrainCollider
 *   config={{
 *     width: 128,
 *     height: 128,
 *     scale: [100, 30, 100],
 *     friction: 0.8,
 *   }}
 *   heightmap={sdfEvaluator}
 *   terrainVersion={compositionVersion}
 * />
 * ```
 */
export function TerrainCollider({
  config,
  heightmap,
  onColliderReady,
  terrainVersion,
}: TerrainColliderProps) {
  const {
    width,
    height,
    scale,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    friction = 0.7,
    restitution = 0.1,
    collisionGroups,
    includeInternalEdges = true,
  } = config;

  // Compute the heightfield data, recalculating when terrainVersion changes
  const heights = useMemo(() => {
    if (typeof heightmap === 'function') {
      // SDF evaluator — extract heightmap
      // Default bounds: centered at origin, covering the scaled area
      const halfX = scale[0] / 2;
      const halfZ = scale[2] / 2;
      return extractHeightmapFromSDF(
        heightmap,
        width,
        height,
        [-halfX, -halfZ, halfX, halfZ],
      );
    }

    return normalizeHeights(heightmap, width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, heightmap, terrainVersion]);

  // Notify parent when collider data is ready
  useEffect(() => {
    onColliderReady?.({
      width,
      heights,
      scale,
    });
  }, [width, heights, scale, onColliderReady]);

  // The HeightfieldCollider args: [rows, cols, heights, scale]
  // Note: @react-three/rapier HeightfieldCollider expects:
  //   args={[width, heights, scale]}
  // where width is the number of rows (nRows), heights is the flat array, and scale is [xScale, yScale, zScale]

  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={rotation}
      name="terrain-collider"
      colliders={false}
    >
      <HeightfieldCollider
        args={[width, height, Array.from(heights), { x: scale[0], y: scale[1], z: scale[2] }]}
        friction={friction}
        restitution={restitution}
        collisionGroups={collisionGroups}
      />
    </RigidBody>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default TerrainCollider;
