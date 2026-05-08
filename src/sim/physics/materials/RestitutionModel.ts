/**
 * RestitutionModel - Physics restitution (bounciness) calculation between material pairs
 *
 * Uses a lookup table for known material pairs and falls back to the
 * product of individual restitution coefficients for unknown combinations.
 *
 * Materials are expected to have a `restitution` property (number 0..1).
 */

/** Individual material restitution coefficients */
const MATERIAL_RESTITUTION: Record<string, number> = {
  metal: 0.60,
  steel: 0.55,
  aluminum: 0.50,
  copper: 0.45,
  wood: 0.40,
  rubber: 0.75,
  concrete: 0.30,
  glass: 0.65,
  ice: 0.30,
  stone: 0.25,
  plastic: 0.50,
  leather: 0.45,
  fabric: 0.20,
  soil: 0.10,
  grass: 0.15,
  sand: 0.05,
  mud: 0.02,
  snow: 0.10,
  skin: 0.30,
  cardboard: 0.20,
  ceramic: 0.50,
  teflon: 0.40,
  foam: 0.15,
};

/**
 * Pair-specific restitution overrides.
 * Key format: sorted pair joined by ':' (alphabetical order ensures consistency).
 */
const PAIR_RESTITUTION: Record<string, number> = {
  'metal:metal': 0.55,
  'metal:wood': 0.35,
  'metal:rubber': 0.55,
  'metal:concrete': 0.40,
  'metal:ice': 0.25,
  'metal:steel': 0.55,
  'rubber:concrete': 0.65,
  'rubber:rubber': 0.70,
  'rubber:ice': 0.30,
  'rubber:wood': 0.55,
  'wood:wood': 0.35,
  'wood:concrete': 0.25,
  'wood:glass': 0.35,
  'steel:steel': 0.55,
  'steel:ice': 0.25,
  'ice:ice': 0.20,
  'glass:glass': 0.60,
  'glass:rubber': 0.55,
  'plastic:plastic': 0.40,
  'plastic:metal': 0.40,
  'leather:metal': 0.35,
  'leather:wood': 0.30,
  'teflon:teflon': 0.35,
  'teflon:metal': 0.30,
  'snow:snow': 0.05,
  'foam:foam': 0.05,
  'foam:concrete': 0.08,
};

export interface PhysicsMaterial {
  /** Material name (e.g. 'metal', 'rubber') */
  name?: string;
  /** Restitution coefficient (0-1). Overrides lookup if provided. */
  restitution?: number;
}

/**
 * Build the pair key from two material names in sorted order.
 */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Resolve the restitution coefficient for a single material.
 * Priority: explicit `restitution` property > lookup table > default 0.3
 */
function resolveRestitution(mat: PhysicsMaterial): number {
  if (mat.restitution !== undefined && mat.restitution !== null) {
    return mat.restitution;
  }
  if (mat.name && MATERIAL_RESTITUTION[mat.name] !== undefined) {
    return MATERIAL_RESTITUTION[mat.name];
  }
  return 0.3;
}

/**
 * Calculate the restitution coefficient between two materials.
 *
 * 1. If a pair-specific value exists in the lookup table, use it.
 * 2. Otherwise, use the product of the individual coefficients:
 *    e = e_a × e_b
 *    (This gives physically plausible results: two bouncy materials bounce
 *     well together, two dead materials barely bounce.)
 *
 * @param materialA - First material (must have `restitution` and/or `name` property)
 * @param materialB - Second material (must have `restitution` and/or `name` property)
 * @returns Restitution coefficient between 0 and 1
 */
export function calculateRestitution(materialA: PhysicsMaterial, materialB: PhysicsMaterial): number {
  // Check pair-specific lookup first
  if (materialA.name && materialB.name) {
    const key = pairKey(materialA.name, materialB.name);
    if (PAIR_RESTITUTION[key] !== undefined) {
      return PAIR_RESTITUTION[key];
    }
  }

  // Fallback: product of individual coefficients
  const eA = resolveRestitution(materialA);
  const eB = resolveRestitution(materialB);
  return eA * eB;
}

export default { calculateRestitution };
