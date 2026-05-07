/**
 * CoastalErosion.ts
 * Wave-based coastal erosion producing sea cliffs, wave-cut platforms, beaches, and sea stacks
 *
 * This module simulates:
 * - Coastline identification (transition between above/below sea level)
 * - Wave erosion: cliffs form where waves hit steep coastlines
 * - Wave-cut platforms: flat areas at sea level created by wave action
 * - Beach deposition: eroded material deposited as gentle slopes below sea level
 * - Sea stacks: isolated rock columns left behind by differential erosion
 *
 * @see https://github.com/princeton-vl/infinigen
 */

import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CoastalConfig {
  /** Elevation considered as sea level */
  seaLevel: number;
  /** Maximum wave height (controls cliff erosion intensity) */
  waveHeight: number;
  /** Wave period — longer periods mean more sustained attack */
  wavePeriod: number;
  /** Base rate of erosion per iteration */
  erosionRate: number;
  /** Rate of sediment deposition (beach formation) */
  depositionRate: number;
  /** Random seed for deterministic results */
  seed: number;
  /** Number of simulation iterations */
  iterations: number;
}

const DEFAULT_COASTAL_CONFIG: CoastalConfig = {
  seaLevel: 0,
  waveHeight: 2,
  wavePeriod: 100,
  erosionRate: 0.003,
  depositionRate: 0.001,
  seed: 42,
  iterations: 100,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Cell classification relative to sea level */
const enum CellType {
  DeepWater,
  ShallowWater,
  Coastline,
  Land,
}

/** Per-cell coastal state */
interface CoastalCell {
  type: CellType;
  /** Accumulated wave energy at this cell */
  waveEnergy: number;
  /** Suspended sediment from erosion */
  sediment: number;
  /** Whether this cell is part of a sea stack */
  isStack: boolean;
}

// ---------------------------------------------------------------------------
// CoastalErosion
// ---------------------------------------------------------------------------

export class CoastalErosion {
  private config: CoastalConfig;
  private rng: SeededRandom;

  constructor(config: Partial<CoastalConfig> = {}) {
    this.config = { ...DEFAULT_COASTAL_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);
  }

  /**
   * Apply coastal erosion to a heightmap.
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
    config?: Partial<CoastalConfig>,
  ): Float32Array {
    const cfg: CoastalConfig = config
      ? { ...this.config, ...config }
      : this.config;

    // Reset RNG for deterministic output
    this.rng = new SeededRandom(cfg.seed);

    // Work on a copy
    const hMap = new Float32Array(heightMap);

    // Allocate per-cell state
    const cells = new Array<CoastalCell>(width * height);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = { type: CellType.DeepWater, waveEnergy: 0, sediment: 0, isStack: false };
    }

    // ---- Iterative coastal erosion loop ----
    for (let iter = 0; iter < cfg.iterations; iter++) {
      // Phase 1: Classify cells relative to sea level
      this.classifyCells(hMap, width, height, cells, cfg);

      // Phase 2: Propagate wave energy toward the coastline
      this.propagateWaveEnergy(hMap, width, height, cells, cfg, iter);

      // Phase 3: Cliff erosion at coastline cells
      this.erodeCliffs(hMap, width, height, cells, cfg);

      // Phase 4: Wave-cut platform formation
      this.formWaveCutPlatform(hMap, width, height, cells, cfg);

      // Phase 5: Beach deposition below sea level
      this.depositBeach(hMap, width, height, cells, cfg);

      // Phase 6: Sea stack formation (periodic check)
      if (iter % 10 === 0) {
        this.formSeaStacks(hMap, width, height, cells, cfg);
      }
    }

    return hMap;
  }

  // -----------------------------------------------------------------------
  // Phase 1: Cell Classification
  // -----------------------------------------------------------------------

  /**
   * Classify each cell as deep water, shallow water, coastline, or land.
   * Coastline cells are land cells adjacent to water cells — the primary
   * target for wave erosion.
   */
  private classifyCells(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
  ): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const elev = hMap[idx];
        cells[idx].isStack = false; // reset each classification pass

        if (elev > cfg.seaLevel + cfg.waveHeight) {
          // Well above sea level: land
          cells[idx].type = CellType.Land;
        } else if (elev > cfg.seaLevel) {
          // Just above sea level — check if adjacent to water → coastline
          let adjacentToWater = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              if (hMap[ny * w + nx] <= cfg.seaLevel) {
                adjacentToWater = true;
                break;
              }
            }
            if (adjacentToWater) break;
          }
          cells[idx].type = adjacentToWater ? CellType.Coastline : CellType.Land;
        } else if (elev > cfg.seaLevel - cfg.waveHeight * 2) {
          // Shallow water near coast
          cells[idx].type = CellType.ShallowWater;
        } else {
          cells[idx].type = CellType.DeepWater;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Wave Energy Propagation
  // -----------------------------------------------------------------------

  /**
   * Waves carry energy from the open ocean toward the coastline.
   * Wave energy dissipates in shallow water but concentrates at headlands.
   * We approximate this by diffusing energy from deep water toward the coast,
   * with energy focusing on convex coastline features (headlands).
   */
  private propagateWaveEnergy(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
    iteration: number,
  ): void {
    // Reset wave energy
    for (let i = 0; i < cells.length; i++) {
      cells[i].waveEnergy = 0;
    }

    // Deep water cells start with full wave energy (sinusoidal over time)
    const wavePhase = (iteration / cfg.wavePeriod) * Math.PI * 2;
    const baseEnergy = cfg.waveHeight * (0.8 + 0.2 * Math.sin(wavePhase));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (cells[idx].type === CellType.DeepWater) {
          cells[idx].waveEnergy = baseEnergy;
        }
      }
    }

    // Propagate energy toward coast over a few diffusion steps
    const diffusionSteps = 5;
    for (let step = 0; step < diffusionSteps; step++) {
      const nextEnergy = new Float32Array(w * h);

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          const currentE = cells[idx].waveEnergy;

          // Average of neighbors (simple diffusion)
          let sum = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = (y + dy) * w + (x + dx);
              sum += cells[nIdx].waveEnergy;
              count++;
            }
          }
          const avg = sum / count;

          // Energy concentrates at headlands: coastline cells with more
          // water neighbors receive more energy
          if (cells[idx].type === CellType.Coastline) {
            let waterNeighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nIdx = (y + dy) * w + (x + dx);
                if (
                  cells[nIdx].type === CellType.DeepWater ||
                  cells[nIdx].type === CellType.ShallowWater
                ) {
                  waterNeighbors++;
                }
              }
            }
            // Headlands have water on 3+ sides → more focused wave energy
            const concentrationFactor = 1 + waterNeighbors * 0.2;
            nextEnergy[idx] = avg * concentrationFactor;
          } else if (cells[idx].type === CellType.ShallowWater) {
            // Shallow water attenuates energy slightly (wave shoaling)
            nextEnergy[idx] = avg * 0.9;
          } else if (cells[idx].type === CellType.DeepWater) {
            nextEnergy[idx] = Math.max(currentE, avg);
          } else {
            // Land: minimal energy propagation
            nextEnergy[idx] = avg * 0.1;
          }
        }
      }

      // Copy back
      for (let i = 0; i < cells.length; i++) {
        cells[i].waveEnergy = nextEnergy[i];
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 3: Cliff Erosion
  // -----------------------------------------------------------------------

  /**
   * Where waves hit steep coastlines, cliffs form.
   * Erosion rate ∝ wave energy × cliff steepness.
   * Material is removed from the cliff face and added to sediment.
   */
  private erodeCliffs(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;

        // Only erode coastline cells
        if (cells[idx].type !== CellType.Coastline) continue;

        const waveEnergy = cells[idx].waveEnergy;
        if (waveEnergy <= 0) continue;

        // Compute cliff steepness (max height difference to water neighbors)
        let maxCliffHeight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            // Height difference to water cell
            if (
              cells[nIdx].type === CellType.DeepWater ||
              cells[nIdx].type === CellType.ShallowWater
            ) {
              const diff = hMap[idx] - hMap[nIdx];
              if (diff > maxCliffHeight) maxCliffHeight = diff;
            }
          }
        }

        if (maxCliffHeight <= 0) continue;

        // Erosion proportional to wave energy and cliff height
        const erosionAmount =
          cfg.erosionRate * waveEnergy * Math.min(maxCliffHeight / cfg.waveHeight, 3);

        // Remove material from cliff top and face
        hMap[idx] -= erosionAmount;

        // Also erode land cells just behind the cliff (undercutting)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;

            // Land cells adjacent to the cliff get some undercutting
            if (cells[nIdx].type === CellType.Land && hMap[nIdx] > hMap[idx]) {
              const undercut = erosionAmount * 0.3;
              hMap[nIdx] -= undercut;
              cells[idx].sediment += undercut;
            }
          }
        }

        // Add eroded material to sediment
        cells[idx].sediment += erosionAmount;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4: Wave-Cut Platform
  // -----------------------------------------------------------------------

  /**
   * Wave action creates flat platforms just below sea level.
   * Where cliffs retreat, they leave behind a gently sloping surface
   * at approximately sea level — the wave-cut platform.
   */
  private formWaveCutPlatform(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
  ): void {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;

        // Platform forms at coastline and shallow water cells
        if (
          cells[idx].type !== CellType.Coastline &&
          cells[idx].type !== CellType.ShallowWater
        ) {
          continue;
        }

        const waveEnergy = cells[idx].waveEnergy;
        if (waveEnergy <= 0) continue;

        // Target elevation for the platform: slightly below sea level
        const platformElev = cfg.seaLevel - cfg.waveHeight * 0.1;

        if (hMap[idx] > platformElev) {
          // Gradually lower toward platform level
          const diff = hMap[idx] - platformElev;
          const smoothing = cfg.erosionRate * waveEnergy * 0.5;
          hMap[idx] -= Math.min(diff, smoothing);
        } else if (hMap[idx] < platformElev - cfg.waveHeight * 0.3) {
          // Don't carve too deep — slight deposition can occur
          const fill = cfg.depositionRate * 0.5;
          hMap[idx] += fill;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 5: Beach Deposition
  // -----------------------------------------------------------------------

  /**
   * Eroded cliff material is transported and deposited as beaches.
   * Beaches form as gentle slopes just below and at sea level,
   * on the sheltered (lee) side of coastline features.
   */
  private depositBeach(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
  ): void {
    // Move sediment from coastline/shallow water to deposition sites
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const sed = cells[idx].sediment;
        if (sed <= 0) continue;

        // Find deposition sites: shallow water or low-energy coastline
        // Sediment moves toward lower energy areas
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;

            const nIdx = ny * w + nx;

            // Deposit in shallow water (below sea level but near it)
            if (
              cells[nIdx].type === CellType.ShallowWater ||
              (cells[nIdx].type === CellType.Coastline &&
                hMap[nIdx] <= cfg.seaLevel + cfg.waveHeight * 0.2)
            ) {
              // Deposition rate inversely proportional to wave energy
              // (sediment settles in calmer water)
              const energyFactor = Math.max(0, 1 - cells[nIdx].waveEnergy / cfg.waveHeight);
              const depositAmount = sed * cfg.depositionRate * energyFactor * 0.5;

              if (depositAmount > 0) {
                hMap[nIdx] += depositAmount;
                cells[idx].sediment -= depositAmount * 0.3;
              }
            }
          }
        }

        // Also deposit directly at current cell if low energy
        if (cells[idx].waveEnergy < cfg.waveHeight * 0.3) {
          const directDeposit = sed * cfg.depositionRate * 0.2;
          hMap[idx] += directDeposit;
          cells[idx].sediment -= directDeposit;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 6: Sea Stack Formation
  // -----------------------------------------------------------------------

  /**
   * Sea stacks are isolated rock columns left behind when a headland
   * is eroded through. They form when a narrow section of cliff is
   * surrounded by water on multiple sides but is resistant to erosion.
   *
   * Algorithm:
   * 1. Find coastline cells surrounded by water on ≥ 4 of 8 neighbor positions
   * 2. These narrow peninsulas are candidates for stack formation
   * 3. With some probability (based on rock hardness simulation), the
   *    connecting land bridge erodes faster, isolating the stack
   */
  private formSeaStacks(
    hMap: Float32Array,
    w: number,
    h: number,
    cells: CoastalCell[],
    cfg: CoastalConfig,
  ): void {
    const stackCandidates: Array<{ x: number; y: number; waterSides: number }> = [];

    // Find narrow headlands with water on multiple sides
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const idx = y * w + x;
        if (cells[idx].type !== CellType.Coastline && cells[idx].type !== CellType.Land) continue;

        // Count water sides in a 5×5 neighborhood
        let waterSides = 0;
        let landSides = 0;

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (
              cells[nIdx].type === CellType.DeepWater ||
              cells[nIdx].type === CellType.ShallowWater
            ) {
              waterSides++;
            } else {
              landSides++;
            }
          }
        }

        // Narrow peninsula: more water than land neighbors
        if (waterSides >= 12 && landSides <= 8) {
          stackCandidates.push({ x, y, waterSides });
        }
      }
    }

    // Form stacks from candidates using deterministic random selection
    for (const candidate of stackCandidates) {
      // Only some candidates become stacks (deterministic)
      if (!this.rng.boolean(0.15)) continue;

      const { x, y } = candidate;

      // Find the narrowest land connection and erode it to separate the stack
      // Look for land cells connecting this cell to the mainland
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;

          // Land bridge cell — erode it preferentially
          if (
            cells[nIdx].type === CellType.Coastline &&
            hMap[nIdx] > cfg.seaLevel
          ) {
            // Erode the land bridge significantly
            const bridgeErosion = hMap[nIdx] - cfg.seaLevel + cfg.waveHeight * 0.1;
            hMap[nIdx] -= bridgeErosion * 0.5;
            cells[nIdx].sediment += bridgeErosion * 0.5;
          }
        }
      }

      // Mark the stack cell — it should resist erosion slightly
      // (harder rock) so it persists as an isolated column
      const stackIdx = y * w + x;
      cells[stackIdx].isStack = true;

      // Stack rises above sea level and resists further rapid erosion
      // by maintaining its height (done via reduced erosion in future passes)
    }
  }
}

export default CoastalErosion;
