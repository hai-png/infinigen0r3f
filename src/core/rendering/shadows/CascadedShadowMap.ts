/**
 * CascadedShadowMap — Cascaded Shadow Maps for Large Outdoor Scenes
 *
 * Splits the camera frustum into multiple cascades, each with its own
 * shadow map. This provides better shadow resolution distribution across
 * the view distance, which is critical for outdoor scenes where a single
 * shadow map would be too coarse for nearby objects.
 *
 * Algorithm:
 *   1. Compute cascade split distances (using practical/PSSM split scheme)
 *   2. For each cascade, compute a tight light-space frustum
 *   3. Render a shadow map for each cascade
 *   4. In the receiving shader, select the appropriate cascade based on
 *      view-space depth and blend between adjacent cascades
 *
 * References:
 *   - "Parallel Split Shadow Maps on Programmable GPUs", Zhang et al.
 *   - "Cascaded Shadow Maps", Engle / NVIDIA SDK
 *
 * @module rendering/shadows
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CSMConfig {
  /** Number of cascades (default 4) */
  cascadeCount: number;
  /** Shadow map resolution per cascade (default 1024) */
  shadowMapSize: number;
  /** Lambda: blend between practical (0) and uniform (1) splits (default 0.75) */
  splitLambda: number;
  /** Shadow bias (default -0.001) */
  shadowBias: number;
  /** Normal bias (default 0.02) */
  normalBias: number;
  /** Maximum shadow distance from camera (default 200) */
  shadowDistance: number;
  /** Blend width between cascades as a fraction of cascade range (default 0.1) */
  blendWidth: number;
  /** Softness of shadow edges (PCF kernel size, default 2) */
  softness: number;
}

const DEFAULT_CSM_CONFIG: CSMConfig = {
  cascadeCount: 4,
  shadowMapSize: 1024,
  splitLambda: 0.75,
  shadowBias: -0.001,
  normalBias: 0.02,
  shadowDistance: 200,
  blendWidth: 0.1,
  softness: 2,
};

// ---------------------------------------------------------------------------
// Cascade data structure
// ---------------------------------------------------------------------------

export interface CascadeInfo {
  /** View-space near distance */
  near: number;
  /** View-space far distance */
  far: number;
  /** Orthographic camera for this cascade */
  camera: THREE.OrthographicCamera;
  /** Shadow map render target */
  renderTarget: THREE.WebGLRenderTarget;
  /** Shadow matrix (world → shadow-UV) */
  shadowMatrix: THREE.Matrix4;
}

// ---------------------------------------------------------------------------
// CSM Shaders
// ---------------------------------------------------------------------------

const CSM_RECEIVE_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CSM_RECEIVE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uShadowMaps[4];    // one per cascade
uniform mat4      uShadowMatrices[4];
uniform float     uCascadeSplits[5]; // near/far for each cascade
uniform float     uCascadeCount;
uniform float     uShadowBias;
uniform float     uShadowOpacity;
uniform float     uBlendWidth;
uniform float     uSoftness;
uniform vec3      uLightDir;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

// PCF shadow comparison
float pcfShadow(sampler2D shadowMap, vec2 shadowUV, float depth, float texelSize) {
  float shadow = 0.0;
  int radius = int(uSoftness);
  int count = 0;

  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      if (abs(x) > radius || abs(y) > radius) continue;
      vec2 offsetUV = shadowUV + vec2(float(x), float(y)) * texelSize;
      float shadowDepth = texture2D(shadowMap, offsetUV).r;
      shadow += step(depth - uShadowBias, shadowDepth);
      count++;
    }
  }

  return shadow / float(max(count, 1));
}

// Determine cascade index from view-space depth
int getCascadeIndex(float viewDepth) {
  for (int i = 0; i < 4; i++) {
    if (viewDepth < uCascadeSplits[i + 1]) {
      return i;
    }
  }
  return int(uCascadeCount) - 1;
}

void main() {
  // Compute view-space depth (negative Z convention)
  float viewDepth = -vWorldPos.z; // simplified; should use view matrix for accuracy

  int cascadeIdx = getCascadeIndex(viewDepth);

  // Sample shadow map for this cascade
  vec4 shadowCoord = uShadowMatrices[cascadeIdx] * vec4(vWorldPos, 1.0);
  vec3 shadowUVW = shadowCoord.xyz / shadowCoord.w;

  // Outside shadow frustum → lit
  if (shadowUVW.x < 0.0 || shadowUVW.x > 1.0 ||
      shadowUVW.y < 0.0 || shadowUVW.y > 1.0 ||
      shadowUVW.z < 0.0 || shadowUVW.z > 1.0) {
    gl_FragColor = vec4(1.0);
    return;
  }

  // Shadow map texel size
  vec2 shadowSize = vec2(textureSize(uShadowMaps[cascadeIdx], 0));
  float texelSize = 1.0 / shadowSize.x;

  float visibility = pcfShadow(uShadowMaps[cascadeIdx], shadowUVW.xy, shadowUVW.z, texelSize);

  // Blend with next cascade near split boundary
  float splitStart = uCascadeSplits[cascadeIdx];
  float splitEnd   = uCascadeSplits[cascadeIdx + 1];
  float blendStart = splitEnd - (splitEnd - splitStart) * uBlendWidth;

  if (viewDepth > blendStart && cascadeIdx < int(uCascadeCount) - 1) {
    float blendFactor = smoothstep(blendStart, splitEnd, viewDepth);
    int nextIdx = cascadeIdx + 1;

    vec4 nextShadowCoord = uShadowMatrices[nextIdx] * vec4(vWorldPos, 1.0);
    vec3 nextShadowUVW = nextShadowCoord.xyz / nextShadowCoord.w;

    if (nextShadowUVW.x >= 0.0 && nextShadowUVW.x <= 1.0 &&
        nextShadowUVW.y >= 0.0 && nextShadowUVW.y <= 1.0 &&
        nextShadowUVW.z >= 0.0 && nextShadowUVW.z <= 1.0) {
      vec2 nextShadowSize = vec2(textureSize(uShadowMaps[nextIdx], 0));
      float nextTexelSize = 1.0 / nextShadowSize.x;
      float nextVisibility = pcfShadow(uShadowMaps[nextIdx], nextShadowUVW.xy, nextShadowUVW.z, nextTexelSize);
      visibility = mix(visibility, nextVisibility, blendFactor);
    }
  }

  // Apply shadow opacity
  float shadowFactor = mix(1.0 - uShadowOpacity, 1.0, visibility);
  gl_FragColor = vec4(vec3(shadowFactor), 1.0);
}
`;

// ---------------------------------------------------------------------------
// CascadedShadowMap
// ---------------------------------------------------------------------------

export class CascadedShadowMap {
  readonly config: CSMConfig;

  /** The directional light this CSM is attached to. */
  private light: THREE.DirectionalLight | null = null;

  /** Cascade data (cameras, render targets, matrices). */
  private cascades: CascadeInfo[] = [];

  /** Split distances (cascadeCount + 1 values). */
  private splitDistances: number[] = [];

  /** Custom depth material for shadow rendering. */
  private depthMaterial: THREE.ShaderMaterial;

  /** Custom receive material for cascade blending. */
  private receiveMaterial: THREE.ShaderMaterial;

  /** Frame buffer for debug visualisation. */
  private _debugMaterial: THREE.ShaderMaterial | null = null;

  constructor(config: Partial<CSMConfig> = {}) {
    this.config = { ...DEFAULT_CSM_CONFIG, ...config };

    // Depth material (simple linear depth)
    this.depthMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        void main() {
          gl_FragColor = vec4(vec3(gl_FragCoord.z), 1.0);
        }
      `,
      side: THREE.FrontSide,
    });

    // Receive material with cascade selection + blending
    this.receiveMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uShadowMaps:     { value: [null, null, null, null] },
        uShadowMatrices: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
        uCascadeSplits:  { value: [0, 0, 0, 0, 0] },
        uCascadeCount:   { value: this.config.cascadeCount },
        uShadowBias:     { value: this.config.shadowBias },
        uShadowOpacity:  { value: 0.7 },
        uBlendWidth:     { value: this.config.blendWidth },
        uSoftness:       { value: this.config.softness },
        uLightDir:       { value: new THREE.Vector3() },
      },
      vertexShader: CSM_RECEIVE_VERTEX,
      fragmentShader: CSM_RECEIVE_FRAGMENT,
    });

    this.createCascades();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Attach CSM to a directional light.
   */
  applyToLight(light: THREE.DirectionalLight): void {
    this.light = light;
    light.castShadow = true;

    // Disable Three.js built-in shadow map (we manage our own)
    light.shadow.mapSize.set(this.config.shadowMapSize, this.config.shadowMapSize);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = this.config.shadowDistance;
    light.shadow.bias = this.config.shadowBias;
    light.shadow.normalBias = this.config.normalBias;
  }

  /**
   * Update cascade splits, cameras, and re-render all shadow maps.
   * Call once per frame before the main render pass.
   */
  update(
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ): void {
    if (!this.light) return;

    // 1. Compute cascade split distances
    this.computeSplits(camera);

    // 2. For each cascade, compute tight frustum and render shadow map
    for (let i = 0; i < this.config.cascadeCount; i++) {
      const cascade = this.cascades[i];

      // Update cascade camera frustum to tightly fit the sub-frustum
      this.computeCascadeCamera(camera, cascade, i);

      // Render shadow map
      renderer.setRenderTarget(cascade.renderTarget);
      renderer.clear();

      const overrideMaterial = scene.overrideMaterial;
      scene.overrideMaterial = this.depthMaterial;
      renderer.render(scene, cascade.camera);
      scene.overrideMaterial = overrideMaterial;

      // Compute shadow matrix
      cascade.shadowMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      );
      cascade.shadowMatrix.multiply(cascade.camera.projectionMatrix);
      cascade.shadowMatrix.multiply(cascade.camera.matrixWorldInverse);
    }

    renderer.setRenderTarget(null);

    // 3. Update receive material uniforms
    this.updateReceiveUniforms(camera);
  }

  /**
   * Get cascade information (for custom rendering).
   */
  getCascades(): readonly CascadeInfo[] {
    return this.cascades;
  }

  /**
   * Get the receive material (for applying CSM shadows to scene objects).
   */
  getReceiveMaterial(): THREE.ShaderMaterial {
    return this.receiveMaterial;
  }

  /**
   * Get the depth material used for shadow map rendering.
   */
  getDepthMaterial(): THREE.ShaderMaterial {
    return this.depthMaterial;
  }

  /**
   * Update config at runtime.
   */
  setConfig(partial: Partial<CSMConfig>): void {
    const needsRebuild = partial.cascadeCount !== undefined || partial.shadowMapSize !== undefined;
    Object.assign(this.config, partial);

    if (needsRebuild) {
      this.disposeCascades();
      this.createCascades();
    }

    this.receiveMaterial.uniforms.uCascadeCount.value = this.config.cascadeCount;
    this.receiveMaterial.uniforms.uShadowBias.value = this.config.shadowBias;
    this.receiveMaterial.uniforms.uBlendWidth.value = this.config.blendWidth;
    this.receiveMaterial.uniforms.uSoftness.value = this.config.softness;
  }

  /**
   * Get split distances for debug visualisation.
   */
  getSplitDistances(): readonly number[] {
    return this.splitDistances;
  }

  /** Release GPU resources. */
  dispose(): void {
    this.disposeCascades();
    this.depthMaterial.dispose();
    this.receiveMaterial.dispose();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private createCascades(): void {
    this.cascades = [];
    for (let i = 0; i < this.config.cascadeCount; i++) {
      const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.5, 200);
      const rt = new THREE.WebGLRenderTarget(this.config.shadowMapSize, this.config.shadowMapSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });

      this.cascades.push({
        near: 0,
        far: 0,
        camera: cam,
        renderTarget: rt,
        shadowMatrix: new THREE.Matrix4(),
      });
    }
  }

  private disposeCascades(): void {
    for (const cascade of this.cascades) {
      cascade.renderTarget.dispose();
    }
    this.cascades = [];
  }

  /**
   * Compute cascade split distances using practical split scheme.
   * Blends between logarithmic (for close-up detail) and uniform (for distant coverage).
   */
  private computeSplits(camera: THREE.PerspectiveCamera): void {
    const near = camera.near;
    const far = Math.min(camera.far, this.config.shadowDistance);
    const lambda = this.config.splitLambda;
    const n = this.config.cascadeCount;

    this.splitDistances = [near];

    for (let i = 1; i <= n; i++) {
      const p = i / n;
      // Logarithmic split
      const logSplit = near * Math.pow(far / near, p);
      // Uniform split
      const uniformSplit = near + (far - near) * p;
      // Practical split (blend)
      const split = lambda * logSplit + (1 - lambda) * uniformSplit;
      this.splitDistances.push(split);
    }
  }

  /**
   * Compute a tight orthographic camera for a cascade by extracting
   * the sub-frustum and fitting it in light space.
   */
  private computeCascadeCamera(
    camera: THREE.PerspectiveCamera,
    cascade: CascadeInfo,
    index: number,
  ): void {
    const near = this.splitDistances[index];
    const far = this.splitDistances[index + 1];
    cascade.near = near;
    cascade.far = far;

    // Compute the 8 corners of the sub-frustum
    const aspect = camera.aspect;
    const fov = camera.fov * (Math.PI / 180);
    const tanFov = Math.tan(fov / 2);

    // Frustum corners in view space
    const nearTop = near * tanFov;
    const nearRight = nearTop * aspect;
    const farTop = far * tanFov;
    const farRight = farTop * aspect;

    const frustumCornersView: THREE.Vector3[] = [
      new THREE.Vector3(-nearRight, nearTop, -near),
      new THREE.Vector3(nearRight, nearTop, -near),
      new THREE.Vector3(nearRight, -nearTop, -near),
      new THREE.Vector3(-nearRight, -nearTop, -near),
      new THREE.Vector3(-farRight, farTop, -far),
      new THREE.Vector3(farRight, farTop, -far),
      new THREE.Vector3(farRight, -farTop, -far),
      new THREE.Vector3(-farRight, -farTop, -far),
    ];

    // Transform to world space
    const viewInverse = camera.matrixWorld;
    const frustumCornersWorld = frustumCornersView.map(v =>
      v.applyMatrix4(viewInverse)
    );

    // Transform to light space and find bounds
    const lightViewMatrix = new THREE.Matrix4().lookAt(
      this.light!.position,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    );

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const corner of frustumCornersWorld) {
      const lightSpace = corner.applyMatrix4(lightViewMatrix);
      minX = Math.min(minX, lightSpace.x);
      maxX = Math.max(maxX, lightSpace.x);
      minY = Math.min(minY, lightSpace.y);
      maxY = Math.max(maxY, lightSpace.y);
      minZ = Math.min(minZ, lightSpace.z);
      maxZ = Math.max(maxZ, lightSpace.z);
    }

    // Expand Z range to include scene objects behind the frustum
    const zExtend = (maxZ - minZ) * 0.5;
    minZ -= zExtend;
    maxZ += zExtend;

    // Snap to texel boundaries to reduce shadow acne
    const texelSize = (maxX - minX) / this.config.shadowMapSize;
    minX = Math.floor(minX / texelSize) * texelSize;
    maxX = Math.floor(maxX / texelSize) * texelSize;
    minY = Math.floor(minY / texelSize) * texelSize;
    maxY = Math.floor(maxY / texelSize) * texelSize;

    // Set cascade camera
    const cam = cascade.camera;
    cam.left = minX;
    cam.right = maxX;
    cam.top = maxY;
    cam.bottom = minY;
    cam.near = -maxZ;
    cam.far = -minZ;
    cam.updateProjectionMatrix();

    // Position the camera at the light's position
    cam.position.copy(this.light!.position);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  }

  /**
   * Update receive material uniforms with shadow map textures and matrices.
   */
  private updateReceiveUniforms(camera: THREE.PerspectiveCamera): void {
    const shadowMaps: (THREE.Texture | null)[] = [];
    const shadowMatrices: THREE.Matrix4[] = [];
    const splits: number[] = [];

    for (let i = 0; i < 4; i++) {
      if (i < this.config.cascadeCount) {
        shadowMaps.push(this.cascades[i].renderTarget.texture);
        shadowMatrices.push(this.cascades[i].shadowMatrix);
        splits.push(this.splitDistances[i]);
      } else {
        shadowMaps.push(null);
        shadowMatrices.push(new THREE.Matrix4());
        splits.push(this.splitDistances[Math.min(i, this.splitDistances.length - 1)] ?? 0);
      }
    }
    // Add last split
    if (this.splitDistances.length > this.config.cascadeCount) {
      splits.push(this.splitDistances[this.config.cascadeCount]);
    } else {
      splits.push(camera.far);
    }

    this.receiveMaterial.uniforms.uShadowMaps.value = shadowMaps;
    this.receiveMaterial.uniforms.uShadowMatrices.value = shadowMatrices;
    this.receiveMaterial.uniforms.uCascadeSplits.value = splits.slice(0, 5);
    this.receiveMaterial.uniforms.uCascadeCount.value = this.config.cascadeCount;

    if (this.light) {
      this.receiveMaterial.uniforms.uLightDir.value.copy(this.light.position).normalize();
    }
  }
}

export default CascadedShadowMap;
