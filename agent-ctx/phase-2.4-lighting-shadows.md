# Task: Phase 2.4 — Lighting and Shadows

## Summary

Completed the full Lighting & Shadow system implementation for the infinigen-r3f project, including 7 major components across new and existing files. All changes pass `npm run build` and `tsc --noEmit` without errors.

## Files Created

1. **`/src/core/rendering/shadows/CascadedShadowMap.ts`** — New CSM implementation
2. **`/src/core/rendering/lighting/LightProbeSystem.ts`** — New irradiance volume system
3. **`/src/core/rendering/lighting/ExposureControl.ts`** — New auto-exposure + tone mapping
4. **`/src/core/rendering/lighting/index.ts`** — New module index

## Files Modified

5. **`/src/core/rendering/postprocess/SSGIPass.ts`** — Complete rewrite
6. **`/src/core/rendering/postprocess/SSAOPass.ts`** — Complete rewrite
7. **`/src/core/rendering/shadows/PCSSShadow.ts`** — Enhanced implementation
8. **`/src/core/rendering/index.ts`** — Updated exports
9. **`/src/components/InfinigenScene.tsx`** — Full update with post-processing, exposure, keyboard shortcuts

## Detailed Changes

### 1. SSGIPass.ts — Screen-Space Global Illumination
- **Fixed bilateral blur**: Previously read `indirectLight` (own pixel value) instead of sampling neighbors from the SSGI result texture. Now uses a proper 3-pass approach: compute SSGI → bilateral blur → composite.
- **Added golden-angle hemisphere sampling**: Uses `GOLDEN_ANGLE` constant (2.39996 rad) for deterministic, low-discrepancy ray distribution.
- **Improved screen-space ray marching**: Fixed depth comparison logic — now uses view-space Z comparison with proper thickness test.
- **Added distance attenuation**: Hit radiance falls off with distance from ray origin.
- **Added configuration**: `blurSharpness` parameter for bilateral edge preservation.

### 2. SSAOPass.ts — Screen-Space Ambient Occlusion
- **Fixed normal space mismatch**: Previously read world-space normals but treated them as view-space. Now includes `uView` uniform and `worldToViewNormal()` function that properly transforms normals.
- **Fixed bilateral blur**: Now correctly reads neighbor AO values from the AO texture.
- **Fixed blur kernel**: Changed from misleading `KERNEL=3` (7×7) to configurable `uBlurSize` (default 2 → 5×5) with proper sigma-based Gaussian.
- **Added configuration**: `blurSize` parameter for blur kernel radius.

### 3. CascadedShadowMap.ts — New
- Implements 4-cascade shadow mapping for large outdoor scenes.
- Practical split scheme (blends logarithmic + uniform splits with configurable lambda).
- Tight frustum fitting per cascade with texel-snapping to reduce shadow acne.
- Smooth blending between cascades using configurable blend width.
- PCF softness per cascade.
- Full receive shader with cascade selection, PCF filtering, and inter-cascade blending.

### 4. PCSSShadow.ts — Enhanced
- Extended Poisson disk to 64 samples (from 32) for better quality.
- Added distance fade for far shadows.
- Added shadow color and opacity configuration.
- Proper clamping of sample UVs in blocker search and PCF.
- The three-pass algorithm (blocker search → penumbra estimation → adaptive PCF) is fully implemented.

### 5. LightProbeSystem.ts — New
- Irradiance volume with configurable grid (default 8×4×8).
- Second-order spherical harmonics (L2, 9 coefficients per channel, 27 total).
- Trilinear interpolation of SH coefficients from 8 nearest probes.
- Scene capture via cube map rendering + SH projection.
- Ambient contribution fallback for sky/ground colors.
- Debug visualisation with sphere gizmos colored by probe irradiance.
- Data3DTexture for GPU-based sampling.

### 6. ExposureControl.ts — New
- Auto-exposure using middle-grey (18%) key value with luminance measurement.
- Eye adaptation with separate speeds for brightening (fast) and darkening (slow).
- Manual exposure override.
- Temporal stability via median luminance history.
- Tone mapping presets: Linear, Reinhard, ACES Filmic, Uncharted 2.
- Time-of-day integration (adjusts key value based on sun elevation).
- GLSL shader fragments for custom post-processing integration.
- Three.js tone mapping constant mapping.

### 7. InfinigenScene.tsx — Updated
- Added post-processing pipeline with SSGI and SSAO passes.
- Added exposure control with auto-adaptation.
- Added keyboard shortcuts: G (SSGI), O (SSAO), E (Auto Exposure), T (Tone Mapping cycle).
- Added feature toggle HUD with status indicators.
- Retained all existing functionality (terrain, ocean, lighting, sky, fog).
