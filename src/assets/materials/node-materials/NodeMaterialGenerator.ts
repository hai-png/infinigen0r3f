/**
 * NodeMaterialGenerator
 *
 * Bridges the node system (ShaderGraphBuilder + PrincipledNodes) to the
 * 13 material categories used throughout Infinigen.  Each category has a
 * node-graph template that describes how texture nodes feed into a
 * Principled BSDF.  The generator uses the node graph to determine
 * MeshPhysicalMaterial parameters, then delegates canvas-texture
 * generation to the existing procedural category generators.
 *
 * This is the **simplified** implementation described in the task:
 *   - Uses the node graph to determine material properties
 *   - Sets MeshPhysicalMaterial parameters based on node connections
 *   - Generates canvas textures via existing generators
 *   - Falls back to existing procedural generators for texture content
 */

import * as THREE from 'three';
import {
  Color, MeshPhysicalMaterial, MeshStandardMaterial, Material,
} from 'three';
import { ShaderGraphBuilder, BuiltShaderGraph } from '../../../core/nodes/core/ShaderGraphBuilder';
import { NodeTypes } from '../../../core/nodes/core/node-types';
import { WoodGenerator, WoodParams } from '../categories/Wood/WoodGenerator';
import { MetalGenerator, MetalParams } from '../categories/Metal/MetalGenerator';
import { StoneGenerator, StoneParams } from '../categories/Stone/StoneGenerator';
import { FabricGenerator, FabricParams } from '../categories/Fabric/FabricGenerator';
import { GlassGenerator, GlassParams } from '../categories/Glass/GlassGenerator';
import { CeramicGenerator, CeramicParams } from '../categories/Ceramic/CeramicGenerator';
import { LeatherGenerator, LeatherParams } from '../categories/Leather/LeatherGenerator';
import { PlasticGenerator, PlasticParams } from '../categories/Plastic/PlasticGenerator';
import { TileGenerator, TileParams } from '../categories/Tile/TileGenerator';
import { MaterialOutput } from '../BaseMaterialGenerator';

// ============================================================================
// Public types
// ============================================================================

/** All material categories supported by NodeMaterialGenerator */
export type MaterialCategory =
  | 'wood'
  | 'metal'
  | 'stone'
  | 'fabric'
  | 'glass'
  | 'ceramic'
  | 'leather'
  | 'plastic'
  | 'tile';

/** Parameters that the node graph template can produce */
export interface NodeMaterialParams {
  /** Category of material to generate */
  category: MaterialCategory;
  /** Sub-type within the category (e.g. 'oak', 'steel') */
  type?: string;
  /** Base color */
  color?: Color;
  /** Roughness 0-1 */
  roughness?: number;
  /** Metalness 0-1 */
  metalness?: number;
  /** Clearcoat 0-1 */
  clearcoat?: number;
  /** Clearcoat roughness */
  clearcoatRoughness?: number;
  /** Transmission 0-1 (glass, translucent plastic) */
  transmission?: number;
  /** Index of refraction */
  ior?: number;
  /** Sheen 0-1 (fabric) */
  sheen?: number;
  /** Sheen tint */
  sheenTint?: number;
  /** Emission color */
  emissionColor?: Color;
  /** Emission strength */
  emissionStrength?: number;
  /** Opacity */
  opacity?: number;
  /** Noise texture scale */
  noiseScale?: number;
  /** Noise detail (octaves) */
  noiseDetail?: number;
  /** Noise distortion */
  noiseDistortion?: number;
  /** Seed for reproducibility */
  seed?: number;
  /** Additional category-specific overrides */
  overrides?: Record<string, unknown>;
}

/** Result returned by the generator */
export interface NodeMaterialResult {
  material: Material;
  params: NodeMaterialParams;
  graph: BuiltShaderGraph;
}

// ============================================================================
// Node graph templates per category
// ============================================================================

/**
 * Describes the node-graph template for a material category.
 * The `build` function creates a ShaderGraphBuilder graph that represents
 * the logical texture→shader pipeline for that category.
 */
interface CategoryTemplate {
  /** Human-readable label */
  label: string;
  /** Whether this category uses MeshPhysicalMaterial (for clearcoat, transmission etc.) */
  needsPhysical: boolean;
  /** Default parameter overrides */
  defaults: Partial<NodeMaterialParams>;
  /** Build the node graph */
  buildGraph(builder: ShaderGraphBuilder, params: NodeMaterialParams): {
    bsdfNode: string;
    outputNode: string;
  };
  /** Resolve node graph into concrete MeshPhysicalMaterial settings */
  resolveMaterialSettings(params: NodeMaterialParams): Partial<PhysicalMatSettings>;
}

/** Settings that MeshPhysicalMaterial accepts */
interface PhysicalMatSettings {
  color: Color;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  sheen: number;
  sheenColor: Color;
  opacity: number;
  transparent: boolean;
  emissive: Color;
  emissiveIntensity: number;
  side: THREE.Side;
}

// ============================================================================
// Category templates
// ============================================================================

const TEMPLATES: Record<MaterialCategory, CategoryTemplate> = {
  // ─── WOOD ──────────────────────────────────────────────────────────
  wood: {
    label: 'Wood',
    needsPhysical: false,
    defaults: {
      color: new Color(0x8b6f47),
      roughness: 0.5,
      metalness: 0.0,
      noiseScale: 5.0,
      noiseDetail: 2.0,
    },
    buildGraph(builder, params) {
      // Noise Texture → ColorRamp → Principled BSDF (base_color, roughness)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 5, params.noiseScale ?? 5, params.noiseScale ?? 5,
      ]);
      const noise = builder.addNoiseTexture('Grain Noise', params.noiseScale ?? 5, params.noiseDetail ?? 2, 0.5, 0.0);
      const colorRamp = builder.addColorRamp('Wood Color Ramp', [
        { position: 0.0, color: [0.25, 0.15, 0.05, 1.0] },
        { position: 0.5, color: [0.55, 0.42, 0.25, 1.0] },
        { position: 1.0, color: [0.75, 0.58, 0.35, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Wood BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0x8b6f47),
        roughness: params.roughness ?? 0.5,
        metalness: 0.0,
      };
    },
  },

  // ─── METAL ─────────────────────────────────────────────────────────
  metal: {
    label: 'Metal',
    needsPhysical: false,
    defaults: {
      color: new Color(0x888888),
      roughness: 0.3,
      metalness: 1.0,
      noiseScale: 8.0,
      noiseDetail: 2.0,
    },
    buildGraph(builder, params) {
      // Noise Texture → ColorRamp → Principled BSDF (base_color, metalness=1, roughness)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 8, params.noiseScale ?? 8, params.noiseScale ?? 8,
      ]);
      const noise = builder.addNoiseTexture('Metal Noise', params.noiseScale ?? 8, params.noiseDetail ?? 2, 0.3, 0.0);
      const colorRamp = builder.addColorRamp('Metal Color Ramp', [
        { position: 0.0, color: [0.4, 0.4, 0.4, 1.0] },
        { position: 0.6, color: [0.7, 0.7, 0.7, 1.0] },
        { position: 1.0, color: [0.9, 0.9, 0.9, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Metal BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0x888888),
        roughness: params.roughness ?? 0.3,
        metalness: 1.0,
      };
    },
  },

  // ─── STONE ─────────────────────────────────────────────────────────
  stone: {
    label: 'Stone',
    needsPhysical: true,
    defaults: {
      color: new Color(0xf5f5f5),
      roughness: 0.4,
      metalness: 0.0,
      clearcoat: 0.0,
      noiseScale: 4.0,
      noiseDetail: 3.0,
      noiseDistortion: 0.5,
    },
    buildGraph(builder, params) {
      // Noise → Bump → Principled BSDF (base_color, roughness, clearcoat if polished)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 4, params.noiseScale ?? 4, params.noiseScale ?? 4,
      ]);
      const noise = builder.addNoiseTexture('Stone Noise', params.noiseScale ?? 4, params.noiseDetail ?? 3, 0.5, params.noiseDistortion ?? 0.5);
      const colorRamp = builder.addColorRamp('Stone Color Ramp', [
        { position: 0.0, color: [0.3, 0.3, 0.3, 1.0] },
        { position: 0.4, color: [0.7, 0.68, 0.65, 1.0] },
        { position: 1.0, color: [0.95, 0.93, 0.90, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Stone BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0xf5f5f5),
        roughness: params.roughness ?? 0.4,
        metalness: 0.0,
        clearcoat: params.clearcoat ?? 0.0,
        clearcoatRoughness: 0.1,
      };
    },
  },

  // ─── FABRIC ────────────────────────────────────────────────────────
  fabric: {
    label: 'Fabric',
    needsPhysical: true,
    defaults: {
      color: new Color(0x804020),
      roughness: 0.8,
      metalness: 0.0,
      sheen: 0.5,
      sheenTint: 0.5,
      noiseScale: 10.0,
      noiseDetail: 2.0,
    },
    buildGraph(builder, params) {
      // Noise → Principled BSDF (base_color, roughness, sheen)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 10, params.noiseScale ?? 10, params.noiseScale ?? 10,
      ]);
      const noise = builder.addNoiseTexture('Fabric Noise', params.noiseScale ?? 10, params.noiseDetail ?? 2, 0.6, 0.0);
      const colorRamp = builder.addColorRamp('Fabric Color Ramp', [
        { position: 0.0, color: [0.15, 0.08, 0.03, 1.0] },
        { position: 0.5, color: [0.55, 0.3, 0.15, 1.0] },
        { position: 1.0, color: [0.7, 0.45, 0.25, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Fabric BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0x804020),
        roughness: params.roughness ?? 0.8,
        metalness: 0.0,
        sheen: params.sheen ?? 0.5,
        sheenColor: new Color(1, 1, 1),
      };
    },
  },

  // ─── GLASS ─────────────────────────────────────────────────────────
  glass: {
    label: 'Glass',
    needsPhysical: true,
    defaults: {
      color: new Color(0xffffff),
      roughness: 0.0,
      metalness: 0.0,
      transmission: 1.0,
      ior: 1.45,
      opacity: 1.0,
    },
    buildGraph(builder, _params) {
      // Principled BSDF (transmission, IOR, roughness)
      const bsdf = builder.addPrincipledBSDF('Glass BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0xffffff),
        roughness: params.roughness ?? 0.0,
        metalness: 0.0,
        transmission: params.transmission ?? 1.0,
        ior: params.ior ?? 1.45,
        opacity: params.opacity ?? 1.0,
        transparent: true,
      };
    },
  },

  // ─── CERAMIC ───────────────────────────────────────────────────────
  ceramic: {
    label: 'Ceramic',
    needsPhysical: true,
    defaults: {
      color: new Color(0xf0f0f0),
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      noiseScale: 6.0,
      noiseDetail: 2.0,
    },
    buildGraph(builder, params) {
      // Noise → Principled BSDF (base_color, roughness, clearcoat)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 6, params.noiseScale ?? 6, params.noiseScale ?? 6,
      ]);
      const noise = builder.addNoiseTexture('Ceramic Noise', params.noiseScale ?? 6, params.noiseDetail ?? 2, 0.3, 0.0);
      const colorRamp = builder.addColorRamp('Ceramic Color Ramp', [
        { position: 0.0, color: [0.85, 0.82, 0.78, 1.0] },
        { position: 0.5, color: [0.92, 0.90, 0.87, 1.0] },
        { position: 1.0, color: [0.98, 0.97, 0.95, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Ceramic BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0xf0f0f0),
        roughness: params.roughness ?? 0.3,
        metalness: 0.0,
        clearcoat: params.clearcoat ?? 0.8,
        clearcoatRoughness: params.clearcoatRoughness ?? 0.1,
      };
    },
  },

  // ─── LEATHER ───────────────────────────────────────────────────────
  leather: {
    label: 'Leather',
    needsPhysical: true,
    defaults: {
      color: new Color(0x6b3a2a),
      roughness: 0.6,
      metalness: 0.0,
      clearcoat: 0.0,
      noiseScale: 8.0,
      noiseDetail: 3.0,
    },
    buildGraph(builder, params) {
      // Voronoi → ColorRamp → Principled BSDF (base_color, roughness, clearcoat for patent)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 8, params.noiseScale ?? 8, params.noiseScale ?? 8,
      ]);
      const voronoi = builder.addVoronoiTexture('Leather Voronoi', params.noiseScale ?? 8, 0.2, 1.0, 'euclidean', 'f1', params.seed ?? 0);
      const colorRamp = builder.addColorRamp('Leather Color Ramp', [
        { position: 0.0, color: [0.2, 0.1, 0.06, 1.0] },
        { position: 0.5, color: [0.42, 0.23, 0.16, 1.0] },
        { position: 1.0, color: [0.55, 0.35, 0.22, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Leather BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', voronoi.id, 'vector');
      builder.connect(voronoi.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0x6b3a2a),
        roughness: params.roughness ?? 0.6,
        metalness: 0.0,
        clearcoat: params.clearcoat ?? 0.0,
        clearcoatRoughness: 0.05,
      };
    },
  },

  // ─── PLASTIC ───────────────────────────────────────────────────────
  plastic: {
    label: 'Plastic',
    needsPhysical: true,
    defaults: {
      color: new Color(0xcc3333),
      roughness: 0.35,
      metalness: 0.0,
      transmission: 0.0,
      ior: 1.5,
      noiseScale: 12.0,
      noiseDetail: 1.0,
    },
    buildGraph(builder, params) {
      // Principled BSDF (base_color, roughness, transmission if translucent)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 12, params.noiseScale ?? 12, params.noiseScale ?? 12,
      ]);
      const noise = builder.addNoiseTexture('Plastic Noise', params.noiseScale ?? 12, params.noiseDetail ?? 1, 0.2, 0.0);
      const bsdf = builder.addPrincipledBSDF('Plastic BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', bsdf.id, 'roughness');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0xcc3333),
        roughness: params.roughness ?? 0.35,
        metalness: 0.0,
        transmission: params.transmission ?? 0.0,
        ior: params.ior ?? 1.5,
      };
    },
  },

  // ─── TILE ──────────────────────────────────────────────────────────
  tile: {
    label: 'Tile',
    needsPhysical: true,
    defaults: {
      color: new Color(0xd4c5a9),
      roughness: 0.4,
      metalness: 0.0,
      clearcoat: 0.3,
      noiseScale: 4.0,
      noiseDetail: 2.0,
    },
    buildGraph(builder, params) {
      // Noise → ColorRamp → Principled BSDF (base_color, roughness, clearcoat)
      const texCoord = builder.addTextureCoordinate('Texture Coordinate');
      const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [
        params.noiseScale ?? 4, params.noiseScale ?? 4, params.noiseScale ?? 4,
      ]);
      const noise = builder.addNoiseTexture('Tile Noise', params.noiseScale ?? 4, params.noiseDetail ?? 2, 0.4, 0.0);
      const colorRamp = builder.addColorRamp('Tile Color Ramp', [
        { position: 0.0, color: [0.6, 0.55, 0.45, 1.0] },
        { position: 0.5, color: [0.8, 0.75, 0.65, 1.0] },
        { position: 1.0, color: [0.92, 0.88, 0.80, 1.0] },
      ]);
      const bsdf = builder.addPrincipledBSDF('Tile BSDF');
      const output = builder.addMaterialOutput('Material Output');

      builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
      builder.connect(mapping.id, 'vector', noise.id, 'vector');
      builder.connect(noise.id, 'float', colorRamp.id, 'fac');
      builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
      builder.connect(bsdf.id, 'bsdf', output.id, 'surface');

      return { bsdfNode: bsdf.id, outputNode: output.id };
    },
    resolveMaterialSettings(params) {
      return {
        color: params.color ?? new Color(0xd4c5a9),
        roughness: params.roughness ?? 0.4,
        metalness: 0.0,
        clearcoat: params.clearcoat ?? 0.3,
        clearcoatRoughness: 0.1,
      };
    },
  },
};

// ============================================================================
// NodeMaterialGenerator class
// ============================================================================

export class NodeMaterialGenerator {
  private categoryGenerators: Record<string, any> = {};

  constructor() {
    // Lazy-init category generators for texture generation
    this.categoryGenerators = {
      wood: new WoodGenerator(),
      metal: new MetalGenerator(),
      stone: new StoneGenerator(),
      fabric: new FabricGenerator(),
      glass: new GlassGenerator(),
      ceramic: new CeramicGenerator(),
      leather: new LeatherGenerator(),
      plastic: new PlasticGenerator(),
      tile: new TileGenerator(),
    };
  }

  /**
   * Generate a material from a category and optional parameters.
   *
   * 1. Build the node graph for the category template
   * 2. Resolve material settings from the graph
   * 3. Delegate canvas-texture generation to the existing category generator
   * 4. Return the assembled material
   */
  generate(params: NodeMaterialParams): NodeMaterialResult {
    const template = TEMPLATES[params.category];
    if (!template) {
      throw new Error(`Unknown material category: ${params.category}. Supported: ${Object.keys(TEMPLATES).join(', ')}`);
    }

    // Merge with defaults
    const merged: NodeMaterialParams = {
      ...template.defaults,
      ...params,
      overrides: { ...template.defaults.overrides, ...params.overrides },
    };

    // Step 1: Build the node graph
    const builder = new ShaderGraphBuilder();
    const { bsdfNode, outputNode } = template.buildGraph(builder, merged);

    // Set BSDF parameters on the node
    const bsdfGraphNode = builder['nodes'].get(bsdfNode);
    if (bsdfGraphNode) {
      if (merged.roughness !== undefined) bsdfGraphNode.settings.roughness = merged.roughness;
      if (merged.metalness !== undefined) bsdfGraphNode.settings.metallic = merged.metalness;
      if (merged.clearcoat !== undefined) bsdfGraphNode.settings.clearcoat = merged.clearcoat;
      if (merged.clearcoatRoughness !== undefined) bsdfGraphNode.settings.clearcoatRoughness = merged.clearcoatRoughness;
      if (merged.transmission !== undefined) bsdfGraphNode.settings.transmission = merged.transmission;
      if (merged.ior !== undefined) bsdfGraphNode.settings.ior = merged.ior;
      if (merged.sheen !== undefined) bsdfGraphNode.settings.sheen = merged.sheen;
      if (merged.sheenTint !== undefined) bsdfGraphNode.settings.sheenTint = merged.sheenTint;
      if (merged.emissionStrength !== undefined) bsdfGraphNode.settings.emissionStrength = merged.emissionStrength;
    }

    const graph = builder.build();

    // Step 2: Resolve material settings from the graph
    const settings = template.resolveMaterialSettings(merged);

    // Step 3: Delegate texture generation to existing category generators
    const material = this.createMaterialWithTextures(merged, settings, template.needsPhysical);

    return { material, params: merged, graph };
  }

  /**
   * Get a list of all available categories.
   */
  getCategories(): MaterialCategory[] {
    return Object.keys(TEMPLATES) as MaterialCategory[];
  }

  /**
   * Get the template defaults for a category.
   */
  getDefaults(category: MaterialCategory): Partial<NodeMaterialParams> {
    return TEMPLATES[category]?.defaults ?? {};
  }

  // ======================================================================
  // Private helpers
  // ======================================================================

  /**
   * Create the actual Three.js material, delegating texture generation
   * to the existing category generators for canvas-based procedural
   * textures, then overlaying the node-graph-determined settings.
   */
  private createMaterialWithTextures(
    params: NodeMaterialParams,
    settings: Partial<PhysicalMatSettings>,
    needsPhysical: boolean,
  ): Material {
    const generator = this.categoryGenerators[params.category];
    let materialOutput: MaterialOutput | null = null;

    // Try to use the existing category generator for textures
    if (generator) {
      try {
        const categoryParams = this.buildCategoryParams(params);
        materialOutput = generator.generate(categoryParams, params.seed);
      } catch (e) {
        console.warn(`Category generator for ${params.category} failed, using fallback:`, e);
      }
    }

    if (materialOutput) {
      const mat = materialOutput.material;

      // Overlay node-graph-determined settings on top
      if (settings.roughness !== undefined && 'roughness' in mat) {
        (mat as any).roughness = settings.roughness;
      }
      if (settings.metalness !== undefined && 'metalness' in mat) {
        (mat as any).metalness = settings.metalness;
      }
      if (settings.clearcoat !== undefined && 'clearcoat' in mat) {
        (mat as any).clearcoat = settings.clearcoat;
      }
      if (settings.clearcoatRoughness !== undefined && 'clearcoatRoughness' in mat) {
        (mat as any).clearcoatRoughness = settings.clearcoatRoughness;
      }
      if (settings.transmission !== undefined && 'transmission' in mat) {
        (mat as any).transmission = settings.transmission;
      }
      if (settings.ior !== undefined && 'ior' in mat) {
        (mat as any).ior = settings.ior;
      }
      if (settings.sheen !== undefined && 'sheen' in mat) {
        (mat as any).sheen = settings.sheen;
      }
      if (settings.sheenColor !== undefined && 'sheenColor' in mat) {
        (mat as any).sheenColor = settings.sheenColor;
      }

      return mat;
    }

    // Fallback: create a MeshPhysicalMaterial directly from settings
    const phys = new MeshPhysicalMaterial({
      color: settings.color ?? new Color(0x888888),
      roughness: settings.roughness ?? 0.5,
      metalness: settings.metalness ?? 0.0,
      clearcoat: settings.clearcoat ?? 0.0,
      clearcoatRoughness: settings.clearcoatRoughness ?? 0.03,
      transmission: settings.transmission ?? 0.0,
      ior: settings.ior ?? 1.5,
      sheen: settings.sheen ?? 0.0,
      sheenColor: settings.sheenColor ?? new Color(1, 1, 1),
      emissive: settings.emissive ?? new Color(0, 0, 0),
      emissiveIntensity: settings.emissiveIntensity ?? 0.0,
      opacity: settings.opacity ?? 1.0,
      transparent: settings.transparent ?? false,
      side: settings.side ?? THREE.FrontSide,
    });

    return phys;
  }

  /**
   * Convert NodeMaterialParams to the format expected by the
   * existing category generator's generate() method.
   */
  private buildCategoryParams(params: NodeMaterialParams): Record<string, unknown> {
    const base: Record<string, unknown> = {};

    if (params.type) base.type = params.type;
    if (params.color) base.color = params.color;
    if (params.roughness !== undefined) base.roughness = params.roughness;

    // Category-specific parameter mapping
    switch (params.category) {
      case 'wood':
        base.grainIntensity = params.noiseScale ? params.noiseScale / 10 : 0.6;
        base.grainScale = params.noiseScale ?? 1.0;
        base.knotDensity = 0.3;
        base.finishType = 'satin';
        break;
      case 'metal':
        base.metalness = params.metalness ?? 1.0;
        base.oxidation = 0.0;
        base.brushed = false;
        base.brushedDirection = 0;
        break;
      case 'stone':
        base.veinIntensity = 0.5;
        base.veinScale = params.noiseScale ?? 1.0;
        base.polishLevel = params.clearcoat ?? 0.5;
        base.veinColor = new Color(0x888888);
        break;
      case 'fabric':
        // FabricParams has its own type
        break;
      case 'glass':
        // GlassParams has its own type
        break;
      case 'ceramic':
        // CeramicParams has its own type
        break;
      case 'leather':
        // LeatherParams has its own type
        break;
      case 'plastic':
        // PlasticParams has its own type
        break;
      case 'tile':
        // TileParams has its own type
        break;
    }

    // Merge any extra overrides
    if (params.overrides) {
      Object.assign(base, params.overrides);
    }

    return base;
  }
}

// ============================================================================
// Convenience functions
// ============================================================================

/**
 * Quick one-shot material generation from a category name.
 */
export function generateNodeMaterial(
  category: MaterialCategory,
  overrides?: Partial<NodeMaterialParams>,
): NodeMaterialResult {
  const gen = new NodeMaterialGenerator();
  return gen.generate({ category, ...overrides });
}

/**
 * Generate a material and return just the Three.js Material object.
 */
export function generateMaterial(
  category: MaterialCategory,
  overrides?: Partial<NodeMaterialParams>,
): Material {
  return generateNodeMaterial(category, overrides).material;
}

export default NodeMaterialGenerator;
