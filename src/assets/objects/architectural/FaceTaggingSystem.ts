/**
 * Face Tagging System — Architecture Gap: Solidifier Face Tagging
 *
 * Implements face tagging matching Infinigen's solidifier face tagging system.
 * Provides semantic tags for mesh faces (Ceiling, Floor, Wall, Interior,
 * Visible, etc.) to enable downstream systems (lighting, placement, rendering)
 * to reason about surface semantics.
 *
 * Key components:
 * - FaceTag enum with bitflag constants for efficient storage
 * - FaceTagSet for compact representation of tag collections
 * - TaggedGeometry for associating tags with THREE.BufferGeometry faces
 * - Auto-tagging functions for room geometry and architectural elements
 *
 * @module architectural
 */

import * as THREE from 'three';
import { RoomDefinition } from './CSGRoomBuilder';

// ============================================================================
// Face Tag Enumeration & Bitflags
// ============================================================================

/**
 * Semantic tags for mesh faces, matching Infinigen's solidifier tagging.
 * Each tag is a power-of-2 for use as a bitflag in FaceTagSet.
 */
export enum FaceTag {
  /** Upward-facing surface at room top (ceiling plane) */
  CEILING = 1,
  /** Downward-facing surface at room bottom (floor plane) */
  FLOOR = 2,
  /** Vertical surface (generic wall) */
  WALL = 4,
  /** Wall shared between two rooms (interior partition) */
  WALL_INTERIOR = 8,
  /** Wall on the exterior of the building */
  WALL_EXTERIOR = 16,
  /** Surface visible from inside the room */
  VISIBLE = 32,
  /** Horizontal surface that can support objects */
  SUPPORT_SURFACE = 64,
  /** Surface surrounding an opening (window/door frame) */
  OPENING = 128,
  /** Structural element (column, beam, load-bearing) */
  STRUCTURAL = 256,
}

/**
 * Human-readable names for each face tag.
 */
export const FACE_TAG_NAMES: Map<FaceTag, string> = new Map([
  [FaceTag.CEILING, 'Ceiling'],
  [FaceTag.FLOOR, 'Floor'],
  [FaceTag.WALL, 'Wall'],
  [FaceTag.WALL_INTERIOR, 'WallInterior'],
  [FaceTag.WALL_EXTERIOR, 'WallExterior'],
  [FaceTag.VISIBLE, 'Visible'],
  [FaceTag.SUPPORT_SURFACE, 'SupportSurface'],
  [FaceTag.OPENING, 'Opening'],
  [FaceTag.STRUCTURAL, 'Structural'],
]);

/**
 * All valid FaceTag values for iteration.
 */
export const ALL_FACE_TAGS: FaceTag[] = [
  FaceTag.CEILING,
  FaceTag.FLOOR,
  FaceTag.WALL,
  FaceTag.WALL_INTERIOR,
  FaceTag.WALL_EXTERIOR,
  FaceTag.VISIBLE,
  FaceTag.SUPPORT_SURFACE,
  FaceTag.OPENING,
  FaceTag.STRUCTURAL,
];

// ============================================================================
// FaceTagSet — Efficient Tag Collection using Bitflags
// ============================================================================

/**
 * Efficient set of face tags stored as a bitfield.
 * Supports fast membership testing, intersection, and bulk operations.
 *
 * Each FaceTag occupies one bit in the internal `tags` number.
 * This allows O(1) add/remove/has operations and compact storage.
 *
 * @example
 * ```typescript
 * const tags = new FaceTagSet();
 * tags.add(FaceTag.FLOOR);
 * tags.add(FaceTag.SUPPORT_SURFACE);
 * tags.has(FaceTag.FLOOR); // true
 * tags.has(FaceTag.CEILING); // false
 * tags.toArray(); // [FaceTag.FLOOR, FaceTag.SUPPORT_SURFACE]
 * ```
 */
export class FaceTagSet {
  /** Internal bitfield storing the set of tags */
  public tags: number;

  constructor(initialTags: number = 0) {
    this.tags = initialTags;
  }

  /**
   * Check if this set contains a specific tag.
   */
  has(tag: FaceTag): boolean {
    return (this.tags & tag) !== 0;
  }

  /**
   * Add a tag to this set.
   */
  add(tag: FaceTag): void {
    this.tags |= tag;
  }

  /**
   * Remove a tag from this set.
   */
  remove(tag: FaceTag): void {
    this.tags &= ~tag;
  }

  /**
   * Check if this set has any tags in common with another set.
   */
  intersects(other: FaceTagSet): boolean {
    return (this.tags & other.tags) !== 0;
  }

  /**
   * Check if this set contains all tags from another set.
   */
  containsAll(other: FaceTagSet): boolean {
    return (this.tags & other.tags) === other.tags;
  }

  /**
   * Compute the union of this set with another (returns new set).
   */
  union(other: FaceTagSet): FaceTagSet {
    return new FaceTagSet(this.tags | other.tags);
  }

  /**
   * Compute the intersection of this set with another (returns new set).
   */
  intersection(other: FaceTagSet): FaceTagSet {
    return new FaceTagSet(this.tags & other.tags);
  }

  /**
   * Compute the difference of this set minus another (returns new set).
   */
  difference(other: FaceTagSet): FaceTagSet {
    return new FaceTagSet(this.tags & ~other.tags);
  }

  /**
   * Convert this set to an array of FaceTag values.
   */
  toArray(): FaceTag[] {
    const result: FaceTag[] = [];
    for (const tag of ALL_FACE_TAGS) {
      if (this.has(tag)) {
        result.push(tag);
      }
    }
    return result;
  }

  /**
   * Check if this set is empty.
   */
  isEmpty(): boolean {
    return this.tags === 0;
  }

  /**
   * Clear all tags.
   */
  clear(): void {
    this.tags = 0;
  }

  /**
   * Get the number of tags in this set.
   */
  get size(): number {
    let count = 0;
    let bits = this.tags;
    while (bits) {
      count += bits & 1;
      bits >>>= 1;
    }
    return count;
  }

  /**
   * Create a FaceTagSet from an array of FaceTag values.
   */
  static fromArray(tags: FaceTag[]): FaceTagSet {
    const set = new FaceTagSet();
    for (const tag of tags) {
      set.add(tag);
    }
    return set;
  }

  /**
   * Get a human-readable string representation.
   */
  toString(): string {
    const names = this.toArray().map(t => FACE_TAG_NAMES.get(t) ?? `Unknown(${t})`);
    return `FaceTagSet[${names.join(', ')}]`;
  }

  /**
   * Clone this set.
   */
  clone(): FaceTagSet {
    return new FaceTagSet(this.tags);
  }
}

// ============================================================================
// TaggedGeometry — Geometry with Per-Face Tags
// ============================================================================

/**
 * A THREE.BufferGeometry with per-face semantic tags.
 *
 * Stores one FaceTagSet per face (triangle) in the geometry.
 * Provides methods to query faces and vertices by tag, and to
 * write/read tags as named attributes on the BufferGeometry.
 *
 * The tag data is stored separately from the geometry and can be
 * written as a custom attribute (`faceTag`) for use in shaders
 * or downstream processing.
 */
export class TaggedGeometry {
  /** The underlying BufferGeometry */
  public geometry: THREE.BufferGeometry;
  /** Per-face tag sets (one per triangle) */
  public faceTags: FaceTagSet[];

  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry;
    const faceCount = this.getFaceCount();
    this.faceTags = new Array(faceCount);
    for (let i = 0; i < faceCount; i++) {
      this.faceTags[i] = new FaceTagSet();
    }
  }

  /**
   * Get the number of faces (triangles) in the geometry.
   */
  private getFaceCount(): number {
    const index = this.geometry.getIndex();
    if (index) {
      return index.count / 3;
    }
    const position = this.geometry.getAttribute('position');
    if (position) {
      return position.count / 3;
    }
    return 0;
  }

  /**
   * Get all face indices that have a specific tag.
   * @param tag - The tag to search for
   * @returns Array of face indices (triangle indices) with this tag
   */
  getFacesByTag(tag: FaceTag): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.faceTags.length; i++) {
      if (this.faceTags[i].has(tag)) {
        result.push(i);
      }
    }
    return result;
  }

  /**
   * Get all vertex indices that belong to faces with a specific tag.
   * @param tag - The tag to search for
   * @returns Set of vertex indices
   */
  getVerticesByTag(tag: FaceTag): Set<number> {
    const vertices = new Set<number>();
    const index = this.geometry.getIndex();

    for (let faceIdx = 0; faceIdx < this.faceTags.length; faceIdx++) {
      if (!this.faceTags[faceIdx].has(tag)) continue;

      if (index) {
        const baseIdx = faceIdx * 3;
        vertices.add(index.getX(baseIdx));
        vertices.add(index.getX(baseIdx + 1));
        vertices.add(index.getX(baseIdx + 2));
      } else {
        const baseIdx = faceIdx * 3;
        vertices.add(baseIdx);
        vertices.add(baseIdx + 1);
        vertices.add(baseIdx + 2);
      }
    }

    return vertices;
  }

  /**
   * Set a tag on a specific face.
   * @param faceIndex - The triangle index
   * @param tag - The tag to add
   */
  setTag(faceIndex: number, tag: FaceTag): void {
    if (faceIndex >= 0 && faceIndex < this.faceTags.length) {
      this.faceTags[faceIndex].add(tag);
    }
  }

  /**
   * Remove a tag from a specific face.
   * @param faceIndex - The triangle index
   * @param tag - The tag to remove
   */
  removeTag(faceIndex: number, tag: FaceTag): void {
    if (faceIndex >= 0 && faceIndex < this.faceTags.length) {
      this.faceTags[faceIndex].remove(tag);
    }
  }

  /**
   * Set a tag on a range of faces.
   * @param startFace - Start face index (inclusive)
   * @param endFace - End face index (exclusive)
   * @param tag - The tag to add
   */
  setTagRange(startFace: number, endFace: number, tag: FaceTag): void {
    for (let i = startFace; i < endFace && i < this.faceTags.length; i++) {
      this.faceTags[i].add(tag);
    }
  }

  /**
   * Write the face tags as a named attribute on the BufferGeometry.
   *
   * Creates a `faceTag` attribute (Float32) where each vertex gets the
   * tag bitfield value of its face. For indexed geometries, vertices
   * shared between faces with different tags get the union of all tags.
   *
   * Also creates a `faceTagPerFace` attribute (Float32) with one value
   * per triangle for direct face-level access.
   */
  applyTagsToGeometry(): void {
    const position = this.geometry.getAttribute('position');
    if (!position) return;

    // Per-vertex attribute: each vertex gets the union of tags from all faces it belongs to
    const vertexTags = new Float32Array(position.count);
    const index = this.geometry.getIndex();

    if (index) {
      for (let faceIdx = 0; faceIdx < this.faceTags.length; faceIdx++) {
        const baseIdx = faceIdx * 3;
        const i0 = index.getX(baseIdx);
        const i1 = index.getX(baseIdx + 1);
        const i2 = index.getX(baseIdx + 2);

        const tagBits = this.faceTags[faceIdx].tags;
        vertexTags[i0] |= tagBits;
        vertexTags[i1] |= tagBits;
        vertexTags[i2] |= tagBits;
      }
    } else {
      for (let faceIdx = 0; faceIdx < this.faceTags.length; faceIdx++) {
        const baseIdx = faceIdx * 3;
        const tagBits = this.faceTags[faceIdx].tags;
        vertexTags[baseIdx] |= tagBits;
        vertexTags[baseIdx + 1] |= tagBits;
        vertexTags[baseIdx + 2] |= tagBits;
      }
    }

    this.geometry.setAttribute('faceTag', new THREE.BufferAttribute(vertexTags, 1));

    // Per-face attribute: one value per triangle
    const faceTagArray = new Float32Array(this.faceTags.length);
    for (let i = 0; i < this.faceTags.length; i++) {
      faceTagArray[i] = this.faceTags[i].tags;
    }
    this.geometry.setAttribute('faceTagPerFace', new THREE.BufferAttribute(faceTagArray, 1));
  }

  /**
   * Read face tags from a BufferGeometry that has the `faceTag` attribute.
   * Populates the internal faceTags array from the geometry attribute data.
   *
   * @param geometry - Geometry with `faceTag` attribute
   */
  readTagsFromGeometry(geometry: THREE.BufferGeometry): void {
    const faceTagAttr = geometry.getAttribute('faceTag');
    if (!faceTagAttr) return;

    const index = geometry.getIndex();
    const faceCount = index ? index.count / 3 : (faceTagAttr.count / 3);

    this.faceTags = new Array(Math.floor(faceCount));

    if (index) {
      for (let faceIdx = 0; faceIdx < faceCount; faceIdx++) {
        const baseIdx = faceIdx * 3;
        const i0 = index.getX(baseIdx);
        const tagBits = faceTagAttr.getX(i0);
        this.faceTags[faceIdx] = new FaceTagSet(tagBits);
      }
    } else {
      for (let faceIdx = 0; faceIdx < faceCount; faceIdx++) {
        const baseIdx = faceIdx * 3;
        const tagBits = faceTagAttr.getX(baseIdx);
        this.faceTags[faceIdx] = new FaceTagSet(tagBits);
      }
    }
  }

  /**
   * Get the FaceTagSet for a specific face.
   */
  getFaceTag(faceIndex: number): FaceTagSet | null {
    if (faceIndex >= 0 && faceIndex < this.faceTags.length) {
      return this.faceTags[faceIndex];
    }
    return null;
  }

  /**
   * Get statistics about tag distribution.
   */
  getTagStatistics(): Map<FaceTag, number> {
    const stats = new Map<FaceTag, number>();
    for (const tag of ALL_FACE_TAGS) {
      stats.set(tag, 0);
    }
    for (const ft of this.faceTags) {
      for (const tag of ALL_FACE_TAGS) {
        if (ft.has(tag)) {
          stats.set(tag, (stats.get(tag) ?? 0) + 1);
        }
      }
    }
    return stats;
  }
}

// ============================================================================
// Auto-Tagging Functions
// ============================================================================

/**
 * Normal direction thresholds for classifying face orientation.
 */
const UP_NORMAL_THRESHOLD = 0.9;    // Normal.y > this → horizontal-up
const DOWN_NORMAL_THRESHOLD = -0.9; // Normal.y < this → horizontal-down
const HORIZONTAL_THRESHOLD = 0.1;   // |Normal.y| < this → vertical

/**
 * Auto-tag faces of a room's geometry based on the room definition.
 *
 * Classification rules:
 * - Faces with normal pointing up at room top → CEILING
 * - Faces with normal pointing down at room bottom → FLOOR + SUPPORT_SURFACE
 * - Faces with horizontal normals → WALL
 * - Interior walls (shared between rooms) → WALL_INTERIOR
 * - Exterior walls → WALL_EXTERIOR
 * - Opening frame faces → OPENING
 * - All visible faces → VISIBLE
 *
 * @param geometry - The room's BufferGeometry (must have normals)
 * @param roomDef - The room definition with position, size, and openings
 * @returns TaggedGeometry with auto-assigned tags
 */
export function tagRoomGeometry(
  geometry: THREE.BufferGeometry,
  roomDef: RoomDefinition
): TaggedGeometry {
  const tagged = new TaggedGeometry(geometry);
  const normalAttr = geometry.getAttribute('normal');
  const positionAttr = geometry.getAttribute('position');
  const index = geometry.getIndex();

  if (!normalAttr || !positionAttr) {
    // No normals — tag all faces as VISIBLE only
    tagged.setTagRange(0, tagged.faceTags.length, FaceTag.VISIBLE);
    return tagged;
  }

  // Compute room bounds for interior/exterior classification
  const roomTop = roomDef.position.y + roomDef.height;
  const roomBottom = roomDef.position.y;
  const roomMinX = roomDef.position.x - roomDef.width / 2;
  const roomMaxX = roomDef.position.x + roomDef.width / 2;
  const roomMinZ = roomDef.position.z - roomDef.depth / 2;
  const roomMaxZ = roomDef.position.z + roomDef.depth / 2;

  // Set of wall directions that have openings
  const openingWalls = new Set(roomDef.openings.map(o => o.wall));

  for (let faceIdx = 0; faceIdx < tagged.faceTags.length; faceIdx++) {
    const tags = tagged.faceTags[faceIdx];

    // Get face normal (average of vertex normals)
    const normal = getFaceNormal(normalAttr, index, faceIdx);
    const centroid = getFaceCentroid(positionAttr, index, faceIdx);

    // All room faces are visible from inside
    tags.add(FaceTag.VISIBLE);

    // Classify by normal direction
    if (normal.y > UP_NORMAL_THRESHOLD) {
      // Upward-facing → floor or ceiling
      if (centroid.y > (roomTop - 0.5)) {
        tags.add(FaceTag.CEILING);
      } else {
        tags.add(FaceTag.FLOOR);
        tags.add(FaceTag.SUPPORT_SURFACE);
      }
    } else if (normal.y < DOWN_NORMAL_THRESHOLD) {
      // Downward-facing → ceiling or floor underside
      if (centroid.y < (roomBottom + 0.5)) {
        tags.add(FaceTag.FLOOR);
        tags.add(FaceTag.SUPPORT_SURFACE);
      } else {
        tags.add(FaceTag.CEILING);
      }
    } else {
      // Horizontal-facing → wall
      tags.add(FaceTag.WALL);

      // Determine interior vs exterior
      const wallThickness = roomDef.wallThickness;

      // Check if this wall is on the building exterior
      const isExterior =
        Math.abs(centroid.x - roomMinX) < wallThickness * 2 ||
        Math.abs(centroid.x - roomMaxX) < wallThickness * 2 ||
        Math.abs(centroid.z - roomMinZ) < wallThickness * 2 ||
        Math.abs(centroid.z - roomMaxZ) < wallThickness * 2;

      if (isExterior) {
        tags.add(FaceTag.WALL_EXTERIOR);
      } else {
        tags.add(FaceTag.WALL_INTERIOR);
      }

      // Check if this face is near an opening
      const wallDir = classifyWallDirection(normal);
      if (wallDir && openingWalls.has(wallDir)) {
        // Check if this face is near the opening position
        for (const opening of roomDef.openings) {
          if (opening.wall !== wallDir) continue;

          const op = opening.position;
          const dx = Math.abs(centroid.x - op.x);
          const dz = Math.abs(centroid.z - op.z);
          const openingExtent = Math.max(opening.width, opening.height) / 2 + 0.15;

          if (dx < openingExtent && dz < openingExtent) {
            tags.add(FaceTag.OPENING);
          }
        }
      }
    }
  }

  return tagged;
}

/**
 * Tag a single architectural element's geometry.
 *
 * Applies appropriate tags based on the element type:
 * - floor: FLOOR + SUPPORT_SURFACE + VISIBLE
 * - ceiling: CEILING + VISIBLE
 * - wall: WALL + WALL_EXTERIOR/WALL_INTERIOR + VISIBLE
 * - column: STRUCTURAL + WALL + VISIBLE
 * - beam: STRUCTURAL + VISIBLE
 * - stair: SUPPORT_SURFACE + FLOOR + VISIBLE
 *
 * @param geometry - The element's BufferGeometry
 * @param elementType - Type of architectural element
 * @returns TaggedGeometry with appropriate tags
 */
export function tagArchitecturalElement(
  geometry: THREE.BufferGeometry,
  elementType: 'floor' | 'ceiling' | 'wall' | 'column' | 'beam' | 'stair'
): TaggedGeometry {
  const tagged = new TaggedGeometry(geometry);
  const normalAttr = geometry.getAttribute('normal');
  const positionAttr = geometry.getAttribute('position');
  const index = geometry.getIndex();

  switch (elementType) {
    case 'floor':
      for (const ft of tagged.faceTags) {
        ft.add(FaceTag.FLOOR);
        ft.add(FaceTag.SUPPORT_SURFACE);
        ft.add(FaceTag.VISIBLE);
      }
      break;

    case 'ceiling':
      for (const ft of tagged.faceTags) {
        ft.add(FaceTag.CEILING);
        ft.add(FaceTag.VISIBLE);
      }
      break;

    case 'wall':
      if (normalAttr && positionAttr) {
        for (let faceIdx = 0; faceIdx < tagged.faceTags.length; faceIdx++) {
          const tags = tagged.faceTags[faceIdx];
          tags.add(FaceTag.WALL);
          tags.add(FaceTag.VISIBLE);

          const normal = getFaceNormal(normalAttr, index, faceIdx);
          if (Math.abs(normal.y) > 0.5) {
            // Top or bottom face of a wall
            if (normal.y > 0) {
              tags.add(FaceTag.SUPPORT_SURFACE);
            }
          } else {
            // Vertical face — classify interior/exterior based on position
            // For standalone walls, assume exterior by default
            tags.add(FaceTag.WALL_EXTERIOR);
          }
        }
      } else {
        for (const ft of tagged.faceTags) {
          ft.add(FaceTag.WALL);
          ft.add(FaceTag.WALL_EXTERIOR);
          ft.add(FaceTag.VISIBLE);
        }
      }
      break;

    case 'column':
      for (const ft of tagged.faceTags) {
        ft.add(FaceTag.STRUCTURAL);
        ft.add(FaceTag.WALL);
        ft.add(FaceTag.VISIBLE);
      }
      break;

    case 'beam':
      for (const ft of tagged.faceTags) {
        ft.add(FaceTag.STRUCTURAL);
        ft.add(FaceTag.VISIBLE);
      }
      break;

    case 'stair':
      if (normalAttr && positionAttr) {
        for (let faceIdx = 0; faceIdx < tagged.faceTags.length; faceIdx++) {
          const tags = tagged.faceTags[faceIdx];
          tags.add(FaceTag.VISIBLE);

          const normal = getFaceNormal(normalAttr, index, faceIdx);
          if (normal.y > UP_NORMAL_THRESHOLD) {
            // Top of step — walkable surface
            tags.add(FaceTag.FLOOR);
            tags.add(FaceTag.SUPPORT_SURFACE);
          } else if (Math.abs(normal.y) < HORIZONTAL_THRESHOLD) {
            // Riser face
            tags.add(FaceTag.WALL);
          } else {
            // Bottom or angled faces
            tags.add(FaceTag.STRUCTURAL);
          }
        }
      } else {
        for (const ft of tagged.faceTags) {
          ft.add(FaceTag.FLOOR);
          ft.add(FaceTag.SUPPORT_SURFACE);
          ft.add(FaceTag.VISIBLE);
        }
      }
      break;
  }

  return tagged;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the average face normal from a normal attribute.
 */
function getFaceNormal(
  normalAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: THREE.BufferAttribute | null,
  faceIdx: number
): THREE.Vector3 {
  const normal = new THREE.Vector3();

  if (index) {
    const baseIdx = faceIdx * 3;
    const n0 = new THREE.Vector3().fromBufferAttribute(normalAttr, index.getX(baseIdx));
    const n1 = new THREE.Vector3().fromBufferAttribute(normalAttr, index.getX(baseIdx + 1));
    const n2 = new THREE.Vector3().fromBufferAttribute(normalAttr, index.getX(baseIdx + 2));
    normal.add(n0).add(n1).add(n2).divideScalar(3);
  } else {
    const baseIdx = faceIdx * 3;
    const n0 = new THREE.Vector3().fromBufferAttribute(normalAttr, baseIdx);
    const n1 = new THREE.Vector3().fromBufferAttribute(normalAttr, baseIdx + 1);
    const n2 = new THREE.Vector3().fromBufferAttribute(normalAttr, baseIdx + 2);
    normal.add(n0).add(n1).add(n2).divideScalar(3);
  }

  return normal.normalize();
}

/**
 * Get the centroid of a face from a position attribute.
 */
function getFaceCentroid(
  positionAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: THREE.BufferAttribute | null,
  faceIdx: number
): THREE.Vector3 {
  const centroid = new THREE.Vector3();

  if (index) {
    const baseIdx = faceIdx * 3;
    const v0 = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(baseIdx));
    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(baseIdx + 1));
    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(baseIdx + 2));
    centroid.add(v0).add(v1).add(v2).divideScalar(3);
  } else {
    const baseIdx = faceIdx * 3;
    const v0 = new THREE.Vector3().fromBufferAttribute(positionAttr, baseIdx);
    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttr, baseIdx + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttr, baseIdx + 2);
    centroid.add(v0).add(v1).add(v2).divideScalar(3);
  }

  return centroid;
}

/**
 * Classify a horizontal normal into a wall direction.
 */
function classifyWallDirection(normal: THREE.Vector3): 'north' | 'south' | 'east' | 'west' | null {
  const absX = Math.abs(normal.x);
  const absZ = Math.abs(normal.z);

  if (absX > absZ) {
    if (absX < HORIZONTAL_THRESHOLD) return null;
    return normal.x > 0 ? 'east' : 'west';
  } else {
    if (absZ < HORIZONTAL_THRESHOLD) return null;
    return normal.z > 0 ? 'south' : 'north';
  }
}
