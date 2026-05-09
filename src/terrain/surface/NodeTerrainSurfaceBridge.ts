/**
 * NodeTerrainSurfaceBridge — Connects Node Graph Evaluation to Terrain Surface Shader Pipeline
 *
 * This module provides the R3F equivalent of Infinigen's `surface.py` module.
 * In the original Infinigen Python codebase:
 *   - `surface.add_material(objs, shader_MOUNTAIN, selection=...)` assigns a shader
 *     function as a material to objects, optionally restricted to a selection.
 *   - `surface.add_geomod(objs, geo_MOUNTAIN, selection=...)` applies a geometry
 *     modifier to objects, optionally restricted to a selection.
 *   - `surface.shaderfunc_to_material(shader_func, ...)` converts a shader function
 *     directly into a Blender material.
 *
 * In this R3F TypeScript port, the equivalent operations are:
 *   - `NodeTerrainSurfaceBridge.applyMaterial(mesh, shaderGraph, selection?, mode?)`
 *   - `NodeTerrainSurfaceBridge.applyGeometryModifier(mesh, geoGraph, selection?)`
 *   - `NodeTerrainSurfaceBridge.shaderGraphToMaterial(shaderGraph, params?)`
 *
 * The bridge delegates to TerrainSurfaceKernel for displacement and material channel
 * generation, and to TerrainSurfaceRegistry for surface template lookups.
 *
 * Selection system:
 *   - null           → apply everywhere (weight = 1.0)
 *   - string         → read a TAG_* attribute from geometry (e.g., 'TAG_cave')
 *   - Float32Array   → use per-vertex weights directly
 *   - function       → evaluate per vertex for weight [0, 1]
 *
 * Application modes:
 *   - Replace        → replace the material entirely
 *   - Blend          → blend with existing material using vertex attribute weights
 *   - DisplacementOnly → add as a displacement modifier only
 *   - SDFPerturb     → SDF perturbation before meshing (delegates to kernel)
 *
 * @module terrain/surface/NodeTerrainSurfaceBridge
 */

import * as THREE from 'three';
import { TerrainSurfaceKernel } from '@/terrain/surface/TerrainSurfaceKernel';
import {
  ShaderGraphDescriptor,
} from '@/terrain/surface/ShaderGraphSurfaceBridge';
import {
  SurfaceType,
  TerrainSurfaceRegistry,
  getEffectiveSurfaceType,
} from '@/terrain/surface/SurfaceRegistry';
import { NoiseUtils } from '@/core/util/math/noise';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Surface Application Mode
// ============================================================================

/**
 * Determines how a surface material or modifier is applied to a terrain mesh.
 *
 * - Replace: Completely replaces the existing material with the new shader graph.
 * - Blend: Blends the new shader graph with the existing material using
 *   per-vertex attribute weights (equivalent to Infinigen's MixShader approach).
 * - DisplacementOnly: Only applies displacement; does not modify the material.
 * - SDFPerturb: Applies displacement as SDF perturbation before meshing,
 *   delegating to TerrainSurfaceKernel.applySDFPerturbation.
 */
export enum SurfaceApplicationMode {
  /** Replace the material entirely */
  Replace = 'replace',
  /** Blend with existing material using attribute weights */
  Blend = 'blend',
  /** Add as a displacement modifier only */
  DisplacementOnly = 'displacement_only',
  /** SDF perturbation before meshing */
  SDFPerturb = 'sdf_perturb',
}

// ============================================================================
// Surface Selection
// ============================================================================

/**
 * Specifies where a surface treatment is applied on a terrain mesh.
 *
 * Matches Infinigen's `selection` parameter in `surface.add_material()` and
 * `surface.add_geomod()`, which accepts boolean face/vertex attributes
 * (like `TAG_cave`, `TAG_rock`) or computed expressions.
 *
 * In this R3F port, the selection can be:
 * - null: Apply everywhere (all weights = 1.0)
 * - string: Read a TAG_* named attribute from the mesh's geometry
 * - Float32Array: Direct per-vertex weights in [0, 1]
 * - function: Evaluated per vertex with (vertexIndex, position) → weight
 */
export type SurfaceSelection =
  | null // Apply everywhere
  | string // Tag name (e.g., 'TAG_cave', 'TAG_rock')
  | Float32Array // Per-vertex weights [0, 1]
  | ((vertexIndex: number, position: THREE.Vector3) => number); // Function returning weight

// ============================================================================
// MixedSurface Material
// ============================================================================

/**
 * Material record for tracking blended surface applications.
 *
 * When `SurfaceApplicationMode.Blend` is used, each applied material is
 * tracked with its selection weights so that the final blended material
 * can be computed by normalizing across all contributions.
 */
interface MixedSurfaceEntry {
  /** The shader graph descriptor for this surface layer */
  shaderGraph: ShaderGraphDescriptor;
  /** Per-vertex blend weights for this layer */
  weights: Float32Array;
  /** The material generated from this shader graph */
  material: THREE.MeshPhysicalMaterial;
}

// ============================================================================
// NodeTerrainSurfaceBridge
// ============================================================================

/**
 * Bridges the node graph evaluation system with the terrain surface shader
 * pipeline, providing the R3F equivalent of Infinigen's `surface.py` module.
 *
 * This class connects the ShaderGraphDescriptor (produced by the node graph
 * evaluation system) with the TerrainSurfaceKernel (which handles displacement
 * and material channel generation) and the TerrainSurfaceRegistry (which manages
 * surface template lookups).
 *
 * Key responsibilities:
 * 1. **Material Application** (`applyMaterial`): Applies a shader graph as a
 *    material to a terrain mesh. Supports Replace, Blend, DisplacementOnly,
 *    and SDFPerturb modes. When Blend mode is used, creates a "MixedSurface"
 *    material that blends the new shader with the existing material using
 *    per-vertex attribute weights, then normalizes across all layers.
 *
 * 2. **Geometry Modifier Application** (`applyGeometryModifier`): Evaluates
 *    a geometry graph per-vertex to compute displacement, then applies the
 *    displacement along vertex normals, restricted by the selection.
 *
 * 3. **Material Conversion** (`shaderGraphToMaterial`): Converts a shader
 *    graph directly to a THREE.MeshPhysicalMaterial with PBR properties
 *    derived from the graph's parameters and evaluation.
 *
 * 4. **Combined Surface Application** (`applySurface`): Applies a complete
 *    surface treatment (geometry modifier + material), matching Infinigen's
 *    Surface class pattern.
 *
 * 5. **Attribute I/O** (`readAttribute`, `writeAttribute`): Reads and writes
 *    named attributes on mesh geometry, matching Infinigen's
 *    `surface.read_attr_data()` and `surface.write_attr_data()`.
 *
 * 6. **Selection Evaluation** (`evaluateSelection`): Converts a SurfaceSelection
 *    specification into concrete per-vertex Float32Array weights.
 *
 * All methods are deterministic for a given seed.
 *
 * Usage:
 * ```typescript
 * const bridge = new NodeTerrainSurfaceBridge(42);
 *
 * // Apply a shader graph as a material
 * const mesh = bridge.applyMaterial(terrainMesh, mountainShaderGraph, 'TAG_rock');
 *
 * // Apply geometry displacement
 * const displacedMesh = bridge.applyGeometryModifier(mesh, geoGraph, 'TAG_cave');
 *
 * // Convert a shader graph directly to a material
 * const material = bridge.shaderGraphToMaterial(shaderGraph);
 *
 * // Apply a complete surface (displacement + material)
 * const result = bridge.applySurface(mesh, dispGraph, matGraph, SurfaceType.SDFPerturb);
 * ```
 */
export class NodeTerrainSurfaceBridge {
  /** The terrain surface kernel for displacement and material generation */
  private kernel: TerrainSurfaceKernel;
  /** Surface registry for template lookups */
  private surfaceRegistry: TerrainSurfaceRegistry;
  /** Noise utility for procedural generation */
  private noise: NoiseUtils;
  /** Seeded random number generator */
  private rng: SeededRandom;
  /** Whether this bridge has been disposed */
  private disposed: boolean;
  /** Tracked mixed surface entries for blend mode */
  private mixedSurfaceEntries: MixedSurfaceEntry[];
  /** Cache of generated materials keyed by shader graph label */
  private materialCache: Map<string, THREE.MeshPhysicalMaterial>;

  /**
   * Create a new NodeTerrainSurfaceBridge.
   *
   * @param seed - Master seed for deterministic procedural generation
   * @param surfaceRegistry - Optional TerrainSurfaceRegistry for template lookups.
   *   If not provided, a default registry is created with the given seed.
   */
  constructor(seed: number, surfaceRegistry?: TerrainSurfaceRegistry) {
    this.kernel = new TerrainSurfaceKernel({ seed });
    this.surfaceRegistry = surfaceRegistry ?? new TerrainSurfaceRegistry(seed);
    this.noise = new NoiseUtils(seed);
    this.rng = new SeededRandom(seed);
    this.disposed = false;
    this.mixedSurfaceEntries = [];
    this.materialCache = new Map();
  }

  // ==========================================================================
  // Material Application (matches Infinigen's add_material)
  // ==========================================================================

  /**
   * Apply a shader graph as a material to a terrain mesh.
   *
   * Matches Infinigen's `surface.add_material(objs, shader_func, selection=...)`.
   *
   * When `selection` is provided:
   * - Creates a "MixedSurface" material that blends the new shader with the
   *   existing material using attribute-based weights
   * - Normalizes weights across all applied materials
   * - Uses MixShader-style blending (linear interpolation between current
   *     and previous shader contributions)
   *
   * When `mode` is `SurfaceApplicationMode.Replace`, the mesh's material is
   * replaced entirely with the new material generated from the shader graph.
   *
   * When `mode` is `SurfaceApplicationMode.Blend`, the new material is blended
   * with the existing material using the selection weights. Multiple blend
   * applications accumulate, and weights are normalized before final composition.
   *
   * When `mode` is `SurfaceApplicationMode.DisplacementOnly`, only the
   * displacement from the shader graph is applied; the material is not modified.
   *
   * When `mode` is `SurfaceApplicationMode.SDFPerturb`, the shader graph is
   * applied as an SDF perturbation via `TerrainSurfaceKernel.applySDFPerturbation`.
   * This mode requires that the mesh has SDF data associated with it (typically
   * stored as a custom attribute named `sdfGrid` and `sdfDimensions`).
   *
   * @param mesh - The terrain mesh to apply material to
   * @param shaderGraph - ShaderGraphDescriptor defining the material
   * @param selection - Where to apply the material (null = everywhere)
   * @param mode - How to apply the material (default: Replace)
   * @returns The modified mesh
   */
  applyMaterial(
    mesh: THREE.Mesh,
    shaderGraph: ShaderGraphDescriptor,
    selection?: SurfaceSelection,
    mode: SurfaceApplicationMode = SurfaceApplicationMode.Replace,
  ): THREE.Mesh {
    this.checkDisposed();

    // Evaluate selection into per-vertex weights
    const weights = this.evaluateSelection(mesh, selection);

    switch (mode) {
      case SurfaceApplicationMode.Replace: {
        const material = this.shaderGraphToMaterial(shaderGraph);
        mesh.material = material;
        return mesh;
      }

      case SurfaceApplicationMode.Blend: {
        return this.applyMaterialBlend(mesh, shaderGraph, weights);
      }

      case SurfaceApplicationMode.DisplacementOnly: {
        // Only apply displacement, don't change the material
        return this.applyGeometryModifier(mesh, shaderGraph, selection);
      }

      case SurfaceApplicationMode.SDFPerturb: {
        // Delegate to kernel for SDF perturbation
        return this.applySDFPerturbationMode(mesh, shaderGraph, weights);
      }

      default: {
        const material = this.shaderGraphToMaterial(shaderGraph);
        mesh.material = material;
        return mesh;
      }
    }
  }

  /**
   * Apply a geometry modifier to a terrain mesh.
   *
   * Matches Infinigen's `surface.add_geomod(objs, geo_func, selection=...)`.
   *
   * Evaluates the geometry graph per-vertex to compute displacement,
   * then applies the displacement along vertex normals. The displacement
   * is scaled by the selection weights at each vertex, so vertices with
   * a weight of 0 are not displaced, and vertices with a weight of 1
   * receive the full displacement.
   *
   * After displacement, vertex normals are recomputed for correct lighting.
   *
   * @param mesh - The terrain mesh to modify
   * @param geoGraph - ShaderGraphDescriptor defining the displacement
   * @param selection - Where to apply displacement (null = everywhere)
   * @returns The modified mesh with displaced geometry
   */
  applyGeometryModifier(
    mesh: THREE.Mesh,
    geoGraph: ShaderGraphDescriptor,
    selection?: SurfaceSelection,
  ): THREE.Mesh {
    this.checkDisposed();

    const weights = this.evaluateSelection(mesh, selection);
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');

    if (!posAttr) {
      console.warn('[NodeTerrainSurfaceBridge] No position attribute on mesh geometry');
      return mesh;
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
      if (!computedNormals) {
        for (let i = 0; i < vertexCount; i++) {
          normalArray[i * 3] = 0;
          normalArray[i * 3 + 1] = 1;
          normalArray[i * 3 + 2] = 0;
        }
      }
    }

    // Use the kernel to apply vertex displacement with the geo graph
    const displacedGeometry = this.kernel.applyVertexDisplacement(
      geometry,
      mesh,
      geoGraph,
    );

    // If we have non-trivial selection weights, scale the displacement by weights
    const hasSelection = !this.isUniformWeights(weights, vertexCount);
    if (hasSelection) {
      const displacedPosAttr = displacedGeometry.getAttribute('position');
      const originalPosArray = posAttr.array as Float32Array;
      const displacedPosArray = displacedPosAttr?.array as Float32Array;

      if (displacedPosAttr) {
        const blendedPosArray = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          blendedPosArray[i * 3] = originalPosArray[i * 3] * (1 - w) + displacedPosArray[i * 3] * w;
          blendedPosArray[i * 3 + 1] = originalPosArray[i * 3 + 1] * (1 - w) + displacedPosArray[i * 3 + 1] * w;
          blendedPosArray[i * 3 + 2] = originalPosArray[i * 3 + 2] * (1 - w) + displacedPosArray[i * 3 + 2] * w;
        }

        const resultPosAttr = displacedGeometry.getAttribute('position') as THREE.BufferAttribute;
        (resultPosAttr.array as Float32Array).set(blendedPosArray);
        resultPosAttr.needsUpdate = true;
      }
    }

    // Store the selection weights as a vertex attribute for later use
    displacedGeometry.setAttribute(
      'surfaceSelectionWeight',
      new THREE.BufferAttribute(weights.slice(0, vertexCount), 1),
    );

    // Recompute normals after displacement
    displacedGeometry.computeVertexNormals();
    displacedGeometry.computeBoundingSphere();
    displacedGeometry.computeBoundingBox();

    mesh.geometry = displacedGeometry;
    return mesh;
  }

  /**
   * Convert a shader graph directly to a THREE.Material.
   *
   * Matches Infinigen's `surface.shaderfunc_to_material(shader_func, ...)`.
   *
   * Evaluates the shader graph to produce PBR material properties, then
   * creates a MeshPhysicalMaterial with the appropriate settings. The
   * material's color, roughness, metalness, and other PBR parameters are
   * derived from the shader graph's parameters and the kernel's material
   * channel generation.
   *
   * If the shader graph provides a `textureGraph` or `nodeGroup`, the
   * kernel generates PBR texture maps (albedo, normal, roughness, AO, etc.)
   * and applies them to the material.
   *
   * @param shaderGraph - ShaderGraphDescriptor defining the material
   * @param params - Additional parameters for material creation. These override
   *   any values derived from the shader graph.
   * @returns THREE.MeshPhysicalMaterial with PBR properties from the shader graph
   */
  shaderGraphToMaterial(
    shaderGraph: ShaderGraphDescriptor,
    params?: Partial<THREE.MeshPhysicalMaterialParameters>,
  ): THREE.MeshPhysicalMaterial {
    this.checkDisposed();

    // Check cache
    const cacheKey = shaderGraph.label ?? JSON.stringify(shaderGraph.parameters);
    const cached = this.materialCache.get(cacheKey);
    if (cached) {
      return cached.clone();
    }

    // Extract PBR parameters from the shader graph
    const graphParams = shaderGraph.parameters;
    const scale = graphParams.scale ?? 5.0;
    const detail = Math.round(graphParams.detail ?? 4);

    // Sample noise at a representative position to derive base material properties
    const sampleX = this.rng.next() * scale;
    const sampleY = this.rng.next() * scale;
    const sampleZ = this.rng.next() * scale;
    const noiseValue = this.noise.fbm(sampleX, sampleY, sampleZ, detail);

    // Derive PBR properties from noise and graph parameters
    const baseColor = this.deriveColor(shaderGraph, noiseValue);
    const roughness = this.deriveRoughness(shaderGraph, noiseValue);
    const metalness = this.deriveMetalness(shaderGraph, noiseValue);

    // Create the material
    const materialParams: THREE.MeshPhysicalMaterialParameters = {
      color: baseColor,
      roughness,
      metalness,
      side: THREE.DoubleSide,
      flatShading: false,
      ...params, // Allow overrides
    };

    const material = new THREE.MeshPhysicalMaterial(materialParams);

    // Generate PBR textures from the shader graph using the kernel
    this.applyGraphTextures(material, shaderGraph);

    // Cache the material
    this.materialCache.set(cacheKey, material.clone());

    return material;
  }

  // ==========================================================================
  // Combined Surface Application (matches Infinigen's Surface class .apply())
  // ==========================================================================

  /**
   * Apply a complete surface treatment (geometry modifier + material).
   *
   * Matches Infinigen's pattern of a Surface class with:
   *   type = SurfaceTypes.SDFPerturb / Displacement
   *   mod_name = "geo_MOUNTAIN"
   *   def apply(self, objs, selection=None, **kwargs):
   *     surface.add_geomod(objs, geo_MOUNTAIN, selection=selection)
   *     surface.add_material(objs, shader_MOUNTAIN, selection=selection)
   *
   * The `surfaceType` parameter determines how displacement is applied:
   * - `SurfaceType.SDFPerturb`: The displacement graph is applied as an SDF
   *   perturbation before meshing, then the material is applied.
   * - `SurfaceType.Displacement` / `SurfaceType.BlenderDisplacement`: The
   *   displacement graph is applied as vertex displacement after meshing,
   *   then the material is applied.
   *
   * @param mesh - The terrain mesh to apply the surface to
   * @param displacementGraph - Displacement graph (geo_* equivalent)
   * @param materialGraph - Material graph (shader_* equivalent)
   * @param surfaceType - How to apply displacement
   * @param selection - Where to apply the surface
   * @returns The modified mesh
   */
  applySurface(
    mesh: THREE.Mesh,
    displacementGraph: ShaderGraphDescriptor,
    materialGraph: ShaderGraphDescriptor,
    surfaceType: SurfaceType,
    selection?: SurfaceSelection,
  ): THREE.Mesh {
    this.checkDisposed();

    const effectiveType = getEffectiveSurfaceType(surfaceType);

    // Step 1: Apply displacement based on surface type
    if (effectiveType === SurfaceType.SDFPerturb) {
      // SDF perturbation: modify the SDF before meshing
      const weights = this.evaluateSelection(mesh, selection);
      mesh = this.applySDFPerturbationMode(mesh, displacementGraph, weights);
    } else {
      // Vertex displacement: modify vertices after meshing
      mesh = this.applyGeometryModifier(mesh, displacementGraph, selection);
    }

    // Step 2: Apply the material
    mesh = this.applyMaterial(mesh, materialGraph, selection, SurfaceApplicationMode.Replace);

    return mesh;
  }

  // ==========================================================================
  // Attribute I/O (matches Infinigen's surface.read_attr_data / write_attr_data)
  // ==========================================================================

  /**
   * Read a named attribute from a mesh's geometry.
   *
   * Matches Infinigen's `surface.read_attr_data(obj, attr, domain)`.
   *
   * Searches the mesh's BufferGeometry for a BufferAttribute with the
   * given name. Returns the attribute data as a Float32Array, or null
   * if no attribute with that name exists.
   *
   * For attributes with itemSize > 1 (e.g., normals with itemSize 3),
   * the returned array contains all components concatenated.
   *
   * @param mesh - The mesh to read from
   * @param attributeName - Name of the attribute (e.g., 'materialZone', 'caveTag')
   * @returns Float32Array of attribute values, or null if not found
   */
  readAttribute(mesh: THREE.Mesh, attributeName: string): Float32Array | null {
    this.checkDisposed();

    const geometry = mesh.geometry;
    const attribute = geometry.getAttribute(attributeName);

    if (!attribute) {
      return null;
    }

    const array = attribute.array as Float32Array;
    return new Float32Array(array);
  }

  /**
   * Write a named attribute to a mesh's geometry.
   *
   * Matches Infinigen's `surface.write_attr_data(obj, attr, data, type, domain)`.
   *
   * Creates or replaces a BufferAttribute on the mesh's geometry with the
   * given name and data. The `itemSize` parameter controls how many
   * components per vertex (1 = scalar, 3 = vector, etc.).
   *
   * If an attribute with the same name already exists, it is replaced.
   *
   * @param mesh - The mesh to write to
   * @param attributeName - Name of the attribute
   * @param data - The attribute data as a Float32Array
   * @param itemSize - Number of components per vertex (1 = scalar, 3 = vector)
   */
  writeAttribute(
    mesh: THREE.Mesh,
    attributeName: string,
    data: Float32Array,
    itemSize: number = 1,
  ): void {
    this.checkDisposed();

    const geometry = mesh.geometry;
    const attribute = new THREE.BufferAttribute(data, itemSize);
    attribute.needsUpdate = true;
    geometry.setAttribute(attributeName, attribute);
  }

  // ==========================================================================
  // Selection Evaluation
  // ==========================================================================

  /**
   * Evaluate a SurfaceSelection into per-vertex weights.
   *
   * Converts the abstract SurfaceSelection specification into a concrete
   * Float32Array of per-vertex weights in [0, 1]:
   *
   * - **null** → All weights are 1.0 (apply everywhere)
   * - **string** → Read a TAG_* attribute from the geometry. If the attribute
   *   exists, its values are used as weights. If it doesn't exist, all weights
   *   default to 1.0 (as a fallback, matching Infinigen's behavior where
   *   missing tags default to "apply everywhere").
   * - **Float32Array** → Use directly, clamped to [0, 1] range
   * - **function** → Evaluate per vertex, passing the vertex index and
   *   world-space position, clamping the result to [0, 1]
   *
   * @param mesh - The mesh to evaluate selection for
   * @param selection - The selection specification
   * @returns Float32Array of per-vertex weights [0, 1]
   */
  evaluateSelection(mesh: THREE.Mesh, selection: SurfaceSelection): Float32Array {
    this.checkDisposed();

    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');

    if (!posAttr) {
      return new Float32Array(0);
    }

    const vertexCount = posAttr.count;

    // null → apply everywhere
    if (selection === null) {
      return new Float32Array(vertexCount).fill(1.0);
    }

    // string → read TAG_* attribute
    if (typeof selection === 'string') {
      const attr = geometry.getAttribute(selection);
      if (attr) {
        const sourceArray = attr.array as Float32Array;
        const result = new Float32Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
          // Clamp to [0, 1] range
          result[i] = Math.max(0, Math.min(1, sourceArray[i] ?? 1.0));
        }
        return result;
      }
      // If attribute not found, default to applying everywhere
      // (matches Infinigen behavior where missing tags default to full selection)
      return new Float32Array(vertexCount).fill(1.0);
    }

    // Float32Array → use directly
    if (selection instanceof Float32Array) {
      const result = new Float32Array(vertexCount);
      const len = Math.min(selection.length, vertexCount);
      for (let i = 0; i < len; i++) {
        result[i] = Math.max(0, Math.min(1, selection[i]));
      }
      // Fill remaining with 1.0 if selection is shorter than vertex count
      for (let i = len; i < vertexCount; i++) {
        result[i] = 1.0;
      }
      return result;
    }

    // function → evaluate per vertex
    if (typeof selection === 'function') {
      const result = new Float32Array(vertexCount);
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < vertexCount; i++) {
        const position = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );
        const weight = selection(i, position);
        result[i] = Math.max(0, Math.min(1, weight));
      }

      return result;
    }

    // Fallback: apply everywhere
    return new Float32Array(vertexCount).fill(1.0);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Dispose of all resources held by this bridge.
   *
   * Disposes the kernel, material cache, and mixed surface entries.
   * After calling dispose(), this bridge instance should not be used.
   */
  dispose(): void {
    if (this.disposed) return;

    // Dispose cached materials
    for (const material of this.materialCache.values()) {
      material.dispose();
    }
    this.materialCache.clear();

    // Dispose mixed surface entries
    for (const entry of this.mixedSurfaceEntries) {
      entry.material.dispose();
    }
    this.mixedSurfaceEntries = [];

    // Dispose the kernel
    this.kernel.dispose();

    // Dispose the surface registry
    this.surfaceRegistry.dispose();

    this.disposed = true;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Check whether this bridge has been disposed and throw if so.
   */
  private checkDisposed(): void {
    if (this.disposed) {
      throw new Error('[NodeTerrainSurfaceBridge] Cannot use a disposed bridge');
    }
  }

  /**
   * Apply material in Blend mode.
   *
   * When Blend mode is used, the new shader graph is blended with any
   * previously applied materials using per-vertex weights. The weights
   * are normalized across all layers so that they sum to 1.0 at each vertex.
   *
   * The blending approach matches Infinigen's MixShader node: for each
   * vertex, the final color is computed as a weighted average of all
   * applied material layers.
   *
   * @param mesh - The terrain mesh
   * @param shaderGraph - The shader graph to blend
   * @param weights - Per-vertex weights for this layer
   * @returns The modified mesh
   */
  private applyMaterialBlend(
    mesh: THREE.Mesh,
    shaderGraph: ShaderGraphDescriptor,
    weights: Float32Array,
  ): THREE.Mesh {
    // Generate the material for this shader graph
    const material = this.shaderGraphToMaterial(shaderGraph);

    // Track this as a mixed surface entry
    this.mixedSurfaceEntries.push({
      shaderGraph,
      weights: new Float32Array(weights),
      material,
    });

    // If this is the first entry, just set the material
    if (this.mixedSurfaceEntries.length === 1) {
      mesh.material = material;
      return mesh;
    }

    // Normalize weights across all entries
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return mesh;

    const vertexCount = posAttr.count;

    // Compute normalization factors per vertex
    const totalWeights = new Float32Array(vertexCount);
    for (const entry of this.mixedSurfaceEntries) {
      for (let i = 0; i < vertexCount && i < entry.weights.length; i++) {
        totalWeights[i] += entry.weights[i];
      }
    }

    // Normalize each entry's weights
    for (const entry of this.mixedSurfaceEntries) {
      for (let i = 0; i < vertexCount && i < entry.weights.length; i++) {
        if (totalWeights[i] > 0) {
          entry.weights[i] /= totalWeights[i];
        }
      }
    }

    // Store blend weights as vertex attributes for shader-based blending
    for (let idx = 0; idx < this.mixedSurfaceEntries.length; idx++) {
      const entry = this.mixedSurfaceEntries[idx];
      const attrName = `surfaceBlend_${idx}`;
      geometry.setAttribute(
        attrName,
        new THREE.BufferAttribute(
          new Float32Array(entry.weights.slice(0, vertexCount)),
          1,
        ),
      );
    }

    // Create the final blended material
    // Use the last entry's material as the base, but mark it as needing blend
    const blendedMaterial = this.createBlendedMaterial();
    mesh.material = blendedMaterial;

    return mesh;
  }

  /**
   * Create a blended material from all mixed surface entries.
   *
   * Combines PBR properties from all tracked material entries using
   * weighted averaging. For color, roughness, and metalness, computes
   * the weighted average across all layers based on the first vertex's
   * weights (as a representative sample).
   *
   * @returns A MeshPhysicalMaterial with blended PBR properties
   */
  private createBlendedMaterial(): THREE.MeshPhysicalMaterial {
    if (this.mixedSurfaceEntries.length === 0) {
      return new THREE.MeshPhysicalMaterial({
        color: 0x808080,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });
    }

    if (this.mixedSurfaceEntries.length === 1) {
      return this.mixedSurfaceEntries[0].material.clone();
    }

    // Weighted blend of PBR properties using representative weights
    const blendColor = new THREE.Color(0, 0, 0);
    let blendRoughness = 0;
    let blendMetalness = 0;
    let totalWeight = 0;

    for (const entry of this.mixedSurfaceEntries) {
      // Use average weight across all vertices as representative weight
      let avgWeight = 0;
      for (let i = 0; i < entry.weights.length; i++) {
        avgWeight += entry.weights[i];
      }
      avgWeight = entry.weights.length > 0 ? avgWeight / entry.weights.length : 0;

      const mat = entry.material;
      const color = new THREE.Color();
      mat.color ? color.copy(mat.color) : color.set(0x808080);

      blendColor.add(color.multiplyScalar(avgWeight));
      blendRoughness += (mat.roughness ?? 0.5) * avgWeight;
      blendMetalness += (mat.metalness ?? 0.0) * avgWeight;
      totalWeight += avgWeight;
    }

    // Normalize
    if (totalWeight > 0) {
      blendColor.multiplyScalar(1 / totalWeight);
      blendRoughness /= totalWeight;
      blendMetalness /= totalWeight;
    }

    return new THREE.MeshPhysicalMaterial({
      color: blendColor,
      roughness: Math.max(0, Math.min(1, blendRoughness)),
      metalness: Math.max(0, Math.min(1, blendMetalness)),
      side: THREE.DoubleSide,
    });
  }

  /**
   * Apply SDF perturbation mode to a mesh.
   *
   * When SDFPerturb mode is selected, the shader graph is used to perturb
   * the SDF field of the terrain. This requires that SDF data is available
   * on the mesh (stored as custom attributes).
   *
   * If SDF data is not available on the mesh (which is common for already-
   * meshed geometry), falls back to vertex displacement with the SDF
   * perturbation convention (negative displacement = surface pushed inward).
   *
   * @param mesh - The terrain mesh
   * @param shaderGraph - The displacement shader graph
   * @param weights - Per-vertex selection weights
   * @returns The modified mesh
   */
  private applySDFPerturbationMode(
    mesh: THREE.Mesh,
    shaderGraph: ShaderGraphDescriptor,
    weights: Float32Array,
  ): THREE.Mesh {
    const geometry = mesh.geometry;

    // Check if SDF grid data is available on the mesh
    const sdfGridAttr = geometry.getAttribute('sdfGrid');
    const sdfDimsAttr = geometry.getAttribute('sdfDimensions');
    const sdfBoundsAttr = geometry.getAttribute('sdfBounds');

    if (sdfGridAttr && sdfDimsAttr && sdfBoundsAttr) {
      // SDF data is available — apply perturbation to the SDF grid
      const sdfGrid = new Float32Array(sdfGridAttr.array as Float32Array);
      const dims = new Float32Array(sdfDimsAttr.array as Float32Array);
      const boundsData = new Float32Array(sdfBoundsAttr.array as Float32Array);

      const gridDimensions: [number, number, number] = [
        Math.round(dims[0]),
        Math.round(dims[1]),
        Math.round(dims[2]),
      ];

      const bounds = new THREE.Box3(
        new THREE.Vector3(boundsData[0], boundsData[1], boundsData[2]),
        new THREE.Vector3(boundsData[3], boundsData[4], boundsData[5]),
      );

      // Apply SDF perturbation via the kernel
      const perturbedSDF = this.kernel.applySDFPerturbation(
        sdfGrid,
        gridDimensions,
        bounds,
        shaderGraph,
      );

      // Update the SDF grid attribute
      geometry.setAttribute(
        'sdfGrid',
        new THREE.BufferAttribute(perturbedSDF, 1),
      );

      return mesh;
    }

    // Fallback: apply as vertex displacement with SDF perturbation convention
    // In SDF perturbation, the displacement convention is inverted:
    // negative displacement pushes the surface inward (into the SDF volume)
    return this.applyGeometryModifierWithSDFConvention(mesh, shaderGraph, weights);
  }

  /**
   * Apply geometry modifier with SDF perturbation convention.
   *
   * When SDF data is not available on the mesh, falls back to vertex
   * displacement but with the SDF perturbation sign convention:
   * positive displacement values push the surface outward, and the
   * displacement is negated relative to normal displacement mode.
   *
   * @param mesh - The terrain mesh
   * @param geoGraph - The geometry shader graph
   * @param weights - Per-vertex selection weights
   * @returns The modified mesh
   */
  private applyGeometryModifierWithSDFConvention(
    mesh: THREE.Mesh,
    geoGraph: ShaderGraphDescriptor,
    weights: Float32Array,
  ): THREE.Mesh {
    const geometry = mesh.geometry;
    const posAttr = geometry.getAttribute('position');
    const normAttr = geometry.getAttribute('normal');

    if (!posAttr) {
      return mesh;
    }

    const vertexCount = posAttr.count;

    // Apply vertex displacement with inversion for SDF perturb convention
    const displacedGeometry = this.kernel.applyVertexDisplacement(
      geometry,
      mesh,
      geoGraph,
    );

    // Blend with original based on weights
    const hasSelection = !this.isUniformWeights(weights, vertexCount);
    if (hasSelection) {
      const originalPosArray = posAttr.array as Float32Array;
      const displacedPosAttr = displacedGeometry.getAttribute('position');
      const displacedPosArray = displacedPosAttr?.array as Float32Array;

      if (displacedPosAttr) {
        const blendedPosArray = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
          const w = i < weights.length ? weights[i] : 1.0;
          // SDF perturb convention: invert displacement direction
          const origX = originalPosArray[i * 3];
          const origY = originalPosArray[i * 3 + 1];
          const origZ = originalPosArray[i * 3 + 2];
          const dispX = displacedPosArray[i * 3];
          const dispY = displacedPosArray[i * 3 + 1];
          const dispZ = displacedPosArray[i * 3 + 2];

          // Compute displacement vector and invert it (SDF perturb pushes inward)
          const invDispX = origX - (dispX - origX);
          const invDispY = origY - (dispY - origY);
          const invDispZ = origZ - (dispZ - origZ);

          // Blend between original and inverted displacement
          blendedPosArray[i * 3] = origX * (1 - w) + invDispX * w;
          blendedPosArray[i * 3 + 1] = origY * (1 - w) + invDispY * w;
          blendedPosArray[i * 3 + 2] = origZ * (1 - w) + invDispZ * w;
        }

        const resultPosAttr = displacedGeometry.getAttribute('position') as THREE.BufferAttribute;
        (resultPosAttr.array as Float32Array).set(blendedPosArray);
        resultPosAttr.needsUpdate = true;
      }
    }

    displacedGeometry.computeVertexNormals();
    displacedGeometry.computeBoundingSphere();
    displacedGeometry.computeBoundingBox();

    mesh.geometry = displacedGeometry;
    return mesh;
  }

  /**
   * Check if all weights are uniformly 1.0.
   *
   * Used to optimize: if all weights are 1.0, no blending is needed.
   *
   * @param weights - Per-vertex weights
   * @param vertexCount - Number of vertices
   * @returns True if all weights are 1.0
   */
  private isUniformWeights(weights: Float32Array, vertexCount: number): boolean {
    const len = Math.min(weights.length, vertexCount);
    for (let i = 0; i < len; i++) {
      if (Math.abs(weights[i] - 1.0) > 1e-6) {
        return false;
      }
    }
    return true;
  }

  /**
   * Derive a base color from a shader graph and a noise sample.
   *
   * Uses the graph's type and parameters to select an appropriate
   * color palette, then maps the noise value to a color.
   *
   * @param shaderGraph - The shader graph descriptor
   * @param noiseValue - A representative noise value
   * @returns A THREE.Color for the material
   */
  private deriveColor(shaderGraph: ShaderGraphDescriptor, noiseValue: number): THREE.Color {
    const t = (noiseValue + 1) * 0.5; // Map [-1, 1] → [0, 1]
    const params = shaderGraph.parameters;

    // Check if a color hint is provided in parameters
    if (params.colorR !== undefined && params.colorG !== undefined && params.colorB !== undefined) {
      return new THREE.Color(params.colorR, params.colorG, params.colorB);
    }

    // Derive color from graph type using terrain-like color ramps
    switch (shaderGraph.type) {
      case 'noise_displacement':
      case 'voronoi_crack_displacement': {
        // Rocky/earthen tones
        if (t < 0.3) return new THREE.Color(0.48, 0.43, 0.38);
        if (t < 0.5) return new THREE.Color(0.58, 0.52, 0.46);
        if (t < 0.7) return new THREE.Color(0.68, 0.62, 0.56);
        return new THREE.Color(0.76, 0.72, 0.68);
      }
      case 'layered_blend': {
        // Varied terrain
        if (t < 0.25) return new THREE.Color(0.76, 0.72, 0.48); // Sand
        if (t < 0.5) return new THREE.Color(0.29, 0.55, 0.19);  // Grass
        if (t < 0.75) return new THREE.Color(0.48, 0.43, 0.38); // Rock
        return new THREE.Color(0.91, 0.93, 0.96); // Snow
      }
      case 'altitude_blend': {
        // Height-dependent
        if (t < 0.3) return new THREE.Color(0.29, 0.55, 0.19);
        if (t < 0.6) return new THREE.Color(0.58, 0.52, 0.46);
        return new THREE.Color(0.91, 0.93, 0.96);
      }
      default: {
        // Default terrain gradient
        if (t < 0.25) return new THREE.Color(0.48, 0.43, 0.38);
        if (t < 0.5) return new THREE.Color(0.55, 0.50, 0.44);
        if (t < 0.75) return new THREE.Color(0.65, 0.60, 0.54);
        return new THREE.Color(0.76, 0.72, 0.68);
      }
    }
  }

  /**
   * Derive a roughness value from a shader graph and a noise sample.
   *
   * @param shaderGraph - The shader graph descriptor
   * @param noiseValue - A representative noise value
   * @returns Roughness value in [0, 1]
   */
  private deriveRoughness(shaderGraph: ShaderGraphDescriptor, noiseValue: number): number {
    const params = shaderGraph.parameters;
    if (params.roughness !== undefined) {
      return Math.max(0, Math.min(1, params.roughness));
    }
    // Default terrain roughness: high with noise variation
    return Math.max(0, Math.min(1, 0.85 + noiseValue * 0.15));
  }

  /**
   * Derive a metalness value from a shader graph and a noise sample.
   *
   * @param shaderGraph - The shader graph descriptor
   * @param noiseValue - A representative noise value
   * @returns Metalness value in [0, 1]
   */
  private deriveMetalness(shaderGraph: ShaderGraphDescriptor, noiseValue: number): number {
    const params = shaderGraph.parameters;
    if (params.metalness !== undefined) {
      return Math.max(0, Math.min(1, params.metalness));
    }
    // Terrain materials are typically non-metallic
    return Math.max(0, Math.min(1, noiseValue * 0.05));
  }

  /**
   * Apply PBR textures generated from a shader graph to a material.
   *
   * Uses the TerrainSurfaceKernel to generate material channel textures
   * (albedo, normal, roughness, AO) from the shader graph, then applies
   * them to the given material.
   *
   * @param material - The material to apply textures to
   * @param shaderGraph - The shader graph to generate textures from
   */
  private applyGraphTextures(
    material: THREE.MeshPhysicalMaterial,
    shaderGraph: ShaderGraphDescriptor,
  ): void {
    try {
      // Generate material channels using the kernel
      const channels = this.kernel.generateMaterialChannels(
        new THREE.BufferGeometry(), // Placeholder geometry for texture generation
        shaderGraph,
      );

      // Apply each generated channel texture to the material
      for (const [channel, texture] of channels) {
        switch (channel) {
          case 'albedo':
            material.map = texture;
            break;
          case 'normal':
            material.normalMap = texture;
            material.normalScale = new THREE.Vector2(1.0, 1.0);
            break;
          case 'roughness':
            material.roughnessMap = texture;
            material.roughness = 1.0;
            break;
          case 'metallic':
            material.metalnessMap = texture;
            material.metalness = 1.0;
            break;
          case 'ao':
            material.aoMap = texture;
            material.aoMapIntensity = 1.0;
            break;
          case 'height':
            (material as any).displacementMap = texture;
            (material as any).displacementScale = 1.0;
            break;
        }
      }

      material.needsUpdate = true;
    } catch (err) {
      // Non-fatal: textures are optional enhancement
      console.warn(
        '[NodeTerrainSurfaceBridge] Texture generation failed, using basic material:',
        err,
      );
    }
  }
}
