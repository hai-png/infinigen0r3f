/**
 * Water System Module Exports
 */

export { LakeGenerator } from './LakeGenerator';
export { RiverNetwork } from './RiverNetwork';
export { WaterfallGenerator } from './WaterfallGenerator';
export { OceanSurface, OceanSystem } from './OceanSystem';
export { CausticsRenderer } from './CausticsRenderer';
export { FFTOceanSpectrum } from './FFTOceanSpectrum';
export { RiverMeshRenderer } from './RiverMeshRenderer';
export { LakeMeshRenderer } from './LakeMeshRenderer';
export { WaterfallMeshRenderer } from './WaterfallMeshRenderer';
export { UnderwaterEffects } from './UnderwaterEffects';
export { WaterSystemManager } from './WaterSystemManager';

export type { 
  LakeConfig, 
  RiverConfig, 
  WaterfallConfig,
  RiverPoint,
  Waterfall,
  WaterfallTier,
  PlungePool
} from './LakeGenerator';

export type { FlowData } from './RiverNetwork';

export type { OceanConfig, GerstnerWave } from './OceanSystem';

export type { CausticsConfig } from './CausticsRenderer';

export type { FFTOceanConfig } from './FFTOceanSpectrum';

export type { RiverMeshConfig } from './RiverMeshRenderer';

export type { LakeMeshConfig, LakeDefinition } from './LakeMeshRenderer';

export type { WaterfallMeshConfig } from './WaterfallMeshRenderer';

export type { UnderwaterEffectsConfig } from './UnderwaterEffects';

export type { WaterSystemConfig } from './WaterSystemManager';
