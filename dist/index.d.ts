/**
 * Infinigen R3F - Main Entry Point
 *
 * A complete TypeScript port of Infinigen's constraint-based procedural generation system
 * for React Three Fiber. This library enables real-time constraint-based scene composition
 * in the browser.
 *
 * @packageDocumentation
 */
export * from './constraint-language/index.js';
export * from './tags/index.js';
export * from './reasoning/index.js';
export * from './solver/index.js';
export * from './math/index.js';
export * from './placement/index.js';
export * from './evaluator/index.js';
export * from './room-solver/index.js';
export * from './sim/index.js';
export * from './bridge/index.js';
export * from './decorate/index.js';
export * from './animation/index.js';
export * from './nodes/index.js';
export * from './types.js';
export type { Node, Variable, Domain, ObjectSetDomain, NumericDomain, PoseDomain, BBoxDomain, BooleanDomain } from './constraint-language/types.js';
export type { Relation, AnyRelation, Touching, SupportedBy, CoPlanar, StableAgainst, Facing, Between, AccessibleFrom, ReachableFrom, InFrontOf, Aligned, Hidden, Visible, Grouped, Distributed, Coverage, SupportCoverage, Stability, Containment, Proximity } from './constraint-language/relations.js';
export type { Tag, TagSet, SemanticsTag, MaterialTag, SurfaceTag, RoomTag, FunctionTag, SizeTag, StyleTag } from './tags/index.js';
export type { Move, SolverState, SimulatedAnnealingSolver, GreedySolver } from './solver/index.js';
export type { BBox } from './math/index.js';
export type { PathFinder, DensityFunction } from './placement/index.js';
export * from './pipeline/SceneExporter.js';
export * from './pipeline/AnnotationGenerator.js';
export * from './pipeline/DataPipeline.js';
export * from './pipeline/GroundTruthGenerator.js';
export * from './pipeline/JobManager.js';
export * from './pipeline/BatchProcessor.js';
export * from './pipeline/types.js';
//# sourceMappingURL=index.d.ts.map