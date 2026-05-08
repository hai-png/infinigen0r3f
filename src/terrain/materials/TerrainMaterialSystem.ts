/**
 * TerrainMaterialSystem.ts
 *
 * Generates terrain-specific PBR materials using slope-based and altitude-based
 * texturing. Produces procedural albedo, normal, and roughness maps via
 * canvas-based noise (SSR-safe through createCanvas).
 *
 * Texturing rules:
 *  - Steep slopes → rock texture
 *  - Flat areas   → grass / sand depending on altitude
 *  - Low altitude → sand / beach
 *  - Mid altitude → grass / forest
 *  - High altitude → rock / snow
 */

import * as THREE from 'three';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import type { TerrainData } from '@/terrain/core/TerrainGenerator';

// ---------------------------------------------------------------------------
// Biome texture colour palette
// ---------------------------------------------------------------------------

interface BiomeColors {
  albedo: THREE.Color;
  roughness: number;
  normalStrength: number;
}

const BIOME_PALETTE: Record<number, BiomeColors> = {
  0: { albedo: new THREE.Color(0x0a2640), roughness: 0.2, normalStrength: 0.3 },  // Deep water
  1: { albedo: new THREE.Color(0x1e5080), roughness: 0.25, normalStrength: 0.4 }, // Shore
  2: { albedo: new THREE.Color(0xc2b87a), roughness: 0.95, normalStrength: 0.8 }, // Beach / sand
  3: { albedo: new THREE.Color(0x4a8c30), roughness: 0.85, normalStrength: 0.6 }, // Plains / grass
  4: { albedo: new THREE.Color(0x607030), roughness: 0.9, normalStrength: 0.7 },  // Hills
  5: { albedo: new THREE.Color(0x2e7020), roughness: 0.8, normalStrength: 0.5 },  // Forest
  6: { albedo: new THREE.Color(0x486020), roughness: 0.85, normalStrength: 0.7 }, // Mountain forest
  7: { albedo: new THREE.Color(0x7a6e60), roughness: 0.95, normalStrength: 1.0 }, // Mountain / rock
  8: { albedo: new THREE.Color(0xe8ecf4), roughness: 0.6, normalStrength: 0.3 },  // Snow peak
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TerrainMaterialConfig {
  /** Texture resolution (width & height) for each generated map */
  textureResolution: number;
  /** Slope threshold above which rock texture dominates (0-1) */
  rockSlopeThreshold: number;
  /** Altitude below which sand/beach is used (0-1) */
  sandAltitude: number;
  /** Altitude above which snow starts (0-1) */
  snowAltitude: number;
  /** Noise seed for procedural detail */
  seed: number;
  /** Normal map intensity */
  normalScale: number;
  /** Whether to blend textures smoothly or use hard cutoffs */
  smoothBlending: boolean;
}

const DEFAULT_MATERIAL_CONFIG: TerrainMaterialConfig = {
  textureResolution: 512,
  rockSlopeThreshold: 0.35,
  sandAltitude: 0.35,
  snowAltitude: 0.85,
  seed: 42,
  normalScale: 1.0,
  smoothBlending: true,
};

// ---------------------------------------------------------------------------
// TerrainMaterialSystem
// ---------------------------------------------------------------------------

export class TerrainMaterialSystem {
  private config: TerrainMaterialConfig;
  private noise: NoiseUtils;
  private detailNoise: NoiseUtils;

  // Cached textures (created lazily, disposed via dispose())
  private albedoTexture: THREE.CanvasTexture | null = null;
  private normalTexture: THREE.CanvasTexture | null = null;
  private roughnessTexture: THREE.CanvasTexture | null = null;
  private material: THREE.MeshPhysicalMaterial | null = null;

  constructor(config: Partial<TerrainMaterialConfig> = {}) {
    this.config = { ...DEFAULT_MATERIAL_CONFIG, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.detailNoise = new NoiseUtils(this.config.seed + 100);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a complete PBR material for the given terrain data.
   * Must be called in a browser context (uses createCanvas).
   */
  generateMaterial(terrainData: TerrainData): THREE.MeshPhysicalMaterial {
    const { textureResolution } = this.config;
    const { heightMap, slopeMap, biomeMask } = terrainData;
    const w = terrainData.width;
    const h = terrainData.height;

    // Generate texture maps (biomeMask is Float32Array but values are integer biome IDs)
    const biomeMaskData = biomeMask ?? new Float32Array(0);
    const albedoCanvas = this.generateAlbedoMap(heightMap.data, slopeMap!.data, biomeMaskData, w, h, textureResolution);
    const normalCanvas = this.generateNormalMap(heightMap.data, slopeMap!.data, biomeMaskData, w, h, textureResolution);
    const roughnessCanvas = this.generateRoughnessMap(heightMap.data, slopeMap!.data, biomeMaskData, w, h, textureResolution);

    // Create Three.js textures
    this.albedoTexture = new THREE.CanvasTexture(albedoCanvas);
    this.albedoTexture.wrapS = THREE.RepeatWrapping;
    this.albedoTexture.wrapT = THREE.RepeatWrapping;
    this.albedoTexture.colorSpace = THREE.SRGBColorSpace;

    this.normalTexture = new THREE.CanvasTexture(normalCanvas);
    this.normalTexture.wrapS = THREE.RepeatWrapping;
    this.normalTexture.wrapT = THREE.RepeatWrapping;

    this.roughnessTexture = new THREE.CanvasTexture(roughnessCanvas);
    this.roughnessTexture.wrapS = THREE.RepeatWrapping;
    this.roughnessTexture.wrapT = THREE.RepeatWrapping;

    // Build PBR material
    this.material = new THREE.MeshPhysicalMaterial({
      map: this.albedoTexture,
      normalMap: this.normalTexture,
      normalScale: new THREE.Vector2(this.config.normalScale, this.config.normalScale),
      roughnessMap: this.roughnessTexture,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.3,
      side: THREE.FrontSide,
    });

    return this.material;
  }

  /**
   * Get the generated material (null if generateMaterial hasn't been called).
   */
  getMaterial(): THREE.MeshPhysicalMaterial | null {
    return this.material;
  }

  /**
   * Update LOD — regenerates textures at a potentially different resolution.
   */
  updateLOD(terrainData: TerrainData, lodLevel: number): void {
    const resMultiplier = Math.pow(0.5, lodLevel);
    const resolution = Math.max(64, Math.floor(this.config.textureResolution * resMultiplier));

    const oldConfig = this.config.textureResolution;
    this.config.textureResolution = resolution;
    this.generateMaterial(terrainData);
    this.config.textureResolution = oldConfig;
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    this.albedoTexture?.dispose();
    this.normalTexture?.dispose();
    this.roughnessTexture?.dispose();
    this.material?.dispose();
    this.albedoTexture = null;
    this.normalTexture = null;
    this.roughnessTexture = null;
    this.material = null;
  }

  // -----------------------------------------------------------------------
  // Albedo Map Generation
  // -----------------------------------------------------------------------

  private generateAlbedoMap(
    heightData: Float32Array,
    slopeData: Float32Array,
    biomeMask: Float32Array,
    terrainW: number,
    terrainH: number,
    resolution: number,
  ): HTMLCanvasElement {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(resolution, resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        // Map texture UV to terrain grid
        const tx = (x / resolution) * (terrainW - 1);
        const ty = (y / resolution) * (terrainH - 1);
        const idx = Math.floor(ty) * terrainW + Math.floor(tx);
        const h = heightData[idx] ?? 0;
        const s = slopeData[idx] ?? 0;
        const biome = biomeMask[idx] ?? 3;

        // Base color from biome
        const palette = BIOME_PALETTE[biome] ?? BIOME_PALETTE[3];
        const baseColor = palette.albedo.clone();

        // Altitude-based blending
        const altColor = this.getAltitudeColor(h, s);
        const altWeight = this.getAltitudeWeight(h, s);

        // Slope-based blending: steep slopes favour rock
        const slopeColor = BIOME_PALETTE[7].albedo.clone(); // rock
        const slopeWeight = this.getSlopeWeight(s);

        // Add procedural detail noise
        const nx = x / resolution * 8;
        const ny = y / resolution * 8;
        const detail = this.detailNoise.perlin2D(nx, ny) * 0.04;

        // Blend: base → altitude → slope
        const blended = baseColor.clone();
        blended.lerp(altColor, altWeight);
        blended.lerp(slopeColor, slopeWeight);

        // Add detail noise as subtle colour variation
        const r = Math.max(0, Math.min(1, blended.r + detail));
        const g = Math.max(0, Math.min(1, blended.g + detail));
        const b = Math.max(0, Math.min(1, blended.b + detail));

        const pixIdx = (y * resolution + x) * 4;
        imgData.data[pixIdx] = Math.floor(r * 255);
        imgData.data[pixIdx + 1] = Math.floor(g * 255);
        imgData.data[pixIdx + 2] = Math.floor(b * 255);
        imgData.data[pixIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // -----------------------------------------------------------------------
  // Normal Map Generation
  // -----------------------------------------------------------------------

  private generateNormalMap(
    heightData: Float32Array,
    slopeData: Float32Array,
    biomeMask: Float32Array,
    terrainW: number,
    terrainH: number,
    resolution: number,
  ): HTMLCanvasElement {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(resolution, resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const tx = (x / resolution) * (terrainW - 1);
        const ty = (y / resolution) * (terrainH - 1);
        const xi = Math.floor(tx);
        const yi = Math.floor(ty);

        // Sample heights for normal computation
        const getH = (px: number, py: number): number => {
          const cx = Math.max(0, Math.min(terrainW - 1, px));
          const cy = Math.max(0, Math.min(terrainH - 1, py));
          return heightData[cy * terrainW + cx] ?? 0;
        };

        const left = getH(xi - 1, yi);
        const right = getH(xi + 1, yi);
        const up = getH(xi, yi - 1);
        const down = getH(xi, yi + 1);

        const strength = 2.0;
        const dx = (right - left) * strength;
        const dy = (down - up) * strength;

        // Biome-specific normal strength
        const idx = yi * terrainW + xi;
        const biome = biomeMask[idx] ?? 3;
        const palette = BIOME_PALETTE[biome] ?? BIOME_PALETTE[3];
        const nStrength = palette.normalStrength;

        // Add micro-detail from noise
        const nx = x / resolution * 12;
        const ny = y / resolution * 12;
        const detailNx = this.detailNoise.perlin2D(nx, ny) * 0.15 * nStrength;
        const detailNy = this.detailNoise.perlin2D(nx + 100, ny + 100) * 0.15 * nStrength;

        // Encode normal: [-1,1] → [0,255]
        let nxVal = -(dx + detailNx) * nStrength;
        let nyVal = -(dy + detailNy) * nStrength;
        let nzVal = 1.0;

        const len = Math.sqrt(nxVal * nxVal + nyVal * nyVal + nzVal * nzVal);
        nxVal /= len;
        nyVal /= len;
        nzVal /= len;

        const pixIdx = (y * resolution + x) * 4;
        imgData.data[pixIdx] = Math.floor(((nxVal + 1) * 0.5) * 255);
        imgData.data[pixIdx + 1] = Math.floor(((nyVal + 1) * 0.5) * 255);
        imgData.data[pixIdx + 2] = Math.floor(((nzVal + 1) * 0.5) * 255);
        imgData.data[pixIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // -----------------------------------------------------------------------
  // Roughness Map Generation
  // -----------------------------------------------------------------------

  private generateRoughnessMap(
    heightData: Float32Array,
    slopeData: Float32Array,
    biomeMask: Float32Array,
    terrainW: number,
    terrainH: number,
    resolution: number,
  ): HTMLCanvasElement {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(resolution, resolution);

    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const tx = (x / resolution) * (terrainW - 1);
        const ty = (y / resolution) * (terrainH - 1);
        const idx = Math.floor(ty) * terrainW + Math.floor(tx);

        const biome = biomeMask[idx] ?? 3;
        const palette = BIOME_PALETTE[biome] ?? BIOME_PALETTE[3];
        let roughness = palette.roughness;

        // Add noise variation to roughness
        const nx = x / resolution * 10;
        const ny = y / resolution * 10;
        const noiseVal = this.detailNoise.perlin2D(nx, ny) * 0.1;
        roughness = Math.max(0, Math.min(1, roughness + noiseVal));

        const val = Math.floor(roughness * 255);
        const pixIdx = (y * resolution + x) * 4;
        imgData.data[pixIdx] = val;
        imgData.data[pixIdx + 1] = val;
        imgData.data[pixIdx + 2] = val;
        imgData.data[pixIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  // -----------------------------------------------------------------------
  // Blending helpers
  // -----------------------------------------------------------------------

  private getAltitudeColor(h: number, s: number): THREE.Color {
    if (h < this.config.sandAltitude) {
      return new THREE.Color(0xc2b87a); // sand
    } else if (h < 0.5) {
      return new THREE.Color(0x4a8c30); // grass
    } else if (h < 0.7) {
      return new THREE.Color(0x2e7020); // forest
    } else if (h < this.config.snowAltitude) {
      return new THREE.Color(0x7a6e60); // rock
    } else {
      return new THREE.Color(0xe8ecf4); // snow
    }
  }

  private getAltitudeWeight(h: number, s: number): number {
    if (!this.config.smoothBlending) return 0.5;
    // Stronger altitude influence at mid-range
    const center = (this.config.sandAltitude + this.config.snowAltitude) * 0.5;
    const range = this.config.snowAltitude - this.config.sandAltitude;
    const dist = Math.abs(h - center) / range;
    return 0.3 + 0.2 * (1 - dist);
  }

  private getSlopeWeight(s: number): number {
    if (s < this.config.rockSlopeThreshold * 0.5) return 0;
    if (s > this.config.rockSlopeThreshold) {
      return this.config.smoothBlending
        ? Math.min(1, (s - this.config.rockSlopeThreshold) / 0.2)
        : 1;
    }
    if (this.config.smoothBlending) {
      const t = (s - this.config.rockSlopeThreshold * 0.5) / (this.config.rockSlopeThreshold * 0.5);
      return t * 0.5;
    }
    return 0;
  }
}

export default TerrainMaterialSystem;
