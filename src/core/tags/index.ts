/**
 * Tag System — barrel export
 *
 * Re-exports all types, enums, and classes from the tag system modules.
 *
 * @module core/tags
 */

export {
  // Enums
  SemanticTag,
  SubpartTag,

  // Classes
  Tag,
  TagSet,
  TagQuery,

  // Utility functions
  semanticTag,
  subpartTag,
  notTag,
} from './TagSystem';

export type { TagType } from './TagSystem';

export {
  FaceTagger,
  FACE_TAG_MAP_KEY,
} from './FaceTagger';
