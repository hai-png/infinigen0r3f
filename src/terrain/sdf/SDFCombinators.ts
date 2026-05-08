/**
 * SDF Combinators — Boolean and Smooth Combinations
 *
 * Implements SDF boolean operations using mathematical smooth operators.
 * Supports smooth union, smooth intersection, smooth subtraction,
 * displacement warping (domain warping), and multi-material blending.
 *
 * Phase 2 — P2.2: SDF Combinators
 *
 * @module terrain/sdf
 */

import * as THREE from 'three';
import type { SDFPrimitiveResult, SDFEvaluator } from './SDFPrimitives';

// ---------------------------------------------------------------------------
// Basic Boolean Operations (sharp)
// ---------------------------------------------------------------------------

/** Sharp union: min(d1, d2) */
export function sdfUnion(d1: number, d2: number): number {
  return Math.min(d1, d2);
}

/** Sharp intersection: max(d1, d2) */
export function sdfIntersection(d1: number, d2: number): number {
  return Math.max(d1, d2);
}

/** Sharp subtraction: max(d1, -d2) — keeps d1 where d2 is outside */
export function sdfSubtraction(d1: number, d2: number): number {
  return Math.max(d1, -d2);
}

/** Reverse subtraction: max(-d1, d2) — keeps d2 where d1 is outside */
export function sdfReverseSubtraction(d1: number, d2: number): number {
  return Math.max(-d1, d2);
}

// ---------------------------------------------------------------------------
// Smooth Boolean Operations (polynomial smooth min)
// Reference: Inigo Quilez — https://iquilezles.org/articles/smin/
// ---------------------------------------------------------------------------

/**
 * Polynomial smooth minimum.
 * Blends two distance fields with configurable smoothness.
 *
 * @param a - First distance value
 * @param b - Second distance value
 * @param k - Blend factor (0 = sharp, larger = smoother)
 */
export function smoothUnion(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
  return b + (a - b) * h - k * h * (1 - h);
}

/**
 * Polynomial smooth maximum (smooth intersection).
 * Blends intersection with configurable smoothness.
 */
export function smoothIntersection(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
  return b + (a - b) * h + k * h * (1 - h);
}

/**
 * Polynomial smooth subtraction.
 * Blends subtraction with configurable smoothness.
 */
export function smoothSubtraction(a: number, b: number, k: number): number {
  if (k <= 0) return sdfSubtraction(a, b);
  return smoothIntersection(a, -b, k);
}

/**
 * Exponential smooth minimum — alternative blending with exponential decay.
 * Produces smoother results than polynomial for large k values.
 */
export function expSmoothUnion(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const res = Math.exp(-k * a) + Math.exp(-k * b);
  return -Math.log(res) / k;
}

// ---------------------------------------------------------------------------
// Domain Warping (Displacement)
// ---------------------------------------------------------------------------

/**
 * Domain warping — displaces the input point using a noise function.
 * Creates organic, natural-looking terrain deformation.
 *
 * @param point - Input point
 * @param displacementFn - Function that returns displacement at a point
 * @param strength - Displacement strength multiplier
 * @returns Warped point
 */
export function domainWarp(
  point: THREE.Vector3,
  displacementFn: (p: THREE.Vector3) => THREE.Vector3,
  strength: number,
): THREE.Vector3 {
  const displacement = displacementFn(point);
  return point.clone().add(displacement.multiplyScalar(strength));
}

/**
 * Create a noise-based domain warp function.
 * Uses fractal noise to displace points in 3D.
 */
export function createNoiseDomainWarp(
  noiseFn: (x: number, y: number, z: number, octaves: number) => number,
  frequency: number = 0.1,
  octaves: number = 3,
  amplitude: number = 1.0,
): (p: THREE.Vector3) => THREE.Vector3 {
  return (point: THREE.Vector3): THREE.Vector3 => {
    const x = noiseFn(point.x * frequency, point.y * frequency, point.z * frequency, octaves) * amplitude;
    const y = noiseFn(point.x * frequency + 100, point.y * frequency + 100, point.z * frequency + 100, octaves) * amplitude;
    const z = noiseFn(point.x * frequency + 200, point.y * frequency + 200, point.z * frequency + 200, octaves) * amplitude;
    return new THREE.Vector3(x, y, z);
  };
}

// ---------------------------------------------------------------------------
// Multi-Material Combinators
// ---------------------------------------------------------------------------

export interface CombinedSDFResult extends SDFPrimitiveResult {
  /** Blend weight for material mixing (0..1) */
  blendWeight: number;
}

/**
 * Combine two SDF evaluators with smooth union, blending material IDs.
 * When the two surfaces overlap within the blend region, materials
 * are mixed based on distance to each surface.
 */
export function combineSDFsSmoothUnion(
  sdfA: SDFEvaluator,
  sdfB: SDFEvaluator,
  blendFactor: number,
): SDFEvaluator {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const a = sdfA(point);
    const b = sdfB(point);

    const distance = smoothUnion(a.distance, b.distance, blendFactor);

    // Determine material ID based on which surface is closer
    const blendH = Math.max(0, Math.min(1, (b.distance - a.distance + blendFactor) / (2 * blendFactor)));
    const materialId = blendH < 0.5 ? a.materialId : b.materialId;

    return { distance, materialId };
  };
}

/**
 * Combine two SDF evaluators with smooth subtraction.
 * Subtracts sdfB from sdfA with smooth blending at the intersection.
 */
export function combineSDFsSmoothSubtraction(
  sdfA: SDFEvaluator,
  sdfB: SDFEvaluator,
  blendFactor: number,
): SDFEvaluator {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const a = sdfA(point);
    const b = sdfB(point);

    const distance = smoothSubtraction(a.distance, b.distance, blendFactor);

    // Material comes from whichever SDF dominates at this point
    // In subtraction regions, we keep A's material
    const materialId = a.distance < -b.distance ? b.materialId : a.materialId;

    return { distance, materialId };
  };
}

/**
 * Combine two SDF evaluators with smooth intersection.
 * Keeps only the region where both SDFs are inside.
 */
export function combineSDFsSmoothIntersection(
  sdfA: SDFEvaluator,
  sdfB: SDFEvaluator,
  blendFactor: number,
): SDFEvaluator {
  return (point: THREE.Vector3): SDFPrimitiveResult => {
    const a = sdfA(point);
    const b = sdfB(point);

    const distance = smoothIntersection(a.distance, b.distance, blendFactor);
    const materialId = a.distance > b.distance ? a.materialId : b.materialId;

    return { distance, materialId };
  };
}

// ---------------------------------------------------------------------------
// Layered Terrain Composition
// ---------------------------------------------------------------------------

export interface TerrainLayer {
  /** SDF evaluator for this layer */
  sdf: SDFEvaluator;
  /** Boolean operation to combine with previous layers */
  operation: 'union' | 'subtraction' | 'intersection' | 'smooth-union' | 'smooth-subtraction';
  /** Blend factor for smooth operations */
  blendFactor: number;
  /** Priority (higher = evaluated first) */
  priority: number;
}

/**
 * Compose multiple terrain layers using specified boolean operations.
 * Layers are combined in priority order.
 */
export function composeTerrainLayers(layers: TerrainLayer[]): SDFEvaluator {
  // Sort by priority (highest first)
  const sorted = [...layers].sort((a, b) => b.priority - a.priority);

  return (point: THREE.Vector3): SDFPrimitiveResult => {
    if (sorted.length === 0) {
      return { distance: Infinity, materialId: 0 };
    }

    let result = sorted[0].sdf(point);

    for (let i = 1; i < sorted.length; i++) {
      const layer = sorted[i];
      const layerResult = layer.sdf(point);

      switch (layer.operation) {
        case 'union':
          result = {
            distance: sdfUnion(result.distance, layerResult.distance),
            materialId: result.distance < layerResult.distance ? result.materialId : layerResult.materialId,
          };
          break;

        case 'subtraction':
          result = {
            distance: sdfSubtraction(result.distance, layerResult.distance),
            materialId: result.distance < -layerResult.distance ? layerResult.materialId : result.materialId,
          };
          break;

        case 'intersection':
          result = {
            distance: sdfIntersection(result.distance, layerResult.distance),
            materialId: result.distance > layerResult.distance ? result.materialId : layerResult.materialId,
          };
          break;

        case 'smooth-union':
          result = {
            distance: smoothUnion(result.distance, layerResult.distance, layer.blendFactor),
            materialId: result.distance < layerResult.distance ? result.materialId : layerResult.materialId,
          };
          break;

        case 'smooth-subtraction':
          result = {
            distance: smoothSubtraction(result.distance, layerResult.distance, layer.blendFactor),
            materialId: result.distance < -layerResult.distance ? layerResult.materialId : result.materialId,
          };
          break;
      }
    }

    return result;
  };
}
