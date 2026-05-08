/**
 * BehaviorTree - Full behavior tree implementation for creature AI
 * Implements composite/leaf pattern with Selector, Sequence, Repeat nodes
 * plus built-in actions and conditions for common creature behaviors
 */

import { SeededRandom } from '../../../../core/util/MathUtils';

export enum BehaviorStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  RUNNING = 'RUNNING',
}

// ── Context ──────────────────────────────────────────────────────────

export interface CreatureContext {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  health: number;
  hunger: number;       // 0-1, 1 = starving
  energy: number;       // 0-1, 1 = fully rested
  threatLevel: number;  // 0-1, 1 = maximum threat
  targetPosition: { x: number; y: number; z: number } | null;
  homePosition: { x: number; y: number; z: number };
  wanderTarget: { x: number; y: number; z: number } | null;
  currentAction: string;
  actionTimer: number;
  maxWanderRadius: number;
  fleeSpeed: number;
  wanderSpeed: number;
}

export function createDefaultContext(): CreatureContext {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    health: 1.0,
    hunger: 0.3,
    energy: 0.8,
    threatLevel: 0.0,
    targetPosition: null,
    homePosition: { x: 0, y: 0, z: 0 },
    wanderTarget: null,
    currentAction: 'idle',
    actionTimer: 0,
    maxWanderRadius: 10.0,
    fleeSpeed: 3.0,
    wanderSpeed: 1.0,
  };
}

// ── Abstract Base ────────────────────────────────────────────────────

export abstract class BehaviorNode {
  public name: string;

  constructor(name: string) {
    this.name = name;
  }

  abstract tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus;

  reset(_ctx: CreatureContext): void {
    // Override in subclasses that need reset behavior
  }
}

// ── Composite Nodes ──────────────────────────────────────────────────

/**
 * SelectorNode - tries children in order, succeeds if any child succeeds
 * Returns RUNNING if any child is running
 * Returns FAILURE only if all children fail
 */
export class SelectorNode extends BehaviorNode {
  private children: BehaviorNode[];
  private runningIndex: number = -1;

  constructor(name: string, children: BehaviorNode[] = []) {
    super(name);
    this.children = children;
  }

  addChild(child: BehaviorNode): void {
    this.children.push(child);
  }

  tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus {
    // If a child was running, continue from where we left off
    const startIndex = this.runningIndex >= 0 ? this.runningIndex : 0;

    for (let i = startIndex; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx, deltaTime);

      if (status === BehaviorStatus.RUNNING) {
        this.runningIndex = i;
        return BehaviorStatus.RUNNING;
      }

      if (status === BehaviorStatus.SUCCESS) {
        this.runningIndex = -1;
        return BehaviorStatus.SUCCESS;
      }

      // FAILURE: continue to next child
    }

    this.runningIndex = -1;
    return BehaviorStatus.FAILURE;
  }

  reset(ctx: CreatureContext): void {
    this.runningIndex = -1;
    for (const child of this.children) {
      child.reset(ctx);
    }
  }
}

/**
 * SequenceNode - runs children in order, fails if any child fails
 * Returns RUNNING if any child is running
 * Returns SUCCESS only if all children succeed
 */
export class SequenceNode extends BehaviorNode {
  private children: BehaviorNode[];
  private runningIndex: number = 0;

  constructor(name: string, children: BehaviorNode[] = []) {
    super(name);
    this.children = children;
  }

  addChild(child: BehaviorNode): void {
    this.children.push(child);
  }

  tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus {
    for (let i = this.runningIndex; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx, deltaTime);

      if (status === BehaviorStatus.RUNNING) {
        this.runningIndex = i;
        return BehaviorStatus.RUNNING;
      }

      if (status === BehaviorStatus.FAILURE) {
        this.runningIndex = 0;
        return BehaviorStatus.FAILURE;
      }

      // SUCCESS: continue to next child
    }

    this.runningIndex = 0;
    return BehaviorStatus.SUCCESS;
  }

  reset(ctx: CreatureContext): void {
    this.runningIndex = 0;
    for (const child of this.children) {
      child.reset(ctx);
    }
  }
}

/**
 * RepeatNode - repeats child N times or until failure
 * count <= 0 means repeat indefinitely until failure
 */
export class RepeatNode extends BehaviorNode {
  private child: BehaviorNode;
  private repeatCount: number;
  private currentCount: number = 0;

  constructor(name: string, child: BehaviorNode, repeatCount: number = -1) {
    super(name);
    this.child = child;
    this.repeatCount = repeatCount;
  }

  tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus {
    const status = this.child.tick(ctx, deltaTime);

    if (status === BehaviorStatus.RUNNING) {
      return BehaviorStatus.RUNNING;
    }

    if (status === BehaviorStatus.FAILURE) {
      this.currentCount = 0;
      this.child.reset(ctx);
      return BehaviorStatus.FAILURE;
    }

    // Child succeeded
    this.currentCount++;

    if (this.repeatCount > 0 && this.currentCount >= this.repeatCount) {
      this.currentCount = 0;
      this.child.reset(ctx);
      return BehaviorStatus.SUCCESS;
    }

    // Repeat
    this.child.reset(ctx);
    return BehaviorStatus.RUNNING;
  }

  reset(ctx: CreatureContext): void {
    this.currentCount = 0;
    this.child.reset(ctx);
  }
}

// ── Leaf Nodes ───────────────────────────────────────────────────────

/**
 * ActionNode - leaf node that executes a function
 */
export class ActionNode extends BehaviorNode {
  private action: (ctx: CreatureContext, deltaTime: number) => BehaviorStatus;

  constructor(
    name: string,
    action: (ctx: CreatureContext, deltaTime: number) => BehaviorStatus
  ) {
    super(name);
    this.action = action;
  }

  tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus {
    ctx.currentAction = this.name;
    return this.action(ctx, deltaTime);
  }
}

/**
 * ConditionNode - leaf node that checks a condition
 * Returns SUCCESS or FAILURE immediately (never RUNNING)
 */
export class ConditionNode extends BehaviorNode {
  private condition: (ctx: CreatureContext) => boolean;

  constructor(
    name: string,
    condition: (ctx: CreatureContext) => boolean
  ) {
    super(name);
    this.condition = condition;
  }

  tick(ctx: CreatureContext, deltaTime: number): BehaviorStatus {
    return this.condition(ctx) ? BehaviorStatus.SUCCESS : BehaviorStatus.FAILURE;
  }
}

// ── Built-in Conditions ──────────────────────────────────────────────

export class IsThreatenedCondition extends ConditionNode {
  constructor(threshold: number = 0.5) {
    super('isThreatened', (ctx) => ctx.threatLevel >= threshold);
  }
}

export class IsHungryCondition extends ConditionNode {
  constructor(threshold: number = 0.6) {
    super('isHungry', (ctx) => ctx.hunger >= threshold);
  }
}

export class IsTiredCondition extends ConditionNode {
  constructor(threshold: number = 0.3) {
    super('isTired', (ctx) => ctx.energy <= threshold);
  }
}

// ── Built-in Actions ─────────────────────────────────────────────────

export class IdleAction extends ActionNode {
  private duration: number;
  private elapsed: number = 0;

  constructor(duration: number = 2.0) {
    super('idle', (ctx, dt) => {
      this.elapsed += dt;
      ctx.velocity = { x: 0, y: 0, z: 0 };
      ctx.currentAction = 'idle';

      // Recover energy while idle
      ctx.energy = Math.min(1.0, ctx.energy + dt * 0.05);

      if (this.elapsed >= this.duration) {
        this.elapsed = 0;
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.RUNNING;
    });
    this.duration = duration;
  }

  reset(_ctx: CreatureContext): void {
    this.elapsed = 0;
  }
}

export class WanderAction extends ActionNode {
  private wanderDuration: number;
  private elapsed: number = 0;
  private rng: SeededRandom;

  constructor(wanderDuration: number = 3.0, seed: number = 42) {
    super('wander', (ctx, dt) => {
      this.elapsed += dt;
      ctx.currentAction = 'wander';

      // Pick a new wander target if needed
      if (!ctx.wanderTarget || this.elapsed <= dt * 2) {
        const angle = this.rng.next() * Math.PI * 2;
        const dist = this.rng.next() * ctx.maxWanderRadius;
        ctx.wanderTarget = {
          x: ctx.homePosition.x + Math.cos(angle) * dist,
          y: ctx.position.y,
          z: ctx.homePosition.z + Math.sin(angle) * dist,
        };
      }

      // Move toward wander target
      const dx = ctx.wanderTarget.x - ctx.position.x;
      const dz = ctx.wanderTarget.z - ctx.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        const speed = ctx.wanderSpeed;
        ctx.velocity = {
          x: (dx / dist) * speed,
          y: 0,
          z: (dz / dist) * speed,
        };
      } else {
        ctx.velocity = { x: 0, y: 0, z: 0 };
      }

      // Drain energy and increase hunger while walking
      ctx.energy = Math.max(0, ctx.energy - dt * 0.02);
      ctx.hunger = Math.min(1.0, ctx.hunger + dt * 0.01);

      if (this.elapsed >= this.wanderDuration) {
        this.elapsed = 0;
        ctx.velocity = { x: 0, y: 0, z: 0 };
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.RUNNING;
    });
    this.wanderDuration = wanderDuration;
    this.rng = new SeededRandom(seed);
  }

  reset(_ctx: CreatureContext): void {
    this.elapsed = 0;
  }
}

export class FleeAction extends ActionNode {
  private fleeDuration: number;
  private elapsed: number = 0;

  constructor(fleeDuration: number = 4.0) {
    super('flee', (ctx, dt) => {
      this.elapsed += dt;
      ctx.currentAction = 'fleeing';

      // Flee away from threat source (target position)
      if (ctx.targetPosition) {
        const dx = ctx.position.x - ctx.targetPosition.x;
        const dz = ctx.position.z - ctx.targetPosition.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.01) {
          const speed = ctx.fleeSpeed;
          ctx.velocity = {
            x: (dx / dist) * speed,
            y: 0,
            z: (dz / dist) * speed,
          };
        }
      } else {
        // No threat source - just run forward
        ctx.velocity = {
          x: 0,
          y: 0,
          z: ctx.fleeSpeed,
        };
      }

      // Fleeing costs more energy
      ctx.energy = Math.max(0, ctx.energy - dt * 0.05);
      ctx.hunger = Math.min(1.0, ctx.hunger + dt * 0.02);

      // Stop fleeing if threat is gone or enough time has passed
      if (ctx.threatLevel < 0.2 || this.elapsed >= this.fleeDuration) {
        this.elapsed = 0;
        ctx.velocity = { x: 0, y: 0, z: 0 };
        return BehaviorStatus.SUCCESS;
      }

      return BehaviorStatus.RUNNING;
    });
    this.fleeDuration = fleeDuration;
  }

  reset(_ctx: CreatureContext): void {
    this.elapsed = 0;
  }
}

export class SeekAction extends ActionNode {
  private seekDuration: number;
  private elapsed: number = 0;

  constructor(seekDuration: number = 5.0) {
    super('seek', (ctx, dt) => {
      this.elapsed += dt;
      ctx.currentAction = 'seeking';

      // Move toward target position
      if (ctx.targetPosition) {
        const dx = ctx.targetPosition.x - ctx.position.x;
        const dz = ctx.targetPosition.z - ctx.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 1.0) {
          const speed = ctx.wanderSpeed * 1.5;
          ctx.velocity = {
            x: (dx / dist) * speed,
            y: 0,
            z: (dz / dist) * speed,
          };
        } else {
          // Reached target
          ctx.velocity = { x: 0, y: 0, z: 0 };
          this.elapsed = 0;
          ctx.hunger = Math.max(0, ctx.hunger - 0.3); // Ate something
          return BehaviorStatus.SUCCESS;
        }
      }

      ctx.energy = Math.max(0, ctx.energy - dt * 0.03);
      ctx.hunger = Math.min(1.0, ctx.hunger + dt * 0.015);

      if (this.elapsed >= this.seekDuration) {
        this.elapsed = 0;
        ctx.velocity = { x: 0, y: 0, z: 0 };
        return BehaviorStatus.FAILURE; // Couldn't find food
      }

      return BehaviorStatus.RUNNING;
    });
    this.seekDuration = seekDuration;
  }

  reset(_ctx: CreatureContext): void {
    this.elapsed = 0;
  }
}

// ── BehaviorState (for external query) ───────────────────────────────

export type BehaviorState = 'idle' | 'wandering' | 'fleeing' | 'hunting' | 'mating';

// ── BehaviorTree ─────────────────────────────────────────────────────

export class BehaviorTree {
  private root: BehaviorNode;
  public context: CreatureContext;

  constructor(context?: CreatureContext) {
    this.context = context ?? createDefaultContext();

    // Build default tree: Flee > Seek food > Wander > Idle
    this.root = new SelectorNode('root', [
      // Priority 1: Flee if threatened
      new SequenceNode('flee_sequence', [
        new IsThreatenedCondition(0.5),
        new FleeAction(4.0),
      ]),
      // Priority 2: Seek food if hungry
      new SequenceNode('seek_sequence', [
        new IsHungryCondition(0.6),
        new SeekAction(5.0),
      ]),
      // Priority 3: Rest if tired
      new SequenceNode('rest_sequence', [
        new IsTiredCondition(0.3),
        new IdleAction(3.0),
      ]),
      // Priority 4: Wander
      new WanderAction(3.0),
    ]);
  }

  /**
   * Set a custom root node
   */
  setRoot(root: BehaviorNode): void {
    this.root = root;
  }

  /**
   * Get the root node
   */
  getRoot(): BehaviorNode {
    return this.root;
  }

  /**
   * Tick the behavior tree with the given delta time
   */
  tick(deltaTime: number): BehaviorStatus {
    return this.root.tick(this.context, deltaTime);
  }

  /**
   * Reset the tree and all nodes
   */
  reset(): void {
    this.root.reset(this.context);
  }

  /**
   * Execute a tick and return the current behavior state name
   */
  execute(deltaTime: number): BehaviorState {
    this.tick(deltaTime);
    return this.context.currentAction as BehaviorState;
  }

  /**
   * Update the context from an external source
   */
  updateContext(partial: Partial<CreatureContext>): void {
    Object.assign(this.context, partial);
  }

  /**
   * Get the current behavior name
   */
  getCurrentBehavior(): string {
    return this.context.currentAction;
  }
}

// Legacy compatibility - keep old type and class signatures
export type { BehaviorState as BehaviorStateType };
