/**
 * Wildlife System
 *
 * Procedural animal generation, behavior trees, flocking simulation,
 * and ecosystem dynamics for living worlds.
 *
 * @module WildlifeSystem
 */
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
export class WildlifeSystem {
    constructor(scene, bounds) {
        this.animals = new Map();
        this.nextId = 0;
        this.scene = scene;
        this.bounds = bounds;
        this.noise = new SimplexNoise();
    }
    /**
     * Add an animal to the ecosystem
     */
    addAnimal(type, position, params) {
        const defaultParams = {
            bird: {
                type: 'bird',
                size: 0.3,
                speed: 15,
                turnSpeed: 3,
                perceptionRadius: 20,
                separationDistance: 2,
                alignmentWeight: 1.5,
                cohesionWeight: 1.0,
                separationWeight: 2.0
            },
            fish: {
                type: 'fish',
                size: 0.2,
                speed: 8,
                turnSpeed: 4,
                perceptionRadius: 15,
                separationDistance: 1.5,
                alignmentWeight: 2.0,
                cohesionWeight: 1.5,
                separationWeight: 2.5
            },
            mammal: {
                type: 'mammal',
                size: 1.0,
                speed: 6,
                turnSpeed: 2,
                perceptionRadius: 25,
                separationDistance: 3,
                alignmentWeight: 1.0,
                cohesionWeight: 0.8,
                separationWeight: 1.5
            },
            insect: {
                type: 'insect',
                size: 0.05,
                speed: 5,
                turnSpeed: 8,
                perceptionRadius: 8,
                separationDistance: 0.5,
                alignmentWeight: 1.2,
                cohesionWeight: 1.0,
                separationWeight: 1.8
            },
            reptile: {
                type: 'reptile',
                size: 0.8,
                speed: 3,
                turnSpeed: 1.5,
                perceptionRadius: 12,
                separationDistance: 2,
                alignmentWeight: 0.5,
                cohesionWeight: 0.3,
                separationWeight: 1.0
            }
        };
        const baseParams = defaultParams[type];
        const finalParams = { ...baseParams, ...params };
        const animal = {
            id: `${type}_${this.nextId++}`,
            position: position || this.getRandomPosition(),
            velocity: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(finalParams.speed),
            acceleration: new THREE.Vector3(),
            params: finalParams,
            behavior: 'wandering',
            mesh: this.createAnimalMesh(type, finalParams.size),
            health: 100,
            energy: 100,
            age: 0
        };
        this.animals.set(animal.id, animal);
        this.scene.add(animal.mesh);
        return animal;
    }
    /**
     * Create a simple mesh representation for an animal
     */
    createAnimalMesh(type, size) {
        let geometry;
        let material;
        let color;
        switch (type) {
            case 'bird':
                color = 0xffffff;
                geometry = new THREE.ConeGeometry(size, size * 2, 8);
                geometry.rotateX(Math.PI / 2);
                break;
            case 'fish':
                color = 0xffaa00;
                geometry = new THREE.SphereGeometry(size, 8, 8);
                geometry.scale(1, 0.6, 1.5);
                break;
            case 'mammal':
                color = 0x8b4513;
                geometry = new THREE.BoxGeometry(size, size * 0.6, size * 1.5);
                break;
            case 'insect':
                color = 0x00ff00;
                geometry = new THREE.OctahedronGeometry(size);
                break;
            case 'reptile':
                color = 0x228b22;
                geometry = new THREE.CapsuleGeometry(size * 0.5, size, 4, 8);
                break;
            default:
                color = 0x888888;
                geometry = new THREE.SphereGeometry(size, 8, 8);
        }
        material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9
        });
        return new THREE.Mesh(geometry, material);
    }
    /**
     * Get random position within bounds
     */
    getRandomPosition() {
        return new THREE.Vector3(this.bounds.min.x + Math.random() * (this.bounds.max.x - this.bounds.min.x), this.bounds.min.y + Math.random() * (this.bounds.max.y - this.bounds.min.y), this.bounds.min.z + Math.random() * (this.bounds.max.z - this.bounds.min.z));
    }
    /**
     * Update all animals in the ecosystem
     */
    update(deltaTime) {
        const animalsArray = Array.from(this.animals.values());
        // Group animals by type for flocking
        const animalGroups = new Map();
        for (const animal of animalsArray) {
            // Update age and energy
            animal.age += deltaTime;
            animal.energy = Math.max(0, animal.energy - deltaTime * 0.5);
            // Update behavior based on state
            this.updateBehavior(animal, deltaTime);
            // Apply flocking forces
            this.applyFlockingForces(animal, animalsArray);
            // Integrate movement
            this.integrateMovement(animal, deltaTime);
            // Keep within bounds
            this.constrainToBounds(animal);
            // Update mesh position
            animal.mesh.position.copy(animal.position);
            animal.mesh.lookAt(animal.position.clone().add(animal.velocity));
            // Group by type
            if (!animalGroups.has(animal.params.type)) {
                animalGroups.set(animal.params.type, []);
            }
            animalGroups.get(animal.params.type).push(animal);
        }
    }
    /**
     * Update animal behavior state
     */
    updateBehavior(animal, deltaTime) {
        const time = Date.now() * 0.001;
        const noiseValue = this.noise.noise3D(animal.position.x * 0.1, animal.position.z * 0.1, time * 0.1);
        // Simple state machine
        if (animal.energy < 20) {
            animal.behavior = 'resting';
            animal.velocity.multiplyScalar(0.95);
        }
        else if (noiseValue > 0.7) {
            animal.behavior = 'wandering';
        }
        else if (noiseValue < -0.7) {
            animal.behavior = 'idle';
            animal.velocity.multiplyScalar(0.9);
        }
        else {
            animal.behavior = 'wandering';
        }
        // Recover energy when resting
        if (animal.behavior === 'resting') {
            animal.energy = Math.min(100, animal.energy + deltaTime * 2);
        }
    }
    /**
     * Apply Reynolds flocking behaviors
     */
    applyFlockingForces(animal, allAnimals) {
        const neighbors = [];
        // Find neighbors within perception radius
        for (const other of allAnimals) {
            if (other.id !== animal.id &&
                other.params.type === animal.params.type &&
                animal.position.distanceTo(other.position) < animal.params.perceptionRadius) {
                neighbors.push(other);
            }
        }
        if (neighbors.length === 0)
            return;
        // Separation: steer to avoid crowding
        const separation = new THREE.Vector3();
        for (const neighbor of neighbors) {
            const diff = animal.position.clone().sub(neighbor.position);
            const dist = diff.length();
            if (dist > 0 && dist < animal.params.separationDistance) {
                diff.normalize().divideScalar(dist);
                separation.add(diff);
            }
        }
        separation.multiplyScalar(animal.params.separationWeight);
        // Alignment: steer towards average heading
        const alignment = new THREE.Vector3();
        for (const neighbor of neighbors) {
            alignment.add(neighbor.velocity);
        }
        alignment.divideScalar(neighbors.length).normalize().multiplyScalar(animal.params.speed);
        alignment.sub(animal.velocity).multiplyScalar(animal.params.alignmentWeight);
        // Cohesion: steer towards center of mass
        const cohesion = new THREE.Vector3();
        for (const neighbor of neighbors) {
            cohesion.add(neighbor.position);
        }
        cohesion.divideScalar(neighbors.length).sub(animal.position).normalize().multiplyScalar(animal.params.speed);
        cohesion.sub(animal.velocity).multiplyScalar(animal.params.cohesionWeight);
        // Apply forces
        animal.acceleration.add(separation);
        animal.acceleration.add(alignment);
        animal.acceleration.add(cohesion);
    }
    /**
     * Integrate velocity and position
     */
    integrateMovement(animal, deltaTime) {
        // Limit acceleration
        const maxForce = animal.params.turnSpeed;
        if (animal.acceleration.length() > maxForce) {
            animal.acceleration.normalize().multiplyScalar(maxForce);
        }
        // Update velocity
        animal.velocity.add(animal.acceleration.clone().multiplyScalar(deltaTime));
        // Limit speed
        if (animal.velocity.length() > animal.params.speed) {
            animal.velocity.normalize().multiplyScalar(animal.params.speed);
        }
        // Update position
        animal.position.add(animal.velocity.clone().multiplyScalar(deltaTime));
        // Reset acceleration
        animal.acceleration.set(0, 0, 0);
    }
    /**
     * Constrain animal to world bounds
     */
    constrainToBounds(animal) {
        const margin = 5;
        const turnFactor = 0.1;
        if (animal.position.x < this.bounds.min.x + margin) {
            animal.velocity.x += turnFactor;
        }
        if (animal.position.x > this.bounds.max.x - margin) {
            animal.velocity.x -= turnFactor;
        }
        if (animal.position.y < this.bounds.min.y + margin) {
            animal.velocity.y += turnFactor;
        }
        if (animal.position.y > this.bounds.max.y - margin) {
            animal.velocity.y -= turnFactor;
        }
        if (animal.position.z < this.bounds.min.z + margin) {
            animal.velocity.z += turnFactor;
        }
        if (animal.position.z > this.bounds.max.z - margin) {
            animal.velocity.z -= turnFactor;
        }
    }
    /**
     * Remove an animal from the ecosystem
     */
    removeAnimal(id) {
        const animal = this.animals.get(id);
        if (animal) {
            this.scene.remove(animal.mesh);
            this.animals.delete(id);
        }
    }
    /**
     * Get all animals
     */
    getAllAnimals() {
        return Array.from(this.animals.values());
    }
    /**
     * Get animals by type
     */
    getAnimalsByType(type) {
        return Array.from(this.animals.values()).filter(a => a.params.type === type);
    }
    /**
     * Get animal count
     */
    getAnimalCount() {
        return this.animals.size;
    }
}
export default WildlifeSystem;
//# sourceMappingURL=WildlifeSystem.js.map