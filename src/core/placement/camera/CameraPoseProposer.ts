/**
 * Camera Pose Proposer for Infinigen R3F
 *
 * Generates candidate camera positions and selects the best viewpoints
 * based on composition scoring, terrain collision avoidance, and object visibility.
 *
 * Phase 4.1 — Camera System
 */

import * as THREE from 'three';
import { SeededRandom } from '../../util/MathUtils';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface CameraPoseProposerConfig {
  /** Altitude range for camera positions (meters) */
  altitudeRange: [number, number];
  /** Yaw range in radians (horizontal angle) */
  yawRange: [number, number];
  /** Pitch range in radians (vertical angle) */
  pitchRange: [number, number];
  /** Focal length randomization range (mm) */
  focalLengthRange: [number, number];
  /** DOF f-stop range */
  fStopRange: [number, number];
  /** Minimum distance from objects (meters) */
  minObjectDistance: number;
  /** Minimum height above terrain (meters) */
  minTerrainClearance: number;
  /** Number of candidate poses to generate */
  candidateCount: number;
  /** Number of best views to select */
  selectCount: number;
  /** Center of the area of interest */
  center: THREE.Vector3;
  /** Maximum radius from center for camera placement */
  maxRadius: number;
  /** Random seed */
  seed?: number;
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  focalLength: number;
  fStop: number;
  fov: number;
  score: number;
  scoreBreakdown: PoseScoreBreakdown;
}

export interface PoseScoreBreakdown {
  terrainCoverage: number;
  visibleObjectCount: number;
  compositionQuality: number;
  tagRatio: number;
  collisionPenalty: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_POSE_PROPOSER_CONFIG: CameraPoseProposerConfig = {
  altitudeRange: [1.5, 30],
  yawRange: [0, Math.PI * 2],
  pitchRange: [-Math.PI / 6, Math.PI / 3],
  focalLengthRange: [24, 85],
  fStopRange: [1.4, 11],
  minObjectDistance: 2,
  minTerrainClearance: 1.0,
  candidateCount: 64,
  selectCount: 5,
  center: new THREE.Vector3(0, 0, 0),
  maxRadius: 80,
  seed: 42,
};

// ---------------------------------------------------------------------------
// CameraPoseProposer
// ---------------------------------------------------------------------------

export class CameraPoseProposer {
  private config: CameraPoseProposerConfig;
  private rng: SeededRandom;
  private raycaster: THREE.Raycaster;

  /** Object bounding boxes for visibility / collision checks */
  private objectBoxes: THREE.Box3[] = [];

  /** Terrain height sampler — defaults to flat plane */
  private terrainSampler: (x: number, z: number) => number = () => 0;

  /** Tags for composition ratio scoring */
  private tagWeights: Map<string, number> = new Map();

  constructor(config: Partial<CameraPoseProposerConfig> = {}) {
    this.config = { ...DEFAULT_POSE_PROPOSER_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed ?? 42);
    this.raycaster = new THREE.Raycaster();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Set the terrain height sampler callback */
  setTerrainSampler(fn: (x: number, z: number) => number): void {
    this.terrainSampler = fn;
  }

  /** Register object bounding boxes for visibility / collision */
  setObjectBoxes(boxes: THREE.Box3[]): void {
    this.objectBoxes = boxes;
  }

  /** Set tag weights for composition ratio scoring */
  setTagWeights(weights: Map<string, number>): void {
    this.tagWeights = weights;
  }

  /** Generate candidates and select the best N views */
  propose(): CameraPose[] {
    const candidates = this.generateCandidates();
    const scored = candidates.map((p) => this.scorePose(p));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.config.selectCount);
  }

  /** Generate raw candidate poses (no scoring) */
  generateCandidates(): CameraPose[] {
    const poses: CameraPose[] = [];
    const {
      candidateCount,
      altitudeRange,
      yawRange,
      pitchRange,
      focalLengthRange,
      fStopRange,
      center,
      maxRadius,
    } = this.config;

    for (let i = 0; i < candidateCount; i++) {
      const yaw = yawRange[0] + this.rng.next() * (yawRange[1] - yawRange[0]);
      const pitch = pitchRange[0] + this.rng.next() * (pitchRange[1] - pitchRange[0]);
      const dist = 10 + this.rng.next() * (maxRadius - 10);
      const alt = altitudeRange[0] + this.rng.next() * (altitudeRange[1] - altitudeRange[0]);

      const x = center.x + Math.cos(yaw) * Math.cos(pitch) * dist;
      const y = alt;
      const z = center.z + Math.sin(yaw) * Math.cos(pitch) * dist;

      const position = new THREE.Vector3(x, y, z);

      // Terrain collision avoidance
      const terrainH = this.terrainSampler(x, z);
      if (position.y - terrainH < this.config.minTerrainClearance) {
        position.y = terrainH + this.config.minTerrainClearance;
      }

      // Target is the center + slight random offset
      const target = center.clone().add(
        new THREE.Vector3(
          (this.rng.next() - 0.5) * 4,
          (this.rng.next() - 0.5) * 2,
          (this.rng.next() - 0.5) * 4,
        ),
      );

      const focalLength =
        focalLengthRange[0] + this.rng.next() * (focalLengthRange[1] - focalLengthRange[0]);
      const fStop = fStopRange[0] + this.rng.next() * (fStopRange[1] - fStopRange[0]);

      // Approximate horizontal FOV from focal length (full-frame 36mm sensor)
      const fov = 2 * Math.atan(36 / (2 * focalLength)) * (180 / Math.PI);

      poses.push({
        position,
        target,
        focalLength,
        fStop,
        fov,
        score: 0,
        scoreBreakdown: {
          terrainCoverage: 0,
          visibleObjectCount: 0,
          compositionQuality: 0,
          tagRatio: 0,
          collisionPenalty: 0,
        },
      });
    }

    return poses;
  }

  // -----------------------------------------------------------------------
  // Scoring
  // -----------------------------------------------------------------------

  private scorePose(pose: CameraPose): CameraPose {
    const breakdown: PoseScoreBreakdown = {
      terrainCoverage: this.scoreTerrainCoverage(pose),
      visibleObjectCount: this.scoreVisibleObjects(pose),
      compositionQuality: this.scoreComposition(pose),
      tagRatio: this.scoreTagRatio(pose),
      collisionPenalty: this.scoreCollisionPenalty(pose),
    };

    const score =
      breakdown.terrainCoverage * 0.25 +
      breakdown.visibleObjectCount * 0.3 +
      breakdown.compositionQuality * 0.25 +
      breakdown.tagRatio * 0.1 -
      breakdown.collisionPenalty * 0.5;

    return { ...pose, score, scoreBreakdown: breakdown };
  }

  /** Terrain coverage: how much of the view contains terrain (vs. sky) */
  private scoreTerrainCoverage(pose: CameraPose): number {
    const dir = new THREE.Vector3().subVectors(pose.target, pose.position).normalize();
    const horizonDot = dir.y;

    // Camera looking near horizon has high terrain coverage
    // Looking straight up (dot=1) has zero terrain coverage
    // Looking straight down (dot=-1) has full terrain coverage
    const coverage = Math.max(0, 1 - horizonDot);
    return Math.min(1, coverage * 1.5);
  }

  /** Count visible objects (frustum check) */
  private scoreVisibleObjects(pose: CameraPose): number {
    if (this.objectBoxes.length === 0) return 0.5;

    const camera = new THREE.PerspectiveCamera(pose.fov, 16 / 9, 0.1, 2000);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld(true);

    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    let visible = 0;
    for (const box of this.objectBoxes) {
      if (frustum.intersectsBox(box)) visible++;
    }

    return Math.min(1, visible / Math.max(1, this.objectBoxes.length));
  }

  /** Composition quality: rule of thirds + leading lines heuristic */
  private scoreComposition(pose: CameraPose): number {
    const dir = new THREE.Vector3().subVectors(pose.target, pose.position).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();

    // Rule of thirds: target should be off-center
    const center = this.config.center;
    const toCenter = new THREE.Vector3().subVectors(center, pose.position).normalize();
    const horizOffset = Math.abs(toCenter.dot(right));
    const vertOffset = Math.abs(toCenter.dot(up) - 0.3);

    // Ideal offsets for rule of thirds: ~0.33
    const thirdScore = 1 - Math.abs(horizOffset - 0.33) - Math.abs(vertOffset - 0.33) * 0.5;

    // Leading lines: prefer camera height that creates perspective depth
    const height = pose.position.y;
    const heightScore = Math.min(1, Math.max(0, (height - 1) / 15));

    return Math.max(0, Math.min(1, thirdScore * 0.6 + heightScore * 0.4));
  }

  /** Tag-based composition ratio (reward views with diverse tagged objects) */
  private scoreTagRatio(_pose: CameraPose): number {
    if (this.tagWeights.size === 0) return 0.5;
    // Simplified: return normalized tag diversity
    const totalWeight = Array.from(this.tagWeights.values()).reduce((a, b) => a + b, 0);
    return this.tagWeights.size > 0 ? Math.min(1, totalWeight / (this.tagWeights.size * 2)) : 0.5;
  }

  /** Collision penalty: camera must not be inside any object */
  private scoreCollisionPenalty(pose: CameraPose): number {
    let penalty = 0;
    for (const box of this.objectBoxes) {
      if (box.containsPoint(pose.position)) penalty += 1;
    }
    return Math.min(1, penalty);
  }
}

export default CameraPoseProposer;
