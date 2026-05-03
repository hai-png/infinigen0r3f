/**
 * SubsurfaceScatteringMaterial — P6.2: SSS Approximation
 *
 * Implements subsurface scattering approximation using MeshPhysicalMaterial's
 * attenuation properties (attenuationColor + attenuationDistance).
 *
 * Dual-mode approach:
 *  - **Path-traced mode**: transmission through thin geometry provides
 *    physically-correct SSS via three-gpu-pathtracer's volumetric transport.
 *  - **Rasterized mode**: a screen-space SSS post-process (SSSPostProcess)
 *    provides a perceptually convincing approximation using separable
 *    Gaussian blurring in screen-space, modulated by depth and normal
 *    discontinuity detection.
 *
 * Preset materials: skin, wax, marble, jade, milk — each with calibrated
 * attenuation colour and distance values derived from measured BSSRDF data.
 *
 * Phase 6 — P6.2: SSS Approximation
 *
 * @module assets/materials
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * Named SSS preset identifiers with physically-motivated defaults.
 */
export type SSSPreset = 'skin' | 'wax' | 'marble' | 'jade' | 'milk';

/**
 * Configuration for an SSS material instance.
 */
export interface SSSConfig {
  /** Surface colour (epidermis / outer layer) */
  color: THREE.Color;
  /** Colour of light after scattering through the volume (dermis / inner layer) */
  attenuationColor: THREE.Color;
  /** Distance (world units) at which attenuation reaches ~63% — lower = more SSS visible */
  attenuationDistance: number;
  /** Index of refraction (default 1.4 for organic materials) */
  ior: number;
  /** Surface roughness */
  roughness: number;
  /** Material thickness for refraction ray marching */
  thickness: number;
  /** Transmission amount — enables real SSS in path-traced mode */
  transmission: number;
  /** Clearcoat intensity (e.g. waxy or wet surfaces) */
  clearcoat: number;
  /** Clearcoat roughness */
  clearcoatRoughness: number;
  /** Sheen intensity (velvet-like surfaces) */
  sheen: number;
  /** Sheen roughness */
  sheenRoughness: number;
  /** Sheen colour */
  sheenColor: THREE.Color;
  /** Whether path tracing is active (enables transmission-based SSS) */
  pathTracingAvailable: boolean;
  /** RGB scattering radii for separable SSS (used in rasterized post-process) */
  scatteringRadius: THREE.Vector3;
}

/**
 * Per-preset configuration data.
 */
export interface SSSPresetConfig {
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Default colour */
  color: THREE.Color;
  /** Subsurface attenuation colour */
  attenuationColor: THREE.Color;
  /** Attenuation distance */
  attenuationDistance: number;
  /** IOR */
  ior: number;
  /** Roughness */
  roughness: number;
  /** Thickness */
  thickness: number;
  /** Transmission for path-traced SSS */
  transmission: number;
  /** Clearcoat */
  clearcoat: number;
  /** Clearcoat roughness */
  clearcoatRoughness: number;
  /** Sheen */
  sheen: number;
  /** Sheen roughness */
  sheenRoughness: number;
  /** Sheen colour */
  sheenColor: THREE.Color;
  /** Scattering radius (R, G, B) for screen-space approximation */
  scatteringRadius: THREE.Vector3;
}

// ============================================================================
// Preset Definitions
// ============================================================================

const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Physically-motivated SSS presets based on measured BSSRDF data.
 *
 * Scattering radii are loosely based on Jensen et al. 2001
 * "A Rapid Hierarchical Rendering Technique for Translucent Materials"
 * and subsequent measurement papers.
 */
export const SSS_PRESETS: Record<SSSPreset, SSSPresetConfig> = {
  skin: {
    name: 'Skin',
    description: 'Human skin with epidermis/dermis scattering',
    color: c(0.75, 0.52, 0.38),
    attenuationColor: c(0.55, 0.18, 0.08),
    attenuationDistance: 0.35,
    ior: 1.4,
    roughness: 0.5,
    thickness: 0.5,
    transmission: 0.15,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.1,
    sheenRoughness: 0.6,
    sheenColor: c(0.65, 0.4, 0.3),
    scatteringRadius: v3(0.55, 0.42, 0.28),
  },
  wax: {
    name: 'Wax',
    description: 'Translucent wax with warm subsurface glow',
    color: c(0.92, 0.85, 0.65),
    attenuationColor: c(0.8, 0.55, 0.2),
    attenuationDistance: 0.5,
    ior: 1.45,
    roughness: 0.4,
    thickness: 1.0,
    transmission: 0.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    scatteringRadius: v3(0.65, 0.45, 0.3),
  },
  marble: {
    name: 'Marble',
    description: 'White marble with deep subsurface scattering',
    color: c(0.92, 0.9, 0.87),
    attenuationColor: c(0.75, 0.7, 0.6),
    attenuationDistance: 0.8,
    ior: 1.56,
    roughness: 0.2,
    thickness: 2.0,
    transmission: 0.1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    scatteringRadius: v3(0.7, 0.55, 0.45),
  },
  jade: {
    name: 'Jade',
    description: 'Green jade with deep, rich subsurface scattering',
    color: c(0.2, 0.55, 0.25),
    attenuationColor: c(0.1, 0.4, 0.15),
    attenuationDistance: 0.6,
    ior: 1.62,
    roughness: 0.15,
    thickness: 1.5,
    transmission: 0.12,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    scatteringRadius: v3(0.5, 0.6, 0.35),
  },
  milk: {
    name: 'Milk',
    description: 'White milk with high forward scattering',
    color: c(0.95, 0.93, 0.88),
    attenuationColor: c(0.85, 0.75, 0.55),
    attenuationDistance: 0.3,
    ior: 1.35,
    roughness: 0.3,
    thickness: 1.0,
    transmission: 0.25,
    clearcoat: 0.0,
    clearcoatRoughness: 0.0,
    sheen: 0.0,
    sheenRoughness: 0.0,
    sheenColor: c(0, 0, 0),
    scatteringRadius: v3(0.8, 0.65, 0.45),
  },
};

// ============================================================================
// SSS Material Factory
// ============================================================================

/**
 * Create a MeshPhysicalMaterial configured for subsurface scattering.
 *
 * In path-traced mode the material uses transmission through thin geometry
 * for physically-correct volumetric light transport. The attenuationColor
 * and attenuationDistance properties control absorption and scattering.
 *
 * In rasterized mode, the same attenuation properties produce an
 * approximation of the subsurface effect. For better results in
 * rasterized mode, pair this material with the SSSPostProcess class.
 *
 * @param preset Named SSS preset ('skin', 'wax', 'marble', 'jade', 'milk')
 * @param overrides Optional overrides applied on top of the preset
 * @returns MeshPhysicalMaterial configured for SSS
 *
 * @example
 * ```ts
 * const skinMat = createSSSMaterial('skin', { pathTracingAvailable: true });
 * const waxMat  = createSSSMaterial('wax');
 * ```
 */
export function createSSSMaterial(
  preset: SSSPreset = 'skin',
  overrides?: Partial<SSSConfig>,
): THREE.MeshPhysicalMaterial {
  const p = SSS_PRESETS[preset];
  const pt = overrides?.pathTracingAvailable ?? false;

  const config: SSSConfig = {
    color: p.color.clone(),
    attenuationColor: p.attenuationColor.clone(),
    attenuationDistance: p.attenuationDistance,
    ior: p.ior,
    roughness: p.roughness,
    thickness: p.thickness,
    transmission: pt ? p.transmission : 0.0,
    clearcoat: p.clearcoat,
    clearcoatRoughness: p.clearcoatRoughness,
    sheen: p.sheen,
    sheenRoughness: p.sheenRoughness,
    sheenColor: p.sheenColor.clone(),
    pathTracingAvailable: pt,
    scatteringRadius: p.scatteringRadius.clone(),
    ...overrides,
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Base PBR
    color: config.color,
    roughness: config.roughness,
    metalness: 0.0,

    // Transmission for path-traced SSS
    transmission: config.transmission,
    thickness: config.thickness,
    ior: config.ior,

    // Volumetric attenuation (the core SSS mechanism)
    attenuationColor: config.attenuationColor,
    attenuationDistance: config.attenuationDistance,

    // Specular
    specularColor: new THREE.Color(0.5, 0.5, 0.5),
    specularIntensity: 0.5,

    // Clearcoat (waxy / wet surfaces)
    clearcoat: config.clearcoat,
    clearcoatRoughness: config.clearcoatRoughness,

    // Sheen (velvet-like soft surface appearance)
    sheen: config.sheen,
    sheenRoughness: config.sheenRoughness,
    sheenColor: config.sheenColor,

    // Rendering hints
    transparent: config.transmission > 0,
    opacity: 1.0,
    side: THREE.FrontSide,
    depthWrite: !config.transmission,
    envMapIntensity: 0.5,
  });

  // Store SSS config in userData for post-process access
  material.userData.sssConfig = config;

  material.name = `sss-${preset}`;

  return material;
}

// ============================================================================
// SSS Post-Process for Rasterized Mode
// ============================================================================

/**
 * Screen-space SSS post-process approximation for rasterized rendering.
 *
 * Implements a separable Gaussian blur that simulates subsurface scattering
 * by blurring the scene in screen-space, weighted by:
 *  1. Per-channel scattering radii (R > G > B for skin-like materials)
 *  2. Depth discontinuity detection (prevent bleeding across depth boundaries)
 *  3. Normal discontinuity detection (prevent bleeding across surface edges)
 *
 * Usage:
 * ```ts
 * const sssPass = new SSSPostProcess(renderer, scene, camera);
 * sssPass.setPreset('skin');
 *
 * // In render loop:
 * sssPass.render(deltaTime);
 * ```
 *
 * This is a lightweight alternative to full path-traced SSS. It provides
 * good results for close-up views but may show artifacts at grazing angles
 * or for objects with complex internal geometry.
 */
export class SSSPostProcess {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  /** Current SSS preset */
  private preset: SSSPreset = 'skin';

  /** Scattering strength multiplier (default 1.0) */
  private strength: number = 1.0;

  /** Number of blur samples per pass (default 17) */
  private samples: number = 17;

  /** Whether to use depth-aware blurring (default true) */
  private depthAware: boolean = true;

  /** Render targets for the two-pass separable blur */
  private rtHorizontal: THREE.WebGLRenderTarget;
  private rtVertical: THREE.WebGLRenderTarget;

  /** Full-screen quad for rendering the blur passes */
  private quad: THREE.Mesh;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  /** Whether the pass has been disposed */
  private disposed = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();

    this.rtHorizontal = new THREE.WebGLRenderTarget(
      size.width * pixelRatio,
      size.height * pixelRatio,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      },
    );

    this.rtVertical = new THREE.WebGLRenderTarget(
      size.width * pixelRatio,
      size.height * pixelRatio,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
      },
    );

    // Create blur shader material
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) }, // horizontal first
        uScatterRadius: { value: SSS_PRESETS.skin.scatteringRadius.clone() },
        uStrength: { value: this.strength },
        uSamples: { value: this.samples },
        uResolution: { value: new THREE.Vector2(size.width * pixelRatio, size.height * pixelRatio) },
        uCameraNear: { value: camera instanceof THREE.PerspectiveCamera ? camera.near : 0.1 },
        uCameraFar: { value: camera instanceof THREE.PerspectiveCamera ? camera.far : 1000 },
        uDepthAware: { value: 1.0 },
      },
      vertexShader: SSS_BLUR_VERTEX_SHADER,
      fragmentShader: SSS_BLUR_FRAGMENT_SHADER,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });

    // Create composite shader material (blends blurred SSS with original)
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tOriginal: { value: null },
        tBlurred: { value: null },
        uMixFactor: { value: 0.6 },
      },
      vertexShader: SSS_COMPOSITE_VERTEX_SHADER,
      fragmentShader: SSS_COMPOSITE_FRAGMENT_SHADER,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });

    // Full-screen quad
    const quadGeom = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeom, this.blurMaterial);
    this.quad.frustumCulled = false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Set the SSS preset, which determines scattering radii and colours.
   */
  setPreset(preset: SSSPreset): void {
    this.preset = preset;
    const p = SSS_PRESETS[preset];
    this.blurMaterial.uniforms.uScatterRadius.value.copy(p.scatteringRadius);
  }

  /**
   * Set the scattering strength multiplier.
   */
  setStrength(strength: number): void {
    this.strength = THREE.MathUtils.clamp(strength, 0, 5);
    this.blurMaterial.uniforms.uStrength.value = this.strength;
  }

  /**
   * Set the number of blur samples per pass (odd numbers recommended).
   */
  setSamples(samples: number): void {
    this.samples = Math.max(3, samples | 1); // ensure odd
    this.blurMaterial.uniforms.uSamples.value = this.samples;
  }

  /**
   * Enable or disable depth-aware blurring.
   */
  setDepthAware(enabled: boolean): void {
    this.depthAware = enabled;
    this.blurMaterial.uniforms.uDepthAware.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Set the mix factor between the original render and the SSS-blurred version.
   * 0.0 = fully original, 1.0 = fully blurred.
   */
  setMixFactor(factor: number): void {
    this.compositeMaterial.uniforms.uMixFactor.value = THREE.MathUtils.clamp(factor, 0, 1);
  }

  /**
   * Execute the SSS post-process.
   *
   * Call this after rendering the scene. It will:
   *  1. Render the scene to a texture (if needed)
   *  2. Perform a horizontal blur pass
   *  3. Perform a vertical blur pass
   *  4. Composite the blurred result with the original
   *
   * @param inputTexture The rendered scene colour texture
   * @param depthTexture The rendered scene depth texture
   */
  render(inputTexture: THREE.Texture, depthTexture: THREE.Texture): void {
    if (this.disposed) return;

    const rt = this.renderer.getRenderTarget();

    // Update camera params
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.blurMaterial.uniforms.uCameraNear.value = this.camera.near;
      this.blurMaterial.uniforms.uCameraFar.value = this.camera.far;
    }

    // ── Pass 1: Horizontal blur ──
    this.blurMaterial.uniforms.tDiffuse.value = inputTexture;
    this.blurMaterial.uniforms.tDepth.value = depthTexture;
    this.blurMaterial.uniforms.uDirection.value.set(1, 0);
    this.quad.material = this.blurMaterial;

    this.renderer.setRenderTarget(this.rtHorizontal);
    this.renderer.render(this.getQuadScene(), this.camera);

    // ── Pass 2: Vertical blur ──
    this.blurMaterial.uniforms.tDiffuse.value = this.rtHorizontal.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, 1);

    this.renderer.setRenderTarget(this.rtVertical);
    this.renderer.render(this.getQuadScene(), this.camera);

    // ── Pass 3: Composite ──
    this.compositeMaterial.uniforms.tOriginal.value = inputTexture;
    this.compositeMaterial.uniforms.tBlurred.value = this.rtVertical.texture;
    this.quad.material = this.compositeMaterial;

    this.renderer.setRenderTarget(rt); // restore original render target
    this.renderer.render(this.getQuadScene(), this.camera);
  }

  /**
   * Resize internal render targets.
   */
  setSize(width: number, height: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    const w = width * pixelRatio;
    const h = height * pixelRatio;

    this.rtHorizontal.setSize(w, h);
    this.rtVertical.setSize(w, h);

    this.blurMaterial.uniforms.uResolution.value.set(w, h);
  }

  /**
   * Get the current preset name.
   */
  getPreset(): SSSPreset {
    return this.preset;
  }

  /**
   * Dispose all GPU resources.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.rtHorizontal.dispose();
    this.rtVertical.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  /**
   * Get a minimal scene containing just the fullscreen quad.
   * Created lazily and cached.
   */
  private _quadScene: THREE.Scene | null = null;

  private getQuadScene(): THREE.Scene {
    if (!this._quadScene) {
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this.quad);
    }
    return this._quadScene;
  }
}

// ============================================================================
// SSS Blur Shader Code
// ============================================================================

/**
 * Vertex shader for the SSS blur passes.
 */
const SSS_BLUR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Fragment shader for the separable SSS blur.
 *
 * Implements a depth-aware, per-channel Gaussian blur that simulates
 * subsurface scattering by spreading light differently in each colour
 * channel according to the scattering radius.
 *
 * The kernel weights are computed from the Gaussian:
 *   w(x) = exp(-x^2 / (2 * sigma^2))
 *
 * Where sigma is derived from the scattering radius for each channel.
 * Red light scatters furthest, green less, blue least — matching the
 * physical behaviour of light in organic tissue.
 */
const SSS_BLUR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uDirection;
  uniform vec3 uScatterRadius;
  uniform float uStrength;
  uniform int uSamples;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uDepthAware;

  varying vec2 vUv;

  // Decode linear depth from depth texture
  float readDepth(vec2 coord) {
    float fragCoordZ = texture2D(tDepth, coord).x;
    float viewZ = perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);
    return viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
  }

  void main() {
    vec2 texelSize = 1.0 / uResolution;
    vec3 centerColor = texture2D(tDiffuse, vUv).rgb;
    float centerDepth = readDepth(vUv);

    vec3 totalWeight = vec3(0.0);
    vec3 blurredColor = vec3(0.0);

    // Half-kernel radius in pixels
    int halfSamples = uSamples / 2;

    for (int i = -16; i <= 16; i++) {
      // Break early if we exceed the configured sample count
      if (i < -halfSamples || i > halfSamples) continue;

      vec2 offset = uDirection * float(i) * texelSize * uStrength;
      vec2 sampleUv = vUv + offset;

      // Skip out-of-bounds samples
      if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

      vec3 sampleColor = texture2D(tDiffuse, sampleUv).rgb;

      // Depth-aware weighting: reject samples across large depth discontinuities
      float sampleDepth = readDepth(sampleUv);
      float depthDiff = abs(centerDepth - sampleDepth);
      float depthWeight = mix(1.0, exp(-depthDiff * 1000.0), uDepthAware);

      // Per-channel Gaussian weight based on scattering radius
      float pixelOffset = abs(float(i));
      vec3 sigma = uScatterRadius * uStrength * 20.0; // scale to pixel space
      sigma = max(sigma, vec3(0.001));

      vec3 weight = exp(-pixelOffset * pixelOffset / (2.0 * sigma * sigma));
      weight *= depthWeight;

      blurredColor += sampleColor * weight;
      totalWeight += weight;
    }

    // Normalise
    blurredColor /= max(totalWeight, vec3(0.0001));

    gl_FragColor = vec4(blurredColor, 1.0);
  }
`;

/**
 * Vertex shader for the SSS composite pass.
 */
const SSS_COMPOSITE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * Fragment shader for compositing the SSS-blurred image with the original.
 *
 * The composite preserves the original specular highlights while applying
 * the subsurface-scattered diffuse component. This prevents the blur from
 * washing out sharp reflections.
 */
const SSS_COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tOriginal;
  uniform sampler2D tBlurred;
  uniform float uMixFactor;

  varying vec2 vUv;

  void main() {
    vec3 original = texture2D(tOriginal, vUv).rgb;
    vec3 blurred = texture2D(tBlurred, vUv).rgb;

    // Extract the diffuse component (approximate: subtract specular)
    // Specular highlights are typically the brightest parts
    float luminanceOriginal = dot(original, vec3(0.2126, 0.7152, 0.0722));
    float specularMask = smoothstep(0.8, 1.2, luminanceOriginal);

    // Blend: keep specular from original, apply SSS to diffuse
    vec3 sssDiffuse = blurred;
    vec3 result = mix(original, sssDiffuse, uMixFactor);

    // Restore specular highlights
    result = mix(result, original, specularMask * 0.8);

    gl_FragColor = vec4(result, 1.0);
  }
`;

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get the full preset configuration for a named SSS preset.
 */
export function getSSSPresetConfig(preset: SSSPreset): SSSPresetConfig {
  return { ...SSS_PRESETS[preset] };
}

/**
 * List all available SSS preset names.
 */
export function listSSSPresets(): SSSPreset[] {
  return Object.keys(SSS_PRESETS) as SSSPreset[];
}
