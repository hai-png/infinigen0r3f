/**
 * ShrubGenerator - Bushes and shrubs
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type ShrubType = 'boxwood' | 'hydrangea' | 'lavender' | 'juniper' | 'rhododendron';
export interface ShrubConfig {
    width: number;
    height: number;
    density: number;
    shrubType: ShrubType;
    leafColor: number;
}
export declare class ShrubGenerator extends BaseObjectGenerator<ShrubConfig> {
    private noise;
    getDefaultConfig(): ShrubConfig;
    generate(config?: Partial<ShrubConfig>): THREE.Group;
    private createFoliage;
}
//# sourceMappingURL=ShrubGenerator.d.ts.map