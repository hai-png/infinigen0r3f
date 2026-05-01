/**
 * Camera Trajectories Module
 * 
 * Exports trajectory generators for automated camera movement.
 */

export {
  TrajectoryType,
  type OrbitConfig,
  type SplineConfig,
  type FPSConfig,
  type CinematicConfig,
  type TrajectorySample,
  type TrajectoryData,
  EasingFunctions,
  CameraTrajectoryGenerator,
} from './CameraTrajectoryGenerator';

export {
  type Keyframe,
  type TrajectorySample as LegacyTrajectorySample,
  InterpolationMode,
  type TrajectoryConfig,
  catmullRomSpline,
  interpolatePosition,
  bezierInterpolate,
  generateTrajectory,
  createCurveFromTrajectory,
  calculateTrajectoryLength,
  resampleUniform,
} from './TrajectoryGenerator';

// Shot types (re-export defaults as named exports)
export { default as DollyShot } from './DollyShot';
export { default as CraneShot } from './CraneShot';
export { default as OrbitShot } from './OrbitShot';
export { default as PanTilt } from './PanTilt';
export { default as TrackingShot } from './TrackingShot';
export { default as HandheldSim } from './HandheldSim';
