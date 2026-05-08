/**
 * ChunkStitcher.ts
 * 
 * Prevents cracks between adjacent terrain chunks at different LOD levels.
 * Implements edge stitching algorithms to ensure seamless transitions.
 * 
 * Based on original Infinigen's chunk stitching logic adapted for Three.js/R3F.
 */

import { BufferGeometry, Vector3 } from 'three';

export interface ChunkBoundary {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface StitchConfig {
  stitchThreshold: number;
  maxStitchDistance: number;
  enableDiagonalStitching: boolean;
}

const DEFAULT_STITCH_CONFIG: StitchConfig = {
  stitchThreshold: 0.01,
  maxStitchDistance: 2.0,
  enableDiagonalStitching: true,
};

/**
 * Manages stitching between adjacent terrain chunks to prevent visible cracks
 */
export class ChunkStitcher {
  private config: StitchConfig;
  private stitchCache: Map<string, number[]>;

  constructor(config: Partial<StitchConfig> = {}) {
    this.config = { ...DEFAULT_STITCH_CONFIG, ...config };
    this.stitchCache = new Map();
  }

  /**
   * Stitch two adjacent chunk geometries together
   */
  stitchChunks(
    primaryGeom: BufferGeometry,
    neighborGeom: BufferGeometry,
    direction: 'left' | 'right' | 'top' | 'bottom'
  ): BufferGeometry {
    const primaryPositions = primaryGeom.getAttribute('position');
    const neighborPositions = neighborGeom.getAttribute('position');

    if (!primaryPositions || !neighborPositions) {
      return primaryGeom;
    }

    const primaryVertices = this.extractBoundaryVertices(
      primaryPositions,
      direction,
      true
    );
    const neighborVertices = this.extractBoundaryVertices(
      neighborPositions,
      this.getOppositeDirection(direction),
      false
    );

    const stitchPoints = this.findStitchPoints(primaryVertices, neighborVertices);
    
    if (stitchPoints.length === 0) {
      return primaryGeom;
    }

    return this.applyStitching(primaryGeom, stitchPoints, direction);
  }

  /**
   * Extract vertices along a specific boundary edge
   */
  private extractBoundaryVertices(
    positions: any,
    direction: string,
    isPrimary: boolean
  ): Vector3[] {
    const vertices: Vector3[] = [];
    const count = positions.count;

    for (let i = 0; i < count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);

      // Determine if vertex is on the boundary based on direction
      if (this.isOnBoundary(x, z, direction, isPrimary)) {
        vertices.push(new Vector3(x, y, z));
      }
    }

    return vertices.sort((a, b) => this.sortBoundaryVertices(a, b, direction));
  }

  /**
   * Check if a vertex lies on the specified boundary
   */
  private isOnBoundary(
    x: number,
    z: number,
    direction: string,
    isPrimary: boolean
  ): boolean {
    const threshold = this.config.stitchThreshold;

    switch (direction) {
      case 'left':
        return isPrimary ? x < threshold : x > -threshold;
      case 'right':
        return isPrimary ? x > -threshold : x < threshold;
      case 'top':
        return isPrimary ? z > -threshold : z < threshold;
      case 'bottom':
        return isPrimary ? z < threshold : z > -threshold;
      default:
        return false;
    }
  }

  /**
   * Sort boundary vertices in consistent order
   */
  private sortBoundaryVertices(a: Vector3, b: Vector3, direction: string): number {
    switch (direction) {
      case 'left':
      case 'right':
        return a.z - b.z;
      case 'top':
      case 'bottom':
        return a.x - b.x;
      default:
        return 0;
    }
  }

  /**
   * Find points where stitching should occur
   */
  private findStitchPoints(
    primaryVerts: Vector3[],
    neighborVerts: Vector3[]
  ): Array<{ primary: number; neighbor: number; position: Vector3 }> {
    const stitchPoints: Array<{
      primary: number;
      neighbor: number;
      position: Vector3;
    }> = [];

    for (let i = 0; i < primaryVerts.length; i++) {
      const primaryVert = primaryVerts[i];
      let closestDist = Infinity;
      let closestIdx = -1;

      for (let j = 0; j < neighborVerts.length; j++) {
        const dist = primaryVert.distanceTo(neighborVerts[j]);
        if (dist < closestDist && dist <= this.config.maxStitchDistance) {
          closestDist = dist;
          closestIdx = j;
        }
      }

      if (closestIdx !== -1) {
        const midPoint = new Vector3()
          .addVectors(primaryVert, neighborVerts[closestIdx])
          .multiplyScalar(0.5);

        stitchPoints.push({
          primary: i,
          neighbor: closestIdx,
          position: midPoint,
        });
      }
    }

    return stitchPoints;
  }

  /**
   * Apply stitching modifications to geometry
   */
  private applyStitching(
    geom: BufferGeometry,
    stitchPoints: Array<{ primary: number; neighbor: number; position: Vector3 }>,
    direction: string
  ): BufferGeometry {
    const positions = geom.getAttribute('position');
    if (!positions) return geom;

    // Create new geometry to avoid modifying original
    const stitchedGeom = geom.clone();
    const stitchedPositions = stitchedGeom.getAttribute('position');

    for (const stitch of stitchPoints) {
      // Update primary vertex to midpoint
      stitchedPositions.setXYZ(
        stitch.primary,
        stitch.position.x,
        stitch.position.y,
        stitch.position.z
      );
    }

    stitchedPositions.needsUpdate = true;
    stitchedGeom.computeVertexNormals();

    return stitchedGeom;
  }

  /**
   * Get opposite direction for neighbor matching
   */
  private getOppositeDirection(direction: string): string {
    switch (direction) {
      case 'left':
        return 'right';
      case 'right':
        return 'left';
      case 'top':
        return 'bottom';
      case 'bottom':
        return 'top';
      default:
        return direction;
    }
  }

  /**
   * Clear stitching cache
   */
  clearCache(): void {
    this.stitchCache.clear();
  }

  /**
   * Generate cache key for stitch pair
   */
  private getCacheKey(
    primaryId: string,
    neighborId: string,
    direction: string
  ): string {
    return `${primaryId}_${neighborId}_${direction}`;
  }
}

export default ChunkStitcher;
