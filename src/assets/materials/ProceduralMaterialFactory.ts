import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * Configuration for procedural PBR materials
 */
export interface ProceduralMaterialConfig {
  name: string;
  type: 'rock' | 'soil' | 'vegetation' | 'water' | 'snow' | 'custom';
  
  // Base Color
  baseColor: string | THREE.Color;
  colorVariation: number; // 0-1
  
  // Surface Detail
  roughness: number;
  metalness: number;
  normalScale: number;
  displacementScale: number;
  
  // Noise Parameters
  noiseScale: number;
  noiseDetail: number; // Octaves
  noiseThreshold: number;
  
  // Layers (for mixing)
  layers?: ProceduralLayer[];
}

export interface ProceduralLayer {
  texture: THREE.Texture | null;
  color: THREE.Color;
  roughness: number;
  metalness: number;
  normalMap: THREE.Texture | null;
  displacementMap: THREE.Texture | null;
  mixFactor: number; // 0-1
  scale: number;
  offset: THREE.Vector2;
}

/**
 * Factory for generating procedural PBR materials using Three.js
 * Mimics Blender node workflows for web compatibility
 */
export class ProceduralMaterialFactory {
  private noise: SimplexNoise;
  private textureCache: Map<string, THREE.CanvasTexture>;

  constructor() {
    this.noise = new SimplexNoise();
    this.textureCache = new Map();
  }

  /**
   * Generate a complete material based on configuration
   */
  createMaterial(config: ProceduralMaterialConfig): THREE.MeshStandardMaterial {
    const { 
      baseColor, 
      roughness, 
      metalness, 
      normalScale, 
      displacementScale,
      noiseScale,
      noiseDetail
    } = config;

    // Generate procedural textures
    const colorMap = this.generateColorMap(config);
    const roughnessMap = this.generateRoughnessMap(config);
    const normalMap = this.generateNormalMap(config);
    const displacementMap = this.generateDisplacementMap(config);

    const material = new THREE.MeshStandardMaterial({
      name: config.name,
      color: typeof baseColor === 'string' ? new THREE.Color(baseColor) : baseColor,
      roughness,
      metalness,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      displacementScale,
    });

    if (colorMap) material.map = colorMap;
    if (roughnessMap) material.roughnessMap = roughnessMap;
    if (normalMap) material.normalMap = normalMap;
    if (displacementMap) material.displacementMap = displacementMap;

    material.needsUpdate = true;
    return material;
  }

  /**
   * Generate a color map using layered noise
   */
  private generateColorMap(config: ProceduralMaterialConfig): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const baseColor = new THREE.Color(config.baseColor);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        // Sample noise
        const nx = x / size * config.noiseScale;
        const ny = y / size * config.noiseScale;
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let o = 0; o < config.noiseDetail; o++) {
          noiseValue += this.noise.noise(nx * frequency, ny * frequency) * amplitude;
          maxValue += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }

        noiseValue = (noiseValue / maxValue + 1) * 0.5; // Normalize to 0-1

        // Apply variation
        const variation = config.colorVariation || 0.1;
        const color = baseColor.clone();
        color.r *= (1 + (noiseValue - 0.5) * variation);
        color.g *= (1 + (noiseValue - 0.5) * variation);
        color.b *= (1 + (noiseValue - 0.5) * variation);

        data[i] = Math.min(255, color.r * 255);
        data[i + 1] = Math.min(255, color.g * 255);
        data[i + 2] = Math.min(255, color.b * 255);
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    return texture;
  }

  /**
   * Generate roughness map based on noise
   */
  private generateRoughnessMap(config: ProceduralMaterialConfig): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const baseRoughness = config.roughness;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        const nx = x / size * config.noiseScale * 1.5;
        const ny = y / size * config.noiseScale * 1.5;
        const noiseValue = (this.noise.noise(nx, ny) + 1) * 0.5;

        const roughnessValue = Math.max(0, Math.min(1, baseRoughness + (noiseValue - 0.5) * 0.3));
        const pixelValue = Math.floor(roughnessValue * 255);

        data[i] = pixelValue;
        data[i + 1] = pixelValue;
        data[i + 2] = pixelValue;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    return texture;
  }

  /**
   * Generate a fake normal map using gradient analysis of height noise
   */
  private generateNormalMap(config: ProceduralMaterialConfig): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    const scale = config.normalScale * 0.05;

    // Pre-calculate height map
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size * config.noiseScale;
        const ny = y / size * config.noiseScale;
        let h = 0;
        let amp = 1;
        let freq = 1;
        for (let o = 0; o < config.noiseDetail; o++) {
          h += this.noise.noise(nx * freq, ny * freq) * amp;
          amp *= 0.5;
          freq *= 2;
        }
        heights[y * size + x] = h;
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        // Calculate gradients
        const hL = heights[y * size + Math.max(0, x - 1)];
        const hR = heights[y * size + Math.min(size - 1, x + 1)];
        const hU = heights[Math.max(0, y - 1) * size + x];
        const hD = heights[Math.min(size - 1, y + 1) * size + x];

        const dx = (hR - hL) * scale;
        const dy = (hD - hU) * scale;

        // Convert to normal
        const nx = dx;
        const ny = dy;
        const nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        const r = ((nx / len) + 1) * 0.5 * 255;
        const g = ((ny / len) + 1) * 0.5 * 255;
        const b = ((nz / len) + 1) * 0.5 * 255;

        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    return texture;
  }

  /**
   * Generate displacement map
   */
  private generateDisplacementMap(config: ProceduralMaterialConfig): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        
        const nx = x / size * config.noiseScale;
        const ny = y / size * config.noiseScale;
        let noiseValue = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let o = 0; o < config.noiseDetail; o++) {
          noiseValue += this.noise.noise(nx * frequency, ny * frequency) * amplitude;
          maxValue += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }

        noiseValue = (noiseValue / maxValue + 1) * 0.5;
        const pixelValue = Math.floor(noiseValue * 255);

        data[i] = pixelValue;
        data[i + 1] = pixelValue;
        data[i + 2] = pixelValue;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    return texture;
  }

  /**
   * Clear texture cache to free memory
   */
  clearCache(): void {
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
  }
}
