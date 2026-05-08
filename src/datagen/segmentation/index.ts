/**
 * Segmentation Module
 *
 * Provides RLE (Run-Length Encoding) compression for segmentation masks,
 * compatible with COCO dataset format used by Princeton Infinigen.
 */

export { RLEEncoder, rleEncoder, encodeRLE, decodeRLE } from './RLEEncoder';
export type { RLESegmentation } from './RLEEncoder';
