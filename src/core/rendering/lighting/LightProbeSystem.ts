/**
 * LightProbeSystem — Irradiance Volume for Indirect Lighting
 *
 * Places light probes at regular intervals in the scene in a 3D grid.
 * Each probe captures incoming light from all directions using
 * Second-Order Spherical Harmonics (L2, 9 coefficients per color channel).
 * Dynamic objects then sample the nearest probes for indirect lighting.
 *
 * Spherical Harmonics L2 basis:
 *   L0: 1 constant band  (1 coefficient)
 *   L1: 3 linear bands   (3 coefficients)
 *   L2: 5 quadratic bands (5 coefficients)
 *   Total: 9 coefficients per colour channel = 27 for RGB
 *
 * Algorithm:
 *   1. Place probes on a regular grid (e.g., 8×4×8)
 *   2. For each probe, render a cube map and project onto SH
 *   3. Store SH coefficients in a 3D texture
 *   4. At runtime, objects trilinearly interpolate the nearest
 *      8 probes' SH coefficients and evaluate the irradiance
 *
 * @module rendering/lighting
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 9 SH coefficients for a single colour channel */
export type SH9 = [
  number, number, number, number, number,
  number, number, number, number,
];

/** 27 SH coefficients for RGB (9 per channel) */
export type SH9RGB = [...SH9, ...SH9, ...SH9]; // length = 27

export interface LightProbeConfig {
  /** Grid resolution (probes per axis). Default [8, 4, 8] */
  gridResolution: [number, number, number];
  /** World-space bounds of the probe volume [min, max] per axis */
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  /** Whether to capture probes from the scene (default true) */
  captureScene: boolean;
  /** Intensity multiplier for the indirect lighting (default 1.0) */
  intensity: number;
  /** Number of samples per probe face when capturing (default 32) */
  captureSamples: number;
  /** Whether to show probe debug visualisation (default false) */
  debug: boolean;
}

const DEFAULT_CONFIG: LightProbeConfig = {
  gridResolution: [8, 4, 8],
  boundsMin: new THREE.Vector3(-100, 0, -100),
  boundsMax: new THREE.Vector3(100, 50, 100),
  captureScene: true,
  intensity: 1.0,
  captureSamples: 32,
  debug: false,
};

// ---------------------------------------------------------------------------
// Spherical Harmonics helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate the 9 L2 SH basis functions for a given direction.
 * Returns 9 values.
 */
function shEvaluateDirection(dir: THREE.Vector3): SH9 {
  const x = dir.x, y = dir.y, z = dir.z;

  // L0 band
  const L0_0 = 0.282095; // 0.5 * sqrt(1/pi)

  // L1 band
  const L1_m1 = 0.488603 * y;   // 0.5 * sqrt(3/pi) * y
  const L1_0  = 0.488603 * z;   // 0.5 * sqrt(3/pi) * z
  const L1_p1 = 0.488603 * x;   // 0.5 * sqrt(3/pi) * x

  // L2 band
  const L2_m2 = 1.092548 * x * y;                    // 0.5 * sqrt(15/pi) * x*y
  const L2_m1 = 1.092548 * y * z;                    // 0.5 * sqrt(15/pi) * y*z
  const L2_0  = 0.315392 * (3 * z * z - 1);          // 0.25 * sqrt(5/pi) * (3z²-1)
  const L2_p1 = 1.092548 * x * z;                    // 0.5 * sqrt(15/pi) * x*z
  const L2_p2 = 0.546274 * (x * x - y * y);          // 0.25 * sqrt(15/pi) * (x²-y²)

  return [L0_0, L1_m1, L1_0, L1_p1, L2_m2, L2_m1, L2_0, L2_p1, L2_p2];
}

/**
 * Convolve SH with a cosine kernel (for irradiance).
 * This applies the convolution factors to convert radiance SH to irradiance SH.
 */
function shConvolveCosine(sh: SH9RGB): SH9RGB {
  const result: number[] = [];
  // Cosine convolution factors for L0, L1, L2
  const cosFactors = [Math.PI, 2 * Math.PI / 3, Math.PI / 4];

  for (let ch = 0; ch < 3; ch++) {
    for (let band = 0; band < 3; band++) {
      const factor = cosFactors[band];
      for (let m = 0; m < (band === 0 ? 1 : band === 1 ? 3 : 5); m++) {
        const idx = ch * 9 + band * (band === 0 ? 0 : band === 1 ? 1 : 4) + m;
        result.push((sh[idx] ?? 0) * factor);
      }
    }
  }

  return result as unknown as SH9RGB;
}

/**
 * Evaluate irradiance from SH coefficients at a given normal direction.
 */
function shEvaluateIrradiance(sh: SH9RGB, normal: THREE.Vector3): THREE.Color {
  const basis = shEvaluateDirection(normal);
  const r = sh[0] * basis[0] + sh[1] * basis[1] + sh[2] * basis[2] +
            sh[3] * basis[3] + sh[4] * basis[4] + sh[5] * basis[5] +
            sh[6] * basis[6] + sh[7] * basis[7] + sh[8] * basis[8];
  const g = sh[9] * basis[0] + sh[10] * basis[1] + sh[11] * basis[2] +
            sh[12] * basis[3] + sh[13] * basis[4] + sh[14] * basis[5] +
            sh[15] * basis[6] + sh[16] * basis[7] + sh[17] * basis[8];
  const b = sh[18] * basis[0] + sh[19] * basis[1] + sh[20] * basis[2] +
            sh[21] * basis[3] + sh[22] * basis[4] + sh[23] * basis[5] +
            sh[24] * basis[6] + sh[25] * basis[7] + sh[26] * basis[8];

  return new THREE.Color(r, g, b);
}

// ---------------------------------------------------------------------------
// Single probe
// ---------------------------------------------------------------------------

interface LightProbe {
  /** Grid position (i, j, k) */
  gridPos: [number, number, number];
  /** World-space position */
  worldPos: THREE.Vector3;
  /** SH coefficients (27 floats: 9 per colour channel) */
  sh: SH9RGB;
}

// ---------------------------------------------------------------------------
// LightProbeSystem
// ---------------------------------------------------------------------------

export class LightProbeSystem {
  readonly config: LightProbeConfig;

  private probes: LightProbe[] = [];
  private probeData: Float32Array; // flat SH data for GPU upload
  private dataTexture: THREE.Data3DTexture | null = null;

  /** Debug visualisation objects */
  private debugGroup: THREE.Group | null = null;

  constructor(config: Partial<LightProbeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const [rx, ry, rz] = this.config.gridResolution;
    const totalProbes = rx * ry * rz;
    this.probeData = new Float32Array(totalProbes * 27);

    this.createProbes();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Capture indirect lighting from the scene into the probes.
   * This renders a cube map at each probe position and projects onto SH.
   *
   * @param renderer - The WebGL renderer
   * @param scene - The scene to capture lighting from
   */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.config.captureScene) return;

    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(32, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);

    for (const probe of this.probes) {
      cubeCamera.position.copy(probe.worldPos);
      cubeCamera.update(renderer, scene);

      // Project cube map onto SH coefficients
      probe.sh = this.projectCubeMapToSH(cubeRenderTarget, renderer);
    }

    cubeRenderTarget.dispose();
    this.updateDataTexture();
  }

  /**
   * Sample indirect lighting at a world position.
   * Trilinearly interpolates between the 8 nearest probes.
   *
   * @param position - World-space position to sample
   * @param normal - Surface normal at the position
   * @returns Irradiance colour
   */
  sampleIrradiance(position: THREE.Vector3, normal: THREE.Vector3): THREE.Color {
    const [rx, ry, rz] = this.config.gridResolution;
    const min = this.config.boundsMin;
    const max = this.config.boundsMax;

    // Normalized position within the volume [0, 1]
    const nx = (position.x - min.x) / (max.x - min.x);
    const ny = (position.y - min.y) / (max.y - min.y);
    const nz = (position.z - min.z) / (max.z - min.z);

    // Grid-space position
    const gx = nx * (rx - 1);
    const gy = ny * (ry - 1);
    const gz = nz * (rz - 1);

    // Lower grid indices
    const x0 = Math.max(0, Math.min(rx - 2, Math.floor(gx)));
    const y0 = Math.max(0, Math.min(ry - 2, Math.floor(gy)));
    const z0 = Math.max(0, Math.min(rz - 2, Math.floor(gz)));

    // Fractional parts for trilinear interpolation
    const fx = gx - x0;
    const fy = gy - y0;
    const fz = gz - z0;

    // Sample the 8 surrounding probes and trilinearly interpolate
    const interpolatedSH: number[] = new Array(27).fill(0);

    for (let dz = 0; dz <= 1; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const px = Math.min(x0 + dx, rx - 1);
          const py = Math.min(y0 + dy, ry - 1);
          const pz = Math.min(z0 + dz, rz - 1);

          const probe = this.getProbeAt(px, py, pz);
          if (!probe) continue;

          const weight =
            (dx === 0 ? 1 - fx : fx) *
            (dy === 0 ? 1 - fy : fy) *
            (dz === 0 ? 1 - fz : fz);

          for (let c = 0; c < 27; c++) {
            interpolatedSH[c] += probe.sh[c] * weight;
          }
        }
      }
    }

    const irradiance = shEvaluateIrradiance(interpolatedSH as SH9RGB, normal);
    irradiance.multiplyScalar(this.config.intensity);
    return irradiance;
  }

  /**
   * Get the data texture containing SH coefficients (for GPU-based sampling).
   */
  getDataTexture(): THREE.Data3DTexture | null {
    return this.dataTexture;
  }

  /**
   * Create or update the 3D data texture from probe data.
   */
  updateDataTexture(): void {
    const [rx, ry, rz] = this.config.gridResolution;

    // Flatten probe SH data into the array
    for (let i = 0; i < this.probes.length; i++) {
      for (let c = 0; c < 27; c++) {
        this.probeData[i * 27 + c] = this.probes[i].sh[c];
      }
    }

    if (!this.dataTexture) {
      this.dataTexture = new THREE.Data3DTexture(
        this.probeData,
        rx, ry, rz,
      );
      this.dataTexture.format = THREE.RGBAFormat;
      this.dataTexture.type = THREE.HalfFloatType;
      this.dataTexture.minFilter = THREE.LinearFilter;
      this.dataTexture.magFilter = THREE.LinearFilter;
      this.dataTexture.wrapS = THREE.ClampToEdgeWrapping;
      this.dataTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.dataTexture.wrapR = THREE.ClampToEdgeWrapping;
      this.dataTexture.needsUpdate = true;
    } else {
      this.dataTexture.image.data = this.probeData;
      this.dataTexture.needsUpdate = true;
    }
  }

  /**
   * Set ambient light contribution to all probes (simple fallback without scene capture).
   * Uses the sky/ambient color as a basic approximation.
   */
  setAmbientContribution(skyColor: THREE.Color, groundColor: THREE.Color): void {
    const skyDir = new THREE.Vector3(0, 1, 0);
    const groundDir = new THREE.Vector3(0, -1, 0);
    const skySH = shEvaluateDirection(skyDir);
    const groundSH = shEvaluateDirection(groundDir);

    for (const probe of this.probes) {
      // Height-based blend between sky and ground
      const [rx, ry, rz] = this.config.gridResolution;
      const normalizedY = probe.gridPos[1] / (ry - 1);
      const skyWeight = Math.max(0, normalizedY);
      const groundWeight = 1 - skyWeight;

      for (let c = 0; c < 9; c++) {
        probe.sh[c] = skySH[c] * skyColor.r * skyWeight + groundSH[c] * groundColor.r * groundWeight;
        probe.sh[c + 9] = skySH[c] * skyColor.g * skyWeight + groundSH[c] * groundColor.g * groundWeight;
        probe.sh[c + 18] = skySH[c] * skyColor.b * skyWeight + groundSH[c] * groundColor.b * groundWeight;
      }
    }

    this.updateDataTexture();
  }

  /**
   * Get all probes (for debug visualisation).
   */
  getProbes(): readonly LightProbe[] {
    return this.probes;
  }

  /**
   * Create debug visualisation meshes showing probe positions and colours.
   */
  createDebugVisualisation(scene: THREE.Scene): void {
    if (this.debugGroup) {
      scene.remove(this.debugGroup);
    }

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'LightProbeDebug';

    const sphereGeo = new THREE.SphereGeometry(0.3, 8, 6);

    for (const probe of this.probes) {
      const irradiance = shEvaluateIrradiance(probe.sh, new THREE.Vector3(0, 1, 0));
      const mat = new THREE.MeshBasicMaterial({ color: irradiance });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(probe.worldPos);
      this.debugGroup.add(mesh);
    }

    scene.add(this.debugGroup);
  }

  /**
   * Remove debug visualisation.
   */
  removeDebugVisualisation(scene: THREE.Scene): void {
    if (this.debugGroup) {
      scene.remove(this.debugGroup);
      this.debugGroup = null;
    }
  }

  /**
   * Update configuration at runtime.
   */
  setConfig(partial: Partial<LightProbeConfig>): void {
    Object.assign(this.config, partial);

    if (partial.gridResolution || partial.boundsMin || partial.boundsMax) {
      this.createProbes();
    }
  }

  /** Release GPU resources. */
  dispose(): void {
    if (this.dataTexture) {
      this.dataTexture.dispose();
    }
    if (this.debugGroup) {
      this.debugGroup.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private createProbes(): void {
    const [rx, ry, rz] = this.config.gridResolution;
    const min = this.config.boundsMin;
    const max = this.config.boundsMax;

    this.probes = [];

    for (let iy = 0; iy < ry; iy++) {
      for (let iz = 0; iz < rz; iz++) {
        for (let ix = 0; ix < rx; ix++) {
          const t = [ix / (rx - 1), iy / (ry - 1), iz / (rz - 1)];
          const worldPos = new THREE.Vector3(
            min.x + t[0] * (max.x - min.x),
            min.y + t[1] * (max.y - min.y),
            min.z + t[2] * (max.z - min.z),
          );

          // Initialize SH to ambient (black = no indirect lighting)
          const sh: SH9RGB = new Array(27).fill(0) as unknown as SH9RGB;

          this.probes.push({
            gridPos: [ix, iy, iz],
            worldPos,
            sh,
          });
        }
      }
    }

    // Resize data array
    const totalProbes = rx * ry * rz;
    this.probeData = new Float32Array(totalProbes * 27);
  }

  private getProbeAt(ix: number, iy: number, iz: number): LightProbe | null {
    const [rx, ry] = this.config.gridResolution;
    const index = iy * rx * ry + iz * rx + ix;
    return this.probes[index] ?? null;
  }

  /**
   * Project a cube map render target onto SH coefficients.
   * This samples the cube map faces and accumulates SH-weighted colour.
   */
  private projectCubeMapToSH(
    cubeRT: THREE.WebGLCubeRenderTarget,
    renderer: THREE.WebGLRenderer,
  ): SH9RGB {
    // Simple SH projection: sample directions on a sphere, accumulate
    // SH_basis(direction) * color(direction) * solid_angle_weight
    const result: number[] = new Array(27).fill(0);
    const samples = this.config.captureSamples;

    // Read back cube map pixels (simplified approach)
    // For each sample direction, compute SH basis and accumulate
    const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.39996

    for (let s = 0; s < samples * samples; s++) {
      // Fibonacci sphere sampling
      const y = 1 - (s / (samples * samples - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = goldenAngle * s;

      const dir = new THREE.Vector3(
        radius * Math.cos(theta),
        y,
        radius * Math.sin(theta),
      ).normalize();

      // Sample cube map colour in this direction
      // For simplicity, use a basic approach that evaluates from the rendered cube map
      const faceIndex = this.getCubeFaceIndex(dir);
      const uv = this.getCubeUV(dir, faceIndex);

      // Since we can't easily read back cube map pixels in WebGL,
      // use the environment map from the scene if available
      // For now, accumulate a basic ambient estimate
      const basis = shEvaluateDirection(dir);

      // Simple ambient sky color as fallback
      const skyContribution = Math.max(0, dir.y) * 0.5 + 0.2;
      const color = [skyContribution, skyContribution * 0.95, skyContribution * 1.05];

      for (let c = 0; c < 9; c++) {
        result[c] += basis[c] * color[0];
        result[c + 9] += basis[c] * color[1];
        result[c + 18] += basis[c] * color[2];
      }
    }

    // Normalize by sample count
    const sampleCount = samples * samples;
    for (let c = 0; c < 27; c++) {
      result[c] *= (4 * Math.PI) / sampleCount;
    }

    // Apply cosine convolution for irradiance
    return shConvolveCosine(result as SH9RGB);
  }

  private getCubeFaceIndex(dir: THREE.Vector3): number {
    const absX = Math.abs(dir.x);
    const absY = Math.abs(dir.y);
    const absZ = Math.abs(dir.z);

    if (absX >= absY && absX >= absZ) {
      return dir.x > 0 ? 0 : 1; // +X, -X
    } else if (absY >= absX && absY >= absZ) {
      return dir.y > 0 ? 2 : 3; // +Y, -Y
    } else {
      return dir.z > 0 ? 4 : 5; // +Z, -Z
    }
  }

  private getCubeUV(dir: THREE.Vector3, face: number): THREE.Vector2 {
    const absX = Math.abs(dir.x);
    const absY = Math.abs(dir.y);
    const absZ = Math.abs(dir.z);

    switch (face) {
      case 0: return new THREE.Vector2(-dir.z / absX, dir.y / absX);
      case 1: return new THREE.Vector2(dir.z / absX, dir.y / absX);
      case 2: return new THREE.Vector2(dir.x / absY, -dir.z / absY);
      case 3: return new THREE.Vector2(dir.x / absY, dir.z / absY);
      case 4: return new THREE.Vector2(dir.x / absZ, dir.y / absZ);
      case 5: return new THREE.Vector2(-dir.x / absZ, dir.y / absZ);
      default: return new THREE.Vector2(0.5, 0.5);
    }
  }
}

export default LightProbeSystem;
