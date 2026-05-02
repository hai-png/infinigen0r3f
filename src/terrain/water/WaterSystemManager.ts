/**
 * WaterSystemManager - Orchestrates all water types in the scene
 *
 * Manages the complete water system including:
 * - Ocean (via OceanSurface)
 * - Rivers (via RiverMeshRenderer)
 * - Lakes (via LakeMeshRenderer)
 * - Waterfalls (via WaterfallMeshRenderer)
 * - Underwater effects
 *
 * Provides:
 * - Single update() method called from useFrame
 * - Water level consistency across all water bodies
 * - Height queries (is position underwater?)
 * - Underwater state for post-processing
 */

import * as THREE from 'three';
import { OceanSurface, OceanConfig } from './OceanSystem';
import { RiverMeshRenderer, RiverMeshConfig } from './RiverMeshRenderer';
import { LakeMeshRenderer, LakeMeshConfig, LakeDefinition } from './LakeMeshRenderer';
import { WaterfallMeshRenderer, WaterfallMeshConfig } from './WaterfallMeshRenderer';
import { UnderwaterEffects, UnderwaterEffectsConfig } from './UnderwaterEffects';
import { RiverNetwork, RiverPoint } from './RiverNetwork';
import { Waterfall } from './WaterfallGenerator';

// ============================================================================
// Configuration
// ============================================================================

export interface WaterSystemConfig {
  /** Global sea level (Y coordinate) (default 0) */
  seaLevel: number;
  /** Ocean configuration */
  oceanConfig: Partial<OceanConfig>;
  /** River mesh configuration */
  riverConfig: Partial<RiverMeshConfig>;
  /** Lake mesh configuration */
  lakeConfig: Partial<LakeMeshConfig>;
  /** Waterfall mesh configuration */
  waterfallConfig: Partial<WaterfallMeshConfig>;
  /** Underwater effects configuration */
  underwaterConfig: Partial<UnderwaterEffectsConfig>;
  /** Whether to enable rivers (default true) */
  enableRivers: boolean;
  /** Whether to enable lakes (default true) */
  enableLakes: boolean;
  /** Whether to enable waterfalls (default true) */
  enableWaterfalls: boolean;
  /** Whether to enable underwater effects (default true) */
  enableUnderwaterEffects: boolean;
}

// ============================================================================
// WaterSystemManager
// ============================================================================

export class WaterSystemManager {
  private config: WaterSystemConfig;
  private group: THREE.Group;
  private ocean: OceanSurface | null = null;
  private riverRenderer: RiverMeshRenderer | null = null;
  private lakeRenderer: LakeMeshRenderer | null = null;
  private waterfallRenderer: WaterfallMeshRenderer | null = null;
  private underwaterEffects: UnderwaterEffects | null = null;
  private time: number = 0;

  // Cached water level data for queries
  private lakeDefinitions: LakeDefinition[] = [];
  private riverPaths: RiverPoint[][] = [];

  constructor(config: Partial<WaterSystemConfig> = {}) {
    this.config = {
      seaLevel: 0,
      oceanConfig: {},
      riverConfig: {},
      lakeConfig: {},
      waterfallConfig: {},
      underwaterConfig: {},
      enableRivers: true,
      enableLakes: true,
      enableWaterfalls: true,
      enableUnderwaterEffects: true,
      ...config,
    };
    this.group = new THREE.Group();
    this.underwaterEffects = new UnderwaterEffects({
      waterLevel: this.config.seaLevel,
      ...this.config.underwaterConfig,
    });
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------

  /**
   * Initialize the ocean system
   */
  initOcean(config?: Partial<OceanConfig>): OceanSurface {
    const mergedConfig = { ...this.config.oceanConfig, ...config };
    this.ocean = new OceanSurface(mergedConfig);
    const mesh = this.ocean.getMesh();
    mesh.position.y = this.config.seaLevel;
    this.group.add(mesh);
    return this.ocean;
  }

  /**
   * Initialize river rendering from RiverNetwork data
   */
  initRivers(rivers: RiverPoint[][]): THREE.Mesh | null {
    if (!this.config.enableRivers) return null;

    this.riverPaths = rivers;
    this.riverRenderer = new RiverMeshRenderer(this.config.riverConfig);
    const mesh = this.riverRenderer.buildMesh(rivers);
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Initialize lake rendering
   */
  initLakes(lakes: LakeDefinition[]): THREE.Group | null {
    if (!this.config.enableLakes) return null;

    this.lakeDefinitions = lakes;
    this.lakeRenderer = new LakeMeshRenderer(this.config.lakeConfig);
    const group = this.lakeRenderer.buildMeshes(lakes);
    this.group.add(group);
    return group;
  }

  /**
   * Initialize waterfall rendering
   */
  initWaterfalls(waterfalls: Waterfall[]): THREE.Group | null {
    if (!this.config.enableWaterfalls) return null;

    this.waterfallRenderer = new WaterfallMeshRenderer(this.config.waterfallConfig);
    const group = this.waterfallRenderer.buildMeshes(waterfalls);
    this.group.add(group);
    return group;
  }

  /**
   * Initialize underwater effects
   */
  initUnderwaterEffects(): UnderwaterEffects | null {
    if (!this.config.enableUnderwaterEffects) return null;
    return this.underwaterEffects;
  }

  // ------------------------------------------------------------------
  // Update Loop
  // ------------------------------------------------------------------

  /**
   * Master update method - call from useFrame each frame.
   * Updates all water subsystems and underwater effects.
   *
   * @param dt - Delta time in seconds
   * @param camera - Scene camera (for underwater detection)
   * @param scene - Three.js scene (for fog/background changes)
   */
  update(dt: number, camera?: THREE.Camera, scene?: THREE.Scene): void {
    this.time += dt;

    // Update ocean
    if (this.ocean) {
      this.ocean.update(dt);
      if (camera) {
        this.ocean.setCameraPosition(camera.position);
      }
    }

    // Update river flow animation
    if (this.riverRenderer) {
      this.riverRenderer.update(dt);
    }

    // Update lake wave animation
    if (this.lakeRenderer) {
      this.lakeRenderer.update(dt);
    }

    // Update waterfall animations (mist, splash)
    if (this.waterfallRenderer) {
      this.waterfallRenderer.update(dt);
    }

    // Update underwater effects
    if (this.underwaterEffects && camera && scene) {
      this.underwaterEffects.update(camera, scene, dt);
    }
  }

  // ------------------------------------------------------------------
  // Water Level Queries
  // ------------------------------------------------------------------

  /**
   * Check if a world position is underwater (below any water surface).
   * Returns the water level at that position, or null if not underwater.
   */
  getWaterLevelAt(x: number, y: number, z: number): number | null {
    // Check lakes first (most specific)
    if (this.lakeRenderer) {
      const lakeLevel = this.lakeRenderer.getWaterLevelAt(x, z);
      if (lakeLevel !== null && y < lakeLevel) {
        return lakeLevel;
      }
    }

    // Check ocean (covers large area)
    if (this.ocean) {
      const oceanHeight = this.ocean.getHeightAt(x, z) + this.config.seaLevel;
      if (y < oceanHeight) {
        return oceanHeight;
      }
    }

    // Check rivers (approximate - check if near a river point)
    for (const river of this.riverPaths) {
      for (const point of river) {
        const dx = x - point.position.x;
        const dz = z - point.position.z;
        const distSq = dx * dx + dz * dz;
        const riverWidth = point.width * 1.5; // some margin
        if (distSq < riverWidth * riverWidth && y < point.position.y) {
          return point.position.y;
        }
      }
    }

    return null;
  }

  /**
   * Check if a position is underwater
   */
  isUnderwater(x: number, y: number, z: number): boolean {
    return this.getWaterLevelAt(x, y, z) !== null;
  }

  /**
   * Get the underwater state (from camera perspective)
   */
  isCameraUnderwater(): boolean {
    return this.underwaterEffects?.isCameraUnderwater() ?? false;
  }

  /**
   * Get depth below water at a given position
   */
  getDepthBelowWater(x: number, y: number, z: number): number {
    const waterLevel = this.getWaterLevelAt(x, y, z);
    if (waterLevel !== null) {
      return waterLevel - y;
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  /**
   * Get the master group containing all water objects
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Get the ocean surface
   */
  getOcean(): OceanSurface | null {
    return this.ocean;
  }

  /**
   * Get the river renderer
   */
  getRiverRenderer(): RiverMeshRenderer | null {
    return this.riverRenderer;
  }

  /**
   * Get the lake renderer
   */
  getLakeRenderer(): LakeMeshRenderer | null {
    return this.lakeRenderer;
  }

  /**
   * Get the waterfall renderer
   */
  getWaterfallRenderer(): WaterfallMeshRenderer | null {
    return this.waterfallRenderer;
  }

  /**
   * Get the underwater effects system
   */
  getUnderwaterEffects(): UnderwaterEffects | null {
    return this.underwaterEffects;
  }

  /**
   * Get global sea level
   */
  getSeaLevel(): number {
    return this.config.seaLevel;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Dispose all water system resources
   */
  dispose(): void {
    if (this.ocean) {
      this.ocean.dispose();
    }
    if (this.riverRenderer) {
      this.riverRenderer.dispose();
    }
    if (this.lakeRenderer) {
      this.lakeRenderer.dispose();
    }
    if (this.waterfallRenderer) {
      this.waterfallRenderer.dispose();
    }
    if (this.underwaterEffects) {
      this.underwaterEffects.dispose();
    }

    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  /**
   * Update the global sea level and propagate to all water bodies
   */
  setSeaLevel(level: number): void {
    this.config.seaLevel = level;

    if (this.ocean) {
      this.ocean.getMesh().position.y = level;
    }

    if (this.underwaterEffects) {
      this.underwaterEffects.updateConfig({ waterLevel: level });
    }
  }

  updateConfig(partial: Partial<WaterSystemConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): WaterSystemConfig {
    return { ...this.config };
  }
}
