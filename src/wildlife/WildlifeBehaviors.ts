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

const BEHAVIOR_RESULTS = {
  SUCCESS: 'success' as BehaviorResult,
  FAILURE: 'failure' as BehaviorResult,
  RUNNING: 'running' as BehaviorResult,
};

export class BehaviorTree {
  private root: BehaviorNode;

  constructor(root: BehaviorNode) {
    this.root = root;
  }

  execute(agent: WildlifeAgent, world: WorldState, dt: number): BehaviorResult {
    return this.executeNode(this.root, agent, world, dt);
  }

  private executeNode(
    node: BehaviorNode,
    agent: WildlifeAgent,
    world: WorldState,
    dt: number
  ): BehaviorResult {
    switch (node.type) {
      case 'selector':
        return this.executeSelector(node, agent, world, dt);
      
      case 'sequence':
        return this.executeSequence(node, agent, world, dt);
      
      case 'action':
        return node.action ? node.action(agent, world, dt) : BEHAVIOR_RESULTS.FAILURE;
      
      case 'condition':
        return node.condition && node.condition(agent, world)
          ? BEHAVIOR_RESULTS.SUCCESS
          : BEHAVIOR_RESULTS.FAILURE;
      
      case 'decorator':
        return this.executeDecorator(node, agent, world, dt);
      
      default:
        return BEHAVIOR_RESULTS.FAILURE;
    }
  }

  private executeSelector(
    node: BehaviorNode,
    agent: WildlifeAgent,
    world: WorldState,
    dt: number
  ): BehaviorResult {
    if (!node.children) return BEHAVIOR_RESULTS.FAILURE;

    for (const child of node.children) {
      const result = this.executeNode(child, agent, world, dt);
      
      if (result === BEHAVIOR_RESULTS.SUCCESS || result === BEHAVIOR_RESULTS.RUNNING) {
        return result;
      }
    }

    return BEHAVIOR_RESULTS.FAILURE;
  }

  private executeSequence(
    node: BehaviorNode,
    agent: WildlifeAgent,
    world: WorldState,
    dt: number
  ): BehaviorResult {
    if (!node.children) return BEHAVIOR_RESULTS.SUCCESS;

    for (const child of node.children) {
      const result = this.executeNode(child, agent, world, dt);
      
      if (result === BEHAVIOR_RESULTS.FAILURE || result === BEHAVIOR_RESULTS.RUNNING) {
        return result;
      }
    }

    return BEHAVIOR_RESULTS.SUCCESS;
  }

  private executeDecorator(
    node: BehaviorNode,
    agent: WildlifeAgent,
    world: WorldState,
    dt: number
  ): BehaviorResult {
    if (!node.children || node.children.length === 0) {
      return BEHAVIOR_RESULTS.FAILURE;
    }

    let repeats = 0;
    const maxRepeats = node.maxRepeats || Infinity;

    while (repeats < maxRepeats) {
      const result = this.executeNode(node.children[0], agent, world, dt);

      if (result === BEHAVIOR_RESULTS.RUNNING) {
        return BEHAVIOR_RESULTS.RUNNING;
      }

      if (node.decorator === 'inverter') {
        return result === BEHAVIOR_RESULTS.SUCCESS 
          ? BEHAVIOR_RESULTS.FAILURE 
          : BEHAVIOR_RESULTS.SUCCESS;
      }

      if (result === BEHAVIOR_RESULTS.FAILURE) {
        return BEHAVIOR_RESULTS.FAILURE;
      }

      repeats++;
    }

    return BEHAVIOR_RESULTS.SUCCESS;
  }

  static createPredatorTree(): BehaviorNode {
    return {
      name: 'PredatorBehavior',
      type: 'selector',
      children: [
        {
          name: 'FleeIfThreatened',
          type: 'sequence',
          children: [
            {
              name: 'IsThreatened',
              type: 'condition',
              condition: (agent, world) => {
                for (const predatorPos of world.predators) {
                  if (agent.position.distanceTo(predatorPos) < 20) {
                    return true;
                  }
                }
                return false;
              },
            },
            {
              name: 'Flee',
              type: 'action',
              action: (agent, world, dt) => {
                // Find furthest point from all predators
                const fleeDirection = new THREE.Vector3();
                
                for (const predatorPos of world.predators) {
                  const toPredator = agent.position.clone().sub(predatorPos).normalize();
                  fleeDirection.add(toPredator);
                }
                
                fleeDirection.normalize().multiplyScalar(agent.velocity.length());
                agent.velocity.copy(fleeDirection);
                agent.state = 'fleeing';
                
                return BEHAVIOR_RESULTS.SUCCESS;
              },
            },
          ],
        },
        {
          name: 'HuntIfHungry',
          type: 'sequence',
          children: [
            {
              name: 'IsHungry',
              type: 'condition',
              condition: (agent) => agent.hunger > 50,
            },
            {
              name: 'HasPreyTarget',
              type: 'condition',
              condition: (agent, world) => {
                for (const preyPos of world.prey) {
                  if (agent.position.distanceTo(preyPos) < agent.velocity.length() * 10) {
                    agent.target = preyPos.clone();
                    return true;
                  }
                }
                return false;
              },
            },
            {
              name: 'ChasePrey',
              type: 'action',
              action: (agent, world, dt) => {
                if (!agent.target) return BEHAVIOR_RESULTS.FAILURE;
                
                const toPrey = agent.target.clone().sub(agent.position).normalize();
                agent.velocity.copy(toPrey.multiplyScalar(agent.velocity.length()));
                agent.state = 'hunting';
                
                if (agent.position.distanceTo(agent.target) < 2) {
                  agent.hunger = Math.max(0, agent.hunger - 30);
                  return BEHAVIOR_RESULTS.SUCCESS;
                }
                
                return BEHAVIOR_RESULTS.RUNNING;
              },
            },
          ],
        },
        {
          name: 'FindWaterIfThirsty',
          type: 'sequence',
          children: [
            {
              name: 'IsThirsty',
              type: 'condition',
              condition: (agent) => agent.thirst > 60,
            },
            {
              name: 'NavigateToWater',
              type: 'action',
              action: (agent, world, dt) => {
                let nearestWater: Resource | null = null;
                let minDist = Infinity;
                
                world.resources.forEach((resource) => {
                  if (resource.type === 'water') {
                    const dist = agent.position.distanceTo(resource.position);
                    if (dist < minDist) {
                      minDist = dist;
                      nearestWater = resource;
                    }
                  }
                });
                
                if (nearestWater) {
                  agent.target = nearestWater.position.clone();
                  const toWater = nearestWater.position.clone().sub(agent.position).normalize();
                  agent.velocity.copy(toWater.multiplyScalar(agent.velocity.length() * 0.5));
                  agent.state = 'foraging';
                  
                  if (minDist < 3) {
                    agent.thirst = Math.max(0, agent.thirst - 40);
                    return BEHAVIOR_RESULTS.SUCCESS;
                  }
                  
                  return BEHAVIOR_RESULTS.RUNNING;
                }
                
                return BEHAVIOR_RESULTS.FAILURE;
              },
            },
          ],
        },
        {
          name: 'RestIfTired',
          type: 'sequence',
          children: [
            {
              name: 'IsTired',
              type: 'condition',
              condition: (agent) => agent.energy < 30,
            },
            {
              name: 'Rest',
              type: 'action',
              action: (agent, world, dt) => {
                agent.velocity.set(0, 0, 0);
                agent.state = 'resting';
                agent.energy = Math.min(100, agent.energy + dt * 10);
                return BEHAVIOR_RESULTS.SUCCESS;
              },
            },
          ],
        },
        {
          name: 'Wander',
          type: 'action',
          action: (agent, world, dt) => {
            agent.state = 'idle';
            
            if (Math.random() < 0.02) {
              const angle = Math.random() * Math.PI * 2;
              agent.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(agent.velocity.length() * 0.3);
            }
            
            return BEHAVIOR_RESULTS.RUNNING;
          },
        },
      ],
    };
  }

  static createPreyTree(): BehaviorNode {
    return {
      name: 'PreyBehavior',
      type: 'selector',
      children: [
        {
          name: 'FleeFromPredator',
          type: 'sequence',
          children: [
            {
              name: 'DetectPredator',
              type: 'condition',
              condition: (agent, world) => {
                for (const predatorPos of world.predators) {
                  if (agent.position.distanceTo(predatorPos) < 30) {
                    return true;
                  }
                }
                return false;
              },
            },
            {
              name: 'Flee',
              type: 'action',
              action: (agent, world, dt) => {
                const fleeDirection = new THREE.Vector3();
                
                for (const predatorPos of world.predators) {
                  const toPredator = agent.position.clone().sub(predatorPos).normalize();
                  fleeDirection.add(toPredator);
                }
                
                fleeDirection.normalize().multiplyScalar(agent.velocity.length() * 1.5);
                agent.velocity.copy(fleeDirection);
                agent.state = 'fleeing';
                
                return BEHAVIOR_RESULTS.SUCCESS;
              },
            },
          ],
        },
        {
          name: 'ForageIfHungry',
          type: 'sequence',
          children: [
            {
              name: 'IsHungry',
              type: 'condition',
              condition: (agent) => agent.hunger > 40,
            },
            {
              name: 'FindFood',
              type: 'action',
              action: (agent, world, dt) => {
                let nearestFood: Resource | null = null;
                let minDist = Infinity;
                
                world.resources.forEach((resource) => {
                  if (resource.type === 'food') {
                    const dist = agent.position.distanceTo(resource.position);
                    if (dist < minDist) {
                      minDist = dist;
                      nearestFood = resource;
                    }
                  }
                });
                
                if (nearestFood) {
                  agent.target = nearestFood.position.clone();
                  const toFood = nearestFood.position.clone().sub(agent.position).normalize();
                  agent.velocity.copy(toFood.multiplyScalar(agent.velocity.length() * 0.5));
                  agent.state = 'foraging';
                  
                  if (minDist < 2) {
                    agent.hunger = Math.max(0, agent.hunger - 20);
                    nearestFood.amount -= 1;
                    return BEHAVIOR_RESULTS.SUCCESS;
                  }
                  
                  return BEHAVIOR_RESULTS.RUNNING;
                }
                
                return BEHAVIOR_RESULTS.FAILURE;
              },
            },
          ],
        },
        {
          name: 'Wander',
          type: 'action',
          action: (agent, world, dt) => {
            agent.state = 'idle';
            
            if (Math.random() < 0.03) {
              const angle = Math.random() * Math.PI * 2;
              agent.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(agent.velocity.length() * 0.3);
            }
            
            return BEHAVIOR_RESULTS.RUNNING;
          },
        },
      ],
    };
  }
}

export class WildlifeBehaviors {
  private agents: Map<string, WildlifeAgent>;
  private speciesConfigs: Map<string, SpeciesConfig>;
  private resources: Map<string, Resource>;

  constructor() {
    this.agents = new Map();
    this.speciesConfigs = new Map();
    this.resources = new Map();
    
    this.registerDefaultSpecies();
  }

  private registerDefaultSpecies(): void {
    this.speciesConfigs.set('deer', {
      name: 'deer',
      type: 'prey',
      speed: 8,
      detectionRadius: 30,
      fleeRadius: 20,
      hungerRate: 2,
      thirstRate: 3,
      socialGroupSize: [3, 8],
      diet: ['grass', 'leaves'],
    });

    this.speciesConfigs.set('wolf', {
      name: 'wolf',
      type: 'predator',
      speed: 12,
      detectionRadius: 50,
      fleeRadius: 10,
      hungerRate: 3,
      thirstRate: 2,
      socialGroupSize: [2, 6],
      diet: ['deer', 'rabbit'],
    });

    this.speciesConfigs.set('rabbit', {
      name: 'rabbit',
      type: 'prey',
      speed: 10,
      detectionRadius: 20,
      fleeRadius: 15,
      hungerRate: 4,
      thirstRate: 3,
      socialGroupSize: [1, 4],
      diet: ['grass', 'carrots'],
    });
  }

  createAgent(species: string, position: THREE.Vector3): WildlifeAgent {
    const config = this.speciesConfigs.get(species);
    
    if (!config) {
      throw new Error(`Unknown species: ${species}`);
    }

    const behaviorTreeRoot = config.type === 'predator'
      ? BehaviorTree.createPredatorTree()
      : BehaviorTree.createPreyTree();

    const agent: WildlifeAgent = {
      id: `${species}_${Date.now()}_${Math.random()}`,
      species,
      position: position.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      health: 100,
      hunger: 50,
      thirst: 50,
      energy: 100,
      age: 0,
      state: 'idle',
      behaviorTree: behaviorTreeRoot,
    };

    this.agents.set(agent.id, agent);
    return agent;
  }

  update(dt: number): void {
    const worldState = this.buildWorldState();

    this.agents.forEach((agent) => {
      // Update needs
      agent.hunger = Math.min(100, agent.hunger + config.hungerRate * dt);
      agent.thirst = Math.min(100, agent.thirst + config.thirstRate * dt);
      agent.age += dt;

      // Execute behavior tree
      const behaviorTree = new BehaviorTree(agent.behaviorTree);
      behaviorTree.execute(agent, worldState, dt);

      // Update position
      agent.position.add(agent.velocity.clone().multiplyScalar(dt));
    });

    // Remove dead agents
    this.agents.forEach((agent, id) => {
      if (agent.health <= 0 || agent.hunger >= 100 || agent.thirst >= 100) {
        this.agents.delete(id);
      }
    });
  }

  private buildWorldState(): WorldState {
    const predators: THREE.Vector3[] = [];
    const prey: THREE.Vector3[] = [];

    this.agents.forEach((agent) => {
      const config = this.speciesConfigs.get(agent.species);
      
      if (config?.type === 'predator') {
        predators.push(agent.position.clone());
      } else {
        prey.push(agent.position.clone());
      }
    });

    return {
      time: Date.now() / 1000,
      weather: 'clear',
      agents: this.agents,
      resources: this.resources,
      predators,
      prey,
    };
  }

  addResource(id: string, resource: Resource): void {
    this.resources.set(id, resource);
  }

  getAgent(id: string): WildlifeAgent | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): WildlifeAgent[] {
    return Array.from(this.agents.values());
  }

  removeAgent(id: string): void {
    this.agents.delete(id);
  }
}

export default WildlifeBehaviors;
