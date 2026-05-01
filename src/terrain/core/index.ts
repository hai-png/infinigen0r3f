/**
 * Core Terrain Generator Module Exports
 */

export {
  TerrainGenerator,
  type MaskMap,
  type TerrainConfig,
  type TerrainData
} from './TerrainGenerator';

// Re-export unified HeightMap from shared types
export type { HeightMap, NormalMap } from '../types';
export { heightMapFromFloat32Array, sampleHeightAt, getHeightValueAt, setHeightValueAt } from '../types';
