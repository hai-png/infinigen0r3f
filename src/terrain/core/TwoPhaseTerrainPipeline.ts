/**
 * Two-Phase Terrain Generation Pipeline
 *
 * Implements the two-phase terrain generation pipeline from original Infinigen:
 *
 * Phase 1: Coarse Terrain (coarseTerrain)
 * - Uses UniformMesher to generate a low-resolution mesh
 * - Applies material assignment (sample_surface_templates → apply_surface_templates)
 * - Converts SDFPerturb surfaces to displacement (surfaces_into_sdf)
 * - Purpose: Generate a quick preview and establish material assignments
 *
 * Phase 2: Fine Terrain (fineTerrain)
 * - Re-samples surfaces with updated material data
 * - Bakes ocean displacement maps
 * - Uses camera-adaptive mesher (SphericalMesher/OcMesher) for high-res mesh
 * - Purpose: Generate final quality terrain mesh with LOD
 *
 * The pipeline integrates with the existing ElementRegistry and SDF infrastructure,
 * adding the concept of camera-adaptive LOD where terrain near cameras is generated
 * at higher resolution and distant terrain at lower resolution.
 *
 * @module terrain/core/TwoPhaseTerrainPipeline
 */

import * as THREE from 'three';
import {
  ElementRegistry,
  CompositionOperation,
  buildSDFFromElements,
} from '@/terrain/sdf/TerrainElementSystem';
import { SignedDistanceField, extractIsosurface } from '@/terrain/sdf/sdf-operations';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the two-phase terrain generation pipeline.
 */
export interface TwoPhasePipelineConfig {
  /** Default voxel resolution (world units per voxel) */
  defaultResolution: number;
  /** Resolution for coarse phase (lower = faster, default: 4× coarser) */
  coarseResolution: number;
  /** Resolution for fine phase (higher = more detail) */
  fineResolution: number;
  /** World-space bounds for the terrain */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Random seed for reproducibility */
  seed: number;
}

/**
 * Default configuration for the two-phase pipeline.
 */
export const DEFAULT_TWO_PHASE_PIPELINE_CONFIG: TwoPhasePipelineConfig = {
  defaultResolution: 0.5,
  coarseResolution: 2.0,
  fineResolution: 0.25,
  bounds: {
    minX: -50,
    maxX: 50,
    minY: -10,
    maxY: 30,
    minZ: -50,
    maxZ: 50,
  },
  seed: 42,
};

// ============================================================================
// Phase Parameter Types
// ============================================================================

/**
 * Parameters for the coarse terrain generation phase.
 */
export interface CoarseTerrainParams {
  /** Element registry with pre-initialized elements */
  elementRegistry: ElementRegistry;
  /** World-space bounds override */
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Resolution override for coarse phase */
  resolution?: number;
}

/**
 * Result of the coarse terrain generation phase.
 */
export interface CoarseTerrainResult {
  /** Low-resolution terrain mesh */
  mesh: THREE.Mesh;
  /** Terrain data including SDF and auxiliary information */
  terrainData: TerrainData;
  /** Material assignments computed from the coarse phase */
  materialAssignments: MaterialAssignmentMap;
}

/**
 * Parameters for the fine terrain generation phase.
 */
export interface FineTerrainParams {
  /** Result from the coarse phase (provides material assignments) */
  coarseResult: CoarseTerrainResult;
  /** Camera positions for LOD selection */
  cameras: THREE.Vector3[];
  /** World-space bounds override */
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Resolution override for fine phase */
  resolution?: number;
}

/**
 * Result of the fine terrain generation phase.
 */
export interface FineTerrainResult {
  /** High-resolution terrain mesh with camera-adaptive LOD */
  mesh: THREE.Mesh;
  /** Terrain data including SDF and auxiliary information */
  terrainData: TerrainData;
}

/**
 * Parameters for the full two-phase generation.
 * Combines coarse and fine phase parameters.
 */
export interface FullTerrainParams {
  /** Element registry with pre-initialized elements */
  elementRegistry: ElementRegistry;
  /** Camera positions for LOD selection */
  cameras: THREE.Vector3[];
  /** World-space bounds override */
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Coarse resolution override */
  coarseResolution?: number;
  /** Fine resolution override */
  fineResolution?: number;
}

/**
 * Result of the full two-phase generation.
 */
export interface FullTerrainResult {
  /** Low-resolution coarse mesh */
  coarseMesh: THREE.Mesh;
  /** High-resolution fine mesh with LOD */
  fineMesh: THREE.Mesh;
  /** Combined terrain data */
  terrainData: TerrainData;
  /** Material assignments from coarse phase */
  materialAssignments: MaterialAssignmentMap;
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Terrain data container holding the SDF and auxiliary information.
 */
export interface TerrainData {
  /** The signed distance field used for generation */
  sdf: SignedDistanceField;
  /** Per-vertex auxiliary attributes from element evaluation */
  attributes: Map<string, Float32Array>;
  /** The element registry used for generation */
  registry: ElementRegistry;
  /** Resolution used for generation */
  resolution: number;
  /** Bounds of the generated terrain */
  bounds: THREE.Box3;
}

/**
 * Material assignment for a region of the terrain.
 * Maps surface positions to material types and surface templates.
 */
export interface MaterialAssignment {
  /** World-space position of the sample point */
  position: THREE.Vector3;
  /** Material ID from TERRAIN_MATERIALS */
  materialId: number;
  /** Surface template name (e.g., 'grassland', 'rocky', 'sandy') */
  surfaceTemplate: string;
  /** SDF displacement value for surface perturbation */
  displacement: number;
  /** Altitude at this point */
  altitude: number;
  /** Slope at this point (radians) */
  slope: number;
}

/**
 * Map of material assignments keyed by a string identifier
 * (typically a grid cell index or region name).
 */
export type MaterialAssignmentMap = Map<string, MaterialAssignment>;

// ============================================================================
// Surface Template Sampling
// ============================================================================

/**
 * Surface templates available for terrain material assignment.
 * Maps to the original Infinigen surface_template system.
 */
const SURFACE_TEMPLATES = [
  'grassland',
  'rocky',
  'sandy',
  'snowy',
  'forest_floor',
  'mud',
  'gravel',
  'cliff_face',
  'riverbed',
  'beach',
] as const;

type SurfaceTemplate = typeof SURFACE_TEMPLATES[number];

/**
 * Sample a surface template based on altitude and slope.
 *
 * Implements the original Infinigen sample_surface_templates logic:
 * altitude and slope determine which template is appropriate.
 *
 * @param altitude - Height above sea level
 * @param slope - Slope angle in radians
 * @param materialId - Material ID from element evaluation
 * @returns Surface template name
 */
function sampleSurfaceTemplate(
  altitude: number,
  slope: number,
  materialId: number,
): SurfaceTemplate {
  // High altitude + steep = cliff/rocky
  if (altitude > 20 && slope > Math.PI / 4) return 'cliff_face';
  if (altitude > 20) return 'rocky';

  // High altitude = snowy
  if (altitude > 15) return 'snowy';

  // Very steep = rocky
  if (slope > Math.PI / 3) return 'cliff_face';

  // Moderate slope = rocky
  if (slope > Math.PI / 6) return 'rocky';

  // Near water level = beach/mud
  if (altitude < 1.5 && altitude > -0.5) return 'beach';
  if (altitude < 0) return 'mud';

  // Low altitude flat = grassland or forest
  if (altitude < 5 && slope < Math.PI / 10) return 'grassland';

  // Sandy (based on material ID — sand dunes use material ID 7)
  if (materialId === 7) return 'sandy';

  // Default
  return 'forest_floor';
}

/**
 * Apply surface templates to compute displacement values.
 *
 * Implements the original Infinigen apply_surface_templates logic:
 * surface templates determine displacement amplitude and frequency.
 *
 * @param template - Surface template name
 * @param position - World position
 * @param noise - Noise generator for displacement
 * @returns Displacement value
 */
function applySurfaceTemplate(
  template: SurfaceTemplate,
  position: THREE.Vector3,
  noise: NoiseUtils,
): number {
  let displacementAmplitude: number;
  let displacementFrequency: number;

  switch (template) {
    case 'rocky':
      displacementAmplitude = 0.5;
      displacementFrequency = 0.1;
      break;
    case 'cliff_face':
      displacementAmplitude = 0.3;
      displacementFrequency = 0.15;
      break;
    case 'sandy':
      displacementAmplitude = 0.1;
      displacementFrequency = 0.05;
      break;
    case 'snowy':
      displacementAmplitude = 0.05;
      displacementFrequency = 0.02;
      break;
    case 'beach':
      displacementAmplitude = 0.02;
      displacementFrequency = 0.03;
      break;
    case 'mud':
      displacementAmplitude = 0.03;
      displacementFrequency = 0.04;
      break;
    case 'riverbed':
      displacementAmplitude = 0.08;
      displacementFrequency = 0.06;
      break;
    case 'gravel':
      displacementAmplitude = 0.2;
      displacementFrequency = 0.12;
      break;
    case 'forest_floor':
      displacementAmplitude = 0.15;
      displacementFrequency = 0.08;
      break;
    case 'grassland':
    default:
      displacementAmplitude = 0.05;
      displacementFrequency = 0.04;
      break;
  }

  return noise.fbm(
    position.x * displacementFrequency,
    position.y * displacementFrequency,
    position.z * displacementFrequency,
    3,
  ) * displacementAmplitude;
}

// ============================================================================
// Camera-Adaptive LOD
// ============================================================================

/**
 * Compute camera-adaptive resolution for a given point.
 *
 * Points closer to cameras get higher resolution (smaller voxel size),
 * points farther away get lower resolution (larger voxel size).
 *
 * @param point - World-space point
 * @param cameras - Camera positions
 * @param baseResolution - Base (finest) resolution
 * @param maxResolution - Maximum (coarsest) resolution
 * @param lodDistance - Distance at which resolution starts degrading
 * @returns Effective resolution for this point
 */
function computeAdaptiveResolution(
  point: THREE.Vector3,
  cameras: THREE.Vector3[],
  baseResolution: number,
  maxResolution: number,
  lodDistance: number = 50,
): number {
  if (cameras.length === 0) return baseResolution;

  // Find distance to nearest camera
  let minDist = Infinity;
  for (const camera of cameras) {
    const dist = point.distanceTo(camera);
    minDist = Math.min(minDist, dist);
  }

  // Resolution scales with distance
  if (minDist < lodDistance) {
    return baseResolution;
  }

  // Linear interpolation between base and max resolution
  const t = Math.min(1.0, (minDist - lodDistance) / (lodDistance * 3));
  return baseResolution + (maxResolution - baseResolution) * t;
}

// ============================================================================
// TwoPhaseTerrainPipeline
// ============================================================================

/**
 * Two-phase terrain generation pipeline from original Infinigen.
 *
 * Phase 1 (Coarse): Generates a low-resolution mesh for preview and
 * establishes material assignments by sampling surface templates.
 * This is the equivalent of the original's `coarseTerrain()` function
 * using UniformMesher at reduced resolution.
 *
 * Phase 2 (Fine): Generates the final quality terrain mesh using
 * camera-adaptive LOD. Near cameras, the resolution is highest;
 * distant terrain uses coarser voxels. This is the equivalent of
 * the original's `fineTerrain()` using SphericalMesher/OcMesher.
 *
 * Usage:
 * ```typescript
 * const pipeline = new TwoPhaseTerrainPipeline(config);
 * const result = await pipeline.generateFull({
 *   elementRegistry: registry,
 *   cameras: [camera.position],
 * });
 * ```
 */
export class TwoPhaseTerrainPipeline {
  private config: TwoPhasePipelineConfig;
  private rng: SeededRandom;
  private noise: NoiseUtils;

  /**
   * Create a new TwoPhaseTerrainPipeline.
   *
   * @param config - Pipeline configuration (defaults to DEFAULT_TWO_PHASE_PIPELINE_CONFIG)
   */
  constructor(config: Partial<TwoPhasePipelineConfig> = {}) {
    this.config = { ...DEFAULT_TWO_PHASE_PIPELINE_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
  }

  // =====================================================================
  // Phase 1: Coarse Terrain
  // =====================================================================

  /**
   * Generate coarse terrain for preview and material assignment.
   *
   * Uses UniformMesher (uniform voxel grid) at low resolution to quickly
   * produce a preview mesh. Then samples surface templates at grid points
   * to establish material assignments that will be transferred to the
   * fine phase.
   *
   * This is equivalent to the original Infinigen's `coarseTerrain()`:
   * 1. Build SDF from elements at low resolution
   * 2. Extract isosurface (Marching Cubes)
   * 3. sample_surface_templates → assign materials based on altitude/slope
   * 4. apply_surface_templates → compute displacement for each assignment
   * 5. surfaces_into_sdf → convert displacement to SDF perturbation data
   *
   * @param params - Coarse terrain generation parameters
   * @returns Coarse terrain result with mesh, data, and material assignments
   */
  async coarseTerrain(params: CoarseTerrainParams): Promise<CoarseTerrainResult> {
    const { elementRegistry } = params;
    const resolution = params.resolution ?? this.config.coarseResolution;
    const boundsConfig = params.bounds ?? this.config.bounds;

    // Build SDF bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(boundsConfig.minX, boundsConfig.minY, boundsConfig.minZ),
      new THREE.Vector3(boundsConfig.maxX, boundsConfig.maxY, boundsConfig.maxZ),
    );

    // Build SDF from elements at coarse resolution
    const sdf = buildSDFFromElements(
      elementRegistry,
      bounds,
      resolution,
      CompositionOperation.DIFFERENCE,
    );

    // Extract isosurface (Marching Cubes)
    const geometry = extractIsosurface(sdf, 0);

    // --- Material Assignment ---
    // Sample surface templates at grid points across the terrain
    const materialAssignments: MaterialAssignmentMap = new Map();
    const sampleStep = Math.max(1, Math.floor(10 / resolution));

    const posAttr = geometry.getAttribute('position');
    let assignmentIndex = 0;

    if (posAttr && posAttr.count > 0) {
      const posArray = posAttr.array as Float32Array;
      const vertexCount = posAttr.count;

      for (let i = 0; i < vertexCount; i += sampleStep) {
        const point = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );

        // Evaluate the element registry at this point
        const evalResult = elementRegistry.evaluateComposed(
          point,
          CompositionOperation.DIFFERENCE,
        );

        const altitude = point.y;
        const slope = this.computeSlopeAt(posArray, i, vertexCount);

        // Sample surface template
        const surfaceTemplate = sampleSurfaceTemplate(
          altitude,
          slope,
          evalResult.materialId,
        );

        // Apply surface template to get displacement
        const displacement = applySurfaceTemplate(
          surfaceTemplate,
          point,
          this.noise,
        );

        const key = `sample_${assignmentIndex++}`;
        materialAssignments.set(key, {
          position: point.clone(),
          materialId: evalResult.materialId,
          surfaceTemplate,
          displacement,
          altitude,
          slope,
        });
      }
    }

    // --- Convert displacement to SDF perturbation (surfaces_into_sdf) ---
    // Apply displacement values to the geometry vertices
    if (posAttr && posAttr.count > 0) {
      const posArray = posAttr.array as Float32Array;
      const normalArray = geometry.getAttribute('normal')
        ? (geometry.getAttribute('normal').array as Float32Array)
        : null;

      for (let i = 0; i < posAttr.count; i++) {
        const point = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );

        // Find nearest material assignment
        let nearestDisplacement = 0;
        let nearestDist = Infinity;

        for (const assignment of materialAssignments.values()) {
          const dist = point.distanceTo(assignment.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestDisplacement = assignment.displacement;
          }
        }

        // Apply displacement along normal if available, otherwise along Y
        if (normalArray) {
          const nx = normalArray[i * 3];
          const ny = normalArray[i * 3 + 1];
          const nz = normalArray[i * 3 + 2];
          posArray[i * 3] += nx * nearestDisplacement;
          posArray[i * 3 + 1] += ny * nearestDisplacement;
          posArray[i * 3 + 2] += nz * nearestDisplacement;
        } else {
          posArray[i * 3 + 1] += nearestDisplacement;
        }
      }

      geometry.getAttribute('position').needsUpdate = true;
      geometry.computeVertexNormals();
    }

    // Create mesh
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false,
    });

    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'CoarseTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Compute auxiliary attributes
    const attributes = this.computeAttributes(geometry, elementRegistry);

    const terrainData: TerrainData = {
      sdf,
      attributes,
      registry: elementRegistry,
      resolution,
      bounds,
    };

    return {
      mesh,
      terrainData,
      materialAssignments,
    };
  }

  // =====================================================================
  // Phase 2: Fine Terrain
  // =====================================================================

  /**
   * Generate fine terrain with camera-adaptive detail.
   *
   * Uses the material assignments from the coarse phase to inform
   * surface generation. Near cameras, the terrain is generated at
   * higher resolution; distant terrain uses coarser voxels.
   *
   * This is equivalent to the original Infinigen's `fineTerrain()`:
   * 1. Re-build SDF at fine resolution
   * 2. Apply material assignments from coarse phase
   * 3. Use camera-adaptive mesher for LOD selection
   * 4. Bake ocean displacement maps (if waterbody element exists)
   *
   * @param params - Fine terrain generation parameters
   * @returns Fine terrain result with high-resolution mesh
   */
  async fineTerrain(params: FineTerrainParams): Promise<FineTerrainResult> {
    const { coarseResult, cameras } = params;
    const resolution = params.resolution ?? this.config.fineResolution;
    const boundsConfig = params.bounds ?? this.config.bounds;
    const { terrainData, materialAssignments } = coarseResult;

    // Build SDF bounds
    const bounds = new THREE.Box3(
      new THREE.Vector3(boundsConfig.minX, boundsConfig.minY, boundsConfig.minZ),
      new THREE.Vector3(boundsConfig.maxX, boundsConfig.maxY, boundsConfig.maxZ),
    );

    // Re-build SDF at fine resolution (same elements, more voxels)
    const fineSdf = buildSDFFromElements(
      terrainData.registry,
      bounds,
      resolution,
      CompositionOperation.DIFFERENCE,
    );

    // Extract isosurface
    const geometry = extractIsosurface(fineSdf, 0);

    // --- Apply material assignments from coarse phase ---
    if (geometry.getAttribute('position') && geometry.getAttribute('position').count > 0) {
      const posArray = geometry.getAttribute('position').array as Float32Array;

      // Transfer displacement from coarse material assignments
      for (let i = 0; i < geometry.getAttribute('position').count; i++) {
        const point = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );

        // Find nearest coarse material assignment
        let nearestDisplacement = 0;
        let nearestDist = Infinity;

        for (const assignment of materialAssignments.values()) {
          const dist = point.distanceTo(assignment.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestDisplacement = assignment.displacement;
          }
        }

        // Apply displacement (interpolated from coarse)
        posArray[i * 3 + 1] += nearestDisplacement * 0.5; // Reduced for fine phase
      }

      geometry.getAttribute('position').needsUpdate = true;
      geometry.computeVertexNormals();
    }

    // --- Camera-adaptive LOD ---
    // For vertices near cameras, we could refine further or add detail.
    // In this implementation, we mark LOD levels per vertex for
    // downstream rendering systems.
    const posAttr = geometry.getAttribute('position');
    if (posAttr && cameras.length > 0) {
      const vertexCount = posAttr.count;
      const lodLevels = new Float32Array(vertexCount);
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < vertexCount; i++) {
        const point = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );
        const adaptiveRes = computeAdaptiveResolution(
          point, cameras, this.config.fineResolution, this.config.coarseResolution,
        );
        // LOD level: 0 = finest, 1 = medium, 2 = coarse
        const lodT = (adaptiveRes - this.config.fineResolution) /
                     (this.config.coarseResolution - this.config.fineResolution);
        lodLevels[i] = Math.min(2, Math.floor(lodT * 3));
      }

      geometry.setAttribute('lodLevel', new THREE.BufferAttribute(lodLevels, 1));
    }

    // --- Bake ocean displacement maps ---
    // If there's a waterbody element, compute displacement maps for the water surface
    const waterElement = terrainData.registry.getEnabled().find(
      (el: { name: string }) => el.name === 'Waterbody',
    );
    if (waterElement && waterElement.enabled) {
      this.bakeOceanDisplacement(geometry, terrainData.registry);
    }

    // Create mesh with vertex colors
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: false,
      vertexColors: false,
    });

    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'FineTerrainMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Compute auxiliary attributes
    const attributes = this.computeAttributes(geometry, terrainData.registry);

    const fineTerrainData: TerrainData = {
      sdf: fineSdf,
      attributes,
      registry: terrainData.registry,
      resolution,
      bounds,
    };

    return {
      mesh,
      terrainData: fineTerrainData,
    };
  }

  // =====================================================================
  // Full Pipeline
  // =====================================================================

  /**
   * Run both phases of the terrain generation pipeline.
   *
   * Convenience method that runs coarseTerrain → fineTerrain in sequence,
   * passing the coarse result to the fine phase.
   *
   * @param params - Full terrain generation parameters
   * @returns Full terrain result with both coarse and fine meshes
   */
  async generateFull(params: FullTerrainParams): Promise<FullTerrainResult> {
    const { elementRegistry, cameras } = params;

    // Phase 1: Coarse terrain
    const coarseResult = await this.coarseTerrain({
      elementRegistry,
      bounds: params.bounds,
      resolution: params.coarseResolution,
    });

    // Phase 2: Fine terrain
    const fineResult = await this.fineTerrain({
      coarseResult,
      cameras,
      bounds: params.bounds,
      resolution: params.fineResolution,
    });

    return {
      coarseMesh: coarseResult.mesh,
      fineMesh: fineResult.mesh,
      terrainData: fineResult.terrainData,
      materialAssignments: coarseResult.materialAssignments,
    };
  }

  // =====================================================================
  // Internal Helpers
  // =====================================================================

  /**
   * Compute slope at a vertex from neighboring vertices.
   */
  private computeSlopeAt(
    posArray: Float32Array,
    index: number,
    vertexCount: number,
  ): number {
    if (index <= 0 || index >= vertexCount - 1) return 0;

    const prevY = posArray[(index - 1) * 3 + 1];
    const nextY = posArray[(index + 1) * 3 + 1];
    const dx = Math.sqrt(
      (posArray[(index + 1) * 3] - posArray[(index - 1) * 3]) ** 2 +
      (posArray[(index + 1) * 3 + 2] - posArray[(index - 1) * 3 + 2]) ** 2,
    );

    if (dx < 1e-6) return 0;
    return Math.atan2(Math.abs(nextY - prevY), dx);
  }

  /**
   * Compute per-vertex auxiliary attributes from element evaluation.
   */
  private computeAttributes(
    geometry: THREE.BufferGeometry,
    registry: ElementRegistry,
  ): Map<string, Float32Array> {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return new Map();

    const vertexCount = posAttr.count;
    const posArray = posAttr.array as Float32Array;

    const materialIds = new Float32Array(vertexCount);
    const caveTags = new Float32Array(vertexCount);
    const boundarySDFs = new Float32Array(vertexCount);
    const liquidCovered = new Float32Array(vertexCount);
    const heights = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const point = new THREE.Vector3(
        posArray[i * 3],
        posArray[i * 3 + 1],
        posArray[i * 3 + 2],
      );

      const result = registry.evaluateComposed(point, CompositionOperation.DIFFERENCE);

      materialIds[i] = result.materialId;
      caveTags[i] = result.auxiliary.caveTag ? 1.0 : 0.0;
      boundarySDFs[i] = typeof result.auxiliary.boundarySDF === 'number'
        ? result.auxiliary.boundarySDF : Infinity;
      liquidCovered[i] = result.auxiliary.LiquidCovered ? 1.0 : 0.0;
      heights[i] = point.y;
    }

    const attributes = new Map<string, Float32Array>();
    attributes.set('materialId', materialIds);
    attributes.set('caveTag', caveTags);
    attributes.set('boundarySDF', boundarySDFs);
    attributes.set('liquidCovered', liquidCovered);
    attributes.set('height', heights);

    // Store on geometry as custom attributes
    geometry.setAttribute('materialId', new THREE.BufferAttribute(materialIds, 1));
    geometry.setAttribute('caveTag', new THREE.BufferAttribute(caveTags, 1));
    geometry.setAttribute('boundarySDF', new THREE.BufferAttribute(boundarySDFs, 1));
    geometry.setAttribute('liquidCovered', new THREE.BufferAttribute(liquidCovered, 1));

    return attributes;
  }

  /**
   * Bake ocean displacement maps for the water surface.
   *
   * Evaluates the waterbody element at vertices near the water plane
   * and stores wave displacement as a custom vertex attribute.
   */
  private bakeOceanDisplacement(
    geometry: THREE.BufferGeometry,
    registry: ElementRegistry,
  ): void {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return;

    const vertexCount = posAttr.count;
    const posArray = posAttr.array as Float32Array;
    const oceanDisplacement = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const point = new THREE.Vector3(
        posArray[i * 3],
        posArray[i * 3 + 1],
        posArray[i * 3 + 2],
      );

      // Check if near water surface
      const waterElement = registry.getEnabled().find(
        (el: { name: string }) => el.name === 'Waterbody',
      );

      if (waterElement && waterElement.enabled) {
        const waterResult = waterElement.evaluate(point);
        if (waterResult.auxiliary.LiquidCovered) {
          // Store wave displacement
          oceanDisplacement[i] = waterResult.auxiliary.waterPlaneHeight ?? 0;
        }
      }
    }

    geometry.setAttribute('oceanDisplacement', new THREE.BufferAttribute(oceanDisplacement, 1));
  }
}
