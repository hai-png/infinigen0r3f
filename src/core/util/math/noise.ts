/**
 * Noise Functions
 * Re-exports from MathUtils for backward compatibility with vegetation generators
 */

export { 
  noise3D, 
  noise2D, 
  voronoi2D, 
  ridgedMultifractal
} from '../MathUtils';

/**
 * Fractal Brownian Motion - layered noise function
 */
export function fbm(
  x: number,
  y: number,
  z: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  persistence: number = 0.5,
  scale: number = 1.0
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxValue;
}

/**
 * Noise function type signature
 */
export type NoiseFunction = (x: number, y: number, z: number, scale?: number) => number;

/**
 * Legacy Noise3D class wrapper for backward compatibility
 */
export class Noise3D {
  private seed: number;
  
  constructor(seed: number = Math.random() * 1000) {
    this.seed = seed;
  }
  
  perlin(x: number, y: number, z: number): number {
    return noise3D(x, y, z, this.seed);
  }
  
  evaluate(x: number, y: number, z: number): number {
    return this.perlin(x, y, z);
  }
  
  setSeed(seed: number): void {
    this.seed = seed;
  }
}
