/**
 * Coral Generators Module — Canonical Location
 *
 * This is the single canonical entry point for ALL coral generators.
 *
 * It combines:
 * - Standalone class-based generators (Branching, Fan, Brain) — defined here
 * - Algorithm-based generators from vegetation/coral/ (DifferentialGrowth,
 *   ReactionDiffusion, Wave3 convenience functions, CoralGrowthAlgorithms)
 *
 * The old locations still work via re-exports with @deprecated notices:
 * - `objects/vegetation/coral/` → re-exports from here
 * - `objects/underwater/CoralGenerator.ts` → deprecated adapter
 *
 * @module objects/coral
 */

// ── Standalone class-based generators (canonical implementations) ────

// Branching Coral — recursive CylinderGeometry with noise-displaced endpoints
export {
  BranchingCoralGenerator,
  generateBranchingCoral,
  type BranchingCoralConfig,
} from './BranchingCoralGenerator';

// Fan Coral — flat fan-shaped mesh with radial vein pattern
export {
  FanCoralGenerator,
  generateFanCoral,
  type FanCoralConfig,
} from './FanCoralGenerator';

// Brain Coral — SphereGeometry with reaction-diffusion displacement
export {
  BrainCoralGenerator,
  generateBrainCoral,
  type BrainCoralConfig,
} from './BrainCoralGenerator';

// ── Algorithm-based generators from vegetation/coral/ ────────────────
// Re-exported here so objects/coral/ is the single import location.

// Core growth algorithms (DifferentialGrowth, GrayScott, Laplacian, CoralGrowthGenerator)
export {
  DifferentialGrowth,
  GrayScottReactionDiffusion,
  LaplacianGrowth,
  CoralGrowthGenerator,
  generateCoral,
  generateCoralPattern,
  GRAY_SCOTT_PRESETS,
} from '../vegetation/coral/CoralGrowthAlgorithms';

export type {
  DifferentialGrowthParams,
  LaplacianGrowthParams,
  CoralType,
  CoralGrowthGeneratorParams,
  ReactionDiffusionPreset,
  GrayScottParams,
} from '../vegetation/coral/CoralGrowthAlgorithms';

// Reaction-Diffusion Coral (vertex-based, Gray-Scott on mesh surface)
export {
  ReactionDiffusionCoralGenerator,
  generateReactionDiffusionCoral,
  REACTION_DIFFUSION_CORAL_PRESETS,
  feed2kill,
} from '../vegetation/coral/ReactionDiffusionCoral';

export type {
  ReactionDiffusionCoralPreset,
  ReactionDiffusionCoralParams,
} from '../vegetation/coral/ReactionDiffusionCoral';

// Differential Growth Coral (polygon-based, vertex growth with repulsion)
export {
  DifferentialGrowthCoralGenerator,
  generateDifferentialGrowthCoral,
} from '../vegetation/coral/DifferentialGrowthCoral';

export type {
  DifferentialGrowthCoralVariant,
  DifferentialGrowthCoralParams,
} from '../vegetation/coral/DifferentialGrowthCoral';

// Wave 3 Coral Generators (convenience functions for branching, fan, brain)
// NOTE: These functions have the same names as our class-based generators'
// convenience functions. The class-based versions (from ./BranchingCoralGenerator
// etc.) are the canonical ones. The Wave3 versions are re-exported for
// backward compatibility with code that imported them from vegetation/coral/.
export {
  generateBranchingCoral as generateBranchingCoralWave3,
  generateFanCoral as generateFanCoralWave3,
  generateBrainCoral as generateBrainCoralWave3,
} from '../vegetation/coral/Wave3CoralGenerators';

export type {
  BranchingCoralConfig as Wave3BranchingCoralConfig,
  FanCoralConfig as Wave3FanCoralConfig,
  BrainCoralConfig as Wave3BrainCoralConfig,
} from '../vegetation/coral/Wave3CoralGenerators';
