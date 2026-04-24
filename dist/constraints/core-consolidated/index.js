/**
 * Consolidated Constraint System Module
 *
 * This module unifies all constraint-related functionality from:
 * - constraint-language: High-level constraint DSL
 * - constraints: Legacy constraint implementations
 * - evaluator: Constraint evaluation engine
 * - reasoning: Domain analysis and reasoning
 * - solver: Constraint solvers (SA, greedy, MCMC)
 * - room-solver: Room-specific layout generation
 *
 * @module constraints
 */
// ============================================================================
// Expression System
// ============================================================================
export { Expression, ScalarExpression, BoolExpression, BoolConstant, ScalarConstant, BoolVariable, ScalarVariable, ScalarOperatorExpression, BoolOperatorExpression, ScalarNegateExpression, ScalarAbsExpression, ScalarMinExpression, ScalarMaxExpression, BoolNotExpression, ScalarIfElse, BoolIfElse } from '../../constraint-language/expression.js';
// ============================================================================
// Constraint Relations
// ============================================================================
export { Relation, AnyRelation, NegatedRelation, AndRelations, OrRelations, GeometryRelation, Touching, SupportedBy, CoPlanar, StableAgainst, Facing, Between, AccessibleFrom, ReachableFrom, InFrontOf, Aligned, Hidden, Visible, Grouped, Distributed, Coverage, SupportCoverage, Stability, Containment, Proximity } from '../../constraint-language/relations.js';
// ============================================================================
// Set Reasoning & Quantifiers
// ============================================================================
export { ObjectSetExpression, ObjectSetConstant, ObjectSetVariable, UnionObjects, IntersectionObjects, DifferenceObjects, ObjectCondition, FilterObjects, TagCondition, ForAll, Exists, SumOver, MeanOver, MaxOver, MinOver, CountExpression } from '../../constraint-language/set-reasoning.js';
// ============================================================================
// Geometry Predicates
// ============================================================================
export { GeometryPredicate, Distance, AccessibilityCost, FocusScore, Angle, SurfaceArea, Volume, Count, Height, Width, CenterOfMass, NormalAlignment, Clearance, VisibilityScore, StabilityScore, SupportContactArea, ReachabilityScore, OrientationAlignment, Compactness, AspectRatio } from '../../constraint-language/geometry.js';
// ============================================================================
// Room Constraints
// ============================================================================
export { objectsInRoom, objectsWithFunction, InRoom, RoomsAdjacent, RoomsNotAdjacent, RoomHasEntranceAccess, RoomHasNaturalLight, ArrangeFurnitureInRoom, TrafficFlowPath, PrivacyHierarchy, FunctionalZones, defineRoom, validateRoomConfig } from '../../constraint-language/rooms.js';
// ============================================================================
// Problem Definition & Constants
// ============================================================================
export { scalar, bool, ZERO, ONE, HALF, EPSILON, TRUE, FALSE, item, ItemExpression, tagged, TaggedExpression, SceneExpression, SCENE, Problem, NamedConstraint, NamedScoreTerm, buildProblem } from '../../constraint-language/constants.js';
// ============================================================================
// Constraint Evaluation
// ============================================================================
export { evaluateNode, evaluateProblem, violCount, relevant } from '../../evaluator/evaluate.js';
export { domainContains, objKeysInDom } from '../../evaluator/domain-contains.js';
export { memoKey, evictMemoForObj, evictMemoForMove, resetBVHCache } from '../../evaluator/eval-memo.js';
export { poseAffectsScore } from '../../evaluator/state.js';
export { nodeImpls, registerNodeImpl, registerGeometryNodeImpls, defaultHandler } from '../../evaluator/node-impl/index.js';
export { evaluateDistance, evaluateTouching, evaluateSupportedBy, evaluateStableAgainst, evaluateCoverage, evaluateCoPlanar, evaluateFacing, evaluateAccessibleFrom, evaluateVisible, evaluateHidden, geometryNodeImpls } from '../../evaluator/node-impl/trimesh-geometry.js';
// ============================================================================
// Domain Reasoning & Analysis
// ============================================================================
export { constraintDomain, extractVariables, containsVariable, getFreeVariables, analyzeConstraintComplexity } from '../../reasoning/constraint-domain.js';
export { isConstant, evaluateConstant, simplifyConstant } from '../../reasoning/constraint-constancy.js';
export { createBoundFromComparison, mapBound, expressionMapBoundBinop, expressionMapBound, evaluateKnownVars, constraintBounds, isValidBound, intersectBounds, unionBounds, satisfiesBound } from '../../reasoning/constraint-bounding.js';
export { substituteVariables, substituteVariable, applyDomainSubstitution, composeSubstitutions, isCircularSubstitution, safeSubstituteVariable, normalizeConstraint } from '../../reasoning/domain-substitute.js';
// ============================================================================
// Constraint Solvers
// ============================================================================
export { SimulatedAnnealingSolver, GreedySolver } from '../../solver/moves.js';
export { FullSolverLoop, MCMCSolver } from '../../solver/full-solver-loop.js';
export { ContinuousProposalGenerator, DiscreteProposalGenerator, HybridProposalGenerator } from '../../solver/proposals/ProposalStrategies.js';
// ============================================================================
// Room Layout Generation
// ============================================================================
export { RoomGraph } from '../../room-solver/base.js';
export { FloorPlanGenerator } from '../../room-solver/floor-plan.js';
export { ContourOperations } from '../../room-solver/contour.js';
export { SegmentDivider } from '../../room-solver/segment.js';
// ============================================================================
// Utility Functions
// ============================================================================
export { simplifyConstraint, simplifyExpression, extractVariables as extractVarsFromExpr, isSatisfiable, getExpressionBounds, substituteVariable as substVarInExpr, toCNF, supportSet, constraintsEqual, estimateComplexity, constraintToString, expressionToString } from '../../constraint-language/util.js';
export { constraintBounded, constraintUnbounded, boundAnalysis } from '../../reasoning/constraint-bounding.js';
// ============================================================================
// Result Types
// ============================================================================
export { SolveStatus, FixType, createEmptyEvaluationResult, createEmptySolution, createSuccessResult, createFailureResult, formatSolution, formatViolationReport, mergeEvaluationResults, compareSolutions } from '../../constraint-language/result.js';
// ============================================================================
// Legacy DSL (for backward compatibility)
// ============================================================================
export { ConstraintLexer, ConstraintParser, parseConstraintSource, compileConstraint } from '../dsl/ConstraintDSL.js';
// ============================================================================
// React Integration Hook
// ============================================================================
export { useInfinigenSolver } from '../../integration/use-solver.js';
//# sourceMappingURL=index.js.map