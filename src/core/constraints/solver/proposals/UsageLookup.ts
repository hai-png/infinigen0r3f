/**
 * Usage Lookup — Asset Factory ↔ Tag Usage Bidirectional Mapping
 *
 * Ports: infinigen/core/constraints/example_solver/usage_lookup.py
 *
 * Provides a bidirectional mapping between asset factories and the tags
 * they consume/produce. This is essential for the constraint solver to:
 *
 * 1. Given a tag requirement (e.g., "needs a surface with tag 'floor'"),
 *    quickly find which asset factories can satisfy it
 * 2. Given an asset factory, determine what tags it provides and requires
 * 3. During solving, efficiently match constraint tag queries to candidate objects
 *
 * The original Infinigen uses this in propose_relations to find objects
 * that match the child_tags/parent_tags subpart specifications, and in
 * the populate system to find appropriate assets for placeholders.
 *
 * Architecture:
 * - AssetFactoryRegistry: Registry of all asset factories with their tag profiles
 * - TagUsageLookup: Bidirectional index for fast tag → factory and factory → tag queries
 * - UsageQuery: Query builder for complex tag-based lookups
 */

import { Tag, TagSet } from '../../unified/UnifiedConstraintSystem';
import { SeededRandom } from '../../../util/MathUtils';

// ============================================================================
// AssetFactoryProfile — Tag profile for an asset factory
// ============================================================================

/**
 * Describes the tag profile of an asset factory.
 *
 * An asset factory is a procedural generator (e.g., ChairGenerator,
 * TableFactory) that produces 3D objects with specific semantic properties.
 * The profile describes what tags the generated objects will have and what
 * tags they require from their environment.
 */
export interface AssetFactoryProfile {
  /** Unique identifier for this factory */
  factoryId: string;

  /** Human-readable name (e.g., "ChairGenerator", "TableFactory") */
  displayName: string;

  /** Category of objects this factory produces (e.g., "furniture", "decor") */
  category: string;

  /**
   * Tags that objects produced by this factory WILL have.
   * Used for matching: when a constraint requires a "chair", we look
   * for factories whose providesTags include SemanticsTag("chair").
   */
  providesTags: TagSet;

  /**
   * Tags that objects produced by this factory REQUIRE from their
   * environment (parent objects). E.g., a chair requires a floor
   * surface to sit on, so it needs "floor" or "flat_surface".
   */
  requiresTags: TagSet;

  /**
   * Tags that objects produced by this factory are INCOMPATIBLE with.
   * E.g., an outdoor chair might have excludedTags("indoor") to
   * prevent placement in indoor scenes.
   */
  excludedTags: TagSet;

  /** Typical dimensions of objects from this factory (bounding box) */
  typicalSize: {
    width: [number, number];  // min, max
    height: [number, number];
    depth: [number, number];
  };

  /** Priority weight for this factory (higher = preferred when multiple match) */
  priority: number;

  /** Maximum number of instances this factory should produce per scene */
  maxInstances: number;
}

// ============================================================================
// AssetFactoryRegistry — Registry of all asset factories
// ============================================================================

/**
 * Registry of asset factory profiles.
 *
 * Stores all known asset factories and their tag profiles.
 * Provides lookup by ID and iteration over all factories.
 */
export class AssetFactoryRegistry {
  private factories: Map<string, AssetFactoryProfile> = new Map();

  /**
   * Register an asset factory profile.
   */
  register(profile: AssetFactoryProfile): void {
    this.factories.set(profile.factoryId, profile);
  }

  /**
   * Get a factory profile by ID.
   */
  get(factoryId: string): AssetFactoryProfile | undefined {
    return this.factories.get(factoryId);
  }

  /**
   * Check if a factory is registered.
   */
  has(factoryId: string): boolean {
    return this.factories.has(factoryId);
  }

  /**
   * Get all registered factory IDs.
   */
  getFactoryIds(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get all factory profiles.
   */
  getAll(): AssetFactoryProfile[] {
    return Array.from(this.factories.values());
  }

  /**
   * Get factories by category.
   */
  getByCategory(category: string): AssetFactoryProfile[] {
    return Array.from(this.factories.values())
      .filter(f => f.category === category);
  }

  /**
   * Remove a factory by ID.
   */
  unregister(factoryId: string): boolean {
    return this.factories.delete(factoryId);
  }

  /**
   * Get the number of registered factories.
   */
  get size(): number {
    return this.factories.size;
  }
}

// ============================================================================
// TagUsageLookup — Bidirectional tag → factory index
// ============================================================================

/**
 * Bidirectional lookup index between tags and asset factories.
 *
 * Provides O(1) lookup for:
 * - tag → set of factories that provide this tag
 * - tag → set of factories that require this tag
 * - factory → set of tags it provides
 * - factory → set of tags it requires
 *
 * This is the core data structure that makes constraint-guided
 * object placement efficient. Without it, every constraint evaluation
 * would need to scan all factories linearly.
 */
export class TagUsageLookup {
  /** Index: tag key → set of factory IDs that provide this tag */
  private providesIndex: Map<string, Set<string>> = new Map();

  /** Index: tag key → set of factory IDs that require this tag */
  private requiresIndex: Map<string, Set<string>> = new Map();

  /** Index: tag key → set of factory IDs that exclude this tag */
  private excludesIndex: Map<string, Set<string>> = new Map();

  /** Index: factory ID → set of tag keys it provides */
  private factoryProvidesIndex: Map<string, Set<string>> = new Map();

  /** Index: factory ID → set of tag keys it requires */
  private factoryRequiresIndex: Map<string, Set<string>> = new Map();

  /** Reference to the factory registry */
  private registry: AssetFactoryRegistry;

  constructor(registry: AssetFactoryRegistry) {
    this.registry = registry;
    this.rebuildIndex();
  }

  /**
   * Rebuild the lookup index from the registry.
   *
   * Call this after modifying the registry (adding/removing factories).
   */
  rebuildIndex(): void {
    // Clear existing indices
    this.providesIndex.clear();
    this.requiresIndex.clear();
    this.excludesIndex.clear();
    this.factoryProvidesIndex.clear();
    this.factoryRequiresIndex.clear();

    // Build indices from all registered factories
    for (const profile of this.registry.getAll()) {
      this.indexFactory(profile);
    }
  }

  /**
   * Find all factories that provide a specific tag.
   *
   * @param tag - The tag to search for
   * @returns Set of factory IDs that provide objects with this tag
   */
  findFactoriesProvidingTag(tag: Tag): Set<string> {
    const key = tag.toString();
    return this.providesIndex.get(key) ?? new Set();
  }

  /**
   * Find all factories that require a specific tag from their environment.
   *
   * @param tag - The tag to search for
   * @returns Set of factory IDs that require this tag from parents
   */
  findFactoriesRequiringTag(tag: Tag): Set<string> {
    const key = tag.toString();
    return this.requiresIndex.get(key) ?? new Set();
  }

  /**
   * Find all factories that are compatible with a given set of parent tags.
   *
   * A factory is compatible if:
   * 1. All of its requiresTags are satisfied by parentTags
   * 2. None of its excludedTags are present in parentTags
   *
   * @param parentTags - Tags of the parent object/environment
   * @param categoryFilter - Optional category filter (only return factories in this category)
   * @returns Array of matching factory profiles, sorted by priority (highest first)
   */
  findCompatibleFactories(
    parentTags: TagSet,
    categoryFilter?: string,
  ): AssetFactoryProfile[] {
    const results: Array<{ profile: AssetFactoryProfile; score: number }> = [];

    for (const profile of this.registry.getAll()) {
      // Category filter
      if (categoryFilter && profile.category !== categoryFilter) continue;

      // Check requires: all required tags must be in parentTags
      let requiresSatisfied = true;
      let matchScore = 0;
      for (const tag of profile.requiresTags) {
        if (!parentTags.matches(tag)) {
          requiresSatisfied = false;
          break;
        }
        matchScore += 1;
      }
      if (!requiresSatisfied) continue;

      // Check excludes: no excluded tags should be in parentTags
      let excluded = false;
      for (const tag of profile.excludedTags) {
        if (parentTags.matches(tag)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      // Compute match score
      for (const tag of profile.providesTags) {
        if (parentTags.matches(tag)) {
          matchScore += 2; // Bonus for provided tag matching parent
        }
      }

      results.push({
        profile,
        score: matchScore + profile.priority,
      });
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.profile);
  }

  /**
   * Find factories that can satisfy a constraint's tag requirements.
   *
   * Given a constraint's child_tags and parent_tags, find factories
   * whose objects have the right tags (child) and can be placed in
   * environments with the right tags (parent).
   *
   * @param childTagRequirements - Tags the child object must have
   * @param parentTagRequirements - Tags the parent/environment must have
   * @returns Array of matching factory profiles
   */
  findFactoriesForConstraint(
    childTagRequirements: TagSet,
    parentTagRequirements: TagSet,
  ): AssetFactoryProfile[] {
    const results: AssetFactoryProfile[] = [];

    for (const profile of this.registry.getAll()) {
      // Check that the factory provides all required child tags
      let childMatch = true;
      for (const reqTag of childTagRequirements) {
        let found = false;
        for (const provTag of profile.providesTags) {
          if (reqTag.matches(provTag) || provTag.matches(reqTag)) {
            found = true;
            break;
          }
        }
        if (!found) {
          childMatch = false;
          break;
        }
      }
      if (!childMatch) continue;

      // Check that the factory requires (or is compatible with) the parent tags
      let parentCompatible = true;
      for (const reqTag of profile.requiresTags) {
        if (!parentTagRequirements.matches(reqTag)) {
          parentCompatible = false;
          break;
        }
      }
      if (!parentCompatible) continue;

      results.push(profile);
    }

    return results;
  }

  /**
   * Get the tags provided by a specific factory.
   */
  getFactoryProvidesTags(factoryId: string): Set<string> {
    return this.factoryProvidesIndex.get(factoryId) ?? new Set();
  }

  /**
   * Get the tags required by a specific factory.
   */
  getFactoryRequiresTags(factoryId: string): Set<string> {
    return this.factoryRequiresIndex.get(factoryId) ?? new Set();
  }

  /**
   * Select a random factory from a set of candidates, weighted by priority.
   */
  selectWeightedRandom(
    candidates: AssetFactoryProfile[],
    rng: SeededRandom,
  ): AssetFactoryProfile | null {
    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, c) => sum + c.priority, 0);
    let r = rng.next() * totalWeight;

    for (const candidate of candidates) {
      r -= candidate.priority;
      if (r <= 0) return candidate;
    }

    return candidates[candidates.length - 1];
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Index a single factory profile into the lookup tables.
   */
  private indexFactory(profile: AssetFactoryProfile): void {
    const providesKeys = new Set<string>();
    const requiresKeys = new Set<string>();

    // Index providesTags
    for (const tag of profile.providesTags) {
      const key = tag.toString();
      providesKeys.add(key);

      if (!this.providesIndex.has(key)) {
        this.providesIndex.set(key, new Set());
      }
      this.providesIndex.get(key)!.add(profile.factoryId);
    }

    // Index requiresTags
    for (const tag of profile.requiresTags) {
      const key = tag.toString();
      requiresKeys.add(key);

      if (!this.requiresIndex.has(key)) {
        this.requiresIndex.set(key, new Set());
      }
      this.requiresIndex.get(key)!.add(profile.factoryId);
    }

    // Index excludedTags
    for (const tag of profile.excludedTags) {
      const key = tag.toString();

      if (!this.excludesIndex.has(key)) {
        this.excludesIndex.set(key, new Set());
      }
      this.excludesIndex.get(key)!.add(profile.factoryId);
    }

    // Store reverse indices
    this.factoryProvidesIndex.set(profile.factoryId, providesKeys);
    this.factoryRequiresIndex.set(profile.factoryId, requiresKeys);
  }
}

// ============================================================================
// Default Factory Profiles — Common furniture/object types
// ============================================================================

/**
 * Create a default set of asset factory profiles for indoor scenes.
 */
export function createDefaultFactoryProfiles(): AssetFactoryProfile[] {
  return [
    {
      factoryId: 'chair_generator',
      displayName: 'Chair Generator',
      category: 'furniture',
      providesTags: new TagSet([new Tag('chair'), new Tag('furniture'), new Tag('sitting')]),
      requiresTags: new TagSet([new Tag('floor'), new Tag('flat')]),
      excludedTags: new TagSet([new Tag('wall')]),
      typicalSize: { width: [0.4, 0.6], height: [0.8, 1.0], depth: [0.4, 0.6] },
      priority: 5,
      maxInstances: 10,
    },
    {
      factoryId: 'table_generator',
      displayName: 'Table Generator',
      category: 'furniture',
      providesTags: new TagSet([new Tag('table'), new Tag('furniture'), new Tag('surface')]),
      requiresTags: new TagSet([new Tag('floor'), new Tag('flat')]),
      excludedTags: new TagSet([new Tag('wall')]),
      typicalSize: { width: [0.8, 1.8], height: [0.7, 0.8], depth: [0.6, 1.0] },
      priority: 5,
      maxInstances: 5,
    },
    {
      factoryId: 'lamp_generator',
      displayName: 'Lamp Generator',
      category: 'lighting',
      providesTags: new TagSet([new Tag('lamp'), new Tag('lighting'), new Tag('decor')]),
      requiresTags: new TagSet([new Tag('flat')]),
      excludedTags: new TagSet(),
      typicalSize: { width: [0.2, 0.4], height: [0.3, 1.5], depth: [0.2, 0.4] },
      priority: 3,
      maxInstances: 8,
    },
    {
      factoryId: 'shelf_generator',
      displayName: 'Shelf Generator',
      category: 'furniture',
      providesTags: new TagSet([new Tag('shelf'), new Tag('furniture'), new Tag('storage'), new Tag('surface')]),
      requiresTags: new TagSet([new Tag('wall')]),
      excludedTags: new TagSet(),
      typicalSize: { width: [0.6, 1.2], height: [0.8, 1.8], depth: [0.25, 0.35] },
      priority: 4,
      maxInstances: 4,
    },
    {
      factoryId: 'rug_generator',
      displayName: 'Rug Generator',
      category: 'decor',
      providesTags: new TagSet([new Tag('rug'), new Tag('decor'), new Tag('floor_covering')]),
      requiresTags: new TagSet([new Tag('floor')]),
      excludedTags: new TagSet([new Tag('wall')]),
      typicalSize: { width: [1.0, 3.0], height: [0.01, 0.03], depth: [1.0, 2.0] },
      priority: 2,
      maxInstances: 3,
    },
    {
      factoryId: 'sofa_generator',
      displayName: 'Sofa Generator',
      category: 'furniture',
      providesTags: new TagSet([new Tag('sofa'), new Tag('furniture'), new Tag('sitting')]),
      requiresTags: new TagSet([new Tag('floor'), new Tag('flat')]),
      excludedTags: new TagSet([new Tag('wall')]),
      typicalSize: { width: [1.5, 2.5], height: [0.8, 1.0], depth: [0.7, 1.0] },
      priority: 4,
      maxInstances: 2,
    },
    {
      factoryId: 'bed_generator',
      displayName: 'Bed Generator',
      category: 'furniture',
      providesTags: new TagSet([new Tag('bed'), new Tag('furniture'), new Tag('sleeping')]),
      requiresTags: new TagSet([new Tag('floor'), new Tag('flat')]),
      excludedTags: new TagSet([new Tag('wall')]),
      typicalSize: { width: [1.0, 1.8], height: [0.4, 0.6], depth: [1.8, 2.2] },
      priority: 5,
      maxInstances: 2,
    },
    {
      factoryId: 'picture_generator',
      displayName: 'Picture Frame Generator',
      category: 'decor',
      providesTags: new TagSet([new Tag('picture'), new Tag('decor'), new Tag('wall_art')]),
      requiresTags: new TagSet([new Tag('wall')]),
      excludedTags: new TagSet([new Tag('floor')]),
      typicalSize: { width: [0.3, 0.8], height: [0.3, 0.6], depth: [0.02, 0.05] },
      priority: 2,
      maxInstances: 6,
    },
    {
      factoryId: 'plant_generator',
      displayName: 'Plant Generator',
      category: 'decor',
      providesTags: new TagSet([new Tag('plant'), new Tag('decor'), new Tag('natural')]),
      requiresTags: new TagSet([new Tag('flat')]),
      excludedTags: new TagSet(),
      typicalSize: { width: [0.2, 0.5], height: [0.3, 1.5], depth: [0.2, 0.5] },
      priority: 2,
      maxInstances: 5,
    },
    {
      factoryId: 'vase_generator',
      displayName: 'Vase Generator',
      category: 'decor',
      providesTags: new TagSet([new Tag('vase'), new Tag('decor')]),
      requiresTags: new TagSet([new Tag('flat')]),
      excludedTags: new TagSet(),
      typicalSize: { width: [0.1, 0.25], height: [0.15, 0.4], depth: [0.1, 0.25] },
      priority: 1,
      maxInstances: 5,
    },
  ];
}
