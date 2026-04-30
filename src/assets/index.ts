// Procedural generators
export * from './procedural/index';

// Material generators
export * from './materials/index';

// Specialized shaders
export * from './shaders/index';

// Scatter systems
export { GrassScatterSystem, InstanceScatterSystem, RockScatterSystem } from './scatters/index';
export type { GrassScatterConfig, ScatterConfig as AssetScatterConfig, ScatterMode, BiomeRule, ScatterResult, RockScatterConfig, RockScatterStats } from './scatters/index';

// Lighting systems
export * from './lighting/index';
