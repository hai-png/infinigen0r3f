/**
 * DSL Entry Functions for the Constraint Language
 *
 * Ported from: infinigen/core/constraints/constraint_language/__init__.py
 *
 * These factory functions provide the primary entry points for the constraint
 * DSL, matching the original Infinigen's Python API. They create the
 * corresponding expression AST nodes.
 */

import { ObjectSetExpression, SceneSetExpression, TaggedSetExpression, ExcludesExpression, RelatedToExpression } from './set-reasoning';
import { ScalarExpression, BoolExpression, ScalarConstant, InRangeExpression } from './expression';
import { Relation } from './relations';

/**
 * scene() - Returns all active objects in the state as an ObjectSetExpression.
 *
 * In the original Infinigen, scene() is the root-level function that returns
 * all active objects. It corresponds to the SceneSetExpression which queries
 * the solver State for all active object names.
 *
 * Usage:
 *   const allObjs = scene();
 *   const chairs = taggedSet(allObjs, new Set(['chair']));
 */
export function scene(): SceneSetExpression {
  return new SceneSetExpression();
}

/**
 * taggedSet(objs, tags) - Filter objects by tag set.
 *
 * In the original Infinigen, this is the [] operator:
 *   chairs = scene()[Semantics.Chair]
 *
 * Since TypeScript doesn't support operator overloading, this is a standalone
 * function. It returns only objects from `objs` that have ALL the required tags.
 *
 * @param objs - The object set to filter
 * @param tags - Set of tag strings that objects must match
 */
export function taggedSet(objs: ObjectSetExpression, tags: Set<string>): TaggedSetExpression {
  return new TaggedSetExpression(objs, tags);
}

/**
 * union(objs, tags) - Add tags to an object set (the % operator).
 *
 * In the original Infinigen, the % operator is used to add/tag an object set
 * with additional semantic tags:
 *   scene() % Semantics.Chair
 *
 * This creates a TaggedSetExpression that filters the scene to objects with
 * the given tags. In the R3F port, this is equivalent to taggedSet().
 *
 * @param objs - The object set to filter
 * @param tags - Set of tag strings to require
 */
export function union(objs: ObjectSetExpression, tags: Set<string>): TaggedSetExpression {
  return new TaggedSetExpression(objs, tags);
}

/**
 * excludes(objs, tags) - Exclude objects with given tags.
 *
 * In the original Infinigen, excludes() removes objects that have any of
 * the specified tags from the set. This is the complement of tagged().
 *
 * Usage:
 *   const nonChairs = excludes(scene(), new Set(['chair']));
 *
 * @param objs - The object set to filter
 * @param excludedTags - Set of tag strings that disqualify objects
 */
export function excludes(objs: ObjectSetExpression, excludedTags: Set<string>): ExcludesExpression {
  return new ExcludesExpression(objs, excludedTags);
}

/**
 * relatedTo(child, parent, relation) - Objects in child related to parent via relation.
 *
 * In the original Infinigen, related_to() filters a child object set to only
 * those objects that have a specific relation to any object in the parent set.
 *
 * Usage:
 *   const chairsOnTables = relatedTo(chairs, tables, new SupportedBy(chairs, tables));
 *
 * @param childSet - The child object set to filter
 * @param parentSet - The parent object set (relation targets)
 * @param relation - The relation to check
 */
export function relatedTo(
  childSet: ObjectSetExpression,
  parentSet: ObjectSetExpression,
  relation: Relation
): RelatedToExpression {
  return new RelatedToExpression(childSet, parentSet, relation);
}

/**
 * inRange(val, low, high, mean?) - Check if value is in range [low, high].
 *
 * In the original Infinigen, in_range() is a fundamental constraint that
 * checks whether a scalar value falls within a specified interval.
 * It is used by constraint_bounding to derive cardinality bounds and
 * express soft range constraints.
 *
 * If a mean is provided, it can be used for preferential optimization
 * (the solver will try to push the value toward the mean).
 *
 * Usage:
 *   const areaConstraint = inRange(roomArea, scalar(6), scalar(60));
 *   const distanceConstraint = inRange(dist, scalar(0.5), scalar(2.0), scalar(1.0));
 *
 * @param val - The scalar expression to check
 * @param low - Lower bound (inclusive)
 * @param high - Upper bound (inclusive)
 * @param mean - Optional preferred value for soft optimization
 */
export function inRange(
  val: ScalarExpression | number,
  low: ScalarExpression | number,
  high: ScalarExpression | number,
  mean?: ScalarExpression | number
): InRangeExpression {
  const valExpr = typeof val === 'number' ? new ScalarConstant(val) : val;
  const lowExpr = typeof low === 'number' ? new ScalarConstant(low) : low;
  const highExpr = typeof high === 'number' ? new ScalarConstant(high) : high;
  const meanExpr = mean !== undefined
    ? (typeof mean === 'number' ? new ScalarConstant(mean) : mean)
    : undefined;

  return new InRangeExpression(valExpr, lowExpr, highExpr, meanExpr);
}
