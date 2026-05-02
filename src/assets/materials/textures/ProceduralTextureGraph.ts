/**
 * ProceduralTextureGraph - A system for building and executing texture generation graphs
 *
 * Nodes: Noise, Voronoi, Gradient, ColorRamp, Math, Blend, Warp, Filter
 * Execute graph to produce canvas-based textures
 * Support for albedo, normal, roughness, metallic, AO, height, emission channels
 * Output as DataTexture or Canvas element
 * Caching based on graph + parameters hash
 */

import { createCanvas, isDOMAvailable } from '../../utils/CanvasUtils';
import { SeededNoiseGenerator, NoiseType } from '../../../core/util/math/noise';
import { SeededRandom } from '../../../core/util/MathUtils';

// ============================================================================
// Types
// ============================================================================

export type TextureChannel =
  | 'albedo'
  | 'normal'
  | 'roughness'
  | 'metallic'
  | 'ao'
  | 'height'
  | 'emission';

export type GraphNodeCategory =
  | 'noise'
  | 'voronoi'
  | 'gradient'
  | 'color_ramp'
  | 'math'
  | 'blend'
  | 'warp'
  | 'filter'
  | 'output';

export interface GraphNodeSocket {
  name: string;
  type: 'float' | 'color' | 'vector2' | 'vector3' | 'any';
  value?: number | [number, number] | [number, number, number] | [number, number, number, number];
}

export interface GraphNode {
  id: string;
  category: GraphNodeCategory;
  params: Record<string, number | string | boolean | number[]>;
  inputs: GraphNodeSocket[];
  outputs: GraphNodeSocket[];
}

export interface GraphLink {
  fromNode: string;
  fromSocket: string;
  toNode: string;
  toSocket: string;
}

export interface TextureGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  resolution: number;
  seed: number;
  channel: TextureChannel;
}

export interface TextureGraphOutput {
  canvas: HTMLCanvasElement;
  data: Float32Array;
  width: number;
  height: number;
}

// ============================================================================
// Cache
// ============================================================================

const graphCache = new Map<string, TextureGraphOutput>();

function computeHash(graph: TextureGraph): string {
  const parts: string[] = [
    String(graph.resolution),
    String(graph.seed),
    graph.channel,
  ];

  for (const node of graph.nodes) {
    parts.push(`${node.id}:${node.category}`);
    for (const [k, v] of Object.entries(node.params)) {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }

  for (const link of graph.links) {
    parts.push(`${link.fromNode}.${link.fromSocket}->${link.toNode}.${link.toSocket}`);
  }

  return parts.join('|');
}

// ============================================================================
// Node Execution Functions
// ============================================================================

type PixelFn = (x: number, y: number, w: number, h: number, noise: SeededNoiseGenerator, rng: SeededRandom) => number;

function executeNoiseNode(node: GraphNode, noise: SeededNoiseGenerator, rng: SeededRandom): PixelFn {
  const scale = (node.params.scale as number) ?? 5.0;
  const detail = (node.params.detail as number) ?? 4;
  const roughness = (node.params.roughness as number) ?? 0.5;
  const distortion = (node.params.distortion as number) ?? 0.0;
  const noiseType = (node.params.noiseType as string) ?? 'perlin';

  return (x, y, w, h, n, r) => {
    const nx = x / w;
    const ny = y / h;
    let value: number;

    switch (noiseType) {
      case 'simplex':
        value = n.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: roughness, noiseType: NoiseType.Simplex });
        break;
      case 'voronoi':
        value = n.voronoi2D(nx, ny, scale);
        break;
      case 'ridged':
        value = n.ridgedMultifractal(nx * scale, ny * scale, 0, { octaves: detail, gain: roughness });
        break;
      case 'turbulence':
        value = n.turbulence(nx * scale, ny * scale, 0, { octaves: detail, gain: roughness });
        break;
      case 'perlin':
      default:
        value = n.fbm(nx * scale, ny * scale, 0, { octaves: detail, gain: roughness });
        break;
    }

    // Normalize from [-1,1] to [0,1]
    value = (value + 1) / 2;

    if (distortion > 0) {
      const distort = n.perlin2D(nx * scale * 2 + 5.2, ny * scale * 2 + 1.3) * distortion;
      value += distort * 0.5;
    }

    return Math.max(0, Math.min(1, value));
  };
}

function executeVoronoiNode(node: GraphNode, noise: SeededNoiseGenerator, rng: SeededRandom): PixelFn {
  const scale = (node.params.scale as number) ?? 5.0;
  const feature = (node.params.feature as string) ?? 'f1';
  const edgeWidth = (node.params.edgeWidth as number) ?? 0.05;

  return (x, y, w, h, n, r) => {
    const nx = x / w;
    const ny = y / h;
    const dist = n.voronoi2D(nx, ny, scale);

    if (feature === 'edge') {
      // Edge detection based on distance to cell boundary
      return dist < edgeWidth ? 1.0 : 0.0;
    }

    // f1: distance to nearest point
    return Math.max(0, Math.min(1, dist));
  };
}

function executeGradientNode(node: GraphNode): PixelFn {
  const gradientType = (node.params.gradientType as string) ?? 'linear';

  return (x, y, w, h) => {
    const nx = x / w;
    const ny = y / h;

    switch (gradientType) {
      case 'radial': {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        return 1.0 - Math.min(1, 2 * Math.sqrt(dx * dx + dy * dy));
      }
      case 'spherical': {
        const dx2 = nx - 0.5;
        const dy2 = ny - 0.5;
        const d = 2 * Math.sqrt(dx2 * dx2 + dy2 * dy2);
        return d < 1 ? Math.sqrt(1 - d * d) : 0;
      }
      case 'diagonal':
        return (nx + ny) / 2;
      case 'quadratic':
        return nx * nx;
      case 'vertical':
        return ny;
      case 'easing':
        return nx * nx * (3 - 2 * nx);
      case 'linear':
      default:
        return nx;
    }
  };
}

function executeColorRampNode(node: GraphNode, upstreamFn: PixelFn | null): PixelFn {
  const stops = (node.params.stops as number[]) ?? [0, 0.5, 1];
  const colors = (node.params.colors as number[]) ?? [0, 0.5, 1]; // Grayscale stops for simplicity

  // Build color ramp entries
  const rampEntries: Array<{ pos: number; val: number }> = [];
  const count = Math.min(stops.length, colors.length);
  for (let i = 0; i < count; i++) {
    rampEntries.push({ pos: stops[i], val: colors[i] });
  }
  rampEntries.sort((a, b) => a.pos - b.pos);

  return (x, y, w, h, n, r) => {
    const t = upstreamFn ? upstreamFn(x, y, w, h, n, r) : x / w;

    if (rampEntries.length === 0) return t;
    if (rampEntries.length === 1) return rampEntries[0].val;

    // Find surrounding stops
    let lower = rampEntries[0];
    let upper = rampEntries[rampEntries.length - 1];

    for (let i = 0; i < rampEntries.length - 1; i++) {
      if (t >= rampEntries[i].pos && t <= rampEntries[i + 1].pos) {
        lower = rampEntries[i];
        upper = rampEntries[i + 1];
        break;
      }
    }

    const range = upper.pos - lower.pos;
    const localT = range > 0 ? (t - lower.pos) / range : 0;
    return lower.val + localT * (upper.val - lower.val);
  };
}

function executeMathNode(node: GraphNode, upstreamFn: PixelFn | null): PixelFn {
  const operation = (node.params.operation as string) ?? 'multiply';
  const value = (node.params.value as number) ?? 1.0;

  return (x, y, w, h, n, r) => {
    const input = upstreamFn ? upstreamFn(x, y, w, h, n, r) : 0.5;

    switch (operation) {
      case 'add': return input + value;
      case 'subtract': return input - value;
      case 'multiply': return input * value;
      case 'divide': return value !== 0 ? input / value : 0;
      case 'power': return Math.pow(input, value);
      case 'invert': return 1.0 - input;
      case 'clamp': return Math.max(0, Math.min(1, input));
      case 'abs': return Math.abs(input);
      case 'sqrt': return Math.sqrt(Math.max(0, input));
      case 'sin': return (Math.sin(input * Math.PI * 2) + 1) / 2;
      case 'cos': return (Math.cos(input * Math.PI * 2) + 1) / 2;
      case 'threshold': return input > value ? 1.0 : 0.0;
      case 'smoothstep': {
        const edge0 = value - 0.1;
        const edge1 = value + 0.1;
        const t = Math.max(0, Math.min(1, (input - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      }
      default: return input;
    }
  };
}

function executeBlendNode(node: GraphNode, fnA: PixelFn | null, fnB: PixelFn | null): PixelFn {
  const blendMode = (node.params.blendMode as string) ?? 'mix';
  const factor = (node.params.factor as number) ?? 0.5;

  return (x, y, w, h, n, r) => {
    const a = fnA ? fnA(x, y, w, h, n, r) : 0;
    const b = fnB ? fnB(x, y, w, h, n, r) : 0;

    switch (blendMode) {
      case 'mix': return a + factor * (b - a);
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'screen': return 1 - (1 - a) * (1 - b);
      case 'overlay': return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
      case 'difference': return Math.abs(a - b);
      case 'darken': return Math.min(a, b);
      case 'lighten': return Math.max(a, b);
      case 'soft_light': {
        const res = (1 - 2 * b) * a * a + 2 * b * a;
        return Math.max(0, Math.min(1, res));
      }
      default: return a;
    }
  };
}

function executeWarpNode(node: GraphNode, upstreamFn: PixelFn | null, noise: SeededNoiseGenerator): PixelFn {
  const strength = (node.params.strength as number) ?? 0.5;
  const warpScale = (node.params.warpScale as number) ?? 4.0;

  return (x, y, w, h, n, r) => {
    if (!upstreamFn) return 0;

    const nx = x / w;
    const ny = y / h;

    // Use noise to offset UV coordinates
    const offsetX = n.perlin2D(nx * warpScale, ny * warpScale) * strength;
    const offsetY = n.perlin2D(nx * warpScale + 5.2, ny * warpScale + 1.3) * strength;

    const warpedX = Math.max(0, Math.min(w - 1, x + offsetX * w));
    const warpedY = Math.max(0, Math.min(h - 1, y + offsetY * h));

    return upstreamFn(warpedX, warpedY, w, h, n, r);
  };
}

function executeFilterNode(node: GraphNode, upstreamFn: PixelFn | null): PixelFn {
  const filterType = (node.params.filterType as string) ?? 'contrast';
  const intensity = (node.params.intensity as number) ?? 1.0;

  return (x, y, w, h, n, r) => {
    const input = upstreamFn ? upstreamFn(x, y, w, h, n, r) : 0.5;

    switch (filterType) {
      case 'contrast':
        return Math.max(0, Math.min(1, (input - 0.5) * intensity + 0.5));
      case 'brightness':
        return Math.max(0, Math.min(1, input * intensity));
      case 'gamma':
        return Math.pow(Math.max(0, input), 1.0 / Math.max(0.01, intensity));
      case 'invert':
        return 1.0 - input;
      case 'posterize': {
        const levels = Math.max(2, Math.round(intensity * 10));
        return Math.round(input * levels) / levels;
      }
      case 'sharpen': {
        // Simple sharpen approximation: boost deviation from local average
        // For a full sharpen, we'd need neighbor samples; this is an approximation
        const center = input;
        const deviation = Math.abs(center - 0.5);
        return Math.max(0, Math.min(1, center + (center - 0.5) * intensity * deviation * 2));
      }
      default: return input;
    }
  };
}

// ============================================================================
// ProceduralTextureGraph
// ============================================================================

export class ProceduralTextureGraph {
  private graph: TextureGraph;
  private noise: SeededNoiseGenerator;
  private rng: SeededRandom;

  constructor(graph: TextureGraph) {
    this.graph = graph;
    this.noise = new SeededNoiseGenerator(graph.seed);
    this.rng = new SeededRandom(graph.seed);
  }

  /**
   * Execute the texture graph and produce output
   */
  execute(): TextureGraphOutput {
    // Check cache first
    const hash = computeHash(this.graph);
    const cached = graphCache.get(hash);
    if (cached) return cached;

    const { resolution, channel } = this.graph;
    const size = resolution * resolution;
    const data = new Float32Array(size * 4);

    // Build execution order (topological sort)
    const sortedNodes = this.topologicalSort();

    // Build pixel functions for each node
    const nodeFns = new Map<string, PixelFn>();
    const nodeAdjacency = this.buildAdjacency();

    for (const node of sortedNodes) {
      const upstream = nodeAdjacency.get(node.id) ?? [];
      const fn = this.buildNodeFn(node, upstream, nodeFns);
      nodeFns.set(node.id, fn);
    }

    // Find the output node
    const outputNode = this.findOutputNode();
    const outputFn = outputNode ? nodeFns.get(outputNode.id) : null;

    // Generate texture data
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4;
        const value = outputFn ? outputFn(x, y, resolution, resolution, this.noise, this.rng) : 0.5;

        this.writePixel(data, idx, value, channel);
      }
    }

    // Create canvas (requires DOM)
    const canvas = this.createCanvasFromData(data, resolution);

    const output: TextureGraphOutput = {
      canvas,
      data,
      width: resolution,
      height: resolution,
    };

    graphCache.set(hash, output);
    return output;
  }

  /**
   * Write pixel data based on the target channel
   */
  private writePixel(data: Float32Array, idx: number, value: number, channel: TextureChannel): void {
    const v = Math.max(0, Math.min(1, value));

    switch (channel) {
      case 'albedo':
        // Albedo is RGB
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
      case 'normal':
        // Normal map: default flat normal is (0.5, 0.5, 1.0) in tangent space
        // Use value to perturb X/Y
        data[idx] = 0.5 + (v - 0.5) * 0.5;
        data[idx + 1] = 0.5;
        data[idx + 2] = 1.0;
        data[idx + 3] = 1.0;
        break;
      case 'roughness':
        data[idx] = 0;
        data[idx + 1] = v; // Roughness in green channel
        data[idx + 2] = 0;
        data[idx + 3] = 1.0;
        break;
      case 'metallic':
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = v; // Metallic in blue channel
        data[idx + 3] = 1.0;
        break;
      case 'ao':
        data[idx] = v; // AO in red channel
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
      case 'height':
        data[idx] = 0;
        data[idx + 1] = v; // Height in green channel
        data[idx + 2] = 0;
        data[idx + 3] = 1.0;
        break;
      case 'emission':
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 1.0;
        break;
    }
  }

  /**
   * Create canvas from float data
   */
  private createCanvasFromData(data: Float32Array, resolution: number): HTMLCanvasElement {
    const canvas = createCanvas();
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imageData = ctx.createImageData(resolution, resolution);
    for (let i = 0; i < resolution * resolution; i++) {
      const si = i * 4;
      imageData.data[si] = Math.max(0, Math.min(255, Math.round(data[si] * 255)));
      imageData.data[si + 1] = Math.max(0, Math.min(255, Math.round(data[si + 1] * 255)));
      imageData.data[si + 2] = Math.max(0, Math.min(255, Math.round(data[si + 2] * 255)));
      imageData.data[si + 3] = Math.max(0, Math.min(255, Math.round(data[si + 3] * 255)));
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  /**
   * Build adjacency map (node -> upstream inputs)
   */
  private buildAdjacency(): Map<string, GraphLink[]> {
    const adj = new Map<string, GraphLink[]>();

    for (const link of this.graph.links) {
      if (!adj.has(link.toNode)) {
        adj.set(link.toNode, []);
      }
      adj.get(link.toNode)!.push(link);
    }

    return adj;
  }

  /**
   * Build the pixel function for a node
   */
  private buildNodeFn(
    node: GraphNode,
    upstreamLinks: GraphLink[],
    nodeFns: Map<string, PixelFn>
  ): PixelFn {
    // Find upstream pixel functions
    const findUpstreamFn = (socketName?: string): PixelFn | null => {
      const link = socketName
        ? upstreamLinks.find(l => l.toSocket === socketName)
        : upstreamLinks[0];
      if (!link) return null;
      return nodeFns.get(link.fromNode) ?? null;
    };

    switch (node.category) {
      case 'noise':
        return executeNoiseNode(node, this.noise, this.rng);
      case 'voronoi':
        return executeVoronoiNode(node, this.noise, this.rng);
      case 'gradient':
        return executeGradientNode(node);
      case 'color_ramp':
        return executeColorRampNode(node, findUpstreamFn('fac'));
      case 'math':
        return executeMathNode(node, findUpstreamFn('value'));
      case 'blend': {
        const fnA = findUpstreamFn('a');
        const fnB = findUpstreamFn('b');
        return executeBlendNode(node, fnA, fnB);
      }
      case 'warp':
        return executeWarpNode(node, findUpstreamFn('source'), this.noise);
      case 'filter':
        return executeFilterNode(node, findUpstreamFn('source'));
      case 'output':
        return findUpstreamFn('value') ?? (() => 0.5);
      default:
        return () => 0.5;
    }
  }

  /**
   * Topological sort of graph nodes
   */
  private topologicalSort(): GraphNode[] {
    const nodeMap = new Map(this.graph.nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();

    for (const node of this.graph.nodes) {
      inDegree.set(node.id, 0);
    }

    for (const link of this.graph.links) {
      inDegree.set(link.toNode, (inDegree.get(link.toNode) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: GraphNode[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = nodeMap.get(current);
      if (node) sorted.push(node);

      for (const link of this.graph.links) {
        if (link.fromNode === current) {
          const newDeg = (inDegree.get(link.toNode) ?? 1) - 1;
          inDegree.set(link.toNode, newDeg);
          if (newDeg === 0 && !visited.has(link.toNode)) {
            queue.push(link.toNode);
          }
        }
      }
    }

    return sorted;
  }

  /**
   * Find the output node in the graph
   */
  private findOutputNode(): GraphNode | null {
    return this.graph.nodes.find(n => n.category === 'output') ?? this.graph.nodes[this.graph.nodes.length - 1] ?? null;
  }

  // ==========================================================================
  // Static Factory Methods for Common Graphs
  // ==========================================================================

  /**
   * Create a simple noise graph
   */
  static createNoiseGraph(
    channel: TextureChannel,
    seed: number = 0,
    resolution: number = 512,
    scale: number = 5.0,
    noiseType: string = 'perlin'
  ): TextureGraph {
    const noiseNode: GraphNode = {
      id: 'noise_1',
      category: 'noise',
      params: { scale, noiseType, detail: 4, roughness: 0.5, distortion: 0 },
      inputs: [],
      outputs: [{ name: 'value', type: 'float' }],
    };

    const outputNode: GraphNode = {
      id: 'output',
      category: 'output',
      params: {},
      inputs: [{ name: 'value', type: 'float' }],
      outputs: [],
    };

    return {
      nodes: [noiseNode, outputNode],
      links: [{ fromNode: 'noise_1', fromSocket: 'value', toNode: 'output', toSocket: 'value' }],
      resolution,
      seed,
      channel,
    };
  }

  /**
   * Create a multi-layer noise graph with warping
   */
  static createWarpedNoiseGraph(
    channel: TextureChannel,
    seed: number = 0,
    resolution: number = 512,
    scale: number = 5.0,
    warpStrength: number = 0.5
  ): TextureGraph {
    return {
      nodes: [
        {
          id: 'noise_base',
          category: 'noise',
          params: { scale, noiseType: 'perlin', detail: 5, roughness: 0.5 },
          inputs: [],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'warp_1',
          category: 'warp',
          params: { strength: warpStrength, warpScale: 4.0 },
          inputs: [{ name: 'source', type: 'float' }],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'filter_1',
          category: 'filter',
          params: { filterType: 'contrast', intensity: 1.2 },
          inputs: [{ name: 'source', type: 'float' }],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'output',
          category: 'output',
          params: {},
          inputs: [{ name: 'value', type: 'float' }],
          outputs: [],
        },
      ],
      links: [
        { fromNode: 'noise_base', fromSocket: 'value', toNode: 'warp_1', toSocket: 'source' },
        { fromNode: 'warp_1', fromSocket: 'value', toNode: 'filter_1', toSocket: 'source' },
        { fromNode: 'filter_1', fromSocket: 'value', toNode: 'output', toSocket: 'value' },
      ],
      resolution,
      seed,
      channel,
    };
  }

  /**
   * Create a blended material graph (two noise layers blended)
   */
  static createBlendedNoiseGraph(
    channel: TextureChannel,
    seed: number = 0,
    resolution: number = 512,
    scaleA: number = 5.0,
    scaleB: number = 15.0,
    blendFactor: number = 0.5
  ): TextureGraph {
    return {
      nodes: [
        {
          id: 'noise_a',
          category: 'noise',
          params: { scale: scaleA, noiseType: 'perlin', detail: 5 },
          inputs: [],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'noise_b',
          category: 'noise',
          params: { scale: scaleB, noiseType: 'voronoi', detail: 3 },
          inputs: [],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'blend',
          category: 'blend',
          params: { blendMode: 'mix', factor: blendFactor },
          inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'output',
          category: 'output',
          params: {},
          inputs: [{ name: 'value', type: 'float' }],
          outputs: [],
        },
      ],
      links: [
        { fromNode: 'noise_a', fromSocket: 'value', toNode: 'blend', toSocket: 'a' },
        { fromNode: 'noise_b', fromSocket: 'value', toNode: 'blend', toSocket: 'b' },
        { fromNode: 'blend', fromSocket: 'value', toNode: 'output', toSocket: 'value' },
      ],
      resolution,
      seed,
      channel,
    };
  }

  /**
   * Create a normal map graph from height data
   */
  static createNormalMapGraph(seed: number = 0, resolution: number = 512, scale: number = 5.0): TextureGraph {
    return {
      nodes: [
        {
          id: 'height_noise',
          category: 'noise',
          params: { scale, noiseType: 'perlin', detail: 5, roughness: 0.5 },
          inputs: [],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'warp',
          category: 'warp',
          params: { strength: 0.3, warpScale: 3.0 },
          inputs: [{ name: 'source', type: 'float' }],
          outputs: [{ name: 'value', type: 'float' }],
        },
        {
          id: 'output',
          category: 'output',
          params: {},
          inputs: [{ name: 'value', type: 'float' }],
          outputs: [],
        },
      ],
      links: [
        { fromNode: 'height_noise', fromSocket: 'value', toNode: 'warp', toSocket: 'source' },
        { fromNode: 'warp', fromSocket: 'value', toNode: 'output', toSocket: 'value' },
      ],
      resolution,
      seed,
      channel: 'normal',
    };
  }

  /**
   * Clear the texture cache
   */
  static clearCache(): void {
    graphCache.clear();
  }

  /**
   * Check if DOM is available for texture generation
   */
  static canExecute(): boolean {
    return isDOMAvailable();
  }
}
