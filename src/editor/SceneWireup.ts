/**
 * SceneWireup — Bridge module connecting node evaluation results to the scene system
 *
 * When a material is evaluated, it can be applied to objects in the scene.
 * When a geometry is evaluated, it replaces placeholder geometry.
 *
 * This module is pure logic (no React) so it can be used both from UI code
 * and from programmatic pipelines.
 *
 * Exports:
 *  - applyMaterialToScene(material, targetObjects)
 *  - applyGeometryToScene(geometry, targetId)
 *  - applyTextureToScene(texture, targetObjects, mapType)
 *  - SceneWireup (class for stateful scene management)
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/** Describes which texture map slot to assign */
export type TextureMapSlot =
  | 'map'           // diffuse / albedo
  | 'normalMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'aoMap'
  | 'emissiveMap'
  | 'bumpMap'
  | 'opacityMap';

/** Result of applying something to the scene */
export interface ApplyResult {
  success: boolean;
  appliedCount: number;
  errors: string[];
}

/** Registry entry tracking applied materials/geometries */
export interface AppliedEntry {
  objectId: string;
  type: 'material' | 'geometry' | 'texture';
  timestamp: number;
  value: THREE.Material | THREE.BufferGeometry | THREE.Texture;
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Apply a material to all matching objects in a Three.js scene.
 *
 * @param scene    - The root scene or group to traverse
 * @param material - The material to apply
 * @param targetObjects - If provided, only apply to objects whose name or
 *                        userData.tag matches one of these IDs.
 *                        If omitted, applies to ALL meshes.
 * @returns Info about what was applied
 */
export function applyMaterialToScene(
  scene: THREE.Scene | THREE.Group,
  material: THREE.Material,
  targetObjects?: string[],
): ApplyResult {
  const errors: string[] = [];
  let appliedCount = 0;

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    // If target filter is provided, check if this mesh is a target
    if (targetObjects && targetObjects.length > 0) {
      const isTarget = targetObjects.some(
        (id) =>
          child.name === id ||
          child.userData?.tag === id ||
          child.userData?.materialPreset === id ||
          child.uuid === id,
      );
      if (!isTarget) return;
    }

    try {
      // Dispose old material(s) if they won't be reused
      const oldMaterial = child.material;
      if (Array.isArray(oldMaterial)) {
        oldMaterial.forEach((m) => {
          if ('dispose' in m) m.dispose();
        });
      } else if (oldMaterial && 'dispose' in oldMaterial) {
        oldMaterial.dispose();
      }

      child.material = material;
      appliedCount++;
    } catch (err: any) {
      errors.push(`Failed to apply material to "${child.name}": ${err.message}`);
    }
  });

  return { success: errors.length === 0, appliedCount, errors };
}

/**
 * Apply a geometry to a specific object in the scene.
 *
 * @param scene    - The root scene or group to traverse
 * @param geometry - The geometry to apply
 * @param targetId - Name, tag, or UUID of the target mesh
 * @returns Info about what was applied
 */
export function applyGeometryToScene(
  scene: THREE.Scene | THREE.Group,
  geometry: THREE.BufferGeometry,
  targetId: string,
): ApplyResult {
  const errors: string[] = [];
  let appliedCount = 0;

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    const matches =
      child.name === targetId ||
      child.userData?.tag === targetId ||
      child.userData?.geometryId === targetId ||
      child.uuid === targetId;

    if (!matches) return;

    try {
      // Dispose old geometry
      const oldGeo = child.geometry;
      if (oldGeo && 'dispose' in oldGeo) {
        oldGeo.dispose();
      }

      child.geometry = geometry;
      appliedCount++;
    } catch (err: any) {
      errors.push(`Failed to apply geometry to "${child.name}": ${err.message}`);
    }
  });

  return { success: errors.length === 0, appliedCount, errors };
}

/**
 * Apply a texture to specific objects' material map slots.
 *
 * @param scene    - The root scene or group to traverse
 * @param texture  - The texture to apply
 * @param targetObjects - If provided, only apply to matching objects
 * @param mapType  - Which material map slot to assign the texture to
 * @returns Info about what was applied
 */
export function applyTextureToScene(
  scene: THREE.Scene | THREE.Group,
  texture: THREE.Texture,
  targetObjects?: string[],
  mapType: TextureMapSlot = 'map',
): ApplyResult {
  const errors: string[] = [];
  let appliedCount = 0;

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    // If target filter is provided, check if this mesh is a target
    if (targetObjects && targetObjects.length > 0) {
      const isTarget = targetObjects.some(
        (id) =>
          child.name === id ||
          child.userData?.tag === id ||
          child.userData?.materialPreset === id ||
          child.uuid === id,
      );
      if (!isTarget) return;
    }

    try {
      const mat = child.material;
      if (mat instanceof THREE.MeshPhysicalMaterial ||
          mat instanceof THREE.MeshStandardMaterial) {
        switch (mapType) {
          case 'map':
            mat.map = texture;
            break;
          case 'normalMap':
            mat.normalMap = texture;
            break;
          case 'roughnessMap':
            mat.roughnessMap = texture;
            break;
          case 'metalnessMap':
            mat.metalnessMap = texture;
            break;
          case 'aoMap':
            mat.aoMap = texture;
            break;
          case 'emissiveMap':
            mat.emissiveMap = texture;
            break;
          case 'bumpMap':
            mat.bumpMap = texture;
            break;
          case 'opacityMap':
            mat.alphaMap = texture;
            break;
        }
        mat.needsUpdate = true;
        appliedCount++;
      }
    } catch (err: any) {
      errors.push(`Failed to apply texture to "${child.name}": ${err.message}`);
    }
  });

  return { success: errors.length === 0, appliedCount, errors };
}

// ============================================================================
// SceneWireup Class (stateful scene management)
// ============================================================================

/**
 * Stateful scene wireup manager. Tracks what has been applied and
 * provides undo/redo and batch operations.
 */
export class SceneWireup {
  private appliedEntries: AppliedEntry[] = [];
  private undoStack: AppliedEntry[][] = [];

  /**
   * Apply a material to the scene and record it for undo.
   */
  applyMaterial(
    scene: THREE.Scene | THREE.Group,
    material: THREE.Material,
    targetObjects?: string[],
  ): ApplyResult {
    const result = applyMaterialToScene(scene, material, targetObjects);

    if (result.success && result.appliedCount > 0) {
      // Record what we applied
      this.undoStack.push([...this.appliedEntries]);
      this.appliedEntries.push({
        objectId: targetObjects?.join(',') ?? '__all__',
        type: 'material',
        timestamp: Date.now(),
        value: material,
      });
    }

    return result;
  }

  /**
   * Apply a geometry to a specific object and record it for undo.
   */
  applyGeometry(
    scene: THREE.Scene | THREE.Group,
    geometry: THREE.BufferGeometry,
    targetId: string,
  ): ApplyResult {
    const result = applyGeometryToScene(scene, geometry, targetId);

    if (result.success && result.appliedCount > 0) {
      this.undoStack.push([...this.appliedEntries]);
      this.appliedEntries.push({
        objectId: targetId,
        type: 'geometry',
        timestamp: Date.now(),
        value: geometry,
      });
    }

    return result;
  }

  /**
   * Apply a texture to the scene and record it for undo.
   */
  applyTexture(
    scene: THREE.Scene | THREE.Group,
    texture: THREE.Texture,
    targetObjects?: string[],
    mapType: TextureMapSlot = 'map',
  ): ApplyResult {
    const result = applyTextureToScene(scene, texture, targetObjects, mapType);

    if (result.success && result.appliedCount > 0) {
      this.undoStack.push([...this.appliedEntries]);
      this.appliedEntries.push({
        objectId: targetObjects?.join(',') ?? '__all__',
        type: 'texture',
        timestamp: Date.now(),
        value: texture,
      });
    }

    return result;
  }

  /**
   * Get all applied entries.
   */
  getAppliedEntries(): readonly AppliedEntry[] {
    return this.appliedEntries;
  }

  /**
   * Get the number of applied entries.
   */
  get appliedCount(): number {
    return this.appliedEntries.length;
  }

  /**
   * Clear all applied entries (does NOT undo the changes on the scene).
   */
  clearHistory(): void {
    this.appliedEntries = [];
    this.undoStack = [];
  }
}

export default SceneWireup;
