/**
 * Vegetation Module — Procedural Plant and Tree Generators
 *
 * Provides geometry generators for the vegetation types missing from
 * the R3F port compared to the original Infinigen.
 */

export {
  TreeGenerator,
  GrassTuftGenerator,
  FernGenerator,
  FlowerGenerator,
  MushroomGenerator,
  LeafGenerator,
  randomTreeConfig,
  pineTreeConfig,
  shrubConfig,
  palmTreeConfig,
  type TreeGenome,
  type BranchSegment,
  type Season,
} from './VegetationGenerators';

export {
  WindAnimationSystem,
  type WindConfig,
  type WindZone,
} from './WindAnimationSystem';

export {
  GrimeSystem,
  type GrimeConfig,
  type GrimeableObject,
  type GrimeResult,
} from './GrimeSystem';
