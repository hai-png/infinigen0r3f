/**
 * Tag System for Infinigen R3F
 *
 * Ported from Infinigen's core/tags.py — implements the tagging system used for
 * semantic classification, subpart identification, generator attribution,
 * negation-based exclusion, variable tags, and arbitrary string tags.
 *
 * This module defines:
 * - `SemanticTag` enum — Room types, furniture functions, object roles
 * - `SubpartTag` enum — Geometry region tags (Top, Bottom, Front, Back, etc.)
 * - `Tag` class — Unified tag with type, value, and negation support
 * - `TagSet` class — Collection of tags with include/exclude query matching
 * - `TagQuery` class — Declarative query with include/exclude tag lists
 *
 * @module TagSystem
 */

// ---------------------------------------------------------------------------
// SemanticTag enum — Room types, furniture functions, object roles
// ---------------------------------------------------------------------------

/**
 * Semantic tags for object and room classification.
 * Ported from Infinigen's Semantics EnumTag — expanded for Three.js/R3F use.
 */
export enum SemanticTag {
  // Room types
  Kitchen = 'kitchen',
  Bedroom = 'bedroom',
  Bathroom = 'bathroom',
  LivingRoom = 'living-room',
  DiningRoom = 'dining-room',
  Hallway = 'hallway',
  Office = 'office',
  Closet = 'closet',
  Garage = 'garage',
  Patio = 'patio',
  Balcony = 'balcony',
  Stairwell = 'stairwell',
  Attic = 'attic',
  Basement = 'basement',
  Laundry = 'laundry',
  Utility = 'utility',
  MeetingRoom = 'meeting-room',
  OpenOffice = 'open-office',
  BreakRoom = 'break-room',
  Restroom = 'restroom',

  // Furniture / object functions
  Table = 'table',
  Chair = 'chair',
  Shelf = 'shelf',
  Cabinet = 'cabinet',
  Door = 'door',
  Window = 'window',
  Floor = 'floor',
  Wall = 'wall',
  Ceiling = 'ceiling',
  Countertop = 'countertop',
  Backsplash = 'backsplash',
  Appliance = 'appliance',
  Sink = 'sink',
  Toilet = 'toilet',
  Bathtub = 'bathtub',
  Shower = 'shower',
  Bed = 'bed',
  Sofa = 'sofa',
  Desk = 'desk',
  Dresser = 'dresser',
  Nightstand = 'nightstand',
  Bookshelf = 'bookshelf',
  Lamp = 'lamp',
  Rug = 'rug',
  Curtains = 'curtains',
  Mirror = 'mirror',
  Picture = 'picture',
  Plant = 'plant',
  Vase = 'vase',
  Cushion = 'cushion',
  Blanket = 'blanket',
  Pillow = 'pillow',

  // Room-level tags
  Room = 'room',
  Cutter = 'cutter',
  Object = 'object',
  Furniture = 'furniture',
  Exterior = 'exterior',
  Staircase = 'staircase',
  Visited = 'visited',
  RoomContour = 'room-contour',
  RoomNode = 'room-node',
  GroundFloor = 'ground-floor',
  SecondFloor = 'second-floor',
  ThirdFloor = 'third-floor',

  // Object sub-categories
  Storage = 'storage',
  Seating = 'seating',
  LoungeSeating = 'lounge-seating',
  Bathing = 'bathing',
  SideTable = 'side-table',
  Watchable = 'watchable',
  CeilingLight = 'ceiling-light',
  Lighting = 'lighting',
  KitchenCounter = 'kitchen-counter',
  KitchenAppliance = 'kitchen-appliance',
  WallDecoration = 'wall-decoration',
  HandheldItem = 'handheld-item',
  FloorMat = 'floor-mat',

  // Small object functions
  TableDisplayItem = 'table-display-item',
  OfficeShelfItem = 'office-shelf-item',
  KitchenCounterItem = 'kitchen-counter-item',
  FoodPantryItem = 'food-pantry-item',
  BathroomItem = 'bathroom-item',
  ShelfTrinket = 'shelf-trinket',
  Dishware = 'dishware',
  Cookware = 'cookware',
  Utensils = 'utensils',
  ClothDrapeItem = 'cloth-drape',

  // Access type
  AccessTop = 'access-top',
  AccessFront = 'access-front',
  AccessAnySide = 'access-any-side',
  AccessAllSides = 'access-all-sides',

  // Access method
  AccessStandingNear = 'access-stand-near',
  AccessSit = 'access-sit',
  AccessOpenDoor = 'access-open-door',
  AccessHand = 'access-with-hand',

  // Special
  Open = 'open',
  Entrance = 'entrance',
}

// ---------------------------------------------------------------------------
// SubpartTag enum — Geometry region tags
// ---------------------------------------------------------------------------

/**
 * Subpart tags for geometry regions of meshes.
 * Ported from Infinigen's Subpart EnumTag — expanded for furniture parts.
 */
export enum SubpartTag {
  SupportSurface = 'support',
  Interior = 'interior',
  Visible = 'visible',
  Bottom = 'bottom',
  Top = 'top',
  Side = 'side',
  Back = 'back',
  Front = 'front',
  Ceiling = 'ceiling',
  Wall = 'wall',
  Left = 'left',
  Right = 'right',
  Handle = 'handle',
  Leg = 'leg',
  Seat = 'seat',
  BackRest = 'backrest',
  ArmRest = 'armrest',
  Cushion = 'cushion',
  Frame = 'frame',
  Door = 'door',
  Shelf = 'shelf',
  Drawer = 'drawer',
  TopSurface = 'top-surface',
  BottomSurface = 'bottom-surface',
  Inner = 'inner',
  Outer = 'outer',
  StaircaseWall = 'staircase-wall',
}

// ---------------------------------------------------------------------------
// Tag type discriminator
// ---------------------------------------------------------------------------

/**
 * Tag type categorization — mirrors Infinigen's tag taxonomy.
 */
export type TagType =
  | 'semantic'    // SemanticTag enum values
  | 'subpart'     // SubpartTag enum values
  | 'generator'   // FromGenerator — originating factory class name
  | 'negated'     // Negated tag (exclusion)
  | 'variable'    // Named variable tag
  | 'string';     // Arbitrary string tag

// ---------------------------------------------------------------------------
// Tag — Unified tag class
// ---------------------------------------------------------------------------

/**
 * A tag that supports multiple types, negation, and string representation.
 *
 * Design follows Infinigen's tagging.py:
 * - SemanticTag and SubpartTag enums for structured classification
 * - FromGenerator tags record the originating factory class name
 * - Negated tags support exclusion queries (e.g., -Subpart.Back)
 * - Variable and StringTag for extensibility
 */
export class Tag {
  /** The tag type discriminator */
  readonly type: TagType;

  /** The tag value (enum string or arbitrary string) */
  readonly value: string;

  /** Whether this tag is negated */
  readonly negated: boolean;

  constructor(value: string, type: TagType = 'string', negated: boolean = false) {
    this.value = value;
    this.type = type;
    this.negated = negated;
  }

  // ── Factory methods ──────────────────────────────────────────────────

  /** Create a Tag from a SemanticTag enum value */
  static fromSemantic(sem: SemanticTag): Tag {
    return new Tag(sem as string, 'semantic');
  }

  /** Create a Tag from a SubpartTag enum value */
  static fromSubpart(sub: SubpartTag): Tag {
    return new Tag(sub as string, 'subpart');
  }

  /** Create a FromGenerator tag (type = 'generator') */
  static fromGenerator(generatorName: string): Tag {
    return new Tag(generatorName, 'generator');
  }

  /** Create a variable tag */
  static variable(name: string): Tag {
    return new Tag(name, 'variable');
  }

  /** Create an arbitrary string tag */
  static string(value: string): Tag {
    return new Tag(value, 'string');
  }

  /**
   * Parse a tag string into a Tag object.
   * Supports: "TagName", "-TagName" / "!TagName" (negated),
   * "FromGenerator(X)", "Subpart.X", "Semantic.X"
   */
  static parse(tagStr: string): Tag {
    const trimmed = tagStr.trim();

    // Negation prefixes
    if (trimmed.startsWith('-') || trimmed.startsWith('!')) {
      const inner = Tag.parse(trimmed.substring(1));
      return inner.negate();
    }

    // FromGenerator pattern
    const genMatch = trimmed.match(/^FromGenerator\((.+)\)$/);
    if (genMatch) {
      return Tag.fromGenerator(genMatch[1]);
    }

    // Subpart.X pattern
    const subpartMatch = trimmed.match(/^Subpart\.(.+)$/);
    if (subpartMatch) {
      const val = subpartMatch[1];
      const enumVal = Object.values(SubpartTag).find(
        (v) => v.toLowerCase() === val.toLowerCase()
      );
      return new Tag(enumVal ?? val, 'subpart');
    }

    // Semantic.X pattern
    const semanticMatch = trimmed.match(/^Semantic\.(.+)$/);
    if (semanticMatch) {
      const val = semanticMatch[1];
      const enumVal = Object.values(SemanticTag).find(
        (v) => v.toLowerCase() === val.toLowerCase()
      );
      return new Tag(enumVal ?? val, 'semantic');
    }

    // Try SemanticTag enum match
    if (Object.values(SemanticTag).includes(trimmed as SemanticTag)) {
      return Tag.fromSemantic(trimmed as SemanticTag);
    }

    // Try SubpartTag enum match
    if (Object.values(SubpartTag).includes(trimmed as SubpartTag)) {
      return Tag.fromSubpart(trimmed as SubpartTag);
    }

    // Default to string tag
    return Tag.string(trimmed);
  }

  // ── Instance methods ─────────────────────────────────────────────────

  /**
   * Returns a negated version of this tag.
   * If already negated, returns the positive version (double-negation elimination).
   */
  negate(): Tag {
    return new Tag(this.value, this.type, !this.negated);
  }

  /** Check strict equality (same type, value, and negation state) */
  equals(other: Tag): boolean {
    return this.type === other.type && this.value === other.value && this.negated === other.negated;
  }

  /** Hash key for use in Maps/Sets */
  toKey(): string {
    const prefix = this.negated ? '-' : '';
    return `${prefix}${this.type}:${this.value}`;
  }

  /** String representation matching Infinigen conventions */
  toString(): string {
    const prefix = this.negated ? '-' : '';
    if (this.type === 'generator') {
      return `${prefix}FromGenerator(${this.value})`;
    }
    if (this.type === 'semantic') {
      return `${prefix}Semantic.${this.value}`;
    }
    if (this.type === 'subpart') {
      return `${prefix}Subpart.${this.value}`;
    }
    return `${prefix}${this.value}`;
  }
}

// ---------------------------------------------------------------------------
// TagSet — Collection of tags with query matching
// ---------------------------------------------------------------------------

/**
 * A set of tags associated with an object or mesh.
 * Supports negation-aware matching and set operations.
 */
export class TagSet {
  private tags: Map<string, Tag> = new Map();

  constructor(tags?: Tag[]) {
    if (tags) {
      for (const tag of tags) {
        this.add(tag);
      }
    }
  }

  // ── Mutating operations ──────────────────────────────────────────────

  /** Add a tag to the set */
  add(tag: Tag): void {
    this.tags.set(tag.toKey(), tag);
  }

  /** Remove a tag from the set */
  remove(tag: Tag): void {
    this.tags.delete(tag.toKey());
  }

  // ── Query operations ─────────────────────────────────────────────────

  /** Check if the set contains a specific tag (exact match) */
  has(tag: Tag): boolean {
    return this.tags.has(tag.toKey());
  }

  /** Check if the set has any tag with the given value (ignoring type/negation) */
  hasValue(value: string): boolean {
    for (const tag of this.tags.values()) {
      if (tag.value === value) return true;
    }
    return false;
  }

  /**
   * Check if a tag is effectively present.
   * Negation-aware: if -TagA is present, has(TagA) returns false.
   */
  hasEffective(tag: Tag): boolean {
    const negatedTag = tag.negate();
    // If negated version is present, the positive is excluded
    if (this.has(negatedTag)) {
      return false;
    }
    return this.has(tag);
  }

  /**
   * Check if this tag set matches a query.
   * A TagSet matches a TagQuery if:
   * - All include tags are effectively present
   * - No exclude tags are effectively present
   */
  matches(query: TagQuery): boolean {
    // Check all include tags
    for (const includeTag of query.include) {
      if (!this.hasEffective(includeTag)) {
        return false;
      }
    }

    // Check all exclude tags — none should be present
    for (const excludeTag of query.exclude) {
      if (this.hasEffective(excludeTag)) {
        return false;
      }
    }

    return true;
  }

  /** Intersection with another TagSet */
  intersect(other: TagSet): TagSet {
    const result = new TagSet();
    for (const [key, tag] of this.tags) {
      if (other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  /** Union with another TagSet */
  union(other: TagSet): TagSet {
    const result = new TagSet(this.toArray());
    for (const tag of other.tags.values()) {
      result.add(tag);
    }
    return result;
  }

  /** Difference: tags in this set but not in the other */
  difference(other: TagSet): TagSet {
    const result = new TagSet();
    for (const [key, tag] of this.tags) {
      if (!other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  // ── Access / iteration ───────────────────────────────────────────────

  /** Number of tags */
  get size(): number {
    return this.tags.size;
  }

  /** Check if empty */
  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  /** Convert to array */
  toArray(): Tag[] {
    return Array.from(this.tags.values());
  }

  /** Get tags by type */
  getTagsByType(type: TagType): Tag[] {
    return this.toArray().filter((t) => t.type === type);
  }

  /** Get positive (non-negated) tags */
  getPositive(): Tag[] {
    return this.toArray().filter((t) => !t.negated);
  }

  /** Get negated tags */
  getNegated(): Tag[] {
    return this.toArray().filter((t) => t.negated);
  }

  /** Clone */
  clone(): TagSet {
    return new TagSet(this.toArray());
  }

  /** String representation */
  toString(): string {
    return `TagSet{${this.toArray().map((t) => t.toString()).join(', ')}}`;
  }
}

// ---------------------------------------------------------------------------
// TagQuery — Declarative include/exclude query
// ---------------------------------------------------------------------------

/**
 * A query that specifies which tags must be included and which must be excluded.
 *
 * Used for tag-based selection of objects, faces, and material assignments.
 *
 * Example:
 * ```ts
 * const query = new TagQuery(
 *   [Tag.fromSemantic(SemanticTag.Table)],           // include tables
 *   [Tag.fromSubpart(SubpartTag.Bottom)]             // exclude bottom faces
 * );
 * if (query.matches(tagSet)) { ... }
 * ```
 */
export class TagQuery {
  /** Tags that must be present */
  readonly include: Tag[];

  /** Tags that must NOT be present */
  readonly exclude: Tag[];

  constructor(include: Tag[] = [], exclude: Tag[] = []) {
    this.include = include;
    this.exclude = exclude;
  }

  /**
   * Check if a TagSet satisfies this query.
   * - All include tags must be effectively present (not negated away)
   * - All exclude tags must NOT be effectively present
   */
  matches(tagSet: TagSet): boolean {
    return tagSet.matches(this);
  }

  /**
   * Create a TagQuery from a string specification.
   * Format: "Semantic.Table, -Subpart.Bottom"
   * Tags prefixed with '-' are treated as exclusions.
   */
  static parse(queryStr: string): TagQuery {
    const include: Tag[] = [];
    const exclude: Tag[] = [];
    const parts = queryStr.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

    for (const part of parts) {
      const tag = Tag.parse(part);
      if (tag.negated) {
        exclude.push(tag.negate()); // Store as positive tag in exclude list
      } else {
        include.push(tag);
      }
    }

    return new TagQuery(include, exclude);
  }

  /** Combine two queries (AND logic) */
  and(other: TagQuery): TagQuery {
    return new TagQuery(
      [...this.include, ...other.include],
      [...this.exclude, ...other.exclude]
    );
  }

  /** String representation */
  toString(): string {
    const parts: string[] = [];
    for (const t of this.include) parts.push(t.toString());
    for (const t of this.exclude) parts.push(t.negate().toString());
    return `TagQuery(${parts.join(', ')})`;
  }
}

// ---------------------------------------------------------------------------
// Utility — tag creation helpers
// ---------------------------------------------------------------------------

/**
 * Create a Tag from a SemanticTag enum value.
 * Shorthand for `Tag.fromSemantic(sem)`.
 */
export function semanticTag(sem: SemanticTag): Tag {
  return Tag.fromSemantic(sem);
}

/**
 * Create a Tag from a SubpartTag enum value.
 * Shorthand for `Tag.fromSubpart(sub)`.
 */
export function subpartTag(sub: SubpartTag): Tag {
  return Tag.fromSubpart(sub);
}

/**
 * Create a negated tag from any Tag.
 * Shorthand for `tag.negate()`.
 */
export function notTag(tag: Tag): Tag {
  return tag.negate();
}
