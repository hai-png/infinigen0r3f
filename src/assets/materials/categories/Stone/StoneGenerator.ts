/**
 * Stone Material Generator - Marble, granite, limestone, slate, concrete, travertine
 * Uses MeshPhysicalMaterial when clearcoat (polish) is needed.
 * All stone types now produce proper textures with surface detail.
 */
import {
  Color, Texture, CanvasTexture, Material,
  MeshStandardMaterial, MeshPhysicalMaterial,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D, fbm } from '../../../../core/util/math/noise';

export interface StoneParams {
  [key: string]: unknown;
  type: 'marble' | 'granite' | 'limestone' | 'slate' | 'concrete' | 'travertine';
  color: Color;
  veinColor: Color;
  roughness: number;
  veinIntensity: number;
  veinScale: number;
  polishLevel: number;
}

/** Type presets for common stone appearances */
const STONE_PRESETS: Record<string, Partial<StoneParams>> = {
  white_marble:   { type: 'marble',     color: new Color(0xf5f5f5), veinColor: new Color(0x888888), roughness: 0.15, veinIntensity: 0.5, polishLevel: 0.9 },
  dark_marble:    { type: 'marble',     color: new Color(0x444444), veinColor: new Color(0xdddddd), roughness: 0.2,  veinIntensity: 0.6, polishLevel: 0.85 },
  granite_black:  { type: 'granite',    color: new Color(0x222222), veinColor: new Color(0x555555), roughness: 0.3,  veinIntensity: 0.3, polishLevel: 0.7 },
  granite_gray:   { type: 'granite',    color: new Color(0x888888), veinColor: new Color(0xaaaaaa), roughness: 0.35, veinIntensity: 0.2, polishLevel: 0.6 },
  limestone_beige: { type: 'limestone', color: new Color(0xd4c5a9), veinColor: new Color(0xbba98c), roughness: 0.7,  veinIntensity: 0.3, polishLevel: 0.2 },
  slate_dark:     { type: 'slate',      color: new Color(0x3a3a4a), veinColor: new Color(0x2a2a3a), roughness: 0.6,  veinIntensity: 0.2, polishLevel: 0.3 },
  concrete_smooth: { type: 'concrete',  color: new Color(0xaaaaaa), veinColor: new Color(0x999999), roughness: 0.8,  veinIntensity: 0.1, polishLevel: 0.1 },
  travertine_cream: { type: 'travertine', color: new Color(0xe8dcc8), veinColor: new Color(0xc4b498), roughness: 0.65, veinIntensity: 0.3, polishLevel: 0.3 },
};

export class StoneGenerator extends BaseMaterialGenerator<StoneParams> {
  private static readonly DEFAULT_PARAMS: StoneParams = {
    type: 'marble',
    color: new Color(0xf5f5f5),
    veinColor: new Color(0x888888),
    roughness: 0.4,
    veinIntensity: 0.5,
    veinScale: 1.0,
    polishLevel: 0.5,
  };

  constructor() { super(); }
  getDefaultParams(): StoneParams { return { ...StoneGenerator.DEFAULT_PARAMS }; }

  generate(params: Partial<StoneParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(StoneGenerator.DEFAULT_PARAMS, params);
    const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;

    // Decide whether we need MeshPhysicalMaterial (for clearcoat on polished stone)
    const needsPhysical = finalParams.polishLevel > 0.7;

    let material: Material;
    let map: Texture | null = null;
    let normalMap: Texture | null = null;
    let roughnessMap: Texture | null = null;

    // Generate color texture based on stone type
    map = this.generateColorTexture(finalParams, rng);
    // Generate proper normal map with surface detail
    normalMap = this.generateNormalMap(finalParams, rng);
    // Generate roughness map
    roughnessMap = this.generateRoughnessMap(finalParams, rng);

    if (needsPhysical) {
      const phys = new MeshPhysicalMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness * 0.5,
        metalness: 0.0,
        map,
        normalMap,
        roughnessMap,
      });
      // Clearcoat for polished stone
      phys.clearcoat = finalParams.polishLevel;
      phys.clearcoatRoughness = 0.1;
      material = phys;
    } else {
      const std = new MeshStandardMaterial({
        color: finalParams.color,
        roughness: finalParams.roughness,
        metalness: 0.0,
        map,
        normalMap,
        roughnessMap,
      });
      material = std;
    }

    return { material, maps: { map, roughnessMap, normalMap }, params: finalParams };
  }

  // ---------------------------------------------------------------------------
  // Color texture generation per stone type
  // ---------------------------------------------------------------------------

  private generateColorTexture(params: StoneParams, rng: SeededRandom): Texture {
    switch (params.type) {
      case 'marble':     return this.generateMarbleTexture(params, rng);
      case 'granite':    return this.generateGraniteTexture(params, rng);
      case 'limestone':  return this.generateLimestoneTexture(params, rng);
      case 'slate':      return this.generateSlateTexture(params, rng);
      case 'concrete':   return this.generateConcreteTexture(params, rng);
      case 'travertine': return this.generateTravertineTexture(params, rng);
      default:           return this.generateMarbleTexture(params, rng);
    }
  }

  private generateMarbleTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const veinR = params.veinColor.r * 255;
    const veinG = params.veinColor.g * 255;
    const veinB = params.veinColor.b * 255;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size;
        const v = y / size;

        // Turbulent vein pattern using fbm
        const turb = fbm(u * 4 * params.veinScale, v * 4 * params.veinScale, 0, 6, 2.0, 0.5, 1.0);
        const veinFactor = Math.abs(turb);
        const veinMask = Math.max(0, (veinFactor - 0.3) / 0.7) * params.veinIntensity;

        data[idx]     = Math.max(0, Math.min(255, baseR * (1 - veinMask) + veinR * veinMask));
        data[idx + 1] = Math.max(0, Math.min(255, baseG * (1 - veinMask) + veinG * veinMask));
        data[idx + 2] = Math.max(0, Math.min(255, baseB * (1 - veinMask) + veinB * veinMask));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  private generateGraniteTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Crystal speckle pattern — use high-frequency noise for granular appearance
        const n1 = noise.perlin(x / 20, y / 20, 0) * 35;
        const n2 = noise.perlin(x / 8, y / 8, 1) * 15;
        const n3 = noise.perlin(x / 3, y / 3, 2) * 8;

        // Mica flecks — random bright spots
        const mica = noise.perlin(x / 50, y / 50, 3);
        const micaFactor = mica > 0.7 ? (mica - 0.7) * 100 : 0;

        data[idx]     = Math.max(0, Math.min(255, baseR + n1 + n2 + n3 + micaFactor));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + n1 + n2 + n3 + micaFactor * 0.8));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + n1 + n2 + n3 + micaFactor * 0.6));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  /** Limestone: sedimentary layers + fossil spots */
  private generateLimestoneTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;

    // Sedimentary layer boundaries (wavy horizontal lines)
    const layerPeriod = 60 + rng.nextFloat(0, 40);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Base noise
        const n = noise.perlin(x / 80, y / 80, 0) * 15;

        // Sedimentary layer modulation
        const layerWarp = noise.perlin(x / 200, y / 200, 1) * 10;
        const layerVal = Math.sin((y + layerWarp) / layerPeriod * Math.PI * 2);
        const layerFactor = (layerVal > 0.8 ? 15 : 0) + (layerVal < -0.8 ? -10 : 0);

        // Fossil spots (scattered circular inclusions)
        const fossilNoise = noise.perlin(x / 15, y / 15, 2);
        const fossilFactor = fossilNoise > 0.75 ? (fossilNoise - 0.75) * 60 : 0;

        data[idx]     = Math.max(0, Math.min(255, baseR + n + layerFactor - fossilFactor));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + n + layerFactor - fossilFactor * 0.5));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + n + layerFactor - fossilFactor * 0.3));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  /** Slate: diagonal cleavage lines */
  private generateSlateTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;
    const cleavageAngle = 0.7 + rng.nextFloat(-0.2, 0.2); // ~40 degrees

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Base noise
        const n = noise.perlin(x / 60, y / 60, 0) * 12;

        // Diagonal cleavage lines
        const diagCoord = x * Math.cos(cleavageAngle) + y * Math.sin(cleavageAngle);
        const cleavageWarp = noise.perlin(x / 300, y / 300, 1) * 20;
        const cleavageVal = Math.sin((diagCoord + cleavageWarp) / 40 * Math.PI * 2);
        const cleavageLine = Math.abs(cleavageVal) < 0.08 ? -25 : 0;

        // Secondary perpendicular micro-fissures
        const perpCoord = -x * Math.sin(cleavageAngle) + y * Math.cos(cleavageAngle);
        const microFissure = Math.sin(perpCoord / 120 * Math.PI * 2);
        const fissureLine = microFissure > 0.95 ? -15 : 0;

        data[idx]     = Math.max(0, Math.min(255, baseR + n + cleavageLine + fissureLine));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + n + cleavageLine + fissureLine));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + n + cleavageLine + fissureLine));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  private generateConcreteTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Large-scale variation
        const n1 = noise.perlin(x / 200, y / 200, 0) * 20;
        // Medium-scale aggregate texture
        const n2 = noise.perlin(x / 40, y / 40, 1) * 12;
        // Fine noise
        const n3 = noise.perlin(x / 10, y / 10, 2) * 5;

        // Water staining (darker patches)
        const stain = noise.perlin(x / 150, y / 150, 3);
        const stainFactor = stain < -0.4 ? (stain + 0.4) * 30 : 0;

        // Aggregate spots (small bright inclusions)
        const agg = noise.perlin(x / 6, y / 6, 4);
        const aggFactor = agg > 0.8 ? (agg - 0.8) * 30 : 0;

        const v = baseR + n1 + n2 + n3 + stainFactor + aggFactor;
        data[idx]     = Math.max(0, Math.min(255, v));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + (v - baseR) * 0.95));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + (v - baseR) * 0.9));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  /** Travertine: pitted surface + horizontal layering */
  private generateTravertineTexture(params: StoneParams, rng: SeededRandom): Texture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const baseR = params.color.r * 255;
    const baseG = params.color.g * 255;
    const baseB = params.color.b * 255;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Base noise
        const n = noise.perlin(x / 80, y / 80, 0) * 15;

        // Horizontal layering (vein-like horizontal bands)
        const layerWarp = noise.perlin(x / 300, y / 300, 1) * 15;
        const layerVal = Math.sin((y + layerWarp) / 50 * Math.PI * 2);
        const layerFactor = layerVal > 0.7 ? 12 : layerVal < -0.7 ? -8 : 0;

        // Pitted surface (dark circular holes)
        const pitNoise1 = noise.perlin(x / 25, y / 25, 2);
        const pitNoise2 = noise.perlin(x / 8, y / 8, 3);
        const pitFactor = (pitNoise1 > 0.65 && pitNoise2 > 0.5) ? -40 : 0;

        // Smaller pitting
        const microPit = noise.perlin(x / 5, y / 5, 4);
        const microPitFactor = microPit > 0.85 ? -20 : 0;

        data[idx]     = Math.max(0, Math.min(255, baseR + n + layerFactor + pitFactor + microPitFactor));
        data[idx + 1] = Math.max(0, Math.min(255, baseG + n + layerFactor + pitFactor + microPitFactor));
        data[idx + 2] = Math.max(0, Math.min(255, baseB + n + layerFactor + pitFactor + microPitFactor));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // ---------------------------------------------------------------------------
  // Normal map generation — with actual surface detail from noise gradients
  // ---------------------------------------------------------------------------

  private generateNormalMap(params: StoneParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 500);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Scale differs by stone type
    const scaleMap: Record<string, number> = {
      marble: 80, granite: 20, limestone: 60, slate: 40, concrete: 50, travertine: 30,
    };
    const scale = (scaleMap[params.type] ?? 50) * params.veinScale;
    const strengthMap: Record<string, number> = {
      marble: 1.5, granite: 2.5, limestone: 2.0, slate: 3.0, concrete: 1.5, travertine: 3.5,
    };
    const strength = strengthMap[params.type] ?? 2.0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Compute surface gradient from noise
        const n  = noise.perlin(x / scale, y / scale, 0);
        const nx = noise.perlin((x + 1) / scale, y / scale, 0) - n;
        const ny = noise.perlin(x / scale, (y + 1) / scale, 0) - n;

        // For pitted surfaces (travertine), add extra depression
        let extraZ = 0;
        if (params.type === 'travertine') {
          const pitNoise = noise.perlin(x / (scale * 0.3), y / (scale * 0.3), 1);
          if (pitNoise > 0.6) extraZ = (pitNoise - 0.6) * 2.0;
        }
        if (params.type === 'slate') {
          // Sharper edges for cleavage
          const cleavage = noise.perlin(x / (scale * 1.5), y / (scale * 1.5), 1);
          if (Math.abs(cleavage) < 0.05) extraZ = -0.5;
        }

        // Encode normal: map [-1,1] to [0,255]
        data[idx]     = Math.max(0, Math.min(255, 128 + nx * strength * 128));
        data[idx + 1] = Math.max(0, Math.min(255, 128 + ny * strength * 128));
        data[idx + 2] = Math.max(0, Math.min(255, 255 + extraZ * -50)); // Z-up with optional depression
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new CanvasTexture(canvas);
  }

  // ---------------------------------------------------------------------------
  // Roughness map
  // ---------------------------------------------------------------------------

  private generateRoughnessMap(params: StoneParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed + 700);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const baseRoughness = Math.floor(params.roughness * 255);

    const variationScale: Record<string, number> = {
      marble: 15, granite: 25, limestone: 20, slate: 18, concrete: 12, travertine: 30,
    };
    const varScale = variationScale[params.type] ?? 15;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const n = noise.perlin(x / varScale, y / varScale, 0) * 25;

        // Polished stone has less roughness variation
        const polishReduction = params.polishLevel * 40;
        const v = Math.max(0, Math.min(255, baseRoughness + n - polishReduction));
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

  getVariations(count: number): StoneParams[] {
    const variations: StoneParams[] = [];
    const types: StoneParams['type'][] = ['marble', 'granite', 'limestone', 'slate', 'concrete', 'travertine'];
    for (let i = 0; i < count; i++) {
      const t = types[this.rng.nextInt(0, types.length - 1)];
      const roughnessMap: Record<string, [number, number]> = {
        marble: [0.1, 0.3], granite: [0.2, 0.5], limestone: [0.5, 0.8],
        slate: [0.4, 0.7], concrete: [0.6, 0.9], travertine: [0.5, 0.75],
      };
      const [rMin, rMax] = roughnessMap[t] ?? [0.3, 0.7];
      variations.push({
        type: t,
        color: new Color().setHSL(this.rng.nextFloat() * 0.12, 0.05 + this.rng.nextFloat() * 0.15, 0.4 + this.rng.nextFloat() * 0.4),
        veinColor: new Color().setHSL(this.rng.nextFloat() * 0.1, 0.1 + this.rng.nextFloat() * 0.2, 0.3 + this.rng.nextFloat() * 0.3),
        roughness: rMin + this.rng.nextFloat() * (rMax - rMin),
        veinIntensity: 0.2 + this.rng.nextFloat() * 0.5,
        veinScale: 0.5 + this.rng.nextFloat() * 1.5,
        polishLevel: t === 'marble' ? 0.7 + this.rng.nextFloat() * 0.25 : this.rng.nextFloat() * 0.5,
      });
    }
    return variations;
  }

  /** Get a preset by name */
  static getPreset(name: string): Partial<StoneParams> | undefined {
    return STONE_PRESETS[name];
  }

  /** List all available preset names */
  static listPresets(): string[] {
    return Object.keys(STONE_PRESETS);
  }
}
