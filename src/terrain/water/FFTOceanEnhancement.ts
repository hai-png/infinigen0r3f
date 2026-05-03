/**
 * FFTOceanEnhancement — P3.2: FFT Ocean Enhancement
 *
 * Extends the existing FFTOceanSpectrum with a complete Phillips spectrum
 * implementation, wind direction / fetch-length controls, choppy horizontal
 * displacement, and a normal-map generator that can be consumed by the
 * rasterized rendering path.
 *
 * The existing FFTOceanSpectrum (Phase 2) already implements the core
 * FFT pipeline. This module provides:
 *
 * 1. **Full Phillips spectrum** — the standard Phillips directional
 *    ocean-wave model with configurable wind speed, direction, and fetch.
 * 2. **Choppy displacement** — horizontal vertex displacement via the
 *    `λ·(-i·k̂)·h̃(k,t)` term so wave crests lean in the wind direction
 *    (Tessendorf §4.3).
 * 3. **Normal map generation** — CPU-side normal computation from the
 *    displacement field for use as a DataTexture in rasterize mode.
 *
 * Phase 3 — P3.2: FFT Ocean Enhancement
 *
 * @module terrain/water
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the enhanced FFT ocean spectrum.
 */
export interface FFTOceanConfig {
  /** Wind speed in m/s (default 10) */
  windSpeed: number;
  /** Wind direction in radians (default 0 = +X) */
  windDirection: number;
  /** Fetch length — distance over which wind acts on water in metres (default 100) */
  fetchLength: number;
  /** FFT grid resolution — must be power of 2 (default 64) */
  resolution: number;
  /** Physical size of the ocean patch in metres (default 128) */
  patchSize: number;
  /** Water depth for shallow-water dispersion (default 50 = deep water) */
  depth: number;
  /** Damping factor for waves opposing wind (default 0.001) */
  damping: number;
  /** Seed for deterministic generation (default 42) */
  seed: number;
  /** Choppiness scale factor λ — 0 disables horizontal displacement (default 1.0) */
  choppiness: number;
  /** Small-scale cutoff wavelength l (default 0.001) */
  smallScaleCutoff: number;
}

/**
 * Parameters for the Phillips spectrum function.
 * Exposed so callers can query / customise the spectral model.
 */
export interface PhillipsSpectrumParams {
  /** Phillips constant A — overall amplitude scale */
  amplitudeConstant: number;
  /** Largest-wave length scale L = V²/g */
  largestWavelength: number;
  /** Fetch-limited length scale min(L, fetch/2) */
  fetchLimitedWavelength: number;
  /** Wind direction (unit vector) */
  windDirX: number;
  windDirZ: number;
  /** Opposing-wave damping factor */
  damping: number;
  /** Small-scale cutoff wavelength */
  smallScaleCutoff: number;
}

// ============================================================================
// Complex helpers (lightweight, avoids importing from FFTOceanSpectrum)
// ============================================================================

interface Complex { re: number; im: number; }

function cAdd(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
function cMul(a: Complex, b: Complex): Complex { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function cScale(a: Complex, s: number): Complex { return { re: a.re * s, im: a.im * s }; }
function cConj(a: Complex): Complex { return { re: a.re, im: -a.im }; }

// ============================================================================
// Cooley-Tukey FFT
// ============================================================================

function fft(data: Complex[], inverse: boolean = false): void {
  const N = data.length;
  if (N <= 1) return;

  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) { const tmp = data[i]; data[i] = data[j]; data[j] = tmp; }
    let k = N >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }

  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = (sign * 2 * Math.PI) / len;
    const wN: Complex = { re: Math.cos(angle), im: Math.sin(angle) };
    for (let i = 0; i < N; i += len) {
      let w: Complex = { re: 1, im: 0 };
      for (let k = 0; k < half; k++) {
        const even = data[i + k];
        const t = cMul(w, data[i + k + half]);
        data[i + k] = cAdd(even, t);
        data[i + k + half] = { re: even.re - t.re, im: even.im - t.im };
        w = cMul(w, wN);
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < N; i++) { data[i].re /= N; data[i].im /= N; }
  }
}

function ifft2D(data: Complex[][], N: number): void {
  for (let y = 0; y < N; y++) fft(data[y], true);
  const col: Complex[] = new Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) col[y] = { re: data[y][x].re, im: data[y][x].im };
    fft(col, true);
    for (let y = 0; y < N; y++) { data[y][x].re = col[y].re; data[y][x].im = col[y].im; }
  }
}

// ============================================================================
// Full Phillips Spectrum
// ============================================================================

/**
 * Compute the Phillips spectrum value for wave-vector (kx, kz).
 *
 * P(k) = A · exp(-1/(kL')²) / k⁴ · |k̂·ŵ|² · damping
 *
 * Where:
 * - A = α · V²  (α = 0.0001, V = wind speed)
 * - L' = min(L, fetch/2), L = V²/g
 * - damping suppresses waves opposing the wind
 * - small-scale cutoff exp(-k²l²) prevents numerical blow-up
 */
export function phillipsSpectrum(
  kx: number,
  kz: number,
  params: PhillipsSpectrumParams,
): number {
  const kSq = kx * kx + kz * kz;
  if (kSq < 1e-12) return 0;

  const k = Math.sqrt(kSq);
  const { amplitudeConstant: A, fetchLimitedWavelength: Lp, windDirX, windDirZ, damping, smallScaleCutoff: l } = params;

  // Main spectrum term
  let P = A * Math.exp(-1.0 / (kSq * Lp * Lp)) / (kSq * kSq);

  // Directional alignment with wind
  const kDotW = (kx * windDirX + kz * windDirZ) / k;
  P *= kDotW * kDotW;

  // Damp opposing waves
  if (kDotW < 0) P *= damping;

  // Small-scale cutoff
  P *= Math.exp(-kSq * l * l);

  return P;
}

/**
 * Build a PhillipsSpectrumParams object from an FFTOceanConfig.
 */
export function buildPhillipsParams(config: FFTOceanConfig): PhillipsSpectrumParams {
  const g = 9.81;
  const L = (config.windSpeed * config.windSpeed) / g;
  const Lp = Math.min(L, config.fetchLength * 0.5);
  const A = 0.0001 * config.windSpeed * config.windSpeed;

  return {
    amplitudeConstant: A,
    largestWavelength: L,
    fetchLimitedWavelength: Lp,
    windDirX: Math.cos(config.windDirection),
    windDirZ: Math.sin(config.windDirection),
    damping: config.damping,
    smallScaleCutoff: config.smallScaleCutoff,
  };
}

// ============================================================================
// FFTOceanEnhancement
// ============================================================================

export class FFTOceanEnhancement {
  private config: FFTOceanConfig;
  private N: number;
  private rng: SeededRandom;
  private phillipsParams: PhillipsSpectrumParams;

  // Frequency-domain initial amplitudes
  private h0: Complex[][] = [];
  private h0Conj: Complex[][] = [];

  // Spatial fields (recomputed per frame)
  private heightField: Float32Array;
  private displacementX: Float32Array;
  private displacementZ: Float32Array;
  private normalFieldX: Float32Array;
  private normalFieldZ: Float32Array;

  private lastTime: number = -Infinity;

  constructor(config: Partial<FFTOceanConfig> = {}) {
    this.config = this.resolveConfig(config);
    this.N = this.config.resolution;
    this.rng = new SeededRandom(this.config.seed);
    this.phillipsParams = buildPhillipsParams(this.config);

    if (!this.isPow2(this.N)) {
      throw new Error(`FFTOceanEnhancement: resolution must be power of 2, got ${this.N}`);
    }

    const total = this.N * this.N;
    this.heightField = new Float32Array(total);
    this.displacementX = new Float32Array(total);
    this.displacementZ = new Float32Array(total);
    this.normalFieldX = new Float32Array(total);
    this.normalFieldZ = new Float32Array(total);

    this.initArrays();
    this.generateSpectrum();
  }

  // ------------------------------------------------------------------
  // Config
  // ------------------------------------------------------------------

  private resolveConfig(p: Partial<FFTOceanConfig>): FFTOceanConfig {
    return {
      windSpeed: 10,
      windDirection: 0,
      fetchLength: 100,
      resolution: 64,
      patchSize: 128,
      depth: 50,
      damping: 0.001,
      seed: 42,
      choppiness: 1.0,
      smallScaleCutoff: 0.001,
      ...p,
    };
  }

  private isPow2(n: number): boolean { return n > 0 && (n & (n - 1)) === 0; }

  // ------------------------------------------------------------------
  // Initialisation
  // ------------------------------------------------------------------

  private initArrays(): void {
    this.h0 = [];
    this.h0Conj = [];
    for (let y = 0; y < this.N; y++) {
      this.h0[y] = [];
      this.h0Conj[y] = [];
      for (let x = 0; x < this.N; x++) {
        this.h0[y][x] = { re: 0, im: 0 };
        this.h0Conj[y][x] = { re: 0, im: 0 };
      }
    }
  }

  /**
   * Generate the initial frequency-domain spectrum using the full Phillips model.
   */
  private generateSpectrum(): void {
    this.rng = new SeededRandom(this.config.seed);
    this.phillipsParams = buildPhillipsParams(this.config);
    const N = this.N;
    const L = this.config.patchSize;
    const dk = (2 * Math.PI) / L;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const kx = (x - N / 2) * dk;
        const kz = (y - N / 2) * dk;

        const P = phillipsSpectrum(kx, kz, this.phillipsParams);
        const sqrtP = Math.sqrt(Math.max(0, P));

        const gR = this.rng.gaussian();
        const gI = this.rng.gaussian();
        const scale = sqrtP / Math.SQRT2;
        this.h0[y][x] = { re: gR * scale, im: gI * scale };

        // Conjugate for -k
        const Pneg = phillipsSpectrum(-kx, -kz, this.phillipsParams);
        const sqrtPneg = Math.sqrt(Math.max(0, Pneg));
        const gR2 = this.rng.gaussian();
        const gI2 = this.rng.gaussian();
        const scaleNeg = sqrtPneg / Math.SQRT2;
        this.h0Conj[y][x] = { re: gR2 * scaleNeg, im: -gI2 * scaleNeg };
      }
    }
  }

  // ------------------------------------------------------------------
  // Dispersion
  // ------------------------------------------------------------------

  private dispersion(kx: number, kz: number): number {
    const k = Math.sqrt(kx * kx + kz * kz);
    if (k < 1e-10) return 0;
    const g = 9.81;
    if (this.config.depth > 30) return Math.sqrt(g * k);
    return Math.sqrt(g * k * Math.tanh(k * this.config.depth));
  }

  // ------------------------------------------------------------------
  // Height-field computation (with choppy displacement)
  // ------------------------------------------------------------------

  private computeFields(time: number): void {
    const N = this.N;
    const L = this.config.patchSize;
    const dk = (2 * Math.PI) / L;
    const lambda = this.config.choppiness;

    const hK: Complex[][] = [];
    const hKdx: Complex[][] = [];
    const hKdz: Complex[][] = [];

    for (let y = 0; y < N; y++) {
      hK[y] = [];
      hKdx[y] = [];
      hKdz[y] = [];
      for (let x = 0; x < N; x++) {
        const kx = (x - N / 2) * dk;
        const kz = (y - N / 2) * dk;
        const k = Math.sqrt(kx * kx + kz * kz);
        const omega = this.dispersion(kx, kz);
        const omegaT = omega * time;

        const expPos: Complex = { re: Math.cos(omegaT), im: Math.sin(omegaT) };
        const expNeg: Complex = { re: Math.cos(-omegaT), im: Math.sin(-omegaT) };

        const term1 = cMul(this.h0[y][x], expPos);
        const term2 = cMul(cConj(this.h0Conj[y][x]), expNeg);
        const h = cAdd(term1, term2);
        hK[y][x] = h;

        // Choppy displacement: Dx = -i · (kx/k) · h · λ
        if (k > 1e-10) {
          const negIH = { re: h.im, im: -h.re }; // -i * h
          hKdx[y][x] = cScale(negIH, lambda * kx / k);
          hKdz[y][x] = cScale(negIH, lambda * kz / k);
        } else {
          hKdx[y][x] = { re: 0, im: 0 };
          hKdz[y][x] = { re: 0, im: 0 };
        }
      }
    }

    // Inverse FFT
    ifft2D(hK, N);
    ifft2D(hKdx, N);
    ifft2D(hKdz, N);

    // Extract with fftshift
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const sy = (y + N / 2) % N;
        const sx = (x + N / 2) % N;
        const idx = y * N + x;
        this.heightField[idx] = hK[sy][sx].re;
        this.displacementX[idx] = hKdx[sy][sx].re;
        this.displacementZ[idx] = hKdz[sy][sx].re;
      }
    }

    // Compute normals from displacement gradients
    this.computeNormals();
  }

  /**
   * Compute per-pixel normals from the height field using central differences.
   * Stores (dh/dx, 1, dh/dz) as the normal vector (not yet normalized).
   */
  private computeNormals(): void {
    const N = this.N;
    const L = this.config.patchSize;
    const dx = L / N;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;
        const xm = ((x - 1 + N) % N) + y * N;
        const xp = ((x + 1) % N) + y * N;
        const ym = x + ((y - 1 + N) % N) * N;
        const yp = x + ((y + 1) % N) * N;

        const dhdx = (this.heightField[xp] - this.heightField[xm]) / (2 * dx);
        const dhdz = (this.heightField[yp] - this.heightField[ym]) / (2 * dx);

        // Store as signed normal-map-style values in [-1, 1]
        this.normalFieldX[idx] = -dhdx;
        this.normalFieldZ[idx] = -dhdz;
      }
    }
  }

  // ------------------------------------------------------------------
  // Public API — sampling
  // ------------------------------------------------------------------

  private ensureUpdated(time: number): void {
    if (this.lastTime !== time) {
      this.computeFields(time);
      this.lastTime = time;
    }
  }

  /**
   * Sample the height at world position (x, z).
   */
  getHeightAt(x: number, z: number, time: number): number {
    this.ensureUpdated(time);
    return this.sampleBilinear(this.heightField, x, z);
  }

  /**
   * Sample the horizontal displacement at (x, z).
   * Returns [dx, dz].
   */
  getDisplacementAt(x: number, z: number, time: number): [number, number] {
    this.ensureUpdated(time);
    return [
      this.sampleBilinear(this.displacementX, x, z),
      this.sampleBilinear(this.displacementZ, x, z),
    ];
  }

  /**
   * Sample the surface normal at (x, z).
   */
  getNormalAt(x: number, z: number, time: number): THREE.Vector3 {
    this.ensureUpdated(time);
    const nx = this.sampleBilinear(this.normalFieldX, x, z);
    const nz = this.sampleBilinear(this.normalFieldZ, x, z);
    return new THREE.Vector3(nx, 1.0, nz).normalize();
  }

  // ------------------------------------------------------------------
  // Public API — normal map texture (rasterize mode)
  // ------------------------------------------------------------------

  /**
   * Build a THREE.DataTexture containing the current normal map.
   * Encoded as RGB = normalise(dh/dx, 1, dh/dz) mapped from [-1,1] → [0,255].
   *
   * The caller should call this once per frame and set `texture.needsUpdate = true`.
   */
  generateNormalMapTexture(): THREE.DataTexture {
    const N = this.N;
    const data = new Uint8Array(N * N * 4);

    for (let i = 0; i < N * N; i++) {
      const nx = this.normalFieldX[i];
      const nz = this.normalFieldZ[i];
      const len = Math.sqrt(nx * nx + 1 + nz * nz);
      data[i * 4] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = Math.floor(((1.0 / len) * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      data[i * 4 + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  // ------------------------------------------------------------------
  // Public API — raw data access
  // ------------------------------------------------------------------

  getHeightFieldData(): Float32Array { return this.heightField; }
  getDisplacementData(): { x: Float32Array; z: Float32Array } {
    return { x: this.displacementX, z: this.displacementZ };
  }
  getNormalFieldData(): { x: Float32Array; z: Float32Array } {
    return { x: this.normalFieldX, z: this.normalFieldZ };
  }

  getPhillipsParams(): PhillipsSpectrumParams { return { ...this.phillipsParams }; }
  getConfig(): FFTOceanConfig { return { ...this.config }; }

  // ------------------------------------------------------------------
  // Configuration update
  // ------------------------------------------------------------------

  updateConfig(partial: Partial<FFTOceanConfig>): void {
    const needsRegen =
      partial.windSpeed !== undefined ||
      partial.windDirection !== undefined ||
      partial.fetchLength !== undefined ||
      partial.damping !== undefined ||
      partial.seed !== undefined ||
      partial.smallScaleCutoff !== undefined;

    const needsResize = partial.resolution !== undefined && partial.resolution !== this.config.resolution;

    Object.assign(this.config, partial);

    if (needsResize) {
      if (!this.isPow2(this.config.resolution)) {
        throw new Error(`FFTOceanEnhancement: resolution must be power of 2, got ${this.config.resolution}`);
      }
      this.N = this.config.resolution;
      const total = this.N * this.N;
      this.heightField = new Float32Array(total);
      this.displacementX = new Float32Array(total);
      this.displacementZ = new Float32Array(total);
      this.normalFieldX = new Float32Array(total);
      this.normalFieldZ = new Float32Array(total);
      this.initArrays();
    }

    if (needsRegen) this.generateSpectrum();
    this.lastTime = -Infinity;
  }

  forceUpdate(time: number): void {
    this.computeFields(time);
    this.lastTime = time;
  }

  dispose(): void {
    this.heightField = new Float32Array(0);
    this.displacementX = new Float32Array(0);
    this.displacementZ = new Float32Array(0);
    this.normalFieldX = new Float32Array(0);
    this.normalFieldZ = new Float32Array(0);
    this.h0.length = 0;
    this.h0Conj.length = 0;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private sampleBilinear(field: Float32Array, worldX: number, worldZ: number): number {
    const N = this.N;
    const L = this.config.patchSize;
    let fx = (worldX / L + 0.5) * N;
    let fz = (worldZ / L + 0.5) * N;
    fx = ((fx % N) + N) % N;
    fz = ((fz % N) + N) % N;

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = (x0 + 1) % N;
    const z1 = (z0 + 1) % N;
    const tx = fx - x0;
    const tz = fz - z0;

    const h00 = field[z0 * N + x0];
    const h10 = field[z0 * N + x1];
    const h01 = field[z1 * N + x0];
    const h11 = field[z1 * N + x1];

    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
}
