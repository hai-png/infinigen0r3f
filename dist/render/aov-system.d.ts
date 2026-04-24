/**
 * AOV (Arbitrary Output Variable) System for Infinigen R3F
 *
 * Implements an AOV management system for handling multiple render outputs
 * with different formats, compression, and storage options.
 *
 * Based on Blender's AOV system and Infinigen's render pass architecture.
 *
 * @module render
 */
import { WebGLRenderTarget, PixelFormat } from 'three';
/**
 * AOV data types matching common render output formats
 */
export declare enum AOVDataType {
    /** 8-bit unsigned integer per channel */
    UINT8 = "uint8",
    /** 16-bit float per channel */
    FLOAT16 = "float16",
    /** 32-bit float per channel */
    FLOAT32 = "float32",
    /** Integer ID encoded as float */
    INT_ID = "int_id"
}
/**
 * AOV channel configurations
 */
export declare enum AOVChannelConfig {
    /** Single channel (grayscale/depth/ID) */
    SINGLE = "single",
    /** Three channels (RGB) */
    RGB = "rgb",
    /** Four channels (RGBA) */
    RGBA = "rgba",
    /** Two channels (UV/flow) */
    DUAL = "dual"
}
/**
 * AOV metadata for tracking render outputs
 */
export interface AOVMetadata {
    /** Unique identifier for this AOV */
    id: string;
    /** Human-readable name */
    name: string;
    /** Data type */
    dataType: AOVDataType;
    /** Channel configuration */
    channels: AOVChannelConfig;
    /** Description of what this AOV contains */
    description?: string;
    /** Whether this AOV is currently active */
    enabled: boolean;
    /** Creation timestamp */
    createdAt: number;
    /** Last modification timestamp */
    modifiedAt: number;
    /** Custom user metadata */
    custom?: Record<string, any>;
}
/**
 * Complete AOV descriptor including render target
 */
export interface AOVDescriptor extends AOVMetadata {
    /** Render target containing the AOV data */
    renderTarget: WebGLRenderTarget;
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
    /** Bytes per pixel */
    bytesPerPixel: number;
    /** Total size in bytes */
    totalSizeBytes: number;
}
/**
 * Configuration for creating a new AOV
 */
export interface AOVConfig {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Data type (default: FLOAT32) */
    dataType?: AOVDataType;
    /** Channel config (default: RGBA) */
    channels?: AOVChannelConfig;
    /** Description */
    description?: string;
    /** Initially enabled (default: true) */
    enabled?: boolean;
    /** Custom metadata */
    custom?: Record<string, any>;
    /** Minimum filter mode */
    minFilter?: number;
    /** Magnification filter mode */
    magFilter?: number;
    /** Wrap S mode */
    wrapS?: number;
    /** Wrap T mode */
    wrapT?: number;
}
/**
 * AOV System - Manages arbitrary output variables for multi-pass rendering
 */
export declare class AOVSystem {
    /** Registered AOVs indexed by ID */
    private aovs;
    /** Default width for new AOVs */
    private defaultWidth;
    /** Default height for new AOVs */
    private defaultHeight;
    /** Memory budget in MB (0 = unlimited) */
    private memoryBudgetMB;
    /** Current memory usage in bytes */
    private currentMemoryUsage;
    constructor(defaultWidth?: number, defaultHeight?: number, memoryBudgetMB?: number);
    /**
     * Register a new AOV
     */
    register(config: AOVConfig): AOVDescriptor;
    /**
     * Get an AOV by ID
     */
    get(id: string): AOVDescriptor | undefined;
    /**
     * Get all registered AOVs
     */
    getAll(): AOVDescriptor[];
    /**
     * Get only enabled AOVs
     */
    getEnabled(): AOVDescriptor[];
    /**
     * Enable or disable an AOV
     */
    setEnabled(id: string, enabled: boolean): void;
    /**
     * Update AOV custom metadata
     */
    updateMetadata(id: string, metadata: Partial<AOVMetadata>): void;
    /**
     * Remove an AOV and free its resources
     */
    unregister(id: string): boolean;
    /**
     * Remove all AOVs and free all resources
     */
    clear(): void;
    /**
     * Resize all AOVs to new dimensions
     */
    resize(width: number, height: number): void;
    /**
     * Get total memory usage in bytes
     */
    getMemoryUsage(): number;
    /**
     * Get total memory usage formatted as human-readable string
     */
    getMemoryUsageFormatted(): string;
    /**
     * Export AOV data to typed array
     */
    exportData(id: string): Float32Array | Uint8Array | null;
    /**
     * Create standard AOV set for typical rendering workflow
     */
    createStandardSet(): string[];
    /**
     * Serialize AOV system state to JSON
     */
    toJSON(): any;
    /**
     * Deserialize AOV system state from JSON
     */
    fromJSON(json: any): void;
    /**
     * Helper: Get Three.js format and type from AOV data type
     */
    private getFormatAndType;
    /**
     * Helper: Get channel count from channel config
     */
    private getChannelCount;
    /**
     * Helper: Format bytes as human-readable string
     */
    private formatBytes;
}
declare module 'three' {
    const RGFormat: PixelFormat;
}
export default AOVSystem;
//# sourceMappingURL=aov-system.d.ts.map