/**
 * Terrain Elements - Terrain feature and element generation
 *
 * Provides the TerrainElement data interface used by TerrainElementGenerators
 * and re-exports the Unified Element Composition System from the SDF module
 * for composable terrain generation.
 *
 * NOTE: The legacy stub generators (RockElementGenerator, VegetationPatchGenerator)
 * that returned empty arrays have been removed. Use either:
 * - The SDF element system (GroundElement, MountainElement, etc.) for SDF-based terrain
 * - The generator functions in TerrainElementGenerators.ts for placement-based elements
 *
 * Two element paradigms coexist:
 * 1. TerrainElement (position/rotation/scale tuples) — for scatter/placement use cases
 * 2. SDFTerrainElement (SDF evaluation with material IDs) — for volumetric terrain composition
 */

// ---------------------------------------------------------------------------
// Placement-based element interface (used by TerrainElementGenerators.ts)
// ---------------------------------------------------------------------------

/**
 * A terrain element descriptor with position, rotation, scale, and properties.
 * Used for scatter/placement-based element generation (rocks, cliffs, etc.).
 */
export interface TerrainElement {
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  properties: Record<string, any>;
}

// ---------------------------------------------------------------------------
// SDF Element Composition System (re-exports)
// ---------------------------------------------------------------------------

export type {
  ElementEvalResult,
  SceneCompositionConfig,
} from './sdf/TerrainElementSystem';
export {
  TerrainElement as SDFTerrainElement,
  CompositionOperation,
  ElementRegistry,
  GroundElement,
  MountainElement,
  CaveElement,
  VoronoiRockElement,
  WaterbodyElement,
  UpsideDownMountainElement,
  SceneComposer,
  DEFAULT_SCENE_COMPOSITION_CONFIG,
  buildSDFFromElements,
} from './sdf/TerrainElementSystem';
