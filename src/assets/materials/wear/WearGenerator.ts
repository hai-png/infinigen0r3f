import { createCanvas } from '../../utils/CanvasUtils';
/**
 * Wear and Tear Generator - Scratches, scuffs, dents, edge wear
 * Enhanced with: edge wear detection, directional/grouped scratches,
 * rust/patina overlay, dirt accumulation, paint peeling
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
  // New enhanced parameters
  edgeWearIntensity?: number;
  scratchStyle?: 'random' | 'directional' | 'grouped';
  scratchDirection?: number; // angle in radians for directional scratches
  rustIntensity?: number;    // metal-specific rust overlay
  patinaIntensity?: number;  // copper/bronze patina
  dirtInCrevices?: number;   // dirt accumulation in surface crevices
  dirtOnHorizontal?: number; // dirt on horizontal surfaces
  paintPeelAmount?: number;  // paint peeling for layered materials
  paintPeelScale?: number;   // scale of peeling patches
}

// ============================================================================
// Edge Wear Detection & Generation
// ============================================================================

/**
 * Generate edge wear map based on simulated mesh curvature.
 * Edges (high curvature areas) show more wear - paint chips, bare material.
 */
function generateEdgeWearMap(
  ctx: CanvasRenderingContext2D,
  size: number,
  intensity: number,
  rng: SeededRandom
): void {
  if (intensity <= 0) return;

  const noise = new Noise3D(rng.seed);

  // Simulate edge detection with directional gradients
  // In a real implementation, this would use mesh curvature data
  // Here we create edge-like patterns using noise thresholds

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Multi-scale edge detection simulation
      const n1 = noise.perlin(nx * 8, ny * 8, 0);
      const n2 = noise.perlin(nx * 16, ny * 16, 0);
      const n3 = noise.perlin(nx * 3, ny * 3, 0);

      // Sharp edges where gradient changes rapidly
      const edgeDetect = Math.abs(n1) * Math.abs(n2) + Math.abs(n3) * 0.3;

      // Threshold for edge areas
      const isEdge = edgeDetect > (0.4 - intensity * 0.3);

      if (isEdge) {
        const edgeValue = Math.min(1, edgeDetect * intensity * 2);
        const brightness = Math.floor(128 + edgeValue * 127);

        // Wear at edges reveals under-material (lighter in roughness)
        ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},${edgeValue * 0.8})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

// ============================================================================
// Scratch Generation (Enhanced)
// ============================================================================

/**
 * Generate directional scratches - all aligned in one direction
 */
function generateDirectionalScratches(
  ctx: CanvasRenderingContext2D,
  size: number,
  params: WearParams,
  rng: SeededRandom
): void {
  const count = Math.floor(params.scratchDensity * 80);
  const direction = params.scratchDirection ?? Math.PI * 0.25; // Default: diagonal

  for (let i = 0; i < count; i++) {
    const x = rng.nextFloat() * size;
    const y = rng.nextFloat() * size;
    const length = params.scratchLength * 50;

    // Small variation around the main direction
    const angle = direction + (rng.nextFloat() - 0.5) * 0.3;

    const brightness = 140 + rng.nextFloat() * 40;
    ctx.strokeStyle = `rgb(${Math.floor(brightness)},${Math.floor(brightness)},${Math.floor(brightness)})`;
    ctx.lineWidth = 1 + rng.nextFloat() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);

    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
}

/**
 * Generate grouped scratches - clusters of parallel scratches
 */
function generateGroupedScratches(
  ctx: CanvasRenderingContext2D,
  size: number,
  params: WearParams,
  rng: SeededRandom
): void {
  const groupCount = Math.floor(params.scratchDensity * 20);
  const scratchesPerGroup = 3 + Math.floor(rng.nextFloat() * 5);

  for (let g = 0; g < groupCount; g++) {
    const cx = rng.nextFloat() * size;
    const cy = rng.nextFloat() * size;
    const groupAngle = rng.nextFloat() * Math.PI * 2;
    const spread = 5 + rng.nextFloat() * 15;

    for (let s = 0; s < scratchesPerGroup; s++) {
      const offsetX = (rng.nextFloat() - 0.5) * spread;
      const offsetY = (rng.nextFloat() - 0.5) * spread;
      const x = cx + offsetX;
      const y = cy + offsetY;
      const length = params.scratchLength * 30 + rng.nextFloat() * 20;
      const angle = groupAngle + (rng.nextFloat() - 0.5) * 0.2;

      const brightness = 135 + rng.nextFloat() * 50;
      ctx.strokeStyle = `rgb(${Math.floor(brightness)},${Math.floor(brightness)},${Math.floor(brightness)})`;
      ctx.lineWidth = 1 + rng.nextFloat() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
  }
}

/**
 * Generate random scratches (original style, enhanced)
 */
function generateRandomScratches(
  ctx: CanvasRenderingContext2D,
  size: number,
  params: WearParams,
  rng: SeededRandom
): void {
  for (let i = 0; i < params.scratchDensity * 100; i++) {
    const x = rng.nextFloat() * size;
    const y = rng.nextFloat() * size;
    const length = params.scratchLength * 50;
    const angle = rng.nextFloat() * Math.PI * 2;

    const brightness = 140 + rng.nextFloat() * 40;
    ctx.strokeStyle = `rgb(${Math.floor(brightness)},${Math.floor(brightness)},${Math.floor(brightness)})`;
    ctx.lineWidth = 1 + rng.nextFloat() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);

    let cx = x, cy = y;
    const segments = 3 + Math.floor(rng.nextFloat() * 3);
    for (let s = 0; s < segments; s++) {
      cx += Math.cos(angle + (rng.nextFloat() - 0.5) * 0.5) * length / segments;
      cy += Math.sin(angle + (rng.nextFloat() - 0.5) * 0.5) * length / segments;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
}

// ============================================================================
// Rust/Patina Overlay
// ============================================================================

/**
 * Generate rust overlay - metal-specific oxidation patches
 */
function generateRustOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  intensity: number,
  rng: SeededRandom
): void {
  if (intensity <= 0) return;

  const noise = new Noise3D(rng.seed);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const nx = x / size;
      const ny = y / size;

      // Rust forms in patches, driven by noise
      const n1 = noise.perlin(nx * 4, ny * 4, 0);
      const n2 = noise.perlin(nx * 10, ny * 10, 0.5);

      // Rust threshold - only appears where noise exceeds a threshold
      const rustThreshold = 0.3 - intensity * 0.2;
      const rustFactor = Math.max(0, (n1 + n2 * 0.5) - rustThreshold);

      if (rustFactor > 0) {
        const alpha = Math.min(1, rustFactor * intensity * 3);
        // Rust is reddish-brown
        const r = Math.floor(160 + rustFactor * 60);
        const g = Math.floor(60 + rustFactor * 20);
        const b = Math.floor(20 + rustFactor * 10);

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}

/**
 * Generate patina overlay - copper/bronze greenish oxidation
 */
function generatePatinaOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  intensity: number,
  rng: SeededRandom
): void {
  if (intensity <= 0) return;

  const noise = new Noise3D(rng.seed);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const nx = x / size;
      const ny = y / size;

      const n = noise.perlin(nx * 3, ny * 3, 0.5);
      const n2 = noise.perlin(nx * 8, ny * 8, 0);

      const patinaFactor = Math.max(0, (n * 0.7 + n2 * 0.3) - (0.3 - intensity * 0.2));

      if (patinaFactor > 0) {
        const alpha = Math.min(1, patinaFactor * intensity * 2.5);
        // Patina is bluish-green
        const r = Math.floor(50 + patinaFactor * 30);
        const g = Math.floor(120 + patinaFactor * 40);
        const b = Math.floor(80 + patinaFactor * 30);

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}

// ============================================================================
// Dirt Accumulation
// ============================================================================

/**
 * Generate dirt in surface crevices (low areas detected by noise)
 */
function generateDirtInCrevices(
  ctx: CanvasRenderingContext2D,
  size: number,
  amount: number,
  rng: SeededRandom
): void {
  if (amount <= 0) return;

  const noise = new Noise3D(rng.seed);

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const nx = x / size;
      const ny = y / size;

      // Crevices are low-frequency noise valleys
      const n = noise.perlin(nx * 3, ny * 3, 0);
      const isCrevice = n < -0.1;

      if (isCrevice) {
        const depth = Math.abs(n + 0.1);
        const dirtAlpha = Math.min(1, depth * amount * 3);

        // Dirt is dark brown
        const v = Math.floor(40 + depth * 20);
        ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.7)},${Math.floor(v * 0.5)},${dirtAlpha})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}

/**
 * Generate dirt on horizontal surfaces (simulated by upper portions)
 */
function generateDirtOnHorizontal(
  ctx: CanvasRenderingContext2D,
  size: number,
  amount: number,
  rng: SeededRandom
): void {
  if (amount <= 0) return;

  const noise = new Noise3D(rng.seed);

  // Simulate gravity-based dirt accumulation
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x += 2) {
      const nx = x / size;
      const ny = y / size;

      // Horizontal surfaces are represented by flat regions (low noise gradient)
      const n = noise.perlin(nx * 5, ny * 5, 0);
      const gradX = noise.perlin((nx + 0.01) * 5, ny * 5, 0) - n;
      const gradY = noise.perlin(nx * 5, (ny + 0.01) * 5, 0) - n;

      // Low gradient = flat/horizontal
      const flatness = 1.0 - Math.min(1, Math.sqrt(gradX * gradX + gradY * gradY) * 50);

      if (flatness > 0.5) {
        const dirtAlpha = (flatness - 0.5) * 2 * amount * 0.5;
        if (dirtAlpha > 0.05) {
          const v = Math.floor(60 + rng.nextFloat() * 20);
          ctx.fillStyle = `rgba(${v},${Math.floor(v * 0.8)},${Math.floor(v * 0.6)},${dirtAlpha})`;
          ctx.fillRect(x, y, 2, 1);
        }
      }
    }
  }
}

// ============================================================================
// Paint Peeling
// ============================================================================

/**
 * Generate paint peeling overlay - reveals underlayer material
 */
function generatePaintPeeling(
  ctx: CanvasRenderingContext2D,
  size: number,
  amount: number,
  scale: number,
  rng: SeededRandom
): void {
  if (amount <= 0) return;

  const noise = new Noise3D(rng.seed);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Peeling starts at edges and works inward
      const n = noise.perlin(nx * scale, ny * scale, 0);

      // Create peeling patches
      const peelFactor = Math.max(0, n - (0.5 - amount * 0.4));

      if (peelFactor > 0) {
        // Paint peels reveal the underlayer
        const alpha = Math.min(1, peelFactor * amount * 4);

        // Peeling creates rough edges
        const edgeNoise = noise.perlin(nx * scale * 3, ny * scale * 3, 0.5);
        if (edgeNoise > 0) {
          // Underlayer is typically darker/duller
          const underR = Math.floor(80 + edgeNoise * 30);
          const underG = Math.floor(75 + edgeNoise * 25);
          const underB = Math.floor(70 + edgeNoise * 20);

          ctx.fillStyle = `rgba(${underR},${underG},${underB},${alpha})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}

// ============================================================================
// WearGenerator (Enhanced)
// ============================================================================

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
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    // Enhanced scratches based on style
    const scratchStyle = params.scratchStyle ?? 'random';
    switch (scratchStyle) {
      case 'directional':
        generateDirectionalScratches(ctx, size, params, rng);
        break;
      case 'grouped':
        generateGroupedScratches(ctx, size, params, rng);
        break;
      case 'random':
      default:
        generateRandomScratches(ctx, size, params, rng);
        break;
    }

    // Scuffs
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

    // Edge wear (enhanced)
    if ((params.edgeWearIntensity ?? params.edgeWear) > 0) {
      const edgeIntensity = params.edgeWearIntensity ?? params.edgeWear;
      generateEdgeWearMap(ctx, size, edgeIntensity, rng);
    }

    // Rust overlay (metal-specific)
    if ((params.rustIntensity ?? 0) > 0) {
      generateRustOverlay(ctx, size, params.rustIntensity ?? 0, rng);
    }

    // Patina overlay (copper-specific)
    if ((params.patinaIntensity ?? 0) > 0) {
      generatePatinaOverlay(ctx, size, params.patinaIntensity ?? 0, rng);
    }

    // Paint peeling
    if ((params.paintPeelAmount ?? 0) > 0) {
      generatePaintPeeling(ctx, size, params.paintPeelAmount ?? 0, params.paintPeelScale ?? 5, rng);
    }

    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  }

  private generateNormalWear(params: WearParams, rng: SeededRandom): Texture {
    const size = 512;
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Scratch normal perturbation
    const scratchStyle = params.scratchStyle ?? 'random';
    const scratchAngles: number[] = [];

    if (scratchStyle === 'directional') {
      const dir = params.scratchDirection ?? Math.PI * 0.25;
      for (let i = 0; i < params.scratchDensity * 80; i++) {
        scratchAngles.push(dir + (rng.nextFloat() - 0.5) * 0.3);
      }
    } else if (scratchStyle === 'grouped') {
      const groupCount = Math.floor(params.scratchDensity * 20);
      for (let g = 0; g < groupCount; g++) {
        const groupAngle = rng.nextFloat() * Math.PI * 2;
        const count = 3 + Math.floor(rng.nextFloat() * 5);
        for (let s = 0; s < count; s++) {
          scratchAngles.push(groupAngle + (rng.nextFloat() - 0.5) * 0.2);
        }
      }
    } else {
      for (let i = 0; i < params.scratchDensity * 80; i++) {
        scratchAngles.push(rng.nextFloat() * Math.PI * 2);
      }
    }

    for (let i = 0; i < scratchAngles.length; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const length = params.scratchLength * 40;
      const angle = scratchAngles[i];
      const perpAngle = angle + Math.PI / 2;
      const depth = params.scratchDepth * 8;

      let cx = x, cy = y;
      const segments = 3 + Math.floor(rng.nextFloat() * 3);
      for (let s = 0; s < segments; s++) {
        cx += Math.cos(angle + (rng.nextFloat() - 0.5) * 0.4) * length / segments;
        cy += Math.sin(angle + (rng.nextFloat() - 0.5) * 0.4) * length / segments;

        const r = Math.max(0, Math.min(255, 128 + Math.cos(perpAngle) * depth));
        const g = Math.max(0, Math.min(255, 128 + Math.sin(perpAngle) * depth));
        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},255)`;
        ctx.fillRect(cx - 1, cy - 1, 3, 3);
      }
    }

    // Dents
    for (let i = 0; i < params.dentCount; i++) {
      const x = rng.nextFloat() * size;
      const y = rng.nextFloat() * size;
      const r = 10 + rng.nextFloat() * 30;

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
    const canvas = createCanvas();
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new CanvasTexture(canvas);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Dirt in crevices (enhanced)
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

    // Enhanced dirt in crevices
    if ((params.dirtInCrevices ?? 0) > 0) {
      generateDirtInCrevices(ctx, size, params.dirtInCrevices ?? 0, rng);
    }

    // Dirt on horizontal surfaces
    if ((params.dirtOnHorizontal ?? 0) > 0) {
      generateDirtOnHorizontal(ctx, size, params.dirtOnHorizontal ?? 0, rng);
    }

    // Edge wear darkening
    if (params.edgeWear > 0) {
      const borderWidth = 30;
      const edgeDarken = params.edgeWear * 80;

      for (let y = 0; y < borderWidth; y++) {
        const factor = 1 - (y / borderWidth);
        const darkening = Math.floor(edgeDarken * factor);
        ctx.fillStyle = `rgb(${255 - darkening},${255 - darkening},${255 - darkening})`;
        ctx.fillRect(0, y, size, 1);
        ctx.fillRect(0, size - y - 1, size, 1);
      }
      for (let x = 0; x < borderWidth; x++) {
        const factor = 1 - (x / borderWidth);
        const darkening = Math.floor(edgeDarken * factor);
        ctx.fillStyle = `rgb(${255 - darkening},${255 - darkening},${255 - darkening})`;
        ctx.fillRect(x, 0, 1, size);
        ctx.fillRect(size - x - 1, 0, 1, size);
      }
    }

    // Paint peeling in AO
    if ((params.paintPeelAmount ?? 0) > 0) {
      const noise = new Noise3D(rng.seed + 100);
      for (let y = 0; y < size; y += 2) {
        for (let x = 0; x < size; x += 2) {
          const nx = x / size;
          const ny = y / size;
          const n = noise.perlin(nx * (params.paintPeelScale ?? 5), ny * (params.paintPeelScale ?? 5), 0);
          const peelFactor = Math.max(0, n - (0.5 - (params.paintPeelAmount ?? 0) * 0.4));
          if (peelFactor > 0) {
            const darkening = Math.floor(peelFactor * 50);
            ctx.fillStyle = `rgba(${255 - darkening},${255 - darkening},${255 - darkening},${Math.min(1, peelFactor * 2)})`;
            ctx.fillRect(x, y, 2, 2);
          }
        }
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
      edgeWearIntensity: 0.3,
      scratchStyle: 'random',
      scratchDirection: 0,
      rustIntensity: 0,
      patinaIntensity: 0,
      dirtInCrevices: 0,
      dirtOnHorizontal: 0,
      paintPeelAmount: 0,
      paintPeelScale: 5,
    };
  }

  /**
   * Get wear params for metal materials
   */
  getMetalWearParams(rustLevel: number = 0.3): WearParams {
    return {
      ...this.getDefaultParams(),
      scratchDensity: 0.4,
      scratchStyle: 'directional',
      scratchDirection: Math.PI * 0.1,
      edgeWearIntensity: 0.5,
      rustIntensity: rustLevel,
      dirtInCrevices: 0.2,
    };
  }

  /**
   * Get wear params for stone/concrete materials
   */
  getStoneWearParams(): WearParams {
    return {
      ...this.getDefaultParams(),
      scratchDensity: 0.1,
      edgeWearIntensity: 0.6,
      dentCount: 10,
      dirtInCrevices: 0.5,
      dirtOnHorizontal: 0.3,
    };
  }

  /**
   * Get wear params for wood materials
   */
  getWoodWearParams(): WearParams {
    return {
      ...this.getDefaultParams(),
      scratchDensity: 0.3,
      scratchStyle: 'grouped',
      edgeWearIntensity: 0.4,
      dirtAccumulation: 0.3,
      paintPeelAmount: 0.2,
      paintPeelScale: 3,
    };
  }

  /**
   * Get wear params for painted surfaces
   */
  getPaintedWearParams(peelAmount: number = 0.4): WearParams {
    return {
      ...this.getDefaultParams(),
      scratchDensity: 0.2,
      edgeWearIntensity: 0.5,
      paintPeelAmount: peelAmount,
      paintPeelScale: 4,
      dirtOnHorizontal: 0.2,
    };
  }

  /**
   * Apply wear maps onto an existing material's maps using canvas compositing.
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
      const canvas = createCanvas();
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
      const canvas = createCanvas();
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

    // Apply AO map
    if (material.aoMap) {
      const size = 512;
      const canvas = createCanvas();
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

    // Increase roughness from scuff wear
    material.roughness = Math.min(1.0, material.roughness + params.scuffDensity * 0.1);
    material.needsUpdate = true;
  }
}
