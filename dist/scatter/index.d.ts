/**
 * Scatter Module
 * Provides instance scattering systems for vegetation, debris, and environmental elements
 */
export * from './types';
export * from './utils/wind';
export declare const ScatterRegistry: {
    flower: any;
    groundDebris: any;
    pebbles: any;
    groundTwigs: any;
    grass: any;
    fern: any;
    mushroom: any;
    moss: any;
    lichen: any;
    waterSurface: any;
    rock: any;
    bush: any;
    tree: any;
    ivy: any;
    snowLayer: any;
    slimeMold: any;
    pineNeedle: any;
    pinecone: any;
    monocots: any;
    jellyfish: any;
    urchin: any;
    seaweed: any;
    coralReef: any;
    mollusk: any;
    seashells: any;
    choppedTrees: any;
};
export type ScatterType = keyof typeof ScatterRegistry;
/**
 * Factory function to create scatter instances by type
 */
export declare function createScatter(type: ScatterType, params?: any): any;
export default ScatterRegistry;
//# sourceMappingURL=index.d.ts.map