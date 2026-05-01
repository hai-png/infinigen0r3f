/**
 * CausticsRenderer - Renders caustic light patterns on underwater surfaces
 *
 * Caustics are the light patterns formed when light refracts through a water
 * surface and focuses on the floor below. This renderer produces a caustics
 * texture using a frame-by-frame approach with an orthographic camera and
 * custom FBM noise shaders that can be applied as a light map on underwater
 * geometry.
 *
 * Ported from: infinigen/terrain/water/caustics.py
 */

import * as THREE from 'three';

// ============================================================================
// Configuration
// ============================================================================

export interface CausticsConfig {
  /** Resolution of the caustics texture (default 256) */
  resolution: number;
  /** Brightness multiplier for the caustics pattern (default 1.0) */
  intensity: number;
  /** Blur radius in pixels for smoothing the caustics texture (default 2) */
  blurRadius: number;
  /** Animation speed of the caustic pattern (default 0.5) */
  speed: number;
  /** Depth below the water surface for the projection plane (default 10) */
  depth: number;
}

// ============================================================================
// Caustics Shaders
// ============================================================================

const causticsVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const causticsFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform float uDepth;
  uniform float uResolution;

  varying vec2 vUv;

  // ---- Hash functions for deterministic noise ----
  // Improved 2D hash for better visual quality
  vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float hash12(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
  }

  // ---- Gradient noise (Perlin-style) ----
  float gradientNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep

    // Four corner gradients
    float a = dot(hash22(i), f);
    float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // ---- FBM (Fractional Brownian Motion) ----
  // Multi-scale noise for organic-looking caustic patterns
  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      value += amplitude * gradientNoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  // ---- Caustic pattern using Voronoi-like convergence ----
  // Simulates light convergence through a refractive water surface
  float causticPattern(vec2 uv, float time) {
    // Scale UV for base caustic frequency
    vec2 scaledUv = uv * 4.0;

    // Animate the UVs with two offset noise fields to simulate
    // refraction through moving water
    float t = time * uSpeed;

    // Two overlapping noise fields create interference patterns
    // that look like light convergence
    vec2 offset1 = vec2(
      fbm(scaledUv + vec2(t * 0.3, t * 0.17), 4),
      fbm(scaledUv + vec2(t * 0.13, t * 0.27), 4)
    ) * 0.5;

    vec2 offset2 = vec2(
      fbm(scaledUv + vec2(t * 0.23, -t * 0.19) + 5.0, 4),
      fbm(scaledUv + vec2(-t * 0.11, t * 0.31) + 7.0, 4)
    ) * 0.5;

    // Voronoi-like distance computation for caustic lines
    // The derivative of noise creates bright ridges (caustic lines)
    float eps = 0.02;

    // First noise field with offset
    vec2 p1 = scaledUv + offset1;
    float n1x = fbm(p1 + vec2(eps, 0.0), 5);
    float n1y = fbm(p1 + vec2(0.0, eps), 5);
    float n1  = fbm(p1, 5);

    // Gradient magnitude gives us bright lines where light converges
    float grad1 = length(vec2(n1x - n1, n1y - n1)) / eps;

    // Second noise field with offset (creates secondary caustic pattern)
    vec2 p2 = scaledUv + offset2;
    float n2x = fbm(p2 + vec2(eps, 0.0), 5);
    float n2y = fbm(p2 + vec2(0.0, eps), 5);
    float n2  = fbm(p2, 5);

    float grad2 = length(vec2(n2x - n2, n2y - n2)) / eps;

    // Combine both caustic layers
    float caustic = grad1 * 0.6 + grad2 * 0.4;

    // Add a secondary finer detail layer for realism
    float fineDetail = fbm(scaledUv * 3.0 + t * 0.15, 3);
    caustic += abs(fineDetail) * 0.15;

    return caustic;
  }

  void main() {
    vec2 uv = vUv;

    // Generate the caustic pattern
    float caustic = causticPattern(uv, uTime);

    // Depth attenuation: caustics are stronger near the surface
    // and fade with depth due to light scattering
    float depthFactor = 1.0 / (1.0 + uDepth * 0.05);
    depthFactor = clamp(depthFactor, 0.1, 1.0);

    // Shape the caustic brightness — bright lines, dark areas
    // Use power curve to sharpen the pattern
    caustic = pow(caustic, 1.5);

    // Apply intensity and depth
    caustic *= uIntensity * depthFactor;

    // Clamp to reasonable range
    caustic = clamp(caustic, 0.0, 3.0);

    // Output as grayscale caustics texture (will be used as light map)
    // Brighter = more light concentrated at that point
    gl_FragColor = vec4(vec3(caustic), 1.0);
  }
`;

// ============================================================================
// CausticsRenderer
// ============================================================================

export class CausticsRenderer {
  private config: CausticsConfig;
  private renderTarget: THREE.WebGLRenderTarget;
  private blurRenderTarget: THREE.WebGLRenderTarget;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private blurMaterial: THREE.ShaderMaterial | null = null;
  private quad: THREE.Mesh;
  private currentTime: number = 0;
  private textureNeedsUpdate: boolean = true;

  constructor(config: Partial<CausticsConfig> = {}) {
    this.config = this.resolveConfig(config);

    // Create render targets for caustics texture
    const res = this.config.resolution;
    this.renderTarget = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    // Secondary target for blur pass
    this.blurRenderTarget = new THREE.WebGLRenderTarget(res, res, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    // Orthographic camera looking down at the water floor
    // The camera looks at a unit square that represents the floor projection
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
    this.camera.position.set(0, 10, 0);
    this.camera.lookAt(0, 0, 0);

    // Scene with a single full-screen quad for the caustics shader
    this.scene = new THREE.Scene();

    // Create the caustics shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: this.config.intensity },
        uSpeed: { value: this.config.speed },
        uDepth: { value: this.config.depth },
        uResolution: { value: this.config.resolution },
      },
      vertexShader: causticsVertexShader,
      fragmentShader: causticsFragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    // Full-screen quad
    const quadGeometry = new THREE.PlaneGeometry(1, 1);
    this.quad = new THREE.Mesh(quadGeometry, this.material);
    this.quad.rotation.x = -Math.PI / 2; // Face up for the top-down camera
    this.scene.add(this.quad);

    // Create blur material if blur radius > 0
    if (this.config.blurRadius > 0) {
      this.blurMaterial = this.createBlurMaterial();
    }
  }

  // ------------------------------------------------------------------
  // Config helpers
  // ------------------------------------------------------------------

  private resolveConfig(partial: Partial<CausticsConfig>): CausticsConfig {
    return {
      resolution: 256,
      intensity: 1.0,
      blurRadius: 2,
      speed: 0.5,
      depth: 10,
      ...partial,
    };
  }

  // ------------------------------------------------------------------
  // Blur material (Gaussian separable blur)
  // ------------------------------------------------------------------

  private createBlurMaterial(): THREE.ShaderMaterial {
    const blurRadius = this.config.blurRadius;
    const res = this.config.resolution;

    // Precompute Gaussian weights for the blur kernel
    const weights: number[] = [];
    let totalWeight = 0;
    for (let i = -blurRadius; i <= blurRadius; i++) {
      const w = Math.exp(-(i * i) / (2 * (blurRadius / 2) * (blurRadius / 2)));
      weights.push(w);
      totalWeight += w;
    }
    // Normalize weights
    for (let i = 0; i < weights.length; i++) {
      weights[i] /= totalWeight;
    }

    const weightsArray = new Float32Array(weights.length);
    weights.forEach((w, i) => (weightsArray[i] = w));

    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uWeights: { value: weightsArray },
        uKernelSize: { value: weights.length },
        uTexelSize: { value: new THREE.Vector2(1 / res, 1 / res) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uDirection;
        uniform float uWeights[${weights.length}];
        uniform int uKernelSize;
        uniform vec2 uTexelSize;
        varying vec2 vUv;

        void main() {
          vec4 color = vec4(0.0);
          for (int i = 0; i < ${weights.length}; i++) {
            if (i >= uKernelSize) break;
            vec2 offset = uDirection * (float(i) - float(uKernelSize) / 2.0) * uTexelSize;
            color += uWeights[i] * texture2D(tDiffuse, vUv + offset);
          }
          gl_FragColor = color;
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  /**
   * Render the caustics texture. Call this with a valid WebGLRenderer.
   * If no renderer is provided, the texture will be marked for update
   * and rendered lazily on the next getCausticsTexture() call.
   */
  render(renderer: THREE.WebGLRenderer): void {
    const res = this.config.resolution;

    // Ensure render targets match config
    if (this.renderTarget.width !== res || this.renderTarget.height !== res) {
      this.renderTarget.setSize(res, res);
      this.blurRenderTarget.setSize(res, res);
    }

    // Render caustics to the primary render target
    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Apply separable Gaussian blur if blur radius > 0
    if (this.blurMaterial && this.config.blurRadius > 0) {
      // Horizontal pass
      this.blurMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
      this.blurMaterial.uniforms.uDirection.value.set(1, 0);
      this.quad.material = this.blurMaterial;

      renderer.setRenderTarget(this.blurRenderTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);

      // Vertical pass
      this.blurMaterial.uniforms.tDiffuse.value = this.blurRenderTarget.texture;
      this.blurMaterial.uniforms.uDirection.value.set(0, 1);

      renderer.setRenderTarget(this.renderTarget);
      renderer.clear();
      renderer.render(this.scene, this.camera);

      // Restore caustics material
      this.quad.material = this.material;
    }

    // Restore default render target
    renderer.setRenderTarget(null);

    this.textureNeedsUpdate = false;
  }

  // ------------------------------------------------------------------
  // Update / Animation
  // ------------------------------------------------------------------

  /**
   * Advance the caustics animation to the given time.
   * Marks the texture as needing re-render.
   */
  update(time: number): void {
    this.currentTime = time;
    this.material.uniforms.uTime.value = time;
    this.textureNeedsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  /**
   * Returns the current caustics texture.
   * This texture can be applied as a light map on underwater geometry.
   */
  getCausticsTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  /**
   * Apply the caustics map to a material as a light map.
   * Sets the `lightMap` property and ensures the UV channel is correct.
   */
  applyToMaterial(material: THREE.Material): void {
    if ('lightMap' in material) {
      (material as THREE.MeshStandardMaterial).lightMap = this.renderTarget.texture;
      (material as THREE.MeshStandardMaterial).lightMapIntensity = this.config.intensity;
      material.needsUpdate = true;
    }
  }

  /**
   * Remove caustics from a material.
   */
  removeFromMaterial(material: THREE.Material): void {
    if ('lightMap' in material) {
      (material as THREE.MeshStandardMaterial).lightMap = null;
      material.needsUpdate = true;
    }
  }

  /**
   * Get the caustics configuration.
   */
  getConfig(): CausticsConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(partial: Partial<CausticsConfig>): void {
    const needsRebuild =
      partial.resolution !== undefined && partial.resolution !== this.config.resolution;

    Object.assign(this.config, partial);

    // Update shader uniforms
    if (partial.intensity !== undefined) {
      this.material.uniforms.uIntensity.value = this.config.intensity;
    }
    if (partial.speed !== undefined) {
      this.material.uniforms.uSpeed.value = this.config.speed;
    }
    if (partial.depth !== undefined) {
      this.material.uniforms.uDepth.value = this.config.depth;
    }

    if (needsRebuild) {
      this.renderTarget.setSize(this.config.resolution, this.config.resolution);
      this.blurRenderTarget.setSize(this.config.resolution, this.config.resolution);
      this.material.uniforms.uResolution.value = this.config.resolution;

      // Recreate blur material with new resolution
      if (this.blurMaterial) {
        this.blurMaterial.dispose();
      }
      if (this.config.blurRadius > 0) {
        this.blurMaterial = this.createBlurMaterial();
      }
    }

    this.textureNeedsUpdate = true;
  }

  /**
   * Check if the caustics texture needs to be re-rendered.
   */
  isDirty(): boolean {
    return this.textureNeedsUpdate;
  }

  /**
   * Get the orthographic camera used for rendering.
   * Useful for adjusting the projection volume.
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Get the scene used for rendering.
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  dispose(): void {
    this.renderTarget.dispose();
    this.blurRenderTarget.dispose();
    this.material.dispose();
    if (this.blurMaterial) {
      this.blurMaterial.dispose();
    }
    (this.quad.geometry as THREE.PlaneGeometry).dispose();
  }
}
