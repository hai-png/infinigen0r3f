/**
 * Asset Factory Module Exports
 * 
 * Hybrid implementation for procedural primitive generation,
 * GLTF model loading, and semantic material assignment.
 */

export * from './AssetFactory';

import AssetFactory, {
  defaultAssetFactory,
  type AssetFactoryOptions,
} from './AssetFactory';

export {
  AssetFactory as default,
  defaultAssetFactory,
};

export type {
  AssetFactoryOptions,
};
