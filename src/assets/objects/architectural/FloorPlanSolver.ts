/**
 * Floor Plan Solver — Architecture Gap: Room Semantics
 *
 * Implements a floor plan solver with room semantics matching Infinigen's
 * core/constraints/example_solver/room/. Provides:
 * - RoomType enum with semantic room categories
 * - RoomTypeConfig with adjacency constraints and window/door probabilities
 * - Polygon2D class for 2D geometric operations
 * - RoomGraphSolver for generating room graphs and assigning polygons
 * - Top-level generateFloorPlan() function
 *
 * @module architectural
 */

import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Room Type Enumeration
// ============================================================================

/**
 * Semantic room type enumeration matching Infinigen's room categories.
 * Each type carries implicit adjacency, window, and area constraints.
 */
export enum RoomType {
  Bedroom = 'Bedroom',
  Kitchen = 'Kitchen',
  Bathroom = 'Bathroom',
  LivingRoom = 'LivingRoom',
  Hallway = 'Hallway',
  Staircase = 'Staircase',
  Office = 'Office',
  Garage = 'Garage',
  Closet = 'Closet',
  DiningRoom = 'DiningRoom',
  Balcony = 'Balcony',
  Laundry = 'Laundry',
}

// ============================================================================
// Room Type Configuration
// ============================================================================

/**
 * Configuration defining semantic rules for a room type.
 * Encodes architectural constraints: area bounds, window/door likelihood,
 * and adjacency requirements.
 */
export interface RoomTypeConfig {
  /** The room type this config describes */
  name: RoomType;
  /** Minimum floor area in square meters */
  minArea: number;
  /** Maximum floor area in square meters */
  maxArea: number;
  /** Probability of having at least one window (0-1) */
  windowProbability: number;
  /** Probability of having a door (0-1) */
  doorProbability: number;
  /** Room types that MUST be adjacent to this room */
  requiredAdjacencies: RoomType[];
  /** Room types that are preferred (but not required) to be adjacent */
  preferredAdjacencies: RoomType[];
}

/**
 * Default room type configurations with semantic rules derived from
 * architectural best practices and Infinigen's constraint system.
 */
export const ROOM_TYPE_CONFIGS: Map<RoomType, RoomTypeConfig> = new Map([
  [RoomType.Bedroom, {
    name: RoomType.Bedroom,
    minArea: 9,
    maxArea: 30,
    windowProbability: 0.8,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.LivingRoom, RoomType.Hallway, RoomType.Bathroom],
  }],
  [RoomType.Kitchen, {
    name: RoomType.Kitchen,
    minArea: 8,
    maxArea: 25,
    windowProbability: 0.6,
    doorProbability: 1.0,
    requiredAdjacencies: [RoomType.DiningRoom],
    preferredAdjacencies: [RoomType.LivingRoom, RoomType.DiningRoom, RoomType.Laundry],
  }],
  [RoomType.Bathroom, {
    name: RoomType.Bathroom,
    minArea: 4,
    maxArea: 12,
    windowProbability: 0.5,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Bedroom, RoomType.Hallway],
  }],
  [RoomType.LivingRoom, {
    name: RoomType.LivingRoom,
    minArea: 16,
    maxArea: 60,
    windowProbability: 0.9,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Kitchen, RoomType.Hallway, RoomType.DiningRoom],
  }],
  [RoomType.Hallway, {
    name: RoomType.Hallway,
    minArea: 3,
    maxArea: 15,
    windowProbability: 0.1,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [
      RoomType.LivingRoom, RoomType.Bedroom, RoomType.Bathroom,
      RoomType.Kitchen, RoomType.Office, RoomType.Laundry,
      RoomType.Closet, RoomType.Staircase,
    ],
  }],
  [RoomType.Staircase, {
    name: RoomType.Staircase,
    minArea: 4,
    maxArea: 10,
    windowProbability: 0.0,
    doorProbability: 1.0,
    requiredAdjacencies: [RoomType.Hallway],
    preferredAdjacencies: [RoomType.Hallway],
  }],
  [RoomType.Office, {
    name: RoomType.Office,
    minArea: 8,
    maxArea: 20,
    windowProbability: 0.7,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Hallway, RoomType.LivingRoom],
  }],
  [RoomType.Garage, {
    name: RoomType.Garage,
    minArea: 18,
    maxArea: 40,
    windowProbability: 0.0,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Hallway],
  }],
  [RoomType.Closet, {
    name: RoomType.Closet,
    minArea: 2,
    maxArea: 6,
    windowProbability: 0.0,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Bedroom, RoomType.Hallway],
  }],
  [RoomType.DiningRoom, {
    name: RoomType.DiningRoom,
    minArea: 10,
    maxArea: 30,
    windowProbability: 0.6,
    doorProbability: 1.0,
    requiredAdjacencies: [RoomType.Kitchen],
    preferredAdjacencies: [RoomType.Kitchen, RoomType.LivingRoom, RoomType.Hallway],
  }],
  [RoomType.Balcony, {
    name: RoomType.Balcony,
    minArea: 4,
    maxArea: 15,
    windowProbability: 1.0,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.LivingRoom, RoomType.Bedroom],
  }],
  [RoomType.Laundry, {
    name: RoomType.Laundry,
    minArea: 4,
    maxArea: 10,
    windowProbability: 0.3,
    doorProbability: 1.0,
    requiredAdjacencies: [],
    preferredAdjacencies: [RoomType.Kitchen, RoomType.Hallway, RoomType.Bathroom],
  }],
]);

// ============================================================================
// Polygon2D Class
// ============================================================================

/**
 * Simple 2D polygon representation with geometric operations.
 * Supports area computation, containment tests, intersection detection,
 * and boolean operations (union, difference, buffer).
 *
 * Vertices are stored in counter-clockwise winding order.
 */
export class Polygon2D {
  /** Polygon vertices as [x, y] pairs */
  public vertices: [number, number][];

  constructor(vertices: [number, number][]) {
    if (vertices.length < 3) {
      throw new Error('Polygon2D requires at least 3 vertices');
    }
    this.vertices = this.ensureCCW(vertices);
  }

  /**
   * Ensure vertices are in counter-clockwise order.
   * If the signed area is negative, reverse the vertex order.
   */
  private ensureCCW(verts: [number, number][]): [number, number][] {
    const signedArea = this.computeSignedArea(verts);
    if (signedArea < 0) {
      return verts.slice().reverse() as [number, number][];
    }
    return verts.slice() as [number, number][];
  }

  /**
   * Compute signed area using the shoelace formula.
   * Positive = CCW, Negative = CW.
   */
  private computeSignedArea(verts: [number, number][]): number {
    let area = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += verts[i][0] * verts[j][1];
      area -= verts[j][0] * verts[i][1];
    }
    return area / 2;
  }

  /**
   * Compute the unsigned area of the polygon via the shoelace formula.
   */
  get area(): number {
    return Math.abs(this.computeSignedArea(this.vertices));
  }

  /**
   * Compute the centroid of the polygon.
   */
  get centroid(): [number, number] {
    const n = this.vertices.length;
    let cx = 0;
    let cy = 0;
    const signedArea = this.computeSignedArea(this.vertices);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cross = this.vertices[i][0] * this.vertices[j][1]
                  - this.vertices[j][0] * this.vertices[i][1];
      cx += (this.vertices[i][0] + this.vertices[j][0]) * cross;
      cy += (this.vertices[i][1] + this.vertices[j][1]) * cross;
    }

    const factor = 1 / (6 * signedArea);
    return [cx * factor, cy * factor];
  }

  /**
   * Get the axis-aligned bounding box of this polygon.
   */
  get bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of this.vertices) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Test whether a point is inside this polygon using the ray-casting algorithm.
   * @param point - The [x, y] point to test
   */
  contains(point: [number, number]): boolean {
    const [px, py] = point;
    const n = this.vertices.length;
    let inside = false;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = this.vertices[i];
      const [xj, yj] = this.vertices[j];

      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Test whether this polygon intersects another polygon.
   * Uses the Separating Axis Theorem (SAT) for convex polygons and
   * edge-crossing + containment checks for general polygons.
   */
  intersects(other: Polygon2D): boolean {
    // Quick bounding box check
    const a = this.bounds;
    const b = other.bounds;
    if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) {
      return false;
    }

    // Check edge intersections
    if (this.edgesIntersect(other)) {
      return true;
    }

    // Check containment (one polygon fully inside another)
    const centroidA = this.centroid;
    const centroidB = other.centroid;
    if (other.contains(centroidA) || this.contains(centroidB)) {
      return true;
    }

    return false;
  }

  /**
   * Check if any edges of this polygon cross any edges of another.
   */
  private edgesIntersect(other: Polygon2D): boolean {
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;

    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];

      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];

        if (this.segmentsIntersect(a1, a2, b1, b2)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Test whether two line segments intersect.
   */
  private segmentsIntersect(
    p1: [number, number], p2: [number, number],
    p3: [number, number], p4: [number, number]
  ): boolean {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];

    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false; // Parallel

    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / cross;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / cross;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Create a buffered (offset) polygon by expanding/contracting by a distance.
   * Positive distance = expand outward, negative = contract inward.
   * Uses a simple per-vertex normal offset approach.
   */
  buffer(distance: number): Polygon2D {
    const n = this.vertices.length;
    const newVerts: [number, number][] = [];

    for (let i = 0; i < n; i++) {
      const prev = this.vertices[(i - 1 + n) % n];
      const curr = this.vertices[i];
      const next = this.vertices[(i + 1) % n];

      // Compute edge normals
      const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
      const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];

      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (len1 < 1e-10 || len2 < 1e-10) {
        newVerts.push(curr);
        continue;
      }

      // Normalized normals (pointing outward for CCW polygon)
      const nx1 = -dy1 / len1, ny1 = dx1 / len1;
      const nx2 = -dy2 / len2, ny2 = dx2 / len2;

      // Average the two edge normals
      const avgNx = (nx1 + nx2) / 2;
      const avgNy = (ny1 + ny2) / 2;
      const avgLen = Math.sqrt(avgNx * avgNx + avgNy * avgNy);

      if (avgLen < 1e-10) {
        newVerts.push([curr[0] + nx1 * distance, curr[1] + ny1 * distance]);
      } else {
        const miterLength = 1 / avgLen;
        newVerts.push([
          curr[0] + avgNx * miterLength * distance,
          curr[1] + avgNy * miterLength * distance,
        ]);
      }
    }

    return new Polygon2D(newVerts);
  }

  /**
   * Compute the union of this polygon with another.
   * Returns a new polygon representing the combined area.
   * Uses a simplified approach: convex hull of combined vertices
   * filtered to only include vertices inside either polygon.
   */
  union(other: Polygon2D): Polygon2D {
    // Collect all vertices from both polygons plus intersection points
    const allVerts: [number, number][] = [
      ...this.vertices.filter(v => other.contains(v) || this.isOnBoundary(v, other)),
      ...other.vertices.filter(v => this.contains(v) || this.isOnBoundary(v, other)),
    ];

    // Add edge-edge intersection points
    const n1 = this.vertices.length;
    const n2 = other.vertices.length;
    for (let i = 0; i < n1; i++) {
      const a1 = this.vertices[i];
      const a2 = this.vertices[(i + 1) % n1];
      for (let j = 0; j < n2; j++) {
        const b1 = other.vertices[j];
        const b2 = other.vertices[(j + 1) % n2];
        const inter = this.segmentIntersection(a1, a2, b1, b2);
        if (inter) {
          allVerts.push(inter);
        }
      }
    }

    // Add vertices on the boundary of either polygon
    for (const v of this.vertices) {
      if (this.isOnBoundary(v, other)) {
        if (!allVerts.some(av => Math.abs(av[0] - v[0]) < 1e-8 && Math.abs(av[1] - v[1]) < 1e-8)) {
          allVerts.push(v);
        }
      }
    }
    for (const v of other.vertices) {
      if (this.isOnBoundary(v, this)) {
        if (!allVerts.some(av => Math.abs(av[0] - v[0]) < 1e-8 && Math.abs(av[1] - v[1]) < 1e-8)) {
          allVerts.push(v);
        }
      }
    }

    if (allVerts.length < 3) {
      // Fallback: return the convex hull of all vertices
      return this.convexHull([...this.vertices, ...other.vertices]);
    }

    return this.convexHull(allVerts);
  }

  /**
   * Compute the difference of this polygon minus another.
   * Returns a simplified approximation using bounding-box subtraction.
   */
  difference(other: Polygon2D): Polygon2D {
    // For simplicity, compute the area of this polygon that doesn't overlap with other.
    // Use a grid-sampling approach to approximate the difference contour.
    const bounds = this.bounds;
    const resolution = 0.3; // Grid resolution in meters
    const includedPoints: [number, number][] = [];

    for (let x = bounds.minX; x <= bounds.maxX; x += resolution) {
      for (let y = bounds.minY; y <= bounds.maxY; y += resolution) {
        const point: [number, number] = [x, y];
        if (this.contains(point) && !other.contains(point)) {
          includedPoints.push(point);
        }
      }
    }

    if (includedPoints.length < 3) {
      // If the difference is too small, return original with small buffer
      return this.buffer(-0.01);
    }

    return this.convexHull(includedPoints);
  }

  /**
   * Check if a point is approximately on the boundary of a polygon.
   */
  private isOnBoundary(point: [number, number], poly: Polygon2D, tolerance: number = 0.05): boolean {
    const n = poly.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = poly.vertices[i];
      const b = poly.vertices[(i + 1) % n];
      const dist = this.pointToSegmentDistance(point, a, b);
      if (dist < tolerance) return true;
    }
    return false;
  }

  /**
   * Compute the distance from a point to a line segment.
   */
  private pointToSegmentDistance(
    p: [number, number], a: [number, number], b: [number, number]
  ): number {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) {
      return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
    }

    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;
    return Math.sqrt((p[0] - projX) ** 2 + (p[1] - projY) ** 2);
  }

  /**
   * Compute the intersection point of two line segments, or null if they don't intersect.
   */
  private segmentIntersection(
    p1: [number, number], p2: [number, number],
    p3: [number, number], p4: [number, number]
  ): [number, number] | null {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];

    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return null;

    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / cross;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / cross;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [p1[0] + t * d1x, p1[1] + t * d1y];
    }
    return null;
  }

  /**
   * Compute the convex hull of a set of 2D points using Graham scan.
   */
  convexHull(points: [number, number][]): Polygon2D {
    if (points.length < 3) {
      throw new Error('Convex hull requires at least 3 points');
    }

    // Sort by x, then y
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    // Cross product of vectors OA and OB
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

    // Build lower hull
    const lower: [number, number][] = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    // Build upper hull
    const upper: [number, number][] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    // Remove last point of each half because it's repeated
    lower.pop();
    upper.pop();

    const hull = lower.concat(upper);
    if (hull.length < 3) {
      // Degenerate case: return a small triangle around the centroid
      const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
      const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
      return new Polygon2D([
        [cx - 0.5, cy - 0.5],
        [cx + 0.5, cy - 0.5],
        [cx, cy + 0.5],
      ]);
    }

    return new Polygon2D(hull);
  }

  /**
   * Create a rectangular polygon from a center point, width, and height.
   */
  static fromCenter(center: [number, number], width: number, height: number): Polygon2D {
    const [cx, cy] = center;
    const hw = width / 2, hh = height / 2;
    return new Polygon2D([
      [cx - hw, cy - hh],
      [cx + hw, cy - hh],
      [cx + hw, cy + hh],
      [cx - hw, cy + hh],
    ]);
  }

  /**
   * Create a rectangular polygon from corner coordinates.
   */
  static fromCorners(x1: number, y1: number, x2: number, y2: number): Polygon2D {
    return new Polygon2D([
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ]);
  }

  /**
   * Get the perimeter length of this polygon.
   */
  get perimeter(): number {
    let length = 0;
    const n = this.vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = this.vertices[j][0] - this.vertices[i][0];
      const dy = this.vertices[j][1] - this.vertices[i][1];
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }
}

// ============================================================================
// Room Graph Node
// ============================================================================

/**
 * A node in the room adjacency graph, representing a single room
 * with its type, area, and connectivity information.
 */
export class RoomGraphNode {
  /** Unique room name/identifier */
  public name: string;
  /** Semantic room type */
  public type: RoomType;
  /** Assigned 2D polygon (set after solving) */
  public polygon?: Polygon2D;
  /** Target floor area in square meters */
  public area: number;
  /** Set of neighbor room names */
  public neighbors: Set<string>;
  /** Floor level (0 = ground floor, 1 = first floor, etc.) */
  public level: number;

  constructor(
    name: string,
    type: RoomType,
    area: number,
    level: number = 0,
    neighbors: Set<string> = new Set()
  ) {
    this.name = name;
    this.type = type;
    this.area = area;
    this.level = level;
    this.neighbors = neighbors;
  }
}

// ============================================================================
// Room Graph Solver
// ============================================================================

/**
 * Solver that generates room adjacency graphs respecting semantic constraints
 * and assigns 2D polygons to rooms via simulated annealing.
 *
 * The solver works in two phases:
 * 1. buildGraph(): Generate a random graph respecting adjacency constraints
 * 2. solve(): Assign 2D polygons to rooms using simulated annealing
 */
export class RoomGraphSolver {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Build a room adjacency graph with the given parameters.
   * Generates room types based on weights and connects them respecting
   * required and preferred adjacency constraints.
   *
   * @param roomCount - Number of rooms to generate
   * @param totalArea - Total floor area to distribute among rooms
   * @param levels - Number of floor levels (default: 1)
   * @returns Array of RoomGraphNode with established adjacency relationships
   */
  buildGraph(roomCount: number, totalArea: number, levels: number = 1): RoomGraphNode[] {
    const nodes: RoomGraphNode[] = [];

    // Determine room types based on typical residential distribution
    const typeWeights = new Map<RoomType, number>([
      [RoomType.LivingRoom, 1.0],
      [RoomType.Kitchen, 1.0],
      [RoomType.Bedroom, 1.5],
      [RoomType.Bathroom, 1.0],
      [RoomType.Hallway, 0.8],
      [RoomType.DiningRoom, 0.6],
      [RoomType.Office, 0.4],
      [RoomType.Closet, 0.5],
      [RoomType.Laundry, 0.3],
      [RoomType.Balcony, 0.3],
      [RoomType.Garage, 0.2],
      [RoomType.Staircase, levels > 1 ? 0.6 : 0.0],
    ]);

    // Ensure at least one of each required type
    const requiredTypes = [RoomType.LivingRoom, RoomType.Kitchen, RoomType.Bathroom];
    for (const reqType of requiredTypes) {
      if (roomCount >= requiredTypes.length) {
        const config = ROOM_TYPE_CONFIGS.get(reqType)!;
        const area = this.rng.nextFloat(config.minArea, config.maxArea);
        const level = reqType === RoomType.Bathroom && levels > 1 ? this.rng.nextInt(0, levels - 1) : 0;
        const node = new RoomGraphNode(
          `${reqType}_${nodes.length}`,
          reqType,
          area,
          level
        );
        nodes.push(node);
      }
    }

    // Fill remaining rooms using weighted random selection
    while (nodes.length < roomCount) {
      const type = this.weightedChoice(typeWeights);
      const config = ROOM_TYPE_CONFIGS.get(type)!;
      const area = this.rng.nextFloat(config.minArea, config.maxArea);
      const level = this.rng.nextInt(0, Math.max(0, levels - 1));
      const node = new RoomGraphNode(
        `${type}_${nodes.length}`,
        type,
        area,
        level
      );
      nodes.push(node);
    }

    // Scale areas to match totalArea
    const currentTotal = nodes.reduce((sum, n) => sum + n.area, 0);
    const scale = totalArea / currentTotal;
    for (const node of nodes) {
      const config = ROOM_TYPE_CONFIGS.get(node.type)!;
      node.area = Math.max(config.minArea, Math.min(config.maxArea, node.area * scale));
    }

    // Establish adjacency connections
    this.establishAdjacencies(nodes);

    // Ensure all rooms are connected via Hallway
    this.ensureConnectivity(nodes);

    return nodes;
  }

  /**
   * Establish adjacency relationships respecting required and preferred constraints.
   */
  private establishAdjacencies(nodes: RoomGraphNode[]): void {
    // First, satisfy required adjacencies
    for (const node of nodes) {
      const config = ROOM_TYPE_CONFIGS.get(node.type);
      if (!config) continue;

      for (const reqType of config.requiredAdjacencies) {
        // Find a node of the required type that isn't already a neighbor
        const candidates = nodes.filter(
          n => n.type === reqType && n.name !== node.name && !node.neighbors.has(n.name)
        );

        if (candidates.length > 0) {
          const target = this.rng.choice(candidates);
          node.neighbors.add(target.name);
          target.neighbors.add(node.name);
        }
      }
    }

    // Then, add preferred adjacencies probabilistically
    for (const node of nodes) {
      const config = ROOM_TYPE_CONFIGS.get(node.type);
      if (!config) continue;

      for (const prefType of config.preferredAdjacencies) {
        if (this.rng.next() > 0.6) continue; // 60% chance to attempt preferred adjacency

        const candidates = nodes.filter(
          n => n.type === prefType && n.name !== node.name && !node.neighbors.has(n.name)
        );

        if (candidates.length > 0) {
          const target = this.rng.choice(candidates);
          node.neighbors.add(target.name);
          target.neighbors.add(node.name);
        }
      }
    }
  }

  /**
   * Ensure all rooms are reachable by connecting disconnected components
   * through hallway or nearest-room connections.
   */
  private ensureConnectivity(nodes: RoomGraphNode[]): void {
    if (nodes.length <= 1) return;

    const visited = new Set<string>();
    const components: string[][] = [];

    // Find connected components via BFS
    for (const node of nodes) {
      if (visited.has(node.name)) continue;

      const component: string[] = [];
      const queue = [node.name];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        const currentNode = nodes.find(n => n.name === current);
        if (currentNode) {
          for (const neighbor of currentNode.neighbors) {
            if (!visited.has(neighbor)) queue.push(neighbor);
          }
        }
      }

      components.push(component);
    }

    // Connect components through hallway or closest pairs
    const nodeMap = new Map(nodes.map(n => [n.name, n]));

    while (components.length > 1) {
      // Find the closest pair of nodes across components
      let bestDist = Infinity;
      let bestA = '';
      let bestB = '';

      for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
          for (const nameA of components[i]) {
            for (const nameB of components[j]) {
              // Use a rough distance metric (will be refined in solve())
              const dist = Math.abs(simpleStringHash(nameA)) - Math.abs(simpleStringHash(nameB));
              const pseudoDist = Math.abs(dist) + this.rng.next();
              if (pseudoDist < bestDist) {
                bestDist = pseudoDist;
                bestA = nameA;
                bestB = nameB;
              }
            }
          }
        }
      }

      // Connect the closest pair
      if (bestA && bestB) {
        const nodeA = nodeMap.get(bestA);
        const nodeB = nodeMap.get(bestB);
        if (nodeA && nodeB) {
          nodeA.neighbors.add(nodeB.name);
          nodeB.neighbors.add(nodeA.name);
        }

        // Merge the two components
        const compA = components.find(c => c.includes(bestA))!;
        const compB = components.find(c => c.includes(bestB))!;
        const merged = [...compA, ...compB];
        components.splice(components.indexOf(compA), 1);
        components.splice(components.indexOf(compB), 1);
        components.push(merged);
      } else {
        break;
      }
    }
  }

  /**
   * Assign 2D polygons to rooms using simulated annealing optimization.
   *
   * The objective function minimizes:
   * - Overlap between room polygons
   * - Distance between adjacent rooms (they should share walls)
   * - Area deviation from target areas
   * - Non-rectangular room shapes
   *
   * @param graph - Array of RoomGraphNode with adjacency relationships
   * @param contour - The building contour (outer boundary) as a Polygon2D
   * @returns Map from room name to assigned Polygon2D
   */
  solve(graph: RoomGraphNode[], contour: Polygon2D): Map<string, Polygon2D> {
    const result = new Map<string, Polygon2D>();
    const nodeMap = new Map(graph.map(n => [n.name, n]));

    // Initialize: place rooms as rectangles within the contour
    const contourBounds = contour.bounds;
    const totalWidth = contourBounds.maxX - contourBounds.minX;
    const totalHeight = contourBounds.maxY - contourBounds.minY;

    // Use a grid-based initial placement
    const cols = Math.ceil(Math.sqrt(graph.length * (totalWidth / totalHeight)));
    const rows = Math.ceil(graph.length / cols);
    const cellWidth = totalWidth / cols;
    const cellHeight = totalHeight / rows;

    // Current positions (center of each room rectangle)
    const positions = new Map<string, [number, number]>();
    const sizes = new Map<string, [number, number]>();

    let idx = 0;
    for (const node of graph) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = contourBounds.minX + (col + 0.5) * cellWidth;
      const cy = contourBounds.minY + (row + 0.5) * cellHeight;

      // Compute size from area, maintaining reasonable aspect ratio
      const aspectRatio = 0.7 + this.rng.next() * 0.6; // 0.7 to 1.3
      const width = Math.sqrt(node.area * aspectRatio);
      const height = node.area / width;

      positions.set(node.name, [cx, cy]);
      sizes.set(node.name, [width, height]);

      const poly = Polygon2D.fromCenter([cx, cy], width, height);
      result.set(node.name, poly);
      idx++;
    }

    // Simulated annealing optimization
    const maxIterations = 5000;
    const initialTemperature = 100.0;
    const coolingRate = 0.997;
    let temperature = initialTemperature;

    let bestEnergy = this.computeEnergy(graph, result, contour, nodeMap);
    let bestResult = new Map(result.entries().map(([k, v]) => [k, v]));

    for (let iter = 0; iter < maxIterations; iter++) {
      // Generate a neighbor state by perturbing one room
      const roomName = this.rng.choice(graph).name;
      const currentPos = positions.get(roomName)!;
      const currentSize = sizes.get(roomName)!;

      // Perturbation type
      const moveType = this.rng.next();

      let newPos: [number, number];
      let newSize: [number, number];

      if (moveType < 0.5) {
        // Move room position
        const dx = this.rng.gaussian(0, cellWidth * 0.3);
        const dy = this.rng.gaussian(0, cellHeight * 0.3);
        newPos = [currentPos[0] + dx, currentPos[1] + dy];
        newSize = currentSize;
      } else if (moveType < 0.8) {
        // Resize room
        const scaleFactor = 0.9 + this.rng.next() * 0.2;
        const aspectDelta = (this.rng.next() - 0.5) * 0.2;
        newSize = [currentSize[0] * scaleFactor, currentSize[1] * (1 / scaleFactor) * (1 + aspectDelta)];
        newPos = currentPos;
      } else {
        // Both move and resize
        const dx = this.rng.gaussian(0, cellWidth * 0.15);
        const dy = this.rng.gaussian(0, cellHeight * 0.15);
        newPos = [currentPos[0] + dx, currentPos[1] + dy];
        const scaleFactor = 0.95 + this.rng.next() * 0.1;
        newSize = [currentSize[0] * scaleFactor, currentSize[1] / scaleFactor];
      }

      // Apply perturbation
      const oldPoly = result.get(roomName);
      positions.set(roomName, newPos);
      sizes.set(roomName, newSize);
      result.set(roomName, Polygon2D.fromCenter(newPos, newSize[0], newSize[1]));

      // Compute new energy
      const newEnergy = this.computeEnergy(graph, result, contour, nodeMap);

      // Accept or reject
      const deltaE = newEnergy - bestEnergy;
      if (deltaE < 0 || this.rng.next() < Math.exp(-deltaE / temperature)) {
        // Accept
        if (newEnergy < bestEnergy) {
          bestEnergy = newEnergy;
          bestResult = new Map(result.entries().map(([k, v]) => [k, v]));
        }
      } else {
        // Reject: revert
        if (oldPoly) {
          result.set(roomName, oldPoly);
        }
        positions.set(roomName, currentPos);
        sizes.set(roomName, currentSize);
      }

      temperature *= coolingRate;
      if (temperature < 0.01) break;
    }

    // Update graph nodes with solved polygons
    for (const node of graph) {
      node.polygon = bestResult.get(node.name);
    }

    return bestResult;
  }

  /**
   * Compute the energy (cost) of a room layout.
   * Lower energy = better layout.
   */
  private computeEnergy(
    graph: RoomGraphNode[],
    layout: Map<string, Polygon2D>,
    contour: Polygon2D,
    nodeMap: Map<string, RoomGraphNode>
  ): number {
    let energy = 0;

    for (const node of graph) {
      const poly = layout.get(node.name);
      if (!poly) continue;

      // 1. Area deviation penalty
      const config = ROOM_TYPE_CONFIGS.get(node.type);
      if (config) {
        const areaDiff = Math.abs(poly.area - node.area);
        energy += areaDiff * 2.0;

        // Hard constraint violation
        if (poly.area < config.minArea) {
          energy += (config.minArea - poly.area) * 10.0;
        }
        if (poly.area > config.maxArea) {
          energy += (poly.area - config.maxArea) * 10.0;
        }
      }

      // 2. Containment penalty (room must be inside building contour)
      const bounds = poly.bounds;
      const contourBounds = contour.bounds;
      if (bounds.minX < contourBounds.minX || bounds.maxX > contourBounds.maxX ||
          bounds.minY < contourBounds.minY || bounds.maxY > contourBounds.maxY) {
        energy += 50.0;
      }

      // 3. Overlap penalty with non-adjacent rooms
      for (const other of graph) {
        if (other.name <= node.name) continue;
        const otherPoly = layout.get(other.name);
        if (!otherPoly) continue;

        if (poly.intersects(otherPoly)) {
          // Overlap is somewhat acceptable for adjacent rooms
          if (node.neighbors.has(other.name)) {
            energy += 1.0; // Small penalty for adjacent overlap
          } else {
            energy += 20.0; // Large penalty for non-adjacent overlap
          }
        }
      }

      // 4. Adjacency distance penalty
      for (const neighborName of node.neighbors) {
        const neighborPoly = layout.get(neighborName);
        if (!neighborPoly) continue;

        const c1 = poly.centroid;
        const c2 = neighborPoly.centroid;
        const dist = Math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2);

        // Adjacent rooms should be close
        const targetDist = (Math.sqrt(poly.area) + Math.sqrt(neighborPoly.area)) / 2;
        energy += Math.abs(dist - targetDist) * 0.5;
      }

      // 5. Aspect ratio penalty (prefer not-too-extreme aspect ratios)
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const aspectRatio = Math.max(width, height) / Math.max(Math.min(width, height), 0.1);
      if (aspectRatio > 3.0) {
        energy += (aspectRatio - 3.0) * 2.0;
      }
    }

    return energy;
  }

  /**
   * Weighted random choice from a map of items to weights.
   */
  private weightedChoice(weights: Map<RoomType, number>): RoomType {
    const entries = Array.from(weights.entries()).filter(([, w]) => w > 0);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = this.rng.next() * totalWeight;

    for (const [type, weight] of entries) {
      r -= weight;
      if (r <= 0) return type;
    }

    return entries[entries.length - 1][0];
  }
}

// ============================================================================
// Floor Plan Opening Placement
// ============================================================================

/**
 * Placement of an opening (door, window, archway) within a floor plan.
 * This is the floor-plan-level representation; see SemanticPlacementRules.ts
 * for the detailed OpeningPlacement with THREE.Vector3 positions.
 */
export interface FloorPlanOpeningPlacement {
  /** Type of opening */
  type: 'door' | 'window' | 'archway' | 'panoramic';
  /** Wall this opening is on */
  wall: 'north' | 'south' | 'east' | 'west';
  /** 3D position of the opening center */
  position: [number, number, number];
  /** Width of the opening */
  width: number;
  /** Height of the opening */
  height: number;
  /** Sill height (distance from floor to bottom of opening) */
  sillHeight: number;
  /** Name of the room this opening connects to (for doors/archways) */
  connectsTo?: string;
}

// ============================================================================
// Floor Plan Configuration & Result
// ============================================================================

/**
 * Configuration for floor plan generation.
 */
export interface FloorPlanConfig {
  /** Number of rooms to generate */
  roomCount: number;
  /** Total floor area in square meters */
  totalArea: number;
  /** Number of floor levels */
  levels: number;
  /** Random seed for reproducibility (default: 42) */
  seed?: number;
  /** Weights for each room type (affects likelihood of assignment) */
  roomTypeWeights?: Map<RoomType, number>;
}

/**
 * Result of floor plan generation.
 */
export interface FloorPlanResult {
  /** Map from room name to room definition (type, polygon, level) */
  rooms: Map<string, { type: RoomType; polygon: Polygon2D; level: number }>;
  /** Openings (doors, windows) placed on walls */
  openings: FloorPlanOpeningPlacement[];
  /** The room adjacency graph */
  graph: RoomGraphNode[];
}

// ============================================================================
// Top-Level Generation Function
// ============================================================================

/**
 * Generate a complete floor plan from configuration.
 *
 * This is the main entry point for floor plan generation. It:
 * 1. Builds a room adjacency graph respecting semantic constraints
 * 2. Assigns 2D polygons to rooms via simulated annealing
 * 3. Places openings (doors, windows) based on room semantics
 *
 * @param config - Floor plan generation configuration
 * @returns Complete floor plan result with rooms, openings, and graph
 *
 * @example
 * ```typescript
 * const result = generateFloorPlan({
 *   roomCount: 6,
 *   totalArea: 120,
 *   levels: 1,
 *   seed: 42,
 * });
 *
 * for (const [name, room] of result.rooms) {
 *   console.log(`${name}: ${room.type} (${room.polygon.area.toFixed(1)} m²)`);
 * }
 * ```
 */
export function generateFloorPlan(config: FloorPlanConfig): FloorPlanResult {
  const seed = config.seed ?? 42;
  const rng = new SeededRandom(seed);

  // Create building contour (rectangular, sized to fit total area with margin)
  const margin = 1.5; // meters margin around rooms
  const totalArea = config.totalArea;
  const aspectRatio = 0.7 + rng.next() * 0.3; // Building aspect ratio
  const buildingWidth = Math.sqrt(totalArea * aspectRatio) + margin * 2;
  const buildingHeight = totalArea / (buildingWidth - margin * 2) + margin * 2;
  const contour = Polygon2D.fromCorners(0, 0, buildingWidth, buildingHeight);

  // Build room graph
  const solver = new RoomGraphSolver(seed);
  const graph = solver.buildGraph(config.roomCount, config.totalArea, config.levels);

  // Assign polygons via simulated annealing
  const roomPolygons = solver.solve(graph, contour);

  // Build result rooms map
  const rooms = new Map<string, { type: RoomType; polygon: Polygon2D; level: number }>();
  for (const node of graph) {
    if (node.polygon) {
      rooms.set(node.name, {
        type: node.type,
        polygon: node.polygon,
        level: node.level,
      });
    }
  }

  // Generate openings
  const openings = generateOpenings(graph, rooms, rng);

  return { rooms, openings, graph };
}

// ============================================================================
// Opening Generation
// ============================================================================

/**
 * Generate door and window openings for all rooms based on semantic rules.
 */
function generateOpenings(
  graph: RoomGraphNode[],
  rooms: Map<string, { type: RoomType; polygon: Polygon2D; level: number }>,
  rng: SeededRandom
): FloorPlanOpeningPlacement[] {
  const openings: FloorPlanOpeningPlacement[] = [];

  for (const node of graph) {
    const roomDef = rooms.get(node.name);
    if (!roomDef) continue;

    const config = ROOM_TYPE_CONFIGS.get(node.type);
    if (!config) continue;

    const poly = roomDef.polygon;
    const bounds = poly.bounds;
    const roomHeight = 2.8; // Standard ceiling height

    // Place doors to adjacent rooms
    for (const neighborName of node.neighbors) {
      const neighborDef = rooms.get(neighborName);
      if (!neighborDef) continue;

      const neighborPoly = neighborDef.polygon;
      const nBounds = neighborPoly.bounds;

      // Determine which wall faces the neighbor
      const wall = determineSharedWall(bounds, nBounds);

      if (wall) {
        // Compute door position at the center of the shared wall section
        const doorPos = computeOpeningPosition(bounds, wall, roomHeight * 0.5, 0.5);

        openings.push({
          type: 'door',
          wall,
          position: doorPos,
          width: 0.9,
          height: 2.1,
          sillHeight: 0,
          connectsTo: neighborName,
        });
      }
    }

    // Place windows on exterior walls
    if (rng.next() < config.windowProbability) {
      // Choose a wall that's likely exterior (not shared with neighbors)
      const walls = getAvailableWalls(node, rooms);
      if (walls.length > 0) {
        const windowWall = rng.choice(walls);
        const windowPos = computeOpeningPosition(
          bounds, windowWall, roomHeight * 0.65, 0.5
        );

        // Window size depends on room type
        let windowWidth = 1.2;
        let windowHeight = 1.4;
        let sillHeight = 0.9;

        if (node.type === RoomType.Bathroom) {
          windowWidth = 0.6;
          windowHeight = 0.8;
          sillHeight = 1.5;
        } else if (node.type === RoomType.Closet) {
          continue; // No windows for closets
        } else if (node.type === RoomType.LivingRoom) {
          windowWidth = 1.8;
          windowHeight = 1.6;
          sillHeight = 0.8;
        }

        openings.push({
          type: 'window',
          wall: windowWall,
          position: windowPos,
          width: windowWidth,
          height: windowHeight,
          sillHeight,
        });
      }
    }
  }

  return openings;
}

/**
 * Determine which wall of a room faces a neighbor room.
 */
function determineSharedWall(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  neighborBounds: { minX: number; minY: number; maxX: number; maxY: number }
): 'north' | 'south' | 'east' | 'west' | null {
  const tolerance = 1.0;

  // Check east/west adjacency
  if (Math.abs(bounds.maxX - neighborBounds.minX) < tolerance ||
      Math.abs(bounds.minX - neighborBounds.maxX) < tolerance) {
    // Check Y overlap
    const yOverlap = Math.min(bounds.maxY, neighborBounds.maxY) - Math.max(bounds.minY, neighborBounds.minY);
    if (yOverlap > 0.5) {
      if (Math.abs(bounds.maxX - neighborBounds.minX) < tolerance) return 'east';
      return 'west';
    }
  }

  // Check north/south adjacency
  if (Math.abs(bounds.maxY - neighborBounds.minY) < tolerance ||
      Math.abs(bounds.minY - neighborBounds.maxY) < tolerance) {
    // Check X overlap
    const xOverlap = Math.min(bounds.maxX, neighborBounds.maxX) - Math.max(bounds.minX, neighborBounds.minX);
    if (xOverlap > 0.5) {
      if (Math.abs(bounds.maxY - neighborBounds.minY) < tolerance) return 'north';
      return 'south';
    }
  }

  return null;
}

/**
 * Compute the 3D position of an opening on a wall.
 */
function computeOpeningPosition(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  wall: 'north' | 'south' | 'east' | 'west',
  heightY: number,
  positionAlongWall: number
): [number, number, number] {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  switch (wall) {
    case 'north':
      return [bounds.minX + width * positionAlongWall, heightY, bounds.maxY];
    case 'south':
      return [bounds.minX + width * positionAlongWall, heightY, bounds.minY];
    case 'east':
      return [bounds.maxX, heightY, bounds.minY + height * positionAlongWall];
    case 'west':
      return [bounds.minX, heightY, bounds.minY + height * positionAlongWall];
  }
}

/**
 * Get walls of a room that are likely exterior (not shared with neighbors).
 */
function getAvailableWalls(
  node: RoomGraphNode,
  rooms: Map<string, { type: RoomType; polygon: Polygon2D; level: number }>
): Array<'north' | 'south' | 'east' | 'west'> {
  const allWalls: Array<'north' | 'south' | 'east' | 'west'> = ['north', 'south', 'east', 'west'];
  const roomDef = rooms.get(node.name);
  if (!roomDef) return allWalls;

  const bounds = roomDef.polygon.bounds;
  const occupiedWalls = new Set<string>();

  for (const neighborName of node.neighbors) {
    const neighborDef = rooms.get(neighborName);
    if (!neighborDef) continue;

    const sharedWall = determineSharedWall(bounds, neighborDef.polygon.bounds);
    if (sharedWall) {
      occupiedWalls.add(sharedWall);
    }
  }

  return allWalls.filter(w => !occupiedWalls.has(w));
}

/**
 * Simple string hash function for generating pseudo-random numbers from strings.
 * Uses a DJB2-like algorithm.
 */
function simpleStringHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
