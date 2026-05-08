/**
 * GLSL Shader Composer Integration
 *
 * Extends the base GLSLShaderComposer with support for the expanded
 * GLSL node function library. This module provides:
 * - Merged snippet maps (base + expanded)
 * - Merged node type → GLSL requirement mappings
 * - Extended vertex/fragment shader templates with new varyings
 * - A wrapper class that adds code generation for all expanded node types
 *
 * @module core/nodes/execution/glsl
 */

import {
  GLSL_SNIPPET_MAP,
  NODE_TYPE_GLSL_REQUIREMENTS,
} from './GLSLNodeFunctions';

import {
  EXPANDED_GLSL_SNIPPET_MAP,
  EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS,
  EXTENDED_VERTEX_VARYINGS,
  EXTENDED_VERTEX_MAIN_ADDITIONS,
  EXTENDED_FRAGMENT_VARYINGS,
} from './ExpandedGLSLFunctions';

// Re-export expanded types for convenience
export {
  ATTRIBUTE_NODES_GLSL,
  CURVE_NODES_GLSL,
  LIGHT_PATH_NODES_GLSL,
  BUMP_NORMAL_NODES_GLSL,
  MAP_RANGE_GLSL,
  VECTOR_ROTATE_GLSL,
  VOLUME_NODES_GLSL,
  ADDITIONAL_MATH_GLSL,
  EXTENDED_VERTEX_VARYINGS,
  EXTENDED_VERTEX_MAIN_ADDITIONS,
  EXTENDED_FRAGMENT_VARYINGS,
  EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS,
  EXPANDED_GLSL_SNIPPET_MAP,
  ALL_EXPANDED_GLSL_FUNCTIONS,
} from './ExpandedGLSLFunctions';

// ============================================================================
// Merged Snippet Map
// ============================================================================

/**
 * Combined GLSL snippet map: base functions + expanded functions.
 * Use this when composing shaders that may use any node type.
 */
export const MERGED_GLSL_SNIPPET_MAP: Record<string, string> = {
  ...GLSL_SNIPPET_MAP,
  ...EXPANDED_GLSL_SNIPPET_MAP,
};

// ============================================================================
// Merged Node Type Requirements
// ============================================================================

/**
 * Combined node type → GLSL requirements mapping.
 * Covers both the original ~25 node types and the expanded set.
 */
export const MERGED_NODE_TYPE_GLSL_REQUIREMENTS: Record<string, string[]> = {
  ...NODE_TYPE_GLSL_REQUIREMENTS,
  ...EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS,
};

// ============================================================================
// Extended Vertex Shader Template
// ============================================================================

const GLSL_VERSION_HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

/**
 * Extended vertex shader template with additional varyings
 * for tangent, bitangent, and vertex ID support.
 */
export const EXTENDED_VERTEX_SHADER_TEMPLATE = `${GLSL_VERSION_HEADER}

// Vertex attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Standard varyings
out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

// Extended varyings for expanded node support
out vec3 vTangent;
out float vVertexID;
out vec3 vBitangent;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;

  // Extended: compute tangent space basis
  vVertexID = float(gl_VertexID);
  vec3 up = abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vTangent = normalize(cross(up, vNormal));
  vBitangent = cross(vNormal, vTangent);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// ============================================================================
// Extended Fragment Shader Varyings
// ============================================================================

/**
 * Extended fragment shader varyings block to be prepended
 * when using expanded node types.
 */
export const EXTENDED_FRAGMENT_VARYINGS_BLOCK = `
// Standard varyings from vertex shader
in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

// Extended varyings for expanded node support
in vec3 vTangent;
in float vVertexID;
in vec3 vBitangent;
`;

// ============================================================================
// Node Type Code Generation Helpers
// ============================================================================

/**
 * Check if a node type is part of the expanded set.
 */
export function isExpandedNodeType(nodeType: string): boolean {
  return nodeType in EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS;
}

/**
 * Get all required GLSL snippet names for a given node type,
 * including both base and expanded requirements.
 */
export function getRequiredSnippetsForType(nodeType: string): string[] {
  const base = NODE_TYPE_GLSL_REQUIREMENTS[nodeType] ?? [];
  const expanded = EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS[nodeType] ?? [];
  return [...new Set([...base, ...expanded])];
}

/**
 * Determine whether a shader graph requires the extended
 * vertex/fragment varyings (i.e., uses any expanded node type).
 */
export function requiresExtendedVaryings(nodeTypes: string[]): boolean {
  return nodeTypes.some(t => isExpandedNodeType(t));
}

/**
 * Resolve GLSL snippet names for a list of node types,
 * returning deduplicated snippet names.
 */
export function resolveAllSnippets(nodeTypes: string[]): string[] {
  const all = new Set<string>();
  for (const nodeType of nodeTypes) {
    for (const snippet of getRequiredSnippetsForType(nodeType)) {
      all.add(snippet);
    }
  }
  return [...all];
}

/**
 * Build the complete GLSL function code block for the given
 * snippet names, using the merged snippet map.
 */
export function buildFunctionCode(snippetNames: string[]): string {
  const parts: string[] = [];
  for (const name of snippetNames) {
    const code = MERGED_GLSL_SNIPPET_MAP[name];
    if (code) {
      parts.push(code);
    }
  }
  return parts.join('\n');
}

// ============================================================================
// Map Range Mode Constants
// ============================================================================

export const MAP_RANGE_MODES = {
  LINEAR: 0,
  STEPPED: 1,
  SMOOTHSTEP: 2,
  SMOOTHERSTEP: 3,
} as const;

// ============================================================================
// Vector Rotate Mode Constants
// ============================================================================

export const VECTOR_ROTATE_MODES = {
  AXIS_ANGLE: 0,
  EULER_XYZ: 1,
  X_AXIS: 2,
  Y_AXIS: 3,
  Z_AXIS: 4,
} as const;

// ============================================================================
// Compare Node Mode Constants
// ============================================================================

export const COMPARE_MODES = {
  LESS_THAN: 0,
  LESS_EQUAL: 1,
  GREATER_THAN: 2,
  GREATER_EQUAL: 3,
  EQUAL: 4,
  NOT_EQUAL: 5,
} as const;

// ============================================================================
// Boolean Math Mode Constants
// ============================================================================

export const BOOLEAN_MATH_MODES = {
  AND: 0,
  OR: 1,
  NOT: 2,
  XOR: 3,
  NAND: 4,
  NOR: 5,
  XNOR: 6,
  IMPLY: 7,
  SUBTRACT: 8,
} as const;

// ============================================================================
// Clamp Node Mode Constants
// ============================================================================

export const CLAMP_MODES = {
  MINMAX: 0,
  RANGE: 1,
} as const;
