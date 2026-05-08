/**
 * ShaderVariantCache — Cache compiled shader programs to avoid recompilation
 *
 * Features:
 * - Key: shader source hash + defines + uniforms layout
 * - LRU eviction when cache exceeds size limit
 * - On-demand compilation with warm-up for known variants
 * - Statistics: cache hits, misses, evictions, compile time
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShaderVariantKey {
  /** Hash of the shader source code */
  sourceHash: string;
  /** Shader defines (e.g., { USE_MAP: 1, NUM_LIGHTS: 4 }) */
  defines: Record<string, string | number>;
  /** Uniform names (for layout matching) */
  uniformNames: string[];
}

export interface CachedShaderVariant {
  key: ShaderVariantKey;
  program: THREE.WebGLProgram;
  compiledAt: number;
  lastUsedAt: number;
  compileTimeMs: number;
  useCount: number;
}

export interface ShaderVariantCacheConfig {
  /** Maximum number of cached variants */
  maxSize: number;
  /** Enable warm-up compilation */
  enableWarmup: boolean;
  /** Compile timeout per variant (ms) */
  compileTimeoutMs: number;
}

export interface ShaderVariantCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  maxSize: number;
  totalCompileTimeMs: number;
  avgCompileTimeMs: number;
}

const DEFAULT_CONFIG: ShaderVariantCacheConfig = {
  maxSize: 128,
  enableWarmup: true,
  compileTimeoutMs: 5000,
};

// ---------------------------------------------------------------------------
// ShaderVariantCache class
// ---------------------------------------------------------------------------

export class ShaderVariantCache {
  private cache: Map<string, CachedShaderVariant> = new Map();
  private config: ShaderVariantCacheConfig;
  private stats: ShaderVariantCacheStats;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(config: Partial<ShaderVariantCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      maxSize: this.config.maxSize,
      totalCompileTimeMs: 0,
      avgCompileTimeMs: 0,
    };
  }

  /**
   * Set the renderer for shader compilation
   */
  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  /**
   * Get or compile a shader variant
   */
  getOrCreate(
    vertexShader: string,
    fragmentShader: string,
    defines: Record<string, string | number> = {},
    uniforms: Record<string, THREE.IUniform> = {}
  ): THREE.WebGLProgram | null {
    const key = this.buildKey(vertexShader, fragmentShader, defines, uniforms);
    const cacheKey = this.serializeKey(key);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastUsedAt = performance.now();
      cached.useCount++;
      this.stats.hits++;
      return cached.program;
    }

    // Cache miss — compile
    this.stats.misses++;
    const program = this.compileShader(vertexShader, fragmentShader, defines, uniforms);

    if (program) {
      this.addToCache(cacheKey, key, program);
    }

    return program;
  }

  /**
   * Warm up the cache by pre-compiling known shader variants
   */
  warmup(variants: Array<{
    vertexShader: string;
    fragmentShader: string;
    defines: Record<string, string | number>;
    uniforms: Record<string, THREE.IUniform>;
  }>): void {
    if (!this.config.enableWarmup || !this.renderer) return;

    for (const variant of variants) {
      const key = this.buildKey(
        variant.vertexShader,
        variant.fragmentShader,
        variant.defines,
        variant.uniforms
      );
      const cacheKey = this.serializeKey(key);

      if (this.cache.has(cacheKey)) continue;

      const program = this.compileShader(
        variant.vertexShader,
        variant.fragmentShader,
        variant.defines,
        variant.uniforms
      );

      if (program) {
        this.addToCache(cacheKey, key, program);
      }
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    // Delete programs from GPU
    if (this.renderer) {
      const gl = this.renderer.getContext();
      for (const [, variant] of this.cache) {
        gl.deleteProgram(variant.program);
      }
    }

    this.cache.clear();
    this.stats.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): ShaderVariantCacheStats {
    return { ...this.stats };
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  // -----------------------------------------------------------------------
  // Key generation
  // -----------------------------------------------------------------------

  private buildKey(
    vertexShader: string,
    fragmentShader: string,
    defines: Record<string, string | number>,
    uniforms: Record<string, THREE.IUniform>
  ): ShaderVariantKey {
    return {
      sourceHash: this.hashString(vertexShader + fragmentShader),
      defines: { ...defines },
      uniformNames: Object.keys(uniforms).sort(),
    };
  }

  private serializeKey(key: ShaderVariantKey): string {
    const definesStr = Object.entries(key.defines)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const uniformsStr = key.uniformNames.join(',');
    return `${key.sourceHash}|${definesStr}|${uniformsStr}`;
  }

  /**
   * Simple hash function for strings (djb2 variant)
   */
  private hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return (hash >>> 0).toString(36);
  }

  // -----------------------------------------------------------------------
  // Shader compilation
  // -----------------------------------------------------------------------

  private compileShader(
    vertexShader: string,
    fragmentShader: string,
    defines: Record<string, string | number>,
    _uniforms: Record<string, THREE.IUniform>
  ): THREE.WebGLProgram | null {
    if (!this.renderer) {
      console.warn('[ShaderVariantCache] No renderer set, cannot compile shader');
      return null;
    }

    const startTime = performance.now();

    try {
      const gl = this.renderer.getContext();

      // Prepend defines to shaders
      const defineLines = Object.entries(defines)
        .map(([k, v]) => `#define ${k} ${v}`)
        .join('\n');

      const vsSource = defineLines + '\n' + vertexShader;
      const fsSource = defineLines + '\n' + fragmentShader;

      // Compile vertex shader
      const vs = gl.createShader(gl.VERTEX_SHADER);
      if (!vs) return null;
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);

      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error('[ShaderVariantCache] Vertex shader compile error:', gl.getShaderInfoLog(vs));
        gl.deleteShader(vs);
        return null;
      }

      // Compile fragment shader
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      if (!fs) {
        gl.deleteShader(vs);
        return null;
      }
      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);

      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error('[ShaderVariantCache] Fragment shader compile error:', gl.getShaderInfoLog(fs));
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return null;
      }

      // Link program
      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return null;
      }

      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[ShaderVariantCache] Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return null;
      }

      // Clean up individual shaders (they're part of the program now)
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const compileTime = performance.now() - startTime;
      this.stats.totalCompileTimeMs += compileTime;
      this.stats.avgCompileTimeMs = this.stats.totalCompileTimeMs / (this.stats.hits + this.stats.misses);

      return program as unknown as THREE.WebGLProgram;
    } catch (err) {
      console.error('[ShaderVariantCache] Compilation error:', err);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Cache management (LRU)
  // -----------------------------------------------------------------------

  private addToCache(cacheKey: string, key: ShaderVariantKey, program: THREE.WebGLProgram): void {
    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const now = performance.now();
    this.cache.set(cacheKey, {
      key,
      program,
      compiledAt: now,
      lastUsedAt: now,
      compileTimeMs: 0,
      useCount: 1,
    });

    this.stats.currentSize = this.cache.size;
  }

  private evictLRU(): void {
    // Find least recently used
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, variant] of this.cache) {
      if (variant.lastUsedAt < oldestTime) {
        oldestTime = variant.lastUsedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      const evicted = this.cache.get(oldestKey);
      if (evicted && this.renderer) {
        const gl = this.renderer.getContext();
        gl.deleteProgram(evicted.program as unknown as WebGLProgram);
      }
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.clear();
    this.renderer = null;
  }
}
