/**
 * Rendering Module Index for Infinigen R3F
 *
 * Central export point for all rendering-related functionality.
 *
 * @module rendering
 */

export { ShaderCompiler, type ShaderVariant, type ShaderCompilationResult, PREDEFINED_VARIANTS } from './shader-compiler';
export * from './postprocessing';
export * as io from './io';
export * as shaders from './shaders';

// Screen-space post-processing passes
export { SSGIPass, type SSGIConfig } from './postprocess/SSGIPass';
export { SSAOPass, type SSAOConfig } from './postprocess/SSAOPass';

// Shadow system
export { PCSSShadow, type PCSSConfig } from './shadows/PCSSShadow';
export { CascadedShadowMap, type CSMConfig, type CascadeInfo } from './shadows/CascadedShadowMap';

// Lighting system
export { LightProbeSystem, type LightProbeConfig, type SH9, type SH9RGB } from './lighting/LightProbeSystem';
export { ExposureControl, type ExposureConfig, type ToneMappingPreset, TONE_MAPPING_SHADERS, TONE_MAPPING_THREEJS } from './lighting/ExposureControl';
