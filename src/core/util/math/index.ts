/**
 * Math Utilities Module
 * Centralized math operations for 3D graphics, noise, and random number generation
 * 
 * Note: Vector3 and lerp exist in both ../MathUtils (re-exports from three.js)
 * and ./vector (custom implementations). We keep both accessible:
 * - THREE.Vector3 is available via the MathUtils re-export
 * - Custom Vector3 (interface) and lerp (for Vector3) are from ./vector
 * To resolve the conflict, we export ./vector with the custom types under
 * aliases and keep the three.js re-exports as the primary Vector3/lerp.
 */

// Re-export everything from MathUtils (includes THREE.Vector3, lerp for numbers)
export * from '../MathUtils';

// Re-export sub-modules for organized imports
// SeededRandom and RandomGenerator already come from '../MathUtils' via the star export above,
// so we only need to explicitly export the new distributions module content here.
export {
  // Core distributions
  uniform,
  gaussian,
  exponential,
  poisson,
  binomial,
  gamma,
  beta,
  chiSquared,
  logNormal,
  weibull,
  pareto,
  cauchy,
  geometric,
  negativeBinomial,
  hypergeometric,
  // Sampling methods
  weightedChoice,
  sampleWithoutReplacement,
  shuffle,
  reservoirSample,
  rejectionSample,
  // Statistical utilities
  normalCDF,
  normalInvCDF,
  normalPDF,
  clampToDistribution,
  // Classes & types
  DistributionSampler,
} from './distributions';
export type { DistributionSpec } from './distributions';

// Noise module — SeededNoiseGenerator, convenience functions, legacy Noise3D
export {
  SeededNoiseGenerator,
  NoiseType,
  defaultNoiseGenerator,
  perlin3D,
  perlin2D,
  simplex3D,
  simplex2D,
  voronoi2D,
  voronoi3D,
  fbm,
  ridgedMultifractal,
  turbulence,
  domainWarp,
  Noise3D,
  seededNoise2D,
  seededNoise3D,
  seededVoronoi2D,
  seededFbm,
  seededRidgedMultifractal,
  noise3D,
  noise2D,
} from './noise';
export type { NoiseFunction } from './noise';

// Noise cache
export { NoiseCache, defaultNoiseCache } from './noise-cache';

// Export from ./vector with aliases to avoid conflicts with MathUtils re-exports
export {
  type Vector3 as MathVec3,
  vec3,
  add as vec3Add,
  sub as vec3Sub,
  mul as vec3Mul,
  div as vec3Div,
  dot as vec3Dot,
  cross as vec3Cross,
  length as vec3Length,
  lengthSq as vec3LengthSq,
  normalize as vec3Normalize,
  distance as vec3Distance,
  distanceSq as vec3DistanceSq,
  lerp as vec3Lerp,
  negate as vec3Negate,
  clone as vec3Clone,
  equals as vec3Equals,
  scaleToLength as vec3ScaleToLength,
  project as vec3Project,
  reject as vec3Reject,
  reflect as vec3Reflect,
  min as vec3Min,
  max as vec3Max,
  abs as vec3Abs,
  ZERO as VEC3_ZERO,
  UNIT_X,
  UNIT_Y,
  UNIT_Z,
} from './vector';

export * from './bbox';
export * from './utils';
export * from './transforms';

// GPU noise shaders — GLSL noise library for GPU-side evaluation
export {
  NOISE_GLSL,
  DEFAULT_GPU_NOISE_CONFIG,
  injectNoiseGLSL,
  injectNoiseGLSLFrag,
  getNoiseUniforms,
} from './gpu-noise-shaders';
export type { GPUNoiseConfig } from './gpu-noise-shaders';

// SDF evaluation — signed distance field primitives, CSG, and utilities
export {
  evaluateSDF,
  evaluateSDFBatch,
  computeSDFNormal,
  computeSDFGradient,
  createSphere,
  createBox,
  createSmoothUnion,
  createSubtraction,
  createDisplacement,
} from './sdf-evaluation';
export type {
  SDFPrimitive,
  SDFCSGOperation,
  SDFNodeType,
  SDFTransform,
  SDFNode,
} from './sdf-evaluation';

// Surface kernel — node graph compilation and evaluation
export {
  KernelDataType,
  SurfaceKernel,
  compileSurfaceKernel,
  createTerrainHeightKernel,
  createMaterialSurfaceKernel,
} from './surface-kernel';
export type {
  KernelInput,
  KernelOutput,
  KernelOperation,
} from './surface-kernel';
