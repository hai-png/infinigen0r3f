/**
 * Beetle Generator Module — Canonical Location
 *
 * Procedural beetle generation with three species:
 * stag_beetle, rhinoceros_beetle, and ladybug. Each species
 * features LatheGeometry body segments, ExtrudeGeometry elytra,
 * species-specific mandibles, and glossy chitin material from
 * CreatureSkinSystem.
 *
 * This is the CANONICAL implementation. The creatures/BeetleGenerator
 * is a deprecated adapter that delegates here.
 *
 * @module vegetation/beetle
 */

export {
  BeetleGenerator,
  generateBeetle,
} from './BeetleGenerator';

export type {
  BeetleSpecies,
  BeetleConfig,
} from './BeetleGenerator';
