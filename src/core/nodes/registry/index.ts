/**
 * Registry Barrel Export
 *
 * Re-exports the public API from the three registry modules so that
 * consumers can import from a single path:
 *
 *   import { SocketType, NodeType, areSocketsCompatible } from './registry';
 *
 * @module core/nodes/registry
 */

// ---------------------------------------------------------------------------
// node-type-registry
// ---------------------------------------------------------------------------
export type { NodeType } from './node-type-registry';
export {
  resolveNodeType,
  isKnownNodeType,
  getAliasesForCanonical,
  registerNodeType,
  getCanonicalNodeTypes,
  getNodeCategory,
} from './node-type-registry';

// ---------------------------------------------------------------------------
// socket-types
// ---------------------------------------------------------------------------
export {
  SocketType,
  getDefaultValueForType,
  areSocketsCompatible,
} from './socket-types';
export type {
  SocketDefinition,
  NodeSocket,
  GeometryDataType,
} from './socket-types';

// ---------------------------------------------------------------------------
// node-definitions (placeholder — will be created later)
// ---------------------------------------------------------------------------
