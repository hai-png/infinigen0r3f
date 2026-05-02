/**
 * Composition System Module for Infinigen R3F Port
 *
 * Provides automated scene composition through rules, constraints, and templates.
 */

// Core engine
export {
  CompositionEngine,
  compositionEngine,
  SpatialRelation,
  AestheticPrinciple,
} from './CompositionEngine';

// Types
export type {
  CompositionRule,
  CompositionConstraint,
  CompositionTemplate,
  TemplateObject,
  TemplateVariable,
  CompositionContext,
  CompositionResult,
  CompositionMetrics,
} from './CompositionEngine';

// Basic rules
export {
  basicRules,
  centerObjectRule,
  alignObjectsRule,
  gridDistributionRule,
  radialArrangementRule,
  separationRule,
  symmetryRule,
} from './rules/BasicRules';

// Interior templates
export {
  interiorTemplates,
  livingRoomTemplate,
  bedroomTemplate,
  kitchenTemplate,
  officeTemplate,
} from './templates/InteriorTemplates';

// Nature scene composer
export {
  NatureSceneComposer,
} from './NatureSceneComposer';

export type {
  Season,
  WeatherType,
  CreatureType,
  TerrainParams,
  VegetationDensityParams,
  CloudParams,
  CameraParams,
  LightingParams,
  CreatureParams,
  WaterParams,
  WindParams,
  WeatherParticleParams,
  NatureSceneConfig,
  NatureSceneResult,
  BoulderData,
  GroundCoverData,
  ScatterMaskData,
  RiverData,
} from './NatureSceneComposer';

// Placement mask system
export {
  PlacementMaskSystem,
} from './PlacementMaskSystem';

export type {
  MaskMode,
  MaskCombinOp,
  TerrainTag,
  NoiseMaskParams,
  NormalMaskParams,
  AltitudeMaskParams,
  SlopeMaskParams,
  TagMaskParams,
  DistanceFromFeatureParams,
  MaskParams,
  PlacementMask,
  TerrainDataInput,
} from './PlacementMaskSystem';

// Visibility culler
export {
  VisibilityCuller,
  createCullableObject,
} from './VisibilityCuller';

export type {
  CullReason,
  CullableObject,
  CullingConfig,
  CullingResult,
  CullingStats,
  LODLevel,
} from './VisibilityCuller';

// Indoor scene composer
export {
  IndoorSceneComposer,
} from './IndoorSceneComposer';

export type {
  RoomType,
  SurfaceType,
  IndoorObject,
  SurfaceMaterial,
  DoorPlacement,
  WindowPlacement,
  RoomSpec,
  ConstraintRelation,
  IndoorSceneResult,
} from './IndoorSceneComposer';

// Scene presets
export {
  ALPINE_MEADOW,
  TROPICAL_BEACH,
  DENSE_FOREST,
  DESERT_CANYON,
  ARCTIC_TUNDRA,
  CORAL_REEF,
  LIVING_ROOM_PRESET,
  CAVE_PRESET,
  ALL_PRESETS,
  PRESET_MAP,
  getPreset,
  getPresetsByCategory,
  getPresetIds,
} from './ScenePresets';

export type {
  PresetCategory,
  ScenePreset,
} from './ScenePresets';
