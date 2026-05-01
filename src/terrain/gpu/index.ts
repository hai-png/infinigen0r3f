/**
 * Infinigen R3F Port - GPU Module Exports
 *
 * NOTE: HydraulicErosionGPU is CPU-only despite the name.
 * ErosionConfig and ErosionData here have different shapes than
 * the ones in erosion/ErosionEnhanced.ts. We alias them to avoid
 * name collisions in the barrel export.
 */

export {
  MarchingCubesCompute,
  type GPUComputeConfig,
  type MarchingCubesResult,
} from './MarchingCubesCompute';

export {
  HydraulicErosionGPU,
  type ErosionConfig as HydraulicErosionGPUConfig,
  type ErosionData as HydraulicErosionGPUData,
} from './HydraulicErosionGPU';
