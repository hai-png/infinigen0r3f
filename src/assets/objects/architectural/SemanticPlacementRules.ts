/**
 * Semantic Placement Rules — Architecture Gap: Opening & Furniture Placement
 *
 * Implements semantic placement rules for doors, windows, and furniture
 * matching Infinigen's solidifier semantics (combined_rooms). Provides:
 * - OpeningType enum and OpeningRule for door/window generation
 * - Default opening rules matching Infinigen's room type semantics
 * - computeOpenings() for determining all openings in a room
 * - FurniturePlacementRule and default furniture rules
 * - computeFurniturePlacements() for furniture positioning
 *
 * @module architectural
 */

import * as THREE from 'three';
import { RoomType } from './FloorPlanSolver';
import { Polygon2D } from './FloorPlanSolver';
import type { RoomGraphNode } from './FloorPlanSolver';
import { SeededRandom } from '../../../core/util/MathUtils';
import { FaceTag } from './FaceTaggingSystem';

// ============================================================================
// Opening Types
// ============================================================================

/**
 * Types of openings (windows, doors, archways, panoramic windows).
 */
export enum OpeningType {
  /** Standard interior/exterior door */
  DOOR = 'door',
  /** Standard window (fixed or operable) */
  WINDOW = 'window',
  /** Open archway between rooms (no door leaf) */
  ARCHWAY = 'archway',
  /** Floor-to-ceiling panoramic window */
  PANORAMIC = 'panoramic',
}

// ============================================================================
// Opening Rules
// ============================================================================

/**
 * Rule defining how openings are placed for specific room types.
 * Encodes architectural conventions: window probabilities, sizes,
 * wall preferences, and connection semantics.
 */
export interface OpeningRule {
  /** Room types this rule applies to */
  roomTypes: RoomType[];
  /** Type of opening this rule generates */
  openingType: OpeningType;
  /** Probability of applying this rule (0-1) */
  probability: number;
  /** Minimum number of openings of this type */
  minCount: number;
  /** Maximum number of openings of this type */
  maxCount: number;
  /** Preferred wall type for this opening */
  wallPreference: 'exterior' | 'interior' | 'any';
  /** Minimum height of the opening (meters) */
  minHeight: number;
  /** Maximum height of the opening (meters) */
  maxHeight: number;
  /** Width range (meters) */
  width: { min: number; max: number };
  /** Height range (meters) */
  height: { min: number; max: number };
  /** Sill height from floor (meters, for windows) */
  sillHeight?: number;
}

/**
 * Default opening rules matching Infinigen's combined_rooms semantics.
 * These rules encode architectural best practices for each room type.
 */
export const DEFAULT_OPENING_RULES: OpeningRule[] = [
  // ---- Hallway openings ----
  {
    roomTypes: [RoomType.Hallway, RoomType.LivingRoom],
    openingType: OpeningType.DOOR,
    probability: 0.3,
    minCount: 1,
    maxCount: 2,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.2,
    width: { min: 0.8, max: 1.0 },
    height: { min: 2.0, max: 2.2 },
  },
  {
    roomTypes: [RoomType.Hallway, RoomType.LivingRoom],
    openingType: OpeningType.PANORAMIC,
    probability: 0.3,
    minCount: 0,
    maxCount: 1,
    wallPreference: 'exterior',
    minHeight: 1.5,
    maxHeight: 2.4,
    width: { min: 2.0, max: 4.0 },
    height: { min: 1.5, max: 2.4 },
    sillHeight: 0.3,
  },
  {
    roomTypes: [RoomType.Hallway, RoomType.LivingRoom],
    openingType: OpeningType.WINDOW,
    probability: 0.4,
    minCount: 0,
    maxCount: 3,
    wallPreference: 'exterior',
    minHeight: 1.0,
    maxHeight: 1.8,
    width: { min: 0.8, max: 2.0 },
    height: { min: 1.0, max: 1.8 },
    sillHeight: 0.9,
  },

  // ---- Bathroom openings ----
  {
    roomTypes: [RoomType.Bathroom],
    openingType: OpeningType.WINDOW,
    probability: 0.5,
    minCount: 0,
    maxCount: 1,
    wallPreference: 'exterior',
    minHeight: 0.4,
    maxHeight: 0.8,
    width: { min: 0.4, max: 0.8 },
    height: { min: 0.4, max: 0.8 },
    sillHeight: 1.5,
  },
  {
    roomTypes: [RoomType.Bathroom],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.1,
    width: { min: 0.7, max: 0.8 },
    height: { min: 2.0, max: 2.1 },
  },

  // ---- Closet openings ----
  {
    roomTypes: [RoomType.Closet],
    openingType: OpeningType.WINDOW,
    probability: 0.0,
    minCount: 0,
    maxCount: 0,
    wallPreference: 'any',
    minHeight: 0,
    maxHeight: 0,
    width: { min: 0, max: 0 },
    height: { min: 0, max: 0 },
  },
  {
    roomTypes: [RoomType.Closet],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.1,
    width: { min: 0.6, max: 0.8 },
    height: { min: 2.0, max: 2.1 },
  },

  // ---- Garage openings ----
  {
    roomTypes: [RoomType.Garage],
    openingType: OpeningType.WINDOW,
    probability: 0.0,
    minCount: 0,
    maxCount: 0,
    wallPreference: 'any',
    minHeight: 0,
    maxHeight: 0,
    width: { min: 0, max: 0 },
    height: { min: 0, max: 0 },
  },
  {
    roomTypes: [RoomType.Garage],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'exterior',
    minHeight: 2.2,
    maxHeight: 2.5,
    width: { min: 2.4, max: 3.0 },
    height: { min: 2.2, max: 2.5 },
  },

  // ---- Kitchen openings ----
  {
    roomTypes: [RoomType.Kitchen],
    openingType: OpeningType.WINDOW,
    probability: 0.6,
    minCount: 0,
    maxCount: 2,
    wallPreference: 'exterior',
    minHeight: 0.8,
    maxHeight: 1.4,
    width: { min: 0.8, max: 1.6 },
    height: { min: 0.8, max: 1.4 },
    sillHeight: 0.9,
  },
  {
    roomTypes: [RoomType.Kitchen],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 2,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.2,
    width: { min: 0.8, max: 1.0 },
    height: { min: 2.0, max: 2.2 },
  },
  {
    roomTypes: [RoomType.Kitchen],
    openingType: OpeningType.ARCHWAY,
    probability: 0.4,
    minCount: 0,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.2,
    maxHeight: 2.5,
    width: { min: 1.2, max: 2.0 },
    height: { min: 2.2, max: 2.5 },
  },

  // ---- Bedroom openings ----
  {
    roomTypes: [RoomType.Bedroom],
    openingType: OpeningType.WINDOW,
    probability: 0.8,
    minCount: 1,
    maxCount: 3,
    wallPreference: 'exterior',
    minHeight: 1.2,
    maxHeight: 1.8,
    width: { min: 1.0, max: 2.0 },
    height: { min: 1.2, max: 1.8 },
    sillHeight: 0.9,
  },
  {
    roomTypes: [RoomType.Bedroom],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.2,
    width: { min: 0.8, max: 0.9 },
    height: { min: 2.0, max: 2.2 },
  },

  // ---- Dining Room openings ----
  {
    roomTypes: [RoomType.DiningRoom],
    openingType: OpeningType.WINDOW,
    probability: 0.6,
    minCount: 0,
    maxCount: 2,
    wallPreference: 'exterior',
    minHeight: 1.0,
    maxHeight: 1.6,
    width: { min: 1.0, max: 2.0 },
    height: { min: 1.0, max: 1.6 },
    sillHeight: 0.9,
  },
  {
    roomTypes: [RoomType.DiningRoom],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.2,
    width: { min: 0.8, max: 1.0 },
    height: { min: 2.0, max: 2.2 },
  },

  // ---- Office openings ----
  {
    roomTypes: [RoomType.Office],
    openingType: OpeningType.WINDOW,
    probability: 0.7,
    minCount: 1,
    maxCount: 2,
    wallPreference: 'exterior',
    minHeight: 1.0,
    maxHeight: 1.6,
    width: { min: 1.0, max: 2.0 },
    height: { min: 1.0, max: 1.6 },
    sillHeight: 0.9,
  },
  {
    roomTypes: [RoomType.Office],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.1,
    width: { min: 0.8, max: 0.9 },
    height: { min: 2.0, max: 2.1 },
  },

  // ---- Balcony openings ----
  {
    roomTypes: [RoomType.Balcony],
    openingType: OpeningType.PANORAMIC,
    probability: 0.8,
    minCount: 1,
    maxCount: 2,
    wallPreference: 'exterior',
    minHeight: 2.0,
    maxHeight: 2.4,
    width: { min: 2.0, max: 4.0 },
    height: { min: 2.0, max: 2.4 },
    sillHeight: 0.0,
  },
  {
    roomTypes: [RoomType.Balcony],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.2,
    maxHeight: 2.5,
    width: { min: 0.9, max: 1.5 },
    height: { min: 2.2, max: 2.5 },
  },

  // ---- Staircase openings ----
  {
    roomTypes: [RoomType.Staircase],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 2,
    wallPreference: 'interior',
    minHeight: 2.1,
    maxHeight: 2.3,
    width: { min: 0.9, max: 1.0 },
    height: { min: 2.1, max: 2.3 },
  },

  // ---- Laundry openings ----
  {
    roomTypes: [RoomType.Laundry],
    openingType: OpeningType.WINDOW,
    probability: 0.3,
    minCount: 0,
    maxCount: 1,
    wallPreference: 'exterior',
    minHeight: 0.6,
    maxHeight: 1.0,
    width: { min: 0.6, max: 1.0 },
    height: { min: 0.6, max: 1.0 },
    sillHeight: 1.2,
  },
  {
    roomTypes: [RoomType.Laundry],
    openingType: OpeningType.DOOR,
    probability: 1.0,
    minCount: 1,
    maxCount: 1,
    wallPreference: 'interior',
    minHeight: 2.0,
    maxHeight: 2.1,
    width: { min: 0.7, max: 0.8 },
    height: { min: 2.0, max: 2.1 },
  },
];

// ============================================================================
// Opening Placement
// ============================================================================

/**
 * Placement of an opening (door, window, archway) on a wall.
 */
export interface OpeningPlacement {
  /** Type of opening */
  type: OpeningType;
  /** Wall this opening is on */
  wall: 'north' | 'south' | 'east' | 'west';
  /** 3D position of the opening center */
  position: THREE.Vector3;
  /** Width of the opening */
  width: number;
  /** Height of the opening */
  height: number;
  /** Sill height (distance from floor to bottom of opening) */
  sillHeight: number;
  /** Name of the room this opening connects to (for doors/archways) */
  connectsTo?: string;
}

/**
 * Compute all openings for a room based on semantic rules.
 *
 * Iterates through opening rules applicable to the room's type,
 * determines wall availability (exterior vs interior), and places
 * openings respecting probability, count, and size constraints.
 *
 * @param room - The room graph node with type and adjacency info
 * @param roomPolygon - The room's 2D polygon
 * @param neighbors - Array of neighboring room graph nodes
 * @param exteriorWalls - Set of wall directions that are exterior ('north', 'south', etc.)
 * @param rng - Seeded random number generator for reproducibility
 * @returns Array of OpeningPlacement for this room
 */
export function computeOpenings(
  room: RoomGraphNode,
  roomPolygon: Polygon2D,
  neighbors: RoomGraphNode[],
  exteriorWalls: Set<string>,
  rng: SeededRandom
): OpeningPlacement[] {
  const openings: OpeningPlacement[] = [];
  const bounds = roomPolygon.bounds;

  // Determine interior walls (walls shared with neighbors)
  const interiorWalls = new Set<string>();
  for (const neighbor of neighbors) {
    const nPoly = neighbor.polygon;
    if (!nPoly) continue;
    const nBounds = nPoly.bounds;
    const shared = findSharedWallDirection(bounds, nBounds);
    if (shared) {
      interiorWalls.add(shared);
    }
  }

  // Available walls for exterior and interior openings
  const allWalls: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];

  // Track which walls already have openings (to avoid overlap)
  const usedWallSegments = new Map<string, Array<{ start: number; end: number }>>();

  // Find applicable rules for this room type
  const applicableRules = DEFAULT_OPENING_RULES.filter(
    rule => rule.roomTypes.includes(room.type) && rule.probability > 0
  );

  for (const rule of applicableRules) {
    // Determine count based on probability and min/max
    let count = 0;
    if (rng.next() < rule.probability) {
      count = rng.nextInt(rule.minCount, rule.maxCount);
    }

    for (let i = 0; i < count; i++) {
      // Choose wall based on preference
      const wall = chooseWall(
        rule.wallPreference,
        allWalls,
        exteriorWalls,
        interiorWalls,
        usedWallSegments,
        rng
      );

      if (!wall) continue;

      // Compute opening dimensions
      const width = rng.nextFloat(rule.width.min, rule.width.max);
      const height = rng.nextFloat(rule.height.min, rule.height.max);
      const sillHeight = rule.sillHeight ?? (rule.openingType === OpeningType.DOOR ? 0 : 0.9);

      // Compute position along the wall
      const position = computeWallOpeningPosition(
        bounds, wall, height, width, room.level, usedWallSegments, rng
      );

      // Determine connected room for doors/archways
      let connectsTo: string | undefined;
      if (rule.openingType === OpeningType.DOOR || rule.openingType === OpeningType.ARCHWAY) {
        const connectedNeighbor = neighbors.find(n => {
          const nPoly = n.polygon;
          if (!nPoly) return false;
          const nBounds = nPoly.bounds;
          return findSharedWallDirection(bounds, nBounds) === wall;
        });
        connectsTo = connectedNeighbor?.name;
      }

      // Track the used wall segment
      const segment = getWallSegment(bounds, wall, position);
      if (!usedWallSegments.has(wall)) {
        usedWallSegments.set(wall, []);
      }
      usedWallSegments.get(wall)!.push(segment);

      openings.push({
        type: rule.openingType,
        wall,
        position,
        width,
        height,
        sillHeight,
        connectsTo,
      });
    }
  }

  return openings;
}

// ============================================================================
// Furniture Placement Rules
// ============================================================================

/**
 * Rule defining how furniture is placed in specific room types.
 */
export interface FurniturePlacementRule {
  /** Type/category of furniture */
  furnitureType: string;
  /** Room types where this furniture can appear */
  roomTypes: RoomType[];
  /** Minimum number of this furniture item */
  minCount: number;
  /** Maximum number of this furniture item */
  maxCount: number;
  /** Whether this furniture must be against a wall */
  requiresWallContact: boolean;
  /** Required wall face tag (e.g., WALL for wall-mounted items) */
  wallTag?: FaceTag;
  /** Minimum wall length needed for placement (meters) */
  minWallLength: number;
  /** Placement strategy */
  placementStrategy: 'center' | 'wall' | 'corner' | 'scatter';
}

/**
 * Default furniture placement rules matching architectural conventions.
 */
export const DEFAULT_FURNITURE_RULES: FurniturePlacementRule[] = [
  // ---- Bedroom furniture ----
  {
    furnitureType: 'bed',
    roomTypes: [RoomType.Bedroom],
    minCount: 1,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.6,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'nightstand',
    roomTypes: [RoomType.Bedroom],
    minCount: 1,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.5,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'wardrobe',
    roomTypes: [RoomType.Bedroom],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.2,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'dresser',
    roomTypes: [RoomType.Bedroom],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.0,
    placementStrategy: 'wall',
  },

  // ---- Dining Room furniture ----
  {
    furnitureType: 'dining_table',
    roomTypes: [RoomType.DiningRoom],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'center',
  },
  {
    furnitureType: 'dining_chair',
    roomTypes: [RoomType.DiningRoom],
    minCount: 4,
    maxCount: 8,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'scatter',
  },

  // ---- Living Room furniture ----
  {
    furnitureType: 'sofa',
    roomTypes: [RoomType.LivingRoom],
    minCount: 1,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 2.0,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'coffee_table',
    roomTypes: [RoomType.LivingRoom],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'center',
  },
  {
    furnitureType: 'tv_stand',
    roomTypes: [RoomType.LivingRoom],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.5,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'bookshelf',
    roomTypes: [RoomType.LivingRoom],
    minCount: 0,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.8,
    placementStrategy: 'wall',
  },

  // ---- Office furniture ----
  {
    furnitureType: 'desk',
    roomTypes: [RoomType.Office],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.2,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'office_chair',
    roomTypes: [RoomType.Office],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'center',
  },
  {
    furnitureType: 'filing_cabinet',
    roomTypes: [RoomType.Office],
    minCount: 0,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.5,
    placementStrategy: 'wall',
  },

  // ---- Bathroom furniture ----
  {
    furnitureType: 'toilet',
    roomTypes: [RoomType.Bathroom],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.8,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'bathtub',
    roomTypes: [RoomType.Bathroom],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.7,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'sink',
    roomTypes: [RoomType.Bathroom],
    minCount: 1,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.6,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'shower',
    roomTypes: [RoomType.Bathroom],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.9,
    placementStrategy: 'corner',
  },

  // ---- Kitchen furniture ----
  {
    furnitureType: 'kitchen_counter',
    roomTypes: [RoomType.Kitchen],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 2.0,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'kitchen_island',
    roomTypes: [RoomType.Kitchen],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'center',
  },
  {
    furnitureType: 'refrigerator',
    roomTypes: [RoomType.Kitchen],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.8,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'stove',
    roomTypes: [RoomType.Kitchen],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.8,
    placementStrategy: 'wall',
  },

  // ---- Hallway furniture ----
  {
    furnitureType: 'coat_rack',
    roomTypes: [RoomType.Hallway],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.6,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'shoe_rack',
    roomTypes: [RoomType.Hallway],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.8,
    placementStrategy: 'wall',
  },

  // ---- Laundry furniture ----
  {
    furnitureType: 'washing_machine',
    roomTypes: [RoomType.Laundry],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.7,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'dryer',
    roomTypes: [RoomType.Laundry],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.7,
    placementStrategy: 'wall',
  },

  // ---- Closet furniture ----
  {
    furnitureType: 'closet_rod',
    roomTypes: [RoomType.Closet],
    minCount: 1,
    maxCount: 2,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.0,
    placementStrategy: 'wall',
  },
  {
    furnitureType: 'shelf',
    roomTypes: [RoomType.Closet],
    minCount: 1,
    maxCount: 3,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 0.6,
    placementStrategy: 'wall',
  },

  // ---- Garage furniture ----
  {
    furnitureType: 'workbench',
    roomTypes: [RoomType.Garage],
    minCount: 0,
    maxCount: 1,
    requiresWallContact: true,
    wallTag: FaceTag.WALL,
    minWallLength: 1.5,
    placementStrategy: 'wall',
  },

  // ---- Balcony furniture ----
  {
    furnitureType: 'outdoor_chair',
    roomTypes: [RoomType.Balcony],
    minCount: 2,
    maxCount: 4,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'scatter',
  },
  {
    furnitureType: 'outdoor_table',
    roomTypes: [RoomType.Balcony],
    minCount: 1,
    maxCount: 1,
    requiresWallContact: false,
    minWallLength: 0,
    placementStrategy: 'center',
  },
];

// ============================================================================
// Furniture Placement Result
// ============================================================================

/**
 * A single furniture placement within a room.
 */
export interface FurniturePlacement {
  /** Type/category of furniture */
  type: string;
  /** 2D position [x, z] in room-local coordinates */
  position: [number, number];
  /** Rotation in radians (0 = facing positive X) */
  rotation: number;
  /** Index of the wall this furniture is against (0=north, 1=south, 2=east, 3=west), if applicable */
  wallContact?: number;
}

/**
 * Compute furniture placements for a room based on semantic rules.
 *
 * Uses the room type and polygon to determine:
 * - Which furniture items should be placed
 * - How many of each item
 * - Where each item should go based on its placement strategy
 * - Wall contact and rotation for wall-placed items
 *
 * @param room - The room graph node with type information
 * @param roomPolygon - The room's 2D polygon
 * @param rng - Seeded random number generator for reproducibility
 * @returns Array of FurniturePlacement for this room
 */
export function computeFurniturePlacements(
  room: RoomGraphNode,
  roomPolygon: Polygon2D,
  rng: SeededRandom
): FurniturePlacement[] {
  const placements: FurniturePlacement[] = [];
  const bounds = roomPolygon.bounds;
  const centroid = roomPolygon.centroid;

  // Wall midpoints for wall-contact placement
  const walls = [
    { dir: 0, midX: (bounds.minX + bounds.maxX) / 2, midZ: bounds.maxY, rot: Math.PI }, // north
    { dir: 1, midX: (bounds.minX + bounds.maxX) / 2, midZ: bounds.minY, rot: 0 },       // south
    { dir: 2, midX: bounds.maxX, midZ: (bounds.minY + bounds.maxY) / 2, rot: Math.PI / 2 },  // east
    { dir: 3, midX: bounds.minX, midZ: (bounds.minY + bounds.maxY) / 2, rot: -Math.PI / 2 }, // west
  ];

  // Wall lengths for minimum wall length checking
  const wallLengths = [
    bounds.maxX - bounds.minX, // north wall length
    bounds.maxX - bounds.minX, // south wall length
    bounds.maxY - bounds.minY, // east wall length
    bounds.maxY - bounds.minY, // west wall length
  ];

  // Track used wall positions to avoid overlapping furniture
  const usedWallPositions = new Map<number, Array<{ pos: [number, number]; width: number }>>();
  for (let i = 0; i < 4; i++) {
    usedWallPositions.set(i, []);
  }

  // Get applicable furniture rules for this room type
  const applicableRules = DEFAULT_FURNITURE_RULES.filter(
    rule => rule.roomTypes.includes(room.type)
  );

  // Estimate furniture widths for placement spacing
  const furnitureWidths: Map<string, number> = new Map([
    ['bed', 1.6], ['nightstand', 0.5], ['wardrobe', 1.2], ['dresser', 1.0],
    ['dining_table', 1.4], ['dining_chair', 0.5],
    ['sofa', 2.0], ['coffee_table', 1.0], ['tv_stand', 1.5], ['bookshelf', 0.8],
    ['desk', 1.3], ['office_chair', 0.6], ['filing_cabinet', 0.5],
    ['toilet', 0.6], ['bathtub', 1.7], ['sink', 0.6], ['shower', 0.9],
    ['kitchen_counter', 2.0], ['kitchen_island', 1.2], ['refrigerator', 0.7], ['stove', 0.7],
    ['coat_rack', 0.4], ['shoe_rack', 0.7],
    ['washing_machine', 0.6], ['dryer', 0.6],
    ['closet_rod', 1.0], ['shelf', 0.8],
    ['workbench', 1.5],
    ['outdoor_chair', 0.6], ['outdoor_table', 0.8],
  ]);

  for (const rule of applicableRules) {
    // Determine count
    const count = rng.nextInt(rule.minCount, rule.maxCount);

    for (let i = 0; i < count; i++) {
      const furnitureWidth = furnitureWidths.get(rule.furnitureType) ?? 0.6;

      switch (rule.placementStrategy) {
        case 'center': {
          // Place at or near the room centroid with slight offset
          const offsetX = rng.gaussian(0, 0.3);
          const offsetZ = rng.gaussian(0, 0.3);
          const rotation = rng.next() * Math.PI * 2;

          placements.push({
            type: rule.furnitureType,
            position: [centroid[0] + offsetX, centroid[1] + offsetZ],
            rotation,
          });
          break;
        }

        case 'wall': {
          // Place against a wall
          // Find suitable walls (sufficient length, not fully occupied)
          const suitableWalls = walls.filter((_, idx) => {
            if (wallLengths[idx] < rule.minWallLength) return false;
            const usedOnWall = usedWallPositions.get(idx)!;
            const totalUsed = usedOnWall.reduce((sum, u) => sum + u.width + 0.1, 0);
            return totalUsed + furnitureWidth < wallLengths[idx];
          });

          if (suitableWalls.length === 0) {
            // No suitable wall — skip this item
            continue;
          }

          const wall = rng.choice(suitableWalls);
          const wallIdx = wall.dir;

          // Compute position along the wall with some randomization
          const wallOffset = rng.nextFloat(0.15, 0.85);
          const inset = furnitureWidth / 2 + 0.05; // Offset from wall surface

          let pos: [number, number];
          switch (wallIdx) {
            case 0: // north
              pos = [
                bounds.minX + (bounds.maxX - bounds.minX) * wallOffset,
                bounds.maxY - inset,
              ];
              break;
            case 1: // south
              pos = [
                bounds.minX + (bounds.maxX - bounds.minX) * wallOffset,
                bounds.minY + inset,
              ];
              break;
            case 2: // east
              pos = [
                bounds.maxX - inset,
                bounds.minY + (bounds.maxY - bounds.minY) * wallOffset,
              ];
              break;
            case 3: // west
              pos = [
                bounds.minX + inset,
                bounds.minY + (bounds.maxY - bounds.minY) * wallOffset,
              ];
              break;
            default:
              pos = [centroid[0], centroid[1]];
          }

          // Track used wall position
          usedWallPositions.get(wallIdx)!.push({ pos, width: furnitureWidth });

          placements.push({
            type: rule.furnitureType,
            position: pos,
            rotation: wall.rot,
            wallContact: wallIdx,
          });
          break;
        }

        case 'corner': {
          // Place in a corner of the room
          const corners: Array<{ pos: [number, number]; rot: number }> = [
            { pos: [bounds.minX + furnitureWidth / 2 + 0.1, bounds.minY + furnitureWidth / 2 + 0.1], rot: 0 },
            { pos: [bounds.maxX - furnitureWidth / 2 - 0.1, bounds.minY + furnitureWidth / 2 + 0.1], rot: Math.PI / 2 },
            { pos: [bounds.maxX - furnitureWidth / 2 - 0.1, bounds.maxY - furnitureWidth / 2 - 0.1], rot: Math.PI },
            { pos: [bounds.minX + furnitureWidth / 2 + 0.1, bounds.maxY - furnitureWidth / 2 - 0.1], rot: -Math.PI / 2 },
          ];

          const corner = rng.choice(corners);

          placements.push({
            type: rule.furnitureType,
            position: corner.pos,
            rotation: corner.rot,
            wallContact: 0, // In a corner, touching two walls
          });
          break;
        }

        case 'scatter': {
          // Scatter items randomly within the room polygon
          const margin = furnitureWidth / 2 + 0.2;
          let pos: [number, number] = [centroid[0], centroid[1]];

          // Try random positions within the polygon
          for (let attempt = 0; attempt < 20; attempt++) {
            const x = rng.nextFloat(bounds.minX + margin, bounds.maxX - margin);
            const z = rng.nextFloat(bounds.minY + margin, bounds.maxY - margin);
            if (roomPolygon.contains([x, z])) {
              pos = [x, z];
              break;
            }
          }

          const rotation = rng.next() * Math.PI * 2;

          placements.push({
            type: rule.furnitureType,
            position: pos,
            rotation,
          });
          break;
        }
      }
    }
  }

  return placements;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the shared wall direction between two room bounding boxes.
 */
function findSharedWallDirection(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  neighborBounds: { minX: number; minY: number; maxX: number; maxY: number }
): 'north' | 'south' | 'east' | 'west' | null {
  const tolerance = 1.0;

  // Check east/west adjacency (walls along Y axis)
  if (Math.abs(bounds.maxX - neighborBounds.minX) < tolerance ||
      Math.abs(bounds.minX - neighborBounds.maxX) < tolerance) {
    const yOverlap = Math.min(bounds.maxY, neighborBounds.maxY) -
                     Math.max(bounds.minY, neighborBounds.minY);
    if (yOverlap > 0.5) {
      if (Math.abs(bounds.maxX - neighborBounds.minX) < tolerance) return 'east';
      return 'west';
    }
  }

  // Check north/south adjacency (walls along X axis)
  // Note: in 2D, maxY corresponds to north (Z+ direction in 3D)
  if (Math.abs(bounds.maxY - neighborBounds.minY) < tolerance ||
      Math.abs(bounds.minY - neighborBounds.maxY) < tolerance) {
    const xOverlap = Math.min(bounds.maxX, neighborBounds.maxX) -
                     Math.max(bounds.minX, neighborBounds.minX);
    if (xOverlap > 0.5) {
      if (Math.abs(bounds.maxY - neighborBounds.minY) < tolerance) return 'north';
      return 'south';
    }
  }

  return null;
}

/**
 * Choose a wall for an opening based on the wall preference.
 */
function chooseWall(
  preference: 'exterior' | 'interior' | 'any',
  allWalls: Array<'north' | 'south' | 'east' | 'west'>,
  exteriorWalls: Set<string>,
  interiorWalls: Set<string>,
  usedWallSegments: Map<string, Array<{ start: number; end: number }>>,
  rng: SeededRandom
): 'north' | 'south' | 'east' | 'west' | null {
  let candidates: Array<'north' | 'south' | 'east' | 'west'>;

  switch (preference) {
    case 'exterior':
      candidates = allWalls.filter(w => exteriorWalls.has(w));
      break;
    case 'interior':
      candidates = allWalls.filter(w => interiorWalls.has(w));
      break;
    case 'any':
    default:
      candidates = allWalls;
      break;
  }

  // Filter out walls that are too crowded
  candidates = candidates.filter(w => {
    const used = usedWallSegments.get(w);
    return !used || used.length < 3; // Max 3 openings per wall
  });

  if (candidates.length === 0) {
    // Fallback to any available wall
    candidates = allWalls.filter(w => {
      const used = usedWallSegments.get(w);
      return !used || used.length < 3;
    });
  }

  if (candidates.length === 0) return null;

  return rng.choice(candidates);
}

/**
 * Compute the 3D position of an opening on a wall.
 * Positions the opening at a random location along the wall, avoiding
 * already-used segments.
 */
function computeWallOpeningPosition(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  wall: 'north' | 'south' | 'east' | 'west',
  height: number,
  width: number,
  level: number,
  usedWallSegments: Map<string, Array<{ start: number; end: number }>>,
  rng: SeededRandom
): THREE.Vector3 {
  const floorY = level * 3.0; // 3m per level
  const roomHeight = 2.8;
  const y = floorY + height / 2 + 0.4; // Position at comfortable height

  // Get the range along the wall
  let wallMin: number, wallMax: number;
  let posOnWall: number;

  switch (wall) {
    case 'north':
    case 'south':
      wallMin = bounds.minX + width / 2 + 0.2;
      wallMax = bounds.maxX - width / 2 - 0.2;
      posOnWall = rng.nextFloat(wallMin, wallMax);
      // Avoid used segments
      posOnWall = avoidUsedSegments(posOnWall, width, usedWallSegments.get(wall) ?? [], wallMin, wallMax, rng);
      return new THREE.Vector3(posOnWall, y, wall === 'north' ? bounds.maxY : bounds.minY);

    case 'east':
    case 'west':
      wallMin = bounds.minY + width / 2 + 0.2;
      wallMax = bounds.maxY - width / 2 - 0.2;
      posOnWall = rng.nextFloat(wallMin, wallMax);
      posOnWall = avoidUsedSegments(posOnWall, width, usedWallSegments.get(wall) ?? [], wallMin, wallMax, rng);
      return new THREE.Vector3(wall === 'east' ? bounds.maxX : bounds.minX, y, posOnWall);
  }
}

/**
 * Adjust a wall position to avoid overlapping with already-used segments.
 */
function avoidUsedSegments(
  position: number,
  width: number,
  usedSegments: Array<{ start: number; end: number }>,
  min: number,
  max: number,
  rng: SeededRandom
): number {
  let adjusted = position;

  for (const segment of usedSegments) {
    const halfWidth = width / 2 + 0.1;
    if (adjusted - halfWidth < segment.end && adjusted + halfWidth > segment.start) {
      // Conflict — shift to the right of this segment
      adjusted = segment.end + halfWidth;
    }
  }

  // Clamp to wall bounds
  adjusted = Math.max(min, Math.min(max, adjusted));

  return adjusted;
}

/**
 * Get the wall segment (start/end range) occupied by an opening.
 */
function getWallSegment(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  wall: 'north' | 'south' | 'east' | 'west',
  position: THREE.Vector3
): { start: number; end: number } {
  // Estimate a typical opening width for segment tracking
  const assumedWidth = 1.0;

  switch (wall) {
    case 'north':
    case 'south':
      return { start: position.x - assumedWidth / 2, end: position.x + assumedWidth / 2 };
    case 'east':
    case 'west':
      return { start: position.z - assumedWidth / 2, end: position.z + assumedWidth / 2 };
  }
}
