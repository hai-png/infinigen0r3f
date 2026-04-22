/**
 * COCO Format Exporter for Infinigen R3F
 * 
 * Implements COCO (Common Objects in Context) dataset format export
 * for object detection, instance segmentation, and keypoint detection.
 * 
 * Based on: infinigen/tools/export.py (COCO export section)
 * Reference: https://cocodataset.org/#format-data
 * 
 * @module pipeline/exports
 */

import { Camera } from 'three';

/**
 * COCO category definition
 */
export interface COCOCategory {
  /** Category ID */
  id: number;
  /** Category name */
  name: string;
  /** Super category (optional) */
  supercategory?: string;
}

/**
 * COCO image metadata
 */
export interface COCOImage {
  /** Image ID */
  id: number;
  /** File name */
  file_name: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** License ID (optional) */
  license?: number;
  /** Flickr URL (optional) */
  flickr_url?: string;
  /** COCO URL (optional) */
  coco_url?: string;
  /** Capture date (optional) */
  date_captured?: string;
}

/**
 * COCO annotation for bounding boxes and segmentation
 */
export interface COCOAnnotation {
  /** Annotation ID */
  id: number;
  /** Image ID */
  image_id: number;
  /** Category ID */
  category_id: number;
  /** Bounding box [x, y, width, height] */
  bbox: [number, number, number, number];
  /** Segmentation polygon or RLE */
  segmentation?: number[][] | Record<string, any>;
  /** Area of the segmentation */
  area: number;
  /** Is crowd annotation */
  iscrowd: number;
  /** Keypoints (optional) */
  keypoints?: number[];
  /** Number of keypoints */
  num_keypoints?: number;
}

/**
 * COCO license information
 */
export interface COCOLicense {
  /** License ID */
  id: number;
  /** License name */
  name: string;
  /** License URL */
  url: string;
}

/**
 * COCO info metadata
 */
export interface COCOInfo {
  /** Dataset year */
  year?: string;
  /** Dataset version */
  version?: string;
  /** Description */
  description?: string;
  /** Contributor */
  contributor?: string;
  /** Date created */
  date_created?: string;
  /** URL */
  url?: string;
}

/**
 * Complete COCO dataset structure
 */
export interface COCODataset {
  /** Dataset info */
  info: COCOInfo;
  /** Licenses */
  licenses: COCOLicense[];
  /** Categories */
  categories: COCOCategory[];
  /** Images */
  images: COCOImage[];
  /** Annotations */
  annotations: COCOAnnotation[];
}

/**
 * Object detection result
 */
export interface DetectionResult {
  /** Object category name */
  category: string;
  /** Bounding box [x, y, width, height] in pixel coordinates */
  bbox: [number, number, number, number];
  /** Segmentation mask as 2D array of points */
  segmentation?: number[][];
  /** Confidence score (0-1) */
  confidence?: number;
  /** Instance ID */
  instanceId?: number;
}

/**
 * Configuration for COCO export
 */
export interface COCOExportConfig {
  /** Output directory path */
  outputDir: string;
  /** Dataset name */
  datasetName: string;
  /** Year */
  year?: string;
  /** Version */
  version?: string;
  /** Include segmentation masks */
  includeSegmentation: boolean;
  /** Include keypoints */
  includeKeypoints: boolean;
  /** Keypoint names */
  keypointNames?: string[];
  /** Image prefix */
  imagePrefix?: string;
  /** Image extension */
  imageExtension?: string;
  /** Min bbox area filter */
  minBboxArea?: number;
  /** Split ratios [train, val, test] */
  splits?: [number, number, number];
}

/**
 * COCO Format Exporter
 * 
 * Generates COCO-format JSON annotations for rendered scenes.
 * Supports object detection, instance segmentation, and keypoints.
 */
export class COCOExporter {
  /** Current annotation ID counter */
  private annotationIdCounter: number = 0;
  
  /** Current image ID counter */
  private imageIdCounter: number = 0;
  
  /** Category name to ID mapping */
  private categoryMap: Map<string, number> = new Map();
  
  /** Registered categories */
  private categories: COCOCategory[] = [];
  
  /** Collected images */
  private images: COCOImage[] = [];
  
  /** Collected annotations */
  private annotations: COCOAnnotation[] = [];

  /**
   * Register a category
   */
  registerCategory(name: string, supercategory?: string): number {
    if (!this.categoryMap.has(name)) {
      const id = this.categories.length + 1;
      const category: COCOCategory = {
        id,
        name,
        supercategory,
      };
      this.categories.push(category);
      this.categoryMap.set(name, id);
    }
    return this.categoryMap.get(name)!;
  }

  /**
   * Add an image to the dataset
   */
  addImage(options: {
    fileName: string;
    width: number;
    height: number;
    captureDate?: string;
  }): number {
    const id = ++this.imageIdCounter;
    const image: COCOImage = {
      id,
      file_name: options.fileName,
      width: options.width,
      height: options.height,
      date_captured: options.captureDate,
    };
    this.images.push(image);
    return id;
  }

  /**
   * Add an annotation
   */
  addAnnotation(options: {
    imageId: number;
    category: string;
    bbox: [number, number, number, number];
    segmentation?: number[][];
    isCrowd?: boolean;
    keypoints?: number[];
  }): number {
    const categoryId = this.categoryMap.get(options.category);
    if (categoryId === undefined) {
      throw new Error(`Category "${options.category}" not registered`);
    }

    const id = ++this.annotationIdCounter;
    
    // Calculate area from bbox
    const area = options.bbox[2] * options.bbox[3];
    
    const annotation: COCOAnnotation = {
      id,
      image_id: options.imageId,
      category_id: categoryId,
      bbox: options.bbox,
      area,
      iscrowd: options.isCrowd ? 1 : 0,
    };
    
    if (options.segmentation) {
      annotation.segmentation = options.segmentation;
    }
    
    if (options.keypoints) {
      annotation.keypoints = options.keypoints;
      annotation.num_keypoints = options.keypoints.filter((_, i) => i % 3 === 2 && _ > 0).length;
    }
    
    this.annotations.push(annotation);
    return id;
  }

  /**
   * Convert detection results to COCO annotations
   */
  processDetections(options: {
    imageId: number;
    detections: DetectionResult[];
  }): number[] {
    const annotationIds: number[] = [];
    
    for (const detection of options.detections) {
      // Filter by minimum area
      const area = detection.bbox[2] * detection.bbox[3];
      if (area < (options as any).minBboxArea || 0) {
        continue;
      }
      
      const id = this.addAnnotation({
        imageId: options.imageId,
        category: detection.category,
        bbox: detection.bbox,
        segmentation: detection.segmentation,
      });
      annotationIds.push(id);
    }
    
    return annotationIds;
  }

  /**
   * Compute bounding box from segmentation polygon
   */
  computeBboxFromSegmentation(segmentation: number[][]): [number, number, number, number] {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const polygon of segmentation) {
      for (let i = 0; i < polygon.length; i += 2) {
        const x = polygon[i];
        const y = polygon[i + 1];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    
    return [minX, minY, maxX - minX, maxY - minY];
  }

  /**
   * Convert mask to polygon segmentation
   */
  maskToPolygon(
    mask: Uint8Array | boolean[],
    width: number,
    height: number,
    simplifyTolerance: number = 1.0
  ): number[][] {
    // Simple contour extraction (Marching Squares could be used for better quality)
    const polygons: number[][] = [];
    
    // Find contours using simple edge following
    const visited = new Set<number>();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] && !visited.has(idx)) {
          const polygon = this.traceContour(mask, width, height, x, y, visited);
          if (polygon.length > 6) { // Minimum 3 points
            polygons.push(polygon);
          }
        }
      }
    }
    
    return polygons;
  }

  /**
   * Trace contour from a starting point
   */
  private traceContour(
    mask: Uint8Array | boolean[],
    width: number,
    height: number,
    startX: number,
    startY: number,
    visited: Set<number>
  ): number[] {
    const polygon: number[] = [];
    let x = startX;
    let y = startY;
    
    // Simple contour tracing
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    let dirIndex = 0;
    
    do {
      const idx = y * width + x;
      if (mask[idx]) {
        visited.add(idx);
        polygon.push(x, y);
      }
      
      // Try to move in current direction
      let found = false;
      for (let i = 0; i < 4; i++) {
        const newDirIndex = (dirIndex + i) % 4;
        const dx = directions[newDirIndex][0];
        const dy = directions[newDirIndex][1];
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          if (mask[nidx]) {
            x = nx;
            y = ny;
            dirIndex = newDirIndex;
            found = true;
            break;
          }
        }
      }
      
      if (!found) break;
    } while ((x !== startX || y !== startY) && polygon.length < 10000);
    
    return polygon;
  }

  /**
   * Build final COCO dataset
   */
  buildDataset(config: {
    datasetName: string;
    year?: string;
    version?: string;
  }): COCODataset {
    return {
      info: {
        year: config.year ?? new Date().getFullYear().toString(),
        version: config.version ?? '1.0',
        description: `${config.datasetName} - Generated by Infinigen R3F`,
        contributor: 'Infinigen R3F',
        date_created: new Date().toISOString(),
        url: 'https://github.com/princeton-vl/infinigen',
      },
      licenses: [{
        id: 1,
        name: 'CC BY-NC-SA 4.0',
        url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      }],
      categories: this.categories,
      images: this.images,
      annotations: this.annotations,
    };
  }

  /**
   * Export dataset to JSON string
   */
  toJSON(dataset?: COCODataset): string {
    const data = dataset ?? this.buildDataset({ datasetName: 'dataset' });
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export dataset to file (Node.js environment)
   */
  async exportToFile(outputPath: string, dataset?: COCODataset): Promise<void> {
    const json = this.toJSON(dataset);
    
    // In Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = await import('fs');
      const path = await import('path');
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, json, 'utf-8');
    } else {
      // Browser environment - trigger download
      this.downloadAsFile(json, outputPath.split('/').pop() ?? 'coco_annotations.json');
    }
  }

  /**
   * Download file in browser
   */
  private downloadAsFile(content: string, fileName: string): void {
    if (typeof window === 'undefined') return;
    
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Reset exporter state
   */
  reset(): void {
    this.annotationIdCounter = 0;
    this.imageIdCounter = 0;
    this.categoryMap.clear();
    this.categories = [];
    this.images = [];
    this.annotations = [];
  }

  /**
   * Get statistics about the dataset
   */
  getStatistics(): {
    numImages: number;
    numAnnotations: number;
    numCategories: number;
    categories: Array<{ name: string; count: number }>;
    avgAnnotationsPerImage: number;
  } {
    const categoryCounts = new Map<number, number>();
    
    for (const ann of this.annotations) {
      categoryCounts.set(ann.category_id, (categoryCounts.get(ann.category_id) || 0) + 1);
    }
    
    const categories = this.categories.map(cat => ({
      name: cat.name,
      count: categoryCounts.get(cat.id) || 0,
    }));
    
    return {
      numImages: this.images.length,
      numAnnotations: this.annotations.length,
      numCategories: this.categories.length,
      categories,
      avgAnnotationsPerImage: this.images.length > 0
        ? this.annotations.length / this.images.length
        : 0,
    };
  }
}

export default COCOExporter;
