import { createCanvas } from '../../utils/CanvasUtils';
/**
 * Edge Wear Material
 *
 * Implements the original Infinigen's edge_wear and scratches materials as a
 * post-processing system that modifies existing THREE.Material objects.
 *
 * The original Infinigen works by:
 * - Finding the MaterialOutput node and inserting a MixShader between the
 *   existing BSDF and the output
 * - Using Bevel-based edge detection for edge wear
 * - Adding Voronoi-based scratch patterns
 * - Combining displacement with original
 *
 * This R3F port applies edge wear and scratch effects to existing materials
 * by generating procedural texture maps and compositing them onto the
 * material's existing texture channels.
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
import { Noise3D, SeededNoiseGenerator } from '../../../core/util/math/noise';

// ============================================================================
// Interface
// ============================================================================

export interface EdgeWearParams {
  /** Color of worn areas (usually lighter / underlying material) */
  wearColor: Color;
  /** 0-1, how much wear to apply */
  wearIntensity: number;
  /** How far from edges wear extends (0-1) */
  edgeWidth: number;
  /** Number of scratches per unit area */
  scratchDensity: number;
  /** How visible scratches are (0-1) */
  scratchDepth: number;
  /** Primary scratch direction (normalized) */
  scratchDirection: Vector2;
  /** Optional rust coloring on worn areas (0-1) */
  rustIntensity: number;
  /** Seed for deterministic generation */
  seed: number;
}

// ============================================================================
// Presets
// ============================================================================

/** Static presets matching common material wear patterns */
export const EDGE_WEAR_PRESETS: Record<string, EdgeWearParams> = {
  chippedPaint: {
    wearColor: new Color(0xb0a898),
    wearIntensity: 0.7,
    edgeWidth: 0.25,
    scratchDensity: 0.4,
    scratchDepth: 0.6,
    scratchDirection: new Vector2(0.7, 0.3).normalize(),
    rustIntensity: 0.2,
    seed: 42,
  },
  wornMetal: {
    wearColor: new Color(0x8a8a8a),
    wearIntensity: 0.5,
    edgeWidth: 0.15,
    scratchDensity: 0.6,
    scratchDepth: 0.8,
    scratchDirection: new Vector2(0.95, 0.05).normalize(),
    rustIntensity: 0.4,
    seed: 137,
  },
  weatheredWood: {
    wearColor: new Color(0x9e8e72),
    wearIntensity: 0.6,
    edgeWidth: 0.3,
    scratchDensity: 0.2,
    scratchDepth: 0.3,
    scratchDirection: new Vector2(1.0, 0.0).normalize(),
    rustIntensity: 0.0,
    seed: 256,
  },
  agedStone: {
    wearColor: new Color(0x8a8070),
    wearIntensity: 0.4,
    edgeWidth: 0.35,
    scratchDensity: 0.1,
    scratchDepth: 0.2,
    scratchDirection: new Vector2(0.5, 0.5).normalize(),
    rustIntensity: 0.05,
    seed: 999,
  },
};

// ============================================================================
// EdgeWearMaterial Class
// ============================================================================

export class EdgeWearMaterial {
  private rng: SeededRandom;
  private noise: SeededNoiseGenerator;
  private legacyNoise: Noise3D;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.noise = new SeededNoiseGenerator(seed);
    this.legacyNoise = new Noise3D(seed);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Apply edge wear to an existing material.
   *
   * Generates edge detection and scratch maps, then composites them into the
   * material's existing color, roughness, and normal maps.
   */
  applyToMaterial(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: Partial<EdgeWearParams> = {}
  ): void {
    const fullParams = this.mergeWithDefaults(params);
    const size = 512;

    // Generate procedural maps
    const edgeWearMap = this.generateEdgeWearMap(size, size, fullParams);
    const scratchMap = this.generateScratchMap(size, size, fullParams);

    // Composite wear color into existing map texture
    this.compositeWearColor(material, edgeWearMap, fullParams);

    // Modify roughness (worn areas rougher for paint, smoother for metal)
    this.compositeWearRoughness(material, edgeWearMap, fullParams);

    // Add scratch normal perturbation
    this.compositeScratchNormals(material, scratchMap, fullParams);

    // Add rust overlay if requested
    if (fullParams.rustIntensity > 0) {
      this.compositeRustOverlay(material, fullParams, size);
    }

    material.needsUpdate = true;
  }

  /**
   * Generate a standalone edge wear map (grayscale mask of edge wear regions).
   * White = full wear, black = no wear.
   */
  generateEdgeWearMap(
    width: number,
    height: number,
    params: Partial<EdgeWearParams> = {}
  ): Texture {
    const fullParams = this.mergeWithDefaults(params);
    const localRng = new SeededRandom(fullParams.seed);
    const noise = new SeededNoiseGenerator(fullParams.seed);

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Start with black (no wear)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;

        // --- Simulated bevel-based edge detection ---
        // Sample noise at multiple scales to detect "edges" (sharp curvature changes)
        const n1 = noise.perlin3D(nx * 8, ny * 8, 0);
        const n2 = noise.perlin3D(nx * 16, ny * 16, 0.5);
        const n3 = noise.perlin3D(nx * 4, ny * 4, 1.0);

        // Gradient magnitude approximation — high gradient = edge
        const dx = noise.perlin3D((nx + 0.005) * 8, ny * 8, 0) - n1;
        const dy = noise.perlin3D(nx * 8, (ny + 0.005) * 8, 0) - n1;
        const gradientMag = Math.sqrt(dx * dx + dy * dy);

        // Edge proximity: edges have high gradient or sit near noise ridges
        const edgeProximity = gradientMag * 10 + Math.abs(n2) * 0.4;

        // Voronoi cell-edge contribution (simulates bevel edge between faces)
        const voronoiEdge = noise.voronoi2D(nx, ny, 6);
        const voronoiFactor = 1.0 - Math.min(1.0, voronoiEdge / fullParams.edgeWidth);

        // Combine edge signals
        let wearFactor = edgeProximity * fullParams.wearIntensity + voronoiFactor * fullParams.edgeWidth;

        // Add low-frequency variation for organic feel
        const variation = noise.perlin3D(nx * 3, ny * 3, 2.0) * 0.3 + 0.5;
        wearFactor *= variation;

        // Threshold & clamp
        wearFactor = Math.max(0, Math.min(1, wearFactor * fullParams.wearIntensity * 2.5));

        const brightness = Math.floor(wearFactor * 255);
        data[idx] = brightness;
        data[idx + 1] = brightness;
        data[idx + 2] = brightness;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  /**
   * Generate a standalone scratch map (directional noise-based scratch lines).
   * Encodes scratch intensity in the red channel and perpendicular direction in
   * the green/blue channels (useful for normal perturbation).
   */
  generateScratchMap(
    width: number,
    height: number,
    params: Partial<EdgeWearParams> = {}
  ): Texture {
    const fullParams = this.mergeWithDefaults(params);
    const localRng = new SeededRandom(fullParams.seed + 777);
    const noise = new SeededNoiseGenerator(fullParams.seed + 777);

    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    // Start with neutral (no scratch)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, width, height);

    const dir = fullParams.scratchDirection;
    const mainAngle = Math.atan2(dir.y, dir.x);

    // --- Voronoi-based scratch pattern ---
    // Scratches follow elongated Voronoi cells along the primary direction
    const scratchCount = Math.floor(fullParams.scratchDensity * 120);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;

        // Rotate coordinates to align with scratch direction
        const cosA = Math.cos(-mainAngle);
        const sinA = Math.sin(-mainAngle);
        const rx = nx * cosA - ny * sinA;
        const ry = nx * sinA + ny * cosA;

        // Stretched Voronoi for elongated cells along scratch direction
        const stretchFactor = 4.0 + fullParams.scratchDensity * 6.0;
        const voronoiDist = noise.voronoi2D(rx * stretchFactor, ry * stretchFactor * 0.3, 8);

        // Thin scratches along cell edges
        const scratchWidth = 0.02 + fullParams.scratchDepth * 0.04;
        const isScratch = voronoiDist < scratchWidth;

        if (isScratch) {
          const scratchIntensity = 1.0 - (voronoiDist / scratchWidth);
          const perpAngle = mainAngle + Math.PI / 2;

          // Normal perturbation perpendicular to scratch direction
          const perturbX = Math.cos(perpAngle) * scratchIntensity * fullParams.scratchDepth * 30;
          const perturbY = Math.sin(perpAngle) * scratchIntensity * fullParams.scratchDepth * 30;

          const r = Math.max(0, Math.min(255, Math.floor(128 + perturbX)));
          const g = Math.max(0, Math.min(255, Math.floor(128 + perturbY)));
          const b = 255; // Z is always up in tangent space

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // --- Additional fine directional scratches drawn as lines ---
    const fineScratchCount = Math.floor(fullParams.scratchDensity * 60);
    for (let i = 0; i < fineScratchCount; i++) {
      const sx = localRng.nextFloat() * width;
      const sy = localRng.nextFloat() * height;
      const angle = mainAngle + (localRng.nextFloat() - 0.5) * 0.4;
      const length = 20 + localRng.nextFloat() * 80 * fullParams.scratchDepth;

      const perpAngle = angle + Math.PI / 2;
      const depth = fullParams.scratchDepth * 15 * localRng.nextFloat();

      const r = Math.max(0, Math.min(255, Math.floor(128 + Math.cos(perpAngle) * depth)));
      const g = Math.max(0, Math.min(255, Math.floor(128 + Math.sin(perpAngle) * depth)));

      ctx.strokeStyle = `rgb(${r},${g},255)`;
      ctx.lineWidth = 1 + localRng.nextFloat() * 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);

      let cx = sx;
      let cy = sy;
      const segments = 2 + Math.floor(localRng.nextFloat() * 3);
      for (let s = 0; s < segments; s++) {
        cx += Math.cos(angle + (localRng.nextFloat() - 0.5) * 0.3) * (length / segments);
        cy += Math.sin(angle + (localRng.nextFloat() - 0.5) * 0.3) * (length / segments);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  // --------------------------------------------------------------------------
  // Internal — compositing helpers
  // --------------------------------------------------------------------------

  /**
   * Blend the wear color into the material's existing color map.
   */
  private compositeWearColor(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    edgeWearMap: Texture,
    params: EdgeWearParams
  ): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw existing map if present, otherwise fill with current color
    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = `#${material.color.getHexString()}`;
      ctx.fillRect(0, 0, size, size);
    }

    // Overlay wear color masked by edge wear map
    const wearSrc = edgeWearMap.image as HTMLCanvasElement | undefined;
    if (wearSrc) {
      // Create a temporary canvas with the wear color
      const wearCanvas = createCanvas();
      wearCanvas.width = size;
      wearCanvas.height = size;
      const wearCtx = wearCanvas.getContext('2d');
      if (wearCtx) {
        wearCtx.fillStyle = `#${params.wearColor.getHexString()}`;
        wearCtx.fillRect(0, 0, size, size);

        // Use the edge wear map as an alpha mask
        wearCtx.globalCompositeOperation = 'destination-in';
        wearCtx.drawImage(wearSrc as CanvasImageSource, 0, 0, size, size);
        wearCtx.globalCompositeOperation = 'source-over';

        // Composite the masked wear color onto the base
        ctx.globalAlpha = params.wearIntensity;
        ctx.drawImage(wearCanvas as CanvasImageSource, 0, 0, size, size);
        ctx.globalAlpha = 1.0;
      }
    }

    const blended = new CanvasTexture(canvas);
    blended.wrapS = blended.wrapT = RepeatWrapping;
    material.map = blended;
  }

  /**
   * Modify roughness map: worn areas are rougher for paint, smoother for metal.
   */
  private compositeWearRoughness(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    edgeWearMap: Texture,
    params: EdgeWearParams
  ): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw existing roughness map if present
    if (material.roughnessMap?.image) {
      ctx.drawImage(material.roughnessMap.image as CanvasImageSource, 0, 0, size, size);
    } else {
      const baseGray = Math.floor(material.roughness * 255);
      ctx.fillStyle = `rgb(${baseGray},${baseGray},${baseGray})`;
      ctx.fillRect(0, 0, size, size);
    }

    // Determine roughness direction: paint gets rougher, metal gets smoother
    const isMetal = material.metalness > 0.3;
    const roughnessDelta = isMetal ? -0.3 : 0.25;
    const deltaGray = Math.floor(roughnessDelta * params.wearIntensity * 255);

    // Apply wear roughness modification masked by edge wear
    const wearSrc = edgeWearMap.image as HTMLCanvasElement | undefined;
    if (wearSrc) {
      const existingData = ctx.getImageData(0, 0, size, size);
      const maskCtx = (edgeWearMap.image as HTMLCanvasElement).getContext('2d');
      if (maskCtx) {
        const maskData = maskCtx.getImageData(0, 0, size, size);
        for (let i = 0; i < existingData.data.length; i += 4) {
          const mask = maskData.data[i] / 255; // Red channel of mask
          const current = existingData.data[i];
          const modified = Math.max(0, Math.min(255, current + deltaGray * mask));
          existingData.data[i] = modified;
          existingData.data[i + 1] = modified;
          existingData.data[i + 2] = modified;
        }
        ctx.putImageData(existingData, 0, 0);
      }
    }

    const blended = new CanvasTexture(canvas);
    blended.wrapS = blended.wrapT = RepeatWrapping;
    material.roughnessMap = blended;
  }

  /**
   * Add scratch normal perturbation to the material's normal map.
   */
  private compositeScratchNormals(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    scratchMap: Texture,
    _params: EdgeWearParams
  ): void {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw existing normal map or flat neutral
    if (material.normalMap?.image) {
      ctx.drawImage(material.normalMap.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = '#8080ff';
      ctx.fillRect(0, 0, size, size);
    }

    // Overlay scratch normals
    const scratchSrc = scratchMap.image as HTMLCanvasElement | undefined;
    if (scratchSrc) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.7;
      ctx.drawImage(scratchSrc as CanvasImageSource, 0, 0, size, size);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }

    const blended = new CanvasTexture(canvas);
    blended.wrapS = blended.wrapT = RepeatWrapping;
    material.normalMap = blended;
    material.normalScale.set(1, 1);
  }

  /**
   * Add rust overlay to the material's color map.
   */
  private compositeRustOverlay(
    material: MeshStandardMaterial | MeshPhysicalMaterial,
    params: EdgeWearParams,
    size: number
  ): void {
    const canvas = createCanvas();
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current color map
    if (material.map?.image) {
      ctx.drawImage(material.map.image as CanvasImageSource, 0, 0, size, size);
    }

    // Generate rust patches
    const noise = new SeededNoiseGenerator(params.seed + 333);
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const nx = x / size;
        const ny = y / size;

        const n1 = noise.perlin3D(nx * 4, ny * 4, 0);
        const n2 = noise.perlin3D(nx * 12, ny * 12, 0.5);

        const rustThreshold = 0.35 - params.rustIntensity * 0.25;
        const rustFactor = Math.max(0, (n1 + n2 * 0.5) - rustThreshold);

        if (rustFactor > 0) {
          const alpha = Math.min(1, rustFactor * params.rustIntensity * 3);
          const r = Math.floor(160 + rustFactor * 50);
          const g = Math.floor(55 + rustFactor * 20);
          const b = Math.floor(15 + rustFactor * 10);

          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(x, y, 2, 2);
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

  private mergeWithDefaults(overrides: Partial<EdgeWearParams>): EdgeWearParams {
    return {
      wearColor: overrides.wearColor ?? new Color(0xb0a898),
      wearIntensity: overrides.wearIntensity ?? 0.5,
      edgeWidth: overrides.edgeWidth ?? 0.2,
      scratchDensity: overrides.scratchDensity ?? 0.3,
      scratchDepth: overrides.scratchDepth ?? 0.5,
      scratchDirection: overrides.scratchDirection ?? new Vector2(1, 0).normalize(),
      rustIntensity: overrides.rustIntensity ?? 0.0,
      seed: overrides.seed ?? this.rng.seed,
    };
  }
}
