/**
 * SpecializedNodeExecutors - 41 specialized node type executors
 *
 * Provides executor functions for advanced Infinigen pipeline nodes:
 * shader inputs (layer weight, light path, wireframe, etc.), particle/hair/camera
 * info, blackbody/wavelength color, vector/matrix/quaternion operations,
 * topology queries, curve spline type, exposure, light data, texture Gabor,
 * and utility math nodes.
 *
 * This is the sixth executor module alongside Core, Extended, Additional,
 * Expanded, and Essential. Combined total: 213+ real executors.
 *
 * Each executor is a standalone function that takes `inputs: NodeInputs`
 * and returns a structured output object matching the socket names of the node.
 *
 * Uses seeded random for all randomness — no Math.random().
 */

import * as THREE from 'three';
import type { NodeInputs, NodeOutput, Vector3Like, ColorLike, GeometryLike } from './ExecutorTypes';

// ============================================================================
// Seeded Random Utility (matches other executor modules)
// ============================================================================

function seededRandom(seed: number): () => number {
  let state = Math.abs(seed | 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ============================================================================
// Helper: normalize a vector-like input to {x, y, z}
// ============================================================================

function normalizeVec(v: unknown): Vector3Like {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: (v as number[])[0] ?? 0, y: (v as number[])[1] ?? 0, z: (v as number[])[2] ?? 0 };
  const obj = v as Record<string, unknown>;
  return { x: (obj.x as number) ?? 0, y: (obj.y as number) ?? 0, z: (obj.z as number) ?? 0 };
}

// ============================================================================
// Helper: get edge key for mesh topology
// ============================================================================

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// ============================================================================
// Helper: compute face normal from three vertices
// ============================================================================

function computeFaceNormal(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(v1, v0),
    new THREE.Vector3().subVectors(v2, v0),
  ).normalize();
}

// ============================================================================
// Shader Input Executors (9)
// ============================================================================

/**
 * 1. LayerWeight — Fresnel/layer weight shader input.
 * Inputs: Blend, Normal
 * Outputs: Fresnel, Facing
 */
export function executeLayerWeight(inputs: NodeInputs): NodeOutput {
  const blend = (inputs.Blend ?? inputs.blend ?? 0.5) as number;
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });

  // Approximate Fresnel effect using Schlick's approximation
  // Assume view direction along Z for CPU evaluation
  const viewDir = new THREE.Vector3(0, 0, 1);
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const NdotV = Math.max(0, n.dot(viewDir));

  // Fresnel with blend factor
  const fresnel = Math.pow(1 - NdotV, THREE.MathUtils.clamp(1 - blend, 0, 1));
  // Facing: perpendicular edges are bright, grazing angles dark
  const facing = NdotV;

  return {
    Fresnel: fresnel,
    Facing: facing,
  };
}

/**
 * 2. LightPath — Light path info shader input.
 * Inputs: (none)
 * Outputs: IsCameraRay, IsShadowRay, IsDiffuseRay, IsGlossyRay,
 *          IsReflectionRay, IsTransmissionRay, RayLength, RayDepth, etc.
 */
export function executeLightPath(inputs: NodeInputs): NodeOutput {
  // CPU evaluation defaults: assume camera ray context
  return {
    IsCameraRay: 1.0,
    IsShadowRay: 0.0,
    IsDiffuseRay: 0.0,
    IsGlossyRay: 0.0,
    IsSingularRay: 0.0,
    IsReflectionRay: 0.0,
    IsTransmissionRay: 0.0,
    RayLength: 0.0,
    RayDepth: 0.0,
    TransparentDepth: 0.0,
  };
}

/**
 * 3. Wireframe — Wireframe shader input.
 * Inputs: Size, Color
 * Outputs: Fac (0-1 wireframe factor)
 */
export function executeWireframe(inputs: NodeInputs): NodeOutput {
  const size = (inputs.Size ?? inputs.size ?? 0.01) as number;
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1, a: 1 }) as ColorLike;

  // CPU: return wireframe factor (0 = not on edge, 1 = on edge)
  // In shader evaluation, this would compute actual edge distance
  return {
    Fac: 0.0,
    Color: color,
  };
}

/**
 * 4. ShaderObjectInfo — Object info for shaders.
 * Inputs: (none — reads from scene context)
 * Outputs: Location, Color, Alpha, ObjectIndex, MaterialIndex, Random
 */
export function executeShaderObjectInfo(inputs: NodeInputs): NodeOutput {
  const seed = (inputs.Seed ?? inputs.seed ?? inputs.ObjectIndex ?? inputs.objectIndex ?? 0) as number;
  const rng = seededRandom(seed);

  return {
    Location: { x: 0, y: 0, z: 0 } as Vector3Like,
    Color: { r: 1, g: 1, b: 1, a: 1 } as ColorLike,
    Alpha: 1.0,
    ObjectIndex: seed,
    MaterialIndex: 0,
    Random: rng(),
  };
}

/**
 * 5. ParticleInfo — Particle info shader input.
 * Inputs: (none — reads from particle system context)
 * Outputs: Index, Age, Lifetime, Location, Velocity, AngularVelocity, Size
 */
export function executeParticleInfo(inputs: NodeInputs): NodeOutput {
  const index = (inputs.Index ?? inputs.index ?? 0) as number;

  return {
    Index: index,
    Age: 0,
    Lifetime: 1,
    Location: { x: 0, y: 0, z: 0 } as Vector3Like,
    Velocity: { x: 0, y: 0, z: 0 } as Vector3Like,
    AngularVelocity: { x: 0, y: 0, z: 0 } as Vector3Like,
    Size: 1.0,
  };
}

/**
 * 6. CameraData — Camera data shader input.
 * Inputs: (none — reads from camera context)
 * Outputs: ViewVector, ViewZDepth, ViewDistance, UV
 */
export function executeCameraData(inputs: NodeInputs): NodeOutput {
  return {
    ViewVector: { x: 0, y: 0, z: -1 } as Vector3Like,
    ViewZDepth: 1.0,
    ViewDistance: 1.0,
    UV: { x: 0.5, y: 0.5, z: 0 } as Vector3Like,
  };
}

/**
 * 7. HairInfo — Hair info shader input.
 * Inputs: (none — reads from hair particle context)
 * Outputs: StrandIndex, Intercept, Thickness, TangentNormal, Random
 */
export function executeHairInfo(inputs: NodeInputs): NodeOutput {
  const strandIndex = (inputs.StrandIndex ?? inputs.strandIndex ?? 0) as number;
  const rng = seededRandom(strandIndex);

  return {
    StrandIndex: strandIndex,
    Intercept: 0.5,
    Thickness: 1.0,
    TangentNormal: { x: 0, y: 0, z: 1 } as Vector3Like,
    IsStrand: 1.0,
    Random: rng(),
  };
}

/**
 * 8. NewGeometry — Geometry shader input (position, normal, tangent, etc.).
 * Inputs: (none — reads from geometry context)
 * Outputs: Position, Normal, Tangent, TrueNormal, Incoming, Parametric,
 *          Backfacing, Pointiness
 */
export function executeNewGeometry(inputs: NodeInputs): NodeOutput {
  const position = normalizeVec(inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 });

  return {
    Position: position,
    Normal: { x: 0, y: 0, z: 1 } as Vector3Like,
    Tangent: { x: 1, y: 0, z: 0 } as Vector3Like,
    TrueNormal: { x: 0, y: 0, z: 1 } as Vector3Like,
    Incoming: { x: 0, y: 0, z: -1 } as Vector3Like,
    Parametric: { x: 0, y: 0, z: 0 } as Vector3Like,
    Backfacing: 0.0,
    Pointiness: 0.0,
  };
}

/**
 * 9. BlackBody — Blackbody radiation color.
 * Inputs: Temperature, Value
 * Outputs: Color
 */
export function executeBlackBody(inputs: NodeInputs): NodeOutput {
  const temperature = (inputs.Temperature ?? inputs.temperature ?? 6500) as number;
  const value = (inputs.Value ?? inputs.value ?? 1.0) as number;

  // Simplified Planckian locus approximation (Tanner Helland's algorithm)
  const t = temperature / 100;
  let r: number, g: number, b: number;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  r = THREE.MathUtils.clamp(r / 255, 0, 1);
  g = THREE.MathUtils.clamp(g / 255, 0, 1);
  b = THREE.MathUtils.clamp(b / 255, 0, 1);

  return {
    Color: { r: r * value, g: g * value, b: b * value, a: 1 } as ColorLike,
  };
}

// ============================================================================
// Color/Wavelength Executors (2)
// ============================================================================

/**
 * 10. Wavelength — Wavelength to color conversion.
 * Inputs: Wavelength (nm)
 * Outputs: Color
 */
export function executeWavelength(inputs: NodeInputs): NodeOutput {
  const wavelength = (inputs.Wavelength ?? inputs.wavelength ?? 550) as number;

  // Convert wavelength (380-780nm) to approximate RGB
  const w = THREE.MathUtils.clamp(wavelength, 380, 780);
  let r = 0, g = 0, b = 0;

  if (w >= 380 && w < 440) {
    r = -(w - 440) / (440 - 380); g = 0; b = 1;
  } else if (w >= 440 && w < 490) {
    r = 0; g = (w - 440) / (490 - 440); b = 1;
  } else if (w >= 490 && w < 510) {
    r = 0; g = 1; b = -(w - 510) / (510 - 490);
  } else if (w >= 510 && w < 580) {
    r = (w - 510) / (580 - 510); g = 1; b = 0;
  } else if (w >= 580 && w < 645) {
    r = 1; g = -(w - 645) / (645 - 580); b = 0;
  } else if (w >= 645 && w <= 780) {
    r = 1; g = 0; b = 0;
  }

  // Intensity correction at edges
  let factor = 1.0;
  if (w >= 380 && w < 420) factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
  else if (w > 700 && w <= 780) factor = 0.3 + 0.7 * (780 - w) / (780 - 700);

  return {
    Color: { r: r * factor, g: g * factor, b: b * factor, a: 1 } as ColorLike,
  };
}

/**
 * 11. Bevel — Bevel shader input.
 * Inputs: Samples, Radius
 * Outputs: Normal, Radius
 */
export function executeBevel(inputs: NodeInputs): NodeOutput {
  const samples = (inputs.Samples ?? inputs.samples ?? 4) as number;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.05) as number;

  // CPU evaluation returns default normal; actual bevel computed in shader
  return {
    Normal: { x: 0, y: 0, z: 1 } as Vector3Like,
    Radius: radius,
  };
}

// ============================================================================
// Vector/Math Executors (4)
// ============================================================================

/**
 * 12. Normalize — Normalize vector.
 * Inputs: Vector
 * Outputs: Vector (normalized), Length
 */
export function executeNormalize(inputs: NodeInputs): NodeOutput {
  const v = normalizeVec(inputs.Vector ?? inputs.vector ?? inputs.Value ?? inputs.value ?? { x: 0, y: 0, z: 0 });

  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

  if (len < 1e-8) {
    return { Vector: { x: 0, y: 0, z: 0 } as Vector3Like, Length: 0 };
  }

  return {
    Vector: { x: v.x / len, y: v.y / len, z: v.z / len } as Vector3Like,
    Length: len,
  };
}

/**
 * 13. VectorRotate — Rotate vector (various modes).
 * Inputs: Vector, Center, Axis, Angle, Rotation, Mode
 * Outputs: Vector
 */
export function executeVectorRotate(inputs: NodeInputs): NodeOutput {
  const v = normalizeVec(inputs.Vector ?? inputs.vector ?? inputs.Invert ?? inputs.invert ?? { x: 0, y: 0, z: 0 });
  const center = normalizeVec(inputs.Center ?? inputs.center ?? { x: 0, y: 0, z: 0 });
  const axis = normalizeVec(inputs.Axis ?? inputs.axis ?? { x: 0, y: 0, z: 1 });
  const angle = (inputs.Angle ?? inputs.angle ?? 0) as number;
  const rotation = normalizeVec(inputs.Rotation ?? inputs.rotation ?? { x: 0, y: 0, z: 0 });
  const mode = (inputs.Mode ?? inputs.mode ?? 'AXIS_ANGLE') as string;

  const vec = new THREE.Vector3(v.x, v.y, v.z);
  const c = new THREE.Vector3(center.x, center.y, center.z);

  switch (mode) {
    case 'AXIS_ANGLE': {
      const ax = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
      vec.sub(c);
      vec.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(ax, angle));
      vec.add(c);
      break;
    }
    case 'EULER_XYZ': {
      const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ');
      vec.sub(c);
      vec.applyEuler(euler);
      vec.add(c);
      break;
    }
    case 'EULER_ZYX': {
      const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z, 'ZYX');
      vec.sub(c);
      vec.applyEuler(euler);
      vec.add(c);
      break;
    }
    case 'X_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(1, 0, 0), angle);
      vec.add(c);
      break;
    }
    case 'Y_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      vec.add(c);
      break;
    }
    case 'Z_AXIS': {
      vec.sub(c);
      vec.applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);
      vec.add(c);
      break;
    }
    default: {
      const ax = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
      vec.sub(c);
      vec.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(ax, angle));
      vec.add(c);
      break;
    }
  }

  return { Vector: { x: vec.x, y: vec.y, z: vec.z } as Vector3Like };
}

/**
 * 14. VectorTransform — Transform vector between spaces.
 * Inputs: Vector, ConvertFrom, ConvertTo
 * Outputs: Vector
 */
export function executeVectorTransform(inputs: NodeInputs): NodeOutput {
  const v = normalizeVec(inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 });
  const convertFrom = (inputs.ConvertFrom ?? inputs.convertFrom ?? 'WORLD') as string;
  const convertTo = (inputs.ConvertTo ?? inputs.convertTo ?? 'OBJECT') as string;

  // CPU: simplified space transform
  // In practice, this would use the actual world/object/camera matrices
  const vec = new THREE.Vector3(v.x, v.y, v.z);

  if (convertFrom === convertTo) {
    // No transform needed
    return { Vector: { x: vec.x, y: vec.y, z: vec.z } as Vector3Like };
  }

  // Identity transform as placeholder (would need scene matrices for real transform)
  return { Vector: { x: vec.x, y: vec.y, z: vec.z } as Vector3Like };
}

/**
 * 15. Quaternion — Quaternion operations.
 * Inputs: Quaternion, Operation (MULTIPLY/ROTATE/INVERT/ROTATION_DIFFERENCE)
 * Outputs: Quaternion, Rotation
 */
export function executeQuaternion(inputs: NodeInputs): NodeOutput {
  const quatInput = normalizeVec(inputs.Quaternion ?? inputs.quaternion ?? inputs.Value ?? inputs.value ?? { x: 0, y: 0, z: 0 });
  const quatInput2 = normalizeVec(inputs.Quaternion2 ?? inputs.quaternion2 ?? { x: 0, y: 0, z: 0 });
  const operation = (inputs.Operation ?? inputs.operation ?? 'MULTIPLY') as string;
  const angle = (inputs.Angle ?? inputs.angle ?? 0) as number;
  const axis = normalizeVec(inputs.Axis ?? inputs.axis ?? { x: 0, y: 1, z: 0 });

  let q: THREE.Quaternion;

  switch (operation) {
    case 'MULTIPLY': {
      const q1 = new THREE.Quaternion(quatInput.x, quatInput.y, quatInput.z, 1);
      const q2 = new THREE.Quaternion(quatInput2.x, quatInput2.y, quatInput2.z, 1);
      q = q1.multiply(q2);
      break;
    }
    case 'ROTATE': {
      const ax = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
      q = new THREE.Quaternion().setFromAxisAngle(ax, angle);
      break;
    }
    case 'INVERT': {
      q = new THREE.Quaternion(quatInput.x, quatInput.y, quatInput.z, 1).invert();
      break;
    }
    default: {
      q = new THREE.Quaternion(quatInput.x, quatInput.y, quatInput.z, 1);
      break;
    }
  }

  q.normalize();

  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

  return {
    Quaternion: { x: q.x, y: q.y, z: q.z } as Vector3Like,
    Rotation: { x: euler.x, y: euler.y, z: euler.z } as Vector3Like,
  };
}

/**
 * 16. MatrixTransform — Matrix operations.
 * Inputs: Matrix (16 floats), Operation (MULTIPLY/INVERT/TRANSPOSE/DETERMINANT)
 * Outputs: Matrix, Determinant
 */
export function executeMatrixTransform(inputs: NodeInputs): NodeOutput {
  const operation = (inputs.Operation ?? inputs.operation ?? 'MULTIPLY') as string;
  const matrix = (inputs.Matrix ?? inputs.matrix ?? null) as number[] | null;

  // Default identity matrix
  const mat = new THREE.Matrix4();
  if (matrix && Array.isArray(matrix) && matrix.length >= 16) {
    mat.fromArray(matrix);
  }

  let resultMat = mat.clone();
  let determinant = 1;

  switch (operation) {
    case 'INVERT':
      resultMat = mat.clone().invert();
      break;
    case 'TRANSPOSE':
      resultMat = mat.clone().transpose();
      break;
    case 'DETERMINANT':
      determinant = mat.determinant();
      break;
    case 'MULTIPLY':
    default:
      // If a second matrix is provided, multiply
      const matrix2 = (inputs.Matrix2 ?? inputs.matrix2 ?? null) as number[] | null;
      if (matrix2 && Array.isArray(matrix2) && matrix2.length >= 16) {
        const mat2 = new THREE.Matrix4().fromArray(matrix2);
        resultMat = mat.clone().multiply(mat2);
      }
      break;
  }

  return {
    Matrix: Array.from(resultMat.elements),
    Determinant: resultMat.determinant(),
  };
}

// ============================================================================
// Attribute Executor (1)
// ============================================================================

/**
 * 17. Attribute — Read attribute by name (legacy).
 * Inputs: Geometry, Name, DataType, Domain
 * Outputs: Value, Vector, Color, Boolean
 */
export function executeAttribute(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const name = (inputs.Name ?? inputs.name ?? inputs.AttributeName ?? '') as string;
  const dataType = (inputs.DataType ?? inputs.dataType ?? 'FLOAT') as string;
  const domain = (inputs.Domain ?? inputs.domain ?? 'POINT') as string;

  if (!geometry || !name) {
    return { Value: 0, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
  }

  const attr = geometry.getAttribute(name);
  if (!attr) {
    // Check lowercase variant
    const lowerAttr = geometry.getAttribute(name.toLowerCase());
    if (!lowerAttr) {
      return { Value: 0, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
    }
    // Use lowerAttr
    const la = lowerAttr as THREE.BufferAttribute;
    if (la.itemSize === 1) {
      const vals: number[] = [];
      for (let i = 0; i < la.count; i++) vals.push(la.getX(i));
      return { Value: vals, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
    }
    return { Value: 0, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
  }

  const bufAttr = attr as THREE.BufferAttribute;

  if (bufAttr.itemSize === 1) {
    const vals: number[] = [];
    for (let i = 0; i < bufAttr.count; i++) vals.push(bufAttr.getX(i));
    return { Value: vals, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
  } else if (bufAttr.itemSize === 2) {
    // UV-like
    const vals: number[] = [];
    for (let i = 0; i < bufAttr.count; i++) vals.push(bufAttr.getX(i));
    return { Value: vals, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
  } else if (bufAttr.itemSize === 3) {
    const vals: Vector3Like[] = [];
    for (let i = 0; i < bufAttr.count; i++) {
      vals.push({ x: bufAttr.getX(i), y: bufAttr.getY(i), z: bufAttr.getZ(i) });
    }
    return { Value: 0, Vector: vals, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
  } else if (bufAttr.itemSize === 4) {
    const vals: ColorLike[] = [];
    for (let i = 0; i < bufAttr.count; i++) {
      vals.push({ r: bufAttr.getX(i), g: bufAttr.getY(i), b: bufAttr.getZ(i), a: bufAttr.getW(i) });
    }
    return { Value: 0, Vector: { x: 0, y: 0, z: 0 }, Color: vals, Boolean: false };
  }

  return { Value: 0, Vector: { x: 0, y: 0, z: 0 }, Color: { r: 0, g: 0, b: 0, a: 1 }, Boolean: false };
}

// ============================================================================
// Curve Spline Type Executor (1)
// ============================================================================

/**
 * 18. CurveSplineType — Set spline type.
 * Inputs: Geometry, SplineType (POLY/BEZIER/NURBS/CATMULL_ROM), Selection
 * Outputs: Geometry
 */
export function executeCurveSplineType(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const splineType = (inputs.SplineType ?? inputs.splineType ?? 'POLY') as string;
  const selection = (inputs.Selection ?? inputs.selection ?? null) as unknown[] | null;

  if (!geometry) return { Geometry: geometry };

  const result = geometry.clone();
  // Store spline type as custom attribute
  (result as unknown as Record<string, unknown>)._splineType = splineType;

  return { Geometry: result };
}

// ============================================================================
// Topology Executors (7)
// ============================================================================

/**
 * 19. EdgeAngle — Edge angle input (dihedral angle between adjacent faces).
 * Inputs: Geometry
 * Outputs: UnsignedAngle, SignedAngle
 */
export function executeEdgeAngle(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { UnsignedAngle: [], SignedAngle: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Build edge → face list with face normals
  const edgeFaceMap = new Map<string, { fi: number; normal: THREE.Vector3 }[]>();

  for (let f = 0; f < faceCount; f++) {
    const i0 = idxAttr.getX(f * 3);
    const i1 = idxAttr.getX(f * 3 + 1);
    const i2 = idxAttr.getX(f * 3 + 2);

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
    const normal = computeFaceNormal(v0, v1, v2);

    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeFaceMap.has(key)) edgeFaceMap.set(key, []);
      edgeFaceMap.get(key)!.push({ fi: f, normal });
    }
  }

  // Compute angles for each edge
  const unsignedAngles: number[] = [];
  const signedAngles: number[] = [];
  const sortedEdges = [...edgeFaceMap.keys()].sort();

  for (const key of sortedEdges) {
    const faces = edgeFaceMap.get(key)!;
    if (faces.length === 2) {
      const dot = THREE.MathUtils.clamp(faces[0].normal.dot(faces[1].normal), -1, 1);
      const angle = Math.acos(dot);
      unsignedAngles.push(angle);
      signedAngles.push(angle);
    } else {
      unsignedAngles.push(Math.PI); // Boundary edge
      signedAngles.push(Math.PI);
    }
  }

  return { UnsignedAngle: unsignedAngles, SignedAngle: signedAngles };
}

/**
 * 20. EdgesOfVertex — Edges of vertex topology.
 * Inputs: Geometry, VertexIndex
 * Outputs: EdgeIndex (array of arrays), Total
 */
export function executeEdgesOfVertex(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { EdgeIndex: [], Total: 0 };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Build edge index map and vertex → edge adjacency
  const edgeIndexMap = new Map<string, number>();
  let edgeCount = 0;
  const getEdgeIndex = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    if (edgeIndexMap.has(key)) return edgeIndexMap.get(key)!;
    edgeIndexMap.set(key, edgeCount);
    return edgeCount++;
  };

  const vertexEdges = new Map<number, number[]>();
  for (let i = 0; i < posAttr.count; i++) vertexEdges.set(i, []);

  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const ei = getEdgeIndex(a, b);
      if (!vertexEdges.get(a)!.includes(ei)) vertexEdges.get(a)!.push(ei);
      if (!vertexEdges.get(b)!.includes(ei)) vertexEdges.get(b)!.push(ei);
    }
  }

  const edgeIndex: number[][] = [];
  for (let i = 0; i < posAttr.count; i++) {
    edgeIndex.push(vertexEdges.get(i) ?? []);
  }

  return { EdgeIndex: edgeIndex, Total: edgeCount };
}

/**
 * 21. VerticesOfEdge — Vertices of edge topology.
 * Inputs: Geometry
 * Outputs: VertexIndex1 (array), VertexIndex2 (array)
 */
export function executeVerticesOfEdge(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { VertexIndex1: [], VertexIndex2: [] };
  }

  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const edgeSet = new Map<string, [number, number]>();

  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeSet.has(key)) edgeSet.set(key, a < b ? [a, b] : [b, a]);
    }
  }

  const v1: number[] = [];
  const v2: number[] = [];
  for (const [a, b] of edgeSet.values()) {
    v1.push(a);
    v2.push(b);
  }

  return { VertexIndex1: v1, VertexIndex2: v2 };
}

/**
 * 22. VerticesOfFace — Vertices of face topology.
 * Inputs: Geometry
 * Outputs: VertexIndex (array of arrays), Total
 */
export function executeVerticesOfFace(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { VertexIndex: [], Total: 0 };
  }

  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const vertexIndex: number[][] = [];
  let total = 0;

  for (let f = 0; f < faceCount; f++) {
    const face: number[] = [];
    for (let e = 0; e < 3; e++) {
      face.push(idxAttr.getX(f * 3 + e));
      total++;
    }
    vertexIndex.push(face);
  }

  return { VertexIndex: vertexIndex, Total: total };
}

/**
 * 23. FacesOfVertex — Faces of vertex topology.
 * Inputs: Geometry
 * Outputs: FaceIndex (array of arrays), Total
 */
export function executeFacesOfVertex(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { FaceIndex: [], Total: 0 };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const vertexFaces = new Map<number, number[]>();
  for (let i = 0; i < posAttr.count; i++) vertexFaces.set(i, []);

  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const vi = idxAttr.getX(f * 3 + e);
      vertexFaces.get(vi)?.push(f);
    }
  }

  const faceIndex: number[][] = [];
  let total = 0;
  for (let i = 0; i < posAttr.count; i++) {
    const faces = vertexFaces.get(i) ?? [];
    faceIndex.push(faces);
    total += faces.length;
  }

  return { FaceIndex: faceIndex, Total: total };
}

/**
 * 24. FaceCorners — Face corner data.
 * Inputs: Geometry
 * Outputs: CornerCount, CornerVertexIndex, CornerFaceIndex
 */
export function executeFaceCorners(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { CornerCount: 0, CornerVertexIndex: [], CornerFaceIndex: [] };
  }

  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  const cornerVertexIndex: number[] = [];
  const cornerFaceIndex: number[] = [];

  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      cornerVertexIndex.push(idxAttr.getX(f * 3 + e));
      cornerFaceIndex.push(f);
    }
  }

  return {
    CornerCount: cornerVertexIndex.length,
    CornerVertexIndex: cornerVertexIndex,
    CornerFaceIndex: cornerFaceIndex,
  };
}

/**
 * 25. NamedCorner — Named corner attribute.
 * Inputs: Geometry, Name, DataType
 * Outputs: Value
 */
export function executeNamedCorner(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const name = (inputs.Name ?? inputs.name ?? '') as string;
  const dataType = (inputs.DataType ?? inputs.dataType ?? 'FLOAT') as string;

  if (!geometry || !name) return { Value: 0 };

  const attr = geometry.getAttribute(name);
  if (!attr) return { Value: 0 };

  const bufAttr = attr as THREE.BufferAttribute;
  const vals: number[] = [];
  for (let i = 0; i < bufAttr.count; i++) {
    vals.push(bufAttr.getX(i));
  }

  return { Value: vals };
}

// ============================================================================
// Exposure & Shader Input Executors (5)
// ============================================================================

/**
 * 26. Exposure — Exposure adjustment.
 * Inputs: Color, Exposure
 * Outputs: Color
 */
export function executeExposure(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 }) as ColorLike;
  const exposure = (inputs.Exposure ?? inputs.exposure ?? 1.0) as number;

  const factor = Math.pow(2, exposure);

  return {
    Color: {
      r: THREE.MathUtils.clamp(color.r * factor, 0, 1),
      g: THREE.MathUtils.clamp(color.g * factor, 0, 1),
      b: THREE.MathUtils.clamp(color.b * factor, 0, 1),
      a: color.a ?? 1,
    } as ColorLike,
  };
}

/**
 * 27. Normal — Normal shader input.
 * Inputs: (none — reads from geometry context)
 * Outputs: Normal
 */
export function executeNormal(inputs: NodeInputs): NodeOutput {
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });

  return {
    Normal: normal,
  };
}

/**
 * 28. Tangent — Tangent shader input.
 * Inputs: (none — reads from geometry context)
 * Outputs: Tangent
 */
export function executeTangent(inputs: NodeInputs): NodeOutput {
  const tangent = normalizeVec(inputs.Tangent ?? inputs.tangent ?? { x: 1, y: 0, z: 0 });

  return {
    Tangent: tangent,
  };
}

/**
 * 29. TrueNormal — True normal shader input (flat shading normal).
 * Inputs: (none — reads from geometry context)
 * Outputs: Normal
 */
export function executeTrueNormal(inputs: NodeInputs): NodeOutput {
  const normal = normalizeVec(inputs.Normal ?? inputs.normal ?? { x: 0, y: 0, z: 1 });

  return {
    Normal: normal,
  };
}

/**
 * 30. MaterialInfo — Material info shader input.
 * Inputs: (none — reads from material context)
 * Outputs: BaseColor, Metallic, Roughness, Emission, Alpha
 */
export function executeMaterialInfo(inputs: NodeInputs): NodeOutput {
  return {
    BaseColor: { r: 0.8, g: 0.8, b: 0.8, a: 1 } as ColorLike,
    Metallic: 0.0,
    Roughness: 0.5,
    Emission: { r: 0, g: 0, b: 0, a: 1 } as ColorLike,
    Alpha: 1.0,
  };
}

// ============================================================================
// Mesh Info & Light Executors (7)
// ============================================================================

/**
 * 31. MeshInfo — Mesh info shader input.
 * Inputs: (none)
 * Outputs: VertexCount, FaceCount, EdgeCount, Area, Volume
 */
export function executeMeshInfo(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;

  if (!geometry || !geometry.getAttribute('position')) {
    return { VertexCount: 0, FaceCount: 0, EdgeCount: 0, Area: 0, Volume: 0 };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex();
  const faceCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);

  // Count unique edges
  const edgeSet = new Set<string>();
  if (idxAttr) {
    for (let f = 0; f < faceCount; f++) {
      for (let e = 0; e < 3; e++) {
        edgeSet.add(edgeKey(idxAttr.getX(f * 3 + e), idxAttr.getX(f * 3 + ((e + 1) % 3))));
      }
    }
  }

  // Compute total surface area
  let totalArea = 0;
  if (idxAttr) {
    for (let f = 0; f < faceCount; f++) {
      const i0 = idxAttr.getX(f * 3);
      const i1 = idxAttr.getX(f * 3 + 1);
      const i2 = idxAttr.getX(f * 3 + 2);
      const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));
      totalArea += new THREE.Vector3().crossVectors(
        new THREE.Vector3().subVectors(v1, v0),
        new THREE.Vector3().subVectors(v2, v0),
      ).length() * 0.5;
    }
  }

  return {
    VertexCount: posAttr.count,
    FaceCount: faceCount,
    EdgeCount: edgeSet.size || faceCount * 3,
    Area: totalArea,
    Volume: 0,
  };
}

/**
 * 32. PointLight — Point light data.
 * Inputs: Color, Strength, Radius
 * Outputs: Color, Strength, Radius, Position
 */
export function executePointLight(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1, a: 1 }) as ColorLike;
  const strength = (inputs.Strength ?? inputs.strength ?? 100) as number;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.25) as number;
  const position = normalizeVec(inputs.Position ?? inputs.position ?? { x: 0, y: 0, z: 0 });

  return {
    Color: color,
    Strength: strength,
    Radius: radius,
    Position: position,
  };
}

/**
 * 33. SpotLight — Spot light data.
 * Inputs: Color, Strength, Radius, SpotSize, SpotBlend
 * Outputs: Color, Strength, Radius, SpotSize, SpotBlend
 */
export function executeSpotLight(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1, a: 1 }) as ColorLike;
  const strength = (inputs.Strength ?? inputs.strength ?? 100) as number;
  const radius = (inputs.Radius ?? inputs.radius ?? 0.25) as number;
  const spotSize = (inputs.SpotSize ?? inputs.spotSize ?? Math.PI / 4) as number;
  const spotBlend = (inputs.SpotBlend ?? inputs.spotBlend ?? 0.15) as number;

  return {
    Color: color,
    Strength: strength,
    Radius: radius,
    SpotSize: spotSize,
    SpotBlend: spotBlend,
  };
}

/**
 * 34. SunLight — Sun light data.
 * Inputs: Color, Strength, Angle
 * Outputs: Color, Strength, Angle, Direction
 */
export function executeSunLight(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 0.95, b: 0.85, a: 1 }) as ColorLike;
  const strength = (inputs.Strength ?? inputs.strength ?? 5) as number;
  const angle = (inputs.Angle ?? inputs.angle ?? 0.009180) as number;
  const direction = normalizeVec(inputs.Direction ?? inputs.direction ?? { x: 0, y: -1, z: 0 });

  return {
    Color: color,
    Strength: strength,
    Angle: angle,
    Direction: direction,
  };
}

/**
 * 35. AreaLight — Area light data.
 * Inputs: Color, Strength, Width, Height
 * Outputs: Color, Strength, Width, Height
 */
export function executeAreaLight(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 1, g: 1, b: 1, a: 1 }) as ColorLike;
  const strength = (inputs.Strength ?? inputs.strength ?? 100) as number;
  const width = (inputs.Width ?? inputs.width ?? 1.0) as number;
  const height = (inputs.Height ?? inputs.height ?? 1.0) as number;

  return {
    Color: color,
    Strength: strength,
    Width: width,
    Height: height,
  };
}

/**
 * 36. LightAttenuation — Light attenuation.
 * Inputs: Distance, Falloff, Strength
 * Outputs: Value
 */
export function executeLightAttenuation(inputs: NodeInputs): NodeOutput {
  const distance = (inputs.Distance ?? inputs.distance ?? 1.0) as number;
  const falloff = (inputs.Falloff ?? inputs.falloff ?? 'INVERSE_SQUARE') as string;
  const strength = (inputs.Strength ?? inputs.strength ?? 1.0) as number;

  let value = 0;
  const d = Math.max(distance, 0.001);

  switch (falloff) {
    case 'CONSTANT': value = strength; break;
    case 'INVERSE': value = strength / d; break;
    case 'INVERSE_SQUARE': value = strength / (d * d); break;
    case 'INVERSE_CUBIC': value = strength / (d * d * d); break;
    case 'LINEAR': value = strength * Math.max(0, 1 - d); break;
    default: value = strength / (d * d); break;
  }

  return { Value: value };
}

/**
 * 37. RandomPerIsland — Random per mesh island.
 * Inputs: Geometry, Seed
 * Outputs: Value
 */
export function executeRandomPerIsland(inputs: NodeInputs): NodeOutput {
  const geometry = (inputs.Geometry ?? inputs.geometry ?? null) as THREE.BufferGeometry | null;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  if (!geometry || !geometry.getAttribute('position') || !geometry.getIndex()) {
    return { Value: [] };
  }

  const posAttr = geometry.getAttribute('position');
  const idxAttr = geometry.getIndex()!;
  const faceCount = Math.floor(idxAttr.count / 3);

  // Simple island detection via flood-fill using edge adjacency
  const visited = new Uint8Array(faceCount);
  const rng = seededRandom(seed);
  const values = new Float32Array(faceCount);

  // Build face adjacency
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < faceCount; f++) {
    for (let e = 0; e < 3; e++) {
      const a = idxAttr.getX(f * 3 + e);
      const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
      const key = edgeKey(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key)!.push(f);
    }
  }

  let islandId = 0;
  for (let startFace = 0; startFace < faceCount; startFace++) {
    if (visited[startFace]) continue;

    const islandValue = rng();
    const queue = [startFace];
    visited[startFace] = 1;

    while (queue.length > 0) {
      const f = queue.shift()!;
      values[f] = islandValue;

      for (let e = 0; e < 3; e++) {
        const a = idxAttr.getX(f * 3 + e);
        const b = idxAttr.getX(f * 3 + ((e + 1) % 3));
        const key = edgeKey(a, b);
        const neighbors = edgeFaces.get(key) ?? [];
        for (const nf of neighbors) {
          if (!visited[nf]) {
            visited[nf] = 1;
            queue.push(nf);
          }
        }
      }
    }
    islandId++;
  }

  return { Value: Array.from(values) };
}

// ============================================================================
// Texture & Utility Executors (4)
// ============================================================================

/**
 * 38. TextureGabor — Gabor texture.
 * Inputs: Vector, Scale, Frequency, Anisotropy, Orientation, Seed
 * Outputs: Value, Color
 */
export function executeTextureGabor(inputs: NodeInputs): NodeOutput {
  const vector = normalizeVec(inputs.Vector ?? inputs.vector ?? inputs.UV ?? inputs.uv ?? { x: 0.5, y: 0.5, z: 0 });
  const scale = (inputs.Scale ?? inputs.scale ?? 5.0) as number;
  const frequency = (inputs.Frequency ?? inputs.frequency ?? 2.0) as number;
  const anisotropy = (inputs.Anisotropy ?? inputs.anisotropy ?? 1.0) as number;
  const orientation = (inputs.Orientation ?? inputs.orientation ?? 0.0) as number;
  const seed = (inputs.Seed ?? inputs.seed ?? 0) as number;

  // Simplified Gabor filter: sum of sinusoidal gratings
  const rng = seededRandom(seed);
  const numKernels = 8;
  let sum = 0;

  for (let k = 0; k < numKernels; k++) {
    const phi = rng() * Math.PI * 2;
    const theta = orientation + (rng() - 0.5) * (1 - anisotropy) * Math.PI;
    const sx = vector.x * scale;
    const sy = vector.y * scale;

    const rotatedX = sx * Math.cos(theta) + sy * Math.sin(theta);
    const rotatedY = -sx * Math.sin(theta) + sy * Math.cos(theta);

    // Gaussian envelope × cosine
    const sigma = 0.5;
    const envelope = Math.exp(-(rotatedX * rotatedX + rotatedY * rotatedY) / (2 * sigma * sigma));
    const grating = Math.cos(2 * Math.PI * frequency * rotatedX + phi);
    sum += envelope * grating;
  }

  const value = THREE.MathUtils.clamp((sum / numKernels + 1) * 0.5, 0, 1);

  return {
    Value: value,
    Color: { r: value, g: value, b: value, a: 1 } as ColorLike,
  };
}

/**
 * 39. FloorCeil — Floor/ceil math operations.
 * Inputs: Value, Operation (FLOOR/CEIL/ROUND/TRUNC)
 * Outputs: Result
 */
export function executeFloorCeil(inputs: NodeInputs): NodeOutput {
  const value = (inputs.Value ?? inputs.value ?? inputs.Float ?? inputs.float ?? 0) as number;
  const operation = (inputs.Operation ?? inputs.operation ?? 'FLOOR') as string;

  let result: number;
  switch (operation) {
    case 'FLOOR': result = Math.floor(value); break;
    case 'CEIL': result = Math.ceil(value); break;
    case 'ROUND': result = Math.round(value); break;
    case 'TRUNC': result = Math.trunc(value); break;
    case 'MODULO': result = value - Math.floor(value); break;
    case 'FRACTION': result = value - Math.floor(value); break;
    case 'ABSOLUTE': result = Math.abs(value); break;
    case 'MINIMUM': result = Math.min(value, (inputs.Value2 ?? inputs.value2 ?? value) as number); break;
    case 'MAXIMUM': result = Math.max(value, (inputs.Value2 ?? inputs.value2 ?? value) as number); break;
    default: result = Math.floor(value); break;
  }

  return { Result: result };
}

/**
 * 40. RGBToBW — RGB to black/white (luminance).
 * Inputs: Color
 * Outputs: Value (luminance)
 */
export function executeRGBToBW(inputs: NodeInputs): NodeOutput {
  const color = (inputs.Color ?? inputs.color ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 }) as ColorLike;

  // Standard luminance weights (Rec. 709)
  const luminance = 0.2126 * (color.r ?? 0) + 0.7152 * (color.g ?? 0) + 0.0722 * (color.b ?? 0);

  return { Value: luminance };
}

/**
 * 41. FloatCurve — Float curve adjustment.
 * Inputs: Factor, Value, Curve
 * Outputs: Value
 */
export function executeFloatCurve(inputs: NodeInputs): NodeOutput {
  const factor = (inputs.Factor ?? inputs.factor ?? 0.5) as number;
  const value = (inputs.Value ?? inputs.value ?? 0.5) as number;
  const curve = (inputs.Curve ?? inputs.curve ?? null) as unknown;

  // If curve is a mapping function, use it; otherwise apply a smoothstep
  if (typeof curve === 'function') {
    return { Value: (curve as (v: number) => number)(value) };
  }

  // Default: apply smoothstep mapping using factor as bias
  const t = THREE.MathUtils.clamp(value, 0, 1);
  const mapped = t * t * (3 - 2 * t); // smoothstep

  return { Value: mapped * factor + value * (1 - factor) };
}

// ============================================================================
// Namespace export for convenience
// ============================================================================

export const SpecializedNodeExecutors = {
  executeLayerWeight,
  executeLightPath,
  executeWireframe,
  executeShaderObjectInfo,
  executeParticleInfo,
  executeCameraData,
  executeHairInfo,
  executeNewGeometry,
  executeBlackBody,
  executeWavelength,
  executeBevel,
  executeNormalize,
  executeVectorRotate,
  executeVectorTransform,
  executeQuaternion,
  executeMatrixTransform,
  executeAttribute,
  executeCurveSplineType,
  executeEdgeAngle,
  executeEdgesOfVertex,
  executeVerticesOfEdge,
  executeVerticesOfFace,
  executeFacesOfVertex,
  executeFaceCorners,
  executeNamedCorner,
  executeExposure,
  executeNormal,
  executeTangent,
  executeTrueNormal,
  executeMaterialInfo,
  executeMeshInfo,
  executePointLight,
  executeSpotLight,
  executeSunLight,
  executeAreaLight,
  executeLightAttenuation,
  executeRandomPerIsland,
  executeTextureGabor,
  executeFloorCeil,
  executeRGBToBW,
  executeFloatCurve,
};
