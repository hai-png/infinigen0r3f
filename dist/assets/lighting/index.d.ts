/**
 * Lighting Module - Procedural Lighting System for R3F
 * Based on Infinigen's lighting system
 */
export { createHDRILighting, addHDRILighting, registerHDRIResource, getAvailableHDRIs, } from './hdri-lighting';
export type { HDRILightingConfig, HDRIResource } from './hdri-lighting';
export { createSkyLighting, addSkyLighting, animateSunPosition, } from './sky-lighting';
export type { SkyLightingConfig } from './sky-lighting';
export { createThreePointLighting, createAreaLighting, createEmissiveLighting, createWindowLight, createPracticalLight, createIndoorPreset, kelvinToRGB, } from './indoor-lighting';
export type { ThreePointLightingConfig, AreaLightConfig, EmissiveLightConfig, } from './indoor-lighting';
declare const _default: {
    hdri: {
        createHDRILighting: any;
        addHDRILighting: any;
        registerHDRIResource: any;
        getAvailableHDRIs: any;
    };
    sky: {
        createSkyLighting: any;
        addSkyLighting: any;
        animateSunPosition: any;
    };
    indoor: {
        createThreePointLighting: any;
        createAreaLighting: any;
        createEmissiveLighting: any;
        createWindowLight: any;
        createPracticalLight: any;
        createIndoorPreset: any;
        kelvinToRGB: any;
    };
};
export default _default;
//# sourceMappingURL=index.d.ts.map