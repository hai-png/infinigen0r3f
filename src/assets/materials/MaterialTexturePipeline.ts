/**
 * MaterialTexturePipeline — Unified texture generation entry point
 *
 * Consolidates the three parallel procedural texture pipelines into a single
 * API that produces consistent results regardless of which backend is used:
 *
 *   1. GPU GLSL pipeline  (best quality, requires WebGL) — GLSLProceduralTextureBridge
 *   2. Canvas baking pipeline (good quality, always available) — TextureBakePipeline + ProceduralTextureGraph
 *   3. Node graph pipeline (for complex node-based materials) — NodeMaterialGenerator
 *
 * All three backends now receive the same `MaterialPBRParams` for a given
 * category, eliminating the previous divergence where each pipeline produced
 * different textures for the same category.
 *
 * Usage:
 *   const pipeline = new MaterialTexturePipeline();
 *
 *   // Let the pipeline pick the best backend
 *   const textures = await pipeline.generateTexture('metal', params);
 *
 *   // Force a specific backend
 *   pipeline.setPreferredBackend('gpu');
 *   const gpuTextures = await pipeline.generateTexture('wood', params);
 *
 *   // Fallback chain: gpu → canvas → nodegraph
 *   pipeline.setPreferredBackend('gpu');  // auto-falls back if WebGL unavailable
 */

import * as THREE from 'three';

// Backend A: Canvas-based baking
import {
  TextureBakePipeline,
  type PBRTextureSet,
  type BakeResolution,
  type MaterialPBRParams,
  type PresetBakeOptions,
} from './textures/TextureBakePipeline';

// Backend B: GPU GLSL rendering
import {
  createProceduralMaterial,
  type ProceduralMaterialParams,
  type ProceduralPBRTextures,
} from './shaders/GLSLProceduralTextureBridge';

// Backend C: Node graph based
import {
  NodeMaterialGenerator,
  type MaterialCategory as NodeMaterialCategory,
  type NodeMaterialResult,
} from './node-materials/NodeMaterialGenerator';

// ============================================================================
// Types
// ============================================================================

/** Available texture generation backends */
export type TextureBackend = 'gpu' | 'canvas' | 'nodegraph';

/** Result returned by the unified pipeline — a full PBR texture set */
export interface UnifiedPBRTextureSet {
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  metallic: THREE.DataTexture;
  ao: THREE.DataTexture;
  height: THREE.DataTexture;
  emission: THREE.DataTexture | null;
  /** Which backend was actually used to generate this set */
  backend: TextureBackend;
}

/** Configuration for the MaterialTexturePipeline */
export interface MaterialTexturePipelineConfig {
  /** Preferred backend — will fall back if unavailable (default: 'gpu') */
  preferredBackend: TextureBackend;
  /** Default texture resolution (default: 512) */
  defaultResolution: BakeResolution;
  /** Default random seed (default: 0) */
  defaultSeed: number;
  /** Whether to use category-aware procedural patterns (default: true) */
  useProcedural: boolean;
}

/** Options for a single generateTexture() call */
export interface GenerateTextureOptions {
  /** Override the preferred backend for this call only */
  backend?: TextureBackend;
  /** Texture resolution */
  resolution?: BakeResolution;
  /** Random seed */
  seed?: number;
  /** Whether to use procedural (category-aware) bake vs generic (default: true) */
  useProcedural?: boolean;
  /** Optional WebGL renderer for GPU pipeline */
  renderer?: THREE.WebGLRenderer;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MaterialTexturePipelineConfig = {
  preferredBackend: 'gpu',
  defaultResolution: 512,
  defaultSeed: 0,
  useProcedural: true,
};

/**
 * Mapping from the pipeline's category strings to the NodeMaterialGenerator's
 * MaterialCategory type. The unified pipeline accepts free-form category strings
 * (terrain, creature, nature, plant, fluid, etc.) while the node-graph backend
 * only supports a fixed set — we map to the closest match.
 */
const CATEGORY_TO_NODE_CATEGORY: Record<string, NodeMaterialCategory> = {
  wood: 'wood',
  metal: 'metal',
  stone: 'stone',
  terrain: 'stone',
  ceramic: 'ceramic',
  fabric: 'fabric',
  glass: 'glass',
  leather: 'leather',
  plastic: 'plastic',
  tile: 'tile',
  // Aliases — map to the closest node category
  nature: 'wood',
  plant: 'wood',
  creature: 'leather',
  fluid: 'glass',
};

// ============================================================================
// MaterialTexturePipeline
// ============================================================================

export class MaterialTexturePipeline {
  private config: MaterialTexturePipelineConfig;
  private canvasPipeline: TextureBakePipeline;
  private nodeGenerator: NodeMaterialGenerator;

  /** Whether a WebGL renderer was provided (enables GPU backend) */
  private gpuAvailable: boolean = false;
  private renderer: THREE.WebGLRenderer | undefined;

  constructor(config?: Partial<MaterialTexturePipelineConfig>, renderer?: THREE.WebGLRenderer) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.canvasPipeline = new TextureBakePipeline(
      this.config.defaultResolution,
      this.config.defaultSeed,
    );
    this.nodeGenerator = new NodeMaterialGenerator();
    this.renderer = renderer;
    this.gpuAvailable = !!renderer;
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Set the preferred texture generation backend.
   * The pipeline will use this backend when available, falling back
   * through the chain: gpu → canvas → nodegraph.
   */
  setPreferredBackend(backend: TextureBackend): void {
    this.config.preferredBackend = backend;
  }

  /**
   * Get the current preferred backend.
   */
  getPreferredBackend(): TextureBackend {
    return this.config.preferredBackend;
  }

  /**
   * Provide or update the WebGL renderer (enables/disables GPU backend).
   */
  setRenderer(renderer: THREE.WebGLRenderer | undefined): void {
    this.renderer = renderer;
    this.gpuAvailable = !!renderer;
  }

  /**
   * Generate a complete PBR texture set for a given material category.
   *
   * This is the single entry point for texture generation. It:
   * 1. Selects the best available backend based on preference & availability
   * 2. Passes the SAME `MaterialPBRParams` regardless of backend
   * 3. Normalizes the output into a `UnifiedPBRTextureSet`
   *
   * @param category - Material category (e.g., 'metal', 'wood', 'terrain')
   * @param params - PBR parameters — used identically by all backends
   * @param options - Per-call overrides (backend, resolution, seed, renderer)
   */
  async generateTexture(
    category: string,
    params: MaterialPBRParams,
    options?: GenerateTextureOptions,
  ): Promise<UnifiedPBRTextureSet> {
    const backend = this.selectBackend(options?.backend);
    const resolution = options?.resolution ?? this.config.defaultResolution;
    const seed = options?.seed ?? this.config.defaultSeed;
    const useProcedural = options?.useProcedural ?? this.config.useProcedural;
    const renderer = options?.renderer ?? this.renderer;

    switch (backend) {
      case 'gpu':
        return this.generateViaGPU(category, params, { resolution, seed, renderer });

      case 'nodegraph':
        return this.generateViaNodeGraph(category, params, { resolution, seed, useProcedural });

      case 'canvas':
      default:
        return this.generateViaCanvas(category, params, { resolution, seed, useProcedural });
    }
  }

  /**
   * Quick one-shot: generate a texture and return just the albedo DataTexture.
   */
  async generateAlbedo(
    category: string,
    params: MaterialPBRParams,
    options?: GenerateTextureOptions,
  ): Promise<THREE.DataTexture> {
    const set = await this.generateTexture(category, params, options);
    return set.albedo;
  }

  /**
   * Generate a full MeshPhysicalMaterial with baked PBR textures.
   * Convenience method combining generateTexture + material creation.
   */
  async generateMaterial(
    category: string,
    params: MaterialPBRParams,
    options?: GenerateTextureOptions,
  ): Promise<THREE.MeshPhysicalMaterial> {
    const textureSet = await this.generateTexture(category, params, options);
    const material = new THREE.MeshPhysicalMaterial({
      map: textureSet.albedo,
      normalMap: textureSet.normal,
      roughnessMap: textureSet.roughness,
      metalnessMap: textureSet.metallic,
      aoMap: textureSet.ao,
      bumpMap: textureSet.height,
      bumpScale: params.heightScale,
      color: params.baseColor,
      roughness: params.roughness,
      metalness: params.metallic,
      normalScale: new THREE.Vector2(params.normalStrength, params.normalStrength),
      aoMapIntensity: params.aoStrength,
    });

    if (textureSet.emission && params.emissionStrength > 0) {
      material.emissiveMap = textureSet.emission;
      material.emissive = params.emissionColor ?? new THREE.Color(1, 1, 1);
      material.emissiveIntensity = params.emissionStrength;
    }

    material.name = `MTP_${category}_${textureSet.backend}`;
    return material;
  }

  // ==========================================================================
  // Backend Selection
  // ==========================================================================

  /**
   * Select the best available backend, respecting the preference
   * and falling back through: gpu → canvas → nodegraph.
   */
  private selectBackend(requested?: TextureBackend): TextureBackend {
    const preferred = requested ?? this.config.preferredBackend;

    // GPU requires a WebGLRenderer
    if (preferred === 'gpu' && !this.gpuAvailable) {
      console.warn(
        'MaterialTexturePipeline: GPU backend requested but no WebGL renderer available. ' +
        'Falling back to canvas backend.'
      );
      return 'canvas';
    }

    return preferred;
  }

  // ==========================================================================
  // Backend A: GPU GLSL Pipeline
  // ==========================================================================

  private async generateViaGPU(
    category: string,
    params: MaterialPBRParams,
    opts: { resolution: number; seed: number; renderer?: THREE.WebGLRenderer },
  ): Promise<UnifiedPBRTextureSet> {
    const gpuParams = this.toProceduralMaterialParams(category, params, opts);

    try {
      const material = createProceduralMaterial(
        category,
        gpuParams,
        opts.renderer,
      );

      // Extract textures from the generated material
      const extractTexture = (map: THREE.Texture | null | undefined): THREE.DataTexture => {
        if (!map) {
          return this.createFallbackTexture(opts.resolution);
        }
        // If the map is already a DataTexture, return it
        if ((map as any).isDataTexture) {
          return map as THREE.DataTexture;
        }
        // For CanvasTexture or other types, we need to convert
        return this.anyTextureToDataTexture(map, opts.resolution);
      };

      const stdMat = material as THREE.MeshStandardMaterial;

      return {
        albedo: extractTexture(stdMat.map),
        normal: extractTexture(stdMat.normalMap),
        roughness: extractTexture(stdMat.roughnessMap),
        metallic: extractTexture(stdMat.metalnessMap),
        ao: extractTexture(stdMat.aoMap),
        height: extractTexture(stdMat.bumpMap),
        emission: stdMat.emissiveMap ? extractTexture(stdMat.emissiveMap) : null,
        backend: 'gpu',
      };
    } catch (err) {
      console.warn(
        'MaterialTexturePipeline: GPU pipeline failed, falling back to canvas:',
        err
      );
      return this.generateViaCanvas(category, params, {
        resolution: opts.resolution as BakeResolution,
        seed: opts.seed,
        useProcedural: true,
      });
    }
  }

  // ==========================================================================
  // Backend B: Canvas Baking Pipeline
  // ==========================================================================

  private async generateViaCanvas(
    category: string,
    params: MaterialPBRParams,
    opts: { resolution: BakeResolution; seed: number; useProcedural: boolean },
  ): Promise<UnifiedPBRTextureSet> {
    const pipeline = new TextureBakePipeline(opts.resolution, opts.seed);

    const bakeOptions: PresetBakeOptions = {
      resolution: opts.resolution,
      seed: opts.seed,
      category,
      useProcedural: opts.useProcedural,
      outputFormat: 'data',
    };

    const textureSet = pipeline.bakeFromPresetName(category, params, bakeOptions) as PBRTextureSet;

    return {
      albedo: textureSet.albedo,
      normal: textureSet.normal,
      roughness: textureSet.roughness,
      metallic: textureSet.metallic,
      ao: textureSet.ao,
      height: textureSet.height,
      emission: textureSet.emission,
      backend: 'canvas',
    };
  }

  // ==========================================================================
  // Backend C: Node Graph Pipeline
  // ==========================================================================

  private async generateViaNodeGraph(
    category: string,
    params: MaterialPBRParams,
    opts: { resolution: BakeResolution; seed: number; useProcedural: boolean },
  ): Promise<UnifiedPBRTextureSet> {
    const nodeCategory = CATEGORY_TO_NODE_CATEGORY[category] ?? 'stone';

    try {
      const result = this.nodeGenerator.generate({
        category: nodeCategory,
        color: params.baseColor.clone(),
        roughness: params.roughness,
        metalness: params.metallic,
        noiseScale: params.noiseScale,
        noiseDetail: params.noiseDetail,
        noiseDistortion: params.distortion,
        seed: opts.seed,
      });

      // Extract textures from the generated material
      const mat = result.material as THREE.MeshStandardMaterial;

      const extractTexture = (map: THREE.Texture | null | undefined): THREE.DataTexture => {
        if (!map) return this.createFallbackTexture(opts.resolution);
        return this.anyTextureToDataTexture(map, opts.resolution);
      };

      // The node-graph pipeline may not generate all PBR channels;
      // fall back to the canvas pipeline for missing ones.
      const needsFallback = !mat.map || !mat.normalMap || !mat.roughnessMap;
      if (needsFallback) {
        // Supplement with canvas-baked textures for missing channels
        const canvasSet = await this.generateViaCanvas(category, params, opts);

        return {
          albedo: mat.map ? extractTexture(mat.map) : canvasSet.albedo,
          normal: mat.normalMap ? extractTexture(mat.normalMap) : canvasSet.normal,
          roughness: mat.roughnessMap ? extractTexture(mat.roughnessMap) : canvasSet.roughness,
          metallic: mat.metalnessMap ? extractTexture(mat.metalnessMap) : canvasSet.metallic,
          ao: mat.aoMap ? extractTexture(mat.aoMap) : canvasSet.ao,
          height: mat.bumpMap ? extractTexture(mat.bumpMap) : canvasSet.height,
          emission: mat.emissiveMap ? extractTexture(mat.emissiveMap) : canvasSet.emission,
          backend: 'nodegraph',
        };
      }

      return {
        albedo: extractTexture(mat.map),
        normal: extractTexture(mat.normalMap),
        roughness: extractTexture(mat.roughnessMap),
        metallic: extractTexture(mat.metalnessMap),
        ao: extractTexture(mat.aoMap),
        height: extractTexture(mat.bumpMap),
        emission: mat.emissiveMap ? extractTexture(mat.emissiveMap) : null,
        backend: 'nodegraph',
      };
    } catch (err) {
      console.warn(
        'MaterialTexturePipeline: Node-graph pipeline failed, falling back to canvas:',
        err
      );
      return this.generateViaCanvas(category, params, opts);
    }
  }

  // ==========================================================================
  // Parameter Conversion
  // ==========================================================================

  /**
   * Convert the unified MaterialPBRParams to the GPU pipeline's ProceduralMaterialParams.
   * This ensures the GPU pipeline uses the SAME parameters as the canvas pipeline.
   */
  private toProceduralMaterialParams(
    category: string,
    params: MaterialPBRParams,
    opts: { resolution: number; seed: number; renderer?: THREE.WebGLRenderer },
  ): ProceduralMaterialParams {
    return {
      baseColor: params.baseColor.clone(),
      roughness: params.roughness,
      metallic: params.metallic,
      aoStrength: params.aoStrength,
      heightScale: params.heightScale,
      normalStrength: params.normalStrength,
      emissionColor: params.emissionColor?.clone() ?? null,
      emissionStrength: params.emissionStrength,
      resolution: opts.resolution,
      seed: opts.seed,
      animated: false,
      usePhysicalMaterial: true,
    };
  }

  // ==========================================================================
  // Utility Helpers
  // ==========================================================================

  /**
   * Convert any Three.js Texture to a DataTexture by rendering it to
   * a Float32Array. Handles CanvasTexture, VideoTexture, etc.
   */
  private anyTextureToDataTexture(texture: THREE.Texture, resolution: number): THREE.DataTexture {
    // Already a DataTexture — return as-is
    if ((texture as any).isDataTexture) {
      return texture as THREE.DataTexture;
    }

    // For non-DataTexture types, we need a renderer to read pixels.
    // If no renderer is available, return a fallback.
    if (!this.renderer) {
      return this.createFallbackTexture(resolution);
    }

    try {
      // Read the texture image data via a temporary render target
      const rt = new THREE.WebGLRenderTarget(resolution, resolution, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });

      // Set up a simple fullscreen quad to sample the texture
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quadMat = new THREE.MeshBasicMaterial({ map: texture });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
      scene.add(quad);

      this.renderer.setRenderTarget(rt);
      this.renderer.render(scene, camera);
      this.renderer.setRenderTarget(null);

      // Read pixels
      const pixels = new Float32Array(resolution * resolution * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, resolution, resolution, pixels);

      // Clean up
      rt.dispose();
      quadMat.dispose();
      quad.geometry.dispose();

      const dataTexture = new THREE.DataTexture(
        pixels,
        resolution,
        resolution,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      dataTexture.needsUpdate = true;
      dataTexture.wrapS = THREE.RepeatWrapping;
      dataTexture.wrapT = THREE.RepeatWrapping;
      return dataTexture;
    } catch {
      return this.createFallbackTexture(resolution);
    }
  }

  /**
   * Create a small neutral-gray fallback DataTexture.
   */
  private createFallbackTexture(resolution: number): THREE.DataTexture {
    const size = Math.max(1, resolution);
    const data = new Float32Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = 0.5;
      data[i * 4 + 1] = 0.5;
      data[i * 4 + 2] = 0.5;
      data[i * 4 + 3] = 1.0;
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
}

// ============================================================================
// Convenience Singleton
// ============================================================================

/** Default shared instance with no renderer (uses canvas backend) */
let defaultInstance: MaterialTexturePipeline | null = null;

/**
 * Get or create the default MaterialTexturePipeline singleton.
 * Pass a renderer to enable GPU backend.
 */
export function getMaterialTexturePipeline(renderer?: THREE.WebGLRenderer): MaterialTexturePipeline {
  if (!defaultInstance || (renderer && !defaultInstance['renderer'])) {
    defaultInstance = new MaterialTexturePipeline(undefined, renderer);
  }
  return defaultInstance;
}

/**
 * One-shot texture generation using the default pipeline instance.
 */
export async function generateProceduralTexture(
  category: string,
  params: MaterialPBRParams,
  options?: GenerateTextureOptions,
): Promise<UnifiedPBRTextureSet> {
  const pipeline = getMaterialTexturePipeline(options?.renderer);
  return pipeline.generateTexture(category, params, options);
}

export default MaterialTexturePipeline;
