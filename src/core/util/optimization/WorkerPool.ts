/**
 * WorkerPool — Web Worker pool for offloading CPU-intensive work
 *
 * Features:
 * - Worker code as inline blob (no separate worker files)
 * - Worker tasks: terrain heightmap, erosion, vegetation placement, material textures
 * - Transferable ArrayBuffers for zero-copy data transfer
 * - Job queue with priority and cancellation
 * - Pool size = navigator.hardwareConcurrency (max 8)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerTaskType =
  | 'terrain_heightmap'
  | 'erosion_simulation'
  | 'vegetation_placement'
  | 'material_texture';

export interface WorkerJob {
  id: string;
  type: WorkerTaskType;
  params: Record<string, any>;
  transferables?: ArrayBuffer[];
  priority: number;
  resolve: (result: WorkerJobResult) => void;
  reject: (error: Error) => void;
  cancelled: boolean;
}

export interface WorkerJobResult {
  data: ArrayBuffer;
  metadata: Record<string, any>;
  executionTimeMs: number;
}

export interface WorkerPoolConfig {
  poolSize: number;
  maxQueueSize: number;
  jobTimeoutMs: number;
}

const DEFAULT_CONFIG: WorkerPoolConfig = {
  poolSize: Math.min(
    typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    8
  ),
  maxQueueSize: 100,
  jobTimeoutMs: 60000,
};

// ---------------------------------------------------------------------------
// Inline worker code
// ---------------------------------------------------------------------------

const WORKER_CODE = `
// Worker: CPU-intensive computation handler
'use strict';

self.onmessage = function(event) {
  const { id, type, params } = event.data;

  try {
    let result;
    switch (type) {
      case 'terrain_heightmap':
        result = generateTerrainHeightmap(params);
        break;
      case 'erosion_simulation':
        result = simulateErosion(params);
        break;
      case 'vegetation_placement':
        result = computeVegetationPlacement(params);
        break;
      case 'material_texture':
        result = generateMaterialTexture(params);
        break;
      default:
        throw new Error('Unknown task type: ' + type);
    }

    self.postMessage({
      id,
      success: true,
      data: result.data,
      metadata: result.metadata,
    }, [result.data]);
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err.message || String(err),
    });
  }
};

// ---- Terrain Heightmap Generation ----
function generateTerrainHeightmap(params) {
  const { width = 128, height = 128, seed = 42, scale = 60, octaves = 6, persistence = 0.5, lacunarity = 2.0 } = params;
  const size = width * height;
  const data = new Float32Array(size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = 0;
      let amplitude = 0.5;
      let frequency = 1.0;
      let px = x / width * scale + seed;
      let py = y / height * scale + seed;

      for (let o = 0; o < octaves; o++) {
        value += amplitude * noise2D(px * frequency, py * frequency);
        frequency *= lacunarity;
        amplitude *= persistence;
      }

      data[y * width + x] = value;
    }
  }

  return { data: data.buffer, metadata: { width, height } };
}

// ---- Erosion Simulation ----
function simulateErosion(params) {
  const { width = 128, height = 128, iterations = 1000, erodeSpeed = 0.3, depositSpeed = 0.3, seed = 42 } = params;

  // Get or create heightmap
  let heightmap;
  if (params.heightmap) {
    heightmap = new Float32Array(params.heightmap);
  } else {
    heightmap = new Float32Array(width * height);
    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = seededRandom(i + seed) * 0.5;
    }
  }

  // Simulate droplet erosion
  for (let iter = 0; iter < iterations; iter++) {
    let px = seededRandom(iter * 2 + seed) * (width - 2) + 1;
    let py = seededRandom(iter * 2 + 1 + seed) * (height - 2) + 1;
    let sediment = 0;
    let speed = 1.0;
    let water = 1.0;

    for (let step = 0; step < 30; step++) {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      if (ix < 1 || iy < 1 || ix >= width - 1 || iy >= height - 1) break;

      const idx = iy * width + ix;
      const currentH = heightmap[idx];

      // Find steepest descent
      let minH = currentH;
      let dx = 0, dy = 0;
      for (let ddy = -1; ddy <= 1; ddy++) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          const nh = heightmap[(iy + ddy) * width + (ix + ddx)];
          if (nh < minH) {
            minH = nh;
            dx = ddx;
            dy = ddy;
          }
        }
      }

      if (minH >= currentH) break;

      const deltaH = currentH - minH;
      const capacity = deltaH * speed * water;

      if (sediment < capacity) {
        // Erode
        const erode = Math.min(deltaH, (capacity - sediment) * erodeSpeed);
        heightmap[idx] -= erode;
        sediment += erode;
      } else {
        // Deposit
        const deposit = (sediment - capacity) * depositSpeed;
        heightmap[idx] += deposit;
        sediment -= deposit;
      }

      px += dx;
      py += dy;
      speed = Math.sqrt(Math.max(0, speed * speed + deltaH * 9.81));
      water *= 0.99;
    }
  }

  return { data: heightmap.buffer, metadata: { width, height } };
}

// ---- Vegetation Placement ----
function computeVegetationPlacement(params) {
  const { areaSize = 100, treeCount = 50, bushCount = 100, grassCount = 500, seed = 42, heightmapWidth = 128, heightmapHeight = 128 } = params;

  const placements = [];

  for (let i = 0; i < treeCount + bushCount + grassCount; i++) {
    const x = (seededRandom(i * 3 + seed) - 0.5) * areaSize;
    const z = (seededRandom(i * 3 + 1 + seed) - 0.5) * areaSize;
    const scale = 0.5 + seededRandom(i * 3 + 2 + seed) * 1.0;
    const rotation = seededRandom(i * 7 + seed) * Math.PI * 2;

    placements.push({ x, z, scale, rotation, type: i < treeCount ? 'tree' : i < treeCount + bushCount ? 'bush' : 'grass' });
  }

  const jsonStr = JSON.stringify(placements);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonStr);

  return { data: data.buffer, metadata: { count: placements.length } };
}

// ---- Material Texture Generation ----
function generateMaterialTexture(params) {
  const { width = 256, height = 256, materialType = 'wood', seed = 42 } = params;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r, g, b;

      switch (materialType) {
        case 'wood': {
          const grain = noise2D(x * 0.05 + seed, y * 0.01) * 30;
          r = 139 + grain;
          g = 90 + grain * 0.7;
          b = 43 + grain * 0.3;
          break;
        }
        case 'stone': {
          const noise = noise2D(x * 0.03 + seed, y * 0.03) * 40;
          r = 128 + noise;
          g = 128 + noise;
          b = 128 + noise;
          break;
        }
        case 'grass': {
          const noise = noise2D(x * 0.1 + seed, y * 0.1) * 30;
          r = 34 + noise * 0.5;
          g = 139 + noise;
          b = 34 + noise * 0.5;
          break;
        }
        default: {
          r = 200; g = 200; b = 200;
        }
      }

      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
      data[idx + 3] = 255;
    }
  }

  return { data: data.buffer, metadata: { width, height, materialType } };
}

// ---- Utility functions ----
function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263 + 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function seededRandom(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
`;

// ---------------------------------------------------------------------------
// WorkerPool class
// ---------------------------------------------------------------------------

export class WorkerPool {
  private workers: Worker[] = [];
  private busyWorkers: Set<number> = new Set();
  private jobQueue: WorkerJob[] = [];
  private config: WorkerPoolConfig;
  private jobCounter: number = 0;
  private workerBlob: Blob | null = null;
  private workerUrl: string | null = null;
  private disposed: boolean = false;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initWorkers();
  }

  private initWorkers(): void {
    if (typeof window === 'undefined') return; // SSR guard

    try {
      this.workerBlob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(this.workerBlob);

      for (let i = 0; i < this.config.poolSize; i++) {
        const worker = new Worker(this.workerUrl);
        worker.onmessage = this.handleWorkerMessage.bind(this, i);
        worker.onerror = this.handleWorkerError.bind(this, i);
        this.workers.push(worker);
      }

      console.log(`[WorkerPool] Initialized with ${this.workers.length} workers`);
    } catch (err) {
      console.warn('[WorkerPool] Failed to create workers:', err);
    }
  }

  /**
   * Submit a job to the worker pool
   */
  submitJob(
    type: WorkerTaskType,
    params: Record<string, any>,
    priority: number = 5,
    transferables?: ArrayBuffer[]
  ): Promise<WorkerJobResult> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('WorkerPool has been disposed'));
        return;
      }

      if (this.jobQueue.length >= this.config.maxQueueSize) {
        reject(new Error('Job queue is full'));
        return;
      }

      // If no workers available, fall back to main thread
      if (this.workers.length === 0) {
        this.executeOnMainThread(type, params, resolve, reject);
        return;
      }

      const job: WorkerJob = {
        id: `worker_job_${this.jobCounter++}`,
        type,
        params,
        transferables,
        priority,
        resolve,
        reject,
        cancelled: false,
      };

      this.jobQueue.push(job);
      this.jobQueue.sort((a, b) => a.priority - b.priority);

      this.dispatchJobs();
    });
  }

  /**
   * Cancel a pending job by ID
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobQueue.find(j => j.id === jobId);
    if (job) {
      job.cancelled = true;
      this.jobQueue = this.jobQueue.filter(j => j.id !== jobId);
      return true;
    }
    return false;
  }

  /**
   * Get pool statistics
   */
  getStats(): { totalWorkers: number; busyWorkers: number; queuedJobs: number } {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.busyWorkers.size,
      queuedJobs: this.jobQueue.length,
    };
  }

  // -----------------------------------------------------------------------
  // Internal dispatch
  // -----------------------------------------------------------------------

  private dispatchJobs(): void {
    while (this.jobQueue.length > 0) {
      const freeWorker = this.getFreeWorker();
      if (freeWorker < 0) break;

      const job = this.jobQueue.shift()!;
      if (job.cancelled) continue;

      this.busyWorkers.add(freeWorker);
      this.sendJobToWorker(freeWorker, job);
    }
  }

  private getFreeWorker(): number {
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.busyWorkers.has(i)) return i;
    }
    return -1;
  }

  private sendJobToWorker(workerIdx: number, job: WorkerJob): void {
    const worker = this.workers[workerIdx];

    // Store job callbacks
    const jobMap = (worker as any).__pendingJobs as Map<string, WorkerJob> || new Map();
    (worker as any).__pendingJobs = jobMap;
    jobMap.set(job.id, job);

    // Send message with transferables
    const message: Record<string, any> = {
      id: job.id,
      type: job.type,
      params: { ...job.params },
    };

    // Handle heightmap data transfer
    if (job.type === 'erosion_simulation' && job.params.heightmap) {
      // Don't transfer the original — copy it for the worker
      const copy = new Float32Array(job.params.heightmap).buffer;
      message.params.heightmap = copy;
      worker.postMessage(message, [copy]);
    } else {
      worker.postMessage(message);
    }
  }

  private handleWorkerMessage(workerIdx: number, event: MessageEvent): void {
    this.busyWorkers.delete(workerIdx);

    const { id, success, data, metadata, error } = event.data;
    const worker = this.workers[workerIdx];
    const jobMap = (worker as any).__pendingJobs as Map<string, WorkerJob>;

    if (jobMap && jobMap.has(id)) {
      const job = jobMap.get(id)!;
      jobMap.delete(id);

      if (job.cancelled) {
        // Job was cancelled, ignore result
      } else if (success) {
        job.resolve({
          data,
          metadata: metadata || {},
          executionTimeMs: 0,
        });
      } else {
        job.reject(new Error(error || 'Worker job failed'));
      }
    }

    this.dispatchJobs();
  }

  private handleWorkerError(workerIdx: number, error: ErrorEvent): void {
    console.error(`[WorkerPool] Worker ${workerIdx} error:`, error);
    this.busyWorkers.delete(workerIdx);

    // Reject all pending jobs for this worker
    const worker = this.workers[workerIdx];
    const jobMap = (worker as any).__pendingJobs as Map<string, WorkerJob>;
    if (jobMap) {
      for (const [, job] of jobMap) {
        if (!job.cancelled) {
          job.reject(new Error(`Worker ${workerIdx} encountered an error`));
        }
      }
      jobMap.clear();
    }

    this.dispatchJobs();
  }

  // -----------------------------------------------------------------------
  // Main thread fallback
  // -----------------------------------------------------------------------

  private executeOnMainThread(
    type: WorkerTaskType,
    params: Record<string, any>,
    resolve: (result: WorkerJobResult) => void,
    reject: (error: Error) => void
  ): void {
    // Use setTimeout to avoid blocking
    setTimeout(() => {
      try {
        let result: WorkerJobResult;

        switch (type) {
          case 'terrain_heightmap': {
            const size = (params.width || 128) * (params.height || 128);
            const data = new Float32Array(size);
            // Simple noise-based heightmap
            for (let i = 0; i < size; i++) {
              data[i] = Math.sin(i * 0.01 + (params.seed || 42)) * 0.5 + 0.5;
            }
            result = { data: data.buffer, metadata: { width: params.width, height: params.height }, executionTimeMs: 0 };
            break;
          }
          default: {
            const data = new ArrayBuffer(0);
            result = { data, metadata: {}, executionTimeMs: 0 };
          }
        }

        resolve(result);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, 0);
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.busyWorkers.clear();

    // Reject all queued jobs
    for (const job of this.jobQueue) {
      job.reject(new Error('WorkerPool disposed'));
    }
    this.jobQueue = [];

    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
  }
}
