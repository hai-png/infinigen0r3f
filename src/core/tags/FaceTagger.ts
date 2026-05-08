/**
 * Face Tagger for Infinigen R3F
 *
 * Ported from Infinigen's tagging.py — provides face-level tag assignment for
 * Three.js meshes. In the original Infinigen, face attributes on Blender meshes
 * carry semantic labels. In Three.js/R3F, this translates to tagging face groups
 * of a BufferGeometry and storing the tag map as userData on the Object3D.
 *
 * Core capabilities:
 * - Tag specific face indices on a mesh with semantic/subpart tags
 * - Auto-tag canonical surfaces (Top, Bottom, Front, Back, Left, Right) from normals
 * - Auto-tag support surfaces (faces with +Y normals)
 * - Query tagged faces by TagQuery
 * - Produce boolean masks for tagged faces (useful for material assignment)
 *
 * @module FaceTagger
 */

import {
  Object3D,
  Mesh,
  BufferGeometry,
  Vector3,
  Box3,
  Matrix3,
} from 'three';
import { Tag, TagQuery, TagSet, SubpartTag } from './TagSystem';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Key used to store the face tag map in Object3D.userData */
export const FACE_TAG_MAP_KEY = '__infinigen_face_tags__';

/** Normal threshold for classifying a face as "facing" a direction (cos of angle) */
const NORMAL_THRESHOLD = 0.5; // ~60 degrees

// ---------------------------------------------------------------------------
// FaceTagMap — internal storage structure
// ---------------------------------------------------------------------------

/**
 * Maps tag keys to sets of face indices.
 * Stored as `Map<string, Set<number>>` where the key is `Tag.toKey()`.
 */
type FaceTagMap = Map<string, Set<number>>;

// ---------------------------------------------------------------------------
// FaceTagger class
// ---------------------------------------------------------------------------

/**
 * Tags faces of Three.js meshes with semantic labels.
 *
 * In Infinigen, every mesh face can carry multiple tags (e.g., a table top face
 * might have Subpart.Top, Subpart.SupportSurface, and Subpart.TopSurface).
 * This class provides the same capability for Three.js BufferGeometry meshes.
 *
 * Tag data is stored on `object.userData.__infinigen_face_tags__` as a
 * `Map<string, Set<number>>`, mapping tag keys to sets of face indices.
 *
 * ### Canonical Surface Tagging
 * The original Infinigen auto-tags faces based on their normal direction:
 * - +Y normal → Subpart.Top / Subpart.TopSurface
 * - -Y normal → Subpart.Bottom / Subpart.BottomSurface
 * - +Z normal → Subpart.Front
 * - -Z normal → Subpart.Back
 * - -X normal → Subpart.Left
 * - +X normal → Subpart.Right
 *
 * Faces with +Y normals that are approximately horizontal are also tagged
 * as Subpart.SupportSurface.
 */
export class FaceTagger {
  // -----------------------------------------------------------------------
  // Public API — Tag assignment
  // -----------------------------------------------------------------------

  /**
   * Tag faces of a mesh with a tag.
   *
   * If `faceIndices` is not provided, ALL faces of the mesh are tagged.
   *
   * @param object - The Object3D / Mesh to tag
   * @param tag    - The tag to assign
   * @param faceIndices - Optional specific face indices to tag
   */
  tagFaces(object: Object3D, tag: Tag, faceIndices?: number[]): void {
    const tagMap = this.getTagMap(object);
    const key = tag.toKey();

    let indices: Set<number>;

    if (faceIndices) {
      indices = new Set(faceIndices);
    } else {
      // Tag all faces
      indices = this.getAllFaceIndices(object);
    }

    const existing = tagMap.get(key);
    if (existing) {
      for (const idx of indices) {
        existing.add(idx);
      }
    } else {
      tagMap.set(key, indices);
    }

    this.setTagMap(object, tagMap);
  }

  /**
   * Remove a tag from specific faces (or all faces if no indices given).
   */
  untagFaces(object: Object3D, tag: Tag, faceIndices?: number[]): void {
    const tagMap = this.getTagMap(object);
    const key = tag.toKey();

    const existing = tagMap.get(key);
    if (!existing) return;

    if (faceIndices) {
      for (const idx of faceIndices) {
        existing.delete(idx);
      }
      if (existing.size === 0) {
        tagMap.delete(key);
      }
    } else {
      tagMap.delete(key);
    }

    this.setTagMap(object, tagMap);
  }

  // -----------------------------------------------------------------------
  // Public API — Auto-tagging
  // -----------------------------------------------------------------------

  /**
   * Auto-tag canonical surfaces based on face normal orientation.
   *
   * Tags faces based on their world-space normal direction:
   * - +Y → Subpart.Top, Subpart.TopSurface
   * - -Y → Subpart.Bottom, Subpart.BottomSurface
   * - +Z → Subpart.Front
   * - -Z → Subpart.Back
   * - -X → Subpart.Left
   * - +X → Subpart.Right
   *
   * Also tags approximately vertical faces as Subpart.Side.
   *
   * @param object - The Object3D to auto-tag
   * @param useWorldNormals - If true, transform normals to world space (default: true)
   */
  tagCanonicalSurfaces(object: Object3D, useWorldNormals: boolean = true): void {
    const mesh = this.asMesh(object);
    if (!mesh) return;

    const geometry = mesh.geometry;
    const faceNormals = this.computeFaceNormals(geometry, mesh, useWorldNormals);

    const topFaces: number[] = [];
    const bottomFaces: number[] = [];
    const frontFaces: number[] = [];
    const backFaces: number[] = [];
    const leftFaces: number[] = [];
    const rightFaces: number[] = [];
    const sideFaces: number[] = [];

    for (let i = 0; i < faceNormals.length; i++) {
      const n = faceNormals[i];
      const absY = Math.abs(n.y);
      const absX = Math.abs(n.x);
      const absZ = Math.abs(n.z);

      if (n.y > NORMAL_THRESHOLD) {
        topFaces.push(i);
      } else if (n.y < -NORMAL_THRESHOLD) {
        bottomFaces.push(i);
      }

      if (n.z > NORMAL_THRESHOLD) {
        frontFaces.push(i);
      } else if (n.z < -NORMAL_THRESHOLD) {
        backFaces.push(i);
      }

      if (n.x < -NORMAL_THRESHOLD) {
        leftFaces.push(i);
      } else if (n.x > NORMAL_THRESHOLD) {
        rightFaces.push(i);
      }

      // Side: approximately vertical faces
      if (absY < 0.3 && (absX > NORMAL_THRESHOLD || absZ > NORMAL_THRESHOLD)) {
        sideFaces.push(i);
      }
    }

    // Apply tags
    if (topFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Top), topFaces);
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.TopSurface), topFaces);
    }
    if (bottomFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Bottom), bottomFaces);
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.BottomSurface), bottomFaces);
    }
    if (frontFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Front), frontFaces);
    }
    if (backFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Back), backFaces);
    }
    if (leftFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Left), leftFaces);
    }
    if (rightFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Right), rightFaces);
    }
    if (sideFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.Side), sideFaces);
    }

    // Tag support surfaces (upward-facing horizontal surfaces)
    this.tagSupportSurfaces(object);
  }

  /**
   * Tag faces with +Y normals as "support surface".
   *
   * A support surface is any approximately horizontal face with an upward
   * (+Y) normal — the kind of surface objects can be placed on.
   * Uses a stricter threshold than canonical Top tagging.
   *
   * @param object - The Object3D to tag
   */
  tagSupportSurfaces(object: Object3D): void {
    const mesh = this.asMesh(object);
    if (!mesh) return;

    const geometry = mesh.geometry;
    const faceNormals = this.computeFaceNormals(geometry, mesh, true);

    const supportFaces: number[] = [];
    for (let i = 0; i < faceNormals.length; i++) {
      const n = faceNormals[i];
      // Stricter threshold: more upward-facing (cos > 0.7 ≈ 45 degrees)
      if (n.y > 0.7) {
        supportFaces.push(i);
      }
    }

    if (supportFaces.length > 0) {
      this.tagFaces(object, Tag.fromSubpart(SubpartTag.SupportSurface), supportFaces);
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Query
  // -----------------------------------------------------------------------

  /**
   * Get all face indices matching a tag query.
   *
   * @param object - The Object3D to query
   * @param query  - The tag query
   * @returns Array of face indices that match the query
   */
  getTaggedFaces(object: Object3D, query: TagQuery): number[] {
    const tagMap = this.getTagMap(object);

    // Collect faces that have all include tags
    let candidateIndices: Set<number> | null = null;

    for (const includeTag of query.include) {
      const key = includeTag.toKey();
      const faces = tagMap.get(key);
      if (!faces || faces.size === 0) {
        return []; // Required tag not present
      }

      if (candidateIndices === null) {
        candidateIndices = new Set(faces);
      } else {
        // Intersection: only faces that have ALL include tags
        const intersection = new Set<number>();
        for (const idx of candidateIndices) {
          if (faces.has(idx)) {
            intersection.add(idx);
          }
        }
        candidateIndices = intersection;
      }
    }

    // If no include tags, start with all faces
    if (candidateIndices === null) {
      candidateIndices = this.getAllFaceIndices(object);
    }

    // Remove faces that have any exclude tag
    for (const excludeTag of query.exclude) {
      const key = excludeTag.toKey();
      const excludedFaces = tagMap.get(key);
      if (excludedFaces) {
        for (const idx of excludedFaces) {
          candidateIndices.delete(idx);
        }
      }
    }

    return Array.from(candidateIndices).sort((a, b) => a - b);
  }

  /**
   * Get a boolean mask for tagged faces.
   *
   * Useful for material assignment: index i is true if face i matches the query.
   *
   * @param object - The Object3D to query
   * @param query  - The tag query
   * @returns Boolean array indexed by face index
   */
  getTaggedFaceMask(object: Object3D, query: TagQuery): boolean[] {
    const totalFaces = this.getFaceCount(object);
    const mask = new Array<boolean>(totalFaces).fill(false);
    const taggedFaces = this.getTaggedFaces(object, query);

    for (const idx of taggedFaces) {
      if (idx >= 0 && idx < totalFaces) {
        mask[idx] = true;
      }
    }

    return mask;
  }

  /**
   * Get all tags on a specific face.
   *
   * @param object    - The Object3D to query
   * @param faceIndex - The face index
   * @returns TagSet of all tags on this face
   */
  getFaceTags(object: Object3D, faceIndex: number): TagSet {
    const tagMap = this.getTagMap(object);
    const result = new TagSet();

    for (const [key, faces] of tagMap) {
      if (faces.has(faceIndex)) {
        // Reconstruct tag from key
        const tag = this.keyToTag(key);
        if (tag) {
          result.add(tag);
        }
      }
    }

    return result;
  }

  /**
   * Get the complete tag map for an object.
   * Returns a copy to prevent accidental mutation.
   */
  getAllTags(object: Object3D): Map<string, Set<number>> {
    const tagMap = this.getTagMap(object);
    const copy = new Map<string, Set<number>>();
    for (const [key, faces] of tagMap) {
      copy.set(key, new Set(faces));
    }
    return copy;
  }

  /**
   * Clear all face tags from an object.
   */
  clearTags(object: Object3D): void {
    if (object.userData) {
      delete object.userData[FACE_TAG_MAP_KEY];
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers — Tag map storage
  // -----------------------------------------------------------------------

  /**
   * Get the face tag map from Object3D.userData.
   * Creates a new map if one doesn't exist.
   */
  private getTagMap(object: Object3D): FaceTagMap {
    if (!object.userData) {
      object.userData = {};
    }

    if (!object.userData[FACE_TAG_MAP_KEY]) {
      object.userData[FACE_TAG_MAP_KEY] = new Map<string, Set<number>>();
    }

    return object.userData[FACE_TAG_MAP_KEY] as FaceTagMap;
  }

  /**
   * Set the face tag map on Object3D.userData.
   */
  private setTagMap(object: Object3D, map: FaceTagMap): void {
    if (!object.userData) {
      object.userData = {};
    }
    object.userData[FACE_TAG_MAP_KEY] = map;
  }

  // -----------------------------------------------------------------------
  // Private helpers — Geometry utilities
  // -----------------------------------------------------------------------

  /**
   * Get all face indices for an object.
   * For non-indexed geometry, each triangle is a face.
   * For indexed geometry, faces are defined by index groups.
   */
  private getAllFaceIndices(object: Object3D): Set<number> {
    const count = this.getFaceCount(object);
    const indices = new Set<number>();
    for (let i = 0; i < count; i++) {
      indices.add(i);
    }
    return indices;
  }

  /**
   * Get the number of faces (triangles) in the object's geometry.
   */
  private getFaceCount(object: Object3D): number {
    const mesh = this.asMesh(object);
    if (!mesh) return 0;

    const geometry = mesh.geometry;
    if (!geometry) return 0;

    if (geometry.index) {
      return geometry.index.count / 3;
    } else {
      const posAttr = geometry.getAttribute('position');
      return posAttr ? posAttr.count / 3 : 0;
    }
  }

  /**
   * Try to cast Object3D to Mesh.
   * Returns null if the object is not a Mesh.
   */
  private asMesh(object: Object3D): Mesh | null {
    if (object instanceof Mesh) {
      return object;
    }

    // Try to find a Mesh child
    let found: Mesh | null = null;
    object.traverse((child) => {
      if (!found && child instanceof Mesh) {
        found = child;
      }
    });

    return found;
  }

  /**
   * Compute per-face normals for a geometry.
   *
   * @param geometry - The BufferGeometry
   * @param mesh     - The Mesh (used for world transform)
   * @param useWorld - Whether to transform normals to world space
   * @returns Array of normalized face normals
   */
  private computeFaceNormals(
    geometry: BufferGeometry,
    mesh: Mesh,
    useWorld: boolean
  ): Vector3[] {
    const normals: Vector3[] = [];
    const positionAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    if (!positionAttr) return normals;

    // Get the world rotation for transforming normals
    const worldMatrix = mesh.matrixWorld;
    const normalMatrix = useWorld
      ? new Matrix3().getNormalMatrix(worldMatrix)
      : null;

    const v0 = new Vector3();
    const v1 = new Vector3();
    const v2 = new Vector3();
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const faceNormal = new Vector3();

    const index = geometry.index;
    const faceCount = index ? index.count / 3 : positionAttr.count / 3;

    for (let f = 0; f < faceCount; f++) {
      let i0: number, i1: number, i2: number;

      if (index) {
        i0 = index.getX(f * 3);
        i1 = index.getX(f * 3 + 1);
        i2 = index.getX(f * 3 + 2);
      } else {
        i0 = f * 3;
        i1 = f * 3 + 1;
        i2 = f * 3 + 2;
      }

      if (normalAttr) {
        // Use existing normals — average the three vertex normals
        faceNormal.set(0, 0, 0);
        faceNormal.x += normalAttr.getX(i0) + normalAttr.getX(i1) + normalAttr.getX(i2);
        faceNormal.y += normalAttr.getY(i0) + normalAttr.getY(i1) + normalAttr.getY(i2);
        faceNormal.z += normalAttr.getZ(i0) + normalAttr.getZ(i1) + normalAttr.getZ(i2);
        faceNormal.normalize();
      } else {
        // Compute from positions
        v0.fromBufferAttribute(positionAttr, i0);
        v1.fromBufferAttribute(positionAttr, i1);
        v2.fromBufferAttribute(positionAttr, i2);

        edge1.subVectors(v1, v0);
        edge2.subVectors(v2, v0);
        faceNormal.crossVectors(edge1, edge2).normalize();
      }

      // Transform to world space if requested
      if (normalMatrix) {
        faceNormal.applyMatrix3(normalMatrix).normalize();
      }

      normals.push(faceNormal.clone());
    }

    return normals;
  }

  /**
   * Reconstruct a Tag from a storage key.
   * Key format: "type:value" or "-type:value" (negated)
   */
  private keyToTag(key: string): Tag | null {
    const negated = key.startsWith('-');
    const stripped = negated ? key.substring(1) : key;

    const colonIdx = stripped.indexOf(':');
    if (colonIdx === -1) return null;

    const type = stripped.substring(0, colonIdx) as Tag['type'];
    const value = stripped.substring(colonIdx + 1);

    return new Tag(value, type, negated);
  }
}
