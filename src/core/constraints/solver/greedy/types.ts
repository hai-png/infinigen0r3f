/**
 * Greedy Stage Type Definitions
 *
 * Ports: infinigen/core/constraints/example_solver/greedy/stage_def.py
 *
 * Defines the GreedyStage interface used by the greedy solver to
 * incrementally assign objects in stages, where each stage targets
 * a specific domain of objects.
 */

import { Domain } from '../../reasoning/domain';

/**
 * A greedy solve stage.
 *
 * Each stage targets a subset of objects defined by `domain`.
 * The `variables` list names the free variables that must be
 * substituted (bound to object names) before constraints in
 * this stage can be evaluated. `nProposals` controls how many
 * candidate assignments are tried per iteration.
 */
export interface GreedyStage {
  /** Human-readable stage name */
  name: string;

  /**
   * Domain filter for this stage.
   * Only objects that satisfy `domain.contains(obj)` are active
   * during this stage.
   */
  domain: Domain;

  /**
   * Variable names that must be substituted (bound to concrete
   * object names) when solving this stage. Each variable
   * corresponds to a free variable in the constraint problem.
   */
  variables: string[];

  /**
   * Number of random proposals to try per iteration.
   * Higher values give better coverage but slower solving.
   */
  nProposals: number;
}
