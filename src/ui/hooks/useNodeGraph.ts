'use client';

/**
 * useNodeGraph — React Flow ↔ NodeGraph bridge hook
 *
 * Manages node graph state (nodes, edges), converts between React Flow
 * and the internal NodeGraph format, and drives evaluation through
 * NodeEvaluator.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  type Node as RFNode,
  type Edge as RFEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from '@xyflow/react';

import { type NodeDefinitionEntry, nodeDefinitionRegistry } from '../../core/nodes/core/node-definition-registry';
import { SocketType } from '../../core/nodes/core/socket-types';
import {
  NodeEvaluator,
  EvaluationMode,
  type NodeEvaluationResult,
  type NodeGraph,
} from '../../core/nodes/execution/NodeEvaluator';
import type { NodeInstance, NodeLink } from '../../core/nodes/core/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category → colour mapping used to tint nodes */
export const CATEGORY_COLORS: Record<string, string> = {
  SHADER: '#22c55e',
  GEOMETRY: '#3b82f6',
  TEXTURE: '#f97316',
  TEXTURE_SHADER: '#f97316',
  INPUT: '#6b7280',
  SHADER_INPUT: '#6b7280',
  OUTPUT: '#ef4444',
  SHADER_OUTPUT: '#ef4444',
  UTILITY: '#a855f7',
  CONVERTER: '#a855f7',
  COLOR: '#f59e0b',
  CURVE: '#06b6d4',
  CURVE_PRIMITIVES: '#06b6d4',
  MESH: '#3b82f6',
  MESH_PRIMITIVES: '#60a5fa',
  ATTRIBUTE: '#14b8a6',
  INSTANCES: '#8b5cf6',
  MATERIAL: '#ec4899',
  POINT: '#84cc16',
  SIMULATE: '#f43f5e',
  TEXT: '#78716c',
  TRANSFORM: '#0ea5e9',
  MODIFIERS: '#7c3aed',
  COMPOSIT_INPUT: '#6b7280',
  COMPOSIT_OUTPUT: '#ef4444',
  COMPOSIT_FILTER: '#a855f7',
  COMPOSIT_COLOR: '#f59e0b',
  VECTOR_SHADER: '#06b6d4',
  VOLUME: '#6366f1',
};

/** Colour for each socket type (used for the dot on handles) */
export const SOCKET_COLORS: Record<string, string> = {
  [SocketType.GEOMETRY]: '#00b8b8',
  [SocketType.MESH]: '#00b8b8',
  [SocketType.CURVE]: '#00cccc',
  [SocketType.POINTS]: '#cc9933',
  [SocketType.INSTANCES]: '#9966cc',
  [SocketType.VOLUME]: '#6666cc',
  [SocketType.VECTOR]: '#ff9933',
  [SocketType.FLOAT]: '#999999',
  [SocketType.INTEGER]: '#998866',
  [SocketType.BOOLEAN]: '#cc3333',
  [SocketType.COLOR]: '#ffcc33',
  [SocketType.SHADER]: '#66cc66',
  [SocketType.MATERIAL]: '#cc66cc',
  [SocketType.TEXTURE]: '#ff9933',
  [SocketType.STRING]: '#666666',
  [SocketType.OBJECT]: '#996633',
  [SocketType.COLLECTION]: '#669933',
  [SocketType.IMAGE]: '#cc9966',
  [SocketType.ROTATION]: '#cc6633',
  [SocketType.ANY]: '#cccccc',
  [SocketType.VALUE]: '#999999',
  [SocketType.RGB]: '#ffcc33',
  [SocketType.RGBA]: '#ffcc33',
  [SocketType.UV]: '#ff9933',
  [SocketType.MATRIX]: '#6666cc',
  [SocketType.QUATERNION]: '#cc6633',
  [SocketType.TRANSFORM]: '#0ea5e9',
};

export interface NodeGraphState {
  nodes: RFNode[];
  edges: RFEdge[];
  selectedNodeId: string | null;
  evaluationResult: NodeEvaluationResult | null;
  isEvaluating: boolean;
  log: LogEntry[];
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

// ---------------------------------------------------------------------------
// Custom node data shape
// ---------------------------------------------------------------------------

export interface InfinigenNodeData extends Record<string, unknown> {
  label: string;
  definitionType: string;
  category: string;
  color: string;
  inputs: { name: string; type: string; defaultValue?: unknown }[];
  outputs: { name: string; type: string }[];
  properties: Record<string, any>;
  propertyValues: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix = 'node'): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

/** Build a React Flow node from a definition entry */
export function createRFNode(
  definitionType: string,
  position: { x: number; y: number },
): RFNode<InfinigenNodeData> | null {
  const def = nodeDefinitionRegistry.get(definitionType);
  if (!def) return null;

  const category = def.category;
  const color = CATEGORY_COLORS[category] ?? '#6b7280';

  const inputs = def.inputs.map((s) => ({
    name: s.name,
    type: s.type as string,
    defaultValue: s.defaultValue ?? s.default,
  }));

  const outputs = def.outputs.map((s) => ({
    name: s.name,
    type: s.type as string,
  }));

  const propertyValues: Record<string, any> = {};
  if (def.properties) {
    for (const [k, v] of Object.entries(def.properties)) {
      propertyValues[k] = v.default;
    }
  }

  return {
    id: nextId('node'),
    type: categoryToNodeType(category),
    position,
    data: {
      label: def.label,
      definitionType,
      category,
      color,
      inputs,
      outputs,
      properties: def.properties ?? {},
      propertyValues,
    },
  };
}

/** Map category to our custom React Flow node type name */
function categoryToNodeType(category: string): string {
  const mapping: Record<string, string> = {
    SHADER: 'shader',
    GEOMETRY: 'geometry',
    MESH: 'geometry',
    MESH_PRIMITIVES: 'geometry',
    TEXTURE: 'texture',
    TEXTURE_SHADER: 'texture',
    INPUT: 'input',
    SHADER_INPUT: 'input',
    OUTPUT: 'output',
    SHADER_OUTPUT: 'output',
    UTILITY: 'utility',
    CONVERTER: 'utility',
    COLOR: 'utility',
    CURVE: 'geometry',
    CURVE_PRIMITIVES: 'geometry',
    ATTRIBUTE: 'utility',
    INSTANCES: 'geometry',
    MATERIAL: 'shader',
    POINT: 'geometry',
    SIMULATE: 'utility',
    TEXT: 'utility',
    TRANSFORM: 'geometry',
    MODIFIERS: 'geometry',
    COMPOSIT_INPUT: 'input',
    COMPOSIT_OUTPUT: 'output',
    COMPOSIT_FILTER: 'utility',
    COMPOSIT_COLOR: 'utility',
    VECTOR_SHADER: 'utility',
    VOLUME: 'geometry',
  };
  return mapping[category] ?? 'utility';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNodeGraph() {
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<NodeEvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const evaluatorRef = useRef<NodeEvaluator | null>(null);

  // Lazy-init evaluator
  const getEvaluator = useCallback(() => {
    if (!evaluatorRef.current) {
      evaluatorRef.current = new NodeEvaluator();
    }
    return evaluatorRef.current;
  }, []);

  // ---- Logging ----
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLog((prev) => [
      ...prev.slice(-200),
      { timestamp: Date.now(), level, message },
    ]);
  }, []);

  // ---- Node / Edge change handlers ----
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // ---- Connection handling ----
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (!sourceNode) return;

      // Prevent duplicate connections to the same target handle
      const duplicate = edges.find(
        (e) =>
          e.target === connection.target &&
          e.targetHandle === connection.targetHandle,
      );
      if (duplicate) return;

      const sourceData = sourceNode.data as InfinigenNodeData;
      const outputSocket = sourceData.outputs.find(
        (o) => o.name === connection.sourceHandle,
      );
      const socketColor =
        SOCKET_COLORS[outputSocket?.type ?? SocketType.ANY] ?? '#999';

      const newEdge: RFEdge = {
        id: `e-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
        type: 'smoothstep',
        animated: true,
        style: { stroke: socketColor, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: socketColor,
          width: 14,
          height: 14,
        },
      };
      setEdges((eds) => [...eds, newEdge]);
      addLog('info', `Connected ${connection.sourceHandle} → ${connection.targetHandle}`);
    },
    [nodes, edges, addLog],
  );

  // ---- Add node from palette ----
  const addNode = useCallback(
    (definitionType: string, position?: { x: number; y: number }) => {
      const pos = position ?? {
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 400,
      };
      const node = createRFNode(definitionType, pos);
      if (!node) {
        addLog('error', `Unknown node type: ${definitionType}`);
        return;
      }
      setNodes((nds) => [...nds, node]);
      addLog('info', `Added node: ${definitionType}`);
    },
    [addLog],
  );

  // ---- Delete selected node ----
  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      addLog('info', `Deleted node: ${nodeId}`);
    },
    [selectedNodeId, addLog],
  );

  // ---- Update node property ----
  const updateNodeProperty = useCallback(
    (nodeId: string, key: string, value: any) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const data = n.data as InfinigenNodeData;
          return {
            ...n,
            data: {
              ...data,
              propertyValues: { ...data.propertyValues, [key]: value },
            },
          };
        }),
      );
    },
    [],
  );

  // ---- Select node ----
  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ---- Clear graph ----
  const clearGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setEvaluationResult(null);
    addLog('info', 'Graph cleared');
  }, [addLog]);

  // ---- Evaluation ----
  const evaluate = useCallback(
    (mode: EvaluationMode = EvaluationMode.MATERIAL) => {
      setIsEvaluating(true);
      addLog('info', `Evaluating graph in ${mode} mode...`);

      try {
        const evaluator = getEvaluator();

        // Convert React Flow nodes/edges → NodeGraph
        const graph = convertToNodeGraph(nodes, edges);
        const result = evaluator.evaluate(graph, mode);

        setEvaluationResult(result);

        result.warnings.forEach((w) => addLog('warn', w));
        result.errors.forEach((e) => addLog('error', e));

        if (result.errors.length === 0) {
          addLog('success', `Evaluation complete (${mode})`);
        } else {
          addLog('error', `Evaluation failed with ${result.errors.length} error(s)`);
        }
      } catch (err: any) {
        addLog('error', `Evaluation error: ${err.message}`);
        setEvaluationResult({
          mode,
          value: null,
          warnings: [],
          errors: [err.message],
        });
      } finally {
        setIsEvaluating(false);
      }
    },
    [nodes, edges, addLog, getEvaluator],
  );

  // ---- Load preset graph ----
  const loadPreset = useCallback(
    (preset: { nodes: RFNode[]; edges: RFEdge[] }) => {
      setNodes(preset.nodes);
      setEdges(preset.edges);
      setSelectedNodeId(null);
      setEvaluationResult(null);
      addLog('info', 'Loaded preset graph');
    },
    [addLog],
  );

  // ---- Selected node data ----
  const selectedNodeData = useMemo<InfinigenNodeData | null>(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find((n) => n.id === selectedNodeId);
    return (node?.data as InfinigenNodeData) ?? null;
  }, [selectedNodeId, nodes]);

  // ---- Registry helpers ----
  const allDefinitions = useMemo(() => {
    // Build entries from getAll() since registry doesn't expose entries()
    const allDefs = nodeDefinitionRegistry.getAll();
    const result: [string, NodeDefinitionEntry][] = [];
    for (const def of allDefs) {
      result.push([def.type, def]);
    }
    return result;
  }, []);

  const categorizedDefinitions = useMemo(() => {
    const map = new Map<string, [string, NodeDefinitionEntry][]>();
    for (const [key, def] of allDefinitions) {
      const cat = def.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push([key, def]);
    }
    return map;
  }, [allDefinitions]);

  return {
    // State
    nodes,
    edges,
    selectedNodeId,
    selectedNodeData,
    evaluationResult,
    isEvaluating,
    log,

    // Actions
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    updateNodeProperty,
    selectNode,
    clearGraph,
    evaluate,
    loadPreset,

    // Registry info
    allDefinitions,
    categorizedDefinitions,
  };
}

// ---------------------------------------------------------------------------
// Conversion: React Flow → NodeGraph (for evaluator)
// ---------------------------------------------------------------------------

function convertToNodeGraph(
  rfNodes: RFNode[],
  rfEdges: RFEdge[],
): NodeGraph {
  const nodeMap = new Map<string, NodeInstance>();

  for (const n of rfNodes) {
    const data = n.data as InfinigenNodeData;
    const inputs: Record<string, any> = {};
    for (const inp of data.inputs) {
      // Use the propertyValues as defaults if available
      inputs[inp.name] = inp.defaultValue ?? null;
    }

    const settings: Record<string, any> = { ...data.propertyValues };

    nodeMap.set(n.id, {
      id: n.id,
      type: data.definitionType,
      name: data.label,
      position: { x: n.position.x, y: n.position.y },
      settings,
      inputs: inputs as any,
      outputs: new Map() as any,
    });
  }

  const links: NodeLink[] = rfEdges.map((e) => ({
    id: e.id,
    fromNode: e.source!,
    fromSocket: e.sourceHandle ?? '',
    toNode: e.target!,
    toSocket: e.targetHandle ?? '',
  }));

  return { nodes: nodeMap, links };
}

export default useNodeGraph;
