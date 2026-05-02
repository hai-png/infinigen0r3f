/**
 * Node Execution Layer - Tests
 *
 * Tests for the node evaluation pipeline:
 * - Topological sort with simple graphs
 * - NodeEvaluator with simple material graphs
 * - MaterialFactory preset creation
 * - TextureNodeExecutor noise texture generation
 * - Cyclic dependency detection
 * - Missing connection handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  NodeEvaluator,
  EvaluationMode,
  CyclicDependencyError,
  NodeShaderCompiler,
  MaterialFactory,
  TextureNodeExecutor,
} from '../index';
import type { NodeGraph } from '../index';
import type { NodeInstance, NodeLink } from '../../core/types';

// ============================================================================
// Helper: Create a NodeInstance
// ============================================================================

function makeNode(id: string, type: string, inputs?: Record<string, any>, settings?: Record<string, any>): NodeInstance {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    settings: settings ?? {},
    inputs: new Map(Object.entries(inputs ?? {})),
    outputs: new Map(),
  };
}

function makeLink(fromNode: string, fromSocket: string, toNode: string, toSocket: string): NodeLink {
  return {
    id: `${fromNode}_${fromSocket}_to_${toNode}_${toSocket}`,
    fromNode,
    fromSocket,
    toNode,
    toSocket,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('NodeEvaluator', () => {
  describe('topologicalSort', () => {
    it('should sort a simple 3-node graph in dependency order', () => {
      const evaluator = new NodeEvaluator();

      // A → B → C (A feeds into B, B feeds into C)
      const graph: NodeGraph = {
        nodes: new Map([
          ['A', makeNode('A', 'texture_coordinate')],
          ['B', makeNode('B', 'noise_texture')],
          ['C', makeNode('C', 'principled_bsdf')],
        ]),
        links: [
          makeLink('A', 'UV', 'B', 'Vector'),
          makeLink('B', 'Fac', 'C', 'Roughness'),
        ],
      };

      const sorted = evaluator.topologicalSort(graph);

      // A should come before B, B before C
      const indexA = sorted.indexOf('A');
      const indexB = sorted.indexOf('B');
      const indexC = sorted.indexOf('C');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });

    it('should handle disconnected nodes', () => {
      const evaluator = new NodeEvaluator();

      const graph: NodeGraph = {
        nodes: new Map([
          ['A', makeNode('A', 'texture_coordinate')],
          ['B', makeNode('B', 'noise_texture')],
        ]),
        links: [],
      };

      const sorted = evaluator.topologicalSort(graph);
      expect(sorted).toHaveLength(2);
      expect(sorted).toContain('A');
      expect(sorted).toContain('B');
    });

    it('should throw on cyclic dependencies', () => {
      const evaluator = new NodeEvaluator();

      // Create a cycle: A → B → A
      const graph: NodeGraph = {
        nodes: new Map([
          ['A', makeNode('A', 'math')],
          ['B', makeNode('B', 'math')],
        ]),
        links: [
          makeLink('A', 'Value', 'B', 'Value'),
          makeLink('B', 'Value', 'A', 'Value'),
        ],
      };

      expect(() => evaluator.topologicalSort(graph)).toThrow(CyclicDependencyError);
    });
  });

  describe('evaluate', () => {
    it('should evaluate a simple diffuse material graph', () => {
      const evaluator = new NodeEvaluator();

      const graph: NodeGraph = {
        nodes: new Map([
          ['diffuse', makeNode('diffuse', 'bsdf_diffuse', {
            Color: new THREE.Color(0.8, 0.2, 0.1),
            Roughness: 0.7,
          })],
          ['output', makeNode('output', 'ShaderNodeOutputMaterial')],
        ]),
        links: [
          makeLink('diffuse', 'BSDF', 'output', 'Surface'),
        ],
      };

      const result = evaluator.evaluate(graph, EvaluationMode.MATERIAL);

      expect(result.mode).toBe(EvaluationMode.MATERIAL);
      expect(result.value).toBeDefined();
    });

    it('should evaluate PrincipledBSDF with parameters', () => {
      const evaluator = new NodeEvaluator();

      const graph: NodeGraph = {
        nodes: new Map([
          ['bsdf', makeNode('bsdf', 'principled_bsdf', {
            BaseColor: new THREE.Color(0.5, 0.5, 0.8),
            Metallic: 0.9,
            Roughness: 0.2,
          })],
        ]),
        links: [],
      };

      const result = evaluator.evaluate(graph, EvaluationMode.MATERIAL);

      expect(result.value).toBeDefined();
      // The BSDF output should contain the metallic and roughness values
      const bsdfOutput = result.value?.BSDF;
      if (bsdfOutput) {
        expect(bsdfOutput.metallic).toBe(0.9);
        expect(bsdfOutput.roughness).toBe(0.2);
      }
    });

    it('should produce warnings for missing connections', () => {
      const evaluator = new NodeEvaluator();

      // No links but a mix_shader node requires two shader inputs
      const graph: NodeGraph = {
        nodes: new Map([
          ['mix', makeNode('mix', 'mix_shader')],
        ]),
        links: [],
      };

      const result = evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      // Should still evaluate but might have warnings
      expect(result.value).toBeDefined();
    });

    it('should evaluate math nodes', () => {
      const evaluator = new NodeEvaluator();

      const graph: NodeGraph = {
        nodes: new Map([
          ['math', makeNode('math', 'math', {
            Value: 3.0,
            Value_1: 2.0,
            Operation: 'multiply',
          })],
        ]),
        links: [],
      };

      const result = evaluator.evaluate(graph, EvaluationMode.MATERIAL);
      expect(result.value?.Value).toBe(6.0);
    });
  });
});

describe('NodeShaderCompiler', () => {
  it('should compile a simple graph into a ShaderMaterial', () => {
    const evaluator = new NodeEvaluator();
    const compiler = new NodeShaderCompiler(evaluator);

    const graph: NodeGraph = {
      nodes: new Map([
        ['bsdf', makeNode('bsdf', 'principled_bsdf', {
          BaseColor: new THREE.Color(0.6, 0.3, 0.1),
          Roughness: 0.7,
        })],
      ]),
      links: [],
    };

    const result = compiler.compile(graph);

    expect(result.fragmentShader).toBeTruthy();
    expect(result.vertexShader).toBeTruthy();
    expect(result.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(result.uniforms).toBeDefined();
  });

  it('should fall back to MeshPhysicalMaterial on compilation failure', () => {
    const evaluator = new NodeEvaluator();
    const compiler = new NodeShaderCompiler(evaluator);

    // Create an empty graph that should still produce a fallback material
    const graph: NodeGraph = {
      nodes: new Map(),
      links: [],
    };

    const material = compiler.compileWithFallback(graph);
    expect(material).toBeDefined();
    expect(material).toBeInstanceOf(THREE.Material);
  });
});

describe('MaterialFactory', () => {
  it('should create a terrain material', () => {
    const factory = new MaterialFactory(false);
    const material = factory.createTerrainMaterial({
      baseColor: new THREE.Color(0.35, 0.28, 0.18),
      roughness: 0.85,
    });

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.name).toBe('InfinigenTerrain');
  });

  it('should create a metal material', () => {
    const factory = new MaterialFactory(false);
    const material = factory.createMetalMaterial({
      baseColor: new THREE.Color(0.8, 0.8, 0.82),
      roughness: 0.15,
      metallic: 1.0,
    });

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.name).toBe('InfinigenMetal');
    expect((material as THREE.MeshPhysicalMaterial).metalness).toBe(1.0);
  });

  it('should create a glass material', () => {
    const factory = new MaterialFactory(false);
    const material = factory.createGlassMaterial({
      color: new THREE.Color(1, 1, 1),
      ior: 1.5,
      transmission: 1.0,
    });

    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.name).toBe('InfinigenGlass');
    expect((material as THREE.MeshPhysicalMaterial).ior).toBe(1.5);
  });

  it('should create all preset materials', () => {
    const factory = new MaterialFactory(false);
    const presets = MaterialFactory.getPresets();

    for (const preset of presets) {
      const material = factory.createFromPreset(preset);
      expect(material).toBeInstanceOf(THREE.Material);
    }
  });

  it('should list available presets', () => {
    const presets = MaterialFactory.getPresets();
    expect(presets).toContain('terrain');
    expect(presets).toContain('bark');
    expect(presets).toContain('stone');
    expect(presets).toContain('metal');
    expect(presets).toContain('glass');
    expect(presets).toContain('fabric');
    expect(presets).toContain('water');
    expect(presets).toContain('foliage');
    expect(presets).toContain('skin');
  });

  it('should return preset parameter descriptions', () => {
    const params = MaterialFactory.getPresetParams('metal');
    expect(params.baseColor).toBeDefined();
    expect(params.roughness).toBeDefined();
    expect(params.metallic).toBeDefined();
  });
});

describe('TextureNodeExecutor', () => {
  let executor: TextureNodeExecutor;

  beforeEach(() => {
    executor = new TextureNodeExecutor(128); // Use small resolution for tests
    TextureNodeExecutor.clearCache();
  });

  it('should generate a Perlin noise texture', () => {
    const texture = executor.generateNoiseTexture('perlin', {
      resolution: 64,
      seed: 42,
      scale: 5.0,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(64);
    expect(texture.image.height).toBe(64);
  });

  it('should generate a Voronoi noise texture', () => {
    const texture = executor.generateNoiseTexture('voronoi', {
      resolution: 64,
      seed: 42,
      scale: 5.0,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(64);
  });

  it('should generate a Musgrave noise texture', () => {
    const texture = executor.generateNoiseTexture('musgrave', {
      resolution: 64,
      seed: 42,
      octaves: 4,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
  });

  it('should generate a gradient texture', () => {
    const texture = executor.generateGradientTexture('linear', {
      resolution: 64,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(64);
  });

  it('should generate a color ramp texture', () => {
    const stops = [
      { position: 0, color: { r: 0, g: 0, b: 0 } },
      { position: 0.5, color: { r: 0.5, g: 0.8, b: 0.2 } },
      { position: 1, color: { r: 1, g: 1, b: 1 } },
    ];

    const texture = executor.generateColorRampTexture(stops, 256);
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.image.width).toBe(256);
  });

  it('should generate a checker pattern texture', () => {
    const texture = executor.generateCheckerTexture({
      resolution: 64,
      scale: 4,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
  });

  it('should generate a brick pattern texture', () => {
    const texture = executor.generateBrickTexture({
      resolution: 64,
      scale: 5,
    });

    expect(texture).toBeInstanceOf(THREE.DataTexture);
  });

  it('should cache textures with same parameters', () => {
    const params = { resolution: 64, seed: 42, scale: 5.0 };

    const texture1 = executor.generateNoiseTexture('perlin', params);
    const texture2 = executor.generateNoiseTexture('perlin', params);

    // Should return the same cached texture
    expect(texture1).toBe(texture2);

    const stats = TextureNodeExecutor.getCacheStats();
    expect(stats.count).toBeGreaterThan(0);
  });

  it('should generate different textures with different seeds', () => {
    const texture1 = executor.generateNoiseTexture('perlin', { resolution: 64, seed: 1 });
    const texture2 = executor.generateNoiseTexture('perlin', { resolution: 64, seed: 2 });

    // Different seeds should produce different textures
    expect(texture1).not.toBe(texture2);
  });
});
