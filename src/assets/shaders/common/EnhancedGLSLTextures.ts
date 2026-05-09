/**
 * EnhancedGLSLTextures — Wave, Brick, ColorRamp, FloatCurve, Musgrave GLSL
 *
 * Ports: Blender node types from infinigen/core/nodes/node_info.py
 * These GLSL functions implement the shader texture nodes missing from
 * the R3F port that are heavily used in Infinigen's material definitions.
 *
 * Missing from R3F:
 *  - WaveTexture (bands, rings, directional variants)
 *  - BrickTexture (brick/tile pattern with mortar)
 *  - ColorRamp (interpolation between color stops)
 *  - FloatCurve (arbitrary curve evaluation)
 *  - MusgraveTexture (standalone composable node)
 *  - GradientTexture (linear, quadratic, radial, etc.)
 *  - MagicTexture (psychedelic pattern)
 *
 * These are used by: lava, sandstone, wood grain, brick walls,
 * tiled floors, marble veins, and many other material types.
 */

// ============================================================================
// Wave Texture GLSL
// ============================================================================

export const WAVE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Wave Texture Node
// Port of: Blender's ShaderNodeTexWave
// ============================================================================

// Wave types
const int WAVE_BANDS = 0;
const int WAVE_RINGS = 1;
const int WAVE_BANDS_DIRECTION = 2;
const int WAVE_RINGS_DIRECTION = 3;

// Wave profiles
const int WAVE_SINE = 0;
const int WAVE_SAW = 1;
const int WAVE_TRIANGLE = 2;

float waveProfile(float phase, int profile) {
  if (profile == WAVE_SINE) {
    return 0.5 + 0.5 * sin(phase * 6.28318530718);
  } else if (profile == WAVE_SAW) {
    float p = mod(phase, 1.0);
    return (p < 0.5) ? 2.0 * p : 2.0 * (1.0 - p);
  } else { // TRIANGLE
    return 1.0 - 2.0 * abs(mod(phase, 1.0) - 0.5);
  }
}

// Wave texture with bands (perpendicular to one axis)
vec4 waveTextureBands(
  vec3 p,
  float scale,
  float distortion,
  float detail,
  float detailScale,
  int profile,
  float directionAxis  // 0=X, 1=Y, 2=Z
) {
  vec3 pos = p * scale;

  // Apply distortion via noise
  if (distortion > 0.0) {
    float n = snoise3D(pos * detailScale) * distortion;
    pos += vec3(n);
  }

  float phase;
  if (directionAxis < 0.5) phase = pos.x;
  else if (directionAxis < 1.5) phase = pos.y;
  else phase = pos.z;

  float value = waveProfile(phase, profile);

  // Add detail octaves
  float amp = 0.5;
  float freq = detailScale;
  for (int i = 0; i < int(detail); i++) {
    float n = snoise3D(pos * freq) * amp;
    value += n * 0.1;
    amp *= 0.5;
    freq *= 2.0;
  }

  return vec4(vec3(value), 1.0);
}

// Wave texture with rings (spherical/cylindrical)
vec4 waveTextureRings(
  vec3 p,
  float scale,
  float distortion,
  float detail,
  float detailScale,
  int profile,
  float directionAxis
) {
  vec3 pos = p * scale;

  // Apply distortion via noise
  if (distortion > 0.0) {
    float n = snoise3D(pos * detailScale) * distortion;
    pos += vec3(n);
  }

  float phase;
  if (directionAxis < 0.5) {
    // Spherical rings
    phase = length(pos);
  } else if (directionAxis < 1.5) {
    // Cylindrical rings (around Y)
    phase = length(pos.xz);
  } else {
    // Cylindrical rings (around X)
    phase = length(pos.yz);
  }

  float value = waveProfile(phase, profile);

  // Add detail
  float amp = 0.5;
  float freq = detailScale;
  for (int i = 0; i < int(detail); i++) {
    float n = snoise3D(pos * freq) * amp;
    value += n * 0.1;
    amp *= 0.5;
    freq *= 2.0;
  }

  return vec4(vec3(value), 1.0);
}

// Main wave texture entry point
vec4 waveTexture(
  vec3 p,
  float scale,
  float distortion,
  float detail,
  float detailScale,
  int waveType,
  int profile,
  float directionAxis
) {
  if (waveType == WAVE_BANDS || waveType == WAVE_BANDS_DIRECTION) {
    return waveTextureBands(p, scale, distortion, detail, detailScale, profile, directionAxis);
  } else {
    return waveTextureRings(p, scale, distortion, detail, detailScale, profile, directionAxis);
  }
}
`;

// ============================================================================
// Brick Texture GLSL
// ============================================================================

export const BRICK_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Brick Texture Node
// Port of: Blender's ShaderNodeTexBrick
// ============================================================================

float brickNoise(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Brick texture with mortar lines
vec4 brickTexture(
  vec3 p,
  float scale,
  float mortarSize,
  float bias,
  float brickWidth,
  float brickHeight,
  int offsetFrequency,
  float offsetAmount,
  float squashFrequency,
  float squashAmount
) {
  vec3 pos = p * scale;

  float bw = max(brickWidth, 0.001);
  float bh = max(brickHeight, 0.001);
  float ms = clamp(mortarSize, 0.0, 0.49);

  // Row number
  float row = floor(pos.y / bh);

  // Offset every N rows
  float offset = 0.0;
  if (offsetFrequency > 0 && mod(int(row), offsetFrequency) != 0) {
    offset = offsetAmount * bw * 0.5;
  }

  // Squash
  float squash = 1.0;
  if (squashFrequency > 0 && mod(int(row), squashFrequency) != 0) {
    squash = 1.0 + squashAmount;
  }

  float adjY = pos.y / bh / squash;
  row = floor(adjY);
  float yFract = fract(adjY);

  // Recalculate offset with possibly-squashed row
  if (offsetFrequency > 0 && mod(int(row), offsetFrequency) != 0) {
    offset = offsetAmount * bw * 0.5;
  }

  float adjX = (pos.x - offset) / bw;
  float col = floor(adjX);
  float xFract = fract(adjX);

  // Brick noise for color variation
  float brickId = row * 1000.0 + col;
  float noiseVal = brickNoise(brickId) * bias;

  // Mortar mask
  float mortarX = step(xFract, ms) + step(1.0 - ms, xFract);
  float mortarY = step(yFract, ms) + step(1.0 - ms, yFract);
  float isMortar = clamp(mortarX + mortarY, 0.0, 1.0);

  // Brick color
  vec3 brickColor = vec3(0.6 + noiseVal * 0.3, 0.35 + noiseVal * 0.2, 0.25 + noiseVal * 0.15);
  vec3 mortarColor = vec3(0.65);

  vec3 color = mix(brickColor, mortarColor, isMortar);
  float value = mix(1.0, 0.0, isMortar);

  return vec4(color, value);
}
`;

// ============================================================================
// Color Ramp GLSL
// ============================================================================

export const COLOR_RAMP_GLSL = /* glsl */ `
// ============================================================================
// Color Ramp Node
// Port of: Blender's ShaderNodeValToRGB
//
// Supports constant, linear, and cubic interpolation between color stops.
// ============================================================================

const int COLOR_RAMP_CONSTANT = 0;
const int COLOR_RAMP_LINEAR = 1;
const int COLOR_RAMP_CUBIC = 2;

struct ColorRampStop {
  float position;
  vec3 color;
  float alpha;
};

// Evaluate a color ramp with up to 8 stops
vec4 evaluateColorRamp(
  float value,
  int interpolation,
  int numStops,
  float positions[8],
  vec3 colors[8],
  float alphas[8]
) {
  value = clamp(value, 0.0, 1.0);

  // Find the two stops we're between
  int lowIdx = 0;
  int highIdx = min(1, numStops - 1);

  for (int i = 0; i < 8; i++) {
    if (i >= numStops) break;
    if (positions[i] <= value) {
      lowIdx = i;
      highIdx = min(i + 1, numStops - 1);
    }
  }

  float lowPos = positions[lowIdx];
  float highPos = positions[highIdx];
  vec3 lowColor = colors[lowIdx];
  vec3 highColor = colors[highIdx];
  float lowAlpha = alphas[lowIdx];
  float highAlpha = alphas[highIdx];

  if (interpolation == COLOR_RAMP_CONSTANT) {
    return vec4(lowColor, lowAlpha);
  }

  // Compute interpolation factor
  float factor = 0.0;
  float range = highPos - lowPos;
  if (range > 0.001) {
    factor = (value - lowPos) / range;
  }

  if (interpolation == COLOR_RAMP_CUBIC) {
    // Smoothstep (cubic Hermite)
    factor = factor * factor * (3.0 - 2.0 * factor);
  }

  return vec4(
    mix(lowColor, highColor, factor),
    mix(lowAlpha, highAlpha, factor)
  );
}
`;

// ============================================================================
// Float Curve GLSL
// ============================================================================

export const FLOAT_CURVE_GLSL = /* glsl */ `
// ============================================================================
// Float Curve Node
// Port of: Blender's ShaderNodeCurveFloat
//
// Evaluates an arbitrary curve defined by control points using
// Catmull-Rom spline interpolation.
// ============================================================================

struct CurvePoint {
  float x;
  float y;
};

// Catmull-Rom spline interpolation between 4 points
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

// Evaluate a curve with up to 16 control points
float evaluateFloatCurve(
  float value,
  int numPoints,
  float pointX[16],
  float pointY[16]
) {
  value = clamp(value, 0.0, 1.0);

  // Find segment
  int seg = 0;
  for (int i = 0; i < 16; i++) {
    if (i >= numPoints - 1) break;
    if (pointX[i] <= value && value <= pointX[i + 1]) {
      seg = i;
      break;
    }
  }

  // Compute local t
  float segStart = pointX[seg];
  float segEnd = pointX[min(seg + 1, numPoints - 1)];
  float t = (segEnd > segStart) ? (value - segStart) / (segEnd - segStart) : 0.0;

  // Get 4 points for Catmull-Rom
  float p0 = pointY[max(seg - 1, 0)];
  float p1 = pointY[seg];
  float p2 = pointY[min(seg + 1, numPoints - 1)];
  float p3 = pointY[min(seg + 2, numPoints - 1)];

  return catmullRom(p0, p1, p2, p3, t);
}
`;

// ============================================================================
// Musgrave Texture GLSL (standalone composable)
// ============================================================================

export const MUSGRAVE_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Musgrave Texture Node
// Port of: Blender's ShaderNodeTexMusgrave
//
// Types: fBm, Multifractal, Ridged, Heterogeneous Terrain
// ============================================================================

const int MUSGRAVE_FBM = 0;
const int MUSGRAVE_MULTIFRACTAL = 1;
const int MUSGRAVE_RIDGED = 2;
const int MUSGRAVE_HETERO = 3;

float musgraveFBM(vec3 p, float scale, float detail, float roughness, float lacunarity) {
  vec3 pos = p * scale;
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (float(i) >= detail) break;
    value += amplitude * snoise3D(pos * frequency);
    maxValue += amplitude;
    amplitude *= roughness;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

float musgraveMultifractal(vec3 p, float scale, float detail, float roughness, float lacunarity) {
  vec3 pos = p * scale;
  float value = 1.0;
  float amplitude = 1.0;
  float frequency = 1.0;

  for (int i = 0; i < 16; i++) {
    if (float(i) >= detail) break;
    value *= (amplitude * snoise3D(pos * frequency) + 1.0);
    amplitude *= roughness;
    frequency *= lacunarity;
  }

  return value * 0.5;
}

float musgraveRidged(vec3 p, float scale, float detail, float roughness, float lacunarity) {
  vec3 pos = p * scale;
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float weight = 1.0;

  for (int i = 0; i < 16; i++) {
    if (float(i) >= detail) break;
    float signal = snoise3D(pos * frequency);
    signal = 1.0 - abs(signal);
    signal *= signal;
    signal *= weight;
    weight = clamp(signal * 2.0, 0.0, 1.0);
    value += amplitude * signal;
    amplitude *= roughness;
    frequency *= lacunarity;
  }

  return value;
}

float musgraveHetero(vec3 p, float scale, float detail, float roughness, float lacunarity) {
  vec3 pos = p * scale;
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;

  float signal = snoise3D(pos * frequency);
  value = signal;
  amplitude *= roughness;
  frequency *= lacunarity;

  for (int i = 1; i < 16; i++) {
    if (float(i) >= detail) break;
    signal = snoise3D(pos * frequency);
    value += amplitude * abs(signal) * signal;
    amplitude *= roughness;
    frequency *= lacunarity;
  }

  return value;
}

// Main musgrave entry point
float musgraveTexture(
  vec3 p,
  float scale,
  float detail,
  float roughness,
  float lacunarity,
  float offset,
  float gain,
  int musgraveType
) {
  if (musgraveType == MUSGRAVE_FBM) {
    return musgraveFBM(p, scale, detail, roughness, lacunarity);
  } else if (musgraveType == MUSGRAVE_MULTIFRACTAL) {
    return musgraveMultifractal(p, scale, detail, roughness, lacunarity);
  } else if (musgraveType == MUSGRAVE_RIDGED) {
    return musgraveRidged(p, scale, detail, roughness, lacunarity);
  } else {
    return musgraveHetero(p, scale, detail, roughness, lacunarity);
  }
}
`;

// ============================================================================
// Gradient Texture GLSL
// ============================================================================

export const GRADIENT_TEXTURE_GLSL = /* glsl */ `
// ============================================================================
// Gradient Texture Node
// Port of: Blender's ShaderNodeTexGradient
// ============================================================================

const int GRADIENT_LINEAR = 0;
const int GRADIENT_QUADRATIC = 1;
const int GRADIENT_EASING = 2;
const int GRADIENT_DIAGONAL = 3;
const int GRADIENT_RADIAL = 4;
const int GRADIENT_QUADRATIC_SPHERE = 5;
const int GRADIENT_SPHERICAL = 6;

vec4 gradientTexture(vec3 p, int gradientType) {
  float value = 0.0;

  if (gradientType == GRADIENT_LINEAR) {
    value = p.x;
  } else if (gradientType == GRADIENT_QUADRATIC) {
    value = p.x * p.x;
  } else if (gradientType == GRADIENT_EASING) {
    float t = clamp(p.x, 0.0, 1.0);
    value = t * t * (3.0 - 2.0 * t);
  } else if (gradientType == GRADIENT_DIAGONAL) {
    value = (p.x + p.y) * 0.5;
  } else if (gradientType == GRADIENT_RADIAL) {
    value = atan(p.y, p.x) / 6.28318530718 + 0.5;
  } else if (gradientType == GRADIENT_QUADRATIC_SPHERE) {
    float r = length(p);
    value = r > 0.0 ? 1.0 - p.x * p.x / (r * r) : 0.0;
  } else { // SPHERICAL
    value = 1.0 - min(length(p), 1.0);
  }

  value = clamp(value, 0.0, 1.0);
  return vec4(vec3(value), 1.0);
}
`;

// ============================================================================
// Combined Export
// ============================================================================

/**
 * All enhanced GLSL texture functions combined into a single injectable string.
 * Requires snoise3D (from NoiseGLSL) to be included first.
 */
export const ENHANCED_TEXTURE_GLSL = [
  WAVE_TEXTURE_GLSL,
  BRICK_TEXTURE_GLSL,
  COLOR_RAMP_GLSL,
  FLOAT_CURVE_GLSL,
  MUSGRAVE_TEXTURE_GLSL,
  GRADIENT_TEXTURE_GLSL,
].join('\n');
