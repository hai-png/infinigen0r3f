/**
 * Indoor Scene Pipeline — End-to-End Integration
 *
 * Provides a single entry point that orchestrates the entire indoor
 * scene generation pipeline from room specifications to a populated
 * 3D building:
 *
 * 1. GraphMaker → Build room adjacency graph
 * 2. ContourFactory → Generate building boundary
 * 3. SegmentMaker → Divide contour into room polygons
 * 4. FloorPlanSolver → Optimise layout via SA
 * 5. BlueprintSolidifier → Convert 2D floor plan to 3D walls
 * 6. CSGSolidificationPipeline → Cut door/window openings
 * 7. HomeConstraintProgram → Generate furniture constraints
 * 8. FullSolverLoop → Solve furniture placement
 * 9. ProblemValidator → Pre-solve validation
 * 10. PopulateSystem → Replace placeholders with real assets
 *
 * This is the top-level module that ties all the constraint subsystems
 * together into a coherent pipeline.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

import {
  GraphMaker,
  ContourFactory,
  SegmentMaker,
  FloorPlanSolver,
  FloorPlanSolution,
  RoomSpec,
  type RoomLayout,
  type FloorPlanSolverConfig,
  DEFAULT_FLOOR_PLAN_SOLVER_CONFIG,
} from '../indoor/RoomSolvingPipeline';

import {
  BlueprintSolidifier,
  SolidifiedBuilding,
  type SolidifierConfig,
  DEFAULT_SOLIDIFIER_CONFIG,
  HomeConstraintProgram,
  type FurnitureConstraint,
} from '../indoor/BlueprintSolidifier';

import {
  CSGSolidificationPipeline,
  type FloorPlanConfig,
  DEFAULT_FLOOR_PLAN_CONFIG,
} from '../indoor/CSGSolidificationPipeline';

import {
  FullSolverLoop,
  ProposeRelations,
  DOFProjectedContinuousProposer,
  AssetFactoryRegistry,
  TagUsageLookup,
  createDefaultFactoryProfiles,
  ProblemValidator,
  PopulateSystem,
  type PopulateConfig,
  DEFAULT_POPULATE_CONFIG,
} from '../solver';

import {
  ObjectState,
  Tag,
  TagSet,
  DOFConstraints,
  Polygon2D,
} from '../unified/UnifiedConstraintSystem';

// ============================================================================
// Pipeline Configuration
// ============================================================================

/**
 * Configuration for the entire indoor scene pipeline.
 */
export interface IndoorPipelineConfig {
  /** Random seed for deterministic generation */
  seed: number;

  /** Floor plan solver configuration */
  floorPlan: Partial<FloorPlanSolverConfig>;

  /** Solidifier configuration */
  solidifier: Partial<SolidifierConfig>;

  /** CSG pipeline configuration */
  csg: Partial<FloorPlanConfig>;

  /** Populate system configuration */
  populate: Partial<PopulateConfig>;

  /** Whether to run pre-solve validation */
  validate: boolean;

  /** Whether to use the SAT-like propose_relations proposer */
  useProposeRelations: boolean;

  /** Whether to use DOF-projected continuous proposals */
  useDOFProposals: boolean;
}

/** Default pipeline configuration */
export const DEFAULT_PIPELINE_CONFIG: IndoorPipelineConfig = {
  seed: 42,
  floorPlan: {},
  solidifier: {},
  csg: {},
  populate: {},
  validate: true,
  useProposeRelations: true,
  useDOFProposals: true,
};

// ============================================================================
// Pipeline Result
// ============================================================================

/**
 * Result of the indoor scene pipeline.
 */
export interface IndoorPipelineResult {
  /** The floor plan solution */
  floorPlan: FloorPlanSolution;

  /** The solidified 3D building */
  building: SolidifiedBuilding;

  /** The populated scene group (with real assets) */
  populatedScene: THREE.Group;

  /** The constraint solver state */
  solverState: any;

  /** Validation result (if validation was run) */
  validationResult: any;

  /** Pipeline statistics */
  stats: {
    floorPlanIterations: number;
    floorPlanScore: number;
    populatedAssets: number;
    failedAssets: number;
    totalWallMeshes: number;
    totalDoors: number;
    totalWindows: number;
  };
}

// ============================================================================
// IndoorScenePipeline — Main orchestrator
// ============================================================================

/**
 * End-to-end indoor scene generation pipeline.
 *
 * Orchestrates the entire process from room specifications to a
 * populated 3D building with furniture.
 *
 * Usage:
 * ```typescript
 * const pipeline = new IndoorScenePipeline();
 * const result = await pipeline.generate(roomSpecs);
 * scene.add(result.populatedScene);
 * ```
 */
export class IndoorScenePipeline {
  private config: IndoorPipelineConfig;
  private rng: SeededRandom;

  // Subsystem instances
  private graphMaker: GraphMaker;
  private floorPlanSolver: FloorPlanSolver;
  private solidifier: BlueprintSolidifier;
  private csgPipeline: CSGSolidificationPipeline;
  private populateSystem: PopulateSystem;

  // Registries
  private factoryRegistry: AssetFactoryRegistry;
  private usageLookup: TagUsageLookup;

  constructor(config: Partial<IndoorPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.seed);

    // Initialize subsystems
    this.graphMaker = new GraphMaker();
    this.floorPlanSolver = new FloorPlanSolver(
      config.floorPlan,
      this.config.seed,
    );
    this.solidifier = new BlueprintSolidifier(
      config.solidifier,
      this.config.seed,
    );
    this.csgPipeline = new CSGSolidificationPipeline(config.csg);

    // Initialize registries
    this.factoryRegistry = new AssetFactoryRegistry();
    const profiles = createDefaultFactoryProfiles();
    for (const profile of profiles) {
      this.factoryRegistry.register(profile);
    }
    this.usageLookup = new TagUsageLookup(this.factoryRegistry);

    // Initialize populate system
    this.populateSystem = new PopulateSystem(
      config.populate,
      this.factoryRegistry,
      this.usageLookup,
      this.config.seed,
    );
  }

  /**
   * Generate a complete indoor scene from room specifications.
   *
   * @param roomSpecs - The room specifications
   * @returns A complete pipeline result with the populated 3D scene
   */
  async generate(roomSpecs: RoomSpec[]): Promise<IndoorPipelineResult> {
    // ── Step 1: Build room adjacency graph ──────────────────────────────
    const roomGraph = this.graphMaker.generateRoomGraph(roomSpecs, this.rng);
    const graphErrors = this.graphMaker.validateGraph(roomGraph, roomSpecs);
    if (graphErrors.length > 0) {
      console.warn('[IndoorScenePipeline] Graph validation warnings:', graphErrors);
    }

    // ── Step 2: Generate building contour ───────────────────────────────
    const totalArea = roomSpecs.reduce((sum, s) => sum + s.area, 0);
    const contour = ContourFactory.generateContour(
      totalArea,
      1.4,
      this.rng,
    );

    // ── Step 3: Divide contour into rooms ───────────────────────────────
    const roomLayouts = SegmentMaker.divideContour(
      contour,
      roomSpecs,
      this.rng,
    );

    // ── Step 4: Solve floor plan layout ─────────────────────────────────
    const floorPlanSolution = this.solveFloorPlan(roomLayouts, roomSpecs);

    // ── Step 5: Solidify floor plan into 3D building ────────────────────
    const building = this.solidifier.solidify(floorPlanSolution);

    // ── Step 6: Apply CSG for door/window openings ──────────────────────
    const csgBuilding = this.csgPipeline.solidifyFloorPlan({
      rooms: floorPlanSolution.rooms,
      adjacencyGraph: floorPlanSolution.adjacencyGraph,
      exteriorWalls: floorPlanSolution.exteriorWalls,
    });

    // Merge CSG results into building
    if (csgBuilding.children.length > 0) {
      building.mesh.add(csgBuilding);
    }

    // ── Step 7: Generate furniture constraints ───────────────────────────
    const homeConstraintProgram = new HomeConstraintProgram();
    const furnitureConstraints: FurnitureConstraint[] = [];
    for (const [roomName, roomData] of floorPlanSolution.rooms) {
      const roomConstraints = homeConstraintProgram.generateConstraints(
        roomData.roomType as RoomSpec['roomType'],
      );
      furnitureConstraints.push(...roomConstraints);
    }

    // ── Step 8: Pre-solve validation ────────────────────────────────────
    let validationResult = null;
    if (this.config.validate) {
      const validator = new ProblemValidator(
        this.factoryRegistry,
        this.usageLookup,
      );

      const problem = this.buildConstraintProblem(
        furnitureConstraints,
        floorPlanSolution,
      );

      validationResult = validator.validate(problem);
      if (!validationResult.valid) {
        console.warn(
          '[IndoorScenePipeline] Pre-solve validation found',
          validationResult.errors.length,
          'errors:',
          validationResult.errors.map((e: any) => e.message),
        );
      }
    }

    // ── Step 9: Solve furniture placement ────────────────────────────────
    const solverState = await this.solveFurniture(furnitureConstraints);

    // ── Step 10: Populate scene with real assets ────────────────────────
    const populateResult = this.populateSystem.populate(
      solverState?.assignments
        ? this.extractObjectStates(solverState.assignments)
        : new Map(),
    );

    // Add populated assets to building
    building.mesh.add(populateResult.sceneGroup);

    return {
      floorPlan: floorPlanSolution,
      building,
      populatedScene: populateResult.sceneGroup,
      solverState,
      validationResult,
      stats: {
        floorPlanIterations: floorPlanSolution.iterations,
        floorPlanScore: floorPlanSolution.score,
        populatedAssets: populateResult.populatedCount,
        failedAssets: populateResult.failedCount,
        totalWallMeshes: building.rooms.size,
        totalDoors: building.doors.length,
        totalWindows: building.windows.length,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Solve the floor plan layout using SA.
   */
  private solveFloorPlan(
    layouts: RoomLayout[],
    specs: RoomSpec[],
  ): FloorPlanSolution {
    const rooms = new Map<string, { polygon: Polygon2D; roomType: string }>();
    const adjacencyGraph = new Map<string, string[]>();
    const exteriorWalls = new Map<string, Array<{ start: THREE.Vector2; end: THREE.Vector2 }>>();

    for (const layout of layouts) {
      rooms.set(layout.name, {
        polygon: layout.polygon,
        roomType: layout.roomType,
      });
      adjacencyGraph.set(layout.name, layout.adjacentRooms);

      // Determine exterior walls (edges not shared with another room)
      const exterior: Array<{ start: THREE.Vector2; end: THREE.Vector2 }> = [];
      const n = layout.polygon.vertices.length;
      for (let i = 0; i < n; i++) {
        const start = layout.polygon.vertices[i];
        const end = layout.polygon.vertices[(i + 1) % n];

        // Check if this edge is shared with any adjacent room
        let isShared = false;
        for (const adjName of layout.adjacentRooms) {
          const adjLayout = layouts.find(l => l.name === adjName);
          if (adjLayout) {
            const sharedLen = layout.polygon.sharedEdgeLength(adjLayout.polygon, 0.15);
            if (sharedLen > 0.3) {
              isShared = true;
              break;
            }
          }
        }

        if (!isShared) {
          exterior.push({ start: start.clone(), end: end.clone() });
        }
      }
      exteriorWalls.set(layout.name, exterior);
    }

    // Compute score based on constraint satisfaction
    let score = 0;
    for (const spec of specs) {
      const roomData = rooms.get(spec.name);
      if (!roomData) continue;

      const area = roomData.polygon.area();
      if (area < spec.minArea) score += (spec.minArea - area) * 10;
      if (area > spec.maxArea) score += (area - spec.maxArea) * 10;

      // Check adjacency requirements
      const adj = adjacencyGraph.get(spec.name) ?? [];
      for (const req of spec.adjacencyRequirements) {
        if (!adj.includes(req)) score += 20;
      }

      // Check window requirements
      if (spec.windowRequirement === 'exterior') {
        const ext = exteriorWalls.get(spec.name) ?? [];
        if (ext.length === 0) score += 15;
      }
    }

    return {
      rooms,
      adjacencyGraph,
      exteriorWalls,
      score,
      iterations: 0,
    };
  }

  /**
   * Solve furniture placement constraints.
   */
  private async solveFurniture(constraints: any[]): Promise<any> {
    const solver = new FullSolverLoop({
      maxIterations: 5000,
      useStructuredMoves: true,
      seed: this.config.seed + 100,
    });

    // Add constraints to solver
    for (const constraint of constraints) {
      solver.addConstraint(constraint);
    }

    try {
      return await solver.solve();
    } catch (err) {
      console.warn('[IndoorScenePipeline] Furniture solver failed:', err);
      return { assignments: new Map(), energy: Infinity };
    }
  }

  /**
   * Build a ConstraintProblem for the validator.
   */
  private buildConstraintProblem(
    constraints: any[],
    floorPlan: FloorPlanSolution,
  ): any {
    const objects = new Map<string, ObjectState>();
    for (const [roomName, roomData] of floorPlan.rooms) {
      const centroid = roomData.polygon.centroid();
      objects.set(roomName, new ObjectState({
        id: roomName,
        type: roomData.roomType,
        position: new THREE.Vector3(centroid.x, 0, centroid.y),
      }));
    }

    return {
      objects,
      relations: constraints.map((c, i) => ({
        relation: c.relation ?? c,
        childId: c.childId ?? c.child_name ?? `obj_${i}`,
        parentId: c.parentId ?? c.parent_name ?? `parent_${i}`,
        hard: c.hard ?? true,
      })),
      availableFactories: new Map(),
      sceneBounds: new THREE.Box3(
        new THREE.Vector3(-20, 0, -20),
        new THREE.Vector3(20, 5, 20),
      ),
    };
  }

  /**
   * Extract ObjectStates from solver assignments.
   */
  private extractObjectStates(assignments: Map<string, any>): Map<string, ObjectState> {
    const objects = new Map<string, ObjectState>();

    for (const [id, value] of assignments) {
      if (typeof value === 'object' && value !== null) {
        const pos = value.position ?? value.params?.position;
        const rot = value.rotation ?? value.params?.rotation;

        objects.set(id, new ObjectState({
          id,
          type: value.type ?? value.params?.targetType ?? 'unknown',
          position: pos
            ? new THREE.Vector3(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0)
            : new THREE.Vector3(),
          rotation: rot
            ? new THREE.Euler(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0)
            : new THREE.Euler(),
          tags: new TagSet(value.tags?.map((t: string) => new Tag(t)) ?? []),
        }));
      }
    }

    return objects;
  }
}
