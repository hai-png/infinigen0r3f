/**
 * All Substitutions — Enumerate valid variable assignments for a greedy stage
 *
 * Ports: infinigen/core/constraints/example_solver/greedy/all_substitutions.py
 *
 * For each Variable tag in the stage's domain, finds matching objects in the
 * state. Returns all valid combinations as `Array<Map<string, string>>`, where
 * each map is a complete assignment of variable → objectName.
 */

import { State, ObjectState } from '../../evaluator/state';
import { GreedyStage } from './types';

/**
 * Check if an ObjectState matches the stage's domain filter.
 */
function objectInDomain(stage: GreedyStage, obj: ObjectState): boolean {
  const domain = stage.domain;
  if (!domain) return true;

  if (typeof domain.contains === 'function') {
    const pos = [obj.position.x, obj.position.y, obj.position.z];
    if (domain.contains(pos)) return true;
    try { if (domain.contains(obj)) return true; } catch { /* ignore */ }
  }

  if (typeof domain.satisfies === 'function') {
    try { if (domain.satisfies(obj)) return true; } catch { /* ignore */ }
    try { if (domain.satisfies(obj.name)) return true; } catch { /* ignore */ }
  }

  if (domain.includes instanceof Set) {
    return domain.includes.has(obj.name) || domain.includes.has(obj.id);
  }
  if (domain.objects instanceof Set) {
    return domain.objects.has(obj.name) || domain.objects.has(obj.id);
  }

  // If no specific filtering criteria, include all active objects
  return true;
}

/**
 * Enumerate all valid variable assignments for a greedy stage.
 *
 * For each variable name in `stage.variables`, finds all objects in the
 * state that match the stage's domain filter. Then computes the Cartesian
 * product of all variable→object mappings, returning an array of maps
 * where each map represents one complete assignment.
 *
 * **Important**: To avoid combinatorial explosion, if the product of
 * candidate counts exceeds `MAX_SUBSTITUTIONS`, the result is truncated
 * to a random subset of size `MAX_SUBSTITUTIONS`.
 *
 * @param stage - The greedy stage with variables and domain
 * @param state - The current solver state with objects
 * @returns Array of variable→objectName assignments
 */
export function allSubstitutions(
  stage: GreedyStage,
  state: State
): Array<Map<string, string>> {
  if (stage.variables.length === 0) {
    // No variables — return a single empty assignment
    return [new Map<string, string>()];
  }

  // Step 1: For each variable, find all matching objects
  const candidates: Map<string, string[]> = new Map();

  for (const varName of stage.variables) {
    const matchingObjects: string[] = [];

    for (const [objName, objState] of state.objects.entries()) {
      if (objectInDomain(stage, objState)) {
        matchingObjects.push(objName);
      }
    }

    // If no objects match a variable, this stage has no valid substitutions
    if (matchingObjects.length === 0) {
      return [];
    }

    candidates.set(varName, matchingObjects);
  }

  // Step 2: Compute Cartesian product of all variable assignments
  const MAX_SUBSTITUTIONS = 1000;
  const result: Array<Map<string, string>> = [];

  // Iterative Cartesian product to avoid deep recursion
  let current: Array<Map<string, string>> = [new Map()];

  for (const varName of stage.variables) {
    const objects = candidates.get(varName) ?? [];
    const next: Array<Map<string, string>> = [];

    for (const partialAssignment of current) {
      for (const objName of objects) {
        const newAssignment = new Map(partialAssignment);
        newAssignment.set(varName, objName);

        // Skip assignments where two variables map to the same object
        // (unless the variable names are the same)
        const assignedValues = new Set(newAssignment.values());
        if (assignedValues.size < newAssignment.size) {
          continue; // Duplicate assignment — skip
        }

        next.push(newAssignment);

        if (next.length >= MAX_SUBSTITUTIONS) break;
      }
      if (next.length >= MAX_SUBSTITUTIONS) break;
    }

    current = next;

    if (current.length === 0) {
      return [];
    }
  }

  return current;
}
