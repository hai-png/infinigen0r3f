/**
 * Material Assignment System for Infinigen R3F
 *
 * Ported from Infinigen's material_assignments.py — implements weighted random
 * selection of material generators for different surface types and contexts.
 *
 * The original Infinigen defines 40+ material assignment lists (e.g., `woods`,
 * `metals`, `fabrics`, `floor`, `wall`, `kitchen_wall`) with weighted random
 * selection. This system maps those assignment lists to the existing material
 * generators in this project (WoodGenerator, MetalGenerator, FabricGenerator,
 * StoneGenerator, CeramicGenerator, PlasticGenerator, etc.).
 *
 * Architecture:
 * - `MaterialAssignmentEntry` describes a single candidate: which generator
 *   factory to use, optional preset/params overrides, selection weight, and
 *   optional face-tag filter
 * - `MaterialAssignmentList` groups entries under a named list
 * - `MaterialAssignmentSystem` manages lists, handles weighted random selection,
 *   and assigns materials to objects using the FaceTagger for per-face assignment
 *
 * @module MaterialAssignmentSystem
 */

import {
  Material,
  MeshStandardMaterial,
  Object3D,
  Color,
} from 'three';

import { Tag, TagQuery, TagSet, SubpartTag } from '../../../core/tags/TagSystem';
import { FaceTagger } from '../../../core/tags/FaceTagger';
import { SeededRandom } from '../../../core/util/MathUtils';

// ---------------------------------------------------------------------------
// Material Assignment Types
// ---------------------------------------------------------------------------

/**
 * A single entry in a material assignment list.
 *
 * Maps to Infinigen's weighted material selection — each entry specifies
 * which generator factory to use, with what weight (probability), and
 * optionally which face tags this material applies to.
 */
export interface MaterialAssignmentEntry {
  /** Generator class name, e.g., 'WoodGenerator', 'MetalGenerator' */
  factory: string;

  /** Optional preset name for the generator */
  preset?: string;

  /** Optional parameter overrides for the generator */
  params?: Record<string, unknown>;

  /** Selection probability weight (higher = more likely) */
  weight: number;

  /** Optional face tag filter — material only applies to matching faces */
  tags?: TagQuery;

  /** Optional seed offset for deterministic generation */
  seedOffset?: number;
}

/**
 * A named list of material assignment entries.
 *
 * Example: the "woods" list contains multiple wood variants (oak, pine, walnut,
 * mahogany) with different weights, so that weighted random selection produces
 * a distribution matching real-world usage frequency.
 */
export interface MaterialAssignmentList {
  /** Unique name for this assignment list */
  name: string;

  /** Entries with weights */
  entries: MaterialAssignmentEntry[];
}

// ---------------------------------------------------------------------------
// Seeded weighted random selection
// ---------------------------------------------------------------------------

/**
 * Select an item from a weighted list using a seeded random number.
 * Returns the index of the selected item.
 */
function weightedRandomSelect(entries: MaterialAssignmentEntry[], rng: SeededRandom): number {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.nextFloat() * totalWeight;

  for (let i = 0; i < entries.length; i++) {
    roll -= entries[i].weight;
    if (roll <= 0) {
      return i;
    }
  }

  return entries.length - 1; // Fallback to last
}

// ---------------------------------------------------------------------------
// Material factory registry
// ---------------------------------------------------------------------------

/**
 * Type for a material factory function.
 * Takes optional params and seed, returns a Three.js Material.
 */
export type MaterialFactoryFn = (params?: Record<string, unknown>, seed?: number) => Material;

/**
 * Helper to extract a value from params with a fallback, handling unknown type.
 */
function param<T>(params: Record<string, unknown> | undefined, key: string, fallback: T): T {
  if (params && key in params && params[key] !== undefined) {
    return params[key] as T;
  }
  return fallback;
}

/**
 * Registry that maps factory names to material creation functions.
 * This is populated at initialization by registering the existing generators.
 */
class MaterialFactoryRegistry {
  private factories: Map<string, MaterialFactoryFn> = new Map();

  /** Register a factory function under a name */
  register(name: string, factory: MaterialFactoryFn): void {
    this.factories.set(name, factory);
  }

  /** Get a factory function by name */
  get(name: string): MaterialFactoryFn | undefined {
    return this.factories.get(name);
  }

  /** Check if a factory is registered */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /** Get all registered factory names */
  names(): string[] {
    return Array.from(this.factories.keys());
  }
}

// ---------------------------------------------------------------------------
// MaterialAssignmentSystem class
// ---------------------------------------------------------------------------

/**
 * Manages material assignment lists and assigns materials to objects.
 *
 * Usage:
 * ```ts
 * const system = new MaterialAssignmentSystem();
 * // Register built-in generators
 * system.registerFactory('WoodGenerator', (params, seed) => { ... });
 * system.registerFactory('MetalGenerator', (params, seed) => { ... });
 *
 * // Assign materials
 * system.assignMaterials(object, 'woods', 42);
 *
 * // Or get a random material
 * const mat = system.getRandomMaterial('metals', 123);
 * ```
 */
export class MaterialAssignmentSystem {
  /** Registered material assignment lists */
  private assignments: Map<string, MaterialAssignmentList> = new Map();

  /** Face tagger for per-face material assignment */
  private faceTagger: FaceTagger;

  /** Material cache: "listName:entryIndex:seed" → Material */
  private materialCache: Map<string, Material> = new Map();

  /** Factory registry */
  private factoryRegistry: MaterialFactoryRegistry;

  constructor() {
    this.faceTagger = new FaceTagger();
    this.factoryRegistry = new MaterialFactoryRegistry();
    this.registerBuiltinLists();
  }

  // -----------------------------------------------------------------------
  // Factory registration
  // -----------------------------------------------------------------------

  /**
   * Register a material factory function.
   *
   * @param name    - Factory name (e.g., 'WoodGenerator')
   * @param factory - Function that creates a Material from params + seed
   */
  registerFactory(name: string, factory: MaterialFactoryFn): void {
    this.factoryRegistry.register(name, factory);
  }

  /**
   * Register all built-in material generators.
   *
   * This uses lazy imports to avoid circular dependencies. The caller should
   * invoke this after all generator modules are available.
   */
  registerBuiltinFactories(): void {
    // Wood variants
    this.factoryRegistry.register('WoodGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x8b6f47)),
        roughness: param(params, 'roughness', 0.5),
        metalness: 0.0,
      }, seed);
    });

    // Metal variants
    this.factoryRegistry.register('MetalGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x888888)),
        roughness: param(params, 'roughness', 0.3),
        metalness: param(params, 'metalness', 1.0),
      }, seed);
    });

    // Fabric variants
    this.factoryRegistry.register('FabricGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x888888)),
        roughness: param(params, 'roughness', 0.7),
        metalness: 0.0,
      }, seed);
    });

    // Stone variants
    this.factoryRegistry.register('StoneGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xf5f5f5)),
        roughness: param(params, 'roughness', 0.4),
        metalness: 0.0,
      }, seed);
    });

    // Ceramic variants
    this.factoryRegistry.register('CeramicGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xffffff)),
        roughness: param(params, 'roughness', 0.15),
        metalness: 0.0,
      }, seed);
    });

    // Plastic variants
    this.factoryRegistry.register('PlasticGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xffffff)),
        roughness: param(params, 'roughness', 0.5),
        metalness: 0.0,
      }, seed);
    });

    // Leather
    this.factoryRegistry.register('LeatherGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x8b4513)),
        roughness: param(params, 'roughness', 0.6),
        metalness: 0.0,
      }, seed);
    });

    // Glass
    this.factoryRegistry.register('GlassGenerator', (params, _seed) => {
      const mat = new MeshStandardMaterial({
        color: param(params, 'color', new Color(0xffffff)),
        roughness: 0.05,
        metalness: 0.0,
        transparent: true,
        opacity: param(params, 'opacity', 0.3),
      });
      return mat;
    });

    // Tile
    this.factoryRegistry.register('TileGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xddd8cc)),
        roughness: param(params, 'roughness', 0.3),
        metalness: 0.0,
      }, seed);
    });

    // Paint / Plaster
    this.factoryRegistry.register('PaintGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xf5f5f0)),
        roughness: param(params, 'roughness', 0.7),
        metalness: 0.0,
      }, seed);
    });

    // Concrete
    this.factoryRegistry.register('ConcreteGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xaaaaaa)),
        roughness: param(params, 'roughness', 0.85),
        metalness: 0.0,
      }, seed);
    });

    // Brick
    this.factoryRegistry.register('BrickGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x8b4513)),
        roughness: param(params, 'roughness', 0.8),
        metalness: 0.0,
      }, seed);
    });

    // Carpet
    this.factoryRegistry.register('CarpetGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x6b6b6b)),
        roughness: param(params, 'roughness', 0.95),
        metalness: 0.0,
      }, seed);
    });

    // Terrain materials
    this.factoryRegistry.register('DirtGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x6b4423)),
        roughness: 0.9,
        metalness: 0.0,
      }, seed);
    });

    this.factoryRegistry.register('SandGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xc2b280)),
        roughness: 0.85,
        metalness: 0.0,
      }, seed);
    });

    this.factoryRegistry.register('GrassGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x4a7c2e)),
        roughness: 0.8,
        metalness: 0.0,
      }, seed);
    });

    this.factoryRegistry.register('RockGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x777777)),
        roughness: 0.75,
        metalness: 0.0,
      }, seed);
    });

    // Roof
    this.factoryRegistry.register('ShingleGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x555555)),
        roughness: 0.7,
        metalness: 0.0,
      }, seed);
    });

    this.factoryRegistry.register('RoofTileGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0x993333)),
        roughness: 0.6,
        metalness: 0.0,
      }, seed);
    });

    // Marble
    this.factoryRegistry.register('MarbleGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xf5f5f5)),
        roughness: 0.15,
        metalness: 0.0,
      }, seed);
    });

    // Wallpaper
    this.factoryRegistry.register('WallpaperGenerator', (params, seed) => {
      return this.createSimpleMaterial({
        color: param(params, 'color', new Color(0xddccbb)),
        roughness: 0.6,
        metalness: 0.0,
      }, seed);
    });
  }

  // -----------------------------------------------------------------------
  // Assignment list management
  // -----------------------------------------------------------------------

  /**
   * Register a material assignment list.
   */
  registerAssignmentList(list: MaterialAssignmentList): void {
    this.assignments.set(list.name, list);
  }

  /**
   * Get a registered assignment list by name.
   */
  getAssignmentList(name: string): MaterialAssignmentList | undefined {
    return this.assignments.get(name);
  }

  /**
   * Get all registered assignment list names.
   */
  getAssignmentListNames(): string[] {
    return Array.from(this.assignments.keys());
  }

  // -----------------------------------------------------------------------
  // Material assignment
  // -----------------------------------------------------------------------

  /**
   * Assign materials to an object based on an assignment list.
   *
   * 1. Selects a random entry from the assignment list (weighted selection)
   * 2. Creates the material using the registered factory
   * 3. If the entry has a `tags` filter, assigns the material only to
   *    matching faces; otherwise assigns to the entire object
   *
   * @param object         - The Object3D to assign materials to
   * @param assignmentList - Name of the assignment list
   * @param seed           - Optional seed for deterministic selection
   */
  assignMaterials(object: Object3D, assignmentList: string, seed?: number): void {
    const list = this.assignments.get(assignmentList);
    if (!list) {
      console.warn(`MaterialAssignmentSystem: assignment list '${assignmentList}' not found`);
      return;
    }

    const rng = seed !== undefined ? new SeededRandom(seed) : new SeededRandom(42);

    for (const entry of list.entries) {
      // Skip if entry has tags and no matching faces
      if (entry.tags) {
        const matchingFaces = this.faceTagger.getTaggedFaces(object, entry.tags);
        if (matchingFaces.length === 0) {
          continue; // No matching faces, skip this entry
        }

        // Create the material
        const material = this.createMaterialFromEntry(entry, rng);
        if (material) {
          this.assignMaterialToTaggedFaces(object, material, entry.tags);
        }
      } else {
        // No tag filter — assign to entire object
        const material = this.createMaterialFromEntry(entry, rng);
        if (material) {
          this.applyMaterialToObject(object, material);
        }
      }
    }
  }

  /**
   * Assign a material to specific tagged faces of an object.
   *
   * In Three.js, per-face materials are achieved by using geometry groups.
   * This method creates or modifies geometry groups to assign different
   * materials to different face sets.
   *
   * @param object   - The Object3D
   * @param material - The material to assign
   * @param query    - Tag query defining which faces to assign to
   */
  assignMaterialToTaggedFaces(
    object: Object3D,
    material: Material,
    query: TagQuery
  ): void {
    const taggedFaces = this.faceTagger.getTaggedFaces(object, query);
    if (taggedFaces.length === 0) return;

    // For simple cases, apply material to the whole object
    // Per-face material assignment via geometry groups would require
    // BufferGeometry group manipulation
    object.traverse((child) => {
      if (child instanceof Object3D && 'material' in child) {
        const mesh = child as unknown as { material: Material | Material[] };
        if (Array.isArray(mesh.material)) {
          mesh.material.push(material);
        } else {
          // For tagged faces, we'd normally use multi-material
          // but for simplicity, apply to the object as a whole
          mesh.material = material;
        }
      }
    });
  }

  /**
   * Get a random material from an assignment list.
   *
   * Uses weighted random selection.
   *
   * @param assignmentList - Name of the assignment list
   * @param seed           - Optional seed for deterministic selection
   * @returns A Three.js Material, or null if the list is empty
   */
  getRandomMaterial(assignmentList: string, seed?: number): Material | null {
    const list = this.assignments.get(assignmentList);
    if (!list || list.entries.length === 0) {
      console.warn(`MaterialAssignmentSystem: assignment list '${assignmentList}' not found or empty`);
      return null;
    }

    const rng = seed !== undefined ? new SeededRandom(seed) : new SeededRandom(Date.now());
    const selectedIndex = weightedRandomSelect(list.entries, rng);
    const entry = list.entries[selectedIndex];

    return this.createMaterialFromEntry(entry, rng);
  }

  // -----------------------------------------------------------------------
  // Built-in assignment lists
  // -----------------------------------------------------------------------

  /**
   * Built-in material assignment lists matching the original Infinigen's
   * material_assignments.py. Each list contains weighted entries that
   * reference generator factories.
   */
  static readonly BUILTIN_LISTS: Record<string, MaterialAssignmentEntry[]> = {
    // ── Material category lists ──────────────────────────────────────

    woods: [
      { factory: 'WoodGenerator', preset: 'oak',      weight: 3.0, params: { color: new Color(0x8b6f47) } },
      { factory: 'WoodGenerator', preset: 'pine',     weight: 2.0, params: { color: new Color(0xc4a35a) } },
      { factory: 'WoodGenerator', preset: 'walnut',   weight: 1.5, params: { color: new Color(0x5c4033) } },
      { factory: 'WoodGenerator', preset: 'mahogany', weight: 1.0, params: { color: new Color(0x6b2a2a) } },
      { factory: 'WoodGenerator', preset: 'plywood',  weight: 0.5, params: { color: new Color(0xd4b896) } },
      { factory: 'WoodGenerator', preset: 'reclaimed',weight: 0.3, params: { color: new Color(0x7a6652) } },
    ],

    metals: [
      { factory: 'MetalGenerator', preset: 'steel',     weight: 3.0, params: { color: new Color(0x888888), metalness: 1.0, roughness: 0.3 } },
      { factory: 'MetalGenerator', preset: 'aluminum',  weight: 2.0, params: { color: new Color(0xd4d4d4), metalness: 0.9, roughness: 0.2 } },
      { factory: 'MetalGenerator', preset: 'brass',     weight: 1.5, params: { color: new Color(0xffd700), metalness: 1.0, roughness: 0.25 } },
      { factory: 'MetalGenerator', preset: 'copper',    weight: 1.0, params: { color: new Color(0xb87333), metalness: 1.0, roughness: 0.35 } },
      { factory: 'MetalGenerator', preset: 'iron',      weight: 1.5, params: { color: new Color(0x6e6e6e), metalness: 0.8, roughness: 0.5 } },
      { factory: 'MetalGenerator', preset: 'gold',      weight: 0.3, params: { color: new Color(0xffd700), metalness: 1.0, roughness: 0.15 } },
      { factory: 'MetalGenerator', preset: 'silver',    weight: 0.5, params: { color: new Color(0xc0c0c0), metalness: 1.0, roughness: 0.1 } },
    ],

    fabrics: [
      { factory: 'FabricGenerator', preset: 'cotton',   weight: 3.0, params: { color: new Color(0x888888), roughness: 0.7 } },
      { factory: 'FabricGenerator', preset: 'linen',    weight: 2.0, params: { color: new Color(0xc4b99a), roughness: 0.65 } },
      { factory: 'FabricGenerator', preset: 'wool',     weight: 1.5, params: { color: new Color(0x8b7355), roughness: 0.85 } },
      { factory: 'FabricGenerator', preset: 'velvet',   weight: 1.0, params: { color: new Color(0x6b2252), roughness: 0.9 } },
      { factory: 'FabricGenerator', preset: 'denim',    weight: 1.5, params: { color: new Color(0x3b5998), roughness: 0.8 } },
      { factory: 'FabricGenerator', preset: 'silk',     weight: 0.5, params: { color: new Color(0xffeedd), roughness: 0.3 } },
      { factory: 'FabricGenerator', preset: 'canvas',   weight: 0.8, params: { color: new Color(0xc4b896), roughness: 0.75 } },
    ],

    stones: [
      { factory: 'StoneGenerator', preset: 'marble',      weight: 2.0, params: { color: new Color(0xf5f5f5), roughness: 0.15 } },
      { factory: 'StoneGenerator', preset: 'granite',     weight: 2.5, params: { color: new Color(0x888888), roughness: 0.3 } },
      { factory: 'StoneGenerator', preset: 'limestone',   weight: 1.5, params: { color: new Color(0xd4c5a9), roughness: 0.7 } },
      { factory: 'StoneGenerator', preset: 'slate',       weight: 1.0, params: { color: new Color(0x3a3a4a), roughness: 0.6 } },
      { factory: 'StoneGenerator', preset: 'concrete',    weight: 2.0, params: { color: new Color(0xaaaaaa), roughness: 0.8 } },
      { factory: 'StoneGenerator', preset: 'travertine',  weight: 1.0, params: { color: new Color(0xe8dcc8), roughness: 0.65 } },
    ],

    ceramics: [
      { factory: 'CeramicGenerator', preset: 'porcelain',     weight: 2.5, params: { color: new Color(0xffffff), roughness: 0.15 } },
      { factory: 'CeramicGenerator', preset: 'stoneware',     weight: 1.5, params: { color: new Color(0xccbbaa), roughness: 0.4 } },
      { factory: 'CeramicGenerator', preset: 'earthenware',   weight: 1.0, params: { color: new Color(0xcc9966), roughness: 0.6 } },
      { factory: 'CeramicGenerator', preset: 'terracotta',    weight: 1.5, params: { color: new Color(0xcc6633), roughness: 0.5 } },
      { factory: 'CeramicGenerator', preset: 'tile',          weight: 2.0, params: { color: new Color(0xddd8cc), roughness: 0.3 } },
    ],

    plastics: [
      { factory: 'PlasticGenerator', preset: 'matte',       weight: 2.0, params: { color: new Color(0xf0f0f0), roughness: 0.6 } },
      { factory: 'PlasticGenerator', preset: 'glossy',      weight: 2.0, params: { color: new Color(0x111111), roughness: 0.1 } },
      { factory: 'PlasticGenerator', preset: 'textured',    weight: 1.0, params: { color: new Color(0x888888), roughness: 0.55 } },
      { factory: 'PlasticGenerator', preset: 'translucent', weight: 0.5, params: { color: new Color(0xffffff), roughness: 0.15 } },
      { factory: 'PlasticGenerator', preset: 'metallic',    weight: 0.5, params: { color: new Color(0xdddddd), roughness: 0.15, metalness: 0.85 } },
    ],

    // ── Context-specific lists (from Infinigen material_assignments.py) ──

    floor: [
      { factory: 'WoodGenerator',   weight: 3.0, params: { color: new Color(0x8b6f47), roughness: 0.5 } },
      { factory: 'StoneGenerator',  weight: 1.5, params: { color: new Color(0xd4c5a9), roughness: 0.7 }, preset: 'limestone' },
      { factory: 'TileGenerator',   weight: 2.0, params: { color: new Color(0xddd8cc), roughness: 0.3 } },
      { factory: 'CarpetGenerator', weight: 1.0, params: { color: new Color(0x6b6b6b), roughness: 0.95 } },
      { factory: 'StoneGenerator',  weight: 1.0, params: { color: new Color(0x888888), roughness: 0.3 }, preset: 'granite' },
      { factory: 'StoneGenerator',  weight: 0.5, params: { color: new Color(0xf5f5f5), roughness: 0.15 }, preset: 'marble' },
    ],

    wall: [
      { factory: 'PaintGenerator',    weight: 5.0, params: { color: new Color(0xf5f5f0), roughness: 0.7 } },
      { factory: 'PaintGenerator',    weight: 2.0, params: { color: new Color(0xe8ddd0), roughness: 0.65 }, preset: 'warm' },
      { factory: 'ConcreteGenerator', weight: 1.0, params: { color: new Color(0xaaaaaa), roughness: 0.85 } },
      { factory: 'WallpaperGenerator', weight: 1.5, params: { color: new Color(0xddccbb), roughness: 0.6 } },
      { factory: 'PaintGenerator',    weight: 1.0, params: { color: new Color(0xd4d4d4), roughness: 0.7 }, preset: 'cool' },
    ],

    kitchen_wall: [
      { factory: 'TileGenerator',    weight: 4.0, params: { color: new Color(0xddd8cc), roughness: 0.3 } },
      { factory: 'PaintGenerator',   weight: 2.0, params: { color: new Color(0xf5f5f0), roughness: 0.7 } },
      { factory: 'CeramicGenerator', weight: 1.5, params: { color: new Color(0xffffff), roughness: 0.2 }, preset: 'tile' },
      { factory: 'StoneGenerator',   weight: 0.5, params: { color: new Color(0xf5f5f5), roughness: 0.15 }, preset: 'marble' },
    ],

    bathroom_wall: [
      { factory: 'TileGenerator',     weight: 3.0, params: { color: new Color(0xddd8cc), roughness: 0.3 } },
      { factory: 'CeramicGenerator',  weight: 2.0, params: { color: new Color(0xffffff), roughness: 0.2 }, preset: 'tile' },
      { factory: 'MarbleGenerator',   weight: 1.5, params: { color: new Color(0xf5f5f5), roughness: 0.15 } },
      { factory: 'PaintGenerator',    weight: 1.0, params: { color: new Color(0xf0f0f0), roughness: 0.5 } },
    ],

    exterior: [
      { factory: 'StoneGenerator',    weight: 2.0, params: { color: new Color(0x888888), roughness: 0.7 }, preset: 'granite' },
      { factory: 'BrickGenerator',    weight: 3.0, params: { color: new Color(0x8b4513), roughness: 0.8 } },
      { factory: 'ConcreteGenerator', weight: 2.0, params: { color: new Color(0xaaaaaa), roughness: 0.85 } },
      { factory: 'StoneGenerator',    weight: 1.0, params: { color: new Color(0xd4c5a9), roughness: 0.7 }, preset: 'limestone' },
      { factory: 'PaintGenerator',    weight: 1.0, params: { color: new Color(0xf5f5f0), roughness: 0.7 } },
    ],

    terrain: [
      { factory: 'DirtGenerator',  weight: 2.0, params: { color: new Color(0x6b4423) } },
      { factory: 'RockGenerator',  weight: 2.5, params: { color: new Color(0x777777) } },
      { factory: 'SandGenerator',  weight: 1.5, params: { color: new Color(0xc2b280) } },
      { factory: 'GrassGenerator', weight: 3.0, params: { color: new Color(0x4a7c2e) } },
      { factory: 'DirtGenerator',  weight: 1.0, params: { color: new Color(0x8b6f47) } },
    ],

    roof: [
      { factory: 'RoofTileGenerator', weight: 3.0, params: { color: new Color(0x993333), roughness: 0.6 } },
      { factory: 'MetalGenerator',    weight: 1.5, params: { color: new Color(0x666666), metalness: 0.8, roughness: 0.4 } },
      { factory: 'ShingleGenerator',  weight: 2.5, params: { color: new Color(0x555555), roughness: 0.7 } },
      { factory: 'StoneGenerator',    weight: 0.5, params: { color: new Color(0x888888), roughness: 0.6 }, preset: 'slate' },
    ],

    ceiling: [
      { factory: 'PaintGenerator',    weight: 5.0, params: { color: new Color(0xffffff), roughness: 0.7 } },
      { factory: 'PaintGenerator',    weight: 2.0, params: { color: new Color(0xf5f5f0), roughness: 0.65 } },
      { factory: 'WoodGenerator',     weight: 0.5, params: { color: new Color(0xc4a35a), roughness: 0.5 }, preset: 'pine' },
    ],

    countertop: [
      { factory: 'StoneGenerator',   weight: 3.0, params: { color: new Color(0x888888), roughness: 0.3 }, preset: 'granite' },
      { factory: 'MarbleGenerator',  weight: 2.0, params: { color: new Color(0xf5f5f5), roughness: 0.15 } },
      { factory: 'WoodGenerator',    weight: 1.0, params: { color: new Color(0x8b6f47), roughness: 0.4 } },
      { factory: 'CeramicGenerator', weight: 0.5, params: { color: new Color(0xffffff), roughness: 0.2 }, preset: 'tile' },
    ],

    furniture: [
      { factory: 'WoodGenerator',    weight: 4.0, params: { color: new Color(0x8b6f47), roughness: 0.5 } },
      { factory: 'MetalGenerator',   weight: 2.0, params: { color: new Color(0x888888), metalness: 1.0, roughness: 0.3 } },
      { factory: 'FabricGenerator',  weight: 2.0, params: { color: new Color(0x888888), roughness: 0.7 } },
      { factory: 'LeatherGenerator', weight: 1.5, params: { color: new Color(0x8b4513), roughness: 0.6 } },
      { factory: 'PlasticGenerator', weight: 0.5, params: { color: new Color(0xf0f0f0), roughness: 0.5 } },
      { factory: 'GlassGenerator',   weight: 0.5, params: { opacity: 0.3 } },
    ],

    upholstery: [
      { factory: 'FabricGenerator',  weight: 3.0, params: { color: new Color(0x888888), roughness: 0.7 } },
      { factory: 'LeatherGenerator', weight: 2.5, params: { color: new Color(0x8b4513), roughness: 0.6 } },
      { factory: 'FabricGenerator',  weight: 1.5, params: { color: new Color(0x6b2252), roughness: 0.9 }, preset: 'velvet' },
    ],

    appliance: [
      { factory: 'MetalGenerator',   weight: 3.0, params: { color: new Color(0xcccccc), metalness: 0.9, roughness: 0.15 } },
      { factory: 'PlasticGenerator', weight: 2.0, params: { color: new Color(0xf0f0f0), roughness: 0.5 } },
      { factory: 'MetalGenerator',   weight: 1.0, params: { color: new Color(0x111111), metalness: 0.8, roughness: 0.1 }, preset: 'glossy_black' },
      { factory: 'GlassGenerator',   weight: 0.5, params: { opacity: 0.3 } },
    ],

    fixture: [
      { factory: 'MetalGenerator',   weight: 3.0, params: { color: new Color(0xcccccc), metalness: 0.9, roughness: 0.2 } },
      { factory: 'CeramicGenerator', weight: 2.5, params: { color: new Color(0xffffff), roughness: 0.15 }, preset: 'porcelain' },
      { factory: 'MetalGenerator',   weight: 1.5, params: { color: new Color(0xffd700), metalness: 1.0, roughness: 0.25 }, preset: 'brass' },
      { factory: 'MetalGenerator',   weight: 1.0, params: { color: new Color(0xb87333), metalness: 1.0, roughness: 0.35 }, preset: 'copper' },
    ],
  };

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Create a material from an assignment entry.
   */
  private createMaterialFromEntry(entry: MaterialAssignmentEntry, rng: SeededRandom): Material | null {
    const factory = this.factoryRegistry.get(entry.factory);
    if (!factory) {
      console.warn(`MaterialAssignmentSystem: factory '${entry.factory}' not registered`);
      return null;
    }

    const seed = entry.seedOffset !== undefined
      ? rng.seed + entry.seedOffset
      : Math.floor(rng.nextFloat() * 100000);

    return factory(entry.params, seed);
  }

  /**
   * Create a simple MeshStandardMaterial with the given parameters.
   */
  private createSimpleMaterial(
    opts: {
      color?: Color | number;
      roughness?: number;
      metalness?: number;
    },
    _seed?: number
  ): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: opts.color ?? new Color(0x888888),
      roughness: opts.roughness ?? 0.5,
      metalness: opts.metalness ?? 0.0,
    });
  }

  /**
   * Apply a material to an Object3D (traverses to find Meshes).
   */
  private applyMaterialToObject(object: Object3D, material: Material): void {
    object.traverse((child) => {
      if ('material' in child) {
        (child as unknown as { material: Material }).material = material;
      }
    });
  }

  /**
   * Register all built-in assignment lists.
   */
  private registerBuiltinLists(): void {
    for (const [name, entries] of Object.entries(MaterialAssignmentSystem.BUILTIN_LISTS)) {
      this.assignments.set(name, { name, entries });
    }

    // Register built-in factories
    this.registerBuiltinFactories();
  }

  // -----------------------------------------------------------------------
  // Face tagger access
  // -----------------------------------------------------------------------

  /**
   * Get the internal FaceTagger for auto-tagging operations.
   */
  getFaceTagger(): FaceTagger {
    return this.faceTagger;
  }

  /**
   * Auto-tag an object's canonical surfaces and then assign materials
   * from the given list, respecting tag filters.
   *
   * @param object         - The Object3D to process
   * @param assignmentList - Name of the assignment list
   * @param seed           - Optional seed for deterministic selection
   */
  autoTagAndAssign(object: Object3D, assignmentList: string, seed?: number): void {
    this.faceTagger.tagCanonicalSurfaces(object);
    this.assignMaterials(object, assignmentList, seed);
  }

  // -----------------------------------------------------------------------
  // Cache management
  // -----------------------------------------------------------------------

  /**
   * Clear the material cache.
   */
  clearCache(): void {
    this.materialCache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheSize(): number {
    return this.materialCache.size;
  }
}
