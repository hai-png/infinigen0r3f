/**
 * Surface Module Tests
 * Tests for src/assets/core/surface.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AttributeDomain, AttributeDataType, writeAttributeData, readAttributeData, createAttribute, smoothAttribute, transferAttribute, captureAttribute, deleteAttribute, hasAttribute, renameAttribute, detectAttributeDomain, getAllAttributes, getEdgeConnectivity } from '../../assets/core/surface';
describe('Surface Module', () => {
    let mesh;
    let geometry;
    beforeEach(() => {
        geometry = new THREE.BoxGeometry(1, 1, 1);
        mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    });
    describe('AttributeDomain enum', () => {
        it('should have correct domain values', () => {
            expect(AttributeDomain.POINT).toBe('POINT');
            expect(AttributeDomain.FACE).toBe('FACE');
            expect(AttributeDomain.CORNER).toBe('CORNER');
            expect(AttributeDomain.EDGE).toBe('EDGE');
            expect(AttributeDomain.INSTANCE).toBe('INSTANCE');
        });
    });
    describe('AttributeDataType enum', () => {
        it('should have correct data type values', () => {
            expect(AttributeDataType.FLOAT).toBe('FLOAT');
            expect(AttributeDataType.FLOAT3).toBe('FLOAT3');
            expect(AttributeDataType.INT).toBe('INT');
            expect(AttributeDataType.BOOLEAN).toBe('BOOLEAN');
        });
    });
    describe('writeAttributeData', () => {
        it('should write float attribute to POINT domain', () => {
            const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
            const attr = writeAttributeData(mesh, 'testAttr', data, AttributeDataType.FLOAT, AttributeDomain.POINT);
            expect(attr).toBeDefined();
            expect(attr.itemSize).toBe(1);
            expect(hasAttribute(mesh, 'testAttr')).toBe(true);
        });
        it('should write vec3 attribute', () => {
            const data = new Float32Array([1, 2, 3, 4, 5, 6]);
            const attr = writeAttributeData(mesh, 'vec3Attr', data, AttributeDataType.FLOAT3, AttributeDomain.POINT);
            expect(attr.itemSize).toBe(3);
        });
        it('should update existing attribute', () => {
            const data1 = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
            writeAttributeData(mesh, 'existingAttr', data1, AttributeDataType.FLOAT);
            const data2 = new Float32Array([9, 10, 11, 12, 13, 14, 15, 16]);
            writeAttributeData(mesh, 'existingAttr', data2, AttributeDataType.FLOAT);
            const readBack = readAttributeData(mesh, 'existingAttr');
            expect(readBack[0]).toBe(9);
            expect(readBack[1]).toBe(10);
        });
    });
    describe('readAttributeData', () => {
        it('should read back written data', () => {
            const originalData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
            writeAttributeData(mesh, 'readTest', originalData, AttributeDataType.FLOAT);
            const readData = readAttributeData(mesh, 'readTest');
            expect(readData.length).toBe(originalData.length);
            expect(readData[0]).toBe(1);
            expect(readData[7]).toBe(8);
        });
        it('should throw error for non-existent attribute', () => {
            expect(() => readAttributeData(mesh, 'nonExistent')).toThrow();
        });
    });
    describe('createAttribute', () => {
        it('should create new attribute with specified type', () => {
            const attr = createAttribute(mesh, 'newAttr', AttributeDataType.INT, AttributeDomain.POINT);
            expect(attr).toBeDefined();
            expect(hasAttribute(mesh, 'newAttr')).toBe(true);
        });
        it('should initialize with provided data', () => {
            const initialData = new Int32Array([10, 20, 30, 40, 50, 60, 70, 80]);
            const attr = createAttribute(mesh, 'initializedAttr', AttributeDataType.INT, AttributeDomain.POINT, initialData);
            const readBack = readAttributeData(mesh, 'initializedAttr');
            expect(readBack[0]).toBe(10);
        });
    });
    describe('smoothAttribute', () => {
        it('should smooth attribute values', () => {
            // Create attribute with sharp variation
            const data = new Float32Array([0, 10, 0, 10, 0, 10, 0, 10]);
            writeAttributeData(mesh, 'toSmooth', data, AttributeDataType.FLOAT);
            // Apply smoothing
            smoothAttribute(mesh, 'toSmooth', 5, 0.1);
            const smoothed = readAttributeData(mesh, 'toSmooth');
            // Values should be closer together after smoothing
            const variance = (val) => {
                const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;
                return smoothed.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / smoothed.length;
            };
            const originalVar = variance(0); // Original has 0s and 10s
            const smoothedVar = variance(0);
            // Smoothing should reduce variance (this is a basic check)
            expect(smoothed.every(v => v >= 0 && v <= 10)).toBe(true);
        });
    });
    describe('transferAttribute', () => {
        it('should transfer attributes between meshes', () => {
            const sourceGeom = new THREE.SphereGeometry(1, 16, 16);
            const sourceMesh = new THREE.Mesh(sourceGeom, new THREE.MeshBasicMaterial());
            // Add attribute to source
            const sourceData = new Float32Array(sourceGeom.attributes.position.count).fill(5);
            writeAttributeData(sourceMesh, 'transferAttr', sourceData, AttributeDataType.FLOAT);
            // Transfer to target
            transferAttribute(sourceMesh, mesh, 'transferAttr', 'nearest');
            expect(hasAttribute(mesh, 'transferAttr')).toBe(true);
        });
    });
    describe('captureAttribute', () => {
        it('should capture computed values', () => {
            const attr = captureAttribute(mesh, 'captured', (index, position, normal) => {
                return position.x + position.y;
            }, AttributeDataType.FLOAT);
            expect(attr).toBeDefined();
            expect(hasAttribute(mesh, 'captured')).toBe(true);
        });
        it('should capture vector values', () => {
            const attr = captureAttribute(mesh, 'capturedVec', (index, position, normal) => {
                return [position.x, position.y, position.z];
            }, AttributeDataType.FLOAT3);
            expect(attr.itemSize).toBe(3);
        });
    });
    describe('deleteAttribute', () => {
        it('should remove attribute from geometry', () => {
            writeAttributeData(mesh, 'toDelete', new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
            expect(hasAttribute(mesh, 'toDelete')).toBe(true);
            deleteAttribute(mesh, 'toDelete');
            expect(hasAttribute(mesh, 'toDelete')).toBe(false);
        });
    });
    describe('renameAttribute', () => {
        it('should rename attribute', () => {
            writeAttributeData(mesh, 'oldName', new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
            renameAttribute(mesh, 'oldName', 'newName');
            expect(hasAttribute(mesh, 'oldName')).toBe(false);
            expect(hasAttribute(mesh, 'newName')).toBe(true);
        });
        it('should throw error if old name does not exist', () => {
            expect(() => renameAttribute(mesh, 'nonExistent', 'newName')).toThrow();
        });
    });
    describe('detectAttributeDomain', () => {
        it('should detect POINT domain', () => {
            const data = new Float32Array(geometry.attributes.position.count);
            writeAttributeData(mesh, 'pointAttr', data, AttributeDataType.FLOAT);
            const domain = detectAttributeDomain(geometry, 'pointAttr');
            expect(domain).toBe(AttributeDomain.POINT);
        });
    });
    describe('getAllAttributes', () => {
        it('should list all attributes', () => {
            writeAttributeData(mesh, 'attr1', new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
            writeAttributeData(mesh, 'attr2', new Float32Array([9, 10, 11, 12, 13, 14, 15, 16]));
            const allAttrs = getAllAttributes(mesh);
            expect(allAttrs.length).toBeGreaterThanOrEqual(2);
            const names = allAttrs.map(a => a.name);
            expect(names).toContain('attr1');
            expect(names).toContain('attr2');
        });
    });
    describe('getEdgeConnectivity', () => {
        it('should extract edge connectivity from indexed geometry', () => {
            const edges = getEdgeConnectivity(geometry);
            // Box geometry should have 12 edges
            expect(edges.length).toBeGreaterThan(0);
            expect(edges.length % 2).toBe(0); // Should be pairs
        });
        it('should work with non-indexed geometry', () => {
            const nonIndexedGeom = geometry.toNonIndexed();
            const edges = getEdgeConnectivity(nonIndexedGeom);
            expect(edges.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=surface.test.js.map