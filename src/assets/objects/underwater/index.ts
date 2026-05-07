/**
 * Underwater Assets Module Index
 *
 * Procedural underwater assets including coral reefs,
 * seaweed, seagrass, and marine life decorations.
 *
 * NOTE: The CoralGenerator here is the legacy static-API version that
 * returns BufferGeometry. For the canonical coral generators, use
 * `@/assets/objects/coral/` which provides class-based generators
 * returning THREE.Group.
 *
 * @module objects/underwater
 */

/** @deprecated Use generators from `@/assets/objects/coral/` instead */
export { CoralGenerator } from './CoralGenerator';
/** @deprecated Use types from `@/assets/objects/coral/` instead */
export type { CoralParams, CoralSpecies, CoralPreset } from './CoralGenerator';

export { SeaweedGenerator } from './SeaweedGenerator';
export type { SeaweedType, SeaweedConfig } from './SeaweedGenerator';
export { SeaGrassGenerator } from './SeaGrassGenerator';
export type { SeaGrassType, SeaGrassConfig } from './SeaGrassGenerator';
export { SeashellGenerator } from './SeashellGenerator';
export type { SeashellType, SeashellConfig } from './SeashellGenerator';
export { UrchinGenerator } from './UrchinGenerator';
export type { UrchinType, UrchinConfig } from './UrchinGenerator';
export { StarfishGenerator } from './StarfishGenerator';
export type { StarfishType, StarfishConfig } from './StarfishGenerator';
