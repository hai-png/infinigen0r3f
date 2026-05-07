/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Core Terrain Generator with Multi-Octave Noise, Erosion, and Tectonics
 *
 * Integrated with TerrainSurfaceShaderPipeline for optional GPU/CPU
 * SDF-based surface displacement after terrain mesh generation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEPRECATION NOTICE
 * ─────────────────────────────────────────────────────────────────────
 * This class is now a thin convenience wrapper around UnifiedTerrainGenerator.
 * It preserves the original TerrainData-based API for backward compatibility
 * while delegating heightmap generation to the unified system.
 *
 * @deprecated Use `UnifiedTerrainGenerator` with `TerrainGenerationMode.HEIGHTMAP`
 *             instead. Migration guide:
 *
 *   // Old (deprecated):
 *   const gen = new TerrainGenerator({ seed: 42, width: 512, height: 512 });
 *   const data: TerrainData = gen.generate();
 *
 *   // New (preferred):
 *   const gen = new UnifiedTerrainGenerator({
 *     mode: TerrainGenerationMode.HEIGHTMAP,
 *     seed: 42,
 *     heightmapSize: 512,
 *   });
 *   const heightmap: Float32Array = gen.generateHeightmap();
 *   // Compute normals/slopes/biomes separately as needed
 *
 * UnifiedTerrainGenerator supports HEIGHTMAP, SDF_FLAT, SDF_FULL, and PLANET
 * modes, eliminating the need for this heightmap-only class.
 * ─────────────────────────────────────────────────────────────────────
 */

import { Box3, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { TerrainSurfaceShaderPipeline, DEFAULT_TERRAIN_SURFACE_CONFIG } from '../gpu/TerrainSurfaceShaderPipeline';
import type { TerrainSurfaceConfig } from '../gpu/TerrainSurfaceShaderPipeline';
import { SignedDistanceField } from '../sdf/sdf-operations';
import type { HeightMap, NormalMap } from '../types';
import type { TerrainData as UnifiedTerrainData } from '../types';
import type { MaskMap, BiomeGrid, TerrainConfig } from '../types';
import { heightMapFromFloat32Array, normalizeHeightmap } from '../types';
import { BiomeSystem, type BiomeGrid as BiomeSystemGrid, type BiomeType } from '../biomes/core/BiomeSystem';
import {
  UnifiedTerrainGenerator,
  TerrainGenerationMode,
} from '../UnifiedTerrainGenerator';

/**
 * Full configuration for TerrainGenerator (internal use).
 *
 * This extends the simplified TerrainConfig from ../types with all the
 * parameters the legacy generator needs. The unified TerrainData.config
 * carries only the simplified version for consumers.
 */
export interface TerrainGeneratorConfig {
  seed: number;
  width: number;
  height: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  elevationOffset: number;
  erosionStrength: number;
  erosionIterations: number;
  tectonicPlates: number;
  seaLevel: number;
  /**
   * Configuration for the GPU surface shader pipeline.
   *
   * When provided (even as an empty object), the TerrainGenerator will create
   * a TerrainSurfaceShaderPipeline instance. Set `enabled: true` inside the
   * config to activate SDF-based surface displacement on generated meshes.
   *
   * If omitted or undefined, the pipeline is not created and terrain
   * generation behaves exactly as before (no breaking changes).
   */
  surfaceShaderConfig?: Partial<TerrainSurfaceConfig>;
}

// Re-export the unified TerrainData and TerrainConfig from types
export type TerrainData = UnifiedTerrainData;
export type { MaskMap, BiomeGrid, TerrainConfig };

/**
 * Legacy heightmap-only terrain generator.
 *
 * @deprecated Use `UnifiedTerrainGenerator` with `TerrainGenerationMode.HEIGHTMAP` instead.
 *
 * This class now delegates base heightmap generation (noise + erosion) to
 * `UnifiedTerrainGenerator.generateHeightmap()`, then augments the result
 * with tectonic uplift, elevation offset, derived maps (normals, slopes),
 * and biome classification to preserve the original `TerrainData` API.
 *
 * All existing code that constructs `TerrainGenerator` and calls
 * `generate()`, `getHeightAt()`, etc. will continue to work unchanged.
 */
export class TerrainGenerator {
  private rng: SeededRandom;
  private config: TerrainGeneratorConfig;
  private width: number;
  private height: number;
  private cachedHeightMap: Float32Array | null = null;
  private biomeSystem: BiomeSystem | null = null;

  /** Internal UnifiedTerrainGenerator used for heightmap generation */
  private unifiedGenerator: UnifiedTerrainGenerator;

  // -----------------------------------------------------------------------
  // Surface Shader Pipeline Integration
  // -----------------------------------------------------------------------

  /**
   * The GPU/CPU surface shader pipeline for SDF-based displacement.
   *
   * Created only when `surfaceShaderConfig` is provided in the constructor.
   * Call `initializeSurfaceShader()` before using `applySurfaceDisplacement()`.
   */
  private surfaceShaderPipeline: TerrainSurfaceShaderPipeline | null = null;

  /**
   * Whether the surface shader pipeline has been initialized.
   * Set to true after `initializeSurfaceShader()` completes (even if GPU init
   * failed — CPU fallback is still available).
   */
  private surfaceShaderInitialized: boolean = false;

  constructor(config: Partial<TerrainGeneratorConfig> = {}) {
    this.config = {
      seed: 42,
      width: 512,
      height: 512,
      scale: 100,
      octaves: 6,
      persistence: 0.5,
      lacunarity: 2.0,
      elevationOffset: 0,
      erosionStrength: 0.3,
      erosionIterations: 20,
      tectonicPlates: 4,
      seaLevel: 0.3,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed);
    this.width = this.config.width;
    this.height = this.config.height;

    // Create internal UnifiedTerrainGenerator in HEIGHTMAP mode.
    // This is the single code path for heightmap generation — the old
    // inline Perlin noise, ErosionSystem, etc. are replaced by the
    // unified system's GroundElement + thermal erosion pipeline.
    this.unifiedGenerator = this.createUnifiedGenerator();

    // Create the surface shader pipeline if config is provided
    if (this.config.surfaceShaderConfig !== undefined) {
      const mergedConfig: Partial<TerrainSurfaceConfig> = {
        ...DEFAULT_TERRAIN_SURFACE_CONFIG,
        ...this.config.surfaceShaderConfig,
      };
      this.surfaceShaderPipeline = new TerrainSurfaceShaderPipeline(mergedConfig);
    }
  }

  // =====================================================================
  // UnifiedTerrainGenerator Bridge
  // =====================================================================

  /**
   * Create a `UnifiedTerrainGenerator` configured in HEIGHTMAP mode,
   * mapping this `TerrainGeneratorConfig`'s parameters to the unified config shape.
   */
  private createUnifiedGenerator(): UnifiedTerrainGenerator {
    const worldSize = this.config.scale;
    const halfSize = worldSize / 2;

    return new UnifiedTerrainGenerator({
      mode: TerrainGenerationMode.HEIGHTMAP,
      seed: this.config.seed,
      heightmapSize: Math.max(this.width, this.height),
      heightScale: this.config.scale,
      bounds: {
        minX: -halfSize,
        maxX: halfSize,
        minY: -10,
        maxY: 30,
        minZ: -halfSize,
        maxZ: halfSize,
      },
      groundParams: {
        frequency: 1.0 / this.config.scale,
        amplitude: 8,
        octaves: this.config.octaves,
        persistence: this.config.persistence,
        lacunarity: this.config.lacunarity,
        baseHeight: 0,
      },
      erosionStrength: this.config.erosionStrength,
      erosionIterations: this.config.erosionIterations,
      // Disable GPU SDF evaluator — not needed for heightmap-only mode
      gpuSDFConfig: { enabled: false },
    });
  }

  // =====================================================================
  // Main Generation API
  // =====================================================================

  /**
   * Generate complete terrain data.
   *
   * Delegates base heightmap generation (noise + erosion + normalisation)
   * to the internal `UnifiedTerrainGenerator` in HEIGHTMAP mode, then
   * applies tectonic uplift, elevation offset, and computes derived maps
   * (normals, slopes, biomes) for backward compatibility.
   */
  public generate(): TerrainData {
    console.log(`[TerrainGenerator] Generating terrain (via UnifiedTerrainGenerator) with seed ${this.config.seed}...`);

    // 1. Delegate base heightmap generation (including erosion) to UnifiedTerrainGenerator
    let heightData = this.unifiedGenerator.generateHeightmap();

    // Handle non-square maps: the unified generator always produces a square
    // grid of size `heightmapSize = max(width, height)`.  If the requested
    // dimensions differ, crop to the target rectangle.
    if (this.width !== this.height) {
      const maxSize = Math.max(this.width, this.height);
      const cropped = new Float32Array(this.width * this.height);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          cropped[y * this.width + x] = heightData[y * maxSize + x];
        }
      }
      heightData = cropped;
    }

    // 2. Apply tectonic uplift (feature not available in UnifiedTerrainGenerator)
    this.applyTectonics(heightData);

    // 3. Normalize to [0, 1] using shared utility, then apply elevation offset
    normalizeHeightmap(heightData);
    if (this.config.elevationOffset !== 0) {
      for (let i = 0; i < heightData.length; i++) {
        heightData[i] = heightData[i] + this.config.elevationOffset;
        heightData[i] = Math.max(0, Math.min(1, heightData[i]));
      }
    }

    // 4. Calculate derived maps
    const normalData = this.calculateNormals(heightData);
    const slopeData = this.calculateSlopes(heightData);

    // 5. Generate biome data using BiomeSystem (Whittaker classification)
    this.biomeSystem = new BiomeSystem(0.3, this.config.seed);
    const biomeSystemGrid = this.biomeSystem.generateBiomeGrid(
      heightData,
      slopeData,
      this.width,
      this.height,
      { seed: this.config.seed, seaLevel: this.config.seaLevel }
    );

    // Convert Uint8Array biome IDs to Float32Array mask (MaskMap)
    const biomeMask: MaskMap = new Float32Array(biomeSystemGrid.biomeIds.length);
    for (let i = 0; i < biomeSystemGrid.biomeIds.length; i++) {
      biomeMask[i] = biomeSystemGrid.biomeIds[i];
    }

    // Build simplified BiomeGrid for TerrainData
    const biomeGrid: BiomeGrid = {
      cells: [],
      width: biomeSystemGrid.width,
      height: biomeSystemGrid.height,
    };
    for (let i = 0; i < biomeSystemGrid.biomeIds.length; i++) {
      biomeGrid.cells.push(biomeSystemGrid.biomeIndexToType[biomeSystemGrid.biomeIds[i]] ?? 'desert');
    }

    // Determine dominant biome (excluding ocean)
    const dominantBiome = this.computeDominantBiome(biomeSystemGrid);

    // Cache raw heightmap for getHeightAt() lookups
    this.cachedHeightMap = heightData;

    // Compute world-space bounds
    const halfSize = this.config.scale / 2;
    const bounds = new Box3(
      new Vector3(-halfSize, -this.config.scale, -halfSize),
      new Vector3(halfSize, this.config.scale, halfSize)
    );

    // Build the unified TerrainData
    return {
      heightMap: heightMapFromFloat32Array(heightData, this.width, this.height),
      normalMap: { data: normalData, width: this.width, height: this.height },
      slopeMap: heightMapFromFloat32Array(slopeData, this.width, this.height),
      biomeMask,
      biomeGrid,
      dominantBiome,
      bounds,
      waterLevel: this.config.seaLevel * this.config.scale,
      config: {
        scale: this.config.scale,
        heightScale: this.config.scale,
        seaLevel: this.config.seaLevel,
        erosionIterations: this.config.erosionIterations,
        biomeCount: this.config.tectonicPlates,
        // Preserve extra fields via index signature
        seed: this.config.seed,
        width: this.config.width,
        height: this.config.height,
        octaves: this.config.octaves,
        persistence: this.config.persistence,
        lacunarity: this.config.lacunarity,
        elevationOffset: this.config.elevationOffset,
        erosionStrength: this.config.erosionStrength,
        tectonicPlates: this.config.tectonicPlates,
      },
      width: this.width,
      height: this.height,
    };
  }

  // =====================================================================
  // Tectonic Uplift (local — not in UnifiedTerrainGenerator)
  // =====================================================================

  /**
   * Apply tectonic plate simulation for mountain ranges.
   *
   * This step is specific to the legacy TerrainGenerator and is not
   * available in UnifiedTerrainGenerator, so it is retained locally.
   */
  private applyTectonics(heightMap: Float32Array): void {
    if (this.config.tectonicPlates <= 0) return;

    // Generate plate centers
    const plates: { x: number; y: number; height: number; radius: number }[] = [];
    for (let i = 0; i < this.config.tectonicPlates; i++) {
      plates.push({
        x: this.rng.next() * this.width,
        y: this.rng.next() * this.height,
        height: 0.5 + this.rng.next() * 0.5,
        radius: (Math.min(this.width, this.height) / 3) * (0.5 + this.rng.next()),
      });
    }

    // Apply plate influence
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let uplift = 0;

        for (const plate of plates) {
          const dx = x - plate.x;
          const dy = y - plate.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < plate.radius) {
            const falloff = 1 - (dist / plate.radius);
            uplift += plate.height * falloff * falloff; // Quadratic falloff
          }
        }

        const idx = y * this.width + x;
        heightMap[idx] = Math.min(1.0, heightMap[idx] + uplift * 0.5);
      }
    }
  }

  // =====================================================================
  // Derived Maps (local — not produced by UnifiedTerrainGenerator)
  // =====================================================================

  /**
   * Calculate normal vectors for lighting
   */
  private calculateNormals(heightMap: Float32Array): Float32Array {
    const normals = new Float32Array(this.width * this.height * 3);
    const scale = 1.0 / this.config.scale;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const left = x > 0 ? heightMap[y * this.width + (x - 1)] : heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : heightMap[y * this.width + x];
        const top = y > 0 ? heightMap[(y - 1) * this.width + x] : heightMap[y * this.width + x];
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : heightMap[y * this.width + x];

        const dx = (right - left) * scale;
        const dy = (bottom - top) * scale;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const idx = (y * this.width + x) * 3;
        normals[idx] = -dx / len;     // X
        normals[idx + 1] = -dy / len; // Y
        normals[idx + 2] = dz / len;  // Z
      }
    }

    return normals;
  }

  /**
   * Calculate slope values for biome determination
   */
  private calculateSlopes(heightMap: Float32Array): Float32Array {
    const slopes = new Float32Array(this.width * this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const center = heightMap[y * this.width + x];
        const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : center;
        const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : center;

        const dx = right - center;
        const dy = bottom - center;
        slopes[y * this.width + x] = Math.sqrt(dx * dx + dy * dy);
      }
    }

    // Normalize slopes
    let maxSlope = 0;
    for (let i = 0; i < slopes.length; i++) {
      maxSlope = Math.max(maxSlope, slopes[i]);
    }

    if (maxSlope > 0) {
      for (let i = 0; i < slopes.length; i++) {
        slopes[i] /= maxSlope;
      }
    }

    return slopes;
  }

  // =====================================================================
  // Biome Helpers
  // =====================================================================

  /**
   * Compute the dominant (non-ocean) biome from a BiomeSystemGrid.
   */
  private computeDominantBiome(biomeGrid: BiomeSystemGrid): BiomeType | null {
    const biomeCounts = new Map<string, number>();
    for (let i = 0; i < biomeGrid.biomeIds.length; i++) {
      const biomeType = biomeGrid.biomeIndexToType[biomeGrid.biomeIds[i]];
      if (biomeType) {
        biomeCounts.set(biomeType, (biomeCounts.get(biomeType) ?? 0) + 1);
      }
    }
    let maxCount = 0;
    let dominantBiome: BiomeType | null = null;
    for (const [type, count] of biomeCounts) {
      if (type !== 'ocean' && count > maxCount) {
        maxCount = count;
        dominantBiome = type as BiomeType;
      }
    }
    return dominantBiome;
  }

  /**
   * Generate biome mask using the BiomeSystem (Whittaker classification).
   *
   * This is now a convenience wrapper that delegates to BiomeSystem.
   * The primary biome generation happens in generate() which produces a full
   * BiomeGrid with temperature/moisture maps and blend weights.
   *
   * This method is kept for backward compatibility and unit testing.
   */
  generateBiomeMask(heightMap: Float32Array, slopeMap: Float32Array, seaLevel?: number): MaskMap {
    const biomeSystem = new BiomeSystem(0.3, this.config.seed);
    const biomeIds = biomeSystem.generateBiomeMask(
      heightMap,
      slopeMap,
      this.width,
      this.height,
      seaLevel ?? this.config.seaLevel
    );
    // Convert Uint8Array to Float32Array mask (MaskMap)
    return new Float32Array(biomeIds);
  }

  /**
   * Get the BiomeSystem instance used for the last terrain generation.
   * Returns null if generate() has not been called yet.
   */
  getBiomeSystem(): BiomeSystem | null {
    return this.biomeSystem;
  }

  /**
   * Get the internal UnifiedTerrainGenerator instance.
   *
   * Useful for accessing the unified generator's advanced features
   * (SDF modes, presets, async generation) while still using the
   * legacy TerrainGenerator as the primary entry point.
   */
  getUnifiedGenerator(): UnifiedTerrainGenerator {
    return this.unifiedGenerator;
  }

  // =====================================================================
  // Reseed
  // =====================================================================

  /**
   * Reseed the generator.
   *
   * Creates a new internal `UnifiedTerrainGenerator` with the updated seed.
   */
  public reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.config.seed = seed;
    this.unifiedGenerator = this.createUnifiedGenerator();
  }

  // =====================================================================
  // Surface Shader Pipeline — Public API
  // =====================================================================

  /**
   * Initialize the surface shader pipeline.
   *
   * Must be called before `applySurfaceDisplacement()`.  If no pipeline
   * was configured (i.e. `surfaceShaderConfig` was not provided), this
   * is a no-op that returns `false`.
   *
   * If WebGPU is unavailable the pipeline automatically falls back to
   * CPU-based displacement, which still works correctly.
   *
   * @param device - Optional pre-existing GPUDevice to share
   * @returns `true` if the GPU pipeline was created, `false` otherwise
   *          (CPU fallback or no pipeline configured)
   */
  async initializeSurfaceShader(device?: GPUDevice): Promise<boolean> {
    if (!this.surfaceShaderPipeline) {
      return false;
    }

    const gpuReady = await this.surfaceShaderPipeline.initialize(device);
    this.surfaceShaderInitialized = true;
    return gpuReady;
  }

  /**
   * Check whether the surface shader pipeline is enabled and initialized.
   *
   * Returns `true` only when a pipeline was configured AND
   * `initializeSurfaceShader()` has been called.
   */
  isSurfaceShaderReady(): boolean {
    return this.surfaceShaderPipeline !== null && this.surfaceShaderInitialized;
  }

  /**
   * Check whether the surface shader pipeline is enabled (config provided).
   *
   * Unlike `isSurfaceShaderReady()`, this returns `true` as soon as the
   * config is provided, even before `initializeSurfaceShader()` is called.
   */
  isSurfaceShaderEnabled(): boolean {
    return this.surfaceShaderPipeline !== null;
  }

  /**
   * Get the underlying TerrainSurfaceShaderPipeline instance.
   *
   * Returns `null` if no pipeline was configured.
   */
  getSurfaceShaderPipeline(): TerrainSurfaceShaderPipeline | null {
    return this.surfaceShaderPipeline;
  }

  /**
   * Apply SDF-based surface displacement to a terrain mesh geometry.
   *
   * This is the main integration point: after generating terrain data and
   * building a mesh, pass the geometry here to refine it.  The pipeline
   * will:
   *   1. Project vertices onto the true SDF isosurface (Newton step)
   *   2. Optionally add noise-based displacement for surface detail
   *   3. Recompute normals from the SDF gradient
   *
   * If the pipeline is disabled or not initialized, the original geometry
   * is returned unchanged (no breaking changes).
   *
   * @param geometry - The terrain mesh geometry to displace
   * @param sdf      - The signed distance field for the terrain
   * @returns        Displaced geometry, or the original if pipeline is off
   */
  async applySurfaceDisplacement(
    geometry: BufferGeometry,
    sdf: SignedDistanceField,
  ): Promise<BufferGeometry> {
    if (!this.surfaceShaderPipeline || !this.surfaceShaderInitialized) {
      return geometry;
    }

    try {
      return await this.surfaceShaderPipeline.computeDisplacement(geometry, sdf);
    } catch (err) {
      console.warn(
        '[TerrainGenerator] Surface displacement failed, returning original geometry:',
        err,
      );
      return geometry;
    }
  }

  /**
   * Build a SignedDistanceField from the cached heightmap data.
   *
   * Must be called after `generate()`.  The SDF represents the terrain
   * surface as a 3D field where:
   *   - Negative values = inside / below the surface
   *   - Positive values = outside / above the surface
   *   - Zero = on the surface
   *
   * The SDF uses a vertical-distance approximation which is efficient
   * and works well for heightmap terrain.  The displacement pipeline
   * will project vertices onto the zero-level isosurface.
   *
   * @param heightScale - Vertical scaling factor (matches the value used
   *                      when building the mesh, e.g. 100 or 35)
   * @param worldSize   - Horizontal world-space extent of the terrain
   * @param sdfResolution - Voxel resolution for the SDF grid (default 16)
   * @returns           A SignedDistanceField instance
   * @throws            Error if `generate()` has not been called yet
   */
  buildTerrainSDF(
    heightScale: number = 100,
    worldSize: number = 200,
    sdfResolution: number = 16,
  ): SignedDistanceField {
    if (!this.cachedHeightMap) {
      throw new Error(
        '[TerrainGenerator] Must call generate() before buildTerrainSDF()',
      );
    }

    const halfWorld = worldSize / 2;

    // 3D bounds: terrain spans [-halfWorld, halfWorld] in X and Z,
    // and [0, heightScale] in Y (with some padding)
    const padding = heightScale * 0.2;
    const bounds = new Box3(
      new Vector3(-halfWorld, -padding, -halfWorld),
      new Vector3(halfWorld, heightScale + padding, halfWorld),
    );

    const sdf = new SignedDistanceField({
      resolution: sdfResolution,
      bounds,
      maxDistance: heightScale + padding,
    });

    // Fill in SDF values from the heightmap
    for (let gz = 0; gz < sdf.gridSize[2]; gz++) {
      for (let gy = 0; gy < sdf.gridSize[1]; gy++) {
        for (let gx = 0; gx < sdf.gridSize[0]; gx++) {
          const worldPos = sdf.getPosition(gx, gy, gz);

          // Map world XZ to heightmap UV coordinates
          const hx = ((worldPos.x + halfWorld) / worldSize) * (this.width - 1);
          const hz = ((worldPos.z + halfWorld) / worldSize) * (this.height - 1);

          // Sample height at this position via bilinear interpolation
          const surfaceY = this.getHeightAt(
            Math.max(0, Math.min(this.width - 1.001, hx)),
            Math.max(0, Math.min(this.height - 1.001, hz)),
          ) * heightScale;

          // SDF value: positive above surface, negative below
          const sdfValue = worldPos.y - surfaceY;

          sdf.setValueAtGrid(gx, gy, gz, sdfValue);
        }
      }
    }

    return sdf;
  }

  /**
   * Update the surface shader configuration at runtime.
   *
   * Changes take effect on the next `applySurfaceDisplacement()` call.
   * Has no effect if no pipeline was configured.
   */
  setSurfaceShaderConfig(config: Partial<TerrainSurfaceConfig>): void {
    if (this.surfaceShaderPipeline) {
      this.surfaceShaderPipeline.setConfig(config);
    }
  }

  /**
   * Get the current surface shader configuration.
   *
   * Returns `null` if no pipeline was configured.
   */
  getSurfaceShaderConfig(): TerrainSurfaceConfig | null {
    if (!this.surfaceShaderPipeline) return null;
    return this.surfaceShaderPipeline.getConfig();
  }

  /**
   * Release all resources held by the surface shader pipeline.
   *
   * Call this when the TerrainGenerator is no longer needed.
   */
  dispose(): void {
    if (this.surfaceShaderPipeline) {
      this.surfaceShaderPipeline.dispose();
      this.surfaceShaderPipeline = null;
      this.surfaceShaderInitialized = false;
    }
  }

  // =====================================================================
  // Height Sampling
  // =====================================================================

  /**
   * Get height at specific coordinates
   */
  public getHeightAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);

    if (xi < 0 || xi >= this.width - 1 || yi < 0 || yi >= this.height - 1) {
      return 0;
    }

    if (!this.cachedHeightMap) {
      return 0;
    }

    const xf = x - xi;
    const yf = y - yi;

    const idx00 = yi * this.width + xi;
    const idx10 = yi * this.width + (xi + 1);
    const idx01 = (yi + 1) * this.width + xi;
    const idx11 = (yi + 1) * this.width + (xi + 1);

    // Bilinear interpolation
    const h00 = this.cachedHeightMap[idx00];
    const h10 = this.cachedHeightMap[idx10];
    const h01 = this.cachedHeightMap[idx01];
    const h11 = this.cachedHeightMap[idx11];

    return h00 * (1 - xf) * (1 - yf) +
           h10 * xf * (1 - yf) +
           h01 * (1 - xf) * yf +
           h11 * xf * yf;
  }
}
