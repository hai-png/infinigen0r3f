/**
 * Node System — Single Canonical Type Definitions
 *
 * This is the **one** source of truth for all node-system interfaces.
 * It replaces both the old `core/types.ts` and the duplicate interfaces
 * that were previously defined inline in `node-wrangler.ts`.
 *
 * Design choices:
 * - `unknown` instead of `any` everywhere possible
 * - `Map` for keyed collections (nodes, sockets, links) for O(1) lookup
 * - Proper JSDoc on every public symbol
 * - Imports socket-level types from the registry, never from legacy files
 *
 * @module core/nodes/types
 */

import type * as THREE from 'three';
import type { SocketType, NodeSocket, SocketDefinition } from './registry';

// ---------------------------------------------------------------------------
// Re-exports from registry (canonical sources)
// ---------------------------------------------------------------------------

/** Node type is a canonical Blender-style string identifier */
export type { NodeType } from './registry/node-type-registry';

/** Re-export SocketType enum for consumers that import from this module */
export { SocketType as SocketTypeEnum } from './registry';

/** Re-export NodeSocket and SocketDefinition for backward compatibility */
export type { NodeSocket, SocketDefinition } from './registry';

// ---------------------------------------------------------------------------
// Legacy interface — used by existing node definition files
// ---------------------------------------------------------------------------

/**
 * Base interface for typed node definitions.
 *
 * @deprecated Prefer the canonical {@link NodeInstance} for runtime data.
 * This interface exists for backward compatibility with node-definition
 * files that extend `Node` to declare typed input/output shapes.
 */
export interface Node {
  id?: string;
  type: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  params?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  val?: unknown;
  var?: string;
  value?: unknown;
  objs?: unknown[];
  pred?: unknown;
}

// ---------------------------------------------------------------------------
// Attribute & Category Enums
// ---------------------------------------------------------------------------

/**
 * Attribute domain types matching Blender's system.
 *
 * Determines the granularity at which an attribute lives on geometry:
 * per-vertex (point), per-edge, per-face, per-face-corner, etc.
 */
export type AttributeDomain =
  | 'point'
  | 'edge'
  | 'face'
  | 'face_corner'
  | 'spline'
  | 'curve'
  | 'instance';

/**
 * Node categories organized by Blender's Shift-A menu structure.
 *
 * Used for grouping nodes in the editor's add-menu and for
 * documentation / filtering purposes.
 */
export enum NodeCategory {
  // Geometry Nodes
  ATTRIBUTE = 'ATTRIBUTE',
  CURVE = 'CURVE',
  CURVE_PRIMITIVES = 'CURVE_PRIMITIVES',
  GEOMETRY = 'GEOMETRY',
  INPUT = 'INPUT',
  INSTANCES = 'INSTANCES',
  MATERIAL = 'MATERIAL',
  MESH = 'MESH',
  MESH_PRIMITIVES = 'MESH_PRIMITIVES',
  OUTPUT = 'OUTPUT',
  TEXTURE = 'TEXTURE',
  UTILITY = 'UTILITY',

  // Shader Nodes
  SHADER_INPUT = 'SHADER_INPUT',
  SHADER_OUTPUT = 'SHADER_OUTPUT',
  SHADER = 'SHADER',
  COLOR = 'COLOR',
  CONVERTER = 'CONVERTER',
  VECTOR = 'VECTOR',
}

// ---------------------------------------------------------------------------
// Core Graph Interfaces
// ---------------------------------------------------------------------------

/**
 * Runtime node instance in a graph — single canonical definition.
 *
 * Represents one concrete node placed in a node tree, with live socket
 * maps that hold current values and connection state.
 */
export interface NodeInstance {
  /** Unique identifier within the owning group */
  id: string;
  /** Canonical Blender-style type from NodeTypeRegistry */
  type: string;
  /** Human-readable display name */
  name: string;
  /** Position in the editor canvas (x = right, y = down) */
  location: [number, number];
  /** Live input sockets keyed by socket name */
  inputs: Map<string, NodeSocket>;
  /** Live output sockets keyed by socket name */
  outputs: Map<string, NodeSocket>;
  /** Node-specific property values (operation, data_type, etc.) */
  properties: Record<string, unknown>;
  /** When true the node's internals are collapsed in the editor */
  hidden?: boolean;
  /** When true the node is bypassed — outputs pass through default values */
  muted?: boolean;
  /** Parent node-group ID when this node lives inside a group */
  parent?: string;
}

/**
 * Link between two node sockets.
 *
 * Represents a directed edge in the node graph: data flows from
 * `fromNode.fromSocket` → `toNode.toSocket`.
 */
export interface NodeLink {
  /** Unique link identifier */
  id: string;
  /** Source node ID */
  fromNode: string;
  /** Source output socket name */
  fromSocket: string;
  /** Destination node ID */
  toNode: string;
  /** Destination input socket name */
  toSocket: string;
}

/**
 * Node group (subgraph).
 *
 * A group encapsulates a sub-graph with its own nodes, links, and
 * exposed input/output interface.  Groups can be nested — the `parent`
 * field tracks the containing group.
 */
export interface NodeGroup {
  /** Unique group identifier */
  id: string;
  /** Human-readable group name */
  name: string;
  /** Nodes belonging to this group, keyed by node ID */
  nodes: Map<string, NodeInstance>;
  /** Links belonging to this group, keyed by link ID */
  links: Map<string, NodeLink>;
  /** Exposed group-input sockets, keyed by socket name */
  inputs: Map<string, NodeSocket>;
  /** Exposed group-output sockets, keyed by socket name */
  outputs: Map<string, NodeSocket>;
  /** Parent group ID for nested groups, or undefined for root */
  parent?: string;
}

/**
 * Complete node tree (material, geometry, or compositor).
 *
 * The top-level container that holds all nodes, links, and groups
 * for a single Blender-style node tree.
 */
export interface NodeTree {
  /** Unique tree identifier */
  id: string;
  /** Human-readable tree name */
  name: string;
  /** Which Blender editor this tree belongs to */
  type: 'GeometryNodeTree' | 'ShaderNodeTree' | 'CompositorNodeTree';
  /** All top-level nodes in the tree, keyed by node ID */
  nodes: Map<string, NodeInstance>;
  /** All links at the top level of the tree */
  links: NodeLink[];
  /** Named sub-groups within this tree, keyed by group ID */
  groups: Map<string, NodeGroup>;
}

/**
 * Node group interface definition.
 *
 * Describes the input/output socket contract for a node group,
 * without the internal implementation.
 */
export interface NodeGroupInterface {
  /** Group-input sockets, keyed by name */
  inputs: Map<string, NodeSocket>;
  /** Group-output sockets, keyed by name */
  outputs: Map<string, NodeSocket>;
}

// ---------------------------------------------------------------------------
// Evaluation Types
// ---------------------------------------------------------------------------

/**
 * Evaluation mode for the node graph evaluator.
 *
 * Determines which execution pipeline is used and which node types
 * are valid within the graph.
 */
export enum EvaluationMode {
  /** Shader / material evaluation — produces a Three.js material */
  MATERIAL = 'MATERIAL',
  /** Geometry evaluation — produces geometry via modifier stack */
  GEOMETRY = 'GEOMETRY',
  /** Texture evaluation — produces a texture / image */
  TEXTURE = 'TEXTURE',
}

/**
 * Result of evaluating a node graph.
 *
 * Carries the computed value alongside any warnings or errors
 * that were encountered during evaluation.
 */
export interface NodeEvaluationResult {
  /** Which evaluation pipeline produced this result */
  mode: EvaluationMode;
  /** The computed output value (material, geometry, texture, etc.) */
  value: unknown;
  /** Non-fatal issues encountered during evaluation */
  warnings: string[];
  /** Fatal errors that may have partially corrupted the result */
  errors: string[];
}

/**
 * A node graph to be evaluated.
 *
 * Lightweight handle that pairs a set of nodes with their links,
 * without the full weight of a NodeTree (no groups, no tree type).
 */
export interface NodeGraph {
  /** Nodes in the graph, keyed by node ID */
  nodes: Map<string, NodeInstance>;
  /** Links connecting the nodes */
  links: NodeLink[];
}

/**
 * Node execution context.
 *
 * Passed into node executor functions to provide access to global
 * settings, the current node being executed, and any extra data
 * the executor may need.
 */
export interface NodeExecutionContext {
  /** Global or per-evaluation settings */
  settings?: Record<string, unknown>;
  /** The node being executed (set by the evaluator loop) */
  node?: NodeInstance;
  /** Extension point for executor-specific data */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Geometry Placeholder
// ---------------------------------------------------------------------------

/**
 * Geometry type placeholder.
 *
 * In a Three.js / R3F pipeline the concrete type is `THREE.BufferGeometry`;
 * `null` represents the absence of geometry.
 */
export type GeometryType = THREE.BufferGeometry | null;
