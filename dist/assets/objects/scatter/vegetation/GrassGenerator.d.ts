/**
 * GrassGenerator - Procedural grass varieties with wind animation and LOD
 *
 * Ported from Infinigen's grass generation system
 * Generates multiple grass species with parametric controls for blade shape, density, and growth patterns
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type GrassSpecies = 'rye' | 'fescue' | 'bermuda' | 'kentucky_bluegrass' | 'st_augustine' | 'zoysia';
export type GrassStyle = 'natural' | 'manicured' | 'wild' | 'dry';
export interface GrassConfig {
    height: number;
    density: number;
    bladeWidth: number;
    bladeCount: number;
    species: GrassSpecies;
    style: GrassStyle;
    curvature: number;
    twist: number;
    variation: number;
    windStrength: number;
    windFrequency: number;
    lodDistance: number[];
}
export declare class GrassGenerator extends BaseObjectGenerator<GrassConfig> {
    private noise;
    constructor();
    getDefaultConfig(): GrassConfig;
    generate(config?: Partial<GrassConfig>): THREE.Group;
    private generateBlades;
    private createBladeGeometry;
    private createGrassMaterial;
    private createCollisionMesh;
    private calculateBoundingBox;
    getWindAnimationParams(config: GrassConfig): {
        strength: number;
        frequency: number;
    };
}
//# sourceMappingURL=GrassGenerator.d.ts.map