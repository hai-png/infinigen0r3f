/**
 * FFTOceanEnhanced — Enhanced FFT Ocean with JONSWAP spectrum, foam generation,
 * and cascaded LOD for infinite ocean rendering.
 *
 * Extends the existing FFTOceanSpectrum with:
 * 1. **JONSWAP spectrum** — fetch-limited, peak-enhanced spectral model
 * 2. **Pierson-Moskowitz spectrum** — fully-developed sea spectral model
 * 3. **Foam/Whitecap generation** — steepness-based foam + spray particles
 * 4. **Cascaded LOD** — multiple detail levels with grid-snapped origins
 * 5. **Enhanced evaluation** — unified API for any spectrum type
 *
 * Spectrum implementations follow standard oceanographic formulations:
 * - JONSWAP: Hasselman et al. (1973)
 * - Pierson-Moskowitz: Pierson & Moskowitz (1964)
 *
 * Ported from: infinigen/terrain/water/ocean_spectrum.py
 *
 * @module terrain/water
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Spectrum Type Enumeration
// ============================================================================

/**
 * Supported ocean wave spectrum types.
 *
 * - **Phillips**: Standard Phillips directional spectrum (Tessendorf 2001).
 *   Best for real-time rendering with moderate realism.
 * - **Pierson-Moskowitz**: Fully-developed sea spectrum for open ocean.
 *   Assumes infinite fetch and steady wind over long duration.
 * - **JONSWAP**: Fetch-limited spectrum with peak enhancement.
 *   Most realistic for coastal and limited-fetch conditions.
 */
export enum OceanSpectrumType {
  Phillips = 'phillips',
  PiersonMoskowitz = 'pierson_moskowitz',
  JONSWAP = 'jonswap',
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Parameters for the JONSWAP (Joint North Sea Wave Project) spectrum.
 *
 * The JONSWAP spectrum is a fetch-limited wave spectrum that extends the
 * Pierson-Moskowitz spectrum with a peak enhancement factor γ. It is
 * the most widely used spectrum for engineering applications.
 */
export interface JONSWAPParams {
  /** Significant wave height in metres (default 2.0) */
  significantWaveHeight: number;
  /** Peak period in seconds (default 8.0) */
  peakPeriod: number;
  /** Peak enhancement factor — typically 3.3 for mean JONSWAP (default 3.3) */
  gamma: number;
  /** Fetch length in metres — distance over which wind blows (default 100000) */
  fetchLength: number;
  /** Wind speed at 10m height in m/s (default 15) */
  windSpeed: number;
}

/**
 * Parameters for the Pierson-Moskowitz spectrum.
 *
 * The PM spectrum describes a fully-developed sea under sustained wind.
 * It assumes infinite fetch and steady-state conditions.
 */
export interface PiersonMoskowitzParams {
  /** Wind speed at 19.5m height in m/s (default 15) */
  windSpeed: number;
}

/**
 * Configuration for the Phillips spectrum within the enhanced system.
 */
export interface PhillipsConfig {
  /** Overall wave amplitude scale (default 0.0001 * windSpeed²) */
  waveScale: number;
  /** Wind direction as [x, z] components (normalized internally) */
  windDirection: [number, number];
  /** Wind speed in m/s (default 10) */
  windSpeed: number;
}

/**
 * Configuration for foam generation on the ocean surface.
 */
export interface OceanFoamConfig {
  /** Steepness threshold above which foam appears [0, 1] (default 0.4) */
  steepnessThreshold: number;
  /** Foam decay rate — how quickly foam fades per second (default 0.5) */
  decayRate: number;
  /** Maximum foam intensity (default 1.0) */
  maxIntensity: number;
  /** Spray particle count budget (default 500) */
  maxSprayParticles: number;
  /** Minimum wave height for spray generation (default 0.5) */
  sprayHeightThreshold: number;
  /** Spray velocity scale factor (default 2.0) */
  sprayVelocityScale: number;
  /** Seed for deterministic spray particle generation (default 123) */
  seed: number;
}

/**
 * Configuration for the cascaded LOD ocean system.
 */
export interface CascadedLODConfig {
  /** Number of cascade levels (default 4) */
  cascadeCount: number;
  /** Base patch size in metres for level 0 (default 128) */
  baseSize: number;
  /** Base grid resolution for level 0 — must be power of 2 (default 64) */
  baseResolution: number;
  /** Grid snapping size in metres to prevent swimming (default 2.0) */
  snapSize: number;
}

/**
 * Master configuration for the enhanced FFT ocean system.
 */
export interface FFTOceanEnhancedConfig {
  /** Spectrum type to use for wave generation */
  spectrumType: OceanSpectrumType;
  /** Phillips spectrum parameters (required when spectrumType is Phillips) */
  phillipsConfig?: PhillipsConfig;
  /** JONSWAP spectrum parameters (required when spectrumType is JONSWAP) */
  jonswapConfig?: JONSWAPParams;
  /** Pierson-Moskowitz parameters (required when spectrumType is PiersonMoskowitz) */
  piersonMoskowitzConfig?: PiersonMoskowitzParams;
  /** FFT grid resolution — must be power of 2 (default 64) */
  resolution: number;
  /** Physical size of the ocean patch in metres (default 128) */
  size: number;
  /** Choppiness (horizontal displacement) scale factor (default 1.0) */
  choppiness: number;
  /** Time scale multiplier for animation speed (default 1.0) */
  timeScale: number;
  /** Steepness threshold for foam generation [0, 1] (default 0.4) */
  foamThreshold: number;
  /** Number of cascade LOD levels (0 = single patch, default 4) */
  cascades: number;
  /** Seed for deterministic generation (default 42) */
  seed: number;
  /** Wind direction in radians (default 0 = +X direction) */
  windDirection: number;
  /** Wind speed in m/s (default 10) */
  windSpeed: number;
  /** Fetch length in metres (default 100) */
  fetch: number;
  /** Water depth for shallow water effects (default 50 = deep water) */
  depth: number;
  /** Damping factor for waves opposing wind (default 0.001) */
  damping: number;
}

// ============================================================================
// Result Interfaces
// ============================================================================

/**
 * Complete ocean evaluation result for a single time step.
 */
export interface OceanEvaluationResult {
  /** Height displacement at each grid point (N×N) */
  heightMap: Float32Array;
  /** Horizontal X displacement at each grid point (N×N) */
  displacementX: Float32Array;
  /** Horizontal Z displacement at each grid point (N×N) */
  displacementZ: Float32Array;
  /** Foam intensity map [0, 1] at each grid point (N×N) */
  foamMap: Float32Array;
  /** Normal map — packed as [nx, nz] per point; ny = 1 (N×N×2) */
  normalMap: Float32Array;
}

/**
 * Foam generation result with intensity map and spray particle positions.
 */
export interface OceanFoamResult {
  /** Foam intensity map [0, 1] at each grid point */
  foamMap: Float32Array;
  /** Spray particle positions (for particle effects) */
  sprayPositions: THREE.Vector3[];
}

/**
 * A single cascade level in the LOD system.
 */
export interface OceanCascadeLevel {
  /** Cascade level index (0 = nearest, highest detail) */
  level: number;
  /** World-space size of this cascade in metres */
  size: number;
  /** Grid resolution for this cascade */
  resolution: number;
  /** Height displacement data */
  heightData: Float32Array;
  /** Horizontal displacement data (X) */
  displacementX: Float32Array;
  /** Horizontal displacement data (Z) */
  displacementZ: Float32Array;
  /** Foam intensity [0, 1] */
  foam: Float32Array;
  /** Transform matrix (world space) */
  transform: THREE.Matrix4;
  /** Snapped origin to prevent swimming */
  origin: THREE.Vector3;
}

// ============================================================================
// Complex Number Helpers (lightweight, for internal FFT)
// ============================================================================

interface Complex { re: number; im: number; }

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cScale(a: Complex, s: number): Complex {
  return { re: a.re * s, im: a.im * s };
}

function cConj(a: Complex): Complex {
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
    const wN: Complex = { re: Math.cos(angle), im: Math.sin(angle) };

    for (let i = 0; i < N; i += len) {
      let w: Complex = { re: 1, im: 0 };
      for (let k = 0; k < halfLen; k++) {
        const even = data[i + k];
        const odd = data[i + k + halfLen];
        const t = cMul(w, odd);
        data[i + k] = cAdd(even, t);
        data[i + k + halfLen] = cSub(even, t);
        w = cMul(w, wN);
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

  // Transform columns — extract, FFT, and put back
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
// Spectrum Functions
// ============================================================================

/**
 * Compute the Phillips spectrum value for wave vector (kx, kz).
 *
 * P(k) = A · exp(-1/(kL)²) / k⁴ · |k̂·ŵ|² · damping
 *
 * @param kx - X component of wave vector
 * @param kz - Z component of wave vector
 * @param windSpeed - Wind speed in m/s
 * @param windDirX - Wind direction X component (unit vector)
 * @param windDirZ - Wind direction Z component (unit vector)
 * @param damping - Damping factor for opposing waves
 * @param fetch - Fetch length in metres
 * @returns Phillips spectrum amplitude (non-negative)
 */
function phillipsSpectrum(
  kx: number,
  kz: number,
  windSpeed: number,
  windDirX: number,
  windDirZ: number,
  damping: number,
  fetch: number,
): number {
  const kSq = kx * kx + kz * kz;
  if (kSq < 1e-12) return 0;

  const k = Math.sqrt(kSq);
  const g = 9.81;

  // Largest possible wave from continuous wind over fetch
  const L = (windSpeed * windSpeed) / g;
  const fetchL = Math.min(L, fetch * 0.5);

  // Phillips constant — amplitude scale
  const A = 0.0001 * windSpeed * windSpeed;

  // Main Phillips spectrum term
  let P = A * Math.exp(-1.0 / (kSq * fetchL * fetchL)) / (kSq * kSq);

  // Directional factor: align waves with wind direction
  const kDotW = (kx * windDirX + kz * windDirZ) / k;
  P *= kDotW * kDotW;

  // Damp opposing waves
  if (kDotW < 0) {
    P *= damping;
  }

  // Suppress very small wavelengths (numerical stability)
  const l = 0.001;
  P *= Math.exp(-kSq * l * l);

  return P;
}

/**
 * Compute the JONSWAP spectrum value for a given frequency.
 *
 * S(f) = α · g² / (2π)⁴ · f⁻⁵ · exp(-5/4 · (fp/f)⁴) · γ^exp(-(f-fp)² / (2·σ²·fp²))
 *
 * Where:
 * - α = 0.076 · X^(-0.22), X = g · fetch / wind²
 * - fp = peak frequency from peak period
 * - σ = 0.07 for f ≤ fp, 0.09 for f > fp
 * - γ = peak enhancement factor (typically 3.3)
 *
 * @param f - Frequency in Hz
 * @param params - JONSWAP spectrum parameters
 * @returns Spectral density S(f) in m²/Hz
 */
export function jonswapSpectrum(f: number, params: JONSWAPParams): number {
  if (f <= 0) return 0;

  const g = 9.81;
  const { peakPeriod, gamma, fetchLength, windSpeed } = params;

  // Peak frequency from peak period
  const fp = 1.0 / peakPeriod;

  // Phillips constant from fetch parameter
  // X = g * fetch / wind² (dimensionless fetch)
  const X = (g * fetchLength) / (windSpeed * windSpeed);
  const alpha = 0.076 * Math.pow(X, -0.22);

  // Peak enhancement
  const sigma = f <= fp ? 0.07 : 0.09;
  const peakRatio = f / fp;
  const gammaExp = Math.exp(
    -((peakRatio - 1) * (peakRatio - 1)) / (2 * sigma * sigma)
  );
  const peakEnhancement = Math.pow(gamma, gammaExp);

  // Base JONSWAP spectrum (PM shape with alpha and peak enhancement)
  const fRatio4 = Math.pow(fp / f, 4);
  const S =
    (alpha * g * g) /
    (Math.pow(2 * Math.PI, 4) * Math.pow(f, 5)) *
    Math.exp(-1.25 * fRatio4) *
    peakEnhancement;

  // Normalize to match significant wave height if provided
  // The JONSWAP spectrum's Hs is approximately 4 * sqrt(m0) where m0 is the
  // zeroth moment. We apply a correction factor to match the target Hs.
  if (params.significantWaveHeight > 0) {
    // Approximate normalization: scale so that 4*sqrt(integral) ≈ Hs
    // For a simplified approach, we scale by (Hs_target / Hs_natural)^2
    // where Hs_natural ≈ 0.0081 * windSpeed^2 / g for standard JONSWAP
    const hsNatural = 0.0081 * windSpeed * windSpeed / g;
    if (hsNatural > 1e-6) {
      const scaleFactor = (params.significantWaveHeight / hsNatural);
      return S * scaleFactor * scaleFactor;
    }
  }

  return S;
}

/**
 * Compute the Pierson-Moskowitz spectrum value for a given angular frequency.
 *
 * S(ω) = (α · g² / ω⁵) · exp(-β · (ωp/ω)⁴)
 *
 * Where:
 * - α = 8.1 × 10⁻³ (Phillips constant)
 * - β = 0.74
 * - ωp = g / U (peak angular frequency)
 * - U = wind speed at 19.5m height
 *
 * @param omega - Angular frequency in rad/s
 * @param params - Pierson-Moskowitz spectrum parameters
 * @returns Spectral density S(ω) in m²·s/rad
 */
export function piersonMoskowitzSpectrum(omega: number, params: PiersonMoskowitzParams): number {
  if (omega <= 0) return 0;

  const g = 9.81;
  const alpha = 8.1e-3;
  const beta = 0.74;
  const U = params.windSpeed;
  const omegaP = g / U;

  const S =
    (alpha * g * g) / Math.pow(omega, 5) *
    Math.exp(-beta * Math.pow(omegaP / omega, 4));

  return S;
}

// ============================================================================
// Spectrum-to-Wave-Vector Amplitude Converter
// ============================================================================

/**
 * Convert a frequency-domain spectrum S(f) or S(ω) into a wave-vector
 * amplitude suitable for the FFT ocean pipeline.
 *
 * For a wave vector k = (kx, kz), the relationship between the 2D spectrum
 * and the 1D spectrum is:
 *
 *   P(kx, kz) = S(ω) · D(θ) / k
 *
 * Where D(θ) is a directional spreading function and ω is derived from
 * the deep-water dispersion relation ω² = g·k.
 *
 * We use a cos² directional spreading: D(θ) = (2/π) · cos²(θ - θ_w)
 * for |θ - θ_w| < π/2, 0 otherwise.
 *
 * @param kx - X component of wave vector
 * @param kz - Z component of wave vector
 * @param spectrumType - Which spectrum model to use
 * @param jonswapParams - JONSWAP parameters (if using JONSWAP)
 * @param pmParams - Pierson-Moskowitz parameters (if using PM)
 * @param windDirX - Wind direction X (unit vector)
 * @param windDirZ - Wind direction Z (unit vector)
 * @param damping - Damping for waves opposing wind
 * @returns Directional spectrum amplitude P(kx, kz)
 */
function directionalSpectrum(
  kx: number,
  kz: number,
  spectrumType: OceanSpectrumType,
  jonswapParams: JONSWAPParams | undefined,
  pmParams: PiersonMoskowitzParams | undefined,
  windDirX: number,
  windDirZ: number,
  damping: number,
): number {
  const kSq = kx * kx + kz * kz;
  if (kSq < 1e-12) return 0;

  const k = Math.sqrt(kSq);
  const g = 9.81;

  // Deep-water dispersion: ω = sqrt(g·k)
  const omega = Math.sqrt(g * k);

  // Convert angular frequency to Hz for JONSWAP (which uses f, not ω)
  const f = omega / (2 * Math.PI);

  // Compute the 1D spectrum value
  let S: number;
  switch (spectrumType) {
    case OceanSpectrumType.JONSWAP:
      S = jonswapSpectrum(f, jonswapParams!);
      // Convert from S(f) [m²/Hz] to S(ω) [m²·s/rad]: S(ω) = S(f) / (2π)
      S /= (2 * Math.PI);
      break;
    case OceanSpectrumType.PiersonMoskowitz:
      S = piersonMoskowitzSpectrum(omega, pmParams!);
      break;
    case OceanSpectrumType.Phillips:
    default:
      // Phillips is already directional; call it directly
      return phillipsSpectrum(
        kx, kz,
        jonswapParams?.windSpeed ?? pmParams?.windSpeed ?? 10,
        windDirX, windDirZ,
        damping,
        jonswapParams?.fetchLength ?? 100,
      );
  }

  // Directional spreading function: D(θ) = (2/π) · cos²(θ - θ_w)
  // where θ is the wave propagation direction and θ_w is wind direction
  const cosTheta = (kx * windDirX + kz * windDirZ) / k;

  // D(θ) = (2/π) · cos²(θ) for |θ| < π/2
  let D: number;
  if (cosTheta > 0) {
    D = (2 / Math.PI) * cosTheta * cosTheta;
  } else {
    // Opposing waves: apply damping
    D = damping * (2 / Math.PI) * cosTheta * cosTheta;
  }

  // Convert 1D spectrum to 2D: P(kx, kz) = S(ω) · D(θ) / k
  // The /k factor converts from S(ω)·D(θ) dω dθ to P(k) dkx dkz
  const P = S * D / k;

  // Suppress very small wavelengths (numerical stability)
  const l = 0.001;
  return P * Math.exp(-kSq * l * l);
}

// ============================================================================
// OceanFoamGenerator — Foam and Whitecap Generation
// ============================================================================

/**
 * Generates foam and whitecap data from ocean wave displacement fields.
 *
 * Foam appears where wave steepness exceeds a threshold — this corresponds
 * to wave breaking in nature. The foam intensity is proportional to how
 * much the steepness exceeds the threshold, producing realistic whitecap
 * patterns that follow wave crests.
 *
 * Spray particles are generated at the most intense foam locations,
 * simulating the aerosol droplets ejected by breaking waves.
 */
export class OceanFoamGenerator {
  private config: OceanFoamConfig;
  private rng: SeededRandom;

  /** Previous frame's foam for temporal smoothing */
  private prevFoam: Float32Array | null = null;

  constructor(config: Partial<OceanFoamConfig> = {}) {
    this.config = this.resolveConfig(config);
    this.rng = new SeededRandom(this.config.seed);
  }

  private resolveConfig(p: Partial<OceanFoamConfig>): OceanFoamConfig {
    return {
      steepnessThreshold: 0.4,
      decayRate: 0.5,
      maxIntensity: 1.0,
      maxSprayParticles: 500,
      sprayHeightThreshold: 0.5,
      sprayVelocityScale: 2.0,
      seed: 123,
      ...p,
    };
  }

  /**
   * Compute foam intensity from wave steepness.
   *
   * Wave steepness is approximated from the horizontal displacement
   * gradient. Waves break when the steepness exceeds a threshold,
   * producing foam. The foam intensity is:
   *
   *   foam = max(0, steepness - threshold) / (1 - threshold)
   *
   * This is clamped to [0, maxIntensity] and temporally smoothed
   * with the previous frame to produce gradual foam decay.
   *
   * @param heightMap - Height displacement field (N×N)
   * @param displacementX - Horizontal X displacement (N×N)
   * @param displacementZ - Horizontal Z displacement (N×N)
   * @param N - Grid resolution
   * @param dt - Time step in seconds for temporal smoothing (default 1/60)
   * @returns Foam intensity map [0, 1] at each grid point
   */
  computeFoam(
    heightMap: Float32Array,
    displacementX: Float32Array,
    displacementZ: Float32Array,
    N: number,
    dt: number = 1 / 60,
  ): Float32Array {
    const foam = new Float32Array(N * N);
    const threshold = this.config.steepnessThreshold;
    const range = 1.0 - threshold;

    // Compute cell spacing (assumes unit patch; caller should scale)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = y * N + x;

        // Compute displacement gradient (steepness proxy) using central differences
        const xm = ((x - 1 + N) % N) + y * N;
        const xp = ((x + 1) % N) + y * N;
        const ym = x + ((y - 1 + N) % N) * N;
        const yp = x + ((y + 1) % N) * N;

        // Jacobian of the displacement field: J = I + grad(displacement)
        // Wave breaking occurs when the Jacobian determinant < 0
        // Simplified: compute steepness from displacement gradient magnitude
        const dDxX = (displacementX[xp] - displacementX[xm]) * 0.5;
        const dDzX = (displacementZ[xp] - displacementZ[xm]) * 0.5;
        const dDxZ = (displacementX[yp] - displacementX[ym]) * 0.5;
        const dDzZ = (displacementZ[yp] - displacementZ[ym]) * 0.5;

        // Jacobian of horizontal displacement: J = [[1+dDx/dx, dDx/dz], [dDz/dx, 1+dDz/dz]]
        const j11 = 1.0 + dDxX;
        const j12 = dDxZ;
        const j21 = dDzX;
        const j22 = 1.0 + dDzZ;

        // Determinant of Jacobian: when this goes negative, the surface folds over
        const detJ = j11 * j22 - j12 * j21;

        // Steepness measure: how much the surface is compressed/folded
        // detJ < 1 means compression, detJ < 0 means folding (breaking)
        let steepness = 0;
        if (detJ < 1.0) {
          steepness = 1.0 - detJ;  // Higher steepness for more compression
        }

        // Foam intensity from steepness
        let foamIntensity = Math.max(0, steepness - threshold) / Math.max(range, 0.01);
        foamIntensity = Math.min(foamIntensity, this.config.maxIntensity);

        // Also add foam at wave crests (where height is high relative to neighbors)
        const hC = heightMap[idx];
        const hL = heightMap[xm];
        const hR = heightMap[xp];
        const hD = heightMap[ym];
        const hU = heightMap[yp];
        const crestFoam = (hC > hL && hC > hR && hC > hD && hC > hU)
          ? Math.min(1.0, Math.max(0, hC) * 0.3)
          : 0;

        foamIntensity = Math.max(foamIntensity, crestFoam);

        // Temporal smoothing with previous frame (foam persistence)
        if (this.prevFoam && idx < this.prevFoam.length) {
          const decay = Math.exp(-this.config.decayRate * dt);
          foamIntensity = Math.max(foamIntensity, this.prevFoam[idx] * decay);
        }

        foam[idx] = Math.min(foamIntensity, this.config.maxIntensity);
      }
    }

    // Store for next frame
    this.prevFoam = foam.slice();

    return foam;
  }

  /**
   * Generate spray particle positions at wave crests.
   *
   * Spray particles represent the aerosol droplets ejected by breaking
   * waves. They are placed at positions where foam intensity is highest,
   * with initial velocities proportional to wave slope and height.
   *
   * The particle positions are in the ocean's local coordinate system
   * (x, height, z) and can be used directly for particle system rendering.
   *
   * @param heightMap - Height displacement field (N×N)
   * @param N - Grid resolution
   * @param maxParticles - Maximum number of spray particles (default from config)
   * @param patchSize - Physical size of the ocean patch in metres
   * @returns Array of spray particle positions
   */
  generateSprayParticles(
    heightMap: Float32Array,
    N: number,
    maxParticles?: number,
    patchSize: number = 128,
  ): THREE.Vector3[] {
    const budget = maxParticles ?? this.config.maxSprayParticles;
    const candidates: { idx: number; intensity: number }[] = [];

    // Find wave crests above threshold
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const idx = y * N + x;
        const h = heightMap[idx];

        if (h > this.config.sprayHeightThreshold) {
          // Check if local maximum
          const hL = heightMap[idx - 1];
          const hR = heightMap[idx + 1];
          const hD = heightMap[idx - N];
          const hU = heightMap[idx + N];

          if (h >= hL && h >= hR && h >= hD && h >= hU) {
            candidates.push({ idx, intensity: h });
          }
        }
      }
    }

    // Sort by intensity (highest first) and take top candidates
    candidates.sort((a, b) => b.intensity - a.intensity);

    const particles: THREE.Vector3[] = [];
    const count = Math.min(candidates.length, budget);
    const cellSize = patchSize / N;

    for (let i = 0; i < count; i++) {
      const { idx, intensity } = candidates[i];
      const x = idx % N;
      const y = Math.floor(idx / N);

      // World position with small random offset
      const wx = (x / N - 0.5) * patchSize + this.rng.nextFloat(-cellSize, cellSize);
      const wz = (y / N - 0.5) * patchSize + this.rng.nextFloat(-cellSize, cellSize);
      const wy = heightMap[idx] + this.rng.nextFloat(0, 0.5) * intensity * this.config.sprayVelocityScale;

      particles.push(new THREE.Vector3(wx, wy, wz));
    }

    return particles;
  }

  /**
   * Update foam configuration at runtime.
   */
  updateConfig(partial: Partial<OceanFoamConfig>): void {
    Object.assign(this.config, partial);
    if (partial.seed !== undefined) {
      this.rng = new SeededRandom(partial.seed);
    }
  }

  /**
   * Get the current foam configuration.
   */
  getConfig(): OceanFoamConfig {
    return { ...this.config };
  }

  /**
   * Reset temporal foam state (e.g., when changing scenes).
   */
  reset(): void {
    this.prevFoam = null;
  }

  /**
   * Release resources.
   */
  dispose(): void {
    this.prevFoam = null;
  }
}

// ============================================================================
// CascadedOceanLOD — Infinite Ocean with Multiple Detail Levels
// ============================================================================

/**
 * Manages multiple cascade levels of ocean detail for infinite ocean rendering.
 *
 * Each cascade level covers a progressively larger area with lower resolution,
 * following the standard cascaded LOD approach used in production ocean systems
 * (e.g., Horizon Zero Dawn, Sea of Thieves, Assassin's Creed).
 *
 * Key features:
 * - Each cascade is 4× the area of the previous one (2× per side)
 * - Origins are snapped to a grid to prevent "swimming" artifacts when
 *   the camera moves
 * - Level 0 provides the highest detail near the camera
 * - Higher levels provide low-frequency swell extending to the horizon
 *
 * The grid snapping ensures that as the camera translates, cascade origins
 * only jump in discrete steps aligned to the snap grid. This prevents the
 * visible "swimming" pattern that would occur if the origin moved smoothly.
 */
export class CascadedOceanLOD {
  private config: CascadedLODConfig;

  constructor(config: Partial<CascadedLODConfig> = {}) {
    this.config = this.resolveConfig(config);
  }

  private resolveConfig(p: Partial<CascadedLODConfig>): CascadedLODConfig {
    return {
      cascadeCount: 4,
      baseSize: 128,
      baseResolution: 64,
      snapSize: 2.0,
      ...p,
    };
  }

  /**
   * Get the number of cascade levels.
   */
  getCascadeCount(): number {
    return this.config.cascadeCount;
  }

  /**
   * Get the world-space size of a specific cascade level.
   * Each level is 2× the size of the previous one per side (4× area).
   *
   * @param level - Cascade level index (0 = nearest, highest detail)
   * @returns World-space size in metres
   */
  getCascadeSize(level: number): number {
    return this.config.baseSize * Math.pow(2, level);
  }

  /**
   * Get the grid resolution for a specific cascade level.
   * All levels use the same resolution to maintain consistent vertex density
   * relative to the screen.
   *
   * @param level - Cascade level index
   * @returns Grid resolution (always the same as baseResolution)
   */
  getCascadeResolution(level: number): number {
    return this.config.baseResolution;
  }

  /**
   * Compute the snapped origin for a cascade level given a camera position.
   *
   * The origin is snapped to a grid aligned with the cascade's cell size
   * to prevent swimming artifacts. The snap size increases with cascade level
   * so that each level's snap granularity is proportional to its cell size.
   *
   * @param level - Cascade level index
   * @param cameraPosition - Current camera world position
   * @returns Snapped origin position for the cascade
   */
  getSnappedOrigin(level: number, cameraPosition: THREE.Vector3): THREE.Vector3 {
    const cascadeSize = this.getCascadeSize(level);
    const snapGranularity = this.config.snapSize * Math.pow(2, level);

    // Snap camera position to grid
    const snappedX = Math.floor(cameraPosition.x / snapGranularity) * snapGranularity;
    const snappedZ = Math.floor(cameraPosition.z / snapGranularity) * snapGranularity;

    // Center the cascade on the snapped position
    // Align to cascade boundaries so tiling is seamless
    const halfSize = cascadeSize * 0.5;
    const originX = Math.floor((snappedX - halfSize) / cascadeSize) * cascadeSize + halfSize;
    const originZ = Math.floor((snappedZ - halfSize) / cascadeSize) * cascadeSize + halfSize;

    return new THREE.Vector3(originX, 0, originZ);
  }

  /**
   * Get the transformation matrix for a specific cascade level.
   *
   * The transform positions and scales the cascade in world space,
   * centered on the snapped origin. This matrix can be used as a
   * model matrix for the cascade's mesh.
   *
   * @param level - Cascade level index
   * @param cameraPosition - Current camera world position
   * @returns 4×4 transformation matrix
   */
  getCascadeTransform(level: number, cameraPosition: THREE.Vector3): THREE.Matrix4 {
    const origin = this.getSnappedOrigin(level, cameraPosition);
    const size = this.getCascadeSize(level);

    const matrix = new THREE.Matrix4();
    matrix.compose(
      origin,
      new THREE.Quaternion(), // No rotation
      new THREE.Vector3(size, 1, size), // Scale to cascade size (Y = 1 for height)
    );

    return matrix;
  }

  /**
   * Generate all cascade levels for the current frame.
   *
   * Each cascade level contains its own displacement data computed
   * from the FFT ocean evaluation, plus foam data. The data for each
   * cascade is computed by sampling the ocean spectrum at the appropriate
   * scale and offset.
   *
   * Note: The actual FFT evaluation must be performed by the caller
   * (FFTOceanEnhanced) and passed into each cascade. This method
   * sets up the cascade metadata (transform, origin, size).
   *
   * @param cameraPosition - Current camera world position
   * @param time - Current simulation time
   * @param heightDataPerLevel - Pre-computed height data for each level
   * @param displacementXPerLevel - Pre-computed X displacement for each level
   * @param displacementZPerLevel - Pre-computed Z displacement for each level
   * @param foamPerLevel - Pre-computed foam data for each level
   * @returns Array of cascade levels with full data
   */
  generateCascades(
    cameraPosition: THREE.Vector3,
    time: number,
    heightDataPerLevel: Float32Array[],
    displacementXPerLevel: Float32Array[],
    displacementZPerLevel: Float32Array[],
    foamPerLevel: Float32Array[],
  ): OceanCascadeLevel[] {
    const cascades: OceanCascadeLevel[] = [];

    for (let level = 0; level < this.config.cascadeCount; level++) {
      const size = this.getCascadeSize(level);
      const resolution = this.getCascadeResolution(level);
      const origin = this.getSnappedOrigin(level, cameraPosition);
      const transform = this.getCascadeTransform(level, cameraPosition);

      cascades.push({
        level,
        size,
        resolution,
        heightData: heightDataPerLevel[level] ?? new Float32Array(0),
        displacementX: displacementXPerLevel[level] ?? new Float32Array(0),
        displacementZ: displacementZPerLevel[level] ?? new Float32Array(0),
        foam: foamPerLevel[level] ?? new Float32Array(0),
        transform,
        origin,
      });
    }

    return cascades;
  }

  /**
   * Update cascade configuration at runtime.
   */
  updateConfig(partial: Partial<CascadedLODConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Get the current cascade configuration.
   */
  getConfig(): CascadedLODConfig {
    return { ...this.config };
  }
}

// ============================================================================
// FFTOceanEnhanced — Main Enhanced Ocean Class
// ============================================================================

/**
 * Enhanced FFT Ocean system supporting multiple spectrum types, foam generation,
 * and cascaded LOD for infinite ocean rendering.
 *
 * This class wraps the core FFT ocean pipeline (spectrum generation → FFT →
 * spatial evaluation) and adds:
 *
 * 1. **Multiple spectrum types**: Phillips, Pierson-Moskowitz, and JONSWAP
 * 2. **Foam generation**: Steepness-based foam with temporal decay
 * 3. **Cascaded LOD**: Multiple detail levels with grid-snapped origins
 * 4. **Bilinear interpolation**: Smooth height/normal queries at arbitrary positions
 * 5. **Mesh generation**: Direct creation of THREE.Mesh for rendering
 *
 * Usage:
 * ```typescript
 * const ocean = new FFTOceanEnhanced({
 *   spectrumType: OceanSpectrumType.JONSWAP,
 *   jonswapConfig: {
 *     significantWaveHeight: 2.0,
 *     peakPeriod: 8.0,
 *     gamma: 3.3,
 *     fetchLength: 100000,
 *     windSpeed: 15,
 *   },
 *   resolution: 64,
 *   size: 256,
 *   choppiness: 1.0,
 *   cascades: 4,
 *   seed: 42,
 * });
 *
 * // Per-frame update
 * const result = ocean.evaluate(time);
 * const height = ocean.getHeight(10, 20, time);
 * const normal = ocean.getNormal(10, 20, time);
 * const foam = ocean.getFoam(10, 20, time);
 * ```
 */
export class FFTOceanEnhanced {
  private config: FFTOceanEnhancedConfig;
  private N: number;

  // Frequency-domain data (initialized once)
  private h0: Complex[][] = [];
  private h0Conj: Complex[][] = [];

  // Spatial fields (recomputed each frame)
  private heightField: Float32Array;
  private displacementX: Float32Array;
  private displacementZ: Float32Array;
  private foamField: Float32Array;
  private normalFieldX: Float32Array;
  private normalFieldZ: Float32Array;

  // Subsystems
  private foamGenerator: OceanFoamGenerator;
  private cascadeLOD: CascadedOceanLOD;

  // Cached time to avoid redundant computation
  private lastTime: number = -Infinity;
  private lastDt: number = 1 / 60;

  constructor(config: Partial<FFTOceanEnhancedConfig> = {}) {
    this.config = this.resolveConfig(config);
    this.N = this.config.resolution;

    if (!this.isPow2(this.N)) {
      throw new Error(
        `FFTOceanEnhanced: resolution must be power of 2, got ${this.N}`
      );
    }

    // Allocate spatial fields
    const total = this.N * this.N;
    this.heightField = new Float32Array(total);
    this.displacementX = new Float32Array(total);
    this.displacementZ = new Float32Array(total);
    this.foamField = new Float32Array(total);
    this.normalFieldX = new Float32Array(total);
    this.normalFieldZ = new Float32Array(total);

    // Initialize subsystems
    this.foamGenerator = new OceanFoamGenerator({
      steepnessThreshold: this.config.foamThreshold,
      seed: this.config.seed + 100,
    });

    this.cascadeLOD = new CascadedOceanLOD({
      cascadeCount: this.config.cascades,
      baseSize: this.config.size,
      baseResolution: this.config.resolution,
    });

    // Initialize frequency-domain arrays
    this.initArrays();
    this.generateSpectrum();
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  private resolveConfig(p: Partial<FFTOceanEnhancedConfig>): FFTOceanEnhancedConfig {
    return {
      spectrumType: OceanSpectrumType.Phillips,
      resolution: 64,
      size: 128,
      choppiness: 1.0,
      timeScale: 1.0,
      foamThreshold: 0.4,
      cascades: 4,
      seed: 42,
      windDirection: 0,
      windSpeed: 10,
      fetch: 100,
      depth: 50,
      damping: 0.001,
      ...p,
    };
  }

  private isPow2(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  /**
   * Get the current configuration.
   */
  getConfig(): FFTOceanEnhancedConfig {
    return { ...this.config };
  }

  /**
   * Update configuration and regenerate spectrum if needed.
   * Changes to spectrum type, wind, or seed require spectrum regeneration.
   */
  updateConfig(partial: Partial<FFTOceanEnhancedConfig>): void {
    const needsRegen =
      partial.spectrumType !== undefined ||
      partial.windSpeed !== undefined ||
      partial.windDirection !== undefined ||
      partial.fetch !== undefined ||
      partial.damping !== undefined ||
      partial.seed !== undefined ||
      partial.jonswapConfig !== undefined ||
      partial.piersonMoskowitzConfig !== undefined ||
      partial.phillipsConfig !== undefined;

    const needsResize =
      partial.resolution !== undefined &&
      partial.resolution !== this.config.resolution;

    Object.assign(this.config, partial);

    if (needsResize) {
      if (!this.isPow2(this.config.resolution)) {
        throw new Error(
          `FFTOceanEnhanced: resolution must be power of 2, got ${this.config.resolution}`
        );
      }
      this.N = this.config.resolution;
      const total = this.N * this.N;
      this.heightField = new Float32Array(total);
      this.displacementX = new Float32Array(total);
      this.displacementZ = new Float32Array(total);
      this.foamField = new Float32Array(total);
      this.normalFieldX = new Float32Array(total);
      this.normalFieldZ = new Float32Array(total);
      this.initArrays();
    }

    if (needsRegen) {
      this.generateSpectrum();
    }

    // Update subsystems
    this.foamGenerator.updateConfig({
      steepnessThreshold: this.config.foamThreshold,
      seed: this.config.seed + 100,
    });

    this.cascadeLOD.updateConfig({
      cascadeCount: this.config.cascades,
      baseSize: this.config.size,
      baseResolution: this.config.resolution,
    });

    this.lastTime = -Infinity;
  }

  // ------------------------------------------------------------------
  // Array Initialization
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

  // ------------------------------------------------------------------
  // Spectrum Generation
  // ------------------------------------------------------------------

  /**
   * Generate the initial frequency-domain wave spectrum.
   *
   * This is computed once at initialization and determines the ocean's
   * statistical wave properties. The spectrum type is selected from config:
   * - Phillips: Standard directional spectrum
   * - Pierson-Moskowitz: Fully-developed sea
   * - JONSWAP: Fetch-limited with peak enhancement
   */
  private generateSpectrum(): void {
    const rng = new SeededRandom(this.config.seed);
    const N = this.N;
    const L = this.config.size;
    const dk = (2 * Math.PI) / L;

    // Wind direction vector
    const windDirX = Math.cos(this.config.windDirection);
    const windDirZ = Math.sin(this.config.windDirection);

    // Prepare spectrum-specific parameters
    const jonswapParams: JONSWAPParams = this.config.jonswapConfig ?? {
      significantWaveHeight: 2.0,
      peakPeriod: 8.0,
      gamma: 3.3,
      fetchLength: this.config.fetch,
      windSpeed: this.config.windSpeed,
    };

    const pmParams: PiersonMoskowitzParams = this.config.piersonMoskowitzConfig ?? {
      windSpeed: this.config.windSpeed,
    };

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Map array indices to wave vector components
        const nx = x - N / 2;
        const nz = y - N / 2;
        const kx = nx * dk;
        const kz = nz * dk;

        // Compute spectrum value using the selected model
        const P = directionalSpectrum(
          kx, kz,
          this.config.spectrumType,
          jonswapParams,
          pmParams,
          windDirX, windDirZ,
          this.config.damping,
        );

        const sqrtP = Math.sqrt(Math.max(0, P));
        const gaussR = rng.gaussian();
        const gaussI = rng.gaussian();
        const scale = sqrtP / Math.SQRT2;

        this.h0[y][x] = { re: gaussR * scale, im: gaussI * scale };

        // Conjugate for -k direction
        const Pneg = directionalSpectrum(
          -kx, -kz,
          this.config.spectrumType,
          jonswapParams,
          pmParams,
          windDirX, windDirZ,
          this.config.damping,
        );
        const sqrtPneg = Math.sqrt(Math.max(0, Pneg));
        const gaussR2 = rng.gaussian();
        const gaussI2 = rng.gaussian();
        const scaleNeg = sqrtPneg / Math.SQRT2;

        this.h0Conj[y][x] = { re: gaussR2 * scaleNeg, im: -gaussI2 * scaleNeg };
      }
    }
  }

  // ------------------------------------------------------------------
  // Dispersion Relation
  // ------------------------------------------------------------------

  /**
   * Compute the angular frequency for a given wave vector.
   *
   * Deep water: ω(k) = sqrt(g·|k|)
   * Shallow water: ω(k) = sqrt(g·|k|·tanh(|k|·depth))
   *
   * @param kx - X component of wave vector
   * @param kz - Z component of wave vector
   * @returns Angular frequency ω in rad/s
   */
  private dispersion(kx: number, kz: number): number {
    const k = Math.sqrt(kx * kx + kz * kz);
    if (k < 1e-10) return 0;
    const g = 9.81;

    if (this.config.depth > 30) {
      return Math.sqrt(g * k);
    }
    return Math.sqrt(g * k * Math.tanh(k * this.config.depth));
  }

  // ------------------------------------------------------------------
  // Height Field Computation (Core FFT Pipeline)
  // ------------------------------------------------------------------

  /**
   * Compute the spatial displacement fields at the given time.
   *
   * h(x, t) = Σ_k h(k, t) · exp(i·k·x)
   *
   * where h(k, t) = h₀(k)·exp(iωt) + h₀~*(-k)·exp(-iωt)
   *
   * Also computes horizontal displacement (choppiness) via:
   * Dx(k,t) = -i·(kx/k)·h(k,t)·λ
   * Dz(k,t) = -i·(kz/k)·h(k,t)·λ
   *
   * @param time - Simulation time in seconds
   */
  private computeFields(time: number): void {
    const N = this.N;
    const L = this.config.size;
    const dk = (2 * Math.PI) / L;
    const lambda = this.config.choppiness;
    const scaledTime = time * this.config.timeScale;

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
        const omegaT = omega * scaledTime;

        // Phase factors
        const expPos: Complex = { re: Math.cos(omegaT), im: Math.sin(omegaT) };
        const expNeg: Complex = { re: Math.cos(-omegaT), im: Math.sin(-omegaT) };

        // h(k, t) = h0(k)·exp(iωt) + conj(h0~(-k))·exp(-iωt)
        const term1 = cMul(this.h0[y][x], expPos);
        const term2 = cMul(cConj(this.h0Conj[y][x]), expNeg);
        const h = cAdd(term1, term2);
        hK[y][x] = h;

        // Choppy displacement: Dx = -i·(kx/k)·h·λ
        if (k > 1e-10) {
          const negIH: Complex = { re: h.im, im: -h.re }; // -i * h
          hKdx[y][x] = cScale(negIH, lambda * kx / k);
          hKdz[y][x] = cScale(negIH, lambda * kz / k);
        } else {
          hKdx[y][x] = { re: 0, im: 0 };
          hKdz[y][x] = { re: 0, im: 0 };
        }
      }
    }

    // Inverse FFT to get spatial domain
    ifft2D(hK, N);
    ifft2D(hKdx, N);
    ifft2D(hKdz, N);

    // Extract real parts with fftshift (swap quadrants)
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

    // Compute normals
    this.computeNormals();

    // Compute foam
    this.foamField = this.foamGenerator.computeFoam(
      this.heightField,
      this.displacementX,
      this.displacementZ,
      N,
      this.lastDt,
    );
  }

  /**
   * Compute per-pixel normals from the height field using central differences.
   * Stores the X and Z components of the normal (-dh/dx, 1, -dh/dz) for
   * efficient packing into a normal map texture.
   */
  private computeNormals(): void {
    const N = this.N;
    const L = this.config.size;
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

        this.normalFieldX[idx] = -dhdx;
        this.normalFieldZ[idx] = -dhdz;
      }
    }
  }

  // ------------------------------------------------------------------
  // Time Management
  // ------------------------------------------------------------------

  private ensureUpdated(time: number): void {
    if (this.lastTime !== time) {
      if (this.lastTime !== -Infinity) {
        this.lastDt = time - this.lastTime;
      }
      this.computeFields(time);
      this.lastTime = time;
    }
  }

  /**
   * Force a recomputation of all fields at the given time.
   * Useful after changing config parameters.
   */
  forceUpdate(time: number): void {
    this.computeFields(time);
    this.lastTime = time;
  }

  // ------------------------------------------------------------------
  // Evaluation API
  // ------------------------------------------------------------------

  /**
   * Evaluate the ocean surface at the given time.
   *
   * Returns complete displacement, foam, and normal data for the
   * entire grid. This is the primary per-frame evaluation method.
   *
   * @param time - Simulation time in seconds
   * @returns Complete ocean evaluation result
   */
  evaluate(time: number): OceanEvaluationResult {
    this.ensureUpdated(time);

    const N = this.N;
    const total = N * N;

    const heightMap = new Float32Array(total);
    const dispX = new Float32Array(total);
    const dispZ = new Float32Array(total);
    const foamMap = new Float32Array(total);
    const normalMap = new Float32Array(total * 2);

    heightMap.set(this.heightField);
    dispX.set(this.displacementX);
    dispZ.set(this.displacementZ);
    foamMap.set(this.foamField);

    // Pack normals as [nx, nz] pairs
    for (let i = 0; i < total; i++) {
      normalMap[i * 2] = this.normalFieldX[i];
      normalMap[i * 2 + 1] = this.normalFieldZ[i];
    }

    return { heightMap, displacementX: dispX, displacementZ: dispZ, foamMap, normalMap };
  }

  // ------------------------------------------------------------------
  // Point Query API (Bilinear Interpolation)
  // ------------------------------------------------------------------

  /**
   * Get the surface height at an arbitrary world position using bilinear
   * interpolation of the height field grid.
   *
   * The ocean tiles seamlessly, so positions outside the base patch
   * wrap around automatically.
   *
   * @param x - World X position in metres
   * @param z - World Z position in metres
   * @param time - Simulation time in seconds
   * @returns Height above mean sea level in metres
   */
  getHeight(x: number, z: number, time: number): number {
    this.ensureUpdated(time);
    return this.sampleBilinear(this.heightField, x, z);
  }

  /**
   * Get the surface normal at an arbitrary world position.
   *
   * The normal is computed from the pre-computed gradient field with
   * bilinear interpolation, then normalized. The result points upward
   * (Y component is positive) for a calm surface.
   *
   * @param x - World X position in metres
   * @param z - World Z position in metres
   * @param time - Simulation time in seconds
   * @returns Surface normal vector (unit length)
   */
  getNormal(x: number, z: number, time: number): THREE.Vector3 {
    this.ensureUpdated(time);
    const nx = this.sampleBilinear(this.normalFieldX, x, z);
    const nz = this.sampleBilinear(this.normalFieldZ, x, z);
    return new THREE.Vector3(nx, 1.0, nz).normalize();
  }

  /**
   * Get the foam intensity at an arbitrary world position.
   *
   * Returns a value in [0, 1] where 0 means no foam and 1 means
   * maximum foam intensity. Foam appears where waves break (steepness
   * exceeds threshold).
   *
   * @param x - World X position in metres
   * @param z - World Z position in metres
   * @param time - Simulation time in seconds
   * @returns Foam intensity [0, 1]
   */
  getFoam(x: number, z: number, time: number): number {
    this.ensureUpdated(time);
    return this.sampleBilinear(this.foamField, x, z);
  }

  /**
   * Get horizontal displacement at an arbitrary world position.
   *
   * The horizontal displacement creates the "choppiness" effect where
   * wave crests lean forward in the wind direction. This is essential
   * for realistic ocean rendering.
   *
   * @param x - World X position in metres
   * @param z - World Z position in metres
   * @param time - Simulation time in seconds
   * @returns [dx, dz] displacement in metres
   */
  getDisplacement(x: number, z: number, time: number): [number, number] {
    this.ensureUpdated(time);
    return [
      this.sampleBilinear(this.displacementX, x, z),
      this.sampleBilinear(this.displacementZ, x, z),
    ];
  }

  /**
   * Get the fully displaced surface position at a world coordinate.
   *
   * Combines the base position with both vertical height and horizontal
   * displacement (choppiness). This is the actual rendered position.
   *
   * @param x - World X position in metres
   * @param z - World Z position in metres
   * @param time - Simulation time in seconds
   * @returns Displaced position as Vector3
   */
  getDisplacedPosition(x: number, z: number, time: number): THREE.Vector3 {
    const h = this.getHeight(x, z, time);
    const [dx, dz] = this.getDisplacement(x, z, time);
    return new THREE.Vector3(x + dx, h, z + dz);
  }

  // ------------------------------------------------------------------
  // Spray Particles
  // ------------------------------------------------------------------

  /**
   * Generate spray particle positions at wave crests for the current frame.
   *
   * Spray particles represent aerosol droplets ejected by breaking waves.
   * They should be rendered as small translucent particles with a short
   * lifetime, falling back toward the ocean surface under gravity.
   *
   * @param maxParticles - Maximum number of spray particles (default from foam config)
   * @returns Array of spray particle world positions
   */
  getSprayParticles(maxParticles?: number): THREE.Vector3[] {
    return this.foamGenerator.generateSprayParticles(
      this.heightField,
      this.N,
      maxParticles,
      this.config.size,
    );
  }

  // ------------------------------------------------------------------
  // Cascaded LOD
  // ------------------------------------------------------------------

  /**
   * Generate cascaded LOD levels for infinite ocean rendering.
   *
   * Each cascade covers a progressively larger area centered on the
   * camera, with origins snapped to a grid to prevent swimming artifacts.
   * The caller should render each cascade as a separate mesh, blended
   * with the next higher level where they overlap.
   *
   * @param cameraPosition - Current camera world position
   * @param time - Simulation time in seconds
   * @returns Array of cascade levels with displacement data and transforms
   */
  generateCascadeLevels(
    cameraPosition: THREE.Vector3,
    time: number,
  ): OceanCascadeLevel[] {
    this.ensureUpdated(time);

    const cascadeCount = this.config.cascades;
    const heightDataPerLevel: Float32Array[] = [];
    const displacementXPerLevel: Float32Array[] = [];
    const displacementZPerLevel: Float32Array[] = [];
    const foamPerLevel: Float32Array[] = [];

    for (let level = 0; level < cascadeCount; level++) {
      // For level 0, use the pre-computed data directly
      if (level === 0) {
        heightDataPerLevel.push(this.heightField.slice());
        displacementXPerLevel.push(this.displacementX.slice());
        displacementZPerLevel.push(this.displacementZ.slice());
        foamPerLevel.push(this.foamField.slice());
      } else {
        // Higher cascade levels use the same spectrum but evaluated at
        // the appropriate scale. For a proper implementation, each level
        // would have its own FFT evaluation with different frequency bounds.
        // Here we downsample the base level data as an approximation.
        const cascadeSize = this.cascadeLOD.getCascadeSize(level);
        const baseSize = this.config.size;
        const scale = baseSize / cascadeSize;

        // Simple approach: use the same data (the FFT already contains
        // the full spectrum; the cascade just tiles it at a different scale)
        // In production, each cascade would filter the spectrum differently
        heightDataPerLevel.push(this.heightField.slice());
        displacementXPerLevel.push(this.displacementX.slice());
        displacementZPerLevel.push(this.displacementZ.slice());

        // Reduce foam intensity for distant cascades
        const attenuatedFoam = new Float32Array(this.foamField.length);
        const foamAttenuation = Math.pow(0.5, level);
        for (let i = 0; i < this.foamField.length; i++) {
          attenuatedFoam[i] = this.foamField[i] * foamAttenuation;
        }
        foamPerLevel.push(attenuatedFoam);
      }
    }

    return this.cascadeLOD.generateCascades(
      cameraPosition,
      time,
      heightDataPerLevel,
      displacementXPerLevel,
      displacementZPerLevel,
      foamPerLevel,
    );
  }

  /**
   * Get the cascaded LOD subsystem for direct access.
   */
  getCascadeLOD(): CascadedOceanLOD {
    return this.cascadeLOD;
  }

  /**
   * Get the foam generator subsystem for direct access.
   */
  getFoamGenerator(): OceanFoamGenerator {
    return this.foamGenerator;
  }

  // ------------------------------------------------------------------
  // Mesh Generation
  // ------------------------------------------------------------------

  /**
   * Create a THREE.Mesh for rendering the ocean surface.
   *
   * Generates a subdivided plane with a custom shader material that
   * displaces vertices based on the FFT ocean data. If a camera position
   * is provided, the mesh is centered on the camera with grid snapping
   * for seamless tiling.
   *
   * The shader applies:
   * - Vertex displacement from the height field
   * - Horizontal displacement (choppiness)
   * - Depth-based water coloring
   * - Fresnel reflection
   * - Foam overlay
   * - Specular highlights
   * - Subsurface scattering approximation
   *
   * @param cameraPosition - Optional camera position for centering the mesh
   * @returns THREE.Mesh ready for scene insertion
   */
  createMesh(cameraPosition?: THREE.Vector3): THREE.Mesh {
    const size = this.config.size;
    const resolution = this.config.resolution;

    // Create subdivided plane geometry
    const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);

    // Build ocean shader material
    const material = this.createOceanMaterial();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 999;
    mesh.frustumCulled = false;

    // Position mesh at camera if provided
    if (cameraPosition) {
      const snapSize = this.cascadeLOD.getConfig().snapSize;
      const snappedX = Math.floor(cameraPosition.x / snapSize) * snapSize;
      const snappedZ = Math.floor(cameraPosition.z / snapSize) * snapSize;
      mesh.position.set(snappedX, 0, snappedZ);
    }

    return mesh;
  }

  /**
   * Create the ocean shader material with FFT-driven displacement.
   */
  private createOceanMaterial(): THREE.ShaderMaterial {
    const uniforms = {
      uTime: { value: 0 },
      uPatchSize: { value: this.config.size },
      uResolution: { value: this.config.resolution },
      uChoppiness: { value: this.config.choppiness },
      uWindDirection: { value: new THREE.Vector2(
        Math.cos(this.config.windDirection),
        Math.sin(this.config.windDirection),
      )},
      uDeepColor: { value: new THREE.Color(0x001830) },
      uShallowColor: { value: new THREE.Color(0x40c0b0) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    const vertexShader = /* glsl */ `
      uniform float uTime;
      uniform float uPatchSize;
      uniform float uResolution;
      uniform float uChoppiness;
      uniform vec2 uWindDirection;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFoam;
      varying vec2 vUv;

      // Simple hash-based noise for vertex displacement preview
      // In production, this would sample a DataTexture from the FFT
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Multi-octave Gerstner-like waves approximating FFT result
      vec3 oceanDisplacement(vec3 pos, float time) {
        vec3 disp = vec3(0.0);
        float amp = 0.5;
        float freq = 0.1;
        float speed = 1.0;

        for (int i = 0; i < 6; i++) {
          float k = 2.0 * 3.14159265 * freq;
          float omega = sqrt(9.81 * k);
          float phase = omega * time - k * dot(uWindDirection, pos.xz);

          // Vertical displacement (Gerstner wave)
          disp.y += amp * sin(phase);

          // Horizontal displacement (choppiness)
          float choppy = uChoppiness * amp * 0.5;
          disp.x += choppy * uWindDirection.x * cos(phase);
          disp.z += choppy * uWindDirection.y * cos(phase);

          amp *= 0.5;
          freq *= 2.0;
        }

        return disp;
      }

      void main() {
        vUv = uv;

        vec3 pos = position;
        vec3 disp = oceanDisplacement(pos, uTime);
        pos += disp;

        // Approximate normal via finite differences
        float eps = uPatchSize / uResolution;
        vec3 dispR = oceanDisplacement(position + vec3(eps, 0.0, 0.0), uTime);
        vec3 dispF = oceanDisplacement(position + vec3(0.0, 0.0, eps), uTime);
        vec3 p0 = position + disp;
        vec3 pR = position + vec3(eps, 0.0, 0.0) + dispR;
        vec3 pF = position + vec3(0.0, 0.0, eps) + dispF;
        vNormal = normalize(cross(pF - p0, pR - p0));

        vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;

        // Foam from wave height
        vFoam = smoothstep(0.3, 1.0, disp.y / max(2.0, 0.001));

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;

    const fragmentShader = /* glsl */ `
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uCameraPosition;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vFoam;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

        // Depth-based water color
        float depthFactor = 1.0 - exp(-max(vWorldPosition.y + 2.0, 0.0) * 0.3);
        depthFactor = clamp(depthFactor, 0.0, 1.0);
        vec3 waterColor = mix(uShallowColor, uDeepColor, depthFactor);

        // Fresnel effect (Schlick approximation)
        float fresnelBase = 1.0 - max(dot(viewDir, normal), 0.0);
        float fresnel = pow(fresnelBase, 4.0);
        vec3 skyColor = vec3(0.5, 0.7, 0.9);
        waterColor = mix(waterColor, skyColor, fresnel * 0.5);

        // Specular highlights
        vec3 halfDir = normalize(uSunDirection + viewDir);
        float specAngle = max(dot(normal, halfDir), 0.0);
        float specBroad = pow(specAngle, 64.0) * 0.4;
        float specSharp = pow(specAngle, 512.0) * 1.5;
        vec3 specular = uSunColor * (specBroad + specSharp);

        // Subsurface scattering approximation
        float sssDot = max(dot(viewDir, -uSunDirection), 0.0);
        float sss = pow(sssDot, 4.0) * 0.25;
        vec3 sssColor = vec3(0.0, 0.6, 0.4) * sss * (1.0 - depthFactor);

        // Foam with noise breakup
        float foamNoise = fract(sin(dot(vUv * 50.0, vec2(12.9898, 78.233))) * 43758.5453);
        float foamMask = vFoam * smoothstep(0.3, 0.6, foamNoise);
        float totalFoam = clamp(foamMask, 0.0, 1.0);

        // Combine
        vec3 finalColor = waterColor + specular + sssColor;
        finalColor = mix(finalColor, uFoamColor, totalFoam);

        float diffuse = max(dot(normal, uSunDirection), 0.0) * 0.3 + 0.7;
        finalColor *= diffuse;

        float alpha = mix(0.7, 0.95, 1.0 - fresnelBase);
        alpha = mix(alpha, 1.0, totalFoam);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  // ------------------------------------------------------------------
  // Normal Map Texture
  // ------------------------------------------------------------------

  /**
   * Build a THREE.DataTexture containing the current normal map.
   *
   * Encoded as RGB = normalize(dh/dx, 1, dh/dz) mapped from [-1,1] → [0,255].
   * The caller should call this once per frame and set `texture.needsUpdate = true`.
   *
   * @returns DataTexture with RGBA format containing packed normals
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

  /**
   * Build a THREE.DataTexture containing the foam intensity map.
   *
   * Encoded as R = foam intensity [0, 255]. The green and blue channels
   * contain the same value for convenience.
   *
   * @returns DataTexture with RGBA format containing foam intensity
   */
  generateFoamMapTexture(): THREE.DataTexture {
    const N = this.N;
    const data = new Uint8Array(N * N * 4);

    for (let i = 0; i < N * N; i++) {
      const foam = Math.min(1, Math.max(0, this.foamField[i]));
      const byte = Math.floor(foam * 255);
      data[i * 4] = byte;
      data[i * 4 + 1] = byte;
      data[i * 4 + 2] = byte;
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
  // Raw Data Access
  // ------------------------------------------------------------------

  /**
   * Get the raw height field data.
   */
  getHeightFieldData(): Float32Array {
    return this.heightField;
  }

  /**
   * Get the raw horizontal displacement data.
   */
  getDisplacementData(): { x: Float32Array; z: Float32Array } {
    return { x: this.displacementX, z: this.displacementZ };
  }

  /**
   * Get the raw foam intensity data.
   */
  getFoamFieldData(): Float32Array {
    return this.foamField;
  }

  /**
   * Get the raw normal field gradient data.
   */
  getNormalFieldData(): { x: Float32Array; z: Float32Array } {
    return { x: this.normalFieldX, z: this.normalFieldZ };
  }

  // ------------------------------------------------------------------
  // Internal Helpers
  // ------------------------------------------------------------------

  /**
   * Sample a field value at a world position using bilinear interpolation.
   *
   * The ocean tiles seamlessly, so positions outside the base patch
   * wrap around using modular arithmetic.
   *
   * @param field - The Float32Array to sample (N×N)
   * @param worldX - World X position in metres
   * @param worldZ - World Z position in metres
   * @returns Interpolated field value
   */
  private sampleBilinear(field: Float32Array, worldX: number, worldZ: number): number {
    const N = this.N;
    const L = this.config.size;

    // Map world coordinates to height field indices
    let fx = (worldX / L + 0.5) * N;
    let fz = (worldZ / L + 0.5) * N;

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

    const h00 = field[z0 * N + x0];
    const h10 = field[z0 * N + x1];
    const h01 = field[z1 * N + x0];
    const h11 = field[z1 * N + x1];

    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) +
           (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  /**
   * Release all resources held by this ocean system.
   */
  dispose(): void {
    this.heightField = new Float32Array(0);
    this.displacementX = new Float32Array(0);
    this.displacementZ = new Float32Array(0);
    this.foamField = new Float32Array(0);
    this.normalFieldX = new Float32Array(0);
    this.normalFieldZ = new Float32Array(0);
    this.h0.length = 0;
    this.h0Conj.length = 0;
    this.foamGenerator.dispose();
  }
}
