/**
 * Core Infinigen Engine Systems
 *
 * This module contains the fundamental systems that power procedural generation:
 * - Nodes: Geometry node system for procedural modeling
 * - Constraints: Constraint-based reasoning and solving
 * - Placement: Object and camera placement algorithms
 * - Rendering: Rendering utilities and pipelines
 * - Util: Core utility functions
 *
 * Name conflict: `Node` is exported by both `./constraints` (abstract class)
 * and `./nodes` (interface). We resolve this by:
 * 1. Not re-exporting the constraints' `Node` class at the top level
 * 2. Making it available via the `constraints` namespace export
 * 3. The nodes' `Node` interface is the top-level `Node` export
 */

// Nodes — Node interface is the primary 'Node' export at this level
export * from './nodes';

// Constraints — available via namespace; individual exports may conflict with nodes
// Use `import { constraints } from '@/core'` or import directly from submodule paths
export * as constraints from './constraints';

// Re-export commonly-used constraint symbols (excluding conflicting 'Node')
export {
  // Relations
  Touching,
  SupportedBy,
  StableAgainst,
  CoPlanar,
  NegatedRelation,
  GeometryRelation,
  // Evaluator
  ObjectState as ConstraintObjectState,
  State as ConstraintState,
  BVHQueryEngine,
  // Solver
  SimulatedAnnealingSolver,
  GreedyPreSolver,
  FullSolverLoop as MCMCSolver,
  // Domain reasoning
  BoxDomain,
  SurfaceDomain,
  RoomDomain,
  // DSL
  ConstraintLexer,
  ConstraintParser,
  TokenType as DSLTokenType,
  ASTNodeType as DSLASTNodeType,
  parseConstraintSource,
  compileConstraint,
  evaluateProgram,
  EvalContext as DSLEvalContext,
  // Unified system (import from constraints/unified directly if needed)
  // UnifiedConstraintSystem,
  // ConstraintProposalSystem,
} from './constraints';

// Placement
export * from './placement';

// Rendering
export * from './rendering';

// Unified Tag System — canonical source for Semantics, Subpart, Tag, TagSet
export {
  Semantics,
  Subpart,
  Tag as UnifiedTag,
  TagSet as UnifiedTagSet,
  toUnifiedTag,
  toUnifiedTagSet,
  UnifiedTaggingSystem,
  createUnifiedTaggingSystem,
} from './UnifiedTagSystem';

export type {
  TagOptions,
  TagType as UnifiedTagType,
  TagSetConfig,
  TagDefinition,
  TaggedObject as UnifiedTaggedObject,
  TagQueryOptions as UnifiedTagQueryOptions,
  TagRegistryConfig as UnifiedTagRegistryConfig,
} from './UnifiedTagSystem';

// Attribute System — complete attribute management for Three.js BufferGeometry
export {
  AttributeSystem,
} from './attributes/AttributeSystem';

export type {
  AttributeDomain,
  AttributeDataType,
  AttributeInfo,
} from './attributes/AttributeSystem';

// Tag System — semantic and subpart tagging for objects and mesh faces
export {
  SemanticTag,
  SubpartTag,
  Tag as InfinigenTag,
  TagSet as InfinigenTagSet,
  TagQuery as InfinigenTagQuery,
  semanticTag,
  subpartTag,
  notTag,
  FaceTagger,
} from './tags';

export type {
  TagType as InfinigenTagType,
} from './tags';

// Util - export selectively to avoid Tag interface conflict with constraints' Tag class
export * from './util/MathUtils';
export * from './util/GeometryUtils';
export * from './util/PipelineUtils';
export {
  TaggingSystem,
  type TagType,
  type Tag as TagInfo,
  type TaggedObject,
  type TagQueryOptions,
  type TagRegistryConfig,
  type TaggingStatistics,
  createTaggingSystem,
} from './util/TaggingSystem';
export * from './util/MeshOperations';
export * from './util/BevelOperations';
export * as math from './util/math';
export * as optimization from './util/optimization';
