/**
 * NodeEvaluator - Node graph evaluation pipeline
 *
 * @deprecated Use `import { NodeEvaluator } from './node-evaluator'` (the clean
 * module) instead. This file is kept for backward compatibility until all consumers migrate.
 *
 * Takes a node graph (connections + node instances) and evaluates it
 * using topological sort to respect data flow order.
 *
 * Supports evaluation modes:
 * - MATERIAL: produces a Three.js material
 * - GEOMETRY: produces geometry modifications
 * - TEXTURE: produces a DataTexture
 */

import * as THREE from 'three';
import type { NodeInstance, NodeLink, NodeDefinition } from '../core/types';
import { SocketType, areSocketsCompatible, getDefaultValueForType } from '../core/types';
import { getExecutor, registerAllExecutors } from './ExecutorRegistry';
import { NodeGroupEvaluator } from './NodeGroupEvaluator';
import type { NodeGroupDefinitionLike } from './NodeGroupEvaluator';
import { NodeGroupDefinition } from '../groups/NodeGroupComposition';

// ============================================================================
// Types
// ============================================================================

/** Evaluation mode determines what output the evaluator produces */
export enum EvaluationMode {
  MATERIAL = 'MATERIAL',
  GEOMETRY = 'GEOMETRY',
  TEXTURE = 'TEXTURE',
}

/** Result of evaluating a node graph */
export interface NodeEvaluationResult {
  mode: EvaluationMode;
  value: any;
  warnings: string[];
  errors: string[];
}

/** A node graph to be evaluated */
export interface NodeGraph {
  nodes: Map<string, NodeInstance>;
  links: NodeLink[];
}

/** Cached output for a specific node+socket */
interface CacheKey {
  nodeId: string;
  socketName: string;
}

/** Error thrown when a cyclic dependency is detected */
export class CyclicDependencyError extends Error {
  constructor(public readonly cycleNodes: string[]) {
    super(`Cyclic dependency detected: ${cycleNodes.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/** Error thrown when a required connection is missing */
export class MissingConnectionError extends Error {
  constructor(nodeId: string, socketName: string) {
    super(`Missing required connection: node "${nodeId}" input "${socketName}"`);
    this.name = 'MissingConnectionError';
  }
}

/** Error thrown when socket types are incompatible */
export class SocketTypeMismatchError extends Error {
  constructor(
    fromNode: string, fromSocket: string, fromType: string,
    toNode: string, toSocket: string, toType: string
  ) {
    super(
      `Socket type mismatch: ${fromNode}.${fromSocket}(${fromType}) → ${toNode}.${toSocket}(${toType})`
    );
    this.name = 'SocketTypeMismatchError';
  }
}

// ============================================================================
// NodeEvaluator
// ============================================================================

export class NodeEvaluator {
  private cache: Map<string, any> = new Map();
  private warnings: string[] = [];
  private errors: string[] = [];
  private nodeDefinitions: Map<string, NodeDefinition> = new Map();

  /** Node group definition registry — maps group IDs to definitions */
  private groupDefinitions: Map<string, NodeGroupDefinition | NodeGroupDefinitionLike> = new Map();

  /** NodeGroupEvaluator for delegated group evaluation */
  private groupEvaluator: NodeGroupEvaluator = new NodeGroupEvaluator();

  /**
   * Ensure the ExecutorRegistry is populated on first instantiation.
   * `registerAllExecutors()` is idempotent — subsequent calls are no-ops.
   */
  private static registryInitialized = false;
  private static ensureRegistry(): void {
    if (!NodeEvaluator.registryInitialized) {
      registerAllExecutors();
      NodeEvaluator.registryInitialized = true;
    }
  }

  /** Register a node definition for lookup during evaluation */
  registerDefinition(definition: NodeDefinition): void {
    this.nodeDefinitions.set(definition.type, definition);
  }

  /** Register multiple definitions at once */
  registerDefinitions(definitions: NodeDefinition[]): void {
    for (const def of definitions) {
      this.registerDefinition(def);
    }
  }

  // -----------------------------------------------------------------------
  // Group definition registration
  // -----------------------------------------------------------------------

  /** Register a node group definition for lookup during evaluation.
   *
   * When the evaluator encounters a node whose type matches a registered
   * group definition ID, it delegates evaluation to the NodeGroupEvaluator.
   *
   * @param definition - The group definition (class instance or plain object)
   */
  registerGroupDefinition(definition: NodeGroupDefinition | NodeGroupDefinitionLike): void {
    const id = definition instanceof NodeGroupDefinition ? definition.id : definition.id;
    this.groupDefinitions.set(id, definition);
    this.groupEvaluator.registerDefinition(definition);
  }

  /** Register multiple group definitions at once. */
  registerGroupDefinitions(definitions: Array<NodeGroupDefinition | NodeGroupDefinitionLike>): void {
    for (const def of definitions) {
      this.registerGroupDefinition(def);
    }
  }

  /** Unregister a group definition.
   *
   * @param id - The group definition ID to remove.
   * @returns `true` if the definition existed and was removed.
   */
  unregisterGroupDefinition(id: string): boolean {
    this.groupEvaluator.unregisterDefinition(id);
    return this.groupDefinitions.delete(id);
  }

  /** Check whether a group definition is registered. */
  hasGroupDefinition(typeId: string): boolean {
    return this.groupDefinitions.has(typeId);
  }

  /** Get the underlying NodeGroupEvaluator for advanced usage. */
  getGroupEvaluator(): NodeGroupEvaluator {
    return this.groupEvaluator;
  }

  /**
   * Evaluate a node graph in the given mode
   */
  evaluate(graph: NodeGraph, mode: EvaluationMode): NodeEvaluationResult {
    // Ensure executor registry is populated on first evaluation
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
      let finalOutput: any = null;

      for (const nodeId of sortedNodes) {
        const node = graph.nodes.get(nodeId);
        if (!node) continue;

        const output = this.evaluateNode(node, graph);
        finalOutput = output;
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
    } catch (error: any) {
      this.errors.push(error.message);
      return {
        mode,
        value: null,
        warnings: [...this.warnings],
        errors: [...this.errors],
      };
    }
  }

  /**
   * Perform topological sort on the node graph using Kahn's algorithm.
   * Respects data flow order based on connections.
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
      if (!adj.get(link.fromNode)?.add(link.toNode)) {
        // Edge already exists or node doesn't exist
      }
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
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
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
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

  /**
   * Validate the graph for type mismatches and missing connections
   */
  private validateGraph(graph: NodeGraph): void {
    for (const link of graph.links) {
      this.validateLink(link, graph);
    }

    // Check for missing required connections
    for (const [nodeId, node] of graph.nodes) {
      const def = this.nodeDefinitions.get(node.type);
      if (def) {
        for (const input of def.inputs) {
          if (input.required) {
            const hasConnection = graph.links.some(
              l => l.toNode === nodeId && l.toSocket === input.name
            );
            const hasValue = node.inputs instanceof Map
              ? node.inputs.has(input.name) && node.inputs.get(input.name) !== undefined
              : input.name in (node.inputs as any) && (node.inputs as any)[input.name] !== undefined;

            if (!hasConnection && !hasValue) {
              this.warnings.push(
                `Missing required input "${input.name}" on node "${nodeId}" (${node.type})`
              );
            }
          }
        }
      }
    }
  }

  /**
   * Validate a single link for type compatibility
   */
  private validateLink(link: NodeLink, graph: NodeGraph): void {
    const fromNode = graph.nodes.get(link.fromNode);
    const toNode = graph.nodes.get(link.toNode);

    if (!fromNode || !toNode) {
      this.errors.push(`Link references non-existent node: ${!fromNode ? link.fromNode : link.toNode}`);
      return;
    }

    // Try to get socket types from definitions
    const fromDef = this.nodeDefinitions.get(fromNode.type);
    const toDef = this.nodeDefinitions.get(toNode.type);

    if (fromDef && toDef) {
      const fromSocket = fromDef.outputs.find(o => o.name === link.fromSocket);
      const toSocket = toDef.inputs.find(i => i.name === link.toSocket);

      if (fromSocket && toSocket) {
        const fromType = fromSocket.type as SocketType;
        const toType = toSocket.type as SocketType;

        if (!areSocketsCompatible(fromType, toType)) {
          this.warnings.push(
            `Type mismatch: ${link.fromNode}.${link.fromSocket}(${fromType}) → ${link.toNode}.${link.toSocket}(${toType})`
          );
        }
      }
    }
  }

  /**
   * Evaluate a single node, pulling inputs from connected upstream nodes
   */
  private evaluateNode(node: NodeInstance, graph: NodeGraph): any {
    const cacheKey = `node:${node.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Resolve inputs: either from connections or from node settings
    const resolvedInputs: Record<string, any> = {};

    // Get default values from definition
    const def = this.nodeDefinitions.get(node.type);
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
      Object.entries(node.inputs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          resolvedInputs[key] = value;
        }
      });
    }

    // Resolve connections (overriding local values)
    for (const link of graph.links) {
      if (link.toNode === node.id) {
        const upstreamNode = graph.nodes.get(link.fromNode);
        if (upstreamNode) {
          const upstreamOutput = this.getNodeOutput(upstreamNode);
          const outputValue = upstreamOutput instanceof Map
            ? upstreamOutput.get(link.fromSocket)
            : typeof upstreamOutput === 'object' && upstreamOutput !== null
              ? (upstreamOutput as any)[link.fromSocket]
              : upstreamOutput;

          if (outputValue !== undefined) {
            resolvedInputs[link.toSocket] = outputValue;
          } else {
            // Use default for the socket type
            const toDef = this.nodeDefinitions.get(node.type);
            const toSocket = toDef?.inputs.find(i => i.name === link.toSocket);
            if (toSocket) {
              resolvedInputs[link.toSocket] = toSocket.default ?? getDefaultValueForType(toSocket.type as SocketType);
              this.warnings.push(
                `Missing output "${link.fromSocket}" from node "${link.fromNode}", using default`
              );
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Special handling for CaptureAttribute: evaluate Value field per-vertex
    //
    // In Blender's geometry nodes, CaptureAttribute evaluates the Value
    // input field at EACH element of the geometry. The upstream node
    // (e.g., Position, Normal, Index) produces per-element data that
    // must be collected for every vertex/face.
    //
    // If the Value input's upstream node already returned a per-element
    // array (which our Position/Normal executors do), the array is
    // passed through directly. If it returned a single scalar, we wrap
    // it in a field evaluator that the CaptureAttribute executor can
    // call for each element.
    // -----------------------------------------------------------------------
    const nodeType = node.type;
    const isCaptureAttr = nodeType === 'CaptureAttribute'
      || nodeType === 'CaptureAttributeNode'
      || nodeType === 'capture_attribute'
      || nodeType === 'GeometryNodeCaptureAttribute';

    if (isCaptureAttr) {
      this.enhanceCaptureAttributeInputs(node, graph, resolvedInputs);
    }

    // Execute the node
    const result = this.executeNodeByType(node, resolvedInputs);

    // Cache the result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Enhance the resolved inputs for a CaptureAttribute node so the Value
   * field is evaluated per-element rather than as a single global value.
   *
   * If the Value input's upstream node returned a per-element array, it
   * is passed through. If it returned a single value, we create a field
   * evaluator function that the CaptureAttribute executor can call per-element.
   */
  private enhanceCaptureAttributeInputs(
    node: NodeInstance,
    graph: NodeGraph,
    resolvedInputs: Record<string, any>,
  ): void {
    // If Value is already an array or function, it's per-vertex capable — skip
    const value = resolvedInputs.Value ?? resolvedInputs.value;
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) || typeof value === 'function') {
        return; // Already per-element or field evaluator
      }
      // Check if it's an AttributeStream
      if (typeof value === 'object' && 'getFloat' in value && 'size' in value) {
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

    if (valueUpstreamNodeId && valueUpstreamSocket) {
      // Get the geometry from the resolved inputs
      const geometry = resolvedInputs.Geometry ?? resolvedInputs.geometry ?? null;
      if (geometry && typeof geometry === 'object' && 'getAttribute' in geometry) {
        // Create a field evaluator function that will evaluate the upstream
        // node per-vertex. The CaptureAttribute executor will call this
        // function for each element.
        const evaluator = this.createFieldEvaluator(
          valueUpstreamNodeId,
          valueUpstreamSocket,
          graph,
          geometry as THREE.BufferGeometry,
        );
        if (evaluator) {
          resolvedInputs.Value = evaluator;
        }
      }
    }
  }

  /**
   * Create a field evaluator function for the Value input of CaptureAttribute.
   *
   * The evaluator takes (index, position, normal) and returns the value
   * of the upstream node when evaluated with that per-vertex context.
   *
   * For known input nodes (Position, Normal, Index), we directly return
   * per-vertex data from the geometry. For other nodes, we re-evaluate
   * the upstream subgraph with per-vertex overrides.
   */
  private createFieldEvaluator(
    upstreamNodeId: string,
    upstreamSocket: string,
    graph: NodeGraph,
    geometry: THREE.BufferGeometry,
  ): ((index: number, position: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }) => any) | null {
    const upstreamNode = graph.nodes.get(upstreamNodeId);
    if (!upstreamNode) return null;

    const upstreamType = upstreamNode.type;
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    // For Position input nodes, directly return per-vertex position
    if (
      upstreamType === 'GeometryNodeInputPosition' || upstreamType === 'input_position'
      || upstreamType === 'InputPositionNode' || upstreamType === 'Position'
    ) {
      return (index: number) => {
        if (posAttr && index < posAttr.count) {
          return { x: posAttr.getX(index), y: posAttr.getY(index), z: posAttr.getZ(index) };
        }
        return { x: 0, y: 0, z: 0 };
      };
    }

    // For Normal input nodes, directly return per-vertex normal
    if (
      upstreamType === 'GeometryNodeInputNormal' || upstreamType === 'input_normal'
      || upstreamType === 'InputNormalNode' || upstreamType === 'Normal'
    ) {
      return (_index: number, _position: any, normal: { x: number; y: number; z: number }) => {
        return normal;
      };
    }

    // For Index input nodes, return the index itself
    if (
      upstreamType === 'GeometryNodeInputIndex' || upstreamType === 'input_index'
      || upstreamType === 'IndexNode' || upstreamType === 'Index'
    ) {
      return (index: number) => index;
    }

    // For ID input nodes, return the index (ID = index for now)
    if (
      upstreamType === 'GeometryNodeInputID' || upstreamType === 'input_id'
      || upstreamType === 'IDNode' || upstreamType === 'InputID'
    ) {
      return (index: number) => index;
    }

    // For other nodes, try to re-evaluate per-vertex by overriding
    // the Position/Normal/Index inputs in the upstream subgraph
    return (index: number, position: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }) => {
      try {
        // Temporarily override the cache for position/normal/index nodes
        // that feed into the upstream subgraph
        const overrides: Map<string, any> = new Map();
        this.overridePerVertexInputs(upstreamNodeId, graph, index, position, normal, overrides);

        // Re-evaluate the upstream node (clear its cache first)
        const cacheKey = `node:${upstreamNodeId}`;
        const prevCache = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);

        // Also clear any transitive upstream nodes that were overridden
        for (const key of overrides.keys()) {
          this.cache.delete(key);
        }

        const result = this.evaluateNode(upstreamNode, graph);
        const outputValue = result instanceof Map
          ? result.get(upstreamSocket)
          : typeof result === 'object' && result !== null
            ? (result as any)[upstreamSocket]
            : result;

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
   * per-element values. This allows re-evaluation of the subgraph
   * with different vertex contexts.
   */
  private overridePerVertexInputs(
    rootNodeId: string,
    graph: NodeGraph,
    elementIndex: number,
    position: { x: number; y: number; z: number },
    normal: { x: number; y: number; z: number },
    overrides: Map<string, any>,
  ): void {
    // Find all input nodes that feed into the upstream subgraph
    // and override their outputs with per-vertex values
    const visited = new Set<string>();
    const stack = [rootNodeId];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      const nodeType = node.type;

      // Override Position node output
      if (
        nodeType === 'GeometryNodeInputPosition' || nodeType === 'input_position'
        || nodeType === 'InputPositionNode' || nodeType === 'Position'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Position: position });
      }

      // Override Normal node output
      if (
        nodeType === 'GeometryNodeInputNormal' || nodeType === 'input_normal'
        || nodeType === 'InputNormalNode' || nodeType === 'Normal'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Normal: normal });
      }

      // Override Index node output
      if (
        nodeType === 'GeometryNodeInputIndex' || nodeType === 'input_index'
        || nodeType === 'IndexNode' || nodeType === 'Index'
      ) {
        const cacheKey = `node:${nodeId}`;
        overrides.set(cacheKey, this.cache.get(cacheKey));
        this.cache.set(cacheKey, { Index: elementIndex });
      }

      // Override ID node output
      if (
        nodeType === 'GeometryNodeInputID' || nodeType === 'input_id'
        || nodeType === 'IDNode' || nodeType === 'InputID'
      ) {
        const cacheKey = `node:${nodeId}`;
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

  /**
   * Get the output of a node (from cache or by evaluation)
   */
  private getNodeOutput(node: NodeInstance): any {
    const cacheKey = `node:${node.id}`;
    return this.cache.get(cacheKey) ?? node.outputs;
  }

  /**
   * Execute a node based on its type.
   *
   * **Registry-only lookup**: All executors are registered in ExecutorRegistry.
   * If no executor is found for a node type, inputs are passed through as
   * outputs with a warning.
   */
  private executeNodeByType(node: NodeInstance, inputs: Record<string, any>): any {
    const nodeType = node.type;

    // Registry lookup — all executors are registered in ExecutorRegistry
    const executor = getExecutor(nodeType);
    if (executor) {
      return executor(inputs, { settings: node.settings ?? {}, node });
    }

    // ── Group definition lookup ──
    // Before falling back to pass-through, check if the node type
    // references a registered group definition.
    if (this.groupDefinitions.has(nodeType)) {
      const result = this.groupEvaluator.evaluateGroup(nodeType, inputs);

      // Propagate warnings and errors from the group evaluation
      for (const w of result.warnings) {
        this.warnings.push(`[Group:${nodeType}] ${w}`);
      }
      for (const e of result.errors) {
        this.errors.push(`[Group:${nodeType}] ${e}`);
      }

      return result.outputs;
    }

    // No executor found — pass through inputs as outputs
    console.warn(`[NodeEvaluator] No executor registered for node type: ${nodeType}`);
    const outputValues: Record<string, any> = {};
    if (node.outputs instanceof Map) {
      for (const [outName] of node.outputs) {
        outputValues[outName] = inputs[outName] ?? null;
      }
    }
    return outputValues;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private findOutputNode(graph: NodeGraph, mode: EvaluationMode): string | null {
    const outputTypes: Record<string, string[]> = {
      [EvaluationMode.MATERIAL]: ['ShaderNodeOutputMaterial', 'material_output'],
      [EvaluationMode.GEOMETRY]: ['GeometryNodeOutput', 'geometry_output'],
      [EvaluationMode.TEXTURE]: ['ShaderNodeOutputMaterial', 'material_output'],
    };

    const types = outputTypes[mode] || [];

    for (const [id, node] of graph.nodes) {
      if (types.includes(node.type)) {
        return id;
      }
    }

    // If no output node found, return the last node in topological order
    return null;
  }
}
