/**
 * GLSL Shader Generation Module - Index
 *
 * Provides GLSL node function libraries and shader composition
 * for generating complete GLSL shaders from node graphs.
 *
 * @module core/nodes/execution/glsl
 */

// GLSL Node Functions (original)
export {
  COMMON_UTILITIES_GLSL,
  NOISE_TEXTURE_GLSL,
  VORONOI_TEXTURE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  CHECKER_TEXTURE_GLSL,
  MAGIC_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MIX_RGB_GLSL,
  MATH_GLSL,
  VECTOR_MATH_GLSL,
  PRINCIPLED_BSDF_GLSL,
  MIX_ADD_SHADER_GLSL,
  MAPPING_GLSL,
  TEXTURE_COORD_GLSL,
  IBL_GLSL,
  MULTI_LIGHT_GLSL,
  SHADOW_MAPPING_GLSL,
  ALL_GLSL_NODE_FUNCTIONS,
  NODE_TYPE_GLSL_REQUIREMENTS,
  GLSL_SNIPPET_MAP,
} from './GLSLNodeFunctions';

// Expanded GLSL Functions
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

// GLSL Composer Integration
export {
  MERGED_GLSL_SNIPPET_MAP,
  MERGED_NODE_TYPE_GLSL_REQUIREMENTS,
  EXTENDED_VERTEX_SHADER_TEMPLATE,
  EXTENDED_FRAGMENT_VARYINGS_BLOCK,
  MAP_RANGE_MODES,
  VECTOR_ROTATE_MODES,
  COMPARE_MODES,
  BOOLEAN_MATH_MODES,
  CLAMP_MODES,
  isExpandedNodeType,
  getRequiredSnippetsForType,
  requiresExtendedVaryings,
  resolveAllSnippets,
  buildFunctionCode,
} from './GLSLComposerIntegration';

// GLSL Shader Composer
export {
  GLSLShaderComposer,
  default as GLSLShaderComposerDefault,
} from './GLSLShaderComposer';

export type {
  ComposableNode,
  ShaderGraph,
  ComposedShader,
} from './GLSLShaderComposer';
