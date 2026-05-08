/**
 * Camera Parameter Exporter for Infinigen R3F
 *
 * Exports camera intrinsics (K), extrinsics (T), per-frame parameters,
 * and supports NPZ/JSON, IMU/TUM formats, and stereo baseline.
 *
 * Phase 4.1 — Camera System
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CameraIntrinsics {
  /** 3×3 camera matrix K in OpenCV convention */
  K: number[][];
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Distortion coefficients [k1, k2, p1, p2, k3] */
  distortion: number[];
}

export interface CameraExtrinsics {
  /** 4×4 transform matrix T (world-to-camera) in OpenCV convention */
  T: number[][];
  /** Position in world space */
  position: [number, number, number];
  /** Rotation as quaternion [x, y, z, w] */
  quaternion: [number, number, number, number];
  /** Rotation as Euler angles [rx, ry, rz] in radians */
  euler: [number, number, number];
}

export interface PerFrameCameraParams {
  frameIndex: number;
  timestamp: number;
  position: [number, number, number];
  rotation: [number, number, number];
  focalLength: number;
  fov: number;
  near: number;
  far: number;
  intrinsics: CameraIntrinsics;
  extrinsics: CameraExtrinsics;
}

export interface StereoBaselineConfig {
  /** Interaxial distance (meters) */
  baseline: number;
  /** Convergence distance (meters) */
  convergence: number;
  /** Whether to toe-in cameras */
  toeIn: boolean;
}

export interface CameraExportOptions {
  /** Output format: 'json' | 'npz' */
  format: 'json' | 'npz';
  /** Include IMU/TUM format files for SLAM evaluation */
  includeTUM: boolean;
  /** Stereo baseline configuration (optional) */
  stereoBaseline?: StereoBaselineConfig;
  /** Image resolution */
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// CameraParameterExporter
// ---------------------------------------------------------------------------

export class CameraParameterExporter {
  private frames: PerFrameCameraParams[] = [];
  private options: CameraExportOptions;

  constructor(options: Partial<CameraExportOptions> = {}) {
    this.options = {
      format: options.format ?? 'json',
      includeTUM: options.includeTUM ?? false,
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      stereoBaseline: options.stereoBaseline,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Add a frame from a Three.js camera */
  addFrame(
    camera: THREE.PerspectiveCamera,
    frameIndex: number,
    timestamp: number,
  ): void {
    camera.updateMatrixWorld(true);

    const intrinsics = this.computeIntrinsics(camera);
    const extrinsics = this.computeExtrinsics(camera);

    this.frames.push({
      frameIndex,
      timestamp,
      position: [camera.position.x, camera.position.y, camera.position.z],
      rotation: [
        camera.rotation.x,
        camera.rotation.y,
        camera.rotation.z,
      ],
      focalLength: camera.getFocalLength(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      intrinsics,
      extrinsics,
    });
  }

  /** Add a frame from raw parameters */
  addFrameFromParams(params: PerFrameCameraParams): void {
    this.frames.push(params);
  }

  /** Compute intrinsics matrix K from a perspective camera */
  computeIntrinsics(camera: THREE.PerspectiveCamera): CameraIntrinsics {
    const { width, height } = this.options;
    const fovRad = (camera.fov * Math.PI) / 180;
    const fy = (height / 2) / Math.tan(fovRad / 2);
    const fx = fy; // Square pixels assumption
    const cx = width / 2;
    const cy = height / 2;

    const K = [
      [fx, 0, cx],
      [0, fy, cy],
      [0, 0, 1],
    ];

    return {
      K,
      width,
      height,
      distortion: [0, 0, 0, 0, 0], // No distortion in R3F
    };
  }

  /** Compute extrinsics matrix T (world-to-camera) in OpenCV convention */
  computeExtrinsics(camera: THREE.PerspectiveCamera): CameraExtrinsics {
    camera.updateMatrixWorld(true);

    const viewMatrix = camera.matrixWorldInverse.clone();

    // Three.js uses WebGL convention (Y up, Z backward)
    // OpenCV uses Y down, Z forward convention
    // Apply conversion: flip Y and Z rows
    const cv = new THREE.Matrix4().set(
      1, 0, 0, 0,
      0, -1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1,
    );

    const T_CV = new THREE.Matrix4().multiplyMatrices(cv, viewMatrix);
    const T = this.matrix4ToArray(T_CV);

    const pos = camera.position;
    const quat = camera.quaternion;

    return {
      T,
      position: [pos.x, pos.y, pos.z],
      quaternion: [quat.x, quat.y, quat.z, quat.w],
      euler: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
    };
  }

  /** Export all frames to JSON */
  exportJSON(): string {
    return JSON.stringify(
      {
        format: 'infinigen_camera_params',
        version: '1.0',
        resolution: { width: this.options.width, height: this.options.height },
        stereoBaseline: this.options.stereoBaseline ?? null,
        frames: this.frames,
      },
      null,
      2,
    );
  }

  /** Export TUM format trajectory file (for SLAM evaluation) */
  exportTUM(): string {
    const lines: string[] = ['# timestamp tx ty tz qx qy qz qw'];
    for (const frame of this.frames) {
      const { timestamp, extrinsics } = frame;
      const [tx, ty, tz] = extrinsics.position;
      const [qx, qy, qz, qw] = extrinsics.quaternion;
      lines.push(`${timestamp.toFixed(6)} ${tx} ${ty} ${tz} ${qx} ${qy} ${qz} ${qw}`);
    }
    return lines.join('\n');
  }

  /** Export IMU format (with camera intrinsics per frame) */
  exportIMU(): string {
    const lines: string[] = [
      '# timestamp tx ty tz qx qy qz qw fx fy cx cy',
    ];
    for (const frame of this.frames) {
      const { timestamp, extrinsics, intrinsics } = frame;
      const [tx, ty, tz] = extrinsics.position;
      const [qx, qy, qz, qw] = extrinsics.quaternion;
      const fx = intrinsics.K[0][0];
      const fy = intrinsics.K[1][1];
      const cx = intrinsics.K[0][2];
      const cy = intrinsics.K[1][2];
      lines.push(
        `${timestamp.toFixed(6)} ${tx} ${ty} ${tz} ${qx} ${qy} ${qz} ${qw} ${fx} ${fy} ${cx} ${cy}`,
      );
    }
    return lines.join('\n');
  }

  /** Export NPZ-compatible binary data (returns raw arrays for packing) */
  exportNPZData(): {
    positions: Float64Array;
    rotations: Float64Array;
    intrinsics: Float64Array;
    timestamps: Float64Array;
  } {
    const n = this.frames.length;
    const positions = new Float64Array(n * 3);
    const rotations = new Float64Array(n * 4); // quaternions
    const intrinsics = new Float64Array(n * 9); // 3×3 K
    const timestamps = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const f = this.frames[i];
      timestamps[i] = f.timestamp;
      positions[i * 3] = f.extrinsics.position[0];
      positions[i * 3 + 1] = f.extrinsics.position[1];
      positions[i * 3 + 2] = f.extrinsics.position[2];
      rotations[i * 4] = f.extrinsics.quaternion[0];
      rotations[i * 4 + 1] = f.extrinsics.quaternion[1];
      rotations[i * 4 + 2] = f.extrinsics.quaternion[2];
      rotations[i * 4 + 3] = f.extrinsics.quaternion[3];

      const K = f.intrinsics.K;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          intrinsics[i * 9 + r * 3 + c] = K[r][c];
        }
      }
    }

    return { positions, rotations, intrinsics, timestamps };
  }

  /** Compute stereo camera pair from baseline config */
  computeStereoPair(
    camera: THREE.PerspectiveCamera,
  ): { left: THREE.PerspectiveCamera; right: THREE.PerspectiveCamera } {
    const baseline = this.options.stereoBaseline;
    if (!baseline) {
      throw new Error('Stereo baseline configuration required');
    }

    camera.updateMatrixWorld(true);
    const left = camera.clone();
    const right = camera.clone();

    const halfBaseline = baseline.baseline / 2;
    const rightDir = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    left.position.copy(camera.position).add(rightDir.clone().multiplyScalar(-halfBaseline));
    right.position.copy(camera.position).add(rightDir.clone().multiplyScalar(halfBaseline));

    if (baseline.toeIn) {
      const target = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(camera.quaternion)
        .multiplyScalar(baseline.convergence)
        .add(camera.position);
      left.lookAt(target);
      right.lookAt(target);
    }

    return { left, right };
  }

  /** Reset frames */
  reset(): void {
    this.frames = [];
  }

  /** Get collected frames */
  getFrames(): PerFrameCameraParams[] {
    return this.frames;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private matrix4ToArray(m: THREE.Matrix4): number[][] {
    const e = m.elements;
    // Three.js stores column-major; convert to row-major
    return [
      [e[0], e[4], e[8], e[12]],
      [e[1], e[5], e[9], e[13]],
      [e[2], e[6], e[10], e[14]],
      [e[3], e[7], e[11], e[15]],
    ];
  }
}

export default CameraParameterExporter;
