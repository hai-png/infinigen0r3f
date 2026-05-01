/**
 * OceanSystem - Full ocean rendering system with Gerstner waves
 *
 * Provides a large-scale ocean surface with:
 * - Multiple Gerstner wave components for realistic ocean motion
 * - Depth-based water coloring (deep blue → shallow turquoise)
 * - Fresnel effect for reflection/refraction blending
 * - Foam at wave crests
 * - Subsurface scattering approximation
 * - Specular highlights from sun reflection
 * - CPU-side height/normal queries for gameplay
 *
 * Ported from: infinigen/terrain/water/ocean.py
 */

import * as THREE from 'three';

// ============================================================================
// Interfaces
// ============================================================================

export interface OceanConfig {
  /** World-space size of the ocean plane (default 1000) */
  size: number;
  /** Grid subdivision resolution (default 256) */
  resolution: number;
  /** Maximum wave amplitude (default 2.0) */
  waveHeight: number;
  /** Typical wavelength (default 30) */
  waveLength: number;
  /** Wind direction in radians [x, z] components (normalized internally) */
  windDirection: [number, number];
  /** Wind speed — affects wave frequency and choppiness (default 10) */
  windSpeed: number;
  /** Deep water color (default dark blue) */
  deepColor: THREE.Color;
  /** Shallow water color (default light turquoise) */
  shallowColor: THREE.Color;
  /** Foam color (default white) */
  foamColor: THREE.Color;
  /** Wave height threshold for foam generation (default 0.8) */
  foamThreshold: number;
  /** Animation time, updated each frame (default 0) */
  time: number;
}

export interface GerstnerWave {
  /** Wave amplitude */
  amplitude: number;
  /** Wavelength */
  wavelength: number;
  /** Speed (derived from wavelength in deep water) */
  speed: number;
  /** Direction vector [dx, dz] (normalized) */
  direction: [number, number];
  /** Steepness (0 = sine, 1 = sharp crests) */
  steepness: number;
}

// ============================================================================
// OceanSurface — the mesh + shader
// ============================================================================

export class OceanSurface {
  private mesh: THREE.Mesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.ShaderMaterial;
  private config: OceanConfig;
  private waves: GerstnerWave[];
  private time: number = 0;

  constructor(config: Partial<OceanConfig> = {}) {
    this.config = this.resolveConfig(config);
    this.waves = this.generateWaveComponents();

    // Build the subdivided plane
    this.geometry = new THREE.PlaneGeometry(
      this.config.size,
      this.config.size,
      this.config.resolution,
      this.config.resolution
    );
    this.geometry.rotateX(-Math.PI / 2);

    // Build shader material
    this.material = this.createOceanShader();

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
  }

  // ------------------------------------------------------------------
  // Config helpers
  // ------------------------------------------------------------------

  private resolveConfig(partial: Partial<OceanConfig>): OceanConfig {
    const defaults: OceanConfig = {
      size: 1000,
      resolution: 256,
      waveHeight: 2.0,
      waveLength: 30,
      windDirection: [1.0, 0.0],
      time: 0,
      windSpeed: 10,
      deepColor: new THREE.Color(0x001830),
      shallowColor: new THREE.Color(0x40c0b0),
      foamColor: new THREE.Color(0xffffff),
      foamThreshold: 0.8,
    };
    return { ...defaults, ...partial };
  }

  /**
   * Generate 4-8 Gerstner wave components with varying amplitudes,
   * frequencies, directions, and steepness based on config.
   */
  private generateWaveComponents(): GerstnerWave[] {
    const waves: GerstnerWave[] = [];
    const windDir = this.normalizeDirection(this.config.windDirection);

    // Number of wave components
    const waveCount = 6;

    for (let i = 0; i < waveCount; i++) {
      // Spectral distribution — longer waves have larger amplitude
      const freqMultiplier = Math.pow(2, i); // 1, 2, 4, 8, 16, 32
      const wavelength = this.config.waveLength / freqMultiplier;
      const amplitude = this.config.waveHeight / freqMultiplier;

      // Deep-water dispersion: speed = sqrt(g * wavelength / 2pi)
      const g = 9.81;
      const speed = Math.sqrt((g * wavelength) / (2 * Math.PI));

      // Slightly vary direction per component for natural look
      const angleOffset = (i - waveCount / 2) * 0.15;
      const cosA = Math.cos(angleOffset);
      const sinA = Math.sin(angleOffset);
      const dx = windDir[0] * cosA - windDir[1] * sinA;
      const dz = windDir[0] * sinA + windDir[1] * cosA;

      // Steepness: lower for swells, higher for wind waves
      const steepness = Math.min(1.0, (i + 1) * 0.15);

      waves.push({
        amplitude,
        wavelength,
        speed,
        direction: [dx, dz],
        steepness,
      });
    }

    return waves;
  }

  private normalizeDirection(d: [number, number]): [number, number] {
    const len = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
    if (len < 1e-6) return [1.0, 0.0];
    return [d[0] / len, d[1] / len];
  }

  // ------------------------------------------------------------------
  // Shader construction
  // ------------------------------------------------------------------

  private createOceanShader(): THREE.ShaderMaterial {
    // Pack wave data into uniform arrays (max 8 waves supported in shader)
    const maxWaves = 8;
    const waveCount = Math.min(this.waves.length, maxWaves);

    const uAmplitudes = new Float32Array(maxWaves);
    const uWavelengths = new Float32Array(maxWaves);
    const uSpeeds = new Float32Array(maxWaves);
    const uDirections = new Float32Array(maxWaves * 2);
    const uSteepnesses = new Float32Array(maxWaves);

    for (let i = 0; i < maxWaves; i++) {
      if (i < waveCount) {
        const w = this.waves[i];
        uAmplitudes[i] = w.amplitude;
        uWavelengths[i] = w.wavelength;
        uSpeeds[i] = w.speed;
        uDirections[i * 2] = w.direction[0];
        uDirections[i * 2 + 1] = w.direction[1];
        uSteepnesses[i] = w.steepness;
      }
    }

    const uniforms = {
      uTime: { value: this.config.time },
      uWaveCount: { value: waveCount },
      uAmplitudes: { value: uAmplitudes },
      uWavelengths: { value: uWavelengths },
      uSpeeds: { value: uSpeeds },
      uDirections: { value: uDirections },
      uSteepnesses: { value: uSteepnesses },
      uWaveHeight: { value: this.config.waveHeight },
      uDeepColor: { value: this.config.deepColor },
      uShallowColor: { value: this.config.shallowColor },
      uFoamColor: { value: this.config.foamColor },
      uFoamThreshold: { value: this.config.foamThreshold },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
      uCameraPosition: { value: new THREE.Vector3() },
    };

    // ---- Vertex Shader ----
    const vertexShader = /* glsl */ `
      uniform float uTime;
      uniform int uWaveCount;
      uniform float uAmplitudes[8];
      uniform float uWavelengths[8];
      uniform float uSpeeds[8];
      uniform float uDirections[16]; // 8 * 2
      uniform float uSteepnesses[8];
      uniform float uWaveHeight;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying vec2 vUv;
      varying float vFoam;

      // Gerstner wave displacement for a single wave component
      vec3 gerstnerWave(
        int idx,
        vec3 pos,
        float time,
        out vec3 tangent,
        out vec3 binormal
      ) {
        float A = uAmplitudes[idx];
        float L = uWavelengths[idx];
        float S = uSpeeds[idx];
        float Dx = uDirections[idx * 2];
        float Dz = uDirections[idx * 2 + 1];
        float Q = uSteepnesses[idx];

        float k = 2.0 * 3.14159265 / L;
        float w = k * S;
        float f = w * time - k * (Dx * pos.x + Dz * pos.z);

        float sinF = sin(f);
        float cosF = cos(f);

        // Displacement
        vec3 displacement;
        displacement.x = Q * A * Dx * cosF;
        displacement.z = Q * A * Dz * cosF;
        displacement.y = A * sinF;

        // Partial derivatives for normal computation
        float WAk = w * A / k;
        tangent = vec3(
          1.0 - Q * Dx * Dx * WAk * sinF,
          Dx * WAk * cosF,
          -Q * Dx * Dz * WAk * sinF
        );
        binormal = vec3(
          -Q * Dx * Dz * WAk * sinF,
          Dz * WAk * cosF,
          1.0 - Q * Dz * Dz * WAk * sinF
        );

        return displacement;
      }

      void main() {
        vUv = uv;

        vec3 pos = position;
        vec3 totalDisplacement = vec3(0.0);
        vec3 totalTangent = vec3(1.0, 0.0, 0.0);
        vec3 totalBinormal = vec3(0.0, 0.0, 1.0);

        // Accumulate wave displacements
        for (int i = 0; i < 8; i++) {
          if (i >= uWaveCount) break;

          vec3 tangent;
          vec3 binormal;
          vec3 displacement = gerstnerWave(i, pos, uTime, tangent, binormal);

          totalDisplacement += displacement;
          totalTangent += tangent;
          totalBinormal += binormal;
        }

        vec3 displaced = pos + totalDisplacement;

        // Compute normal from accumulated tangent and binormal
        vNormal = normalize(cross(totalBinormal, totalTangent));

        // World position for fragment shader
        vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

        // Wave height for depth coloring and foam
        vWaveHeight = totalDisplacement.y;

        // Foam — where displacement exceeds threshold relative to max height
        float normalizedHeight = totalDisplacement.y / max(uWaveHeight, 0.001);
        vFoam = smoothstep(uFoamThreshold, 1.0, normalizedHeight);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `;

    // ---- Fragment Shader ----
    const fragmentShader = /* glsl */ `
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform float uFoamThreshold;
      uniform float uWaveHeight;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uCameraPosition;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWaveHeight;
      varying vec2 vUv;
      varying float vFoam;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

        // ---- Depth-based water color ----
        // Exponential depth coloring: deeper = darker blue
        float depthFactor = 1.0 - exp(-max(vWaveHeight + uWaveHeight, 0.0) * 0.3);
        depthFactor = clamp(depthFactor, 0.0, 1.0);
        vec3 waterColor = mix(uShallowColor, uDeepColor, depthFactor);

        // ---- Fresnel effect ----
        // Schlick's approximation for reflection/refraction blending
        float fresnelBase = 1.0 - max(dot(viewDir, normal), 0.0);
        float fresnel = pow(fresnelBase, 4.0);
        // Blend toward sky/reflection color at grazing angles
        vec3 skyColor = vec3(0.5, 0.7, 0.9);
        waterColor = mix(waterColor, skyColor, fresnel * 0.5);

        // ---- Specular highlights (sun reflection) ----
        vec3 halfDir = normalize(uSunDirection + viewDir);
        float specAngle = max(dot(normal, halfDir), 0.0);
        // Dual-lobe specular: broad + sharp
        float specBroad = pow(specAngle, 64.0) * 0.4;
        float specSharp = pow(specAngle, 512.0) * 1.5;
        vec3 specular = uSunColor * (specBroad + specSharp);

        // ---- Subsurface scattering approximation ----
        // Light passing through thin wave lips (back-lit crests)
        float sssDot = max(dot(viewDir, -uSunDirection), 0.0);
        float sss = pow(sssDot, 4.0) * 0.25;
        // SSS color — warm turquoise glow
        vec3 sssColor = vec3(0.0, 0.6, 0.4) * sss * (1.0 - depthFactor);

        // ---- Foam ----
        // Foam at wave crests with noise-like breakup
        float foamNoise = fract(sin(dot(vUv * 50.0, vec2(12.9898, 78.233))) * 43758.5453);
        float foamMask = vFoam * smoothstep(0.3, 0.6, foamNoise);
        // Edge foam (where Fresnel is strong + near crests)
        float edgeFoam = fresnelBase * smoothstep(0.4, 0.7, vWaveHeight / max(uWaveHeight, 0.001));
        float totalFoam = clamp(foamMask + edgeFoam * 0.3, 0.0, 1.0);

        // ---- Combine ----
        vec3 finalColor = waterColor + specular + sssColor;
        finalColor = mix(finalColor, uFoamColor, totalFoam);

        // Diffuse lighting for overall shading
        float diffuse = max(dot(normal, uSunDirection), 0.0) * 0.3 + 0.7;
        finalColor *= diffuse;

        // Alpha: transparent at grazing angles, opaque from above
        float alpha = mix(0.7, 0.95, 1.0 - fresnelBase);
        alpha = mix(alpha, 1.0, totalFoam);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `;

    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  // ------------------------------------------------------------------
  // Update / Animation
  // ------------------------------------------------------------------

  /**
   * Advance the wave animation by dt seconds
   */
  update(dt: number): void {
    this.time += dt;
    if (this.material.uniforms) {
      this.material.uniforms.uTime.value = this.time;
    }
  }

  /**
   * Sync camera position uniform (call each frame before render)
   */
  setCameraPosition(camPos: THREE.Vector3): void {
    if (this.material.uniforms) {
      this.material.uniforms.uCameraPosition.value.copy(camPos);
    }
  }

  // ------------------------------------------------------------------
  // CPU-side queries
  // ------------------------------------------------------------------

  /**
   * Returns the wave height at world position (x, z).
   * Uses the same Gerstner wave equations as the GPU shader.
   */
  getHeightAt(x: number, z: number): number {
    let y = 0;
    for (const wave of this.waves) {
      const k = (2 * Math.PI) / wave.wavelength;
      const w = k * wave.speed;
      const f = w * this.time - k * (wave.direction[0] * x + wave.direction[1] * z);
      y += wave.amplitude * Math.sin(f);
    }
    return y;
  }

  /**
   * Returns the surface normal at world position (x, z).
   * Computed analytically from Gerstner wave partial derivatives.
   */
  getNormalAt(x: number, z: number): THREE.Vector3 {
    let tangentX = 1.0;
    let tangentY = 0.0;
    let tangentZ = 0.0;
    let binormalX = 0.0;
    let binormalY = 0.0;
    let binormalZ = 1.0;

    for (const wave of this.waves) {
      const A = wave.amplitude;
      const L = wave.wavelength;
      const S = wave.speed;
      const Dx = wave.direction[0];
      const Dz = wave.direction[1];
      const Q = wave.steepness;

      const k = (2 * Math.PI) / L;
      const w = k * S;
      const f = w * this.time - k * (Dx * x + Dz * z);

      const sinF = Math.sin(f);
      const cosF = Math.cos(f);

      const WAk = (w * A) / k;

      tangentX += -Q * Dx * Dx * WAk * sinF;
      tangentY += Dx * WAk * cosF;
      tangentZ += -Q * Dx * Dz * WAk * sinF;

      binormalX += -Q * Dx * Dz * WAk * sinF;
      binormalY += Dz * WAk * cosF;
      binormalZ += -Q * Dz * Dz * WAk * sinF;
    }

    // normal = cross(binormal, tangent)
    const nx = binormalY * tangentZ - binormalZ * tangentY;
    const ny = binormalZ * tangentX - binormalX * tangentZ;
    const nz = binormalX * tangentY - binormalY * tangentX;

    return new THREE.Vector3(nx, ny, nz).normalize();
  }

  // ------------------------------------------------------------------
  // Accessors
  // ------------------------------------------------------------------

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  getWaves(): GerstnerWave[] {
    return [...this.waves];
  }

  getConfig(): OceanConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime (rebuilds waves if needed)
   */
  updateConfig(partial: Partial<OceanConfig>): void {
    const needsWaveRebuild =
      partial.waveHeight !== undefined ||
      partial.waveLength !== undefined ||
      partial.windDirection !== undefined ||
      partial.windSpeed !== undefined;

    Object.assign(this.config, partial);

    if (needsWaveRebuild) {
      this.waves = this.generateWaveComponents();
      // Re-upload wave uniforms
      const waveCount = Math.min(this.waves.length, 8);
      const uAmplitudes = this.material.uniforms.uAmplitudes.value as Float32Array;
      const uWavelengths = this.material.uniforms.uWavelengths.value as Float32Array;
      const uSpeeds = this.material.uniforms.uSpeeds.value as Float32Array;
      const uDirections = this.material.uniforms.uDirections.value as Float32Array;
      const uSteepnesses = this.material.uniforms.uSteepnesses.value as Float32Array;

      for (let i = 0; i < 8; i++) {
        if (i < waveCount) {
          const w = this.waves[i];
          uAmplitudes[i] = w.amplitude;
          uWavelengths[i] = w.wavelength;
          uSpeeds[i] = w.speed;
          uDirections[i * 2] = w.direction[0];
          uDirections[i * 2 + 1] = w.direction[1];
          uSteepnesses[i] = w.steepness;
        } else {
          uAmplitudes[i] = 0;
          uWavelengths[i] = 1;
          uSpeeds[i] = 0;
          uDirections[i * 2] = 0;
          uDirections[i * 2 + 1] = 0;
          uSteepnesses[i] = 0;
        }
      }

      this.material.uniforms.uWaveCount.value = waveCount;
    }

    // Update non-wave uniforms
    if (partial.deepColor) this.material.uniforms.uDeepColor.value = this.config.deepColor;
    if (partial.shallowColor) this.material.uniforms.uShallowColor.value = this.config.shallowColor;
    if (partial.foamColor) this.material.uniforms.uFoamColor.value = this.config.foamColor;
    if (partial.foamThreshold !== undefined) this.material.uniforms.uFoamThreshold.value = this.config.foamThreshold;
    if (partial.waveHeight !== undefined) this.material.uniforms.uWaveHeight.value = this.config.waveHeight;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ============================================================================
// OceanSystem — high-level controller
// ============================================================================

export class OceanSystem {
  private surface: OceanSurface;
  private group: THREE.Group;
  private time: number = 0;
  private underwaterFog: THREE.FogExp2 | null = null;

  constructor(config: Partial<OceanConfig> = {}) {
    this.surface = new OceanSurface(config);
    this.group = new THREE.Group();
    this.group.add(this.surface.getMesh());

    // Optional underwater fog
    if (config.deepColor) {
      this.underwaterFog = new THREE.FogExp2(config.deepColor.getHex(), 0.015);
    }
  }

  /**
   * Advance wave animation by dt seconds.
   * Should be called each frame.
   */
  update(dt: number): void {
    this.time += dt;
    this.surface.update(dt);
  }

  /**
   * Sync camera position for Fresnel/specular computations.
   * Call each frame before rendering.
   */
  setCameraPosition(camPos: THREE.Vector3): void {
    this.surface.setCameraPosition(camPos);
  }

  /**
   * Returns the wave height at world position (x, z).
   */
  getHeightAt(x: number, z: number): number {
    return this.surface.getHeightAt(x, z);
  }

  /**
   * Returns the surface normal at world position (x, z).
   */
  getNormalAt(x: number, z: number): THREE.Vector3 {
    return this.surface.getNormalAt(x, z);
  }

  /**
   * Get the Three.js group containing the ocean mesh.
   */
  getObject(): THREE.Group {
    return this.group;
  }

  /**
   * Get the ocean surface for direct access.
   */
  getSurface(): OceanSurface {
    return this.surface;
  }

  /**
   * Get the underwater fog, if enabled.
   */
  getUnderwaterFog(): THREE.FogExp2 | null {
    return this.underwaterFog;
  }

  /**
   * Enable or configure underwater fog.
   */
  setUnderwaterFog(color?: THREE.Color, density?: number): void {
    const fogColor = color || this.surface.getConfig().deepColor;
    const fogDensity = density ?? 0.015;
    this.underwaterFog = new THREE.FogExp2(fogColor.getHex(), fogDensity);
  }

  /**
   * Update ocean configuration at runtime.
   */
  updateConfig(config: Partial<OceanConfig>): void {
    this.surface.updateConfig(config);
  }

  /**
   * Get the current ocean configuration.
   */
  getConfig(): OceanConfig {
    return this.surface.getConfig();
  }

  dispose(): void {
    this.surface.dispose();
  }
}
