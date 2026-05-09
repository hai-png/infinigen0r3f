import { createCanvas } from '../../utils/CanvasUtils';
/**
 * Material Blending System - Multi-material mixing, gradient blends, mask-based blending
 * Blends two materials by interpolating their properties
 */
import { Material, MeshStandardMaterial, MeshPhysicalMaterial, Texture, CanvasTexture, Color, RepeatWrapping } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface BlendParams {
  material1: Material;
  material2: Material;
  blendFactor: number;
  blendType: 'linear' | 'gradient' | 'noise' | 'mask';
  noiseScale: number;
  gradientDirection: 'horizontal' | 'vertical' | 'radial';
}

/**
 * BlendedResult — the output of a material blend operation.
 *
 * Parity with the original Infinigen's material blending pipeline which produces
 * both a combined PBR material and per-pixel blend weights (a mask texture
 * indicating the contribution of each input material at every texel).
 *
 * The blendWeights texture is a grayscale image where:
 *   - 0.0 = fully material1
 *   - 1.0 = fully material2
 *   - 0.5 = equal blend
 *
 * This enables downstream systems (e.g., terrain material assignment, surface
 * kernel) to query the blend ratio at any point for correct material sampling.
 */
export interface BlendedResult {
  /** The combined/blended PBR material */
  blendedMaterial: Material;
  /** The blend map texture (grayscale mask for blending) */
  blendMap: Texture;
  /** Per-pixel blend weights: Float32Array of size width*height, range [0,1] */
  blendWeights: Float32Array;
  /** Width of the blend map in pixels */
  width: number;
  /** Height of the blend map in pixels */
  height: number;
  /** The first input material */
  material1: Material;
  /** The second input material */
  material2: Material;
  /** The blend factor used */
  blendFactor: number;
  /** The blend type used */
  blendType: 'linear' | 'gradient' | 'noise' | 'mask';
}

export class MaterialBlender {
  /**
   * Blend two materials by interpolating their properties
   * Returns a new material with blended properties and a blend map
   */
  blend(params: BlendParams, seed: number): { blendedMaterial: Material; blendMap: Texture } {
    const result = this.blendFull(params, seed);
    return {
      blendedMaterial: result.blendedMaterial,
      blendMap: result.blendMap,
    };
  }

  /**
   * Full blend operation returning BlendedResult with blend weights.
   *
   * This matches the original Infinigen's material blending pipeline output
   * which includes both the combined material and per-pixel blend weights
   * for downstream consumption by terrain/vegetation systems.
   *
   * @param params - Blend parameters
   * @param seed - Random seed for deterministic blending
   * @returns BlendedResult with PBR material, mask, and blend weights
   */
  blendFull(params: BlendParams, seed: number): BlendedResult {
    const rng = new SeededRandom(seed);
    const size = 512;
    const blendMap = this.generateBlendMap(params, rng);
    const blendedMaterial = this.createBlendedMaterial(params, blendMap);

    // Extract blend weights from the blend map image data
    const blendWeights = this.extractBlendWeights(blendMap, size, size);

    return {
      blendedMaterial,
      blendMap,
      blendWeights,
      width: size,
      height: size,
      material1: params.material1,
      material2: params.material2,
      blendFactor: params.blendFactor,
      blendType: params.blendType,
    };
  }

  /**
   * Extract per-pixel blend weights from a blend map texture.
   *
   * Reads the canvas pixel data and converts each pixel's luminance
   * to a float in [0, 1] representing the blend weight at that point.
   *
   * @param blendMap - The blend map texture
   * @param width - Expected width
   * @param height - Expected height
   * @returns Float32Array of blend weights, one per pixel
   */
  private extractBlendWeights(blendMap: Texture, width: number, height: number): Float32Array {
    const weights = new Float32Array(width * height);

    // Try to read from canvas image data
    const image = blendMap.image as any;
    if (image && image.getContext) {
      try {
        const ctx = image.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for (let i = 0; i < width * height; i++) {
            // Use red channel as luminance (grayscale image)
            weights[i] = data[i * 4] / 255.0;
          }
          return weights;
        }
      } catch {
        // Canvas may not be readable (e.g., CORS)
      }
    }

    // Fallback: generate uniform weights based on blendFactor
    for (let i = 0; i < width * height; i++) {
      weights[i] = 0.5; // Default equal blend
    }
    return weights;
  }

  private createBlendedMaterial(params: BlendParams, blendMap: Texture): Material {
    const mat1 = params.material1 as MeshStandardMaterial;
    const mat2 = params.material2 as MeshStandardMaterial;

    // Determine if we need MeshPhysicalMaterial
    const needsPhysical = mat1 instanceof MeshPhysicalMaterial || mat2 instanceof MeshPhysicalMaterial;
    const MaterialClass = needsPhysical ? MeshPhysicalMaterial : MeshStandardMaterial;

    const factor = params.blendFactor;

    // Blend colors
    const blendedColor = new Color();
    if (mat1.color && mat2.color) {
      blendedColor.copy(mat1.color).lerp(mat2.color, factor);
    } else {
      blendedColor.copy(mat1.color || mat2.color || new Color(0x888888));
    }

    // Blend numeric properties
    const blendedRoughness = this.lerpProp(mat1.roughness, mat2.roughness, factor, 0.5);
    const blendedMetalness = this.lerpProp(mat1.metalness, mat2.metalness, factor, 0.0);
    const blendedOpacity = this.lerpProp(mat1.opacity, mat2.opacity, factor, 1.0);

    const blended = new MaterialClass({
      color: blendedColor,
      roughness: blendedRoughness,
      metalness: blendedMetalness,
      transparent: blendedOpacity < 1,
      opacity: blendedOpacity,
    }) as MeshStandardMaterial;

    // Generate a combined texture where each pixel uses the blend map value
    // to pick between mat1 and mat2's texture colors via lerp
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx && (mat1.map || mat2.map)) {
      // Draw mat1's texture as the base
      if (mat1.map?.image) {
        ctx.drawImage(mat1.map.image as CanvasImageSource, 0, 0, size, size);
      } else {
        // Fill with mat1's solid color
        ctx.fillStyle = `#${mat1.color?.getHexString() || 'ffffff'}`;
        ctx.fillRect(0, 0, size, size);
      }

      // Draw mat2's texture on top with alpha from blend map
      if (mat2.map?.image || mat2.color) {
        // Create a temporary canvas for the blend mask composite
        const tempCanvas = createCanvas();
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          // Draw mat2's texture or solid color
          if (mat2.map?.image) {
            tempCtx.drawImage(mat2.map.image as CanvasImageSource, 0, 0, size, size);
          } else {
            tempCtx.fillStyle = `#${mat2.color?.getHexString() || 'ffffff'}`;
            tempCtx.fillRect(0, 0, size, size);
          }

          // Use the blend map as alpha mask: multiply alpha by blend map brightness
          tempCtx.globalCompositeOperation = 'destination-in';
          const blendSrc = blendMap.image as HTMLCanvasElement | HTMLImageElement;
          if (blendSrc) {
            tempCtx.drawImage(blendSrc as CanvasImageSource, 0, 0, size, size);
          } else {
            // Fallback: uniform blend
            tempCtx.fillStyle = `rgba(255,255,255,${factor})`;
            tempCtx.fillRect(0, 0, size, size);
          }
          tempCtx.globalCompositeOperation = 'source-over';
        }

        // Composite mat2 (masked by blend map) on top of mat1
        ctx.drawImage(tempCanvas as CanvasImageSource, 0, 0, size, size);
      }

      const blendedTexture = new CanvasTexture(canvas);
      blendedTexture.wrapS = blendedTexture.wrapT = RepeatWrapping;
      blended.map = blendedTexture;
    } else {
      // Fallback: use mat1's map if available
      if (mat1.map) blended.map = mat1.map;
    }

    // For MeshPhysicalMaterial properties
    if (blended instanceof MeshPhysicalMaterial) {
      const phys1 = mat1 as MeshPhysicalMaterial;
      const phys2 = mat2 as MeshPhysicalMaterial;

      if (phys1.clearcoat !== undefined || phys2.clearcoat !== undefined) {
        blended.clearcoat = this.lerpProp(phys1.clearcoat || 0, phys2.clearcoat || 0, factor, 0);
        blended.clearcoatRoughness = this.lerpProp(phys1.clearcoatRoughness || 0, phys2.clearcoatRoughness || 0, factor, 0);
      }

      if (phys1.transmission !== undefined || phys2.transmission !== undefined) {
        blended.transmission = this.lerpProp(phys1.transmission || 0, phys2.transmission || 0, factor, 0);
        blended.ior = this.lerpProp(phys1.ior || 1.5, phys2.ior || 1.5, factor, 1.5);
        blended.thickness = this.lerpProp(phys1.thickness || 0, phys2.thickness || 0, factor, 0);
      }
    }

    return blended;
  }

  private lerpProp(a: number | undefined, b: number | undefined, factor: number, fallback: number): number {
    const va = a !== undefined ? a : fallback;
    const vb = b !== undefined ? b : fallback;
    return va + (vb - va) * factor;
  }

  private generateBlendMap(params: BlendParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    switch (params.blendType) {
      case 'linear':
        this.generateLinearBlend(ctx, size, params);
        break;
      case 'gradient':
        this.generateGradientBlend(ctx, size, params);
        break;
      case 'noise':
        this.generateNoiseBlend(ctx, size, params, rng);
        break;
      case 'mask':
        this.generateMaskBlend(ctx, size, params);
        break;
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateLinearBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(params.blendFactor, '#808080');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateGradientBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    let gradient: CanvasGradient;

    if (params.gradientDirection === 'vertical') {
      gradient = ctx.createLinearGradient(0, 0, 0, size);
    } else if (params.gradientDirection === 'radial') {
      gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    } else {
      gradient = ctx.createLinearGradient(0, 0, size, 0);
    }

    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  private generateNoiseBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams, rng: SeededRandom): void {
    const noise = new Noise3D(rng.seed);

    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 50 * params.noiseScale, y / 50 * params.noiseScale, 0);
        const value = Math.floor((n + 1) / 2 * 255);
        ctx.fillStyle = `rgb(${value},${value},${value})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }
  }

  private generateMaskBlend(ctx: CanvasRenderingContext2D, size: number, params: BlendParams): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Draw circular mask
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * params.blendFactor * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  getDefaultParams(material1: Material, material2: Material): BlendParams {
    return {
      material1,
      material2,
      blendFactor: 0.5,
      blendType: 'noise',
      noiseScale: 1.0,
      gradientDirection: 'horizontal',
    };
  }
}
