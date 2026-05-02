/**
 * Utility Tools
 *
 * Development and debugging tools for Infinigen.
 * Based on Infinigen's tools/ module.
 */

import { ExportToolkit, createExportToolkit } from './ExportToolkit';

// Export toolkit for scene and asset export
export { ExportToolkit, createExportToolkit } from './ExportToolkit';
export type {
  ExportFormat,
  ExportOptions,
  ExportResult,
  ExportTransform,
  LODSettings,
  TextureExportSettings,
} from './ExportToolkit';

// Phase 4.3 — Advanced export pipeline
export {
  SceneExporter,
  exportSceneToBlob,
  TextureBaker,
  SimulationExporter,
  MeshSimplifier,
  simplifyGeometry,
} from './export';

export type {
  ExportFormat as SceneExportFormat,
  ExportScope,
  SceneExportOptions,
  SceneExportResult,
  TextureBakeOptions,
  TextureBakeResult,
  TextureSize,
  UVProjection,
  SimulationExportOptions,
  SimulationExportResult,
  ArticulatedBody,
  JointDefinition,
  SimplificationOptions,
} from './export';

// Version info
export const TOOLS_VERSION = '0.3.0';

export default {
  ExportToolkit,
  createExportToolkit,
};
