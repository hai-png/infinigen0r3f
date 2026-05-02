/**
 * GPUComputeManager — Abstract GPU compute layer
 *
 * Uses WebGPU when available, falls back to CPU implementations.
 * Compute shaders for:
 * - Terrain SDF evaluation
 * - Hydraulic erosion simulation
 * - Marching cubes meshing
 * - Noise texture generation (3D)
 *
 * Features:
 * - Feature detection at init (graceful if unavailable)
 * - Automatic CPU fallback
 * - Async compute job queue with priority
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComputeJobType = 'terrain_sdf' | 'hydraulic_erosion' | 'marching_cubes' | 'noise_3d';

export interface ComputeJob {
  id: string;
  type: ComputeJobType;
  params: Record<string, any>;
  inputBuffer?: ArrayBuffer;
  priority: number; // Lower = higher priority
  resolve: (result: ComputeJobResult) => void;
  reject: (error: Error) => void;
}

export interface ComputeJobResult {
  data: ArrayBuffer;
  metadata: Record<string, any>;
  gpuUsed: boolean;
  executionTimeMs: number;
}

export interface GPUComputeCapabilities {
  webgpuAvailable: boolean;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupSize: number;
  adapterInfo: string;
}

export interface GPUComputeConfig {
  enableGPU: boolean;
  maxConcurrentJobs: number;
  jobTimeoutMs: number;
}

const DEFAULT_CONFIG: GPUComputeConfig = {
  enableGPU: true,
  maxConcurrentJobs: 4,
  jobTimeoutMs: 30000,
};

// ---------------------------------------------------------------------------
// WGSL Compute Shaders
// ---------------------------------------------------------------------------

const TERRAIN_SDF_SHADER = `
struct Params {
  gridSize: u32,
  heightScale: f32,
  frequency: f32,
  octaves: u32,
  seed: f32,
  persistence: f32,
  lacunarity: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

fn hash(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn noise3d(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), u.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), u.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

fn fbm(p: vec3<f32>) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var pos = p;
  for (var i = 0u; i < 6u; i = i + 1u) {
    if (i >= params.octaves) { break; }
    value += amplitude * noise3d(pos);
    pos *= params.lacunarity;
    amplitude *= params.persistence;
  }
  return value;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  let gridSize = params.gridSize;
  if (idx >= gridSize * gridSize) { return; }

  let x = f32(idx % gridSize) / f32(gridSize);
  let z = f32(idx / gridSize) / f32(gridSize);
  let p = vec3<f32>(x * params.frequency + params.seed, 0.0, z * params.frequency + params.seed);

  let height = fbm(p) * params.heightScale;
  output[idx] = height;
}
`;

const HYDRAULIC_EROSION_SHADER = `
struct ErosionParams {
  width: u32,
  height: u32,
  iterations: u32,
  erosionRadius: f32,
  inertia: f32,
  sedimentCapacityFactor: f32,
  minSedimentCapacity: f32,
  erodeSpeed: f32,
  depositSpeed: f32,
  evaporateSpeed: f32,
  gravity: f32,
  maxDropletLifetime: u32,
  initialWaterVolume: f32,
  initialSpeed: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> params: ErosionParams;
@group(0) @binding(1) var<storage, read_write> heightmap: array<f32>;

fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= params.iterations) { return; }

  let w = f32(params.width);
  let h = f32(params.height);

  // Simple erosion approximation: smooth heightmap slightly
  for (var iter = 0u; iter < params.maxDropletLifetime; iter = iter + 1u) {
    let px = hash(vec2<f32>(f32(idx), f32(iter) + params.seed)) * w;
    let py = hash(vec2<f32>(f32(idx) + 100.0, f32(iter) + params.seed)) * h;

    let ix = u32(px);
    let iy = u32(py);

    if (ix >= params.width || iy >= params.height) { continue; }

    let currentIdx = iy * params.width + ix;
    let currentH = heightmap[currentIdx];

    // Find steepest descent
    var minH = currentH;
    var minIdx = currentIdx;
    for (var dy = -1i; dy <= 1i; dy = dy + 1i) {
      for (var dx = -1i; dx <= 1i; dx = dx + 1i) {
        let nx = i32(ix) + dx;
        let ny = i32(iy) + dy;
        if (nx < 0 || ny < 0 || u32(nx) >= params.width || u32(ny) >= params.height) { continue; }
        let neighborIdx = u32(ny) * params.width + u32(nx);
        if (heightmap[neighborIdx] < minH) {
          minH = heightmap[neighborIdx];
          minIdx = neighborIdx;
        }
      }
    }

    // Erode current, deposit at lowest neighbor
    let delta = (currentH - minH) * params.erodeSpeed * 0.01;
    heightmap[currentIdx] = heightmap[currentIdx] - delta;
    heightmap[minIdx] = heightmap[minIdx] + delta * params.depositSpeed;
  }
}
`;

const MARCHING_CUBES_SHADER = `
struct MCParams {
  gridSize: u32,
  isoValue: f32,
  voxelSize: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> params: MCParams;
@group(0) @binding(1) var<storage, read> sdf: array<f32>;
@group(0) @binding(2) var<storage, read_write> vertices: array<f32>;
@group(0) @binding(3) var<storage, read_write> vertexCount: atomic<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  let gs = params.gridSize;
  let gs2 = gs * gs;

  if (idx >= gs2) { return; }

  let ix = idx % gs;
  let iy = (idx / gs) % gs;
  let iz = idx / gs2;

  if (ix >= gs - 1u || iy >= gs - 1u || iz >= gs - 1u) { return; }

  // Sample 8 corners of the cube
  let i000 = iz * gs2 + iy * gs + ix;
  let corners = array<f32, 8>(
    sdf[i000], sdf[i000 + 1u],
    sdf[i000 + gs], sdf[i000 + gs + 1u],
    sdf[i000 + gs2], sdf[i000 + gs2 + 1u],
    sdf[i000 + gs2 + gs], sdf[i000 + gs2 + gs + 1u]
  );

  // Compute cube index
  var cubeIndex = 0u;
  for (var i = 0u; i < 8u; i = i + 1u) {
    if (corners[i] < params.isoValue) {
      cubeIndex = cubeIndex | (1u << i);
    }
  }

  // If cube is entirely inside or outside, skip
  if (cubeIndex == 0u || cubeIndex == 255u) { return; }

  // For each active edge, interpolate vertex position
  let x = f32(ix) * params.voxelSize;
  let y = f32(iy) * params.voxelSize;
  let z = f32(iz) * params.voxelSize;
  let vs = params.voxelSize;

  // Simple approach: emit up to 5 triangles (3 vertices each)
  // In a full implementation, this would use the edge table
  var vIdx = atomicAdd(&vertexCount, 3u);
  if (vIdx + 2u < arrayLength(&vertices) / 3u) {
    let offset = vIdx * 3u;
    vertices[offset] = x; vertices[offset + 1u] = y; vertices[offset + 2u] = z;
    vertices[offset + 3u] = x + vs; vertices[offset + 4u] = y; vertices[offset + 5u] = z;
    vertices[offset + 6u] = x; vertices[offset + 7u] = y + vs; vertices[offset + 8u] = z;
  }
}
`;

const NOISE_3D_SHADER = `
struct NoiseParams {
  resolution: u32,
  frequency: f32,
  octaves: u32,
  persistence: f32,
  lacunarity: f32,
  seed: f32,
  padding: f32,
  padding2: f32,
};

@group(0) @binding(0) var<uniform> params: NoiseParams;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

fn hash3(p: vec3<f32>) -> f32 {
  var p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn noise3d(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1,0,0)), u.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

fn fbm(p: vec3<f32>) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var pos = p;
  for (var i = 0u; i < 8u; i = i + 1u) {
    if (i >= params.octaves) { break; }
    value += amplitude * noise3d(pos);
    pos *= params.lacunarity;
    amplitude *= params.persistence;
  }
  return value;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  let res = params.resolution;
  let total = res * res * res;
  if (idx >= total) { return; }

  let z = f32(idx / (res * res));
  let y = f32((idx / res) % res);
  let x = f32(idx % res);

  let p = vec3<f32>(x, y, z) / f32(res) * params.frequency + params.seed;
  output[idx] = fbm(p);
}
`;

// ---------------------------------------------------------------------------
// GPUComputeManager class
// ---------------------------------------------------------------------------

export class GPUComputeManager {
  private device: GPUDevice | null = null;
  private capabilities: GPUComputeCapabilities;
  private config: GPUComputeConfig;
  private jobQueue: ComputeJob[] = [];
  private activeJobs: number = 0;
  private initialized: boolean = false;
  private jobCounter: number = 0;

  constructor(config: Partial<GPUComputeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.capabilities = {
      webgpuAvailable: false,
      maxStorageBufferBindingSize: 0,
      maxComputeWorkgroupSize: 0,
      adapterInfo: '',
    };
  }

  /**
   * Initialize the GPU compute manager — detects WebGPU availability
   */
  async init(): Promise<GPUComputeCapabilities> {
    if (this.initialized) return this.capabilities;

    this.capabilities.webgpuAvailable = false;

    if (!this.config.enableGPU) {
      this.initialized = true;
      return this.capabilities;
    }

    // Feature detection — graceful if unavailable
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) {
        console.warn('[GPUComputeManager] WebGPU not available, using CPU fallback');
        this.initialized = true;
        return this.capabilities;
      }

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        console.warn('[GPUComputeManager] No WebGPU adapter found');
        this.initialized = true;
        return this.capabilities;
      }

      this.device = await adapter.requestDevice();
      this.capabilities.webgpuAvailable = true;
      this.capabilities.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
      this.capabilities.maxComputeWorkgroupSize = adapter.limits.maxComputeInvocationsPerWorkgroup;
      this.capabilities.adapterInfo = adapter.info?.description || 'Unknown GPU';

      // Handle device loss
      this.device.lost.then((info: GPUDeviceLostInfo) => {
        console.error('[GPUComputeManager] Device lost:', info.message);
        this.device = null;
        this.capabilities.webgpuAvailable = false;
      });

      console.log('[GPUComputeManager] WebGPU initialized:', this.capabilities.adapterInfo);
    } catch (err) {
      console.warn('[GPUComputeManager] WebGPU init failed, using CPU fallback:', err);
    }

    this.initialized = true;
    return this.capabilities;
  }

  /**
   * Get capabilities
   */
  getCapabilities(): GPUComputeCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if GPU compute is available
   */
  isGPUAvailable(): boolean {
    return this.capabilities.webgpuAvailable && this.device !== null && !this.device.destroyed;
  }

  // -----------------------------------------------------------------------
  // Compute job submission
  // -----------------------------------------------------------------------

  /**
   * Submit a compute job to the queue
   */
  submitJob(
    type: ComputeJobType,
    params: Record<string, any>,
    priority: number = 5,
    inputBuffer?: ArrayBuffer
  ): Promise<ComputeJobResult> {
    return new Promise((resolve, reject) => {
      const job: ComputeJob = {
        id: `compute_${this.jobCounter++}`,
        type,
        params,
        inputBuffer,
        priority,
        resolve,
        reject,
      };

      this.jobQueue.push(job);
      this.jobQueue.sort((a, b) => a.priority - b.priority);

      this.processQueue();
    });
  }

  /**
   * Convenience: evaluate terrain SDF
   */
  async evaluateTerrainSDF(
    gridSize: number,
    heightScale: number,
    frequency: number,
    octaves: number,
    seed: number,
    persistence: number = 0.5,
    lacunarity: number = 2.0
  ): Promise<ComputeJobResult> {
    return this.submitJob('terrain_sdf', {
      gridSize, heightScale, frequency, octaves, seed, persistence, lacunarity,
    }, 3);
  }

  /**
   * Convenience: simulate hydraulic erosion
   */
  async simulateErosion(
    width: number,
    height: number,
    iterations: number,
    heightmap: Float32Array,
    erosionRadius: number = 3,
    inertia: number = 0.05,
    erodeSpeed: number = 0.3,
    depositSpeed: number = 0.3,
    seed: number = 42
  ): Promise<ComputeJobResult> {
    return this.submitJob('hydraulic_erosion', {
      width, height, iterations, erosionRadius, inertia, erodeSpeed, depositSpeed, seed,
    }, 4, heightmap.buffer as ArrayBuffer);
  }

  /**
   * Convenience: generate 3D noise texture
   */
  async generateNoise3D(
    resolution: number,
    frequency: number,
    octaves: number,
    persistence: number = 0.5,
    lacunarity: number = 2.0,
    seed: number = 0
  ): Promise<ComputeJobResult> {
    return this.submitJob('noise_3d', {
      resolution, frequency, octaves, persistence, lacunarity, seed,
    }, 5);
  }

  // -----------------------------------------------------------------------
  // Queue processing
  // -----------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    while (this.jobQueue.length > 0 && this.activeJobs < this.config.maxConcurrentJobs) {
      const job = this.jobQueue.shift();
      if (!job) break;

      this.activeJobs++;
      try {
        const result = await this.executeJob(job);
        job.resolve(result);
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.activeJobs--;
      }
    }
  }

  private async executeJob(job: ComputeJob): Promise<ComputeJobResult> {
    const startTime = performance.now();

    // Try GPU path
    if (this.isGPUAvailable()) {
      try {
        const result = await this.executeGPUJob(job);
        result.executionTimeMs = performance.now() - startTime;
        return result;
      } catch (err) {
        console.warn(`[GPUComputeManager] GPU job '${job.type}' failed, falling back to CPU:`, err);
      }
    }

    // CPU fallback
    const result = this.executeCPUJob(job);
    result.executionTimeMs = performance.now() - startTime;
    return result;
  }

  // -----------------------------------------------------------------------
  // GPU execution
  // -----------------------------------------------------------------------

  private async executeGPUJob(job: ComputeJob): Promise<ComputeJobResult> {
    if (!this.device) throw new Error('No GPU device');

    const shaderCode = this.getShaderCode(job.type);
    const inputData = this.prepareInputData(job);
    const outputSize = this.computeOutputSize(job);

    // Create shader module
    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    // Create buffers
    const uniformBuffer = this.device.createBuffer({
      size: inputData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(uniformBuffer.getMappedRange()).set(new Float32Array(inputData));
    uniformBuffer.unmap();

    const outputBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const readBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create pipeline
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    const bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
      ],
    });

    // Execute
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);

    const workgroupCount = Math.ceil(this.getWorkgroupSize(job) / 64);
    passEncoder.dispatchWorkgroups(workgroupCount);
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputSize);
    this.device.queue.submit([commandEncoder.finish()]);

    // Read results
    await readBuffer.mapAsync(GPUMapMode.READ);
    const resultData = new ArrayBuffer(outputSize);
    new Uint8Array(resultData).set(new Uint8Array(readBuffer.getMappedRange()));
    readBuffer.unmap();

    // Cleanup
    uniformBuffer.destroy();
    outputBuffer.destroy();
    readBuffer.destroy();

    return {
      data: resultData,
      metadata: { type: job.type, gpuUsed: true },
      gpuUsed: true,
      executionTimeMs: 0,
    };
  }

  // -----------------------------------------------------------------------
  // CPU fallback implementations
  // -----------------------------------------------------------------------

  private executeCPUJob(job: ComputeJob): ComputeJobResult {
    switch (job.type) {
      case 'terrain_sdf':
        return this.cpuTerrainSDF(job);
      case 'hydraulic_erosion':
        return this.cpuHydraulicErosion(job);
      case 'marching_cubes':
        return this.cpuMarchingCubes(job);
      case 'noise_3d':
        return this.cpuNoise3DJob(job);
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  }

  private cpuTerrainSDF(job: ComputeJob): ComputeJobResult {
    const { gridSize, heightScale, frequency, octaves, seed, persistence, lacunarity } = job.params;
    const size = gridSize * gridSize;
    const output = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const x = (i % gridSize) / gridSize;
      const z = Math.floor(i / gridSize) / gridSize;

      let value = 0;
      let amplitude = 0.5;
      let freq = frequency;
      let px = x * freq + seed;
      let pz = z * freq + seed;

      for (let o = 0; o < (octaves || 6); o++) {
        value += amplitude * this.cpuNoise2D(px, pz);
        px *= lacunarity;
        pz *= lacunarity;
        amplitude *= persistence;
      }

      output[i] = value * heightScale;
    }

    return {
      data: output.buffer as ArrayBuffer,
      metadata: { gridSize, type: 'terrain_sdf' },
      gpuUsed: false,
      executionTimeMs: 0,
    };
  }

  private cpuHydraulicErosion(job: ComputeJob): ComputeJobResult {
    const { width, height, iterations, erodeSpeed, depositSpeed, seed } = job.params;
    const size = width * height;

    // Clone input heightmap or create new one
    let heightmap: Float32Array;
    if (job.inputBuffer) {
      heightmap = new Float32Array(job.inputBuffer.slice(0));
    } else {
      heightmap = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        heightmap[i] = Math.random() * 0.5;
      }
    }

    // Simple erosion: smooth and add some variation
    const iters = Math.min(iterations || 100, 500);
    for (let iter = 0; iter < iters; iter++) {
      const px = Math.floor(this.cpuRandom(iter + seed) * width);
      const py = Math.floor(this.cpuRandom(iter + seed + 1000) * height);

      if (px >= width || py >= height) continue;

      const idx = py * width + px;
      let currentH = heightmap[idx];
      let cx = px, cy = py;

      for (let step = 0; step < 30; step++) {
        let minH = currentH;
        let minDx = 0, minDy = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nh = heightmap[ny * width + nx];
            if (nh < minH) {
              minH = nh;
              minDx = dx;
              minDy = dy;
            }
          }
        }

        if (minH >= currentH) break;

        const delta = (currentH - minH) * (erodeSpeed || 0.3) * 0.01;
        heightmap[cy * width + cx] -= delta;
        cx += minDx;
        cy += minDy;
        currentH = minH + delta * (depositSpeed || 0.3);
        if (cx >= 0 && cy >= 0 && cx < width && cy < height) {
          heightmap[cy * width + cx] += delta * (depositSpeed || 0.3);
        }
      }
    }

    return {
      data: heightmap.buffer as ArrayBuffer,
      metadata: { width, height, type: 'hydraulic_erosion' },
      gpuUsed: false,
      executionTimeMs: 0,
    };
  }

  private cpuMarchingCubes(job: ComputeJob): ComputeJobResult {
    // Simple CPU marching cubes placeholder
    const { gridSize = 32, voxelSize = 1.0 } = job.params;
    const vertices = new Float32Array(gridSize * gridSize * gridSize * 3); // Over-allocated
    let count = 0;

    for (let z = 0; z < gridSize - 1 && count < vertices.length / 3 - 3; z++) {
      for (let y = 0; y < gridSize - 1 && count < vertices.length / 3 - 3; y++) {
        for (let x = 0; x < gridSize - 1 && count < vertices.length / 3 - 3; x++) {
          // Placeholder: emit a triangle for each voxel
          vertices[count * 3] = x * voxelSize;
          vertices[count * 3 + 1] = y * voxelSize;
          vertices[count * 3 + 2] = z * voxelSize;
          count++;
        }
      }
    }

    return {
      data: vertices.buffer.slice(0, count * 3 * 4),
      metadata: { vertexCount: count, type: 'marching_cubes' },
      gpuUsed: false,
      executionTimeMs: 0,
    };
  }

  private cpuNoise3DJob(job: ComputeJob): ComputeJobResult {
    const { resolution = 64, frequency = 1.0, octaves = 4, persistence = 0.5, lacunarity = 2.0, seed = 0 } = job.params;
    const size = resolution * resolution * resolution;
    const output = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const z = Math.floor(i / (resolution * resolution));
      const y = Math.floor((i / resolution) % resolution);
      const x = i % resolution;

      let value = 0;
      let amplitude = 0.5;
      let fx = (x / resolution) * frequency + seed;
      let fy = (y / resolution) * frequency + seed;
      let fz = (z / resolution) * frequency + seed;

      for (let o = 0; o < octaves; o++) {
        value += amplitude * this.cpuNoise3D(fx, fy, fz);
        fx *= lacunarity;
        fy *= lacunarity;
        fz *= lacunarity;
        amplitude *= persistence;
      }

      output[i] = value;
    }

    return {
      data: output.buffer as ArrayBuffer,
      metadata: { resolution, type: 'noise_3d' },
      gpuUsed: false,
      executionTimeMs: 0,
    };
  }

  // -----------------------------------------------------------------------
  // CPU noise implementations
  // -----------------------------------------------------------------------

  private cpuNoise2D(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const a = this.cpuHash2(ix, iy);
    const b = this.cpuHash2(ix + 1, iy);
    const c = this.cpuHash2(ix, iy + 1);
    const d = this.cpuHash2(ix + 1, iy + 1);

    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  private cpuNoise3D(x: number, y: number, z: number): number {
    const n0 = this.cpuHash3(x, y, z);
    const n1 = this.cpuHash3(x + 1, y, z);
    const n2 = this.cpuHash3(x, y + 1, z);
    const n3 = this.cpuHash3(x + 1, y + 1, z);
    const n4 = this.cpuHash3(x, y, z + 1);
    const n5 = this.cpuHash3(x + 1, y, z + 1);
    const n6 = this.cpuHash3(x, y + 1, z + 1);
    const n7 = this.cpuHash3(x + 1, y + 1, z + 1);

    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const fz = z - Math.floor(z);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    return (
      n0 * (1 - ux) * (1 - uy) * (1 - uz) +
      n1 * ux * (1 - uy) * (1 - uz) +
      n2 * (1 - ux) * uy * (1 - uz) +
      n3 * ux * uy * (1 - uz) +
      n4 * (1 - ux) * (1 - uy) * uz +
      n5 * ux * (1 - uy) * uz +
      n6 * (1 - ux) * uy * uz +
      n7 * ux * uy * uz
    );
  }

  private cpuHash2(x: number, y: number): number {
    let h = (x * 374761393 + y * 668265263 + 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  private cpuHash3(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 1440670441 + 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  private cpuRandom(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // -----------------------------------------------------------------------
  // Shader and buffer helpers
  // -----------------------------------------------------------------------

  private getShaderCode(type: ComputeJobType): string {
    switch (type) {
      case 'terrain_sdf': return TERRAIN_SDF_SHADER;
      case 'hydraulic_erosion': return HYDRAULIC_EROSION_SHADER;
      case 'marching_cubes': return MARCHING_CUBES_SHADER;
      case 'noise_3d': return NOISE_3D_SHADER;
    }
  }

  private prepareInputData(job: ComputeJob): ArrayBuffer {
    const params = job.params;
    // Pack params as Float32 uniform buffer (16-byte aligned)
    const uniformSize = 32; // 8 floats × 4 bytes
    const data = new Float32Array(uniformSize / 4);

    switch (job.type) {
      case 'terrain_sdf':
        data[0] = params.gridSize || 128;
        data[1] = params.heightScale || 35;
        data[2] = params.frequency || 60;
        data[3] = params.octaves || 6;
        data[4] = params.seed || 0;
        data[5] = params.persistence || 0.5;
        data[6] = params.lacunarity || 2.0;
        break;
      case 'hydraulic_erosion':
        data[0] = params.width || 128;
        data[1] = params.height || 128;
        data[2] = params.iterations || 100;
        data[3] = params.erosionRadius || 3;
        data[4] = params.inertia || 0.05;
        data[5] = params.erodeSpeed || 0.3;
        data[6] = params.depositSpeed || 0.3;
        data[7] = params.seed || 42;
        break;
      case 'noise_3d':
        data[0] = params.resolution || 64;
        data[1] = params.frequency || 1.0;
        data[2] = params.octaves || 4;
        data[3] = params.persistence || 0.5;
        data[4] = params.lacunarity || 2.0;
        data[5] = params.seed || 0;
        break;
      default:
        break;
    }

    return data.buffer;
  }

  private computeOutputSize(job: ComputeJob): number {
    switch (job.type) {
      case 'terrain_sdf': {
        const gs = job.params.gridSize || 128;
        return gs * gs * 4;
      }
      case 'hydraulic_erosion': {
        const w = job.params.width || 128;
        const h = job.params.height || 128;
        return w * h * 4;
      }
      case 'marching_cubes': {
        const gs = job.params.gridSize || 32;
        return gs * gs * gs * 12; // 3 floats per vertex, generous
      }
      case 'noise_3d': {
        const res = job.params.resolution || 64;
        return res * res * res * 4;
      }
    }
    return 1024;
  }

  private getWorkgroupSize(job: ComputeJob): number {
    switch (job.type) {
      case 'terrain_sdf': return (job.params.gridSize || 128) ** 2;
      case 'hydraulic_erosion': return job.params.iterations || 100;
      case 'marching_cubes': return (job.params.gridSize || 32) ** 3;
      case 'noise_3d': return (job.params.resolution || 64) ** 3;
    }
    return 64;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.capabilities.webgpuAvailable = false;
    this.jobQueue.length = 0;
    this.activeJobs = 0;
  }
}
