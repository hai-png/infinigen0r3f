/**
 * Creatures module - procedural animal generators
 */

export { CreatureBase, type CreatureParams, type CreatureParameters, CreatureType } from './CreatureBase';
export { AmphibianGenerator, type AmphibianParameters } from './AmphibianGenerator';
export { BirdGenerator, type BirdParameters, type BirdSpecies } from './BirdGenerator';
export { MammalGenerator } from './MammalGenerator';
export { FishGenerator, type FishParameters, type FishSpecies } from './FishGenerator';
export { ReptileGenerator } from './ReptileGenerator';
export { InsectGenerator } from './InsectGenerator';
export { UnderwaterGenerator } from './UnderwaterGenerator';

// Body part generators
export { BodyPartGenerator } from './parts/BodyPartGenerator';
export { WingGenerator } from './parts/WingGenerator';
export { AntennaGenerator } from './parts/AntennaGenerator';
export { LegGenerator } from './parts/LegGenerator';
export { TailGenerator } from './parts/TailGenerator';
export { EyeGenerator } from './parts/EyeGenerator';
export { MouthGenerator, BeakGenerator } from './parts/MouthGenerator';

// Skeleton system
export { SkeletonBuilder, type CreatureSkeletonConfig } from './skeleton/SkeletonBuilder';

// Animation system
export { IdleAnimation, type IdleBehavior } from './animation/IdleAnimation';
export { WalkCycle, type GaitType, type WalkCycleParams } from './animation/WalkCycle';

// Behavior tree system
export {
  BehaviorTree,
  BehaviorStatus,
  BehaviorNode,
  SelectorNode,
  SequenceNode,
  RepeatNode,
  ActionNode,
  ConditionNode,
  IsThreatenedCondition,
  IsHungryCondition,
  IsTiredCondition,
  IdleAction,
  WanderAction,
  FleeAction,
  SeekAction,
  type CreatureContext,
  type BehaviorState,
  createDefaultContext,
} from './animation/BehaviorTree';
