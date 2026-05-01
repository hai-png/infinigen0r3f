/**
 * FrictionModel - Physics friction calculation between material pairs
 *
 * Uses a lookup table for known material pairs and falls back to the
 * geometric mean of individual friction coefficients for unknown combinations.
 *
 * Materials are expected to have a `friction` property (number 0..1).
 */

/** Individual material friction coefficients */
const MATERIAL_FRICTION: Record<string, number> = {
  metal: 0.30,
  steel: 0.40,
  aluminum: 0.30,
  copper: 0.35,
  wood: 0.40,
  rubber: 0.80,
  concrete: 0.60,
  glass: 0.20,
  ice: 0.05,
  stone: 0.50,
  plastic: 0.30,
  leather: 0.45,
  fabric: 0.35,
  soil: 0.55,
  grass: 0.40,
  sand: 0.45,
  mud: 0.50,
  snow: 0.15,
  skin: 0.40,
  cardboard: 0.35,
  ceramic: 0.25,
  teflon: 0.04,
};

/**
 * Pair-specific friction overrides.
 * Key format: sorted pair joined by ':' (alphabetical order ensures consistency).
 */
const PAIR_FRICTION: Record<string, number> = {
  'metal:metal': 0.40,
  'metal:wood': 0.35,
  'metal:rubber': 0.60,
  'metal:concrete': 0.45,
  'metal:ice': 0.03,
  'metal:steel': 0.45,
  'rubber:concrete': 0.80,
  'rubber:rubber': 0.90,
  'rubber:ice': 0.10,
  'rubber:wood': 0.65,
  'wood:wood': 0.45,
  'wood:concrete': 0.50,
  'wood:glass': 0.25,
  'steel:steel': 0.50,
  'steel:ice': 0.03,
  'ice:ice': 0.02,
  'glass:glass': 0.25,
  'glass:rubber': 0.55,
  'plastic:plastic': 0.35,
  'plastic:metal': 0.25,
  'leather:metal': 0.50,
  'leather:wood': 0.50,
  'teflon:teflon': 0.04,
  'teflon:metal': 0.05,
  'snow:snow': 0.10,
  'soil:rubber': 0.70,
};

export interface PhysicsMaterial {
  /** Material name (e.g. 'metal', 'rubber') */
  name?: string;
  /** Friction coefficient (0-1). Overrides lookup if provided. */
  friction?: number;
}

/**
 * Build the pair key from two material names in sorted order.
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Resolve the friction coefficient for a single material.
 * Priority: explicit `friction` property > lookup table > default 0.5
 */
function resolveFriction(mat: PhysicsMaterial): number {
  if (mat.friction !== undefined && mat.friction !== null) {
    return mat.friction;
  }
  if (mat.name && MATERIAL_FRICTION[mat.name] !== undefined) {
    return MATERIAL_FRICTION[mat.name];
  }
  return 0.5;
}

/**
 * Calculate the friction coefficient between two materials.
 *
 * 1. If a pair-specific value exists in the lookup table, use it.
 * 2. Otherwise, use the geometric mean of the individual coefficients:
 *    μ = sqrt(μ_a × μ_b)
 *
 * @param materialA - First material (must have `friction` and/or `name` property)
 * @param materialB - Second material (must have `friction` and/or `name` property)
 * @returns Friction coefficient between 0 and 1
 */
export function calculateFriction(materialA: PhysicsMaterial, materialB: PhysicsMaterial): number {
  // Check pair-specific lookup first
  if (materialA.name && materialB.name) {
    const key = pairKey(materialA.name, materialB.name);
    if (PAIR_FRICTION[key] !== undefined) {
      return PAIR_FRICTION[key];
    }
  }

  // Fallback: geometric mean of individual coefficients
  const muA = resolveFriction(materialA);
  const muB = resolveFriction(materialB);
  return Math.sqrt(muA * muB);
}

export default { calculateFriction };
