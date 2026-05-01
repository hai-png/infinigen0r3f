/**
 * Full Solver Loop: End-to-End MCMC with All Proposal Strategies
 * 
 * Integrates constraint evaluation, domain reasoning, and proposal strategies
 * into a complete solving pipeline.
 * 
 * FIX: Implemented evaluateAll() method so energy is computed correctly via
 * constraint violation counting instead of always returning 0.
 */

import { ConstraintSystem } from '../language/constraint-system';
import { Variable, Domain } from '../language/types';
import { evaluateNode, violCount, evaluateProblem } from '../evaluator/evaluate';
import { State as EvaluatorState } from '../evaluator/state';
import { 
  ContinuousProposalGenerator as ContinuousProposer, 
  DiscreteProposalGenerator as DiscreteProposer,
  HybridProposalGenerator as HybridProposer
} from './proposals/ProposalStrategies';
import { SimulatedAnnealingSolver } from './sa-solver';
import { bridge } from './bridge';
import { SolverState, Proposal } from './types';
import { SeededRandom } from '../../util/MathUtils';

export interface SolverConfig {
  maxIterations: number;
  initialTemperature: number;
  coolingRate: number;
  minTemperature: number;
  useHybridBridge: boolean;
  enableDomainReasoning: boolean;
  seed?: number;
}

export class FullSolverLoop {
  private constraintSystem: ConstraintSystem;
  private continuousProposer: ContinuousProposer;
  private discreteProposer: DiscreteProposer;
  private hybridProposer: HybridProposer;
  private saSolver: SimulatedAnnealingSolver;
  private config: SolverConfig;
  private state: SolverState | null = null;
  private rng: SeededRandom;
  /**
   * Evaluator state for constraint evaluation.
   * Must be set externally via setEvaluatorState() before solving,
   * otherwise evaluateAll() falls back to domain-containment checks.
   */
  private evaluatorState: EvaluatorState | null = null;

  constructor(config: Partial<SolverConfig> = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 10000,
      initialTemperature: config.initialTemperature ?? 1000,
      coolingRate: config.coolingRate ?? 0.995,
      minTemperature: config.minTemperature ?? 0.1,
      useHybridBridge: config.useHybridBridge ?? false,
      enableDomainReasoning: config.enableDomainReasoning ?? true,
      seed: config.seed,
    };

    this.rng = new SeededRandom(this.config.seed ?? 42);
    this.constraintSystem = new ConstraintSystem();
    this.continuousProposer = new ContinuousProposer();
    this.discreteProposer = new DiscreteProposer();
    this.hybridProposer = new HybridProposer();
    this.saSolver = new SimulatedAnnealingSolver(this.config);
  }

  /**
   * Add a constraint to the system
   */
  addConstraint(constraint: any): void {
    this.constraintSystem.addConstraint(`constraint_${Date.now()}`, constraint);
  }

  /**
   * Add a variable with its domain
   */
  addVariable(variable: Variable, domain: Domain): void {
    this.constraintSystem.addVariable(variable.name, domain);
  }

  /**
   * Set the evaluator state used by evaluateAll() for constraint evaluation.
   * This must be set before calling solve() if you want full constraint evaluation.
   * Without it, evaluateAll() falls back to domain-containment checks.
   */
  setEvaluatorState(state: EvaluatorState): void {
    this.evaluatorState = state;
  }

  /**
   * Evaluate all constraints and return total energy (constraint violation count).
   *
   * Previously this was broken: the code read `(this.state as any)?.state` which
   * was always undefined (SolverState has no `state` field), causing energy to
   * always be 0 in the primary path.
   *
   * FIX: Now uses `this.evaluatorState` which is set via `setEvaluatorState()`.
   * If no evaluator state is available, falls back to domain-containment checks.
   */
  evaluateAll(): number {
    const problem = this.constraintSystem.buildProblem();

    // Primary path: use evaluator State + violCount for accurate energy
    if (this.evaluatorState && problem.constraints.size > 0) {
      try {
        const memo = new Map<any, any>();
        let totalViolation = 0;

        for (const constraint of problem.constraints.values()) {
          try {
            totalViolation += violCount(constraint as any, this.evaluatorState, memo);
          } catch {
            // If a constraint can't be evaluated, count it as a violation
            totalViolation += 1;
          }
        }

        return totalViolation;
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback: domain-containment check for each assigned variable
    let energy = 0;
    const variables = this.constraintSystem.getVariables();
    for (const [id, v] of variables) {
      if (v.value !== undefined) {
        const domain = this.constraintSystem.getDomain(id);
        if (domain && typeof domain.contains === 'function' && !domain.contains(v.value)) {
          energy += 1;
        }
      }
    }
    return energy;
  }

  /**
   * Run the full MCMC solving loop
   */
  async solve(): Promise<SolverState> {
    console.log('[FullSolverLoop] Starting solve...');
    
    // Initialize bridge if enabled
    if (this.config.useHybridBridge) {
      try {
        await bridge.connect();
        console.log('[FullSolverLoop] Hybrid bridge connected');
      } catch (e) {
        console.warn('[FullSolverLoop] Failed to connect hybrid bridge, running in browser-only mode');
        this.config.useHybridBridge = false;
      }
    }

    // Apply domain reasoning/substitution if enabled
    if (this.config.enableDomainReasoning) {
      console.log('[FullSolverLoop] Applying domain substitution...');
      this.applyDomainReasoning();
    }

    // Initialize state
    this.state = this.saSolver.initialize(this.constraintSystem);

    // Compute initial energy using evaluateAll() instead of assuming 0
    this.state.energy = this.evaluateAll();

    let iteration = 0;
    let temperature = this.config.initialTemperature;

    while (iteration < this.config.maxIterations && temperature > this.config.minTemperature) {
      iteration++;
      
      // Generate proposal using hybrid strategy
      const proposal = this.generateProposal(temperature);
      
      if (!proposal) {
        continue;
      }

      // Evaluate energy change
      const energyDelta = this.evaluateProposal(proposal);

      // Accept/reject based on Metropolis criterion
      // acceptProposal takes (currentEnergy, proposedEnergy) and uses internal temperature
      const currentEnergy = this.state!.energy;
      const proposedEnergy = currentEnergy + energyDelta;
      const accepted = this.saSolver.acceptProposal(currentEnergy, proposedEnergy);
      
      if (accepted) {
        this.applyProposal(proposal);
        this.state!.energy += energyDelta;
      }

      // Cool down
      temperature *= this.config.coolingRate;

      // Progress logging
      if (iteration % 1000 === 0) {
        console.log(`[FullSolverLoop] Iteration ${iteration}, Energy: ${this.state!.energy.toFixed(4)}, Temp: ${temperature.toFixed(4)}`);
      }

      // Early exit if energy is near zero (all constraints satisfied)
      if (Math.abs(this.state!.energy) < 1e-6) {
        console.log('[FullSolverLoop] Converged!');
        break;
      }
    }

    // Cleanup
    if (this.config.useHybridBridge) {
      bridge.disconnect();
    }

    this.state!.iteration = iteration;
    console.log(`[FullSolverLoop] Solve complete after ${iteration} iterations, final energy: ${this.state!.energy.toFixed(4)}`);

    return this.state!;
  }

  /**
   * Apply domain reasoning to simplify constraints
   */
  private applyDomainReasoning(): void {
    // Substitute domains where possible
    // This is a simplified version - full implementation would use domain-substitute.ts
    const variables = this.constraintSystem.getVariables();
    
    for (const [id, variable] of variables) {
      const domain = this.constraintSystem.getDomain(id);
      if (domain && domain.type === 'object_set' && (domain as any).values && (domain as any).values.length === 1) {
        // Variable has single value in domain, substitute directly
        variable.value = (domain as any).values[0];
        console.log(`[DomainReasoning] Substituted ${id} = ${(domain as any).values[0]}`);
      }
    }

    // Remove satisfied constraints
    this.constraintSystem.simplify();
  }

  /**
   * Generate a proposal using appropriate strategy
   */
  private generateProposal(temperature: number): Proposal | null {
    // Choose proposer based on variable type and temperature
    const variables = this.constraintSystem.getVariables();
    const unassignedVars = Array.from(variables.entries())
      .filter(([_, v]) => v.value === undefined)
      .map(([id, v]) => ({ id, variable: v }));

    if (unassignedVars.length === 0) {
      return null;
    }

    // Select random variable
    const selected = unassignedVars[this.rng.nextInt(0, unassignedVars.length - 1)];
    const domain = this.constraintSystem.getDomain(selected.id);

    if (!domain) {
      return null;
    }

    // Use hybrid proposer to decide continuous vs discrete
    if (domain.type === 'pose' || domain.type === 'numeric') {
      return this.continuousProposer.generate(selected.variable as any, undefined) as any;
    } else {
      return this.discreteProposer.generate(selected.variable as any, []) as any;
    }
  }

  /**
   * Evaluate energy change from proposal using evaluateAll()
   */
  private evaluateProposal(proposal: Proposal): number {
    // Temporarily apply proposal
    const variable = this.constraintSystem.getVariable(proposal.variableId);
    const oldValue = variable?.value;

    if (variable) {
      variable.value = proposal.newValue;
    }

    // Calculate new energy using evaluateAll()
    const newEnergy = this.evaluateAll();

    // Restore old value
    if (variable && oldValue !== undefined) {
      variable.value = oldValue;
    }

    // Calculate old energy (cached from state)
    const oldEnergy = this.state?.energy ?? 0;

    return newEnergy - oldEnergy;
  }

  /**
   * Apply accepted proposal to state
   */
  private applyProposal(proposal: Proposal): void {
    const variable = this.constraintSystem.getVariable(proposal.variableId);
    if (variable) {
      variable.value = proposal.newValue;
      
      // Update state assignments
      if (this.state) {
        this.state.assignments.set(proposal.variableId, proposal.newValue);
      }
    }
  }

  /**
   * Get current solver state
   */
  getState(): SolverState | null {
    return this.state;
  }

  /**
   * Export solution to MJCF (requires hybrid bridge)
   */
  async exportToMjcf(sceneId: string): Promise<string> {
    if (!this.config.useHybridBridge) {
      throw new Error('Hybrid bridge not enabled');
    }

    const config = this.buildPhysicsConfig(sceneId);
    return await bridge.exportMjcf(config);
  }

  /**
   * Build physics config from current state
   */
  private buildPhysicsConfig(sceneId: string): any {
    // Convert solver state to physics configuration
    // This would integrate with the SIM module for full physics setup
    return {
      sceneId,
      objects: [],
      gravity: [0, -9.81, 0],
      timestep: 0.002,
    };
  }
}

export { FullSolverLoop as MCMCSolver };
