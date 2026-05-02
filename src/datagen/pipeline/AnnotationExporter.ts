/**
 * Annotation Exporter for Infinigen R3F
 *
 * Unified export system for ground truth annotations:
 * - COCO format (bboxes, polygon segmentation, category labels)
 * - YOLO format (normalized bboxes, class IDs)
 * - Depth map (NPY-style binary, colorized PNG)
 * - Normal map (NPY-style binary, PNG)
 * - Optical flow (NPY-style binary, colorized PNG)
 * - Camera parameters (via CameraParameterExporter)
 *
 * Phase 4.2 — Ground Truth
 */

import * as THREE from 'three';
import { createCanvas } from '@/assets/utils/CanvasUtils';
import { type GTRenderResult } from './GroundTruthRenderer';
import { COCOExporter, type COCOExportConfig } from './exports/coco-exporter';
import { YOLOExporter, type YOLOExportConfig } from './exports/yolo-exporter';
import {
  CameraParameterExporter,
  type CameraExportOptions,
  type PerFrameCameraParams,
} from '../../core/placement/camera/CameraParameterExporter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationExportConfig {
  /** Output format selection */
  formats: AnnotationFormat[];
  /** Image resolution */
  width: number;
  height: number;
  /** COCO export config */
  cocoConfig?: Partial<COCOExportConfig>;
  /** YOLO export config */
  yoloConfig?: Partial<YOLOExportConfig>;
  /** Camera export config */
  cameraConfig?: Partial<CameraExportOptions>;
}

export type AnnotationFormat =
  | 'coco'
  | 'yolo'
  | 'depth_npy'
  | 'depth_png'
  | 'normal_npy'
  | 'normal_png'
  | 'flow_npy'
  | 'flow_png'
  | 'camera_json'
  | 'camera_tum';

export interface AnnotationExportResult {
  /** Map of format name → exported data (string for JSON, data URL for images, ArrayBuffer for binary) */
  exports: Map<string, string | ArrayBuffer>;
  /** Statistics */
  stats: {
    cocoAnnotations?: number;
    yoloAnnotations?: number;
    depthRange?: [number, number];
    objectCount?: number;
  };
}

// ---------------------------------------------------------------------------
// AnnotationExporter
// ---------------------------------------------------------------------------

export class AnnotationExporter {
  private config: AnnotationExportConfig;

  constructor(config: Partial<AnnotationExportConfig> = {}) {
    this.config = {
      formats: config.formats ?? ['coco', 'depth_png', 'normal_png', 'camera_json'],
      width: config.width ?? 1920,
      height: config.height ?? 1080,
      cocoConfig: config.cocoConfig,
      yoloConfig: config.yoloConfig,
      cameraConfig: config.cameraConfig,
    };
  }

  // -----------------------------------------------------------------------
  // Main Export
  // -----------------------------------------------------------------------

  export(gtResult: GTRenderResult, camera?: THREE.PerspectiveCamera): AnnotationExportResult {
    const result: AnnotationExportResult = {
      exports: new Map(),
      stats: {},
    };

    for (const format of this.config.formats) {
      switch (format) {
        case 'coco':
          this.exportCOCO(gtResult, result);
          break;
        case 'yolo':
          this.exportYOLO(gtResult, result);
          break;
        case 'depth_npy':
          this.exportDepthNPY(gtResult, result);
          break;
        case 'depth_png':
          this.exportDepthPNG(gtResult, result);
          break;
        case 'normal_npy':
          this.exportNormalNPY(gtResult, result);
          break;
        case 'normal_png':
          this.exportNormalPNG(gtResult, result);
          break;
        case 'flow_npy':
          this.exportFlowNPY(gtResult, result);
          break;
        case 'flow_png':
          this.exportFlowPNG(gtResult, result);
          break;
        case 'camera_json':
          if (camera) this.exportCameraJSON(camera, result);
          break;
        case 'camera_tum':
          if (camera) this.exportCameraTUM(camera, result);
          break;
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // COCO Export
  // -----------------------------------------------------------------------

  private exportCOCO(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    const exporter = new COCOExporter();
    const { width, height, objectMap } = gtResult;

    // Register categories from object map
    const categories = new Set<string>();
    for (const [, name] of objectMap) {
      const cat = name.split('_')[0] || 'object';
      categories.add(cat);
    }
    for (const cat of categories) {
      exporter.registerCategory(cat);
    }

    // Add image
    const imageId = exporter.addImage({
      fileName: 'frame_0000.png',
      width,
      height,
    });

    // Generate bounding boxes from segmentation
    if (gtResult.objectSegmentation) {
      const bboxMap = this.extractBboxesFromSegmentation(
        gtResult.objectSegmentation,
        width,
        height,
      );

      for (const [id, bbox] of bboxMap) {
        const name = objectMap.get(id) || 'object';
        const cat = name.split('_')[0] || 'object';

        exporter.addAnnotation({
          imageId,
          category: cat,
          bbox: [bbox.x, bbox.y, bbox.width, bbox.height],
        });
      }
    }

    const dataset = exporter.buildDataset({ datasetName: 'infinigen_r3f' });
    const json = exporter.toJSON(dataset);
    result.exports.set('coco', json);
    result.stats.cocoAnnotations = dataset.annotations.length;
  }

  // -----------------------------------------------------------------------
  // YOLO Export
  // -----------------------------------------------------------------------

  private exportYOLO(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    const exporter = new YOLOExporter('v8');
    const { width, height, objectMap } = gtResult;

    if (gtResult.objectSegmentation) {
      const bboxMap = this.extractBboxesFromSegmentation(
        gtResult.objectSegmentation,
        width,
        height,
      );

      const bboxes: Array<{ className: string; x: number; y: number; width: number; height: number }> = [];
      for (const [id, bbox] of bboxMap) {
        const name = objectMap.get(id) || 'object';
        const cat = name.split('_')[0] || 'object';
        bboxes.push({
          className: cat,
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
        });
      }

      exporter.addImage({
        path: 'frame_0000.png',
        width,
        height,
        bboxes,
      });
    }

    const json = exporter.toJSON();
    result.exports.set('yolo', json);
    result.stats.yoloAnnotations = exporter.getStatistics().numBboxes;
  }

  // -----------------------------------------------------------------------
  // Depth Export
  // -----------------------------------------------------------------------

  private exportDepthNPY(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.depth) return;

    // NPY header for Float32 array
    const { width, height } = gtResult;
    const header = this.createNPYHeader('f4', [height, width]);
    const buffer = new ArrayBuffer(header.byteLength + gtResult.depth.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(header), 0);
    new Float32Array(buffer, header.byteLength).set(gtResult.depth);

    result.exports.set('depth_npy', buffer);

    // Stats
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < gtResult.depth.length; i++) {
      if (gtResult.depth[i] < min) min = gtResult.depth[i];
      if (gtResult.depth[i] > max) max = gtResult.depth[i];
    }
    result.stats.depthRange = [min, max];
  }

  private exportDepthPNG(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.depth) return;

    const { width, height } = gtResult;
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);

    // Jet colormap
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < gtResult.depth.length; i++) {
      if (gtResult.depth[i] < min) min = gtResult.depth[i];
      if (gtResult.depth[i] > max) max = gtResult.depth[i];
    }
    const range = max - min || 1;

    for (let i = 0; i < width * height; i++) {
      const t = (gtResult.depth[i] - min) / range;
      const [r, g, b] = jetColormap(t);
      imgData.data[i * 4] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    result.exports.set('depth_png', canvas.toDataURL('image/png'));
  }

  // -----------------------------------------------------------------------
  // Normal Export
  // -----------------------------------------------------------------------

  private exportNormalNPY(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.normal) return;

    const { width, height } = gtResult;
    const header = this.createNPYHeader('f4', [height, width, 3]);
    const buffer = new ArrayBuffer(header.byteLength + gtResult.normal.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(header), 0);
    new Float32Array(buffer, header.byteLength).set(gtResult.normal);

    result.exports.set('normal_npy', buffer);
  }

  private exportNormalPNG(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.normal) return;

    const { width, height } = gtResult;
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);

    for (let i = 0; i < width * height; i++) {
      imgData.data[i * 4] = Math.floor(((gtResult.normal[i * 3] + 1) / 2) * 255);
      imgData.data[i * 4 + 1] = Math.floor(((gtResult.normal[i * 3 + 1] + 1) / 2) * 255);
      imgData.data[i * 4 + 2] = Math.floor(((gtResult.normal[i * 3 + 2] + 1) / 2) * 255);
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    result.exports.set('normal_png', canvas.toDataURL('image/png'));
  }

  // -----------------------------------------------------------------------
  // Optical Flow Export
  // -----------------------------------------------------------------------

  private exportFlowNPY(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.flow) return;

    const { width, height } = gtResult;
    const header = this.createNPYHeader('f4', [height, width, 2]);
    const buffer = new ArrayBuffer(header.byteLength + gtResult.flow.byteLength);
    new Uint8Array(buffer).set(new Uint8Array(header), 0);
    new Float32Array(buffer, header.byteLength).set(gtResult.flow);

    result.exports.set('flow_npy', buffer);
  }

  private exportFlowPNG(gtResult: GTRenderResult, result: AnnotationExportResult): void {
    if (!gtResult.flow) return;

    const { width, height } = gtResult;
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(width, height);

    for (let i = 0; i < width * height; i++) {
      const fx = gtResult.flow[i * 2];
      const fy = gtResult.flow[i * 2 + 1];
      const mag = Math.sqrt(fx * fx + fy * fy);
      const angle = Math.atan2(fy, fx);

      // HSV → RGB: hue from angle, saturation from magnitude
      const h = (angle / Math.PI + 1) / 2;
      const s = Math.min(1, mag * 10);
      const [r, g, b] = hslToRgb(h, s, 0.5);

      imgData.data[i * 4] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
    result.exports.set('flow_png', canvas.toDataURL('image/png'));
  }

  // -----------------------------------------------------------------------
  // Camera Export
  // -----------------------------------------------------------------------

  private exportCameraJSON(
    camera: THREE.PerspectiveCamera,
    result: AnnotationExportResult,
  ): void {
    const exporter = new CameraParameterExporter({
      ...this.config.cameraConfig,
      width: this.config.width,
      height: this.config.height,
    });
    exporter.addFrame(camera, 0, 0);
    const json = exporter.exportJSON();
    result.exports.set('camera_json', json);
  }

  private exportCameraTUM(
    camera: THREE.PerspectiveCamera,
    result: AnnotationExportResult,
  ): void {
    const exporter = new CameraParameterExporter({
      ...this.config.cameraConfig,
      width: this.config.width,
      height: this.config.height,
      includeTUM: true,
    });
    exporter.addFrame(camera, 0, 0);
    const tum = exporter.exportTUM();
    result.exports.set('camera_tum', tum);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Extract bounding boxes from a segmentation mask */
  private extractBboxesFromSegmentation(
    segmentation: Uint8Array,
    width: number,
    height: number,
  ): Map<number, { x: number; y: number; width: number; height: number }> {
    const bboxes = new Map<
      number,
      { minX: number; minY: number; maxX: number; maxY: number }
    >();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const id = segmentation[y * width + x];
        if (id === 0) continue;

        if (!bboxes.has(id)) {
          bboxes.set(id, { minX: x, minY: y, maxX: x, maxY: y });
        } else {
          const bbox = bboxes.get(id)!;
          if (x < bbox.minX) bbox.minX = x;
          if (y < bbox.minY) bbox.minY = y;
          if (x > bbox.maxX) bbox.maxX = x;
          if (y > bbox.maxY) bbox.maxY = y;
        }
      }
    }

    const result = new Map<number, { x: number; y: number; width: number; height: number }>();
    for (const [id, bbox] of bboxes) {
      result.set(id, {
        x: bbox.minX,
        y: bbox.minY,
        width: bbox.maxX - bbox.minX + 1,
        height: bbox.maxY - bbox.minY + 1,
      });
    }

    return result;
  }

  /** Create minimal NPY file header */
  private createNPYHeader(dtype: string, shape: number[]): ArrayBuffer {
    const magic = '\x93NUMPY';
    const version = '\x01\x00';
    const descr = `'${dtype}'`;
    const shapeStr = `(${shape.join(', ')},)`;
    const dict = `{'descr': ${descr}, 'fortran_order': False, 'shape': ${shapeStr}}`;
    const headerStr = magic + version + dict;
    const padding = 64 - ((headerStr.length + 1) % 64);
    const fullHeader = headerStr + ' '.repeat(padding) + '\n';

    const encoder = new TextEncoder();
    return encoder.encode(fullHeader).buffer;
  }

  // -----------------------------------------------------------------------
  // Download helpers
  // -----------------------------------------------------------------------

  /** Trigger browser download for all exported files */
  static downloadAll(exportResult: AnnotationExportResult): void {
    for (const [name, data] of exportResult.exports) {
      if (typeof data === 'string') {
        if (data.startsWith('data:')) {
          // Data URL (PNG)
          const link = document.createElement('a');
          link.href = data;
          link.download = `${name}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          // JSON string
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${name}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      } else {
        // ArrayBuffer (NPY)
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.npy`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Colormap helpers
// ---------------------------------------------------------------------------

function jetColormap(t: number): [number, number, number] {
  const r = Math.min(255, Math.max(0, Math.floor(255 * (1.5 - Math.abs(4 * t - 3)))));
  const g = Math.min(255, Math.max(0, Math.floor(255 * (1.5 - Math.abs(4 * t - 2)))));
  const b = Math.min(255, Math.max(0, Math.floor(255 * (1.5 - Math.abs(4 * t - 1)))));
  return [r, g, b];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export default AnnotationExporter;
