/**
 * Phase 4: Data Pipeline - Ground Truth Generator
 *
 * Generates ground truth data for ML training including:
 * depth maps, normal maps, segmentation masks, bounding boxes,
 * optical flow, and instance IDs.
 */
import { Scene, Camera, WebGLRenderer, Vector3, Color } from 'three';
export interface GroundTruthOptions {
    resolution: {
        width: number;
        height: number;
    };
    depth: boolean;
    normal: boolean;
    albedo: boolean;
    segmentation: boolean;
    boundingBoxes: boolean;
    opticalFlow: boolean;
    instanceIds: boolean;
    outputFormat: 'png' | 'exr' | 'numpy';
}
export interface GroundTruthResult {
    depth?: Float32Array;
    normal?: Float32Array;
    albedo?: Uint8Array;
    segmentation?: Uint8Array;
    boundingBoxes?: BoundingBoxData[];
    opticalFlow?: Float32Array;
    instanceIds?: Uint16Array;
    metadata: GroundTruthMetadata;
}
export interface BoundingBoxData {
    objectId: string;
    label: string;
    bbox2D: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    bbox3D: {
        center: Vector3;
        size: Vector3;
        rotation: Vector3;
    };
    confidence: number;
}
export interface GroundTruthMetadata {
    jobId: string;
    cameraId: string;
    timestamp: Date;
    resolution: {
        width: number;
        height: number;
    };
    nearPlane: number;
    farPlane: number;
    fov: number;
    objectCount: number;
}
export interface SegmentationLabel {
    id: number;
    name: string;
    color: Color;
    category: string;
}
export declare class GroundTruthGenerator {
    private renderer;
    private options;
    private segmentationLabels;
    private depthCamera;
    private depthScene;
    private normalScene;
    private segmentationScene;
    private depthMaterial;
    private normalMaterial;
    private segmentationMaterial;
    constructor(renderer: WebGLRenderer, options?: Partial<GroundTruthOptions>);
    /**
     * Generate all enabled ground truth data for a scene
     */
    generate(scene: Scene, camera: Camera, jobId: string, cameraId: string, previousFrameData?: {
        scene: Scene;
        camera: Camera;
    }): Promise<GroundTruthResult>;
    /**
     * Register a segmentation label
     */
    registerLabel(id: string, name: string, color: Color, category: string): void;
    /**
     * Get all registered labels
     */
    getLabels(): SegmentationLabel[];
    /**
     * Encode depth to PNG-compatible format
     */
    encodeDepth(depth: Float32Array, near: number, far: number): Uint16Array;
    /**
     * Decode depth from PNG format
     */
    decodeDepth(encoded: Uint16Array, near: number, far: number): Float32Array;
    private renderDepth;
    private renderNormals;
    private renderAlbedo;
    private renderSegmentation;
    private renderInstanceIds;
    private calculateBoundingBoxes;
    private calculateOpticalFlow;
    private createMetadata;
    private initializeDefaultLabels;
}
export default GroundTruthGenerator;
//# sourceMappingURL=GroundTruthGenerator.d.ts.map