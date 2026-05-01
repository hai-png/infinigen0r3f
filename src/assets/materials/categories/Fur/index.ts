/**
 * Fur Materials Module Index
 *
 * Shell-texture fur rendering following Princeton Infinigen's approach.
 * Provides layered shell-based fur with configurable density, color, and animation.
 *
 * @module materials/categories/fur
 */

export {
  ShellTextureFurMaterial,
  ShellTextureFurRenderer,
  createFurConfig,
  DEFAULT_FUR_CONFIG,
} from './ShellTextureFur';

export type { ShellTextureFurConfig } from './ShellTextureFur';
