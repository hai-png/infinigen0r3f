/**
 * WindAnimationController - Coordinated wind animation for ALL vegetation types
 *
 * Features:
 * - Wind zones: global wind + local gusts
 * - Per-vertex displacement based on height, flexibility, wind exposure
 * - Frequency and amplitude based on wind speed
 * - Support for trees, grass, flowers, ferns, ivy
 * - Integration with external wind speed values
 * - Uses ShaderMaterial uniforms for GPU-driven animation
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface WindConfig {
  /** Global wind direction (normalized) */
  direction: THREE.Vector3;
  /** Base wind speed (m/s) */
  speed: number;
  /** Wind gust amplitude (0-1) */
  gustAmplitude: number;
  /** Wind gust frequency */
  gustFrequency: number;
  /** Maximum bend angle for vegetation (radians) */
  maxBendAngle: number;
  /** Height-based flex multiplier (treetops flex more) */
  heightFlexFactor: number;
  /** Leaf/thin branch flexibility */
  leafFlexibility: number;
  /** Thick branch flexibility */
  branchFlexibility: number;
  /** Trunk flexibility (very low) */
  trunkFlexibility: number;
}

export interface WindZone {
  /** Center of the gust zone */
  center: THREE.Vector3;
  /** Radius of influence */
  radius: number;
  /** Additional wind speed in this zone */
  speedMultiplier: number;
  /** Duration of the gust (seconds) */
  duration: number;
  /** Current elapsed time */
  elapsed: number;
}

// ============================================================================
// Wind Vertex Shader
// ============================================================================

const windVertexShader = `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform vec3 uWindDirection;
  uniform float uGustAmplitude;
  uniform float uGustFrequency;
  uniform float uMaxBendAngle;
  uniform float uHeightFlexFactor;
  uniform float uLeafFlexibility;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;

    vec3 pos = position;

    // Calculate height factor: 0 at ground, 1 at top
    float heightFactor = clamp(pos.y / 10.0, 0.0, 1.0);
    float heightFlex = heightFactor * heightFactor * uHeightFlexFactor;

    // Primary wind displacement
    float windPhase = pos.x * 0.3 + pos.z * 0.2 + uTime * uWindSpeed * 0.5;
    float primarySway = sin(windPhase) * uWindSpeed * 0.02 * heightFlex;

    // Secondary sway (higher frequency, lower amplitude)
    float secondaryPhase = pos.x * 0.7 - pos.z * 0.5 + uTime * uWindSpeed * 0.8;
    float secondarySway = sin(secondaryPhase) * uWindSpeed * 0.008 * heightFlex;

    // Gust effect
    float gustPhase = pos.x * 0.1 + uTime * uGustFrequency;
    float gust = sin(gustPhase) * uGustAmplitude * heightFlex * uWindSpeed * 0.015;

    // Apply displacement in wind direction
    float totalDisplacement = primarySway + secondarySway + gust;
    pos.x += uWindDirection.x * totalDisplacement;
    pos.z += uWindDirection.z * totalDisplacement;

    // Slight vertical compression when bending
    pos.y -= abs(totalDisplacement) * 0.1;

    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const windFragmentShader = `
  uniform vec3 uColor;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(vNormal, lightDir), 0.0) * 0.6 + 0.4;
    vec3 color = uColor * diffuse;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================================================
// WindAnimationController
// ============================================================================

export class WindAnimationController {
  private config: WindConfig;
  private time: number = 0;
  private windZones: WindZone[] = [];
  private animatedMaterials: Map<string, THREE.ShaderMaterial> = new Map();
  private animatedMeshes: Set<THREE.Mesh> = new Set();

  constructor(config: Partial<WindConfig> = {}) {
    this.config = {
      direction: new THREE.Vector3(1, 0, 0.3).normalize(),
      speed: 3.0,
      gustAmplitude: 0.4,
      gustFrequency: 0.3,
      maxBendAngle: Math.PI / 6,
      heightFlexFactor: 1.5,
      leafFlexibility: 1.0,
      branchFlexibility: 0.3,
      trunkFlexibility: 0.05,
      ...config,
    };
  }

  /**
   * Update wind animation. Call each frame.
   */
  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update wind gusts
    this.updateGusts(deltaTime);

    // Update all animated materials
    for (const [, material] of this.animatedMaterials) {
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = this.time;
      }
      if (material.uniforms.uWindSpeed) {
        material.uniforms.uWindSpeed.value = this.getEffectiveWindSpeed();
      }
      if (material.uniforms.uGustAmplitude) {
        material.uniforms.uGustAmplitude.value = this.getEffectiveGustAmplitude();
      }
    }

    // Animate tree meshes via JS (for non-shader trees)
    for (const mesh of this.animatedMeshes) {
      this.animateMeshSway(mesh, deltaTime);
    }
  }

  /**
   * Register a mesh for wind animation (uses JS-based sway)
   */
  registerMesh(mesh: THREE.Mesh, flexibility: number = 0.02): void {
    mesh.userData.windFlexibility = flexibility;
    mesh.userData.windOriginalRotation = mesh.rotation.clone();
    this.animatedMeshes.add(mesh);
  }

  /**
   * Unregister a mesh from wind animation
   */
  unregisterMesh(mesh: THREE.Mesh): void {
    this.animatedMeshes.delete(mesh);
  }

  /**
   * Register a group for wind animation (all child meshes)
   */
  registerGroup(group: THREE.Group, flexibility: number = 0.02): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.registerMesh(child, flexibility);
      }
    });
  }

  /**
   * Create a wind-animated ShaderMaterial for grass/vegetation
   */
  createWindMaterial(color: THREE.Color, cacheKey?: string): THREE.ShaderMaterial {
    const key = cacheKey ?? `wind-${color.getHex()}`;

    if (this.animatedMaterials.has(key)) {
      return this.animatedMaterials.get(key)!;
    }

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: this.time },
        uWindSpeed: { value: this.config.speed },
        uWindDirection: { value: this.config.direction.clone() },
        uGustAmplitude: { value: this.config.gustAmplitude },
        uGustFrequency: { value: this.config.gustFrequency },
        uMaxBendAngle: { value: this.config.maxBendAngle },
        uHeightFlexFactor: { value: this.config.heightFlexFactor },
        uLeafFlexibility: { value: this.config.leafFlexibility },
        uColor: { value: color.clone() },
      },
      vertexShader: windVertexShader,
      fragmentShader: windFragmentShader,
      side: THREE.DoubleSide,
    });

    this.animatedMaterials.set(key, material);
    return material;
  }

  /**
   * Add a local wind gust zone
   */
  addGust(center: THREE.Vector3, radius: number, speedMultiplier: number, duration: number): void {
    this.windZones.push({
      center,
      radius,
      speedMultiplier,
      duration,
      elapsed: 0,
    });
  }

  /**
   * Set global wind speed
   */
  setWindSpeed(speed: number): void {
    this.config.speed = speed;
  }

  /**
   * Set global wind direction
   */
  setWindDirection(direction: THREE.Vector3): void {
    this.config.direction.copy(direction).normalize();
  }

  /**
   * Get the effective wind speed (base + gusts)
   */
  getEffectiveWindSpeed(): number {
    let speed = this.config.speed;
    // Add a subtle global oscillation
    speed += Math.sin(this.time * 0.5) * this.config.speed * 0.1;
    return Math.max(0, speed);
  }

  /**
   * Get effective gust amplitude
   */
  private getEffectiveGustAmplitude(): number {
    return this.config.gustAmplitude * (1 + Math.sin(this.time * this.config.gustFrequency) * 0.5);
  }

  /**
   * Update wind gust zones
   */
  private updateGusts(deltaTime: number): void {
    for (let i = this.windZones.length - 1; i >= 0; i--) {
      this.windZones[i].elapsed += deltaTime;
      if (this.windZones[i].elapsed >= this.windZones[i].duration) {
        this.windZones.splice(i, 1);
      }
    }

    // Occasionally spawn random gusts
    if (Math.random() < 0.001) {
      this.addGust(
        new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          0,
          (Math.random() - 0.5) * 40
        ),
        5 + Math.random() * 10,
        1.5 + Math.random() * 2,
        3 + Math.random() * 5
      );
    }
  }

  /**
   * JS-based sway animation for meshes
   */
  private animateMeshSway(mesh: THREE.Mesh, deltaTime: number): void {
    const flexibility = mesh.userData.windFlexibility ?? 0.02;
    const original = mesh.userData.windOriginalRotation as THREE.Euler | undefined;
    if (!original) return;

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    // Height factor: higher objects sway more
    const heightFactor = Math.min(worldPos.y / 15, 1);

    // Wind sway based on time
    const swayX = Math.sin(this.time * this.config.speed * 0.3 + worldPos.x * 0.1) *
                  flexibility * heightFactor * this.config.speed;
    const swayZ = Math.cos(this.time * this.config.speed * 0.2 + worldPos.z * 0.1) *
                  flexibility * heightFactor * this.config.speed * 0.6;

    // Gust influence
    let gustMultiplier = 1;
    for (const zone of this.windZones) {
      const dist = worldPos.distanceTo(zone.center);
      if (dist < zone.radius) {
        const falloff = 1 - dist / zone.radius;
        const fade = 1 - zone.elapsed / zone.duration;
        gustMultiplier += falloff * fade * (zone.speedMultiplier - 1);
      }
    }

    mesh.rotation.x = original.x + swayX * gustMultiplier;
    mesh.rotation.z = original.z + swayZ * gustMultiplier;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.animatedMaterials.forEach(mat => mat.dispose());
    this.animatedMaterials.clear();
    this.animatedMeshes.clear();
    this.windZones = [];
  }
}
