'use client';

/**
 * NodeEvalPreview — 3D viewport preview for node evaluation results
 *
 * Renders a live preview of the current evaluation:
 *  - MATERIAL → sphere with the evaluated MeshPhysicalMaterial
 *  - TEXTURE  → plane displaying the DataTexture
 *  - GEOMETRY → wireframe mesh of the BufferGeometry
 *
 * Shows evaluation stats (time, warnings, node count) and provides
 * an "Apply to Scene" button that sends the result to the main scene.
 */

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useNodeEvalContext, type ProcessedEvalResult } from './NodeEvalContext';
import { EvaluationMode } from '../core/nodes/execution/NodeEvaluator';

// ============================================================================
// 3D Preview Content
// ============================================================================

/** Camera setup helper */
function CameraSetup() {
  const { camera } = useThree();
  React.useEffect(() => {
    camera.position.set(3, 2, 3);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

/** Material preview: sphere with the evaluated material */
function MaterialPreview({ material }: { material: THREE.MeshPhysicalMaterial }) {
  const sphereRef = useRef<THREE.Mesh>(null);

  return (
    <mesh ref={sphereRef} material={material} castShadow receiveShadow>
      <sphereGeometry args={[1, 64, 64]} />
    </mesh>
  );
}

/** Texture preview: plane with the texture applied */
function TexturePreview({ texture }: { texture: THREE.Texture }) {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.0,
    });
    return mat;
  }, [texture]);

  return (
    <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** Geometry preview: wireframe mesh of the geometry */
function GeometryPreview({ geometry }: { geometry: THREE.BufferGeometry }) {
  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );

  // Ensure geometry has computed normals
  React.useEffect(() => {
    try {
      geometry.computeVertexNormals();
    } catch {
      // Some geometries may not support this
    }
  }, [geometry]);

  return <mesh geometry={geometry} material={wireframeMaterial} />;
}

/** Empty placeholder when no result is available */
function EmptyPreview() {
  return (
    <mesh>
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial
        color="#333"
        wireframe
        transparent
        opacity={0.3}
      />
    </mesh>
  );
}

/** Scene content based on evaluation result */
function PreviewSceneContent({ result }: { result: ProcessedEvalResult | null }) {
  return (
    <>
      <CameraSetup />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-3, 4, -3]} intensity={0.4} color="#a8c8e8" />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} metalness={0} />
      </mesh>

      {/* Grid helper */}
      <gridHelper args={[10, 20, '#333', '#222']} position={[0, -1.19, 0]} />

      {/* Preview content */}
      <Suspense fallback={<EmptyPreview />}>
        {result && result.errorCount === 0 ? (
          (() => {
            switch (result.raw.mode) {
              case EvaluationMode.MATERIAL:
                return result.material ? (
                  <MaterialPreview material={result.material} />
                ) : (
                  <EmptyPreview />
                );
              case EvaluationMode.TEXTURE:
                return result.texture ? (
                  <TexturePreview texture={result.texture} />
                ) : (
                  <EmptyPreview />
                );
              case EvaluationMode.GEOMETRY:
                return result.geometry ? (
                  <GeometryPreview geometry={result.geometry} />
                ) : (
                  <EmptyPreview />
                );
              default:
                return <EmptyPreview />;
            }
          })()
        ) : (
          <EmptyPreview />
        )}
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={20}
        target={[0, 0, 0]}
      />
    </>
  );
}

// ============================================================================
// Stats Panel
// ============================================================================

function EvalStatsPanel({ result }: { result: ProcessedEvalResult | null }) {
  if (!result) {
    return (
      <div className="p-3 text-xs text-gray-500">
        <p>No evaluation result. Click &quot;Evaluate&quot; in the graph editor.</p>
      </div>
    );
  }

  const { raw, evalTimeMs, warningCount, errorCount, nodeCount, material, texture, geometry } = result;

  const statusColor = errorCount > 0
    ? 'text-red-400'
    : warningCount > 0
      ? 'text-yellow-400'
      : 'text-emerald-400';

  const statusLabel = errorCount > 0
    ? 'Failed'
    : warningCount > 0
      ? 'Warnings'
      : 'Success';

  const modeLabel = raw.mode === EvaluationMode.MATERIAL
    ? 'Material'
    : raw.mode === EvaluationMode.TEXTURE
      ? 'Texture'
      : 'Geometry';

  const hasOutput = material !== null || texture !== null || geometry !== null;

  return (
    <div className="p-3 space-y-2 text-xs">
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span className={`font-semibold ${statusColor}`}>
          {statusLabel}
        </span>
        <span className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-400">
          {modeLabel}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="text-gray-500">Eval Time</div>
        <div className="text-gray-300 text-right">{evalTimeMs.toFixed(1)} ms</div>
        <div className="text-gray-500">Nodes</div>
        <div className="text-gray-300 text-right">{nodeCount}</div>
        <div className="text-gray-500">Warnings</div>
        <div className={`text-right ${warningCount > 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
          {warningCount}
        </div>
        <div className="text-gray-500">Errors</div>
        <div className={`text-right ${errorCount > 0 ? 'text-red-400' : 'text-gray-300'}`}>
          {errorCount}
        </div>
        <div className="text-gray-500">Output</div>
        <div className={`text-right ${hasOutput ? 'text-emerald-400' : 'text-gray-500'}`}>
          {hasOutput ? 'Ready' : 'None'}
        </div>
      </div>

      {/* Errors */}
      {raw.errors.length > 0 && (
        <div className="mt-2 p-2 bg-red-950/40 border border-red-800/50 rounded">
          <p className="text-red-300 font-semibold mb-1">Errors</p>
          {raw.errors.map((err, i) => (
            <p key={i} className="text-red-400 truncate" title={err}>
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {raw.warnings.length > 0 && (
        <div className="mt-1 p-2 bg-yellow-950/30 border border-yellow-800/30 rounded max-h-24 overflow-y-auto custom-scrollbar">
          <p className="text-yellow-300 font-semibold mb-1">Warnings</p>
          {raw.warnings.map((w, i) => (
            <p key={i} className="text-yellow-400 truncate" title={w}>
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface NodeEvalPreviewProps {
  /** Additional CSS class name */
  className?: string;
}

export function NodeEvalPreview({ className }: NodeEvalPreviewProps) {
  const { processedResult, applyToScene, requestSceneView } = useNodeEvalContext();

  const hasResult = processedResult !== null;
  const hasOutput = processedResult !== null && (
    processedResult.material !== null ||
    processedResult.texture !== null ||
    processedResult.geometry !== null
  );

  return (
    <div className={`flex flex-col h-full bg-gray-950 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          3D Preview
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => applyToScene()}
            disabled={!hasOutput}
            className="px-2 py-1 text-[10px] font-medium bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
            title="Apply the evaluated result to the main scene"
          >
            Apply to Scene
          </button>
          <button
            onClick={requestSceneView}
            disabled={!hasOutput}
            className="px-2 py-1 text-[10px] font-medium bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 rounded transition-colors"
            title="Open the full scene with evaluated materials"
          >
            Render Scene
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="flex-1 min-h-0">
        <Canvas
          shadows
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          camera={{ position: [3, 2, 3], fov: 50, near: 0.1, far: 100 }}
          style={{ background: '#0d0d1a' }}
        >
          <PreviewSceneContent result={processedResult} />
        </Canvas>
      </div>

      {/* Stats Panel */}
      <div className="border-t border-gray-800 flex-shrink-0">
        <EvalStatsPanel result={processedResult} />
      </div>
    </div>
  );
}

export default NodeEvalPreview;
