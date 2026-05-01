/**
 * ShellTextureFur - Shell-texture fur rendering technique
 *
 * Implements Princeton Infinigen's shell-texture fur approach:
 * Multiple semi-transparent layers (shells) are rendered over the surface,
 * each slightly offset along the normal, with randomized hair placement.
 * This creates a convincing fur effect without actual geometry per hair strand.
 *
 * Lower layers have sparse hair coverage; upper layers have dense coverage.
 * Each layer uses alpha test to discard fragments where no hair should appear.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Configuration
// ============================================================================

export interface ShellTextureFurConfig {
  /** Number of shell layers (default 16) */
  shellCount: number;
  /** Total fur length in world units (default 0.05) */
  furLength: number;
  /** Hair density factor 0-1 (default 0.8) */
  furDensity: number;
  /** Base fur color */
  furColor: THREE.Color;
  /** Tip fur color (gradient from base to tip along fur length) */
  tipColor: THREE.Color;
  /** Undercoat color visible at the base */
  undercoatColor: THREE.Color;
  /** Hair direction in tangent space (default [0, 1, 0] = up) */
  hairDirection: THREE.Vector3;
  /** Seed for deterministic noise (default 42) */
  seed: number;
  /** Wind sway amplitude (default 0.0) */
  windAmplitude: number;
  /** Wind sway frequency (default 1.0) */
  windFrequency: number;
}

export const DEFAULT_FUR_CONFIG: ShellTextureFurConfig = {
  shellCount: 16,
  furLength: 0.05,
  furDensity: 0.8,
  furColor: new THREE.Color(0x8b7355),
  tipColor: new THREE.Color(0xa08060),
  undercoatColor: new THREE.Color(0x5d4037),
  hairDirection: new THREE.Vector3(0, 1, 0),
  seed: 42,
  windAmplitude: 0.0,
  windFrequency: 1.0,
};

// ============================================================================
// GLSL Shaders
// ============================================================================

const FUR_VERTEX_SHADER = /* glsl */ `
  uniform float uLayerIndex;
  uniform float uTotalLayers;
  uniform float uFurLength;
  uniform float uTime;
  uniform vec3 uHairDirection;
  uniform float uWindAmplitude;
  uniform float uWindFrequency;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vLayerHeight; // 0 at base, 1 at tip

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Height ratio for this shell layer
    float heightRatio = uLayerIndex / uTotalLayers;
    vLayerHeight = heightRatio;

    // Displace along vertex normal by the layer offset
    vec3 displaced = position + normal * heightRatio * uFurLength;

    // Wind sway - increases with height
    float windEffect = heightRatio * heightRatio * uWindAmplitude;
    float windPhase = uTime * uWindFrequency;
    displaced.x += sin(displaced.z * 3.0 + windPhase) * windEffect;
    displaced.z += cos(displaced.x * 2.5 + windPhase * 0.7) * windEffect * 0.5;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FUR_FRAGMENT_SHADER = /* glsl */ `
  uniform float uLayerIndex;
  uniform float uTotalLayers;
  uniform float uFurDensity;
  uniform vec3 uFurColor;
  uniform vec3 uTipColor;
  uniform vec3 uUndercoatColor;
  uniform vec3 uHairDirection;
  uniform float uTime;
  uniform float uSeed;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vLayerHeight;

  // --- Deterministic hash functions (no texture lookups) ---
  // Integer hash based on Hugo Elias's approach
  float intHash(float n) {
    n = fract(n * 0.1031);
    n *= n + 33.33;
    n *= n + n;
    return fract(n);
  }

  float intHash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // 2D value noise
  float valueNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Smoothstep
    vec2 u = f * f * (3.0 - 2.0 * f);

    float a = intHash2(i);
    float b = intHash2(i + vec2(1.0, 0.0));
    float c = intHash2(i + vec2(0.0, 1.0));
    float d = intHash2(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // FBM for finer detail
  float fbm2D(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      value += amplitude * valueNoise2D(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  // --- Hair density function ---
  // Returns 1.0 where hair should appear, 0.0 where it should not.
  // Lower shells have sparse hair; upper shells have dense coverage.
  float hairDensity(vec2 uv, float layerHeight) {
    // Scale UV by density to control hair cell size
    float densityScale = mix(8.0, 20.0, uFurDensity);
    vec2 cellUV = uv * densityScale;

    // Add seed offset for determinism
    float seedOffset = intHash(uSeed) * 100.0;
    cellUV += vec2(seedOffset, seedOffset * 0.7);

    // Get the cell coordinates
    vec2 cell = floor(cellUV);
    vec2 localUV = fract(cellUV);

    // Use hash to determine if this cell has hair
    float cellHash = intHash2(cell);

    // Density threshold: lower layers are sparse, upper layers are dense
    // At the base (layerHeight=0), only a fraction of cells have hair
    // At the tip (layerHeight=1), nearly all cells have hair
    float densityThreshold = mix(0.3, 1.0, layerHeight) * uFurDensity;

    if (cellHash > densityThreshold) {
      return 0.0; // No hair in this cell
    }

    // Distance from cell center (for hair strand shape)
    vec2 hairCenter = vec2(
      intHash(cellHash + 0.1),
      intHash(cellHash + 0.2)
    ) * 0.4 + 0.3; // Center within 0.3-0.7 range

    // Anisotropic stretching along hair direction
    // Simulate hair direction in UV space
    vec2 dir = normalize(uHairDirection.xy + vec2(0.001));
    float strandWidth = mix(0.12, 0.06, layerHeight); // Thinner at tips

    // Rotate local UV to align with hair direction
    float cosA = dir.x;
    float sinA = dir.y;
    vec2 rotated = vec2(
      localUV.x * cosA + localUV.y * sinA,
      -localUV.x * sinA + localUV.y * cosA
    );

    // Elliptical hair strand shape (stretched along direction)
    vec2 diff = rotated - hairCenter;
    diff.x /= max(strandWidth * 3.0, 0.001); // Stretch along direction
    diff.y /= max(strandWidth, 0.001);        // Narrow across direction

    float dist = dot(diff, diff);

    // Soft edge for anti-aliasing
    float edge = 1.0 - smoothstep(0.5, 1.0, dist);

    return edge;
  }

  void main() {
    // Compute hair density at this fragment
    float hair = hairDensity(vUv, vLayerHeight);

    // Alpha test - discard fragments where no hair appears
    if (hair < 0.1) {
      discard;
    }

    // --- Color computation ---
    // Gradient from undercoat -> base -> tip along fur height
    vec3 baseColor;
    if (vLayerHeight < 0.2) {
      // Undercoat region
      float t = vLayerHeight / 0.2;
      baseColor = mix(uUndercoatColor, uFurColor, t);
    } else {
      // Base to tip region
      float t = (vLayerHeight - 0.2) / 0.8;
      baseColor = mix(uFurColor, uTipColor, t);
    }

    // Add per-strand color variation using noise
    float colorVariation = fbm2D(vUv * 12.0 + uSeed, 3) * 0.15 - 0.075;
    baseColor += colorVariation;

    // --- Lighting ---
    // Simple diffuse + ambient + rim lighting per shell
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3)); // Default directional light
    vec3 normal = normalize(vNormal);

    float NdotL = max(dot(normal, lightDir), 0.0);

    // Ambient
    vec3 ambient = baseColor * 0.35;

    // Diffuse
    vec3 diffuse = baseColor * NdotL * 0.6;

    // Rim lighting (backlight for fur translucency)
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rimFactor = 1.0 - max(dot(viewDir, normal), 0.0);
    rimFactor = pow(rimFactor, 3.0) * 0.3;
    vec3 rim = uTipColor * rimFactor * (0.5 + vLayerHeight * 0.5);

    vec3 finalColor = ambient + diffuse + rim;

    // Alpha based on hair density and layer height
    // Root layers are more opaque; tip layers are more transparent
    float alpha = hair * mix(1.0, 0.7, vLayerHeight);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// ============================================================================
// ShellTextureFurMaterial
// ============================================================================

/**
 * Custom ShaderMaterial for a single shell layer of the fur.
 * Each instance is configured for a specific layer index.
 */
export class ShellTextureFurMaterial extends THREE.ShaderMaterial {
  constructor(layerIndex: number, totalLayers: number, config: ShellTextureFurConfig) {
    super({
      vertexShader: FUR_VERTEX_SHADER,
      fragmentShader: FUR_FRAGMENT_SHADER,
      uniforms: {
        uLayerIndex: { value: layerIndex },
        uTotalLayers: { value: totalLayers },
        uFurLength: { value: config.furLength },
        uFurDensity: { value: config.furDensity },
        uFurColor: { value: config.furColor.clone() },
        uTipColor: { value: config.tipColor.clone() },
        uUndercoatColor: { value: config.undercoatColor.clone() },
        uHairDirection: { value: config.hairDirection.clone().normalize() },
        uTime: { value: 0.0 },
        uSeed: { value: config.seed },
        uWindAmplitude: { value: config.windAmplitude },
        uWindFrequency: { value: config.windFrequency },
      },
      transparent: true,
      depthWrite: layerIndex === 0, // Only base layer writes depth
      side: THREE.DoubleSide,
      alphaTest: 0.05,
    });

    this.name = `ShellFurMaterial_L${layerIndex}`;
  }

  /**
   * Update time uniform for animation
   */
  updateTime(time: number): void {
    this.uniforms.uTime.value = time;
  }

  /**
   * Update wind parameters
   */
  setWind(amplitude: number, frequency: number): void {
    this.uniforms.uWindAmplitude.value = amplitude;
    this.uniforms.uWindFrequency.value = frequency;
  }
}

// ============================================================================
// ShellTextureFurRenderer
// ============================================================================

/**
 * Takes a base mesh and fur configuration, generates layered shell meshes
 * that produce a convincing fur effect when rendered together.
 */
export class ShellTextureFurRenderer {
  private config: ShellTextureFurConfig;
  private shellMeshes: THREE.Mesh[] = [];
  private baseMesh: THREE.Mesh | null = null;
  private furGroup: THREE.Group;
  private materials: ShellTextureFurMaterial[] = [];
  private elapsedTime: number = 0;

  constructor(config: Partial<ShellTextureFurConfig> = {}) {
    this.config = { ...DEFAULT_FUR_CONFIG, ...config };
    // Deep clone colors so each renderer has its own instances
    this.config.furColor = (config.furColor ?? DEFAULT_FUR_CONFIG.furColor).clone();
    this.config.tipColor = (config.tipColor ?? DEFAULT_FUR_CONFIG.tipColor).clone();
    this.config.undercoatColor = (config.undercoatColor ?? DEFAULT_FUR_CONFIG.undercoatColor).clone();
    this.config.hairDirection = (config.hairDirection ?? DEFAULT_FUR_CONFIG.hairDirection).clone();

    this.furGroup = new THREE.Group();
    this.furGroup.name = 'ShellFurGroup';
  }

  /**
   * Generate the fur shell layers for a given base mesh.
   * Returns a Group containing the base mesh + all shell layers.
   *
   * @param mesh - The base mesh to cover with fur
   * @returns A THREE.Group containing the base mesh and all fur shells
   */
  generate(mesh: THREE.Mesh): THREE.Group {
    this.dispose(); // Clean up any previous state

    this.baseMesh = mesh;

    const geometry = mesh.geometry;
    const shellCount = this.config.shellCount;

    // Create shell layers
    for (let i = 0; i < shellCount; i++) {
      const material = new ShellTextureFurMaterial(i, shellCount, this.config);
      this.materials.push(material);

      // Each shell shares the same geometry as the base mesh;
      // the vertex shader displaces it along the normal based on layer index
      const shellMesh = new THREE.Mesh(geometry, material);
      shellMesh.name = `ShellFur_L${i}`;
      shellMesh.renderOrder = i; // Render from base to tip
      shellMesh.frustumCulled = false; // Shells should always render (they extend beyond base bounds)

      // Copy transforms from base mesh
      shellMesh.position.copy(mesh.position);
      shellMesh.rotation.copy(mesh.rotation);
      shellMesh.scale.copy(mesh.scale);
      shellMesh.matrix.copy(mesh.matrix);
      shellMesh.matrixWorld.copy(mesh.matrixWorld);

      this.shellMeshes.push(shellMesh);
      this.furGroup.add(shellMesh);
    }

    // Add the base mesh itself (with undercoat color, opaque)
    // We create a separate base material for the skin underneath the fur
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: this.config.undercoatColor.clone(),
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const baseMeshCopy = new THREE.Mesh(geometry, baseMaterial);
    baseMeshCopy.name = 'ShellFur_Base';
    baseMeshCopy.position.copy(mesh.position);
    baseMeshCopy.rotation.copy(mesh.rotation);
    baseMeshCopy.scale.copy(mesh.scale);
    baseMeshCopy.matrix.copy(mesh.matrix);
    baseMeshCopy.matrixWorld.copy(mesh.matrixWorld);
    this.furGroup.add(baseMeshCopy);

    // Copy the original mesh's parent transforms to the group
    this.furGroup.position.copy(mesh.position);
    this.furGroup.rotation.copy(mesh.rotation);
    this.furGroup.scale.copy(mesh.scale);

    // Reset individual shell positions to local zero since the group now handles transform
    for (const shell of this.shellMeshes) {
      shell.position.set(0, 0, 0);
      shell.rotation.set(0, 0, 0);
      shell.scale.set(1, 1, 1);
      shell.updateMatrix();
    }
    baseMeshCopy.position.set(0, 0, 0);
    baseMeshCopy.rotation.set(0, 0, 0);
    baseMeshCopy.scale.set(1, 1, 1);
    baseMeshCopy.updateMatrix();

    return this.furGroup;
  }

  /**
   * Update animation (wind sway, etc.)
   * Call this each frame with delta time.
   */
  update(dt: number): void {
    this.elapsedTime += dt;

    for (const material of this.materials) {
      material.updateTime(this.elapsedTime);
    }
  }

  /**
   * Set wind parameters dynamically
   */
  setWind(amplitude: number, frequency: number): void {
    this.config.windAmplitude = amplitude;
    this.config.windFrequency = frequency;
    for (const material of this.materials) {
      material.setWind(amplitude, frequency);
    }
  }

  /**
   * Get the fur group
   */
  getGroup(): THREE.Group {
    return this.furGroup;
  }

  /**
   * Get all shell materials (for external uniform manipulation)
   */
  getMaterials(): ShellTextureFurMaterial[] {
    return this.materials;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    for (const material of this.materials) {
      material.dispose();
    }
    this.materials = [];

    // Remove all children from group
    while (this.furGroup.children.length > 0) {
      this.furGroup.remove(this.furGroup.children[0]);
    }

    this.shellMeshes = [];
    this.baseMesh = null;
    this.elapsedTime = 0;
  }
}

// ============================================================================
// Fur Config Helper
// ============================================================================

/**
 * Create a fur configuration from simple parameters.
 * Useful for quick setup from MammalGenerator.
 */
export function createFurConfig(params: {
  shellCount?: number;
  furLength?: number;
  furDensity?: number;
  furColor?: string | THREE.Color;
  tipColor?: string | THREE.Color;
  undercoatColor?: string | THREE.Color;
  hairDirection?: THREE.Vector3;
  seed?: number;
  windAmplitude?: number;
  windFrequency?: number;
}): ShellTextureFurConfig {
  const resolveColor = (c: string | THREE.Color | undefined, fallback: THREE.Color): THREE.Color => {
    if (!c) return fallback.clone();
    if (c instanceof THREE.Color) return c.clone();
    return new THREE.Color(c);
  };

  return {
    shellCount: params.shellCount ?? DEFAULT_FUR_CONFIG.shellCount,
    furLength: params.furLength ?? DEFAULT_FUR_CONFIG.furLength,
    furDensity: params.furDensity ?? DEFAULT_FUR_CONFIG.furDensity,
    furColor: resolveColor(params.furColor, DEFAULT_FUR_CONFIG.furColor),
    tipColor: resolveColor(params.tipColor, DEFAULT_FUR_CONFIG.tipColor),
    undercoatColor: resolveColor(params.undercoatColor, DEFAULT_FUR_CONFIG.undercoatColor),
    hairDirection: params.hairDirection ?? DEFAULT_FUR_CONFIG.hairDirection.clone(),
    seed: params.seed ?? DEFAULT_FUR_CONFIG.seed,
    windAmplitude: params.windAmplitude ?? DEFAULT_FUR_CONFIG.windAmplitude,
    windFrequency: params.windFrequency ?? DEFAULT_FUR_CONFIG.windFrequency,
  };
}
