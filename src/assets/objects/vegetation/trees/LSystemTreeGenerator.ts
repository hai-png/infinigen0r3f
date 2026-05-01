/**
 * LSystemTreeGenerator - L-System based procedural tree generation
 *
 * Implements stochastic L-systems with turtle graphics interpretation
 * to produce biologically-inspired tree structures. Supports multiple
 * tree species presets with characteristic branching patterns.
 *
 * Turtle graphics commands:
 *   F  — Move forward, create branch segment (cylinder)
 *   +  — Turn right by angle
 *   -  — Turn left by angle
 *   &  — Pitch down
 *   ^  — Pitch up
 *   \  — Roll clockwise
 *   /  — Roll counter-clockwise
 *   [  — Push state (position + rotation + thickness)
 *   ]  — Pop state
 *   !  — Reduce thickness by thicknessDecay
 *
 * Ported from: infinigen/terrain/objects/tree/lsystem.py
 */

import * as THREE from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../../utils/BaseObjectGenerator';
import { SeededRandom } from '@/core/util/MathUtils';
import { LeafCluster, LeafType, ClusterConfig } from './LeafGeometry';

// ============================================================================
// Interfaces
// ============================================================================

export interface LSystemRule {
  /** Single-character predecessor symbol (e.g., 'F') */
  predecessor: string;
  /** Replacement string (e.g., 'FF+[+F-F-F]-[-F+F+F]') */
  successor: string;
  /** Probability of applying this rule (0-1, for stochastic L-systems) */
  probability: number;
}

export interface LSystemConfig extends BaseGeneratorConfig {
  /** The initial axiom string */
  axiom: string;
  /** Production rules */
  rules: LSystemRule[];
  /** Number of derivation iterations */
  iterations: number;
  /** Branch angle in radians */
  angle: number;
  /** Initial segment length */
  length: number;
  /** Segment length multiplier per iteration */
  lengthDecay: number;
  /** Initial trunk thickness (radius) */
  thickness: number;
  /** Thickness multiplier per branching level */
  thicknessDecay: number;
  /** Random seed for stochastic rule application */
  seed: number;
  /** Leaf type used for terminal branch foliage */
  leafType: LeafType;
}

export interface TurtleState {
  position: THREE.Vector3;
  heading: THREE.Vector3;
  left: THREE.Vector3;
  up: THREE.Vector3;
  thickness: number;
  length: number;
}

export interface BranchSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  startThickness: number;
  endThickness: number;
  isTerminal: boolean;
}

// ============================================================================
// LSystemTreeGenerator
// ============================================================================

export class LSystemTreeGenerator extends BaseObjectGenerator<LSystemConfig> {
  getDefaultConfig(): LSystemConfig {
    return {
      axiom: 'F',
      rules: [{ predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 1.0 }],
      iterations: 4,
      angle: 25 * (Math.PI / 180),
      length: 2.0,
      lengthDecay: 0.7,
      thickness: 0.3,
      thicknessDecay: 0.65,
      seed: 42,
      leafType: 'broad',
    };
  }

  generate(config: Partial<LSystemConfig> = {}): THREE.Group {
    const fullConfig = { ...this.getDefaultConfig(), ...config };
    const rng = new SeededRandom(fullConfig.seed);
    const group = new THREE.Group();

    // Step 1: Derive the L-system string
    const lString = this.deriveString(
      fullConfig.axiom,
      fullConfig.rules,
      fullConfig.iterations,
      rng
    );

    // Step 2: Interpret the string using turtle graphics
    const segments = this.interpretString(lString, fullConfig);

    // Step 3: Build branch geometry
    const trunkGroup = this.buildBranchGeometry(segments, fullConfig);
    group.add(trunkGroup);

    // Step 4: Add leaves at terminal branches
    const leavesGroup = this.buildLeaves(segments, fullConfig, rng);
    group.add(leavesGroup);

    group.userData.tags = ['vegetation', 'tree', 'lsystem'];
    group.userData.lString = lString;
    return group;
  }

  // ------------------------------------------------------------------
  // L-System string derivation
  // ------------------------------------------------------------------

  /**
   * Apply production rules for `iterations` generations.
   * Supports stochastic rules (probability < 1.0).
   */
  private deriveString(
    axiom: string,
    rules: LSystemRule[],
    iterations: number,
    rng: SeededRandom
  ): string {
    let current = axiom;

    for (let gen = 0; gen < iterations; gen++) {
      let next = '';

      for (const ch of current) {
        // Find matching rules
        const matchingRules = rules.filter(r => r.predecessor === ch);

        if (matchingRules.length === 0) {
          // No rule — keep the character
          next += ch;
        } else if (matchingRules.length === 1 && matchingRules[0].probability >= 1.0) {
          // Deterministic rule — always apply
          next += matchingRules[0].successor;
        } else {
          // Stochastic — pick based on probability
          const roll = rng.next();
          let cumulative = 0;
          let applied = false;

          for (const rule of matchingRules) {
            cumulative += rule.probability;
            if (roll <= cumulative) {
              next += rule.successor;
              applied = true;
              break;
            }
          }

          if (!applied) {
            // Probability didn't sum to 1.0 — keep the character
            next += ch;
          }
        }
      }

      current = next;

      // Safety: limit string length to prevent memory issues
      if (current.length > 100000) {
        break;
      }
    }

    return current;
  }

  // ------------------------------------------------------------------
  // Turtle graphics interpretation
  // ------------------------------------------------------------------

  /**
   * Interpret the L-system string using 3D turtle graphics.
   * Returns an array of branch segments for mesh construction.
   */
  private interpretString(lString: string, config: LSystemConfig): BranchSegment[] {
    const segments: BranchSegment[] = [];
    const stack: TurtleState[] = [];

    // Initialize turtle at origin, pointing up (+Y)
    let state: TurtleState = {
      position: new THREE.Vector3(0, 0, 0),
      heading: new THREE.Vector3(0, 1, 0),   // Up
      left: new THREE.Vector3(-1, 0, 0),     // Left
      up: new THREE.Vector3(0, 0, 1),        // Forward
      thickness: config.thickness,
      length: config.length,
    };

    for (const ch of lString) {
      switch (ch) {
        case 'F': {
          // Move forward and create branch segment
          const start = state.position.clone();
          const end = state.position.clone().add(
            state.heading.clone().multiplyScalar(state.length)
          );

          const endThickness = state.thickness * config.thicknessDecay;

          segments.push({
            start,
            end,
            startThickness: state.thickness,
            endThickness,
            isTerminal: false, // Will be marked later
          });

          state.position.copy(end);
          state.thickness = endThickness;
          break;
        }

        case '+': // Turn right
          this.rotateTurtle(state, state.up, config.angle);
          break;

        case '-': // Turn left
          this.rotateTurtle(state, state.up, -config.angle);
          break;

        case '&': // Pitch down
          this.rotateTurtle(state, state.left, -config.angle);
          break;

        case '^': // Pitch up
          this.rotateTurtle(state, state.left, config.angle);
          break;

        case '\\': // Roll clockwise
          this.rotateTurtle(state, state.heading, -config.angle);
          break;

        case '/': // Roll counter-clockwise
          this.rotateTurtle(state, state.heading, config.angle);
          break;

        case '[': // Push state
          stack.push({
            position: state.position.clone(),
            heading: state.heading.clone(),
            left: state.left.clone(),
            up: state.up.clone(),
            thickness: state.thickness,
            length: state.length,
          });
          // Reduce length for sub-branches
          state.length *= config.lengthDecay;
          break;

        case ']': // Pop state
          if (stack.length > 0) {
            state = stack.pop()!;
          }
          break;

        case '!': // Reduce thickness
          state.thickness *= config.thicknessDecay;
          break;

        default:
          // Unknown characters are ignored (e.g., 'X', 'A' placeholders)
          break;
      }
    }

    // Mark terminal segments — segments whose end has no child segment
    this.markTerminalSegments(segments);

    return segments;
  }

  /**
   * Rotate the turtle around an axis by the given angle (radians).
   * Applies Rodrigues' rotation formula to heading, left, and up vectors.
   */
  private rotateTurtle(state: TurtleState, axis: THREE.Vector3, angle: number): void {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    state.heading = this.rotateVector(state.heading, axis, cosA, sinA);
    state.left = this.rotateVector(state.left, axis, cosA, sinA);
    state.up = this.rotateVector(state.up, axis, cosA, sinA);

    // Re-orthogonalize to prevent drift
    state.heading.normalize();
    state.left.crossVectors(state.up, state.heading).normalize();
    state.up.crossVectors(state.heading, state.left).normalize();
  }

  /**
   * Rodrigues' rotation: v' = v*cos(a) + (k×v)*sin(a) + k*(k·v)*(1-cos(a))
   */
  private rotateVector(v: THREE.Vector3, k: THREE.Vector3, cosA: number, sinA: number): THREE.Vector3 {
    const kCrossV = new THREE.Vector3().crossVectors(k, v);
    const kDotV = k.dot(v);
    const oneMinusCos = 1 - cosA;

    return new THREE.Vector3(
      v.x * cosA + kCrossV.x * sinA + k.x * kDotV * oneMinusCos,
      v.y * cosA + kCrossV.y * sinA + k.y * kDotV * oneMinusCos,
      v.z * cosA + kCrossV.z * sinA + k.z * kDotV * oneMinusCos
    );
  }

  /**
   * Mark segments that have no children as terminal (for leaf placement).
   */
  private markTerminalSegments(segments: BranchSegment[]): void {
    const endPoints = new Set<string>();

    // Index all segment start points
    for (const seg of segments) {
      endPoints.add(this.pointKey(seg.start));
    }

    // A segment is terminal if no other segment starts at its end
    for (const seg of segments) {
      const endKey = this.pointKey(seg.end);
      seg.isTerminal = !endPoints.has(endKey);
    }
  }

  private pointKey(p: THREE.Vector3): string {
    return `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  }

  // ------------------------------------------------------------------
  // Branch geometry construction
  // ------------------------------------------------------------------

  /**
   * Create CylinderGeometry for each branch segment and merge them.
   */
  private buildBranchGeometry(
    segments: BranchSegment[],
    config: LSystemConfig
  ): THREE.Group {
    const group = new THREE.Group();

    // Material for all branches
    const barkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Create individual cylinder meshes for each segment
    // (merging is done below for efficiency)
    const geometries: THREE.BufferGeometry[] = [];

    for (const seg of segments) {
      const geom = this.createBranchCylinder(
        seg.start,
        seg.end,
        Math.max(seg.startThickness, 0.01),
        Math.max(seg.endThickness, 0.005)
      );
      geometries.push(geom);
    }

    // Merge all branch geometries into a single mesh
    if (geometries.length > 0) {
      const merged = this.mergeGeometries(geometries);
      const mesh = new THREE.Mesh(merged, barkMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }

  /**
   * Create a cylinder connecting two 3D points with varying radii.
   */
  private createBranchCylinder(
    start: THREE.Vector3,
    end: THREE.Vector3,
    radiusTop: number,
    radiusBottom: number
  ): THREE.BufferGeometry {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();

    if (length < 0.001) {
      // Degenerate segment — return a tiny cylinder
      return new THREE.CylinderGeometry(0.01, 0.01, 0.001, 4);
    }

    const segments = Math.max(4, Math.min(8, Math.ceil(radiusBottom * 20)));
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments);

    // Rotate the cylinder to align with the branch direction
    // Default CylinderGeometry is along Y-axis
    const axis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize());
    geometry.applyQuaternion(quaternion);

    // Translate to the midpoint between start and end
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    geometry.translate(midpoint.x, midpoint.y, midpoint.z);

    return geometry;
  }

  // ------------------------------------------------------------------
  // Leaf construction
  // ------------------------------------------------------------------

  /**
   * Add leaf clusters at terminal branch endpoints.
   * Uses LeafCluster for species-appropriate leaf geometry instead
   * of sphere approximations, matching Princeton Infinigen's approach.
   */
  private buildLeaves(
    segments: BranchSegment[],
    config: LSystemConfig,
    rng: SeededRandom
  ): THREE.Group {
    const group = new THREE.Group();

    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a1d,
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const leafGeometries: THREE.BufferGeometry[] = [];
    const terminalSegments = segments.filter(s => s.isTerminal);

    for (const seg of terminalSegments) {
      // Create a LeafCluster at each terminal branch tip
      const clusterRadius = Math.max(seg.endThickness * 3, 0.15);
      const leafCount = rng.nextInt(3, 6);
      const clusterSeed = rng.nextInt(0, 100000);

      const clusterConfig: Partial<ClusterConfig> = {
        radius: clusterRadius,
        density: 1.0,
        seed: clusterSeed,
        orientationBias: 'outward',
      };

      const clusterGeometry = LeafCluster.createMergedCluster(
        config.leafType,
        leafCount,
        clusterConfig
      );

      // Translate the cluster to the branch tip position
      clusterGeometry.translate(seg.end.x, seg.end.y, seg.end.z);

      leafGeometries.push(clusterGeometry);
    }

    // Merge all leaf cluster geometries
    if (leafGeometries.length > 0) {
      const merged = this.mergeGeometries(leafGeometries);
      const mesh = new THREE.Mesh(merged, leafMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    return group;
  }

  // ------------------------------------------------------------------
  // Geometry merging utility
  // ------------------------------------------------------------------

  /**
   * Merge multiple BufferGeometries into a single geometry.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }

    let totalVertices = 0;
    let totalIndices = 0;

    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
      if (geo.index) {
        totalIndices += geo.index.count;
      } else {
        totalIndices += geo.attributes.position.count;
      }
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);
    const mergedUVs = new Float32Array(totalVertices * 2);
    const mergedIndices: number[] = [];
    let vertexOffset = 0;

    for (const geo of geometries) {
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;

      for (let i = 0; i < posAttr.count; i++) {
        mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
        mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
        mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

        if (normAttr) {
          mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
          mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
          mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
        }

        if (uvAttr) {
          mergedUVs[(vertexOffset + i) * 2] = uvAttr.getX(i);
          mergedUVs[(vertexOffset + i) * 2 + 1] = uvAttr.getY(i);
        }
      }

      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          mergedIndices.push(geo.index.getX(i) + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          mergedIndices.push(vertexOffset + i);
        }
      }

      vertexOffset += posAttr.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(mergedUVs, 2));
    merged.setIndex(mergedIndices);
    merged.computeVertexNormals();

    return merged;
  }
}

// ============================================================================
// Tree Species Presets
// ============================================================================

function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export const LSystemTreePresets: Record<string, LSystemConfig> = {
  /** Oak: broad, spreading canopy with lobed oak leaves */
  oak: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 1.0 },
    ],
    iterations: 4,
    angle: degToRad(25),
    length: 2.0,
    lengthDecay: 0.7,
    thickness: 0.35,
    thicknessDecay: 0.65,
    seed: 42,
    leafType: 'oak',
  },

  /** Pine: conical shape with layered branches and needle leaves */
  pine: {
    axiom: 'FF',
    rules: [
      { predecessor: 'F', successor: 'FF-[-F+F+F]+[+F-F-F]', probability: 1.0 },
    ],
    iterations: 3,
    angle: degToRad(22.5),
    length: 1.8,
    lengthDecay: 0.75,
    thickness: 0.25,
    thicknessDecay: 0.6,
    seed: 42,
    leafType: 'needle',
  },

  /** Birch: slender, multiple thin branches with small birch leaves */
  birch: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 1.0 },
    ],
    iterations: 4,
    angle: degToRad(25.7),
    length: 1.5,
    lengthDecay: 0.65,
    thickness: 0.2,
    thicknessDecay: 0.6,
    seed: 42,
    leafType: 'birch',
  },

  /** Willow: drooping branches with long narrow willow leaves */
  willow: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF+[+F-F-F]-[-F+F+F]', probability: 0.7 },
      { predecessor: 'F', successor: 'F[+F]F[-F]F', probability: 0.3 },
    ],
    iterations: 4,
    angle: degToRad(30),
    length: 1.8,
    lengthDecay: 0.68,
    thickness: 0.3,
    thicknessDecay: 0.62,
    seed: 42,
    leafType: 'willow',
  },

  /** Palm: tall trunk with fan-shaped palm leaves at top */
  palm: {
    axiom: 'F',
    rules: [
      { predecessor: 'F', successor: 'FF', probability: 1.0 },
    ],
    iterations: 5,
    angle: degToRad(25),
    length: 1.5,
    lengthDecay: 0.95,
    thickness: 0.3,
    thicknessDecay: 0.9,
    seed: 42,
    leafType: 'palm',
  },
};

/**
 * Convenience function: generate a tree from a preset name.
 * The palm preset adds palm-specific canopy geometry at the top.
 */
export function generateTreeFromPreset(
  presetName: string,
  seed: number = 42,
  overrides: Partial<LSystemConfig> = {}
): THREE.Group {
  const preset = LSystemTreePresets[presetName];
  if (!preset) {
    throw new Error(`Unknown L-system tree preset: ${presetName}. Available: ${Object.keys(LSystemTreePresets).join(', ')}`);
  }

  const generator = new LSystemTreeGenerator(seed);
  const config = { ...preset, seed, ...overrides };

  if (presetName === 'palm') {
    return generatePalmTree(generator, config);
  }

  return generator.generate(config);
}

/**
 * Palm-specific generation: tall trunk with radiating frond canopy at the top.
 * Uses LeafCluster with palm leaf type for realistic frond geometry.
 */
function generatePalmTree(
  generator: LSystemTreeGenerator,
  config: LSystemConfig
): THREE.Group {
  const group = generator.generate(config);

  // Add palm fronds at the top of the trunk using LeafCluster
  const rng = new SeededRandom(config.seed + 1000);
  const frondGroup = new THREE.Group();

  // Estimate trunk height from the L-system output
  const trunkHeight = config.length * Math.pow(2, config.iterations) * 0.5;

  const frondCount = rng.nextInt(8, 14);
  const frondMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d8a2f,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Create a single large cluster of palm leaves at the trunk top
  const palmClusterConfig: Partial<ClusterConfig> = {
    radius: 1.5,
    density: 1.0,
    seed: config.seed + 2000,
    orientationBias: 'outward',
  };

  const clusterGeometry = LeafCluster.createMergedCluster(
    'palm',
    frondCount,
    palmClusterConfig
  );

  // Position the cluster at the top of the trunk
  clusterGeometry.translate(0, trunkHeight, 0);

  const frondMesh = new THREE.Mesh(clusterGeometry, frondMaterial);
  frondMesh.castShadow = true;
  frondMesh.receiveShadow = true;
  frondGroup.add(frondMesh);

  group.add(frondGroup);
  group.userData.tags = ['vegetation', 'tree', 'lsystem', 'palm'];

  return group;
}

/**
 * Static geometry merging utility (for palm fronds outside the class)
 */
function mergeGeometriesStatic(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  let totalVertices = 0;
  let totalIndices = 0;

  for (const geo of geometries) {
    totalVertices += geo.attributes.position.count;
    if (geo.index) {
      totalIndices += geo.index.count;
    } else {
      totalIndices += geo.attributes.position.count;
    }
  }

  const mergedPositions = new Float32Array(totalVertices * 3);
  const mergedNormals = new Float32Array(totalVertices * 3);
  const mergedUVs = new Float32Array(totalVertices * 2);
  const mergedIndices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;

    for (let i = 0; i < posAttr.count; i++) {
      mergedPositions[(vertexOffset + i) * 3] = posAttr.getX(i);
      mergedPositions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
      mergedPositions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);

      if (normAttr) {
        mergedNormals[(vertexOffset + i) * 3] = normAttr.getX(i);
        mergedNormals[(vertexOffset + i) * 3 + 1] = normAttr.getY(i);
        mergedNormals[(vertexOffset + i) * 3 + 2] = normAttr.getZ(i);
      }

      if (uvAttr) {
        mergedUVs[(vertexOffset + i) * 2] = uvAttr.getX(i);
        mergedUVs[(vertexOffset + i) * 2 + 1] = uvAttr.getY(i);
      }
    }

    if (geo.index) {
      for (let i = 0; i < geo.index.count; i++) {
        mergedIndices.push(geo.index.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        mergedIndices.push(vertexOffset + i);
      }
    }

    vertexOffset += posAttr.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(mergedUVs, 2));
  merged.setIndex(mergedIndices);
  merged.computeVertexNormals();

  return merged;
}
