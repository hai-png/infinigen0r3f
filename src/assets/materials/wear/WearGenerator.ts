/**
 * Wear and Tear Generator - Scratches, scuffs, dents, edge wear
 */
import { Texture, CanvasTexture, Color, RepeatWrapping, MeshStandardMaterial, MeshPhysicalMaterial } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';

export interface WearParams {
  scratchDensity: number;
  scratchLength: number;
  scratchDepth: number;
  scuffDensity: number;
  edgeWear: number;
  dentCount: number;
  dirtAccumulation: number;
}

export class WearGenerator {
  generateWearMap(params: WearParams, seed: number): { roughnessMap: Texture; normalMap: Texture; aoMap: Texture } {
    const rng = new SeededRandom(seed);

    return {
      roughnessMap: this.generateRoughnessWear(params, rng),
      normalMap: this.generateNormalWear(params, rng),
      aoMap: this.generateAOWear(params, rng),
    };
  }

  private generateRoughnessWear(params: WearParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Add scratches (lighter = rougher)
    for (let i = 0; i < params.scratchDensity * 100; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const length = params.scratchLength * 50;
      const angle = rng.nextFloat() * Math.PI * 2;

      // Scratch is rougher than surrounding surface
      const brightness = 140 + rng.nextFloat() * 40;
      ctx.strokeStyle = `rgb(${Math.floor(brightness)},${Math.floor(brightness)},${Math.floor(brightness)})`;
      ctx.lineWidth = 1 + rng.nextFloat() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);

      // Multi-segment scratch with slight curves
      let cx = x, cy = y;
      const segments = 3 + Math.floor(rng.nextFloat() * 3);
      for (let s = 0; s < segments; s++) {
        cx += Math.cos(angle + (rng.nextFloat() - 0.5) * 0.5) * length / segments;
        cy += Math.sin(angle + (rng.nextFloat() - 0.5) * 0.5) * length / segments;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Add scuffs (wider, softer rough patches)
    for (let i = 0; i < params.scuffDensity * 50; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const r = 5 + rng.nextFloat() * 15;

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, '#a0a0a0');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalWear(params: WearParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Add scratch normal perturbation - scratches appear as fine grooves
    for (let i = 0; i < params.scratchDensity * 80; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const length = params.scratchLength * 40;
      const angle = rng.nextFloat() * Math.PI * 2;

      // Scratches are grooves - perpendicular normal offset
      const perpAngle = angle + Math.PI / 2;
      const depth = params.scratchDepth * 8;

      let cx = x, cy = y;
      const segments = 3 + Math.floor(rng.nextFloat() * 3);
      for (let s = 0; s < segments; s++) {
        cx += Math.cos(angle + (rng.nextFloat() - 0.5) * 0.4) * length / segments;
        cy += Math.sin(angle + (rng.nextFloat() - 0.5) * 0.4) * length / segments;

        // Draw a thin line offset in the normal direction
        const r = Math.max(0, Math.min(255, 128 + Math.cos(perpAngle) * depth));
        const g = Math.max(0, Math.min(255, 128 + Math.sin(perpAngle) * depth));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(cx - 1, cy - 1, 3, 3);
      }
    }

    // Add dents as depressions in the normal map
    for (let i = 0; i < params.dentCount; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const r = 10 + rng.nextFloat() * 30;

      // Dent center pushes normal inward
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, '#6060c0');
      gradient.addColorStop(0.6, '#7070e0');
      gradient.addColorStop(1, '#8080ff');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateAOWear(params: WearParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Add dirt in crevices (darker in AO map)
    if (params.dirtAccumulation > 0) {
      const noise = new Noise3D(rng.seed);
      for (let y = 0; y < size; y += 4) {
        for (let x = 0; x < size; x += 4) {
          const n = noise.perlin(x / 50, y / 50, 0);
          if (n > 0.7) {
            const value = 255 - Math.floor(n * params.dirtAccumulation * 100);
            ctx.fillStyle = `rgb(${Math.max(100, value)},${Math.max(100, value)},${Math.max(100, value)})`;
            ctx.fillRect(x, y, 4, 4);
          }
        }
      }
    }

    // Edge wear darkens AO at edges
    if (params.edgeWear > 0) {
      // Simulate edge darkening with border gradient
      const borderWidth = 30;
      const edgeDarken = params.edgeWear * 80;

      // Top/bottom edges
      for (let y = 0; y < borderWidth; y++) {
        const factor = 1 - (y / borderWidth);
        const darkening = Math.floor(edgeDarken * factor);
        ctx.fillStyle = `rgb(${255 - darkening},${255 - darkening},${255 - darkening})`;
        ctx.fillRect(0, y, size, 1);
        ctx.fillRect(0, size - y - 1, size, 1);
      }
      // Left/right edges
      for (let x = 0; x < borderWidth; x++) {
        const factor = 1 - (x / borderWidth);
        const darkening = Math.floor(edgeDarken * factor);
        ctx.fillStyle = `rgb(${255 - darkening},${255 - darkening},${255 - darkening})`;
        ctx.fillRect(x, 0, 1, size);
        ctx.fillRect(size - x - 1, 0, 1, size);
      }
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  getDefaultParams(): WearParams {
    return {
      scratchDensity: 0.3,
      scratchLength: 1.0,
      scratchDepth: 0.5,
      scuffDensity: 0.2,
      edgeWear: 0.3,
      dentCount: 5,
      dirtAccumulation: 0.2,
    };
  }

  /**
   * Apply wear maps onto an existing material's maps using canvas compositing.
   * Composites roughness and normal wear maps, adds roughness increase from scuff wear.
   */
  applyToMaterial(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: WearParams,
    seed: number
  ): void {
    const { roughnessMap, normalMap, aoMap } = this.generateWearMap(params, seed);

    // Composite wear roughness onto existing material roughness map
    if (material.roughnessMap) {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const existingSrc = material.roughnessMap.image as HTMLCanvasElement | HTMLImageElement;
        if (existingSrc) {
          ctx.drawImage(existingSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalCompositeOperation = 'lighter';
        const wearSrc = roughnessMap.image as HTMLCanvasElement | HTMLImageElement;
        if (wearSrc) {
          ctx.globalAlpha = 0.6;
          ctx.drawImage(wearSrc as CanvasImageSource, 0, 0, size, size);
          ctx.globalAlpha = 1.0;
        }
        ctx.globalCompositeOperation = 'source-over';
        const blended = new CanvasTexture(canvas);
        blended.wrapS = blended.wrapT = RepeatWrapping;
        material.roughnessMap = blended;
      }
    } else {
      material.roughnessMap = roughnessMap;
    }

    // Composite wear normal onto existing normal map
    if (material.normalMap) {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const existingSrc = material.normalMap.image as HTMLCanvasElement | HTMLImageElement;
        if (existingSrc) {
          ctx.drawImage(existingSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalCompositeOperation = 'overlay';
        const wearNormalSrc = normalMap.image as HTMLCanvasElement | HTMLImageElement;
        if (wearNormalSrc) {
          ctx.drawImage(wearNormalSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalCompositeOperation = 'source-over';
        const blended = new CanvasTexture(canvas);
        blended.wrapS = blended.wrapT = RepeatWrapping;
        material.normalMap = blended;
      }
    } else {
      material.normalMap = normalMap;
    }

    // Apply AO map (darkens existing or replaces)
    if (material.aoMap) {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const existingSrc = material.aoMap.image as HTMLCanvasElement | HTMLImageElement;
        if (existingSrc) {
          ctx.drawImage(existingSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalCompositeOperation = 'multiply';
        const wearAoSrc = aoMap.image as HTMLCanvasElement | HTMLImageElement;
        if (wearAoSrc) {
          ctx.drawImage(wearAoSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalCompositeOperation = 'source-over';
        const blended = new CanvasTexture(canvas);
        blended.wrapS = blended.wrapT = RepeatWrapping;
        material.aoMap = blended;
      }
    } else {
      material.aoMap = aoMap;
    }

    // Increase overall roughness from scuff wear
    material.roughness = Math.min(1.0, material.roughness + params.scuffDensity * 0.1);
    material.needsUpdate = true;
  }
}
