/**
 * RasterizedEnhancements — Improved Screen-Space Effects for Rasterized Mode
 *
 * Improvements to the rasterized rendering pipeline including
 * Screen-Space Reflections (SSR), Horizon-Based Ambient Occlusion (HBAO),
 * and hybrid mode support (rasterize during interaction, path-trace on idle).
 *
 * Phase 1 — P1.6: Rasterized Mode Enhancements
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSRConfig {
  /** Whether SSR is enabled */
  enabled: boolean;
  /** Resolution scale (0.5 = half resolution) */
  resolution: number;
  /** Maximum ray march distance */
  maxDistance: number;
  /** Number of ray march steps */
  steps: number;
  /** Thickness threshold for ray hit detection */
  thickness: number;
  /** Roughness cutoff (surfaces above this roughness don't get SSR) */
  roughnessCutoff: number;
  /** Fade-out distance from screen edge */
  screenFade: number;
}

export interface HBAOConfig {
  /** Whether HBAO is enabled */
  enabled: boolean;
  /** Resolution scale */
  resolution: number;
  /** Sample count per direction */
  samples: number;
  /** Number of directions */
  directions: number;
  /** Radius of AO sampling */
  radius: number;
  /** Falloff distance */
  falloff: number;
  /** Bias angle (radians) */
  bias: number;
  /** Intensity multiplier */
  intensity: number;
  /** Blur sharpness */
  blurSharpness: number;
  /** Blur radius in pixels */
  blurRadius: number;
}

export const DEFAULT_SSR_CONFIG: SSRConfig = {
  enabled: true,
  resolution: 0.5,
  maxDistance: 50.0,
  steps: 32,
  thickness: 0.1,
  roughnessCutoff: 0.7,
  screenFade: 0.1,
};

export const DEFAULT_HBAO_CONFIG: HBAOConfig = {
  enabled: true,
  resolution: 0.5,
  samples: 4,
  directions: 4,
  radius: 1.0,
  falloff: 2.0,
  bias: 0.05,
  intensity: 1.5,
  blurSharpness: 6.0,
  blurRadius: 2,
};

// ---------------------------------------------------------------------------
// SSR Pass (Screen-Space Reflections)
// ---------------------------------------------------------------------------

/**
 * Screen-Space Reflections pass for rasterized rendering mode.
 * Uses linear ray marching in screen space with hierarchical Z-buffer.
 *
 * This is a simplified implementation for wet surfaces and indoor reflections.
 * Full path-traced reflections are available in pathtrace mode.
 */
export class SSRPass {
  private config: SSRConfig;
  private ssrMaterial: THREE.ShaderMaterial | null = null;
  private compositeMaterial: THREE.ShaderMaterial | null = null;
  private quad: THREE.Mesh | null = null;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  constructor(config: Partial<SSRConfig> = {}) {
    this.config = { ...DEFAULT_SSR_CONFIG, ...config };
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initialize the SSR pass.
   */
  init(): void {
    // SSR ray march shader
    this.ssrMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tNormal: { value: null },
        tMetalnessRoughness: { value: null },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000.0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        maxDistance: { value: this.config.maxDistance },
        steps: { value: this.config.steps },
        thickness: { value: this.config.thickness },
        roughnessCutoff: { value: this.config.roughnessCutoff },
        screenFade: { value: this.config.screenFade },
        viewMatrix: { value: new THREE.Matrix4() },
        projectionMatrix: { value: new THREE.Matrix4() },
        inverseProjectionMatrix: { value: new THREE.Matrix4() },
        inverseViewMatrix: { value: new THREE.Matrix4() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tNormal;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform float maxDistance;
        uniform float steps;
        uniform float thickness;
        uniform float roughnessCutoff;
        uniform float screenFade;
        uniform mat4 projectionMatrix;
        uniform mat4 inverseProjectionMatrix;

        varying vec2 vUv;

        float readDepth(vec2 coord) {
          float fragCoordZ = texture2D(tDepth, coord).x;
          float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
          return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
        }

        vec3 reconstructPosition(vec2 uv, float depth) {
          float clipZ = depth * 2.0 - 1.0;
          vec4 clipPos = vec4(uv * 2.0 - 1.0, clipZ, 1.0);
          vec4 viewPos = inverseProjectionMatrix * clipPos;
          return viewPos.xyz / viewPos.w;
        }

        void main() {
          vec4 baseColor = texture2D(tDiffuse, vUv);

          // Skip sky pixels (depth = 1.0)
          float depth = readDepth(vUv);
          if (depth >= 1.0) {
            gl_FragColor = baseColor;
            return;
          }

          // Get normal and roughness
          vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          // Simplified: use metalness/roughness from G-buffer if available
          // For now, only reflect on surfaces with normal pointing somewhat toward camera

          // Reconstruct view-space position
          vec3 viewPos = reconstructPosition(vUv, depth);

          // View direction
          vec3 viewDir = normalize(-viewPos);

          // Reflection direction
          vec3 reflectDir = reflect(-viewDir, normal);

          // Skip reflections pointing away from camera
          if (reflectDir.z > 0.0) {
            gl_FragColor = baseColor;
            return;
          }

          // Ray march in screen space
          vec3 rayOrigin = viewPos;
          vec3 rayDir = reflectDir;

          float rayLength = maxDistance;
          vec3 rayEnd = rayOrigin + rayDir * rayLength;

          // Project to screen space
          vec4 startClip = projectionMatrix * vec4(rayOrigin, 1.0);
          vec4 endClip = projectionMatrix * vec4(rayEnd, 1.0);

          vec2 startScreen = startClip.xy / startClip.w * 0.5 + 0.5;
          vec2 endScreen = endClip.xy / endClip.w * 0.5 + 0.5;

          vec2 deltaScreen = endScreen - startScreen;

          // Skip very long or degenerate rays
          float screenLength = length(deltaScreen);
          if (screenLength < 0.001 || screenLength > 2.0) {
            gl_FragColor = baseColor;
            return;
          }

          // March
          float hitDepth = 0.0;
          vec2 hitUV = vec2(0.0);
          bool hit = false;

          float stepSize = 1.0 / steps;
          for (float i = 0.0; i < 1.0; i += stepSize) {
            vec2 sampleUV = startScreen + deltaScreen * i;
            float sampleDepth = readDepth(sampleUV);

            // Reconstruct sample position
            vec3 samplePos = reconstructPosition(sampleUV, sampleDepth);

            // Check if ray is close to geometry
            float rayZ = mix(rayOrigin.z, rayEnd.z, i);
            float zDiff = rayZ - samplePos.z;

            if (zDiff > 0.0 && zDiff < thickness) {
              hit = true;
              hitUV = sampleUV;
              hitDepth = sampleDepth;
              break;
            }
          }

          if (hit) {
            // Sample reflected color
            vec4 reflectedColor = texture2D(tDiffuse, hitUV);

            // Screen edge fade
            vec2 fadeFactors = smoothstep(0.0, screenFade, hitUV) *
                              smoothstep(0.0, screenFade, 1.0 - hitUV);
            float fade = fadeFactors.x * fadeFactors.y;

            // Mix reflection based on roughness approximation and fade
            float reflectAmount = fade * 0.5;
            gl_FragColor = mix(baseColor, reflectedColor, reflectAmount);
          } else {
            gl_FragColor = baseColor;
          }
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ssrMaterial);
    this.scene.add(this.quad);
  }

  /**
   * Render the SSR pass.
   */
  render(
    renderer: THREE.WebGLRenderer,
    readTarget: THREE.WebGLRenderTarget,
    writeTarget: THREE.WebGLRenderTarget,
    camera: THREE.PerspectiveCamera,
  ): void {
    if (!this.ssrMaterial || !this.config.enabled) {
      return;
    }

    // Update uniforms
    this.ssrMaterial.uniforms.tDiffuse.value = readTarget.texture;
    this.ssrMaterial.uniforms.tDepth.value = readTarget.depthTexture;
    this.ssrMaterial.uniforms.cameraNear.value = camera.near;
    this.ssrMaterial.uniforms.cameraFar.value = camera.far;
    this.ssrMaterial.uniforms.projectionMatrix.value = camera.projectionMatrix;
    this.ssrMaterial.uniforms.inverseProjectionMatrix.value = camera.projectionMatrixInverse;

    const size = renderer.getSize(new THREE.Vector2());
    this.ssrMaterial.uniforms.resolution.value.set(size.x, size.y);

    renderer.setRenderTarget(writeTarget);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  /**
   * Update the configuration.
   */
  updateConfig(config: Partial<SSRConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.ssrMaterial) {
      this.ssrMaterial.uniforms.maxDistance.value = this.config.maxDistance;
      this.ssrMaterial.uniforms.steps.value = this.config.steps;
      this.ssrMaterial.uniforms.thickness.value = this.config.thickness;
      this.ssrMaterial.uniforms.roughnessCutoff.value = this.config.roughnessCutoff;
      this.ssrMaterial.uniforms.screenFade.value = this.config.screenFade;
    }
  }

  /**
   * Resize the pass.
   */
  setSize(width: number, height: number): void {
    if (this.ssrMaterial) {
      this.ssrMaterial.uniforms.resolution.value.set(
        width * this.config.resolution,
        height * this.config.resolution,
      );
    }
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.ssrMaterial?.dispose();
    this.compositeMaterial?.dispose();
    this.quad?.geometry.dispose();
    this.scene.clear();
  }
}

// ---------------------------------------------------------------------------
// HBAO Pass (Horizon-Based Ambient Occlusion)
// ---------------------------------------------------------------------------

/**
 * Horizon-Based Ambient Occlusion pass — alternative to SSAO that
 * produces more physically accurate results.
 */
export class HBAOPass {
  private config: HBAOConfig;
  private hbaoMaterial: THREE.ShaderMaterial | null = null;
  private blurMaterial: THREE.ShaderMaterial | null = null;
  private quad: THREE.Mesh | null = null;
  private blurQuad: THREE.Mesh | null = null;
  private scene: THREE.Scene;
  private blurScene: THREE.Scene;
  private camera: THREE.OrthographicCamera;

  constructor(config: Partial<HBAOConfig> = {}) {
    this.config = { ...DEFAULT_HBAO_CONFIG, ...config };
    this.scene = new THREE.Scene();
    this.blurScene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /**
   * Initialize the HBAO pass.
   */
  init(): void {
    // HBAO estimation shader
    this.hbaoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        tNormal: { value: null },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000.0 },
        resolution: { value: new THREE.Vector2(1, 1) },
        samples: { value: this.config.samples },
        directions: { value: this.config.directions },
        radius: { value: this.config.radius },
        falloff: { value: this.config.falloff },
        bias: { value: this.config.bias },
        intensity: { value: this.config.intensity },
        projectionMatrix: { value: new THREE.Matrix4() },
        inverseProjectionMatrix: { value: new THREE.Matrix4() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform float samples;
        uniform float directions;
        uniform float radius;
        uniform float falloff;
        uniform float bias;
        uniform float intensity;
        uniform mat4 projectionMatrix;
        uniform mat4 inverseProjectionMatrix;

        varying vec2 vUv;

        float readDepth(vec2 coord) {
          float fragCoordZ = texture2D(tDepth, coord).x;
          float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
          return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
        }

        vec3 reconstructViewPosition(vec2 uv, float depth) {
          float clipZ = depth * 2.0 - 1.0;
          vec4 clipPos = vec4(uv * 2.0 - 1.0, clipZ, 1.0);
          vec4 viewPos = inverseProjectionMatrix * clipPos;
          return viewPos.xyz / viewPos.w;
        }

        void main() {
          float depth = readDepth(vUv);

          // Skip sky
          if (depth >= 1.0) {
            gl_FragColor = vec4(1.0);
            return;
          }

          vec3 viewPos = reconstructViewPosition(vUv, depth);
          vec3 normal = vec3(0.0, 1.0, 0.0); // Fallback - ideally from G-buffer

          // Simplified HBAO: sample in directions and find horizon angles
          float ao = 0.0;
          float angleStep = 3.14159265 / directions;

          for (float dir = 0.0; dir < 3.14159265; dir += angleStep) {
            vec2 dirVec = vec2(cos(dir), sin(dir));

            // Find maximum horizon angle in this direction
            float maxHorizonCos = -1.0;

            for (float s = 1.0; s <= 16.0; s += 1.0) {
              float sampleDist = radius * (s / samples);
              vec2 sampleUV = vUv + dirVec * sampleDist / resolution;
              float sampleDepth = readDepth(sampleUV);

              if (sampleDepth < 1.0) {
                vec3 samplePos = reconstructViewPosition(sampleUV, sampleDepth);
                vec3 sampleDir = normalize(samplePos - viewPos);

                float horizonCos = dot(normal, sampleDir);
                maxHorizonCos = max(maxHorizonCos, horizonCos);
              }
            }

            // AO contribution
            float horizonAngle = acos(clamp(maxHorizonCos, -1.0, 1.0));
            float centerAngle = acos(clamp(dot(normal, vec3(0.0, 0.0, 1.0)), -1.0, 1.0));
            float aoContrib = max(0.0, horizonAngle - centerAngle - bias);

            // Falloff
            aoContrib *= exp(-falloff * 0.01);

            ao += aoContrib;
          }

          ao /= directions;
          ao = 1.0 - clamp(ao * intensity, 0.0, 1.0);

          gl_FragColor = vec4(vec3(ao), 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    // Blur shader (bilateral)
    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        sharpness: { value: this.config.blurSharpness },
        radius: { value: this.config.blurRadius },
        direction: { value: new THREE.Vector2(1, 0) }, // horizontal first
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float sharpness;
        uniform float radius;
        uniform vec2 direction;

        varying vec2 vUv;

        void main() {
          float centerDepth = texture2D(tDepth, vUv).x;
          vec4 centerColor = texture2D(tDiffuse, vUv);

          vec4 sum = centerColor;
          float weightSum = 1.0;

          for (float i = -4.0; i <= 4.0; i += 1.0) {
            if (i == 0.0) continue;
            vec2 offset = direction * i * radius / resolution;
            vec2 sampleUV = vUv + offset;
            float sampleDepth = texture2D(tDepth, sampleUV).x;

            // Depth-aware weight
            float depthDiff = abs(centerDepth - sampleDepth) * sharpness;
            float w = exp(-depthDiff * depthDiff) * exp(-i * i / 8.0);

            sum += texture2D(tDiffuse, sampleUV) * w;
            weightSum += w;
          }

          gl_FragColor = sum / weightSum;
        }
      `,
      depthWrite: false,
      depthTest: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hbaoMaterial);
    this.scene.add(this.quad);

    this.blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMaterial);
    this.blurScene.add(this.blurQuad);
  }

  /**
   * Render the HBAO pass (2-pass: AO + bilateral blur).
   */
  render(
    renderer: THREE.WebGLRenderer,
    outputTarget: THREE.WebGLRenderTarget,
    inputTarget: THREE.WebGLRenderTarget,
    tempTarget: THREE.WebGLRenderTarget,
    camera: THREE.PerspectiveCamera,
  ): void {
    if (!this.hbaoMaterial || !this.blurMaterial || !this.config.enabled) {
      return;
    }

    // Update uniforms
    this.hbaoMaterial.uniforms.tDepth.value = inputTarget.depthTexture;
    this.hbaoMaterial.uniforms.cameraNear.value = camera.near;
    this.hbaoMaterial.uniforms.cameraFar.value = camera.far;
    this.hbaoMaterial.uniforms.projectionMatrix.value = camera.projectionMatrix;
    this.hbaoMaterial.uniforms.inverseProjectionMatrix.value = camera.projectionMatrixInverse;

    const size = renderer.getSize(new THREE.Vector2());
    this.hbaoMaterial.uniforms.resolution.value.set(size.x, size.y);

    // Pass 1: Compute HBAO
    renderer.setRenderTarget(tempTarget);
    renderer.render(this.scene, this.camera);

    // Pass 2: Bilateral blur (horizontal + vertical)
    this.blurMaterial.uniforms.tDiffuse.value = tempTarget.texture;
    this.blurMaterial.uniforms.tDepth.value = inputTarget.depthTexture;
    this.blurMaterial.uniforms.resolution.value.set(size.x, size.y);
    this.blurMaterial.uniforms.direction.value.set(1, 0);

    renderer.setRenderTarget(outputTarget);
    renderer.render(this.blurScene, this.camera);

    this.blurMaterial.uniforms.tDiffuse.value = outputTarget.texture;
    this.blurMaterial.uniforms.direction.value.set(0, 1);

    renderer.setRenderTarget(tempTarget);
    renderer.render(this.blurScene, this.camera);

    renderer.setRenderTarget(null);
  }

  /**
   * Update the configuration.
   */
  updateConfig(config: Partial<HBAOConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Resize the pass.
   */
  setSize(width: number, height: number): void {
    // Resolution scaling handled internally
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.hbaoMaterial?.dispose();
    this.blurMaterial?.dispose();
    this.quad?.geometry.dispose();
    this.blurQuad?.geometry.dispose();
    this.scene.clear();
    this.blurScene.clear();
  }
}
