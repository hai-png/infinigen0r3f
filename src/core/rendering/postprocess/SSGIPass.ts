/**
 * SSGIPass — Screen-Space Global Illumination
 *
 * Approximates indirect lighting (one-bounce diffuse GI) entirely in screen space.
 * Uses a two-pass approach:
 *   Pass 1: Compute SSGI at half resolution with hemisphere ray marching
 *   Pass 2: Bilateral blur reading from the SSGI texture (not reusing own pixel)
 *   Pass 3: Composite onto the original frame
 *
 * Algorithm:
 *   1. Reconstruct world position from the depth buffer + inverse view-projection
 *   2. For each pixel, generate hemisphere-aligned sample rays using golden-angle distribution
 *   3. March each ray through the depth buffer; if a hit is found,
 *      sample the colour buffer at the hit location as indirect radiance
 *   4. Accumulate weighted radiance using Lambert cosine weighting
 *   5. Apply edge-preserving bilateral blur that reads from the SSGI result texture
 *   6. Blend result with the input frame
 *
 * References:
 *   - "Real-Time Global Illumination using Screen-Space Ray Tracing", McGuire et al.
 *   - "Stochastic Screen-Space Reflections", Stachowiak et al.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SSGIConfig {
  /** World-space radius for ray march (default 2.0) */
  radius: number;
  /** Global intensity multiplier (default 0.5) */
  intensity: number;
  /** Number of hemisphere rays per pixel (default 8) */
  samples: number;
  /** Maximum geometry thickness for occlusion (default 0.5) */
  thickness: number;
  /** Resolution scale relative to the framebuffer (default 0.5 = half-res) */
  resolution: number;
  /** Bilateral blur sharpness — higher preserves edges more (default 10.0) */
  blurSharpness: number;
}

const DEFAULT_SSGI_CONFIG: SSGIConfig = {
  radius: 2.0,
  intensity: 0.5,
  samples: 8,
  thickness: 0.5,
  resolution: 0.5,
  blurSharpness: 10.0,
};

// ---------------------------------------------------------------------------
// Fullscreen quad geometry (shared)
// ---------------------------------------------------------------------------

const _quadGeom = new THREE.PlaneGeometry(2, 2);

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const SSGI_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SSGI_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;    // input colour buffer
uniform sampler2D tDepth;      // depth buffer
uniform sampler2D tNormal;     // world-space normals (RGB, normalised)
uniform mat4 uInvViewProj;     // inverse view-projection
uniform mat4 uView;            // view matrix
uniform vec3 uCameraPos;       // camera world position
uniform mat4 uProjection;      // camera projection matrix
uniform vec2 uResolution;      // full-resolution pixel dimensions
uniform float uRadius;
uniform float uThickness;
uniform int   uSamples;
uniform float uFrameSeed;      // per-frame jitter seed

varying vec2 vUv;

// ---- utilities -----------------------------------------------------------

// Reconstruct world position from depth + inverse VP
vec3 reconstructWorldPos(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 worldPos = uInvViewProj * clipPos;
  return worldPos.xyz / worldPos.w;
}

// Sample depth
float sampleDepth(vec2 uv) {
  return texture2D(tDepth, uv).r;
}

// Sample world-space normal
vec3 sampleNormal(vec2 uv) {
  return normalize(texture2D(tNormal, uv).rgb * 2.0 - 1.0);
}

// Tangent frame from normal (Frisvad)
void buildFrame(vec3 n, out vec3 tangent, out vec3 bitangent) {
  if (n.z < -0.9999999) {
    tangent  = vec3(0.0, -1.0, 0.0);
    bitangent = vec3(-1.0, 0.0, 0.0);
  } else {
    float a = 1.0 / (1.0 + n.z);
    float b = -n.x * n.y * a;
    tangent  = vec3(1.0 - n.x * n.x * a, b, -n.x);
    bitangent = vec3(b, 1.0 - n.y * n.y * a, -n.y);
  }
}

// Interleaved gradient noise for jittering
vec2 interleavedGradientNoise(vec2 screenPos) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  float n1 = fract(magic.z * fract(dot(screenPos, magic.xy)));
  float n2 = fract(dot(screenPos, vec2(0.00583715, 0.06711056)) + uFrameSeed * 1.7);
  return vec2(n1, n2);
}

// Golden angle in radians
#define GOLDEN_ANGLE 2.39996323

// ---- SSGI core -----------------------------------------------------------

vec3 traceScreenSpaceRay(vec3 rayOrigin, vec3 rayDir, vec2 screenSize) {
  const int MAX_STEPS = 32;
  float stepSize = uRadius / float(MAX_STEPS);

  vec3 pos = rayOrigin;

  for (int i = 0; i < MAX_STEPS; i++) {
    pos += rayDir * stepSize;

    // Project to clip space
    vec4 viewPos = uView * vec4(pos, 1.0);
    vec4 projPos = uProjection * viewPos;
    vec2 screenUV = projPos.xy / projPos.w * 0.5 + 0.5;

    // Out of screen -> miss
    if (screenUV.x < 0.0 || screenUV.x > 1.0 || screenUV.y < 0.0 || screenUV.y > 1.0) {
      break;
    }

    float sceneDepth = sampleDepth(screenUV);
    vec3 scenePos = reconstructWorldPos(screenUV, sceneDepth);

    // View-space depth comparison
    float rayViewZ = -(uView * vec4(pos, 1.0)).z;
    float sceneViewZ = -(uView * vec4(scenePos, 1.0)).z;
    float depthDiff = rayViewZ - sceneViewZ;

    // Hit: ray is behind the scene surface but within thickness
    if (depthDiff > 0.0 && depthDiff < uThickness) {
      // Sample colour as indirect lighting
      vec3 hitColor = texture2D(tDiffuse, screenUV).rgb;
      float falloff = 1.0 - (float(i) / float(MAX_STEPS));
      // Distance attenuation
      float dist = length(scenePos - rayOrigin);
      float distAtten = 1.0 / (1.0 + dist * dist * 0.1);
      return hitColor * falloff * distAtten;
    }
  }

  return vec3(0.0);
}

// ---- main ----------------------------------------------------------------

void main() {
  vec2 uv = vUv;
  float depth = sampleDepth(uv);

  // Sky / far plane -> no GI
  if (depth >= 1.0 || depth <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 worldPos = reconstructWorldPos(uv, depth);
  vec3 normal   = sampleNormal(uv);

  // Build tangent frame
  vec3 tangent, bitangent;
  buildFrame(normal, tangent, bitangent);

  // Jitter
  vec2 noise = interleavedGradientNoise(gl_FragCoord.xy);

  vec3 indirectLight = vec3(0.0);
  float totalWeight  = 0.0;

  for (int s = 0; s < 16; s++) {
    if (s >= uSamples) break;

    // Golden-angle hemisphere sampling
    // phi rotates by golden angle each sample for optimal distribution
    float xi1 = fract(float(s) * GOLDEN_ANGLE / (2.0 * 3.14159265) + noise.x);
    float xi2 = fract(float(s) * 0.618033988749895 + noise.y);

    float phi   = float(s) * GOLDEN_ANGLE + noise.x * 6.28318530;
    float cosTheta = sqrt(1.0 - xi2);
    float sinTheta = sqrt(xi2);

    // Hemisphere direction in tangent space -> world space
    vec3 localDir = vec3(
      sinTheta * cos(phi),
      sinTheta * sin(phi),
      cosTheta
    );
    vec3 rayDir = normalize(tangent * localDir.x + bitangent * localDir.y + normal * localDir.z);

    // Trace in screen space
    vec3 hitRadiance = traceScreenSpaceRay(worldPos + normal * 0.02, rayDir, uResolution);

    // Lambert-weighted accumulation
    float NdotL = max(dot(normal, rayDir), 0.0);
    indirectLight += hitRadiance * NdotL;
    totalWeight  += NdotL;
  }

  if (totalWeight > 0.0) {
    indirectLight /= totalWeight;
  }

  gl_FragColor = vec4(indirectLight, 1.0);
}
`;

// Bilateral blur: reads from the SSGI result texture, properly sampling neighbors
const BLUR_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLUR_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tSSGI;        // SSGI result to blur
uniform sampler2D tDepth;       // depth for edge-preserving weights
uniform sampler2D tNormal;      // normals for edge-preserving weights
uniform vec2  uResolution;
uniform float uSharpness;

varying vec2 vUv;

vec3 sampleNormal(vec2 uv) {
  return normalize(texture2D(tNormal, uv).rgb * 2.0 - 1.0);
}

void main() {
  float centerDepth = texture2D(tDepth, vUv).r;
  vec3  centerNormal = sampleNormal(vUv);
  vec3  centerSSGI   = texture2D(tSSGI, vUv).rgb;

  vec3  blurred  = vec3(0.0);
  float weightSum = 0.0;

  const int RADIUS = 2; // 5x5 kernel

  for (int y = -RADIUS; y <= RADIUS; y++) {
    for (int x = -RADIUS; x <= RADIUS; x++) {
      vec2 offset   = vec2(float(x), float(y)) / uResolution;
      vec2 sampleUV = vUv + offset;

      float sampleDepth  = texture2D(tDepth, sampleUV).r;
      vec3  sampleNormal = sampleNormal(sampleUV);
      vec3  sampleSSGI   = texture2D(tSSGI, sampleUV).rgb;

      // Edge-preserving weights
      float depthW  = exp(-abs(sampleDepth - centerDepth) * uSharpness * 100.0);
      float normalW = pow(max(dot(sampleNormal, centerNormal), 0.0), 8.0);

      // Spatial Gaussian
      float spatialW = exp(-float(x * x + y * y) / (2.0 * float(RADIUS * RADIUS)));

      float w = depthW * normalW * spatialW;

      blurred  += sampleSSGI * w;
      weightSum += w;
    }
  }

  blurred = weightSum > 0.0 ? blurred / weightSum : centerSSGI;

  gl_FragColor = vec4(blurred, 1.0);
}
`;

// Composite vertex shader (passthrough)
const COMPOSITE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Composite fragment: add SSGI on top of the original frame
const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tSSGI;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 ssgi = texture2D(tSSGI, vUv).rgb;

  vec3 result = base + ssgi * uIntensity;

  gl_FragColor = vec4(result, 1.0);
}
`;

// ---------------------------------------------------------------------------
// SSGIPass
// ---------------------------------------------------------------------------

export class SSGIPass {
  readonly config: SSGIConfig;

  // Render targets
  private ssgiRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private compositeRT: THREE.WebGLRenderTarget;

  // Materials
  private ssgiMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  // Fullscreen mesh
  private quad: THREE.Mesh;

  // Scene / camera used for projection matrices
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  // Frame counter for temporal jitter
  private frameIndex: number = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: Partial<SSGIConfig> = {},
  ) {
    this.config = { ...DEFAULT_SSGI_CONFIG, ...config };
    this.scene = scene;
    this.camera = camera;

    const resScale = this.config.resolution;
    const size = renderer.getSize(new THREE.Vector2());
    const w = Math.max(1, Math.floor(size.x * resScale));
    const h = Math.max(1, Math.floor(size.y * resScale));

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    // SSGI render target (half-res)
    this.ssgiRT = new THREE.WebGLRenderTarget(w, h, rtOpts);

    // Blur target (same res as SSGI)
    this.blurRT = new THREE.WebGLRenderTarget(w, h, rtOpts);

    // Composite target (full-res)
    this.compositeRT = new THREE.WebGLRenderTarget(size.x, size.y, rtOpts);

    // SSGI shader material
    this.ssgiMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:    { value: null },
        tDepth:      { value: null },
        tNormal:     { value: null },
        uInvViewProj:{ value: new THREE.Matrix4() },
        uProjection: { value: new THREE.Matrix4() },
        uView:       { value: new THREE.Matrix4() },
        uCameraPos:  { value: new THREE.Vector3() },
        uResolution: { value: new THREE.Vector2(w, h) },
        uRadius:     { value: this.config.radius },
        uThickness:  { value: this.config.thickness },
        uSamples:    { value: this.config.samples },
        uFrameSeed:  { value: 0.0 },
      },
      vertexShader: SSGI_VERTEX_SHADER,
      fragmentShader: SSGI_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Blur material
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tSSGI:       { value: null },
        tDepth:      { value: null },
        tNormal:     { value: null },
        uResolution: { value: new THREE.Vector2(w, h) },
        uSharpness:  { value: this.config.blurSharpness },
      },
      vertexShader: BLUR_VERTEX_SHADER,
      fragmentShader: BLUR_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Composite shader material
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:   { value: null },
        tSSGI:      { value: null },
        uIntensity: { value: this.config.intensity },
      },
      vertexShader: COMPOSITE_VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Fullscreen quad
    this.quad = new THREE.Mesh(_quadGeom, this.ssgiMaterial);
    this.quad.frustumCulled = false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Render the SSGI pass.
   *
   * @param renderer  The WebGL renderer
   * @param writeBuffer  Target to write the final composited result
   * @param readBuffer   Source that contains the scene colour + depth
   */
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.frameIndex++;

    // Update projection uniforms
    const viewMatrix = this.camera.matrixWorldInverse.clone();
    const projMatrix = (this.camera as THREE.PerspectiveCamera).projectionMatrix.clone();
    const invViewProj = new THREE.Matrix4().multiplyMatrices(projMatrix, viewMatrix).invert();

    this.ssgiMaterial.uniforms.uProjection.value.copy(projMatrix);
    this.ssgiMaterial.uniforms.uInvViewProj.value.copy(invViewProj);
    this.ssgiMaterial.uniforms.uView.value.copy(viewMatrix);
    this.ssgiMaterial.uniforms.uCameraPos.value.copy(this.camera.position);
    this.ssgiMaterial.uniforms.uFrameSeed.value = (this.frameIndex % 256) / 256.0;

    // Bind input textures
    this.ssgiMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    // Depth is expected in a separate texture
    const depthTex = (readBuffer as unknown as Record<string, unknown>).depthTexture as THREE.Texture | null;
    if (depthTex) {
      this.ssgiMaterial.uniforms.tDepth.value = depthTex;
      this.blurMaterial.uniforms.tDepth.value = depthTex;
    }

    // --- Pass 1: compute SSGI at half resolution ---
    this.quad.material = this.ssgiMaterial;
    renderer.setRenderTarget(this.ssgiRT);
    renderer.render(this.getQuadScene(), this.camera);

    // --- Pass 2: bilateral blur (reads from SSGI texture) ---
    this.blurMaterial.uniforms.tSSGI.value = this.ssgiRT.texture;
    this.blurMaterial.uniforms.tNormal.value = this.ssgiMaterial.uniforms.tNormal.value;
    this.quad.material = this.blurMaterial;
    renderer.setRenderTarget(this.blurRT);
    renderer.render(this.getQuadScene(), this.camera);

    // --- Pass 3: composite SSGI over original frame at full resolution ---
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tSSGI.value = this.blurRT.texture;
    this.compositeMaterial.uniforms.uIntensity.value = this.config.intensity;

    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(writeBuffer);
    renderer.render(this.getQuadScene(), this.camera);
  }

  /**
   * Set an external normal buffer texture (e.g. from a G-buffer pass).
   */
  setNormalTexture(texture: THREE.Texture): void {
    this.ssgiMaterial.uniforms.tNormal.value = texture;
  }

  /**
   * Set an external depth texture (overrides readBuffer.depthTexture).
   */
  setDepthTexture(texture: THREE.Texture): void {
    this.ssgiMaterial.uniforms.tDepth.value = texture;
    this.blurMaterial.uniforms.tDepth.value = texture;
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<SSGIConfig>): void {
    Object.assign(this.config, partial);

    this.ssgiMaterial.uniforms.uRadius.value     = this.config.radius;
    this.ssgiMaterial.uniforms.uThickness.value   = this.config.thickness;
    this.ssgiMaterial.uniforms.uSamples.value     = this.config.samples;
    this.compositeMaterial.uniforms.uIntensity.value = this.config.intensity;
    this.blurMaterial.uniforms.uSharpness.value   = this.config.blurSharpness;

    // Resize render targets if resolution changed
    if (partial.resolution !== undefined) {
      this.resize(this.ssgiRT, this.config.resolution);
      this.resize(this.blurRT, this.config.resolution);
    }
  }

  /**
   * Resize internal render targets to match a new canvas size.
   */
  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width * this.config.resolution));
    const h = Math.max(1, Math.floor(height * this.config.resolution));

    this.ssgiRT.setSize(w, h);
    this.blurRT.setSize(w, h);
    this.compositeRT.setSize(width, height);

    this.ssgiMaterial.uniforms.uResolution.value.set(w, h);
    this.blurMaterial.uniforms.uResolution.value.set(w, h);
  }

  /** Release GPU resources. */
  dispose(): void {
    this.ssgiRT.dispose();
    this.blurRT.dispose();
    this.compositeRT.dispose();
    this.ssgiMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    _quadGeom.dispose();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private _quadScene: THREE.Scene | null = null;

  /** Lazily create a minimal scene containing just the fullscreen quad. */
  private getQuadScene(): THREE.Scene {
    if (!this._quadScene) {
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this.quad);
    }
    return this._quadScene;
  }

  private resize(rt: THREE.WebGLRenderTarget, scale: number): void {
    const width = rt.width;
    const height = rt.height;
    rt.setSize(
      Math.max(1, Math.floor(width * scale)),
      Math.max(1, Math.floor(height * scale)),
    );
  }
}

export default SSGIPass;
