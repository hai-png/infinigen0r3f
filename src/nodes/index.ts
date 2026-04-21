/**
 * Node System - Main Entry Point
 * 
 * Provides Blender-style node graph functionality for procedural generation.
 * 
 * @packageDocumentation
 */

// Core types and utilities
export * from './core/index.js';

// Transpiler for converting node graphs to code
export * from './transpiler/index.js';

// Pre-built node groups
export * from './groups/index.js';

// Re-export commonly used items
export {
  NodeType,
  NodeCategory,
  SocketType,
  type NodeTree,
  type NodeInstance,
  type NodeLink,
  type NodeGroup,
  type NodeSocket,
  areSocketsCompatible,
  getDefaultValueForType,
} from './core/types.js';

export {
  NodeWrangler,
  createMaterialNodeTree,
  createGeometryNodeTree,
  createCompositorNodeTree,
} from './core/node-wrangler.js';

export {
  NodeTranspiler,
  transpileNodeTree,
  type TranspilerOptions,
} from './transpiler/transpiler.js';

export {
  NodeGroups,
  createNoiseDisplacementGroup,
  createPrincipledMaterialGroup,
  createRandomDistributionGroup,
  createInstanceOnPointsGroup,
  createMeshBooleanGroup,
  createTextureMappingGroup,
  createColorRampGroup,
} from './groups/prebuilt-groups.js';
