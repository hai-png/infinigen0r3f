/**
 * ErosionVisualization.ts
 *
 * Generates visual representations of erosion effects on terrain.
 * Different erosion types produce different visual signatures:
 *  - Hydraulic: smoother valleys, sediment deposits
 *  - Thermal:   angular slopes, talus at base
 *  - Coastal:   wave-cut platforms, sea cliffs
 *  - Glacial:   U-shaped valleys, moraines
 *
 * This module analyses heightmap geometry and produces vertex-colour
 * overlays that highlight erosion features for visual feedback.
 */

import * as THREE from 'three';
import type { TerrainData } from '@/terrain/core/TerrainGenerator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum ErosionType {
  Hydraulic = 'hydraulic',
  Thermal = 'thermal',
  Coastal = 'coastal',
  Glacial = 'glacial',
}

export interface ErosionVisualizationConfig {
  /** Intensity of the overlay (0 = invisible, 1 = fully saturated) */
  intensity: number;
  /** Which erosion types to visualise */
  enabledTypes: ErosionType[];
  /** Height threshold below which hydraulic erosion is visible (0-1) */
  hydraulicHeightThreshold: number;
  /** Slope threshold above which thermal erosion is visible (0-1) */
  thermalSlopeThreshold: number;
  /** Height threshold for coastal erosion zone (0-1, near sea level) */
  coastalHeightThreshold: number;
  /** Height threshold above which glacial erosion is visible (0-1) */
  glacialHeightThreshold: number;
}

const DEFAULT_VIS_CONFIG: ErosionVisualizationConfig = {
  intensity: 0.6,
  enabledTypes: [ErosionType.Hydraulic, ErosionType.Thermal, ErosionType.Coastal, ErosionType.Glacial],
  hydraulicHeightThreshold: 0.5,
  thermalSlopeThreshold: 0.3,
  coastalHeightThreshold: 0.4,
  glacialHeightThreshold: 0.6,
};

/** Colour palette for each erosion type */
const EROSION_COLORS: Record<ErosionType, THREE.Color> = {
  [ErosionType.Hydraulic]: new THREE.Color(0x2196f3), // Blue — water
  [ErosionType.Thermal]:   new THREE.Color(0xff9800), // Orange — heat / talus
  [ErosionType.Coastal]:   new THREE.Color(0x00bcd4), // Cyan — sea
  [ErosionType.Glacial]:   new THREE.Color(0xce93d8), // Light purple — ice
};

// ---------------------------------------------------------------------------
// ErosionVisualization
// ---------------------------------------------------------------------------

export class ErosionVisualization {
  private config: ErosionVisualizationConfig;

  constructor(config: Partial<ErosionVisualizationConfig> = {}) {
    this.config = { ...DEFAULT_VIS_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a vertex-colour array that blends erosion-type colours onto
   * the existing terrain biome colours.  Returns a Float32Array of RGB
   * triplets (one per vertex).
   */
  generateVertexColors(terrainData: TerrainData): Float32Array {
    const { data: heightData } = terrainData.heightMap;
    const { data: slopeData } = terrainData.slopeMap;
    const { biomeMask } = terrainData;
    const count = terrainData.width * terrainData.height;

    // Base biome colours (same as InfinigenScene BIOME_COLORS)
    const BIOME_COLORS: Record<number, [number, number, number]> = {
      0: [0.06, 0.15, 0.40],
      1: [0.12, 0.30, 0.50],
      2: [0.76, 0.72, 0.48],
      3: [0.28, 0.55, 0.18],
      4: [0.38, 0.45, 0.20],
      5: [0.18, 0.44, 0.12],
      6: [0.28, 0.36, 0.14],
      7: [0.48, 0.43, 0.38],
      8: [0.90, 0.92, 0.96],
    };

    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const h = heightData[i] ?? 0;
      const s = slopeData[i] ?? 0;
      const biome = biomeMask[i] ?? 3;

      // Start from biome base colour
      const base = BIOME_COLORS[biome] ?? BIOME_COLORS[3];
      const baseColor = new THREE.Color(base[0], base[1], base[2]);

      // Accumulate erosion overlays
      const overlay = new THREE.Color(0, 0, 0);
      let overlayWeight = 0;

      for (const type of this.config.enabledTypes) {
        const weight = this.getErosionWeight(type, h, s, terrainData);
        if (weight > 0) {
          overlay.lerp(EROSION_COLORS[type], weight / (overlayWeight + weight));
          overlayWeight += weight;
        }
      }

      // Blend overlay onto base
      const blendFactor = Math.min(overlayWeight, this.config.intensity);
      const finalColor = baseColor.clone().lerp(overlay, blendFactor);

      colors[i * 3] = finalColor.r;
      colors[i * 3 + 1] = finalColor.g;
      colors[i * 3 + 2] = finalColor.b;
    }

    return colors;
  }

  /**
   * Apply erosion visualisation colours to an existing BufferGeometry.
   * The geometry must already have a 'color' attribute.
   */
  applyToGeometry(geometry: THREE.BufferGeometry, terrainData: TerrainData): void {
    const colors = this.generateVertexColors(terrainData);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.attributes.color.needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Erosion weight computation
  // -----------------------------------------------------------------------

  /**
   * Compute a 0-1 weight indicating how strongly an erosion type
   * should be visualised at the given terrain location.
   */
  private getErosionWeight(
    type: ErosionType,
    height: number,
    slope: number,
    terrainData: TerrainData,
  ): number {
    switch (type) {
      case ErosionType.Hydraulic:
        return this.hydraulicWeight(height, slope);
      case ErosionType.Thermal:
        return this.thermalWeight(height, slope);
      case ErosionType.Coastal:
        return this.coastalWeight(height, slope, terrainData);
      case ErosionType.Glacial:
        return this.glacialWeight(height, slope);
      default:
        return 0;
    }
  }

  /**
   * Hydraulic erosion visualisation:
   *  - Smoother valleys (low slope + low-mid altitude = high weight)
   *  - Sediment deposits at the base of slopes
   */
  private hydraulicWeight(height: number, slope: number): number {
    if (height > this.config.hydraulicHeightThreshold) return 0;

    // Strongest in valleys (low slope, low altitude)
    const altFactor = 1 - (height / this.config.hydraulicHeightThreshold);
    const slopeFactor = 1 - Math.min(slope * 3, 1);
    return altFactor * slopeFactor;
  }

  /**
   * Thermal erosion visualisation:
   *  - Angular slopes (high slope = high weight)
   *  - Talus at the base of steep slopes
   */
  private thermalWeight(height: number, slope: number): number {
    if (slope < this.config.thermalSlopeThreshold) return 0;

    const slopeFactor = (slope - this.config.thermalSlopeThreshold) /
      (1 - this.config.thermalSlopeThreshold);
    return slopeFactor;
  }

  /**
   * Coastal erosion visualisation:
   *  - Wave-cut platforms near sea level
   *  - Sea cliffs (steep slopes near sea level)
   */
  private coastalWeight(height: number, slope: number, terrainData: TerrainData): number {
    const seaLevel = terrainData.config.seaLevel;
    const coastalZone = this.config.coastalHeightThreshold;

    // Only visible near sea level
    if (height < seaLevel - 0.05) return 0;
    if (height > seaLevel + coastalZone) return 0;

    // Distance from sea level (strongest at coastline)
    const distFromSea = Math.abs(height - seaLevel);
    const proximityFactor = 1 - (distFromSea / coastalZone);

    // Steeper coastlines show cliffs more prominently
    const cliffFactor = Math.min(slope * 2, 1);
    return proximityFactor * (0.5 + 0.5 * cliffFactor);
  }

  /**
   * Glacial erosion visualisation:
   *  - U-shaped valleys at high altitude
   *  - Moraines (ridges at valley edges)
   */
  private glacialWeight(height: number, slope: number): number {
    if (height < this.config.glacialHeightThreshold) return 0;

    const altFactor = (height - this.config.glacialHeightThreshold) /
      (1 - this.config.glacialHeightThreshold);

    // Glacial features are most visible in U-shaped valleys (moderate slope at high altitude)
    // and moraines (ridges at edges of valleys)
    const valleyFactor = Math.max(0, 1 - slope * 2);
    return altFactor * (0.3 + 0.7 * valleyFactor);
  }
}

export default ErosionVisualization;
