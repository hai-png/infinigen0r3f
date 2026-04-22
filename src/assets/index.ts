/**
 * Assets Index - Export all asset generation modules
 */

// Core utilities
export * from './core/surface';
export { 
  AutoTag, 
  tagSystem, 
  printTagSummary,
  createTagAttribute,
  extractTagMask,
  combineTagMasks,
  type TagEntry,
  type ExtractedTags
} from './core/AutoTag';

// Lighting
export * from './lighting/index';

// Geometries
export { BoulderFactory, BoulderConfig } from './geometries/boulder-factory';
export { SimplePlantFactory, PlantConfig } from './geometries/plant-factory';
export { TerrainFactory, TerrainConfig } from './geometries/terrain-factory';
