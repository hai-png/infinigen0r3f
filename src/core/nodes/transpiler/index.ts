/**
 * Node Transpiler Module
 *
 * Converts node graphs to executable TypeScript code using the NodeWrangler API.
 * This module provides a complete transpilation pipeline inspired by Infinigen's
 * Python node transpiler, adapted for the TypeScript/R3F port.
 *
 * ## Module Structure
 *
 * - **NodeTranspiler** — Main transpiler class that converts `NodeGraph`
 *   instances into TypeScript functions using the `NodeWrangler` API.
 *   Supports `@to_nodegroup` and `@to_material` decorator patterns.
 *
 * - **CodeGenerator** — Helper class for producing clean, indentation-aware
 *   TypeScript source code with import management.
 *
 * - **LabelExpressionParser** — Parses Infinigen-style label expressions
 *   (e.g., `"radius ~ U(0.5, 2.0)"`) into distribution function calls.
 *
 * - **transpiler** (legacy) — The original transpiler with multiple output
 *   formats (TypeScript, ShaderMaterial, ThreeNodes, NodeWrangler).
 *
 * @module core/nodes/transpiler
 */

// New transpiler (NodeGraph → NodeWrangler TypeScript code)
export { NodeTranspiler } from './NodeTranspiler';
export type { TranspileOptions, TranspileResult } from './NodeTranspiler';

// Code generator helper
export { CodeGenerator } from './CodeGenerator';
export type { ImportEntry } from './CodeGenerator';

// Label expression parser
export { LabelExpressionParser } from './LabelExpressionParser';
export type { LabelExpression, DistributionType } from './LabelExpressionParser';

// Legacy transpiler (kept for backward compatibility)
// Note: NodeTranspiler from './transpiler' is re-exported as LegacyNodeTranspiler
// to avoid conflict with the new NodeTranspiler from './NodeTranspiler'.
export { NodeTranspiler as LegacyNodeTranspiler, transpileNodeTree } from './transpiler';
export type { TranspilerOptions as LegacyTranspilerOptions } from './transpiler';
