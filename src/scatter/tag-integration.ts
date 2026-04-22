/**
 * Tag Integration for Scattering System
 * 
 * Bridges the AutoTag system with scattering operations,
 * enabling tag-based scatter filtering and placement rules.
 */

import { AutoTag, extractTagMask, combineTagMasks } from '../assets/core/AutoTag';
import type { BufferAttribute } from 'three';

/**
 * Tag-based scatter filter configuration
 */
export interface TagScatterConfig {
  /** Required tags (all must be present) */
  requiredTags?: string[];
  /** Excluded tags (none must be present) */
  excludedTags?: string[];
  /** Optional tags with weights */
  weightedTags?: Map<string, number>;
  /** Tag attribute name (default: 'tag_mask') */
  tagAttributeName?: string;
}

/**
 * Scatter point with tag information
 */
export interface TaggedScatterPoint {
  position: [number, number, number];
  normal: [number, number, number];
  faceIndex: number;
  tags: string[];
  tagMask: Uint32Array;
  weight: number;
}

/**
 * Filter mesh faces by tags for scattering
 */
export function filterFacesByTags(
  geometry: any, // BufferGeometry
  autoTag: AutoTag,
  config: TagScatterConfig
): {
  faceIndices: number[];
  faceWeights: number[];
  totalFaces: number;
  filteredFaces: number;
} {
  const tagAttributeName = config.tagAttributeName || 'tag_mask';
  
  // Get tag mask attribute
  const tagMaskAttr = geometry.getAttribute(tagAttributeName);
  if (!tagMaskAttr) {
    throw new Error(`Tag attribute "${tagAttributeName}" not found on geometry`);
  }

  const faceCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  const faceIndices: number[] = [];
  const faceWeights: number[] = [];

  // Build tag masks for filtering
  const requiredMasks = config.requiredTags?.map(tag => 
    autoTag.getTagMask([tag])
  ) || [];
  
  const excludedMasks = config.excludedTags?.map(tag => 
    autoTag.getTagMask([tag])
  ) || [];

  for (let faceIdx = 0; faceIdx < faceCount; faceIdx++) {
    const faceMask = new Uint32Array([tagMaskAttr.getX(faceIdx)]);

    // Check excluded tags first (fast fail)
    let isExcluded = false;
    for (const excludedMask of excludedMasks) {
      if (hasAnyTag(faceMask, excludedMask)) {
        isExcluded = true;
        break;
      }
    }

    if (isExcluded) {
      continue;
    }

    // Check required tags (all must be present)
    let hasAllRequired = true;
    for (const requiredMask of requiredMasks) {
      if (!hasAllTags(faceMask, requiredMask)) {
        hasAllRequired = false;
        break;
      }
    }

    if (!hasAllRequired) {
      continue;
    }

    // Calculate weight from weighted tags
    let weight = 1.0;
    if (config.weightedTags) {
      for (const [tagName, tagWeight] of config.weightedTags) {
        const tagMask = autoTag.getTagMask([tagName]);
        if (hasAllTags(faceMask, tagMask)) {
          weight *= tagWeight;
        }
      }
    }

    faceIndices.push(faceIdx);
    faceWeights.push(weight);
  }

  return {
    faceIndices,
    faceWeights,
    totalFaces: faceCount,
    filteredFaces: faceIndices.length
  };
}

/**
 * Get tags for specific faces
 */
export function getFaceTags(
  geometry: any,
  autoTag: AutoTag,
  faceIndices: number | number[]
): string[][] {
  const tagAttributeName = 'tag_mask';
  const tagMaskAttr = geometry.getAttribute(tagAttributeName);
  
  if (!tagMaskAttr) {
    throw new Error(`Tag attribute "${tagAttributeName}" not found`);
  }

  const indices = Array.isArray(faceIndices) ? faceIndices : [faceIndices];
  const result: string[][] = [];

  for (const faceIdx of indices) {
    const maskValue = tagMaskAttr.getX(faceIdx);
    const mask = new Uint32Array([maskValue]);
    const tags = autoTag.getTagsFromMask(mask);
    result.push(tags);
  }

  return result;
}

/**
 * Create scatter points with tag information
 */
export function createTaggedScatterPoints(
  geometry: any,
  autoTag: AutoTag,
  positions: Float32Array,
  normals: Float32Array,
  faceIndices: number[]
): TaggedScatterPoint[] {
  const tagMaskAttr = geometry.getAttribute('tag_mask');
  const points: TaggedScatterPoint[] = [];

  for (let i = 0; i < positions.length / 3; i++) {
    const faceIdx = faceIndices[i % faceIndices.length];
    const maskValue = tagMaskAttr ? tagMaskAttr.getX(faceIdx) : 0;
    const mask = new Uint32Array([maskValue]);
    const tags = autoTag.getTagsFromMask(mask);

    points.push({
      position: [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]],
      normal: [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]],
      faceIndex: faceIdx,
      tags,
      tagMask: mask,
      weight: 1.0
    });
  }

  return points;
}

/**
 * Apply tag-based density variation to scatter
 */
export function applyTagDensityVariation(
  baseDensity: number,
  faceTags: string[],
  densityRules: Map<string, number>
): number {
  let density = baseDensity;

  for (const tag of faceTags) {
    if (densityRules.has(tag)) {
      density *= densityRules.get(tag)!;
    }
  }

  return Math.max(0, density);
}

/**
 * Combine multiple tag filters
 */
export function combineTagFilters(
  ...configs: TagScatterConfig[]
): TagScatterConfig {
  const combined: TagScatterConfig = {
    requiredTags: [],
    excludedTags: [],
    weightedTags: new Map()
  };

  for (const config of configs) {
    if (config.requiredTags) {
      combined.requiredTags = [...(combined.requiredTags || []), ...config.requiredTags];
    }
    if (config.excludedTags) {
      combined.excludedTags = [...(combined.excludedTags || []), ...config.excludedTags];
    }
    if (config.weightedTags) {
      for (const [tag, weight] of config.weightedTags) {
        const existing = combined.weightedTags!.get(tag) || 1;
        combined.weightedTags!.set(tag, existing * weight);
      }
    }
  }

  // Remove duplicates
  combined.requiredTags = [...new Set(combined.requiredTags)];
  combined.excludedTags = [...new Set(combined.excludedTags)];

  return combined;
}

/**
 * Helper: Check if mask has all tags from another mask
 */
function hasAllTags(mask: Uint32Array, requiredMask: Uint32Array): boolean {
  return (mask[0] & requiredMask[0]) === requiredMask[0];
}

/**
 * Helper: Check if mask has any tags from another mask
 */
function hasAnyTag(mask: Uint32Array, anyMask: Uint32Array): boolean {
  return (mask[0] & anyMask[0]) !== 0;
}

/**
 * Validate that geometry has required tag attributes
 */
export function validateTagGeometry(geometry: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!geometry.getAttribute('tag_mask')) {
    errors.push('Missing "tag_mask" attribute');
  }

  if (!geometry.getAttribute('position')) {
    errors.push('Missing "position" attribute');
  }

  if (!geometry.index && !geometry.attributes.position) {
    errors.push('Geometry has no vertices');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Export tag distribution statistics
 */
export function getTagDistribution(
  geometry: any,
  autoTag: AutoTag
): Map<string, { count: number; percentage: number }> {
  const tagMaskAttr = geometry.getAttribute('tag_mask');
  const faceCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  
  const tagCounts = new Map<string, number>();
  const allTags = autoTag.getAllTags();

  // Initialize counts
  for (const tag of allTags) {
    tagCounts.set(tag, 0);
  }

  // Count tags per face
  for (let i = 0; i < faceCount; i++) {
    const maskValue = tagMaskAttr.getX(i);
    const mask = new Uint32Array([maskValue]);
    const tags = autoTag.getTagsFromMask(mask);
    
    for (const tag of tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // Calculate percentages
  const distribution = new Map<string, { count: number; percentage: number }>();
  for (const [tag, count] of tagCounts) {
    distribution.set(tag, {
      count,
      percentage: faceCount > 0 ? (count / faceCount) * 100 : 0
    });
  }

  return distribution;
}

export type { TagScatterConfig, TaggedScatterPoint };
