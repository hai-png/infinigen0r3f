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
  PoseMoveConfig,
  SolverState,
  Solver,
  GreedySolver,
  GreedyConfig
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
