/**
 * InstanceExpander — InstancedMesh Expansion Utility
 *
 * Since three-gpu-pathtracer does not support InstancedMesh, this utility
 * expands InstancedMesh to regular Mesh objects with individual matrixWorld
 * transforms. The expansion result is cached and can be toggled when
 * switching between rasterize and pathtrace modes.
 *
 * Phase 0 — P0.3: InstancedMesh Expansion Utility
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of expanding an InstancedMesh */
export interface ExpansionResult {
  /** The group containing individual mesh clones */
  group: THREE.Group;
  /** Original InstancedMesh that was expanded */
  original: THREE.InstancedMesh;
  /** Individual mesh clones (one per instance) */
  clones: THREE.Mesh[];
  /** Whether this expansion is currently active */
  active: boolean;
}

/** Cache key for expansion results */
type CacheKey = string;

// ---------------------------------------------------------------------------
// InstanceExpander
// ---------------------------------------------------------------------------

/**
 * Utility class that expands InstancedMesh to regular meshes for
 * path-traced rendering and caches the results.
 */
export class InstanceExpander {
  private cache: Map<CacheKey, ExpansionResult> = new Map();
  private keyCounter = 0;

  /**
   * Expand an InstancedMesh into individual Mesh objects.
   * The result is cached so re-expansion is avoided.
   *
   * @param instancedMesh - The InstancedMesh to expand
   * @param key - Optional cache key (auto-generated if not provided)
   * @returns The expansion result
   */
  expand(instancedMesh: THREE.InstancedMesh, key?: string): ExpansionResult {
    const cacheKey = key ?? `inst_${instancedMesh.uuid}_${this.keyCounter++}`;

    // Return cached result if available
    const existing = this.cache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const group = new THREE.Group();
    group.name = `expanded_${instancedMesh.name || 'instanced'}`;
    group.userData._isExpandedGroup = true;
    group.userData._originalUUID = instancedMesh.uuid;
    group.userData._cacheKey = cacheKey;

    const geometry = instancedMesh.geometry;
    const material = instancedMesh.material;
    const count = instancedMesh.count;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const clones: THREE.Mesh[] = [];

    for (let i = 0; i < count; i++) {
      instancedMesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);

      const clone = new THREE.Mesh(geometry, material);
      clone.position.copy(position);
      clone.quaternion.copy(quaternion);
      clone.scale.copy(scale);
      clone.updateMatrixWorld(true);
      clone.userData._isExpandedInstance = true;
      clone.userData._instanceIndex = i;
      clone.castShadow = instancedMesh.castShadow;
      clone.receiveShadow = instancedMesh.receiveShadow;

      // Copy userData from the instanced mesh
      if (instancedMesh.userData) {
        Object.assign(clone.userData, instancedMesh.userData);
      }

      group.add(clone);
      clones.push(clone);
    }

    // Copy world transform from the instanced mesh
    group.position.copy(instancedMesh.position);
    group.quaternion.copy(instancedMesh.quaternion);
    group.scale.copy(instancedMesh.scale);
    group.updateMatrixWorld(true);

    const result: ExpansionResult = {
      group,
      original: instancedMesh,
      clones,
      active: true,
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Swap scene content between InstancedMesh and expanded meshes.
   * Call this when switching rendering modes.
   *
   * @param parent - The parent object containing the InstancedMesh
   * @param useExpanded - Whether to use expanded meshes (true for pathtrace)
   * @returns The number of swaps performed
   */
  swapInScene(parent: THREE.Object3D, useExpanded: boolean): number {
    let swapCount = 0;

    const instancedMeshes: THREE.InstancedMesh[] = [];
    parent.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) {
        instancedMeshes.push(child);
      }
    });

    for (const im of instancedMeshes) {
      const cacheKey = this.findCacheKey(im);
      if (!cacheKey) continue;

      const result = this.cache.get(cacheKey);
      if (!result) continue;

      if (useExpanded && !result.active) {
        // Replace InstancedMesh with expanded group
        const parentObj = im.parent;
        if (parentObj) {
          const index = parentObj.children.indexOf(im);
          if (index !== -1) {
            parentObj.remove(im);
            parentObj.add(result.group);
            result.active = true;
            swapCount++;
          }
        }
      } else if (!useExpanded && result.active) {
        // Replace expanded group with original InstancedMesh
        const parentObj = result.group.parent;
        if (parentObj) {
          const index = parentObj.children.indexOf(result.group);
          if (index !== -1) {
            parentObj.remove(result.group);
            parentObj.add(result.original);
            result.active = false;
            swapCount++;
          }
        }
      }
    }

    return swapCount;
  }

  /**
   * Expand all InstancedMesh objects in a scene hierarchy.
   *
   * @param root - The root object to scan for InstancedMesh
   * @returns Array of expansion results
   */
  expandAll(root: THREE.Object3D): ExpansionResult[] {
    const results: ExpansionResult[] = [];
    const instancedMeshes: THREE.InstancedMesh[] = [];

    root.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) {
        instancedMeshes.push(child);
      }
    });

    for (const im of instancedMeshes) {
      const result = this.expand(im);
      results.push(result);
    }

    return results;
  }

  /**
   * Swap all InstancedMesh in a scene for path-traced rendering.
   *
   * @param root - The root object to process
   * @param useExpanded - Whether to use expanded meshes
   */
  swapAllInScene(root: THREE.Object3D, useExpanded: boolean): void {
    // First expand any InstancedMesh that haven't been expanded yet
    if (useExpanded) {
      this.expandAll(root);
    }
    this.swapInScene(root, useExpanded);
  }

  /**
   * Find the cache key for a given InstancedMesh.
   */
  private findCacheKey(mesh: THREE.InstancedMesh): CacheKey | null {
    for (const [key, result] of this.cache.entries()) {
      if (result.original === mesh || result.original.uuid === mesh.uuid) {
        return key;
      }
    }
    return null;
  }

  /**
   * Get a cached expansion result by key.
   */
  getResult(key: CacheKey): ExpansionResult | undefined {
    return this.cache.get(key);
  }

  /**
   * Invalidate the cache for a specific key, forcing re-expansion.
   */
  invalidate(key: CacheKey): void {
    const result = this.cache.get(key);
    if (result) {
      this.disposeResult(result);
      this.cache.delete(key);
    }
  }

  /**
   * Invalidate all cached results.
   */
  invalidateAll(): void {
    for (const result of this.cache.values()) {
      this.disposeResult(result);
    }
    this.cache.clear();
  }

  /**
   * Dispose resources for a single expansion result.
   */
  private disposeResult(result: ExpansionResult): void {
    // Don't dispose geometry/material as they're shared with the original
    for (const clone of result.clones) {
      clone.geometry = undefined as any;
      clone.material = undefined as any;
    }
    result.group.clear();
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.invalidateAll();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Global instance expander singleton */
export const globalInstanceExpander = new InstanceExpander();

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Recursively traverse a scene and expand all InstancedMesh objects.
 * Returns a new group with InstancedMesh replaced by regular meshes.
 * Does NOT modify the original scene.
 *
 * @param root - The scene root to clone and expand
 * @returns A new group with all InstancedMesh expanded
 */
export function expandSceneForPathTracing(root: THREE.Object3D): THREE.Group {
  const result = root.clone(true) as THREE.Group;
  const expander = new InstanceExpander();
  expander.expandAll(result);
  expander.swapAllInScene(result, true);
  return result;
}

/**
 * Check if an object contains any InstancedMesh.
 */
export function hasInstancedMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) {
      found = true;
    }
  });
  return found;
}
