/**
 * Plastic Material Generator - Matte, glossy, textured, translucent, metallic
 * Uses MeshPhysicalMaterial for translucent/metallic types that require
 * transmission, IOR, thickness, or high metalness properties.
 */
import {
  Color, Texture, CanvasTexture,
  MeshStandardMaterial, MeshPhysicalMaterial, Material, DoubleSide,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D } from '../../../../core/util/math/noise';

export interface PlasticParams {
  [key: string]: unknown;
  type: 'matte' | 'glossy' | 'textured' | 'translucent' | 'metallic';
  color: Color;
  roughness: number;
  metalness: number;
  transmission: number;
  ior: number;
  thickness: number;
  textureScale: number;
}

/** Type presets for common plastic appearances */
const PLASTIC_PRESETS: Record<string, Partial<PlasticParams>> = {
  matte_white:    { type: 'matte',      color: new Color(0xf0f0f0), roughness: 0.6,  metalness: 0.0, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  glossy_black:   { type: 'glossy',     color: new Color(0x111111), roughness: 0.08, metalness: 0.0, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  glossy_red:     { type: 'glossy',     color: new Color(0xcc0000), roughness: 0.1,  metalness: 0.0, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  translucent_white: { type: 'translucent', color: new Color(0xffffff), roughness: 0.15, metalness: 0.0, transmission: 0.6, ior: 1.46, thickness: 0.5 },
  acrylic_clear:  { type: 'translucent', color: new Color(0xffffff), roughness: 0.05, metalness: 0.0, transmission: 0.95, ior: 1.49, thickness: 1.0 },
  abs_black:      { type: 'matte',      color: new Color(0x1a1a1a), roughness: 0.5,  metalness: 0.0, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  chrome_plastic: { type: 'metallic',   color: new Color(0xdddddd), roughness: 0.15, metalness: 0.85, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  metallic_red:   { type: 'metallic',   color: new Color(0xaa2222), roughness: 0.2,  metalness: 0.6,  transmission: 0.0, ior: 1.5,  thickness: 0.0 },
  textured_gray:  { type: 'textured',   color: new Color(0x888888), roughness: 0.55, metalness: 0.0, transmission: 0.0, ior: 1.5,  thickness: 0.0 },
};

export class PlasticGenerator extends BaseMaterialGenerator<PlasticParams> {
  private static readonly DEFAULT_PARAMS: PlasticParams = {
    type: 'matte',
    color: new Color(0xffffff),
    roughness: 0.5,
    metalness: 0.0,
    transmission: 0.0,
    ior: 1.5,
    thickness: 0.0,
    textureScale: 1.0,
  };

  constructor() { super(); }
  getDefaultParams(): PlasticParams { return { ...PlasticGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<PlasticParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(PlasticGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    // Decide whether we need MeshPhysicalMaterial
    const needsPhysical =
      finalParams.type === 'translucent' ||
      finalParams.type === 'metallic' ||
      finalParams.transmission > 0;

    let material: Material;
    let map: Texture | null = null;
    let normalMap: Texture | null = null;
    let roughnessMap: Texture | null = null;

    if (needsPhysical) {
      const phys = new MeshPhysicalMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness,
        metalness: finalParams.metalness,
        side: DoubleSide,
      });

      if (finalParams.type === 'translucent' || finalParams.transmission > 0) {
        phys.transmission = finalParams.transmission > 0 ? finalParams.transmission : 0.6;
        phys.ior = finalParams.ior || 1.46;
        phys.thickness = finalParams.thickness || 0.5;
        phys.transparent = true;
        phys.opacity = 1.0; // transmission handles transparency
      }

      if (finalParams.type === 'metallic') {
        phys.metalness = Math.max(finalParams.metalness, 0.6);
        phys.roughness = Math.min(finalParams.roughness, 0.35);
        // Metallic sheen — slightly colored clearcoat
        phys.clearcoat = 0.3;
        phys.clearcoatRoughness = 0.1;
      }

      if (finalParams.type === 'textured') {
        map = this.generateTexture(finalParams, rng);
        normalMap = this.generateNormalMap(finalParams, rng);
        phys.map = map;
        phys.normalMap = normalMap;
      }

      material = phys;
    } else {
      // MeshStandardMaterial for opaque matte / glossy / textured
      const std = new MeshStandardMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness,
        metalness: finalParams.metalness,
      });

      if (finalParams.type === 'glossy') {
        std.roughness = 0.1;
      } else if (finalParams.type === 'matte') {
        std.roughness = 0.6;
      } else if (finalParams.type === 'textured') {
        map = this.generateTexture(finalParams, rng);
        normalMap = this.generateNormalMap(finalParams, rng);
        roughnessMap = this.generateRoughnessMap(finalParams, rng);
        std.map = map;
        std.normalMap = normalMap;
        std.roughnessMap = roughnessMap;
      }

      material = std;
    }

    return {
      material,
      maps: { map, roughnessMap, normalMap },
      params: finalParams,
    };
  }

  // ---------------------------------------------------------------------------
  // Texture generation
  // ---------------------------------------------------------------------------

  private generateTexture(params: PlasticParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Base color fill
    ctx.fillStyle = `#${params.color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n = noise.perlin(x / (50 * params.textureScale), y / (50 * params.textureScale), 0) * 20;
        data[idx]     = Math.max(0, Math.min(255, data[idx]     + n));
        data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + n));
        data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + n));
      }
    }

    // Injection molding flow lines for textured plastic
    if (params.type === 'textured') {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const flowLine = Math.sin(y * 0.3 + noise.perlin(x / 200, y / 200, 0) * 8) * 8;
          data[idx]     = Math.max(0, Math.min(255, data[idx]     + flowLine));
          data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + flowLine));
          data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + flowLine));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  private generateNormalMap(params: PlasticParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 100);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Compute normal from noise gradient
        const scale = 40 * params.textureScale;
        const n  = noise.perlin(x / scale, y / scale, 0);
        const nx = noise.perlin((x + 1) / scale, y / scale, 0) - n;
        const ny = noise.perlin(x / scale, (y + 1) / scale, 0) - n;
        const strength = 2.0;
        // Encode normal: map [-1,1] to [0,255]
        data[idx]     = Math.max(0, Math.min(255, 128 + nx * strength * 128));
        data[idx + 1] = Math.max(0, Math.min(255, 128 + ny * strength * 128));
        data[idx + 2] = 255; // Z points up
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  private generateRoughnessMap(params: PlasticParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 200);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const baseRoughness = Math.floor(params.roughness * 255);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n = noise.perlin(x / 30, y / 30, 0) * 20;
        const v = Math.max(0, Math.min(255, baseRoughness + n));
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // ---------------------------------------------------------------------------
  // Variations & presets
  // ---------------------------------------------------------------------------

  getVariations(count: number): PlasticParams[] {
    const variations: PlasticParams[] = [];
    const types: PlasticParams['type'][] = ['matte', 'glossy', 'textured', 'translucent', 'metallic'];
    for (let i = 0; i < count; i++) {
      const t = types[this.rng.nextInt(0, types.length - 1)];
      variations.push({
        type: t,
        color: new Color().setHSL(this.rng.nextFloat(), 0.6, 0.5),
        roughness: t === 'glossy' ? 0.08 : t === 'translucent' ? 0.15 : 0.2 + this.rng.nextFloat() * 0.5,
        metalness: t === 'metallic' ? 0.6 + this.rng.nextFloat() * 0.3 : this.rng.nextFloat() * 0.1,
        transmission: t === 'translucent' ? 0.4 + this.rng.nextFloat() * 0.5 : 0,
        ior: t === 'translucent' ? 1.4 + this.rng.nextFloat() * 0.2 : 1.5,
        thickness: t === 'translucent' ? 0.2 + this.rng.nextFloat() * 0.8 : 0,
        textureScale: 0.5 + this.rng.nextFloat() * 1.5,
      });
    }
    return variations;
  }

  /** Get a preset by name */
  static getPreset(name: string): Partial<PlasticParams> | undefined {
    return PLASTIC_PRESETS[name];
  }

  /** List all available preset names */
  static listPresets(): string[] {
    return Object.keys(PLASTIC_PRESETS);
  }
}
