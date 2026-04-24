/**
 * Auto-generated placeholder - to be fully implemented
 */
import { Group, Mesh, BoxGeometry } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export class Generator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = { style: 'default', seed: undefined };
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        const group = new Group();
        const mat = this.getMaterial('default');
        const geom = new BoxGeometry(0.1, 0.1, 0.1);
        const mesh = new Mesh(geom, mat);
        group.add(mesh);
        return group;
    }
    getVariations() {
        return [{ style: 'default', seed: 1 }];
    }
}
//# sourceMappingURL=PictureFrameGenerator.js.map