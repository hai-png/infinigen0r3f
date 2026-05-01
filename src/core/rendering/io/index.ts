/**
 * IO Module - Input/Output Utilities for Infinigen R3F
 * 
 * This module provides file I/O capabilities including:
 * - OpenEXR export for HDR images
 * - Multi-pass export support
 * - Metadata embedding
 * 
 * @module io
 */

export {
  EXRExporter,
  EXRCompression,
  EXRPixelType,
  type EXRChannel,
  type EXRMetadata,
  type EXRExportConfig,
} from './exr-exporter';
