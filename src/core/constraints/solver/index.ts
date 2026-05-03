/**
 * Solver Core Module
 * 
 * Exports constraint solver implementations including
 * simulated annealing and greedy solvers.
 */

// Canonical SA solver (consolidated from sa-solver.ts)
export { SimulatedAnnealingSolver } from './sa-solver';
export type { SimulatedAnnealingConfig } from './sa-solver';

// Move types, Solver base, GreedySolver, and SolverState
export {
  Move,
  TranslateMove,
  RotateMove,
  SwapMove,
  DeletionMove,
  ReassignmentMove,
  AdditionMove,
  type PoseMoveConfig,
  type SolverState,
  Solver,
  GreedySolver,
  type GreedyConfig
} from './moves';

// Full MCMC Solver Loop
export { FullSolverLoop, MCMCSolver } from './full-solver-loop';

// Proposal Strategies
export {
  ContinuousProposalGenerator,
  DiscreteProposalGenerator,
  HybridProposalGenerator,
  type ProposalStrategyOptions
} from './proposals/ProposalStrategies';

// Greedy Pre-Solve Phase
export {
  ConstraintPartition,
  GreedyPreSolver,
  ActiveForStage,
  greedyPreSolve,
  type ConstraintGroup,
} from './GreedyPreSolver';

// Complete Move Proposal System (enhanced with full move set)
// Note: MoveProposals provides the full Infinigen-compatible move operator system.
// We use aliases to avoid conflicts with the simpler move types from ./moves.
export {
  MoveType,
  MoveOperatorFactory,
  AdditionMove as FullAdditionMove,
  DeletionMove as FullDeletionMove,
  SwapMove as FullSwapMove,
  ReassignmentMove as FullReassignmentMove,
  PoseMove,
  PlaneChangeMove,
  ResampleMove,
  retryAttemptProposals,
} from './MoveProposals';
export type { MoveProposal, MoveOperator } from './MoveProposals';
