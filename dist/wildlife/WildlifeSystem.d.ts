/**
 * Wildlife System
 *
 * Procedural animal generation, behavior trees, flocking simulation,
 * and ecosystem dynamics for living worlds.
 *
 * @module WildlifeSystem
 */
import * as THREE from 'three';
export type AnimalType = 'bird' | 'fish' | 'mammal' | 'insect' | 'reptile';
export type BehaviorState = 'idle' | 'wandering' | 'fleeing' | 'chasing' | 'resting' | 'feeding';
export interface AnimalParams {
    type: AnimalType;
    size: number;
    speed: number;
    turnSpeed: number;
    perceptionRadius: number;
    separationDistance: number;
    alignmentWeight: number;
    cohesionWeight: number;
    separationWeight: number;
}
export interface Animal {
    id: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration: THREE.Vector3;
    params: AnimalParams;
    behavior: BehaviorState;
    mesh: THREE.Mesh | THREE.Group;
    health: number;
    energy: number;
    age: number;
}
export declare class WildlifeSystem {
    private animals;
    private scene;
    private noise;
    private nextId;
    private bounds;
    constructor(scene: THREE.Scene, bounds: THREE.Box3);
    /**
     * Add an animal to the ecosystem
     */
    addAnimal(type: AnimalType, position?: THREE.Vector3, params?: Partial<AnimalParams>): Animal;
    /**
     * Create a simple mesh representation for an animal
     */
    private createAnimalMesh;
    /**
     * Get random position within bounds
     */
    private getRandomPosition;
    /**
     * Update all animals in the ecosystem
     */
    update(deltaTime: number): void;
    /**
     * Update animal behavior state
     */
    private updateBehavior;
    /**
     * Apply Reynolds flocking behaviors
     */
    private applyFlockingForces;
    /**
     * Integrate velocity and position
     */
    private integrateMovement;
    /**
     * Constrain animal to world bounds
     */
    private constrainToBounds;
    /**
     * Remove an animal from the ecosystem
     */
    removeAnimal(id: string): void;
    /**
     * Get all animals
     */
    getAllAnimals(): Animal[];
    /**
     * Get animals by type
     */
    getAnimalsByType(type: AnimalType): Animal[];
    /**
     * Get animal count
     */
    getAnimalCount(): number;
}
export default WildlifeSystem;
//# sourceMappingURL=WildlifeSystem.d.ts.map