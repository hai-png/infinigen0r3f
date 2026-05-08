/**
 * NodeGroupEvaluator — Runtime evaluation of nested node groups
 *
 * Provides recursive evaluation of node group definitions within the
 * NodeEvaluator pipeline. When the main NodeEvaluator encounters a node
 * whose type references a registered group definition, it delegates to
 * this class.
 *
 * ## Architecture
 *
 * - Accepts both `NodeGroupDefinition` class instances (from
 *   `NodeGroupComposition.ts`) and plain-object definitions.
 * - Maps input values to the group's exposed input sockets via
 *   `inputMappings`.
 * - Topologically sorts the internal node graph and evaluates each
 *   internal node using the executor registry.
 * - For nested group references (internal nodes with a
 *   `groupDefinitionId`), recursively evaluates the child group.
 * - Maps internal output sockets back to the group's exposed output
 *   sockets via `outputMappings`.
 * - Enforces a maximum nesting depth of 32 levels.
 * - Caches group evaluation results keyed by (definition ID, input hash).
 * - Propagates warnings and errors from nested evaluations.
 * - Supports per-instance parameter overrides.
 *
 * @module core/nodes/execution/NodeGroupEvaluator
 */

import { getExecutor, registerAllExecutors } from './executor-registry';
import {
  NodeGroupDefinition,
  type InternalNode,
  type InternalConnection,
  type ExposedMapping,
  type GroupSocket,
} from '../groups/NodeGroupComposition';
import { SocketType, getDefaultValueForType } from '../registry/socket-types';
import { resolveNodeType } from '../registry/node-type-registry';

// ============================================================================
// Constants
// ============================================================================

/** Maximum recursion depth for nested group evaluation. */
const MAX_GROUP_DEPTH = 32;

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Plain-object representation of a group interface socket.
 *
 * Compatible with the `NodeGroupInterface` shape requested in the task
 * specification and also maps to `GroupSocket` from NodeGroupComposition.
 */
export interface NodeGroupInterfaceSocket {
  /** Socket display name (unique within its direction on the group) */
  name: string;
  /** Data type carried by this socket */
  type: SocketType | GroupSocket['type'];
  /** Default value when no external connection or override is provided */
  defaultValue: unknown;
  /** Minimum value for float/numeric types */
  min?: number;
  /** Maximum value for float/numeric types */
  max?: number;
}

/**
 * Plain-object representation of a node group definition.
 *
 * This is the "loose" alternative to the `NodeGroupDefinition` class —
 * consumers that don't want to depend on the class can pass a plain
 * object matching this shape instead.
 */
export interface NodeGroupDefinitionLike {
  /** Unique definition identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Internal nodes keyed by node ID */
  nodes: Map<string, InternalNode> | Array<InternalNode>;
  /** Internal connections */
  links: InternalConnection[];
  /** Exposed input sockets */
  exposedInputs: NodeGroupInterfaceSocket[] | Map<string, GroupSocket>;
  /** Exposed output sockets */
  exposedOutputs: NodeGroupInterfaceSocket[] | Map<string, GroupSocket>;
  /** Input exposure mappings (exposedName → mapping) */
  inputMappings: Map<string, ExposedMapping> | Array<ExposedMapping>;
  /** Output exposure mappings (exposedName → mapping) */
  outputMappings: Map<string, ExposedMapping> | Array<ExposedMapping>;
}

/**
 * Result of evaluating a node group.
 */
export interface NodeGroupEvalResult {
  /** Exposed output name → computed value */
  outputs: Record<string, unknown>;
  /** Non-fatal warnings from the evaluation */
  warnings: string[];
  /** Fatal errors that may have partially corrupted the result */
  errors: string[];
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Normalise a `NodeGroupDefinitionLike` into a consistent shape that the
 * evaluator can work with, regardless of whether it was given a class
 * instance or a plain object.
 */
interface NormalizedGroupDef {
  id: string;
  name: string;
  nodes: Map<string, InternalNode>;
  connections: InternalConnection[];
  inputSockets: Map<string, GroupSocket>;
  outputSockets: Map<string, GroupSocket>;
  inputMappings: Map<string, ExposedMapping>;
  outputMappings: Map<string, ExposedMapping>;
}

/**
 * Convert a `SocketType` or `GroupSocket['type']` value to a canonical
 * `SocketType` enum member.  The `GroupSocket.type` field uses a subset
 * of string literals (`'float' | 'color' | 'vector' | 'shader' | 'geometry'`)
 * that we map to the corresponding enum values.
 */
function toSocketType(t: SocketType | GroupSocket['type']): SocketType {
  if (typeof t === 'string') {
    switch (t) {
      case 'float':   return SocketType.FLOAT;
      case 'color':   return SocketType.COLOR;
      case 'vector':  return SocketType.VECTOR;
      case 'shader':  return SocketType.SHADER;
      case 'geometry': return SocketType.GEOMETRY;
      default: {
        // Might already be a SocketType enum value like 'FLOAT'
        const upper = t.toUpperCase() as SocketType;
        if (Object.values(SocketType).includes(upper)) return upper;
        return SocketType.FLOAT;
      }
    }
  }
  return t;
}

/**
 * Normalise a group definition (class instance or plain object) into the
 * internal `NormalizedGroupDef` shape.
 */
function normalizeDefinition(
  def: NodeGroupDefinition | NodeGroupDefinitionLike,
): NormalizedGroupDef {
  // ── Class instance path ──
  if (def instanceof NodeGroupDefinition) {
    return {
      id: def.id,
      name: def.name,
      nodes: def.nodes,
      connections: def.connections,
      inputSockets: def.inputSockets,
      outputSockets: def.outputSockets,
      inputMappings: def.inputMappings,
      outputMappings: def.outputMappings,
    };
  }

  // ── Plain object path ──
  const nodes: Map<string, InternalNode> =
    def.nodes instanceof Map
      ? def.nodes
      : new Map(def.nodes.map((n) => [n.id, n]));

  const inputMappings: Map<string, ExposedMapping> =
    def.inputMappings instanceof Map
      ? def.inputMappings
      : new Map(def.inputMappings.map((m) => [m.exposedName, m]));

  const outputMappings: Map<string, ExposedMapping> =
    def.outputMappings instanceof Map
      ? def.outputMappings
      : new Map(def.outputMappings.map((m) => [m.exposedName, m]));

  const inputSockets = new Map<string, GroupSocket>();
  if (def.exposedInputs instanceof Map) {
    for (const [name, socket] of def.exposedInputs) {
      inputSockets.set(name, socket);
    }
  } else {
    for (const s of def.exposedInputs) {
      inputSockets.set(s.name, {
        name: s.name,
        type: toSocketType(s.type) as unknown as GroupSocket['type'],
        defaultValue: s.defaultValue,
        min: s.min,
        max: s.max,
      });
    }
  }

  const outputSockets = new Map<string, GroupSocket>();
  if (def.exposedOutputs instanceof Map) {
    for (const [name, socket] of def.exposedOutputs) {
      outputSockets.set(name, socket);
    }
  } else {
    for (const s of def.exposedOutputs) {
      outputSockets.set(s.name, {
        name: s.name,
        type: toSocketType(s.type) as unknown as GroupSocket['type'],
        defaultValue: s.defaultValue,
        min: s.min,
        max: s.max,
      });
    }
  }

  return {
    id: def.id,
    name: def.name,
    nodes,
    connections: def.links,
    inputSockets,
    outputSockets,
    inputMappings,
    outputMappings,
  };
}

/**
 * Simple hash of the input values for caching.
 * Uses JSON.stringify for deterministic serialisation.
 */
function hashInputs(inputs: Record<string, unknown>): string {
  try {
    return JSON.stringify(inputs);
  } catch {
    // Fallback: use key count + values
    return String(Object.keys(inputs).length);
  }
}

// ============================================================================
// NodeGroupEvaluator
// ============================================================================

/**
 * Evaluates node group definitions at runtime, supporting recursive
 * nesting, parameter overrides, and result caching.
 *
 * ## Usage
 *
 * ```ts
 * const evaluator = new NodeGroupEvaluator();
 * evaluator.registerDefinition(myGroupDef);
 *
 * // Evaluate a group by its registered ID
 * const result = evaluator.evaluateGroup('my_group_id', { Scale: 5.0 });
 * console.log(result.outputs.Fac); // → computed value
 * ```
 *
 * The main `NodeEvaluator` delegates to this class when it encounters a
 * node whose type matches a registered group definition ID.
 */
export class NodeGroupEvaluator {
  /** Registered group definitions, keyed by definition ID */
  private definitions: Map<string, NormalizedGroupDef> = new Map();

  /**
   * Cache of evaluation results, keyed by
   * `${definitionId}::${inputHash}`.
   */
  private cache: Map<string, NodeGroupEvalResult> = new Map();

  /** Whether the executor registry has been initialised */
  private static registryInitialized = false;

  /**
   * Ensure the executor registry is populated on first use.
   * Idempotent — subsequent calls are no-ops.
   */
  private static ensureRegistry(): void {
    if (!NodeGroupEvaluator.registryInitialized) {
      registerAllExecutors();
      NodeGroupEvaluator.registryInitialized = true;
    }
  }

  // ── Registration ────────────────────────────────────────────────────

  /**
   * Register a group definition (class instance or plain object).
   *
   * @param definition - The group definition to register.
   */
  registerDefinition(definition: NodeGroupDefinition | NodeGroupDefinitionLike): void {
    const normalized = normalizeDefinition(definition);
    this.definitions.set(normalized.id, normalized);
  }

  /**
   * Unregister a group definition.
   *
   * @param id - The definition ID to remove.
   * @returns `true` if the definition existed and was removed.
   */
  unregisterDefinition(id: string): boolean {
    // Also clear any cached results for this definition
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${id}::`)) {
        this.cache.delete(key);
      }
    }
    return this.definitions.delete(id);
  }

  /**
   * Check whether a group definition is registered under the given ID
   * or type string.
   *
   * @param typeId - The definition ID or node type to look up.
   * @returns `true` if a matching definition exists.
   */
  hasDefinition(typeId: string): boolean {
    return this.definitions.has(typeId);
  }

  /**
   * Retrieve a registered definition by ID.
   *
   * @param id - The definition ID.
   * @returns The normalized definition, or `undefined`.
   */
  getDefinition(id: string): NormalizedGroupDef | undefined {
    return this.definitions.get(id);
  }

  /**
   * Clear all registered definitions and cached results.
   */
  clear(): void {
    this.definitions.clear();
    this.cache.clear();
  }

  /**
   * Invalidate cached results for a specific definition or all
   * definitions.
   *
   * @param definitionId - If provided, only clear cache entries for
   *                       this definition. Otherwise clear the entire
   *                       cache.
   */
  invalidateCache(definitionId?: string): void {
    if (definitionId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${definitionId}::`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // ── Evaluation ──────────────────────────────────────────────────────

  /**
   * Evaluate a registered group definition with the given input values.
   *
   * @param definitionId - The registered definition ID.
   * @param inputs       - Values for the group's exposed input sockets.
   * @param overrides    - Per-instance parameter overrides (same as
   *                       inputs but semantically distinct — overrides
   *                       take precedence over `inputs`).
   * @param depth        - Current nesting depth (internal use).
   * @returns The evaluation result with outputs, warnings, and errors.
   */
  evaluateGroup(
    definitionId: string,
    inputs: Record<string, unknown> = {},
    overrides: Record<string, unknown> = {},
    depth: number = 0,
  ): NodeGroupEvalResult {
    NodeGroupEvaluator.ensureRegistry();

    const emptyResult: NodeGroupEvalResult = { outputs: {}, warnings: [], errors: [] };

    // ── Depth guard ──
    if (depth >= MAX_GROUP_DEPTH) {
      emptyResult.errors.push(
        `Maximum group nesting depth (${MAX_GROUP_DEPTH}) exceeded at "${definitionId}".`,
      );
      return emptyResult;
    }

    // ── Look up definition ──
    const def = this.definitions.get(definitionId);
    if (!def) {
      emptyResult.errors.push(`Group definition "${definitionId}" not registered.`);
      return emptyResult;
    }

    // ── Merge inputs with overrides ──
    const mergedInputs: Record<string, unknown> = { ...inputs, ...overrides };

    // ── Check cache ──
    const cacheKey = `${definitionId}::${hashInputs(mergedInputs)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        outputs: { ...cached.outputs },
        warnings: [...cached.warnings],
        errors: [...cached.errors],
      };
    }

    // ── Resolve exposed input values ──
    const resolvedInputs = new Map<string, unknown>();
    for (const [name, socket] of def.inputSockets) {
      if (name in mergedInputs && mergedInputs[name] !== undefined) {
        resolvedInputs.set(name, mergedInputs[name]);
      } else if (socket.defaultValue !== undefined) {
        resolvedInputs.set(name, socket.defaultValue);
      } else {
        resolvedInputs.set(name, getDefaultValueForType(toSocketType(socket.type)));
      }
    }

    // ── Topological sort of internal nodes ──
    const sortedNodeIds = this.topologicalSort(def);

    // ── Evaluate each internal node ──
    const warnings: string[] = [];
    const errors: string[] = [];
    const nodeOutputs = new Map<string, Record<string, unknown>>();

    for (const nodeId of sortedNodeIds) {
      const node = def.nodes.get(nodeId);
      if (!node) continue;

      const nodeInputs = this.resolveNodeInputs(
        node,
        def,
        resolvedInputs,
        nodeOutputs,
      );

      // ── Nested group reference ──
      if (node.groupDefinitionId) {
        const childResult = this.evaluateGroup(
          node.groupDefinitionId,
          nodeInputs,
          {},
          depth + 1,
        );

        // Propagate warnings/errors
        warnings.push(...childResult.warnings);
        errors.push(...childResult.errors);

        nodeOutputs.set(nodeId, childResult.outputs);
        continue;
      }

      // ── Regular node — use executor registry ──
      const executor = getExecutor(node.nodeType);
      if (executor) {
        try {
          const result = executor(
            nodeInputs as Record<string, unknown>,
            { settings: node.socketDefaults ?? {}, node },
          );
          nodeOutputs.set(nodeId, result as Record<string, unknown>);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(
            `Error evaluating node "${nodeId}" (${node.nodeType}) in group "${def.name}": ${msg}`,
          );
          nodeOutputs.set(nodeId, {});
        }
      } else {
        // No executor — pass through inputs as outputs with a warning
        warnings.push(
          `[NodeGroupEvaluator] No executor for node type: ${node.nodeType} (node "${nodeId}" in group "${def.name}")`,
        );
        const passthrough: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(nodeInputs)) {
          passthrough[key] = value ?? null;
        }
        nodeOutputs.set(nodeId, passthrough);
      }
    }

    // ── Map internal outputs to exposed outputs ──
    const outputs: Record<string, unknown> = {};

    for (const [exposedName, mapping] of def.outputMappings) {
      const srcOutputs = nodeOutputs.get(mapping.internalNode);
      if (srcOutputs && mapping.internalSocket in srcOutputs) {
        outputs[exposedName] = srcOutputs[mapping.internalSocket];
      } else {
        // Try the outputSockets for a default
        const socket = def.outputSockets.get(exposedName);
        outputs[exposedName] = socket?.defaultValue ?? null;
      }
    }

    // If no output mappings, fall back to all output sockets
    if (Object.keys(outputs).length === 0) {
      for (const [name, socket] of def.outputSockets) {
        outputs[name] = socket.defaultValue ?? null;
      }
    }

    const result: NodeGroupEvalResult = {
      outputs,
      warnings,
      errors,
    };

    // Cache the result
    this.cache.set(cacheKey, result);

    return {
      outputs: { ...result.outputs },
      warnings: [...result.warnings],
      errors: [...result.errors],
    };
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Topological sort of internal nodes using Kahn's algorithm.
   */
  private topologicalSort(def: NormalizedGroupDef): string[] {
    const nodeIds = Array.from(def.nodes.keys());
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adj.set(id, []);
    }

    for (const conn of def.connections) {
      inDegree.set(conn.toNode, (inDegree.get(conn.toNode) ?? 0) + 1);
      adj.get(conn.fromNode)?.push(conn.toNode);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      for (const dep of adj.get(current) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) queue.push(dep);
      }
    }

    return order;
  }

  /**
   * Resolve the inputs for a single internal node by combining:
   * 1. Socket defaults from the InternalNode
   * 2. Values from exposed group inputs (via inputMappings)
   * 3. Values from upstream connections
   */
  private resolveNodeInputs(
    node: InternalNode,
    def: NormalizedGroupDef,
    resolvedGroupInputs: Map<string, unknown>,
    nodeOutputs: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // 1. Socket defaults
    for (const [socketName, defaultVal] of Object.entries(node.socketDefaults)) {
      if (defaultVal !== undefined) {
        inputs[socketName] = defaultVal;
      }
    }

    // 2. Exposed group input mappings
    for (const [, mapping] of def.inputMappings) {
      if (mapping.internalNode === node.id) {
        const val = resolvedGroupInputs.get(mapping.exposedName);
        if (val !== undefined) {
          inputs[mapping.internalSocket] = val;
        }
      }
    }

    // 3. Upstream connections
    for (const conn of def.connections) {
      if (conn.toNode !== node.id) continue;

      const srcOutputs = nodeOutputs.get(conn.fromNode);
      if (srcOutputs && conn.fromSocket in srcOutputs) {
        inputs[conn.toSocket] = srcOutputs[conn.fromSocket];
      }
    }

    return inputs;
  }
}
