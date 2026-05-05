/**
 * Editor Module Exports
 */

import { SceneEditor } from './SceneEditor';

export { SceneEditor } from './SceneEditor';
export type { SceneObject } from './SceneEditor';
export type { SceneEditorProps } from './SceneEditor';

export { NodeGraphEditor } from './NodeGraphEditor';
export { NodeGraphEditor as default } from './NodeGraphEditor';

export { NodeEvalPreview } from './NodeEvalPreview';
export type { NodeEvalPreviewProps } from './NodeEvalPreview';

export { NodeEvalProvider, useNodeEvalContext } from './NodeEvalContext';
export type {
  NodeEvalContextValue,
  ProcessedEvalResult,
  ApplyToSceneCallback,
} from './NodeEvalContext';

export { SceneWireup, applyMaterialToScene, applyGeometryToScene, applyTextureToScene } from './SceneWireup';
export type { ApplyResult, AppliedEntry, TextureMapSlot } from './SceneWireup';

// ---- Unified Editor ----
export { EditorProvider, useEditor } from './unified/EditorContext';
export type {
  CenterViewMode,
  LeftTab,
  RightTab,
  BottomTab,
  SceneObject as UnifiedSceneObject,
  PBRMaterialState,
  TerrainParams,
  ConstraintEntry,
  Keyframe,
  ParticleSystemConfig,
  CameraRig,
  PerformanceMetrics as EditorPerformanceMetrics,
  LogEntry,
  EditorState,
  EditorContextValue,
} from './unified/EditorContext';

export { default as InfinigenEditor } from './unified/InfinigenEditor';
