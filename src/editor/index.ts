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
