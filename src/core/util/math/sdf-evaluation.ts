/**
 * SDF Evaluation — Signed Distance Field Primitives, CSG Operations, and Utilities
 *
 * Provides SDF evaluation utilities matching Infinigen's Element SDF evaluation
 * pattern. Implements recursive evaluation of an SDF node tree with primitive
 * distance functions, CSG boolean operations (union, subtract, intersect,
 * smooth_union), displacement via noise, and spatial transforms.
 *
 * This module complements the terrain/sdf module by providing a general-purpose
 * hierarchical SDF evaluation system rather than flat terrain-specific functions.
 *
 * Port of: Infinigen's Element SDF evaluation (terrain/elements.py, surface_kernel)
 *
 * @module core/util/math/sdf-evaluation
 */

import * as THREE from 'three';
import { SeededNoiseGenerator, NoiseType } from './noise';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported SDF primitive shape types.
 */
export type SDFPrimitive =
  | 'sphere'
  | 'box'
  | 'cylinder'
  | 'torus'
  | 'cone'
  | 'ellipsoid'
  | 'capsule';

/**
 * CSG operation types that can combine child SDF nodes.
 */
export type SDFCSGOperation = 'union' | 'subtract' | 'intersect' | 'smooth_union';

/**
 * Node type — either a primitive shape or a CSG/compound operation.
 */
export type SDFNodeType = SDFPrimitive | SDFCSGOperation | 'displacement';

/**
 * Transform applied to a node before evaluating its children.
 * Transforms the query point into the node's local coordinate space.
 */
export interface SDFTransform {
  /** Translation offset [x, y, z] */
  position: [number, number, number];
  /** Euler rotation in radians [x, y, z] */
  rotation: [number, number, number];
  /** Uniform scale factor */
  scale: number;
}

/**
 * An SDF node in the evaluation tree.
 *
 * - Primitive nodes (sphere, box, etc.) have params and no children.
 * - CSG nodes (union, subtract, intersect, smooth_union) have children.
 * - Displacement nodes have one child and noise params for surface displacement.
 * - All nodes can have an optional transform applied before evaluation.
 */
export interface SDFNode {
  /** The type of SDF primitive or operation */
  type: SDFNodeType;
  /** Parameters for the primitive or operation (e.g., radius, halfExtents) */
  params: Record<string, number>;
  /** Child nodes for CSG/displacement operations */
  children?: SDFNode[];
  /** Local coordinate transform (applied before evaluating this node) */
  transform?: SDFTransform;
}

// ============================================================================
// Internal: Noise Generator for Displacement
// ============================================================================

/** Shared noise generator for SDF displacement (seed 0 for determinism) */
const displacementNoise = new SeededNoiseGenerator(0);

// ============================================================================
// Transform Application
// ============================================================================

/**
 * Apply an SDF transform to a query point.
 * Transforms the point from world space into the node's local space.
 *
 * The transform sequence is: scale → rotate → translate (inverse of the
 * object-to-world transform). For SDF evaluation, we transform the query
 * point by the inverse: untranslate → unrotate → unscale.
 *
 * @param point - Query point in parent space
 * @param transform - The transform to apply
 * @returns Transformed point in local space
 */
function applyTransform(point: THREE.Vector3, transform: SDFTransform): THREE.Vector3 {
  let p = point.clone();

  // Inverse translate
  p.x -= transform.position[0];
  p.y -= transform.position[1];
  p.z -= transform.position[2];

  // Inverse rotate (apply inverse Euler rotation)
  if (transform.rotation[0] !== 0 || transform.rotation[1] !== 0 || transform.rotation[2] !== 0) {
    const euler = new THREE.Euler(
      -transform.rotation[0],
      -transform.rotation[1],
      -transform.rotation[2],
      'XYZ',
    );
    const quat = new THREE.Quaternion().setFromEuler(euler);
    p.applyQuaternion(quat);
  }

  // Inverse scale
  if (transform.scale !== 1 && transform.scale !== 0) {
    p.divideScalar(transform.scale);
  }

  return p;
}

// ============================================================================
// Primitive SDF Functions
// ============================================================================

/**
 * SDF for a sphere centered at origin.
 * @param point - Query point
 * @param radius - Sphere radius
 * @returns Signed distance
 */
function sdfSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

/**
 * SDF for an axis-aligned box centered at origin.
 * @param point - Query point
 * @param halfX - Half-extent along X
 * @param halfY - Half-extent along Y
 * @param halfZ - Half-extent along Z
 * @returns Signed distance
 */
function sdfBox(point: THREE.Vector3, halfX: number, halfY: number, halfZ: number): number {
  const q = new THREE.Vector3(
    Math.abs(point.x) - halfX,
    Math.abs(point.y) - halfY,
    Math.abs(point.z) - halfZ,
  );
  const outside = new THREE.Vector3(
    Math.max(q.x, 0),
    Math.max(q.y, 0),
    Math.max(q.z, 0),
  ).length();
  const inside = Math.min(Math.max(q.x, Math.max(q.y, q.z)), 0);
  return outside + inside;
}

/**
 * SDF for a cylinder aligned along the Y axis.
 * @param point - Query point
 * @param radius - Cylinder radius
 * @param halfHeight - Half-height of cylinder
 * @returns Signed distance
 */
function sdfCylinder(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const d = Math.sqrt(point.x * point.x + point.z * point.z) - radius;
  const h = Math.abs(point.y) - halfHeight;
  const outside = Math.sqrt(Math.max(d, 0) * Math.max(d, 0) + Math.max(h, 0) * Math.max(h, 0));
  const inside = Math.min(Math.max(d, h), 0);
  return outside + inside;
}

/**
 * SDF for a torus in the XZ plane.
 * @param point - Query point
 * @param majorRadius - Distance from center to tube center
 * @param minorRadius - Tube radius
 * @returns Signed distance
 */
function sdfTorus(point: THREE.Vector3, majorRadius: number, minorRadius: number): number {
  const q = new THREE.Vector2(
    Math.sqrt(point.x * point.x + point.z * point.z) - majorRadius,
    point.y,
  );
  return q.length() - minorRadius;
}

/**
 * SDF for a cone with tip at origin, base at y = -height.
 * @param point - Query point
 * @param radius - Base radius
 * @param height - Cone height
 * @returns Signed distance
 */
function sdfCone(point: THREE.Vector3, radius: number, height: number): number {
  const qx = Math.sqrt(point.x * point.x + point.z * point.z);
  const qy = point.y;

  // Vector from tip to point on the base circle
  const tipX = qx;
  const tipY = qy + height;
  const baseX = qx - radius;
  const baseY = qy;

  // Dot products for region determination
  const tipDot = tipX * baseX + tipY * baseY;
  const baseDot = -baseX * tipX - baseY * tipY;

  if (tipDot < 0) {
    // Closest to tip
    return Math.sqrt(tipX * tipX + tipY * tipY);
  }
  if (baseDot < 0) {
    // Closest to base edge
    return Math.sqrt(baseX * baseX + baseY * baseY);
  }

  // Closest to the cone surface
  const surfaceDist = Math.abs(qx * radius - qy * height) / Math.sqrt(radius * radius + height * height);
  return surfaceDist * Math.sign(qy);
}

/**
 * SDF for an ellipsoid centered at origin.
 * Uses the exact SDF by solving a quartic, but for performance we use
 * the simpler approximation that scales the query point.
 *
 * @param point - Query point
 * @param rx - Semi-axis along X
 * @param ry - Semi-axis along Y
 * @param rz - Semi-axis along Z
 * @returns Approximate signed distance
 */
function sdfEllipsoid(point: THREE.Vector3, rx: number, ry: number, rz: number): number {
  // Scale the point to a unit sphere, compute the distance there,
  // then scale back. This is an approximation but works well in practice.
  const safeRx = Math.max(rx, 1e-6);
  const safeRy = Math.max(ry, 1e-6);
  const safeRz = Math.max(rz, 1e-6);

  const scaled = new THREE.Vector3(
    point.x / safeRx,
    point.y / safeRy,
    point.z / safeRz,
  );
  const k = scaled.length();
  return (k - 1.0) * Math.min(safeRx, Math.min(safeRy, safeRz));
}

/**
 * SDF for a capsule (cylinder with hemispherical caps) along Y axis.
 * @param point - Query point
 * @param radius - Capsule radius
 * @param halfHeight - Half-height of the cylindrical section
 * @returns Signed distance
 */
function sdfCapsule(point: THREE.Vector3, radius: number, halfHeight: number): number {
  const p = new THREE.Vector3(point.x, Math.abs(point.y) - halfHeight, point.z);
  const dx = Math.sqrt(p.x * p.x + p.z * p.z) - radius;
  const dy = p.y;
  const outside = Math.sqrt(Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0.0);
  return outside + inside;
}

// ============================================================================
// CSG Operations
// ============================================================================

/**
 * Smooth minimum (polynomial smooth union).
 * Reference: Inigo Quilez — https://iquilezles.org/articles/smin/
 *
 * @param a - First distance value
 * @param b - Second distance value
 * @param k - Smoothness factor (0 = sharp, larger = smoother blend)
 * @returns Smoothly blended minimum
 */
function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, (b - a + k) / (2 * k)));
  return b + (a - b) * h - k * h * (1 - h);
}

// ============================================================================
// Main Evaluation
// ============================================================================

/**
 * Recursively evaluate an SDF node tree at the given point.
 *
 * For primitive nodes, computes the signed distance directly.
 * For CSG nodes, recursively evaluates children and combines.
 * For displacement nodes, evaluates the child and adds noise displacement.
 * Transforms are applied before evaluating the node's children.
 *
 * @param point - The 3D point at which to evaluate the SDF
 * @param node - The SDF node (or root of a subtree) to evaluate
 * @returns Signed distance value at the point
 *
 * @example
 * ```ts
 * const node: SDFNode = {
 *   type: 'smooth_union',
 *   params: { k: 0.5 },
 *   children: [
 *     { type: 'sphere', params: { radius: 1.0 }, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 } },
 *     { type: 'box', params: { halfX: 0.8, halfY: 0.8, halfZ: 0.8 }, transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: 1 } },
 *   ],
 * };
 * const dist = evaluateSDF(new THREE.Vector3(0.5, 0.5, 0.5), node);
 * ```
 */
export function evaluateSDF(point: THREE.Vector3, node: SDFNode): number {
  // Apply transform if present — move the query point into local space
  let localPoint = point;
  if (node.transform) {
    localPoint = applyTransform(point, node.transform);
  }

  switch (node.type) {
    // -------------------------------------------------------------------------
    // Primitives
    // -------------------------------------------------------------------------

    case 'sphere':
      return sdfSphere(localPoint, node.params.radius ?? 1.0);

    case 'box':
      return sdfBox(
        localPoint,
        node.params.halfX ?? 0.5,
        node.params.halfY ?? 0.5,
        node.params.halfZ ?? 0.5,
      );

    case 'cylinder':
      return sdfCylinder(
        localPoint,
        node.params.radius ?? 0.5,
        node.params.halfHeight ?? 1.0,
      );

    case 'torus':
      return sdfTorus(
        localPoint,
        node.params.majorRadius ?? 1.0,
        node.params.minorRadius ?? 0.3,
      );

    case 'cone':
      return sdfCone(
        localPoint,
        node.params.radius ?? 0.5,
        node.params.height ?? 1.0,
      );

    case 'ellipsoid':
      return sdfEllipsoid(
        localPoint,
        node.params.rx ?? 1.0,
        node.params.ry ?? 0.7,
        node.params.rz ?? 0.5,
      );

    case 'capsule':
      return sdfCapsule(
        localPoint,
        node.params.radius ?? 0.3,
        node.params.halfHeight ?? 0.7,
      );

    // -------------------------------------------------------------------------
    // CSG Operations
    // -------------------------------------------------------------------------

    case 'union': {
      if (!node.children || node.children.length === 0) return Infinity;
      let result = Infinity;
      for (const child of node.children) {
        result = Math.min(result, evaluateSDF(localPoint, child));
      }
      return result;
    }

    case 'subtract': {
      if (!node.children || node.children.length < 2) return Infinity;
      // Subtract all subsequent children from the first
      let result = evaluateSDF(localPoint, node.children[0]);
      for (let i = 1; i < node.children.length; i++) {
        const childDist = evaluateSDF(localPoint, node.children[i]);
        result = Math.max(result, -childDist);
      }
      return result;
    }

    case 'intersect': {
      if (!node.children || node.children.length === 0) return -Infinity;
      let result = evaluateSDF(localPoint, node.children[0]);
      for (let i = 1; i < node.children.length; i++) {
        result = Math.max(result, evaluateSDF(localPoint, node.children[i]));
      }
      return result;
    }

    case 'smooth_union': {
      if (!node.children || node.children.length === 0) return Infinity;
      const k = node.params.k ?? 0.1;
      let result = evaluateSDF(localPoint, node.children[0]);
      for (let i = 1; i < node.children.length; i++) {
        result = smoothMin(result, evaluateSDF(localPoint, node.children[i]), k);
      }
      return result;
    }

    // -------------------------------------------------------------------------
    // Displacement
    // -------------------------------------------------------------------------

    case 'displacement': {
      if (!node.children || node.children.length === 0) return Infinity;
      const baseDist = evaluateSDF(localPoint, node.children[0]);
      const strength = node.params.strength ?? 0.1;
      const frequency = node.params.frequency ?? 1.0;
      const octaves = Math.round(node.params.octaves ?? 3);

      // Displacement: add noise-based offset to the surface
      const n = displacementNoise.fbm(
        localPoint.x * frequency,
        localPoint.y * frequency,
        localPoint.z * frequency,
        { octaves, noiseType: NoiseType.Perlin },
      );
      return baseDist + n * strength;
    }

    default:
      return Infinity;
  }
}

// ============================================================================
// Batch Evaluation
// ============================================================================

/**
 * Batch-evaluate an SDF node tree across an array of positions.
 *
 * The positions array is a flat Float32Array with stride 3:
 *   [x0, y0, z0, x1, y1, z1, ...]
 *
 * @param positions - Flat array of 3D positions (stride 3)
 * @param count - Number of positions to evaluate
 * @param node - The SDF node tree to evaluate
 * @returns Float32Array of signed distance values (length = count)
 *
 * @example
 * ```ts
 * const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
 * const distances = evaluateSDFBatch(positions, 3, sphereNode);
 * ```
 */
export function evaluateSDFBatch(
  positions: Float32Array,
  count: number,
  node: SDFNode,
): Float32Array {
  const result = new Float32Array(count);
  const point = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    point.set(positions[offset], positions[offset + 1], positions[offset + 2]);
    result[i] = evaluateSDF(point, node);
  }

  return result;
}

// ============================================================================
// Normal & Gradient Estimation
// ============================================================================

/**
 * Compute the surface normal at a point using central differences.
 *
 * Estimates the gradient of the SDF via finite differences and normalizes
 * it to produce the outward surface normal. This is the standard approach
 * used in raymarching and mesh extraction.
 *
 * @param point - The 3D point at which to estimate the normal
 * @param node - The SDF node tree
 * @param epsilon - Step size for finite differences (default: 0.001)
 * @returns Unit normal vector
 *
 * @example
 * ```ts
 * const normal = computeSDFNormal(queryPoint, sdfNode);
 * // normal is a unit THREE.Vector3 pointing away from the surface
 * ```
 */
export function computeSDFNormal(
  point: THREE.Vector3,
  node: SDFNode,
  epsilon: number = 0.001,
): THREE.Vector3 {
  const gradient = computeSDFGradient(point, node, epsilon);
  const len = gradient.length();
  if (len < 1e-10) {
    return new THREE.Vector3(0, 1, 0); // Fallback: up vector
  }
  return gradient.divideScalar(len);
}

/**
 * Compute the SDF gradient (unnormalized normal) at a point using central differences.
 *
 * Uses the standard 6-sample central difference scheme:
 *   ∂f/∂x ≈ (f(x+ε) - f(x-ε)) / (2ε)
 *
 * @param point - The 3D point at which to estimate the gradient
 * @param node - The SDF node tree
 * @param epsilon - Step size for finite differences (default: 0.001)
 * @returns Gradient vector (unnormalized)
 *
 * @example
 * ```ts
 * const gradient = computeSDFGradient(queryPoint, sdfNode, 0.01);
 * // gradient is a THREE.Vector3 pointing in the direction of greatest increase
 * ```
 */
export function computeSDFGradient(
  point: THREE.Vector3,
  node: SDFNode,
  epsilon: number = 0.001,
): THREE.Vector3 {
  const px = point.x;
  const py = point.y;
  const pz = point.z;

  // Central differences along each axis
  const dx = (
    evaluateSDF(new THREE.Vector3(px + epsilon, py, pz), node) -
    evaluateSDF(new THREE.Vector3(px - epsilon, py, pz), node)
  ) / (2 * epsilon);

  const dy = (
    evaluateSDF(new THREE.Vector3(px, py + epsilon, pz), node) -
    evaluateSDF(new THREE.Vector3(px, py - epsilon, pz), node)
  ) / (2 * epsilon);

  const dz = (
    evaluateSDF(new THREE.Vector3(px, py, pz + epsilon), node) -
    evaluateSDF(new THREE.Vector3(px, py, pz - epsilon), node)
  ) / (2 * epsilon);

  return new THREE.Vector3(dx, dy, dz);
}

// ============================================================================
// Convenience Constructors
// ============================================================================

/**
 * Create a sphere SDF node.
 */
export function createSphere(
  radius: number = 1.0,
  position?: [number, number, number],
): SDFNode {
  const node: SDFNode = { type: 'sphere', params: { radius } };
  if (position) {
    node.transform = { position, rotation: [0, 0, 0], scale: 1 };
  }
  return node;
}

/**
 * Create a box SDF node.
 */
export function createBox(
  halfX: number = 0.5,
  halfY: number = 0.5,
  halfZ: number = 0.5,
  position?: [number, number, number],
): SDFNode {
  const node: SDFNode = { type: 'box', params: { halfX, halfY, halfZ } };
  if (position) {
    node.transform = { position, rotation: [0, 0, 0], scale: 1 };
  }
  return node;
}

/**
 * Create a smooth union of multiple SDF nodes.
 */
export function createSmoothUnion(k: number, ...children: SDFNode[]): SDFNode {
  return { type: 'smooth_union', params: { k }, children };
}

/**
 * Create a subtraction SDF node (subtracts subsequent children from the first).
 */
export function createSubtraction(...children: SDFNode[]): SDFNode {
  return { type: 'subtract', params: {}, children };
}

/**
 * Create a displacement SDF node that applies noise-based surface displacement.
 */
export function createDisplacement(
  child: SDFNode,
  strength: number = 0.1,
  frequency: number = 1.0,
  octaves: number = 3,
): SDFNode {
  return { type: 'displacement', params: { strength, frequency, octaves }, children: [child] };
}
