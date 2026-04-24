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
import { InstanceScatterer } from '../placement/instance-scatter';
import { HybridBridge } from '../bridge/hybrid-bridge';
export class RoomDecorator {
    constructor(assetFactory) {
        this.assetFactory = assetFactory;
        this.instanceScatterer = new InstanceScatterer();
        this.bridge = HybridBridge.getInstance();
    }
    /**
     * Apply decoration rules to a room
     */
    async decorate(roomBounds, rules, existingObjects = []) {
        const decorations = [...existingObjects];
        const appliedRules = [];
        for (const rule of rules) {
            try {
                const newDecorations = await this.applyRule(roomBounds, rule, decorations);
                decorations.push(...newDecorations);
                appliedRules.push(`${rule.objectType}_on_${rule.targetSurface}`);
            }
            catch (error) {
                console.warn(`Failed to apply rule for ${rule.objectType}:`, error);
            }
        }
        return {
            roomBounds,
            decorations,
            furniture: [],
            appliedRules
        };
    }
    /**
     * Apply a single decoration rule
     */
    async applyRule(roomBounds, rule, existing) {
        const count = this.randomInt(rule.minCount, rule.maxCount);
        const instances = [];
        // Determine placement surface
        const surface = this.getPlacementSurface(roomBounds, rule.targetSurface);
        if (!surface) {
            console.warn(`No valid surface found for ${rule.targetSurface}`);
            return [];
        }
        // Generate candidate positions
        const candidates = this.generateCandidates(surface, count, rule.spacing || 0.5, rule.exclusionZones || [], rule.edgeClearance || 0.1);
        // Place decorations
        for (let i = 0; i < Math.min(candidates.length, count); i++) {
            const pos = candidates[i];
            const scale = rule.scaleRange
                ? this.randomInRange(rule.scaleRange[0], rule.scaleRange[1])
                : 1.0;
            const rotation = this.generateRotation(rule.rotation);
            const instance = {
                id: `dec_${rule.objectType}_${i}_${Date.now()}`,
                type: rule.objectType,
                position: pos,
                rotation,
                scale,
                parentSurface: rule.targetSurface,
                metadata: {
                    rule: rule.objectType,
                    alignment: rule.alignment
                }
            };
            instances.push(instance);
        }
        return instances;
    }
    /**
     * Get placement surface geometry
     */
    getPlacementSurface(roomBounds, surfaceType) {
        const min = roomBounds.min;
        const max = roomBounds.max;
        const size = new Vector3().subVectors(max, min);
        switch (surfaceType) {
            case 'floor':
                return new Box3(new Vector3(min.x, min.y, min.z), new Vector3(max.x, min.y + 0.1, max.z));
            case 'ceiling':
                return new Box3(new Vector3(min.x, max.y - 0.1, min.z), new Vector3(max.x, max.y, max.z));
            case 'wall_north':
                return new Box3(new Vector3(min.x, min.y, max.z - 0.1), new Vector3(max.x, max.y, max.z));
            case 'wall_south':
                return new Box3(new Vector3(min.x, min.y, min.z), new Vector3(max.x, max.y, min.z + 0.1));
            case 'wall_east':
                return new Box3(new Vector3(max.x - 0.1, min.y, min.z), new Vector3(max.x, max.y, max.z));
            case 'wall_west':
                return new Box3(new Vector3(min.x, min.y, min.z), new Vector3(min.x + 0.1, max.y, max.z));
            case 'table':
            case 'shelf':
                // Handled by furniture arrangement
                return null;
            default:
                // Default to floor
                return new Box3(new Vector3(min.x, min.y, min.z), new Vector3(max.x, min.y + 0.1, max.z));
        }
    }
    /**
     * Generate candidate positions using Poisson disk sampling
     */
    generateCandidates(surface, count, minSpacing, exclusionZones, edgeClearance) {
        const candidates = [];
        const size = new Vector3().subVectors(surface.max, surface.min);
        // Use instance scatterer for Poisson disk sampling
        // Create a temporary scatterer with the required config
        const tempScatterer = new InstanceScatterer({
            maxInstances: count,
            minDistance: minSpacing,
            useLOD: false,
            lodDistances: [],
            seed: Math.random(),
            alignToNormal: false,
            scaleRange: [1, 1],
            rotationVariation: 0
        });
        // Create a simple plane geometry for sampling
        const geometry = this.createPlaneGeometry(size.x, size.z);
        const densityFn = {
            evaluate: (_pos, _normal) => 1.0
        };
        const scattered = tempScatterer.scatter(geometry, densityFn);
        const points = scattered.map(s => new Vector3(s.position.x, s.position.z));
        const surfaceMin = surface.min;
        for (const point of points) {
            const pos = new Vector3(surfaceMin.x + point.x, surfaceMin.y, surfaceMin.z + point.y);
            // Check edge clearance
            if (this.isTooCloseToEdge(pos, surface, edgeClearance)) {
                continue;
            }
            // Check exclusion zones
            if (this.isInExclusionZone(pos, exclusionZones)) {
                continue;
            }
            candidates.push(pos);
        }
        return candidates;
    }
    /**
     * Create a simple plane geometry for sampling
     */
    createPlaneGeometry(width, depth) {
        // Import THREE dynamically to avoid circular dependency
        const THREE = require('three');
        const geometry = new THREE.PlaneGeometry(width, depth);
        geometry.rotateX(-Math.PI / 2); // Rotate to horizontal
        return geometry;
    }
    /**
     * Check if position is too close to surface edge
     */
    isTooCloseToEdge(pos, surface, clearance) {
        const min = surface.min;
        const max = surface.max;
        return (pos.x < min.x + clearance ||
            pos.x > max.x - clearance ||
            pos.z < min.z + clearance ||
            pos.z > max.z - clearance);
    }
    /**
     * Check if position is in any exclusion zone
     */
    isInExclusionZone(pos, zones) {
        const pointBox = new Box3(pos.clone(), pos.clone());
        for (const zone of zones) {
            if (zone.intersectsBox(pointBox)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Generate rotation based on rule constraints
     */
    generateRotation(rotation) {
        if (!rotation) {
            return [0, 0, 0];
        }
        if (rotation.fixedAngle !== undefined) {
            return [0, rotation.fixedAngle, 0];
        }
        if (rotation.angleRange) {
            const angle = this.randomInRange(rotation.angleRange[0], rotation.angleRange[1]);
            return [0, angle, 0];
        }
        if (rotation.allowRandomY) {
            return [0, Math.random() * Math.PI * 2, 0];
        }
        return [0, 0, 0];
    }
    /**
     * Arrange furniture according to style
     */
    async arrangeFurniture(roomBounds, arrangement) {
        const instances = [];
        const center = new Vector3().addVectors(roomBounds.min, roomBounds.max).multiplyScalar(0.5);
        const size = new Vector3().subVectors(roomBounds.max, roomBounds.min);
        // Place primary piece
        const primaryPos = this.getPrimaryPosition(arrangement.style, center, size);
        const primary = {
            id: `furn_primary_${Date.now()}`,
            type: arrangement.primaryPiece,
            position: primaryPos,
            rotationY: this.getPrimaryRotation(arrangement.style),
            scale: [1, 1, 1],
            groupId: 'main_group'
        };
        instances.push(primary);
        // Place secondary pieces
        const secondaryCount = arrangement.secondaryPieces.length;
        const [minDist, maxDist] = arrangement.constraints.primaryDistance;
        for (let i = 0; i < secondaryCount; i++) {
            const angle = this.getSecondaryAngle(i, secondaryCount, arrangement);
            const distance = this.randomInRange(minDist, maxDist);
            const offsetX = Math.cos(angle) * distance;
            const offsetZ = Math.sin(angle) * distance;
            const pos = new Vector3(primaryPos.x + offsetX, primaryPos.y, primaryPos.z + offsetZ);
            // Ensure within room bounds
            this.clampToBounds(pos, roomBounds, 0.5);
            const secondary = {
                id: `furn_sec_${i}_${Date.now()}`,
                type: arrangement.secondaryPieces[i],
                position: pos,
                rotationY: arrangement.constraints.facingPrimary ? this.angleToPosition(pos, primaryPos) : 0,
                scale: [1, 1, 1],
                groupId: 'main_group'
            };
            instances.push(secondary);
        }
        return instances;
    }
    /**
     * Get optimal position for primary furniture
     */
    getPrimaryPosition(style, center, size) {
        switch (style) {
            case 'conversation':
                // Center of room
                return new Vector3(center.x, center.y, center.z);
            case 'dining':
                // Slightly offset, near wall
                return new Vector3(center.x, center.y, center.z + size.z * 0.2);
            case 'workspace':
                // Near wall for desk
                return new Vector3(center.x, center.y, center.z + size.z * 0.4);
            case 'entertainment':
                // Focused on one wall
                return new Vector3(center.x, center.y, center.z - size.z * 0.3);
            default:
                return center.clone();
        }
    }
    /**
     * Get rotation for primary furniture
     */
    getPrimaryRotation(style) {
        switch (style) {
            case 'workspace':
                return Math.PI; // Face into room
            case 'dining':
                return 0;
            case 'entertainment':
                return Math.PI; // Face screen/wall
            default:
                return 0;
        }
    }
    /**
     * Calculate angle for secondary furniture placement
     */
    getSecondaryAngle(index, total, arrangement) {
        const [minAngle, maxAngle] = arrangement.constraints.secondaryAngle || [0, Math.PI * 2];
        if (total === 1) {
            return (minAngle + maxAngle) / 2;
        }
        const step = (maxAngle - minAngle) / (total - 1);
        return minAngle + index * step;
    }
    /**
     * Calculate angle from one position to another
     */
    angleToPosition(from, to) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        return Math.atan2(dx, dz);
    }
    /**
     * Clamp position to stay within bounds
     */
    clampToBounds(pos, bounds, margin) {
        pos.x = Math.max(bounds.min.x + margin, Math.min(bounds.max.x - margin, pos.x));
        pos.z = Math.max(bounds.min.z + margin, Math.min(bounds.max.z - margin, pos.z));
    }
    /**
     * Add decorative accessories to existing furniture
     */
    async addAccessories(furniture, accessoryType, countPerFurniture) {
        const accessories = [];
        for (const furn of furniture) {
            for (let i = 0; i < countPerFurniture; i++) {
                const offset = this.getRandomSurfaceOffset(furn.type);
                const accessory = {
                    id: `acc_${accessoryType}_${furn.id}_${i}`,
                    type: accessoryType,
                    position: new Vector3(furn.position.x + offset.x, furn.position.y + offset.y, furn.position.z + offset.z),
                    rotation: [0, Math.random() * Math.PI * 2, 0],
                    scale: this.randomInRange(0.3, 0.7),
                    parentSurface: furn.type,
                    metadata: {
                        parentFurniture: furn.id
                    }
                };
                accessories.push(accessory);
            }
        }
        return accessories;
    }
    /**
     * Get random offset for accessory placement on furniture
     */
    getRandomSurfaceOffset(furnitureType) {
        switch (furnitureType) {
            case 'table':
            case 'desk':
                return new Vector3(this.randomInRange(-0.5, 0.5), 0.05, this.randomInRange(-0.3, 0.3));
            case 'shelf':
                return new Vector3(this.randomInRange(-0.4, 0.4), 0.05, this.randomInRange(-0.1, 0.1));
            default:
                return new Vector3(this.randomInRange(-0.3, 0.3), 0.05, this.randomInRange(-0.3, 0.3));
        }
    }
    /**
     * Create wall decorations (pictures, shelves, etc.)
     */
    async createWallDecorations(roomBounds, wallType, decorations) {
        const instances = [];
        const wall = this.getPlacementSurface(roomBounds, `wall_${wallType}`);
        if (!wall) {
            return [];
        }
        const size = new Vector3().subVectors(wall.max, wall.min);
        for (const dec of decorations) {
            const spacing = size.x / (dec.count + 1);
            for (let i = 0; i < dec.count; i++) {
                const x = wall.min.x + spacing * (i + 1);
                const y = wall.min.y + size.y * 0.6; // Eye level
                const z = (wallType === 'north' || wallType === 'south')
                    ? wall.min.z + 0.05
                    : wall.min.z + size.z * 0.5;
                const instance = {
                    id: `wall_${dec.type}_${wallType}_${i}`,
                    type: dec.type,
                    position: new Vector3(x, y, z),
                    rotation: this.getWallRotation(wallType),
                    scale: this.randomInRange(0.8, 1.2),
                    parentSurface: `wall_${wallType}`,
                    metadata: {
                        wallType,
                        index: i
                    }
                };
                instances.push(instance);
            }
        }
        return instances;
    }
    /**
     * Get rotation for wall-mounted decorations
     */
    getWallRotation(wallType) {
        switch (wallType) {
            case 'north':
                return [0, Math.PI, 0];
            case 'south':
                return [0, 0, 0];
            case 'east':
                return [0, -Math.PI / 2, 0];
            case 'west':
                return [0, Math.PI / 2, 0];
            default:
                return [0, 0, 0];
        }
    }
    /**
     * Optimize decoration layout using hybrid bridge
     */
    async optimizeLayout(roomBounds, decorations) {
        if (!this.bridge || !HybridBridge.isConnected()) {
            // Fallback: simple collision avoidance
            return this.simpleCollisionAvoidance(decorations);
        }
        try {
            // Delegate to Python backend for optimization
            const optimized = await this.bridge.optimizeDecorationLayout(roomBounds, decorations);
            return optimized;
        }
        catch (error) {
            console.warn('Bridge optimization failed, using fallback:', error);
            return this.simpleCollisionAvoidance(decorations);
        }
    }
    /**
     * Simple collision avoidance fallback
     */
    simpleCollisionAvoidance(decorations) {
        const minSpacing = 0.3;
        const result = [...decorations];
        for (let i = 0; i < result.length; i++) {
            for (let j = i + 1; j < result.length; j++) {
                const dist = result[i].position.distanceTo(result[j].position);
                if (dist < minSpacing) {
                    // Push apart
                    const dir = new Vector3()
                        .subVectors(result[j].position, result[i].position)
                        .normalize();
                    const push = (minSpacing - dist) / 2;
                    result[i].position.sub(dir.clone().multiplyScalar(push));
                    result[j].position.add(dir.clone().multiplyScalar(push));
                }
            }
        }
        return result;
    }
    /**
     * Utility: Random integer in range
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    /**
     * Utility: Random float in range
     */
    randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }
}
export { RoomDecorator as default };
//# sourceMappingURL=RoomDecorator.js.map