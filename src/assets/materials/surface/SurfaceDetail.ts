/**
 * Microsurface Detail Generator - Bump, normal, displacement maps
 * Adds normal map detail to materials
 */
import { Texture, CanvasTexture, RepeatWrapping, MeshStandardMaterial, MeshPhysicalMaterial } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface SurfaceParams {
  bumpScale: number;
  normalStrength: number;
  displacementScale: number;
  detailFrequency: number;
  detailAmplitude: number;
}

export class SurfaceDetailGenerator {
  generate(params: SurfaceParams, seed: number): { bumpMap: Texture; normalMap: Texture; displacementMap: Texture } {
    const rng = new SeededRandom(seed);

    return {
      bumpMap: this.generateBumpMap(params, rng),
      normalMap: this.generateNormalMap(params, rng),
      displacementMap: this.generateDisplacementMap(params, rng),
    };
  }

  /**
   * Apply surface detail to an existing material by blending normal maps
   */
  generateNormalDetail(params: SurfaceParams, seed: number): Texture {
    const rng = new SeededRandom(seed);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);

    // Multi-octave normal perturbation for fine detail
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        // Two octaves of detail
        const nx1 = noise.perlin(x / 40 * params.detailFrequency, y / 40 * params.detailFrequency, 0);
        const nx2 = noise.perlin(x / 20 * params.detailFrequency, y / 20 * params.detailFrequency, 0) * 0.5;
        const ny1 = noise.perlin(x / 40 * params.detailFrequency, y / 40 * params.detailFrequency, 100);
        const ny2 = noise.perlin(x / 20 * params.detailFrequency, y / 20 * params.detailFrequency, 100) * 0.5;

        const nx = (nx1 + nx2) * params.normalStrength * 30 * params.detailAmplitude;
        const ny = (ny1 + ny2) * params.normalStrength * 30 * params.detailAmplitude;

        const r = Math.max(0, Math.min(255, 128 + nx));
        const g = Math.max(0, Math.min(255, 128 + ny));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateBumpMap(params: SurfaceParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const n1 = noise.perlin(x / 50 * params.detailFrequency, y / 50 * params.detailFrequency, 0);
        const n2 = noise.perlin(x / 25 * params.detailFrequency, y / 25 * params.detailFrequency, 0) * 0.5;
        const value = 128 + (n1 + n2) * params.detailAmplitude * params.bumpScale * 127;
        const v = Math.max(0, Math.min(255, value));
        ctx.fillStyle = `rgb(${Math.floor(v)},${Math.floor(v)},${Math.floor(v)})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalMap(params: SurfaceParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const nx = noise.perlin(x / 40, y / 40, 0) * params.normalStrength * 30;
        const ny = noise.perlin(x / 40, y / 40, 100) * params.normalStrength * 30;
        const r = Math.max(0, Math.min(255, 128 + nx));
        const g = Math.max(0, Math.min(255, 128 + ny));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateDisplacementMap(params: SurfaceParams, rng: SeededRandom): Texture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    const noise = new Noise3D(rng.seed);
    for (let y = 0; y < size; y += 4) {
      for (let x = 0; x < size; x += 4) {
        const n = noise.perlin(x / 30 * params.detailFrequency, y / 30 * params.detailFrequency, 0);
        const value = 128 + n * params.displacementScale * 127;
        const v = Math.max(0, Math.min(255, value));
        ctx.fillStyle = `rgb(${Math.floor(v)},${Math.floor(v)},${Math.floor(v)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  getDefaultParams(): SurfaceParams {
    return {
      bumpScale: 0.5,
      normalStrength: 0.5,
      displacementScale: 0.1,
      detailFrequency: 1.0,
      detailAmplitude: 1.0,
    };
  }

  /**
   * Apply surface detail to an existing material by blending the generated
   * normal map with the material's existing normal map using canvas compositing.
   */
  applyToMaterial(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: SurfaceParams,
    seed: number
  ): void {
    const detailNormal = this.generateNormalDetail(params, seed);
    const existingNormal = material.normalMap;

    if (!existingNormal) {
      // No existing normal map — just assign the generated one
      material.normalMap = detailNormal;
      material.normalScale.set(params.normalStrength, params.normalStrength);
      material.needsUpdate = true;
      return;
    }

    // Blend the two normal maps using canvas compositing (overlay blend)
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw existing normal map first
    const existingSource = existingNormal.image as HTMLCanvasElement | HTMLImageElement;
    if (existingSource) {
      ctx.drawImage(existingSource as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#8080ff';
      ctx.fillRect(0, 0, size, size);
    }

    // Composite detail normal on top using overlay blending for proper normal combination
    const detailSource = detailNormal.image as HTMLCanvasElement | HTMLImageElement;
    if (detailSource) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.drawImage(detailSource as CanvasImageSource, 0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }

    const blendedTexture = new CanvasTexture(canvas);
    blendedTexture.wrapS = blendedTexture.wrapT = RepeatWrapping;
    material.normalMap = blendedTexture;
    material.normalScale.set(params.normalStrength, params.normalStrength);
    material.needsUpdate = true;
  }
}
