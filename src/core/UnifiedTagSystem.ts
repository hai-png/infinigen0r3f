/**
 * Unified Tag System
 *
 * Consolidates the three competing tag implementations into a single, coherent system:
 *
 *   1. `core/tags.ts` — Abstract Tag hierarchy with Semantics/Subpart enums,
 *      NegatedTag, FromGeneratorTag (original Infinigen design)
 *   2. `core/constraints/unified/UnifiedConstraintSystem.ts` — Concrete Tag with
 *      `negated: boolean`, TagSet with negation-aware matching (constraint solver)
 *   3. `core/util/TaggingSystem.ts` — Tag interface with hierarchy (parent/children),
 *      type categorization, object-tagging registry (scene tagging)
 *
 * Design principles:
 * - Single `Tag` class that supports negation AND hierarchy AND type categorization
 * - `TagSet` with negation-aware `contains()`: if `!TagA` is present,
 *   `contains(TagA)` returns false even if TagA is also present
 * - `Semantics` and `Subpart` enums preserved exactly as-is from tags.ts
 * - Hierarchy: child tags inherit from parent tags (contains respects ancestry)
 * - Efficient Map-based storage and lookup
 *
 * @module UnifiedTagSystem
 */

// ---------------------------------------------------------------------------
// Semantics and Subpart enums — canonical definitions
//
// Previously imported from ./tags.ts; now defined inline so that
// UnifiedTagSystem is fully self-contained.
// ---------------------------------------------------------------------------

/**
 * Semantic tags for object classification.
 * Ported from Python InfiniGen's Semantics EnumTag — preserved as-is.
 */
export enum Semantics {
  // Mesh types
  Room = 'room',
  Object = 'object',
  Cutter = 'cutter',

  // Room types
  Kitchen = 'kitchen',
  Bedroom = 'bedroom',
  LivingRoom = 'living-room',
  Closet = 'closet',
  Hallway = 'hallway',
  Bathroom = 'bathroom',
  Garage = 'garage',
  Balcony = 'balcony',
  DiningRoom = 'dining-room',
  Utility = 'utility',
  StaircaseRoom = 'staircase-room',
  Warehouse = 'warehouse',
  Office = 'office',
  MeetingRoom = 'meeting-room',
  OpenOffice = 'open-office',
  BreakRoom = 'break-room',
  Restroom = 'restroom',
  FactoryOffice = 'factory-office',

  Root = 'root',
  New = 'new',
  RoomNode = 'room-node',
  GroundFloor = 'ground',
  SecondFloor = 'second-floor',
  ThirdFloor = 'third-floor',
  Exterior = 'exterior',
  Staircase = 'staircase',
  Visited = 'visited',
  RoomContour = 'room-contour',

  // Object types
  Furniture = 'furniture',
  FloorMat = 'FloorMat',
  WallDecoration = 'wall-decoration',
  HandheldItem = 'handheld-item',

  // Furniture functions
  Storage = 'storage',
  Seating = 'seating',
  LoungeSeating = 'lounge-seating',
  Table = 'table',
  Bathing = 'bathing',
  SideTable = 'side-table',
  Watchable = 'watchable',
  Desk = 'desk',
  Bed = 'bed',
  Sink = 'sink',
  CeilingLight = 'ceiling-light',
  Lighting = 'lighting',
  KitchenCounter = 'kitchen-counter',
  KitchenAppliance = 'kitchen-appliance',

  // Small Object Functions
  TableDisplayItem = 'table-display-item',
  OfficeShelfItem = 'office-shelf-item',
  KitchenCounterItem = 'kitchen-counter-item',
  FoodPantryItem = 'food-pantry',
  BathroomItem = 'bathroom-item',
  ShelfTrinket = 'shelf-trinket',
  Dishware = 'dishware',
  Cookware = 'cookware',
  Utensils = 'utensils',
  ClothDrapeItem = 'cloth-drape',

  // Object Access Type
  AccessTop = 'access-top',
  AccessFront = 'access-front',
  AccessAnySide = 'access-any-side',
  AccessAllSides = 'access-all-sides',

  // Object Access Method
  AccessStandingNear = 'access-stand-near',
  AccessSit = 'access-stand-near',
  AccessOpenDoor = 'access-open-door',
  AccessHand = 'access-with-hand',

  // Special Case Objects
  Chair = 'chair',
  Window = 'window',
  Open = 'open',
  Entrance = 'entrance',
  Door = 'door',

  // Solver feature flags - Per-Asset Behavior Config
  RealPlaceholder = 'real-placeholder',
  OversizePlaceholder = 'oversize-placeholder',
  AssetAsPlaceholder = 'asset-as-placeholder',
  AssetPlaceholderForChildren = 'asset-placeholder-for-children',
  PlaceholderBBox = 'placeholder-bbox',
  SingleGenerator = 'single-generator',
  NoRotation = 'no-rotation',
  NoCollision = 'no-collision',
  NoChildren = 'no-children',
}

/**
 * Subpart tags for geometry regions.
 * Ported from Python InfiniGen — preserved as-is.
 */
export enum Subpart {
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
  StaircaseWall = 'staircase-wall',
}

// ---------------------------------------------------------------------------
// Tag types
// ---------------------------------------------------------------------------

/**
 * Tag type categorization (from TaggingSystem).
 *
 * Every tag belongs to exactly one type category, which determines how it
 * is used and filtered.
 */
export type TagType =
  | 'semantic'      // Semantic category (e.g., 'chair', 'table', Semantics enum values)
  | 'functional'    // Functional role (e.g., 'sittable', 'graspable')
  | 'material'      // Material type (e.g., 'wooden', 'metallic')
  | 'spatial'       // Spatial relationship (e.g., 'floor-mounted', Subpart enum values)
  | 'subpart'       // Geometry region tags (maps to Subpart enum values)
  | 'generator'     // Tags derived from generator names (FromGeneratorTag)
  | 'custom';       // User-defined tags

// ---------------------------------------------------------------------------
// Tag — Unified tag class
// ---------------------------------------------------------------------------

/**
 * A unified tag that supports negation, hierarchy, and type categorization.
 *
 * Combines:
 * - From `tags.ts`: negation support (`negate()` / `NegatedTag`),
 *   `FromGeneratorTag` semantics, string representation with `-` prefix
 * - From `UnifiedConstraintSystem`: concrete class with `negated: boolean`,
 *   `matches()` / `equals()` / `toKey()`, `!` prefix for string form
 * - From `TaggingSystem`: `type` categorization, `parent` for hierarchy,
 *   `metadata` extensibility
 *
 * ### Negation
 * A negated tag (`negated: true`) represents an exclusion constraint.
 * String form uses `!` prefix (e.g., `!chair`).
 * Double-negation is not allowed: calling `negate()` on a negated tag
 * returns the positive version (eliminating the double negative).
 *
 * ### Hierarchy
 * A tag may reference a parent tag via `parentId`. When a `TagSet` is
 * configured with `hierarchyEnabled: true`, having a child tag implies
 * also having all ancestor tags (e.g., having "chair" implies "furniture"
 * if "chair"'s parent is "furniture").
 */
export class Tag {
  // ── Core fields ──────────────────────────────────────────────────────

  /** The tag name (without negation prefix). */
  readonly name: string;

  /** Whether this tag is negated (!TagName). */
  readonly negated: boolean;

  /** Type category for filtering and organization. */
  readonly type: TagType;

  /** Parent tag ID for hierarchical relationships, if any. */
  readonly parentId: string | null;

  /** Arbitrary metadata associated with this tag. */
  readonly metadata: Readonly<Record<string, unknown>>;

  // ── Constructor ──────────────────────────────────────────────────────

  constructor(
    name: string,
    opts: TagOptions = {},
  ) {
    this.name = name;
    this.negated = opts.negated ?? false;
    this.type = opts.type ?? 'semantic';
    this.parentId = opts.parentId ?? null;
    this.metadata = opts.metadata ? Object.freeze({ ...opts.metadata }) : EMPTY_METADATA;
  }

  // ── Factory methods ──────────────────────────────────────────────────

  /**
   * Create a Tag from a Semantics enum value.
   */
  static fromSemantics(sem: Semantics, opts: Omit<TagOptions, 'type'> = {}): Tag {
    return new Tag(sem as string, { ...opts, type: 'semantic' });
  }

  /**
   * Create a Tag from a Subpart enum value.
   */
  static fromSubpart(sub: Subpart, opts: Omit<TagOptions, 'type'> = {}): Tag {
    return new Tag(sub as string, { ...opts, type: 'subpart' });
  }

  /**
   * Create a FromGenerator-style tag (type = 'generator').
   */
  static fromGenerator(generatorName: string, opts: Omit<TagOptions, 'type'> = {}): Tag {
    return new Tag(generatorName, { ...opts, type: 'generator' });
  }

  /**
   * Parse a tag string into a Tag object.
   *
   * Supports:
   * - `"TagName"` → positive tag
   * - `"!TagName"` or `"-TagName"` → negated tag
   * - `"FromGenerator(x)"` → generator tag
   */
  static parse(tagStr: string, opts: TagOptions = {}): Tag {
    const trimmed = tagStr.trim();

    // Negation prefixes
    if (trimmed.startsWith('!')) {
      return new Tag(trimmed.substring(1), { ...opts, negated: true });
    }
    if (trimmed.startsWith('-')) {
      return new Tag(trimmed.substring(1), { ...opts, negated: true });
    }

    // FromGenerator pattern
    const genMatch = trimmed.match(/^FromGenerator\((.+)\)$/);
    if (genMatch) {
      return Tag.fromGenerator(genMatch[1], opts);
    }

    // Try Semantics enum match
    if (Object.values(Semantics).includes(trimmed as Semantics)) {
      return Tag.fromSemantics(trimmed as Semantics, opts);
    }

    // Try Subpart enum match
    if (Object.values(Subpart).includes(trimmed as Subpart)) {
      return Tag.fromSubpart(trimmed as Subpart, opts);
    }

    return new Tag(trimmed, opts);
  }

  // ── Instance methods ─────────────────────────────────────────────────

  /**
   * Returns a negated version of this tag.
   *
   * If already negated, returns the positive (double-negation elimination).
   */
  negate(): Tag {
    return new Tag(this.name, {
      negated: !this.negated,
      type: this.type,
      parentId: this.parentId,
      metadata: { ...this.metadata },
    });
  }

  /**
   * Check if this tag matches another tag.
   *
   * Matching rules (from UnifiedConstraintSystem):
   * - Positive vs Positive: same name → match
   * - Negated vs Positive: different name → match (NOT X is satisfied by Y ≠ X)
   * - Negated vs Negated: different name → match
   * - Positive vs Negated: never matches
   */
  matches(other: Tag): boolean {
    if (this.negated && !other.negated) {
      return this.name !== other.name;
    }
    if (!this.negated && !other.negated) {
      return this.name === other.name;
    }
    if (this.negated && other.negated) {
      return this.name !== other.name;
    }
    // !this.negated && other.negated
    return false;
  }

  /**
   * Check if this tag is an ancestor of (or equal to) another tag
   * using the provided parent map.
   *
   * @param other     - The potential descendant tag
   * @param parentMap - Map from tag name → parent tag name
   */
  isAncestorOf(other: Tag, parentMap: ReadonlyMap<string, string>): boolean {
    let current: string | null = other.name;
    while (current !== null) {
      if (current === this.name) return true;
      current = parentMap.get(current) ?? null;
    }
    return false;
  }

  /**
   * Equality check (same name AND same negation state).
   */
  equals(other: Tag): boolean {
    return this.name === other.name && this.negated === other.negated;
  }

  /**
   * Hash key for use in Maps/Sets.
   */
  toKey(): string {
    return this.negated ? `!${this.name}` : this.name;
  }

  /**
   * String representation: `!Name` for negated, `Name` for positive.
   * For generator tags: `FromGenerator(name)`.
   */
  toString(): string {
    if (this.type === 'generator' && !this.negated) {
      return `FromGenerator(${this.name})`;
    }
    return this.negated ? `!${this.name}` : this.name;
  }
}

/** Options for constructing a Tag. */
export interface TagOptions {
  negated?: boolean;
  type?: TagType;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Frozen empty metadata object (shared sentinel). */
const EMPTY_METADATA: Readonly<Record<string, unknown>> = Object.freeze({});

// ---------------------------------------------------------------------------
// TagSet — Negation-aware, hierarchy-aware tag set
// ---------------------------------------------------------------------------

/**
 * Configuration for TagSet behavior.
 */
export interface TagSetConfig {
  /**
   * When `true`, `contains()` and `matches()` consider tag hierarchy:
   * if a tag has a parent, having the child tag implies also having
   * all ancestor tags.
   *
   * Default: `true`.
   */
  hierarchyEnabled: boolean;

  /**
   * When `true`, negation takes precedence in `contains()`:
   * if both `TagA` and `!TagA` are in the set, `contains(TagA)` returns `false`.
   *
   * Default: `true`.
   */
  negationOverridesPositive: boolean;
}

/** Default TagSet configuration. */
const DEFAULT_TAGSET_CONFIG: TagSetConfig = {
  hierarchyEnabled: true,
  negationOverridesPositive: true,
};

/**
 * A set of tags that supports negation-aware and hierarchy-aware matching.
 *
 * This consolidates:
 * - From `UnifiedConstraintSystem.TagSet`: Map-based storage, `matches()`,
 *   `matchesAll()`, `matchesAny()`, set operations (union, intersect, etc.)
 * - From `tags.ts`: `decomposeTags()`, `satisfies()`, `implies()`
 * - From `TaggingSystem`: hierarchy inheritance, type-based filtering
 *
 * ### Negation-aware `contains()`
 * If the set contains `!TagA`, then `contains(Tag("TagA"))` returns `false`,
 * even if `TagA` is also positively present (negation overrides positive).
 * This is the key behavior requested for the unified system.
 *
 * ### Hierarchy-aware `contains()`
 * When `hierarchyEnabled` is true, `contains(Tag("furniture"))` returns `true`
 * if the set contains a tag whose ancestry includes "furniture" (e.g., "chair"
 * with parent "furniture"). The parent map is maintained via `setParent()`.
 */
export class TagSet {
  /** Internal storage: key → Tag */
  private tags: Map<string, Tag> = new Map();

  /** Parent map for hierarchy: tagName → parentTagName */
  private parentMap: Map<string, string> = new Map();

  /** Configuration */
  private config: TagSetConfig;

  constructor(tags?: Tag[] | Iterable<Tag>, config?: Partial<TagSetConfig>) {
    this.config = { ...DEFAULT_TAGSET_CONFIG, ...config };
    if (tags) {
      for (const tag of tags) {
        this.add(tag);
      }
    }
  }

  // ── Mutating operations ──────────────────────────────────────────────

  /**
   * Add a tag to the set.
   * If a tag with the same key already exists, it is replaced.
   * Also registers the tag's parent in the hierarchy map if applicable.
   */
  add(tag: Tag): void {
    this.tags.set(tag.toKey(), tag);
    // Register hierarchy
    if (tag.parentId) {
      this.parentMap.set(tag.name, tag.parentId);
    }
  }

  /**
   * Remove a tag from the set (by exact key match, including negation state).
   */
  remove(tag: Tag): void {
    this.tags.delete(tag.toKey());
  }

  /**
   * Add a negated version of the given tag to the set.
   * Equivalent to `this.add(tag.negate())`.
   */
  negate(tag: Tag): void {
    this.add(tag.negate());
  }

  /**
   * Register a parent-child relationship in the hierarchy.
   * Both tags should be present in the set for hierarchy-aware matching to work.
   */
  setParent(childName: string, parentName: string): void {
    this.parentMap.set(childName, parentName);
  }

  /**
   * Remove a parent-child relationship from the hierarchy.
   */
  removeParent(childName: string): void {
    this.parentMap.delete(childName);
  }

  // ── Query operations ─────────────────────────────────────────────────

  /**
   * Check if the set contains a tag, with negation-aware and
   * hierarchy-aware semantics.
   *
   * ### Negation-awareness
   * If the set contains `!TagA` (negated) AND `config.negationOverridesPositive`
   * is `true`, then `contains(Tag("TagA"))` returns `false`, **even if TagA
   * is also positively present**.
   *
   * ### Hierarchy-awareness
   * If `config.hierarchyEnabled` is `true`, the set is considered to contain
   * a tag if any tag in the set has that tag as an ancestor (via `parentMap`).
   *
   * @param tag - The tag to check for (negation state of the query is ignored;
   *              use `matches()` for query-style matching)
   */
  contains(tag: Tag): boolean {
    const name = tag.name;
    const positiveKey = name;
    const negatedKey = `!${name}`;

    const hasPositive = this.tags.has(positiveKey);
    const hasNegated = this.tags.has(negatedKey);

    // Negation overrides positive
    if (hasNegated && this.config.negationOverridesPositive) {
      return false;
    }

    if (hasPositive) {
      return true;
    }

    // Hierarchy: check if any tag in the set has `name` as an ancestor
    if (this.config.hierarchyEnabled) {
      for (const existingTag of this.tags.values()) {
        if (!existingTag.negated && existingTag.name !== name) {
          if (this.isAncestorOfName(name, existingTag.name)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if this set has any tag with the given name (ignoring negation).
   */
  has(tag: Tag): boolean {
    const positiveKey = tag.name;
    const negatedKey = `!${tag.name}`;
    return this.tags.has(positiveKey) || this.tags.has(negatedKey);
  }

  /**
   * Evaluate whether a query tag is satisfied by this set.
   *
   * - Non-negated query (e.g., `Tag("chair")`): returns true if the set
   *   effectively contains a positive "chair" tag (respecting negation
   *   overrides and hierarchy).
   *
   * - Negated query (e.g., `Tag("chair", { negated: true })`): returns true
   *   if the set does NOT effectively contain a positive "chair" tag.
   */
  matches(query: Tag): boolean {
    if (query.negated) {
      // "NOT chair" is satisfied if "chair" is NOT effectively in the set
      return !this.contains(new Tag(query.name));
    } else {
      // "chair" is satisfied if "chair" IS effectively in the set
      return this.contains(query);
    }
  }

  /**
   * Check if ALL queries are satisfied by this set.
   */
  matchesAll(queries: Tag[]): boolean {
    return queries.every((q) => this.matches(q));
  }

  /**
   * Check if ANY query is satisfied by this set.
   */
  matchesAny(queries: Tag[]): boolean {
    return queries.some((q) => this.matches(q));
  }

  /**
   * Check if this set overlaps with another set.
   *
   * Two sets overlap if there exists at least one positive tag name that
   * is effectively contained in both sets (respecting negation and hierarchy).
   */
  overlaps(other: TagSet): boolean {
    // Check all positive tags in this set against the other
    for (const tag of this.tags.values()) {
      if (tag.negated) continue;
      if (other.contains(tag)) return true;
    }

    // Check all positive tags in the other set against this
    for (const tag of other.tags.values()) {
      if (tag.negated) continue;
      if (this.contains(tag)) return true;
    }

    return false;
  }

  // ── Size / emptiness ─────────────────────────────────────────────────

  /** Number of tags in the set (including negated). */
  get size(): number {
    return this.tags.size;
  }

  /** Check if the set is empty. */
  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  // ── Iteration / conversion ───────────────────────────────────────────

  /** Iterate over tags in this set. */
  [Symbol.iterator](): IterableIterator<Tag> {
    return this.tags.values();
  }

  /** Convert to array. */
  toArray(): Tag[] {
    return Array.from(this.tags.values());
  }

  // ── Set operations ───────────────────────────────────────────────────

  /** Union with another TagSet. */
  union(other: TagSet): TagSet {
    const result = new TagSet(this.tags.values(), this.config);
    for (const tag of other.tags.values()) {
      result.add(tag);
    }
    // Merge parent maps
    other.parentMap.forEach((parent, child) => {
      result.parentMap.set(child, parent);
    });
    return result;
  }

  /** Intersection with another TagSet. */
  intersect(other: TagSet): TagSet {
    const result = new TagSet(undefined, this.config);
    for (const [key, tag] of this.tags) {
      if (other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  /** Difference: tags in this set but not in the other. */
  difference(other: TagSet): TagSet {
    const result = new TagSet(undefined, this.config);
    for (const [key, tag] of this.tags) {
      if (!other.tags.has(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  /** Check if every tag in this set is also in the other set. */
  isSubsetOf(other: TagSet): boolean {
    for (const key of this.tags.keys()) {
      if (!other.tags.has(key)) return false;
    }
    return true;
  }

  // ── Decomposition (from tags.ts) ─────────────────────────────────────

  /**
   * Decompose the set into positive and negated tags.
   */
  decompose(): { positive: Tag[]; negated: Tag[] } {
    const positive: Tag[] = [];
    const negated: Tag[] = [];
    for (const tag of this.tags.values()) {
      if (tag.negated) {
        negated.push(tag);
      } else {
        positive.push(tag);
      }
    }
    return { positive, negated };
  }

  /**
   * Check if this set contains a contradiction: both `TagA` and `!TagA`.
   */
  hasContradiction(): boolean {
    for (const [key, tag] of this.tags) {
      if (!tag.negated) {
        if (this.tags.has(`!${tag.name}`)) return true;
      }
    }
    return false;
  }

  /**
   * Check if this tag set satisfies another (from tags.ts `satisfies()`).
   *
   * `this` satisfies `requirement` if:
   * - All positive tags in `requirement` are effectively in `this`
   * - No negated tags in `requirement` conflict with positive tags in `this`
   */
  satisfies(requirement: TagSet): boolean {
    const reqDecomp = requirement.decompose();

    // All positive requirement tags must be effectively contained
    for (const posTag of reqDecomp.positive) {
      if (!this.contains(posTag)) return false;
    }

    // All negated requirement tags must NOT be contained
    for (const negTag of reqDecomp.negated) {
      if (this.contains(new Tag(negTag.name))) return false;
    }

    return true;
  }

  // ── Type-based filtering ─────────────────────────────────────────────

  /**
   * Get all tags of a specific type.
   */
  getTagsByType(type: TagType): Tag[] {
    return this.toArray().filter((t) => t.type === type);
  }

  /**
   * Get all positive (non-negated) tag names.
   */
  getPositiveNames(): string[] {
    return this.toArray()
      .filter((t) => !t.negated)
      .map((t) => t.name);
  }

  /**
   * Get all negated tag names (without the `!` prefix).
   */
  getNegatedNames(): string[] {
    return this.toArray()
      .filter((t) => t.negated)
      .map((t) => t.name);
  }

  // ── Hierarchy utilities ──────────────────────────────────────────────

  /**
   * Get all ancestor tag names for a given tag name (via parentMap).
   */
  getAncestors(tagName: string): string[] {
    const ancestors: string[] = [];
    let current: string | null = this.parentMap.get(tagName) ?? null;
    while (current !== null) {
      ancestors.push(current);
      current = this.parentMap.get(current) ?? null;
    }
    return ancestors;
  }

  /**
   * Get all descendant tag names for a given tag name.
   */
  getDescendants(tagName: string): string[] {
    const descendants: string[] = [];
    const collect = (parent: string) => {
      for (const [child, par] of this.parentMap) {
        if (par === parent && !descendants.includes(child)) {
          descendants.push(child);
          collect(child);
        }
      }
    };
    collect(tagName);
    return descendants;
  }

  // ── Clone / serialize ────────────────────────────────────────────────

  /** Clone this tag set. */
  clone(): TagSet {
    const result = new TagSet(this.tags.values(), this.config);
    this.parentMap.forEach((parent, child) => {
      result.parentMap.set(child, parent);
    });
    return result;
  }

  /** String representation for debugging. */
  toString(): string {
    return `TagSet{${this.toArray()
      .map((t) => t.toString())
      .join(', ')}}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Check if `ancestorName` is an ancestor of `descendantName` via parentMap.
   */
  private isAncestorOfName(ancestorName: string, descendantName: string): boolean {
    let current: string | null = descendantName;
    const visited = new Set<string>();
    while (current !== null) {
      if (current === ancestorName) return true;
      if (visited.has(current)) break; // cycle guard
      visited.add(current);
      current = this.parentMap.get(current) ?? null;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Conversion utilities
// ---------------------------------------------------------------------------

/**
 * Convert various inputs to a unified Tag.
 *
 * Supports:
 * - `Tag` → returned as-is
 * - `Semantics` enum value → Tag with type 'semantic'
 * - `Subpart` enum value → Tag with type 'subpart'
 * - `string` → parsed via `Tag.parse()`
 * - Object with `name` property → FromGeneratorTag-style tag
 */
export function toUnifiedTag(
  input: Tag | Semantics | Subpart | string | { name: string },
  opts: TagOptions = {},
): Tag {
  // Already a unified Tag
  if (input instanceof Tag) {
    return input;
  }

  // Semantics enum value
  if (Object.values(Semantics).includes(input as Semantics)) {
    return Tag.fromSemantics(input as Semantics, opts);
  }

  // Subpart enum value
  if (Object.values(Subpart).includes(input as Subpart)) {
    return Tag.fromSubpart(input as Subpart, opts);
  }

  // Object with name (generator reference)
  if (typeof input === 'object' && 'name' in input && typeof input.name === 'string') {
    return Tag.fromGenerator(input.name, opts);
  }

  // String
  if (typeof input === 'string') {
    return Tag.parse(input, opts);
  }

  throw new Error(`toUnifiedTag: unhandled input type: ${typeof input}`);
}

/**
 * Convert various inputs to a unified TagSet.
 */
export function toUnifiedTagSet(
  input:
    | null
    | undefined
    | Tag
    | string
    | Semantics
    | Subpart
    | (Tag | string | Semantics | Subpart)[]
    | Set<Tag | string | Semantics | Subpart>,
  config?: Partial<TagSetConfig>,
): TagSet {
  if (input == null) {
    return new TagSet(undefined, config);
  }

  if (input instanceof TagSet) {
    return input.clone();
  }

  const items: (Tag | string | Semantics | Subpart)[] = [];

  if (input instanceof Set) {
    items.push(...input);
  } else if (Array.isArray(input)) {
    items.push(...input);
  } else {
    items.push(input);
  }

  const tagSet = new TagSet(undefined, config);
  for (const item of items) {
    tagSet.add(toUnifiedTag(item));
  }
  return tagSet;
}

// ---------------------------------------------------------------------------
// TaggingSystem — Object tagging registry with hierarchy (from TaggingSystem.ts)
// ---------------------------------------------------------------------------

/**
 * Tag definition for the registry (compatible with the old TaggingSystem's Tag interface).
 */
export interface TagDefinition {
  /** Unique tag identifier */
  id: string;
  /** Tag name/label */
  name: string;
  /** Tag type category */
  type: TagType;
  /** Parent tag ID for hierarchical relationships */
  parent?: string;
  /** Child tag IDs */
  children?: string[];
  /** Whether this tag can be combined with others */
  combinable: boolean;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tagged object reference.
 */
export interface TaggedObject {
  /** Unique object identifier */
  objectId: string;
  /** Set of tag names assigned to this object */
  tags: TagSet;
}

/**
 * Query options for tag-based searches.
 */
export interface TagQueryOptions {
  /** Match all specified tags (AND logic) */
  matchAll?: Tag[];
  /** Match any of the specified tags (OR logic) */
  matchAny?: Tag[];
  /** Exclude objects with these tags */
  exclude?: Tag[];
  /** Filter by tag type */
  tagType?: TagType;
}

/**
 * Tag registry configuration.
 */
export interface TagRegistryConfig {
  /** Enable automatic tag inheritance from parents */
  enableInheritance: boolean;
  /** Allow runtime tag creation */
  allowRuntimeCreation: boolean;
  /** Validate tag combinations */
  validateCombinations: boolean;
}

const DEFAULT_REGISTRY_CONFIG: TagRegistryConfig = {
  enableInheritance: true,
  allowRuntimeCreation: true,
  validateCombinations: false,
};

/**
 * Unified Tagging System — object tagging registry with hierarchy support.
 *
 * Migrates the best of `TaggingSystem` into the unified Tag/TagSet world:
 * - Tag registration with hierarchy
 * - Object tagging with automatic ancestor inheritance
 * - Query by tags, type, and exclusion
 * - Serialization (export/import JSON)
 */
export class UnifiedTaggingSystem {
  /** Registered tag definitions */
  private definitions: Map<string, TagDefinition> = new Map();

  /** Tagged objects: objectId → TagSet */
  private objects: Map<string, TagSet> = new Map();

  /** Objects indexed by tag name for fast lookup */
  private objectsByTag: Map<string, Set<string>> = new Map();

  /** Configuration */
  private config: TagRegistryConfig;

  constructor(config: Partial<TagRegistryConfig> = {}) {
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  // ── Tag registration ─────────────────────────────────────────────────

  /**
   * Register a tag definition.
   */
  registerTag(def: TagDefinition): boolean {
    if (this.definitions.has(def.id) && !this.config.allowRuntimeCreation) {
      return false;
    }

    this.definitions.set(def.id, def);

    // Ensure index entry exists
    if (!this.objectsByTag.has(def.id)) {
      this.objectsByTag.set(def.id, new Set());
    }

    return true;
  }

  /**
   * Get a tag definition by ID.
   */
  getTagDefinition(id: string): TagDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all registered tag definitions.
   */
  getAllTagDefinitions(): TagDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get tag definitions by type.
   */
  getTagDefinitionsByType(type: TagType): TagDefinition[] {
    return this.getAllTagDefinitions().filter((d) => d.type === type);
  }

  /**
   * Get ancestor tag IDs for a given tag.
   */
  getAncestorTagIds(tagId: string): string[] {
    const ancestors: string[] = [];
    let current: string | undefined = this.definitions.get(tagId)?.parent;
    while (current) {
      ancestors.push(current);
      current = this.definitions.get(current)?.parent;
    }
    return ancestors;
  }

  /**
   * Get descendant tag IDs for a given tag.
   */
  getDescendantTagIds(tagId: string): string[] {
    const descendants: string[] = [];
    const collect = (parentId: string) => {
      const def = this.definitions.get(parentId);
      if (def?.children) {
        for (const childId of def.children) {
          if (!descendants.includes(childId)) {
            descendants.push(childId);
            collect(childId);
          }
        }
      }
    };
    collect(tagId);
    return descendants;
  }

  // ── Object tagging ───────────────────────────────────────────────────

  /**
   * Add a tag to an object.
   */
  addTagToObject(objectId: string, tagId: string): boolean {
    const def = this.definitions.get(tagId);
    if (!def && !this.config.allowRuntimeCreation) {
      return false;
    }

    let tagSet = this.objects.get(objectId);
    if (!tagSet) {
      tagSet = new TagSet();
      this.objects.set(objectId, tagSet);
    }

    // Add the tag
    const tag = def
      ? new Tag(def.id, { type: def.type, parentId: def.parent ?? null })
      : new Tag(tagId);
    tagSet.add(tag);

    // Update index
    if (!this.objectsByTag.has(tagId)) {
      this.objectsByTag.set(tagId, new Set());
    }
    this.objectsByTag.get(tagId)!.add(objectId);

    // Add inherited ancestor tags
    if (this.config.enableInheritance) {
      const ancestors = this.getAncestorTagIds(tagId);
      for (const ancestorId of ancestors) {
        const ancestorDef = this.definitions.get(ancestorId);
        const ancestorTag = ancestorDef
          ? new Tag(ancestorDef.id, { type: ancestorDef.type, parentId: ancestorDef.parent ?? null })
          : new Tag(ancestorId);
        tagSet.add(ancestorTag);

        if (!this.objectsByTag.has(ancestorId)) {
          this.objectsByTag.set(ancestorId, new Set());
        }
        this.objectsByTag.get(ancestorId)!.add(objectId);
      }
    }

    return true;
  }

  /**
   * Add multiple tags to an object.
   */
  addTagsToObject(objectId: string, tagIds: string[]): boolean {
    let success = true;
    for (const tagId of tagIds) {
      if (!this.addTagToObject(objectId, tagId)) {
        success = false;
      }
    }
    return success;
  }

  /**
   * Remove a tag from an object.
   */
  removeTagFromObject(objectId: string, tagId: string): boolean {
    const tagSet = this.objects.get(objectId);
    if (!tagSet) return false;

    tagSet.remove(new Tag(tagId));

    // Remove from index
    const objSet = this.objectsByTag.get(tagId);
    if (objSet) {
      objSet.delete(objectId);
    }

    return true;
  }

  /**
   * Remove an object from the tagging system entirely.
   */
  removeObject(objectId: string): boolean {
    const tagSet = this.objects.get(objectId);
    if (!tagSet) return false;

    for (const tag of tagSet) {
      const objSet = this.objectsByTag.get(tag.name);
      if (objSet) {
        objSet.delete(objectId);
      }
    }

    this.objects.delete(objectId);
    return true;
  }

  /**
   * Get all tags for an object as a TagSet.
   */
  getObjectTags(objectId: string): TagSet {
    const tagSet = this.objects.get(objectId);
    return tagSet ? tagSet.clone() : new TagSet();
  }

  /**
   * Check if an object has a specific tag (hierarchy-aware).
   */
  objectHasTag(objectId: string, tagId: string): boolean {
    const tagSet = this.objects.get(objectId);
    if (!tagSet) return false;
    return tagSet.contains(new Tag(tagId));
  }

  // ── Query ────────────────────────────────────────────────────────────

  /**
   * Query objects by tags.
   */
  queryObjects(options: TagQueryOptions): string[] {
    let candidateIds: Set<string>;

    // AND logic
    if (options.matchAll && options.matchAll.length > 0) {
      candidateIds = new Set(
        this.objectsByTag.get(options.matchAll[0].name) ?? [],
      );
      for (let i = 1; i < options.matchAll.length; i++) {
        const tagSet = this.objectsByTag.get(options.matchAll[i].name) ?? new Set();
        candidateIds = new Set([...candidateIds].filter((id) => tagSet.has(id)));
      }
    }
    // OR logic
    else if (options.matchAny && options.matchAny.length > 0) {
      candidateIds = new Set();
      for (const tag of options.matchAny) {
        const objSet = this.objectsByTag.get(tag.name) ?? new Set();
        objSet.forEach((id) => candidateIds.add(id));
      }
    }
    // No tag filter
    else {
      candidateIds = new Set(this.objects.keys());
    }

    // Exclusion filter
    if (options.exclude && options.exclude.length > 0) {
      const excludeIds = new Set<string>();
      for (const tag of options.exclude) {
        const objSet = this.objectsByTag.get(tag.name) ?? new Set();
        objSet.forEach((id) => excludeIds.add(id));
      }
      candidateIds = new Set([...candidateIds].filter((id) => !excludeIds.has(id)));
    }

    // Type filter
    if (options.tagType) {
      const validTagIds = new Set(
        this.getTagDefinitionsByType(options.tagType).map((d) => d.id),
      );
      candidateIds = new Set(
        [...candidateIds].filter((id) => {
          const tagSet = this.objects.get(id);
          if (!tagSet) return false;
          return tagSet.toArray().some((t) => validTagIds.has(t.name));
        }),
      );
    }

    return Array.from(candidateIds);
  }

  // ── Serialization ────────────────────────────────────────────────────

  /**
   * Export the tagging system to a JSON string.
   */
  exportToJSON(): string {
    const data = {
      definitions: this.getAllTagDefinitions(),
      objects: Array.from(this.objects.entries()).map(([id, tagSet]) => ({
        objectId: id,
        tags: tagSet.toArray().map((t) => t.toString()),
      })),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import the tagging system from a JSON string.
   */
  importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);

      if (data.definitions) {
        for (const def of data.definitions) {
          this.registerTag(def);
        }
      }

      if (data.objects) {
        for (const obj of data.objects) {
          for (const tagStr of obj.tags) {
            this.addTagToObject(obj.objectId, tagStr);
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /** Clear all registered tags and objects. */
  clear(): void {
    this.definitions.clear();
    this.objects.clear();
    this.objectsByTag.clear();
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a new UnifiedTaggingSystem instance.
 */
export function createUnifiedTaggingSystem(
  config?: Partial<TagRegistryConfig>,
): UnifiedTaggingSystem {
  return new UnifiedTaggingSystem(config);
}

// ---------------------------------------------------------------------------
// End of UnifiedTagSystem
// ---------------------------------------------------------------------------
//
// The deprecated shim classes (DeprecatedSemantics, DeprecatedSubpart,
// DeprecatedConstraintTag) have been removed. Consumers should import
// Semantics, Subpart, Tag, and TagSet directly from this module.

/**
 * @deprecated Import `Tag` from `core/UnifiedTagSystem` instead.
 * This interface is provided for backward compatibility with
 * `core/util/TaggingSystem.ts`.
 */
export interface DeprecatedTagInfo {
  /** @deprecated Use unified `Tag` instead */
  id: string;
  /** @deprecated Use unified `Tag` instead */
  name: string;
  /** @deprecated Use unified `Tag` instead */
  type: TagType;
  /** @deprecated Use unified `Tag` instead */
  parent?: string;
  /** @deprecated Use unified `Tag` instead */
  children?: string[];
  /** @deprecated Use unified `Tag` instead */
  metadata?: Record<string, unknown>;
  /** @deprecated Use unified `Tag` instead */
  combinable: boolean;
}
