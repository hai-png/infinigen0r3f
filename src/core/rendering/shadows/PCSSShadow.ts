/**
 * PCSSShadow — Percentage-Closer Soft Shadows
 *
 * Implements PCSS (Percentage-Closer Soft Shadows) to replace Three.js's
 * default hard / fixed-PCF shadow mapping with physically-motivated soft shadows
 * whose penumbra width varies with the distance from the occluder to the receiver.
 *
 * Algorithm (three passes):
 *   1. **Blocker Search**  — Find the average depth of occluders in a search area
 *      proportional to the light size.
 *   2. **Penumbra Estimation** — Compute the penumbra ratio from the blocker depth
 *      and receiver depth:  `w_penumbra = (d_receiver - d_blocker) * w_light / d_blocker`
 *   3. **Adaptive PCF** — Filter the shadow comparison with a kernel whose radius
 *      is the estimated penumbra width.
 *
 * Usage:
 *   const pcss = new PCSSShadow();
 *   pcss.applyToLight(directionalLight);
 *   // In the render loop:
 *   pcss.update(camera);
 *
 * @module rendering/shadows
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PCSSConfig {
  /** Apparent light size (world units) — larger = softer shadows (default 0.01) */
  lightSize: number;
  /** Number of samples for the blocker search step (default 16) */
  blockerSearchSamples: number;
  /** Number of samples for the PCF filter step (default 32) */
  pcfSamples: number;
  /** Maximum search width in shadow-map texels (default 20) */
  maxSearchWidth: number;
}

const DEFAULT_PCSS_CONFIG: PCSSConfig = {
  lightSize: 0.01,
  blockerSearchSamples: 16,
  pcfSamples: 32,
  maxSearchWidth: 20,
};

// ---------------------------------------------------------------------------
// Shadow-map shaders
// ---------------------------------------------------------------------------

/**
 * Vertex shader for shadow-map generation — same as Three.js built-in,
 * included for clarity when using a custom depth material.
 */
const SHADOW_VERTEX_SHADER = /* glsl */ `
#ifdef USE_SKINNING
  #error "Skinned mesh PCSS shadow is not yet supported"
#endif

varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  // Encode linear depth in R
  float depth = gl_FragCoord.z;
  gl_FragColor = vec4(vec3(depth), 1.0);
}
`;

// ---------------------------------------------------------------------------
// PCSS receiver shaders
// ---------------------------------------------------------------------------

const PCSS_VERTEX_SHADER = /* glsl */ `
varying vec4 vShadowCoord;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main() {
  vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vShadowCoord = shadowMatrix * vec4(vWorldPos, 1.0);
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PCSS_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D uShadowMap;
uniform vec3  uLightPos;
uniform float uLightSize;
uniform float uLightNear;
uniform float uLightFar;
uniform int   uBlockerSamples;
uniform int   uPCFSamples;
uniform float uMaxSearchWidth;
uniform vec3  uShadowColor;
uniform float uShadowOpacity;

varying vec4 vShadowCoord;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

// --- Poisson disk samples (32 pre-computed) --------------------------------

const vec2 POISSON[32] = vec2[32](
  vec2(-0.94201624,  -0.39906216), vec2( 0.94558609,  -0.76890725),
  vec2(-0.094184101, -0.92938870), vec2( 0.34495938,   0.29387760),
  vec2(-0.91588581,   0.45771432), vec2(-0.81544232,  -0.87912464),
  vec2(-0.38277543,   0.27676845), vec2( 0.97484398,   0.75648379),
  vec2( 0.44323325,  -0.97511554), vec2( 0.53742981,  -0.47373420),
  vec2(-0.26496911,  -0.41893023), vec2( 0.79197514,   0.19090188),
  vec2(-0.24188840,   0.99706507), vec2(-0.81409955,   0.91437590),
  vec2( 0.19984126,   0.78641367), vec2( 0.14383161,  -0.14100790),
  vec2(-0.56636168,  -0.73580498), vec2(-0.71509921,   0.78263074),
  vec2( 0.69850490,   0.82665320), vec2( 0.70567570,  -0.25803460),
  vec2(-0.53624140,   0.33890450), vec2( 0.07500260,  -0.61202670),
  vec2(-0.97002800,   0.04264480), vec2(-0.41095050,   0.55053820),
  vec2( 0.36172630,   0.51777940), vec2(-0.04054020,   0.61924490),
  vec2( 0.61402650,  -0.61005300), vec2(-0.69384410,  -0.27801430),
  vec2( 0.30264530,  -0.87139480), vec2(-0.38980690,   0.86852890),
  vec2(-0.59034260,  -0.09532980), vec2( 0.09973420,   0.43640560)
);

// --- Blocker search --------------------------------------------------------

float findBlockerDepth(sampler2D shadowMap, vec2 uv, float zReceiver, float searchWidth) {
  float blockerSum   = 0.0;
  int   blockerCount = 0;

  for (int i = 0; i < 32; i++) {
    if (i >= uBlockerSamples) break;

    vec2 offset = POISSON[i] * searchWidth;
    vec2 sampleUV = uv + offset;

    float zShadow = texture2D(shadowMap, sampleUV).r;

    if (zShadow < zReceiver - 0.001) {
      blockerSum += zShadow;
      blockerCount++;
    }
  }

  if (blockerCount == 0) return -1.0; // no blockers
  return blockerSum / float(blockerCount);
}

// --- PCF filtering ---------------------------------------------------------

float pcfFilter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius) {
  float shadow = 0.0;

  for (int i = 0; i < 32; i++) {
    if (i >= uPCFSamples) break;

    vec2 offset    = POISSON[i] * filterRadius;
    vec2 sampleUV  = uv + offset;
    float zShadow  = texture2D(shadowMap, sampleUV).r;

    shadow += step(zReceiver - 0.001, zShadow);
  }

  return shadow / float(uPCFSamples);
}

// --- Main ------------------------------------------------------------------

void main() {
  vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w;

  // Outside shadow frustum → fully lit
  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
      shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
      shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }

  float zReceiver = shadowCoord.z;

  // Shadow-map texel size
  vec2 shadowSize = vec2(textureSize(uShadowMap, 0));
  vec2 texelSize  = 1.0 / shadowSize;

  // --- Step 1: Blocker search ----------------------------------------------

  // The search area is proportional to the light size in shadow-map texels.
  float searchWidth = uLightSize * (zReceiver - uLightNear) / zReceiver;
  searchWidth = min(searchWidth, uMaxSearchWidth * texelSize.x);

  float avgBlockerDepth = findBlockerDepth(uShadowMap, shadowCoord.xy, zReceiver, searchWidth);

  // No blockers → fully lit
  if (avgBlockerDepth < 0.0) {
    gl_FragColor = vec4(1.0);
    return;
  }

  // --- Step 2: Penumbra estimation -----------------------------------------

  float penumbraWidth = (zReceiver - avgBlockerDepth) * uLightSize / avgBlockerDepth;
  float filterRadius  = penumbraWidth;

  // Clamp filter radius for performance
  filterRadius = min(filterRadius, uMaxSearchWidth * texelSize.x);
  filterRadius = max(filterRadius, texelSize.x); // at least 1 texel

  // --- Step 3: Adaptive PCF ------------------------------------------------

  float visibility = pcfFilter(uShadowMap, shadowCoord.xy, zReceiver, filterRadius);

  // Apply shadow colour and opacity
  float shadowFactor = mix(1.0 - uShadowOpacity, 1.0, visibility);
  shadowFactor = mix(shadowFactor, 1.0, 0.0); // placeholder for distance fade

  gl_FragColor = vec4(vec3(shadowFactor), 1.0);
}
`;

// ---------------------------------------------------------------------------
// PCSSShadow
// ---------------------------------------------------------------------------

export class PCSSShadow {
  readonly config: PCSSConfig;

  /** Custom depth material used for the shadow-map render pass. */
  readonly depthMaterial: THREE.ShaderMaterial;

  /** Custom shadow-receiving material (for debug / manual rendering). */
  readonly receiverMaterial: THREE.ShaderMaterial;

  /** The directional light this PCSS instance is attached to. */
  private light: THREE.DirectionalLight | null = null;

  /** Shadow camera used for the shadow map. */
  private shadowCamera: THREE.OrthographicCamera;

  /** Shadow map render target. */
  private shadowTarget: THREE.WebGLRenderTarget;

  /** Shadow matrix: world → shadow-UV. */
  private shadowMatrix: THREE.Matrix4 = new THREE.Matrix4();

  constructor(config: Partial<PCSSConfig> = {}) {
    this.config = { ...DEFAULT_PCSS_CONFIG, ...config };

    // Shadow camera (defaults, will be overwritten in applyToLight)
    this.shadowCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 100);

    // Shadow map render target
    const shadowMapSize = 2048;
    this.shadowTarget = new THREE.WebGLRenderTarget(shadowMapSize, shadowMapSize, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });

    // Depth material for shadow-map generation
    this.depthMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader:   SHADOW_VERTEX_SHADER,
      fragmentShader: SHADOW_FRAGMENT_SHADER,
      side: THREE.FrontSide,
    });

    // Receiver material
    this.receiverMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uShadowMap:         { value: null },
        shadowMatrix:       { value: new THREE.Matrix4() },
        uLightPos:          { value: new THREE.Vector3() },
        uLightSize:         { value: this.config.lightSize },
        uLightNear:         { value: 0.5 },
        uLightFar:          { value: 100.0 },
        uBlockerSamples:    { value: this.config.blockerSearchSamples },
        uPCFSamples:        { value: this.config.pcfSamples },
        uMaxSearchWidth:    { value: this.config.maxSearchWidth },
        uShadowColor:       { value: new THREE.Color(0x000000) },
        uShadowOpacity:     { value: 0.6 },
      },
      vertexShader:   PCSS_VERTEX_SHADER,
      fragmentShader: PCSS_FRAGMENT_SHADER,
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Configure a directional light to use PCSS shadows.
   *
   * This replaces the light's default shadow settings with PCSS-compatible
   * parameters and stores a reference for the update loop.
   */
  applyToLight(light: THREE.DirectionalLight): void {
    this.light = light;

    // Enable shadows on the light
    light.castShadow = true;

    // Configure Three.js shadow map basics
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far  = 100;
    light.shadow.camera.left   = -20;
    light.shadow.camera.right  =  20;
    light.shadow.camera.top    =  20;
    light.shadow.camera.bottom = -20;
    light.shadow.bias = -0.001;
    light.shadow.normalBias = 0.02;

    // Use the custom shadow camera from the light
    this.shadowCamera = light.shadow.camera as THREE.OrthographicCamera;

    // Synchronise receiver uniforms
    this.receiverMaterial.uniforms.uLightNear.value = light.shadow.camera.near;
    this.receiverMaterial.uniforms.uLightFar.value  = light.shadow.camera.far;
    this.receiverMaterial.uniforms.uLightPos.value.copy(light.position);
  }

  /**
   * Update shadow camera matrices and re-render the shadow map.
   *
   * Call this once per frame before the main render pass.
   */
  update(camera: THREE.Camera, renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.light) return;

    // Ensure the shadow camera is up to date
    this.light.shadow.updateMatrices(this.light);
    this.shadowCamera = this.light.shadow.camera as THREE.OrthographicCamera;

    // Compute shadow matrix:  scale-bias * projection * view
    this.shadowMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.shadowMatrix.multiply(this.shadowCamera.projectionMatrix);
    this.shadowMatrix.multiply(this.shadowCamera.matrixWorldInverse);

    // Update receiver uniforms
    this.receiverMaterial.uniforms.shadowMatrix.value.copy(this.shadowMatrix);
    this.receiverMaterial.uniforms.uLightPos.value.copy(this.light.position);
    this.receiverMaterial.uniforms.uLightSize.value   = this.config.lightSize;
    this.receiverMaterial.uniforms.uBlockerSamples.value = this.config.blockerSearchSamples;
    this.receiverMaterial.uniforms.uPCFSamples.value     = this.config.pcfSamples;
    this.receiverMaterial.uniforms.uMaxSearchWidth.value  = this.config.maxSearchWidth;

    // Render the shadow map using our custom depth material
    renderer.setRenderTarget(this.shadowTarget);
    renderer.clear();

    // Override materials in the scene to render depth only
    const overrideMaterial = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMaterial;

    renderer.render(scene, this.shadowCamera);

    // Restore
    scene.overrideMaterial = overrideMaterial;
    renderer.setRenderTarget(null);

    // Feed the rendered shadow map to the receiver material
    this.receiverMaterial.uniforms.uShadowMap.value = this.shadowTarget.texture;
  }

  /**
   * Update config at runtime.
   */
  setConfig(partial: Partial<PCSSConfig>): void {
    Object.assign(this.config, partial);
    this.receiverMaterial.uniforms.uLightSize.value        = this.config.lightSize;
    this.receiverMaterial.uniforms.uBlockerSamples.value    = this.config.blockerSearchSamples;
    this.receiverMaterial.uniforms.uPCFSamples.value        = this.config.pcfSamples;
    this.receiverMaterial.uniforms.uMaxSearchWidth.value    = this.config.maxSearchWidth;
  }

  /**
   * Get the shadow map texture (e.g. for custom shaders).
   */
  getShadowMap(): THREE.Texture {
    return this.shadowTarget.texture;
  }

  /**
   * Get the shadow matrix (world → shadow-UV).
   */
  getShadowMatrix(): THREE.Matrix4 {
    return this.shadowMatrix;
  }

  /** Release GPU resources. */
  dispose(): void {
    this.shadowTarget.dispose();
    this.depthMaterial.dispose();
    this.receiverMaterial.dispose();
  }
}

export default PCSSShadow;
