/**
 * FFTOceanSpectrum - FFT-based ocean wave simulation using Phillips spectrum
 *
 * This implements a statistically-based ocean wave model following the approach
 * described in Tessendorf (2001) "Simulating Ocean Water". It uses the Phillips
 * spectrum to generate initial wave amplitudes in the frequency domain, then
 * applies the deep-water dispersion relation and inverse FFT to compute the
 * spatial height field.
 *
 * Key components:
 * - Phillips spectrum for wave amplitude generation
 * - Cooley-Tukey FFT for computing the inverse transform
 * - Deep-water dispersion relation: ω² = gk
 * - Animation via phase rotation over time
 *
 * Ported from: infinigen/terrain/water/ocean_spectrum.py
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Configuration
// ============================================================================

export interface FFTOceanConfig {
  /** Wind speed in m/s (default 10) */
  windSpeed: number;
  /** Wind direction in radians (default 0 = +X direction) */
  windDirection: number;
  /** Fetch — distance over which wind acts on water (default 100) */
  fetch: number;
  /** FFT grid resolution — must be power of 2 (default 64) */
  resolution: number;
  /** Physical size of the ocean patch in meters (default 128) */
  patchSize: number;
  /** Water depth for shallow water effects (default 50 — deep water) */
  depth: number;
  /** Damping factor for waves traveling opposite to wind (default 0.001) */
  damping: number;
  /** Seed for deterministic wave generation (default 42) */
  seed: number;
}

// ============================================================================
// Complex number helpers
// ============================================================================

interface Complex {
  re: number;
  im: number;
}

function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function complexScale(a: Complex, s: number): Complex {
  return { re: a.re * s, im: a.im * s };
}

function complexConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

// ============================================================================
// Cooley-Tukey FFT (in-place, radix-2, decimation-in-time)
// ============================================================================

/**
 * Perform an in-place Cooley-Tukey FFT on an array of complex numbers.
 * The array length must be a power of 2.
 * If `inverse` is true, performs the inverse FFT (with 1/N normalization).
 */
function fft(data: Complex[], inverse: boolean = false): void {
  const N = data.length;
  if (N <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tmp = data[i];
      data[i] = data[j];
      data[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // FFT butterfly stages
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (sign * 2 * Math.PI) / len;

    // Twiddle factor for this stage
    const wN: Complex = { re: Math.cos(angle), im: Math.sin(angle) };

    for (let i = 0; i < N; i += len) {
      let w: Complex = { re: 1, im: 0 };
      for (let k = 0; k < halfLen; k++) {
        const even = data[i + k];
        const oddIdx = i + k + halfLen;
        const odd = data[oddIdx];

        const t = complexMul(w, odd);
        data[i + k] = complexAdd(even, t);
        data[oddIdx] = complexSub(even, t);

        w = complexMul(w, wN);
      }
    }
  }

  // Normalize for inverse FFT
  if (inverse) {
    for (let i = 0; i < N; i++) {
      data[i].re /= N;
      data[i].im /= N;
    }
  }
}

/**
 * 2D inverse FFT using row-column decomposition.
 * Takes a 2D array of complex numbers [y][x] and transforms in-place.
 */
function ifft2D(data: Complex[][], N: number): void {
  // Transform rows
  for (let y = 0; y < N; y++) {
    fft(data[y], true);
  }

  // Transform columns — need to extract, FFT, and put back
  const column: Complex[] = new Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      column[y] = { re: data[y][x].re, im: data[y][x].im };
    }
    fft(column, true);
    for (let y = 0; y < N; y++) {
      data[y][x].re = column[y].re;
      data[y][x].im = column[y].im;
    }
  }
}

// ============================================================================
// Phillips Spectrum
// ============================================================================

/**
 * Phillips spectrum: generates wave amplitude for a given wave vector.
 *
 * P(k) = A * exp(-1/(kL)^2) / k^4 * |k·w|^2 * damping
 *
 * Where:
 * - A is a constant proportional to wind speed^2
 * - L = V^2 / g is the largest wave length (V = wind speed)
 * - k is the wave vector magnitude
 * - w is the wind direction (normalized)
 * - damping suppresses waves traveling opposite to wind
 */
function phillipsSpectrum(
  kx: number,
  kz: number,
  windSpeed: number,
  windDirX: number,
  windDirZ: number,
  damping: number,
  fetch: number
): number {
  const kSq = kx * kx + kz * kz;
  if (kSq < 1e-10) return 0;

  const k = Math.sqrt(kSq);

  // Largest possible wave from continuous wind
  const L = (windSpeed * windSpeed) / 9.81;

  // Fetch-based length scale (limits wave size based on fetch)
  const fetchL = Math.min(L, fetch * 0.5);

  // Phillips constant — amplitude scale
  const A = 0.0001 * windSpeed * windSpeed;

  // Main Phillips spectrum term
  let phillips = A * Math.exp(-1.0 / (kSq * fetchL * fetchL)) / (kSq * kSq);

  // Directional factor: align waves with wind direction
  const kDotW = (kx * windDirX + kz * windDirZ) / k;
  phillips *= kDotW * kDotW;

  // Damping for waves traveling opposite to wind
  if (kDotW < 0) {
    phillips *= damping;
  }

  // Suppress very small wavelengths (numerical stability)
  const l = 0.001; // small scale cutoff
  phillips *= Math.exp(-kSq * l * l);

  return phillips;
}

// ============================================================================
// FFTOceanSpectrum
// ============================================================================

export class FFTOceanSpectrum {
  private config: FFTOceanConfig;
  private N: number;

  // Frequency-domain data (initialized once)
  private h0: Complex[][];       // Initial complex amplitudes at t=0
  private h0Conj: Complex[][];   // Conjugate for -k direction

  // Spatial height field (recomputed each frame)
  private heightField: Float32Array;
  private displacementX: Float32Array;  // Horizontal displacement (choppiness)
  private displacementZ: Float32Array;

  // Cached time to avoid recomputation
  private lastTime: number = -Infinity;

  constructor(config: Partial<FFTOceanConfig> = {}) {
    this.config = this.resolveConfig(config);
    this.N = this.config.resolution;

    // Validate resolution is power of 2
    if (!this.isPowerOf2(this.N)) {
      throw new Error(`FFTOceanSpectrum: resolution must be a power of 2, got ${this.N}`);
    }

    // Allocate arrays
    const totalSize = this.N * this.N;
    this.heightField = new Float32Array(totalSize);
    this.displacementX = new Float32Array(totalSize);
    this.displacementZ = new Float32Array(totalSize);

    // Initialize frequency-domain arrays
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

    // Generate initial spectrum
    this.generateSpectrum();
  }

  // ------------------------------------------------------------------
  // Config helpers
  // ------------------------------------------------------------------

  private resolveConfig(partial: Partial<FFTOceanConfig>): FFTOceanConfig {
    return {
      windSpeed: 10,
      windDirection: 0,
      fetch: 100,
      resolution: 64,
      patchSize: 128,
      depth: 50,
      damping: 0.001,
      seed: 42,
      ...partial,
    };
  }

  private isPowerOf2(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  // ------------------------------------------------------------------
  // Spectrum Generation
  // ------------------------------------------------------------------

  /**
   * Generate the initial wave spectrum using Phillips spectrum.
   * This is computed once at initialization and determines the
   * wave field's statistical properties.
   */
  private generateSpectrum(): void {
    const rng = new SeededRandom(this.config.seed);
    const N = this.N;
    const L = this.config.patchSize;

    // Wind direction vector
    const windDirX = Math.cos(this.config.windDirection);
    const windDirZ = Math.sin(this.config.windDirection);

    // Frequency step (spacing in k-space)
    const dk = (2 * Math.PI) / L;

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Map array indices to wave vector components
        // Center the spectrum: k = (n - N/2) * dk
        const nx = x - N / 2;
        const nz = y - N / 2;

        const kx = nx * dk;
        const kz = nz * dk;

        // Compute Phillips spectrum amplitude
        const P = phillipsSpectrum(
          kx, kz,
          this.config.windSpeed,
          windDirX, windDirZ,
          this.config.damping,
          this.config.fetch
        );

        // Generate complex amplitude from Gaussian random numbers
        // h0(k) = 1/sqrt(2) * (xi_r + i * xi_i) * sqrt(P(k))
        // where xi_r, xi_i are independent Gaussian random variables
        const sqrtP = Math.sqrt(Math.max(0, P));
        const gaussR = rng.gaussian();
        const gaussI = rng.gaussian();

        const scale = sqrtP / Math.SQRT2;

        this.h0[y][x] = {
          re: gaussR * scale,
          im: gaussI * scale,
        };

        // Conjugate for the -k component (needed for time evolution)
        // h0~(-k) = 1/sqrt(2) * (xi_r - i * xi_i) * sqrt(P(-k))
        // Note: P(-k) uses -kx, -kz
        const P_neg = phillipsSpectrum(
          -kx, -kz,
          this.config.windSpeed,
          windDirX, windDirZ,
          this.config.damping,
          this.config.fetch
        );
        const sqrtP_neg = Math.sqrt(Math.max(0, P_neg));
        const gaussR_neg = rng.gaussian();
        const gaussI_neg = rng.gaussian();

        const scaleNeg = sqrtP_neg / Math.SQRT2;

        this.h0Conj[y][x] = {
          re: gaussR_neg * scaleNeg,
          im: -gaussI_neg * scaleNeg,
        };
      }
    }
  }

  // ------------------------------------------------------------------
  // Dispersion Relation
  // ------------------------------------------------------------------

  /**
   * Deep water dispersion relation: ω(k) = sqrt(g * |k|)
   * For shallow water: ω(k) = sqrt(g * |k| * tanh(|k| * depth))
   */
  private dispersion(kx: number, kz: number): number {
    const k = Math.sqrt(kx * kx + kz * kz);
    if (k < 1e-10) return 0;

    const g = 9.81;

    // Deep water approximation
    if (this.config.depth > 30) {
      return Math.sqrt(g * k);
    }

    // Shallow water: ω = sqrt(g * k * tanh(k * depth))
    return Math.sqrt(g * k * Math.tanh(k * this.config.depth));
  }

  // ------------------------------------------------------------------
  // Height Field Computation
  // ------------------------------------------------------------------

  /**
   * Compute the height field at the given time using inverse FFT.
   *
   * h(x, t) = Σ_k h(k, t) * exp(i * k · x)
   *
   * where h(k, t) = h0(k) * exp(iωt) + h0~*(-k) * exp(-iωt)
   */
  private computeHeightField(time: number): void {
    const N = this.N;
    const L = this.config.patchSize;
    const dk = (2 * Math.PI) / L;

    // Build the time-dependent frequency-domain field
    const hK: Complex[][] = [];
    const hKdx: Complex[][] = [];  // For horizontal displacement (choppiness)
    const hKdz: Complex[][] = [];

    for (let y = 0; y < N; y++) {
      hK[y] = [];
      hKdx[y] = [];
      hKdz[y] = [];
      for (let x = 0; x < N; x++) {
        // Wave vector for this frequency bin
        const nx = x - N / 2;
        const nz = y - N / 2;
        const kx = nx * dk;
        const kz = nz * dk;
        const k = Math.sqrt(kx * kx + kz * kz);

        // Angular frequency from dispersion relation
        const omega = this.dispersion(kx, kz);
        const omegaT = omega * time;

        // Phase factors
        const expPos: Complex = {
          re: Math.cos(omegaT),
          im: Math.sin(omegaT),
        };
        const expNeg: Complex = {
          re: Math.cos(-omegaT),
          im: Math.sin(-omegaT),
        };

        // h(k, t) = h0(k) * exp(iωt) + conj(h0~(-k)) * exp(-iωt)
        const term1 = complexMul(this.h0[y][x], expPos);
        const term2 = complexMul(complexConj(this.h0Conj[y][x]), expNeg);
        const h = complexAdd(term1, term2);

        hK[y][x] = h;

        // Horizontal displacement for choppiness effect
        // dx(k,t) = -i * kx/k * h(k,t), dz(k,t) = -i * kz/k * h(k,t)
        if (k > 1e-10) {
          const lambda = 0.5; // Choppiness scale factor
          hKdx[y][x] = complexScale(
            { re: h.im, im: -h.re },  // multiply by -i
            lambda * kx / k
          );
          hKdz[y][x] = complexScale(
            { re: h.im, im: -h.re },  // multiply by -i
            lambda * kz / k
          );
        } else {
          hKdx[y][x] = { re: 0, im: 0 };
          hKdz[y][x] = { re: 0, im: 0 };
        }
      }
    }

    // Perform 2D inverse FFT to get spatial domain data
    ifft2D(hK, N);
    ifft2D(hKdx, N);
    ifft2D(hKdz, N);

    // Extract real parts into the height field arrays
    // Apply fftshift (swap quadrants) to center the spatial domain
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // fftshift: swap quadrants so (0,0) is in the center
        const sy = (y + N / 2) % N;
        const sx = (x + N / 2) % N;
        const idx = y * N + x;

        this.heightField[idx] = hK[sy][sx].re;
        this.displacementX[idx] = hKdx[sy][sx].re;
        this.displacementZ[idx] = hKdz[sy][sx].re;
      }
    }
  }

  // ------------------------------------------------------------------
  // Sampling
  // ------------------------------------------------------------------

  /**
   * Sample the height field at world position (x, z) at the given time.
   * Uses bilinear interpolation for smooth results.
   */
  getHeightAt(x: number, z: number, time: number): number {
    this.ensureUpdated(time);

    const N = this.N;
    const L = this.config.patchSize;

    // Map world coordinates to height field indices
    // Center the patch around (0, 0)
    let fx = (x / L + 0.5) * N;
    let fz = (z / L + 0.5) * N;

    // Wrap to tile the ocean
    fx = ((fx % N) + N) % N;
    fz = ((fz % N) + N) % N;

    // Bilinear interpolation
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = (x0 + 1) % N;
    const z1 = (z0 + 1) % N;

    const tx = fx - x0;
    const tz = fz - z0;

    const h00 = this.heightField[z0 * N + x0];
    const h10 = this.heightField[z0 * N + x1];
    const h01 = this.heightField[z1 * N + x0];
    const h11 = this.heightField[z1 * N + x1];

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;

    return h0 * (1 - tz) + h1 * tz;
  }

  /**
   * Compute the surface normal at world position (x, z) at the given time.
   * Uses finite differences of the height field.
   */
  getNormalAt(x: number, z: number, time: number): THREE.Vector3 {
    this.ensureUpdated(time);

    const eps = this.config.patchSize / this.config.resolution;

    const hC = this.getHeightAt(x, z, time);
    const hR = this.getHeightAt(x + eps, z, time);
    const hU = this.getHeightAt(x, z + eps, time);

    // Normal = normalize(cross(tangent, binormal))
    // tangent = (1, dh/dx, 0), binormal = (0, dh/dz, 1)
    const dhdx = (hR - hC) / eps;
    const dhdz = (hU - hC) / eps;

    return new THREE.Vector3(-dhdx, 1.0, -dhdz).normalize();
  }

  /**
   * Get the horizontal displacement at (x, z) for choppiness effect.
   * Returns [dx, dz] displacement.
   */
  getDisplacementAt(x: number, z: number, time: number): [number, number] {
    this.ensureUpdated(time);

    const N = this.N;
    const L = this.config.patchSize;

    let fx = (x / L + 0.5) * N;
    let fz = (z / L + 0.5) * N;

    fx = ((fx % N) + N) % N;
    fz = ((fz % N) + N) % N;

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = (x0 + 1) % N;
    const z1 = (z0 + 1) % N;

    const tx = fx - x0;
    const tz = fz - z0;

    // Bilinear interpolation for displacement X
    const dx00 = this.displacementX[z0 * N + x0];
    const dx10 = this.displacementX[z0 * N + x1];
    const dx01 = this.displacementX[z1 * N + x0];
    const dx11 = this.displacementX[z1 * N + x1];
    const dx = (dx00 * (1 - tx) + dx10 * tx) * (1 - tz) + (dx01 * (1 - tx) + dx11 * tx) * tz;

    // Bilinear interpolation for displacement Z
    const dz00 = this.displacementZ[z0 * N + x0];
    const dz10 = this.displacementZ[z0 * N + x1];
    const dz01 = this.displacementZ[z1 * N + x0];
    const dz11 = this.displacementZ[z1 * N + x1];
    const dz = (dz00 * (1 - tx) + dz10 * tx) * (1 - tz) + (dz01 * (1 - tx) + dz11 * tx) * tz;

    return [dx, dz];
  }

  /**
   * Get the raw height field data as a Float32Array.
   * Useful for uploading to GPU textures or debugging.
   */
  getHeightFieldData(): Float32Array {
    return this.heightField;
  }

  /**
   * Get the raw displacement field data.
   */
  getDisplacementData(): { x: Float32Array; z: Float32Array } {
    return { x: this.displacementX, z: this.displacementZ };
  }

  // ------------------------------------------------------------------
  // Update management
  // ------------------------------------------------------------------

  /**
   * Ensure the height field is computed for the given time.
   * Avoids redundant computation if the time hasn't changed.
   */
  private ensureUpdated(time: number): void {
    if (this.lastTime !== time) {
      this.computeHeightField(time);
      this.lastTime = time;
    }
  }

  /**
   * Force a recomputation of the height field.
   * Useful after changing config parameters.
   */
  forceUpdate(time: number): void {
    this.computeHeightField(time);
    this.lastTime = time;
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  getConfig(): FFTOceanConfig {
    return { ...this.config };
  }

  /**
   * Update configuration and regenerate spectrum if needed.
   * Changes to wind parameters or resolution require spectrum regeneration.
   */
  updateConfig(partial: Partial<FFTOceanConfig>): void {
    const needsRegen =
      partial.windSpeed !== undefined ||
      partial.windDirection !== undefined ||
      partial.fetch !== undefined ||
      partial.damping !== undefined ||
      partial.seed !== undefined ||
      partial.resolution !== undefined;

    const needsResize =
      partial.resolution !== undefined && partial.resolution !== this.config.resolution;

    Object.assign(this.config, partial);

    if (needsResize) {
      if (!this.isPowerOf2(this.config.resolution)) {
        throw new Error(`FFTOceanSpectrum: resolution must be a power of 2, got ${this.config.resolution}`);
      }
      this.N = this.config.resolution;
      const totalSize = this.N * this.N;
      this.heightField = new Float32Array(totalSize);
      this.displacementX = new Float32Array(totalSize);
      this.displacementZ = new Float32Array(totalSize);

      // Reallocate h0 and h0Conj
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

    if (needsRegen) {
      this.generateSpectrum();
    }

    // Force recompute on next query
    this.lastTime = -Infinity;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  dispose(): void {
    this.heightField = new Float32Array(0);
    this.displacementX = new Float32Array(0);
    this.displacementZ = new Float32Array(0);
    this.h0.length = 0;
    this.h0Conj.length = 0;
  }
}
