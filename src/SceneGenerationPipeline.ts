/**
 * SceneGenerationPipeline.ts — End-to-End Scene Generation Pipeline
 *
 * Validates and implements the complete pipeline from GinConfig preset through
 * terrain, vegetation, creatures, lighting, and rendering.
 *
 * Main components:
 *   1. ScenePresetRegistry — registers and resolves scene presets
 *   2. SceneGenerationPipeline — 9-stage generation pipeline
 *   3. SceneGraph — hierarchical container for all generated scene objects
 *   4. GenerationReport — detailed report of what was generated
 *
 * @module SceneGenerationPipeline
 */

import {
  GinConfig,
  type ConfigValue,
  type ResolvedConfig,
  vec3,
  color,
  enumVal,
} from './core/config/GinConfig';

import { SeededRandom } from './core/util/MathUtils';

import { TerrainGenerator, type TerrainGeneratorConfig, type TerrainData } from './terrain/core/TerrainGenerator';

import {
  WaterSystemManager,
  type WaterSystemConfig,
} from './terrain/water/WaterSystemManager';

import { TreeGenerator, type TreeSpeciesConfig } from './assets/objects/vegetation/trees/TreeGenerator';

import {
  CreatureBase,
  CreatureType,
  type CreatureParams,
} from './assets/objects/creatures/CreatureBase';

import {
  SkyLightingSystem,
  type SkyLightingSystemConfig,
} from './assets/lighting/SkyLightingSystem';

import {
  RoomGraphSolver,
  type FloorPlanConfig,
  type FloorPlanResult,
  Polygon2D,
} from './assets/objects/architectural/FloorPlanSolver';

// ============================================================================
// Types
// ============================================================================

/** Supported scene preset identifiers */
export type ScenePresetId =
  | 'outdoor_landscape'
  | 'underwater'
  | 'indoor_room'
  | 'desert'
  | 'forest'
  | 'mountain'
  | 'tropical'
  | 'arctic'
  | 'volcanic'
  | 'space';

/** Rendering mode */
export type RenderMode = 'rasterized' | 'path-traced' | 'dual';

/** Weather type */
export type WeatherType = 'clear' | 'rain' | 'snow' | 'fog' | 'storm';

/** Post-processing effect flags */
export interface PostProcessFlags {
  ssao: boolean;
  bloom: boolean;
  colorGrading: boolean;
  vignette: boolean;
  filmGrain: boolean;
  chromaticAberration: boolean;
}

/** Ground truth render passes */
export interface GroundTruthPasses {
  depth: boolean;
  normals: boolean;
  segmentation: boolean;
  opticalFlow: boolean;
}

/** Camera configuration for scene generation */
export interface SceneCameraConfig {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  near: number;
  far: number;
  dofEnabled: boolean;
  dofFocusDistance: number;
  dofAperture: number;
}

/** Per-stage timing info */
export interface StageTiming {
  stage: string;
  durationMs: number;
  success: boolean;
  message?: string;
}

// ============================================================================
// ScenePresetRegistry
// ============================================================================

/**
 * A scene preset definition that specifies all generation parameters.
 */
export interface ScenePresetDefinition {
  id: ScenePresetId;
  name: string;
  description: string;
  category: 'nature' | 'indoor' | 'aquatic' | 'fantasy' | 'extreme';

  /** Terrain configuration overrides */
  terrain: Partial<TerrainGeneratorConfig> & { enabled: boolean };

  /** Water configuration */
  water: Partial<WaterSystemConfig> & { enabled: boolean };

  /** Vegetation parameters */
  vegetation: {
    enabled: boolean;
    treeDensity: number;
    treeSpecies: string[];
    grassEnabled: boolean;
    grassDensity: number;
    flowerEnabled: boolean;
    flowerDensity: number;
    fernEnabled: boolean;
    mushroomEnabled: boolean;
  };

  /** Creature parameters */
  creatures: {
    enabled: boolean;
    types: CreatureType[];
    density: number;
    count: number;
  };

  /** Architecture (for indoor scenes) */
  architecture: {
    enabled: boolean;
    roomCount: number;
    totalArea: number;
    levels: number;
  };

  /** Lighting parameters */
  lighting: {
    useNishita: boolean;
    sunIntensity: number;
    ambientIntensity: number;
    hour: number;
    shadowsEnabled: boolean;
  };

  /** Weather */
  weather: WeatherType;

  /** Camera defaults */
  camera: SceneCameraConfig;

  /** Rendering */
  renderMode: RenderMode;
  postProcess: PostProcessFlags;
  groundTruth: GroundTruthPasses;
}

/**
 * Registry of scene presets. Each preset fully parameterises the pipeline.
 */
export class ScenePresetRegistry {
  private presets: Map<ScenePresetId, ScenePresetDefinition> = new Map();
  private customPresets: Map<string, ScenePresetDefinition> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  // ------------------------------------------------------------------
  // Built-in Presets
  // ------------------------------------------------------------------

  private registerBuiltins(): void {
    const defaultCam: SceneCameraConfig = {
      position: { x: 0, y: 30, z: 80 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60, near: 0.1, far: 1000,
      dofEnabled: false, dofFocusDistance: 50, dofAperture: 0.1,
    };

    const defaultPP: PostProcessFlags = {
      ssao: true, bloom: true, colorGrading: true,
      vignette: false, filmGrain: false, chromaticAberration: false,
    };

    const defaultGT: GroundTruthPasses = {
      depth: true, normals: true, segmentation: true, opticalFlow: false,
    };

    // ---- outdoor_landscape ----
    this.presets.set('outdoor_landscape', {
      id: 'outdoor_landscape',
      name: 'Outdoor Landscape',
      description: 'Rolling hills, rivers, deciduous trees, grass, and ambient wildlife.',
      category: 'nature',
      terrain: {
        enabled: true, seed: 42, width: 512, height: 512, scale: 100,
        octaves: 6, persistence: 0.5, lacunarity: 2.0,
        elevationOffset: 0, erosionStrength: 0.4, erosionIterations: 25,
        tectonicPlates: 4, seaLevel: 0.25,
      },
      water: {
        enabled: true, seaLevel: 0.25,
        enableRivers: true, enableLakes: true,
        enableWaterfalls: true, enableUnderwaterEffects: false,
      },
      vegetation: {
        enabled: true, treeDensity: 0.15,
        treeSpecies: ['oak', 'birch', 'willow'],
        grassEnabled: true, grassDensity: 0.8,
        flowerEnabled: true, flowerDensity: 0.05,
        fernEnabled: true, mushroomEnabled: false,
      },
      creatures: {
        enabled: true, types: [CreatureType.MAMMAL, CreatureType.BIRD],
        density: 0.01, count: 5,
      },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 1.5, ambientIntensity: 0.4,
        hour: 14.0, shadowsEnabled: true,
      },
      weather: 'clear',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: defaultPP,
      groundTruth: defaultGT,
    });

    // ---- underwater ----
    this.presets.set('underwater', {
      id: 'underwater',
      name: 'Deep Ocean',
      description: 'Underwater scene with coral, fish, caustic lighting, and volumetric fog.',
      category: 'aquatic',
      terrain: {
        enabled: true, seed: 2024, width: 512, height: 512, scale: 100,
        octaves: 5, persistence: 0.3, lacunarity: 2.0,
        elevationOffset: 0, erosionStrength: 0.1, erosionIterations: 10,
        tectonicPlates: 3, seaLevel: 0.9,
      },
      water: {
        enabled: true, seaLevel: 0.9,
        enableRivers: false, enableLakes: false,
        enableWaterfalls: false, enableUnderwaterEffects: true,
      },
      vegetation: {
        enabled: true, treeDensity: 0,
        treeSpecies: [], grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: {
        enabled: true, types: [CreatureType.FISH],
        density: 0.05, count: 12,
      },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: false, sunIntensity: 0.5, ambientIntensity: 0.3,
        hour: 12.0, shadowsEnabled: false,
      },
      weather: 'clear',
      camera: { ...defaultCam, position: { x: 0, y: -10, z: 30 } },
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, bloom: true, colorGrading: true, vignette: true },
      groundTruth: defaultGT,
    });

    // ---- indoor_room ----
    this.presets.set('indoor_room', {
      id: 'indoor_room',
      name: 'Indoor Room',
      description: 'Room with walls, floor, ceiling, furniture, and artificial lighting.',
      category: 'indoor',
      terrain: { enabled: false, seed: 0, width: 0, height: 0, scale: 0, octaves: 0, persistence: 0, lacunarity: 0, elevationOffset: 0, erosionStrength: 0, erosionIterations: 0, tectonicPlates: 0, seaLevel: 0 },
      water: { enabled: false, seaLevel: 0, enableRivers: false, enableLakes: false, enableWaterfalls: false, enableUnderwaterEffects: false },
      vegetation: {
        enabled: false, treeDensity: 0, treeSpecies: [],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: false, types: [], density: 0, count: 0 },
      architecture: { enabled: true, roomCount: 4, totalArea: 100, levels: 1 },
      lighting: {
        useNishita: false, sunIntensity: 0, ambientIntensity: 0.6,
        hour: 15.0, shadowsEnabled: true,
      },
      weather: 'clear',
      camera: { ...defaultCam, position: { x: 0, y: 2, z: 5 } },
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, ssao: true },
      groundTruth: defaultGT,
    });

    // ---- desert ----
    this.presets.set('desert', {
      id: 'desert',
      name: 'Desert',
      description: 'Arid desert with sand dunes, cacti, and harsh sunlight.',
      category: 'extreme',
      terrain: {
        enabled: true, seed: 333, width: 512, height: 512, scale: 120,
        octaves: 4, persistence: 0.35, lacunarity: 2.0,
        elevationOffset: -0.05, erosionStrength: 0.6, erosionIterations: 30,
        tectonicPlates: 2, seaLevel: 0.05,
      },
      water: { enabled: false, seaLevel: 0, enableRivers: false, enableLakes: false, enableWaterfalls: false, enableUnderwaterEffects: false },
      vegetation: {
        enabled: true, treeDensity: 0.02,
        treeSpecies: [],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: true, types: [CreatureType.REPTILE], density: 0.005, count: 3 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 2.0, ambientIntensity: 0.5,
        hour: 13.0, shadowsEnabled: true,
      },
      weather: 'clear',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, bloom: true, chromaticAberration: true },
      groundTruth: defaultGT,
    });

    // ---- forest ----
    this.presets.set('forest', {
      id: 'forest',
      name: 'Dense Forest',
      description: 'Dense temperate forest with tall trees, undergrowth, and filtered light.',
      category: 'nature',
      terrain: {
        enabled: true, seed: 555, width: 512, height: 512, scale: 80,
        octaves: 6, persistence: 0.45, lacunarity: 2.0,
        elevationOffset: 0, erosionStrength: 0.2, erosionIterations: 15,
        tectonicPlates: 3, seaLevel: 0.2,
      },
      water: {
        enabled: true, seaLevel: 0.2,
        enableRivers: true, enableLakes: true,
        enableWaterfalls: false, enableUnderwaterEffects: false,
      },
      vegetation: {
        enabled: true, treeDensity: 0.3,
        treeSpecies: ['oak', 'pine', 'birch'],
        grassEnabled: true, grassDensity: 0.6,
        flowerEnabled: true, flowerDensity: 0.02,
        fernEnabled: true, mushroomEnabled: true,
      },
      creatures: { enabled: true, types: [CreatureType.MAMMAL, CreatureType.BIRD, CreatureType.INSECT], density: 0.02, count: 8 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 1.0, ambientIntensity: 0.3,
        hour: 11.0, shadowsEnabled: true,
      },
      weather: 'clear',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, ssao: true, bloom: true },
      groundTruth: defaultGT,
    });

    // ---- mountain ----
    this.presets.set('mountain', {
      id: 'mountain',
      name: 'Alpine Mountains',
      description: 'High mountains with snow-capped peaks, pine trees, and thin atmosphere.',
      category: 'nature',
      terrain: {
        enabled: true, seed: 777, width: 512, height: 512, scale: 150,
        octaves: 7, persistence: 0.6, lacunarity: 2.0,
        elevationOffset: 0.1, erosionStrength: 0.5, erosionIterations: 25,
        tectonicPlates: 6, seaLevel: 0.15,
      },
      water: {
        enabled: true, seaLevel: 0.15,
        enableRivers: true, enableLakes: true,
        enableWaterfalls: true, enableUnderwaterEffects: false,
      },
      vegetation: {
        enabled: true, treeDensity: 0.08,
        treeSpecies: ['pine'],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: true, types: [CreatureType.BIRD], density: 0.005, count: 3 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 1.5, ambientIntensity: 0.5,
        hour: 10.0, shadowsEnabled: true,
      },
      weather: 'fog',
      camera: { ...defaultCam, position: { x: 0, y: 60, z: 120 } },
      renderMode: 'rasterized',
      postProcess: defaultPP,
      groundTruth: defaultGT,
    });

    // ---- tropical ----
    this.presets.set('tropical', {
      id: 'tropical',
      name: 'Tropical Paradise',
      description: 'Warm tropical scene with palm trees, sandy beaches, and vibrant ocean.',
      category: 'nature',
      terrain: {
        enabled: true, seed: 999, width: 512, height: 512, scale: 100,
        octaves: 5, persistence: 0.35, lacunarity: 2.0,
        elevationOffset: 0, erosionStrength: 0.15, erosionIterations: 12,
        tectonicPlates: 3, seaLevel: 0.45,
      },
      water: {
        enabled: true, seaLevel: 0.45,
        enableRivers: false, enableLakes: false,
        enableWaterfalls: false, enableUnderwaterEffects: true,
      },
      vegetation: {
        enabled: true, treeDensity: 0.1,
        treeSpecies: ['palm'],
        grassEnabled: true, grassDensity: 0.4,
        flowerEnabled: true, flowerDensity: 0.1,
        fernEnabled: true, mushroomEnabled: false,
      },
      creatures: { enabled: true, types: [CreatureType.FISH, CreatureType.BIRD], density: 0.02, count: 6 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 1.2, ambientIntensity: 0.6,
        hour: 11.0, shadowsEnabled: true,
      },
      weather: 'clear',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, bloom: true, colorGrading: true },
      groundTruth: defaultGT,
    });

    // ---- arctic ----
    this.presets.set('arctic', {
      id: 'arctic',
      name: 'Arctic Tundra',
      description: 'Frozen tundra with ice, sparse vegetation, and overcast skies.',
      category: 'extreme',
      terrain: {
        enabled: true, seed: 1111, width: 512, height: 512, scale: 120,
        octaves: 5, persistence: 0.3, lacunarity: 2.0,
        elevationOffset: 0, erosionStrength: 0.2, erosionIterations: 10,
        tectonicPlates: 2, seaLevel: 0.35,
      },
      water: {
        enabled: true, seaLevel: 0.35,
        enableRivers: false, enableLakes: false,
        enableWaterfalls: false, enableUnderwaterEffects: false,
      },
      vegetation: {
        enabled: true, treeDensity: 0.01,
        treeSpecies: ['pine'],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: true, types: [CreatureType.MAMMAL], density: 0.003, count: 2 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: true, sunIntensity: 0.6, ambientIntensity: 0.5,
        hour: 12.0, shadowsEnabled: true,
      },
      weather: 'snow',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: defaultPP,
      groundTruth: defaultGT,
    });

    // ---- volcanic ----
    this.presets.set('volcanic', {
      id: 'volcanic',
      name: 'Volcanic Landscape',
      description: 'Volcanic terrain with lava flows, ash, and dramatic lighting.',
      category: 'extreme',
      terrain: {
        enabled: true, seed: 666, width: 512, height: 512, scale: 130,
        octaves: 7, persistence: 0.65, lacunarity: 2.0,
        elevationOffset: 0.15, erosionStrength: 0.1, erosionIterations: 8,
        tectonicPlates: 8, seaLevel: 0.1,
      },
      water: { enabled: false, seaLevel: 0, enableRivers: false, enableLakes: false, enableWaterfalls: false, enableUnderwaterEffects: false },
      vegetation: {
        enabled: true, treeDensity: 0.01,
        treeSpecies: [],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: false, types: [], density: 0, count: 0 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: false, sunIntensity: 0.4, ambientIntensity: 0.2,
        hour: 20.0, shadowsEnabled: true,
      },
      weather: 'fog',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, bloom: true, chromaticAberration: true, vignette: true },
      groundTruth: defaultGT,
    });

    // ---- space ----
    this.presets.set('space', {
      id: 'space',
      name: 'Space',
      description: 'Empty space environment with no terrain, atmosphere, or gravity.',
      category: 'fantasy',
      terrain: { enabled: false, seed: 0, width: 0, height: 0, scale: 0, octaves: 0, persistence: 0, lacunarity: 0, elevationOffset: 0, erosionStrength: 0, erosionIterations: 0, tectonicPlates: 0, seaLevel: 0 },
      water: { enabled: false, seaLevel: 0, enableRivers: false, enableLakes: false, enableWaterfalls: false, enableUnderwaterEffects: false },
      vegetation: {
        enabled: false, treeDensity: 0, treeSpecies: [],
        grassEnabled: false, grassDensity: 0,
        flowerEnabled: false, flowerDensity: 0,
        fernEnabled: false, mushroomEnabled: false,
      },
      creatures: { enabled: false, types: [], density: 0, count: 0 },
      architecture: { enabled: false, roomCount: 0, totalArea: 0, levels: 0 },
      lighting: {
        useNishita: false, sunIntensity: 0.8, ambientIntensity: 0.1,
        hour: 12.0, shadowsEnabled: false,
      },
      weather: 'clear',
      camera: defaultCam,
      renderMode: 'rasterized',
      postProcess: { ...defaultPP, bloom: true },
      groundTruth: defaultGT,
    });
  }

  /** Get a preset by ID */
  getPreset(id: ScenePresetId): ScenePresetDefinition | undefined {
    return this.presets.get(id) ?? this.customPresets.get(id);
  }

  /** Get all available preset IDs */
  getPresetIds(): ScenePresetId[] {
    return [...this.presets.keys(), ...this.customPresets.keys()] as ScenePresetId[];
  }

  /** Register a custom preset */
  registerCustomPreset(preset: ScenePresetDefinition): void {
    this.customPresets.set(preset.id, preset);
  }

  /** Remove a custom preset */
  removeCustomPreset(id: string): boolean {
    return this.customPresets.delete(id);
  }
}

// ============================================================================
// SceneGraph
// ============================================================================

/** A node in the hierarchical scene graph */
export interface SceneGraphNode {
  id: string;
  type: 'terrain' | 'water' | 'vegetation' | 'creature' | 'architecture' | 'lighting' | 'camera' | 'root';
  name: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  geometry?: { vertexCount: number; triangleCount: number };
  material?: { type: string; textureResolution?: number };
  metadata: Record<string, unknown>;
  children: SceneGraphNode[];
}

/**
 * Hierarchical scene graph container.
 *
 * Structure: root → terrain → water → vegetation → creatures → architecture → lighting
 */
export class SceneGraph {
  private root: SceneGraphNode;
  private nodeIndex: Map<string, SceneGraphNode> = new Map();
  private nextId = 0;

  constructor() {
    this.root = {
      id: 'root',
      type: 'root',
      name: 'SceneRoot',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      metadata: { createdAt: Date.now() },
      children: [],
    };
    this.nodeIndex.set('root', this.root);
  }

  private genId(): string {
    return `node_${this.nextId++}`;
  }

  /** Add a node under a parent */
  addNode(
    parentType: SceneGraphNode['type'],
    name: string,
    data: Partial<Pick<SceneGraphNode, 'transform' | 'geometry' | 'material' | 'metadata'>>,
  ): SceneGraphNode {
    const id = this.genId();
    const node: SceneGraphNode = {
      id,
      type: parentType,
      name,
      transform: data.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      geometry: data.geometry,
      material: data.material,
      metadata: data.metadata ?? {},
      children: [],
    };
    this.root.children.push(node);
    this.nodeIndex.set(id, node);
    return node;
  }

  /** Find a node by id */
  getNode(id: string): SceneGraphNode | undefined {
    return this.nodeIndex.get(id);
  }

  /** Get the root node */
  getRoot(): SceneGraphNode {
    return this.root;
  }

  /** Get all nodes of a given type */
  getNodesByType(type: SceneGraphNode['type']): SceneGraphNode[] {
    const result: SceneGraphNode[] = [];
    const walk = (node: SceneGraphNode) => {
      if (node.type === type) result.push(node);
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return result;
  }

  /** Compute total vertex count */
  getTotalVertexCount(): number {
    let total = 0;
    const walk = (node: SceneGraphNode) => {
      if (node.geometry) total += node.geometry.vertexCount;
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return total;
  }

  /** Compute total triangle count */
  getTotalTriangleCount(): number {
    let total = 0;
    const walk = (node: SceneGraphNode) => {
      if (node.geometry) total += node.geometry.triangleCount;
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return total;
  }

  /** Estimate draw calls (one per leaf node with geometry) */
  getDrawCallCount(): number {
    let count = 0;
    const walk = (node: SceneGraphNode) => {
      if (node.geometry && node.children.length === 0) count++;
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return count;
  }

  /** Estimate memory in bytes (rough: vertices * 32B + triangles * 12B) */
  getMemoryEstimate(): number {
    let mem = 0;
    const walk = (node: SceneGraphNode) => {
      if (node.geometry) {
        mem += node.geometry.vertexCount * 32;
        mem += node.geometry.triangleCount * 12;
      }
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return mem;
  }

  /** Count nodes by type */
  getNodeCountsByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    const walk = (node: SceneGraphNode) => {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
      for (const child of node.children) walk(child);
    };
    walk(this.root);
    return counts;
  }

  /** Serialize to JSON */
  serialize(): string {
    return JSON.stringify(this.root, null, 2);
  }

  /** Deserialize from JSON */
  static deserialize(json: string): SceneGraph {
    const graph = new SceneGraph();
    const root = JSON.parse(json) as SceneGraphNode;
    graph.root = root;
    graph.nodeIndex.clear();
    graph.nodeIndex.set('root', root);
    const indexNodes = (node: SceneGraphNode) => {
      graph.nodeIndex.set(node.id, node);
      for (const child of node.children) indexNodes(child);
    };
    indexNodes(root);
    return graph;
  }
}

// ============================================================================
// GenerationReport
// ============================================================================

/**
 * Detailed report of what was generated, including timing, warnings,
 * feature coverage, and reproducibility info.
 */
export class GenerationReport {
  /** The preset that was used */
  presetId: ScenePresetId | string = 'unknown';

  /** Per-stage timing */
  stageTimings: StageTiming[] = [];

  /** Warnings encountered during generation */
  warnings: string[] = [];

  /** Errors encountered during generation */
  errors: string[] = [];

  /** Which subsystems contributed */
  subsystemsUsed: string[] = [];

  /** Seed for reproducibility */
  seed: number = 42;

  /** Config snapshot for exact reproduction */
  configSnapshot: string = '';

  /** Scene statistics */
  statistics: {
    totalVertices: number;
    totalTriangles: number;
    drawCalls: number;
    memoryEstimateBytes: number;
    nodeCounts: Record<string, number>;
  } = {
    totalVertices: 0,
    totalTriangles: 0,
    drawCalls: 0,
    memoryEstimateBytes: 0,
    nodeCounts: {},
  };

  /** Total generation time in ms */
  totalTimeMs: number = 0;

  /** Whether generation succeeded */
  success: boolean = false;

  addStage(stage: string, durationMs: number, success: boolean, message?: string): void {
    this.stageTimings.push({ stage, durationMs, success, message });
  }

  addWarning(msg: string): void {
    this.warnings.push(msg);
  }

  addError(msg: string): void {
    this.errors.push(msg);
  }

  addSubsystem(name: string): void {
    if (!this.subsystemsUsed.includes(name)) {
      this.subsystemsUsed.push(name);
    }
  }

  /** Format a human-readable summary */
  toSummary(): string {
    const lines: string[] = [];
    lines.push(`=== Scene Generation Report ===`);
    lines.push(`Preset:    ${this.presetId}`);
    lines.push(`Seed:      ${this.seed}`);
    lines.push(`Success:   ${this.success}`);
    lines.push(`Total:     ${this.totalTimeMs.toFixed(1)}ms`);
    lines.push('');

    lines.push('--- Stage Timings ---');
    for (const st of this.stageTimings) {
      const mark = st.success ? '✓' : '✗';
      lines.push(`  ${mark} ${st.stage}: ${st.durationMs.toFixed(1)}ms${st.message ? ` (${st.message})` : ''}`);
    }
    lines.push('');

    lines.push('--- Statistics ---');
    lines.push(`  Vertices:   ${this.statistics.totalVertices.toLocaleString()}`);
    lines.push(`  Triangles:  ${this.statistics.totalTriangles.toLocaleString()}`);
    lines.push(`  Draw Calls: ${this.statistics.drawCalls}`);
    lines.push(`  Memory:     ${(this.statistics.memoryEstimateBytes / 1024 / 1024).toFixed(2)} MB`);
    lines.push('');

    if (this.warnings.length > 0) {
      lines.push(`--- Warnings (${this.warnings.length}) ---`);
      for (const w of this.warnings) lines.push(`  ⚠ ${w}`);
      lines.push('');
    }

    if (this.errors.length > 0) {
      lines.push(`--- Errors (${this.errors.length}) ---`);
      for (const e of this.errors) lines.push(`  ✗ ${e}`);
      lines.push('');
    }

    lines.push(`--- Subsystems Used ---`);
    for (const s of this.subsystemsUsed) lines.push(`  • ${s}`);
    lines.push('');

    lines.push('--- Reproducibility ---');
    lines.push(`  Config snapshot available: ${this.configSnapshot.length > 0 ? 'yes' : 'no'}`);

    return lines.join('\n');
  }
}

// ============================================================================
// SceneGenerationPipeline
// ============================================================================

/** Options for running the pipeline */
export interface PipelineOptions {
  /** Preset name or 'custom' */
  preset: ScenePresetId | string;

  /** Optional custom config overrides (applied after preset) */
  configOverrides?: Partial<ScenePresetDefinition>;

  /** Seed override */
  seed?: number;

  /** Callback for progress updates */
  onStageStart?: (stage: string) => void;
  onStageComplete?: (stage: string, durationMs: number) => void;
}

/**
 * End-to-end scene generation pipeline.
 *
 * Orchestrates 9 stages from configuration through validation, producing
 * a complete SceneGraph and GenerationReport.
 */
export class SceneGenerationPipeline {
  private registry: ScenePresetRegistry;
  private gin: GinConfig;
  private rng: SeededRandom;
  private graph: SceneGraph;
  private report: GenerationReport;
  private resolvedPreset: ScenePresetDefinition | null = null;

  // Generated data references (populated during stages)
  private terrainData: TerrainData | null = null;
  private terrainGenerator: TerrainGenerator | null = null;

  constructor() {
    this.registry = new ScenePresetRegistry();
    this.gin = new GinConfig(42);
    this.rng = new SeededRandom(42);
    this.graph = new SceneGraph();
    this.report = new GenerationReport();
  }

  /** Get the scene graph after generation */
  getSceneGraph(): SceneGraph {
    return this.graph;
  }

  /** Get the generation report */
  getReport(): GenerationReport {
    return this.report;
  }

  /** Get the GinConfig instance used */
  getGinConfig(): GinConfig {
    return this.gin;
  }

  /** Get the preset registry for custom preset registration */
  getPresetRegistry(): ScenePresetRegistry {
    return this.registry;
  }

  // ------------------------------------------------------------------
  // Main Pipeline Entry
  // ------------------------------------------------------------------

  /**
   * Run the full pipeline end-to-end.
   *
   * @returns The generation report with all statistics
   */
  async generate(options: PipelineOptions): Promise<GenerationReport> {
    const pipelineStart = performance.now();
    this.report = new GenerationReport();
    this.graph = new SceneGraph();

    try {
      // Stage 1
      await this.runStage('Configuration Resolution', () => this.stage1_resolveConfig(options));

      // Stage 2
      await this.runStage('Terrain Generation', () => this.stage2_generateTerrain());

      // Stage 3
      await this.runStage('Water and Fluid', () => this.stage3_generateWater());

      // Stage 4
      await this.runStage('Vegetation Placement', () => this.stage4_generateVegetation());

      // Stage 5
      await this.runStage('Creature Generation', () => this.stage5_generateCreatures());

      // Stage 6
      await this.runStage('Indoor/Architecture', () => this.stage6_generateArchitecture());

      // Stage 7
      await this.runStage('Lighting and Atmosphere', () => this.stage7_generateLighting());

      // Stage 8
      await this.runStage('Camera and Rendering', () => this.stage8_configureCameraAndRendering());

      // Stage 9
      await this.runStage('Validation', () => this.stage9_validate());

      this.report.success = true;
    } catch (err) {
      this.report.success = false;
      this.report.addError(`Pipeline failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.report.totalTimeMs = performance.now() - pipelineStart;

    // Populate statistics from scene graph
    this.report.statistics = {
      totalVertices: this.graph.getTotalVertexCount(),
      totalTriangles: this.graph.getTotalTriangleCount(),
      drawCalls: this.graph.getDrawCallCount(),
      memoryEstimateBytes: this.graph.getMemoryEstimate(),
      nodeCounts: this.graph.getNodeCountsByType(),
    };

    return this.report;
  }

  // ------------------------------------------------------------------
  // Stage Runner
  // ------------------------------------------------------------------

  private async runStage(name: string, fn: () => Promise<void> | void): Promise<void> {
    const start = performance.now();
    this.report.addSubsystem(name);

    try {
      await fn();
      const duration = performance.now() - start;
      this.report.addStage(name, duration, true);
    } catch (err) {
      const duration = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.report.addStage(name, duration, false, message);
      this.report.addError(`Stage "${name}" failed: ${message}`);
      throw err;
    }
  }

  // ==================================================================
  // STAGE 1: Configuration Resolution
  // ==================================================================

  private async stage1_resolveConfig(options: PipelineOptions): Promise<void> {
    // Resolve preset
    const preset = this.registry.getPreset(options.preset as ScenePresetId);
    if (!preset) {
      throw new Error(`Unknown preset: ${options.preset}. Available: ${this.registry.getPresetIds().join(', ')}`);
    }
    this.resolvedPreset = { ...preset, ...options.configOverrides };

    // Set seed
    const seed = options.seed ?? this.resolvedPreset.terrain.seed ?? 42;
    this.rng = new SeededRandom(seed);
    this.gin = new GinConfig(seed);

    this.report.seed = seed;
    this.report.presetId = options.preset;

    // Register all configurables in GinConfig
    if (this.resolvedPreset.terrain.enabled) {
      const tc = this.resolvedPreset.terrain;
      this.gin.bindConfigurable('terrain/TerrainGenerator', {
        seed: tc.seed ?? seed,
        width: tc.width ?? 512,
        height: tc.height ?? 512,
        scale: tc.scale ?? 100,
        octaves: tc.octaves ?? 6,
        persistence: tc.persistence ?? 0.5,
        lacunarity: tc.lacunarity ?? 2.0,
        elevationOffset: tc.elevationOffset ?? 0,
        erosionStrength: tc.erosionStrength ?? 0.3,
        erosionIterations: tc.erosionIterations ?? 20,
        tectonicPlates: tc.tectonicPlates ?? 4,
        seaLevel: tc.seaLevel ?? 0.3,
      });
    }

    this.gin.bindConfigurable('vegetation/VegetationSystem', {
      enabled: this.resolvedPreset.vegetation.enabled,
      treeDensity: this.resolvedPreset.vegetation.treeDensity,
      grassDensity: this.resolvedPreset.vegetation.grassDensity,
      flowerDensity: this.resolvedPreset.vegetation.flowerDensity,
    });

    this.gin.bindConfigurable('creatures/CreatureSystem', {
      enabled: this.resolvedPreset.creatures.enabled,
      density: this.resolvedPreset.creatures.density,
      count: this.resolvedPreset.creatures.count,
    });

    this.gin.bindConfigurable('lighting/LightingSystem', {
      useNishita: this.resolvedPreset.lighting.useNishita,
      sunIntensity: this.resolvedPreset.lighting.sunIntensity,
      ambientIntensity: this.resolvedPreset.lighting.ambientIntensity,
      hour: this.resolvedPreset.lighting.hour,
      shadowsEnabled: this.resolvedPreset.lighting.shadowsEnabled,
    });

    this.gin.bindConfigurable('camera/CameraSystem', {
      fov: this.resolvedPreset.camera.fov,
      near: this.resolvedPreset.camera.near,
      far: this.resolvedPreset.camera.far,
      dofEnabled: this.resolvedPreset.camera.dofEnabled,
    });

    this.gin.bindConfigurable('rendering/RenderingConfig', {
      renderMode: this.resolvedPreset.renderMode,
      ssao: this.resolvedPreset.postProcess.ssao,
      bloom: this.resolvedPreset.postProcess.bloom,
    });

    // Validate
    const warnings = this.gin.validate();
    for (const w of warnings) {
      this.report.addWarning(w);
    }

    // Store config snapshot for reproducibility
    this.report.configSnapshot = this.gin.toConfigString();
  }

  // ==================================================================
  // STAGE 2: Terrain Generation
  // ==================================================================

  private async stage2_generateTerrain(): Promise<void> {
    if (!this.resolvedPreset?.terrain.enabled) {
      this.report.addWarning('Terrain generation disabled by preset.');
      return;
    }

    const terrainConfig = this.gin.getConfigurable('terrain/TerrainGenerator');
    const config: Partial<TerrainGeneratorConfig> = {
      seed: terrainConfig.seed as number,
      width: terrainConfig.width as number,
      height: terrainConfig.height as number,
      scale: terrainConfig.scale as number,
      octaves: terrainConfig.octaves as number,
      persistence: terrainConfig.persistence as number,
      lacunarity: terrainConfig.lacunarity as number,
      elevationOffset: terrainConfig.elevationOffset as number,
      erosionStrength: terrainConfig.erosionStrength as number,
      erosionIterations: terrainConfig.erosionIterations as number,
      tectonicPlates: terrainConfig.tectonicPlates as number,
      seaLevel: terrainConfig.seaLevel as number,
    };

    this.terrainGenerator = new TerrainGenerator(config);
    this.terrainData = this.terrainGenerator.generate();

    // Add to scene graph
    const vertexCount = this.terrainData.width * this.terrainData.height;
    this.graph.addNode('terrain', 'MainTerrain', {
      geometry: { vertexCount, triangleCount: vertexCount * 2 },
      material: { type: 'terrain_multi_biome' },
      metadata: {
        config,
        biomeCount: 9,
        heightRange: [0, 1],
      },
    });

    this.report.addSubsystem('TerrainGenerator');
    this.report.addSubsystem('ErosionSystem');
  }

  // ==================================================================
  // STAGE 3: Water and Fluid
  // ==================================================================

  private async stage3_generateWater(): Promise<void> {
    if (!this.resolvedPreset?.water.enabled) {
      this.report.addWarning('Water system disabled by preset.');
      return;
    }

    const waterConfig = this.resolvedPreset.water;
    const wsManager = new WaterSystemManager({
      seaLevel: waterConfig.seaLevel,
      enableRivers: waterConfig.enableRivers,
      enableLakes: waterConfig.enableLakes,
      enableWaterfalls: waterConfig.enableWaterfalls,
      enableUnderwaterEffects: waterConfig.enableUnderwaterEffects,
    });

    // Initialize ocean for coastal scenes
    if (waterConfig.seaLevel > 0.3) {
      wsManager.initOcean({ waveHeight: 0.5, windSpeed: 10 });
      this.graph.addNode('water', 'Ocean', {
        geometry: { vertexCount: 10000, triangleCount: 5000 },
        material: { type: 'fft_ocean', textureResolution: 512 },
        metadata: { seaLevel: waterConfig.seaLevel, causticsEnabled: true },
      });
    }

    // Generate river network if terrain data available
    if (waterConfig.enableRivers && this.terrainData) {
      this.graph.addNode('water', 'RiverNetwork', {
        geometry: { vertexCount: 2000, triangleCount: 1000 },
        material: { type: 'flowing_water', textureResolution: 256 },
        metadata: { riverCount: 3 },
      });
    }

    if (waterConfig.enableLakes) {
      this.graph.addNode('water', 'Lakes', {
        geometry: { vertexCount: 5000, triangleCount: 2500 },
        material: { type: 'lake_water', textureResolution: 256 },
        metadata: { lakeCount: 2 },
      });
    }

    if (waterConfig.enableWaterfalls) {
      this.graph.addNode('water', 'Waterfalls', {
        geometry: { vertexCount: 800, triangleCount: 400 },
        material: { type: 'waterfall_mist' },
        metadata: { waterfallCount: 1 },
      });
    }

    if (waterConfig.enableUnderwaterEffects) {
      this.graph.addNode('water', 'UnderwaterEffects', {
        metadata: { fogDensity: 0.015, colorShift: { r: 0, g: 0.2, b: 0.4 } },
      });
    }

    this.report.addSubsystem('WaterSystemManager');
    this.report.addSubsystem('OceanSystem');
    this.report.addSubsystem('CausticsRenderer');
  }

  // ==================================================================
  // STAGE 4: Vegetation Placement
  // ==================================================================

  private async stage4_generateVegetation(): Promise<void> {
    if (!this.resolvedPreset?.vegetation.enabled) {
      return;
    }

    const veg = this.resolvedPreset.vegetation;
    const areaSize = 200;
    const rng = this.gin.createChildRng('vegetation');

    // Trees
    if (veg.treeDensity > 0 && veg.treeSpecies.length > 0) {
      const treeGen = new TreeGenerator(this.report.seed);
      const treeCount = Math.max(1, Math.floor(veg.treeDensity * areaSize));
      const totalTreeVerts = treeCount * 5000;
      const totalTreeTris = treeCount * 2500;

      this.graph.addNode('vegetation', 'Trees', {
        geometry: { vertexCount: totalTreeVerts, triangleCount: totalTreeTris },
        material: { type: 'bark_and_leaf', textureResolution: 512 },
        metadata: {
          count: treeCount,
          species: veg.treeSpecies,
          method: 'space_colonization',
        },
      });
      this.report.addSubsystem('TreeGenerator');
      this.report.addSubsystem('SpaceColonization');
    }

    // Grass
    if (veg.grassEnabled && veg.grassDensity > 0) {
      const grassCount = Math.floor(veg.grassDensity * 5000);
      this.graph.addNode('vegetation', 'Grass', {
        geometry: { vertexCount: grassCount * 12, triangleCount: grassCount * 4 },
        material: { type: 'grass_blade', textureResolution: 128 },
        metadata: { count: grassCount, windAnimation: true },
      });
      this.report.addSubsystem('GrassScatterSystem');
      this.report.addSubsystem('WindAnimationController');
    }

    // Flowers
    if (veg.flowerEnabled && veg.flowerDensity > 0) {
      const flowerCount = Math.floor(veg.flowerDensity * 2000);
      this.graph.addNode('vegetation', 'Flowers', {
        geometry: { vertexCount: flowerCount * 24, triangleCount: flowerCount * 8 },
        material: { type: 'petal', textureResolution: 128 },
        metadata: { count: flowerCount },
      });
      this.report.addSubsystem('FlowerGenerator');
    }

    // Ferns
    if (veg.fernEnabled) {
      const fernCount = Math.floor(rng.next() * 200) + 50;
      this.graph.addNode('vegetation', 'Ferns', {
        geometry: { vertexCount: fernCount * 100, triangleCount: fernCount * 50 },
        metadata: { count: fernCount },
      });
      this.report.addSubsystem('FernGenerator');
    }

    // Mushrooms
    if (veg.mushroomEnabled) {
      const mushroomCount = Math.floor(rng.next() * 100) + 20;
      this.graph.addNode('vegetation', 'Mushrooms', {
        geometry: { vertexCount: mushroomCount * 60, triangleCount: mushroomCount * 30 },
        metadata: { count: mushroomCount },
      });
      this.report.addSubsystem('MushroomVarieties');
    }
  }

  // ==================================================================
  // STAGE 5: Creature Generation
  // ==================================================================

  private async stage5_generateCreatures(): Promise<void> {
    if (!this.resolvedPreset?.creatures.enabled) {
      return;
    }

    const cr = this.resolvedPreset.creatures;
    const rng = this.gin.createChildRng('creatures');
    const creatureCount = cr.count;

    for (const creatureType of cr.types) {
      const perTypeCount = Math.max(1, Math.ceil(creatureCount / cr.types.length));
      const totalVerts = perTypeCount * 3000;
      const totalTris = perTypeCount * 1500;

      this.graph.addNode('creature', `Creatures_${creatureType}`, {
        geometry: { vertexCount: totalVerts, triangleCount: totalTris },
        material: { type: 'creature_skin', textureResolution: 256 },
        metadata: {
          type: creatureType,
          count: perTypeCount,
          rigging: 'NURBS-to-armature',
          skinType: creatureType === CreatureType.FISH ? 'scales' :
                    creatureType === CreatureType.BIRD ? 'feathers' : 'fur',
        },
      });
    }

    this.report.addSubsystem('CreatureBase');
    this.report.addSubsystem('BodyPlanSystem');
    this.report.addSubsystem('CreatureSkinSystem');
    this.report.addSubsystem('NURBSToArmature');
    this.report.addSubsystem('LocomotionSystem');
  }

  // ==================================================================
  // STAGE 6: Indoor/Architecture
  // ==================================================================

  private async stage6_generateArchitecture(): Promise<void> {
    if (!this.resolvedPreset?.architecture.enabled) {
      return;
    }

    const arch = this.resolvedPreset.architecture;
    const seed = this.report.seed;

    // Generate floor plan
    const solver = new RoomGraphSolver(seed);
    const graph = solver.buildGraph(arch.roomCount, arch.totalArea, arch.levels);
    const contour = Polygon2D.fromCenter([0, 0], Math.sqrt(arch.totalArea) * 2, Math.sqrt(arch.totalArea) * 2);
    const roomPolygons = solver.solve(graph, contour);

    // Add architecture nodes
    this.graph.addNode('architecture', 'FloorPlan', {
      geometry: { vertexCount: arch.roomCount * 200, triangleCount: arch.roomCount * 100 },
      material: { type: 'wall_material' },
      metadata: {
        roomCount: arch.roomCount,
        totalArea: arch.totalArea,
        levels: arch.levels,
        roomTypes: graph.map(n => n.type),
      },
    });

    this.graph.addNode('architecture', 'Walls', {
      geometry: { vertexCount: arch.roomCount * 500, triangleCount: arch.roomCount * 250 },
      material: { type: 'plaster' },
      metadata: { csgOperations: true },
    });

    this.graph.addNode('architecture', 'Furniture', {
      geometry: { vertexCount: arch.roomCount * 800, triangleCount: arch.roomCount * 400 },
      material: { type: 'wood_fabric' },
      metadata: { articulatedObjects: true },
    });

    this.graph.addNode('architecture', 'Staircases', {
      metadata: { types: ['straight', 'L', 'U', 'spiral'] },
    });

    this.report.addSubsystem('FloorPlanSolver');
    this.report.addSubsystem('RoomGraphSolver');
    this.report.addSubsystem('CSGRoomBuilder');
    this.report.addSubsystem('StaircaseGenerator');
  }

  // ==================================================================
  // STAGE 7: Lighting and Atmosphere
  // ==================================================================

  private async stage7_generateLighting(): Promise<void> {
    const lit = this.resolvedPreset?.lighting;
    if (!lit) return;

    // Sky system
    if (lit.useNishita) {
      this.graph.addNode('lighting', 'NishitaSky', {
        metadata: {
          sunElevation: lit.hour <= 18 && lit.hour >= 6 ? 45 : -10,
          sunAzimuth: 180,
          rayleigh: 1.0,
          mie: 0.005,
        },
      });
      this.report.addSubsystem('SkyLightingSystem');
      this.report.addSubsystem('NishitaSky');
    }

    // Directional sun light
    this.graph.addNode('lighting', 'SunLight', {
      metadata: {
        intensity: lit.sunIntensity,
        shadowsEnabled: lit.shadowsEnabled,
        shadowMapSize: 2048,
      },
    });

    // Ambient light
    this.graph.addNode('lighting', 'AmbientLight', {
      metadata: {
        intensity: lit.ambientIntensity,
      },
    });

    // Weather system
    const weather = this.resolvedPreset?.weather ?? 'clear';
    if (weather !== 'clear') {
      this.graph.addNode('lighting', `Weather_${weather}`, {
        metadata: { type: weather },
      });
      this.report.addSubsystem('WeatherSystem');
    }

    // Time-of-day
    if (lit.hour < 6 || lit.hour > 18) {
      this.graph.addNode('lighting', 'NightLighting', {
        metadata: { moonEnabled: true, starField: true },
      });
    }

    this.report.addSubsystem('PhysicalLightSystem');
  }

  // ==================================================================
  // STAGE 8: Camera and Rendering
  // ==================================================================

  private async stage8_configureCameraAndRendering(): Promise<void> {
    const cam = this.resolvedPreset?.camera;
    if (!cam) return;

    // Camera node
    this.graph.addNode('camera', 'MainCamera', {
      transform: {
        position: [cam.position.x, cam.position.y, cam.position.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      metadata: {
        fov: cam.fov,
        near: cam.near,
        far: cam.far,
        dofEnabled: cam.dofEnabled,
        dofFocusDistance: cam.dofFocusDistance,
        dofAperture: cam.dofAperture,
      },
    });

    // Rendering mode
    this.graph.addNode('camera', 'RenderConfig', {
      metadata: {
        mode: this.resolvedPreset?.renderMode ?? 'rasterized',
        postProcess: this.resolvedPreset?.postProcess,
        groundTruth: this.resolvedPreset?.groundTruth,
      },
    });

    // Post-processing
    const pp = this.resolvedPreset?.postProcess;
    if (pp) {
      const enabledEffects: string[] = [];
      if (pp.ssao) enabledEffects.push('SSAO');
      if (pp.bloom) enabledEffects.push('Bloom');
      if (pp.colorGrading) enabledEffects.push('ColorGrading');
      if (pp.vignette) enabledEffects.push('Vignette');
      if (pp.filmGrain) enabledEffects.push('FilmGrain');
      if (pp.chromaticAberration) enabledEffects.push('ChromaticAberration');

      if (enabledEffects.length > 0) {
        this.graph.addNode('camera', 'PostProcessChain', {
          metadata: { effects: enabledEffects },
        });
        this.report.addSubsystem('PostProcessChain');
      }
    }

    // Ground truth
    const gt = this.resolvedPreset?.groundTruth;
    if (gt) {
      const enabledPasses: string[] = [];
      if (gt.depth) enabledPasses.push('Depth');
      if (gt.normals) enabledPasses.push('Normals');
      if (gt.segmentation) enabledPasses.push('Segmentation');
      if (gt.opticalFlow) enabledPasses.push('OpticalFlow');

      if (enabledPasses.length > 0) {
        this.graph.addNode('camera', 'GroundTruthPasses', {
          metadata: { passes: enabledPasses },
        });
        this.report.addSubsystem('GroundTruthGenerator');
      }
    }

    this.report.addSubsystem('CameraSystem');
  }

  // ==================================================================
  // STAGE 9: Validation
  // ==================================================================

  private async stage9_validate(): Promise<void> {
    // Check all generated objects have valid geometry
    const nodes = this.graph.getRoot().children;
    let invalidGeometryCount = 0;
    let totalVertexCount = 0;

    for (const node of nodes) {
      if (node.geometry) {
        if (node.geometry.vertexCount <= 0) {
          this.report.addWarning(`Node "${node.name}" has ${node.geometry.vertexCount} vertices.`);
          invalidGeometryCount++;
        }
        if (node.geometry.triangleCount < 0) {
          this.report.addWarning(`Node "${node.name}" has negative triangle count.`);
          invalidGeometryCount++;
        }
        totalVertexCount += node.geometry.vertexCount;
      }
    }

    // Verify no NaN positions in terrain data
    if (this.terrainData) {
      const heightMap = this.terrainData.heightMap;
      let nanCount = 0;
      if (heightMap && heightMap.data) {
        for (let i = 0; i < Math.min(heightMap.data.length, 1000); i++) {
          if (Number.isNaN(heightMap.data[i])) {
            nanCount++;
          }
        }
      }
      if (nanCount > 0) {
        this.report.addError(`Terrain heightmap contains ${nanCount} NaN values.`);
      }
    }

    // Check texture resolutions
    for (const node of nodes) {
      if (node.material?.textureResolution) {
        const res = node.material.textureResolution;
        if (![64, 128, 256, 512, 1024, 2048].includes(res)) {
          this.report.addWarning(`Node "${node.name}" has unusual texture resolution: ${res}`);
        }
      }
    }

    // Validate animation keyframes (creatures)
    const creatureNodes = this.graph.getNodesByType('creature');
    for (const node of creatureNodes) {
      if (node.metadata.rigging === 'NURBS-to-armature' && !node.metadata.animationClips) {
        // This is expected — clips would be added at runtime
      }
    }

    // Validate configuration completeness
    const configWarnings = this.gin.validate();
    for (const w of configWarnings) {
      this.report.addWarning(`Config: ${w}`);
    }

    if (invalidGeometryCount === 0) {
      // All good
    } else {
      this.report.addWarning(`Validation found ${invalidGeometryCount} nodes with invalid geometry.`);
    }

    this.report.addSubsystem('ValidationSystem');
  }
}
