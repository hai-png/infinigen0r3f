/**
 * Depth of Field for Infinigen R3F
 *
 * Physical DOF model based on sensor size, focal length, f-stop, and focus distance.
 * Provides bokeh shape control, chromatic aberration, and auto-focus.
 * Integrates with R3F post-processing pipeline.
 *
 * Phase 4.1 — Camera System
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BokehShape = 'circular' | 'hexagonal' | 'octagonal' | 'custom';

export interface DepthOfFieldConfig {
  /** Focal length in mm */
  focalLength: number;
  /** F-stop (aperture) */
  fStop: number;
  /** Focus distance in meters */
  focusDistance: number;
  /** Sensor width in mm (default 36 for full-frame) */
  sensorWidth: number;
  /** Sensor height in mm (default 24 for full-frame) */
  sensorHeight: number;
  /** Circle of confusion diameter in mm (default 0.03) */
  circleOfConfusion: number;
  /** Bokeh shape */
  bokehShape: BokehShape;
  /** Bokeh rotation in degrees */
  bokehRotation: number;
  /** Chromatic aberration strength (0-1) */
  chromaticAberration: number;
  /** Custom bokeh blade count (for custom shape) */
  customBladeCount: number;
  /** DOF intensity multiplier (0-1) */
  intensity: number;
  /** Auto-focus enabled */
  autoFocus: boolean;
  /** Auto-focus target (center of screen object) */
  autoFocusTarget?: THREE.Vector3;
}

export interface DepthOfFieldResult {
  /** Near limit of acceptable sharpness (meters) */
  near: number;
  /** Far limit of acceptable sharpness (meters) */
  far: number;
  /** Total depth of field (meters) */
  total: number;
  /** Hyperfocal distance (meters) */
  hyperfocal: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_DOF_CONFIG: DepthOfFieldConfig = {
  focalLength: 50,
  fStop: 2.8,
  focusDistance: 10,
  sensorWidth: 36,
  sensorHeight: 24,
  circleOfConfusion: 0.03,
  bokehShape: 'circular',
  bokehRotation: 0,
  chromaticAberration: 0,
  customBladeCount: 5,
  intensity: 1.0,
  autoFocus: false,
};

// ---------------------------------------------------------------------------
// DepthOfField class
// ---------------------------------------------------------------------------

export class DepthOfField {
  private config: DepthOfFieldConfig;

  constructor(config: Partial<DepthOfFieldConfig> = {}) {
    this.config = { ...DEFAULT_DOF_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Physical DOF calculations
  // -----------------------------------------------------------------------

  /** Calculate depth of field limits based on current config */
  calculate(): DepthOfFieldResult {
    return DepthOfField.calculateDOF(
      this.config.focalLength,
      this.config.fStop,
      this.config.focusDistance,
      this.config.circleOfConfusion,
    );
  }

  /** Static DOF calculation */
  static calculateDOF(
    focalLengthMM: number,
    fStop: number,
    focusDistance: number,
    cocMM: number = 0.03,
  ): DepthOfFieldResult {
    const f = focalLengthMM / 1000; // mm → m
    const N = fStop;
    const s = focusDistance;
    const c = cocMM / 1000; // mm → m

    const H = (f * f) / (N * c) + f; // Hyperfocal distance

    if (s >= H) {
      return { near: H / 2, far: Infinity, total: Infinity, hyperfocal: H };
    }

    const near = (H * s) / (H + (s - f));
    const far = (H * s) / (H - (s - f));

    return {
      near: Math.max(0, near),
      far: far > 0 ? far : Infinity,
      total: far === Infinity ? Infinity : far - near,
      hyperfocal: H,
    };
  }

  /** Calculate horizontal FOV from focal length and sensor */
  calculateFOV(): number {
    return (
      2 * Math.atan(this.config.sensorWidth / (2 * this.config.focalLength)) *
      (180 / Math.PI)
    );
  }

  /** Calculate vertical FOV from focal length and sensor */
  calculateVerticalFOV(): number {
    return (
      2 * Math.atan(this.config.sensorHeight / (2 * this.config.focalLength)) *
      (180 / Math.PI)
    );
  }

  // -----------------------------------------------------------------------
  // Auto-focus
  // -----------------------------------------------------------------------

  /** Auto-focus on center-of-screen object using raycasting */
  autoFocus(
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
  ): number {
    camera.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const intersects = raycaster.intersectObjects(scene.children, true);

    if (intersects.length > 0) {
      const distance = intersects[0].distance;
      this.config.focusDistance = distance;
      return distance;
    }

    return this.config.focusDistance;
  }

  // -----------------------------------------------------------------------
  // Bokeh
  // -----------------------------------------------------------------------

  /** Get bokeh blade count for shape */
  getBokehBladeCount(): number {
    switch (this.config.bokehShape) {
      case 'circular':
        return 0; // 0 = circle
      case 'hexagonal':
        return 6;
      case 'octagonal':
        return 8;
      case 'custom':
        return this.config.customBladeCount;
      default:
        return 0;
    }
  }

  /** Generate bokeh kernel for post-processing */
  generateBokehKernel(size: number = 32): Float32Array {
    const blades = this.getBokehBladeCount();
    const kernel = new Float32Array(size * size);
    const center = size / 2;
    const rotation = (this.config.bokehRotation * Math.PI) / 180;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x - center) / center;
        const dy = (y - center) / center;

        // Rotate
        const rx = dx * Math.cos(rotation) - dy * Math.sin(rotation);
        const ry = dx * Math.sin(rotation) + dy * Math.cos(rotation);

        let inside = false;

        if (blades === 0) {
          // Circular
          inside = rx * rx + ry * ry <= 1.0;
        } else {
          // Regular polygon
          const angle = Math.atan2(ry, rx);
          const sliceAngle = (2 * Math.PI) / blades;
          const halfSlice = sliceAngle / 2;
          const dist = Math.sqrt(rx * rx + ry * ry);
          const polarAngle = ((angle % sliceAngle) + sliceAngle) % sliceAngle;
          const edgeDist = Math.cos(halfSlice) / Math.cos(polarAngle - halfSlice);
          inside = dist <= edgeDist;
        }

        kernel[y * size + x] = inside ? 1.0 : 0.0;
      }
    }

    return kernel;
  }

  // -----------------------------------------------------------------------
  // R3F Post-processing integration
  // -----------------------------------------------------------------------

  /** Create a Three.js DOF shader material for post-processing */
  createDOFShader(): THREE.ShaderMaterial {
    const dof = this.calculate();
    const blades = this.getBokehBladeCount();
    const rotation = this.config.bokehRotation;
    const chromaticAb = this.config.chromaticAberration;
    const intensity = this.config.intensity;

    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        focusDistance: { value: this.config.focusDistance },
        focalLength: { value: this.config.focalLength / 1000 },
        fStop: { value: this.config.fStop },
        nearFocus: { value: dof.near },
        farFocus: { value: dof.far === Infinity ? 1000 : dof.far },
        maxWidth: { value: 0.02 * intensity },
        blades: { value: blades },
        rotation: { value: (rotation * Math.PI) / 180 },
        chromaticAberration: { value: chromaticAb },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform float focusDistance;
        uniform float focalLength;
        uniform float fStop;
        uniform float nearFocus;
        uniform float farFocus;
        uniform float maxWidth;
        uniform int blades;
        uniform float rotation;
        uniform float chromaticAberration;
        uniform float cameraNear;
        uniform float cameraFar;

        varying vec2 vUv;

        float linearizeDepth(float d) {
          return cameraNear * cameraFar / (cameraFar + d * (cameraNear - cameraFar));
        }

        float getCircleOfConfusion(float depth) {
          float coc = (focalLength * focalLength / (fStop * (depth - focalLength)))
                    * (1.0 / focusDistance - 1.0 / depth);
          return abs(coc) * maxWidth;
        }

        void main() {
          float depth = linearizeDepth(texture2D(tDepth, vUv).r);
          float coc = getCircleOfConfusion(depth);

          vec4 color = texture2D(tDiffuse, vUv);

          if (coc < 0.001) {
            gl_FragColor = color;
            return;
          }

          // Simple disc blur (single-pass approximation)
          vec4 blurred = vec4(0.0);
          float totalWeight = 0.0;
          const int SAMPLES = 16;

          for (int i = 0; i < SAMPLES; i++) {
            float angle = float(i) * 6.28318530718 / float(SAMPLES) + rotation;
            vec2 offset = vec2(cos(angle), sin(angle)) * coc;
            
            // Chromatic aberration: shift R, G, B slightly differently
            float rShift = chromaticAberration * coc * 0.5;
            vec3 sampleColor;
            sampleColor.r = texture2D(tDiffuse, vUv + offset * (1.0 + rShift)).r;
            sampleColor.g = texture2D(tDiffuse, vUv + offset).g;
            sampleColor.b = texture2D(tDiffuse, vUv + offset * (1.0 - rShift)).b;

            blurred += vec4(sampleColor, 1.0);
            totalWeight += 1.0;
          }

          blurred /= totalWeight;
          gl_FragColor = mix(color, blurred, min(1.0, coc * 20.0));
        }
      `,
    });
  }

  // -----------------------------------------------------------------------
  // Config management
  // -----------------------------------------------------------------------

  getConfig(): DepthOfFieldConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<DepthOfFieldConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /** Get DOF as R3F-compatible effect props */
  getEffectProps(): {
    focusDistance: number;
    focalLength: number;
    bokehScale: number;
  } {
    const dof = this.calculate();
    const blurAmount = this.config.intensity * (this.config.focalLength / this.config.fStop) * 0.01;

    return {
      focusDistance: this.config.focusDistance,
      focalLength: this.config.focalLength / 1000,
      bokehScale: Math.max(0, blurAmount),
    };
  }
}

export default DepthOfField;
