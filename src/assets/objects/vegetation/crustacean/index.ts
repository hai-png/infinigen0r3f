/**
 * Crustacean Generator Module — Canonical Location
 *
 * Procedural crustacean generation with three species:
 * crab, lobster, and shrimp. Each species features
 * LatheGeometry body segments, articulated claws,
 * and glossy chitin material from CreatureSkinSystem.
 *
 * This is the CANONICAL implementation. The creatures/CrustaceanGenerator
 * is a deprecated adapter that delegates here.
 *
 * @module vegetation/crustacean
 */

export {
  CrustaceanGenerator,
  generateCrustacean,
} from './CrustaceanGenerator';

export type {
  CrustaceanSpecies,
  CrustaceanConfig,
} from './CrustaceanGenerator';
