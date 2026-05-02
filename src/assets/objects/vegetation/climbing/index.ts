/**
 * Climbing Plants Module
 * Provides generators for climbing and vining plants
 *
 * Canonical location for all climbing plant generators.
 */

export { VineGenerator, VineSpeciesPresets, type VineSpeciesConfig } from './VineGenerator';
export { IvyGenerator, type IvyConfig } from './IvyGenerator';

// Ivy Climbing System (new)
export {
  IvyClimbingSystem,
  ClimbingPlantPresets,
  type ClimbingPlantType,
  type IvyGrowthConfig,
  type IvyPathPoint,
} from './IvyClimbingSystem';
