/**
 * NodeEvaluator — Clean node graph evaluation pipeline
 *
 * Takes a {@link NodeGraph} (nodes + links) and evaluates it using
 * topological sort to respect data-flow order.
 *
 * ## Design Principles
 *
 * - **Registry-only execution**: All node execution goes through
 *   `getExecutor()` from the executor-registry. No if-else chains,
 *   no fallback handlers.
 * - **Canonical type resolution**: Uses `resolveNodeType()` from the
 *   node-type-registry instead of checking multiple alias strings.
 * - **`unknown` over `any`**: All value types use `unknown` with
 *   explicit casts only where necessary.
 * - **New import paths only**: All imports come from the canonical
 *   `../types`, `../registry/*`, and `./executor-registry` modules.
 *
 * ## Evaluation Modes
 *
 * - **MATERIAL** — produces a Three.js material
 * - **GEOMETRY** — produces geometry modifications
 * - **TEXTURE**  — produces a DataTexture
 *
 * @module core/nodes/execution/node-evaluator
 */

import type {
  NodeInstance,
  NodeLink,
  NodeGraph,
  NodeEvaluationResult,
  NodeExecutionContext,
} from '../types';

import { EvaluationMode } from '../types';

import {
  SocketType,
  areSocketsCompatible,
  getDefaultValueForType,
} from '../registry/socket-types';

import { getExecutor, registerAllExecutors } from './executor-registry';
import { resolveNodeType } from '../registry/node-type-registry';

// ============================================================================
// Local Types
// ============================================================================

/**
 * Minimal node-definition shape required by the evaluator.
 *
 * Unlike the full `NodeDefinition` in `core/types.ts`, this only
 * includes the fields the evaluator actually reads. It is defined
 * locally to avoid importing from legacy paths.
 */
interface NodeDefinition {
  /** Canonical Blender-style node type identifier */
  type: string;
  /** Declared input sockets */
  inputs: Array<{
    name: string;
    type: SocketType;
    required?: boolean;
    default?: unknown;
  }>;
  /** Declared output sockets */
  outputs: Array<{
    name: string;
    type: SocketType;
  }>;
  /** Default input values keyed by socket name */
  defaults?: Record<string, unknown>;
}

/**
 * Minimal geometry interface used by per-vertex evaluation helpers.
 *
 * Avoids a direct `THREE.BufferGeometry` import while still providing
 * the `getAttribute` method that the field-evaluator depends on.
 */
interface BufferGeometryLike {
  getAttribute(name: string): BufferAttributeLike | null;
}

/**
 * Minimal buffer-attribute interface for per-vertex data access.
 */
interface BufferAttributeLike {
  count: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

/**
 * Per-vertex context passed to field evaluator functions.
 */
interface VertexContext {
  x: number;
  y: number;
  z: number;
}

// ============================================================================
// Error Classes
// ============================================================================

/** Error thrown when a cyclic dependency is detected during topological sort. */
export class CyclicDependencyError extends Error {
  constructor(public readonly cycleNodes: string[]) {
    super(`Cyclic dependency detected: ${cycleNodes.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/** Error thrown when a required connection is missing. */
export class MissingConnectionError extends Error {
  constructor(nodeId: string, socketName: string) {
    super(`Missing required connection: node "${nodeId}" input "${socketName}"`);
    this.name = 'MissingConnectionError';
  }
}

/** Error thrown when socket types are incompatible on a link. */
export class SocketTypeMismatchError extends Error {
  constructor(
    fromNode: string,
    fromSocket: string,
    fromType: string,
    toNode: string,
    toSocket: string,
    toType: string,
  ) {
    super(
      `Socket type mismatch: ${fromNode}.${fromSocket}(${fromType}) → ${toNode}.${toSocket}(${toType})`,
    );
    this.name = 'SocketTypeMismatchError';
  }
}

// ============================================================================
// NodeEvaluator
// ============================================================================

/**
 * Evaluates a node graph by performing topological sort and executing
 * each node via the executor registry.
 *
 * Usage:
 * ```ts
 * const evaluator = new NodeEvaluator();
 * evaluator.registerDefinitions(myDefinitions);
 * const result = evaluator.evaluate(graph, EvaluationMode.GEOMETRY);
 * ```
 */
export class NodeEvaluator {
  /** Per-node output cache keyed by `node:<id>` */
  private cache: Map<string, unknown> = new Map();

  /** Non-fatal warnings accumulated during evaluation */
  private warnings: string[] = [];

  /** Fatal errors accumulated during evaluation */
  private errors: string[] = [];

  /** Registered node definitions, keyed by canonical type string */
  private nodeDefinitions: Map<string, NodeDefinition> = new Map();

  // -----------------------------------------------------------------------
  // Registry bootstrap
  // -----------------------------------------------------------------------

  /** Whether `registerAllExecutors()` has been called on this class. */
  private static registryInitialized = false;

  /**
   * Ensure the executor registry is populated on first instantiation.
   * `registerAllExecutors()` is idempotent — subsequent calls are no-ops.
   */
  private static ensureRegistry(): void {
    if (!NodeEvaluator.registryInitialized) {
      registerAllExecutors();
      NodeEvaluator.registryInitialized = true;
    }
  }

  // -----------------------------------------------------------------------
  // Definition registration
  // -----------------------------------------------------------------------

  /** Register a node definition for lookup during evaluation. */
  registerDefinition(definition: NodeDefinition): void {
    this.nodeDefinitions.set(definition.type, definition);
  }

  /** Register multiple definitions at once. */
  registerDefinitions(definitions: NodeDefinition[]): void {
    for (const def of definitions) {
      this.registerDefinition(def);
    }
  }

  // -----------------------------------------------------------------------
  // Main evaluation entry point
  // -----------------------------------------------------------------------

  /**
   * Evaluate a node graph in the given mode.
   *
   * Pipeline:
   * 1. Ensure the executor registry is populated.
   * 2. Validate the graph (type mismatches, missing connections).
   * 3. Topologically sort the nodes.
   * 4. Evaluate each node in order, caching results.
   * 5. Find and return the output node's result.
   */
  evaluate(graph: NodeGraph, mode: EvaluationMode): NodeEvaluationResult {
    NodeEvaluator.ensureRegistry();

    this.cache.clear();
    this.warnings = [];
    this.errors = [];

    try {
      // Step 1: Validate graph
      this.validateGraph(graph);

      // Step 2: Topological sort
      const sortedNodes = this.topologicalSort(graph);

      // Step 3: Evaluate each node in order
      let finalOutput: unknown = null;

      for (const nodeId of sortedNodes) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        finalOutput = this.evaluateNode(node, graph);
      }

      // Step 4: Find the output node and return its result
      const outputNodeId = this.findOutputNode(graph, mode);
      if (outputNodeId) {
        const outputNode = graph.nodes.get(outputNodeId);
        if (outputNode) {
          finalOutput = this.getNodeOutput(outputNode);
        }
      }

      return {
        mode,
        value: finalOutput,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors.push(message);
      return {
        mode,
        value: null,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Topological sort
  // -----------------------------------------------------------------------

  /**
   * Perform topological sort on the node graph using Kahn's algorithm.
   *
   * Respects data-flow order based on connections. Throws
   * {@link CyclicDependencyError} if a cycle is detected.
   */
  topologicalSort(graph: NodeGraph): string[] {
    const nodes = graph.nodes;
    const links = graph.links;

    // Build adjacency list and in-degree count
    const adj: Map<string, Set<string>> = new Map();
    const inDegree: Map<string, number> = new Map();

    for (const [id] of nodes) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    // Build edges: from source node to target node
    for (const link of links) {
      adj.get(link.fromNode)?.add(link.toNode);
      inDegree.set(link.toNode, (inDegree.get(link.toNode) ?? 0) + 1);
    }

    // Start with nodes that have no incoming edges
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      sorted.push(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Check for cycles
    if (sorted.length !== nodes.size) {
      const cycleNodes: string[] = [];
      for (const [id] of nodes) {
        if (!visited.has(id)) {
          cycleNodes.push(id);
        }
      }
      throw new CyclicDependencyError(cycleNodes);
    }

    return sorted;
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  /**
   * Validate the graph for type mismatches and missing connections.
   *
   * Populates `this.warnings` and `this.errors` arrays but does not
   * throw — evaluation continues with best-effort results.
   */
  private validateGraph(graph: NodeGraph): void {
    for (const link of graph.links) {
      this.validateLink(link, graph);
    }

    // Check for missing required connections
    for (const [nodeId, node] of graph.nodes) {
      const def = this.nodeDefinitions.get(resolveNodeType(node.type));
      if (!def) continue;

      for (const input of def.inputs) {
        if (!input.required) continue;

        const hasConnection = graph.links.some(
          (l: NodeLink) => l.toNode === nodeId && l.toSocket === input.name,
        );

        const hasValue =
          node.inputs instanceof Map
            ? node.inputs.has(input.name) && node.inputs.get(input.name) !== undefined
            : typeof node.inputs === 'object' &&
              input.name in (node.inputs as Record<string, unknown>) &&
              (node.inputs as Record<string, unknown>)[input.name] !== undefined;

        if (!hasConnection && !hasValue) {
          this.warnings.push(
            `Missing required input "${input.name}" on node "${nodeId}" (${node.type})`,
          );
        }
      }
    }
  }

  /**
   * Validate a single link for socket type compatibility.
   */
  private validateLink(link: NodeLink, graph: NodeGraph): void {
    const fromNode = graph.nodes.get(link.fromNode);
    const toNode = graph.nodes.get(link.toNode);

    if (!fromNode || !toNode) {
      this.errors.push(
        `Link references non-existent node: ${!fromNode ? link.fromNode : link.toNode}`,
      );
      return;
    }

    // Try to get socket types from definitions
    const fromDef = this.nodeDefinitions.get(resolveNodeType(fromNode.type));
    const toDef = this.nodeDefinitions.get(resolveNodeType(toNode.type));

    if (fromDef && toDef) {
      const fromSocket = fromDef.outputs.find((o) => o.name === link.fromSocket);
      const toSocket = toDef.inputs.find((i) => i.name === link.toSocket);

      if (fromSocket && toSocket) {
        if (!areSocketsCompatible(fromSocket.type, toSocket.type)) {
          this.warnings.push(
            `Type mismatch: ${link.fromNode}.${link.fromSocket}(${fromSocket.type}) → ${link.toNode}.${link.toSocket}(${toSocket.type})`,
          );
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Node evaluation
  // -----------------------------------------------------------------------

  /**
   * Evaluate a single node, pulling inputs from connected upstream nodes.
   *
   * The result is cached so downstream nodes can retrieve it without
   * redundant computation.
   */
  private evaluateNode(node: NodeInstance, graph: NodeGraph): unknown {
    const cacheKey = `node:${node.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Resolve inputs: either from connections or from node settings
    const resolvedInputs: Record<string, unknown> = {};

    // Get default values from definition
    const def = this.nodeDefinitions.get(resolveNodeType(node.type));
    if (def?.defaults) {
      Object.assign(resolvedInputs, def.defaults);
    }

    // Override with node's own input values
    if (node.inputs instanceof Map) {
      for (const [key, value] of node.inputs) {
        if (value !== undefined && value !== null) {
          resolvedInputs[key] = value;
        }
      }
    } else if (typeof node.inputs === 'object') {
      for (const [key, value] of Object.entries(node.inputs as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          resolvedInputs[key] = value;
        }
      }
    }

    // Resolve connections (overriding local values)
    for (const link of graph.links) {
      if (link.toNode !== node.id) continue;

      const upstreamNode = graph.nodes.get(link.fromNode);
      if (!upstreamNode) continue;

      const upstreamOutput = this.getNodeOutput(upstreamNode);
      const outputValue = this.extractSocketValue(upstreamOutput, link.fromSocket);

      if (outputValue !== undefined) {
        resolvedInputs[link.toSocket] = outputValue;
      } else {
        // Use default for the socket type
        const toDef = this.nodeDefinitions.get(resolveNodeType(node.type));
        const toSocket = toDef?.inputs.find((i) => i.name === link.toSocket);
        if (toSocket) {
          resolvedInputs[link.toSocket] =
            toSocket.default ?? getDefaultValueForType(toSocket.type);
          this.warnings.push(
            `Missing output "${link.fromSocket}" from node "${link.fromNode}", using default`,
          );
        }
      }
    }

    // -------------------------------------------------------------------
    // Special handling for CaptureAttribute: evaluate Value field
    // per-vertex
    //
    // In Blender's geometry nodes, CaptureAttribute evaluates the Value
    // input field at EACH element of the geometry. The upstream node
    // (e.g., Position, Normal, Index) produces per-element data that
    // must be collected for every vertex/face.
    // -------------------------------------------------------------------
    if (resolveNodeType(node.type) === 'GeometryNodeCaptureAttribute') {
      this.enhanceCaptureAttributeInputs(node, graph, resolvedInputs);
    }

    // Execute the node
    const result = this.executeNodeByType(node, resolvedInputs);

    // Cache the result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Extract a named socket value from a node output.
   *
   * Handles both `Map` and plain-object output formats.
   */
  private extractSocketValue(output: unknown, socketName: string): unknown {
    if (output instanceof Map) {
      return output.get(socketName);
    }
    if (typeof output === 'object' && output !== null) {
      return (output as Record<string, unknown>)[socketName];
    }
    return output;
  }

  /**
   * Get the output of a node (from cache or from the node's own outputs).
   */
  private getNodeOutput(node: NodeInstance): unknown {
    const cacheKey = `node:${node.id}`;
    return this.cache.get(cacheKey) ?? node.outputs;
  }

  // -----------------------------------------------------------------------
  // Executor dispatch (registry-only)
  // -----------------------------------------------------------------------

  /**
   * Execute a node based on its type — **registry only**.
   *
   * Looks up the executor via `getExecutor()`. If no executor is found,
   * inputs are passed through as outputs with a warning. No if-else
   * chain, no fallback handler.
   */
  private executeNodeByType(
    node: NodeInstance,
    inputs: Record<string, unknown>,
  ): Record<string, unknown> {
    const executor = getExecutor(node.type);
    if (executor) {
      return executor(inputs, { settings: node.properties ?? {}, node });
    }

    // No executor — pass through inputs to outputs
    console.warn(`[NodeEvaluator] No executor for node type: ${node.type}`);
    const outputValues: Record<string, unknown> = {};
    if (node.outputs instanceof Map) {
      for (const [outName] of node.outputs) {
        outputValues[outName] = inputs[outName] ?? null;
      }
    }
    return outputValues;
  }

  // -----------------------------------------------------------------------
  // CaptureAttribute per-vertex enhancement
  // -----------------------------------------------------------------------

  /**
   * Enhance the resolved inputs for a CaptureAttribute node so the
   * Value field is evaluated per-element rather than as a single
   * global value.
   *
   * If the Value input's upstream node already returned a per-element
   * array (which Position/Normal executors do), the array is passed
   * through directly. If it returned a single scalar, we create a
   * field evaluator function that the CaptureAttribute executor can
   * call for each element.
   */
  private enhanceCaptureAttributeInputs(
    node: NodeInstance,
    graph: NodeGraph,
    resolvedInputs: Record<string, unknown>,
  ): void {
    // If Value is already an array, function, or AttributeStream — skip
    const value = resolvedInputs.Value ?? resolvedInputs.value;
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) || typeof value === 'function') {
        return; // Already per-element or field evaluator
      }
      // Check if it's an AttributeStream-like object
      if (
        typeof value === 'object' &&
        'getFloat' in (value as object) &&
        'size' in (value as object)
      ) {
        return; // Already a stream
      }
    }

    // Find the upstream node connected to the "Value" input
    let valueUpstreamNodeId: string | null = null;
    let valueUpstreamSocket: string | null = null;
    for (const link of graph.links) {
      if (link.toNode === node.id && (link.toSocket === 'Value' || link.toSocket === 'value')) {
        valueUpstreamNodeId = link.fromNode;
        valueUpstreamSocket = link.fromSocket;
        break;
      }
    }

    if (!valueUpstreamNodeId || !valueUpstreamSocket) return;

    // Get the geometry from the resolved inputs
    const geometry = resolvedInputs.Geometry ?? resolvedInputs.geometry ?? null;
    if (!geometry || typeof geometry !== 'object' || !('getAttribute' in geometry)) return;

    // Create a field evaluator function that will evaluate the upstream
    // node per-vertex. The CaptureAttribute executor will call this
    // function for each element.
    const evaluator = this.createFieldEvaluator(
      valueUpstreamNodeId,
      valueUpstreamSocket,
      graph,
      geometry as unknown as BufferGeometryLike,
    );
    if (evaluator) {
      resolvedInputs.Value = evaluator;
    }
  }

  /**
   * Create a field evaluator function for the Value input of
   * CaptureAttribute.
   *
   * The evaluator takes `(index, position, normal)` and returns the
   * value of the upstream node when evaluated with that per-vertex
   * context.
   *
   * For known input nodes (Position, Normal, Index, ID), we directly
   * return per-vertex data from the geometry. For other nodes, we
   * re-evaluate the upstream subgraph with per-vertex overrides.
   */
  private createFieldEvaluator(
    upstreamNodeId: string,
    upstreamSocket: string,
    graph: NodeGraph,
    geometry: BufferGeometryLike,
  ): ((index: number, position: VertexContext, normal: VertexContext) => unknown) | null {
    const upstreamNode = graph.nodes.get(upstreamNodeId);
    if (!upstreamNode) return null;

    const upstreamCanonical = resolveNodeType(upstreamNode.type);
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    // For Position input nodes, directly return per-vertex position
    if (upstreamCanonical === 'GeometryNodeInputPosition') {
      return (index: number) => {
        if (posAttr && index < posAttr.count) {
          return { x: posAttr.getX(index), y: posAttr.getY(index), z: posAttr.getZ(index) };
        }
        return { x: 0, y: 0, z: 0 };
      };
    }

    // For Normal input nodes, directly return per-vertex normal
    if (upstreamCanonical === 'GeometryNodeInputNormal') {
      return (_index: number, _position: VertexContext, normal: VertexContext) => {
        return normal;
      };
    }

    // For Index input nodes, return the index itself
    if (upstreamCanonical === 'GeometryNodeInputIndex') {
      return (index: number) => index;
    }

    // For ID input nodes, return the index (ID = index for now)
    if (upstreamCanonical === 'GeometryNodeInputID') {
      return (index: number) => index;
    }

    // For other nodes, try to re-evaluate per-vertex by overriding
    // the Position/Normal/Index inputs in the upstream subgraph
    return (
      index: number,
      position: VertexContext,
      normal: VertexContext,
    ): unknown => {
      try {
        // Temporarily override the cache for position/normal/index nodes
        // that feed into the upstream subgraph
        const overrides: Map<string, unknown> = new Map();
        this.overridePerVertexInputs(
          upstreamNodeId,
          graph,
          index,
          position,
          normal,
          overrides,
        );

        // Re-evaluate the upstream node (clear its cache first)
        const cacheKey = `node:${upstreamNodeId}`;
        const prevCache = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);

        // Also clear any transitive upstream nodes that were overridden
        for (const key of overrides.keys()) {
          this.cache.delete(key);
        }

        const result = this.evaluateNode(upstreamNode, graph);
        const outputValue = this.extractSocketValue(result, upstreamSocket);

        // Restore the original cache
        if (prevCache !== undefined) {
          this.cache.set(cacheKey, prevCache);
        }
        for (const [key, prevValue] of overrides.entries()) {
          if (prevValue === undefined) {
            this.cache.delete(key);
          } else {
            this.cache.set(key, prevValue);
          }
        }

        return outputValue;
      } catch {
        return 0;
      }
    };
  }

  /**
   * Override per-vertex input nodes in the upstream subgraph with
   * per-element values.
   *
   * Uses `resolveNodeType()` to identify input nodes instead of
   * checking multiple alias strings, keeping the logic clean and
   * future-proof.
   */
  private overridePerVertexInputs(
    rootNodeId: string,
    graph: NodeGraph,
    elementIndex: number,
    position: VertexContext,
    normal: VertexContext,
    overrides: Map<string, unknown>,
  ): void {
    const visited = new Set<string>();
    const stack = [rootNodeId];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      const canonical = resolveNodeType(node.type);
      const cacheKey = `node:${nodeId}`;

      // Override Position node output
      if (canonical === 'GeometryNodeInputPosition') {
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Position: position });
      }

      // Override Normal node output
      if (canonical === 'GeometryNodeInputNormal') {
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Normal: normal });
      }

      // Override Index node output
      if (canonical === 'GeometryNodeInputIndex') {
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Index: elementIndex });
      }

      // Override ID node output
      if (canonical === 'GeometryNodeInputID') {
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { ID: elementIndex });
      }

      // Walk upstream
      for (const link of graph.links) {
        if (link.toNode === nodeId) {
          stack.push(link.fromNode);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Output node discovery
  // -----------------------------------------------------------------------

  /**
   * Find the output node for the given evaluation mode.
   *
   * Uses `resolveNodeType()` to match any alias of the canonical
   * output type, so `material_output`, `ShaderNodeOutputMaterial`,
   * etc. are all handled.
   */
  private findOutputNode(graph: NodeGraph, mode: EvaluationMode): string | null {
    /** Map from evaluation mode to the canonical output node types. */
    const outputTypes: Record<string, string[]> = {
      [EvaluationMode.MATERIAL]: ['ShaderNodeOutputMaterial'],
      [EvaluationMode.GEOMETRY]: ['GeometryNodeOutput'],
      [EvaluationMode.TEXTURE]: ['ShaderNodeOutputMaterial'],
    };

    const canonicalTypes = outputTypes[mode] ?? [];

    for (const [id, node] of graph.nodes) {
      const resolved = resolveNodeType(node.type);
      if (canonicalTypes.includes(resolved)) {
        return id;
      }
    }

    // No output node found
    return null;
  }
}
