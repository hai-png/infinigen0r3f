/**
 * Erosion Module Exports
 */

export type { ErosionSystem, ThermalErosion, RiverFormation, ErosionParams } from './ErosionSystem';

// Also export ErosionEnhanced and related types for direct hydraulic erosion usage
export { ErosionEnhanced, HydraulicErosion, SedimentTransport } from './ErosionEnhanced';
export type { ErosionConfig, ErosionData, Droplet } from './ErosionEnhanced';
