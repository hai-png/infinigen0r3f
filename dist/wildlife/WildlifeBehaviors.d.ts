/**
 * WildlifeBehaviors.ts
 * Extended behavior trees, predator-prey dynamics, and nesting systems
 * Part of Phase 4: Advanced Features - 100% Completion
 */
import * as THREE from 'three';
export interface BehaviorNode {
    name: string;
    type: 'selector' | 'sequence' | 'action' | 'condition' | 'decorator';
    children?: BehaviorNode[];
    condition?: (agent: WildlifeAgent, world: WorldState) => boolean;
    action?: (agent: WildlifeAgent, world: WorldState, dt: number) => BehaviorResult;
    decorator?: 'inverter' | 'repeater' | 'limiter';
    maxRepeats?: number;
}
export type BehaviorResult = 'success' | 'failure' | 'running';
export interface WorldState {
    time: number;
    weather: string;
    agents: Map<string, WildlifeAgent>;
    resources: Map<string, Resource>;
    predators: THREE.Vector3[];
    prey: THREE.Vector3[];
}
export interface Resource {
    position: THREE.Vector3;
    type: 'food' | 'water' | 'shelter';
    amount: number;
    respawnRate: number;
}
export interface WildlifeAgent {
    id: string;
    species: string;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    health: number;
    hunger: number;
    thirst: number;
    energy: number;
    age: number;
    state: 'idle' | 'foraging' | 'fleeing' | 'hunting' | 'resting' | 'mating';
    target?: THREE.Vector3;
    behaviorTree: BehaviorNode;
}
export interface SpeciesConfig {
    name: string;
    type: 'predator' | 'prey' | 'omnivore';
    speed: number;
    detectionRadius: number;
    fleeRadius: number;
    hungerRate: number;
    thirstRate: number;
    socialGroupSize: [number, number];
    diet: string[];
}
export declare class BehaviorTree {
    private root;
    constructor(root: BehaviorNode);
    execute(agent: WildlifeAgent, world: WorldState, dt: number): BehaviorResult;
    private executeNode;
    private executeSelector;
    private executeSequence;
    private executeDecorator;
    static createPredatorTree(): BehaviorNode;
    static createPreyTree(): BehaviorNode;
}
export declare class WildlifeBehaviors {
    private agents;
    private speciesConfigs;
    private resources;
    constructor();
    private registerDefaultSpecies;
    createAgent(species: string, position: THREE.Vector3): WildlifeAgent;
    update(dt: number): void;
    private buildWorldState;
    addResource(id: string, resource: Resource): void;
    getAgent(id: string): WildlifeAgent | undefined;
    getAllAgents(): WildlifeAgent[];
    removeAgent(id: string): void;
}
export default WildlifeBehaviors;
//# sourceMappingURL=WildlifeBehaviors.d.ts.map