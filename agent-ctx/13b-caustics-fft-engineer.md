# Task 13-b: Caustics Renderer and FFT Ocean Spectrum

## Agent: caustics-fft-engineer

## Task Summary
Implement caustics rendering and FFT ocean spectrum enhancement for the infinigen-r3f water system.

## Work Completed

### 1. CausticsRenderer.ts (510 lines)
- Created at `src/terrain/water/CausticsRenderer.ts`
- CausticsConfig: resolution (256), intensity (1.0), blurRadius (2), speed (0.5), depth (10)
- CausticsRenderer class with orthographic camera, render-to-texture pipeline
- Custom GLSL caustics shader:
  - 6-octave gradient noise (FBM) for organic patterns
  - Gradient magnitude of noise creates bright caustic lines (light convergence)
  - Two-layer animated noise fields for interference/refraction simulation
  - Depth attenuation (caustics stronger near surface)
- Separable Gaussian blur pass for smooth output
- API: update(), getCausticsTexture(), applyToMaterial(), removeFromMaterial(), dispose()

### 2. FFTOceanSpectrum.ts (702 lines)
- Created at `src/terrain/water/FFTOceanSpectrum.ts`
- Cooley-Tukey radix-2 FFT (in-place, DIT with bit-reversal permutation)
- 2D inverse FFT via row-column decomposition
- Phillips spectrum: P(k) = A * exp(-1/(kL)^2) / k^4 * |k·w|^2 * damping
- Fetch-limited length scale
- Deep-water: ω = sqrt(g*k); shallow: ω = sqrt(g*k*tanh(k*depth))
- Time evolution: h(k,t) = h0(k)*exp(iωt) + conj(h0~(-k))*exp(-iωt)
- Horizontal displacement for choppiness
- Bilinear interpolation for queries
- Uses SeededRandom from @/core/util/MathUtils

### 3. OceanSystem.ts Updates
- Added `useFFT: boolean` (default false) and `fftConfig: Partial<FFTOceanConfig>` to OceanConfig
- FFTOceanSpectrum integrated in OceanSystem class
- initFFTSpectrum() derives wind params from ocean config
- getHeightAt()/getNormalAt() dispatch to FFT when useFFT=true
- Added getFFTSpectrum(), isUsingFFT(), setUseFFT() methods
- updateConfig() handles FFT mode switching
- dispose() cleans up FFT spectrum

### 4. water/index.ts Updates
- Added exports for CausticsRenderer, CausticsConfig, FFTOceanSpectrum, FFTOceanConfig

## Files
- Created: src/terrain/water/CausticsRenderer.ts
- Created: src/terrain/water/FFTOceanSpectrum.ts
- Modified: src/terrain/water/OceanSystem.ts
- Modified: src/terrain/water/index.ts

## TypeScript Status
No new errors introduced (verified via `npx tsc --noEmit`).
