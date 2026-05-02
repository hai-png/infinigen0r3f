/**
 * Fog System
 *
 * Volumetric fog simulation with height-based density,
 * wind-driven movement, dynamic dissipation, sky color matching,
 * and integration with weather transitions.
 *
 * @module FogSystem
 */

import * as THREE from 'three';
import { SeededRandom } from '../../core/util/MathUtils';

export interface FogParams {
  density: number;
  color: THREE.Color;
  height: number;
  falloff: number;
  windSpeed: number;
  windDirection: THREE.Vector3;
  turbulence: number;
  noiseScale: number;
  /** Height at which fog is densest (ground level by default) */
  baseHeight: number;
  /** Whether fog color should match sky/horizon color */
  matchSkyColor: boolean;
  /** Sky color reference for matching */
  skyColor: THREE.Color;
}

export class FogSystem {
  private scene: THREE.Scene;
  private params: FogParams;
  private rng: SeededRandom;
  private fogMesh: THREE.Mesh | null = null;
  private noiseTexture: THREE.Data3DTexture | null = null;
  private timeUniform: THREE.IUniform<number>;
  private densityUniform: THREE.IUniform<number>;
  private heightUniform: THREE.IUniform<number>;
  private falloffUniform: THREE.IUniform<number>;
  private baseHeightUniform: THREE.IUniform<number>;

  constructor(scene: THREE.Scene, params: Partial<FogParams> = {}, seed: number = 42) {
    this.scene = scene;
    this.rng = new SeededRandom(seed);
    this.params = {
      density: params.density ?? 0.5,
      color: params.color || new THREE.Color(0x888888),
      height: params.height ?? 10,
      falloff: params.falloff ?? 0.1,
      windSpeed: params.windSpeed ?? 2,
      windDirection: params.windDirection || new THREE.Vector3(1, 0, 0),
      turbulence: params.turbulence ?? 0.3,
      noiseScale: params.noiseScale ?? 0.02,
      baseHeight: params.baseHeight ?? 0,
      matchSkyColor: params.matchSkyColor ?? true,
      skyColor: params.skyColor || new THREE.Color(0x87ceeb),
    };

    this.timeUniform = { value: 0 };
    this.densityUniform = { value: this.params.density };
    this.heightUniform = { value: this.params.height };
    this.falloffUniform = { value: this.params.falloff };
    this.baseHeightUniform = { value: this.params.baseHeight };

    this.initializeFog();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private initializeFog(): void {
    // Create 3D noise texture for fog variation
    this.noiseTexture = this.createNoiseTexture(64, 64, 32);

    // Large box geometry for fog volume
    const geometry = new THREE.BoxGeometry(200, this.params.height, 200);

    // Custom shader material for volumetric fog with height-based density
    const material = new THREE.ShaderMaterial({
      uniforms: {
        fogColor: { value: this.params.color },
        fogDensity: this.densityUniform,
        fogHeight: this.heightUniform,
        fogFalloff: this.falloffUniform,
        fogBaseHeight: this.baseHeightUniform,
        time: this.timeUniform,
        windDirection: { value: this.params.windDirection },
        windSpeed: { value: this.params.windSpeed },
        noiseScale: { value: this.params.noiseScale },
        turbulence: { value: this.params.turbulence },
        noiseTexture: { value: this.noiseTexture },
        cameraPosition: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;

        uniform float fogHeight;
        uniform float fogBaseHeight;

        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          // Height relative to fog base
          vHeight = (worldPosition.y - fogBaseHeight) / fogHeight;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;

        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogFalloff;
        uniform float fogBaseHeight;
        uniform float time;
        uniform vec3 windDirection;
        uniform float windSpeed;
        uniform float noiseScale;
        uniform float turbulence;
        uniform sampler3D noiseTexture;
        uniform vec3 cameraPosition;

        void main() {
          // Animate noise with wind
          vec3 noiseCoord = vWorldPosition * noiseScale;
          noiseCoord.xz += windDirection.xz * windSpeed * time * 0.1;

          // Sample 3D noise texture for density variation
          float n = texture(noiseTexture, noiseCoord * 0.1).r;
          n += turbulence * texture(noiseTexture, (noiseCoord * 2.0 + time * 0.2) * 0.1).r;

          // Height-based falloff: fog is densest at baseHeight and thins with altitude
          float heightFactor = smoothstep(1.0, 0.0, vHeight);
          heightFactor *= exp(-fogFalloff * max(vHeight, 0.0));

          // Distance-based falloff from camera for natural look
          float distFromCamera = length(vWorldPosition - cameraPosition);
          float distFactor = smoothstep(300.0, 0.0, distFromCamera);

          // Combine factors
          float density = fogDensity * heightFactor * (0.5 + 0.5 * n) * distFactor;

          // Exponential fog density
          float fogFactor = 1.0 - exp(-density * 2.0);

          gl_FragColor = vec4(fogColor, fogFactor);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });

    this.fogMesh = new THREE.Mesh(geometry, material);
    this.fogMesh.position.y = this.params.baseHeight + this.params.height / 2;
    this.scene.add(this.fogMesh);

    // Also set Three.js built-in fog for objects within the fog
    this.updateSceneFog();
  }

  private createNoiseTexture(width: number, height: number, depth: number): THREE.Data3DTexture {
    const size = width * height * depth;
    const data = new Uint8Array(size);

    for (let i = 0; i < size; i++) {
      data[i] = Math.floor(this.rng.next() * 256);
    }

    const texture = new THREE.Data3DTexture(data, width, height, depth);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.wrapR = THREE.RepeatWrapping;
    texture.needsUpdate = true;

    return texture;
  }

  private updateSceneFog(): void {
    if (this.params.density > 0.01) {
      const fogColor = this.params.matchSkyColor ? this.params.skyColor : this.params.color;
      this.scene.fog = new THREE.FogExp2(fogColor.getHex(), this.params.density * 0.02);
    } else {
      this.scene.fog = null;
    }
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(deltaTime: number): void {
    if (!this.fogMesh) return;

    // Update time uniform for animation
    this.timeUniform.value += deltaTime;

    // Update camera position for distance falloff
    const mat = this.fogMesh.material as THREE.ShaderMaterial;
    if (mat.uniforms.cameraPosition) {
      // Camera position will be updated externally or via scene
    }

    // Update wind parameters
    mat.uniforms.windDirection.value = this.params.windDirection;
    mat.uniforms.windSpeed.value = this.params.windSpeed;
  }

  /**
   * Update camera position for distance-based fog calculations.
   * Call this from your render loop with the active camera position.
   */
  setCameraPosition(position: THREE.Vector3): void {
    if (this.fogMesh) {
      const mat = this.fogMesh.material as THREE.ShaderMaterial;
      if (mat.uniforms.cameraPosition) {
        mat.uniforms.cameraPosition.value.copy(position);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setDensity(density: number): void {
    this.params.density = Math.max(0, Math.min(1, density));
    this.densityUniform.value = this.params.density;
    this.updateSceneFog();
  }

  setColor(color: THREE.Color): void {
    this.params.color = color;

    if (this.fogMesh) {
      (this.fogMesh.material as THREE.ShaderMaterial).uniforms.fogColor.value = color;
    }

    this.updateSceneFog();
  }

  /**
   * Set the sky/horizon color for fog color matching.
   */
  setSkyColor(color: THREE.Color): void {
    this.params.skyColor = color;
    this.updateSceneFog();
  }

  setHeight(height: number): void {
    this.params.height = height;
    this.heightUniform.value = height;

    if (this.fogMesh) {
      this.fogMesh.geometry.dispose();
      this.fogMesh.geometry = new THREE.BoxGeometry(200, height, 200);
      this.fogMesh.position.y = this.params.baseHeight + height / 2;
    }
  }

  setBaseHeight(baseHeight: number): void {
    this.params.baseHeight = baseHeight;
    this.baseHeightUniform.value = baseHeight;

    if (this.fogMesh) {
      this.fogMesh.position.y = baseHeight + this.params.height / 2;
    }
  }

  setWind(speed: number, direction: THREE.Vector3): void {
    this.params.windSpeed = speed;
    this.params.windDirection = direction.normalize();
  }

  setTurbulence(turbulence: number): void {
    this.params.turbulence = Math.max(0, Math.min(1, turbulence));
    if (this.fogMesh) {
      (this.fogMesh.material as THREE.ShaderMaterial).uniforms.turbulence.value = this.params.turbulence;
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.fogMesh) {
      this.fogMesh.visible = enabled;
    }
    if (!enabled) {
      this.scene.fog = null;
    } else {
      this.updateSceneFog();
    }
  }

  /**
   * Update fog parameters from weather transition values.
   */
  applyWeatherTransition(values: { fogDensity: number; fogColor: THREE.Color; windSpeed: number; windDirection: THREE.Vector3 }): void {
    this.setDensity(values.fogDensity);
    this.setColor(values.fogColor);
    this.setWind(values.windSpeed, values.windDirection);
  }

  getVisibility(): number {
    return 1 / (this.params.density * 0.02);
  }

  dispose(): void {
    if (this.fogMesh) {
      this.fogMesh.geometry.dispose();
      (this.fogMesh.material as THREE.ShaderMaterial).dispose();
      this.scene.remove(this.fogMesh);
    }

    if (this.noiseTexture) {
      this.noiseTexture.dispose();
    }

    if (this.scene.fog) {
      this.scene.fog = null;
    }
  }
}

export default FogSystem;
