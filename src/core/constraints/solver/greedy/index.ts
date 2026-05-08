/**
 * Greedy Stage Solver Module
 *
 * Re-exports all greedy stage components for the constraint solver's
 * incremental (staged) greedy pre-solve phase.
 */

export type { GreedyStage } from './types';
export { updateActiveFlags } from './active-for-stage';
export { partitionConstraints } from './constraint-partition';
export { allSubstitutions } from './all-substitutions';
