/**
 * Expanded GLSL Node Function Library
 *
 * Provides GLSL code generation for additional Blender/Infinigen node types
 * that were previously handled as passthrough in the GLSLShaderComposer.
 *
 * Covers:
 * - Attribute Nodes (ShaderNodeAttribute, geometry input nodes)
 * - Curve Nodes (ShaderNodeFloatCurve enhanced, ShaderNodeRGBCurve)
 * - Light Nodes (ShaderNodeLightPath, ShaderNodeAmbientOcclusion)
 * - Bump/Normal Nodes (ShaderNodeBump, ShaderNodeNormalMap)
 * - Map Range (ShaderNodeMapRange)
 * - Vector Rotate (ShaderNodeVectorRotate)
 * - Volume Nodes (ShaderNodeVolumeAbsorption, ShaderNodeVolumeScatter)
 * - Additional Math (FunctionNodeCompare, FunctionNodeBooleanMath, ShaderNodeClamp)
 *
 * @module core/nodes/execution/glsl
 */

// ============================================================================
// Attribute Nodes GLSL
// ============================================================================

export const ATTRIBUTE_NODES_GLSL = /* glsl */ `
// ============================================================================
// Attribute Nodes — reading geometry attributes in the shader
// ============================================================================

// ShaderNodeAttribute — reads a named attribute from vertex data
// Usage: declare a varying/attribute in vertex shader and pass through,
// then sample here. For custom attributes, use the generated varying name.
// The attributeName uniform selects which attribute to read.
vec3 readAttributeVec3(vec3 defaultValue) {
  // In practice, custom attributes are passed as varyings from the vertex shader.
  // This function provides a fallback when no attribute is bound.
  return defaultValue;
}

float readAttributeFloat(float defaultValue) {
  return defaultValue;
}

// GeometryNodeInputPosition — already available as vPosition varying
vec3 geometryInputPosition() {
  return vPosition;
}

// GeometryNodeInputNormal — already available as vNormal varying
vec3 geometryInputNormal() {
  return normalize(vNormal);
}

// GeometryNodeInputIndex — vertex ID (WebGL2)
// Note: gl_VertexID is available in #version 300 es vertex shaders only.
// In fragment shader we approximate via a varying passed from vertex.
// The varying vVertexID should be declared and set in vertex shader.
int geometryInputIndex() {
  // This requires vVertexID varying from vertex shader
  // Default fallback to 0 if not available
  return 0;
}
`;

// ============================================================================
// Curve Nodes GLSL
// ============================================================================

export const CURVE_NODES_GLSL = /* glsl */ `
// ============================================================================
// Curve Nodes — FloatCurve and RGBCurve interpolation
// ============================================================================

// ShaderNodeFloatCurve — already in GLSLNodeFunctions, extended here
// with Catmull-Rom spline interpolation for smoother curves

float catmullRom(float p0, float p1, float p2, float p3, float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

float floatCurveSmooth(float fac, float positions[16], float values[16], int size) {
  float t = saturate(fac);

  if (size <= 0) return 0.0;
  if (size == 1) return values[0];

  // Find surrounding control points
  int lower = 0;
  int upper = size - 1;
  for (int i = 0; i < 15; i++) {
    if (i >= size - 1) break;
    if (t >= positions[i] && t <= positions[i + 1]) {
      lower = i;
      upper = i + 1;
      break;
    }
  }

  float range = positions[upper] - positions[lower];
  float localT = range > 0.0 ? (t - positions[lower]) / range : 0.0;

  // Catmull-Rom interpolation
  int i0 = max(lower - 1, 0);
  int i3 = min(upper + 1, size - 1);
  return catmullRom(values[i0], values[lower], values[upper], values[i3], localT);
}

// ShaderNodeRGBCurve — per-channel color curve
struct RGBCurveResult {
  vec3 color;
  float alpha;
};

RGBCurveResult rgbCurve(
  vec3 color,
  float positions[16],
  float rValues[16],
  float gValues[16],
  float bValues[16],
  float aValues[16],
  int size
) {
  RGBCurveResult result;
  result.color = vec3(
    floatCurve(color.r, positions, rValues, size),
    floatCurve(color.g, positions, gValues, size),
    floatCurve(color.b, positions, bValues, size)
  );
  result.alpha = floatCurve(color.r, positions, aValues, size); // combined curve applied to alpha
  return result;
}
`;

// ============================================================================
// Light Path Nodes GLSL
// ============================================================================

export const LIGHT_PATH_NODES_GLSL = /* glsl */ `
// ============================================================================
// Light Path Nodes — ray type booleans and ambient occlusion
// ============================================================================

// ShaderNodeLightPath — ray type flags
// In a rasterizer, we can only know we are on a camera ray.
// Other ray types default to false (only meaningful in path tracer).
struct LightPathInfo {
  float isCameraRay;
  float isShadowRay;
  float isDiffuseRay;
  float isGlossyRay;
  float isSingularRay;
  float isReflectionRay;
  float isTransmissionRay;
  float rayLength;
};

LightPathInfo lightPathNode() {
  LightPathInfo info;
  // In rasterization, the primary view ray is always a camera ray
  info.isCameraRay = 1.0;
  info.isShadowRay = 0.0;
  info.isDiffuseRay = 0.0;
  info.isGlossyRay = 0.0;
  info.isSingularRay = 0.0;
  info.isReflectionRay = 0.0;
  info.isTransmissionRay = 0.0;
  info.rayLength = length(cameraPosition - vWorldPosition);
  return info;
}

// ShaderNodeAmbientOcclusion — SSAO-like approximation
// This is a simplified approximation; real SSAO requires a depth buffer pass.
float ambientOcclusionNode(vec3 normal, float distance, int samples) {
  // Simple hemisphere-based AO approximation using noise
  float ao = 0.0;
  vec3 N = normalize(normal);

  // Use noise to simulate sample directions
  for (int i = 0; i < 16; i++) {
    if (i >= samples) break;
    // Generate a pseudo-random direction in the hemisphere
    float angle1 = float(i) * 2.39996; // golden angle
    float angle2 = fract(sin(float(i) * 12.9898) * 43758.5453);
    float z = angle2;
    float r = sqrt(1.0 - z * z);
    vec3 sampleDir = vec3(r * cos(angle1), r * sin(angle1), z);

    // Flip to hemisphere if below normal
    if (dot(sampleDir, N) < 0.0) sampleDir = -sampleDir;

    // Estimate occlusion based on local surface variation
    // This is a placeholder — real AO samples the depth buffer
    float heightVar = snoise3D(vPosition * 5.0 + sampleDir * distance) * 0.5 + 0.5;
    ao += smoothstep(0.0, distance, heightVar * distance);
  }

  ao /= max(float(samples), 1.0);
  return saturate(ao);
}
`;

// ============================================================================
// Bump / Normal Map Nodes GLSL
// ============================================================================

export const BUMP_NORMAL_NODES_GLSL = /* glsl */ `
// ============================================================================
// Bump / Normal Map Nodes — finite-difference normal perturbation and tangent-space decoding
// ============================================================================

// ShaderNodeBump — finite-difference normal perturbation from height
// Computes perturbed normal by sampling height at offset positions
vec3 bumpNode(
  float strength,
  float height,
  float distance,
  float invert,
  vec3 normal,
  vec3 position
) {
  // Compute finite difference offsets
  float eps = max(distance, EPSILON) * 0.001;

  // Use screen-space derivatives to construct tangent frame
  vec3 dpdx = dFdx(position);
  vec3 dpdy = dFdy(position);

  // Estimate height at neighboring positions
  // Since we only have one height value, use dFdx/dFdy for gradient
  float dHdx = dFdx(height);
  float dHdy = dFdy(height);

  // Construct perturbed normal using surface gradient
  vec3 N = normalize(normal);
  vec3 R = N * dot(N, dpdx);
  vec3 dPdx2 = dpdx - R + N * dHdx;
  R = N * dot(N, dpdy);
  vec3 dPdy2 = dpdy - R + N * dHdy;

  vec3 bumpedNormal = normalize(cross(dPdx2, dPdy2));

  // Invert if needed
  if (invert > 0.5) bumpedNormal = -bumpedNormal;

  // Mix with original based on strength
  return normalize(mix(N, bumpedNormal, saturate(strength)));
}

// ShaderNodeNormalMap — tangent-space normal map decoding
vec3 normalMapNode(float strength, vec3 normalMapColor, vec3 normal, vec3 tangent) {
  // Decode normal map from [0,1] to [-1,1]
  vec3 tangentNormal = normalMapColor * 2.0 - 1.0;

  // Apply strength
  tangentNormal.xy *= strength;
  tangentNormal = normalize(tangentNormal);

  // Build TBN matrix
  vec3 N = normalize(normal);
  vec3 T = normalize(tangent);
  // Ensure T is perpendicular to N
  T = normalize(T - dot(T, N) * N);
  vec3 B = cross(N, T);

  // Transform tangent-space normal to world space
  vec3 worldNormal = normalize(
    T * tangentNormal.x +
    B * tangentNormal.y +
    N * tangentNormal.z
  );

  return worldNormal;
}
`;

// ============================================================================
// Map Range Node GLSL
// ============================================================================

export const MAP_RANGE_GLSL = /* glsl */ `
// ============================================================================
// Map Range Node — linear/stepped/smoothstep/smooth cubic interpolation
// ============================================================================

float mapRangeLinear(float value, float fromMin, float fromMax, float toMin, float toMax) {
  float fromRange = fromMax - fromMin;
  float t = fromRange != 0.0 ? (value - fromMin) / fromRange : 0.0;
  t = clamp(t, 0.0, 1.0);
  return mix(toMin, toMax, t);
}

float mapRangeStepped(float value, float fromMin, float fromMax, float toMin, float toMax, float steps) {
  float fromRange = fromMax - fromMin;
  float t = fromRange != 0.0 ? (value - fromMin) / fromRange : 0.0;
  t = clamp(t, 0.0, 1.0);
  if (steps > 0.0) {
    t = floor(t * steps) / steps;
  }
  return mix(toMin, toMax, t);
}

float mapRangeSmoothstep(float value, float fromMin, float fromMax, float toMin, float toMax) {
  float fromRange = fromMax - fromMin;
  float t = fromRange != 0.0 ? (value - fromMin) / fromRange : 0.0;
  t = clamp(t, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return mix(toMin, toMax, t);
}

float mapRangeSmoothCubic(float value, float fromMin, float fromMax, float toMin, float toMax) {
  float fromRange = fromMax - fromMin;
  float t = fromRange != 0.0 ? (value - fromMin) / fromRange : 0.0;
  t = clamp(t, 0.0, 1.0);
  t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  return mix(toMin, toMax, t);
}

// Unified map range with interpolation mode selection:
// 0 = linear, 1 = stepped, 2 = smoothstep, 3 = smootherstep (smooth cubic)
float mapRangeNode(float value, float fromMin, float fromMax, float toMin, float toMax, float steps, int mode) {
  if (mode == 1) return mapRangeStepped(value, fromMin, fromMax, toMin, toMax, steps);
  if (mode == 2) return mapRangeSmoothstep(value, fromMin, fromMax, toMin, toMax);
  if (mode == 3) return mapRangeSmoothCubic(value, fromMin, fromMax, toMin, toMax);
  return mapRangeLinear(value, fromMin, fromMax, toMin, toMax);
}

// Vector version of map range
vec3 mapRangeVec3(vec3 value, float fromMin, float fromMax, float toMin, float toMax, float steps, int mode) {
  return vec3(
    mapRangeNode(value.x, fromMin, fromMax, toMin, toMax, steps, mode),
    mapRangeNode(value.y, fromMin, fromMax, toMin, toMax, steps, mode),
    mapRangeNode(value.z, fromMin, fromMax, toMin, toMax, steps, mode)
  );
}
`;

// ============================================================================
// Vector Rotate Node GLSL
// ============================================================================

export const VECTOR_ROTATE_GLSL = /* glsl */ `
// ============================================================================
// Vector Rotate Node — axis-angle, euler XYZ, X/Y/Z axis rotation
// ============================================================================

// Rotation around an arbitrary axis by angle (Rodrigues' formula)
vec3 rotateAxisAngle(vec3 vector, vec3 axis, float angle) {
  vec3 k = normalize(axis);
  float c = cos(angle);
  float s = sin(angle);
  return vector * c + cross(k, vector) * s + k * dot(k, vector) * (1.0 - c);
}

// Euler XYZ rotation
vec3 rotateEulerXYZ(vec3 vector, vec3 euler) {
  // X rotation
  float cx = cos(euler.x); float sx = sin(euler.x);
  vec3 result = vec3(vector.x, vector.y * cx - vector.z * sx, vector.y * sx + vector.z * cx);
  // Y rotation
  float cy = cos(euler.y); float sy = sin(euler.y);
  result = vec3(result.x * cy + result.z * sy, result.y, -result.x * sy + result.z * cy);
  // Z rotation
  float cz = cos(euler.z); float sz = sin(euler.z);
  result = vec3(result.x * cz - result.y * sz, result.x * sz + result.y * cz, result.z);
  return result;
}

// Single-axis rotation: X axis
vec3 rotateXAxis(vec3 vector, float angle) {
  float c = cos(angle); float s = sin(angle);
  return vec3(vector.x, vector.y * c - vector.z * s, vector.y * s + vector.z * c);
}

// Single-axis rotation: Y axis
vec3 rotateYAxis(vec3 vector, float angle) {
  float c = cos(angle); float s = sin(angle);
  return vec3(vector.x * c + vector.z * s, vector.y, -vector.x * s + vector.z * c);
}

// Single-axis rotation: Z axis
vec3 rotateZAxis(vec3 vector, float angle) {
  float c = cos(angle); float s = sin(angle);
  return vec3(vector.x * c - vector.y * s, vector.x * s + vector.y * c, vector.z);
}

// Unified vector rotate node:
// rotationType: 0 = axis-angle, 1 = euler XYZ, 2 = X axis, 3 = Y axis, 4 = Z axis
vec3 vectorRotateNode(vec3 vector, vec3 rotation, vec3 axis, float angle, int rotationType, float invert) {
  vec3 result;
  if (rotationType == 0) {
    result = rotateAxisAngle(vector, axis, angle);
  } else if (rotationType == 1) {
    result = rotateEulerXYZ(vector, rotation);
  } else if (rotationType == 2) {
    result = rotateXAxis(vector, rotation.x);
  } else if (rotationType == 3) {
    result = rotateYAxis(vector, rotation.y);
  } else if (rotationType == 4) {
    result = rotateZAxis(vector, rotation.z);
  } else {
    result = vector;
  }

  if (invert > 0.5) result = -result;
  return result;
}
`;

// ============================================================================
// Volume Nodes GLSL
// ============================================================================

export const VOLUME_NODES_GLSL = /* glsl */ `
// ============================================================================
// Volume Nodes — absorption and scattering coefficients
// ============================================================================

// ShaderNodeVolumeAbsorption — absorption coefficient
// In a rasterizer, this produces an absorption color/tint for fog-like effects
struct VolumeAbsorptionResult {
  vec3 color;
};

VolumeAbsorptionResult volumeAbsorptionNode(vec3 color, float density) {
  VolumeAbsorptionResult result;
  // Beer-Lambert absorption: I = I0 * exp(-absorption * distance)
  result.color = color * density;
  return result;
}

// ShaderNodeVolumeScatter — scattering coefficient
// Produces anisotropic scattering parameters
struct VolumeScatterResult {
  vec3 color;
  float density;
  float anisotropy;
};

VolumeScatterResult volumeScatterNode(vec3 color, float density, float anisotropy) {
  VolumeScatterResult result;
  result.color = color;
  result.density = density;
  result.anisotropy = clamp(anisotropy, -0.99, 0.99);
  return result;
}

// Combined volume shading approximation (for rasterizer)
// Blends absorption and scattering for a simple fog/haze effect
vec3 volumeShadingApprox(
  vec3 surfaceColor,
  vec3 absorptionColor,
  float absorptionDensity,
  vec3 scatterColor,
  float scatterDensity,
  float anisotropy,
  float distance
) {
  // Beer-Lambert absorption
  vec3 absorption = exp(-absorptionColor * absorptionDensity * distance);

  // Out-scattering (reduces intensity)
  vec3 scatterOut = exp(-scatterColor * scatterDensity * distance);

  // Simple in-scattering approximation (ambient + directional)
  vec3 ambientScatter = scatterColor * scatterDensity * distance * 0.1;
  vec3 directionalScatter = scatterColor * scatterDensity * distance * 0.2 *
    max(dot(normalize(vNormal), normalize(vec3(0.5, 1.0, 0.8))), 0.0);

  vec3 transmission = absorption * scatterOut;
  vec3 inScatter = ambientScatter + directionalScatter;

  return surfaceColor * transmission + inScatter;
}
`;

// ============================================================================
// Additional Math Nodes GLSL
// ============================================================================

export const ADDITIONAL_MATH_GLSL = /* glsl */ `
// ============================================================================
// Additional Math — Compare, BooleanMath, Clamp
// ============================================================================

// FunctionNodeCompare — float comparison returning boolean (0 or 1)
// mode: 0=less_than, 1=less_equal, 2=greater_than, 3=greater_equal,
//       4=equal, 5=not_equal
float compareNode(float a, float b, float epsilon, int mode) {
  if (mode == 0) return a < b - epsilon ? 1.0 : 0.0;        // less than
  if (mode == 1) return a <= b + epsilon ? 1.0 : 0.0;       // less equal
  if (mode == 2) return a > b + epsilon ? 1.0 : 0.0;        // greater than
  if (mode == 3) return a >= b - epsilon ? 1.0 : 0.0;       // greater equal
  if (mode == 4) return abs(a - b) < epsilon ? 1.0 : 0.0;   // equal
  if (mode == 5) return abs(a - b) >= epsilon ? 1.0 : 0.0;  // not equal
  return 0.0;
}

// FunctionNodeBooleanMath — AND, OR, NOT, XOR, NAND, NOR, XNOR, implication, subtract
// Inputs are treated as booleans (0 = false, nonzero = true)
// operation: 0=AND, 1=OR, 2=NOT, 3=XOR, 4=NAND, 5=NOR, 6=XNOR, 7=IMPLY, 8=SUBTRACT
float booleanMathNode(float a, float b, int operation) {
  bool ba = a != 0.0;
  bool bb = b != 0.0;
  bool result = false;

  if (operation == 0) result = ba && bb;           // AND
  else if (operation == 1) result = ba || bb;      // OR
  else if (operation == 2) result = !ba;            // NOT (only uses a)
  else if (operation == 3) result = ba != bb;      // XOR
  else if (operation == 4) result = !(ba && bb);   // NAND
  else if (operation == 5) result = !(ba || bb);   // NOR
  else if (operation == 6) result = ba == bb;      // XNOR
  else if (operation == 7) result = (!ba) || bb;   // IMPLY
  else if (operation == 8) result = ba && (!bb);   // SUBTRACT

  return result ? 1.0 : 0.0;
}

// ShaderNodeClamp — min/max clamping
// clampType: 0=minmax, 1=range
float clampNode(float value, float minVal, float maxVal, int clampType) {
  if (clampType == 1) {
    // Range clamp — minVal and maxVal may be swapped
    float lo = min(minVal, maxVal);
    float hi = max(minVal, maxVal);
    return clamp(value, lo, hi);
  }
  // Standard min/max clamp
  return clamp(value, minVal, maxVal);
}

// Vector clamp
vec3 clampVec3(vec3 value, float minVal, float maxVal) {
  return clamp(value, vec3(minVal), vec3(maxVal));
}
`;

// ============================================================================
// Extended Vertex Shader Declarations
// ============================================================================

export const EXTENDED_VERTEX_VARYINGS = /* glsl */ `
// Extended varyings for expanded node support
out vec3 vTangent;       // Tangent vector for normal mapping
out float vVertexID;     // Vertex ID (approximation)
out vec3 vBitangent;     // Bitangent vector
`;

export const EXTENDED_VERTEX_MAIN_ADDITIONS = /* glsl */ `
// Extended vertex shader additions for expanded node support
vVertexID = float(gl_VertexID);

// Compute tangent if not provided as attribute
// Uses UV derivatives approach (simplified)
if (false) { // Placeholder — actual tangent computation requires UV
  vTangent = vec3(1.0, 0.0, 0.0);
} else {
  // Default tangent from normal + up vector
  vec3 up = abs(normal.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vTangent = normalize(cross(up, normal));
}
vBitangent = cross(normal, vTangent);
`;

export const EXTENDED_FRAGMENT_VARYINGS = /* glsl */ `
// Extended varyings for expanded node support
in vec3 vTangent;
in float vVertexID;
in vec3 vBitangent;
`;

// ============================================================================
// Expanded Node Type → GLSL Requirements Mapping
// ============================================================================

export const EXPANDED_NODE_TYPE_GLSL_REQUIREMENTS: Record<string, string[]> = {
  // Attribute nodes
  'ShaderNodeAttribute': ['ATTRIBUTE_NODES_GLSL'],
  'GeometryNodeInputPosition': ['ATTRIBUTE_NODES_GLSL'],
  'GeometryNodeInputNormal': ['ATTRIBUTE_NODES_GLSL'],
  'GeometryNodeInputIndex': ['ATTRIBUTE_NODES_GLSL'],

  // Curve nodes
  'ShaderNodeRGBCurve': ['CURVE_NODES_GLSL', 'FLOAT_CURVE_GLSL'],

  // Light path nodes
  'ShaderNodeLightPath': ['LIGHT_PATH_NODES_GLSL', 'NOISE_TEXTURE_GLSL'],
  'ShaderNodeAmbientOcclusion': ['LIGHT_PATH_NODES_GLSL', 'NOISE_TEXTURE_GLSL'],

  // Bump/Normal nodes
  'ShaderNodeBump': ['BUMP_NORMAL_NODES_GLSL'],
  'ShaderNodeNormalMap': ['BUMP_NORMAL_NODES_GLSL'],

  // Map range
  'ShaderNodeMapRange': ['MAP_RANGE_GLSL'],

  // Vector rotate
  'ShaderNodeVectorRotate': ['VECTOR_ROTATE_GLSL'],

  // Volume nodes
  'ShaderNodeVolumeAbsorption': ['VOLUME_NODES_GLSL'],
  'ShaderNodeVolumeScatter': ['VOLUME_NODES_GLSL'],

  // Additional math
  'FunctionNodeCompare': ['ADDITIONAL_MATH_GLSL'],
  'FunctionNodeBooleanMath': ['ADDITIONAL_MATH_GLSL'],
  'ShaderNodeClamp': ['ADDITIONAL_MATH_GLSL'],
};

// ============================================================================
// Expanded GLSL Snippet Map
// ============================================================================

export const EXPANDED_GLSL_SNIPPET_MAP: Record<string, string> = {
  'ATTRIBUTE_NODES_GLSL': ATTRIBUTE_NODES_GLSL,
  'CURVE_NODES_GLSL': CURVE_NODES_GLSL,
  'LIGHT_PATH_NODES_GLSL': LIGHT_PATH_NODES_GLSL,
  'BUMP_NORMAL_NODES_GLSL': BUMP_NORMAL_NODES_GLSL,
  'MAP_RANGE_GLSL': MAP_RANGE_GLSL,
  'VECTOR_ROTATE_GLSL': VECTOR_ROTATE_GLSL,
  'VOLUME_NODES_GLSL': VOLUME_NODES_GLSL,
  'ADDITIONAL_MATH_GLSL': ADDITIONAL_MATH_GLSL,
};

// ============================================================================
// All Expanded GLSL Functions (for convenience)
// ============================================================================

export const ALL_EXPANDED_GLSL_FUNCTIONS: string[] = [
  ATTRIBUTE_NODES_GLSL,
  CURVE_NODES_GLSL,
  LIGHT_PATH_NODES_GLSL,
  BUMP_NORMAL_NODES_GLSL,
  MAP_RANGE_GLSL,
  VECTOR_ROTATE_GLSL,
  VOLUME_NODES_GLSL,
  ADDITIONAL_MATH_GLSL,
];
