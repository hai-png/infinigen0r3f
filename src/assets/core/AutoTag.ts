/**
 * AutoTag System for Infinigen R3F
 * Ported from infinigen/core/tagging.py
 * 
 * Manages semantic tags on mesh faces using integer-encoded attributes
 * Supports tag inheritance, specialization, and combination across scattered instances
 */

import { Mesh, BufferGeometry, BufferAttribute } from 'three';
import * as surface from './surface';

/**
 * Prefix for tag attributes in Three.js geometry
 */
const PREFIX = 'TAG_';

/**
 * Name of the combined tag attribute that stores integer-encoded tags
 */
const COMBINED_ATTR_NAME = 'MaskTag';

/**
 * Tag dictionary entry
 */
export interface TagEntry {
  name: string;
  id: number;
}

/**
 * Result of tag extraction from a mesh
 */
export interface ExtractedTags {
  [tagName: string]: Uint8Array | boolean[];
}

/**
 * AutoTag class for managing face-based semantic tags
 * 
 * Usage:
 * ```typescript
 * const tagger = new AutoTag();
 * tagger.relabelObj(mesh);
 * tagger.saveTag('./tags.json');
 * ```
 */
export class AutoTag {
  /**
   * Dictionary mapping tag names to integer IDs
   */
  tagDict: Map<string, number>;

  /**
   * Lookup array mapping ID to tag name (inverse of tagDict)
   */
  tagNameLookup: (string | null)[];

  constructor() {
    this.tagDict = new Map();
    this.tagNameLookup = [];
  }

  /**
   * Clear all stored tags
   */
  clear(): void {
    this.tagDict.clear();
    this.tagNameLookup = [];
  }

  /**
   * Save tag dictionary to JSON file
   * Note: In browser environment, this returns JSON string for download
   * 
   * @param path - File path (Node.js) or download filename (browser)
   * @returns JSON string representation of tag dictionary
   */
  saveTag(path?: string): string {
    const jsonObj: Record<string, number> = {};
    for (const [name, id] of this.tagDict.entries()) {
      jsonObj[name] = id;
    }
    
    const jsonStr = JSON.stringify(jsonObj, null, 2);
    
    // In browser environment, trigger download
    if (typeof window !== 'undefined' && !path) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MaskTag.json';
      a.click();
      URL.revokeObjectURL(url);
    }
    
    return jsonStr;
  }

  /**
   * Load tag dictionary from JSON
   * 
   * @param jsonStrOrPath - JSON string or file path
   */
  loadTag(jsonStrOrPath: string): void {
    let jsonObj: Record<string, number>;
    
    try {
      jsonObj = JSON.parse(jsonStrOrPath);
    } catch {
      throw new Error(`Invalid JSON: ${jsonStrOrPath}`);
    }
    
    this.tagDict.clear();
    this.tagNameLookup = [];
    
    for (const [name, id] of Object.entries(jsonObj)) {
      this.tagDict.set(name, id);
      
      // Ensure lookup array is large enough
      while (this.tagNameLookup.length < id) {
        this.tagNameLookup.push(null);
      }
      this.tagNameLookup[id - 1] = name;
    }
  }

  /**
   * Extract incoming tag masks from a mesh
   * Reads all attributes starting with TAG_ prefix and converts to boolean masks
   * 
   * @param obj - Source mesh
   * @returns Extracted tag masks
   */
  extractIncomingTagMasks(obj: Mesh): ExtractedTags {
    const geometry = obj.geometry;
    const newAttrs: ExtractedTags = {};
    
    // Find all tag attributes
    const tagAttrNames: string[] = [];
    for (const attrName of Object.keys(geometry.attributes)) {
      if (attrName.startsWith(PREFIX)) {
        tagAttrNames.push(attrName);
      }
    }
    
    const nPoly = this.getFaceCount(geometry);
    
    // Read each tag attribute
    for (const name of tagAttrNames) {
      const attr = geometry.getAttribute(name);
      
      // Validate domain (should be FACE)
      const domain = surface.detectAttributeDomain(geometry, name);
      if (domain !== surface.AttributeDomain.FACE) {
        console.warn(
          `Incoming attribute ${obj.name} ${attr.name} had invalid domain ${domain}, expected FACE`
        );
        continue;
      }
      
      // Validate size
      if (attr.count !== nPoly) {
        console.warn(
          `Incoming attribute ${obj.name} ${attr.name} had invalid size ${attr.count}, expected ${nPoly}`
        );
        continue;
      }
      
      // Convert to boolean mask
      const data = attr.array as Float32Array | Int32Array | Uint8Array;
      const mask: boolean[] = [];
      
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (typeof val === 'number') {
          mask.push(val > 0.5);
        } else {
          mask.push(!!val);
        }
      }
      
      // Remove TAG_ prefix
      const cleanName = name.slice(PREFIX.length);
      newAttrs[cleanName] = new Uint8Array(mask);
      
      // Remove the attribute from geometry
      geometry.deleteAttribute(name);
    }
    
    return newAttrs;
  }

  /**
   * Specialize a tag name for a specific variant/instance
   * Adds instance-specific suffix to avoid name collisions
   * 
   * @param vi - Variant/instance index
   * @param name - Base tag name
   * @param tagNameLookup - Current lookup array
   * @returns Specialized tag name
   */
  specializeTagName(vi: number, name: string, tagNameLookup: (string | null)[]): string {
    if (name.includes('.')) {
      throw new Error(`${name} should not contain separator character "."`);
    }
    
    if (vi === 0) {
      return name;
    }
    
    const existing = tagNameLookup[vi - 1];
    if (!existing) {
      return name;
    }
    
    const parts = new Set(existing.split('.'));
    
    if (parts.has(name)) {
      return existing;
    }
    
    parts.add(name);
    return Array.from(parts).sort().join('.');
  }

  /**
   * Relabel a single mesh object with tags
   * Internal method used by relabelObj
   * 
   * @param obj - Mesh to relabel
   * @param tagNameLookup - Tag name lookup array
   */
  relabelObjSingle(obj: Mesh, tagNameLookup: (string | null)[]): void {
    const geometry = obj.geometry;
    const nPoly = this.getFaceCount(geometry);
    
    // Extract incoming tags
    const newAttrs = this.extractIncomingTagMasks(obj);
    
    // Get current combined tag integers
    let tagInt: Int32Array;
    const existingAttr = geometry.getAttribute(COMBINED_ATTR_NAME);
    
    if (existingAttr) {
      const domain = surface.detectAttributeDomain(geometry, COMBINED_ATTR_NAME);
      if (domain !== surface.AttributeDomain.FACE) {
        throw new Error(
          `${obj.name} had ${COMBINED_ATTR_NAME} on domain ${domain}, expected FACE`
        );
      }
      tagInt = existingAttr.array as Int32Array;
    } else {
      tagInt = new Int32Array(nPoly).fill(0);
    }
    
    // Process each new tag
    for (const [name, newMask] of Object.entries(newAttrs)) {
      // Find affected tag integers
      const affectedTagInts = new Set<number>();
      for (let i = 0; i < nPoly; i++) {
        if (newMask[i]) {
          affectedTagInts.add(tagInt[i]);
        }
      }
      
      // Update each affected tag
      for (const vi of affectedTagInts) {
        const affectedMask: boolean[] = [];
        for (let i = 0; i < nPoly; i++) {
          affectedMask.push(newMask[i] && tagInt[i] === vi);
        }
        
        // Check if any faces are affected
        const hasAffected = affectedMask.some(m => m);
        if (!hasAffected) {
          continue;
        }
        
        // Specialize tag name
        const newTagName = this.specializeTagName(vi, name, tagNameLookup);
        let tagValue = this.tagDict.get(newTagName);
        
        // Register new tag if needed
        if (tagValue === undefined) {
          tagValue = this.tagDict.size + 1;
          this.tagDict.set(newTagName, tagValue);
          
          // Update lookup array
          while (tagNameLookup.length < tagValue) {
            tagNameLookup.push(null);
          }
          tagNameLookup[tagValue - 1] = newTagName;
        }
        
        // Apply tag value to affected faces
        for (let i = 0; i < nPoly; i++) {
          if (affectedMask[i]) {
            tagInt[i] = tagValue!;
          }
        }
      }
    }
    
    // Write back combined tag attribute
    let maskTagAttr = geometry.getAttribute(COMBINED_ATTR_NAME);
    if (!maskTagAttr) {
      maskTagAttr = surface.createAttribute(
        obj,
        COMBINED_ATTR_NAME,
        surface.AttributeDataType.INT,
        surface.AttributeDomain.FACE
      );
    }
    
    // Update attribute data
    const targetArray = maskTagAttr.array as Int32Array;
    for (let i = 0; i < Math.min(tagInt.length, targetArray.length); i++) {
      targetArray[i] = tagInt[i];
    }
    maskTagAttr.needsUpdate = true;
  }

  /**
   * Relabel all meshes in an object tree with tags
   * Main entry point for tagging workflow
   * 
   * @param rootObj - Root object to process (will process all children)
   * @returns The processed root object
   */
  relabelObj(rootObj: Mesh): Mesh {
    // Initialize lookup array
    const tagNameLookup: (string | null)[] = new Array(this.tagDict.size).fill(null);
    
    for (const [name, tagId] of this.tagDict.entries()) {
      const key = tagId - 1;
      if (key >= tagNameLookup.length) {
        throw new Error(
          `${name} had tagId=${tagId} key=${key} yet tagDict.size=${this.tagDict.size}`
        );
      }
      if (tagNameLookup[key] !== null) {
        throw new Error(
          `${name} attempted to overwrite existing entry ${tagNameLookup[key]}`
        );
      }
      tagNameLookup[key] = name;
    }
    
    // Process all meshes (in Three.js, we iterate through children)
    this.processObjectTree(rootObj, tagNameLookup);
    
    return rootObj;
  }

  /**
   * Recursively process an object tree
   * Helper method for relabelObj
   */
  private processObjectTree(obj: Mesh, tagNameLookup: (string | null)[]): void {
    // Process this mesh if it's a Mesh
    if (obj.isMesh && obj.geometry) {
      this.relabelObjSingle(obj, tagNameLookup);
    }
    
    // Process children
    for (const child of obj.children) {
      if (child instanceof Mesh) {
        this.processObjectTree(child, tagNameLookup);
      }
    }
  }

  /**
   * Get face count from geometry
   */
  private getFaceCount(geometry: BufferGeometry): number {
    if (geometry.index) {
      return geometry.index.count / 3;
    }
    return geometry.attributes.position.count / 3;
  }

  /**
   * Get tag name for a tag value
   */
  getTagName(tagValue: number): string | null {
    if (tagValue <= 0 || tagValue > this.tagNameLookup.length) {
      return null;
    }
    return this.tagNameLookup[tagValue - 1];
  }

  /**
   * Get tag value for a tag name
   */
  getTagValue(tagName: string): number | undefined {
    return this.tagDict.get(tagName);
  }

  /**
   * Get all registered tags
   */
  getAllTags(): TagEntry[] {
    const result: TagEntry[] = [];
    for (const [name, id] of this.tagDict.entries()) {
      result.push({ name, id });
    }
    return result;
  }

  /**
   * Print summary of tag distribution on a mesh
   */
  printSegmentsSummary(obj: Mesh): void {
    const geometry = obj.geometry;
    const tagAttr = geometry.getAttribute(COMBINED_ATTR_NAME);
    
    if (!tagAttr) {
      console.log(`No tag attribute found on ${obj.name}`);
      return;
    }
    
    const tagInt = tagAttr.array as Int32Array;
    const counts = new Map<number, number>();
    
    // Count occurrences of each tag
    for (let i = 0; i < tagInt.length; i++) {
      const val = tagInt[i];
      counts.set(val, (counts.get(val) || 0) + 1);
    }
    
    const total = tagInt.length;
    
    // Sort by frequency
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    
    console.log(`Tag Segments Summary for ${obj.name}:`);
    for (const [vi, count] of sorted) {
      const percentage = (count / total) * 100;
      const name = this.getTagName(vi) || 'UNTAGGED';
      console.log(`  ${percentage.toFixed(1)}% tagId=${vi} name=${name}`);
    }
  }
}

/**
 * Global tag system instance
 */
export const tagSystem = new AutoTag();

/**
 * Convenience function to print tag summary
 */
export function printTagSummary(obj: Mesh): void {
  tagSystem.printSegmentsSummary(obj);
}

/**
 * Create a tag attribute on a mesh from a boolean mask
 * 
 * @param obj - Target mesh
 * @param tagName - Name of the tag
 * @param mask - Boolean mask array (one per face)
 */
export function createTagAttribute(
  obj: Mesh,
  tagName: string,
  mask: boolean[] | Uint8Array
): void {
  const geometry = obj.geometry;
  const nFaces = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  
  if (mask.length !== nFaces) {
    throw new Error(`Mask length ${mask.length} doesn't match face count ${nFaces}`);
  }
  
  // Convert to float/int array for Three.js
  const data = new Float32Array(nFaces);
  for (let i = 0; i < nFaces; i++) {
    data[i] = mask[i] ? 1.0 : 0.0;
  }
  
  // Store with TAG_ prefix
  surface.writeAttributeData(
    obj,
    `${PREFIX}${tagName}`,
    data,
    surface.AttributeDataType.FLOAT,
    surface.AttributeDomain.FACE
  );
}

/**
 * Extract tag mask from a mesh
 * 
 * @param obj - Source mesh
 * @param tagName - Name of the tag to extract
 * @returns Boolean mask array
 */
export function extractTagMask(
  obj: Mesh,
  tagName: string
): boolean[] {
  const geometry = obj.geometry;
  const attrName = `${PREFIX}${tagName}`;
  
  const attr = geometry.getAttribute(attrName);
  if (!attr) {
    return [];
  }
  
  const data = attr.array as Float32Array | Int32Array | Uint8Array;
  const mask: boolean[] = [];
  
  for (let i = 0; i < data.length; i++) {
    mask.push(data[i] > 0.5);
  }
  
  return mask;
}

/**
 * Combine multiple tag masks into a single integer-encoded attribute
 * 
 * @param obj - Target mesh
 * @param tagMasks - Map of tag names to boolean masks
 * @returns AutoTag instance with registered tags
 */
export function combineTagMasks(
  obj: Mesh,
  tagMasks: Map<string, boolean[]>
): AutoTag {
  const tagger = new AutoTag();
  
  // Process each tag
  let tagValue = 1;
  const nFaces = tagMasks.values().next()?.value?.length || 0;
  const tagInt = new Int32Array(nFaces).fill(0);
  
  for (const [name, mask] of tagMasks.entries()) {
    for (let i = 0; i < nFaces; i++) {
      if (mask[i]) {
        tagInt[i] = tagValue;
      }
    }
    
    tagger.tagDict.set(name, tagValue);
    tagger.tagNameLookup.push(name);
    tagValue++;
  }
  
  // Write combined attribute
  surface.writeAttributeData(
    obj,
    COMBINED_ATTR_NAME,
    tagInt,
    surface.AttributeDataType.INT,
    surface.AttributeDomain.FACE
  );
  
  return tagger;
}

export default AutoTag;
