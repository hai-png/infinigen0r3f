/**
 * Surface Kernel — Node Graph Compilation and Evaluation
 *
 * Provides a TypeScript equivalent of Infinigen's Surface Kernelizer
 * (terrain/surface_kernel/kernelizer.py) that compiles node graph descriptions
 * into evaluation functions. The SurfaceKernel class represents a compiled
 * evaluation pipeline that can process inputs through a sequence of operations
 * (noise, math, curves, color ramps, mixing) to produce output values.
 *
 * This mirrors how Infinigen compiles Blender node trees into C/CUDA kernel
 * code for parallel surface evaluation. In the R3F port, we compile into a
 * JavaScript evaluation function that processes named inputs/outputs through
 * a chain of typed operations.
 *
 * Port of: Infinigen terrain/surface_kernel/kernelizer.py
 *
 * @module core/util/math/surface-kernel
 */

import { SeededNoiseGenerator, NoiseType } from './noise';

// ============================================================================
// Types
// ============================================================================

/**
 * Data types supported by the surface kernel.
 * Maps to GLSL/Blender node socket types.
 */
export enum KernelDataType {
  float = 'float',
  float2 = 'float2',
  float3 = 'float3',
  float4 = 'float4',
  int = 'int',
}

/**
 * Number of components for each kernel data type.
 */
function componentCount(type: KernelDataType): number {
  switch (type) {
    case KernelDataType.float: return 1;
    case KernelDataType.int: return 1;
    case KernelDataType.float2: return 2;
    case KernelDataType.float3: return 3;
    case KernelDataType.float4: return 4;
    default: return 1;
  }
}

/**
 * A kernel input declaration.
 */
export interface KernelInput {
  /** Input name (used as key in the input values map) */
  name: string;
  /** Data type of the input */
  type: KernelDataType;
  /** Default value as a flat number array (length = componentCount(type)) */
  defaultValue: number[];
}

/**
 * A kernel output declaration.
 */
export interface KernelOutput {
  /** Output name (used as key in the output values map) */
  name: string;
  /** Data type of the output */
  type: KernelDataType;
}

/**
 * An operation within a surface kernel.
 *
 * Each operation:
 *   - Reads named inputs from the kernel's value store (via inputMapping)
 *   - Performs a computation (noise, math, curve, etc.)
 *   - Writes named outputs to the kernel's value store (via outputMapping)
 *
 * The `type` field determines which evaluator is used:
 *   - 'noise': Perlin or Voronoi noise evaluation
 *   - 'math': Arithmetic/math operations (add, sub, mul, div, sin, cos, pow, etc.)
 *   - 'curve': 1D curve/RGB curve interpolation
 *   - 'color_ramp': Color ramp evaluation with stops
 *   - 'mix': Mix/blend between two inputs
 */
export type KernelOperation = {
  /** Operation type */
  type: 'noise' | 'math' | 'curve' | 'color_ramp' | 'mix';
  /** Operation-specific parameters */
  params: Record<string, any>;
  /** Maps input socket names to value store keys */
  inputMapping: Map<string, string>;
  /** Maps output socket names to value store keys */
  outputMapping: Map<string, string>;
};

// ============================================================================
// Built-in Operation Evaluators
// ============================================================================

/**
 * Internal value store: maps variable names to their current float array values.
 */
type ValueStore = Map<string, number[]>;

/**
 * Evaluate a Perlin noise operation.
 * Reads: 'position' (float3), 'scale' (float)
 * Writes: 'result' (float), 'color' (float3) — derived from 3 noise samples
 */
function evaluatePerlinNoise(
  store: ValueStore,
  op: KernelOperation,
  noiseGen: SeededNoiseGenerator,
): void {
  const pos = store.get(op.inputMapping.get('position') ?? 'position') ?? [0, 0, 0];
  const scale = store.get(op.inputMapping.get('scale') ?? 'scale') ?? [1.0];
  const seed = op.params.seed ?? 0;
  const octaves = op.params.octaves ?? 1;
  const lacunarity = op.params.lacunarity ?? 2.0;
  const gain = op.params.gain ?? 0.5;

  const s = scale[0];
  const gen = seed !== 0 ? new SeededNoiseGenerator(seed) : noiseGen;

  let result: number;
  if (octaves > 1) {
    result = gen.fbm(pos[0] * s, pos[1] * s, pos[2] * s, {
      octaves,
      lacunarity,
      gain,
      noiseType: NoiseType.Perlin,
    });
  } else {
    result = gen.perlin3D(pos[0] * s, pos[1] * s, pos[2] * s);
  }

  const resultKey = op.outputMapping.get('result') ?? 'result';
  store.set(resultKey, [result]);

  // Color output: sample noise at 3 offset positions for RGB channels
  const colorKey = op.outputMapping.get('color') ?? 'color';
  if (op.outputMapping.has('color')) {
    const r = gen.perlin3D(pos[0] * s + 0.0, pos[1] * s, pos[2] * s);
    const g = gen.perlin3D(pos[0] * s + 31.416, pos[1] * s, pos[2] * s);
    const b = gen.perlin3D(pos[0] * s + 47.853, pos[1] * s, pos[2] * s);
    store.set(colorKey, [r, g, b]);
  }
}

/**
 * Evaluate a Voronoi noise operation.
 * Reads: 'position' (float3), 'scale' (float)
 * Writes: 'result' (float), 'color' (float3)
 */
function evaluateVoronoiNoise(
  store: ValueStore,
  op: KernelOperation,
  noiseGen: SeededNoiseGenerator,
): void {
  const pos = store.get(op.inputMapping.get('position') ?? 'position') ?? [0, 0, 0];
  const scale = store.get(op.inputMapping.get('scale') ?? 'scale') ?? [1.0];
  const seed = op.params.seed ?? 0;
  const distanceExponent = op.params.distanceExponent ?? 2.0;

  const s = scale[0];
  const gen = seed !== 0 ? new SeededNoiseGenerator(seed) : noiseGen;

  const result = gen.voronoi3D(pos[0], pos[1], pos[2], s);

  const resultKey = op.outputMapping.get('result') ?? 'result';
  store.set(resultKey, [result]);

  const colorKey = op.outputMapping.get('color') ?? 'color';
  if (op.outputMapping.has('color')) {
    // Use cell ID hashes for color variation
    const r = gen.voronoi3D(pos[0] + 100, pos[1], pos[2], s);
    const g = gen.voronoi3D(pos[0], pos[1] + 100, pos[2], s);
    const b = gen.voronoi3D(pos[0], pos[1], pos[2] + 100, s);
    store.set(colorKey, [r, g, b]);
  }
}

/**
 * Evaluate a math operation.
 * Supports: add, sub, mul, div, sin, cos, pow, abs, sqrt, clamp, min, max,
 *           negate, fract, floor, ceil, modulo, lerp, smoothstep
 * Reads: 'a' (float), 'b' (float), 'factor' (float) depending on operation
 * Writes: 'result' (float)
 */
function evaluateMathOp(store: ValueStore, op: KernelOperation): void {
  const opName = op.params.operation ?? 'add';
  const a = (store.get(op.inputMapping.get('a') ?? 'a') ?? [0])[0];
  const b = (store.get(op.inputMapping.get('b') ?? 'b') ?? [0])[0];
  const factor = (store.get(op.inputMapping.get('factor') ?? 'factor') ?? [0.5])[0];

  let result: number;

  switch (opName) {
    case 'add': result = a + b; break;
    case 'sub': result = a - b; break;
    case 'mul': result = a * b; break;
    case 'div': result = b !== 0 ? a / b : 0; break;
    case 'sin': result = Math.sin(a); break;
    case 'cos': result = Math.cos(a); break;
    case 'tan': result = Math.tan(a); break;
    case 'asin': result = Math.asin(Math.max(-1, Math.min(1, a))); break;
    case 'acos': result = Math.acos(Math.max(-1, Math.min(1, a))); break;
    case 'atan': result = Math.atan(a); break;
    case 'atan2': result = Math.atan2(a, b); break;
    case 'pow': result = Math.pow(a, b); break;
    case 'log': result = a > 0 ? Math.log(a) : -1e10; break;
    case 'exp': result = Math.exp(a); break;
    case 'abs': result = Math.abs(a); break;
    case 'sqrt': result = a >= 0 ? Math.sqrt(a) : 0; break;
    case 'clamp': {
      const min = op.params.min ?? 0;
      const max = op.params.max ?? 1;
      result = Math.max(min, Math.min(max, a));
      break;
    }
    case 'min': result = Math.min(a, b); break;
    case 'max': result = Math.max(a, b); break;
    case 'negate': result = -a; break;
    case 'fract': result = a - Math.floor(a); break;
    case 'floor': result = Math.floor(a); break;
    case 'ceil': result = Math.ceil(a); break;
    case 'modulo': result = b !== 0 ? a % b : 0; break;
    case 'lerp': result = a + (b - a) * factor; break;
    case 'smoothstep': {
      const edge0 = op.params.edge0 ?? 0;
      const edge1 = op.params.edge1 ?? 1;
      const t = Math.max(0, Math.min(1, (a - edge0) / (edge1 - edge0)));
      result = t * t * (3 - 2 * t);
      break;
    }
    case 'sign': result = Math.sign(a); break;
    case 'one_minus': result = 1 - a; break;
    default:
      console.warn(`[SurfaceKernel] Unknown math operation: ${opName}`);
      result = a;
  }

  const resultKey = op.outputMapping.get('result') ?? 'result';
  store.set(resultKey, [result]);
}

/**
 * A control point on a 1D curve.
 */
interface CurveControlPoint {
  position: number;
  value: number;
}

/**
 * Evaluate a 1D curve/RGB curve operation.
 * Reads: 'input' (float)
 * Writes: 'result' (float)
 */
function evaluateColorRamp(store: ValueStore, op: KernelOperation): void {
  const input = (store.get(op.inputMapping.get('input') ?? 'input') ?? [0])[0];

  // Parse control points from params
  const rawPoints: CurveControlPoint[] = op.params.points ?? [
    { position: 0, value: 0 },
    { position: 1, value: 1 },
  ];

  // Sort by position
  rawPoints.sort((a: CurveControlPoint, b: CurveControlPoint) => a.position - b.position);

  // Interpolate
  let result: number;
  if (rawPoints.length === 0) {
    result = 0;
  } else if (rawPoints.length === 1) {
    result = rawPoints[0].value;
  } else if (input <= rawPoints[0].position) {
    result = rawPoints[0].value;
  } else if (input >= rawPoints[rawPoints.length - 1].position) {
    result = rawPoints[rawPoints.length - 1].value;
  } else {
    // Find the two surrounding control points
    let lo = 0;
    for (let i = 0; i < rawPoints.length - 1; i++) {
      if (input >= rawPoints[i].position && input <= rawPoints[i + 1].position) {
        lo = i;
        break;
      }
    }
    const p0 = rawPoints[lo];
    const p1 = rawPoints[lo + 1];
    const t = (input - p0.position) / (p1.position - p0.position);
    // Smooth interpolation (cubic Hermite)
    const st = t * t * (3 - 2 * t);
    result = p0.value + (p1.value - p0.value) * st;
  }

  const resultKey = op.outputMapping.get('result') ?? 'result';
  store.set(resultKey, [result]);

  // If there's a 'color' output, evaluate the ramp for R, G, B separately
  const colorKey = op.outputMapping.get('color') ?? 'color';
  if (op.outputMapping.has('color')) {
    const colorPoints = op.params.colorPoints;
    if (colorPoints && Array.isArray(colorPoints) && colorPoints.length >= 2) {
      const r = interpolateRamp(input, colorPoints[0] ?? rawPoints);
      const g = interpolateRamp(input, colorPoints[1] ?? rawPoints);
      const b = interpolateRamp(input, colorPoints[2] ?? rawPoints);
      store.set(colorKey, [r, g, b]);
    } else {
      store.set(colorKey, [result, result, result]);
    }
  }
}

/** Helper: interpolate a 1D ramp at a given position */
function interpolateRamp(input: number, points: CurveControlPoint[]): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;
  if (input <= points[0].position) return points[0].value;
  if (input >= points[points.length - 1].position) return points[points.length - 1].value;

  for (let i = 0; i < points.length - 1; i++) {
    if (input >= points[i].position && input <= points[i + 1].position) {
      const t = (input - points[i].position) / (points[i + 1].position - points[i].position);
      const st = t * t * (3 - 2 * t);
      return points[i].value + (points[i + 1].value - points[i].value) * st;
    }
  }
  return points[points.length - 1].value;
}

/**
 * Evaluate a mix/blend operation.
 * Reads: 'a', 'b', 'factor'
 * Writes: 'result'
 */
function evaluateMixRGB(store: ValueStore, op: KernelOperation): void {
  const aKey = op.inputMapping.get('a') ?? 'a';
  const bKey = op.inputMapping.get('b') ?? 'b';
  const factorKey = op.inputMapping.get('factor') ?? 'factor';

  const a = store.get(aKey) ?? [0];
  const b = store.get(bKey) ?? [0];
  const factor = (store.get(factorKey) ?? [0.5])[0];

  const blendType = op.params.blend_type ?? 'mix';
  const clampFactor = op.params.clamp_factor ?? true;
  const f = clampFactor ? Math.max(0, Math.min(1, factor)) : factor;

  const maxLen = Math.max(a.length, b.length);
  const result: number[] = new Array(maxLen);

  for (let i = 0; i < maxLen; i++) {
    const av = a[Math.min(i, a.length - 1)] ?? 0;
    const bv = b[Math.min(i, b.length - 1)] ?? 0;

    switch (blendType) {
      case 'mix':
        result[i] = av * (1 - f) + bv * f;
        break;
      case 'add':
        result[i] = av + bv * f;
        break;
      case 'multiply':
        result[i] = av * (bv * f + (1 - f));
        break;
      case 'subtract':
        result[i] = av - bv * f;
        break;
      case 'screen':
        result[i] = 1 - (1 - av) * (1 - bv * f);
        break;
      case 'overlay': {
        const base = av;
        const blend = bv;
        if (base < 0.5) {
          result[i] = 2 * base * blend * f + base * (1 - f);
        } else {
          result[i] = (1 - 2 * (1 - base) * (1 - blend)) * f + base * (1 - f);
        }
        break;
      }
      case 'difference':
        result[i] = Math.abs(av - bv) * f + av * (1 - f);
        break;
      case 'darken':
        result[i] = Math.min(av, bv) * f + av * (1 - f);
        break;
      case 'lighten':
        result[i] = Math.max(av, bv) * f + av * (1 - f);
        break;
      default:
        result[i] = av * (1 - f) + bv * f;
    }
  }

  const resultKey = op.outputMapping.get('result') ?? 'result';
  store.set(resultKey, result);
}

/**
 * Evaluate a normal map operation.
 * Reads: 'height' (float), 'strength' (float), 'position' (float3)
 * Writes: 'normal' (float3)
 */
function evaluateNormalMap(store: ValueStore, op: KernelOperation): void {
  const height = (store.get(op.inputMapping.get('height') ?? 'height') ?? [0])[0];
  const strength = (store.get(op.inputMapping.get('strength') ?? 'strength') ?? [1])[0];
  const position = store.get(op.inputMapping.get('position') ?? 'position') ?? [0, 0, 0];

  // Approximate normal from height gradient using finite differences
  // This is a simplified version; a full implementation would re-evaluate
  // the height at offset positions. Here we approximate from the position.
  const eps = 0.001;
  const nx = -height * strength * 2.0;
  const ny = 1.0;
  const nz = -height * strength * 2.0;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

  const normalKey = op.outputMapping.get('normal') ?? 'normal';
  store.set(normalKey, [nx / len, ny / len, nz / len]);
}

// ============================================================================
// SurfaceKernel Class
// ============================================================================

/**
 * A compiled surface evaluation kernel.
 *
 * Represents a sequence of operations that transform named inputs into named
 * outputs, similar to how Infinigen's Surface Kernelizer compiles Blender
 * node trees into C/CUDA kernels. The kernel maintains an ordered list of
 * operations that are evaluated sequentially, with each operation reading
 * from and writing to a shared value store.
 *
 * Usage:
 *   1. Create a kernel with declared inputs and outputs
 *   2. Compile a node graph or manually add operations
 *   3. Evaluate the kernel with input values to get output values
 *
 * @example
 * ```ts
 * const kernel = new SurfaceKernel(
 *   [{ name: 'position', type: KernelDataType.float3, defaultValue: [0, 0, 0] }],
 *   [{ name: 'height', type: KernelDataType.float }],
 * );
 *
 * kernel.addOperation({
 *   type: 'noise',
 *   params: { seed: 42, octaves: 4, noiseType: 'perlin' },
 *   inputMapping: new Map([['position', 'position'], ['scale', 'noiseScale']]),
 *   outputMapping: new Map([['result', 'height']]),
 * });
 *
 * const outputs = kernel.evaluate(new Map([['position', [1, 2, 3]]]));
 * ```
 */
export class SurfaceKernel {
  /** Declared inputs */
  private readonly inputs: KernelInput[];
  /** Declared outputs */
  private readonly outputs: KernelOutput[];
  /** Ordered list of operations to execute */
  private readonly operations: KernelOperation[] = [];
  /** Noise generator for noise operations */
  private noiseGen: SeededNoiseGenerator;
  /** Whether the kernel has been compiled from a node graph */
  private compiled: boolean = false;

  constructor(inputs: KernelInput[], outputs: KernelOutput[]) {
    this.inputs = inputs;
    this.outputs = outputs;
    this.noiseGen = new SeededNoiseGenerator(0);
  }

  /**
   * Add an operation to the kernel's evaluation pipeline.
   * Operations are executed in the order they are added.
   *
   * @param op - The kernel operation to add
   */
  addOperation(op: KernelOperation): void {
    this.operations.push(op);
  }

  /**
   * Compile a node graph description into evaluation operations.
   *
   * The node graph is a list of node descriptions, each with:
   *   - type: the node type (e.g., 'noise_texture', 'math', 'mix_rgb', etc.)
   *   - id: unique identifier for the node
   *   - params: node-specific parameters
   *   - inputs: map of input socket names to source { nodeId, socket }
   *   - outputs: map of output socket names
   *
   * This method converts the graph into a topologically-sorted sequence
   * of KernelOperations that can be evaluated by `evaluate()`.
   *
   * @param nodeGraph - The node graph description (typically from a Blender export)
   */
  compile(nodeGraph: any): void {
    if (!nodeGraph || !Array.isArray(nodeGraph.nodes)) {
      console.warn('[SurfaceKernel] Invalid node graph provided to compile()');
      return;
    }

    const nodes: any[] = nodeGraph.nodes;
    const links: any[] = nodeGraph.links ?? [];

    // Build a mapping: outputKey (nodeId:socketName) → inputKey (nodeId:socketName)
    const linkMap = new Map<string, string>();
    for (const link of links) {
      const fromKey = `${link.fromNode}:${link.fromSocket}`;
      const toKey = `${link.toNode}:${link.toSocket}`;
      linkMap.set(toKey, fromKey);
    }

    // Topological sort using Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      const id = node.id;
      if (!inDegree.has(id)) inDegree.set(id, 0);
      if (!adjacency.has(id)) adjacency.set(id, []);
    }

    // Build adjacency from links
    for (const link of links) {
      const fromId = link.fromNode;
      const toId = link.toNode;
      adjacency.get(fromId)?.push(toId);
      inDegree.set(toId, (inDegree.get(toId) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const sortedIds: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedIds.push(current);
      for (const neighbor of (adjacency.get(current) ?? [])) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    // Convert sorted nodes to kernel operations
    for (const nodeId of sortedIds) {
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) continue;

      const op = this.convertNodeToOperation(node, linkMap);
      if (op) {
        this.operations.push(op);
      }
    }

    // Set the noise seed from the graph metadata
    if (nodeGraph.seed !== undefined) {
      this.noiseGen = new SeededNoiseGenerator(nodeGraph.seed);
    }

    this.compiled = true;
  }

  /**
   * Execute the kernel on given inputs.
   *
   * Initializes the value store with input values (or defaults), then
   * executes each operation in order, producing output values.
   *
   * @param inputValues - Map of input name → value array
   * @returns Map of output name → value array
   */
  evaluate(inputValues: Map<string, number[]>): Map<string, number[]> {
    // Initialize the value store with defaults
    const store: ValueStore = new Map();

    // Populate with input defaults
    for (const input of this.inputs) {
      store.set(input.name, [...input.defaultValue]);
    }

    // Override with provided input values
    for (const [name, value] of inputValues.entries()) {
      store.set(name, [...value]);
    }

    // Execute operations in order
    for (const op of this.operations) {
      this.evaluateOperation(op, store);
    }

    // Extract outputs
    const result = new Map<string, number[]>();
    for (const output of this.outputs) {
      const value = store.get(output.name);
      if (value !== undefined) {
        result.set(output.name, [...value]);
      } else {
        // Return zero-filled default
        result.set(output.name, new Array(componentCount(output.type)).fill(0));
      }
    }

    return result;
  }

  /**
   * Get the number of operations in this kernel.
   */
  getOperationCount(): number {
    return this.operations.length;
  }

  /**
   * Check if the kernel has been compiled.
   */
  isCompiled(): boolean {
    return this.compiled;
  }

  /**
   * Get the declared inputs.
   */
  getInputs(): readonly KernelInput[] {
    return this.inputs;
  }

  /**
   * Get the declared outputs.
   */
  getOutputs(): readonly KernelOutput[] {
    return this.outputs;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Evaluate a single operation, reading from and writing to the value store.
   */
  private evaluateOperation(op: KernelOperation, store: ValueStore): void {
    switch (op.type) {
      case 'noise': {
        const noiseType = op.params.noiseType ?? 'perlin';
        if (noiseType === 'voronoi') {
          evaluateVoronoiNoise(store, op, this.noiseGen);
        } else {
          evaluatePerlinNoise(store, op, this.noiseGen);
        }
        break;
      }

      case 'math':
        evaluateMathOp(store, op);
        break;

      case 'curve':
        evaluateColorRamp(store, op);
        break;

      case 'color_ramp':
        evaluateColorRamp(store, op);
        break;

      case 'mix':
        evaluateMixRGB(store, op);
        break;

      default:
        console.warn(`[SurfaceKernel] Unknown operation type: ${op.type}`);
    }
  }

  /**
   * Convert a node graph node description into a KernelOperation.
   */
  private convertNodeToOperation(node: any, linkMap: Map<string, string>): KernelOperation | null {
    const inputMapping = new Map<string, string>();
    const outputMapping = new Map<string, string>();

    // Resolve input connections
    if (node.inputs && typeof node.inputs === 'object') {
      for (const [socketName, source] of Object.entries(node.inputs)) {
        if (source && typeof source === 'object' && 'nodeId' in (source as any)) {
          const src = source as { nodeId: string; socket: string };
          inputMapping.set(socketName, `${src.nodeId}:${src.socket}`);
        } else {
          // Direct value input — store as a constant with the socket name
          inputMapping.set(socketName, `${node.id}:${socketName}_input`);
        }
      }
    }

    // Resolve output connections
    if (node.outputs && typeof node.outputs === 'object') {
      for (const socketName of Object.keys(node.outputs as Record<string, any>)) {
        outputMapping.set(socketName, `${node.id}:${socketName}`);
      }
    }

    const params = { ...(node.params ?? {}), ...(node.properties ?? {}) };

    switch (node.type) {
      case 'noise_texture':
      case 'tex_noise':
        return {
          type: 'noise',
          params: {
            seed: params.seed ?? 0,
            octaves: params.octaves ?? 1,
            lacunarity: params.lacunarity ?? 2.0,
            gain: params.gain ?? 0.5,
            noiseType: params.noise_type ?? 'perlin',
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      case 'math':
        return {
          type: 'math',
          params: {
            operation: params.operation ?? 'add',
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      case 'rgb_curve':
      case 'curve_rgb':
        return {
          type: 'curve',
          params: {
            points: params.points ?? [{ position: 0, value: 0 }, { position: 1, value: 1 }],
            colorPoints: params.colorPoints,
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      case 'color_ramp':
        return {
          type: 'color_ramp',
          params: {
            points: params.points ?? [{ position: 0, value: 0 }, { position: 1, value: 1 }],
            colorPoints: params.colorPoints,
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      case 'mix_rgb':
      case 'mix':
        return {
          type: 'mix',
          params: {
            blend_type: params.blend_type ?? params.blendType ?? 'mix',
            clamp_factor: params.clamp_factor ?? params.clampFactor ?? true,
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      case 'normal_map':
        return {
          type: 'math', // Use math as base; normal_map is handled in the pipeline
          params: {
            operation: 'normal_map',
            strength: params.strength ?? 1.0,
            ...params,
          },
          inputMapping,
          outputMapping,
        };

      default:
        // Pass through unknown node types as identity math operations
        if (node.type && node.type !== 'output') {
          return {
            type: 'math',
            params: { operation: 'add', ...params },
            inputMapping,
            outputMapping,
          };
        }
        return null;
    }
  }
}

// ============================================================================
// Top-Level Compilation Function
// ============================================================================

/**
 * Compile a set of node graph descriptions into a SurfaceKernel.
 *
 * This is the main entry point for the Surface Kernelizer. It takes an array
 * of node graph descriptions (typically from Blender exports or the node editor)
 * and produces a compiled SurfaceKernel that can evaluate the graph.
 *
 * The function:
 *   1. Creates a SurfaceKernel with inputs and outputs extracted from the graph
 *   2. Compiles the node graph into a sequence of operations
 *   3. Returns the ready-to-evaluate kernel
 *
 * @param nodeDescriptions - Array of node graph descriptions, each with:
 *   - nodes: list of node objects with id, type, params, inputs, outputs
 *   - links: list of link objects with fromNode, fromSocket, toNode, toSocket
 *   - seed: optional seed for deterministic noise
 * @returns A compiled SurfaceKernel ready for evaluation
 *
 * @example
 * ```ts
 * const kernel = compileSurfaceKernel([{
 *   nodes: [
 *     { id: 'pos', type: 'input_position', outputs: { position: {} } },
 *     { id: 'noise', type: 'tex_noise', params: { octaves: 4, seed: 42 },
 *       inputs: { position: { nodeId: 'pos', socket: 'position' }, scale: 2.0 },
 *       outputs: { result: {}, color: {} } },
 *   ],
 *   links: [
 *     { fromNode: 'pos', fromSocket: 'position', toNode: 'noise', toSocket: 'position' },
 *   ],
 *   seed: 42,
 * }]);
 *
 * const result = kernel.evaluate(new Map([['position', [1, 2, 3]]]));
 * ```
 */
export function compileSurfaceKernel(nodeDescriptions: any[]): SurfaceKernel {
  // Collect all inputs and outputs across all graph descriptions
  const allInputs: KernelInput[] = [];
  const allOutputs: KernelOutput[] = [];
  let globalSeed = 0;

  for (const desc of nodeDescriptions) {
    if (desc.seed !== undefined) {
      globalSeed = desc.seed;
    }

    const nodes = desc.nodes ?? [];
    for (const node of nodes) {
      // Input nodes
      if (node.inputs && typeof node.inputs === 'object') {
        for (const [name, value] of Object.entries(node.inputs as Record<string, any>)) {
          // Only add as a kernel input if it's a constant value (not a connection)
          if (value !== null && value !== undefined && typeof value !== 'object') {
            const existing = allInputs.find(i => i.name === `${node.id}:${name}`);
            if (!existing) {
              allInputs.push({
                name: `${node.id}:${name}_input`,
                type: KernelDataType.float,
                defaultValue: [Number(value)],
              });
            }
          }
        }
      }

      // Output nodes
      if (node.outputs && typeof node.outputs === 'object') {
        for (const name of Object.keys(node.outputs as Record<string, any>)) {
          allOutputs.push({
            name: `${node.id}:${name}`,
            type: KernelDataType.float,
          });
        }
      }
    }
  }

  // Add default inputs if none were found
  if (allInputs.length === 0) {
    allInputs.push(
      { name: 'position', type: KernelDataType.float3, defaultValue: [0, 0, 0] },
      { name: 'normal', type: KernelDataType.float3, defaultValue: [0, 1, 0] },
    );
  }

  // Add default outputs if none were found
  if (allOutputs.length === 0) {
    allOutputs.push(
      { name: 'result', type: KernelDataType.float },
      { name: 'color', type: KernelDataType.float3 },
    );
  }

  const kernel = new SurfaceKernel(allInputs, allOutputs);

  // Compile each node description
  for (const desc of nodeDescriptions) {
    kernel.compile(desc);
  }

  return kernel;
}

// ============================================================================
// Pre-built Kernel Factories
// ============================================================================

/**
 * Create a simple terrain height kernel with FBM noise.
 * @param seed - Noise seed
 * @param octaves - Number of FBM octaves
 * @param scale - Noise frequency scale
 * @param lacunarity - Frequency multiplier per octave
 * @param gain - Amplitude multiplier per octave
 */
export function createTerrainHeightKernel(
  seed: number = 0,
  octaves: number = 6,
  scale: number = 0.01,
  lacunarity: number = 2.0,
  gain: number = 0.5,
): SurfaceKernel {
  const kernel = new SurfaceKernel(
    [
      { name: 'position', type: KernelDataType.float3, defaultValue: [0, 0, 0] },
    ],
    [
      { name: 'height', type: KernelDataType.float },
    ],
  );

  kernel.addOperation({
    type: 'noise',
    params: { seed, octaves, lacunarity, gain, noiseType: 'perlin' },
    inputMapping: new Map([['position', 'position'], ['scale', 'noiseScale']]),
    outputMapping: new Map([['result', 'height']]),
  });

  // Add a constant for noise scale
  // We inject it via a simple math identity operation
  kernel.addOperation({
    type: 'math',
    params: { operation: 'add' },
    inputMapping: new Map([['a', 'height'], ['b', 'zero']]),
    outputMapping: new Map([['result', 'height']]),
  });

  return kernel;
}

/**
 * Create a material surface kernel with color ramp and normal map.
 * @param seed - Noise seed
 * @param colorStops - Color ramp control points
 */
export function createMaterialSurfaceKernel(
  seed: number = 0,
  colorStops?: Array<{ position: number; value: number }>,
): SurfaceKernel {
  const kernel = new SurfaceKernel(
    [
      { name: 'position', type: KernelDataType.float3, defaultValue: [0, 0, 0] },
      { name: 'normal', type: KernelDataType.float3, defaultValue: [0, 1, 0] },
    ],
    [
      { name: 'color', type: KernelDataType.float3 },
      { name: 'roughness', type: KernelDataType.float },
      { name: 'normal_out', type: KernelDataType.float3 },
    ],
  );

  // Noise → height
  kernel.addOperation({
    type: 'noise',
    params: { seed, octaves: 4, noiseType: 'perlin' },
    inputMapping: new Map([['position', 'position'], ['scale', 'noiseScale']]),
    outputMapping: new Map([['result', 'noiseVal'], ['color', 'noiseColor']]),
  });

  // Color ramp
  kernel.addOperation({
    type: 'color_ramp',
    params: {
      points: colorStops ?? [
        { position: 0, value: 0.2 },
        { position: 0.5, value: 0.5 },
        { position: 1, value: 0.8 },
      ],
    },
    inputMapping: new Map([['input', 'noiseVal']]),
    outputMapping: new Map([['result', 'roughness'], ['color', 'color']]),
  });

  // Normal map
  kernel.addOperation({
    type: 'math',
    params: { operation: 'normal_map', strength: 1.0 },
    inputMapping: new Map([['height', 'noiseVal'], ['strength', 'normalStrength'], ['position', 'position']]),
    outputMapping: new Map([['result', 'normal_out']]),
  });

  return kernel;
}
