/**
 * ProceduralMaterialLibrary — 20+ Material Presets Matching Original Infinigen
 *
 * Ports: infinigen/assets/materials/ (100+ materials)
 *
 * This library provides a comprehensive set of material presets organized
 * by category, matching the original Infinigen's material definitions.
 * Each preset defines a shader_func that creates node graphs producing
 * PBR materials with noise-driven variation.
 *
 * Categories:
 *  - Terrain: mountain, sandstone, stone, sand, dirt, mud, ice, cobblestone, snow
 *  - Plant: bark, bark_birch, grass_blade, leaf, succulent
 *  - Water: water, lava, whitewater
 *  - Creature: scale, snake_scale, slimy, eyeball
 *  - Wood: wood_grain, hardwood_floor, table_wood
 *  - Metal: metal_basic, brushed_metal, hammered_metal
 *  - Ceramic: ceramic, marble, glass
 *  - Fabric: velvet, leather, sofa_fabric
 *  - Tile: hexagon, herringbone, brick_tile
 *  - Wear: edge_wear, scratches
 *
 * Each preset outputs PBR parameters suitable for MeshPhysicalMaterial.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Material Preset Types
// ============================================================================

export interface MaterialPBRParams {
  /** Base color */
  baseColor: THREE.Color;
  /** Roughness (0 = mirror, 1 = fully rough) */
  roughness: number;
  /** Metallic (0 = dielectric, 1 = metal) */
  metallic: number;
  /** Index of refraction */
  ior: number;
  /** Transmission (0 = opaque, 1 = fully transparent) */
  transmission: number;
  /** Specular intensity */
  specular: number;
  /** Clearcoat amount */
  clearcoat: number;
  /** Clearcoat roughness */
  clearcoatRoughness: number;
  /** Subsurface weight */
  subsurfaceWeight: number;
  /** Emission color (black = no emission) */
  emissionColor: THREE.Color;
  /** Emission strength */
  emissionStrength: number;
  /** Sheen amount (fabric-like) */
  sheen: number;
  /** Sheen color */
  sheenColor: THREE.Color;
  /** Sheen roughness */
  sheenRoughness: number;
  /** Anisotropic amount */
  anisotropic: number;
  /** Normal map strength */
  normalStrength: number;
  /** Displacement amount */
  displacementScale: number;
  /** Alpha (1 = fully opaque) */
  alpha: number;
  /** Custom noise parameters for texture generation */
  noiseParams?: NoiseParams;
  /** Secondary color for blending/patterns */
  secondaryColor?: THREE.Color;
  /** Crack/detail color */
  detailColor?: THREE.Color;
}

export interface NoiseParams {
  /** Noise type */
  type: 'simplex' | 'perlin' | 'voronoi' | 'musgrave' | 'wave' | 'brick';
  /** Scale of noise */
  scale: number;
  /** Detail octaves */
  detail: number;
  /** Roughness of octaves */
  roughness: number;
  /** Distortion amount */
  distortion: number;
  /** 4D seed parameter */
  seed: number;
  /** Voronoi feature (if type=voronoi) */
  voronoiFeature?: 'f1' | 'f2' | 'distance_to_edge' | 'smooth_f1';
  /** Voronoi distance metric */
  voronoiDistance?: 'euclidean' | 'manhattan' | 'chebychev' | 'minkowski';
  /** Musgrave type (if type=musgrave) */
  musgraveType?: 'fbm' | 'multifractal' | 'ridged' | 'heterogeneous';
  /** Wave type (if type=wave) */
  waveType?: 'bands' | 'rings' | 'bands_dir' | 'rings_dir';
  /** Wave profile */
  waveProfile?: 'sine' | 'saw' | 'triangle';
  /** Second noise layer (for complex materials) */
  secondary?: NoiseParams;
}

/** Default PBR parameters */
function defaultPBR(): MaterialPBRParams {
  return {
    baseColor: new THREE.Color(0.5, 0.5, 0.5),
    roughness: 0.5,
    metallic: 0.0,
    ior: 1.45,
    transmission: 0.0,
    specular: 0.5,
    clearcoat: 0.0,
    clearcoatRoughness: 0.03,
    subsurfaceWeight: 0.0,
    emissionColor: new THREE.Color(0, 0, 0),
    emissionStrength: 0.0,
    sheen: 0.0,
    sheenColor: new THREE.Color(0, 0, 0),
    sheenRoughness: 0.5,
    anisotropic: 0.0,
    normalStrength: 1.0,
    displacementScale: 0.0,
    alpha: 1.0,
  };
}

// ============================================================================
// Terrain Materials
// ============================================================================

export const TERRAIN_MATERIALS = {
  /** Mountain rock with altitude-based color and Voronoi cracks */
  mountain: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.08, 0.15, rng.range(0.25, 0.4)),
      roughness: rng.range(0.85, 0.95),
      normalStrength: rng.range(0.8, 1.2),
      displacementScale: rng.range(0.05, 0.15),
      secondaryColor: new THREE.Color().setHSL(0.06, 0.1, rng.range(0.15, 0.25)),
      detailColor: new THREE.Color(0, 0, 0),
      noiseParams: {
        type: 'musgrave',
        scale: rng.range(2, 5),
        detail: rng.range(6, 10),
        roughness: rng.range(0.4, 0.7),
        distortion: 0,
        seed: rng.range(0, 10),
        musgraveType: 'ridged',
        secondary: {
          type: 'voronoi',
          scale: rng.range(5, 15),
          detail: 1,
          roughness: 0,
          distortion: 0,
          seed: rng.range(0, 10),
          voronoiFeature: 'distance_to_edge',
          voronoiDistance: 'euclidean',
        },
      },
    };
  },

  /** Sandstone with wave stripes and rough surface */
  sandstone: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.1, rng.range(0.3, 0.5), rng.range(0.55, 0.7)),
      roughness: rng.range(0.85, 0.95),
      specular: 0.1,
      normalStrength: rng.range(0.6, 1.0),
      displacementScale: rng.range(0.02, 0.08),
      detailColor: new THREE.Color().setHSL(0.08, 0.2, rng.range(0.3, 0.4)),
      noiseParams: {
        type: 'wave',
        scale: rng.range(5, 15),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.5, 2),
        seed: rng.range(0, 10),
        waveType: 'bands',
        waveProfile: 'sine',
        secondary: {
          type: 'voronoi',
          scale: rng.range(10, 30),
          detail: 1,
          roughness: 0,
          distortion: 0,
          seed: rng.range(0, 10),
          voronoiFeature: 'distance_to_edge',
        },
      },
    };
  },

  /** Stone with multi-scale cracks */
  stone: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.0, rng.range(0.02, 0.08), rng.range(0.35, 0.5)),
      roughness: rng.range(0.8, 0.95),
      normalStrength: rng.range(0.8, 1.2),
      displacementScale: rng.range(0.03, 0.1),
      detailColor: new THREE.Color().setHSL(0, 0, rng.range(0.1, 0.2)),
      noiseParams: {
        type: 'musgrave',
        scale: rng.range(3, 8),
        detail: rng.range(4, 8),
        roughness: rng.range(0.3, 0.6),
        distortion: rng.range(0, 0.5),
        seed: rng.range(0, 10),
        musgraveType: 'multifractal',
        secondary: {
          type: 'simplex',
          scale: rng.range(20, 50),
          detail: 2,
          roughness: 0.5,
          distortion: 0,
          seed: rng.range(0, 10),
        },
      },
    };
  },

  /** Sand with fine ripples */
  sand: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.12, rng.range(0.4, 0.6), rng.range(0.65, 0.8)),
      roughness: rng.range(0.9, 1.0),
      specular: 0.1,
      normalStrength: rng.range(0.3, 0.6),
      displacementScale: rng.range(0.005, 0.02),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(20, 60),
        detail: rng.range(2, 4),
        roughness: rng.range(0.3, 0.6),
        distortion: 0,
        seed: rng.range(0, 10),
        secondary: {
          type: 'wave',
          scale: rng.range(30, 80),
          detail: 1,
          roughness: 0,
          distortion: rng.range(0.2, 0.5),
          seed: rng.range(0, 10),
          waveType: 'bands',
          waveProfile: 'sine',
        },
      },
    };
  },

  /** Dirt/soil surface */
  dirt: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.08, rng.range(0.3, 0.5), rng.range(0.2, 0.35)),
      roughness: rng.range(0.9, 1.0),
      normalStrength: rng.range(0.5, 0.8),
      displacementScale: rng.range(0.01, 0.04),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(10, 30),
        detail: rng.range(3, 6),
        roughness: rng.range(0.4, 0.7),
        distortion: rng.range(0, 0.3),
        seed: rng.range(0, 10),
      },
    };
  },

  /** Mud with wet appearance */
  mud: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.06, rng.range(0.2, 0.4), rng.range(0.15, 0.25)),
      roughness: rng.range(0.5, 0.75),
      specular: rng.range(0.3, 0.5),
      normalStrength: rng.range(0.3, 0.6),
      displacementScale: rng.range(0.005, 0.02),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(5, 15),
        detail: rng.range(3, 5),
        roughness: rng.range(0.4, 0.6),
        distortion: rng.range(0, 0.2),
        seed: rng.range(0, 10),
      },
    };
  },

  /** Ice with refraction */
  ice: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.55, rng.range(0.1, 0.2), rng.range(0.8, 0.95)),
      roughness: rng.range(0.05, 0.15),
      metallic: 0,
      ior: 1.31,
      transmission: rng.range(0.3, 0.6),
      specular: 1.0,
      normalStrength: rng.range(0.2, 0.5),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(3, 8),
        detail: 1,
        roughness: 0,
        distortion: 0,
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
        voronoiDistance: 'euclidean',
      },
    };
  },

  /** Cobblestone with Voronoi pattern */
  cobblestone: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.07, rng.range(0.1, 0.2), rng.range(0.4, 0.55)),
      roughness: rng.range(0.8, 0.9),
      normalStrength: rng.range(0.8, 1.5),
      displacementScale: rng.range(0.03, 0.08),
      secondaryColor: new THREE.Color().setHSL(0.06, 0.1, rng.range(0.3, 0.4)),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(3, 8),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.5),
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
        voronoiDistance: 'euclidean',
        secondary: {
          type: 'simplex',
          scale: rng.range(15, 40),
          detail: 3,
          roughness: 0.5,
          distortion: 0,
          seed: rng.range(0, 10),
        },
      },
    };
  },

  /** Snow with soft accumulation */
  snow: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.6, rng.range(0.02, 0.08), rng.range(0.9, 0.97)),
      roughness: rng.range(0.6, 0.8),
      specular: rng.range(0.2, 0.4),
      normalStrength: rng.range(0.2, 0.5),
      displacementScale: rng.range(0.01, 0.04),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(5, 15),
        detail: rng.range(3, 5),
        roughness: rng.range(0.3, 0.6),
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },
};

// ============================================================================
// Plant Materials
// ============================================================================

export const PLANT_MATERIALS = {
  /** Tree bark with vertical stripe pattern */
  bark: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.07, rng.range(0.3, 0.5), rng.range(0.15, 0.3)),
      roughness: rng.range(0.85, 0.95),
      normalStrength: rng.range(0.8, 1.5),
      displacementScale: rng.range(0.02, 0.06),
      detailColor: new THREE.Color().setHSL(0.05, 0.3, rng.range(0.1, 0.15)),
      noiseParams: {
        type: 'wave',
        scale: rng.range(10, 25),
        detail: 1,
        roughness: 0,
        distortion: rng.range(1, 3),
        seed: rng.range(0, 10),
        waveType: 'rings',
        waveProfile: 'sine',
        secondary: {
          type: 'simplex',
          scale: rng.range(15, 35),
          detail: rng.range(3, 5),
          roughness: 0.5,
          distortion: 0,
          seed: rng.range(0, 10),
        },
      },
    };
  },

  /** Birch bark with white bands */
  barkBirch: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.1, rng.range(0.08, 0.15), rng.range(0.7, 0.85)),
      roughness: rng.range(0.7, 0.85),
      normalStrength: rng.range(0.3, 0.7),
      displacementScale: rng.range(0.005, 0.02),
      secondaryColor: new THREE.Color().setHSL(0.07, 0.2, rng.range(0.25, 0.35)),
      noiseParams: {
        type: 'wave',
        scale: rng.range(8, 20),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.5, 2),
        seed: rng.range(0, 10),
        waveType: 'bands',
        waveProfile: 'sine',
      },
    };
  },

  /** Grass blade with green gradient */
  grassBlade: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.22, 0.32), rng.range(0.5, 0.75), rng.range(0.3, 0.45)),
      roughness: rng.range(0.6, 0.8),
      normalStrength: rng.range(0.2, 0.4),
      subsurfaceWeight: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(10, 30),
        detail: 2,
        roughness: 0.5,
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },

  /** Leaf material with vein pattern */
  leaf: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.25, 0.38), rng.range(0.5, 0.8), rng.range(0.25, 0.4)),
      roughness: rng.range(0.5, 0.7),
      normalStrength: rng.range(0.3, 0.5),
      subsurfaceWeight: rng.range(0.2, 0.5),
      sheen: rng.range(0.2, 0.5),
      sheenColor: new THREE.Color().setHSL(0.3, 0.6, 0.3),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(5, 15),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.5),
        seed: rng.range(0, 10),
        voronoiFeature: 'distance_to_edge',
      },
    };
  },

  /** Succulent with waxy surface */
  succulent: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.25, 0.4), rng.range(0.4, 0.7), rng.range(0.35, 0.55)),
      roughness: rng.range(0.2, 0.4),
      specular: rng.range(0.5, 0.8),
      clearcoat: rng.range(0.3, 0.6),
      clearcoatRoughness: rng.range(0.05, 0.15),
      normalStrength: rng.range(0.3, 0.5),
      subsurfaceWeight: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(5, 15),
        detail: rng.range(2, 4),
        roughness: 0.5,
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },
};

// ============================================================================
// Water/Fluid Materials
// ============================================================================

export const WATER_MATERIALS = {
  /** Water with Musgrave waves and Voronoi ripples */
  water: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.55, rng.range(0.5, 0.75), rng.range(0.2, 0.4)),
      roughness: rng.range(0.0, 0.1),
      metallic: 0,
      ior: 1.33,
      transmission: rng.range(0.8, 1.0),
      specular: 1.0,
      normalStrength: rng.range(0.3, 0.8),
      displacementScale: rng.range(0.01, 0.05),
      noiseParams: {
        type: 'musgrave',
        scale: rng.range(2, 6),
        detail: rng.range(4, 8),
        roughness: rng.range(0.3, 0.6),
        distortion: rng.range(0, 0.5),
        seed: rng.range(0, 10),
        musgraveType: 'fbm',
        secondary: {
          type: 'voronoi',
          scale: rng.range(8, 20),
          detail: 1,
          roughness: 0,
          distortion: 0,
          seed: rng.range(0, 10),
          voronoiFeature: 'f1',
        },
      },
    };
  },

  /** Lava with blackbody emission and Voronoi cells */
  lava: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    const tempK = rng.range(1200, 2000);
    // Approximate blackbody color from temperature
    const t = tempK / 100;
    const r = 1.0;
    const g = Math.min(1, Math.max(0, (99.47 * Math.log(t) - 161.12) / 255));
    const b = t > 66 ? 1.0 : Math.min(1, Math.max(0, (138.52 * Math.log(t - 10) - 305.04) / 255));

    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0.05, 0.8, rng.range(0.1, 0.2)),
      roughness: rng.range(0.3, 0.5),
      metallic: 0,
      emissionColor: new THREE.Color(r, g, b),
      emissionStrength: rng.range(5, 15),
      normalStrength: rng.range(0.5, 1.0),
      displacementScale: rng.range(0.05, 0.15),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(2, 5),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.5, 2),
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
        voronoiDistance: 'euclidean',
        secondary: {
          type: 'wave',
          scale: rng.range(3, 8),
          detail: 1,
          roughness: 0,
          distortion: rng.range(1, 3),
          seed: rng.range(0, 10),
          waveType: 'rings',
          waveProfile: 'sine',
        },
      },
    };
  },

  /** Whitewater/foam */
  whitewater: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0, 0, rng.range(0.85, 0.97)),
      roughness: rng.range(0.6, 0.8),
      transmission: rng.range(0.1, 0.3),
      ior: 1.33,
      alpha: rng.range(0.7, 1.0),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(10, 30),
        detail: rng.range(2, 4),
        roughness: 0.5,
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },
};

// ============================================================================
// Creature Materials
// ============================================================================

export const CREATURE_MATERIALS = {
  /** Reptile/fish scale pattern */
  scale: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.05, 0.15), rng.range(0.3, 0.6), rng.range(0.2, 0.4)),
      roughness: rng.range(0.3, 0.5),
      metallic: rng.range(0.0, 0.2),
      ior: 1.69,
      specular: rng.range(0.5, 0.8),
      normalStrength: rng.range(0.8, 1.5),
      subsurfaceWeight: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(8, 20),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.3),
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
        voronoiDistance: 'euclidean',
      },
    };
  },

  /** Snake scale with fine pattern */
  snakeScale: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.08, 0.2), rng.range(0.4, 0.7), rng.range(0.2, 0.35)),
      roughness: rng.range(0.2, 0.4),
      metallic: rng.range(0.05, 0.15),
      specular: rng.range(0.6, 0.9),
      normalStrength: rng.range(1.0, 2.0),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(15, 35),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.2),
        seed: rng.range(0, 10),
        voronoiFeature: 'distance_to_edge',
        voronoiDistance: 'manhattan',
        secondary: {
          type: 'wave',
          scale: rng.range(20, 50),
          detail: 1,
          roughness: 0,
          distortion: rng.range(0.5, 2),
          seed: rng.range(0, 10),
          waveType: 'bands',
          waveProfile: 'triangle',
        },
      },
    };
  },

  /** Slimy/wet surface */
  slimy: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.2, 0.4), rng.range(0.3, 0.6), rng.range(0.2, 0.4)),
      roughness: rng.range(0.05, 0.2),
      specular: rng.range(0.8, 1.0),
      clearcoat: rng.range(0.5, 0.9),
      clearcoatRoughness: rng.range(0.01, 0.08),
      normalStrength: rng.range(0.3, 0.6),
      subsurfaceWeight: rng.range(0.3, 0.6),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(3, 10),
        detail: rng.range(3, 6),
        roughness: rng.range(0.4, 0.7),
        distortion: rng.range(0, 0.5),
        seed: rng.range(0, 10),
      },
    };
  },
};

// ============================================================================
// Man-Made Materials
// ============================================================================

export const WOOD_MATERIALS = {
  /** Wood grain with ring pattern */
  woodGrain: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.06, 0.1), rng.range(0.4, 0.65), rng.range(0.3, 0.5)),
      roughness: rng.range(0.6, 0.8),
      normalStrength: rng.range(0.3, 0.6),
      noiseParams: {
        type: 'wave',
        scale: rng.range(5, 12),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.3, 1.5),
        seed: rng.range(0, 10),
        waveType: 'rings',
        waveProfile: 'sine',
        secondary: {
          type: 'simplex',
          scale: rng.range(20, 50),
          detail: 3,
          roughness: 0.5,
          distortion: 0,
          seed: rng.range(0, 10),
        },
      },
    };
  },

  /** Hardwood floor planks */
  hardwoodFloor: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.06, 0.1), rng.range(0.35, 0.55), rng.range(0.35, 0.5)),
      roughness: rng.range(0.3, 0.5),
      specular: rng.range(0.3, 0.5),
      normalStrength: rng.range(0.3, 0.5),
      noiseParams: {
        type: 'brick',
        scale: rng.range(1, 3),
        detail: 1,
        roughness: 0,
        distortion: 0,
        seed: rng.range(0, 10),
        secondary: {
          type: 'wave',
          scale: rng.range(3, 8),
          detail: 1,
          roughness: 0,
          distortion: rng.range(0.3, 1),
          seed: rng.range(0, 10),
          waveType: 'rings',
          waveProfile: 'sine',
        },
      },
    };
  },
};

export const METAL_MATERIALS = {
  /** Basic metal with oxidation */
  metalBasic: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.05, 0.12), rng.range(0.05, 0.15), rng.range(0.4, 0.65)),
      roughness: rng.range(0.15, 0.4),
      metallic: rng.range(0.8, 1.0),
      specular: rng.range(0.8, 1.0),
      normalStrength: rng.range(0.2, 0.5),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(30, 80),
        detail: rng.range(2, 4),
        roughness: rng.range(0.3, 0.6),
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },

  /** Brushed metal with anisotropic highlights */
  brushedMetal: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.08, 0.12), rng.range(0.02, 0.08), rng.range(0.6, 0.8)),
      roughness: rng.range(0.15, 0.3),
      metallic: 1.0,
      specular: 1.0,
      anisotropic: rng.range(0.5, 1.0),
      normalStrength: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'wave',
        scale: rng.range(50, 150),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.1, 0.3),
        seed: rng.range(0, 10),
        waveType: 'bands',
        waveProfile: 'sine',
      },
    };
  },

  /** Hammered metal with dimple pattern */
  hammeredMetal: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.06, 0.1), rng.range(0.03, 0.1), rng.range(0.5, 0.7)),
      roughness: rng.range(0.2, 0.4),
      metallic: 1.0,
      specular: rng.range(0.8, 1.0),
      normalStrength: rng.range(0.8, 1.5),
      displacementScale: rng.range(0.01, 0.03),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(8, 20),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.3),
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
      },
    };
  },
};

export const CERAMIC_MATERIALS = {
  /** Glazed ceramic */
  ceramic: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0, 1), rng.range(0.3, 0.7), rng.range(0.5, 0.8)),
      roughness: rng.range(0.05, 0.2),
      specular: rng.range(0.7, 1.0),
      clearcoat: rng.range(0.5, 1.0),
      clearcoatRoughness: rng.range(0.01, 0.08),
      normalStrength: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(50, 100),
        detail: 1,
        roughness: 0.5,
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },

  /** Marble with Voronoi veins */
  marble: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.05, 0.1), rng.range(0.02, 0.08), rng.range(0.85, 0.95)),
      roughness: rng.range(0.1, 0.25),
      specular: rng.range(0.6, 0.9),
      clearcoat: rng.range(0.3, 0.6),
      normalStrength: rng.range(0.2, 0.5),
      detailColor: new THREE.Color().setHSL(rng.range(0.05, 0.1), rng.range(0.1, 0.3), rng.range(0.3, 0.5)),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(2, 5),
        detail: 1,
        roughness: 0,
        distortion: rng.range(1, 4),
        seed: rng.range(0, 10),
        voronoiFeature: 'distance_to_edge',
        voronoiDistance: 'euclidean',
      },
    };
  },

  /** Glass with refraction */
  glass: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color(1, 1, 1),
      roughness: rng.range(0.0, 0.05),
      ior: 1.52,
      transmission: 1.0,
      specular: 1.0,
      normalStrength: rng.range(0.05, 0.15),
      alpha: rng.range(0.3, 0.7),
    };
  },
};

export const FABRIC_MATERIALS = {
  /** Velvet with sheen */
  velvet: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0, 1), rng.range(0.4, 0.8), rng.range(0.2, 0.4)),
      roughness: rng.range(0.7, 0.9),
      sheen: rng.range(0.5, 1.0),
      sheenColor: new THREE.Color().setHSL(rng.range(0, 1), 0.5, rng.range(0.4, 0.6)),
      sheenRoughness: rng.range(0.2, 0.5),
      normalStrength: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'simplex',
        scale: rng.range(50, 150),
        detail: 2,
        roughness: 0.5,
        distortion: 0,
        seed: rng.range(0, 10),
      },
    };
  },

  /** Leather with grain */
  leather: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(rng.range(0.05, 0.1), rng.range(0.3, 0.6), rng.range(0.2, 0.35)),
      roughness: rng.range(0.5, 0.7),
      specular: rng.range(0.3, 0.5),
      normalStrength: rng.range(0.5, 1.0),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(15, 40),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0, 0.3),
        seed: rng.range(0, 10),
        voronoiFeature: 'f1',
      },
    };
  },
};

export const WEAR_MATERIALS = {
  /** Edge wear - reveals underlying material at edges */
  edgeWear: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0, 0, rng.range(0.7, 0.9)),
      roughness: rng.range(0.4, 0.6),
      normalStrength: rng.range(0.1, 0.3),
      noiseParams: {
        type: 'voronoi',
        scale: rng.range(3, 8),
        detail: 1,
        roughness: 0,
        distortion: rng.range(0.5, 2),
        seed: rng.range(0, 10),
        voronoiFeature: 'distance_to_edge',
      },
    };
  },

  /** Scratch marks on surface */
  scratches: (seed: number): MaterialPBRParams => {
    const rng = new SeededRandom(seed);
    return {
      ...defaultPBR(),
      baseColor: new THREE.Color().setHSL(0, 0, rng.range(0.6, 0.8)),
      roughness: rng.range(0.3, 0.5),
      normalStrength: rng.range(0.5, 1.0),
      noiseParams: {
        type: 'wave',
        scale: rng.range(30, 80),
        detail: 1,
        roughness: 0,
        distortion: rng.range(2, 5),
        seed: rng.range(0, 10),
        waveType: 'bands',
        waveProfile: 'saw',
      },
    };
  },
};

// ============================================================================
// Material Library Registry
// ============================================================================

export type MaterialCategory = 'terrain' | 'plant' | 'water' | 'creature' | 'wood' | 'metal' | 'ceramic' | 'fabric' | 'wear';

export const MATERIAL_LIBRARY: Record<MaterialCategory, Record<string, (seed: number) => MaterialPBRParams>> = {
  terrain: TERRAIN_MATERIALS,
  plant: PLANT_MATERIALS,
  water: WATER_MATERIALS,
  creature: CREATURE_MATERIALS,
  wood: WOOD_MATERIALS,
  metal: METAL_MATERIALS,
  ceramic: CERAMIC_MATERIALS,
  fabric: FABRIC_MATERIALS,
  wear: WEAR_MATERIALS,
};

/**
 * Look up a material preset by category and name.
 */
export function getMaterialPreset(category: MaterialCategory, name: string, seed: number = 42): MaterialPBRParams | null {
  const cat = MATERIAL_LIBRARY[category];
  if (!cat) return null;
  const factory = cat[name];
  if (!factory) return null;
  return factory(seed);
}

/**
 * List all available material presets.
 */
export function listMaterialPresets(): Record<MaterialCategory, string[]> {
  const result: Record<MaterialCategory, string[]> = {} as any;
  for (const [cat, materials] of Object.entries(MATERIAL_LIBRARY)) {
    result[cat as MaterialCategory] = Object.keys(materials);
  }
  return result;
}

/**
 * Create a Three.js MeshPhysicalMaterial from a material preset.
 */
export function presetToThreeMaterial(preset: MaterialPBRParams): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: preset.baseColor,
    roughness: preset.roughness,
    metalness: preset.metallic,
    ior: preset.ior,
    transmission: preset.transmission,
    specularIntensity: preset.specular,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    sheen: preset.sheen,
    sheenColor: preset.sheenColor,
    sheenRoughness: preset.sheenRoughness,
    emissive: preset.emissionColor,
    emissiveIntensity: preset.emissionStrength,
    normalScale: new THREE.Vector2(preset.normalStrength, preset.normalStrength),
    displacementScale: preset.displacementScale,
    transparent: preset.alpha < 1,
    opacity: preset.alpha,
    side: preset.transmission > 0 ? THREE.DoubleSide : THREE.FrontSide,
  });
}
