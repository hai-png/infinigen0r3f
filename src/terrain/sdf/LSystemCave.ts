/**
 * L-System Cave Generator
 *
 * Implements L-system cave generation matching the original Infinigen's pcfg.py.
 * Uses a probabilistic context-free grammar to generate cave tunnel structures,
 * then converts them to 3D tunnel geometry with variable radius.
 *
 * Grammar symbols:
 * - `f`: move forward (extrude tunnel segment)
 * - `r`: yaw rotation (+angle)
 * - `l`: yaw rotation (-angle)
 * - `u`: pitch rotation (+angle)
 * - `d`: pitch rotation (-angle)
 * - `o`: increase angle magnitude
 * - `a`: decrease angle magnitude
 * - `b`: increase step size
 * - `s`: decrease step size
 * - `[`: push state (start branching)
 * - `]`: pop state (end branching)
 *
 * @module terrain/sdf/LSystemCave
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the cave grammar rules.
 */
export interface CaveGrammarConfig {
  /** Base angle for r/l/u/d rotations (default 15° = π/12) */
  baseAngle: number;
  /** Base step size for f movements (default 2.0) */
  baseStepSize: number;
  /** Minimum step size (default 0.5) */
  minStepSize: number;
  /** Maximum step size (default 5.0) */
  maxStepSize: number;
  /** Angle increment for o/a (default π/36 = 5°) */
  angleIncrement: number;
  /** Step size increment for b/s (default 0.3) */
  stepIncrement: number;
  /** Minimum angle magnitude (default π/180 = 1°) */
  minAngle: number;
  /** Maximum angle magnitude (default π/3 = 60°) */
  maxAngle: number;
  /** Base tunnel radius (default 2.0) */
  baseRadius: number;
  /** Radius variation factor (default 0.3) */
  radiusVariation: number;
  /** Maximum recursion depth for grammar expansion (default 4) */
  maxRecursion: number;
  /** Number of L-system iterations (default 3) */
  iterations: number;
  /** Starting axiom string (default 'f') */
  axiom: string;
  /** Production rules: map from symbol to replacement string */
  rules: Record<string, string[]>;
  /** Probability for each rule alternative (must match rules array length) */
  ruleProbabilities: Record<string, number[]>;
}

/**
 * Output data from the L-system cave generator.
 */
export interface CaveTunnelData {
  /** 3D points along the tunnel path */
  points: THREE.Vector3[];
  /** Radius at each point */
  radii: number[];
  /** 3D occupancy grid (flattened, size = gridSize^3) */
  occupancy: Float32Array;
  /** Grid size (cube dimension) for the occupancy volume */
  gridSize: number;
  /** World-space origin of the occupancy grid */
  gridOrigin: THREE.Vector3;
  /** World-space cell size for the occupancy grid */
  gridCellSize: number;
}

/**
 * Internal state for the L-system turtle.
 */
interface TurtleState {
  position: THREE.Vector3;
  direction: THREE.Vector3; // forward direction (unit vector)
  up: THREE.Vector3;       // up direction (unit vector)
  right: THREE.Vector3;    // right direction (unit vector)
  angle: number;           // current angle magnitude
  stepSize: number;        // current step size
  radius: number;          // current tunnel radius
}

// ============================================================================
// Default Grammar Configuration
// ============================================================================

/**
 * Default cave grammar configuration matching the original Infinigen's pcfg.py.
 */
export const DEFAULT_CAVE_GRAMMAR: CaveGrammarConfig = {
  baseAngle: Math.PI / 12,       // 15°
  baseStepSize: 2.0,
  minStepSize: 0.5,
  maxStepSize: 5.0,
  angleIncrement: Math.PI / 36,  // 5°
  stepIncrement: 0.3,
  minAngle: Math.PI / 180,       // 1°
  maxAngle: Math.PI / 3,         // 60°
  baseRadius: 2.0,
  radiusVariation: 0.3,
  maxRecursion: 4,
  iterations: 3,
  axiom: 'f',
  rules: {
    'f': ['ff', 'f[rf]f', 'flf', 'fuf', 'fdf'],
  },
  ruleProbabilities: {
    'f': [0.3, 0.2, 0.2, 0.15, 0.15],
  },
};

// ============================================================================
// LSystemCaveGenerator
// ============================================================================

/**
 * L-system cave generator implementing probabilistic context-free grammar
 * from the original Infinigen's pcfg.py.
 *
 * Usage:
 * ```typescript
 * const generator = new LSystemCaveGenerator();
 * const caveData = generator.generate(42, DEFAULT_CAVE_GRAMMAR);
 * // caveData.points, caveData.radii, caveData.occupancy
 * ```
 */
export class LSystemCaveGenerator {
  /**
   * Generate cave tunnel data from an L-system grammar.
   *
   * @param seed - Random seed for deterministic generation
   * @param config - Grammar configuration (uses defaults for omitted fields)
   * @returns Cave tunnel data with points, radii, and occupancy volume
   */
  generate(seed: number, config: Partial<CaveGrammarConfig> = {}): CaveTunnelData {
    const cfg: CaveGrammarConfig = { ...DEFAULT_CAVE_GRAMMAR, ...config };
    const rng = new SeededRandom(seed);

    // Step 1: Expand the L-system grammar to produce a symbol string
    const expandedString = this.expandGrammar(cfg.axiom, cfg, rng);

    // Step 2: Interpret the string using a turtle to produce 3D path
    const { points, radii } = this.interpretString(expandedString, cfg, rng);

    // Step 3: Compute occupancy volume
    const occupancyResult = this.computeOccupancy(points, radii, cfg);

    return {
      points,
      radii,
      occupancy: occupancyResult.occupancy,
      gridSize: occupancyResult.gridSize,
      gridOrigin: occupancyResult.gridOrigin,
      gridCellSize: occupancyResult.gridCellSize,
    };
  }

  // --------------------------------------------------------------------------
  // Grammar Expansion
  // --------------------------------------------------------------------------

  /**
   * Expand the L-system axiom using production rules.
   * Uses probabilistic rule selection when multiple alternatives exist.
   */
  private expandGrammar(
    axiom: string,
    config: CaveGrammarConfig,
    rng: SeededRandom,
  ): string {
    let current = axiom;

    for (let iter = 0; iter < config.iterations; iter++) {
      let expanded = '';

      for (const symbol of current) {
        const ch = symbol;

        if (config.rules[ch]) {
          // Select a rule alternative probabilistically
          const alternatives = config.rules[ch];
          const probabilities = config.ruleProbabilities[ch] ??
            alternatives.map(() => 1.0 / alternatives.length);

          const selected = this.selectAlternative(alternatives, probabilities, rng);
          expanded += selected;
        } else {
          // No rule: keep the symbol as-is
          expanded += ch;
        }
      }

      // Safety: limit string length to prevent memory issues
      if (expanded.length > 50000) {
        break;
      }

      current = expanded;
    }

    return current;
  }

  /**
   * Select an alternative from the rule based on probabilities.
   */
  private selectAlternative(
    alternatives: string[],
    probabilities: number[],
    rng: SeededRandom,
  ): string {
    // Normalize probabilities
    const total = probabilities.reduce((sum, p) => sum + p, 0);
    let r = rng.next() * total;

    for (let i = 0; i < alternatives.length; i++) {
      r -= probabilities[i];
      if (r <= 0) {
        return alternatives[i];
      }
    }

    return alternatives[alternatives.length - 1];
  }

  // --------------------------------------------------------------------------
  // String Interpretation (Turtle Graphics)
  // --------------------------------------------------------------------------

  /**
   * Interpret the expanded L-system string using a 3D turtle.
   * Produces a sequence of 3D points and radii along the cave tunnel path.
   */
  private interpretString(
    str: string,
    config: CaveGrammarConfig,
    rng: SeededRandom,
  ): { points: THREE.Vector3[]; radii: number[] } {
    const points: THREE.Vector3[] = [];
    const radii: number[] = [];

    // Initialize turtle state
    const initialState: TurtleState = {
      position: new THREE.Vector3(0, 0, 0),
      direction: new THREE.Vector3(1, 0, 0),  // forward along +X
      up: new THREE.Vector3(0, 1, 0),          // up along +Y
      right: new THREE.Vector3(0, 0, 1),       // right along +Z
      angle: config.baseAngle,
      stepSize: config.baseStepSize,
      radius: config.baseRadius,
    };

    const stateStack: TurtleState[] = [];
    let currentState = { ...initialState };

    // Deep clone the vector properties
    currentState.position = initialState.position.clone();
    currentState.direction = initialState.direction.clone();
    currentState.up = initialState.up.clone();
    currentState.right = initialState.right.clone();

    // Record starting point
    points.push(currentState.position.clone());
    radii.push(currentState.radius);

    for (const symbol of str) {
      switch (symbol) {
        case 'f': {
          // Move forward: extrude a tunnel segment
          const step = currentState.direction.clone().multiplyScalar(currentState.stepSize);
          currentState.position.add(step);

          // Add some radius variation along the path
          const radiusNoise = (rng.next() - 0.5) * 2.0 * config.radiusVariation;
          currentState.radius = Math.max(
            config.baseRadius * 0.3,
            config.baseRadius * (1.0 + radiusNoise),
          );

          points.push(currentState.position.clone());
          radii.push(currentState.radius);
          break;
        }

        case 'r': {
          // Yaw rotation: rotate direction right (+angle around up axis)
          this.rotateTurtle(currentState, 'yaw', currentState.angle);
          break;
        }

        case 'l': {
          // Yaw rotation: rotate direction left (-angle around up axis)
          this.rotateTurtle(currentState, 'yaw', -currentState.angle);
          break;
        }

        case 'u': {
          // Pitch rotation: rotate direction up (+angle around right axis)
          this.rotateTurtle(currentState, 'pitch', currentState.angle);
          break;
        }

        case 'd': {
          // Pitch rotation: rotate direction down (-angle around right axis)
          this.rotateTurtle(currentState, 'pitch', -currentState.angle);
          break;
        }

        case 'o': {
          // Increase angle magnitude
          currentState.angle = Math.min(
            config.maxAngle,
            currentState.angle + config.angleIncrement,
          );
          break;
        }

        case 'a': {
          // Decrease angle magnitude
          currentState.angle = Math.max(
            config.minAngle,
            currentState.angle - config.angleIncrement,
          );
          break;
        }

        case 'b': {
          // Increase step size
          currentState.stepSize = Math.min(
            config.maxStepSize,
            currentState.stepSize + config.stepIncrement,
          );
          break;
        }

        case 's': {
          // Decrease step size
          currentState.stepSize = Math.max(
            config.minStepSize,
            currentState.stepSize - config.stepIncrement,
          );
          break;
        }

        case '[': {
          // Push state (start branching)
          stateStack.push({
            position: currentState.position.clone(),
            direction: currentState.direction.clone(),
            up: currentState.up.clone(),
            right: currentState.right.clone(),
            angle: currentState.angle,
            stepSize: currentState.stepSize,
            radius: currentState.radius * 0.7, // branches are thinner
          });
          break;
        }

        case ']': {
          // Pop state (end branching)
          if (stateStack.length > 0) {
            const restored = stateStack.pop()!;
            currentState.position = restored.position;
            currentState.direction = restored.direction;
            currentState.up = restored.up;
            currentState.right = restored.right;
            currentState.angle = restored.angle;
            currentState.stepSize = restored.stepSize;
            currentState.radius = restored.radius;
          }
          break;
        }

        default:
          // Unknown symbol: ignore
          break;
      }

      // Safety: limit point count
      if (points.length > 10000) {
        break;
      }
    }

    return { points, radii };
  }

  /**
   * Rotate the turtle's direction vector around the specified axis.
   */
  private rotateTurtle(
    state: TurtleState,
    axis: 'yaw' | 'pitch',
    angle: number,
  ): void {
    const rotAxis = axis === 'yaw' ? state.up.clone() : state.right.clone();
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis.normalize(), angle);

    // Rotate direction
    state.direction.applyQuaternion(rotQuat).normalize();

    // Also rotate the other frame vectors to maintain orthogonality
    if (axis === 'yaw') {
      state.right.applyQuaternion(rotQuat).normalize();
    } else {
      state.up.applyQuaternion(rotQuat).normalize();
    }

    // Re-orthogonalize the frame using Gram-Schmidt
    // forward × right = up (re-computed)
    state.up.crossVectors(state.direction, state.right).normalize();
    // right × up = forward (ensure orthogonality)
    state.right.crossVectors(state.up, state.direction).normalize();
  }

  // --------------------------------------------------------------------------
  // Occupancy Volume Computation
  // --------------------------------------------------------------------------

  /**
   * Compute a 3D occupancy volume from the cave tunnel path.
   * Each cell is 1 if inside a tunnel, 0 if outside.
   */
  private computeOccupancy(
    points: THREE.Vector3[],
    radii: number[],
    config: CaveGrammarConfig,
  ): { occupancy: Float32Array; gridSize: number; gridOrigin: THREE.Vector3; gridCellSize: number } {
    if (points.length === 0) {
      return {
        occupancy: new Float32Array(0),
        gridSize: 0,
        gridOrigin: new THREE.Vector3(0, 0, 0),
        gridCellSize: 1,
      };
    }

    // Compute bounding box of the tunnel path with margin for radius
    const minBound = new THREE.Vector3(Infinity, Infinity, Infinity);
    const maxBound = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const r = radii[i];
      minBound.x = Math.min(minBound.x, p.x - r);
      minBound.y = Math.min(minBound.y, p.y - r);
      minBound.z = Math.min(minBound.z, p.z - r);
      maxBound.x = Math.max(maxBound.x, p.x + r);
      maxBound.y = Math.max(maxBound.y, p.y + r);
      maxBound.z = Math.max(maxBound.z, p.z + r);
    }

    // Add margin
    const margin = config.baseRadius * 2;
    minBound.addScalar(-margin);
    maxBound.addScalar(margin);

    // Determine grid resolution
    // Target ~32 cells along the longest dimension
    const extent = maxBound.clone().sub(minBound);
    const maxExtent = Math.max(extent.x, extent.y, extent.z);
    const cellSize = maxExtent / 32;
    const gridSizeX = Math.ceil(extent.x / cellSize);
    const gridSizeY = Math.ceil(extent.y / cellSize);
    const gridSizeZ = Math.ceil(extent.z / cellSize);

    // Use a cube grid for simplicity (pad shorter dimensions)
    const gridSize = Math.max(gridSizeX, gridSizeY, gridSizeZ);
    const occupancy = new Float32Array(gridSize * gridSize * gridSize);

    // Fill occupancy by checking distance to each tunnel segment
    // For efficiency, we only check points near each segment
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const r0 = radii[i];
      const r1 = radii[i + 1];

      // Compute the bounding box of this segment
      const segMin = new THREE.Vector3(
        Math.min(p0.x, p1.x) - Math.max(r0, r1),
        Math.min(p0.y, p1.y) - Math.max(r0, r1),
        Math.min(p0.z, p1.z) - Math.max(r0, r1),
      );
      const segMax = new THREE.Vector3(
        Math.max(p0.x, p1.x) + Math.max(r0, r1),
        Math.max(p0.y, p1.y) + Math.max(r0, r1),
        Math.max(p0.z, p1.z) + Math.max(r0, r1),
      );

      // Convert to grid indices
      const gxMin = Math.max(0, Math.floor((segMin.x - minBound.x) / cellSize));
      const gyMin = Math.max(0, Math.floor((segMin.y - minBound.y) / cellSize));
      const gzMin = Math.max(0, Math.floor((segMin.z - minBound.z) / cellSize));
      const gxMax = Math.min(gridSize - 1, Math.ceil((segMax.x - minBound.x) / cellSize));
      const gyMax = Math.min(gridSize - 1, Math.ceil((segMax.y - minBound.y) / cellSize));
      const gzMax = Math.min(gridSize - 1, Math.ceil((segMax.z - minBound.z) / cellSize));

      const segment = new THREE.Vector3().subVectors(p1, p0);
      const segLenSq = segment.lengthSq();

      for (let gz = gzMin; gz <= gzMax; gz++) {
        for (let gy = gyMin; gy <= gyMax; gy++) {
          for (let gx = gxMin; gx <= gxMax; gx++) {
            const idx = gz * gridSize * gridSize + gy * gridSize + gx;

            // Skip if already occupied
            if (occupancy[idx] >= 1.0) continue;

            // Compute world position of this grid cell center
            const worldPos = new THREE.Vector3(
              minBound.x + (gx + 0.5) * cellSize,
              minBound.y + (gy + 0.5) * cellSize,
              minBound.z + (gz + 0.5) * cellSize,
            );

            // Compute distance from worldPos to the line segment [p0, p1]
            let t = 0;
            if (segLenSq > 0) {
              t = Math.max(0, Math.min(1,
                worldPos.clone().sub(p0).dot(segment) / segLenSq
              ));
            }
            const closestPoint = p0.clone().add(segment.clone().multiplyScalar(t));
            const distToAxis = worldPos.distanceTo(closestPoint);

            // Interpolate radius along the segment
            const radius = r0 + (r1 - r0) * t;

            // If inside the tunnel, mark as occupied
            if (distToAxis < radius) {
              occupancy[idx] = 1.0;
            }
          }
        }
      }
    }

    return {
      occupancy,
      gridSize,
      gridOrigin: minBound,
      gridCellSize: cellSize,
    };
  }
}
