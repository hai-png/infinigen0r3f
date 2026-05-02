/**
 * Unified Vegetation Module
 *
 * Consolidated vegetation generators - single canonical source for all plant life generation.
 * Replaces fragmented implementations across /plants/, /scatter/vegetation/, /climbing/, and /procedural/
 */

// Core types and base classes
export { BaseObjectGenerator, type BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

// Trees
export { TreeGenerator, TreeSpeciesPresets, type TreeSpeciesConfig, type TreeInstance } from './trees/TreeGenerator';
export { ConiferGenerator, type ConiferConfig } from './trees/ConiferGenerator';
export { DeciduousGenerator, type DeciduousConfig } from './trees/DeciduousGenerator';
export { PalmGenerator, type PalmConfig } from './trees/PalmGenerator';
export { FruitTreeGenerator, type FruitTreeConfig } from './trees/FruitTreeGenerator';
export { LSystemTreeGenerator, LSystemTreePresets, generateTreeFromPreset, type LSystemRule, type LSystemConfig } from './trees/LSystemTreeGenerator';

// L-System Engine (new)
export {
  LSystemEngine,
  LSystemPresets,
  generateLSystemTree,
  type LSystemPreset,
  type LSystemProductionRule,
  type TurtleState,
  type BranchSegment,
  type LSystemOutput,
} from './trees/LSystemEngine';

// Plants (ground vegetation)
export { GrassGenerator, type GrassConfig } from './plants/GrassGenerator';
export { FlowerGenerator, type FlowerConfig, type FlowerType, type PetalArrangement, FlowerSpeciesPresets } from './plants/FlowerGenerator';
export { ShrubGenerator, ShrubSpeciesPresets, type ShrubSpeciesConfig } from './plants/ShrubGenerator';
export { FernGenerator, type FernConfig, type FernSpecies, type FernFrondShape, FernSpeciesPresets } from './plants/FernGenerator';
export { MossGenerator, type MossConfig } from './plants/MossGenerator';
export { MushroomGenerator, type MushroomConfig, type MushroomSpecies, type MushroomCapShape, MushroomSpeciesPresets } from './plants/MushroomGenerator';
export { MonocotGenerator, MonocotSpeciesPresets, type MonocotConfig } from './plants/MonocotGenerator';
export { SmallPlantGenerator, type SmallPlantConfig } from './plants/SmallPlantGenerator';
export { TropicPlantGenerator, TropicSpeciesPresets, type TropicPlantConfig } from './plants/TropicPlantGenerator';

// Climbing plants
export { VineGenerator, VineSpeciesPresets, type VineSpeciesConfig } from './climbing/VineGenerator';
export { IvyGenerator, type IvyConfig } from './climbing/IvyGenerator';

// Ivy Climbing System (new)
export {
  IvyClimbingSystem,
  ClimbingPlantPresets,
  type ClimbingPlantType,
  type IvyGrowthConfig,
  type IvyPathPoint,
} from './climbing/IvyClimbingSystem';

// Vegetation LOD System (new)
export {
  VegetationLODSystem,
  type VegetationLODConfig,
  type VegetationInstance,
  type LODLevelConfig,
} from './VegetationLODSystem';

// Wind Animation Controller (new)
export {
  WindAnimationController,
  type WindConfig,
  type WindZone,
} from './WindAnimationController';

// Forest Floor Scatter (new)
export {
  ForestFloorScatter,
  type ForestFloorConfig,
  type ScatterObjectType,
  type Season,
} from './scatter/ForestFloorScatter';
