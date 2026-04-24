/**
 * Placement Module - Object Placement and Scattering System
 * Based on Infinigen's placement system
 */
export { AssetFactory, createAssetCollection } from './factory';
// Instance scattering with Poisson disk sampling
export { InstanceScatter } from './instance-scatter';
// To be implemented:
// export * from './detail';
// export * from './density';
// export * from './path-finding';
// export * from './split-in-view';
// export * from './animation-policy';
export default {
    AssetFactory,
    createAssetCollection,
    InstanceScatter,
};
//# sourceMappingURL=index.js.map