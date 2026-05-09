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
import { TerrainSurfaceKernel } from '@/terrain/surface/TerrainSurfaceKernel';
import {
  TerrainSurfaceRegistry,
  SurfaceType,
  getEffectiveSurfaceType,
  type SurfaceAttributeType,
} from '@/terrain/surface/SurfaceRegistry';
import { TerrainTagSystem, type TagResult } from '@/terrain/tags';
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
  /** TerrainSurfaceKernel for SDF-level perturbation */
  private surfaceKernel: TerrainSurfaceKernel;
  /** TerrainTagSystem for face-level tag generation */
  private tagSystem: TerrainTagSystem;

  /**
   * Create a new TwoPhaseTerrainPipeline.
   *
   * @param config - Pipeline configuration (defaults to DEFAULT_TWO_PHASE_PIPELINE_CONFIG)
   */
  constructor(config: Partial<TwoPhasePipelineConfig> = {}) {
    this.config = { ...DEFAULT_TWO_PHASE_PIPELINE_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
    this.noise = new NoiseUtils(this.config.seed);
    this.surfaceKernel = new TerrainSurfaceKernel({ seed: this.config.seed });
    this.tagSystem = new TerrainTagSystem();
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

    // Create surface registry and sample surface templates
    const surfaceRegistry = this.createSurfaceRegistry();
    surfaceRegistry.sampleSurfaceTemplates();

    // --- SDF Perturbation Before Meshing (surfaces_into_sdf) ---
    // Apply SDF perturbation from SDFPerturb surface templates to the SDF grid
    // BEFORE extracting the isosurface. This modifies the isosurface shape
    // directly, avoiding the "floating rocks" artifact that occurs when
    // displacement is only applied as vertex displacement after meshing.
    const sdfData = sdf.data;
    const gridDimensions = sdf.gridSize;
    const perturbedSDFData = this.surfacesIntoSDF(sdfData, gridDimensions, bounds, surfaceRegistry);

    // Apply perturbed SDF data back to the SDF for meshing.
    // This re-mesh step is critical: it ensures the mesh topology matches
    // the perturbed isosurface, so surface details like cracks and rocky
    // outcrops are part of the actual geometry, not just vertex offsets.
    sdf.data.set(perturbedSDFData);

    // Extract isosurface from the perturbed SDF (Marching Cubes)
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

    // --- Apply SDF perturbation from surface templates before fine meshing ---
    // Re-apply SDF perturbation at fine resolution for consistent detail
    const surfaceRegistry = this.createSurfaceRegistry();
    surfaceRegistry.sampleSurfaceTemplates();
    const fineSdfData = fineSdf.data;
    const fineGridDimensions = fineSdf.gridSize;
    const perturbedFineSDFData = this.surfacesIntoSDF(
      fineSdfData, fineGridDimensions, bounds, surfaceRegistry,
    );

    // Apply perturbed SDF data back to the fine SDF for meshing
    fineSdf.data.set(perturbedFineSDFData);

    // Extract isosurface from the perturbed fine SDF
    const geometry = extractIsosurface(fineSdf, 0);

    // --- Transfer attributes from coarse to fine mesh using spatial hashing ---
    // This replaces the O(V_fine × V_coarse) linear search with O(V_fine) amortized
    if (geometry.getAttribute('position') && geometry.getAttribute('position').count > 0) {
      const finePosArray = geometry.getAttribute('position').array as Float32Array;
      const fineVertexCount = geometry.getAttribute('position').count;

      // Get coarse mesh positions and attributes
      const coarsePosAttr = coarseResult.mesh.geometry.getAttribute('position');
      if (coarsePosAttr && coarsePosAttr.count > 0) {
        const coarsePosArray = coarsePosAttr.array as Float32Array;
        const coarseAttrs = terrainData.attributes;

        // Transfer attributes efficiently using spatial hashing
        const transferredAttrs = this.transferAttributes(
          coarsePosArray,
          coarseAttrs,
          finePosArray,
          fineVertexCount,
        );

        // Apply transferred displacement from coarse material assignments
        const transferredDisplacement = transferredAttrs.get('materialId');
        if (transferredDisplacement) {
          // Apply displacement along normals for vertices that have material data
          const normalArray = geometry.getAttribute('normal')
            ? (geometry.getAttribute('normal').array as Float32Array)
            : null;

          // For each fine vertex, look up the nearest coarse displacement
          const coarseVertexCount = coarsePosArray.length / 3;
          const cellSize = this.config.coarseResolution * 2;
          const spatialHash = this.buildSpatialHash(coarsePosArray, coarseVertexCount, cellSize);

          // Build displacement array from coarse material assignments
          const coarseDisplacements = new Float32Array(coarseVertexCount);
          if (coarsePosAttr.count > 0) {
            for (let ci = 0; ci < coarseVertexCount; ci++) {
              const coarsePoint = new THREE.Vector3(
                coarsePosArray[ci * 3],
                coarsePosArray[ci * 3 + 1],
                coarsePosArray[ci * 3 + 2],
              );
              let nearestDisplacement = 0;
              let nearestDist = Infinity;
              for (const assignment of materialAssignments.values()) {
                const dist = coarsePoint.distanceTo(assignment.position);
                if (dist < nearestDist) {
                  nearestDist = dist;
                  nearestDisplacement = assignment.displacement;
                }
              }
              coarseDisplacements[ci] = nearestDisplacement;
            }

            for (let i = 0; i < fineVertexCount; i++) {
              const position = new THREE.Vector3(
                finePosArray[i * 3],
                finePosArray[i * 3 + 1],
                finePosArray[i * 3 + 2],
              );
              const nearestIdx = this.findNearestVertex(
                position, spatialHash, coarsePosArray, cellSize,
              );
              if (nearestIdx >= 0) {
                const disp = coarseDisplacements[nearestIdx] * 0.5;
                if (normalArray) {
                  const nx = normalArray[i * 3];
                  const ny = normalArray[i * 3 + 1];
                  const nz = normalArray[i * 3 + 2];
                  finePosArray[i * 3] += nx * disp;
                  finePosArray[i * 3 + 1] += ny * disp;
                  finePosArray[i * 3 + 2] += nz * disp;
                } else {
                  finePosArray[i * 3 + 1] += disp;
                }
              }
            }
          }

          geometry.getAttribute('position').needsUpdate = true;
          geometry.computeVertexNormals();

          // Store transferred attributes on the fine geometry
          for (const [attrName, values] of transferredAttrs) {
            geometry.setAttribute(attrName, new THREE.BufferAttribute(values, 1));
          }
        }
      }
    }

    // --- Water-Covered Annotation ---
    // After coarse terrain: evaluate waterbody SDF at each vertex
    // and tag vertices covered by water with liquidCovered attribute.
    // This drives underwater vs. above-water material selection.
    const waterPlaneHeight = 0; // Default sea level
    const waterElement = terrainData.registry.getEnabled().find(
      (el: { name: string }) => el.name === 'Waterbody',
    );
    if (waterElement) {
      const posAttr = geometry.getAttribute('position');
      if (posAttr && posAttr.count > 0) {
        const posArray = posAttr.array as Float32Array;
        const vertexCount = posAttr.count;
        const liquidCovered = this.annotateWaterCovered(posArray, vertexCount, waterPlaneHeight);
        geometry.setAttribute('liquidCovered', new THREE.BufferAttribute(liquidCovered, 1));
      }
    }

    // --- Camera-Adaptive LOD ---
    // Use camera frustum and pixel budget to compute adaptive resolution.
    // Terrain within the camera FOV gets higher resolution, outside gets lower.
    const posAttr = geometry.getAttribute('position');
    if (posAttr && cameras.length > 0) {
      const vertexCount = posAttr.count;
      const lodLevels = new Float32Array(vertexCount);
      const posArray = posAttr.array as Float32Array;

      // Compute adaptive resolution from the first camera
      let adaptiveRes: { inViewResolution: number; outViewResolution: number };
      try {
        // Create a temporary perspective camera from position data
        const tempCamera = new THREE.PerspectiveCamera(60, 1.0, 0.1, 1000);
        tempCamera.position.copy(cameras[0]);
        adaptiveRes = this.computeCameraAdaptiveResolution(
          tempCamera,
          this.config.fineResolution,
          1000000, // 1M pixel budget
        );
      } catch {
        adaptiveRes = {
          inViewResolution: this.config.fineResolution,
          outViewResolution: this.config.coarseResolution,
        };
      }

      for (let i = 0; i < vertexCount; i++) {
        const point = new THREE.Vector3(
          posArray[i * 3],
          posArray[i * 3 + 1],
          posArray[i * 3 + 2],
        );

        // Check if point is roughly in the camera's view
        let minDist = Infinity;
        for (const cam of cameras) {
          minDist = Math.min(minDist, point.distanceTo(cam));
        }

        // Use in-view or out-of-view resolution based on distance
        const isLikelyInView = minDist < 50; // Simplified frustum check
        const effectiveRes = isLikelyInView ? adaptiveRes.inViewResolution : adaptiveRes.outViewResolution;

        // LOD level: 0 = finest, 1 = medium, 2 = coarse
        const lodT = (effectiveRes - this.config.fineResolution) /
                     (this.config.coarseResolution - this.config.fineResolution);
        lodLevels[i] = Math.min(2, Math.floor(lodT * 3));
      }

      geometry.setAttribute('lodLevel', new THREE.BufferAttribute(lodLevels, 1));
    }

    // --- Bake ocean displacement maps ---
    // If there's a waterbody element, compute displacement maps for the water surface
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

    // --- Tag Terrain ---
    // After fine terrain: convert per-vertex element tags to per-face TAG_* attributes.
    // Uses facewise mean with thresholds (matching Infinigen's tag_terrain()).
    const tagResult = this.tagTerrain(geometry);

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

  // =====================================================================
  // SDF Perturbation Before Meshing (surfaces_into_sdf)
  // =====================================================================

  /**
   * Convert SDFPerturb surface templates to SDF displacement functions
   * and apply them to the SDF grid before meshing.
   *
   * Matches Infinigen's `surfaces_into_sdf()` — this is the critical step
   * that creates realistic terrain detail at the SDF level. When surfaces
   * modify the isosurface shape before meshing, the resulting geometry
   * avoids the "floating rocks" artifact that occurs when displacement
   * is only applied after meshing as vertex displacement.
   *
   * The process:
   * 1. Get SDFPerturb attribute types from the surface registry
   * 2. For each SDFPerturb surface, compute displacement at each grid point
   * 3. Apply the SDF perturbation formula: modified_sdf = original - displacement * scale
   * 4. Return the modified SDF grid for re-meshing
   *
   * @param sdfGrid - The original SDF grid as a flat Float32Array (XYZ-major order)
   * @param gridDimensions - The dimensions of the SDF grid [dimX, dimY, dimZ]
   * @param bounds - The axis-aligned bounding box of the SDF volume in world space
   * @param surfaceRegistry - The terrain surface registry with sampled surface templates
   * @returns A new Float32Array with SDF perturbation applied. The original is NOT modified.
   */
  private surfacesIntoSDF(
    sdfGrid: Float32Array,
    gridDimensions: [number, number, number],
    bounds: THREE.Box3,
    surfaceRegistry: TerrainSurfaceRegistry,
  ): Float32Array {
    const sdfPerturbAttrs = surfaceRegistry.getSDFPerturbAttributes();

    // If no SDFPerturb surfaces, return a copy of the original grid
    if (sdfPerturbAttrs.length === 0) {
      return new Float32Array(sdfGrid);
    }

    const [dimX, dimY, dimZ] = gridDimensions;
    const totalPoints = dimX * dimY * dimZ;

    if (sdfGrid.length < totalPoints) {
      console.warn(
        '[TwoPhaseTerrainPipeline] SDF grid size mismatch in surfacesIntoSDF: expected',
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

    // Collect all SDFPerturb templates
    const perturbTemplates = sdfPerturbAttrs
      .map((attrType) => surfaceRegistry.getSurface(attrType))
      .filter((t): t is NonNullable<typeof t> => t !== undefined && t.displacement !== null);

    if (perturbTemplates.length === 0) {
      return result;
    }

    // Evaluate displacement from each SDFPerturb template at each grid point
    for (let iz = 0; iz < dimZ; iz++) {
      for (let iy = 0; iy < dimY; iy++) {
        for (let ix = 0; ix < dimX; ix++) {
          const gridIndex = ix + iy * dimX + iz * dimX * dimY;

          // Map grid coordinates to world-space position
          const worldX = bounds.min.x + ix * stepX;
          const worldY = bounds.min.y + iy * stepY;
          const worldZ = bounds.min.z + iz * stepZ;
          const position = new THREE.Vector3(worldX, worldY, worldZ);

          // Sum displacement from all SDFPerturb surfaces
          let totalDisplacement = 0;
          for (const template of perturbTemplates) {
            totalDisplacement += template.computeDisplacement(position, this.noise);
          }

          // Apply SDF perturbation formula:
          // modified_sdf = original_sdf - displacement * scale
          // This pushes the isosurface outward where displacement is positive,
          // creating realistic rocky detail and crevices in the SDF domain.
          result[gridIndex] = sdfGrid[gridIndex] - totalDisplacement;
        }
      }
    }

    return result;
  }

  // =====================================================================
  // Spatial Hash for Efficient Attribute Transfer
  // =====================================================================

  /**
   * Build a spatial hash grid for efficient nearest-vertex lookup.
   *
   * Replaces the O(V×A) linear search for nearest material assignments
   * with an O(V) amortized approach using spatial hashing. Each vertex
   * position is quantized into a grid cell, and vertices within the
   * same cell (and neighboring cells) can be found in constant time.
   *
   * @param positions - Flat Float32Array of vertex positions [x0,y0,z0, x1,y1,z1, ...]
   * @param vertexCount - Number of vertices in the positions array
   * @param cellSize - Size of each spatial hash cell (should match the coarse resolution)
   * @returns A Map from cell key strings to arrays of vertex indices
   */
  private buildSpatialHash(
    positions: Float32Array,
    vertexCount: number,
    cellSize: number,
  ): Map<string, number[]> {
    const hashGrid = new Map<string, number[]>();

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // Quantize position to cell coordinates
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const cz = Math.floor(z / cellSize);
      const key = `${cx},${cy},${cz}`;

      if (!hashGrid.has(key)) {
        hashGrid.set(key, []);
      }
      hashGrid.get(key)!.push(i);
    }

    return hashGrid;
  }

  /**
   * Find the nearest vertex in a spatial hash grid.
   *
   * Searches the cell containing the query position and all 26 neighboring
   * cells to find the closest vertex. Falls back to expanding the search
   * radius if no vertices are found in the immediate neighborhood.
   *
   * @param position - The query position to find the nearest vertex for
   * @param spatialHash - The spatial hash grid built by buildSpatialHash
   * @param positions - Flat Float32Array of vertex positions
   * @param cellSize - Size of each spatial hash cell
   * @returns The index of the nearest vertex, or -1 if not found
   */
  private findNearestVertex(
    position: THREE.Vector3,
    spatialHash: Map<string, number[]>,
    positions: Float32Array,
    cellSize: number,
  ): number {
    let nearestIndex = -1;
    let nearestDistSq = Infinity;

    // Search in a 3×3×3 neighborhood around the query cell
    const cx = Math.floor(position.x / cellSize);
    const cy = Math.floor(position.y / cellSize);
    const cz = Math.floor(position.z / cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const vertices = spatialHash.get(key);
          if (!vertices) continue;

          for (const vIdx of vertices) {
            const vx = positions[vIdx * 3];
            const vy = positions[vIdx * 3 + 1];
            const vz = positions[vIdx * 3 + 2];

            const distSq = (position.x - vx) ** 2 +
                           (position.y - vy) ** 2 +
                           (position.z - vz) ** 2;

            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              nearestIndex = vIdx;
            }
          }
        }
      }
    }

    // If nothing found in the 3×3×3 neighborhood, expand search
    if (nearestIndex === -1) {
      for (const vertices of spatialHash.values()) {
        for (const vIdx of vertices) {
          const vx = positions[vIdx * 3];
          const vy = positions[vIdx * 3 + 1];
          const vz = positions[vIdx * 3 + 2];

          const distSq = (position.x - vx) ** 2 +
                         (position.y - vy) ** 2 +
                         (position.z - vz) ** 2;

          if (distSq < nearestDistSq) {
            nearestDistSq = distSq;
            nearestIndex = vIdx;
          }
        }
      }
    }

    return nearestIndex;
  }

  /**
   * Transfer material and attribute data from coarse to fine mesh
   * using spatial hashing for efficiency.
   *
   * In the original Infinigen pipeline, the coarse terrain phase establishes
   * material assignments (materialId, surfaceTemplate, displacement), and
   * these must be transferred to the fine mesh vertices. The naive approach
   * is O(V_fine × V_coarse) linear search; this method uses spatial hashing
   * to achieve O(V_fine) amortized lookup.
   *
   * @param coarsePositions - Flat Float32Array of coarse mesh vertex positions
   * @param coarseAttributes - Map of attribute name to Float32Array values on the coarse mesh
   * @param finePositions - Flat Float32Array of fine mesh vertex positions
   * @param fineVertexCount - Number of vertices in the fine mesh
   * @returns A Map of attribute name to Float32Array with transferred values for the fine mesh
   */
  private transferAttributes(
    coarsePositions: Float32Array,
    coarseAttributes: Map<string, Float32Array>,
    finePositions: Float32Array,
    fineVertexCount: number,
  ): Map<string, Float32Array> {
    const result = new Map<string, Float32Array>();

    // Initialize result arrays
    for (const [attrName, coarseValues] of coarseAttributes) {
      const fineValues = new Float32Array(fineVertexCount);
      result.set(attrName, fineValues);
    }

    if (coarseAttributes.size === 0 || fineVertexCount === 0) {
      return result;
    }

    // Determine cell size from coarse mesh spacing (use config coarse resolution)
    const cellSize = this.config.coarseResolution * 2;
    const coarseVertexCount = coarsePositions.length / 3;

    // Build spatial hash from coarse mesh vertices
    const spatialHash = this.buildSpatialHash(coarsePositions, coarseVertexCount, cellSize);

    // For each fine mesh vertex, find nearest coarse vertex and transfer attributes
    for (let i = 0; i < fineVertexCount; i++) {
      const position = new THREE.Vector3(
        finePositions[i * 3],
        finePositions[i * 3 + 1],
        finePositions[i * 3 + 2],
      );

      const nearestIdx = this.findNearestVertex(
        position,
        spatialHash,
        coarsePositions,
        cellSize,
      );

      if (nearestIdx >= 0) {
        // Transfer each attribute from the nearest coarse vertex
        for (const [attrName, coarseValues] of coarseAttributes) {
          const fineValues = result.get(attrName);
          if (fineValues && nearestIdx < coarseValues.length) {
            fineValues[i] = coarseValues[nearestIdx];
          }
        }
      }
    }

    return result;
  }

  // =====================================================================
  // Water-Covered Annotation
  // =====================================================================

  /**
   * Annotate vertices covered by water.
   *
   * After coarse terrain generation, evaluates the waterbody SDF at each
   * vertex position. Vertices whose Y position is below the water plane
   * height are tagged with `liquidCovered = 1.0`. This drives underwater
   * vs. above-water material selection in downstream rendering.
   *
   * Matches the original Infinigen's water annotation step where the
   * `LiquidCovered` attribute is set based on the water plane height
   * relative to terrain vertex heights.
   *
   * @param positions - Flat Float32Array of vertex positions [x0,y0,z0, x1,y1,z1, ...]
   * @param vertexCount - Number of vertices
   * @param waterPlaneHeight - The Y coordinate of the water surface plane
   * @returns Float32Array of liquidCovered values (1.0 = covered, 0.0 = not covered)
   */
  private annotateWaterCovered(
    positions: Float32Array,
    vertexCount: number,
    waterPlaneHeight: number,
  ): Float32Array {
    const liquidCovered = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      const y = positions[i * 3 + 1];
      // A vertex is covered by water if it is below the water plane
      liquidCovered[i] = y < waterPlaneHeight ? 1.0 : 0.0;
    }

    return liquidCovered;
  }

  // =====================================================================
  // Camera-Adaptive Resolution
  // =====================================================================

  /**
   * Compute camera-adaptive resolution for fine meshing.
   *
   * Determines the target resolution for the fine terrain mesh based on
   * the camera frustum and a pixel budget. Terrain within the camera's
   * field of view receives higher resolution (smaller voxels), while
   * terrain outside the FOV receives lower resolution (larger voxels).
   *
   * This replaces the simple distance-based LOD with a proper
   * frustum-aware approach that considers both the camera's field of
   * view and the target pixel budget to avoid over-tessellation of
   * off-screen terrain.
   *
   * @param camera - The THREE.Camera to compute adaptive resolution for
   * @param baseResolution - The base (finest) resolution in world units per voxel
   * @param targetPixelBudget - Target number of pixels the terrain should occupy on screen
   * @returns An object with inViewResolution and outViewResolution
   */
  private computeCameraAdaptiveResolution(
    camera: THREE.Camera,
    baseResolution: number,
    targetPixelBudget: number,
  ): { inViewResolution: number; outViewResolution: number } {
    // Compute the screen-space coverage of the terrain bounds
    const boundsConfig = this.config.bounds;
    const bounds = new THREE.Box3(
      new THREE.Vector3(boundsConfig.minX, boundsConfig.minY, boundsConfig.minZ),
      new THREE.Vector3(boundsConfig.maxX, boundsConfig.maxY, boundsConfig.maxZ),
    );
    const boundsSize = new THREE.Vector3();
    bounds.getSize(boundsSize);

    // Estimate the terrain's screen coverage based on camera FOV and distance
    let inViewResolution = baseResolution;
    let outViewResolution = baseResolution * 8; // 8× coarser outside FOV

    if (camera instanceof THREE.PerspectiveCamera) {
      // For perspective cameras, use FOV to compute pixel density
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      const aspect = camera.aspect || 1.0;

      // Approximate screen pixels per world unit at the terrain center
      const terrainCenter = new THREE.Vector3();
      bounds.getCenter(terrainCenter);
      const distToCenter = camera.position.distanceTo(terrainCenter);

      if (distToCenter > 0) {
        // Screen height in world units at the terrain center distance
        const screenHeightAtDist = 2 * Math.tan(fovRad / 2) * distToCenter;
        // Screen width in world units
        const screenWidthAtDist = screenHeightAtDist * aspect;

        // Total screen area in world units²
        const screenArea = screenHeightAtDist * screenWidthAtDist;

        // Terrain area in world units²
        const terrainArea = boundsSize.x * boundsSize.z;

        // Fraction of terrain visible on screen
        const visibleFraction = Math.min(1.0, terrainArea / screenArea);

        // Pixel budget per world unit²
        const pixelsPerWorldUnit = targetPixelBudget / Math.max(1, terrainArea * visibleFraction);

        // Target resolution: voxels per world unit should match pixel density
        // Higher pixelsPerWorldUnit → finer resolution (smaller voxels)
        const targetRes = 1.0 / Math.max(1, Math.sqrt(pixelsPerWorldUnit));

        inViewResolution = Math.max(baseResolution, Math.min(targetRes, this.config.coarseResolution));

        // Outside FOV: 4-8× coarser, but not worse than coarse resolution
        outViewResolution = Math.min(
          inViewResolution * 8,
          this.config.coarseResolution * 2,
        );
      }
    } else if (camera instanceof THREE.OrthographicCamera) {
      // For orthographic cameras, use the frustum dimensions directly
      const frustumWidth = camera.right - camera.left;
      const frustumHeight = camera.top - camera.bottom;
      const frustumArea = frustumWidth * frustumHeight;

      const pixelsPerWorldUnit = targetPixelBudget / Math.max(1, frustumArea);
      const targetRes = 1.0 / Math.max(1, Math.sqrt(pixelsPerWorldUnit));

      inViewResolution = Math.max(baseResolution, Math.min(targetRes, this.config.coarseResolution));
      outViewResolution = Math.min(inViewResolution * 4, this.config.coarseResolution * 2);
    }

    return { inViewResolution, outViewResolution };
  }

  // =====================================================================
  // Public SDF Perturbation API
  // =====================================================================

  /**
   * Apply SDF perturbation from surface templates.
   *
   * This is the key step that creates realistic terrain detail at the SDF
   * level before meshing. It converts SDFPerturb surface templates to
   * displacement functions and applies them to the SDF grid using the
   * TerrainSurfaceKernel's SDF perturbation capability.
   *
   * The formula applied at each grid point is:
   *   modified_sdf[i] = original_sdf[i] - displacement(position) * scale
   *
   * After this perturbation, the isosurface will be re-extracted, producing
   * a mesh where surface detail (cracks, crevices, rocky outcrops) is
   * embedded in the geometry itself rather than applied as vertex displacement.
   * This avoids the "floating rocks" artifact.
   *
   * If a selection mask is provided, the perturbation is modulated per-grid-point:
   *   modified_sdf[i] = original_sdf[i] - displacement(position) * scale * mask[i]
   *
   * @param sdfGrid - The original SDF grid as a flat Float32Array
   * @param gridDimensions - The dimensions of the SDF grid [dimX, dimY, dimZ]
   * @param bounds - The axis-aligned bounding box of the SDF volume
   * @param surfaceRegistry - The terrain surface registry with sampled surface templates
   * @param selectionMask - Optional per-grid-point mask in [0, 1] to modulate perturbation strength
   * @returns A new Float32Array with SDF perturbation applied
   */
  applySDFPerturbation(
    sdfGrid: Float32Array,
    gridDimensions: [number, number, number],
    bounds: THREE.Box3,
    surfaceRegistry: TerrainSurfaceRegistry,
    selectionMask?: Float32Array,
  ): Float32Array {
    // First, use the surface registry's SDFPerturb templates
    const perturbedSDF = this.surfacesIntoSDF(sdfGrid, gridDimensions, bounds, surfaceRegistry);

    // Then, apply the TerrainSurfaceKernel's SDF perturbation for any
    // additional displacement graphs (node-graph based perturbation)
    const kernelPerturbedSDF = this.surfaceKernel.applySDFPerturbation(
      perturbedSDF,
      gridDimensions,
      bounds,
    );

    // Apply selection mask if provided
    if (selectionMask) {
      const [dimX, dimY, dimZ] = gridDimensions;
      const totalPoints = dimX * dimY * dimZ;
      const result = new Float32Array(kernelPerturbedSDF);

      for (let i = 0; i < totalPoints && i < selectionMask.length; i++) {
        // Blend between original and perturbed based on the mask
        result[i] = sdfGrid[i] + (kernelPerturbedSDF[i] - sdfGrid[i]) * selectionMask[i];
      }

      return result;
    }

    return kernelPerturbedSDF;
  }

  /**
   * Apply terrain tags to a geometry.
   *
   * After fine terrain generation, converts per-vertex element tags and
   * attribute values into face-level boolean tag masks using the
   * TerrainTagSystem. This is the equivalent of Infinigen's tag_terrain()
   * function.
   *
   * The tagging process:
   * 1. Reads the ElementTag per-vertex attribute and converts to face-level
   *    via facewise intmax (a face gets the maximum element tag of its vertices)
   * 2. Creates TAG_<ElementTag.map[i]> face attributes for each distinct tag value
   * 3. Applies threshold-based tag conversion for continuous attributes
   *    (Cave, LiquidCovered, Eroded, Lava, Snow, Beach, etc.)
   *
   * @param geometry - The terrain geometry to tag (must have element and
   *   auxiliary attributes computed by computeAttributes)
   * @returns Tag result with the tagged geometry and tag dictionary
   */
  tagTerrain(geometry: THREE.BufferGeometry): TagResult {
    return this.tagSystem.tagTerrain(geometry);
  }

  /**
   * Get the TerrainSurfaceRegistry for this pipeline.
   *
   * The surface registry manages the mapping from attribute types to
   * surface material descriptors. It can be used to customize which
   * surfaces are applied to different terrain regions.
   *
   * @returns A new TerrainSurfaceRegistry seeded with the pipeline's seed
   */
  createSurfaceRegistry(): TerrainSurfaceRegistry {
    return new TerrainSurfaceRegistry(this.config.seed);
  }
}
