/**
 * AutoTag System Tests
 * Tests for src/assets/core/AutoTag.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  AutoTag,
  tagSystem,
  createTagAttribute,
  extractTagMask,
  combineTagMasks,
  printTagSummary
} from '../../assets/core/AutoTag';

describe('AutoTag System', () => {
  let mesh: THREE.Mesh;
  let geometry: THREE.BufferGeometry;

  beforeEach(() => {
    geometry = new THREE.BoxGeometry(1, 1, 1);
    mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  });

  describe('AutoTag class instantiation', () => {
    it('should create new instance with empty tag dictionary', () => {
      const tagger = new AutoTag();
      
      expect(tagger.tagDict.size).toBe(0);
      expect(tagger.tagNameLookup.length).toBe(0);
    });

    it('should clear tags correctly', () => {
      const tagger = new AutoTag();
      tagger.tagDict.set('test', 1);
      tagger.tagNameLookup.push('test');
      
      tagger.clear();
      
      expect(tagger.tagDict.size).toBe(0);
      expect(tagger.tagNameLookup.length).toBe(0);
    });
  });

  describe('Tag persistence', () => {
    it('should save tags to JSON string', () => {
      const tagger = new AutoTag();
      tagger.tagDict.set('wall', 1);
      tagger.tagDict.set('floor', 2);
      
      const jsonStr = tagger.saveTag();
      const parsed = JSON.parse(jsonStr);
      
      expect(parsed.wall).toBe(1);
      expect(parsed.floor).toBe(2);
    });

    it('should load tags from JSON string', () => {
      const tagger = new AutoTag();
      const jsonStr = JSON.stringify({ wall: 1, floor: 2, ceiling: 3 });
      
      tagger.loadTag(jsonStr);
      
      expect(tagger.tagDict.size).toBe(3);
      expect(tagger.getTagValue('wall')).toBe(1);
      expect(tagger.getTagValue('floor')).toBe(2);
    });

    it('should throw error for invalid JSON', () => {
      const tagger = new AutoTag();
      
      expect(() => tagger.loadTag('invalid json')).toThrow();
    });
  });

  describe('createTagAttribute', () => {
    it('should create TAG_ prefixed attribute', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const mask = new Array(nFaces).fill(false);
      mask[0] = true;
      
      createTagAttribute(mesh, 'wall', mask);
      
      expect(mesh.geometry.hasAttribute('TAG_wall')).toBe(true);
    });

    it('should convert boolean mask to float values', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const mask = [true, false, true, false, false, false];
      
      createTagAttribute(mesh, 'test', mask);
      
      const attr = mesh.geometry.getAttribute('TAG_test');
      expect(attr.array[0]).toBe(1.0);
      expect(attr.array[1]).toBe(0.0);
      expect(attr.array[2]).toBe(1.0);
    });

    it('should throw error for mismatched mask length', () => {
      const wrongSizeMask = [true, false]; // Too small
      
      expect(() => createTagAttribute(mesh, 'test', wrongSizeMask)).toThrow();
    });
  });

  describe('extractTagMask', () => {
    it('should extract boolean mask from TAG_ attribute', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const mask = new Array(nFaces).fill(false);
      mask[0] = true;
      mask[2] = true;
      
      createTagAttribute(mesh, 'extractTest', mask);
      
      const extracted = extractTagMask(mesh, 'extractTest');
      
      expect(extracted[0]).toBe(true);
      expect(extracted[1]).toBe(false);
      expect(extracted[2]).toBe(true);
    });

    it('should return empty array for non-existent tag', () => {
      const extracted = extractTagMask(mesh, 'nonExistent');
      
      expect(extracted.length).toBe(0);
    });
  });

  describe('combineTagMasks', () => {
    it('should combine multiple masks into integer encoding', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const masks = new Map<string, boolean[]>();
      
      const mask1 = new Array(nFaces).fill(false);
      mask1[0] = true;
      masks.set('wall', mask1);
      
      const mask2 = new Array(nFaces).fill(false);
      mask2[1] = true;
      masks.set('floor', mask2);
      
      const tagger = combineTagMasks(mesh, masks);
      
      expect(tagger.tagDict.size).toBe(2);
      expect(mesh.geometry.hasAttribute('MaskTag')).toBe(true);
    });

    it('should assign sequential tag IDs', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const masks = new Map<string, boolean[]>();
      
      masks.set('first', new Array(nFaces).fill(false));
      masks.set('second', new Array(nFaces).fill(false));
      masks.set('third', new Array(nFaces).fill(false));
      
      const tagger = combineTagMasks(mesh, masks);
      
      expect(tagger.getTagValue('first')).toBe(1);
      expect(tagger.getTagValue('second')).toBe(2);
      expect(tagger.getTagValue('third')).toBe(3);
    });
  });

  describe('relabelObj', () => {
    it('should process mesh and create combined MaskTag', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      
      // Create initial tag attributes
      const wallMask = new Array(nFaces).fill(false);
      wallMask[0] = true;
      createTagAttribute(mesh, 'wall', wallMask);
      
      const tagger = new AutoTag();
      tagger.relabelObj(mesh);
      
      expect(mesh.geometry.hasAttribute('MaskTag')).toBe(true);
      expect(tagger.tagDict.size).toBeGreaterThan(0);
    });

    it('should handle object tree with children', () => {
      const parent = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      );
      const child = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshBasicMaterial()
      );
      parent.add(child);
      
      const tagger = new AutoTag();
      tagger.relabelObj(parent);
      
      // Should not throw
      expect(parent).toBeDefined();
    });
  });

  describe('tag lookup', () => {
    it('should get tag name by value', () => {
      const tagger = new AutoTag();
      tagger.tagDict.set('testTag', 5);
      tagger.tagNameLookup[4] = 'testTag';
      
      const name = tagger.getTagName(5);
      
      expect(name).toBe('testTag');
    });

    it('should return null for invalid tag value', () => {
      const tagger = new AutoTag();
      
      expect(tagger.getTagName(999)).toBeNull();
      expect(tagger.getTagName(0)).toBeNull();
      expect(tagger.getTagName(-1)).toBeNull();
    });

    it('should get tag value by name', () => {
      const tagger = new AutoTag();
      tagger.tagDict.set('lookupTest', 42);
      
      const value = tagger.getTagValue('lookupTest');
      
      expect(value).toBe(42);
    });

    it('should return undefined for unknown tag name', () => {
      const tagger = new AutoTag();
      
      expect(tagger.getTagValue('unknown')).toBeUndefined();
    });
  });

  describe('getAllTags', () => {
    it('should return all registered tags', () => {
      const tagger = new AutoTag();
      tagger.tagDict.set('tag1', 1);
      tagger.tagDict.set('tag2', 2);
      tagger.tagDict.set('tag3', 3);
      
      const allTags = tagger.getAllTags();
      
      expect(allTags.length).toBe(3);
      expect(allTags.map(t => t.name)).toContain('tag1');
      expect(allTags.map(t => t.name)).toContain('tag2');
    });
  });

  describe('specializeTagName', () => {
    it('should return original name for instance 0', () => {
      const tagger = new AutoTag();
      const lookup = ['base'];
      
      const result = tagger.specializeTagName(0, 'wall', lookup);
      
      expect(result).toBe('wall');
    });

    it('should add suffix for subsequent instances', () => {
      const tagger = new AutoTag();
      const lookup = ['wall'];
      
      const result = tagger.specializeTagName(1, 'plant', lookup);
      
      expect(result).toContain('wall');
      expect(result).toContain('plant');
    });

    it('should throw error for names containing dot', () => {
      const tagger = new AutoTag();
      
      expect(() => tagger.specializeTagName(0, 'invalid.name', [])).toThrow();
    });
  });

  describe('printSegmentsSummary', () => {
    it('should log summary without errors', () => {
      const nFaces = geometry.index ? geometry.index.count / 3 : 8;
      const mask = new Array(nFaces).fill(false);
      mask[0] = true;
      
      createTagAttribute(mesh, 'summaryTest', mask);
      
      const tagger = new AutoTag();
      tagger.relabelObj(mesh);
      
      // Should not throw
      expect(() => tagger.printSegmentsSummary(mesh)).not.toThrow();
    });

    it('should handle mesh without tags gracefully', () => {
      const tagger = new AutoTag();
      
      // Should not throw
      expect(() => tagger.printSegmentsSummary(mesh)).not.toThrow();
    });
  });

  describe('global tagSystem', () => {
    it('should export singleton instance', () => {
      expect(tagSystem).toBeDefined();
      expect(tagSystem instanceof AutoTag).toBe(true);
    });
  });
});
