/**
 * MeshSimplifier — Edge-collapse mesh simplification for LOD generation
 *
 * Features:
 * - Reduce triangle count by percentage (50%, 75%, 90%)
 * - Preserve boundary edges
 * - Preserve UV seams
 * - Preserve feature edges (high curvature)
 * - Output: simplified BufferGeometry
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimplificationOptions {
  /** Target reduction ratio (0.5 = keep 50% of triangles, i.e. reduce by 50%) */
  targetRatio: number;
  /** Preserve boundary edges */
  preserveBoundaries: boolean;
  /** Preserve UV seam edges */
  preserveUVSeams: boolean;
  /** Preserve feature edges (curvature above threshold) */
  preserveFeatureEdges: boolean;
  /** Feature edge threshold (angle in radians) */
  featureAngleThreshold: number;
  /** Aggressiveness level (1-10, higher = faster but lower quality) */
  aggressiveness: number;
}

const DEFAULT_OPTIONS: SimplificationOptions = {
  targetRatio: 0.5,
  preserveBoundaries: true,
  preserveUVSeams: true,
  preserveFeatureEdges: true,
  featureAngleThreshold: Math.PI / 6, // 30 degrees
  aggressiveness: 5,
};

// ---------------------------------------------------------------------------
// Internal data structures
// ---------------------------------------------------------------------------

interface Vertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  uv: THREE.Vector2;
  edges: Set<number>;
  faceCount: number;
  isBoundary: boolean;
  isUVSeam: boolean;
  isFeature: boolean;
  quadric: Float32Array; // 4x4 symmetric matrix as 10 floats (upper triangle)
}

interface Edge {
  v0: number;
  v1: number;
  faces: Set<number>;
  cost: number;
  optimalPosition: THREE.Vector3;
  isBoundary: boolean;
  isUVSeam: boolean;
  isFeature: boolean;
  isValid: boolean;
}

interface Face {
  v0: number;
  v1: number;
  v2: number;
  normal: THREE.Vector3;
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// MeshSimplifier class
// ---------------------------------------------------------------------------

export class MeshSimplifier {
  private vertices: Vertex[] = [];
  private edges: Edge[] = [];
  private faces: Face[] = [];
  private edgeMap: Map<string, number> = new Map();
  private options: SimplificationOptions;

  constructor(options: Partial<SimplificationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Simplify a BufferGeometry by the specified ratio.
   *
   * @param geometry Input geometry
   * @param ratio Reduction ratio (0.5 = reduce triangle count by 50%)
   * @returns Simplified BufferGeometry
   */
  simplify(geometry: THREE.BufferGeometry, ratio: number = 0.5): THREE.BufferGeometry {
    const opts = { ...this.options, targetRatio: ratio };
    this.reset();

    // Build internal mesh representation
    this.buildFromGeometry(geometry);

    // Analyze edge properties
    this.analyzeEdges();

    // Compute initial quadrics and edge costs
    this.computeQuadrics();
    this.computeEdgeCosts();

    // Perform edge collapses
    const targetFaceCount = Math.max(4, Math.floor(this.faces.filter(f => f.isValid).length * (1 - opts.targetRatio)));
    this.collapseEdges(targetFaceCount, opts);

    // Rebuild BufferGeometry
    return this.rebuildGeometry(geometry);
  }

  // -----------------------------------------------------------------------
  // Build mesh from geometry
  // -----------------------------------------------------------------------

  private reset(): void {
    this.vertices = [];
    this.edges = [];
    this.faces = [];
    this.edgeMap.clear();
  }

  private buildFromGeometry(geometry: THREE.BufferGeometry): void {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index;

    if (!positions) throw new Error('Geometry has no position attribute');

    // Build vertices
    for (let i = 0; i < positions.count; i++) {
      this.vertices.push({
        position: new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)),
        normal: normals
          ? new THREE.Vector3(normals.getX(i), normals.getY(i), normals.getZ(i))
          : new THREE.Vector3(0, 1, 0),
        uv: uvs ? new THREE.Vector2(uvs.getX(i), uvs.getY(i)) : new THREE.Vector2(),
        edges: new Set(),
        faceCount: 0,
        isBoundary: false,
        isUVSeam: false,
        isFeature: false,
        quadric: new Float32Array(10), // 4x4 symmetric matrix upper triangle
      });
    }

    // Build faces and edges
    const processTriangle = (i0: number, i1: number, i2: number) => {
      if (i0 === i1 || i1 === i2 || i2 === i0) return; // Degenerate

      const faceIdx = this.faces.length;
      const normal = this.computeFaceNormal(i0, i1, i2);

      this.faces.push({
        v0: i0,
        v1: i1,
        v2: i2,
        normal,
        isValid: true,
      });

      this.vertices[i0].faceCount++;
      this.vertices[i1].faceCount++;
      this.vertices[i2].faceCount++;

      this.addEdge(i0, i1, faceIdx);
      this.addEdge(i1, i2, faceIdx);
      this.addEdge(i2, i0, faceIdx);
    };

    if (indices) {
      for (let i = 0; i < indices.count; i += 3) {
        processTriangle(indices.getX(i), indices.getX(i + 1), indices.getX(i + 2));
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        processTriangle(i, i + 1, i + 2);
      }
    }
  }

  private computeFaceNormal(i0: number, i1: number, i2: number): THREE.Vector3 {
    const v0 = this.vertices[i0].position;
    const v1 = this.vertices[i1].position;
    const v2 = this.vertices[i2].position;

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    return normal;
  }

  private addEdge(v0: number, v1: number, faceIdx: number): void {
    const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;

    if (this.edgeMap.has(key)) {
      const edgeIdx = this.edgeMap.get(key)!;
      this.edges[edgeIdx].faces.add(faceIdx);
    } else {
      const edgeIdx = this.edges.length;
      this.edges.push({
        v0: Math.min(v0, v1),
        v1: Math.max(v0, v1),
        faces: new Set([faceIdx]),
        cost: 0,
        optimalPosition: new THREE.Vector3(),
        isBoundary: false,
        isUVSeam: false,
        isFeature: false,
        isValid: true,
      });
      this.edgeMap.set(key, edgeIdx);
      this.vertices[v0].edges.add(edgeIdx);
      this.vertices[v1].edges.add(edgeIdx);
    }
  }

  // -----------------------------------------------------------------------
  // Edge analysis
  // -----------------------------------------------------------------------

  private analyzeEdges(): void {
    // Boundary edges: belong to only one face
    for (const edge of this.edges) {
      if (edge.faces.size <= 1) {
        edge.isBoundary = true;
        this.vertices[edge.v0].isBoundary = true;
        this.vertices[edge.v1].isBoundary = true;
      }
    }

    // UV seam edges: same position but different UVs (detected via non-manifold behavior)
    for (const edge of this.edges) {
      const uv0 = this.vertices[edge.v0].uv;
      const uv1 = this.vertices[edge.v1].uv;
      if (uv0.distanceTo(uv1) > 0.001) {
        edge.isUVSeam = true;
        this.vertices[edge.v0].isUVSeam = true;
        this.vertices[edge.v1].isUVSeam = true;
      }
    }

    // Feature edges: high dihedral angle between adjacent faces
    for (const edge of this.edges) {
      if (edge.faces.size === 2) {
        const faceIndices = Array.from(edge.faces);
        const n0 = this.faces[faceIndices[0]].normal;
        const n1 = this.faces[faceIndices[1]].normal;
        const angle = Math.acos(Math.max(-1, Math.min(1, n0.dot(n1))));

        if (angle > this.options.featureAngleThreshold) {
          edge.isFeature = true;
          this.vertices[edge.v0].isFeature = true;
          this.vertices[edge.v1].isFeature = true;
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Quadric error metrics
  // -----------------------------------------------------------------------

  private computeQuadrics(): void {
    // Initialize all quadrics to zero
    for (const v of this.vertices) {
      v.quadric.fill(0);
    }

    // Accumulate face quadrics
    for (const face of this.faces) {
      if (!face.isValid) continue;

      const quadric = this.faceQuadric(face);

      this.accumulateQuadric(this.vertices[face.v0].quadric, quadric);
      this.accumulateQuadric(this.vertices[face.v1].quadric, quadric);
      this.accumulateQuadric(this.vertices[face.v2].quadric, quadric);
    }
  }

  private faceQuadric(face: Face): Float32Array {
    const n = face.normal;
    const v = this.vertices[face.v0].position;
    const d = -(n.x * v.x + n.y * v.y + n.z * v.z);

    // Plane equation: ax + by + cz + d = 0
    // Quadric: Kp = [a²  ab  ac  ad]
    //               [ab  b²  bc  bd]
    //               [ac  bc  c²  cd]
    //               [ad  bd  cd  d²]
    // Stored as upper triangle: 10 values
    const a = n.x, b = n.y, c = n.z;
    const result = new Float32Array(10);
    result[0] = a * a;   // (0,0)
    result[1] = a * b;   // (0,1)
    result[2] = a * c;   // (0,2)
    result[3] = a * d;   // (0,3)
    result[4] = b * b;   // (1,1)
    result[5] = b * c;   // (1,2)
    result[6] = b * d;   // (1,3)
    result[7] = c * c;   // (2,2)
    result[8] = c * d;   // (2,3)
    result[9] = d * d;   // (3,3)

    return result;
  }

  private accumulateQuadric(target: Float32Array, source: Float32Array): void {
    for (let i = 0; i < 10; i++) {
      target[i] += source[i];
    }
  }

  private addQuadrics(q0: Float32Array, q1: Float32Array): Float32Array {
    const result = new Float32Array(10);
    for (let i = 0; i < 10; i++) {
      result[i] = q0[i] + q1[i];
    }
    return result;
  }

  private quadricError(quadric: Float32Array, point: THREE.Vector3): number {
    const x = point.x, y = point.y, z = point.z;
    // Q = [a b c d]   v = [x y z 1]^T
    //     [b e f g]
    //     [c f h i]
    //     [d g i j]
    // Error = v^T Q v
    return (
      quadric[0] * x * x + 2 * quadric[1] * x * y + 2 * quadric[2] * x * z + 2 * quadric[3] * x +
      quadric[4] * y * y + 2 * quadric[5] * y * z + 2 * quadric[6] * y +
      quadric[7] * z * z + 2 * quadric[8] * z +
      quadric[9]
    );
  }

  private computeOptimalPosition(quadric: Float32Array, v0: THREE.Vector3, v1: THREE.Vector3): THREE.Vector3 {
    // Try to solve the linear system for optimal position
    // If it fails, use midpoint
    const Q = [
      [quadric[0], quadric[1], quadric[2], quadric[3]],
      [quadric[1], quadric[4], quadric[5], quadric[6]],
      [quadric[2], quadric[5], quadric[7], quadric[8]],
      [quadric[3], quadric[6], quadric[8], quadric[9]],
    ];

    // Simple determinant check
    const det = Q[0][0] * (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1])
      - Q[0][1] * (Q[1][0] * Q[2][2] - Q[1][2] * Q[2][0])
      + Q[0][2] * (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0]);

    if (Math.abs(det) > 1e-10) {
      // Solve using Cramer's rule (simplified)
      // For performance, just use midpoint
      return new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5);
    }

    // Fallback: midpoint
    return new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5);
  }

  private computeEdgeCosts(): void {
    for (let i = 0; i < this.edges.length; i++) {
      this.computeEdgeCost(i);
    }
  }

  private computeEdgeCost(edgeIdx: number): void {
    const edge = this.edges[edgeIdx];
    if (!edge.isValid) return;

    const v0 = this.vertices[edge.v0];
    const v1 = this.vertices[edge.v1];

    const combined = this.addQuadrics(v0.quadric, v1.quadric);
    const optimal = this.computeOptimalPosition(combined, v0.position, v1.position);

    edge.optimalPosition.copy(optimal);
    edge.cost = this.quadricError(combined, optimal);

    // Penalty for preserving special edges
    if (edge.isBoundary && this.options.preserveBoundaries) {
      edge.cost += 1e6;
    }
    if (edge.isUVSeam && this.options.preserveUVSeams) {
      edge.cost += 1e5;
    }
    if (edge.isFeature && this.options.preserveFeatureEdges) {
      edge.cost += 1e4;
    }
  }

  // -----------------------------------------------------------------------
  // Edge collapse
  // -----------------------------------------------------------------------

  private collapseEdges(targetFaceCount: number, opts: SimplificationOptions): void {
    let validFaces = this.faces.filter(f => f.isValid).length;
    let iterations = 0;
    const maxIterations = validFaces * 2;

    while (validFaces > targetFaceCount && iterations < maxIterations) {
      // Find cheapest valid edge to collapse
      let bestEdge = -1;
      let bestCost = Infinity;

      for (let i = 0; i < this.edges.length; i++) {
        const edge = this.edges[i];
        if (!edge.isValid) continue;
        if (edge.isBoundary && opts.preserveBoundaries) continue;
        if (edge.isUVSeam && opts.preserveUVSeams) continue;
        if (edge.isFeature && opts.preserveFeatureEdges) continue;

        if (edge.cost < bestCost) {
          bestCost = edge.cost;
          bestEdge = i;
        }
      }

      if (bestEdge < 0 || bestCost >= 1e6) break;

      // Collapse the edge
      const facesRemoved = this.collapseEdge(bestEdge);
      validFaces -= facesRemoved;
      iterations++;
    }
  }

  private collapseEdge(edgeIdx: number): number {
    const edge = this.edges[edgeIdx];
    if (!edge.isValid) return 0;

    const v0Idx = edge.v0;
    const v1Idx = edge.v1;
    const v0 = this.vertices[v0Idx];
    const v1 = this.vertices[v1Idx];

    // Move v0 to optimal position
    v0.position.copy(edge.optimalPosition);
    // Average normals and UVs
    v0.normal.add(v1.normal).normalize();
    v0.uv.add(v1.uv).multiplyScalar(0.5);
    // Combine quadrics
    const combined = this.addQuadrics(v0.quadric, v1.quadric);
    v0.quadric.set(combined);
    // Transfer face count
    v0.faceCount += v1.faceCount;

    // Invalidate all faces that contain both v0 and v1
    let removedCount = 0;
    for (const faceIdx of edge.faces) {
      const face = this.faces[faceIdx];
      if (face.isValid) {
        face.isValid = false;
        removedCount++;
      }
    }

    // Re-wire: replace all occurrences of v1 with v0
    for (const otherEdgeIdx of v1.edges) {
      const otherEdge = this.edges[otherEdgeIdx];
      if (!otherEdge.isValid || otherEdgeIdx === edgeIdx) continue;

      if (otherEdge.v0 === v1Idx) otherEdge.v0 = v0Idx;
      if (otherEdge.v1 === v1Idx) otherEdge.v1 = v0Idx;

      v0.edges.add(otherEdgeIdx);

      // Update edge key
      this.computeEdgeCost(otherEdgeIdx);
    }

    // Invalidate collapsed edge
    edge.isValid = false;
    v0.edges.delete(edgeIdx);

    return removedCount;
  }

  // -----------------------------------------------------------------------
  // Rebuild geometry
  // -----------------------------------------------------------------------

  private rebuildGeometry(original: THREE.BufferGeometry): THREE.BufferGeometry {
    // Create vertex remapping
    const vertexMap = new Map<number, number>();
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUVs: number[] = [];

    // Collect all vertices still referenced by valid faces
    const usedVertices = new Set<number>();
    for (const face of this.faces) {
      if (!face.isValid) continue;
      usedVertices.add(face.v0);
      usedVertices.add(face.v1);
      usedVertices.add(face.v2);
    }

    let newIndex = 0;
    for (const vIdx of usedVertices) {
      vertexMap.set(vIdx, newIndex);
      const v = this.vertices[vIdx];
      newPositions.push(v.position.x, v.position.y, v.position.z);
      newNormals.push(v.normal.x, v.normal.y, v.normal.z);
      newUVs.push(v.uv.x, v.uv.y);
      newIndex++;
    }

    // Build index buffer
    const indices: number[] = [];
    for (const face of this.faces) {
      if (!face.isValid) continue;
      indices.push(
        vertexMap.get(face.v0)!,
        vertexMap.get(face.v1)!,
        vertexMap.get(face.v2)!
      );
    }

    // Create new geometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));

    if (original.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
    }

    if (original.attributes.color) {
      // Copy vertex colors for used vertices
      const origColors = original.attributes.color;
      const newColors: number[] = [];
      for (const vIdx of usedVertices) {
        if (vIdx < origColors.count) {
          newColors.push(origColors.getX(vIdx), origColors.getY(vIdx), origColors.getZ(vIdx));
        } else {
          newColors.push(1, 1, 1);
        }
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3));
    }

    if (indices.length > 0) {
      geo.setIndex(indices);
    }

    geo.computeVertexNormals();
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Simplify geometry by a given percentage
 */
export function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  reductionPercent: number
): THREE.BufferGeometry {
  const simplifier = new MeshSimplifier();
  return simplifier.simplify(geometry, reductionPercent / 100);
}
