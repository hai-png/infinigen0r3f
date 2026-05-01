/**
 * RLE Segmentation Encoder
 *
 * Compresses and decompresses segmentation masks using Run-Length Encoding (RLE).
 * Compatible with the COCO dataset format used by Princeton Infinigen for ground truth
 * segmentation data.
 *
 * The encoding scheme follows the COCO RLE convention:
 * - Pixels are scanned in column-major order (Fortran order) to match COCO
 * - `counts` stores alternating run lengths of background (0) and foreground pixels
 * - `segmentIds` maps each non-zero run to the object ID that produced it
 *
 * @see https://github.com/princeton-vl/infinigen/blob/main/infinigen/core/generate.py
 * @see https://cocodataset.org/#format-data
 */

import { SeededRandom } from '@/core/util/MathUtils';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * RLE-compressed segmentation representation.
 *
 * - `counts`: Alternating run lengths starting with the background run length.
 *   For a simple binary mask: [bg_run, fg_run, bg_run, fg_run, ...]
 *   For multi-segment: each run corresponds to a segment identified by `segmentIds`.
 * - `segmentIds`: Maps run indices to object IDs. Index i corresponds to counts[i].
 *   Background runs (0-value pixels) have segmentId = 0.
 */
export interface RLESegmentation {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** RLE-compressed data: alternating run lengths (column-major scan order) */
  counts: number[];
  /** Maps each run index to the object ID (0 = background) */
  segmentIds: number[];
}

// ============================================================================
// RLEEncoder Class
// ============================================================================

/**
 * Encodes and decodes segmentation masks using Run-Length Encoding.
 *
 * Provides efficient compression of 2D segmentation masks where each pixel holds
 * an integer object ID. Also supports conversion to/from COCO format RLE for
 * interoperability with the Princeton Infinigen data pipeline.
 */
export class RLEEncoder {
  /**
   * Encode a 2D segmentation mask into RLE format.
   *
   * The mask is scanned in column-major (Fortran) order to match COCO conventions.
   * Consecutive pixels with the same object ID are grouped into runs.
   *
   * @param mask - Flat array of object IDs (row-major order), length = width * height
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @returns RLE-compressed segmentation
   */
  encode(mask: Uint8Array, width: number, height: number): RLESegmentation {
    const totalCount = width * height;

    if (mask.length !== totalCount) {
      throw new Error(
        `Mask length (${mask.length}) does not match dimensions (${width}x${height} = ${totalCount})`
      );
    }

    // Re-index mask from row-major to column-major (Fortran order) to match COCO
    const columnMajor = new Uint8Array(totalCount);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        columnMajor[col * height + row] = mask[row * width + col];
      }
    }

    const counts: number[] = [];
    const segmentIds: number[] = [];

    if (totalCount === 0) {
      return { width, height, counts, segmentIds };
    }

    // Build runs from column-major data
    let currentId = columnMajor[0];
    let runLength = 1;

    for (let i = 1; i < totalCount; i++) {
      if (columnMajor[i] === currentId) {
        runLength++;
      } else {
        counts.push(runLength);
        segmentIds.push(currentId);
        currentId = columnMajor[i];
        runLength = 1;
      }
    }
    // Push the last run
    counts.push(runLength);
    segmentIds.push(currentId);

    return { width, height, counts, segmentIds };
  }

  /**
   * Decode an RLE-compressed segmentation back to a flat pixel mask.
   *
   * @param rle - RLE-compressed segmentation
   * @returns Flat Uint8Array mask in row-major order, length = width * height
   */
  decode(rle: RLESegmentation): Uint8Array {
    const { width, height, counts, segmentIds } = rle;
    const totalCount = width * height;

    // Reconstruct column-major mask from runs
    const columnMajor = new Uint8Array(totalCount);
    let offset = 0;

    for (let i = 0; i < counts.length; i++) {
      const runLength = counts[i];
      const objectId = segmentIds[i] ?? 0;
      for (let j = 0; j < runLength; j++) {
        if (offset + j < totalCount) {
          columnMajor[offset + j] = objectId;
        }
      }
      offset += runLength;
    }

    // Convert from column-major back to row-major
    const mask = new Uint8Array(totalCount);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        mask[row * width + col] = columnMajor[col * height + row];
      }
    }

    return mask;
  }

  /**
   * Convert an RLESegmentation to COCO format RLE.
   *
   * COCO format uses a single binary mask per annotation, so this method
   * takes an RLESegmentation and extracts a binary RLE for a specific
   * segment ID. If no segmentId is provided, it creates a foreground
   * mask (all non-zero pixels).
   *
   * The COCO RLE format uses:
   * - `counts`: string of run lengths (for iscrowd=1) or number array
   * - `size`: [height, width]
   *
   * @param rle - RLESegmentation to convert
   * @param targetSegmentId - If provided, only this segment ID is foreground; otherwise all non-zero pixels
   * @returns COCO-format RLE object
   */
  toCOCO(rle: RLESegmentation, targetSegmentId?: number): object {
    const { width, height, counts, segmentIds } = rle;

    // Build a binary mask in column-major order, then RLE-encode it
    const totalCount = width * height;
    const binaryColumnMajor = new Uint8Array(totalCount);
    let offset = 0;

    for (let i = 0; i < counts.length; i++) {
      const runLength = counts[i];
      const isForeground = targetSegmentId !== undefined
        ? segmentIds[i] === targetSegmentId
        : segmentIds[i] !== 0;

      for (let j = 0; j < runLength; j++) {
        if (offset + j < totalCount) {
          binaryColumnMajor[offset + j] = isForeground ? 1 : 0;
        }
      }
      offset += runLength;
    }

    // Encode binary mask as COCO RLE (alternating 0s and 1s runs)
    const cocoCounts: number[] = [];
    if (totalCount === 0) {
      return { counts: cocoCounts, size: [height, width] };
    }

    // COCO RLE starts with count of 0-valued pixels, then 1-valued, alternating
    let currentValue = binaryColumnMajor[0];
    let currentRun = 1;

    // If the first pixel is 1 (foreground), we need a leading 0-run of length 0
    if (currentValue === 1) {
      cocoCounts.push(0);
    }

    for (let i = 1; i < totalCount; i++) {
      if (binaryColumnMajor[i] === currentValue) {
        currentRun++;
      } else {
        cocoCounts.push(currentRun);
        currentValue = binaryColumnMajor[i];
        currentRun = 1;
      }
    }
    cocoCounts.push(currentRun);

    return {
      counts: cocoCounts,
      size: [height, width] as [number, number],
    };
  }

  /**
   * Parse COCO format RLE back to an RLESegmentation.
   *
   * @param coco - COCO RLE object with `counts` and `size` fields
   * @param segmentId - The object ID to assign to foreground pixels (default 1)
   * @returns RLESegmentation with the decoded mask
   */
  fromCOCO(coco: object, segmentId: number = 1): RLESegmentation {
    const cocoObj = coco as { counts: number[]; size: [number, number] };
    const [height, width] = cocoObj.size;
    const { counts } = cocoObj;
    const totalCount = width * height;

    // Reconstruct binary column-major mask from COCO RLE
    const binaryColumnMajor = new Uint8Array(totalCount);
    let offset = 0;
    let isForeground = false; // COCO RLE starts with background (0) runs

    for (let i = 0; i < counts.length; i++) {
      const runLength = counts[i];
      const value = isForeground ? 1 : 0;
      for (let j = 0; j < runLength; j++) {
        if (offset + j < totalCount) {
          binaryColumnMajor[offset + j] = value;
        }
      }
      offset += runLength;
      isForeground = !isForeground;
    }

    // Convert binary column-major to multi-segment RLE
    const rleCounts: number[] = [];
    const rleSegmentIds: number[] = [];

    if (totalCount === 0) {
      return { width, height, counts: rleCounts, segmentIds: rleSegmentIds };
    }

    let currentVal = binaryColumnMajor[0];
    let currentRun = 1;

    for (let i = 1; i < totalCount; i++) {
      if (binaryColumnMajor[i] === currentVal) {
        currentRun++;
      } else {
        rleCounts.push(currentRun);
        rleSegmentIds.push(currentVal === 1 ? segmentId : 0);
        currentVal = binaryColumnMajor[i];
        currentRun = 1;
      }
    }
    rleCounts.push(currentRun);
    rleSegmentIds.push(currentVal === 1 ? segmentId : 0);

    return { width, height, counts: rleCounts, segmentIds: rleSegmentIds };
  }

  /**
   * Count the number of pixels belonging to each segment in the RLE data.
   *
   * @param rle - RLE-compressed segmentation
   * @returns Map from segment ID to pixel count
   */
  getSegmentCounts(rle: RLESegmentation): Map<number, number> {
    const result = new Map<number, number>();

    for (let i = 0; i < rle.counts.length; i++) {
      const segId = rle.segmentIds[i];
      const count = rle.counts[i];
      result.set(segId, (result.get(segId) ?? 0) + count);
    }

    return result;
  }

  /**
   * Get the total number of unique segments in the RLE data (excluding background).
   *
   * @param rle - RLE-compressed segmentation
   * @returns Number of unique non-zero segment IDs
   */
  getUniqueSegmentCount(rle: RLESegmentation): number {
    const ids = new Set<number>();
    for (const segId of rle.segmentIds) {
      if (segId !== 0) {
        ids.add(segId);
      }
    }
    return ids.size;
  }

  /**
   * Extract a binary mask for a specific segment ID.
   *
   * @param rle - RLE-compressed segmentation
   * @param segmentId - The segment ID to extract
   * @returns Binary mask in row-major order (255 for matching, 0 otherwise)
   */
  extractBinaryMask(rle: RLESegmentation, segmentId: number): Uint8Array {
    const { width, height, counts, segmentIds } = rle;
    const totalCount = width * height;

    // Build column-major binary mask
    const columnMajor = new Uint8Array(totalCount);
    let offset = 0;

    for (let i = 0; i < counts.length; i++) {
      const runLength = counts[i];
      const isTarget = segmentIds[i] === segmentId;
      for (let j = 0; j < runLength; j++) {
        if (offset + j < totalCount) {
          columnMajor[offset + j] = isTarget ? 255 : 0;
        }
      }
      offset += runLength;
    }

    // Convert from column-major to row-major
    const mask = new Uint8Array(totalCount);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        mask[row * width + col] = columnMajor[col * height + row];
      }
    }

    return mask;
  }

  /**
   * Merge multiple RLE segmentations (same dimensions) into one.
   * Later segmentations overwrite earlier ones where they overlap.
   *
   * @param rles - Array of RLE segmentations with the same dimensions
   * @returns Merged RLE segmentation
   */
  merge(rles: RLESegmentation[]): RLESegmentation {
    if (rles.length === 0) {
      throw new Error('Cannot merge zero RLE segmentations');
    }

    const { width, height } = rles[0];
    const totalCount = width * height;

    // Decode all masks and merge (later overwrites earlier)
    const merged = new Uint8Array(totalCount);
    for (const rle of rles) {
      const mask = this.decode(rle);
      for (let i = 0; i < totalCount; i++) {
        if (mask[i] !== 0) {
          merged[i] = mask[i];
        }
      }
    }

    return this.encode(merged, width, height);
  }

  /**
   * Compute the compression ratio of the RLE encoding.
   *
   * @param rle - RLE-compressed segmentation
   * @returns Ratio of uncompressed size to compressed size
   */
  compressionRatio(rle: RLESegmentation): number {
    const uncompressedSize = rle.width * rle.height;
    // Each run needs a count (number) and a segmentId (number)
    const compressedSize = rle.counts.length * 2;
    return compressedSize > 0 ? uncompressedSize / compressedSize : 0;
  }
}

// ============================================================================
// Singleton & Convenience Exports
// ============================================================================

/** Default encoder instance */
export const rleEncoder = new RLEEncoder();

/**
 * Convenience function: encode a segmentation mask using RLE.
 * Uses the default RLEEncoder instance.
 */
export function encodeRLE(mask: Uint8Array, width: number, height: number): RLESegmentation {
  return rleEncoder.encode(mask, width, height);
}

/**
 * Convenience function: decode an RLE segmentation to a pixel mask.
 * Uses the default RLEEncoder instance.
 */
export function decodeRLE(rle: RLESegmentation): Uint8Array {
  return rleEncoder.decode(rle);
}

export default RLEEncoder;
