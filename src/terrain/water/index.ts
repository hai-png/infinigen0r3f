/**
 * Water System Module Exports
 */

export { LakeGenerator } from './LakeGenerator';
export { RiverNetwork } from './RiverNetwork';
export { WaterfallGenerator } from './WaterfallGenerator';
export { OceanSurface, OceanSystem } from './OceanSystem';
export { CausticsRenderer } from './CausticsRenderer';
export { FFTOceanSpectrum } from './FFTOceanSpectrum';

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
