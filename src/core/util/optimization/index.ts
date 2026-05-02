/**
 * Optimization Module Exports
 */

export * from './GPUAcceleration';
export * from './DrawCallOptimizer';
export * from './MemoryProfiler';
export * from './GPUComputeManager';
export * from './WorkerPool';
export * from './FrameBudgetManager';
export * from './ShaderVariantCache';

import GPUAcceleration, {
  initGPUContext,
  isGPUAvailable,
  evaluateConstraintsGPU,
  evaluateConstraintsCPU,
  evaluateStatesInParallel,
  createGPUConstraintBuffers,
  destroyGPUConstraintBuffers,
  createEvaluationPipeline,
  trackGPUEvaluation,
  getGPUMetrics,
  resetGPUMetrics,
  type GPUContext,
  type GPUConstraintBuffers,
  type GPUEvaluationResult,
  type GPUOptimizationConfig,
  type GPUPerformanceMetrics,
} from './GPUAcceleration';

export {
  GPUAcceleration as default,
  initGPUContext,
  isGPUAvailable,
  evaluateConstraintsGPU,
  evaluateConstraintsCPU,
  evaluateStatesInParallel,
  createGPUConstraintBuffers,
  destroyGPUConstraintBuffers,
  createEvaluationPipeline,
  trackGPUEvaluation,
  getGPUMetrics,
  resetGPUMetrics,
};

export type {
  GPUContext,
  GPUConstraintBuffers,
  GPUEvaluationResult,
  GPUOptimizationConfig,
  GPUPerformanceMetrics,
};
