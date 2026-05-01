/**
 * Re-export module for constraint language expression types
 * Provides compatibility for imports from ./expression within reasoning/
 */

export {
  Expression,
  ScalarExpression,
  BoolExpression,
  ScalarConstant,
  BoolConstant,
  ScalarVariable,
  BoolVariable,
  ScalarOperatorExpression,
  BoolOperatorExpression,
  type InRange,
} from '../language/expression';
