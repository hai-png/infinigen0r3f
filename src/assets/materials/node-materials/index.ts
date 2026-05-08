/**
 * Node Material Generator – barrel exports
 *
 * Bridges the node system (ShaderGraphBuilder + PrincipledNodes)
 * to the 9 procedural material categories.
 */

export {
  NodeMaterialGenerator,
  generateNodeMaterial,
  generateMaterial,
  default,
} from './NodeMaterialGenerator';

export type {
  MaterialCategory,
  NodeMaterialParams,
  NodeMaterialResult,
} from './NodeMaterialGenerator';
