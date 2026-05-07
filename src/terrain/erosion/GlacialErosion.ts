/**
 * GlacialErosion.ts
 * Glacier-based erosion producing U-shaped valleys, moraines, and glacial carving
 *
 * This module simulates:
 * - Ice accumulation at high elevations with steep slopes
 * - Glacier flow following steepest descent paths
 * - Abrasion: glacier base grinds bedrock, widening valleys into U-shapes
 * - Plucking: glacier pulls rock chunks from valley walls and lee sides
 * - Deposition: moraine ridges where glacier retreats or slows
 *
 * The key geomorphological signature is the transformation of V-shaped fluvial
 * valleys into broad, flat-bottomed U-shaped valleys with steep walls.
 *
 * @see https://github.com/princeton-vl/infinigen
 */

import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GlacierConfig {
  /** Maximum ice thickness (meters equivalent) — controls depth of glacial carving */
  iceThickness: number;
  /** Speed multiplier for glacier flow per iteration */
  flowSpeed: number;
  /** Rate of abrasive wear at the glacier base */
  abrasionRate: number;
  /** Rate of rock plucking from valley walls */
  pluckingRate: number;
  /** Random seed for deterministic results */
  seed: number;
  /** Number of simulation iterations */
  iterations: number;
}

const DEFAULT_GLACIER_CONFIG: GlacierConfig = {
  iceThickness: 200,
  flowSpeed: 0.5,
  abrasionRate: 0.01,
  pluckingRate: 0.005,
  seed: 42,
  iterations: 50,
};

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

/** Per-cell glacier state */
interface GlacierCell {
  /** Accumulated ice thickness at this cell */
  ice: number;
  /** Flow velocity magnitude (used for erosion intensity) */
  velocity: number;
  /** Direction of flow (unit vector stored as dx, dy) */
  flowDx: number;
  flowDy: number;
  /** Sediment load carried by the ice at this cell */
  sediment: number;
}

// ---------------------------------------------------------------------------
// GlacialErosion
// ---------------------------------------------------------------------------

export class GlacialErosion {
  private config: GlacierConfig;
  private rng: SeededRandom;

  constructor(config: Partial<GlacierConfig> = {}) {
    this.config = { ...DEFAULT_GLACIER_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Apply glacial erosion to a heightmap.
   *
   * @param heightMap - Flat array of terrain heights (row-major)
   * @param width     - Grid width
   * @param height    - Grid height
   * @param config    - Optional overrides applied on top of current config
   * @returns A **new** Float32Array with eroded heights (original is not mutated)
   */
  erode(
    heightMap: Float32Array,
    width: number,
    height: number,
    config?: Partial<GlacierConfig>,
  ): Float32Array {
    // Merge any per-call overrides
    const cfg: GlacierConfig = config
      ? { ...this.config, ...config }
      : this.config;

    // Reset RNG for deterministic output
    this.rng = new SeededRandom(cfg.seed);

    // Work on a copy so the input is immutable
    const hMap = new Float32Array(heightMap);

    // Allocate per-cell glacier state
    const cells = new Array<GlacierCell>(width * height);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = { ice: 0, velocity: 0, flowDx: 0, flowDy: 0, sediment: 0 };
    }

    // ---- Phase 1: Ice Accumulation ----
    this.accumulateIce(hMap, width, height, cells, cfg);

    // ---- Iterative glacier flow + erosion loop ----
    for (let iter = 0; iter < cfg.iterations; iter++) {
      // Phase 2: Compute flow direction & velocity
      this.computeFlow(hMap, width, height, cells, cfg);

      // Phase 3: Abrasion — glacier base grinds rock
      this.abrade(hMap, width, height, cells, cfg);

      // Phase 4: Plucking — glacier rips chunks from walls
      this.pluck(hMap, width, height, cells, cfg);

      // Phase 5: Deposition — moraine formation where ice slows / retreats
      this.deposit(hMap, width, height, cells, cfg);

      // Phase 6: U-shape widening — the hallmark of glacial valleys
      this.widenValley(hMap, width, height, cells, cfg);

      // Small additional accumulation each iteration to simulate snowfall
      this.accumulateIceIncremental(hMap, width, height, cells, cfg, 0.02);
    }

    return hMap;
  }

  // -----------------------------------------------------------------------
  // Phase 1: Ice Accumulation
  // -----------------------------------------------------------------------

  /**
   * Ice accumulates where it is cold enough (high elevation) and where
   * slopes are steep enough to compact snow into firn / ice.  We also
   * allow accumulation in existing depressions (cirques).
   */
  private accumulateIce(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    // Compute elevation statistics for relative thresholds
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let i = 0; i < hMap.length; i++) {
      if (hMap[i] < minElev) minElev = hMap[i];
      if (hMap[i] > maxElev) maxElev = hMap[i];
    }
    const elevRange = maxElev - minElev || 1;

    // Threshold: ice only forms in the upper 40% of elevation by default
    const snowLine = minElev + elevRange * 0.4;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const elev = hMap[idx];

        if (elev < snowLine) continue;

        // Slope-based accumulation factor
        const slope = this.computeSlope(hMap, w, h, x, y);

        // Normalised elevation above snow line (0..1)
        const elevFactor = (elev - snowLine) / (maxElev - snowLine || 1);

        // Steeper slopes collect more wind-drifted snow, up to a point
        const slopeFactor = Math.min(slope * 2, 1);

        // Depression factor: local minima fill with ice (cirque formation)
        const isDepression = this.isLocalMinimum(hMap, w, h, x, y);
        const depressionFactor = isDepression ? 1.5 : 1.0;

        cells[idx].ice =
          cfg.iceThickness *
          elevFactor *
          (0.5 + 0.5 * slopeFactor) *
          depressionFactor;
      }
    }
  }

  /**
   * Small incremental accumulation each iteration (simulates ongoing snowfall).
   */
  private accumulateIceIncremental(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
    fraction: number,
  ): void {
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let i = 0; i < hMap.length; i++) {
      if (hMap[i] < minElev) minElev = hMap[i];
      if (hMap[i] > maxElev) maxElev = hMap[i];
    }
    const elevRange = maxElev - minElev || 1;
    const snowLine = minElev + elevRange * 0.4;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (hMap[idx] >= snowLine) {
          const elevFactor = (hMap[idx] - snowLine) / (maxElev - snowLine || 1);
          cells[idx].ice += cfg.iceThickness * elevFactor * fraction;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Flow Computation
  // -----------------------------------------------------------------------

  /**
   * Glacier ice flows downhill following the steepest descent.
   * Velocity is proportional to ice thickness × surface slope.
   */
  private computeFlow(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const ice = cells[idx].ice;
        if (ice <= 0) continue;

        // Surface = terrain + ice
        const surface = hMap[idx] + ice;

        // Find steepest descent among 8 neighbors
        let bestDx = 0;
        let bestDy = 0;
        let maxDrop = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            const nIdx = ny * w + nx;
            const nSurface = hMap[nIdx] + cells[nIdx].ice;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const drop = (surface - nSurface) / dist;
            if (drop > maxDrop) {
              maxDrop = drop;
              bestDx = dx / dist;
              bestDy = dy / dist;
            }
          }
        }

        // Velocity ∝ ice thickness × slope (Glen's flow law, simplified)
        const slope = maxDrop;
        cells[idx].velocity = cfg.flowSpeed * Math.min(ice / cfg.iceThickness, 1) * slope;
        cells[idx].flowDx = bestDx;
        cells[idx].flowDy = bestDy;

        // Transfer ice downhill
        if (maxDrop > 0) {
          const transferIce = ice * cfg.flowSpeed * slope * 0.1;
          const nIdx = (y + Math.round(bestDy)) * w + (x + Math.round(bestDx));
          if (nIdx >= 0 && nIdx < w * h) {
            cells[idx].ice -= transferIce;
            cells[nIdx].ice += transferIce;
            // Sediment moves with the ice
            const transferSed = cells[idx].sediment * cfg.flowSpeed * slope * 0.1;
            cells[idx].sediment -= transferSed;
            cells[nIdx].sediment += transferSed;
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3: Abrasion
  // -----------------------------------------------------------------------

  /**
   * Abrasion occurs at the glacier base where ice slides over bedrock.
   * Erosion rate ∝ ice thickness × sliding velocity × rock fragment concentration.
   * This deepens the valley floor preferentially, creating the flat bottom
   * of a U-shaped valley.
   */
  private abrade(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const ice = cells[idx].ice;
        if (ice <= 0) continue;

        const velocity = cells[idx].velocity;
        if (velocity <= 0) continue;

        // Abrasion depth is proportional to basal pressure (ice thickness)
        // and sliding velocity
        const abrasionAmount =
          cfg.abrasionRate * (ice / cfg.iceThickness) * velocity;

        if (abrasionAmount > 0) {
          // Lower the terrain
          hMap[idx] -= abrasionAmount;
          // Add eroded material to glacier's sediment load
          cells[idx].sediment += abrasionAmount;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4: Plucking
  // -----------------------------------------------------------------------

  /**
   * Plucking (quarrying) occurs on the lee side of bedrock obstacles
   * where meltwater freezes in joints and the glacier pulls rock fragments.
   * This steepens valley walls — a key contributor to the U-shape.
   */
  private pluck(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const ice = cells[idx].ice;
        if (ice <= 0) continue;

        const velocity = cells[idx].velocity;
        if (velocity <= 0) continue;

        // Plucking happens preferentially on lee sides (downstream)
        // and on steep walls adjacent to the glacier
        const flowDx = cells[idx].flowDx;
        const flowDy = cells[idx].flowDy;

        // Check the cell in the downstream direction (lee side)
        const leeX = x + Math.round(flowDx);
        const leeY = y + Math.round(flowDy);

        if (leeX > 0 && leeX < w - 1 && leeY > 0 && leeY < h - 1) {
          const leeIdx = leeY * w + leeX;
          const slope = this.computeSlope(hMap, w, h, leeX, leeY);

          // Plucking more effective on steep slopes with fractured rock
          const pluckAmount =
            cfg.pluckingRate * (ice / cfg.iceThickness) * velocity * slope;

          if (pluckAmount > 0 && cells[leeIdx].ice > 0) {
            hMap[leeIdx] -= pluckAmount;
            cells[leeIdx].sediment += pluckAmount;
          }
        }

        // Also pluck from steep valley walls adjacent to ice
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;

            const nIdx = ny * w + nx;
            // Wall cell: has no ice but is steep
            if (cells[nIdx].ice > 0) continue;

            const wallSlope = this.computeSlope(hMap, w, h, nx, ny);
            // Only pluck steep walls
            if (wallSlope > 0.3) {
              const wallPluck =
                cfg.pluckingRate * 0.5 * (ice / cfg.iceThickness) * wallSlope;
              hMap[nIdx] -= wallPluck;
              cells[idx].sediment += wallPluck;
            }
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 5: Deposition (Moraines)
  // -----------------------------------------------------------------------

  /**
   * When a glacier slows or retreats, it deposits sediment as moraines.
   * Lateral moraines form along valley walls; terminal moraines at the
   * glacier snout; ground moraine (till) beneath the ice.
   */
  private deposit(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const sed = cells[idx].sediment;
        if (sed <= 0) continue;

        const velocity = cells[idx].velocity;

        // Deposition occurs where velocity is low (ice is slowing / melting)
        if (velocity < 0.05) {
          // Deposit fraction of sediment
          const depositFraction = (0.05 - velocity) / 0.05;
          const depositAmount = sed * depositFraction * 0.3;
          hMap[idx] += depositAmount;
          cells[idx].sediment -= depositAmount;
        }

        // Lateral moraine: deposit at edges of glacier where ice meets rock
        const ice = cells[idx].ice;
        if (ice > 0) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx <= 0 || nx >= w - 1 || ny <= 0 || ny >= h - 1) continue;

              const nIdx = ny * w + nx;
              // Neighbor has no ice — this is the glacier edge
              if (cells[nIdx].ice <= 0) {
                // Deposit lateral moraine
                const moraineAmount = sed * 0.05;
                hMap[nIdx] += moraineAmount;
                cells[idx].sediment -= moraineAmount * 0.5;
              }
            }
          }
        }

        // Terminal moraine: deposit at the glacier snout
        // (where ice thickness drops to near zero at the downhill end)
        if (ice > 0 && ice < cfg.iceThickness * 0.1) {
          const snoutDeposit = sed * 0.2;
          hMap[idx] += snoutDeposit;
          cells[idx].sediment -= snoutDeposit;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 6: U-Shape Valley Widening
  // -----------------------------------------------------------------------

  /**
   * The hallmark of glacial erosion: V-shaped fluvial valleys become
   * broad, flat-bottomed U-shaped valleys.  This is achieved by
   * preferentially eroding the *walls* adjacent to glacier-filled cells
   * while preserving the valley floor, creating a characteristic
   * parabolic cross-section.
   */
  private widenValley(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    cfg: GlacierConfig,
  ): void {
    const wideningMap = new Float32Array(w * h);

    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const idx = y * w + x;
        const ice = cells[idx].ice;
        if (ice <= 0) continue;

        // Find the valley floor: the lowest elevation among glacier-covered
        // neighbors in the cross-valley (perpendicular to flow) direction.
        const flowDx = cells[idx].flowDx;
        const flowDy = cells[idx].flowDy;

        // Perpendicular direction to flow (cross-valley)
        const perpDx = -flowDy;
        const perpDy = flowDx;

        // Sample valley cross-section
        const valleyFloor = this.findValleyFloor(
          hMap, w, h, cells, x, y, perpDx, perpDy,
        );

        if (valleyFloor === null) continue;

        // For each wall cell adjacent to the glacier, erode it toward
        // the valley floor level, creating the U-shape
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 1 || nx >= w - 1 || ny < 1 || ny >= h - 1) continue;

            const nIdx = ny * w + nx;

            // Only widen non-glacier cells (walls) that are above the floor
            if (cells[nIdx].ice > 0) continue;
            if (hMap[nIdx] <= valleyFloor) continue;

            // Distance from the glacier cell
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Widening amount decreases with distance from glacier edge
            // and is stronger for thicker ice
            const iceFactor = Math.min(ice / cfg.iceThickness, 1);
            const distFactor = Math.max(0, 1 - dist / 3);
            const heightAboveFloor = hMap[nIdx] - valleyFloor;

            // Push wall toward a parabolic profile (U-shape)
            // The wall is eroded proportionally to how much it oversteps
            // the ideal parabolic cross-section
            const wideningAmount =
              cfg.abrasionRate * 0.5 * iceFactor * distFactor * heightAboveFloor;

            if (wideningAmount > 0) {
              wideningMap[nIdx] += wideningAmount;
            }
          }
        }
      }
    }

    // Apply accumulated widening
    for (let i = 0; i < hMap.length; i++) {
      hMap[i] -= wideningMap[i];
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Compute the slope magnitude at a cell using central differences.
   */
  private computeSlope(
    hMap: Float32Array,
    w: number,
    h: number,
    x: number,
    y: number,
  ): number {
    const idx = y * w + x;

    // Central differences (clamped at edges)
    const left = x > 0 ? hMap[idx - 1] : hMap[idx];
    const right = x < w - 1 ? hMap[idx + 1] : hMap[idx];
    const up = y > 0 ? hMap[idx - w] : hMap[idx];
    const down = y < h - 1 ? hMap[idx + w] : hMap[idx];

    const dhdx = (right - left) * 0.5;
    const dhdy = (down - up) * 0.5;

    return Math.sqrt(dhdx * dhdx + dhdy * dhdy);
  }

  /**
   * Returns true if the cell is a local minimum among its 8 neighbors.
   */
  private isLocalMinimum(
    hMap: Float32Array,
    w: number,
    h: number,
    x: number,
    y: number,
  ): boolean {
    const idx = y * w + x;
    const center = hMap[idx];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        if (hMap[ny * w + nx] < center) return false;
      }
    }
    return true;
  }

  /**
   * Sample the valley floor elevation by scanning perpendicular to flow
   * and finding the minimum elevation under the glacier.
   */
  private findValleyFloor(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: GlacierCell[],
    x: number,
    y: number,
    perpDx: number,
    perpDy: number,
  ): number | null {
    let minElev = Infinity;
    let found = false;

    // Scan ±3 cells perpendicular to flow
    for (let offset = -3; offset <= 3; offset++) {
      const sx = Math.round(x + perpDx * offset);
      const sy = Math.round(y + perpDy * offset);

      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;

      const sIdx = sy * w + sx;
      if (cells[sIdx].ice > 0) {
        minElev = Math.min(minElev, hMap[sIdx]);
        found = true;
      }
    }

    return found ? minElev : null;
  }
}

export default GlacialErosion;
