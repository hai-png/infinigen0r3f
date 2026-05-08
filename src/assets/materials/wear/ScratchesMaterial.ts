import { createCanvas } from '../../utils/CanvasUtils';
/**
 * Scratches Material
 *
 * Generates procedural scratch patterns as standalone maps or applies them
 * to existing THREE.Material objects. Supports directional scratches,
 * crosshatch patterns, and curved scratch lines.
 *
 * Inspired by Infinigen's scratches material node graph, which uses
 * Voronoi textures and noise to drive scratch placement and curvature.
 */

import {
  Color,
  Vector2,
  Texture,
  CanvasTexture,
  RepeatWrapping,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
} from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { SeededNoiseGenerator } from '../../../core/util/math/noise';

// ============================================================================
// Interface
// ============================================================================

export interface ScratchParams {
  /** Primary scratch direction (normalized) */
  direction: Vector2;
  /** Number of scratches per unit area (0-1) */
  density: number;
  /** Scratch depth / intensity (0-1) */
  depth: number;
  /** Scratch width in pixels */
  width: number;
  /** How much scratches curve (0 = straight, 1 = very curved) */
  curvature: number;
  /** Whether to add perpendicular scratches */
  crosshatch: boolean;
  /** Scratch color (usually slightly darker than base) */
  color: Color;
  /** Seed for deterministic generation */
  seed: number;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_SCRATCH_PARAMS: ScratchParams = {
  direction: new Vector2(1, 0.2).normalize(),
  density: 0.4,
  depth: 0.5,
  width: 1.5,
  curvature: 0.2,
  crosshatch: false,
  color: new Color(0x555555),
  seed: 42,
};

// ============================================================================
// ScratchesMaterial Class
// ============================================================================

export class ScratchesMaterial {
  private rng: SeededRandom;
  private noise: SeededNoiseGenerator;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.noise = new SeededNoiseGenerator(seed);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Apply scratch effects to an existing material.
   *
   * Modifies the material's color map (scratches are visible as lines),
   * roughness map (scratches change roughness), and normal map (scratches
   * cause surface perturbation).
   */
  applyToMaterial(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: Partial<ScratchParams> = {}
  ): void {
    const fullParams = this.mergeWithDefaults(params);
    const size = 512;

    // Generate scratch maps
    const normalMap = this.generateScratchNormalMap(size, size, fullParams);
    const roughnessMap = this.generateScratchRoughnessMap(size, size, fullParams);

    // Apply scratch color overlay to material's color map
    this.applyScratchColor(material, fullParams, size);

    // Composite scratch normal perturbation
    if (material.normalMap?.image) {
      const canvas = createCanvas();
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(material.normalMap.image as CanvasImageSource, 0, 0, size, size);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.6;
        const normalSrc = normalMap.image as HTMLCanvasElement;
        if (normalSrc) {
          ctx.drawImage(normalSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        const blended = new CanvasTexture(canvas);
        blended.wrapS = blended.wrapT = RepeatWrapping;
        material.normalMap = blended;
      }
    } else {
      material.normalMap = normalMap;
    }

    // Composite scratch roughness
    if (material.roughnessMap?.image) {
      const canvas = createCanvas();
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(material.roughnessMap.image as CanvasImageSource, 0, 0, size, size);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        const roughSrc = roughnessMap.image as HTMLCanvasElement;
        if (roughSrc) {
          ctx.drawImage(roughSrc as CanvasImageSource, 0, 0, size, size);
        }
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
        const blended = new CanvasTexture(canvas);
        blended.wrapS = blended.wrapT = RepeatWrapping;
        material.roughnessMap = blended;
      }
    } else {
      material.roughnessMap = roughnessMap;
    }

    // Slightly increase base roughness
    material.roughness = Math.min(1.0, material.roughness + fullParams.depth * 0.05);
    material.needsUpdate = true;
  }

  /**
   * Generate a scratch normal map — scratch lines encoded as normal perturbations.
   *
   * Red channel = tangent-space X perturbation
   * Green channel = tangent-space Y perturbation
   * Blue channel = Z (always > 0.5 for valid normal map)
   */
  generateScratchNormalMap(
    width: number,
    height: number,
    params: Partial<ScratchParams> = {}
  ): Texture {
    const fullParams = this.mergeWithDefaults(params);
    const localRng = new SeededRandom(fullParams.seed);
    const noise = new SeededNoiseGenerator(fullParams.seed);

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Neutral normal map (flat surface)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, width, height);

    const mainAngle = Math.atan2(fullParams.direction.y, fullParams.direction.x);

    // Draw primary scratches
    this.drawScratchLines(ctx, width, height, mainAngle, fullParams, localRng, noise);

    // Draw crosshatch scratches if enabled
    if (fullParams.crosshatch) {
      const perpAngle = mainAngle + Math.PI / 2;
      const crossRng = new SeededRandom(fullParams.seed + 500);
      this.drawScratchLines(ctx, width, height, perpAngle, fullParams, crossRng, noise);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  /**
   * Generate a scratch roughness map — scratch lines as roughness variations.
   *
   * Scratches typically increase roughness (lighter = rougher).
   */
  generateScratchRoughnessMap(
    width: number,
    height: number,
    params: Partial<ScratchParams> = {}
  ): Texture {
    const fullParams = this.mergeWithDefaults(params);
    const localRng = new SeededRandom(fullParams.seed + 200);
    const noise = new SeededNoiseGenerator(fullParams.seed + 200);

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Start neutral (middle gray)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);

    const mainAngle = Math.atan2(fullParams.direction.y, fullParams.direction.x);

    // Draw primary scratches as roughness lines
    this.drawRoughnessLines(ctx, width, height, mainAngle, fullParams, localRng, noise);

    // Crosshatch
    if (fullParams.crosshatch) {
      const perpAngle = mainAngle + Math.PI / 2;
      const crossRng = new SeededRandom(fullParams.seed + 700);
      this.drawRoughnessLines(ctx, width, height, perpAngle, fullParams, crossRng, noise);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Internal — drawing helpers
  // --------------------------------------------------------------------------

  /**
   * Draw scratch lines as normal-map perturbations.
   */
  private drawScratchLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mainAngle: number,
    params: ScratchParams,
    rng: SeededRandom,
    noise: SeededNoiseGenerator
  ): void {
    const scratchCount = Math.floor(params.density * 100);

    for (let i = 0; i < scratchCount; i++) {
      const startX = rng.nextFloat() * width;
      const startY = rng.nextFloat() * height;
      const length = 30 + rng.nextFloat() * 120;
      const lineWidth = Math.max(0.5, params.width * (0.5 + rng.nextFloat()));

      // Per-scratch angle variation
      const angle = mainAngle + (rng.nextFloat() - 0.5) * 0.4;
      const perpAngle = angle + Math.PI / 2;

      // Depth variation
      const scratchDepth = params.depth * (0.3 + rng.nextFloat() * 0.7);

      // Generate curved scratch path
      const points = this.generateCurvedPath(
        startX, startY, angle, length, params.curvature, rng, noise
      );

      // Draw each segment as a normal perturbation
      for (let s = 0; s < points.length - 1; s++) {
        const [px, py] = points[s];
        const perturbX = Math.cos(perpAngle) * scratchDepth * 25;
        const perturbY = Math.sin(perpAngle) * scratchDepth * 25;

        const r = Math.max(0, Math.min(255, Math.floor(128 + perturbX)));
        const g = Math.max(0, Math.min(255, Math.floor(128 + perturbY)));

        ctx.fillStyle = `rgb(${r},${g},255)`;
        ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(lineWidth), Math.ceil(lineWidth));
      }
    }
  }

  /**
   * Draw scratch lines as roughness variations (brighter = rougher).
   */
  private drawRoughnessLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mainAngle: number,
    params: ScratchParams,
    rng: SeededRandom,
    noise: SeededNoiseGenerator
  ): void {
    const scratchCount = Math.floor(params.density * 80);

    for (let i = 0; i < scratchCount; i++) {
      const startX = rng.nextFloat() * width;
      const startY = rng.nextFloat() * height;
      const length = 25 + rng.nextFloat() * 100;
      const lineWidth = Math.max(0.5, params.width * (0.5 + rng.nextFloat()));
      const angle = mainAngle + (rng.nextFloat() - 0.5) * 0.4;

      const scratchDepth = params.depth * (0.3 + rng.nextFloat() * 0.7);
      // Roughness: scratches increase roughness
      const brightness = Math.floor(128 + scratchDepth * 100);

      ctx.strokeStyle = `rgb(${brightness},${brightness},${brightness})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';

      const points = this.generateCurvedPath(
        startX, startY, angle, length, params.curvature, rng, noise
      );

      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let s = 1; s < points.length; s++) {
          ctx.lineTo(points[s][0], points[s][1]);
        }
        ctx.stroke();
      }
    }
  }

  /**
   * Generate a curved scratch path using noise-driven curvature.
   */
  private generateCurvedPath(
    startX: number,
    startY: number,
    angle: number,
    length: number,
    curvature: number,
    rng: SeededRandom,
    noise: SeededNoiseGenerator
  ): [number, number][] {
    const points: [number, number][] = [];
    const segments = 6 + Math.floor(rng.nextFloat() * 6);
    const segLen = length / segments;

    let cx = startX;
    let cy = startY;
    let currentAngle = angle;

    for (let s = 0; s <= segments; s++) {
      points.push([cx, cy]);

      // Noise-driven curvature
      const noiseVal = noise.perlin3D(cx * 0.01, cy * 0.01, s * 0.3);
      currentAngle = angle + noiseVal * curvature * 2.0;

      cx += Math.cos(currentAngle) * segLen;
      cy += Math.sin(currentAngle) * segLen;
    }

    return points;
  }

  /**
   * Apply scratch color as a darkened overlay on the material's existing color map.
   */
  private applyScratchColor(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: ScratchParams,
    size: number
  ): void {
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw existing color map
    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = `#${material.color.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
    }

    // Draw scratches as subtle colored lines
    const localRng = new SeededRandom(params.seed + 100);
    const noise = new SeededNoiseGenerator(params.seed + 100);
    const mainAngle = Math.atan2(params.direction.y, params.direction.x);
    const scratchCount = Math.floor(params.density * 80);

    ctx.strokeStyle = `rgba(${Math.floor(params.color.r * 255)},${Math.floor(params.color.g * 255)},${Math.floor(params.color.b * 255)},${params.depth * 0.4})`;
    ctx.lineWidth = params.width;
    ctx.lineCap = 'round';

    for (let i = 0; i < scratchCount; i++) {
      const startX = localRng.nextFloat() * size;
      const startY = localRng.nextFloat() * size;
      const length = 30 + localRng.nextFloat() * 100;
      const angle = mainAngle + (localRng.nextFloat() - 0.5) * 0.4;

      const points = this.generateCurvedPath(
        startX, startY, angle, length, params.curvature, localRng, noise
      );

      if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let s = 1; s < points.length; s++) {
          ctx.lineTo(points[s][0], points[s][1]);
        }
        ctx.stroke();
      }
    }

    // Crosshatch
    if (params.crosshatch) {
      const perpAngle = mainAngle + Math.PI / 2;
      const crossRng = new SeededRandom(params.seed + 600);
      for (let i = 0; i < Math.floor(scratchCount * 0.6); i++) {
        const startX = crossRng.nextFloat() * size;
        const startY = crossRng.nextFloat() * size;
        const length = 20 + crossRng.nextFloat() * 80;
        const angle = perpAngle + (crossRng.nextFloat() - 0.5) * 0.4;

        const points = this.generateCurvedPath(
          startX, startY, angle, length, params.curvature, crossRng, noise
        );

        if (points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (let s = 1; s < points.length; s++) {
            ctx.lineTo(points[s][0], points[s][1]);
          }
          ctx.stroke();
        }
      }
    }

    const blended = new CanvasTexture(canvas);
    blended.wrapS = blended.wrapT = RepeatWrapping;
    material.map = blended;
  }

  // --------------------------------------------------------------------------
  // Internal — utilities
  // --------------------------------------------------------------------------

  private mergeWithDefaults(overrides: Partial<ScratchParams>): ScratchParams {
    return {
      direction: overrides.direction ?? DEFAULT_SCRATCH_PARAMS.direction.clone(),
      density: overrides.density ?? DEFAULT_SCRATCH_PARAMS.density,
      depth: overrides.depth ?? DEFAULT_SCRATCH_PARAMS.depth,
      width: overrides.width ?? DEFAULT_SCRATCH_PARAMS.width,
      curvature: overrides.curvature ?? DEFAULT_SCRATCH_PARAMS.curvature,
      crosshatch: overrides.crosshatch ?? DEFAULT_SCRATCH_PARAMS.crosshatch,
      color: overrides.color ?? DEFAULT_SCRATCH_PARAMS.color.clone(),
      seed: overrides.seed ?? DEFAULT_SCRATCH_PARAMS.seed,
    };
  }
}
