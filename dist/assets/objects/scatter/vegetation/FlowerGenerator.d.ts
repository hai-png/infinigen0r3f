/**
 * FlowerGenerator - Flowering plants
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../../utils/BaseObjectGenerator';
export type FlowerType = 'daisy' | 'tulip' | 'rose' | 'sunflower' | 'lily';
export interface FlowerConfig {
    petalCount: number;
    petalSize: number;
    stemHeight: number;
    flowerType: FlowerType;
    color: number;
}
export declare class FlowerGenerator extends BaseObjectGenerator<FlowerConfig> {
    getDefaultConfig(): FlowerConfig;
    generate(config?: Partial<FlowerConfig>): THREE.Group;
    private createStem;
    private createPetals;
    private createCenter;
}
//# sourceMappingURL=FlowerGenerator.d.ts.map