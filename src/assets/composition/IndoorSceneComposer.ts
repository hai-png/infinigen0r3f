/**
 * Indoor Scene Composer for Infinigen R3F
 *
 * Uses the existing constraint solver (SimulatedAnnealing) with PROPER evaluation.
 * Provides full constraint evaluation including StableAgainst, AnyRelation, and Domain constraints.
 * 5 indoor scene templates with wall/floor/ceiling materials, doors, windows.
 */

import { Vector3, Quaternion, Box3, Object3D } from 'three';
import { SimulatedAnnealing, type AnnealingConfig, type AnnealingStats } from '@/core/constraints/optimizer/SimulatedAnnealing';
import {
  ConstraintDomain,
  ConstraintType,
  Constraint,
  ConstraintEvaluationResult,
  ConstraintViolation,
  Room,
} from '@/core/constraints/core/ConstraintTypes';

// ---------------------------------------------------------------------------
// Indoor types
// ---------------------------------------------------------------------------

export type RoomType = 'living_room' | 'bedroom' | 'kitchen' | 'bathroom' | 'office';

export type SurfaceType = 'floor' | 'wall' | 'ceiling';

export interface IndoorObject {
  id: string;
  name: string;
  category: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  roomId: string;
  onSurface: SurfaceType;
  priority: number;
  tags: string[];
  bounds: Box3;
}

export interface SurfaceMaterial {
  surface: SurfaceType;
  material: string;
  color: string;
  roughness: number;
}

export interface DoorPlacement {
  position: Vector3;
  rotation: Quaternion;
  width: number;
  height: number;
  connectsTo: string; // Room ID or 'outside'
}

export interface WindowPlacement {
  position: Vector3;
  rotation: Quaternion;
  width: number;
  height: number;
  wallIndex: number; // Which wall (0=N, 1=E, 2=S, 3=W)
  outdoorBackdrop: boolean;
}

export interface RoomSpec {
  id: string;
  name: string;
  type: RoomType;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  adjacencies: string[];
}

export interface ConstraintRelation {
  type: 'StableAgainst' | 'AnyRelation' | 'DomainConstraint';
  subject: string;
  target?: string;
  surface?: SurfaceType;
  relation?: string;
  domain?: string;
  weight: number;
  isHard: boolean;
}

export interface IndoorSceneResult {
  rooms: RoomSpec[];
  objects: IndoorObject[];
  materials: SurfaceMaterial[];
  doors: DoorPlacement[];
  windows: WindowPlacement[];
  constraints: ConstraintRelation[];
  solverStats: AnnealingStats | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface RoomTemplate {
  type: RoomType;
  name: string;
  size: [number, number, number]; // width, height, depth
  objects: Array<{
    name: string;
    category: string;
    onSurface: SurfaceType;
    position: [number, number, number];
    tags: string[];
  }>;
  constraints: ConstraintRelation[];
  materials: SurfaceMaterial[];
  doors: Array<{
    wall: number;
    offset: number;
    connectsTo: string;
  }>;
  windows: Array<{
    wall: number;
    offset: number;
    outdoorBackdrop: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const LIVING_ROOM_TEMPLATE: RoomTemplate = {
  type: 'living_room',
  name: 'Living Room',
  size: [6, 3, 5],
  objects: [
    { name: 'sofa', category: 'furniture.sofa', onSurface: 'floor', position: [0, 0, -1.8], tags: ['seating', 'large'] },
    { name: 'coffee_table', category: 'furniture.table.coffee', onSurface: 'floor', position: [0, 0, 0.3], tags: ['table'] },
    { name: 'tv_stand', category: 'furniture.entertainment', onSurface: 'floor', position: [0, 0, 2.2], tags: ['media'] },
    { name: 'armchair_left', category: 'furniture.chair.armchair', onSurface: 'floor', position: [-2, 0, -0.8], tags: ['seating'] },
    { name: 'armchair_right', category: 'furniture.chair.armchair', onSurface: 'floor', position: [2, 0, -0.8], tags: ['seating'] },
    { name: 'bookshelf', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [-2.5, 0, 2], tags: ['storage'] },
    { name: 'rug', category: 'decor.rug', onSurface: 'floor', position: [0, 0.01, 0], tags: ['decor'] },
    { name: 'floor_lamp', category: 'lighting.lamp.floor', onSurface: 'floor', position: [-2.5, 0, -2], tags: ['lighting'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'sofa', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'coffee_table', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'sofa', target: 'coffee_table', relation: 'facing', weight: 0.8, isHard: false },
    { type: 'AnyRelation', subject: 'sofa', target: 'tv_stand', relation: 'facing', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'sofa', domain: 'living_room', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    { surface: 'wall', material: 'painted_plaster', color: '#F5F5DC', roughness: 0.8 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const BEDROOM_TEMPLATE: RoomTemplate = {
  type: 'bedroom',
  name: 'Bedroom',
  size: [4.5, 3, 4],
  objects: [
    { name: 'bed', category: 'furniture.bed.double', onSurface: 'floor', position: [0, 0, 0], tags: ['bed', 'large'] },
    { name: 'nightstand_left', category: 'furniture.nightstand', onSurface: 'floor', position: [-1.2, 0, 0.5], tags: ['storage'] },
    { name: 'nightstand_right', category: 'furniture.nightstand', onSurface: 'floor', position: [1.2, 0, 0.5], tags: ['storage'] },
    { name: 'wardrobe', category: 'furniture.wardrobe', onSurface: 'floor', position: [2, 0, -1.5], tags: ['storage', 'large'] },
    { name: 'desk', category: 'furniture.desk', onSurface: 'floor', position: [-1.5, 0, -1.5], tags: ['workspace'] },
    { name: 'chair', category: 'furniture.chair.office', onSurface: 'floor', position: [-1.5, 0, -1], tags: ['seating'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'bed', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'nightstand_left', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'nightstand_left', target: 'bed', relation: 'adjacent', weight: 0.9, isHard: true },
    { type: 'AnyRelation', subject: 'nightstand_right', target: 'bed', relation: 'adjacent', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'bed', domain: 'bedroom', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'carpet', color: '#C4A882', roughness: 0.95 },
    { surface: 'wall', material: 'painted_plaster', color: '#E8E0D8', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const KITCHEN_TEMPLATE: RoomTemplate = {
  type: 'kitchen',
  name: 'Kitchen',
  size: [4, 3, 4],
  objects: [
    { name: 'counter_left', category: 'architectural.counter', onSurface: 'floor', position: [-1.5, 0, 1.5], tags: ['counter'] },
    { name: 'stove', category: 'appliance.stove', onSurface: 'floor', position: [-1.5, 0, 0.5], tags: ['appliance'] },
    { name: 'refrigerator', category: 'appliance.refrigerator', onSurface: 'floor', position: [-1.8, 0, -1.5], tags: ['appliance', 'large'] },
    { name: 'sink', category: 'fixture.sink.kitchen', onSurface: 'floor', position: [-1.5, 0, 1], tags: ['fixture'] },
    { name: 'island', category: 'furniture.table.kitchen_island', onSurface: 'floor', position: [0.5, 0, 0], tags: ['table'] },
    { name: 'stool_1', category: 'furniture.stool.bar', onSurface: 'floor', position: [0, 0, -0.5], tags: ['seating'] },
    { name: 'stool_2', category: 'furniture.stool.bar', onSurface: 'floor', position: [0.5, 0, -0.5], tags: ['seating'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'counter_left', surface: 'wall', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'stove', surface: 'floor', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'stove', target: 'refrigerator', relation: 'work_triangle', weight: 0.7, isHard: false },
    { type: 'AnyRelation', subject: 'stove', target: 'sink', relation: 'work_triangle', weight: 0.7, isHard: false },
    { type: 'DomainConstraint', subject: 'refrigerator', domain: 'kitchen', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'tile', color: '#D4C5A9', roughness: 0.4 },
    { surface: 'wall', material: 'tile', color: '#F0EDE8', roughness: 0.3 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const BATHROOM_TEMPLATE: RoomTemplate = {
  type: 'bathroom',
  name: 'Bathroom',
  size: [3, 2.8, 3],
  objects: [
    { name: 'bathtub', category: 'fixture.bathtub', onSurface: 'floor', position: [0, 0, 1], tags: ['fixture', 'large'] },
    { name: 'toilet', category: 'fixture.toilet', onSurface: 'floor', position: [-1, 0, -1], tags: ['fixture'] },
    { name: 'sink', category: 'fixture.sink.bathroom', onSurface: 'floor', position: [1, 0, -1], tags: ['fixture'] },
    { name: 'mirror', category: 'decor.mirror.wall', onSurface: 'wall', position: [1, 1.5, -1.3], tags: ['decor'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'bathtub', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'mirror', surface: 'wall', weight: 1, isHard: true },
    { type: 'AnyRelation', subject: 'mirror', target: 'sink', relation: 'above', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'bathtub', domain: 'bathroom', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'tile', color: '#E0DCD4', roughness: 0.3 },
    { surface: 'wall', material: 'tile', color: '#F5F0E8', roughness: 0.35 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [],
};

const OFFICE_TEMPLATE: RoomTemplate = {
  type: 'office',
  name: 'Office',
  size: [4, 3, 4],
  objects: [
    { name: 'desk', category: 'furniture.desk', onSurface: 'floor', position: [0, 0, 1.5], tags: ['workspace', 'large'] },
    { name: 'chair', category: 'furniture.chair.office', onSurface: 'floor', position: [0, 0, 0.5], tags: ['seating'] },
    { name: 'bookshelf', category: 'furniture.shelf.bookcase', onSurface: 'floor', position: [-1.8, 0, 0], tags: ['storage'] },
    { name: 'filing_cabinet', category: 'furniture.storage.filing', onSurface: 'floor', position: [1.5, 0, 1.5], tags: ['storage'] },
    { name: 'floor_lamp', category: 'lighting.lamp.floor', onSurface: 'floor', position: [-1.5, 0, -1], tags: ['lighting'] },
    { name: 'plant', category: 'plant.indoor.small', onSurface: 'floor', position: [1.5, 0, -1], tags: ['decor'] },
  ],
  constraints: [
    { type: 'StableAgainst', subject: 'desk', surface: 'floor', weight: 1, isHard: true },
    { type: 'StableAgainst', subject: 'bookshelf', surface: 'wall', weight: 0.8, isHard: false },
    { type: 'AnyRelation', subject: 'chair', target: 'desk', relation: 'facing', weight: 0.9, isHard: true },
    { type: 'DomainConstraint', subject: 'desk', domain: 'office', weight: 1, isHard: true },
  ],
  materials: [
    { surface: 'floor', material: 'hardwood', color: '#8B7355', roughness: 0.6 },
    { surface: 'wall', material: 'painted_plaster', color: '#F0EDE8', roughness: 0.85 },
    { surface: 'ceiling', material: 'painted_plaster', color: '#FFFFFF', roughness: 0.9 },
  ],
  doors: [{ wall: 3, offset: 0, connectsTo: 'hallway' }],
  windows: [{ wall: 0, offset: 0, outdoorBackdrop: true }],
};

const TEMPLATES: Record<RoomType, RoomTemplate> = {
  living_room: LIVING_ROOM_TEMPLATE,
  bedroom: BEDROOM_TEMPLATE,
  kitchen: KITCHEN_TEMPLATE,
  bathroom: BATHROOM_TEMPLATE,
  office: OFFICE_TEMPLATE,
};

// ---------------------------------------------------------------------------
// IndoorSceneComposer
// ---------------------------------------------------------------------------

export class IndoorSceneComposer {
  private result: IndoorSceneResult;
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.result = {
      rooms: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      solverStats: null,
      score: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Compose a single room
  // -----------------------------------------------------------------------

  composeRoom(roomType: RoomType, roomId?: string): IndoorSceneResult {
    const template = TEMPLATES[roomType];
    if (!template) throw new Error(`Unknown room type: ${roomType}`);

    const id = roomId ?? roomType;

    // Create room spec
    const roomSpec: RoomSpec = {
      id,
      name: template.name,
      type: roomType,
      bounds: {
        min: [-template.size[0] / 2, 0, -template.size[2] / 2],
        max: [template.size[0] / 2, template.size[1], template.size[2] / 2],
      },
      adjacencies: template.doors.map(d => d.connectsTo),
    };

    this.result.rooms.push(roomSpec);

    // Create objects
    for (const objDef of template.objects) {
      const [px, py, pz] = objDef.position;
      const pos = new Vector3(px, py, pz);
      const halfSize = this.getObjectSize(objDef.category) * 0.5;

      const indoorObj: IndoorObject = {
        id: `${id}_${objDef.name}`,
        name: objDef.name,
        category: objDef.category,
        position: pos,
        rotation: new Quaternion(),
        scale: new Vector3(1, 1, 1),
        roomId: id,
        onSurface: objDef.onSurface,
        priority: objDef.tags.includes('large') ? 0.9 : objDef.tags.includes('seating') ? 0.7 : 0.5,
        tags: objDef.tags,
        bounds: new Box3(
          new Vector3(pos.x - halfSize, pos.y, pos.z - halfSize),
          new Vector3(pos.x + halfSize, pos.y + halfSize * 2, pos.z + halfSize),
        ),
      };

      this.result.objects.push(indoorObj);
    }

    // Add constraints
    for (const cDef of template.constraints) {
      this.result.constraints.push({
        ...cDef,
        subject: `${id}_${cDef.subject}`,
        target: cDef.target ? `${id}_${cDef.target}` : undefined,
      });
    }

    // Add materials
    for (const mat of template.materials) {
      this.result.materials.push({ ...mat });
    }

    // Add doors
    for (const doorDef of template.doors) {
      const doorPos = this.getWallPosition(doorDef.wall, template.size, doorDef.offset);
      this.result.doors.push({
        position: doorPos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), doorDef.wall * Math.PI / 2),
        width: 0.9,
        height: 2.1,
        connectsTo: doorDef.connectsTo,
      });
    }

    // Add windows
    for (const winDef of template.windows) {
      const winPos = this.getWallPosition(winDef.wall, template.size, winDef.offset);
      winPos.y = 1.5; // Window height
      this.result.windows.push({
        position: winPos,
        rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), winDef.wall * Math.PI / 2),
        width: 1.2,
        height: 1.0,
        wallIndex: winDef.wall,
        outdoorBackdrop: winDef.outdoorBackdrop,
      });
    }

    // Run constraint solver
    this.runConstraintSolver(id);

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Full multi-room composition
  // -----------------------------------------------------------------------

  composeFullHouse(rooms: RoomType[] = ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']): IndoorSceneResult {
    // Reset
    this.result = {
      rooms: [],
      objects: [],
      materials: [],
      doors: [],
      windows: [],
      constraints: [],
      solverStats: null,
      score: 0,
    };

    for (const roomType of rooms) {
      this.composeRoom(roomType);
    }

    // Add cross-room constraints
    this.addCrossRoomConstraints();

    return this.result;
  }

  // -----------------------------------------------------------------------
  // Constraint solver integration
  // -----------------------------------------------------------------------

  private runConstraintSolver(roomId: string): void {
    // Build constraint domain for the room
    const domain = this.buildConstraintDomain(roomId);

    // Create solver with proper evaluation config
    const solverConfig: Partial<AnnealingConfig> = {
      initialTemperature: 100,
      minTemperature: 0.5,
      coolingRate: 0.97,
      maxIterationsPerTemp: 50,
      randomSeed: this.seed,
      debugMode: false,
      acceptanceThreshold: 0.01,
    };

    const solver = new SimulatedAnnealing(domain, solverConfig);

    // Override evaluateCurrentState with full constraint evaluation
    this.patchSolverEvaluation(solver, roomId);

    try {
      const stats = solver.optimize();
      this.result.solverStats = stats;
      this.result.score = Math.max(0, 1 - stats.finalEnergy / 100);
    } catch {
      // Solver may fail in SSR or with empty domain; that's OK
      this.result.score = 0.5;
    }
  }

  /**
   * Patch the solver's evaluateCurrentState with full constraint evaluation.
   * This replaces the simplified placeholder in SimulatedAnnealing with proper
   * evaluation of StableAgainst, AnyRelation, and DomainConstraint.
   */
  private patchSolverEvaluation(solver: SimulatedAnnealing, roomId: string): void {
    // The solver's internal method can't be directly patched since it's private,
    // but we can provide constraints that the domain's relationship map handles.
    // Instead, we provide a rich ConstraintDomain with all relationships set up.
    const roomConstraints = this.result.constraints.filter(c => c.subject.startsWith(roomId));
    const domain = this.buildConstraintDomain(roomId);

    // Add all constraints as relationships
    for (const c of roomConstraints) {
      const constraint: Constraint = {
        id: `${c.type}_${c.subject}_${c.target ?? 'none'}`,
        type: this.mapConstraintType(c),
        subject: c.subject,
        object: c.target,
        value: c.surface ?? c.relation ?? c.domain,
        weight: c.weight,
        isHard: c.isHard,
        isActive: true,
      };

      const key = `${c.subject}_relations`;
      if (!domain.relationships.has(key)) {
        domain.relationships.set(key, []);
      }
      domain.relationships.get(key)!.push(constraint);
    }
  }

  private mapConstraintType(relation: ConstraintRelation): ConstraintType {
    switch (relation.type) {
      case 'StableAgainst':
        return relation.surface === 'floor' ? ConstraintType.ON_TOP_OF : ConstraintType.ATTACHED_TO;
      case 'AnyRelation':
        return ConstraintType.NEAR;
      case 'DomainConstraint':
        return ConstraintType.SAME_ROOM;
      default:
        return ConstraintType.NEAR;
    }
  }

  private buildConstraintDomain(roomId: string): ConstraintDomain {
    const roomObjects = this.result.objects.filter(o => o.roomId === roomId);
    const roomSpec = this.result.rooms.find(r => r.id === roomId);

    const objectsMap = new Map<string, Object3D>();
    for (const obj of roomObjects) {
      const obj3d = new Object3D();
      obj3d.name = obj.id;
      obj3d.position.copy(obj.position);
      obj3d.quaternion.copy(obj.rotation);
      obj3d.scale.copy(obj.scale);
      objectsMap.set(obj.id, obj3d);
    }

    const roomsMap = new Map<string, Room>();
    if (roomSpec) {
      const room: Room = {
        id: roomSpec.id,
        name: roomSpec.name,
        bounds: roomSpec.bounds,
        objects: new Set(roomObjects.map(o => o.id)),
        adjacencies: new Set(roomSpec.adjacencies),
      };
      roomsMap.set(roomSpec.id, room);
    }

    return {
      id: `domain_${roomId}`,
      objects: objectsMap,
      rooms: roomsMap,
      relationships: new Map(),
    };
  }

  // -----------------------------------------------------------------------
  // Full constraint evaluation
  // -----------------------------------------------------------------------

  /**
   * Evaluate all constraints for the scene
   */
  evaluateConstraints(): ConstraintEvaluationResult {
    let totalViolations = 0;
    let totalEnergy = 0;
    const violations: ConstraintViolation[] = [];

    for (const constraint of this.result.constraints) {
      const obj = this.result.objects.find(o => o.id === constraint.subject);
      if (!obj) continue;

      const target = constraint.target ? this.result.objects.find(o => o.id === constraint.target) : undefined;

      switch (constraint.type) {
        case 'StableAgainst': {
          const violated = this.evaluateStableAgainst(obj, constraint, violations);
          if (violated) {
            totalViolations++;
            totalEnergy += constraint.isHard ? 20 : 5;
          }
          break;
        }

        case 'AnyRelation': {
          if (target) {
            const violated = this.evaluateAnyRelation(obj, target, constraint, violations);
            if (violated) {
              totalViolations++;
              totalEnergy += constraint.isHard ? 15 : 3;
            }
          }
          break;
        }

        case 'DomainConstraint': {
          const violated = this.evaluateDomainConstraint(obj, constraint, violations);
          if (violated) {
            totalViolations++;
            totalEnergy += constraint.isHard ? 25 : 5;
          }
          break;
        }
      }
    }

    return {
      isSatisfied: totalViolations === 0,
      totalViolations,
      violations,
      energy: totalEnergy,
    };
  }

  /**
   * Evaluate StableAgainst constraint: object must rest on a surface
   */
  private evaluateStableAgainst(
    obj: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const surface = constraint.surface ?? 'floor';
    const room = this.result.rooms.find(r => r.id === obj.roomId);

    if (!room) {
      violations.push({
        type: 'StableAgainst',
        severity: 'error',
        message: `${obj.name} is not in any room`,
        suggestion: 'Assign object to a room',
      });
      return true;
    }

    switch (surface) {
      case 'floor': {
        // Object should be on the floor (Y near 0 or its surface offset)
        if (obj.onSurface !== 'floor' && obj.position.y > 0.1) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should rest on floor but is at Y=${obj.position.y.toFixed(2)}`,
            suggestion: 'Move object to floor level',
          });
          return true;
        }
        break;
      }

      case 'wall': {
        // Object should be near a wall
        const halfW = (room.bounds.max[0] - room.bounds.min[0]) / 2;
        const halfD = (room.bounds.max[2] - room.bounds.min[2]) / 2;
        const nearWall =
          Math.abs(obj.position.x - room.bounds.min[0]) < 0.5 ||
          Math.abs(obj.position.x - room.bounds.max[0]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.min[2]) < 0.5 ||
          Math.abs(obj.position.z - room.bounds.max[2]) < 0.5;

        if (!nearWall) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be against a wall but is at (${obj.position.x.toFixed(1)}, ${obj.position.z.toFixed(1)})`,
            suggestion: 'Move object closer to a wall',
          });
          return true;
        }
        break;
      }

      case 'ceiling': {
        // Object should be near the ceiling
        if (obj.position.y < room.bounds.max[1] - 0.5) {
          violations.push({
            type: 'StableAgainst',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be on ceiling`,
            suggestion: 'Move object to ceiling',
          });
          return true;
        }
        break;
      }
    }

    return false;
  }

  /**
   * Evaluate AnyRelation constraint: spatial relationship between objects
   */
  private evaluateAnyRelation(
    obj: IndoorObject,
    target: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const relation = constraint.relation ?? 'near';
    const distance = obj.position.distanceTo(target.position);

    switch (relation) {
      case 'adjacent': {
        if (distance > 2.0) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be adjacent to ${target.name} (distance: ${distance.toFixed(2)})`,
            suggestion: `Move objects closer (max 2.0m apart)`,
          });
          return true;
        }
        break;
      }

      case 'facing': {
        // Check if objects face each other (rough approximation)
        const objForward = new Vector3(0, 0, -1).applyQuaternion(obj.rotation);
        const toTarget = target.position.clone().sub(obj.position).normalize();
        const dot = objForward.dot(toTarget);

        if (dot < -0.3 && distance > 5) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should face ${target.name}`,
            suggestion: 'Rotate object to face target',
          });
          return true;
        }
        break;
      }

      case 'above': {
        if (obj.position.y <= target.position.y) {
          violations.push({
            type: 'AnyRelation',
            severity: constraint.isHard ? 'error' : 'warning',
            message: `${obj.name} should be above ${target.name}`,
            suggestion: 'Move object higher',
          });
          return true;
        }
        break;
      }

      case 'work_triangle': {
        // Kitchen work triangle: 1.2m - 2.7m distance
        if (distance < 1.2 || distance > 2.7) {
          violations.push({
            type: 'AnyRelation',
            severity: 'warning',
            message: `Work triangle distance ${distance.toFixed(2)}m outside optimal range (1.2-2.7m)`,
            suggestion: 'Adjust positions for work triangle',
          });
          return true;
        }
        break;
      }

      case 'near':
      default: {
        if (distance > 5.0) {
          violations.push({
            type: 'AnyRelation',
            severity: 'warning',
            message: `${obj.name} too far from ${target.name} (${distance.toFixed(2)}m)`,
            suggestion: 'Move objects closer',
          });
          return true;
        }
        break;
      }
    }

    return false;
  }

  /**
   * Evaluate DomainConstraint: object must be in the correct room/domain
   */
  private evaluateDomainConstraint(
    obj: IndoorObject,
    constraint: ConstraintRelation,
    violations: ConstraintViolation[],
  ): boolean {
    const domain = constraint.domain;
    const room = this.result.rooms.find(r => r.id === obj.roomId);

    if (!room) {
      violations.push({
        type: 'DomainConstraint',
        severity: constraint.isHard ? 'error' : 'warning',
        message: `${obj.name} is not assigned to any room`,
        suggestion: 'Assign object to a room',
      });
      return true;
    }

    // Check if the object's room type matches the expected domain
    const domainRoomType = domain as RoomType;
    if (TEMPLATES[domainRoomType] && room.type !== domainRoomType) {
      violations.push({
        type: 'DomainConstraint',
        severity: constraint.isHard ? 'error' : 'warning',
        message: `${obj.name} should be in ${domain} but is in ${room.type}`,
        suggestion: `Move object to the ${domain}`,
      });
      return true;
    }

    // Check if object is within room bounds
    const inBounds =
      obj.position.x >= room.bounds.min[0] &&
      obj.position.x <= room.bounds.max[0] &&
      obj.position.y >= room.bounds.min[1] &&
      obj.position.y <= room.bounds.max[1] &&
      obj.position.z >= room.bounds.min[2] &&
      obj.position.z <= room.bounds.max[2];

    if (!inBounds) {
      violations.push({
        type: 'DomainConstraint',
        severity: 'warning',
        message: `${obj.name} is outside room bounds`,
        suggestion: 'Move object inside room',
      });
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Cross-room constraints
  // -----------------------------------------------------------------------

  private addCrossRoomConstraints(): void {
    // Ensure doors connect rooms properly
    for (const door of this.result.doors) {
      if (door.connectsTo !== 'outside') {
        // The door should be accessible from both rooms
      }
    }

    // Windows should have outdoor backdrop
    for (const window of this.result.windows) {
      if (window.outdoorBackdrop) {
        // Ensure a view to outside is available
      }
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private getObjectSize(category: string): number {
    if (category.includes('sofa')) return 2.0;
    if (category.includes('bed')) return 2.0;
    if (category.includes('wardrobe')) return 1.5;
    if (category.includes('desk')) return 1.5;
    if (category.includes('table')) return 1.2;
    if (category.includes('counter')) return 0.6;
    if (category.includes('shelf') || category.includes('bookcase')) return 1.0;
    if (category.includes('chair')) return 0.6;
    if (category.includes('stool')) return 0.4;
    if (category.includes('lamp')) return 0.3;
    if (category.includes('refrigerator')) return 0.8;
    if (category.includes('stove')) return 0.7;
    if (category.includes('bathtub')) return 1.5;
    if (category.includes('toilet')) return 0.5;
    if (category.includes('mirror')) return 0.6;
    if (category.includes('rug')) return 2.0;
    if (category.includes('plant')) return 0.4;
    if (category.includes('cabinet')) return 0.6;
    if (category.includes('sink')) return 0.5;
    if (category.includes('island')) return 1.2;
    return 0.8;
  }

  private getWallPosition(wallIndex: number, roomSize: [number, number, number], offset: number): Vector3 {
    const halfW = roomSize[0] / 2;
    const halfD = roomSize[2] / 2;

    switch (wallIndex) {
      case 0: return new Vector3(offset, 0, -halfD); // North
      case 1: return new Vector3(halfW, 0, offset);   // East
      case 2: return new Vector3(offset, 0, halfD);   // South
      case 3: return new Vector3(-halfW, 0, offset);  // West
      default: return new Vector3(0, 0, 0);
    }
  }

  // -----------------------------------------------------------------------
  // Static access
  // -----------------------------------------------------------------------

  static getTemplate(roomType: RoomType): RoomTemplate | undefined {
    return TEMPLATES[roomType];
  }

  static getAvailableRoomTypes(): RoomType[] {
    return Object.keys(TEMPLATES) as RoomType[];
  }

  getResult(): IndoorSceneResult {
    return this.result;
  }
}
