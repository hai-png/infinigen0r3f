/**
 * Room Solidification Module - Hybrid Implementation
 *
 * Converts abstract constraint graph into concrete 3D room geometry.
 *
 * Features:
 * 1. Graph Traversal & Layout Calculation
 * 2. Wall/Floor/Ceiling Generation
 * 3. Door/Window Placement based on connectivity
 * 4. Semantic Tagging of architectural elements
 */
import * as THREE from 'three';
import type { ConstraintGraph } from '../domain/types';
export interface RoomConfig {
    wallHeight: number;
    wallThickness: number;
    floorThickness: number;
    doorWidth: number;
    doorHeight: number;
    windowWidth: number;
    windowHeight: number;
}
export interface SolidifiedRoom {
    scene: THREE.Group;
    walls: THREE.Mesh[];
    floor: THREE.Mesh;
    ceiling?: THREE.Mesh;
    doors: Array<{
        position: THREE.Vector3;
        rotation: number;
        target: string;
    }>;
    windows: Array<{
        position: THREE.Vector3;
        wall: THREE.Mesh;
    }>;
    rooms: Array<{
        id: string;
        bounds: THREE.Box3;
        center: THREE.Vector3;
    }>;
}
export declare class RoomSolidifier {
    private config;
    constructor(config?: Partial<RoomConfig>);
    /**
     * Main entry point: Converts constraint graph to 3D room
     */
    solidify(graph: ConstraintGraph): SolidifiedRoom;
    /**
     * Calculates spatial layout from constraint graph
     * Uses simple grid-based placement for now (can be enhanced with solver)
     */
    private calculateRoomLayouts;
    /**
     * Creates floor geometry for room layouts
     */
    private createFloor;
    /**
     * Creates ceiling geometry
     */
    private createCeiling;
    /**
     * Creates walls for a single room with door/window cutouts
     */
    private createRoomWalls;
    /**
     * Helper: Infer room size from tags or defaults
     */
    private inferRoomSize;
    /**
     * Helper: Calculate bounding box from all nodes
     */
    private calculateBoundsFromNodes;
}
export declare const defaultRoomSolidifier: RoomSolidifier;
//# sourceMappingURL=RoomSolidifier.d.ts.map