/**
 * VegetationGenerators — Procedural Tree, Grass, Fern, Flower, Mushroom, Leaf
 *
 * Ports: infinigen/assets/objects/trees/, grassland/, small_plants/, mushroom/, leaves/
 *
 * Implements the missing vegetation geometry generators that were identified
 * as gaps in the R3F port vs the original Infinigen.
 *
 * Generators:
 *  - TreeGenerator: Recursive random-walk branching with 5 configs
 *  - GrassTuftGenerator: Multi-blade grass tufts with curl
 *  - FernGenerator: Frond hierarchy with pinnae
 *  - FlowerGenerator: Petal + stem flowers
 *  - MushroomGenerator: Cap + stem mushrooms
 *  - LeafGenerator: Broadleaf, maple, pine needle, ginkgo leaf shapes
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export interface TreeGenome {
  size: number;
  trunkWarp: number;
  nTrunks: number;
  branchStart: number;
  branchAngle: number;
  multiBranch: boolean;
  branchDensity: number;
  branchLen: number;
  branchWarp: number;
  pullDir: number;
  outgrowth: number;
  branchThickness: number;
  twigDensity: number;
  twigScale: number;
  canopyShape: number;
  leafDensity: number;
  leafSize: number;
  rootVisibility: number;
  symmetry: number;
  seed: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface BranchSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startRadius: number;
  endRadius: number;
  level: number;
}

interface TreeVertex {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  parent: number;
  level: number;
  radius: number;
  depth: number;
}

// ============================================================================
// Tree Configs
// ============================================================================

export function randomTreeConfig(seed: number): TreeGenome {
  const rng = new SeededRandom(seed);
  return {
    size: rng.range(3, 15),
    trunkWarp: rng.range(0, 0.3),
    nTrunks: rng.choice([1, 1, 1, 2, 2, 3]),
    branchStart: rng.range(0.2, 0.5),
    branchAngle: rng.range(0.3, 1.2),
    multiBranch: rng.next() < 0.6,
    branchDensity: rng.range(1, 4),
    branchLen: rng.range(0.3, 0.7),
    branchWarp: rng.range(0, 0.4),
    pullDir: rng.range(0, 0.5),
    outgrowth: rng.range(0, 0.5),
    branchThickness: rng.range(0.1, 0.3),
    twigDensity: rng.range(2, 6),
    twigScale: rng.range(0.3, 0.6),
    canopyShape: rng.range(0, 2),
    leafDensity: rng.range(3, 10),
    leafSize: rng.range(0.1, 0.3),
    rootVisibility: rng.range(0, 0.5),
    symmetry: rng.range(0, 0.5),
    seed,
  };
}

export function pineTreeConfig(seed: number): TreeGenome {
  const rng = new SeededRandom(seed);
  return {
    size: rng.range(8, 20), trunkWarp: rng.range(0, 0.1), nTrunks: 1,
    branchStart: 0.1, branchAngle: rng.range(0.5, 0.8), multiBranch: false,
    branchDensity: rng.range(3, 6), branchLen: rng.range(0.4, 0.6),
    branchWarp: rng.range(0, 0.15), pullDir: rng.range(0.7, 0.9),
    outgrowth: 0, branchThickness: rng.range(0.08, 0.15),
    twigDensity: rng.range(3, 8), twigScale: rng.range(0.2, 0.4),
    canopyShape: 1, leafDensity: rng.range(5, 12), leafSize: rng.range(0.05, 0.12),
    rootVisibility: 0, symmetry: 0.8, seed,
  };
}

export function shrubConfig(seed: number): TreeGenome {
  const rng = new SeededRandom(seed);
  return {
    size: rng.range(0.5, 2.5), trunkWarp: rng.range(0.1, 0.4),
    nTrunks: rng.choice([3, 3, 5, 5, 5, 7]),
    branchStart: 0, branchAngle: rng.range(0.4, 1.0), multiBranch: true,
    branchDensity: rng.range(2, 5), branchLen: rng.range(0.3, 0.6),
    branchWarp: rng.range(0.1, 0.4), pullDir: rng.range(0, 0.3),
    outgrowth: rng.range(0.3, 0.7), branchThickness: rng.range(0.05, 0.12),
    twigDensity: rng.range(3, 8), twigScale: rng.range(0.3, 0.5),
    canopyShape: 0, leafDensity: rng.range(6, 15), leafSize: rng.range(0.05, 0.15),
    rootVisibility: 0, symmetry: rng.range(0, 0.2), seed,
  };
}

export function palmTreeConfig(seed: number): TreeGenome {
  const rng = new SeededRandom(seed);
  return {
    size: rng.range(6, 14), trunkWarp: rng.range(0, 0.15), nTrunks: 1,
    branchStart: 0.85, branchAngle: rng.range(1.0, 1.4), multiBranch: false,
    branchDensity: rng.range(6, 12), branchLen: rng.range(0.5, 0.8),
    branchWarp: rng.range(0, 0.2), pullDir: 0.9, outgrowth: 0,
    branchThickness: 0.15, twigDensity: 0, twigScale: 0,
    canopyShape: 2, leafDensity: rng.range(8, 15), leafSize: rng.range(0.3, 0.6),
    rootVisibility: rng.range(0.2, 0.5), symmetry: 0.3, seed,
  };
}

// ============================================================================
// Tree Generator
// ============================================================================

export class TreeGenerator {
  private rng: SeededRandom;
  private genome: TreeGenome;
  private vertices: TreeVertex[] = [];
  private segments: BranchSegment[] = [];

  constructor(genome: TreeGenome) {
    this.genome = genome;
    this.rng = new SeededRandom(genome.seed);
  }

  generateSkeleton(): BranchSegment[] {
    this.vertices = [];
    this.segments = [];

    for (let t = 0; t < this.genome.nTrunks; t++) {
      const baseOffset = this.genome.nTrunks > 1
        ? new THREE.Vector3(this.rng.range(-0.3, 0.3), 0, this.rng.range(-0.3, 0.3))
        : new THREE.Vector3(0, 0, 0);

      const trunkVertices = this.randPath(baseOffset, new THREE.Vector3(0, 1, 0), this.genome.size, this.genome.trunkWarp, 0.3, 0.7, 0);

      for (let i = 0; i < trunkVertices.length; i++) {
        const v = trunkVertices[i];
        const heightFraction = v.position.y / this.genome.size;
        if (heightFraction > this.genome.branchStart && this.rng.next() < this.genome.branchDensity * 0.3) {
          const branchDir = this.computeBranchDirection(v.direction, heightFraction);
          const branchLength = this.genome.size * this.genome.branchLen * this.rng.range(0.5, 1.0);
          const branchVerts = this.randPath(v.position.clone(), branchDir, branchLength, this.genome.branchWarp, 0.2, 0.5, 1);

          if (this.genome.multiBranch) {
            for (const bv of branchVerts) {
              if (this.rng.next() < this.genome.twigDensity * 0.15) {
                const twigDir = this.computeBranchDirection(bv.direction, 1.0);
                const twigLen = branchLength * this.genome.twigScale * this.rng.range(0.3, 1.0);
                this.randPath(bv.position.clone(), twigDir, twigLen, this.genome.branchWarp * 0.5, 0.1, 0.3, 2);
              }
            }
          }
        }
      }
    }

    return this.segments;
  }

  generateGeometry(radialSegments: number = 8): THREE.Group {
    const group = new THREE.Group();
    if (this.segments.length === 0) this.generateSkeleton();

    for (const seg of this.segments) {
      const segLen = seg.end.distanceTo(seg.start);
      if (segLen < 0.01) continue;

      const topRadius = Math.max(seg.endRadius, 0.002);
      const bottomRadius = Math.max(seg.startRadius, 0.002);
      const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, segLen, radialSegments, 1);
      geometry.translate(0, segLen / 2, 0);

      const mesh = new THREE.Mesh(geometry);
      const midPoint = seg.start.clone().add(seg.end).multiplyScalar(0.5);
      mesh.position.copy(midPoint);

      const direction = seg.end.clone().sub(seg.start).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
      mesh.quaternion.copy(quat);

      group.add(mesh);
    }

    return group;
  }

  generateLeafPositions(season: Season = 'summer'): { position: THREE.Vector3; normal: THREE.Vector3; scale: number }[] {
    if (season === 'winter') return [];
    const leaves: { position: THREE.Vector3; normal: THREE.Vector3; scale: number }[] = [];
    const terminalSegments = this.segments.filter(s => s.level === 2 || (s.level === 1 && !this.genome.multiBranch));

    for (const seg of terminalSegments) {
      const numLeaves = Math.round(this.genome.leafDensity * this.rng.range(0.5, 1.5));
      for (let i = 0; i < numLeaves; i++) {
        const t = this.rng.range(0.3, 1.0);
        const pos = seg.start.clone().lerp(seg.end, t);
        pos.x += this.rng.range(-0.15, 0.15);
        pos.y += this.rng.range(-0.1, 0.1);
        pos.z += this.rng.range(-0.15, 0.15);
        const normal = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(0.2, 1), this.rng.range(-1, 1)).normalize();
        leaves.push({ position: pos, normal, scale: this.genome.leafSize * this.rng.range(0.6, 1.4) });
      }
    }

    return leaves;
  }

  private randPath(startPos: THREE.Vector3, startDir: THREE.Vector3, length: number, warp: number, segmentLength: number, momentum: number, level: number): TreeVertex[] {
    const nSegments = Math.max(2, Math.round(length / segmentLength));
    const actualSegLen = length / nSegments;
    let pos = startPos.clone();
    let dir = startDir.clone().normalize();
    const pathVertices: TreeVertex[] = [];

    this.vertices.push({ position: pos.clone(), direction: dir.clone(), parent: -1, level, radius: this.computeRadius(level, 0, nSegments), depth: 0 });

    for (let i = 1; i <= nSegments; i++) {
      const progress = i / nSegments;
      const momDir = dir.clone().multiplyScalar(momentum);
      const perturbDir = new THREE.Vector3(this.rng.gaussian(0, warp), this.rng.gaussian(0, warp * 0.3), this.rng.gaussian(0, warp));
      const pullDir = new THREE.Vector3(0, this.genome.pullDir * (1 - progress), 0);
      dir = momDir.add(perturbDir).add(pullDir).normalize();
      if (dir.length() < 0.01) dir = startDir.clone().normalize();
      pos = pos.clone().add(dir.clone().multiplyScalar(actualSegLen));
      const radius = this.computeRadius(level, i, nSegments);
      const parentIdx = this.vertices.length - 1;
      const vertex: TreeVertex = { position: pos.clone(), direction: dir.clone(), parent: parentIdx, level, radius, depth: i };
      this.vertices.push(vertex);
      const parentVertex = this.vertices[parentIdx];
      this.segments.push({ start: parentVertex.position.clone(), end: pos.clone(), startRadius: parentVertex.radius, endRadius: radius, level });
      pathVertices.push(vertex);
    }

    return pathVertices;
  }

  private computeRadius(level: number, depth: number, maxDepth: number): number {
    const progress = maxDepth > 0 ? depth / maxDepth : 0;
    const taper = 1.0 - progress * 0.7;
    if (level === 0) return this.genome.size * 0.04 * taper;
    if (level === 1) return this.genome.size * 0.04 * this.genome.branchThickness * taper;
    return this.genome.size * 0.04 * this.genome.branchThickness * 0.3 * taper;
  }

  private computeBranchDirection(trunkDir: THREE.Vector3, heightFraction: number): THREE.Vector3 {
    const horizontal = new THREE.Vector3(this.rng.gaussian(0, 1), 0, this.rng.gaussian(0, 1)).normalize();
    const angle = this.genome.branchAngle;
    return new THREE.Vector3()
      .addScaledVector(horizontal, Math.sin(angle))
      .addScaledVector(new THREE.Vector3(0, 1, 0), Math.cos(angle) * this.rng.range(0.2, 0.8))
      .normalize();
  }
}

// ============================================================================
// Grass Tuft Generator
// ============================================================================

export class GrassTuftGenerator {
  private rng: SeededRandom;
  constructor(private seed: number = 42) { this.rng = new SeededRandom(seed); }

  generateTuft(config: { nBlades?: number; bladeHeight?: number; bladeWidth?: number; nSegments?: number; baseSpread?: number; curlAmount?: number } = {}): THREE.Group {
    const { nBlades = 30, bladeHeight = 0.3, bladeWidth = 0.005, nSegments = 4, baseSpread = 0.05, curlAmount = 0.3 } = config;
    const group = new THREE.Group();

    for (let b = 0; b < nBlades; b++) {
      const bladeHeightVar = bladeHeight * this.rng.range(0.5, 1.3);
      const curl = this.rng.range(-curlAmount, curlAmount);
      const points: THREE.Vector3[] = [];
      const baseX = this.rng.range(-baseSpread, baseSpread);
      const baseZ = this.rng.range(-baseSpread, baseSpread);

      for (let s = 0; s <= nSegments; s++) {
        const t = s / nSegments;
        points.push(new THREE.Vector3(baseX + curl * t * t, bladeHeightVar * t, baseZ + curl * t * t * 0.5));
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const geometry = new THREE.TubeGeometry(curve, nSegments, bladeWidth, 2, false);
      group.add(new THREE.Mesh(geometry));
    }

    return group;
  }
}

// ============================================================================
// Fern Generator
// ============================================================================

export class FernGenerator {
  private rng: SeededRandom;
  constructor(private seed: number = 42) { this.rng = new SeededRandom(seed); }

  generateFern(config: { nFronds?: number; frondLength?: number; nPinnae?: number; age?: number } = {}): THREE.Group {
    const { nFronds = 6, frondLength = 0.5, nPinnae = 8, age = 0.7 } = config;
    const group = new THREE.Group();

    for (let f = 0; f < nFronds; f++) {
      const angle = (f / nFronds) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
      const droopAngle = age * this.rng.range(0.3, 0.8);
      const stemPoints: THREE.Vector3[] = [];

      for (let s = 0; s <= 5; s++) {
        const t = s / 5;
        stemPoints.push(new THREE.Vector3(
          Math.cos(angle) * frondLength * t * 0.3,
          frondLength * t * (1 - droopAngle * t),
          Math.sin(angle) * frondLength * t * 0.3
        ));
      }

      const stemCurve = new THREE.CatmullRomCurve3(stemPoints);
      const stemGeom = new THREE.TubeGeometry(stemCurve, 8, 0.003 * (1 - age * 0.3), 3, false);
      group.add(new THREE.Mesh(stemGeom));

      for (let p = 1; p <= nPinnae; p++) {
        const t = p / (nPinnae + 1);
        const stemPoint = stemCurve.getPoint(t);
        const pinnaLen = frondLength * 0.15 * (1 - t * 0.5) * this.rng.range(0.6, 1.2);

        for (const side of [-1, 1]) {
          const pinnaDir = new THREE.Vector3(Math.cos(angle + side * Math.PI / 2), this.rng.range(-0.1, 0.1), Math.sin(angle + side * Math.PI / 2)).normalize();
          const pinnaEnd = stemPoint.clone().add(pinnaDir.multiplyScalar(pinnaLen));
          const pinnaGeom = new THREE.CylinderGeometry(0.001, 0.002, pinnaLen, 2, 1);
          const pinnaMesh = new THREE.Mesh(pinnaGeom);
          pinnaMesh.position.copy(stemPoint.clone().add(pinnaEnd).multiplyScalar(0.5));
          pinnaMesh.lookAt(pinnaEnd);
          group.add(pinnaMesh);
        }
      }
    }

    return group;
  }
}

// ============================================================================
// Flower Generator
// ============================================================================

export class FlowerGenerator {
  private rng: SeededRandom;
  constructor(private seed: number = 42) { this.rng = new SeededRandom(seed); }

  generateFlower(config: { nPetals?: number; petalSize?: number; stemHeight?: number; hue?: number } = {}): THREE.Group {
    const { nPetals = this.rng.nextInt(4, 8), petalSize = this.rng.range(0.02, 0.06), stemHeight = this.rng.range(0.15, 0.4), hue = this.rng.range(0, 1) } = config;
    const group = new THREE.Group();

    // Stem
    const stemGeom = new THREE.CylinderGeometry(0.002, 0.003, stemHeight, 4, 1);
    const stemMesh = new THREE.Mesh(stemGeom);
    stemMesh.position.y = stemHeight / 2;
    group.add(stemMesh);

    // Petals
    const petalColor = new THREE.Color().setHSL(hue, this.rng.range(0.6, 0.9), this.rng.range(0.5, 0.7));
    for (let p = 0; p < nPetals; p++) {
      const angle = (p / nPetals) * Math.PI * 2;
      const petalGeom = new THREE.SphereGeometry(petalSize, 4, 4);
      petalGeom.scale(1, 0.3, 0.6);
      const petalMesh = new THREE.Mesh(petalGeom, new THREE.MeshStandardMaterial({ color: petalColor }));
      petalMesh.position.set(Math.cos(angle) * petalSize * 0.8, stemHeight, Math.sin(angle) * petalSize * 0.8);
      petalMesh.rotation.y = -angle;
      petalMesh.rotation.x = -0.3;
      group.add(petalMesh);
    }

    // Center
    const centerGeom = new THREE.SphereGeometry(petalSize * 0.3, 6, 6);
    group.add(new THREE.Mesh(centerGeom, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.12, 0.8, 0.6) })));
    group.children[group.children.length - 1].position.y = stemHeight;

    return group;
  }
}

// ============================================================================
// Mushroom Generator
// ============================================================================

export class MushroomGenerator {
  private rng: SeededRandom;
  constructor(private seed: number = 42) { this.rng = new SeededRandom(seed); }

  generateMushroom(config: { capRadius?: number; stemHeight?: number; stemRadius?: number } = {}): THREE.Group {
    const { capRadius = this.rng.range(0.03, 0.1), stemHeight = this.rng.range(0.05, 0.15), stemRadius = (config.capRadius ?? 0.05) * 0.2 } = config;
    const group = new THREE.Group();

    // Stem
    const stemGeom = new THREE.CylinderGeometry(stemRadius * 0.8, stemRadius, stemHeight, 8, 1);
    const stemColor = new THREE.Color().setHSL(0.1, 0.15, this.rng.range(0.7, 0.9));
    const stemMesh = new THREE.Mesh(stemGeom, new THREE.MeshStandardMaterial({ color: stemColor }));
    stemMesh.position.y = stemHeight / 2;
    group.add(stemMesh);

    // Cap
    const capGeom = new THREE.SphereGeometry(capRadius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const capHue = this.rng.choice([0.05, 0.08, 0.0, 0.6, 0.9]);
    const capColor = new THREE.Color().setHSL(capHue, this.rng.range(0.4, 0.8), this.rng.range(0.3, 0.5));
    const capMesh = new THREE.Mesh(capGeom, new THREE.MeshStandardMaterial({ color: capColor }));
    capMesh.position.y = stemHeight;
    group.add(capMesh);

    // Underside
    const undersideGeom = new THREE.CircleGeometry(capRadius * 0.95, 12);
    const undersideMesh = new THREE.Mesh(undersideGeom, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.1, 0.1, 0.85), side: THREE.DoubleSide }));
    undersideMesh.rotation.x = Math.PI / 2;
    undersideMesh.position.y = stemHeight;
    group.add(undersideMesh);

    return group;
  }
}

// ============================================================================
// Leaf Shape Generator
// ============================================================================

export class LeafGenerator {
  constructor(private seed: number = 42) {}

  generateLeaf(type: 'broadleaf' | 'maple' | 'pine' | 'ginkgo' = 'broadleaf', size: number = 0.1): THREE.BufferGeometry {
    switch (type) {
      case 'pine': return this.generatePineNeedle(size);
      case 'maple': return this.generateMapleLeaf(size);
      case 'ginkgo': return this.generateGinkgoLeaf(size);
      default: return this.generateBroadleaf(size);
    }
  }

  private generateBroadleaf(size: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(size * 0.5, size * 0.6, 0, size);
    shape.quadraticCurveTo(-size * 0.5, size * 0.6, 0, 0);
    return new THREE.ShapeGeometry(shape);
  }

  private generatePineNeedle(size: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(size * 0.05, size * 0.3);
    shape.lineTo(0, size);
    shape.lineTo(-size * 0.05, size * 0.3);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  private generateMapleLeaf(size: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const nLobes = 5;
    shape.moveTo(0, 0);
    for (let i = 0; i < nLobes; i++) {
      const angle = (i / nLobes) * Math.PI - Math.PI / 2;
      const lobeLen = size * (0.5 + 0.5 * Math.cos(angle * 2));
      const midAngle = angle + Math.PI / nLobes;
      shape.lineTo(Math.cos(angle) * lobeLen, Math.sin(angle) * lobeLen + size * 0.5);
      shape.lineTo(Math.cos(midAngle) * lobeLen * 0.4, Math.sin(midAngle) * lobeLen * 0.4 + size * 0.5);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }

  private generateGinkgoLeaf(size: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(size * 0.3, size * 0.5, size * 0.4, size * 0.9);
    shape.quadraticCurveTo(size * 0.2, size, size * 0.05, size * 0.85);
    shape.lineTo(0, size * 0.9);
    shape.lineTo(-size * 0.05, size * 0.85);
    shape.quadraticCurveTo(-size * 0.2, size, -size * 0.4, size * 0.9);
    shape.quadraticCurveTo(-size * 0.3, size * 0.5, 0, 0);
    return new THREE.ShapeGeometry(shape);
  }
}
