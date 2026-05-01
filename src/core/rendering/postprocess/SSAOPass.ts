/**
 * SSAOPass — Screen-Space Ambient Occlusion
 *
 * Simple SSAO using hemisphere sampling around each pixel.
 * Works with depth + normal buffers to compute an occlusion factor
 * that darkens creases, corners and contact areas.
 *
 * Algorithm (Scalable Ambient Obscurance, McGuire et al.):
 *   1. Reconstruct view-space position from depth
 *   2. For each pixel, sample the hemisphere oriented along the surface normal
 *   3. Compare sample depth against depth buffer to estimate occlusion
 *   4. Apply edge-aware bilateral blur for smoothness
 *   5. Composite: multiply the scene colour by (1 - ao)
 *
 * @module rendering/postprocess
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SSAOConfig {
  /** Sampling radius in view-space (default 0.5) */
  radius: number;
  /** Overall intensity / darkness (default 1.0) */
  intensity: number;
  /** Number of samples per pixel (default 16) */
  samples: number;
  /** Bias to avoid self-occlusion (default 0.025) */
  bias: number;
  /** Resolution scale (default 0.5 = half-res) */
  resolution: number;
  /** Blur sharpness (higher = more edge-preserving, default 8.0) */
  blurSharpness: number;
}

const DEFAULT_SSAO_CONFIG: SSAOConfig = {
  radius: 0.5,
  intensity: 1.0,
  samples: 16,
  bias: 0.025,
  resolution: 0.5,
  blurSharpness: 8.0,
};

// ---------------------------------------------------------------------------
// Shared geometry
// ---------------------------------------------------------------------------

const _quadGeom = new THREE.PlaneGeometry(2, 2);

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const SSAO_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SSAO_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDepth;          // linear depth
uniform sampler2D tNormal;         // world-space normals
uniform mat4  uProjection;
uniform mat4  uInvProjection;
uniform vec2  uResolution;
uniform float uRadius;
uniform float uIntensity;
uniform int   uSamples;
uniform float uBias;
uniform float uFrameSeed;

varying vec2 vUv;

// Reconstruct view-space position from UV + depth
vec3 reconstructViewPos(vec2 uv, float depth) {
  vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * clipPos;
  return viewPos.xyz / viewPos.w;
}

// Sample view-space normal from the world-space normal buffer
vec3 sampleViewNormal(vec2 uv) {
  vec3 worldNormal = normalize(texture2D(tNormal, uv).rgb * 2.0 - 1.0);
  // For simplicity, assume the normal buffer already contains view-space normals
  // If world-space, transform with (uView * vec4(n,0)).xyz
  return worldNormal;
}

// Tangent frame
void buildFrame(vec3 n, out vec3 tangent, out vec3 bitangent) {
  if (n.z < -0.9999999) {
    tangent   = vec3(0.0, -1.0, 0.0);
    bitangent = vec3(-1.0, 0.0, 0.0);
  } else {
    float a = 1.0 / (1.0 + n.z);
    float b = -n.x * n.y * a;
    tangent   = vec3(1.0 - n.x * n.x * a, b, -n.x);
    bitangent = vec3(b, 1.0 - n.y * n.y * a, -n.y);
  }
}

void main() {
  float depth = texture2D(tDepth, vUv).r;

  // Sky → no AO
  if (depth >= 1.0 || depth <= 0.0) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // white = no occlusion
    return;
  }

  vec3 viewPos  = reconstructViewPos(vUv, depth);
  vec3 viewNorm = sampleViewNormal(vUv);

  // Build tangent frame
  vec3 tangent, bitangent;
  buildFrame(viewNorm, tangent, bitangent);

  float occlusion = 0.0;

  // Jitter
  vec2 noise = vec2(
    fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) + uFrameSeed),
    fract(dot(gl_FragCoord.xy, vec2(0.00583715, 0.06711056)) + uFrameSeed * 1.3)
  );

  for (int s = 0; s < 32; s++) {
    if (s >= uSamples) break;

    // Low-discrepancy hemisphere sample
    float xi1 = fract(float(s) * 0.618033988749895 + noise.x);
    float xi2 = fract(float(s) * 0.4045084971874737 + noise.y);

    float phi      = 2.0 * 3.14159265 * xi1;
    float cosTheta = sqrt(1.0 - xi2);
    float sinTheta = sqrt(xi2);

    vec3 localDir = vec3(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
    vec3 sampleDir = normalize(tangent * localDir.x + bitangent * localDir.y + viewNorm * localDir.z);

    // Offset position
    vec3 samplePos = viewPos + sampleDir * uRadius;

    // Project to screen
    vec4 offsetClip = uProjection * vec4(samplePos, 1.0);
    vec2 sampleUV   = offsetClip.xy / offsetClip.w * 0.5 + 0.5;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;

    float sampleDepth = texture2D(tDepth, sampleUV).r;
    vec3  sampleViewPos = reconstructViewPos(sampleUV, sampleDepth);

    float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(viewPos.z - sampleViewPos.z));
    float diff = samplePos.z - sampleViewPos.z;

    if (diff - uBias > 0.0) {
      occlusion += rangeCheck;
    }
  }

  occlusion = 1.0 - (occlusion / float(uSamples)) * uIntensity;
  occlusion = clamp(occlusion, 0.0, 1.0);

  gl_FragColor = vec4(vec3(occlusion), 1.0);
}
`;

// Bilateral blur for AO smoothing
const BLUR_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tAO;
uniform sampler2D tDepth;
uniform vec2  uResolution;
uniform float uSharpness;

varying vec2 vUv;

void main() {
  float centerAO    = texture2D(tAO, vUv).r;
  float centerDepth = texture2D(tDepth, vUv).r;

  float ao   = 0.0;
  float weight = 0.0;

  const int KERNEL = 3; // 7×7

  for (int y = -KERNEL; y <= KERNEL; y++) {
    for (int x = -KERNEL; x <= KERNEL; x++) {
      vec2 offset    = vec2(float(x), float(y)) / uResolution;
      vec2 sampleUV  = vUv + offset;

      float sampleAO    = texture2D(tAO, sampleUV).r;
      float sampleDepth = texture2D(tDepth, sampleUV).r;

      float depthDiff = abs(sampleDepth - centerDepth);
      float w = exp(-depthDiff * uSharpness * 300.0);

      // Spatial Gaussian
      float spatialW = exp(-float(x * x + y * y) / (2.0 * float(KERNEL)));

      w *= spatialW;

      ao     += sampleAO * w;
      weight += w;
    }
  }

  ao = weight > 0.0 ? ao / weight : centerAO;

  gl_FragColor = vec4(vec3(ao), 1.0);
}
`;

// Composite: multiply scene by AO
const COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D tDiffuse;
uniform sampler2D tAO;

varying vec2 vUv;

void main() {
  vec3 color = texture2D(tDiffuse, vUv).rgb;
  float ao   = texture2D(tAO, vUv).r;

  gl_FragColor = vec4(color * ao, 1.0);
}
`;

const PASSTHROUGH_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// SSAOPass
// ---------------------------------------------------------------------------

export class SSAOPass {
  readonly config: SSAOConfig;

  private aoRT: THREE.WebGLRenderTarget;
  private blurRT: THREE.WebGLRenderTarget;
  private compositeRT: THREE.WebGLRenderTarget;

  private aoMaterial: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;

  private quad: THREE.Mesh;
  private _quadScene: THREE.Scene | null = null;

  private camera: THREE.Camera;
  private frameIndex: number = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    config: Partial<SSAOConfig> = {},
  ) {
    this.config = { ...DEFAULT_SSAO_CONFIG, ...config };
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const w = Math.max(1, Math.floor(size.x * this.config.resolution));
    const h = Math.max(1, Math.floor(size.y * this.config.resolution));

    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };

    this.aoRT        = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.blurRT      = new THREE.WebGLRenderTarget(w, h, rtOpts);
    this.compositeRT = new THREE.WebGLRenderTarget(size.x, size.y, rtOpts);

    // AO material
    this.aoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth:         { value: null },
        tNormal:        { value: null },
        uProjection:    { value: new THREE.Matrix4() },
        uInvProjection: { value: new THREE.Matrix4() },
        uResolution:    { value: new THREE.Vector2(w, h) },
        uRadius:        { value: this.config.radius },
        uIntensity:     { value: this.config.intensity },
        uSamples:       { value: this.config.samples },
        uBias:          { value: this.config.bias },
        uFrameSeed:     { value: 0.0 },
      },
      vertexShader:   SSAO_VERTEX_SHADER,
      fragmentShader: SSAO_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Blur material
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tAO:          { value: null },
        tDepth:       { value: null },
        uResolution:  { value: new THREE.Vector2(w, h) },
        uSharpness:   { value: this.config.blurSharpness },
      },
      vertexShader:   PASSTHROUGH_VERTEX,
      fragmentShader: BLUR_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    // Composite material
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tAO:      { value: null },
      },
      vertexShader:   PASSTHROUGH_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    this.quad = new THREE.Mesh(_quadGeom, this.aoMaterial);
    this.quad.frustumCulled = false;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Render the SSAO pass.
   */
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.frameIndex++;

    // Update projection uniforms
    const projMatrix = (this.camera as THREE.PerspectiveCamera).projectionMatrix.clone();
    const invProj = projMatrix.clone().invert();

    this.aoMaterial.uniforms.uProjection.value.copy(projMatrix);
    this.aoMaterial.uniforms.uInvProjection.value.copy(invProj);
    this.aoMaterial.uniforms.uFrameSeed.value = (this.frameIndex % 256) / 256.0;

    // Depth texture from readBuffer
    const depthTex = (readBuffer as any).depthTexture ?? null;
    this.aoMaterial.uniforms.tDepth.value = depthTex;
    this.blurMaterial.uniforms.tDepth.value = depthTex;

    // --- Pass 1: Compute AO ---
    this.quad.material = this.aoMaterial;
    renderer.setRenderTarget(this.aoRT);
    renderer.render(this.getQuadScene(), this.camera);

    // --- Pass 2: Bilateral blur ---
    this.blurMaterial.uniforms.tAO.value = this.aoRT.texture;
    this.quad.material = this.blurMaterial;
    renderer.setRenderTarget(this.blurRT);
    renderer.render(this.getQuadScene(), this.camera);

    // --- Pass 3: Composite ---
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tAO.value      = this.blurRT.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(writeBuffer);
    renderer.render(this.getQuadScene(), this.camera);
  }

  /**
   * Set an external normal buffer texture.
   */
  setNormalTexture(texture: THREE.Texture): void {
    this.aoMaterial.uniforms.tNormal.value = texture;
  }

  /**
   * Set an external depth texture.
   */
  setDepthTexture(texture: THREE.Texture): void {
    this.aoMaterial.uniforms.tDepth.value = texture;
    this.blurMaterial.uniforms.tDepth.value = texture;
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<SSAOConfig>): void {
    Object.assign(this.config, partial);
    this.aoMaterial.uniforms.uRadius.value    = this.config.radius;
    this.aoMaterial.uniforms.uIntensity.value  = this.config.intensity;
    this.aoMaterial.uniforms.uSamples.value    = this.config.samples;
    this.aoMaterial.uniforms.uBias.value       = this.config.bias;
    this.blurMaterial.uniforms.uSharpness.value = this.config.blurSharpness;
  }

  /**
   * Resize internal render targets.
   */
  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width * this.config.resolution));
    const h = Math.max(1, Math.floor(height * this.config.resolution));
    this.aoRT.setSize(w, h);
    this.blurRT.setSize(w, h);
    this.compositeRT.setSize(width, height);
    this.aoMaterial.uniforms.uResolution.value.set(w, h);
    this.blurMaterial.uniforms.uResolution.value.set(w, h);
  }

  dispose(): void {
    this.aoRT.dispose();
    this.blurRT.dispose();
    this.compositeRT.dispose();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    _quadGeom.dispose();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private getQuadScene(): THREE.Scene {
    if (!this._quadScene) {
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this.quad);
    }
    return this._quadScene;
  }
}

export default SSAOPass;
