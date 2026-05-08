/**
 * GPU Noise Shaders — GLSL Shader Code for GPU-Side Noise Evaluation
 *
 * Provides GLSL shader code strings for GPU-side noise evaluation, matching
 * the CPU SeededNoiseGenerator algorithm. These are used by the terrain system
 * and material shaders for real-time procedural generation on the GPU.
 *
 * The GLSL implementations mirror the CPU noise.ts:
 *   - Perlin 3D uses quintic fade, seeded permutation table, gradient dot products
 *   - Simplex 3D uses proper skewing/unskewing with gradient table
 *   - Worley 3D uses seeded feature points via integer hashing
 *   - FBM, ridged multifractal, turbulence, domain warping composite functions
 *
 * Port of: Infinigen's C++/CUDA noise with Surface Kernelizer compilation.
 *
 * @module core/util/math/gpu-noise-shaders
 */

// ============================================================================
// GLSL Noise Library
// ============================================================================

/**
 * Complete GLSL noise library string containing all GPU noise functions.
 *
 * Includes:
 *   - Perlin 3D noise (perlin3D) with seeded permutation and quintic fade
 *   - Simplex 3D noise (simplex3D) with skewing/unskewing
 *   - Voronoi/Worley 3D noise (worley3D) with seeded feature points
 *   - FBM (fractionalBrownianMotion) with configurable octaves, lacunarity, gain
 *   - Ridged Multifractal (ridgedMultifractal)
 *   - Turbulence (turbulence)
 *   - Domain Warping (domainWarp) with two-pass warp
 *   - Hash functions (hash3D, hash2D)
 *
 * Usage: Prepend this string to any vertex or fragment shader that needs
 * GPU-side noise evaluation. Use injectNoiseGLSL / injectNoiseGLSLFrag
 * for convenience.
 */
export const NOISE_GLSL = `
// ============================================================================
// Infinigen R3F — GPU Noise Library (GLSL)
// Mirrors the CPU SeededNoiseGenerator from noise.ts
// ============================================================================

// --- Permutation table (seeded, matches CPU SeededPermutationTable) ----------
// The permutation table is uploaded as a uniform sampler or data array.
// For portability we include a default permutation table baked in.

const int PERM_SIZE = 256;

// Default permutation (seed=0, same as CPU default)
const int perm[512] = int[512](
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
  140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
  247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
  57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
  74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
  60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
  65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,
  200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
  52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
  207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
  119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
  129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
  218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,
  81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
  184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
  222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
  // Duplicate for overflow handling
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
  140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
  247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
  57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
  74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
  60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
  65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,
  200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
  52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
  207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
  119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
  129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
  218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,
  81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
  184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
  222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
);

// --- Uniforms for seed override -----------------------------------------------
// When u_noiseSeed is nonzero, the permutation table is re-seeded at runtime.
uniform int u_noiseSeed;

// --- Hash functions -----------------------------------------------------------

/** Deterministic integer hash for 2D coordinates (matches CPU hash2D) */
float hash2D(float x, float y) {
  int ix = int(x);
  int iy = int(y);
  int h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16));
  return float(abs(h & 0x7fffffff)) / 2147483647.0;
}

/** Deterministic integer hash for 3D coordinates (matches CPU hash3D) */
float hash3D(float x, float y, float z) {
  int ix = int(x);
  int iy = int(y);
  int iz = int(z);
  int h = ix * 374761393 + iy * 668265263 + iz * 1013904223;
  h = (h ^ (h >> 13)) * 1274126177;
  h = (h ^ (h >> 16));
  return float(abs(h & 0x7fffffff)) / 2147483647.0;
}

/** Hash returning a 3D vector (three independent hashes with offsets) */
vec3 hash3DVec(vec3 p) {
  return vec3(
    hash3D(p.x, p.y, p.z),
    hash3D(p.x + 331.0, p.y + 757.0, p.z + 557.0),
    hash3D(p.x + 571.0, p.y + 113.0, p.z + 919.0)
  );
}

// --- Permutation access -------------------------------------------------------

/** Look up the seeded permutation table */
int permLookup(int i) {
  // Apply seed offset if provided
  if (u_noiseSeed != 0) {
    // Simple re-seed: XOR with seed-derived offset
    int offset = int(hash2D(float(i), float(u_noiseSeed)) * 255.0);
    return perm[(i + offset) & 511];
  }
  return perm[i & 511];
}

// --- Perlin 3D noise ----------------------------------------------------------

/** Quintic fade curve: 6t^5 - 15t^4 + 10t^3 (matches CPU fade()) */
float fade(float t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/** Perlin 3D gradient dot product (matches CPU grad3D) */
float grad3D(int hash, float x, float y, float z) {
  int h = hash & 15;
  float u = h < 8 ? x : y;
  float v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
  return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
}

/**
 * 3D Perlin noise (matches CPU SeededNoiseGenerator.perlin3D).
 * @param p 3D coordinate
 * @returns Noise value in approximately [-1, 1]
 */
float perlin3D(vec3 p) {
  int X = int(floor(p.x)) & 255;
  int Y = int(floor(p.y)) & 255;
  int Z = int(floor(p.z)) & 255;

  float xf = p.x - floor(p.x);
  float yf = p.y - floor(p.y);
  float zf = p.z - floor(p.z);

  float u = fade(xf);
  float v = fade(yf);
  float w = fade(zf);

  int A  = permLookup(X) + Y;
  int AA = permLookup(A) + Z;
  int AB = permLookup(A + 1) + Z;
  int B  = permLookup(X + 1) + Y;
  int BA = permLookup(B) + Z;
  int BB = permLookup(B + 1) + Z;

  return mix(
    mix(
      mix(grad3D(permLookup(AA),     xf,   yf,   zf),
          grad3D(permLookup(BA),     xf-1.0, yf,   zf), u),
      mix(grad3D(permLookup(AB),     xf,   yf-1.0, zf),
          grad3D(permLookup(BB),     xf-1.0, yf-1.0, zf), u),
      v),
    mix(
      mix(grad3D(permLookup(AA + 1), xf,   yf,   zf-1.0),
          grad3D(permLookup(BA + 1), xf-1.0, yf,   zf-1.0), u),
      mix(grad3D(permLookup(AB + 1), xf,   yf-1.0, zf-1.0),
          grad3D(permLookup(BB + 1), xf-1.0, yf-1.0, zf-1.0), u),
      v),
    w
  );
}

// --- Simplex 3D noise ---------------------------------------------------------

/** Simplex 3D skewing factors (matches CPU F3/G3) */
const float S_F3 = 1.0 / 3.0;
const float S_G3 = 1.0 / 6.0;

/** Simplex 3D gradient table (matches CPU SIMPLEX_GRAD3) */
const vec3 simplexGrad3[12] = vec3[12](
  vec3(1,1,0), vec3(-1,1,0), vec3(1,-1,0), vec3(-1,-1,0),
  vec3(1,0,1), vec3(-1,0,1), vec3(1,0,-1), vec3(-1,0,-1),
  vec3(0,1,1), vec3(0,-1,1), vec3(0,1,-1), vec3(0,-1,-1)
);

/**
 * 3D Simplex noise (matches CPU SeededNoiseGenerator.simplex3D).
 * @param p 3D coordinate
 * @returns Noise value in approximately [-1, 1]
 */
float simplex3D(vec3 p) {
  // Skew input space to determine which simplex cell we're in
  float s = (p.x + p.y + p.z) * S_F3;
  int i = int(floor(p.x + s));
  int j = int(floor(p.y + s));
  int k = int(floor(p.z + s));

  float t = float(i + j + k) * S_G3;
  float X0 = float(i) - t;
  float Y0 = float(j) - t;
  float Z0 = float(k) - t;
  float x0 = p.x - X0;
  float y0 = p.y - Y0;
  float z0 = p.z - Z0;

  // Determine which simplex we are in
  int i1, j1, k1;
  int i2, j2, k2;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1=1; j1=0; k1=0; i2=1; j2=1; k2=0;
    } else if (x0 >= z0) {
      i1=1; j1=0; k1=0; i2=1; j2=0; k2=1;
    } else {
      i1=0; j1=0; k1=1; i2=1; j2=0; k2=1;
    }
  } else {
    if (y0 < z0) {
      i1=0; j1=0; k1=1; i2=0; j2=1; k2=1;
    } else if (x0 < z0) {
      i1=0; j1=1; k1=0; i2=0; j2=1; k2=1;
    } else {
      i1=0; j1=1; k1=0; i2=1; j2=1; k2=0;
    }
  }

  float x1 = x0 - float(i1) + S_G3;
  float y1 = y0 - float(j1) + S_G3;
  float z1 = z0 - float(k1) + S_G3;
  float x2 = x0 - float(i2) + 2.0 * S_G3;
  float y2 = y0 - float(j2) + 2.0 * S_G3;
  float z2 = z0 - float(k2) + 2.0 * S_G3;
  float x3 = x0 - 1.0 + 3.0 * S_G3;
  float y3 = y0 - 1.0 + 3.0 * S_G3;
  float z3 = z0 - 1.0 + 3.0 * S_G3;

  // Hashed gradient indices
  int ii = i & 255;
  int jj = j & 255;
  int kk = k & 255;
  int gi0 = permLookup(ii + permLookup(jj + permLookup(kk))) % 12;
  int gi1 = permLookup(ii + i1 + permLookup(jj + j1 + permLookup(kk + k1))) % 12;
  int gi2 = permLookup(ii + i2 + permLookup(jj + j2 + permLookup(kk + k2))) % 12;
  int gi3 = permLookup(ii + 1 + permLookup(jj + 1 + permLookup(kk + 1))) % 12;

  // Contributions from the four corners
  float n0 = 0.0, n1 = 0.0, n2 = 0.0, n3 = 0.0;

  float t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 >= 0.0) {
    vec3 g = simplexGrad3[gi0];
    t0 *= t0;
    n0 = t0 * t0 * dot(g, vec3(x0, y0, z0));
  }

  float t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 >= 0.0) {
    vec3 g = simplexGrad3[gi1];
    t1 *= t1;
    n1 = t1 * t1 * dot(g, vec3(x1, y1, z1));
  }

  float t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 >= 0.0) {
    vec3 g = simplexGrad3[gi2];
    t2 *= t2;
    n2 = t2 * t2 * dot(g, vec3(x2, y2, z2));
  }

  float t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 >= 0.0) {
    vec3 g = simplexGrad3[gi3];
    t3 *= t3;
    n3 = t3 * t3 * dot(g, vec3(x3, y3, z3));
  }

  // Scale to [-1, 1]
  return 32.0 * (n0 + n1 + n2 + n3);
}

// --- Voronoi / Worley 3D noise ------------------------------------------------

/**
 * 3D Worley/Voronoi noise — distance to nearest feature point.
 * Uses seeded hash for deterministic feature point positions (matches CPU).
 * @param p 3D coordinate
 * @param scale Cell scale factor
 * @returns Distance to nearest feature point
 */
float worley3D(vec3 p, float scale) {
  vec3 sp = p * scale;
  vec3 cell = floor(sp);

  float minDist = 1e10;

  for (int dx = -1; dx <= 1; dx++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dz = -1; dz <= 1; dz++) {
        vec3 neighbor = cell + vec3(float(dx), float(dy), float(dz));

        // Seeded hash for feature point position within cell
        float h0 = hash3D(neighbor.x, neighbor.y, neighbor.z + float(u_noiseSeed));
        float h1 = hash3D(neighbor.x + 331.0, neighbor.y + 757.0, neighbor.z + float(u_noiseSeed) + 557.0);
        float h2 = hash3D(neighbor.x + 571.0, neighbor.y + 113.0, neighbor.z + float(u_noiseSeed) + 919.0);

        vec3 featurePoint = neighbor + vec3(h0, h1, h2);

        float dist = length(sp - featurePoint);
        minDist = min(minDist, dist);
      }
    }
  }

  return minDist;
}

// --- Composite noise functions ------------------------------------------------

/**
 * Fractional Brownian Motion (FBM).
 * Layers multiple octaves of base noise (matches CPU SeededNoiseGenerator.fbm).
 * @param p 3D coordinate
 * @param octaves Number of octaves
 * @param lacunarity Frequency multiplier per octave
 * @param gain Amplitude multiplier per octave (persistence)
 * @param scale Initial frequency scale
 * @param noiseType 0=perlin, 1=simplex, 2=worley
 * @returns Normalized noise value
 */
float fractionalBrownianMotion(vec3 p, int octaves, float lacunarity, float gain, float scale, int noiseType) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = scale;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;

    vec3 samplePos = p * frequency;
    float n;

    if (noiseType == 1) {
      n = simplex3D(samplePos);
    } else if (noiseType == 2) {
      n = worley3D(p, frequency);
    } else {
      n = perlin3D(samplePos);
    }

    value += amplitude * n;
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Ridged Multifractal noise.
 * Creates sharp ridges by taking absolute value and inverting (matches CPU).
 * @param p 3D coordinate
 * @param octaves Number of octaves
 * @param lacunarity Frequency multiplier per octave
 * @param gain Amplitude multiplier per octave
 * @param offset Ridge offset
 * @param scale Initial frequency scale
 * @param noiseType 0=perlin, 1=simplex
 * @returns Ridged noise value
 */
float ridgedMultifractal(vec3 p, int octaves, float lacunarity, float gain, float offset, float scale, int noiseType) {
  float signal = 0.0;
  float weight = 1.0;
  float frequency = scale;
  float amplitude = 1.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;

    vec3 samplePos = p * frequency;
    float n;

    if (noiseType == 1) {
      n = simplex3D(samplePos);
    } else {
      n = perlin3D(samplePos);
    }

    n = offset - abs(n);
    n *= weight;
    signal += n * amplitude;
    weight = clamp(n * gain, 0.0, 1.0);
    frequency *= lacunarity;
    amplitude *= gain;
  }

  float maxSignal = 1.0 / (1.0 - gain);
  return clamp(signal / maxSignal, 0.0, 1.0);
}

/**
 * Turbulence noise.
 * Sum of absolute values at multiple octaves (matches CPU).
 * @param p 3D coordinate
 * @param octaves Number of octaves
 * @param lacunarity Frequency multiplier per octave
 * @param gain Amplitude multiplier per octave
 * @param scale Initial frequency scale
 * @param noiseType 0=perlin, 1=simplex
 * @returns Turbulence value
 */
float turbulence(vec3 p, int octaves, float lacunarity, float gain, float scale, int noiseType) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = scale;
  float maxValue = 0.0;

  for (int i = 0; i < 16; i++) {
    if (i >= octaves) break;

    vec3 samplePos = p * frequency;
    float n;

    if (noiseType == 1) {
      n = simplex3D(samplePos);
    } else {
      n = perlin3D(samplePos);
    }

    value += amplitude * abs(n);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Domain Warping — two-pass warp using noise to offset coordinates (matches CPU).
 * Creates organic, flowing patterns reminiscent of marble or wood grain.
 * @param p 3D coordinate
 * @param warpStrength Strength of domain warping
 * @param warpScale Scale of the warp noise
 * @param octaves FBM octaves for final pass
 * @param lacunarity FBM lacunarity
 * @param gain FBM gain
 * @param scale Initial frequency scale
 * @param noiseType 0=perlin, 1=simplex
 * @returns Warped noise value
 */
float domainWarp(vec3 p, float warpStrength, float warpScale,
                 int octaves, float lacunarity, float gain, float scale, int noiseType) {
  // First warp pass: offset coordinates using noise
  float qx, qy, qz;
  if (noiseType == 1) {
    qx = simplex3D(p * scale);
    qy = simplex3D(p * scale + vec3(5.2, 1.3, 2.8));
    qz = simplex3D(p * scale + vec3(9.1, 3.7, 7.4));
  } else {
    qx = perlin3D(p * scale);
    qy = perlin3D(p * scale + vec3(5.2, 1.3, 2.8));
    qz = perlin3D(p * scale + vec3(9.1, 3.7, 7.4));
  }

  // Second warp pass for more organic distortion
  vec3 warpPos1 = (p * scale + warpStrength * vec3(qx, qy, qz)) * warpScale;
  vec3 warpPos2 = warpPos1 + vec3(1.7, 9.2, 3.4);
  vec3 warpPos3 = warpPos1 + vec3(8.3, 2.8, 5.1);

  float rx, ry, rz;
  if (noiseType == 1) {
    rx = simplex3D(warpPos1);
    ry = simplex3D(warpPos2);
    rz = simplex3D(warpPos3);
  } else {
    rx = perlin3D(warpPos1);
    ry = perlin3D(warpPos2);
    rz = perlin3D(warpPos3);
  }

  // Final FBM using warped coordinates
  return fractionalBrownianMotion(
    p + warpStrength * vec3(rx, ry, rz),
    octaves, lacunarity, gain, scale, noiseType
  );
}

// ============================================================================
// Convenience uniforms for shader integration
// ============================================================================

uniform int   u_noiseOctaves;
uniform float u_noiseLacunarity;
uniform float u_noiseGain;
uniform float u_noiseScale;
uniform int   u_noiseType; // 0=perlin, 1=simplex, 2=voronoi

/**
 * Evaluate noise using the global uniforms.
 * Convenience function for shaders that use the standard noise parameter set.
 */
float evaluateNoise(vec3 p) {
  int octaves = u_noiseOctaves > 0 ? u_noiseOctaves : 6;
  float lacunarity = u_noiseLacunarity > 0.0 ? u_noiseLacunarity : 2.0;
  float gain = u_noiseGain > 0.0 ? u_noiseGain : 0.5;
  float scale = u_noiseScale > 0.0 ? u_noiseScale : 1.0;
  int noiseType = u_noiseType;

  return fractionalBrownianMotion(p, octaves, lacunarity, gain, scale, noiseType);
}
`;

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for GPU noise evaluation.
 * Maps to uniforms injected into the shader.
 */
export interface GPUNoiseConfig {
  /** Random seed for deterministic noise (default: 0) */
  seed: number;
  /** Number of FBM octaves (default: 6) */
  octaves: number;
  /** Frequency multiplier per octave (default: 2.0) */
  lacunarity: number;
  /** Amplitude multiplier per octave / gain (default: 0.5) */
  gain: number;
  /** Initial frequency scale (default: 1.0) */
  scale: number;
  /** Base noise type */
  noiseType: 'perlin' | 'simplex' | 'voronoi';
}

/** Default GPU noise configuration */
export const DEFAULT_GPU_NOISE_CONFIG: GPUNoiseConfig = {
  seed: 0,
  octaves: 6,
  lacunarity: 2.0,
  gain: 0.5,
  scale: 1.0,
  noiseType: 'perlin',
};

// ============================================================================
// Shader Injection Functions
// ============================================================================

/**
 * Convert a noise type string to the GLSL integer constant.
 */
function noiseTypeToInt(noiseType: 'perlin' | 'simplex' | 'voronoi'): number {
  switch (noiseType) {
    case 'simplex': return 1;
    case 'voronoi': return 2;
    case 'perlin':
    default: return 0;
  }
}

/**
 * Generate GLSL uniform declarations from a partial GPUNoiseConfig.
 * These are injected alongside the noise library so the shader has
 * the necessary uniform declarations.
 */
function generateUniformDeclarations(config: Partial<GPUNoiseConfig>): string {
  const full = { ...DEFAULT_GPU_NOISE_CONFIG, ...config };
  return `
// Auto-generated noise uniforms
uniform int   u_noiseSeed = ${full.seed};
uniform int   u_noiseOctaves = ${full.octaves};
uniform float u_noiseLacunarity = ${full.lacunarity};
uniform float u_noiseGain = ${full.gain};
uniform float u_noiseScale = ${full.scale};
uniform int   u_noiseType = ${noiseTypeToInt(full.noiseType)};
`;
}

/**
 * Prepend the noise GLSL library to a vertex shader.
 *
 * This adds all noise function definitions and optional uniform declarations
 * at the top of the vertex shader, making functions like perlin3D, simplex3D,
 * worley3D, fractionalBrownianMotion, ridgedMultifractal, turbulence, and
 * domainWarp available for use in the shader body.
 *
 * @param vertexShader - The original vertex shader source code
 * @param config - Optional partial configuration for uniform defaults
 * @returns The vertex shader with noise library prepended
 *
 * @example
 * ```ts
 * const material = new THREE.ShaderMaterial({
 *   vertexShader: injectNoiseGLSL(`
 *     varying float vHeight;
 *     void main() {
 *       vHeight = fractionalBrownianMotion(position, 6, 2.0, 0.5, 0.01, 0);
 *       gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
 *     }
 *   `, { seed: 42, octaves: 8 }),
 *   fragmentShader: '...',
 * });
 * ```
 */
export function injectNoiseGLSL(
  vertexShader: string,
  config?: Partial<GPUNoiseConfig>,
): string {
  const uniformDecls = config ? generateUniformDeclarations(config) : '';
  return uniformDecls + NOISE_GLSL + '\n' + vertexShader;
}

/**
 * Prepend the noise GLSL library to a fragment shader.
 *
 * Identical to injectNoiseGLSL but intended for fragment shader usage.
 * The same noise functions become available in the fragment shader body.
 *
 * @param fragmentShader - The original fragment shader source code
 * @param config - Optional partial configuration for uniform defaults
 * @returns The fragment shader with noise library prepended
 *
 * @example
 * ```ts
 * const material = new THREE.ShaderMaterial({
 *   vertexShader: '...',
 *   fragmentShader: injectNoiseGLSLFrag(`
 *     varying vec3 vWorldPosition;
 *     void main() {
 *       float n = perlin3D(vWorldPosition * 5.0);
 *       gl_FragColor = vec4(vec3(n * 0.5 + 0.5), 1.0);
 *     }
 *   `),
 * });
 * ```
 */
export function injectNoiseGLSLFrag(
  fragmentShader: string,
  config?: Partial<GPUNoiseConfig>,
): string {
  const uniformDecls = config ? generateUniformDeclarations(config) : '';
  return uniformDecls + NOISE_GLSL + '\n' + fragmentShader;
}

/**
 * Generate the uniform values object for a GPUNoiseConfig.
 * Useful for setting ShaderMaterial uniforms programmatically.
 *
 * @param config - Noise configuration
 * @returns Object with uniform names and values
 */
export function getNoiseUniforms(config: Partial<GPUNoiseConfig> = {}): Record<string, { value: number }> {
  const full = { ...DEFAULT_GPU_NOISE_CONFIG, ...config };
  return {
    u_noiseSeed: { value: full.seed },
    u_noiseOctaves: { value: full.octaves },
    u_noiseLacunarity: { value: full.lacunarity },
    u_noiseGain: { value: full.gain },
    u_noiseScale: { value: full.scale },
    u_noiseType: { value: noiseTypeToInt(full.noiseType) },
  };
}
