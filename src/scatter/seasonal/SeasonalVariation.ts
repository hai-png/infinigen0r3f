/**
 * SeasonalVariation - Seasonal changes for vegetation and environment
 * 
 * Implements seasonal transitions including:
 * - Leaf color changes (spring greens to autumn colors)
 * - Snow coverage accumulation and melting
 * - Flowering cycles
 * - Grass growth and browning
 * - Daylight and atmospheric variations
 * 
 * Ported from: infinigen/scatter/seasonal/seasonal_variation.py
 */

import * as THREE from 'three';
import { NoiseUtils } from '../../terrain/utils/NoiseUtils';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonalConfig {
  seed: number;
  currentSeason: Season;
  seasonTransitionProgress: number; // 0-1, progress through current season
  hemisphere: 'northern' | 'southern';
  
  // Spring parameters
  springGreenIntensity: number;
  flowerBloomProbability: number;
  grassGrowthRate: number;
  
  // Summer parameters
  summerGreenIntensity: number;
  droughtStressFactor: number;
  leafDensityMultiplier: number;
  
  // Autumn parameters
  autumnColorPalette: THREE.Color[];
  leafFallProbability: number;
  browningRate: number;
  
  // Winter parameters
  snowCoverageThreshold: number; // Temperature threshold for snow
  snowDepthMax: number;
  evergreenSnowAccumulation: number;
  
  // Global parameters
  baseTemperature: number;
  temperatureVariation: number;
  daylightHours: number;
}

export interface SeasonalState {
  season: Season;
  temperature: number;
  daylightHours: number;
  snowDepth: number;
  leafColor: THREE.Color;
  grassColor: THREE.Color;
  flowerBloomFactor: number;
  leafDensity: number;
}

export class SeasonalVariation {
  private config: SeasonalConfig;
  private noise: NoiseUtils;
  private currentState: SeasonalState;

  constructor(config?: Partial<SeasonalConfig>) {
    this.config = {
      seed: Math.random() * 10000,
      currentSeason: 'summer',
      seasonTransitionProgress: 0.5,
      hemisphere: 'northern',
      springGreenIntensity: 0.8,
      flowerBloomProbability: 0.6,
      grassGrowthRate: 1.2,
      summerGreenIntensity: 1.0,
      droughtStressFactor: 0.3,
      leafDensityMultiplier: 1.0,
      autumnColorPalette: [
        new THREE.Color(0.8, 0.4, 0.1), // Orange
        new THREE.Color(0.9, 0.6, 0.2), // Yellow-orange
        new THREE.Color(0.7, 0.2, 0.1), // Red
        new THREE.Color(0.6, 0.3, 0.1), // Brown
        new THREE.Color(0.8, 0.7, 0.2), // Yellow
      ],
      leafFallProbability: 0.7,
      browningRate: 0.5,
      snowCoverageThreshold: 0, // Celsius
      snowDepthMax: 0.5, // meters
      evergreenSnowAccumulation: 0.3,
      baseTemperature: 15, // Celsius
      temperatureVariation: 15,
      daylightHours: 12,
      ...config,
    };

    this.noise = new NoiseUtils(this.config.seed);
    this.currentState = this.calculateSeasonalState();
  }

  /**
   * Calculate the current seasonal state based on configuration
   */
  calculateSeasonalState(): SeasonalState {
    const { currentSeason, seasonTransitionProgress } = this.config;
    
    // Calculate temperature based on season
    let baseTemp = this.config.baseTemperature;
    switch (currentSeason) {
      case 'spring':
        baseTemp += this.config.temperatureVariation * 0.2;
        break;
      case 'summer':
        baseTemp += this.config.temperatureVariation;
        break;
      case 'autumn':
        baseTemp -= this.config.temperatureVariation * 0.2;
        break;
      case 'winter':
        baseTemp -= this.config.temperatureVariation;
        break;
    }

    // Southern hemisphere has opposite seasons
    if (this.config.hemisphere === 'southern') {
      baseTemp = this.config.baseTemperature * 2 - baseTemp;
    }

    // Calculate daylight hours
    let daylightHours = this.config.daylightHours;
    switch (currentSeason) {
      case 'spring':
        daylightHours = 12 + 2 * seasonTransitionProgress;
        break;
      case 'summer':
        daylightHours = 14 + 2 * seasonTransitionProgress;
        break;
      case 'autumn':
        daylightHours = 14 - 2 * seasonTransitionProgress;
        break;
      case 'winter':
        daylightHours = 12 - 2 * seasonTransitionProgress;
        break;
    }

    // Calculate leaf color
    const leafColor = this.calculateLeafColor();

    // Calculate grass color
    const grassColor = this.calculateGrassColor();

    // Calculate flower bloom factor
    let flowerBloomFactor = 0;
    if (currentSeason === 'spring') {
      flowerBloomFactor = this.config.flowerBloomProbability * seasonTransitionProgress;
    } else if (currentSeason === 'summer') {
      flowerBloomFactor = this.config.flowerBloomProbability * (1 - seasonTransitionProgress * 0.5);
    }

    // Calculate leaf density
    let leafDensity = 1.0;
    if (currentSeason === 'autumn') {
      leafDensity = 1.0 - seasonTransitionProgress * this.config.leafFallProbability;
    } else if (currentSeason === 'winter') {
      leafDensity = 0.2; // Most deciduous trees are bare
    }

    // Calculate snow depth
    let snowDepth = 0;
    if (currentSeason === 'winter' && baseTemp < this.config.snowCoverageThreshold) {
      snowDepth = this.config.snowDepthMax * seasonTransitionProgress;
    }

    return {
      season: currentSeason,
      temperature: baseTemp,
      daylightHours,
      snowDepth,
      leafColor,
      grassColor,
      flowerBloomFactor,
      leafDensity,
    };
  }

  /**
   * Calculate leaf color based on season
   */
  private calculateLeafColor(): THREE.Color {
    const { currentSeason, seasonTransitionProgress } = this.config;
    const t = seasonTransitionProgress;

    switch (currentSeason) {
      case 'spring':
        // Fresh green emerging
        return new THREE.Color(
          0.2 + 0.1 * t,
          0.5 + 0.3 * t,
          0.2 + 0.1 * t
        );

      case 'summer':
        // Full green
        const droughtFactor = 1 - this.config.droughtStressFactor * t;
        return new THREE.Color(
          0.15 + 0.1 * t,
          0.4 + 0.2 * droughtFactor,
          0.1 + 0.1 * t
        );

      case 'autumn':
        // Transition to autumn colors
        const colorIndex = Math.floor(t * this.config.autumnColorPalette.length);
        const safeIndex = Math.min(colorIndex, this.config.autumnColorPalette.length - 1);
        const autumnColor = this.config.autumnColorPalette[safeIndex].clone();
        
        // Add variation
        const variation = this.noise.perlin2D(t * 10, 0) * 0.2;
        autumnColor.r = Math.max(0, Math.min(1, autumnColor.r + variation));
        autumnColor.g = Math.max(0, Math.min(1, autumnColor.g + variation * 0.5));
        autumnColor.b = Math.max(0, Math.min(1, autumnColor.b + variation * 0.2));
        
        return autumnColor;

      case 'winter':
        // Bare branches or evergreen
        return new THREE.Color(0.1, 0.15, 0.1);
    }
  }

  /**
   * Calculate grass color based on season
   */
  private calculateGrassColor(): THREE.Color {
    const { currentSeason, seasonTransitionProgress } = this.config;
    const t = seasonTransitionProgress;

    switch (currentSeason) {
      case 'spring':
        // Fresh green growth
        return new THREE.Color(
          0.2 + 0.1 * t,
          0.5 + 0.3 * t * this.config.grassGrowthRate,
          0.15 + 0.1 * t
        );

      case 'summer':
        // Green to brown if drought
        const droughtStress = this.config.droughtStressFactor * t;
        return new THREE.Color(
          0.3 - 0.1 * droughtStress,
          0.5 - 0.15 * droughtStress,
          0.2 - 0.1 * droughtStress
        );

      case 'autumn':
        // Browning grass
        const browning = this.config.browningRate * t;
        return new THREE.Color(
          0.3 + 0.2 * browning,
          0.4 - 0.2 * browning,
          0.2 - 0.1 * browning
        );

      case 'winter':
        // Dormant brown/yellow
        return new THREE.Color(0.4, 0.35, 0.25);
    }
  }

  /**
   * Get seasonal modifier for a specific position
   */
  getPositionalVariation(
    x: number,
    z: number,
    altitude: number
  ): {
    temperatureOffset: number;
    moistureFactor: number;
    windExposure: number;
  } {
    // Temperature decreases with altitude
    const altitudeOffset = -altitude * 0.006; // ~6°C per 1000m

    // Spatial temperature variation using noise
    const tempNoise = this.noise.perlin2D(x * 0.001, z * 0.001);
    const temperatureOffset = altitudeOffset + tempNoise * 3;

    // Moisture factor (affects plant health)
    const moistureNoise = this.noise.perlin2D(x * 0.002, z * 0.002);
    const moistureFactor = 0.5 + 0.5 * moistureNoise;

    // Wind exposure (affects snow accumulation, plant stress)
    const windNoise = this.noise.perlin2D(x * 0.0005, z * 0.0005);
    const windExposure = 0.3 + 0.7 * Math.abs(windNoise);

    return {
      temperatureOffset,
      moistureFactor,
      windExposure,
    };
  }

  /**
   * Apply seasonal snow to terrain heights
   */
  applySnowCover(
    heights: Float32Array,
    resolution: number,
    worldSize: number
  ): Float32Array {
    if (this.currentState.season !== 'winter') {
      return heights;
    }

    const result = new Float32Array(heights);
    const cellSize = worldSize / resolution;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const idx = z * resolution + x;
        const worldX = (x / resolution) * worldSize - worldSize / 2;
        const worldZ = (z / resolution) * worldSize - worldSize / 2;

        const height = heights[idx];
        const variation = this.getPositionalVariation(worldX, worldZ, height);

        // Snow accumulates more in sheltered areas
        const shelterFactor = 1 - variation.windExposure * 0.5;
        const localSnowDepth = this.currentState.snowDepth * shelterFactor;

        // Only add snow if temperature is below threshold
        const localTemp = this.currentState.temperature + variation.temperatureOffset;
        if (localTemp < this.config.snowCoverageThreshold) {
          result[idx] = height + localSnowDepth;
        }
      }
    }

    return result;
  }

  /**
   * Get material color multiplier for season
   */
  getMaterialMultiplier(materialType: 'leaf' | 'grass' | 'flower'): THREE.Color {
    switch (materialType) {
      case 'leaf':
        return this.currentState.leafColor;
      case 'grass':
        return this.currentState.grassColor;
      case 'flower':
        // Flowers are most vibrant in spring/summer
        const bloomFactor = this.currentState.flowerBloomFactor;
        return new THREE.Color(
          0.8 + 0.2 * bloomFactor,
          0.4 + 0.4 * bloomFactor,
          0.6 + 0.3 * bloomFactor
        );
    }
  }

  /**
   * Advance to next season
   */
  advanceSeason(): void {
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const currentIndex = seasons.indexOf(this.config.currentSeason);
    const nextIndex = (currentIndex + 1) % seasons.length;
    
    this.config.currentSeason = seasons[nextIndex];
    this.config.seasonTransitionProgress = 0;
    this.currentState = this.calculateSeasonalState();
  }

  /**
   * Set specific season
   */
  setSeason(season: Season, progress: number = 0.5): void {
    this.config.currentSeason = season;
    this.config.seasonTransitionProgress = Math.max(0, Math.min(1, progress));
    this.currentState = this.calculateSeasonalState();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SeasonalConfig>): void {
    this.config = { ...this.config, ...config };
    this.noise = new NoiseUtils(this.config.seed);
    this.currentState = this.calculateSeasonalState();
  }

  /**
   * Get current state
   */
  getState(): SeasonalState {
    return { ...this.currentState };
  }

  /**
   * Get current season
   */
  getCurrentSeason(): Season {
    return this.config.currentSeason;
  }

  /**
   * Interpolate between two seasonal states
   */
  interpolateStates(
    state1: SeasonalState,
    state2: SeasonalState,
    t: number
  ): SeasonalState {
    const leafColor = state1.leafColor.clone().lerp(state2.leafColor, t);
    const grassColor = state1.grassColor.clone().lerp(state2.grassColor, t);

    return {
      season: state1.season,
      temperature: THREE.MathUtils.lerp(state1.temperature, state2.temperature, t),
      daylightHours: THREE.MathUtils.lerp(state1.daylightHours, state2.daylightHours, t),
      snowDepth: THREE.MathUtils.lerp(state1.snowDepth, state2.snowDepth, t),
      leafColor,
      grassColor,
      flowerBloomFactor: THREE.MathUtils.lerp(state1.flowerBloomFactor, state2.flowerBloomFactor, t),
      leafDensity: THREE.MathUtils.lerp(state1.leafDensity, state2.leafDensity, t),
    };
  }
}

export default SeasonalVariation;
