/**
 * Active-For-Stage — Update active flags for a greedy stage
 *
 * Ports: infinigen/core/constraints/example_solver/greedy/active_for_stage.py
 *
 * Original Python:
 *   def update_active_flags(state, stage):
 *       for name, objstate in state.objects.items():
 *           objstate.active = domain_contains(stage.domain, objstate)
 *
 * Sets `obj.active = true` for objects matching the stage's domain filter
 * and `obj.active = false` for all others, then returns the modified state.
 */

import { State, ObjectState } from '../../evaluator/state';
import { GreedyStage } from './types';

/**
 * Check if an ObjectState is contained within a stage's domain.
 *
 * This mirrors the original `domain_contains(stage.domain, objstate)` logic.
 * We use a multi-strategy approach:
 *  1. If the domain has a `contains()` method, test against the object's tags/position.
 *  2. If the domain has a `satisfies()` method (language/types Domain), use that.
 *  3. If the domain has a `tagFilter` or `includes` set, test against object tags.
 *  4. Fall back to true (no domain filtering).
 */
function domainContainsObject(domain: any, obj: ObjectState): boolean {
  // Strategy 1: Reasoning domain with contains(value)
  if (typeof domain.contains === 'function') {
    // Try passing the object's position first
    const pos = new Float64Array([
      obj.position.x,
      obj.position.y,
      obj.position.z,
    ]);
    if (domain.contains(pos)) return true;

    // Try passing the ObjectState directly
    try {
      if (domain.contains(obj)) return true;
    } catch {
      // Ignore — fall through
    }

    // Try passing the tags as an array
    try {
      const tagArray = obj.tags.toArray().map((t: any) => t.toString());
      if (domain.contains(tagArray)) return true;
    } catch {
      // Ignore
    }
  }

  // Strategy 2: Language/types Domain with satisfies()
  if (typeof domain.satisfies === 'function') {
    try {
      if (domain.satisfies(obj)) return true;
    } catch {
      // Ignore
    }

    // Try with object name
    try {
      if (domain.satisfies(obj.name)) return true;
    } catch {
      // Ignore
    }
  }

  // Strategy 3: ObjectSetDomain with includes/excludes
  if (domain.includes instanceof Set) {
    return domain.includes.has(obj.name) || domain.includes.has(obj.id);
  }
  if (domain.objects instanceof Set) {
    return domain.objects.has(obj.name) || domain.objects.has(obj.id);
  }

  // Strategy 4: Domain with tagFilter
  if (domain.tagFilter) {
    const objTags = obj.tags.toArray().map((t: any) => t.toString());
    const required = domain.tagFilter;
    if (typeof required === 'string') {
      return objTags.some((t: string) => t.includes(required));
    }
    if (Array.isArray(required)) {
      return required.every((r: string) =>
        objTags.some((t: string) => t.includes(r))
      );
    }
    if (required instanceof Set) {
      for (const r of required) {
        if (!objTags.some((t: string) => t.includes(String(r)))) {
          return false;
        }
      }
      return true;
    }
  }

  // Strategy 5: No filtering criteria → all objects are active
  return true;
}

/**
 * Update active flags on the solver State for a given greedy stage.
 *
 * For each object in `state.objects`:
 *  - Sets `obj.active = true`  if the object matches the stage's domain filter
 *  - Sets `obj.active = false` otherwise
 *
 * Returns the same State reference (mutated in place, matching original Python).
 *
 * @param state - The current solver state
 * @param stage - The greedy stage whose domain determines which objects are active
 * @returns The modified state (same reference)
 */
export function updateActiveFlags(state: State, stage: GreedyStage): State {
  for (const [, objState] of state.objects.entries()) {
    objState.active = domainContainsObject(stage.domain, objState);
  }
  return state;
}
