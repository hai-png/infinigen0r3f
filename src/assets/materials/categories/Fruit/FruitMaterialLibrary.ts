import { createCanvas } from '../../../utils/CanvasUtils';
/**
 * Fruit Surface Material Library
 *
 * Procedural materials for 8 fruit surface types, ported from the original
 * Infinigen's fruit surface generators. Each fruit material extends
 * BaseMaterialGenerator and generates detailed color/normal/roughness maps
 * using procedural noise patterns characteristic of each fruit's surface.
 *
 * Fruits:
 * 1. Apple       — Smooth skin with subtle lenticels, gradient from green to red
 * 2. Blackberry  — Bumpy drupelet pattern, dark purple
 * 3. CoconutGreen— Green coconut with fibrous texture
 * 4. CoconutHairy— Brown hairy coconut surface
 * 5. Durian      — Spiky thorn pattern, green-brown
 * 6. Pineapple   — Diamond pattern with small spikes, golden-brown
 * 7. Starfruit   — Smooth waxy skin, yellow-green
 * 8. Strawberry  — Seed pits pattern, red with yellow seeds
 */

import {
  Color,
  Texture,
  CanvasTexture,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  RepeatWrapping,
} from 'three';
import { BaseMaterialGenerator, MaterialOutput } from '../../BaseMaterialGenerator';
import { SeededRandom } from '../../../../core/util/MathUtils';
import { Noise3D, SeededNoiseGenerator } from '../../../../core/util/math/noise';

// ============================================================================
// Fruit Types Enum
// ============================================================================

export type FruitType =
  | 'apple'
  | 'blackberry'
  | 'coconutGreen'
  | 'coconutHairy'
  | 'durian'
  | 'pineapple'
  | 'starfruit'
  | 'strawberry';

// ============================================================================
// Fruit Material Params
// ============================================================================

export interface FruitMaterialParams {
  [key: string]: unknown;
  type: FruitType;
  baseColor: Color;
  secondaryColor: Color;
  roughness: number;
  bumpIntensity: number;
  patternScale: number;
  ripeness: number;      // 0-1, controls color gradient
  seed: number;
}

// ============================================================================
// Fruit Material Library
// ============================================================================

export class FruitMaterialLibrary extends BaseMaterialGenerator<FruitMaterialParams> {
  private static readonly DEFAULT_PARAMS: FruitMaterialParams = {
    type: 'apple',
    baseColor: new Color(0xcc2222),
    secondaryColor: new Color(0x5a8c2a),
    roughness: 0.4,
    bumpIntensity: 0.5,
    patternScale: 1.0,
    ripeness: 0.7,
    seed: 42,
  };

  constructor(seed?: number) {
    super(seed);
  }

  getDefaultParams(): FruitMaterialParams {
    return { ...FruitMaterialLibrary.DEFAULT_PARAMS };
  }

  /**
   * Generate a fruit material of the specified type.
   */
  generate(params: Partial<FruitMaterialParams> = {}, seed?: number): MaterialOutput {
    const finalParams = this.mergeParams(
      this.applyTypeDefaults(this.mergeParams(FruitMaterialLibrary.DEFAULT_PARAMS, params)),
      params
    );

    const effectiveSeed = seed ?? finalParams.seed;
    const rng = new SeededRandom(effectiveSeed);
    const material = new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: finalParams.roughness,
      metalness: 0.0,
    });

    // Generate maps based on fruit type
    switch (finalParams.type) {
      case 'apple':
        this.generateAppleMaterial(material, finalParams, rng);
        break;
      case 'blackberry':
        this.generateBlackberryMaterial(material, finalParams, rng);
        break;
      case 'coconutGreen':
        this.generateCoconutGreenMaterial(material, finalParams, rng);
        break;
      case 'coconutHairy':
        this.generateCoconutHairyMaterial(material, finalParams, rng);
        break;
      case 'durian':
        this.generateDurianMaterial(material, finalParams, rng);
        break;
      case 'pineapple':
        this.generatePineappleMaterial(material, finalParams, rng);
        break;
      case 'starfruit':
        this.generateStarfruitMaterial(material, finalParams, rng);
        break;
      case 'strawberry':
        this.generateStrawberryMaterial(material, finalParams, rng);
        break;
    }

    return {
      material,
      maps: {
        map: material.map,
        roughnessMap: material.roughnessMap,
        normalMap: material.normalMap,
      },
      params: finalParams,
    };
  }

  getVariations(count: number): FruitMaterialParams[] {
    const types: FruitType[] = [
      'apple', 'blackberry', 'coconutGreen', 'coconutHairy',
      'durian', 'pineapple', 'starfruit', 'strawberry',
    ];
    const variations: FruitMaterialParams[] = [];

    for (let i = 0; i < count; i++) {
      const type = types[this.rng.nextInt(0, types.length - 1)];
      variations.push({
        type,
        baseColor: new Color().setHSL(this.rng.nextFloat(), 0.6, 0.45),
        secondaryColor: new Color().setHSL(this.rng.nextFloat(), 0.5, 0.4),
        roughness: this.rng.nextFloat(0.2, 0.8),
        bumpIntensity: this.rng.nextFloat(0.2, 0.8),
        patternScale: this.rng.nextFloat(0.8, 1.5),
        ripeness: this.rng.nextFloat(),
        seed: this.rng.nextInt(1, 99999),
      });
    }

    return variations;
  }

  // ==========================================================================
  // Individual Fruit Generators
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 1. Apple — Smooth skin with subtle lenticels, gradient green to red
  // --------------------------------------------------------------------------

  private generateAppleMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.clearcoat = 0.3;
    material.clearcoatRoughness = 0.15;

    // Color map: gradient from green to red based on ripeness
    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const colorCtx = colorCanvas.getContext('2d')!;

    const green = new Color(0x5a8c2a);
    const red = new Color(0xcc2222);
    const imageData = colorCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Ripeness gradient (top = more ripe/red, bottom = more green)
        const gradientT = ny * params.ripeness;
        const baseColor = green.clone().lerp(red, gradientT);

        // Subtle color variation
        const n = noise.perlin3D(nx * 6, ny * 6, 0) * 0.06;
        baseColor.r = Math.max(0, Math.min(1, baseColor.r + n));
        baseColor.g = Math.max(0, Math.min(1, baseColor.g + n * 0.5));
        baseColor.b = Math.max(0, Math.min(1, baseColor.b + n * 0.3));

        // Lenticels (small dots on apple skin)
        const lenticelVoronoi = noise.voronoi2D(nx, ny, 40 * params.patternScale);
        const isLenticel = lenticelVoronoi < 0.015;
        if (isLenticel) {
          baseColor.r *= 0.85;
          baseColor.g *= 0.85;
          baseColor.b *= 0.85;
        }

        imageData.data[idx] = Math.floor(baseColor.r * 255);
        imageData.data[idx + 1] = Math.floor(baseColor.g * 255);
        imageData.data[idx + 2] = Math.floor(baseColor.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    colorCtx.putImageData(imageData, 0, 0);

    const colorTex = new CanvasTexture(colorCanvas);
    colorTex.wrapS = colorTex.wrapT = RepeatWrapping;
    material.map = colorTex;

    // Normal map: subtle bumps for lenticels
    material.normalMap = this.generateAppleNormalMap(size, params, rng);

    // Roughness map: mostly smooth with slight lenticel variation
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.3, 0.08, rng.seed + 10);
    material.roughness = 0.35;
  }

  private generateAppleNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Lenticel bumps
        const lenticelVoronoi = noise.voronoi2D(nx, ny, 40 * params.patternScale);
        let bump = 0;
        if (lenticelVoronoi < 0.015) {
          bump = (0.015 - lenticelVoronoi) / 0.015 * params.bumpIntensity * 8;
        }

        // Very subtle surface noise
        const surfNoise = noise.perlin3D(nx * 15, ny * 15, 0) * params.bumpIntensity * 2;

        const totalBump = bump + surfNoise;
        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + totalBump * 3)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + totalBump * 3)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 2. Blackberry — Bumpy drupelet pattern, dark purple
  // --------------------------------------------------------------------------

  private generateBlackberryMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.55;
    material.clearcoat = 0.05;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const darkPurple = new Color(0x2a0a3a);
    const highlightPurple = new Color(0x4a1a5a);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Druplelet pattern via Voronoi
        const voronoiDist = noise.voronoi2D(nx, ny, 15 * params.patternScale);
        const isDrupeletCenter = voronoiDist < 0.02;
        const isDrupeletEdge = voronoiDist < 0.035;

        let r: number, g: number, b: number;
        if (isDrupeletCenter) {
          // Center of drupelet — slightly lighter / shinier
          const centerColor = highlightPurple.clone();
          const n = noise.perlin3D(nx * 20, ny * 20, 0.5) * 0.05;
          r = Math.max(0, Math.min(1, centerColor.r + n));
          g = Math.max(0, Math.min(1, centerColor.g + n * 0.5));
          b = Math.max(0, Math.min(1, centerColor.b + n * 0.3));
        } else if (isDrupeletEdge) {
          // Edge between drupelets — darker crevice
          const edgeDarken = 0.6;
          r = darkPurple.r * edgeDarken;
          g = darkPurple.g * edgeDarken;
          b = darkPurple.b * edgeDarken;
        } else {
          // General surface
          const n = noise.perlin3D(nx * 8, ny * 8, 0) * 0.04;
          r = Math.max(0, Math.min(1, darkPurple.r + n));
          g = Math.max(0, Math.min(1, darkPurple.g + n));
          b = Math.max(0, Math.min(1, darkPurple.b + n));
        }

        imageData.data[idx] = Math.floor(r * 255);
        imageData.data[idx + 1] = Math.floor(g * 255);
        imageData.data[idx + 2] = Math.floor(b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: bumpy drupelet surface
    material.normalMap = this.generateDrupeletNormalMap(size, params, rng);
    material.roughnessMap = this.generateDrupeletRoughnessMap(size, params, rng);
  }

  private generateDrupeletNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const voronoiDist = noise.voronoi2D(nx, ny, 15 * params.patternScale);
        // Drupelets are bumps — outward at center, crevice at edge
        let bumpX = 0, bumpY = 0;

        if (voronoiDist < 0.03) {
          // Calculate gradient direction from Voronoi for normal perturbation
          const dRight = noise.voronoi2D((nx + 0.002), ny, 15 * params.patternScale);
          const dUp = noise.voronoi2D(nx, (ny + 0.002), 15 * params.patternScale);
          bumpX = (voronoiDist - dRight) * params.bumpIntensity * 200;
          bumpY = (voronoiDist - dUp) * params.bumpIntensity * 200;
        }

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  private generateDrupeletRoughnessMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed + 50);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const voronoiDist = noise.voronoi2D(nx, ny, 15 * params.patternScale);
        // Drubelet centers are smoother, edges are rougher crevices
        let roughness = 0.5;
        if (voronoiDist < 0.02) {
          roughness = 0.3;
        } else if (voronoiDist < 0.04) {
          roughness = 0.75;
        }

        const v = Math.floor(roughness * 255);
        imageData.data[idx] = v;
        imageData.data[idx + 1] = v;
        imageData.data[idx + 2] = v;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 3. CoconutGreen — Green coconut with fibrous texture
  // --------------------------------------------------------------------------

  private generateCoconutGreenMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.75;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const baseGreen = new Color(0x4a7a2a);
    const fiberColor = new Color(0x6a9a3a);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Fibrous texture using stretched noise
        const fiberNoise = noise.perlin3D(
          nx * 3 * params.patternScale,
          ny * 20 * params.patternScale,
          0
        );

        // Cross fibers
        const crossFiber = noise.perlin3D(
          nx * 20 * params.patternScale,
          ny * 3 * params.patternScale,
          1.0
        );

        // Fiber pattern: alternating ridges
        const fiberPattern = (Math.sin(fiberNoise * 15) * 0.5 + 0.5) * 0.6 +
                            (Math.sin(crossFiber * 12) * 0.5 + 0.5) * 0.4;

        // Color blending
        const color = baseGreen.clone().lerp(fiberColor, fiberPattern);

        // Large-scale color variation
        const n = noise.perlin3D(nx * 2, ny * 2, 0.5) * 0.08;
        color.r = Math.max(0, Math.min(1, color.r + n));
        color.g = Math.max(0, Math.min(1, color.g + n));
        color.b = Math.max(0, Math.min(1, color.b + n * 0.5));

        imageData.data[idx] = Math.floor(color.r * 255);
        imageData.data[idx + 1] = Math.floor(color.g * 255);
        imageData.data[idx + 2] = Math.floor(color.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: fiber ridges
    material.normalMap = this.generateFiberNormalMap(size, params, rng);
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.7, 0.15, rng.seed + 20);
  }

  private generateFiberNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Fibers run primarily in one direction
        const fiberN = noise.perlin3D(nx * 3 * params.patternScale, ny * 20 * params.patternScale, 0);
        const fiberBumpX = Math.cos(fiberN * 15) * params.bumpIntensity * 8;
        const fiberBumpY = Math.sin(fiberN * 15) * params.bumpIntensity * 4;

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + fiberBumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + fiberBumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 4. CoconutHairy — Brown hairy coconut surface
  // --------------------------------------------------------------------------

  private generateCoconutHairyMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.9;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const baseBrown = new Color(0x7a5a2a);
    const darkBrown = new Color(0x4a3010);
    const lightBrown = new Color(0x9a7a4a);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Hair strands using high-frequency directional noise
        const hairN1 = noise.perlin3D(
          nx * 2 * params.patternScale,
          ny * 40 * params.patternScale,
          0
        );
        const hairN2 = noise.perlin3D(
          nx * 40 * params.patternScale,
          ny * 2 * params.patternScale,
          1.0
        );

        // Hair strand pattern
        const hairStrand = Math.pow(Math.abs(Math.sin(hairN1 * 20)), 2) * 0.6 +
                           Math.pow(Math.abs(Math.sin(hairN2 * 15)), 2) * 0.4;

        // Color: varies between dark and light brown
        const color = darkBrown.clone().lerp(lightBrown, hairStrand);

        // Add some sparser darker spots
        const spotNoise = noise.perlin3D(nx * 5, ny * 5, 2.0);
        if (spotNoise > 0.4) {
          color.lerp(baseBrown, (spotNoise - 0.4) * 0.5);
        }

        imageData.data[idx] = Math.floor(Math.max(0, Math.min(1, color.r)) * 255);
        imageData.data[idx + 1] = Math.floor(Math.max(0, Math.min(1, color.g)) * 255);
        imageData.data[idx + 2] = Math.floor(Math.max(0, Math.min(1, color.b)) * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: hair fiber ridges
    material.normalMap = this.generateHairNormalMap(size, params, rng);
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.85, 0.12, rng.seed + 30);
  }

  private generateHairNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Hair fibers predominantly vertical with some tangling
        const hairN = noise.perlin3D(nx * 3 * params.patternScale, ny * 50 * params.patternScale, 0);
        const crossN = noise.perlin3D(nx * 30 * params.patternScale, ny * 3 * params.patternScale, 1.0);

        const bumpX = Math.sin(hairN * 20) * params.bumpIntensity * 12 +
                       Math.sin(crossN * 12) * params.bumpIntensity * 4;
        const bumpY = Math.cos(hairN * 20) * params.bumpIntensity * 5;

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 5. Durian — Spiky thorn pattern, green-brown
  // --------------------------------------------------------------------------

  private generateDurianMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.65;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const baseGreenBrown = new Color(0x6a7a3a);
    const thornTip = new Color(0x8a6a2a);
    const crevice = new Color(0x3a4a1a);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Thorn pattern using Voronoi
        const voronoiDist = noise.voronoi2D(nx, ny, 8 * params.patternScale);

        let color: Color;
        if (voronoiDist < 0.04) {
          // Thorn tip — slightly lighter, yellowish
          const tipFactor = 1.0 - (voronoiDist / 0.04);
          color = baseGreenBrown.clone().lerp(thornTip, tipFactor * 0.6);
        } else if (voronoiDist < 0.08) {
          // Thorn body — base color
          const n = noise.perlin3D(nx * 10, ny * 10, 0) * 0.05;
          color = baseGreenBrown.clone();
          color.r = Math.max(0, Math.min(1, color.r + n));
          color.g = Math.max(0, Math.min(1, color.g + n));
          color.b = Math.max(0, Math.min(1, color.b + n * 0.5));
        } else {
          // Crevice between thorns — darker
          color = crevice.clone();
          const n = noise.perlin3D(nx * 6, ny * 6, 0.5) * 0.04;
          color.r = Math.max(0, Math.min(1, color.r + n));
          color.g = Math.max(0, Math.min(1, color.g + n));
        }

        imageData.data[idx] = Math.floor(color.r * 255);
        imageData.data[idx + 1] = Math.floor(color.g * 255);
        imageData.data[idx + 2] = Math.floor(color.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: spiky thorn bumps
    material.normalMap = this.generateThornNormalMap(size, params, rng);
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.6, 0.2, rng.seed + 40);
  }

  private generateThornNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const voronoiDist = noise.voronoi2D(nx, ny, 8 * params.patternScale);

        let bumpX = 0, bumpY = 0;
        if (voronoiDist < 0.1) {
          // Thorn: calculate gradient for normal
          const dRight = noise.voronoi2D(nx + 0.002, ny, 8 * params.patternScale);
          const dUp = noise.voronoi2D(nx, ny + 0.002, 8 * params.patternScale);
          // Points toward center of Voronoi cell (thorn tip)
          bumpX = (voronoiDist - dRight) * params.bumpIntensity * 300;
          bumpY = (voronoiDist - dUp) * params.bumpIntensity * 300;
        }

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 6. Pineapple — Diamond pattern with small spikes, golden-brown
  // --------------------------------------------------------------------------

  private generatePineappleMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.6;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const goldenBrown = new Color(0xb8960a);
    const darkBrown = new Color(0x6a4a0a);
    const spikeTip = new Color(0xd4aa20);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Diamond/hexagonal pattern — diagonal grid with offset rows
        const scale = 12 * params.patternScale;
        const dx = nx * scale;
        const dy = ny * scale;

        // Offset every other row
        const row = Math.floor(dy);
        const offsetX = (row % 2) * 0.5;
        const ddx = dx + offsetX;

        // Distance to nearest diamond center
        const cellX = ddx - Math.floor(ddx);
        const cellY = dy - Math.floor(dy);

        // Diamond shape distance
        const diamondDist = Math.abs(cellX - 0.5) + Math.abs(cellY - 0.5);

        let color: Color;
        if (diamondDist < 0.2) {
          // Diamond center — spike tip
          const tipFactor = 1.0 - (diamondDist / 0.2);
          color = goldenBrown.clone().lerp(spikeTip, tipFactor * 0.5);
        } else if (diamondDist < 0.4) {
          // Diamond body
          const n = noise.perlin3D(nx * 15, ny * 15, 0) * 0.04;
          color = goldenBrown.clone();
          color.r = Math.max(0, Math.min(1, color.r + n));
          color.g = Math.max(0, Math.min(1, color.g + n * 0.8));
          color.b = Math.max(0, Math.min(1, color.b + n * 0.3));
        } else {
          // Crevice between diamonds
          color = darkBrown.clone();
        }

        imageData.data[idx] = Math.floor(color.r * 255);
        imageData.data[idx + 1] = Math.floor(color.g * 255);
        imageData.data[idx + 2] = Math.floor(color.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: diamond pattern bumps with spikes
    material.normalMap = this.generateDiamondNormalMap(size, params, rng);
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.55, 0.15, rng.seed + 50);
  }

  private generateDiamondNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const scale = 12 * params.patternScale;
        const dx = nx * scale;
        const dy = ny * scale;
        const row = Math.floor(dy);
        const offsetX = (row % 2) * 0.5;
        const ddx = dx + offsetX;
        const cellX = ddx - Math.floor(ddx);
        const cellY = dy - Math.floor(dy);
        const diamondDist = Math.abs(cellX - 0.5) + Math.abs(cellY - 0.5);

        let bumpX = 0, bumpY = 0;
        if (diamondDist < 0.4) {
          // Spike at center, slope outward
          const spikeHeight = (1.0 - diamondDist / 0.4) * params.bumpIntensity * 20;
          bumpX = (cellX - 0.5) * spikeHeight * 2;
          bumpY = (cellY - 0.5) * spikeHeight * 2;
        } else {
          // Crevice depression
          bumpX = (cellX - 0.5) * -params.bumpIntensity * 5;
          bumpY = (cellY - 0.5) * -params.bumpIntensity * 5;
        }

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 7. Starfruit — Smooth waxy skin, yellow-green
  // --------------------------------------------------------------------------

  private generateStarfruitMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.25;
    material.clearcoat = 0.5;
    material.clearcoatRoughness = 0.1;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const yellowGreen = new Color(0xc8d420);
    const brightYellow = new Color(0xe8e440);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Very smooth, subtle color variation
        const n = noise.perlin3D(nx * 5, ny * 5, 0) * 0.08;
        const n2 = noise.perlin3D(nx * 12, ny * 12, 0.5) * 0.03;

        const color = yellowGreen.clone().lerp(brightYellow, 0.3 + n + n2);

        // Very subtle ridges along length
        const ridgeNoise = noise.perlin3D(nx * 2, ny * 30 * params.patternScale, 1.0);
        const ridgeFactor = Math.sin(ridgeNoise * 8) * 0.02;
        color.r = Math.max(0, Math.min(1, color.r + ridgeFactor));
        color.g = Math.max(0, Math.min(1, color.g + ridgeFactor));

        imageData.data[idx] = Math.floor(color.r * 255);
        imageData.data[idx + 1] = Math.floor(color.g * 255);
        imageData.data[idx + 2] = Math.floor(color.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: very subtle, almost flat with tiny ridge detail
    material.normalMap = this.generateSmoothWaxyNormalMap(size, params, rng);
    material.roughnessMap = this.generateSimpleRoughnessMap(size, 0.2, 0.05, rng.seed + 60);
  }

  private generateSmoothWaxyNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Very subtle ridges
        const ridgeN = noise.perlin3D(nx * 2, ny * 30 * params.patternScale, 1.0);
        const bumpX = Math.cos(ridgeN * 8) * params.bumpIntensity * 1.5;
        const bumpY = Math.sin(ridgeN * 8) * params.bumpIntensity * 0.5;

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 8. Strawberry — Seed pits pattern, red with yellow seeds
  // --------------------------------------------------------------------------

  private generateStrawberryMaterial(
    material: MeshPhysicalMaterial,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): void {
    const size = 1024;
    const noise = new SeededNoiseGenerator(rng.seed);

    material.roughness = 0.5;
    material.clearcoat = 0.1;

    const colorCanvas = createCanvas();
    colorCanvas.width = size;
    colorCanvas.height = size;
    const ctx = colorCanvas.getContext('2d')!;

    const red = new Color(0xcc2020);
    const darkRed = new Color(0x8a1515);
    const seedYellow = new Color(0xd4b840);
    const imageData = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        // Seed pits via Voronoi
        const voronoiDist = noise.voronoi2D(nx, ny, 25 * params.patternScale);
        const isSeedPit = voronoiDist < 0.015;

        // Base red with subtle variation
        const n = noise.perlin3D(nx * 6, ny * 6, 0) * 0.06;
        let color = red.clone().lerp(darkRed, 0.2 + n);

        if (isSeedPit) {
          // Seed pit: darker depression with yellow seed at center
          const seedCenter = voronoiDist < 0.005;
          if (seedCenter) {
            color = seedYellow.clone();
          } else {
            // Pit rim — slightly darker
            color = color.clone().multiplyScalar(0.7);
          }
        }

        // Subtle stripe/rib pattern
        const ribNoise = noise.perlin3D(nx * 2, ny * 15 * params.patternScale, 2.0);
        const ribFactor = Math.sin(ribNoise * 6) * 0.03;
        color.r = Math.max(0, Math.min(1, color.r + ribFactor));
        color.g = Math.max(0, Math.min(1, color.g + ribFactor * 0.3));

        imageData.data[idx] = Math.floor(color.r * 255);
        imageData.data[idx + 1] = Math.floor(color.g * 255);
        imageData.data[idx + 2] = Math.floor(color.b * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    material.map = new CanvasTexture(colorCanvas);
    (material.map as CanvasTexture).wrapS = (material.map as CanvasTexture).wrapT = RepeatWrapping;

    // Normal map: seed pit depressions
    material.normalMap = this.generateSeedPitNormalMap(size, params, rng);
    material.roughnessMap = this.generateSeedPitRoughnessMap(size, params, rng);
  }

  private generateSeedPitNormalMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const voronoiDist = noise.voronoi2D(nx, ny, 25 * params.patternScale);

        let bumpX = 0, bumpY = 0;
        if (voronoiDist < 0.02) {
          // Seed pit depression — compute gradient for normal
          const dRight = noise.voronoi2D(nx + 0.002, ny, 25 * params.patternScale);
          const dUp = noise.voronoi2D(nx, ny + 0.002, 25 * params.patternScale);
          // Pit slopes inward (negative bump)
          bumpX = (dRight - voronoiDist) * params.bumpIntensity * 200;
          bumpY = (dUp - voronoiDist) * params.bumpIntensity * 200;

          // Seed bump at center
          if (voronoiDist < 0.005) {
            bumpX *= -0.5;
            bumpY *= -0.5;
          }
        }

        // Subtle rib pattern
        const ribN = noise.perlin3D(nx * 2, ny * 15 * params.patternScale, 2.0);
        bumpX += Math.cos(ribN * 6) * params.bumpIntensity * 2;

        imageData.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + bumpX)));
        imageData.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + bumpY)));
        imageData.data[idx + 2] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  private generateSeedPitRoughnessMap(
    size: number,
    params: FruitMaterialParams,
    rng: SeededRandom
  ): Texture {
    const noise = new SeededNoiseGenerator(rng.seed + 55);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const nx = x / size;
        const ny = y / size;

        const voronoiDist = noise.voronoi2D(nx, ny, 25 * params.patternScale);

        // Pit edges are rougher, surface is moderate, seeds are smoother
        let roughness = 0.45;
        if (voronoiDist < 0.005) {
          roughness = 0.3; // Seed — smoother
        } else if (voronoiDist < 0.02) {
          roughness = 0.7; // Pit edge — rougher
        }

        const v = Math.floor(roughness * 255);
        imageData.data[idx] = v;
        imageData.data[idx + 1] = v;
        imageData.data[idx + 2] = v;
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  // ==========================================================================
  // Shared Helpers
  // ==========================================================================

  /**
   * Generate a simple roughness map with noise variation.
   */
  private generateSimpleRoughnessMap(
    size: number,
    baseRoughness: number,
    variation: number,
    seed: number
  ): Texture {
    const noise = new SeededNoiseGenerator(seed);
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const baseGray = Math.floor(baseRoughness * 255);
    ctx.fillStyle = `rgb(${baseGray},${baseGray},${baseGray})`;
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);

    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n = noise.perlin3D(x / 80, y / 80, 0) * variation * 255;
        const value = Math.max(0, Math.min(255, baseGray + n));
        const v = Math.floor(value);

        for (let dy = 0; dy < 2 && y + dy < size; dy++) {
          for (let dx = 0; dx < 2 && x + dx < size; dx++) {
            const idx = ((y + dy) * size + (x + dx)) * 4;
            imageData.data[idx] = v;
            imageData.data[idx + 1] = v;
            imageData.data[idx + 2] = v;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    return tex;
  }

  /**
   * Apply type-specific default colors and parameters.
   */
  private applyTypeDefaults(params: FruitMaterialParams): FruitMaterialParams {
    switch (params.type) {
      case 'apple':
        return {
          ...params,
          baseColor: new Color(0xcc2222),
          secondaryColor: new Color(0x5a8c2a),
          roughness: 0.35,
        };
      case 'blackberry':
        return {
          ...params,
          baseColor: new Color(0x2a0a3a),
          secondaryColor: new Color(0x4a1a5a),
          roughness: 0.55,
        };
      case 'coconutGreen':
        return {
          ...params,
          baseColor: new Color(0x4a7a2a),
          secondaryColor: new Color(0x6a9a3a),
          roughness: 0.75,
        };
      case 'coconutHairy':
        return {
          ...params,
          baseColor: new Color(0x7a5a2a),
          secondaryColor: new Color(0x9a7a4a),
          roughness: 0.9,
        };
      case 'durian':
        return {
          ...params,
          baseColor: new Color(0x6a7a3a),
          secondaryColor: new Color(0x8a6a2a),
          roughness: 0.65,
        };
      case 'pineapple':
        return {
          ...params,
          baseColor: new Color(0xb8960a),
          secondaryColor: new Color(0xd4aa20),
          roughness: 0.6,
        };
      case 'starfruit':
        return {
          ...params,
          baseColor: new Color(0xc8d420),
          secondaryColor: new Color(0xe8e440),
          roughness: 0.25,
        };
      case 'strawberry':
        return {
          ...params,
          baseColor: new Color(0xcc2020),
          secondaryColor: new Color(0xd4b840),
          roughness: 0.5,
        };
      default:
        return params;
    }
  }
}
