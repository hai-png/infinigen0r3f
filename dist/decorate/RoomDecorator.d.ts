/**
 * Room Decoration System
 *
 * Rule-based furniture arrangement and room decoration.
 * Implements constraint-driven placement of decorative objects,
 * furniture arrangements, and aesthetic enhancements.
 *
 * Based on original Infinigen's decorate.py (~850 LOC)
 * Ported to TypeScript with hybrid bridge support for complex operations.
 */
import { Vector3, Box3 } from 'three';
import { AssetFactory } from '../factory/AssetFactory';
export interface DecorationRule {
    /** Object type to place (e.g., 'plant', 'picture', 'rug') */
    objectType: string;
    /** Target surface or region (e.g., 'wall', 'floor', 'table') */
    targetSurface: string;
    /** Minimum count of objects to place */
    minCount: number;
    /** Maximum count of objects to place */
    maxCount: number;
    /** Preferred spacing between objects (in meters) */
    spacing?: number;
    /** Alignment constraint (e.g., 'centered', 'random', 'grid') */
    alignment?: 'centered' | 'random' | 'grid' | 'symmetric';
    /** Scale variation range [min, max] */
    scaleRange?: [number, number];
    /** Rotation constraints */
    rotation?: {
        allowRandomY?: boolean;
        fixedAngle?: number;
        angleRange?: [number, number];
    };
    /** Exclusion zones (regions where objects cannot be placed) */
    exclusionZones?: Box3[];
    /** Required clearance from edges (in meters) */
    edgeClearance?: number;
}
export interface FurnitureArrangement {
    /** Arrangement style (e.g., 'conversation', 'dining', 'workspace') */
    style: string;
    /** Primary furniture piece (e.g., sofa, dining table, desk) */
    primaryPiece: string;
    /** Secondary pieces (e.g., chairs, side tables) */
    secondaryPieces: string[];
    /** Arrangement constraints */
    constraints: {
        /** Distance from primary to secondary pieces */
        primaryDistance: [number, number];
        /** Angle between secondary pieces */
        secondaryAngle?: [number, number];
        /** Facing direction relative to primary */
        facingPrimary?: boolean;
        /** Wall adjacency requirement */
        adjacentToWall?: boolean;
    };
}
export interface DecoratedRoom {
    /** Room dimensions */
    roomBounds: Box3;
    /** Placed decoration instances */
    decorations: DecorationInstance[];
    /** Furniture arrangements */
    furniture: FurnitureInstance[];
    /** Applied rules */
    appliedRules: string[];
}
export interface DecorationInstance {
    /** Unique identifier */
    id: string;
    /** Object type */
    type: string;
    /** Position in world space */
    position: Vector3;
    /** Rotation quaternion (as Euler angles for simplicity) */
    rotation: [number, number, number];
    /** Scale factor */
    scale: number;
    /** Parent surface (if attached) */
    parentSurface?: string;
    /** Metadata */
    metadata?: Record<string, any>;
}
export interface FurnitureInstance {
    /** Unique identifier */
    id: string;
    /** Furniture type */
    type: string;
    /** Position in world space */
    position: Vector3;
    /** Rotation around Y axis */
    rotationY: number;
    /** Scale factors */
    scale: [number, number, number];
    /** Arrangement group */
    groupId?: string;
}
export declare class RoomDecorator {
    private assetFactory;
    private instanceScatterer;
    private bridge;
    constructor(assetFactory: AssetFactory);
    /**
     * Apply decoration rules to a room
     */
    decorate(roomBounds: Box3, rules: DecorationRule[], existingObjects?: DecorationInstance[]): Promise<DecoratedRoom>;
    /**
     * Apply a single decoration rule
     */
    private applyRule;
    /**
     * Get placement surface geometry
     */
    private getPlacementSurface;
    /**
     * Generate candidate positions using Poisson disk sampling
     */
    private generateCandidates;
    /**
     * Create a simple plane geometry for sampling
     */
    private createPlaneGeometry;
    /**
     * Check if position is too close to surface edge
     */
    private isTooCloseToEdge;
    /**
     * Check if position is in any exclusion zone
     */
    private isInExclusionZone;
    /**
     * Generate rotation based on rule constraints
     */
    private generateRotation;
    /**
     * Arrange furniture according to style
     */
    arrangeFurniture(roomBounds: Box3, arrangement: FurnitureArrangement): Promise<FurnitureInstance[]>;
    /**
     * Get optimal position for primary furniture
     */
    private getPrimaryPosition;
    /**
     * Get rotation for primary furniture
     */
    private getPrimaryRotation;
    /**
     * Calculate angle for secondary furniture placement
     */
    private getSecondaryAngle;
    /**
     * Calculate angle from one position to another
     */
    private angleToPosition;
    /**
     * Clamp position to stay within bounds
     */
    private clampToBounds;
    /**
     * Add decorative accessories to existing furniture
     */
    addAccessories(furniture: FurnitureInstance[], accessoryType: string, countPerFurniture: number): Promise<DecorationInstance[]>;
    /**
     * Get random offset for accessory placement on furniture
     */
    private getRandomSurfaceOffset;
    /**
     * Create wall decorations (pictures, shelves, etc.)
     */
    createWallDecorations(roomBounds: Box3, wallType: 'north' | 'south' | 'east' | 'west', decorations: Array<{
        type: string;
        count: number;
    }>): Promise<DecorationInstance[]>;
    /**
     * Get rotation for wall-mounted decorations
     */
    private getWallRotation;
    /**
     * Optimize decoration layout using hybrid bridge
     */
    optimizeLayout(roomBounds: Box3, decorations: DecorationInstance[]): Promise<DecorationInstance[]>;
    /**
     * Simple collision avoidance fallback
     */
    private simpleCollisionAvoidance;
    /**
     * Utility: Random integer in range
     */
    private randomInt;
    /**
     * Utility: Random float in range
     */
    private randomInRange;
}
export { RoomDecorator as default };
//# sourceMappingURL=RoomDecorator.d.ts.map