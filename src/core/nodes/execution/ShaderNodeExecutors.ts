/**
 * ShaderNodeExecutors — Standalone executor functions for shader node types
 *
 * Extracted from NodeEvaluator's private methods during the registry-first
 * refactoring. Each function is a pure standalone executor that takes
 * `inputs` (and optionally `settings`) and returns an output socket mapping.
 *
 * Helpers (resolveColor, normalizeVector, normalizeColorObj) are internal
 * to this module — they are NOT exported.
 *
 * @module core/nodes/execution
 */

import * as THREE from 'three';

// ============================================================================
// Helpers (internal — not exported)
// ============================================================================

function resolveColor(color: any): THREE.Color {
  if (color instanceof THREE.Color) return color;
  if (typeof color === 'string') return new THREE.Color(color);
  if (typeof color === 'number') return new THREE.Color(color);
  if (color && typeof color === 'object') {
    if ('r' in color && 'g' in color && 'b' in color) {
      return new THREE.Color(color.r, color.g, color.b);
    }
  }
  return new THREE.Color(0.8, 0.8, 0.8);
}

function normalizeVector(v: any): { x: number; y: number; z: number } {
  if (v instanceof THREE.Vector3) return { x: v.x, y: v.y, z: v.z };
  if (Array.isArray(v)) return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
  if (v && typeof v === 'object') return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
  return { x: 0, y: 0, z: 0 };
}

function normalizeColorObj(c: any): { r: number; g: number; b: number } {
  if (c instanceof THREE.Color) return { r: c.r, g: c.g, b: c.b };
  if (c && typeof c === 'object' && 'r' in c) return { r: c.r, g: c.g, b: c.b };
  return { r: 0.5, g: 0.5, b: 0.5 };
}

// ============================================================================
// Shader BSDF Executors
// ============================================================================

export function executePrincipledBSDF(inputs: Record<string, any>): any {
  const baseColor = resolveColor(inputs.BaseColor ?? inputs.baseColor ?? new THREE.Color(0.8, 0.8, 0.8));
  const metallic = inputs.Metallic ?? inputs.metallic ?? 0.0;
  const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;
  const specular = inputs.Specular ?? inputs.specular ?? 0.5;
  const ior = inputs.IOR ?? inputs.ior ?? 1.45;
  const transmission = inputs.Transmission ?? inputs.transmission ?? 0.0;
  const emissionStrength = inputs.EmissionStrength ?? inputs.emissionStrength ?? 0.0;
  const emissionColor = resolveColor(inputs.EmissionColor ?? inputs.emissionColor ?? new THREE.Color(0, 0, 0));
  const alpha = inputs.Alpha ?? inputs.alpha ?? 1.0;
  const clearcoat = inputs.Clearcoat ?? inputs.clearcoat ?? 0.0;
  const clearcoatRoughness = inputs.ClearcoatRoughness ?? inputs.clearcoatRoughness ?? 0.03;
  const subsurfaceWeight = inputs.SubsurfaceWeight ?? inputs.subsurfaceWeight ?? 0.0;
  const sheen = inputs.Sheen ?? inputs.sheen ?? 0.0;
  const anisotropic = inputs.Anisotropic ?? inputs.anisotropic ?? 0.0;

  return {
    BSDF: {
      type: 'principled_bsdf',
      baseColor,
      metallic,
      roughness,
      specular,
      ior,
      transmission,
      emissionStrength,
      emissionColor,
      alpha,
      clearcoat,
      clearcoatRoughness,
      subsurfaceWeight,
      sheen,
      anisotropic,
    },
  };
}

export function executeDiffuseBSDF(inputs: Record<string, any>): any {
  const color = resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(0.8, 0.8, 0.8));
  const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;

  return {
    BSDF: {
      type: 'bsdf_diffuse',
      baseColor: color,
      metallic: 0.0,
      roughness,
    },
  };
}

export function executeGlossyBSDF(inputs: Record<string, any>): any {
  const color = resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
  const roughness = inputs.Roughness ?? inputs.roughness ?? 0.0;

  return {
    BSDF: {
      type: 'bsdf_glossy',
      baseColor: color,
      metallic: 1.0,
      roughness,
    },
  };
}

export function executeGlassBSDF(inputs: Record<string, any>): any {
  const color = resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
  const roughness = inputs.Roughness ?? inputs.roughness ?? 0.0;
  const ior = inputs.IOR ?? inputs.ior ?? 1.45;

  return {
    BSDF: {
      type: 'bsdf_glass',
      baseColor: color,
      metallic: 0.0,
      roughness,
      ior,
      transmission: 1.0,
      alpha: 1.0,
    },
  };
}

export function executeEmission(inputs: Record<string, any>): any {
  const color = resolveColor(inputs.Color ?? inputs.color ?? new THREE.Color(1, 1, 1));
  const strength = inputs.Strength ?? inputs.strength ?? 1.0;

  return {
    Emission: {
      type: 'emission',
      baseColor: new THREE.Color(0, 0, 0),
      emissionColor: color,
      emissionStrength: strength,
    },
  };
}

export function executeMixShader(inputs: Record<string, any>): any {
  const factor = inputs.Factor ?? inputs.factor ?? 0.5;
  const shader1 = inputs['Shader 1'] ?? inputs.shader1 ?? null;
  const shader2 = inputs['Shader 2'] ?? inputs.shader2 ?? null;

  return {
    Shader: {
      type: 'mix_shader',
      factor,
      shader1,
      shader2,
    },
  };
}

export function executeAddShader(inputs: Record<string, any>): any {
  const shader1 = inputs['Shader 1'] ?? inputs.shader1 ?? null;
  const shader2 = inputs['Shader 2'] ?? inputs.shader2 ?? null;

  return {
    Shader: {
      type: 'add_shader',
      shader1,
      shader2,
    },
  };
}

// ============================================================================
// Texture Executors
// ============================================================================

export function executeNoiseTexture(inputs: Record<string, any>): any {
  const scale = inputs.Scale ?? inputs.scale ?? 5.0;
  const detail = inputs.Detail ?? inputs.detail ?? 2.0;
  const roughness = inputs.Roughness ?? inputs.roughness ?? 0.5;
  const distortion = inputs.Distortion ?? inputs.distortion ?? 0.0;
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

  return {
    Fac: { type: 'noise_texture', scale, detail, roughness, distortion, vector },
    Color: { type: 'noise_texture', scale, detail, roughness, distortion, vector },
  };
}

export function executeVoronoiTexture(inputs: Record<string, any>): any {
  const scale = inputs.Scale ?? inputs.scale ?? 5.0;
  const distanceMetric = inputs.Distance ?? inputs.distance ?? 'euclidean';
  const feature = inputs.Feature ?? inputs.feature ?? 'f1';
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

  return {
    Distance: { type: 'voronoi_texture', scale, distanceMetric, feature, vector },
    Color: { type: 'voronoi_texture', scale, distanceMetric, feature, vector },
    Position: vector,
  };
}

export function executeMusgraveTexture(inputs: Record<string, any>): any {
  const scale = inputs.Scale ?? inputs.scale ?? 5.0;
  const detail = inputs.Detail ?? inputs.detail ?? 2.0;
  const dimension = inputs.Dimension ?? inputs.dimension ?? 2.0;
  const lacunarity = inputs.Lacunarity ?? inputs.lacunarity ?? 2.0;
  const musgraveType = inputs.MusgraveType ?? inputs.musgraveType ?? 'fbm';
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

  return {
    Fac: { type: 'musgrave_texture', scale, detail, dimension, lacunarity, musgraveType, vector },
  };
}

export function executeGradientTexture(inputs: Record<string, any>): any {
  const gradientType = inputs.GradientType ?? inputs.gradientType ?? 'linear';
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };

  return {
    Fac: { type: 'gradient_texture', gradientType, vector },
    Color: { type: 'gradient_texture', gradientType, vector },
  };
}

// ============================================================================
// Color Executors
// ============================================================================

export function executeMixRGB(inputs: Record<string, any>): any {
  const color1 = inputs.Color1 ?? inputs.color1 ?? { r: 0.5, g: 0.5, b: 0.5 };
  const color2 = inputs.Color2 ?? inputs.color2 ?? { r: 0.5, g: 0.5, b: 0.5 };
  const factor = inputs.Fac ?? inputs.factor ?? inputs.Factor ?? 0.5;
  const blendType = inputs.BlendType ?? inputs.blendType ?? 'mix';

  let result: { r: number; g: number; b: number };

  const c1 = normalizeColorObj(color1);
  const c2 = normalizeColorObj(color2);

  switch (blendType) {
    case 'add':
      result = { r: c1.r + c2.r, g: c1.g + c2.g, b: c1.b + c2.b };
      break;
    case 'multiply':
      result = { r: c1.r * c2.r, g: c1.g * c2.g, b: c1.b * c2.b };
      break;
    case 'screen':
      result = {
        r: 1 - (1 - c1.r) * (1 - c2.r),
        g: 1 - (1 - c1.g) * (1 - c2.g),
        b: 1 - (1 - c1.b) * (1 - c2.b),
      };
      break;
    case 'subtract':
      result = { r: c1.r - c2.r, g: c1.g - c2.g, b: c1.b - c2.b };
      break;
    default: // 'mix'
      result = {
        r: c1.r + factor * (c2.r - c1.r),
        g: c1.g + factor * (c2.g - c1.g),
        b: c1.b + factor * (c2.b - c1.b),
      };
  }

  return { Color: result };
}

export function executeColorRamp(inputs: Record<string, any>): any {
  const factor = inputs.Fac ?? inputs.factor ?? 0.5;
  const colorRamp = inputs.ColorRamp ?? inputs.colorRamp ?? [
    { position: 0, color: { r: 0, g: 0, b: 0 } },
    { position: 1, color: { r: 1, g: 1, b: 1 } },
  ];

  const t = Math.max(0, Math.min(1, factor));
  let color = { r: 0, g: 0, b: 0 };

  if (colorRamp.length > 0) {
    if (colorRamp.length === 1) {
      color = { ...colorRamp[0].color };
    } else {
      // Find surrounding stops
      let lower = colorRamp[0];
      let upper = colorRamp[colorRamp.length - 1];

      for (let i = 0; i < colorRamp.length - 1; i++) {
        if (t >= colorRamp[i].position && t <= colorRamp[i + 1].position) {
          lower = colorRamp[i];
          upper = colorRamp[i + 1];
          break;
        }
      }

      const range = upper.position - lower.position;
      const localT = range > 0 ? (t - lower.position) / range : 0;

      color = {
        r: lower.color.r + localT * (upper.color.r - lower.color.r),
        g: lower.color.g + localT * (upper.color.g - lower.color.g),
        b: lower.color.b + localT * (upper.color.b - lower.color.b),
      };
    }
  }

  return { Color: color, Alpha: 1.0 };
}

// ============================================================================
// Math Executors
// ============================================================================

export function executeMath(inputs: Record<string, any>): any {
  const value1 = inputs.Value ?? inputs.value ?? inputs.Value1 ?? 0.0;
  const value2 = inputs.Value_1 ?? inputs.value2 ?? inputs.Value2 ?? 0.0;
  const operation = inputs.Operation ?? inputs.operation ?? 'add';

  let result: number;

  switch (operation) {
    case 'add': result = value1 + value2; break;
    case 'subtract': result = value1 - value2; break;
    case 'multiply': result = value1 * value2; break;
    case 'divide': result = value2 !== 0 ? value1 / value2 : 0; break;
    case 'power': result = Math.pow(value1, value2); break;
    case 'logarithm': result = value1 > 0 && value2 > 0 ? Math.log(value1) / Math.log(value2) : 0; break;
    case 'sqrt': result = Math.sqrt(Math.max(0, value1)); break;
    case 'abs': result = Math.abs(value1); break;
    case 'min': result = Math.min(value1, value2); break;
    case 'max': result = Math.max(value1, value2); break;
    case 'clamp': result = Math.max(0, Math.min(1, value1)); break;
    case 'sin': result = Math.sin(value1); break;
    case 'cos': result = Math.cos(value1); break;
    case 'tan': result = Math.tan(value1); break;
    case 'modulo': result = value2 !== 0 ? ((value1 % value2) + value2) % value2 : 0; break;
    case 'floor': result = Math.floor(value1); break;
    case 'ceil': result = Math.ceil(value1); break;
    case 'round': result = Math.round(value1); break;
    default: result = value1;
  }

  // Apply clamp if useClamp is set
  if (inputs.UseClamp ?? inputs.useClamp) {
    result = Math.max(0, Math.min(1, result));
  }

  return { Value: result };
}

export function executeVectorMath(inputs: Record<string, any>): any {
  const vector1 = inputs.Vector ?? inputs.vector1 ?? inputs.Vector1 ?? { x: 0, y: 0, z: 0 };
  const vector2 = inputs.Vector_1 ?? inputs.vector2 ?? inputs.Vector2 ?? { x: 0, y: 0, z: 0 };
  const operation = inputs.Operation ?? inputs.operation ?? 'add';

  const v1 = normalizeVector(vector1);
  const v2 = normalizeVector(vector2);

  let result: { x: number; y: number; z: number };
  let value: number = 0;

  switch (operation) {
    case 'add':
      result = { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
      break;
    case 'subtract':
      result = { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
      break;
    case 'multiply':
      result = { x: v1.x * v2.x, y: v1.y * v2.y, z: v1.z * v2.z };
      break;
    case 'divide':
      result = {
        x: v2.x !== 0 ? v1.x / v2.x : 0,
        y: v2.y !== 0 ? v1.y / v2.y : 0,
        z: v2.z !== 0 ? v1.z / v2.z : 0,
      };
      break;
    case 'cross':
      result = {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x,
      };
      break;
    case 'dot':
      value = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      result = v1;
      break;
    case 'normalize': {
      const len = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
      result = len > 0 ? { x: v1.x / len, y: v1.y / len, z: v1.z / len } : { x: 0, y: 0, z: 0 };
      break;
    }
    case 'length':
      value = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
      result = v1;
      break;
    case 'scale': {
      const s = inputs.Scale ?? inputs.scale ?? 1.0;
      result = { x: v1.x * s, y: v1.y * s, z: v1.z * s };
      break;
    }
    default:
      result = v1;
  }

  return { Vector: result, Value: value };
}

// ============================================================================
// Vector Executors
// ============================================================================

export function executeMapping(inputs: Record<string, any>, settings: Record<string, any>): any {
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
  const translation = settings.Translation ?? settings.translation ?? { x: 0, y: 0, z: 0 };
  const rotation = settings.Rotation ?? settings.rotation ?? { x: 0, y: 0, z: 0 };
  const scale = settings.Scale ?? settings.scale ?? { x: 1, y: 1, z: 1 };

  let result = normalizeVector(vector);

  // Apply scale
  result = {
    x: result.x * (scale.x ?? 1),
    y: result.y * (scale.y ?? 1),
    z: result.z * (scale.z ?? 1),
  };

  // Apply rotation using Euler rotation
  const rx = (rotation.x ?? 0);
  const ry = (rotation.y ?? 0);
  const rz = (rotation.z ?? 0);

  // Rotation around Z axis
  if (rz !== 0) {
    const cos = Math.cos(rz);
    const sin = Math.sin(rz);
    const x = result.x * cos - result.y * sin;
    const y = result.x * sin + result.y * cos;
    result = { x, y, z: result.z };
  }

  // Rotation around Y axis
  if (ry !== 0) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const x = result.x * cos + result.z * sin;
    const z = -result.x * sin + result.z * cos;
    result = { x, y: result.y, z };
  }

  // Rotation around X axis
  if (rx !== 0) {
    const cos = Math.cos(rx);
    const sin = Math.sin(rx);
    const y = result.y * cos - result.z * sin;
    const z = result.y * sin + result.z * cos;
    result = { x: result.x, y, z };
  }

  // Apply translation
  result = {
    x: result.x + (translation.x ?? 0),
    y: result.y + (translation.y ?? 0),
    z: result.z + (translation.z ?? 0),
  };

  return { Vector: result };
}

export function executeCombineXYZ(inputs: Record<string, any>): any {
  const x = inputs.X ?? inputs.x ?? 0;
  const y = inputs.Y ?? inputs.y ?? 0;
  const z = inputs.Z ?? inputs.z ?? 0;
  return { Vector: { x, y, z } };
}

export function executeSeparateXYZ(inputs: Record<string, any>): any {
  const vector = inputs.Vector ?? inputs.vector ?? { x: 0, y: 0, z: 0 };
  const v = normalizeVector(vector);
  return { X: v.x, Y: v.y, Z: v.z };
}

export function executeTextureCoordinate(inputs: Record<string, any>): any {
  // Returns placeholder coordinate info - actual values come from geometry at render time
  return {
    Generated: { x: 0, y: 0, z: 0 },
    Normal: { x: 0, y: 1, z: 0 },
    UV: { x: 0, y: 0, z: 0 },
    Object: { x: 0, y: 0, z: 0 },
    Camera: { x: 0, y: 0, z: 0 },
    Window: { x: 0, y: 0, z: 0 },
  };
}
