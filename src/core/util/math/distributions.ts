/**
 * Random Number Distributions
 *
 * Comprehensive statistical distribution module ported from Princeton Infinigen's
 * procedural generation pipeline. All randomness flows through SeededRandom to
 * ensure reproducible, deterministic procedural generation.
 *
 * Provides:
 * - 15 core probability distributions (uniform, gaussian, exponential, etc.)
 * - 5 sampling methods (weighted choice, reservoir sampling, etc.)
 * - 4 statistical utility functions (CDF, PDF, inverse CDF, clamping)
 * - DistributionSampler class for convenient stateful generation
 *
 * @module distributions
 */

import { SeededRandom } from '../MathUtils';
import type { RandomGenerator } from '../MathUtils';

// Re-export for backward compatibility
export { SeededRandom } from '../MathUtils';
export type { RandomGenerator } from '../MathUtils';

// ============================================================================
// Core Probability Distributions
// ============================================================================

/**
 * Uniform distribution: returns a random number in [min, max).
 * @param rng - Seeded random number generator
 * @param min - Lower bound (inclusive)
 * @param max - Upper bound (exclusive)
 */
export function uniform(rng: RandomGenerator, min: number = 0, max: number = 1): number {
  return rng.next() * (max - min) + min;
}

/**
 * Gaussian (Normal) distribution using the Box-Muller transform.
 * Generates pairs of normally distributed values; one is cached for the next call.
 * @param rng - Seeded random number generator
 * @param mean - Mean of the distribution (default 0)
 * @param stdDev - Standard deviation (default 1)
 */
export function gaussian(rng: RandomGenerator, mean: number = 0, stdDev: number = 1): number {
  const u1 = rng.next();
  const u2 = rng.next();
  // Box-Muller transform — guard against log(0)
  const safe = u1 === 0 ? Number.EPSILON : u1;
  const z0 = Math.sqrt(-2.0 * Math.log(safe)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Exponential distribution with rate parameter lambda.
 * Models time between events in a Poisson process.
 * @param rng - Seeded random number generator
 * @param lambda - Rate parameter (must be > 0)
 */
export function exponential(rng: RandomGenerator, lambda: number = 1): number {
  if (lambda <= 0) throw new Error('exponential: lambda must be > 0');
  const u = rng.next();
  const safe = u === 0 ? Number.EPSILON : u;
  return -Math.log(safe) / lambda;
}

/**
 * Poisson distribution using Knuth's algorithm.
 * Models the number of events occurring in a fixed interval.
 * @param rng - Seeded random number generator
 * @param lambda - Expected number of events (must be >= 0)
 */
export function poisson(rng: RandomGenerator, lambda: number = 1): number {
  if (lambda < 0) throw new Error('poisson: lambda must be >= 0');
  if (lambda === 0) return 0;
  // For large lambda, use normal approximation to avoid excessive loops
  if (lambda > 30) {
    const approx = Math.round(gaussian(rng, lambda, Math.sqrt(lambda)));
    return Math.max(0, approx);
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L);
  return k - 1;
}

/**
 * Binomial distribution: number of successes in n independent trials
 * with probability p of success on each trial.
 * @param rng - Seeded random number generator
 * @param n - Number of trials (must be >= 0)
 * @param p - Probability of success per trial (0 <= p <= 1)
 */
export function binomial(rng: RandomGenerator, n: number, p: number): number {
  if (n < 0) throw new Error('binomial: n must be >= 0');
  if (p < 0 || p > 1) throw new Error('binomial: p must be in [0, 1]');
  if (n === 0 || p === 0) return 0;
  if (p === 1) return n;

  // For large n, use normal approximation
  if (n > 1000) {
    const mean = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    const approx = Math.round(gaussian(rng, mean, stdDev));
    return Math.max(0, Math.min(n, approx));
  }

  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (rng.next() < p) successes++;
  }
  return successes;
}

/**
 * Gamma distribution using Marsaglia-Tsang method (alpha >= 1)
 * with transformation for alpha < 1.
 * @param rng - Seeded random number generator
 * @param alpha - Shape parameter (must be > 0)
 * @param beta - Rate parameter (must be > 0, default 1)
 */
export function gamma(rng: RandomGenerator, alpha: number, beta: number = 1): number {
  if (alpha <= 0) throw new Error('gamma: alpha must be > 0');
  if (beta <= 0) throw new Error('gamma: beta must be > 0');

  // For alpha < 1, use the transformation: if X ~ Gamma(alpha+1), then
  // X * U^(1/alpha) ~ Gamma(alpha) where U ~ Uniform(0,1)
  if (alpha < 1) {
    const boost = gamma(rng, alpha + 1, 1);
    const u = rng.next();
    const safe = u === 0 ? Number.EPSILON : u;
    return (boost * Math.pow(safe, 1 / alpha)) / beta;
  }

  // Marsaglia-Tsang method for alpha >= 1
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;
    while (true) {
      x = gaussian(rng, 0, 1);
      v = 1 + c * x;
      if (v > 0) break;
    }
    v = v * v * v;
    const u = rng.next();
    const safeU = u === 0 ? Number.EPSILON : u;

    if (u < 1 - 0.0331 * x * x * x * x) {
      return (d * v) / beta;
    }
    if (Math.log(safeU) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return (d * v) / beta;
    }
  }
}

/**
 * Beta distribution using the relationship between Beta and Gamma:
 * If X ~ Gamma(alpha, 1) and Y ~ Gamma(beta, 1), then X/(X+Y) ~ Beta(alpha, beta).
 * @param rng - Seeded random number generator
 * @param alpha - First shape parameter (must be > 0)
 * @param beta - Second shape parameter (must be > 0)
 */
export function beta(rng: RandomGenerator, alpha: number, beta: number): number {
  if (alpha <= 0) throw new Error('beta: alpha must be > 0');
  if (beta <= 0) throw new Error('beta: beta must be > 0');

  if (alpha === 1 && beta === 1) return rng.next();

  const x = gamma(rng, alpha, 1);
  const y = gamma(rng, beta, 1);
  return x / (x + y);
}

/**
 * Chi-squared distribution with k degrees of freedom.
 * Equivalent to Gamma(k/2, 1/2).
 * @param rng - Seeded random number generator
 * @param k - Degrees of freedom (must be > 0)
 */
export function chiSquared(rng: RandomGenerator, k: number): number {
  if (k <= 0) throw new Error('chiSquared: k must be > 0');
  return gamma(rng, k / 2, 0.5);
}

/**
 * Log-normal distribution: if ln(X) ~ N(mu, sigma^2), then X ~ LogNormal.
 * @param rng - Seeded random number generator
 * @param mu - Mean of the underlying normal distribution (default 0)
 * @param sigma - Standard deviation of the underlying normal (must be > 0, default 1)
 */
export function logNormal(rng: RandomGenerator, mu: number = 0, sigma: number = 1): number {
  if (sigma <= 0) throw new Error('logNormal: sigma must be > 0');
  return Math.exp(gaussian(rng, mu, sigma));
}

/**
 * Weibull distribution with scale parameter lambda and shape parameter k.
 * Commonly used in reliability engineering and wind speed modeling.
 * @param rng - Seeded random number generator
 * @param lambda - Scale parameter (must be > 0, default 1)
 * @param k - Shape parameter (must be > 0, default 1)
 */
export function weibull(rng: RandomGenerator, lambda: number = 1, k: number = 1): number {
  if (lambda <= 0) throw new Error('weibull: lambda must be > 0');
  if (k <= 0) throw new Error('weibull: k must be > 0');
  const u = rng.next();
  const safe = u === 0 ? Number.EPSILON : u;
  const safe1 = 1 - safe;
  const safeArg = safe1 === 0 ? Number.EPSILON : safe1;
  return lambda * Math.pow(-Math.log(safeArg), 1 / k);
}

/**
 * Pareto distribution with scale xm and shape alpha.
 * Models heavy-tailed phenomena (wealth distribution, city sizes, etc.).
 * @param rng - Seeded random number generator
 * @param xm - Scale / minimum value (must be > 0, default 1)
 * @param alpha - Shape / tail index (must be > 0, default 1)
 */
export function pareto(rng: RandomGenerator, xm: number = 1, alpha: number = 1): number {
  if (xm <= 0) throw new Error('pareto: xm must be > 0');
  if (alpha <= 0) throw new Error('pareto: alpha must be > 0');
  const u = rng.next();
  const safe = 1 - u;
  const safeArg = safe === 0 ? Number.EPSILON : safe;
  return xm / Math.pow(safeArg, 1 / alpha);
}

/**
 * Cauchy (Lorentz) distribution with location x0 and scale gamma.
 * Heavy-tailed distribution with undefined mean and variance.
 * @param rng - Seeded random number generator
 * @param x0 - Location parameter (default 0)
 * @param gamma - Scale parameter (must be > 0, default 1)
 */
export function cauchy(rng: RandomGenerator, x0: number = 0, gamma: number = 1): number {
  if (gamma <= 0) throw new Error('cauchy: gamma must be > 0');
  const u = rng.next();
  // Map (0,1) to (-pi/2, pi/2), avoiding endpoints
  const safe = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, u));
  return x0 + gamma * Math.tan(Math.PI * (safe - 0.5));
}

/**
 * Geometric distribution: number of trials until first success.
 * Returns the number of Bernoulli trials needed to get one success.
 * @param rng - Seeded random number generator
 * @param p - Probability of success on each trial (0 < p <= 1)
 */
export function geometric(rng: RandomGenerator, p: number): number {
  if (p <= 0 || p > 1) throw new Error('geometric: p must be in (0, 1]');
  // Using inverse CDF method: ceil(log(U) / log(1-p))
  if (p >= 1) return 1;
  const u = rng.next();
  const safe = u === 0 ? Number.EPSILON : u;
  return Math.ceil(Math.log(safe) / Math.log(1 - p));
}

/**
 * Negative binomial distribution: number of failures before r successes.
 * @param rng - Seeded random number generator
 * @param r - Number of successes (must be > 0)
 * @param p - Probability of success on each trial (0 < p <= 1)
 */
export function negativeBinomial(rng: RandomGenerator, r: number, p: number): number {
  if (r <= 0) throw new Error('negativeBinomial: r must be > 0');
  if (p <= 0 || p > 1) throw new Error('negativeBinomial: p must be in (0, 1]');

  // Sum of r geometric random variables
  let failures = 0;
  for (let i = 0; i < Math.ceil(r); i++) {
    // Each geometric gives number of failures before one success
    const u = rng.next();
    const safe = u === 0 ? Number.EPSILON : u;
    failures += Math.floor(Math.log(safe) / Math.log(1 - p));
  }

  // Handle non-integer r using gamma interpolation
  const frac = r - Math.floor(r);
  if (frac > 0) {
    // Use gamma-poisson mixture for fractional r
    const lambda = gamma(rng, frac, (1 - p) / p);
    failures += poisson(rng, lambda);
  }

  return failures;
}

/**
 * Hypergeometric distribution: number of successes in n draws without
 * replacement from a population of N items containing K successes.
 * @param rng - Seeded random number generator
 * @param N - Population size (must be >= 0)
 * @param K - Number of successes in population (must be in [0, N])
 * @param n - Number of draws (must be in [0, N])
 */
export function hypergeometric(rng: RandomGenerator, N: number, K: number, n: number): number {
  if (N < 0) throw new Error('hypergeometric: N must be >= 0');
  if (K < 0 || K > N) throw new Error('hypergeometric: K must be in [0, N]');
  if (n < 0 || n > N) throw new Error('hypergeometric: n must be in [0, N]');

  // Edge cases
  if (n === 0 || K === 0) return 0;
  if (K === N) return n;

  // Simulate draws without replacement
  let successes = 0;
  let remaining = N;
  let remainingSuccesses = K;

  for (let i = 0; i < n && remainingSuccesses > 0; i++) {
    if (rng.next() < remainingSuccesses / remaining) {
      successes++;
      remainingSuccesses--;
    }
    remaining--;
  }

  return successes;
}

// ============================================================================
// Sampling Methods
// ============================================================================

/**
 * Weighted random choice: selects an item with probability proportional to its weight.
 * @param rng - Seeded random number generator
 * @param items - Array of items to choose from
 * @param weights - Array of non-negative weights (same length as items)
 * @returns The selected item
 */
export function weightedChoice<T>(rng: RandomGenerator, items: readonly T[], weights: readonly number[]): T {
  if (items.length === 0) throw new Error('weightedChoice: items must not be empty');
  if (items.length !== weights.length) {
    throw new Error('weightedChoice: items and weights must have the same length');
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) throw new Error('weightedChoice: total weight must be > 0');

  let r = rng.next() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Sample without replacement: selects `count` unique items from the array.
 * Uses partial Fisher-Yates shuffle to avoid modifying the original array.
 * @param rng - Seeded random number generator
 * @param items - Array of items to sample from
 * @param count - Number of items to select (must be <= items.length)
 * @returns Array of selected items
 */
export function sampleWithoutReplacement<T>(rng: RandomGenerator, items: readonly T[], count: number): T[] {
  if (count < 0) throw new Error('sampleWithoutReplacement: count must be >= 0');
  if (count > items.length) {
    throw new Error('sampleWithoutReplacement: count must be <= items.length');
  }

  // Copy array and do partial Fisher-Yates
  const copy = [...items];
  const result: T[] = [];

  for (let i = 0; i < count; i++) {
    const j = rng.nextInt(i, copy.length - 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
    result.push(copy[i]);
  }

  return result;
}

/**
 * Fisher-Yates shuffle with seeded RNG. Returns a new shuffled array.
 * @param rng - Seeded random number generator
 * @param array - Array to shuffle
 * @returns A new shuffled array (original is not modified)
 */
export function shuffle<T>(rng: RandomGenerator, array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Reservoir sampling: selects k items from a stream/iterable of unknown length.
 * Useful for sampling from generators or large datasets that don't fit in memory.
 *
 * @param rng - Seeded random number generator
 * @param stream - Iterable source of items
 * @param k - Number of items to select (reservoir size)
 * @returns Array of k sampled items (or fewer if stream has fewer items)
 */
export function reservoirSample<T>(rng: RandomGenerator, stream: Iterable<T>, k: number): T[] {
  if (k <= 0) throw new Error('reservoirSample: k must be > 0');

  const reservoir: T[] = [];
  let index = 0;

  for (const item of stream) {
    if (index < k) {
      reservoir.push(item);
    } else {
      const j = rng.nextInt(0, index);
      if (j < k) {
        reservoir[j] = item;
      }
    }
    index++;
  }

  return reservoir;
}

/**
 * Rejection sampling: generates samples from a target distribution by
 * proposing from a uniform distribution and accepting/rejecting based on PDF.
 *
 * @param rng - Seeded random number generator
 * @param pdf - Probability density function to sample from
 * @param bounds - [min, max] bounds for the proposal distribution
 * @param maxPdf - Maximum value of the PDF (optional, auto-estimated if not provided)
 * @param maxIterations - Safety limit to prevent infinite loops (default 10000)
 * @returns A sample from the target distribution
 */
export function rejectionSample(
  rng: RandomGenerator,
  pdf: (x: number) => number,
  bounds: [number, number],
  maxPdf?: number,
  maxIterations: number = 10000
): number {
  const [lo, hi] = bounds;

  // Estimate maxPdf if not provided by evaluating at many points
  let peak = maxPdf ?? 0;
  if (maxPdf === undefined) {
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const x = lo + (hi - lo) * (i / steps);
      peak = Math.max(peak, pdf(x));
    }
    peak *= 1.1; // Add 10% margin
  }

  if (peak <= 0) throw new Error('rejectionSample: maxPdf must be > 0');

  for (let iter = 0; iter < maxIterations; iter++) {
    const x = uniform(rng, lo, hi);
    const y = rng.next() * peak;
    if (y <= pdf(x)) {
      return x;
    }
  }

  throw new Error('rejectionSample: exceeded max iterations — check pdf and bounds');
}

// ============================================================================
// Statistical Utility Functions
// ============================================================================

/**
 * Cumulative Distribution Function (CDF) of the normal distribution.
 * Uses the Abramowitz & Stegun approximation (error < 7.5e-8).
 *
 * @param x - Value to evaluate
 * @param mean - Mean of the distribution (default 0)
 * @param stdDev - Standard deviation (default 1)
 * @returns P(X <= x) for X ~ N(mean, stdDev^2)
 */
export function normalCDF(x: number, mean: number = 0, stdDev: number = 1): number {
  const z = (x - mean) / stdDev;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Probability Density Function (PDF) of the normal distribution.
 *
 * @param x - Value to evaluate
 * @param mean - Mean of the distribution (default 0)
 * @param stdDev - Standard deviation (default 1)
 * @returns f(x) for X ~ N(mean, stdDev^2)
 */
export function normalPDF(x: number, mean: number = 0, stdDev: number = 1): number {
  const z = (x - mean) / stdDev;
  return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
}

/**
 * Inverse CDF (quantile function) of the normal distribution.
 * Uses the Beasley-Springer-Moro algorithm for high accuracy.
 *
 * @param p - Probability value in (0, 1)
 * @param mean - Mean of the distribution (default 0)
 * @param stdDev - Standard deviation (default 1)
 * @returns x such that P(X <= x) = p for X ~ N(mean, stdDev^2)
 */
export function normalInvCDF(p: number, mean: number = 0, stdDev: number = 1): number {
  if (p <= 0 || p >= 1) {
    throw new Error('normalInvCDF: p must be in (0, 1)');
  }

  // Rational approximation for the inverse normal CDF
  // Peter Acklam's algorithm — accurate to ~1.15e-9
  const a: readonly number[] = [
    -3.969683028665376e1,
     2.209460984245205e2,
    -2.759285104469687e2,
     1.383577518672690e2,
    -3.066479806614716e1,
     2.506628277459239e0,
  ];

  const b: readonly number[] = [
    -5.447609879822406e1,
     1.615858368580409e2,
    -1.556989798598866e2,
     6.680131188771972e1,
    -1.328068155288572e1,
  ];

  const c: readonly number[] = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838e0,
    -2.549732539343734e0,
     4.374664141464968e0,
     2.938163982698783e0,
  ];

  const d: readonly number[] = [
     7.784695709041462e-3,
     3.224671290700398e-1,
     2.445134137142996e0,
     3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;
  let x: number;

  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // Refinement using Newton's method
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  x = x - u / (1 + x * u / 2);

  return x * stdDev + mean;
}

/**
 * Clamp a value to the valid range of a distribution.
 * Useful for ensuring generated values stay within meaningful bounds.
 *
 * @param value - The value to clamp
 * @param dist - Distribution specification with optional min/max bounds
 * @returns The clamped value
 */
export function clampToDistribution(
  value: number,
  dist: { type: string; min?: number; max?: number }
): number {
  const { min, max } = dist;
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

// ============================================================================
// Internal: Complementary Error Function
// ============================================================================

/**
 * Complementary error function erfc(x).
 * Uses rational approximation (Abramowitz & Stegun 7.1.26), max error 1.5e-7.
 */
function erfc(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign < 0 ? 2 - y : y;
}

// ============================================================================
// DistributionSampler Class
// ============================================================================

/**
 * Local aliases for standalone distribution functions.
 * These avoid name-shadowing issues when class methods delegate to the
 * standalone functions (e.g., class method `gamma()` calling standalone `gamma()`).
 */
const _uniform = uniform;
const _gaussian = gaussian;
const _exponential = exponential;
const _poisson = poisson;
const _binomial = binomial;
const _gamma = gamma;
const _beta = beta;
const _chiSquared = chiSquared;
const _logNormal = logNormal;
const _weibull = weibull;
const _pareto = pareto;
const _cauchy = cauchy;
const _geometric = geometric;
const _negativeBinomial = negativeBinomial;
const _hypergeometric = hypergeometric;
const _weightedChoice = weightedChoice;
const _sampleWithoutReplacement = sampleWithoutReplacement;
const _shuffle = shuffle;
const _reservoirSample = reservoirSample;
const _rejectionSample = rejectionSample;

/**
 * Distribution type descriptor for clampToDistribution integration.
 */
export interface DistributionSpec {
  type: string;
  min?: number;
  max?: number;
  params?: Record<string, number>;
}

/**
 * DistributionSampler provides a stateful, seeded interface for generating
 * random samples from any supported distribution. Each instance maintains
 * its own SeededRandom state, ensuring reproducibility and isolation.
 *
 * Usage:
 * ```ts
 * const sampler = new DistributionSampler(42);
 * const height = sampler.gaussian(170, 10);  // Random height ~ N(170, 10^2)
 * const count = sampler.poisson(5);           // Random count ~ Poisson(5)
 * const child = sampler.fork();               // Deterministic child sampler
 * ```
 */
export class DistributionSampler {
  private rng: SeededRandom;
  private initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = seed;
    this.rng = new SeededRandom(seed);
  }

  // --------------------------------------------------------------------------
  // Core Distributions
  // --------------------------------------------------------------------------

  /** Uniform distribution in [min, max). */
  uniform(min: number = 0, max: number = 1): number {
    return _uniform(this.rng, min, max);
  }

  /** Gaussian (Normal) distribution using Box-Muller transform. */
  gaussian(mean: number = 0, stdDev: number = 1): number {
    return _gaussian(this.rng, mean, stdDev);
  }

  /** Alias for gaussian — matches common statistical naming. */
  normal(mean: number = 0, stdDev: number = 1): number {
    return _gaussian(this.rng, mean, stdDev);
  }

  /** Exponential distribution with rate parameter lambda. */
  exponential(lambda: number = 1): number {
    return _exponential(this.rng, lambda);
  }

  /** Poisson distribution using Knuth's algorithm. */
  poisson(lambda: number = 1): number {
    return _poisson(this.rng, lambda);
  }

  /** Binomial distribution: successes in n trials with probability p. */
  binomial(n: number, p: number): number {
    return _binomial(this.rng, n, p);
  }

  /** Gamma distribution using Marsaglia-Tsang method. */
  gamma(alpha: number, beta: number = 1): number {
    return _gamma(this.rng, alpha, beta);
  }

  /** Beta distribution using gamma-distribution relationship. */
  beta(alpha: number, beta: number): number {
    return _beta(this.rng, alpha, beta);
  }

  /** Chi-squared distribution with k degrees of freedom. */
  chiSquared(k: number): number {
    return _chiSquared(this.rng, k);
  }

  /** Log-normal distribution. */
  logNormal(mu: number = 0, sigma: number = 1): number {
    return _logNormal(this.rng, mu, sigma);
  }

  /** Weibull distribution with scale lambda and shape k. */
  weibull(lambda: number = 1, k: number = 1): number {
    return _weibull(this.rng, lambda, k);
  }

  /** Pareto distribution with scale xm and shape alpha. */
  pareto(xm: number = 1, alpha: number = 1): number {
    return _pareto(this.rng, xm, alpha);
  }

  /** Cauchy (Lorentz) distribution. */
  cauchy(x0: number = 0, scale: number = 1): number {
    return _cauchy(this.rng, x0, scale);
  }

  /** Geometric distribution: trials until first success. */
  geometric(p: number): number {
    return _geometric(this.rng, p);
  }

  /** Negative binomial distribution: failures before r successes. */
  negativeBinomial(r: number, p: number): number {
    return _negativeBinomial(this.rng, r, p);
  }

  /** Hypergeometric distribution: successes in n draws without replacement. */
  hypergeometric(N: number, K: number, n: number): number {
    return _hypergeometric(this.rng, N, K, n);
  }

  // --------------------------------------------------------------------------
  // Sampling Methods
  // --------------------------------------------------------------------------

  /** Weighted random choice from items with given weights. */
  weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
    return _weightedChoice(this.rng, items, weights);
  }

  /** Sample count unique items without replacement. */
  sampleWithoutReplacement<T>(items: readonly T[], count: number): T[] {
    return _sampleWithoutReplacement(this.rng, items, count);
  }

  /** Fisher-Yates shuffle returning a new shuffled array. */
  shuffle<T>(array: readonly T[]): T[] {
    return _shuffle(this.rng, array);
  }

  /** Reservoir sampling from an iterable stream. */
  reservoirSample<T>(stream: Iterable<T>, k: number): T[] {
    return _reservoirSample(this.rng, stream, k);
  }

  /** Rejection sampling from a target PDF within bounds. */
  rejectionSample(
    pdf: (x: number) => number,
    bounds: [number, number],
    maxPdf?: number,
    maxIterations?: number
  ): number {
    return _rejectionSample(this.rng, pdf, bounds, maxPdf, maxIterations);
  }

  // --------------------------------------------------------------------------
  // Primitive Randomness (delegated to SeededRandom)
  // --------------------------------------------------------------------------

  /** Random float in [0, 1). */
  random(): number {
    return this.rng.next();
  }

  /** Random integer in [min, max]. */
  nextInt(min: number, max: number): number {
    return this.rng.nextInt(min, max);
  }

  /** Random float in [min, max). */
  nextFloat(min: number, max: number): number {
    return this.rng.nextFloat(min, max);
  }

  /** Pick a random element from an array. */
  choice<T>(array: readonly T[]): T {
    return this.rng.choice(array);
  }

  /** Returns true with the given probability. */
  boolean(chance: number = 0.5): boolean {
    return this.rng.next() < chance;
  }

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  /**
   * Create a child DistributionSampler with a seed derived from the current
   * RNG state. The child is independent — advancing it does not affect the
   * parent, and vice versa.
   */
  fork(): DistributionSampler {
    // Derive a seed from two consecutive RNG values for good entropy
    const seedA = this.rng.nextInt(0, 0x7FFFFFFF);
    const seedB = this.rng.nextInt(0, 0x7FFFFFFF);
    const derivedSeed = (seedA * 2654435761 + seedB) | 0;
    return new DistributionSampler(derivedSeed);
  }

  /**
   * Reset the sampler to its initial seed state, reproducing the exact
   * same sequence of random numbers from construction.
   */
  reset(): void {
    this.rng = new SeededRandom(this.initialSeed);
  }

  /** The initial seed used to construct this sampler. */
  get seed(): number {
    return this.initialSeed;
  }

  // --------------------------------------------------------------------------
  // Convenience: Procedural Generation Helpers
  // --------------------------------------------------------------------------

  /**
   * Generate a random pleasant color in RGB space (0-1).
   * Uses HSV space with constrained saturation and value for aesthetic results.
   */
  color(): { r: number; g: number; b: number } {
    const h = this.rng.next();
    const s = this.rng.nextFloat(0.5, 0.9);
    const v = this.rng.nextFloat(0.7, 1.0);
    return hsvToRgbInternal(h, s, v);
  }

  /**
   * Generate a random unit vector uniformly distributed on the unit sphere.
   * Uses Marsaglia's method for uniform spherical distribution.
   */
  unitVector(): [number, number, number] {
    // Generate a point on the unit sphere using spherical coordinates
    const u = this.rng.next();
    const v = this.rng.next();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return [
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ];
  }

  /**
   * Generate a random point uniformly distributed inside a sphere of given radius.
   * @param radius - Sphere radius (default 1)
   */
  pointInSphere(radius: number = 1): [number, number, number] {
    const [x, y, z] = this.unitVector();
    // Cube root for uniform volumetric distribution
    const r = radius * Math.cbrt(this.rng.next());
    return [x * r, y * r, z * r];
  }

  /**
   * Generate a random point uniformly distributed on the surface of a sphere.
   * @param radius - Sphere radius (default 1)
   */
  pointOnSphere(radius: number = 1): [number, number, number] {
    const [x, y, z] = this.unitVector();
    return [x * radius, y * radius, z * radius];
  }

  /**
   * Generate random Euler angles (in radians) for a uniform random rotation.
   * Uses the method: uniform azimuth, z-axis tilt, and roll.
   * @returns [x, y, z] Euler angles in radians
   */
  euler(): [number, number, number] {
    // Uniform rotation: roll uniformly, pitch via arccos, yaw uniformly
    return [
      Math.acos(2 * this.rng.next() - 1),  // pitch [0, pi]
      2 * Math.PI * this.rng.next(),         // yaw [0, 2pi)
      2 * Math.PI * this.rng.next(),         // roll [0, 2pi)
    ];
  }

  /**
   * Generate a uniformly random unit quaternion.
   * Uses the method from Shoemake (1992) — "Uniform Random Rotations".
   * @returns [w, x, y, z] quaternion
   */
  quaternion(): [number, number, number, number] {
    const u1 = this.rng.next();
    const u2 = this.rng.next();
    const u3 = this.rng.next();

    const sqrt1 = Math.sqrt(1 - u1);
    const sqrt2 = Math.sqrt(u1);
    const angle1 = 2 * Math.PI * u2;
    const angle2 = 2 * Math.PI * u3;

    return [
      sqrt1 * Math.sin(angle1),  // w
      sqrt1 * Math.cos(angle1),  // x
      sqrt2 * Math.sin(angle2),  // y
      sqrt2 * Math.cos(angle2),  // z
    ];
  }
}

// ============================================================================
// Internal: HSV to RGB conversion (for DistributionSampler.color())
// ============================================================================

/**
 * Convert HSV to RGB (all values 0-1).
 * Internal helper to avoid importing from MathUtils (circular dependency risk).
 */
function hsvToRgbInternal(h: number, s: number, v: number): { r: number; g: number; b: number } {
  let r: number;
  let g: number;
  let b: number;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
    default: r = 0; g = 0; b = 0; break;
  }

  return { r, g, b };
}
