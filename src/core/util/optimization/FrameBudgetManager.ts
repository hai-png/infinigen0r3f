/**
 * FrameBudgetManager — Adaptive quality based on frame time
 *
 * Monitors frame delta times and adjusts quality when frame time
 * exceeds the budget (16.67ms for 60fps).
 *
 * Quality presets: Low (30fps), Medium (45fps), High (60fps), Ultra (no budget)
 * When frame time exceeds budget: reduce terrain LOD, shadow resolution,
 * particle count, scatter density.
 * When frame time is well under budget: gradually increase quality.
 *
 * Statistics: avg frame time, min/max, quality level history
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface FrameBudgetConfig {
  preset: QualityPreset;
  /** How quickly quality adapts (0-1, higher = faster) */
  adaptationSpeed: number;
  /** Number of frames to average for decisions */
  averagingWindow: number;
  /** Hysteresis threshold (0-1) to prevent oscillation */
  hysteresis: number;
  /** Minimum time between quality changes (ms) */
  minChangeInterval: number;
}

export interface QualitySettings {
  terrainLOD: number;        // 0-4 (0 = highest)
  shadowMapResolution: number; // 512, 1024, 2048, 4096
  particleCount: number;      // Multiplier 0-1
  scatterDensity: number;     // Multiplier 0-1
  postProcessQuality: number; // 0-1
  textureResolution: number;  // Multiplier 0-1
  drawDistance: number;       // Multiplier 0-1
}

export interface FrameBudgetStats {
  avgFrameTimeMs: number;
  minFrameTimeMs: number;
  maxFrameTimeMs: number;
  currentFPS: number;
  currentQuality: QualityPreset;
  qualityLevel: number;       // 0-4
  budgetMs: number;
  qualityHistory: Array<{ time: number; quality: QualityPreset; fps: number }>;
  totalFrames: number;
  droppedFrames: number;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const PRESET_BUDGETS: Record<QualityPreset, number> = {
  low: 33.33,    // 30fps
  medium: 22.22, // 45fps
  high: 16.67,   // 60fps
  ultra: Infinity,
};

const QUALITY_LEVELS: QualitySettings[] = [
  // Level 0: Lowest
  {
    terrainLOD: 3,
    shadowMapResolution: 512,
    particleCount: 0.2,
    scatterDensity: 0.2,
    postProcessQuality: 0.2,
    textureResolution: 0.5,
    drawDistance: 0.4,
  },
  // Level 1: Low
  {
    terrainLOD: 2,
    shadowMapResolution: 1024,
    particleCount: 0.4,
    scatterDensity: 0.4,
    postProcessQuality: 0.4,
    textureResolution: 0.7,
    drawDistance: 0.6,
  },
  // Level 2: Medium
  {
    terrainLOD: 1,
    shadowMapResolution: 1024,
    particleCount: 0.6,
    scatterDensity: 0.6,
    postProcessQuality: 0.7,
    textureResolution: 0.85,
    drawDistance: 0.8,
  },
  // Level 3: High
  {
    terrainLOD: 0,
    shadowMapResolution: 2048,
    particleCount: 0.8,
    scatterDensity: 0.8,
    postProcessQuality: 0.9,
    textureResolution: 1.0,
    drawDistance: 0.95,
  },
  // Level 4: Ultra
  {
    terrainLOD: 0,
    shadowMapResolution: 4096,
    particleCount: 1.0,
    scatterDensity: 1.0,
    postProcessQuality: 1.0,
    textureResolution: 1.0,
    drawDistance: 1.0,
  },
];

const DEFAULT_CONFIG: FrameBudgetConfig = {
  preset: 'high',
  adaptationSpeed: 0.3,
  averagingWindow: 60,
  hysteresis: 0.15,
  minChangeInterval: 2000,
};

// ---------------------------------------------------------------------------
// FrameBudgetManager class
// ---------------------------------------------------------------------------

export class FrameBudgetManager {
  private config: FrameBudgetConfig;
  private frameTimes: number[] = [];
  private currentLevel: number = 3; // Start at High
  private lastChangeTime: number = 0;
  private stats: FrameBudgetStats;
  private totalFrames: number = 0;
  private droppedFrames: number = 0;

  constructor(config: Partial<FrameBudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLevel = this.presetToLevel(this.config.preset);

    this.stats = {
      avgFrameTimeMs: 0,
      minFrameTimeMs: Infinity,
      maxFrameTimeMs: 0,
      currentFPS: 0,
      currentQuality: this.config.preset,
      qualityLevel: this.currentLevel,
      budgetMs: PRESET_BUDGETS[this.config.preset],
      qualityHistory: [],
      totalFrames: 0,
      droppedFrames: 0,
    };
  }

  /**
   * Call this every frame with the frame delta time in ms
   */
  update(deltaMs: number): QualitySettings {
    this.totalFrames++;

    // Track frame time
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > this.config.averagingWindow) {
      this.frameTimes.shift();
    }

    // Update min/max
    if (deltaMs < this.stats.minFrameTimeMs) {
      this.stats.minFrameTimeMs = deltaMs;
    }
    if (deltaMs > this.stats.maxFrameTimeMs) {
      this.stats.maxFrameTimeMs = deltaMs;
    }

    // Count dropped frames (below 30fps = above 33ms)
    if (deltaMs > 33.33) {
      this.droppedFrames++;
    }

    // Compute average
    const avg = this.computeAverage();
    this.stats.avgFrameTimeMs = avg;
    this.stats.currentFPS = avg > 0 ? 1000 / avg : 0;
    this.stats.totalFrames = this.totalFrames;
    this.stats.droppedFrames = this.droppedFrames;

    // Don't adapt for Ultra preset
    if (this.config.preset === 'ultra') {
      this.stats.currentQuality = 'ultra';
      this.stats.qualityLevel = 4;
      this.currentLevel = 4;
      return QUALITY_LEVELS[4];
    }

    // Check if we should adapt quality
    const now = performance.now();
    const timeSinceLastChange = now - this.lastChangeTime;

    if (timeSinceLastChange < this.config.minChangeInterval) {
      return QUALITY_LEVELS[this.currentLevel];
    }

    const budget = PRESET_BUDGETS[this.config.preset];
    const hysteresis = this.config.hysteresis;

    // Quality decrease: frame time exceeds budget significantly
    if (avg > budget * (1 + hysteresis)) {
      if (this.currentLevel > 0) {
        this.currentLevel--;
        this.lastChangeTime = now;
        this.recordQualityChange();
      }
    }
    // Quality increase: frame time well under budget
    else if (avg < budget * (1 - hysteresis) * 0.8) {
      if (this.currentLevel < 4) {
        this.currentLevel++;
        this.lastChangeTime = now;
        this.recordQualityChange();
      }
    }

    // Update stats
    this.stats.qualityLevel = this.currentLevel;
    this.stats.budgetMs = budget;
    this.stats.currentQuality = this.levelToPreset(this.currentLevel);

    return QUALITY_LEVELS[this.currentLevel];
  }

  /**
   * Get current quality settings without updating
   */
  getCurrentQuality(): QualitySettings {
    return QUALITY_LEVELS[this.currentLevel];
  }

  /**
   * Force a specific quality level
   */
  setQualityLevel(level: number): void {
    this.currentLevel = Math.max(0, Math.min(4, level));
    this.lastChangeTime = performance.now();
    this.recordQualityChange();
    this.stats.qualityLevel = this.currentLevel;
    this.stats.currentQuality = this.levelToPreset(this.currentLevel);
  }

  /**
   * Set quality preset
   */
  setPreset(preset: QualityPreset): void {
    this.config.preset = preset;
    this.currentLevel = this.presetToLevel(preset);
    this.lastChangeTime = performance.now();
    this.stats.budgetMs = PRESET_BUDGETS[preset];
    this.stats.currentQuality = preset;
    this.stats.qualityLevel = this.currentLevel;
  }

  /**
   * Get statistics
   */
  getStats(): FrameBudgetStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.frameTimes = [];
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.stats.minFrameTimeMs = Infinity;
    this.stats.maxFrameTimeMs = 0;
    this.stats.qualityHistory = [];
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private computeAverage(): number {
    if (this.frameTimes.length === 0) return 0;
    let sum = 0;
    for (const t of this.frameTimes) sum += t;
    return sum / this.frameTimes.length;
  }

  private presetToLevel(preset: QualityPreset): number {
    switch (preset) {
      case 'low': return 0;
      case 'medium': return 2;
      case 'high': return 3;
      case 'ultra': return 4;
    }
  }

  private levelToPreset(level: number): QualityPreset {
    if (level <= 1) return 'low';
    if (level <= 2) return 'medium';
    if (level <= 3) return 'high';
    return 'ultra';
  }

  private recordQualityChange(): void {
    this.stats.qualityHistory.push({
      time: Date.now(),
      quality: this.levelToPreset(this.currentLevel),
      fps: this.stats.currentFPS,
    });

    // Keep history manageable
    if (this.stats.qualityHistory.length > 100) {
      this.stats.qualityHistory.shift();
    }
  }
}
