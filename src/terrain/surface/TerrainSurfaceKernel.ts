/**
 * TerrainSurfaceKernel — Bridge between Node Graph Evaluation and Terrain Surface Shader Pipeline
 *
 * This is the critical missing piece that connects the node system to terrain
 * rendering, matching Infinigen's SurfaceKernel which transpiles Blender node
 * trees into C++ evaluation kernels.
 *
 * In our R3F port, we transpile node graphs into GLSL shaders that can be
 * evaluated per-vertex on the GPU for displacement and per-pixel for material
 * channel textures.
 *
 * Architecture:
 * 1. Input: A ShaderGraphDescriptor or NodeGroup from the node system
 * 2. Transpilation: Convert the node graph to GLSL shader code via GLSLShaderComposer
 * 3. Evaluation:
 *    - For SDFPerturb: evaluate displacement as SDF modification before meshing
 *    - For Displacement: evaluate displacement per-vertex after meshing
 *    - For Material: evaluate per-pixel for PBR texture channels
 *
 * The SDF perturbation formula is:
 *   modified_sdf = original_sdf - displacement_value * scale
 *
 * This ensures that positive displacement pushes the surface inward (into the
 * SDF volume), matching Infinigen's convention where displacement subtracts
 * from the SDF to create surface detail.
 *
 * @module terrain/surface
 */

import * as THREE from 'three';
import {
  MaterialChannel,
  DisplacementMode,
  ShaderGraphContext,
  SurfaceKernelConfig,
  DEFAULT_SURFACE_KERNEL_CONFIG,
} from '@/terrain/surface/SurfaceKernelPipeline';
import {
  SurfaceTemplate,
  SurfaceType,
  SurfaceDisplacementConfig,
  getEffectiveSurfaceType,
} from '@/terrain/surface/SurfaceRegistry';
import {
  ShaderGraphDescriptor,
  ShaderGraphType,
} from '@/terrain/surface/ShaderGraphSurfaceBridge';
import {
  GLSLShaderComposer,
  ComposedShader,
  type ShaderGraph,
  type ComposableNode,
} from '@/core/nodes/execution/glsl/GLSLShaderComposer';
import { NodeGroup } from '@/core/nodes/core/NodeGeometryModifierBridge';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the TerrainSurfaceKernel.
 *
 * Controls displacement mode, scale, which PBR channels to generate,
 * and parameters for SDF perturbation and vertex displacement.
 */
export interface TerrainSurfaceKernelConfig {
  /** Displacement evaluation mode */
  displacementMode: 'sdf_perturb' | 'vertex' | 'texture';
  /** Global scale multiplier for displacement values */
  displacementScale: number;
  /** Mid-level for displacement (0.0 = displace inward only, 0.5 = both, 1.0 = outward only) */
  displacementMidLevel: number;
  /** Which PBR material channels to generate textures for */
  materialChannels: MaterialChannel[];
  /** Texture resolution for baked material channels (power-of-2 recommended) */
  textureResolution: number;
  /** Epsilon for finite-difference normal computation */
  normalEpsilon: number;
  /** Noise seed for deterministic procedural generation */
  seed: number;
}

/**
 * Default configuration for the TerrainSurfaceKernel.
 */
export const DEFAULT_TERRAIN_SURFACE_KERNEL_CONFIG: TerrainSurfaceKernelConfig = {
  displacementMode: 'vertex',
  displacementScale: 1.0,
  displacementMidLevel: 0.0,
  materialChannels: [
    MaterialChannel.ALBEDO,
    MaterialChannel.NORMAL,
    MaterialChannel.ROUGHNESS,
    MaterialChannel.AO,
  ],
  textureResolution: 512,
  normalEpsilon: 0.01,
  seed: 42,
};

// ============================================================================
// SurfaceEvaluationContext
// ============================================================================

/**
 * Per-vertex context provided to shader graph evaluation.
 *
 * Contains world-space position, normal, UV, and terrain-specific
 * attributes that shader graphs can sample from. This extends the
 * base ShaderGraphContext with terrain-specific fields like slope,
 * height, cave distance, and water distance.
 */
export interface SurfaceEvaluationContext {
  /** World-space position of the evaluation point */
  position: THREE.Vector3;
  /** World-space surface normal at the evaluation point */
  normal: THREE.Vector3;
  /** UV coordinates at the evaluation point (if available) */
  uv: THREE.Vector2;
  /** Material ID from element evaluation */
  materialId: number;
  /** Element tag identifier for surface selection */
  elementTag: number;
  /** Slope angle in radians (0 = flat, PI/2 = vertical cliff) */
  slope: number;
  /** World-space height (Y coordinate) of the evaluation point */
  height: number;
  /** Signed distance to nearest cave boundary (negative = inside cave) */
  caveDistance: number;
  /** Distance to nearest water surface */
  waterDistance: number;
}

// ============================================================================
// ComposedShader Helpers
// ============================================================================

/**
 * Result of transpiling a shader graph to GLSL for terrain evaluation.
 *
 * Contains both the composed shader and metadata about the transpilation,
 * including any warnings or errors encountered.
 */
export interface TerrainComposedShader extends ComposedShader {
  /** Whether this shader was generated from a valid node graph */
  graphValid: boolean;
  /** The original graph type that was transpiled */
  graphType: ShaderGraphType | 'unknown';
  /** Whether the transpilation fell back to CPU noise */
  usedFallback: boolean;
}

// ============================================================================
// TerrainSurfaceKernel
// ============================================================================

/**
 * Bridges the node graph evaluation system with the terrain surface shader
 * pipeline, matching Infinigen's SurfaceKernel which transpiles Blender node
 * trees into C++ evaluation kernels.
 *
 * In our R3F port, this kernel:
 * 1. Accepts a ShaderGraphDescriptor or NodeGroup as input
 * 2. Transpiles the node graph to GLSL shader code via GLSLShaderComposer
 * 3. Evaluates the transpiled shader for:
 *    - SDF Perturbation: modifies SDF grid before marching cubes meshing
 *    - Vertex Displacement: displaces vertices along normals after meshing
 *    - Material Channel Generation: produces per-pixel PBR texture data
 * 4. Integrates with the SurfaceRegistry to apply surface templates
 *
 * All methods are deterministic for a given seed.
 *
 * Usage:
 * ```typescript
 * const kernel = new TerrainSurfaceKernel(config);
 *
 * // SDF perturbation before meshing
 * const modifiedSDF = kernel.applySDFPerturbation(sdfGrid, [64, 64, 64], bounds);
 *
 * // Vertex displacement after meshing
 * const displacedGeom = kernel.applyVertexDisplacement(geometry, mesh);
 *
 * // Material channel generation
 * const channels = kernel.generateMaterialChannels(geometry);
 *
 * // Surface template integration
 * const resultGeom = kernel.applySurfaceTemplate(template, geometry, selection);
 * ```
 */
export class TerrainSurfaceKernel {
  /** Kernel configuration */
  private config: TerrainSurfaceKernelConfig;
  /** Noise utility instance (seeded for determinism) */
  private noise: NoiseUtils;
  /** Seeded random number generator */
  private rng: SeededRandom;
  /** Whether this kernel has been disposed */
  private disposed: boolean = false;
  /** Cache of composed shaders keyed by graph descriptor hash */
  private shaderCache: Map<string, TerrainComposedShader>;
  /** Cache of material channel textures */
  private textureCache: Map<string, THREE.DataTexture>;

  /**
   * Create a new TerrainSurfaceKernel.
   *
   * @param config - Configuration (defaults to DEFAULT_TERRAIN_SURFACE_KERNEL_CONFIG)
   */
  constructor(config: Partial<TerrainSurfaceKernelConfig> = {}) {
    this.config = { ...DEFAULT_TERRAIN_SURFACE_KERNEL_CONFIG, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
    this.shaderCache = new Map();
    this.textureCache = new Map();
  }

  // ==========================================================================
  // SDF Perturbation
  // ==========================================================================

  /**
   * Apply SDF perturbation to a signed distance field grid.
   *
   * This is the most important mode — it matches Infinigen's SDFPerturb
   * surface type. For each grid point in the SDF volume, the kernel
   * evaluates the displacement shader graph and subtracts the result
   * from the SDF value. This must be called BEFORE marching cubes meshing.
   *
   * The formula is:
   *   modified_sdf[i] = original_sdf[i] - displacement_value * scale
   *
   * Negative displacement pushes the surface inward (into the SDF volume),
   * creating indentations like cracks, crevices, and rocky detail.
   * Positive displacement pushes the surface outward.
   *
   * @param sdfGrid - The original SDF grid as a flat Float32Array.
   *   The grid is stored in XYZ-major order with dimensions
   *   [dimX * dimY * dimZ].
   * @param gridDimensions - The dimensions of the SDF grid [dimX, dimY, dimZ].
   * @param bounds - The axis-aligned bounding box of the SDF volume in
   *   world space. Grid points are mapped to world positions via linear
   *   interpolation within this box.
   * @param displacementGraph - Optional shader graph descriptor for computing
   *   displacement values. If not provided, falls back to noise-based
   *   displacement using the kernel's seeded noise generator.
   * @returns A new Float32Array containing the modified SDF values. The
   *   original sdfGrid is NOT modified.
   */
  applySDFPerturbation(
    sdfGrid: Float32Array,
    gridDimensions: [number, number, number],
    bounds: THREE.Box3,
    displacementGraph?: ShaderGraphDescriptor,
  ): Float32Array {
    const [dimX, dimY, dimZ] = gridDimensions;
    const totalPoints = dimX * dimY * dimZ;

    if (sdfGrid.length < totalPoints) {
      console.warn(
        '[TerrainSurfaceKernel] SDF grid size mismatch: expected',
        totalPoints,
        'got',
        sdfGrid.length,
      );
      return new Float32Array(sdfGrid);
    }

    const result = new Float32Array(sdfGrid);

    // Compute world-space step sizes for grid traversal
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const stepX = dimX > 1 ? size.x / (dimX - 1) : 0;
    const stepY = dimY > 1 ? size.y / (dimY - 1) : 0;
    const stepZ = dimZ > 1 ? size.z / (dimZ - 1) : 0;

    // Try to evaluate via node group if available
    let nodeGroupInstance: any = null;
    if (displacementGraph?.nodeGroup) {
      try {
        nodeGroupInstance = displacementGraph.nodeGroup.instantiate();
      } catch (err) {
        console.warn(
          '[TerrainSurfaceKernel] Failed to instantiate displacement node group, using noise fallback:',
          err,
        );
        nodeGroupInstance = null;
      }
    }

    // Evaluate displacement at each grid point
    for (let iz = 0; iz < dimZ; iz++) {
      for (let iy = 0; iy < dimY; iy++) {
        for (let ix = 0; ix < dimX; ix++) {
          const gridIndex = ix + iy * dimX + iz * dimX * dimY;

          // Map grid coordinates to world-space position
          const worldX = bounds.min.x + ix * stepX;
          const worldY = bounds.min.y + iy * stepY;
          const worldZ = bounds.min.z + iz * stepZ;

          const position = new THREE.Vector3(worldX, worldY, worldZ);

          // Compute displacement at this grid point
          let displacement: number;

          if (nodeGroupInstance) {
            displacement = this.evaluateDisplacementAtPoint(
              position,
              nodeGroupInstance,
              displacementGraph!,
            );
          } else if (displacementGraph) {
            displacement = this.evaluateGraphTypeDisplacement(
              position,
              displacementGraph,
            );
          } else {
            displacement = this.computeFallbackDisplacement(position);
          }

          // Apply SDF perturbation formula:
          // modified_sdf = original_sdf - displacement * scale
          result[gridIndex] = sdfGrid[gridIndex] - displacement * this.config.displacementScale;
        }
      }
    }

    return result;
  }

  // ==========================================================================
  // Vertex Displacement
  // ==========================================================================

  /**
   * Apply vertex displacement to a geometry.
   *
   * For each vertex in the geometry, builds a SurfaceEvaluationContext
   * and evaluates the displacement shader graph. The vertex is then
   * displaced along its normal by the computed amount.
   *
   * After displacement, vertex normals are recomputed for correct lighting.
   *
   * @param geometry - The input BufferGeometry to displace.
   * @param mesh - The mesh containing the geometry (used for world transform
   *   if needed). Can be a default mesh if world transform is identity.
   * @param displacementGraph - Optional shader graph descriptor for computing
   *   displacement values. If not provided, falls back to noise-based
   *   displacement.
   * @returns A new THREE.BufferGeometry with displaced vertices. The
   *   original geometry is NOT modified.
   */
  applyVertexDisplacement(
    geometry: THREE.BufferGeometry,
    mesh: THREE.Mesh,
    displacementGraph?: ShaderGraphDescriptor,
  ): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');

    if (!posAttr) {
      console.warn('[TerrainSurfaceKernel] No position attribute on geometry');
      return geometry.clone();
    }

    const vertexCount = posAttr.count;
    const posArray = new Float32Array(posAttr.array as Float32Array);

    // Ensure normals exist
    let normalArray: Float32Array;
    if (normAttr) {
      normalArray = new Float32Array(normAttr.array as Float32Array);
    } else {
      geometry.computeVertexNormals();
      const computedNormals = geometry.getAttribute('normal');
      normalArray = computedNormals
        ? new Float32Array(computedNormals.array as Float32Array)
        : new Float32Array(vertexCount * 3);
      // Default normals pointing up
      if (!computedNormals) {
        for (let i = 0; i < vertexCount; i++) {
          normalArray[i * 3] = 0;
          normalArray[i * 3 + 1] = 1;
          normalArray[i * 3 + 2] = 0;
        }
      }
    }

    // Try to evaluate via node group if available
    let nodeGroupInstance: any = null;
    if (displacementGraph?.nodeGroup) {
      try {
        nodeGroupInstance = displacementGraph.nodeGroup.instantiate();
      } catch {
        nodeGroupInstance = null;
      }
    }

    // Evaluate displacement per-vertex
    const displacementValues = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const px = posArray[i * 3];
      const py = posArray[i * 3 + 1];
      const pz = posArray[i * 3 + 2];
      const position = new THREE.Vector3(px, py, pz);

      let displacement: number;

      if (nodeGroupInstance) {
        displacement = this.evaluateDisplacementAtPoint(
          position,
          nodeGroupInstance,
          displacementGraph!,
        );
      } else if (displacementGraph) {
        displacement = this.evaluateGraphTypeDisplacement(position, displacementGraph);
      } else {
        displacement = this.computeFallbackDisplacement(position);
      }

      displacementValues[i] = displacement;
    }

    // Apply displacement along normals with mid-level adjustment
    const scale = this.config.displacementScale;
    const midLevel = this.config.displacementMidLevel;

    for (let i = 0; i < vertexCount; i++) {
      const disp = (displacementValues[i] - midLevel) * scale;
      const nx = normalArray[i * 3];
      const ny = normalArray[i * 3 + 1];
      const nz = normalArray[i * 3 + 2];

      posArray[i * 3] += nx * disp;
      posArray[i * 3 + 1] += ny * disp;
      posArray[i * 3 + 2] += nz * disp;
    }

    // Build result geometry
    const result = geometry.clone();
    const resultPosAttr = result.getAttribute('position') as THREE.BufferAttribute;
    (resultPosAttr.array as Float32Array).set(posArray);
    resultPosAttr.needsUpdate = true;

    // Store displacement values as a vertex attribute for later use
    result.setAttribute(
      'displacement',
      new THREE.BufferAttribute(displacementValues.slice(), 1),
    );

    // Recompute normals after displacement
    result.computeVertexNormals();
    result.computeBoundingSphere();
    result.computeBoundingBox();

    return result;
  }

  // ==========================================================================
  // Material Channel Generation
  // ==========================================================================

  /**
   * Generate PBR material channel textures for a geometry.
   *
   * For each requested material channel (albedo, normal, roughness, metallic,
   * AO, height), creates a DataTexture at the configured resolution by
   * evaluating the material shader graph at each texel.
   *
   * If a shader graph is provided and the GLSLShaderComposer is available,
   * the graph is transpiled to GLSL and used for GPU-accelerated evaluation.
   * Otherwise, falls back to CPU-based noise evaluation.
   *
   * @param geometry - The geometry to generate materials for (used for
   *   position/normal/UV bounds if available).
   * @param materialGraph - Optional shader graph descriptor for computing
   *   material channel values.
   * @returns A Map of MaterialChannel to THREE.DataTexture, one per
   *   requested channel.
   */
  generateMaterialChannels(
    geometry: THREE.BufferGeometry,
    materialGraph?: ShaderGraphDescriptor,
  ): Map<MaterialChannel, THREE.DataTexture> {
    const channels = new Map<MaterialChannel, THREE.DataTexture>();

    for (const channel of this.config.materialChannels) {
      try {
        const texture = this.generateChannelTexture(geometry, channel, materialGraph);
        if (texture) {
          channels.set(channel, texture);
        }
      } catch (err) {
        console.warn(
          `[TerrainSurfaceKernel] Failed to generate ${channel} texture:`,
          err,
        );
      }
    }

    return channels;
  }

  /**
   * Generate a single material channel texture.
   *
   * Creates a DataTexture at the configured resolution by evaluating
   * the material shader graph or falling back to noise-based generation.
   *
   * @param geometry - Source geometry for bounds info
   * @param channel - Which material channel to generate
   * @param graph - Optional shader graph descriptor
   * @returns THREE.DataTexture for the channel, or null on failure
   */
  private generateChannelTexture(
    geometry: THREE.BufferGeometry,
    channel: MaterialChannel,
    graph?: ShaderGraphDescriptor,
  ): THREE.DataTexture | null {
    const size = this.config.textureResolution;
    const data = new Float32Array(size * size * 4);

    // Compute geometry bounds for UV-to-world mapping
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox ?? new THREE.Box3();
    const bboxSize = new THREE.Vector3();
    bbox.getSize(bboxSize);

    // Try GLSL composer approach first
    if (graph) {
      try {
        return this.generateChannelTextureFromGraph(graph, channel, size);
      } catch (err) {
        console.warn(
          `[TerrainSurfaceKernel] Graph-based texture generation failed for ${channel}, using noise fallback:`,
          err,
        );
      }
    }

    // Fallback: CPU-based noise texture generation
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Map UV to approximate world position using geometry bounds
        const worldX = bbox.min.x + u * bboxSize.x;
        const worldY = bbox.min.y + v * bboxSize.y;
        const worldZ = 0;

        const n = this.noise.fbm(worldX * 5, worldY * 5, worldZ * 5, 4);
        this.writeChannelPixel(data, idx, n, channel);
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generate a channel texture from a shader graph descriptor.
   *
   * Uses the graph's type and parameters to compute channel values
   * at each texel position.
   *
   * @param graph - The shader graph descriptor
   * @param channel - Which material channel to generate
   * @param size - Texture resolution
   * @returns THREE.DataTexture
   */
  private generateChannelTextureFromGraph(
    graph: ShaderGraphDescriptor,
    channel: MaterialChannel,
    size: number,
  ): THREE.DataTexture {
    const data = new Float32Array(size * size * 4);
    const params = graph.parameters;
    const scale = params.scale ?? 5.0;
    const detail = Math.round(params.detail ?? 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const vCoord = y / size;

        let n: number;
        switch (graph.type) {
          case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT: {
            const vScale = params.voronoiScale ?? scale * 3;
            const vn = this.noise.perlin(u * vScale, vCoord * vScale, 0);
            n = 1.0 - Math.abs(vn);
            break;
          }
          case ShaderGraphType.LAYERED_BLEND: {
            const base = this.noise.fbm(u * scale, vCoord * scale, 0, detail);
            const detailN = this.noise.fbm(u * scale * 3, vCoord * scale * 3, 0, Math.max(1, detail - 1));
            const blend = params.layerBlend ?? 0.3;
            n = base * (1 - blend) + detailN * blend;
            break;
          }
          case ShaderGraphType.ALTITUDE_BLEND: {
            const baseDisp = this.noise.fbm(u * scale, 0, vCoord * scale, detail);
            const altitudeFactor = Math.max(0, Math.min(1, vCoord / (params.altitudeRange ?? 1)));
            n = baseDisp * (0.3 + 0.7 * altitudeFactor);
            break;
          }
          default: {
            n = this.noise.fbm(u * scale, vCoord * scale, 0, detail);
            break;
          }
        }

        this.writeChannelPixel(data, idx, n, channel);
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Write a single pixel for a material channel into a data array.
   *
   * @param data - The flat Float32Array to write into
   * @param idx - The starting index (pixel * 4)
   * @param noiseValue - The noise value to convert to a channel pixel
   * @param channel - Which material channel this pixel is for
   */
  private writeChannelPixel(
    data: Float32Array,
    idx: number,
    noiseValue: number,
    channel: MaterialChannel,
  ): void {
    switch (channel) {
      case MaterialChannel.ALBEDO: {
        const t = (noiseValue + 1) * 0.5;
        if (t < 0.3) {
          // Sand
          data[idx] = 0.76; data[idx + 1] = 0.72; data[idx + 2] = 0.48;
        } else if (t < 0.5) {
          // Grass
          data[idx] = 0.29; data[idx + 1] = 0.55; data[idx + 2] = 0.19;
        } else if (t < 0.7) {
          // Rock
          data[idx] = 0.48; data[idx + 1] = 0.43; data[idx + 2] = 0.38;
        } else {
          // Snow
          data[idx] = 0.91; data[idx + 1] = 0.93; data[idx + 2] = 0.96;
        }
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.NORMAL: {
        // Flat normal (0.5, 0.5, 1.0) with subtle noise perturbation
        data[idx] = 0.5 + noiseValue * 0.05;
        data[idx + 1] = 0.5 + noiseValue * 0.05;
        data[idx + 2] = 1.0;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.ROUGHNESS: {
        const roughness = Math.max(0, Math.min(1, 0.5 + noiseValue * 0.35));
        data[idx] = roughness; data[idx + 1] = roughness; data[idx + 2] = roughness;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.METALLIC: {
        const metallic = Math.max(0, noiseValue * 0.1);
        data[idx] = metallic; data[idx + 1] = metallic; data[idx + 2] = metallic;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.AO: {
        const ao = Math.max(0, Math.min(1, 0.8 + noiseValue * 0.2));
        data[idx] = ao; data[idx + 1] = ao; data[idx + 2] = ao;
        data[idx + 3] = 1.0;
        break;
      }
      case MaterialChannel.HEIGHT: {
        const height = Math.max(0, Math.min(1, (noiseValue + 1) * 0.5));
        data[idx] = height; data[idx + 1] = height; data[idx + 2] = height;
        data[idx + 3] = 1.0;
        break;
      }
    }
  }

  // ==========================================================================
  // GLSL Transpilation
  // ==========================================================================

  /**
   * Transpile a shader graph descriptor to GLSL shader code.
   *
   * Uses the GLSLShaderComposer to convert a ShaderGraphDescriptor or
   * NodeGroup into a ComposedShader containing vertex and fragment shader
   * source code plus uniform definitions.
   *
   * The composed shader takes Position, Normal, and UV as vertex attributes
   * and outputs either a displacement value (float) or a material channel
   * value (vec4) depending on the graph's purpose.
   *
   * If the GLSLShaderComposer is not available or the graph cannot be
   * transpiled, returns a fallback shader with appropriate metadata.
   *
   * @param graph - The shader graph descriptor to transpile
   * @returns A TerrainComposedShader containing the GLSL code and metadata
   */
  transpileToGLSL(graph: ShaderGraphDescriptor): TerrainComposedShader {
    // Check cache first
    const cacheKey = this.computeGraphCacheKey(graph);
    const cached = this.shaderCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Try to use GLSLShaderComposer
    try {
      const shaderGraph = this.convertDescriptorToShaderGraph(graph);
      if (shaderGraph) {
        const composer = new GLSLShaderComposer();
        const composed = composer.compose(shaderGraph);

        const result: TerrainComposedShader = {
          ...composed,
          graphValid: composed.errors.length === 0,
          graphType: graph.type,
          usedFallback: false,
        };

        this.shaderCache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      console.warn(
        '[TerrainSurfaceKernel] GLSL transpilation failed, generating fallback shader:',
        err,
      );
    }

    // Fallback: generate a simple noise-based displacement shader
    const result = this.generateFallbackShader(graph);
    this.shaderCache.set(cacheKey, result);
    return result;
  }

  /**
   * Convert a ShaderGraphDescriptor to a ShaderGraph that the
   * GLSLShaderComposer can process.
   *
   * This bridges the ShaderGraphDescriptor's node group or parameter-based
   * representation into the ComposableNode format that the composer expects.
   *
   * @param graph - The shader graph descriptor to convert
   * @returns A ShaderGraph suitable for the composer, or null if conversion
   *   is not possible
   */
  private convertDescriptorToShaderGraph(graph: ShaderGraphDescriptor): ShaderGraph | null {
    if (!graph.nodeGroup) {
      // Cannot convert a parameter-only descriptor to a composable graph
      return null;
    }

    const nodes = new Map<string, ComposableNode>();
    const links: import('@/core/nodes/core/types').NodeLink[] = [];

    // Convert the NodeGroup's internal nodes to ComposableNodes
    for (let i = 0; i < graph.nodeGroup.internalNodes.length; i++) {
      const nodeDef = graph.nodeGroup.internalNodes[i];
      const nodeId = `node_${i}`;

      const inputs = new Map<string, { type: string; value?: any; connectedLinks: string[] }>();
      const outputs = new Map<string, { type: string; value?: any; connectedLinks: string[] }>();

      // Convert inputs
      if (nodeDef.inputs) {
        for (const input of nodeDef.inputs) {
          inputs.set(input.name, {
            type: input.type ?? 'FLOAT',
            value: input.defaultValue,
            connectedLinks: [],
          });
        }
      }

      // Convert outputs
      if (nodeDef.outputs) {
        for (const output of nodeDef.outputs) {
          outputs.set(output.name, {
            type: output.type ?? 'FLOAT',
            value: output.defaultValue,
            connectedLinks: [],
          });
        }
      }

      // Extract settings from properties
      const settings: Record<string, any> = {};
      if (nodeDef.properties) {
        for (const [key, value] of Object.entries(nodeDef.properties)) {
          settings[key] = value;
        }
      }

      // Add graph parameters as settings
      for (const [key, value] of Object.entries(graph.parameters)) {
        settings[key] = value;
      }

      const composableNode: ComposableNode = {
        id: nodeId,
        type: nodeDef.type ?? 'UnknownNode',
        name: nodeDef.properties?.label ?? `Node_${i}`,
        inputs,
        outputs,
        settings,
      };

      nodes.set(nodeId, composableNode);
    }

    // Convert internal links
    if (graph.nodeGroup.internalLinks) {
      for (const link of graph.nodeGroup.internalLinks) {
        links.push(link);
      }
    }

    return { nodes, links };
  }

  /**
   * Generate a fallback GLSL shader for terrain displacement when
   * the GLSLShaderComposer cannot process the graph.
   *
   * The fallback shader uses simple FBM noise for displacement.
   *
   * @param graph - The original graph descriptor (for parameter extraction)
   * @returns A TerrainComposedShader with a noise-based fallback
   */
  private generateFallbackShader(graph: ShaderGraphDescriptor): TerrainComposedShader {
    const params = graph.parameters;
    const scale = params.scale ?? 5.0;
    const octaves = Math.round(params.detail ?? params.octaves ?? 4);
    const amplitude = params.amplitude ?? 1.0;

    const vertexShader = `#version 300 es
precision highp float;
precision highp int;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPosition;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vPosition = position;
  vNormal = normalize(normalMatrix * normal);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

    const fragmentShader = `#version 300 es
precision highp float;
precision highp int;

in vec3 vPosition;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPosition;

out vec4 fragColor;

uniform float u_scale;
uniform int u_octaves;
uniform float u_amplitude;
uniform float u_seed;
uniform float u_time;

// Simple hash for noise
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Value noise
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// FBM
float fbm(vec3 p, int oct) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 pos = vWorldPosition * ${scale.toFixed(6)};
  float n = fbm(pos + vec3(u_seed), ${octaves});
  n = (n - 0.5) * 2.0 * ${amplitude.toFixed(6)};
  fragColor = vec4(n, n, n, 1.0);
}
`;

    return {
      vertexShader,
      fragmentShader,
      uniforms: {
        u_scale: { value: scale },
        u_octaves: { value: octaves },
        u_amplitude: { value: amplitude },
        u_seed: { value: this.config.seed * 0.001 },
        u_time: { value: 0 },
      },
      warnings: ['Fallback shader generated — GLSLShaderComposer was not available'],
      errors: [],
      graphValid: true,
      graphType: graph.type,
      usedFallback: true,
    };
  }

  // ==========================================================================
  // Surface Template Integration
  // ==========================================================================

  /**
   * Apply a SurfaceTemplate to a geometry.
   *
   * This method integrates with the SurfaceRegistry system to apply
   * a sampled surface template to terrain geometry. It handles:
   *
   * 1. If template.surfaceType is SDFPerturb: applies SDF perturbation
   *    using the template's displacement configuration
   * 2. If template.surfaceType is Displacement: applies vertex displacement
   *    using the template's displacement configuration
   * 3. If template.surfaceType is BlenderDisplacement: treated as Displacement
   *    in the R3F port
   *
   * After displacement, the template's material parameters are stored
   * as vertex attributes on the geometry for use by the material system.
   *
   * @param template - The SurfaceTemplate to apply
   * @param geometry - The terrain geometry to modify
   * @param selection - Optional per-vertex selection mask (Float32Array).
   *   Values in [0, 1] control the blend strength of the surface template
   *   at each vertex. If not provided, the template is applied uniformly.
   * @returns A new THREE.BufferGeometry with the surface template applied
   */
  applySurfaceTemplate(
    template: SurfaceTemplate,
    geometry: THREE.BufferGeometry,
    selection?: Float32Array,
  ): THREE.BufferGeometry {
    const effectiveType = getEffectiveSurfaceType(template.surfaceType);
    const displacementConfig = template.displacement;

    let result = geometry.clone();

    // Apply displacement based on surface type
    if (displacementConfig) {
      if (effectiveType === SurfaceType.SDFPerturb) {
        // For SDFPerturb, we need an SDF grid — but if we only have
        // mesh geometry, fall back to vertex displacement with the
        // SDF perturbation formula applied to the displacement values
        result = this.applyTemplateVertexDisplacement(
          result,
          displacementConfig,
          selection,
          true, // sdfPerturb mode
        );
      } else if (effectiveType === SurfaceType.Displacement || effectiveType === SurfaceType.BlenderDisplacement) {
        result = this.applyTemplateVertexDisplacement(
          result,
          displacementConfig,
          selection,
          false, // regular displacement mode
        );
      }
    }

    // Store material parameters as vertex attributes for the material system
    const posAttr = result.getAttribute('position');
    if (posAttr) {
      const vertexCount = posAttr.count;

      // Store material ID from template
      const materialIdAttr = result.getAttribute('materialId') as THREE.BufferAttribute | undefined;
      if (!materialIdAttr) {
        const materialIds = new Float32Array(vertexCount);
        // Use a hash of the template ID as the material ID
        let materialIdHash = 0;
        for (let i = 0; i < template.id.length; i++) {
          materialIdHash = ((materialIdHash << 5) - materialIdHash + template.id.charCodeAt(i)) | 0;
        }
        materialIds.fill(Math.abs(materialIdHash) % 1000);
        result.setAttribute('materialId', new THREE.BufferAttribute(materialIds, 1));
      }

      // Store roughness from template params
      const roughnessArray = new Float32Array(vertexCount);
      roughnessArray.fill(template.params.roughness);
      result.setAttribute('surfaceRoughness', new THREE.BufferAttribute(roughnessArray, 1));

      // Store metalness from template params
      const metalnessArray = new Float32Array(vertexCount);
      metalnessArray.fill(template.params.metalness);
      result.setAttribute('surfaceMetalness', new THREE.BufferAttribute(metalnessArray, 1));
    }

    return result;
  }

  /**
   * Apply vertex displacement using a SurfaceDisplacementConfig.
   *
   * Evaluates multi-octave FBM noise with the displacement configuration's
   * parameters at each vertex position, then displaces the vertex along
   * its normal.
   *
   * @param geometry - The geometry to displace
   * @param config - Displacement configuration from the surface template
   * @param selection - Optional per-vertex selection mask
   * @param sdfPerturb - If true, uses SDF perturbation convention
   *   (negative displacement = pushing surface inward)
   * @returns A new BufferGeometry with displaced vertices
   */
  private applyTemplateVertexDisplacement(
    geometry: THREE.BufferGeometry,
    config: SurfaceDisplacementConfig,
    selection: Float32Array | undefined,
    sdfPerturb: boolean,
  ): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');

    if (!posAttr) return geometry.clone();

    const vertexCount = posAttr.count;
    const posArray = new Float32Array(posAttr.array as Float32Array);

    // Ensure normals exist
    let normalArray: Float32Array;
    if (normAttr) {
      normalArray = new Float32Array(normAttr.array as Float32Array);
    } else {
      geometry.computeVertexNormals();
      const computedNormals = geometry.getAttribute('normal');
      normalArray = computedNormals
        ? new Float32Array(computedNormals.array as Float32Array)
        : new Float32Array(vertexCount * 3);
      if (!computedNormals) {
        for (let i = 0; i < vertexCount; i++) {
          normalArray[i * 3] = 0;
          normalArray[i * 3 + 1] = 1;
          normalArray[i * 3 + 2] = 0;
        }
      }
    }

    const { amplitude, frequency, octaves, lacunarity, persistence } = config;

    // Evaluate displacement per-vertex using template's noise configuration
    for (let i = 0; i < vertexCount; i++) {
      const px = posArray[i * 3];
      const py = posArray[i * 3 + 1];
      const pz = posArray[i * 3 + 2];

      // Multi-octave displacement noise
      let displacement = 0;
      let amp = amplitude;
      let freq = frequency;

      for (let o = 0; o < octaves; o++) {
        displacement += this.noise.fbm(
          px * freq,
          py * freq,
          pz * freq,
          1,
        ) * amp;
        amp *= persistence;
        freq *= lacunarity;
      }

      // Apply selection mask if provided
      if (selection && i < selection.length) {
        displacement *= selection[i];
      }

      // In SDF perturb mode, displacement convention is:
      // negative displacement = pushing surface inward
      // For vertex displacement, we just apply along the normal
      const scale = sdfPerturb
        ? -this.config.displacementScale  // Invert for SDF perturb convention
        : this.config.displacementScale;
      const disp = displacement * scale;

      const nx = normalArray[i * 3];
      const ny = normalArray[i * 3 + 1];
      const nz = normalArray[i * 3 + 2];

      posArray[i * 3] += nx * disp;
      posArray[i * 3 + 1] += ny * disp;
      posArray[i * 3 + 2] += nz * disp;
    }

    // Build result geometry
    const result = geometry.clone();
    const resultPosAttr = result.getAttribute('position') as THREE.BufferAttribute;
    (resultPosAttr.array as Float32Array).set(posArray);
    resultPosAttr.needsUpdate = true;

    // Recompute normals after displacement
    result.computeVertexNormals();
    result.computeBoundingSphere();
    result.computeBoundingBox();

    return result;
  }

  // ==========================================================================
  // Displacement Evaluation Helpers
  // ==========================================================================

  /**
   * Evaluate displacement at a single point using a NodeGroup instance.
   *
   * Sets the point's position, normal, and UV as inputs on the node
   * group instance, then evaluates and reads the Displacement output.
   *
   * @param position - World-space position to evaluate at
   * @param instance - The NodeGroupInstance to evaluate
   * @param graph - The shader graph descriptor (for additional parameters)
   * @returns The displacement value at the given point
   */
  private evaluateDisplacementAtPoint(
    position: THREE.Vector3,
    instance: any,
    graph: ShaderGraphDescriptor,
  ): number {
    try {
      // Set inputs on the instance from graph parameters + context
      for (const [key, value] of Object.entries(graph.parameters)) {
        instance.setInput(key, value);
      }
      instance.setInput('Position', position);
      instance.setInput('Strength', this.config.displacementScale);
      instance.setInput('MidLevel', this.config.displacementMidLevel);

      const outputs = instance.evaluate();
      const dispValue = outputs.get('Displacement') ?? outputs.get('Value');

      if (typeof dispValue === 'number' && isFinite(dispValue)) {
        return dispValue;
      }

      return this.computeFallbackDisplacement(position);
    } catch {
      return this.computeFallbackDisplacement(position);
    }
  }

  /**
   * Evaluate displacement at a single point using the graph's type
   * descriptor and parameters (when no NodeGroup is available).
   *
   * @param position - World-space position to evaluate at
   * @param graph - The shader graph descriptor
   * @returns The displacement value at the given point
   */
  private evaluateGraphTypeDisplacement(
    position: THREE.Vector3,
    graph: ShaderGraphDescriptor,
  ): number {
    const params = graph.parameters;
    const scale = params.scale ?? 0.05;
    const octaves = Math.round(params.detail ?? params.octaves ?? 4);
    const lacunarity = params.lacunarity ?? 2.0;
    const amplitude = params.amplitude ?? 1.0;

    switch (graph.type) {
      case ShaderGraphType.NOISE_DISPLACEMENT: {
        const n = this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
        return n * amplitude;
      }

      case ShaderGraphType.VORONOI_CRACK_DISPLACEMENT: {
        const voronoiScale = params.voronoiScale ?? scale * 3;
        const n = this.noise.perlin(
          position.x * voronoiScale,
          position.y * voronoiScale,
          position.z * voronoiScale,
        );
        const crackFactor = 1.0 - Math.abs(n);
        return crackFactor * (params.crackDepth ?? 0.5);
      }

      case ShaderGraphType.LAYERED_BLEND: {
        const baseFreq = scale;
        const baseAmp = amplitude;
        let value = 0;
        let amp = baseAmp;
        let freq = baseFreq;
        const layers = Math.round(params.layers ?? 3);

        for (let l = 0; l < layers; l++) {
          value += amp * this.noise.fbm(
            position.x * freq,
            position.y * freq,
            position.z * freq,
            Math.max(1, octaves - l),
          );
          amp *= 0.5;
          freq *= lacunarity;
        }
        return value;
      }

      case ShaderGraphType.ALTITUDE_BLEND: {
        const baseDisp = this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
        const altitudeFactor = Math.max(0, Math.min(1, position.y / (params.altitudeRange ?? 20)));
        return baseDisp * (0.3 + 0.7 * altitudeFactor);
      }

      case ShaderGraphType.MATERIAL_CHANNEL:
      default: {
        return this.noise.fbm(
          position.x * scale,
          position.y * scale,
          position.z * scale,
          octaves,
        );
      }
    }
  }

  /**
   * Compute fallback displacement using seeded noise.
   *
   * Used when the shader graph cannot be evaluated (no node group,
   * evaluation failure, etc.). Produces deterministic FBM noise-based
   * displacement for a given world position.
   *
   * @param position - World-space position
   * @returns Displacement value
   */
  private computeFallbackDisplacement(position: THREE.Vector3): number {
    const freq = 0.05;
    const octaves = 4;
    const n = this.noise.fbm(
      position.x * freq,
      position.y * freq,
      position.z * freq,
      octaves,
    );
    return n * this.config.displacementScale * 0.5;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Compute a cache key for a shader graph descriptor.
   *
   * Uses a deterministic hash of the graph's type, parameters, and
   * node group name (if available) to produce a unique cache key.
   *
   * @param graph - The shader graph descriptor
   * @returns A string cache key
   */
  private computeGraphCacheKey(graph: ShaderGraphDescriptor): string {
    const parts: string[] = [
      graph.type,
      graph.label,
      graph.nodeGroup?.name ?? '',
    ];

    // Sort parameters for deterministic key ordering
    const sortedParams = Object.entries(graph.parameters).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of sortedParams) {
      parts.push(`${key}=${value}`);
    }

    if (graph.coordScale) {
      parts.push(`cs=${graph.coordScale.join(',')}`);
    }

    for (const ch of graph.channels) {
      parts.push(ch);
    }

    return parts.join('|');
  }

  /**
   * Build a SurfaceEvaluationContext for a vertex in the geometry.
   *
   * Extracts position, normal, UV from the geometry attributes and
   * computes terrain-specific context fields like slope and height.
   *
   * @param geometry - The geometry to extract vertex data from
   * @param vertexIndex - The index of the vertex
   * @returns A SurfaceEvaluationContext for the vertex
   */
  buildEvaluationContext(
    geometry: THREE.BufferGeometry,
    vertexIndex: number,
  ): SurfaceEvaluationContext {
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');
    const materialIdAttr = geometry.getAttribute('materialId');
    const caveTagAttr = geometry.getAttribute('caveTag');

    const position = posAttr
      ? new THREE.Vector3(
          (posAttr.array as Float32Array)[vertexIndex * 3],
          (posAttr.array as Float32Array)[vertexIndex * 3 + 1],
          (posAttr.array as Float32Array)[vertexIndex * 3 + 2],
        )
      : new THREE.Vector3();

    const normal = normAttr
      ? new THREE.Vector3(
          (normAttr.array as Float32Array)[vertexIndex * 3],
          (normAttr.array as Float32Array)[vertexIndex * 3 + 1],
          (normAttr.array as Float32Array)[vertexIndex * 3 + 2],
        )
      : new THREE.Vector3(0, 1, 0);

    const uv = uvAttr
      ? new THREE.Vector2(
          (uvAttr.array as Float32Array)[vertexIndex * 2] ?? 0,
          (uvAttr.array as Float32Array)[vertexIndex * 2 + 1] ?? 0,
        )
      : new THREE.Vector2();

    const materialId = materialIdAttr
      ? (materialIdAttr.array as Float32Array)[vertexIndex]
      : 0;

    const caveTag = caveTagAttr
      ? (caveTagAttr.array as Float32Array)[vertexIndex]
      : 0;

    // Compute slope from normal (angle from vertical)
    const upDot = normal.dot(new THREE.Vector3(0, 1, 0));
    const slope = Math.acos(Math.max(-1, Math.min(1, upDot)));

    return {
      position,
      normal,
      uv,
      materialId,
      elementTag: 0,
      slope,
      height: position.y,
      caveDistance: caveTag > 0.5 ? -1 : 1, // Approximate: inside cave or not
      waterDistance: Infinity, // Would need water system integration
    };
  }

  /**
   * Compute finite-difference normals for a displacement function.
   *
   * Evaluates the displacement at the central point and three offset
   * points (along x, y, z axes) to compute the perturbed normal via
   * finite differences.
   *
   * @param position - The world-space position to compute the normal at
   * @param displacementFn - A function that returns displacement at a position
   * @param epsilon - The finite difference step size
   * @returns The perturbed normal vector
   */
  computeDisplacementNormal(
    position: THREE.Vector3,
    displacementFn: (pos: THREE.Vector3) => number,
    epsilon?: number,
  ): THREE.Vector3 {
    const eps = epsilon ?? this.config.normalEpsilon;

    // Central displacement
    const d0 = displacementFn(position);

    // Offset displacements
    const dx = displacementFn(new THREE.Vector3(position.x + eps, position.y, position.z)) - d0;
    const dy = displacementFn(new THREE.Vector3(position.x, position.y + eps, position.z)) - d0;
    const dz = displacementFn(new THREE.Vector3(position.x, position.y, position.z + eps)) - d0;

    // Normal = negative gradient of displacement
    const normal = new THREE.Vector3(-dx / eps, -dy / eps, -dz / eps).normalize();

    // Blend with original up vector for stability
    const up = new THREE.Vector3(0, 1, 0);
    normal.lerp(up, 0.1).normalize();

    return normal;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of GPU resources held by this kernel.
   *
   * Disposes all cached textures and clears the shader cache.
   * After disposal, the kernel should not be used.
   */
  dispose(): void {
    if (this.disposed) return;

    // Dispose cached textures
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();

    // Clear shader cache
    this.shaderCache.clear();

    this.disposed = true;
  }

  /**
   * Check whether this kernel has been disposed.
   *
   * @returns True if the kernel has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get the current configuration.
   *
   * @returns A copy of the current configuration
   */
  getConfig(): TerrainSurfaceKernelConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration at runtime.
   *
   * Merges the provided partial config with the existing configuration.
   * Note that changing the seed will NOT reinitialize the noise generator;
   * call `reinitializeNoise()` separately if needed.
   *
   * @param config - Partial configuration to merge
   */
  setConfig(config: Partial<TerrainSurfaceKernelConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reinitialize the noise generator with the current seed.
   *
   * Call this after changing the seed via `setConfig()` to ensure
   * the noise generator uses the new seed.
   */
  reinitializeNoise(): void {
    this.noise = new NoiseUtils(this.config.seed);
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Clear all cached shaders and textures.
   *
   * Useful when the kernel configuration changes in a way that
   * invalidates previously generated shaders or textures.
   */
  clearCache(): void {
    for (const texture of this.textureCache.values()) {
      texture.dispose();
    }
    this.textureCache.clear();
    this.shaderCache.clear();
  }
}
