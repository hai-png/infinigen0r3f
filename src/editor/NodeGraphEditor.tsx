'use client';

/**
 * NodeGraphEditor — Visual node graph editor using @xyflow/react (React Flow v12)
 *
 * Provides a full Blender-style node editor with:
 *  - Custom node types colour-coded by category
 *  - Socket dots coloured by data type
 *  - Left node palette, right properties panel, bottom log
 *  - Evaluate / Clear / Load-preset toolbar
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeTypes as RFNodeTypes,
  type NodeProps,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  type OnSelectionChangeFunc,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  useNodeGraph,
  CATEGORY_COLORS,
  SOCKET_COLORS,
  type InfinigenNodeData,
  type LogEntry,
} from '../ui/hooks/useNodeGraph';
import { EvaluationMode } from '../core/nodes/execution/NodeEvaluator';
import { useNodeEvalContext } from './NodeEvalContext';

// ─── Custom Node Component ─────────────────────────────────────────────────

function InfinigenNode({ data, selected }: NodeProps) {
  const d = data as unknown as InfinigenNodeData;
  const borderColor = d.color ?? '#6b7280';

  return (
    <div
      style={{
        background: '#1e1e2e',
        borderRadius: 8,
        border: `2px solid ${selected ? '#fff' : borderColor}`,
        minWidth: 160,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        boxShadow: selected
          ? `0 0 12px ${borderColor}80`
          : '0 2px 8px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: borderColor,
          padding: '4px 10px',
          color: '#fff',
          fontWeight: 600,
          fontSize: 11,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{d.label}</span>
        <span style={{ opacity: 0.6, fontSize: 9 }}>{d.category}</span>
      </div>

      {/* Body: inputs on left, outputs on right */}
      <div style={{ padding: '6px 0' }}>
        {/* Inputs */}
        {d.inputs?.map((input, i) => {
          const dotColor = SOCKET_COLORS[input.type] ?? '#999';
          return (
            <div
              key={`in-${i}`}
              style={{
                position: 'relative',
                padding: '2px 10px 2px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={{
                  background: dotColor,
                  width: 10,
                  height: 10,
                  border: '2px solid #1e1e2e',
                  left: -5,
                }}
              />
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: '#ccc' }}>{input.name}</span>
            </div>
          );
        })}

        {/* Separator if both inputs and outputs */}
        {d.inputs?.length > 0 && d.outputs?.length > 0 && (
          <div style={{ height: 2, background: '#333', margin: '2px 10px' }} />
        )}

        {/* Outputs */}
        {d.outputs?.map((output, i) => {
          const dotColor = SOCKET_COLORS[output.type] ?? '#999';
          return (
            <div
              key={`out-${i}`}
              style={{
                position: 'relative',
                padding: '2px 14px 2px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
              }}
            >
              <span style={{ color: '#ccc' }}>{output.name}</span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                style={{
                  background: dotColor,
                  width: 10,
                  height: 10,
                  border: '2px solid #1e1e2e',
                  right: -5,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const nodeTypes: RFNodeTypes = {
  shader: InfinigenNode,
  geometry: InfinigenNode,
  texture: InfinigenNode,
  input: InfinigenNode,
  output: InfinigenNode,
  utility: InfinigenNode,
};

// ─── Node Palette ──────────────────────────────────────────────────────────

function NodePalette({
  categorizedDefinitions,
  onAddNode,
}: {
  categorizedDefinitions: Map<string, [string, any][]>;
  onAddNode: (type: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const result: [string, [string, any][]][] = [];
    for (const [cat, items] of categorizedDefinitions) {
      const matches = items.filter(
        ([, def]) =>
          def.label.toLowerCase().includes(q) ||
          def.type.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q),
      );
      if (matches.length > 0) result.push([cat, matches]);
    }
    return result;
  }, [categorizedDefinitions, search]);

  const toggleCategory = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="flex flex-col h-full bg-gray-950 border-r border-gray-800">
      <div className="p-3 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Node Palette
        </h2>
        <input
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filtered.map(([cat, items]) => (
          <div key={cat}>
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-800 rounded"
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: CATEGORY_COLORS[cat] ?? '#6b7280' }}
                />
                {cat}
                <span className="text-gray-500">({items.length})</span>
              </span>
              <span className="text-gray-500 text-[10px]">
                {collapsed[cat] ? '▸' : '▾'}
              </span>
            </button>
            {!collapsed[cat] && (
              <div className="ml-2 space-y-0.5">
                {items.map(([key, def]) => (
                  <button
                    key={key}
                    onClick={() => onAddNode(key)}
                    className="w-full text-left px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors truncate"
                    title={def.label}
                  >
                    {def.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Color Helpers ─────────────────────────────────────────────────────────

function rgbToHex(c: any): string {
  if (!c) return '#808080';
  if (typeof c === 'string') return c;
  const r = Math.round(((c.r ?? 0.5) * 255)).toString(16).padStart(2, '0');
  const g = Math.round(((c.g ?? 0.5) * 255)).toString(16).padStart(2, '0');
  const b = Math.round(((c.b ?? 0.5) * 255)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
    a: 1,
  };
}

// ─── Properties Panel ──────────────────────────────────────────────────────

function PropertiesPanel({
  nodeData,
  nodeId,
  onUpdateProperty,
  onDeleteNode,
}: {
  nodeData: InfinigenNodeData | null;
  nodeId: string | null;
  onUpdateProperty: (nodeId: string, key: string, value: any) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  if (!nodeData || !nodeId) {
    return (
      <div className="h-full bg-gray-950 border-l border-gray-800 p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Properties
        </h2>
        <p className="text-xs text-gray-500 text-center mt-8">
          Select a node to edit its properties
        </p>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-950 border-l border-gray-800 flex flex-col">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Properties
          </h2>
          <p className="text-sm font-medium text-white mt-0.5">{nodeData.label}</p>
          <p className="text-[10px] text-gray-500">
            {nodeData.definitionType} · {nodeData.category}
          </p>
        </div>
        <button
          onClick={() => onDeleteNode(nodeId)}
          className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
        >
          Delete
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {/* Inputs */}
        {nodeData.inputs.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Inputs</h3>
            {nodeData.inputs.map((input, i) => {
              const dotColor = SOCKET_COLORS[input.type] ?? '#999';
              return (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: dotColor }}
                  />
                  <span className="text-gray-300 flex-1 truncate">{input.name}</span>
                  <span className="text-gray-600 text-[10px]">{input.type}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Outputs */}
        {nodeData.outputs.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Outputs</h3>
            {nodeData.outputs.map((output, i) => {
              const dotColor = SOCKET_COLORS[output.type] ?? '#999';
              return (
                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: dotColor }}
                  />
                  <span className="text-gray-300 flex-1 truncate">{output.name}</span>
                  <span className="text-gray-600 text-[10px]">{output.type}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Properties */}
        {Object.keys(nodeData.properties).length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
              Parameters
            </h3>
            {Object.entries(nodeData.properties).map(([key, prop]: [string, any]) => {
              const value = nodeData.propertyValues[key] ?? prop.default;
              return (
                <div key={key} className="mb-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">
                    {key}
                    <span className="text-gray-600 ml-1">({prop.type})</span>
                  </label>
                  {prop.type === 'enum' && prop.items ? (
                    <select
                      value={value}
                      onChange={(e) => onUpdateProperty(nodeId, key, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      {prop.items.map((item: string) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  ) : prop.type === 'boolean' ? (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => onUpdateProperty(nodeId, key, e.target.checked)}
                        className="rounded border-gray-600"
                      />
                      <span className="text-xs text-gray-300">
                        {value ? 'True' : 'False'}
                      </span>
                    </label>
                  ) : prop.type === 'float' || prop.type === 'int' ? (
                    <input
                      type="number"
                      value={value}
                      min={prop.min}
                      max={prop.max}
                      step={prop.type === 'float' ? 0.01 : 1}
                      onChange={(e) => {
                        const v =
                          prop.type === 'int'
                            ? parseInt(e.target.value, 10)
                            : parseFloat(e.target.value);
                        if (!isNaN(v)) onUpdateProperty(nodeId, key, v);
                      }}
                      className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-emerald-500"
                    />
                  ) : prop.type === 'color' ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={rgbToHex(value)}
                        onChange={(e) =>
                          onUpdateProperty(nodeId, key, hexToRgba(e.target.value))
                        }
                        className="w-8 h-6 rounded cursor-pointer"
                      />
                      <span className="text-xs text-gray-400">
                        {JSON.stringify(value)}
                      </span>
                    </div>
                  ) : prop.type === 'vector' ? (
                    <div className="flex gap-1">
                      {['x', 'y', 'z'].map((axis) => (
                        <input
                          key={axis}
                          type="number"
                          step={0.1}
                          value={
                            Array.isArray(value)
                              ? value[['x', 'y', 'z'].indexOf(axis)]
                              : (value as any)?.[axis] ?? 0
                          }
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (isNaN(v)) return;
                            const newVal = Array.isArray(value)
                              ? [...value]
                              : [value?.x ?? 0, value?.y ?? 0, value?.z ?? 0];
                            newVal[['x', 'y', 'z'].indexOf(axis)] = v;
                            onUpdateProperty(nodeId, key, newVal);
                          }}
                          className="flex-1 px-1 py-0.5 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 text-center focus:outline-none focus:border-emerald-500"
                          placeholder={axis}
                        />
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={String(value ?? '')}
                      onChange={(e) => onUpdateProperty(nodeId, key, e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Log Panel ─────────────────────────────────────────────────────────────

function LogPanel({ log }: { log: LogEntry[] }) {
  const logEndRef = useRef<HTMLDivElement>(null);

  const levelColors: Record<string, string> = {
    info: 'text-gray-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-emerald-400',
  };

  return (
    <div className="h-full bg-gray-950 border-t border-gray-800 flex flex-col">
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Evaluation Log
        </h2>
        <span className="text-[10px] text-gray-500">{log.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar font-mono text-[11px]">
        {log.length === 0 && (
          <p className="text-gray-600 text-center mt-4">
            No log entries. Click &quot;Evaluate&quot; to run the graph.
          </p>
        )}
        {log.map((entry, i) => (
          <div key={i} className={`flex gap-2 ${levelColors[entry.level] ?? 'text-gray-400'}`}>
            <span className="text-gray-600 w-14 flex-shrink-0">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            <span className="w-2 flex-shrink-0">
              {entry.level === 'error'
                ? '✕'
                : entry.level === 'warn'
                  ? '⚠'
                  : entry.level === 'success'
                    ? '✓'
                    : '·'}
            </span>
            <span className="truncate">{entry.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

// ─── MiniMap Node Color ────────────────────────────────────────────────────

function miniMapNodeColor(node: any): string {
  const data = node.data as InfinigenNodeData;
  return CATEGORY_COLORS[data?.category] ?? '#6b7280';
}

// ─── Editor Inner (needs ReactFlowProvider) ────────────────────────────────

function NodeGraphEditorInner() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedNodeData,
    evaluationResult,
    isEvaluating,
    log,
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
    categorizedDefinitions,
  } = useNodeGraph();

  const { screenToFlowPosition } = useReactFlow();
  const nodeEvalCtx = useNodeEvalContext();

  const [evalMode, setEvalMode] = useState<EvaluationMode>(EvaluationMode.MATERIAL);

  // Sync evaluation result to NodeEvalContext whenever it changes
  useEffect(() => {
    if (evaluationResult) {
      nodeEvalCtx.evaluateGraph(evaluationResult, nodes.length);
    }
  }, [evaluationResult, nodes.length, nodeEvalCtx]);

  // Drag-and-drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
  );

  // Selection change
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selNodes }) => {
      if (selNodes.length === 1) {
        selectNode(selNodes[0].id);
      } else {
        selectNode(null);
      }
    },
    [selectNode],
  );

  // Keyboard shortcut: Delete
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Only delete if not focused on an input
        const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (selectedNodeId) {
          deleteNode(selectedNodeId);
        }
      }
    },
    [selectedNodeId, deleteNode],
  );

  // Evaluation result display
  const evalResultDisplay = useMemo(() => {
    if (!evaluationResult) return null;
    const { mode, value, warnings, errors } = evaluationResult;
    const hasErrors = errors.length > 0;
    const hasWarnings = warnings.length > 0;

    return (
      <div
        className={`p-3 rounded-lg border text-xs ${
          hasErrors
            ? 'bg-red-950/50 border-red-800 text-red-200'
            : hasWarnings
              ? 'bg-yellow-950/50 border-yellow-800 text-yellow-200'
              : 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
        }`}
      >
        <div className="font-semibold mb-1">
          Evaluation Result ({mode})
          {hasErrors ? ' — Failed' : hasWarnings ? ' — Warnings' : ' — Success'}
        </div>
        {value !== null && value !== undefined && (
          <pre className="text-[10px] max-h-32 overflow-auto bg-black/30 rounded p-2 custom-scrollbar">
            {typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value)}
          </pre>
        )}
      </div>
    );
  }, [evaluationResult]);

  return (
    <div
      className="w-full h-full flex flex-col bg-gray-950 text-gray-100"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* ── Top Toolbar ── */}
      <header className="h-12 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-emerald-400">Node Graph Editor</h1>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
            {nodes.length} nodes · {edges.length} edges
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Evaluation mode selector */}
          <select
            value={evalMode}
            onChange={(e) => setEvalMode(e.target.value as EvaluationMode)}
            className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-emerald-500"
          >
            <option value={EvaluationMode.MATERIAL}>Material</option>
            <option value={EvaluationMode.GEOMETRY}>Geometry</option>
            <option value={EvaluationMode.TEXTURE}>Texture</option>
          </select>
          <button
            onClick={() => evaluate(evalMode)}
            disabled={isEvaluating}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors flex items-center gap-1.5"
          >
            {isEvaluating ? (
              <>
                <span className="animate-spin">⟳</span> Evaluating...
              </>
            ) : (
              <>▶ Evaluate</>
            )}
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <button
            onClick={clearGraph}
            className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            Clear
          </button>
          {/* Preset buttons */}
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] text-gray-500">Presets:</span>
            <button
              onClick={() => loadPreset(loadPresetGraph('basic_material'))}
              className="px-2 py-1 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            >
              Basic Material
            </button>
            <button
              onClick={() => loadPreset(loadPresetGraph('terrain_material'))}
              className="px-2 py-1 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            >
              Terrain
            </button>
            <button
              onClick={() => loadPreset(loadPresetGraph('scatter_system'))}
              className="px-2 py-1 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
            >
              Scatter
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Node Palette */}
        <div className="w-56 flex-shrink-0">
          <NodePalette
            categorizedDefinitions={categorizedDefinitions}
            onAddNode={(type) => addNode(type)}
          />
        </div>

        {/* Center: React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-gray-950"
            proOptions={{ hideAttribution: true }}
            connectionLineStyle={{ stroke: '#666', strokeWidth: 2 }}
            snapToGrid
            snapGrid={[16, 16]}
          >
            <Controls
              className="!bg-gray-800 !border-gray-700 !rounded-lg"
              position="bottom-left"
            />
            <MiniMap
              nodeColor={miniMapNodeColor}
              maskColor="rgba(0,0,0,0.6)"
              className="!bg-gray-900 !border-gray-700 !rounded-lg"
              position="bottom-right"
            />
            <Background variant={BackgroundVariant.Dots} gap={16} color="#333" />
          </ReactFlow>

          {/* Evaluation result overlay */}
          {evalResultDisplay && (
            <div className="absolute top-3 right-3 w-80 z-10">{evalResultDisplay}</div>
          )}
        </div>

        {/* Right: Properties Panel */}
        <div className="w-64 flex-shrink-0">
          <PropertiesPanel
            nodeData={selectedNodeData}
            nodeId={selectedNodeId}
            onUpdateProperty={updateNodeProperty}
            onDeleteNode={deleteNode}
          />
        </div>
      </div>

      {/* Bottom: Log Panel */}
      <div className="h-36 flex-shrink-0">
        <LogPanel log={log} />
      </div>
    </div>
  );
}

// ─── Preset Graphs ─────────────────────────────────────────────────────────

import basicMaterialPreset from './presets/basic_material.json';
import terrainMaterialPreset from './presets/terrain_material.json';
import scatterSystemPreset from './presets/scatter_system.json';

type PresetName = 'basic_material' | 'terrain_material' | 'scatter_system';

function loadPresetGraph(name: PresetName): { nodes: any[]; edges: any[] } {
  const presetMap: Record<PresetName, any> = {
    basic_material: basicMaterialPreset,
    terrain_material: terrainMaterialPreset,
    scatter_system: scatterSystemPreset,
  };
  const preset = presetMap[name];
  if (!preset) return { nodes: [], edges: [] };
  return { nodes: preset.nodes ?? [], edges: preset.edges ?? [] };
}

// ─── Editor Outer (with Provider) ──────────────────────────────────────────

export function NodeGraphEditor() {
  return (
    <ReactFlowProvider>
      <NodeGraphEditorInner />
    </ReactFlowProvider>
  );
}

export default NodeGraphEditor;
