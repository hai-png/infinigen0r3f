/**
 * TreeGenome.ts — P4.2: Tree Genome System
 *
 * Ports the 32-parameter tree genome from the original Princeton Infinigen.
 * The genome is a compact parameter vector that fully specifies a tree's
 * growth behavior, controlling both space colonization and recursive
 * branching algorithms. Species presets define characteristic genome
 * values for common tree types.
 *
 * In the original Infinigen, the tree genome is used in a constrained
 * optimization loop to produce diverse, realistic trees within a given
 * scene. This TypeScript port preserves the same parameter structure so
 * that tree generation remains deterministic and controllable.
 *
 * Ported from: infinigen/terrain/objects/tree/genome.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import type { SpaceColonizationConfig, AttractorVolumeShape } from './SpaceColonization';

// ============================================================================
// Tree Genome Interface (32 parameters)
// ============================================================================

/**
 * The full tree genome — 32 parameters that define a tree's morphology.
 * Each parameter has a meaningful range [0, 1] unless otherwise noted.
 *
 * This mirrors the original Infinigen tree genome, with parameters grouped
 * into: size/shape, trunk, branching, canopy, and aesthetics.
 */
export interface TreeGenome {
  // --- Size & Shape (4 params) ---
  /** Overall tree size multiplier (0.3–3.0, default 1.0) */
  size: number;
  /** Vertical aspect ratio: height/width ratio (0.5–3.0, default 1.5) */
  aspectRatio: number;
  /** Base asymmetry of the canopy (0–1, default 0.1) */
  asymmetry: number;
  /** Vertical displacement of canopy center (0–1, default 0.5) */
  verticalBias: number;

  // --- Trunk (5 params) ---
  /** Number of trunks (1–5, default 1) */
  nTrunks: number;
  /** Trunk warp: how much the trunk curves (0–1, default 0.2) */
  trunkWarp: number;
  /** Trunk warp frequency (0.5–3.0, default 1.0) */
  trunkWarpFreq: number;
  /** Trunk height as fraction of total tree height (0.2–0.8, default 0.4) */
  trunkHeightRatio: number;
  /** Trunk taper: how quickly radius decreases (0.5–1.0, default 0.8) */
  trunkTaper: number;

  // --- Branching (8 params) ---
  /** Height at which branches start as fraction of trunk (0.1–0.6, default 0.3) */
  branchStart: number;
  /** Primary branch angle from trunk (0.2–1.2 rad, default 0.6) */
  branchAngle: number;
  /** Branch angle variation (0–0.5, default 0.15) */
  branchAngleVariation: number;
  /** Number of branches per whorl (2–8, default 4) */
  multiBranch: number;
  /** Branch length as fraction of trunk (0.2–0.8, default 0.5) */
  branchLengthRatio: number;
  /** Branch thickness as fraction of trunk (0.1–0.5, default 0.25) */
  branchThicknessRatio: number;
  /** How quickly branches curve upward (0–1, default 0.3) */
  branchCurvature: number;
  /** Branch density (number of whorls per unit trunk length) (0.5–3.0, default 1.5) */
  branchDensity: number;

  // --- Canopy (7 params) ---
  /** Canopy shape (determines attractor volume shape) */
  canopyShape: AttractorVolumeShape;
  /** Canopy radius as fraction of tree height (0.2–0.8, default 0.45) */
  canopyRadiusRatio: number;
  /** Canopy density / fullness (0.3–1.0, default 0.75) */
  canopyDensity: number;
  /** Leaf size (0.01–0.3, default 0.08) */
  leafSize: number;
  /** Leaf density (0.2–1.0, default 0.7) */
  leafDensity: number;
  /** Leaf clustering: how tightly leaves group (0–1, default 0.5) */
  leafClustering: number;
  /** Number of leaf layers for depth (1–4, default 2) */
  leafLayers: number;

  // --- Aesthetics (8 params) ---
  /** Bark roughness (0–1, default 0.6) */
  barkRoughness: number;
  /** Bark color base (hue 0–1, default 0.07 = brown) */
  barkHue: number;
  /** Bark color saturation (0–1, default 0.4) */
  barkSaturation: number;
  /** Leaf color hue (0–1, default 0.3 = green) */
  leafHue: number;
  /** Leaf color saturation (0–1, default 0.6) */
  leafSaturation: number;
  /** Seasonal color shift intensity (0–1, default 0.5) */
  seasonalShift: number;
  /** Root flare: how much the base expands (0–1, default 0.3) */
  rootFlare: number;
  /** Dead branch probability (0–0.3, default 0.05) */
  deadBranchProb: number;
}

// ============================================================================
// Species Presets
// ============================================================================

/**
 * A named tree species preset with a complete genome and metadata.
 */
export interface TreeSpeciesPreset {
  /** Human-readable species name */
  name: string;
  /** Species category */
  category: 'broadleaf' | 'conifer' | 'palm' | 'tropical' | 'shrub' | 'exotic';
  /** The genome parameters */
  genome: TreeGenome;
  /** Description of the species' characteristics */
  description: string;
}

/**
 * Eight species presets covering major tree types, each with a fully
 * specified genome. These presets are designed to produce characteristic
 * shapes when fed into the SpaceColonization or recursive branching
 * algorithms.
 */
export const TREE_SPECIES_PRESETS: Record<string, TreeSpeciesPreset> = {
  broadleaf: {
    name: 'Broadleaf Oak',
    category: 'broadleaf',
    description: 'Large deciduous tree with spreading canopy, thick trunk, and lobed leaves.',
    genome: {
      size: 1.2,
      aspectRatio: 1.3,
      asymmetry: 0.15,
      verticalBias: 0.55,
      nTrunks: 1,
      trunkWarp: 0.15,
      trunkWarpFreq: 1.0,
      trunkHeightRatio: 0.4,
      trunkTaper: 0.82,
      branchStart: 0.3,
      branchAngle: 0.65,
      branchAngleVariation: 0.2,
      multiBranch: 5,
      branchLengthRatio: 0.55,
      branchThicknessRatio: 0.25,
      branchCurvature: 0.25,
      branchDensity: 1.4,
      canopyShape: 'sphere',
      canopyRadiusRatio: 0.5,
      canopyDensity: 0.8,
      leafSize: 0.08,
      leafDensity: 0.75,
      leafClustering: 0.5,
      leafLayers: 3,
      barkRoughness: 0.7,
      barkHue: 0.07,
      barkSaturation: 0.45,
      leafHue: 0.3,
      leafSaturation: 0.55,
      seasonalShift: 0.6,
      rootFlare: 0.35,
      deadBranchProb: 0.05,
    },
  },

  pine: {
    name: 'Scots Pine',
    category: 'conifer',
    description: 'Tall conical conifer with whorled branches and needle foliage.',
    genome: {
      size: 1.5,
      aspectRatio: 2.5,
      asymmetry: 0.05,
      verticalBias: 0.7,
      nTrunks: 1,
      trunkWarp: 0.05,
      trunkWarpFreq: 0.8,
      trunkHeightRatio: 0.35,
      trunkTaper: 0.9,
      branchStart: 0.15,
      branchAngle: 0.4,
      branchAngleVariation: 0.1,
      multiBranch: 6,
      branchLengthRatio: 0.35,
      branchThicknessRatio: 0.15,
      branchCurvature: 0.5,
      branchDensity: 2.0,
      canopyShape: 'cone',
      canopyRadiusRatio: 0.35,
      canopyDensity: 0.85,
      leafSize: 0.03,
      leafDensity: 0.9,
      leafClustering: 0.7,
      leafLayers: 2,
      barkRoughness: 0.5,
      barkHue: 0.06,
      barkSaturation: 0.35,
      leafHue: 0.33,
      leafSaturation: 0.5,
      seasonalShift: 0.1,
      rootFlare: 0.2,
      deadBranchProb: 0.03,
    },
  },

  palm: {
    name: 'Coconut Palm',
    category: 'palm',
    description: 'Tall slender palm with fan-shaped fronds at the crown.',
    genome: {
      size: 1.0,
      aspectRatio: 3.0,
      asymmetry: 0.05,
      verticalBias: 0.9,
      nTrunks: 1,
      trunkWarp: 0.1,
      trunkWarpFreq: 0.5,
      trunkHeightRatio: 0.75,
      trunkTaper: 0.95,
      branchStart: 0.9,
      branchAngle: 0.8,
      branchAngleVariation: 0.15,
      multiBranch: 10,
      branchLengthRatio: 0.4,
      branchThicknessRatio: 0.3,
      branchCurvature: 0.6,
      branchDensity: 0.5,
      canopyShape: 'hemisphere',
      canopyRadiusRatio: 0.35,
      canopyDensity: 0.65,
      leafSize: 0.2,
      leafDensity: 0.5,
      leafClustering: 0.3,
      leafLayers: 1,
      barkRoughness: 0.35,
      barkHue: 0.08,
      barkSaturation: 0.3,
      leafHue: 0.28,
      leafSaturation: 0.55,
      seasonalShift: 0.05,
      rootFlare: 0.15,
      deadBranchProb: 0.02,
    },
  },

  baobab: {
    name: 'African Baobab',
    category: 'exotic',
    description: 'Massive swollen trunk with sparse, thick branches and small canopy.',
    genome: {
      size: 1.8,
      aspectRatio: 1.0,
      asymmetry: 0.2,
      verticalBias: 0.4,
      nTrunks: 1,
      trunkWarp: 0.05,
      trunkWarpFreq: 0.3,
      trunkHeightRatio: 0.55,
      trunkTaper: 1.1, // Trunk gets WIDER at base
      branchStart: 0.65,
      branchAngle: 0.7,
      branchAngleVariation: 0.25,
      multiBranch: 4,
      branchLengthRatio: 0.45,
      branchThicknessRatio: 0.4,
      branchCurvature: 0.15,
      branchDensity: 0.8,
      canopyShape: 'hemisphere',
      canopyRadiusRatio: 0.55,
      canopyDensity: 0.5,
      leafSize: 0.06,
      leafDensity: 0.55,
      leafClustering: 0.6,
      leafLayers: 2,
      barkRoughness: 0.85,
      barkHue: 0.08,
      barkSaturation: 0.25,
      leafHue: 0.3,
      leafSaturation: 0.5,
      seasonalShift: 0.3,
      rootFlare: 0.6,
      deadBranchProb: 0.08,
    },
  },

  bamboo: {
    name: 'Giant Bamboo',
    category: 'tropical',
    description: 'Tall segmented culms with small branches and narrow leaves.',
    genome: {
      size: 1.3,
      aspectRatio: 4.0,
      asymmetry: 0.02,
      verticalBias: 0.85,
      nTrunks: 5, // Multiple culms
      trunkWarp: 0.02,
      trunkWarpFreq: 0.2,
      trunkHeightRatio: 0.7,
      trunkTaper: 0.95,
      branchStart: 0.5,
      branchAngle: 0.5,
      branchAngleVariation: 0.1,
      multiBranch: 3,
      branchLengthRatio: 0.2,
      branchThicknessRatio: 0.1,
      branchCurvature: 0.1,
      branchDensity: 2.5,
      canopyShape: 'cylinder',
      canopyRadiusRatio: 0.2,
      canopyDensity: 0.6,
      leafSize: 0.05,
      leafDensity: 0.6,
      leafClustering: 0.4,
      leafLayers: 1,
      barkRoughness: 0.2,
      barkHue: 0.2,
      barkSaturation: 0.4,
      leafHue: 0.3,
      leafSaturation: 0.45,
      seasonalShift: 0.1,
      rootFlare: 0.05,
      deadBranchProb: 0.02,
    },
  },

  shrub: {
    name: 'Common Shrub',
    category: 'shrub',
    description: 'Low, dense multi-stemmed bush with small leaves.',
    genome: {
      size: 0.5,
      aspectRatio: 0.8,
      asymmetry: 0.15,
      verticalBias: 0.35,
      nTrunks: 4,
      trunkWarp: 0.2,
      trunkWarpFreq: 1.5,
      trunkHeightRatio: 0.3,
      trunkTaper: 0.75,
      branchStart: 0.2,
      branchAngle: 0.7,
      branchAngleVariation: 0.2,
      multiBranch: 4,
      branchLengthRatio: 0.6,
      branchThicknessRatio: 0.3,
      branchCurvature: 0.3,
      branchDensity: 2.0,
      canopyShape: 'sphere',
      canopyRadiusRatio: 0.7,
      canopyDensity: 0.9,
      leafSize: 0.04,
      leafDensity: 0.85,
      leafClustering: 0.6,
      leafLayers: 3,
      barkRoughness: 0.4,
      barkHue: 0.07,
      barkSaturation: 0.3,
      leafHue: 0.32,
      leafSaturation: 0.5,
      seasonalShift: 0.4,
      rootFlare: 0.2,
      deadBranchProb: 0.03,
    },
  },

  coral: {
    name: 'Coral Tree',
    category: 'exotic',
    description: 'Branching coral-like structure with thick limbs and bright colors.',
    genome: {
      size: 0.8,
      aspectRatio: 1.2,
      asymmetry: 0.1,
      verticalBias: 0.5,
      nTrunks: 1,
      trunkWarp: 0.1,
      trunkWarpFreq: 1.2,
      trunkHeightRatio: 0.35,
      trunkTaper: 0.7,
      branchStart: 0.25,
      branchAngle: 0.55,
      branchAngleVariation: 0.2,
      multiBranch: 5,
      branchLengthRatio: 0.5,
      branchThicknessRatio: 0.4,
      branchCurvature: 0.4,
      branchDensity: 1.8,
      canopyShape: 'sphere',
      canopyRadiusRatio: 0.6,
      canopyDensity: 0.55,
      leafSize: 0.06,
      leafDensity: 0.4,
      leafClustering: 0.3,
      leafLayers: 1,
      barkRoughness: 0.5,
      barkHue: 0.0, // Reddish bark
      barkSaturation: 0.5,
      leafHue: 0.0, // Red flowers
      leafSaturation: 0.7,
      seasonalShift: 0.2,
      rootFlare: 0.25,
      deadBranchProb: 0.04,
    },
  },

  deformed: {
    name: 'Deformed / Ancient Tree',
    category: 'broadleaf',
    description: 'Gnarled, twisted tree with heavy warp, exposed dead branches, and sparse canopy.',
    genome: {
      size: 1.0,
      aspectRatio: 1.1,
      asymmetry: 0.35,
      verticalBias: 0.4,
      nTrunks: 2,
      trunkWarp: 0.45,
      trunkWarpFreq: 2.0,
      trunkHeightRatio: 0.35,
      trunkTaper: 0.75,
      branchStart: 0.25,
      branchAngle: 0.8,
      branchAngleVariation: 0.3,
      multiBranch: 3,
      branchLengthRatio: 0.5,
      branchThicknessRatio: 0.35,
      branchCurvature: 0.5,
      branchDensity: 1.0,
      canopyShape: 'sphere',
      canopyRadiusRatio: 0.55,
      canopyDensity: 0.45,
      leafSize: 0.06,
      leafDensity: 0.45,
      leafClustering: 0.5,
      leafLayers: 2,
      barkRoughness: 0.9,
      barkHue: 0.06,
      barkSaturation: 0.2,
      leafHue: 0.28,
      leafSaturation: 0.35,
      seasonalShift: 0.5,
      rootFlare: 0.45,
      deadBranchProb: 0.2,
    },
  },
};

// ============================================================================
// Genome → Space Colonization Mapping
// ============================================================================

/**
 * Convert a TreeGenome into a SpaceColonizationConfig suitable for the
 * space colonization algorithm. This mapping ensures genome parameters
 * control the growth process in a meaningful way.
 */
export function genomeToSpaceColonizationConfig(
  genome: TreeGenome,
  seed: number = 42
): SpaceColonizationConfig {
  const treeHeight = genome.size * 10; // Scale to world units
  const trunkHeight = treeHeight * genome.trunkHeightRatio;
  const canopyHeight = treeHeight * (1 - genome.trunkHeightRatio);
  const canopyRadius = treeHeight * genome.canopyRadiusRatio;
  const canopyCenter = new THREE.Vector3(0, trunkHeight + canopyHeight * genome.verticalBias, 0);

  // Attractor count proportional to canopy volume and density
  const canopyVolume = (4 / 3) * Math.PI * Math.pow(canopyRadius, 3);
  const attractorCount = Math.round(canopyVolume * genome.canopyDensity * 5);

  return {
    attractorCount: Math.max(100, Math.min(5000, attractorCount)),
    killRadius: canopyRadius * 0.08,
    influenceRadius: canopyRadius * 0.6,
    growthStep: treeHeight * 0.025,
    branchingAngle: genome.branchAngle,
    maxIterations: 150,
    branchThreshold: Math.max(2, Math.round(6 - genome.multiBranch * 0.5)),
    branchProbability: 0.3 + genome.branchDensity * 0.15,
    volumeShape: genome.canopyShape,
    volumeCenter: canopyCenter,
    volumeRadius: canopyRadius,
    volumeHeight: canopyHeight,
    seed,
    initialTips: [],
    addNoiseToGrowth: true,
    growthNoiseAmplitude: genome.trunkWarp * 0.3,
    baseThickness: genome.size * genome.branchThicknessRatio * 0.8,
    thicknessDecay: genome.trunkTaper * 0.8,
  };
}

// ============================================================================
// Genome Mutation & Variation
// ============================================================================

/**
 * Create a mutated copy of a genome by perturbing each parameter slightly.
 * Useful for generating variations of a species.
 *
 * @param genome Base genome to mutate
 * @param mutationStrength How much each parameter can change (0–1, default 0.1)
 * @param seed Random seed for deterministic mutation
 */
export function mutateGenome(
  genome: TreeGenome,
  mutationStrength: number = 0.1,
  seed: number = 42
): TreeGenome {
  const rng = new SeededRandom(seed);
  const mutated = { ...genome };

  // Mutate numeric parameters
  const numericKeys: (keyof TreeGenome)[] = [
    'size', 'aspectRatio', 'asymmetry', 'verticalBias',
    'trunkWarp', 'trunkWarpFreq', 'trunkHeightRatio', 'trunkTaper',
    'branchStart', 'branchAngle', 'branchAngleVariation',
    'branchLengthRatio', 'branchThicknessRatio', 'branchCurvature', 'branchDensity',
    'canopyRadiusRatio', 'canopyDensity', 'leafSize', 'leafDensity',
    'leafClustering', 'barkRoughness', 'barkHue', 'barkSaturation',
    'leafHue', 'leafSaturation', 'seasonalShift', 'rootFlare', 'deadBranchProb',
  ];

  for (const key of numericKeys) {
    const value = mutated[key] as number;
    const delta = (rng.next() - 0.5) * 2 * mutationStrength * value;
    (mutated[key] as number) = Math.max(0, value + delta);
  }

  // Mutate integer parameters
  mutated.nTrunks = Math.max(1, Math.round(mutated.nTrunks + (rng.next() - 0.5) * 2));
  mutated.multiBranch = Math.max(2, Math.round(mutated.multiBranch + (rng.next() - 0.5) * 2));
  mutated.leafLayers = Math.max(1, Math.round(mutated.leafLayers + (rng.next() - 0.5) * 2));

  return mutated;
}

/**
 * Interpolate between two genomes, producing a hybrid.
 * Useful for creating intermediate species or blending characteristics.
 *
 * @param a First genome
 * @param b Second genome
 * @param t Interpolation factor (0 = a, 1 = b)
 */
export function interpolateGenomes(a: TreeGenome, b: TreeGenome, t: number): TreeGenome {
  const result = { ...a };

  const numericKeys: (keyof TreeGenome)[] = [
    'size', 'aspectRatio', 'asymmetry', 'verticalBias',
    'trunkWarp', 'trunkWarpFreq', 'trunkHeightRatio', 'trunkTaper',
    'branchStart', 'branchAngle', 'branchAngleVariation',
    'branchLengthRatio', 'branchThicknessRatio', 'branchCurvature', 'branchDensity',
    'canopyRadiusRatio', 'canopyDensity', 'leafSize', 'leafDensity',
    'leafClustering', 'barkRoughness', 'barkHue', 'barkSaturation',
    'leafHue', 'leafSaturation', 'seasonalShift', 'rootFlare', 'deadBranchProb',
  ];

  for (const key of numericKeys) {
    const va = a[key] as number;
    const vb = b[key] as number;
    (result[key] as number) = va + (vb - va) * t;
  }

  // Integer params: use rounding toward the dominant parent
  result.nTrunks = t < 0.5 ? a.nTrunks : b.nTrunks;
  result.multiBranch = Math.round(a.multiBranch + (b.multiBranch - a.multiBranch) * t);
  result.leafLayers = Math.round(a.leafLayers + (b.leafLayers - a.leafLayers) * t);
  result.canopyShape = t < 0.5 ? a.canopyShape : b.canopyShape;

  return result;
}

/**
 * Generate a random genome by sampling each parameter within its valid range.
 *
 * @param seed Random seed for deterministic generation
 */
export function generateRandomGenome(seed: number = 42): TreeGenome {
  const rng = new SeededRandom(seed);

  const shapes: AttractorVolumeShape[] = ['sphere', 'cone', 'cylinder', 'hemisphere'];

  return {
    size: rng.uniform(0.5, 2.0),
    aspectRatio: rng.uniform(0.8, 3.0),
    asymmetry: rng.uniform(0, 0.3),
    verticalBias: rng.uniform(0.3, 0.8),
    nTrunks: rng.nextInt(1, 3),
    trunkWarp: rng.uniform(0, 0.4),
    trunkWarpFreq: rng.uniform(0.3, 2.0),
    trunkHeightRatio: rng.uniform(0.2, 0.7),
    trunkTaper: rng.uniform(0.6, 1.0),
    branchStart: rng.uniform(0.1, 0.5),
    branchAngle: rng.uniform(0.3, 1.0),
    branchAngleVariation: rng.uniform(0, 0.3),
    multiBranch: rng.nextInt(2, 6),
    branchLengthRatio: rng.uniform(0.2, 0.7),
    branchThicknessRatio: rng.uniform(0.1, 0.45),
    branchCurvature: rng.uniform(0.1, 0.5),
    branchDensity: rng.uniform(0.5, 2.5),
    canopyShape: rng.choice(shapes),
    canopyRadiusRatio: rng.uniform(0.2, 0.7),
    canopyDensity: rng.uniform(0.4, 0.95),
    leafSize: rng.uniform(0.02, 0.2),
    leafDensity: rng.uniform(0.3, 0.9),
    leafClustering: rng.uniform(0.2, 0.8),
    leafLayers: rng.nextInt(1, 3),
    barkRoughness: rng.uniform(0.2, 0.9),
    barkHue: rng.uniform(0.04, 0.12),
    barkSaturation: rng.uniform(0.15, 0.5),
    leafHue: rng.uniform(0.25, 0.38),
    leafSaturation: rng.uniform(0.3, 0.7),
    seasonalShift: rng.uniform(0, 0.7),
    rootFlare: rng.uniform(0.05, 0.5),
    deadBranchProb: rng.uniform(0, 0.15),
  };
}

/**
 * Extract bark color from a genome as a THREE.Color.
 */
export function getBarkColor(genome: TreeGenome): THREE.Color {
  return new THREE.Color().setHSL(genome.barkHue, genome.barkSaturation, 0.25);
}

/**
 * Extract leaf color from a genome as a THREE.Color, with optional
 * seasonal variation.
 *
 * @param genome The tree genome
 * @param season Current season: 'spring' | 'summer' | 'autumn' | 'winter'
 */
export function getLeafColor(
  genome: TreeGenome,
  season: 'spring' | 'summer' | 'autumn' | 'winter' = 'summer'
): THREE.Color {
  let hue = genome.leafHue;
  let saturation = genome.leafSaturation;
  let lightness = 0.35;

  switch (season) {
    case 'spring':
      hue = genome.leafHue + 0.03 * genome.seasonalShift;
      lightness = 0.45;
      break;
    case 'summer':
      // Default values
      break;
    case 'autumn':
      hue = genome.leafHue - 0.25 * genome.seasonalShift; // Shift toward orange/red
      saturation = genome.leafSaturation + 0.1 * genome.seasonalShift;
      lightness = 0.4;
      break;
    case 'winter':
      saturation = 0.1;
      lightness = 0.25;
      break;
  }

  return new THREE.Color().setHSL(
    ((hue % 1) + 1) % 1,
    Math.max(0, Math.min(1, saturation)),
    Math.max(0, Math.min(1, lightness))
  );
}
