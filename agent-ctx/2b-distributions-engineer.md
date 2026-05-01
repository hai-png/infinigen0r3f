# Task 2-b: Comprehensive Statistical Distributions Module

## Summary

Replaced the 7-line re-export stub `src/core/util/math/distributions.ts` with a full-featured statistical distribution module (~990 lines). All randomness flows through `SeededRandom` — no `Math.random()` usage anywhere. Updated `src/core/util/math/index.ts` to export all new symbols.

## Work Completed

### 1. Core Probability Distributions (15 functions)

All take `rng: RandomGenerator` as first parameter plus distribution-specific parameters:

| Function | Algorithm | Notes |
|---|---|---|
| `uniform(rng, min, max)` | Direct scaling | Default [0,1) |
| `gaussian(rng, mean, stdDev)` | Box-Muller | Guards against log(0) |
| `exponential(rng, lambda)` | Inverse CDF | Rate parameter |
| `poisson(rng, lambda)` | Knuth's algorithm | Normal approximation for λ>30 |
| `binomial(rng, n, p)` | Direct simulation | Normal approximation for n>1000 |
| `gamma(rng, alpha, beta)` | Marsaglia-Tsang | α<1 via Ahrens-Dieter boost |
| `beta(rng, alpha, beta)` | Via Gamma | X/(X+Y) relationship |
| `chiSquared(rng, k)` | Via Gamma | = Gamma(k/2, 1/2) |
| `logNormal(rng, mu, sigma)` | exp(Normal) | — |
| `weibull(rng, lambda, k)` | Inverse CDF | Scale & shape params |
| `pareto(rng, xm, alpha)` | Inverse CDF | Heavy-tailed |
| `cauchy(rng, x0, gamma)` | tan transform | Endpoint-safe |
| `geometric(rng, p)` | Inverse CDF | ceil(log(U)/log(1-p)) |
| `negativeBinomial(rng, r, p)` | Sum of geometric | Gamma-Poisson for fractional r |
| `hypergeometric(rng, N, K, n)` | Sequential draw | Without replacement |

### 2. Sampling Methods (5 functions)

| Function | Description |
|---|---|
| `weightedChoice(rng, items, weights)` | Weighted random selection |
| `sampleWithoutReplacement(rng, items, count)` | Partial Fisher-Yates |
| `shuffle(rng, array)` | Full Fisher-Yates (returns new array) |
| `reservoirSample(rng, stream, k)` | Reservoir sampling from Iterable |
| `rejectionSample(rng, pdf, bounds, maxPdf?)` | Rejection sampling with auto-peak estimation |

### 3. Statistical Utility Functions (4 functions)

| Function | Algorithm | Accuracy |
|---|---|---|
| `normalCDF(x, mean, stdDev)` | Abramowitz-Stegun erfc | <7.5e-8 |
| `normalPDF(x, mean, stdDev)` | Closed-form | Exact |
| `normalInvCDF(p, mean, stdDev)` | Acklam rational + Newton refinement | ~1.15e-9 |
| `clampToDistribution(value, dist)` | Simple min/max bounds | — |

### 4. DistributionSampler Class

Stateful, seeded interface with:
- **All 15 distributions** as instance methods (e.g., `sampler.gaussian(0, 1)`)
- **All 5 sampling methods** as instance methods
- **Primitive randomness**: `random()`, `nextInt()`, `nextFloat()`, `choice()`, `boolean()`
- **State management**: `fork()` (derived seed child), `reset()`, `seed` getter
- **Procedural generation convenience**:
  - `color()` — Random pleasant color (HSV → RGB)
  - `unitVector()` — Random point on unit sphere
  - `pointInSphere(radius)` — Uniform point inside sphere
  - `pointOnSphere(radius)` — Uniform point on sphere surface
  - `euler()` — Random Euler angles for uniform rotation
  - `quaternion()` — Random unit quaternion (Shoemake 1992)

### 5. Name Shadowing Fix

Class methods that share names with standalone functions (e.g., `gamma`, `beta`, `shuffle`) caused TypeScript errors — `beta(this.rng, alpha, beta)` would try to call the method recursively. Fixed by creating local aliases (`_gamma`, `_beta`, etc.) that capture the standalone function references before the class definition.

### 6. Index.ts Update

Updated `src/core/util/math/index.ts` to explicitly export all new symbols from distributions (15 distributions, 5 sampling methods, 4 utility functions, `DistributionSampler` class, `DistributionSpec` type). SeededRandom/RandomGenerator still come from MathUtils star export.

## Files Modified

- `src/core/util/math/distributions.ts` — Complete rewrite (7 lines → ~990 lines)
- `src/core/util/math/index.ts` — Added distribution exports, removed old re-export stub

## Verification

- TypeScript compilation: **0 errors** in distributions.ts and math/index.ts
- All pre-existing errors are unrelated (missing 'three' type declarations in other files)
- ESLint: Not configured in project (no eslint.config.js); TypeScript check used instead
