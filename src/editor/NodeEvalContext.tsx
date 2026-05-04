'use client';

/**
 * NodeEvalContext — Shared state between NodeGraphEditor and NodeEvalPreview
 *
 * Provides:
 *  - current evaluation result (raw from NodeEvaluator)
 *  - evaluation mode
 *  - selected preset name
 *  - evaluateGraph() — triggers evaluation on the current graph
 *  - applyToScene() — signals that the result should be applied to the main scene
 *  - clearResult() — resets the evaluation state
 *
 * Consumed by:
 *  - NodeGraphEditor (writes evaluation results)
 *  - NodeEvalPreview (reads results, triggers apply)
 *  - Editor page (orchestrates layout)
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import {
  EvaluationMode,
  type NodeEvaluationResult,
} from '../core/nodes/execution/NodeEvaluator';
import { NodeGraphMaterialBridge } from '../core/nodes/execution/NodeGraphMaterialBridge';
import { NodeGraphTextureBridge } from '../core/nodes/execution/NodeGraphTextureBridge';

// ============================================================================
// Types
// ============================================================================

/** The processed evaluation result ready for 3D preview */
export interface ProcessedEvalResult {
  /** Raw evaluation result from NodeEvaluator */
  raw: NodeEvaluationResult;

  /** Resolved Three.js material (MATERIAL mode) */
  material: THREE.MeshPhysicalMaterial | null;

  /** Resolved Three.js texture (TEXTURE mode) */
  texture: THREE.Texture | null;

  /** Resolved Three.js geometry (GEOMETRY mode) */
  geometry: THREE.BufferGeometry | null;

  /** Time taken for evaluation in ms */
  evalTimeMs: number;

  /** Number of warnings */
  warningCount: number;

  /** Number of errors */
  errorCount: number;

  /** Number of nodes in the evaluated graph */
  nodeCount: number;
}

/** Callback type for when a result should be applied to the scene */
export type ApplyToSceneCallback = (
  result: ProcessedEvalResult,
  targetObjects?: string[]
) => void;

/** Shape of the context value */
export interface NodeEvalContextValue {
  // ── State ──
  /** Current evaluation mode */
  evalMode: EvaluationMode;
  setEvalMode: (mode: EvaluationMode) => void;

  /** Currently selected preset name */
  selectedPreset: string | null;
  setSelectedPreset: (preset: string | null) => void;

  /** Processed evaluation result (null if not evaluated yet) */
  processedResult: ProcessedEvalResult | null;

  /** Whether an evaluation is in progress */
  isEvaluating: boolean;

  // ── Actions ──
  /** Evaluate the current node graph and store the result */
  evaluateGraph: (rawResult: NodeEvaluationResult, nodeCount: number) => void;

  /** Apply the current evaluation result to the main scene */
  applyToScene: (targetObjects?: string[]) => void;

  /** Clear the current evaluation result */
  clearResult: () => void;

  // ── Callbacks ──
  /** Register a callback for when applyToScene is called */
  onApplyToScene: ApplyToSceneCallback | null;
  setOnApplyToScene: (cb: ApplyToSceneCallback | null) => void;

  /** Request to open the full scene view with evaluated materials */
  requestSceneView: () => void;
  onSceneViewRequested: (() => void) | null;
  setOnSceneViewRequested: (cb: (() => void) | null) => void;
}

// ============================================================================
// Context
// ============================================================================

const NodeEvalContext = createContext<NodeEvalContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface NodeEvalProviderProps {
  children: ReactNode;
}

export function NodeEvalProvider({ children }: NodeEvalProviderProps) {
  const [evalMode, setEvalMode] = useState<EvaluationMode>(EvaluationMode.MATERIAL);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [processedResult, setProcessedResult] = useState<ProcessedEvalResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [applyCallback, setApplyCallback] = useState<ApplyToSceneCallback | null>(null);
  const [sceneViewCallback, setSceneViewCallback] = useState<(() => void) | null>(null);

  // Bridge instances (reused across evaluations)
  const materialBridge = useMemo(() => new NodeGraphMaterialBridge(), []);
  const textureBridge = useMemo(() => new NodeGraphTextureBridge(), []);

  // ── evaluateGraph ──
  const evaluateGraph = useCallback(
    (rawResult: NodeEvaluationResult, nodeCount: number) => {
      setIsEvaluating(true);

      try {
        const startTime = performance.now();

        let material: THREE.MeshPhysicalMaterial | null = null;
        let texture: THREE.Texture | null = null;
        let geometry: THREE.BufferGeometry | null = null;

        // Process the raw result based on mode
        if (rawResult.errors.length === 0 && rawResult.value !== null) {
          switch (rawResult.mode) {
            case EvaluationMode.MATERIAL: {
              try {
                material = materialBridge.convert(rawResult.value);
              } catch (err) {
                console.warn('[NodeEvalContext] Material conversion failed:', err);
              }
              break;
            }
            case EvaluationMode.TEXTURE: {
              try {
                // The raw value might be a texture spec or a direct texture
                if (rawResult.value instanceof THREE.Texture) {
                  texture = rawResult.value;
                } else if (rawResult.value && typeof rawResult.value === 'object') {
                  // Check if it's a TextureNodeOutput format
                  if ('type' in rawResult.value && 'parameters' in rawResult.value) {
                    texture = textureBridge.convert(rawResult.value);
                  } else if ('type' in rawResult.value) {
                    // Might be a BSDF wrapper with texture info
                    texture = textureBridge.convert({
                      type: rawResult.value.type,
                      parameters: rawResult.value,
                    });
                  }
                }
              } catch (err) {
                console.warn('[NodeEvalContext] Texture conversion failed:', err);
              }
              break;
            }
            case EvaluationMode.GEOMETRY: {
              try {
                if (rawResult.value instanceof THREE.BufferGeometry) {
                  geometry = rawResult.value;
                } else if (rawResult.value && typeof rawResult.value === 'object') {
                  // Extract geometry from context or result object
                  if ('geometry' in rawResult.value && rawResult.value.geometry instanceof THREE.BufferGeometry) {
                    geometry = rawResult.value.geometry;
                  } else if ('context' in rawResult.value && rawResult.value.context?.geometry instanceof THREE.BufferGeometry) {
                    geometry = rawResult.value.context.geometry;
                  }
                }
              } catch (err) {
                console.warn('[NodeEvalContext] Geometry extraction failed:', err);
              }
              break;
            }
          }
        }

        const evalTimeMs = performance.now() - startTime;

        const processed: ProcessedEvalResult = {
          raw: rawResult,
          material,
          texture,
          geometry,
          evalTimeMs,
          warningCount: rawResult.warnings.length,
          errorCount: rawResult.errors.length,
          nodeCount,
        };

        setProcessedResult(processed);
      } finally {
        setIsEvaluating(false);
      }
    },
    [materialBridge, textureBridge],
  );

  // ── applyToScene ──
  const applyToScene = useCallback(
    (targetObjects?: string[]) => {
      if (!processedResult) return;
      if (applyCallback) {
        applyCallback(processedResult, targetObjects);
      }
    },
    [processedResult, applyCallback],
  );

  // ── clearResult ──
  const clearResult = useCallback(() => {
    setProcessedResult(null);
  }, []);

  // ── requestSceneView ──
  const requestSceneView = useCallback(() => {
    if (sceneViewCallback) {
      sceneViewCallback();
    }
  }, [sceneViewCallback]);

  const value = useMemo<NodeEvalContextValue>(
    () => ({
      evalMode,
      setEvalMode,
      selectedPreset,
      setSelectedPreset,
      processedResult,
      isEvaluating,
      evaluateGraph,
      applyToScene,
      clearResult,
      onApplyToScene: applyCallback,
      setOnApplyToScene: setApplyCallback,
      requestSceneView,
      onSceneViewRequested: sceneViewCallback,
      setOnSceneViewRequested: setSceneViewCallback,
    }),
    [
      evalMode,
      selectedPreset,
      processedResult,
      isEvaluating,
      evaluateGraph,
      applyToScene,
      clearResult,
      applyCallback,
      requestSceneView,
      sceneViewCallback,
    ],
  );

  return (
    <NodeEvalContext.Provider value={value}>{children}</NodeEvalContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useNodeEvalContext(): NodeEvalContextValue {
  const ctx = useContext(NodeEvalContext);
  if (!ctx) {
    throw new Error('useNodeEvalContext must be used within a NodeEvalProvider');
  }
  return ctx;
}

export default NodeEvalContext;
