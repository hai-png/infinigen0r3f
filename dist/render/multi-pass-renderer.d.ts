/**
 * Multi-Pass Renderer for Infinigen R3F
 *
 * Implements multi-pass rendering system with support for:
 * - Beauty pass (final composited image)
 * - Depth pass (camera-space depth)
 * - Normal pass (world-space normals)
 * - UV pass (texture coordinates)
 * - Position pass (world-space positions)
 * - Albedo pass (base color without lighting)
 * - Roughness pass
 * - Metalness pass
 * - Emission pass
 * - Shadow pass
 * - Ambient Occlusion pass
 * - Instance ID pass (for segmentation)
 * - Material ID pass
 * - Vector pass (motion vectors)
 *
 * Based on: infinigen/core/rendering/render.py
 *
 * @module render
 */
import { Scene, Camera, WebGLRenderer, WebGLRenderTarget, Matrix4, ShaderMaterial } from 'three';
/**
 * Available render pass types
 */
export declare enum RenderPassType {
    BEAUTY = "beauty",
    DEPTH = "depth",
    NORMAL = "normal",
    UV = "uv",
    POSITION = "position",
    ALBEDO = "albedo",
    ROUGHNESS = "roughness",
    METALNESS = "metalness",
    EMISSION = "emission",
    SHADOW = "shadow",
    AO = "ao",
    INSTANCE_ID = "instanceId",
    MATERIAL_ID = "materialId",
    VECTOR = "vector"
}
/**
 * Configuration for a single render pass
 */
export interface PassConfig {
    /** Pass type identifier */
    type: RenderPassType;
    /** Whether this pass should be rendered */
    enabled: boolean;
    /** Output format ('float16', 'float32', 'uint8') */
    format: 'float16' | 'float32' | 'uint8';
    /** Custom shader material for this pass (optional) */
    customMaterial?: ShaderMaterial;
    /** Post-processing options */
    postProcess?: {
        /** Apply tone mapping */
        toneMap?: boolean;
        /** Gamma correction value */
        gamma?: number;
        /** Normalize values to [0,1] */
        normalize?: boolean;
    };
}
/**
 * Multi-pass render result
 */
export interface RenderPassResult {
    /** Pass type */
    type: RenderPassType;
    /** Rendered texture */
    texture: WebGLRenderTarget;
    /** Raw pixel data (if extracted) */
    data?: Float32Array | Uint8Array;
    /** Metadata about the pass */
    metadata: {
        width: number;
        height: number;
        channels: number;
        format: string;
    };
}
/**
 * Complete multi-pass render result
 */
export interface MultiPassRenderResult {
    /** Success status */
    success: boolean;
    /** Individual pass results */
    passes: Map<RenderPassType, RenderPassResult>;
    /** Warnings encountered during rendering */
    warnings: string[];
    /** Render metadata */
    metadata: {
        resolution: [number, number];
        cameraMatrix: Matrix4;
        projectionMatrix: Matrix4;
        timestamp: number;
        frameNumber?: number;
    };
}
/**
 * Default pass configurations
 */
export declare const DEFAULT_PASS_CONFIGS: Record<RenderPassType, PassConfig>;
/**
 * Multi-Pass Renderer Class
 *
 * Manages rendering of multiple passes in a single scene traversal
 * where possible, or multiple traversals for incompatible passes.
 */
export declare class MultiPassRenderer {
    /** Three.js renderer */
    private renderer;
    /** Current pass configurations */
    private passConfigs;
    /** Temporary render targets for reuse */
    private renderTargetPool;
    /** Current scene override materials */
    private originalMaterials;
    /** Width of render output */
    private width;
    /** Height of render output */
    private height;
    constructor(renderer: WebGLRenderer, width?: number, height?: number);
    /**
     * Configure which passes to render
     */
    configurePasses(passConfigs: Partial<Record<RenderPassType, Partial<PassConfig>>>): void;
    /**
     * Get enabled passes
     */
    getEnabledPasses(): RenderPassType[];
    /**
     * Create a render target for a specific pass
     */
    private createRenderTarget;
    /**
     * Get or create a render target from pool
     */
    private getRenderTarget;
    /**
     * Return a render target to the pool
     */
    private releaseRenderTarget;
    /**
     * Override scene materials for a specific pass
     */
    private overrideMaterials;
    /**
     * Restore original scene materials
     */
    private restoreMaterials;
    /**
     * Create material for a specific pass type
     */
    private createPassMaterial;
    /**
     * Create depth pass material
     */
    private createDepthMaterial;
    /**
     * Create normal pass material
     */
    private createNormalMaterial;
    /**
     * Create position pass material
     */
    private createPositionMaterial;
    /**
     * Create UV pass material
     */
    private createUVMaterial;
    /**
     * Create albedo pass material (extract base color)
     */
    private createAlbedoMaterial;
    /**
     * Create instance ID pass material
     */
    private createInstanceIdMaterial;
    /**
     * Create material ID pass material
     */
    private createMaterialIdMaterial;
    /**
     * Create roughness pass material
     */
    private createRoughnessMaterial;
    /**
     * Create metalness pass material
     */
    private createMetalnessMaterial;
    /**
     * Create emission pass material
     */
    private createEmissionMaterial;
    /**
     * Render all enabled passes
     */
    render(scene: Scene, camera: Camera, frameNumber?: number): Promise<MultiPassRenderResult>;
    /**
     * Render a single pass
     */
    private renderSinglePass;
    /**
     * Group compatible passes for batch rendering
     */
    private groupCompatiblePasses;
    /**
     * Extract pixel data from a render target
     */
    extractData(target: WebGLRenderTarget): Float32Array | Uint8Array;
    /**
     * Resize renderer and update dimensions
     */
    resize(width: number, height: number): void;
    /**
     * Cleanup resources
     */
    dispose(): void;
}
declare global {
    interface String {
        hashCode?(): number;
    }
}
export default MultiPassRenderer;
//# sourceMappingURL=multi-pass-renderer.d.ts.map