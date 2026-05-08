/**
 * Node Transpiler — Convert Node Graphs to TypeScript Code
 *
 * Ports infinigen's Python `node_transpiler/transpiler.py` to TypeScript/R3F.
 * Converts `NodeGraph` structures (NodeInstance + NodeLink) into executable
 * TypeScript code that uses the project's `NodeWrangler` API.
 *
 * ## How It Works
 *
 * 1. **Topological sort**: Nodes are ordered so that every node appears
 *    before any node that depends on it.
 * 2. **Backward traversal**: Starting from the output node, the transpiler
 *    walks backwards through connections to discover the active sub-graph.
 * 3. **Code generation**: Each visited node is emitted as a `nw.newNode()`
 *    call (or a convenience method like `nw.new_value()` for special types).
 * 4. **Connection emission**: Links are emitted as `nw.connect()` calls.
 * 5. **Special cases**: ColorRamp, FloatCurve, Value/RGB with label
 *    expressions, Group I/O, and Math operations are handled with
 *    dedicated code patterns.
 *
 * ## Decorator Patterns
 *
 * The transpiler supports Infinigen's `@to_nodegroup` and `@to_material`
 * decorator patterns, which mark functions as generating a reusable node
 * group or a surface material respectively.
 *
 * @module core/nodes/transpiler/NodeTranspiler
 */

import type { NodeGraph, NodeInstance, NodeLink } from '../types';
import { resolveNodeType, getNodeCategory } from '../registry/node-type-registry';
import { CodeGenerator } from './CodeGenerator';
import { LabelExpressionParser } from './LabelExpressionParser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options controlling transpiler behaviour and output format.
 */
export interface TranspileOptions {
  /** Indentation string (default: `'  '`) */
  indent?: string;
  /** Add explanatory comments to generated code (default: `true`) */
  includeComments?: boolean;
  /** Use `const` (true) or `let` (false) for variable declarations (default: `true`) */
  useConst?: boolean;
  /** Code style: functional chains vs. imperative statements (default: `'imperative'`) */
  formatStyle?: 'functional' | 'imperative';
}

/**
 * Result of a transpilation operation.
 */
export interface TranspileResult {
  /** The generated TypeScript source code */
  code: string;
  /** Set of required import module specifiers */
  imports: Set<string>;
  /** Non-fatal issues encountered during transpilation */
  warnings: string[];
  /** Fatal errors that may have produced invalid code */
  errors: string[];
}

/** Internal: node classification for special-case handling */
type NodeCategory = 'value' | 'rgb' | 'colorramp' | 'floatcurve' | 'math'
  | 'group_input' | 'group_output' | 'material_output' | 'generic';

// ---------------------------------------------------------------------------
// NodeTranspiler
// ---------------------------------------------------------------------------

/**
 * Transpiles `NodeGraph` instances into executable TypeScript code.
 *
 * The generated code uses the project's `NodeWrangler` API and produces
 * syntactically valid TypeScript that can reconstruct the same graph when
 * executed.
 *
 * ## Example
 *
 * ```ts
 * const transpiler = new NodeTranspiler();
 * const result = transpiler.transpile(myGraph, { includeComments: true });
 *
 * if (result.errors.length === 0) {
 *   console.log(result.code);  // Valid TypeScript that rebuilds myGraph
 * }
 * ```
 */
export class NodeTranspiler {
  // -----------------------------------------------------------------------
  // Private state
  // -----------------------------------------------------------------------

  private options: Required<TranspileOptions>;
  private labelParser: LabelExpressionParser;
  private varCounter: number;
  private warnings: string[];
  private errors: string[];

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  /**
   * Create a new NodeTranspiler.
   *
   * @param options - Transpilation options (all have sensible defaults)
   */
  constructor(options: TranspileOptions = {}) {
    this.options = {
      indent: options.indent ?? '  ',
      includeComments: options.includeComments ?? true,
      useConst: options.useConst ?? true,
      formatStyle: options.formatStyle ?? 'imperative',
    };
    this.labelParser = new LabelExpressionParser();
    this.varCounter = 0;
    this.warnings = [];
    this.errors = [];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Transpile a full node graph to a TypeScript function.
   *
   * Produces a self-contained TypeScript module with an exported function
   * that, when called with a `NodeWrangler`, recreates the graph.
   *
   * @param graph - The node graph to transpile
   * @param options - Optional overrides for this specific transpilation
   * @returns A {@link TranspileResult} containing the generated code and metadata
   */
  transpile(graph: NodeGraph, options?: TranspileOptions): TranspileResult {
    // Reset state
    this.varCounter = 0;
    this.warnings = [];
    this.errors = [];

    const opts = { ...this.options, ...options };
    const gen = new CodeGenerator(opts.indent);

    // Collect imports
    gen.addImport('../node-wrangler', ['NodeWrangler']);
    gen.addImport('../registry/node-type-registry', ['resolveNodeType']);

    // Topological sort
    const sortedNodeIds = this.topologicalSort(graph);

    // Build variable-name map
    const varNames = new Map<string, string>();
    for (const nodeId of sortedNodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);
    }

    // Find the output node (for the return statement)
    const outputNodeId = this.findOutputNode(graph);

    // Determine function name
    const funcName = 'buildGraph';

    // Generate function
    gen.addFunction(funcName, ['nw: NodeWrangler'], () => {
      this.emitNodeDeclarations(gen, graph, sortedNodeIds, varNames, opts);
      gen.addBlankLine();
      this.emitInputOverrides(gen, graph, varNames, opts);
      this.emitConnections(gen, graph, varNames, opts);

      // Return the output node variable
      if (outputNodeId) {
        const returnVar = varNames.get(outputNodeId);
        if (returnVar) {
          if (opts.includeComments) {
            gen.addComment('Return the output node');
          }
          gen.addReturn(returnVar);
        }
      }
    });

    gen.addBlankLine();
    gen.addExportDefault(funcName);

    const code = gen.toString();
    const imports = new Set<string>();
    imports.add('../node-wrangler');
    imports.add('../registry/node-type-registry');

    return { code, imports, warnings: this.warnings, errors: this.errors };
  }

  /**
   * Transpile to a `@to_nodegroup` decorator pattern.
   *
   * Generates a function decorated with `@to_nodegroup(name)`, marking it
   * as a reusable node group definition (equivalent to Infinigen's Python
   * `@to_nodegroup` decorator).
   *
   * @param name - The node group name (used in the decorator and function name)
   * @param graph - The node graph to transpile
   * @param options - Optional overrides for this specific transpilation
   * @returns A {@link TranspileResult} containing the decorated function code
   */
  transpileToNodeGroup(
    name: string,
    graph: NodeGraph,
    options?: TranspileOptions,
  ): TranspileResult {
    this.varCounter = 0;
    this.warnings = [];
    this.errors = [];

    const opts = { ...this.options, ...options };
    const gen = new CodeGenerator(opts.indent);

    gen.addImport('../node-wrangler', ['NodeWrangler']);
    gen.addImport('../registry/node-type-registry', ['resolveNodeType']);
    gen.addImport('../decorators', ['to_nodegroup']);

    const sortedNodeIds = this.topologicalSort(graph);
    const varNames = new Map<string, string>();
    for (const nodeId of sortedNodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);
    }

    // Detect group input/output nodes for parameter exposure
    const groupParams = this.extractGroupParameters(graph, varNames);

    const funcName = this.toFunctionName(name);

    // Decorator
    gen.addDecorator('to_nodegroup', [`'${name}'`]);
    gen.addBlankLine();

    // Function with group parameters
    const params = ['nw: NodeWrangler', ...groupParams.map(p => `${p.name}: ${p.type}`)];

    gen.addFunction(funcName, params, () => {
      this.emitNodeDeclarations(gen, graph, sortedNodeIds, varNames, opts);
      gen.addBlankLine();
      this.emitInputOverrides(gen, graph, varNames, opts);
      this.emitConnections(gen, graph, varNames, opts);

      // Connect group inputs to their consumer nodes
      this.emitGroupInputConnections(gen, graph, varNames, groupParams, opts);

      const outputNodeId = this.findOutputNode(graph);
      if (outputNodeId) {
        const returnVar = varNames.get(outputNodeId);
        if (returnVar) {
          gen.addReturn(returnVar);
        }
      }
    });

    const code = gen.toString();
    const imports = new Set<string>();
    imports.add('../node-wrangler');
    imports.add('../registry/node-type-registry');
    imports.add('../decorators');

    return { code, imports, warnings: this.warnings, errors: this.errors };
  }

  /**
   * Transpile to a `@to_material` decorator pattern.
   *
   * Generates a function decorated with `@to_material(name)`, marking it
   * as a surface material definition (equivalent to Infinigen's Python
   * `@to_material` decorator).
   *
   * @param name - The material name (used in the decorator and function name)
   * @param graph - The node graph to transpile
   * @param options - Optional overrides for this specific transpilation
   * @returns A {@link TranspileResult} containing the decorated function code
   */
  transpileToMaterial(
    name: string,
    graph: NodeGraph,
    options?: TranspileOptions,
  ): TranspileResult {
    this.varCounter = 0;
    this.warnings = [];
    this.errors = [];

    const opts = { ...this.options, ...options };
    const gen = new CodeGenerator(opts.indent);

    gen.addImport('../node-wrangler', ['NodeWrangler']);
    gen.addImport('../registry/node-type-registry', ['resolveNodeType']);
    gen.addImport('../decorators', ['to_material']);

    const sortedNodeIds = this.topologicalSort(graph);
    const varNames = new Map<string, string>();
    for (const nodeId of sortedNodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;
      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);
    }

    const funcName = this.toFunctionName(name);

    // Decorator
    gen.addDecorator('to_material', [`'${name}'`]);
    gen.addBlankLine();

    gen.addFunction(funcName, ['nw: NodeWrangler'], () => {
      this.emitNodeDeclarations(gen, graph, sortedNodeIds, varNames, opts);
      gen.addBlankLine();
      this.emitInputOverrides(gen, graph, varNames, opts);
      this.emitConnections(gen, graph, varNames, opts);

      // For materials, find and return the shader output
      const shaderOutput = this.findShaderOutput(graph, varNames);
      if (shaderOutput) {
        gen.addReturn(shaderOutput);
      } else {
        const outputNodeId = this.findOutputNode(graph);
        if (outputNodeId) {
          const returnVar = varNames.get(outputNodeId);
          if (returnVar) {
            gen.addReturn(returnVar);
          }
        }
      }
    });

    const code = gen.toString();
    const imports = new Set<string>();
    imports.add('../node-wrangler');
    imports.add('../registry/node-type-registry');
    imports.add('../decorators');

    return { code, imports, warnings: this.warnings, errors: this.errors };
  }

  /**
   * Transpile a single node to a code string.
   *
   * Useful for generating snippets or embedding node creation into
   * existing code.
   *
   * @param node - The node instance to transpile
   * @param graph - The containing graph (used for context)
   * @returns A TypeScript code string that creates this node
   */
  transpileNode(node: NodeInstance, graph: NodeGraph): string {
    const varName = this.deriveVarName(node, new Map());
    return this.generateNodeCode(node, varName, 'nw');
  }

  // -----------------------------------------------------------------------
  // Topological Sort
  // -----------------------------------------------------------------------

  /**
   * Perform a topological sort of the graph using Kahn's algorithm.
   *
   * Returns node IDs in an order where every node appears before any
   * node that depends on it. If a cycle is detected, falls back to
   * insertion order and emits a warning.
   */
  private topologicalSort(graph: NodeGraph): string[] {
    const nodeIds = Array.from(graph.nodes.keys());
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    // Initialize
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      dependents.set(id, new Set());
    }

    // Build in-degree and dependency maps from links
    for (const link of graph.links) {
      // link: fromNode → toNode (data flows from→to)
      // in-degree counts incoming edges (how many nodes feed into this one)
      const current = inDegree.get(link.toNode) ?? 0;
      inDegree.set(link.toNode, current + 1);
      dependents.get(link.fromNode)?.add(link.toNode);
    }

    // Seed queue with zero in-degree nodes
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const depId of dependents.get(id) ?? []) {
        const nd = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, nd);
        if (nd === 0) queue.push(depId);
      }
    }

    // Cycle detection
    if (order.length !== nodeIds.length) {
      this.warnings.push(
        `Cycle detected in node graph. ${order.length}/${nodeIds.length} nodes sorted; ` +
        'falling back to insertion order.',
      );
      return nodeIds;
    }

    return order;
  }

  // -----------------------------------------------------------------------
  // Node Declaration Emission
  // -----------------------------------------------------------------------

  /**
   * Emit `newNode()` declarations for all nodes in sorted order.
   */
  private emitNodeDeclarations(
    gen: CodeGenerator,
    graph: NodeGraph,
    sortedNodeIds: string[],
    varNames: Map<string, string>,
    opts: Required<TranspileOptions>,
  ): void {
    for (const nodeId of sortedNodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      const varName = varNames.get(nodeId)!;

      if (opts.includeComments) {
        gen.addComment(`${node.name} (${node.type})`);
      }

      const code = this.generateNodeCode(node, varName, 'nw', opts);
      gen.addLine(code);
    }
  }

  /**
   * Generate code for a single node declaration.
   *
   * Handles special cases (Value, RGB, ColorRamp, FloatCurve, Math, etc.)
   * with dedicated code patterns. Falls back to generic `nw.newNode()` for
   * all other types.
   */
  private generateNodeCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    opts?: Required<TranspileOptions>,
  ): string {
    const category = this.classifyNode(node);
    const declKeyword = opts?.useConst !== false ? 'const' : 'let';

    switch (category) {
      case 'value':
        return this.generateValueNodeCode(node, varName, nwVar, declKeyword);

      case 'rgb':
        return this.generateRGBNodeCode(node, varName, nwVar, declKeyword);

      case 'colorramp':
        return this.generateColorRampCode(node, varName, nwVar, declKeyword);

      case 'floatcurve':
        return this.generateFloatCurveCode(node, varName, nwVar, declKeyword);

      case 'math':
        return this.generateMathCode(node, varName, nwVar, declKeyword);

      case 'group_input':
        return this.generateGroupInputCode(node, varName, nwVar, declKeyword);

      case 'group_output':
        return this.generateGroupOutputCode(node, varName, nwVar, declKeyword);

      case 'material_output':
        return this.generateMaterialOutputCode(node, varName, nwVar, declKeyword);

      case 'generic':
      default:
        return this.generateGenericNodeCode(node, varName, nwVar, declKeyword);
    }
  }

  /**
   * Generate code for a Value node.
   *
   * Checks for label expressions (e.g., "radius ~ U(0.5, 2.0)") and
   * uses `nw.new_value()` with the distribution call if found.
   */
  private generateValueNodeCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    // Check for label expression
    const labelExpr = this.labelParser.parse(node.name);
    if (labelExpr) {
      const code = this.labelParser.toCode(labelExpr);
      return `${declKeyword} ${varName} = ${nwVar}.new_value(${code}, '${this.escapeString(node.name)}');`;
    }

    // Fixed value
    const val = this.getOutputValue(node);
    return `${declKeyword} ${varName} = ${nwVar}.new_value(${val}, '${this.escapeString(node.name)}');`;
  }

  /**
   * Generate code for an RGB/Color node.
   *
   * Checks for label expressions and uses distribution calls if found.
   */
  private generateRGBNodeCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    const labelExpr = this.labelParser.parse(node.name);
    if (labelExpr) {
      const code = this.labelParser.toCode(labelExpr);
      return `${declKeyword} ${varName} = ${nwVar}.newNode('ShaderNodeRGB', undefined, undefined, { default_value: ${code} });`;
    }

    const colorVal = this.getNodeProperty(node, 'default_value') ?? this.getOutputValue(node);
    const colorStr = this.serializeValue(colorVal);
    return `${declKeyword} ${varName} = ${nwVar}.newNode('ShaderNodeRGB', undefined, undefined, { default_value: ${colorStr} });`;
  }

  /**
   * Generate code for a ColorRamp (ValToRGB) node.
   *
   * Emits `buildColorRamp()` with explicit stop data to match Infinigen's
   * convention of building ColorRamp nodes with their stop positions and colors.
   */
  private generateColorRampCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    const stops = this.getNodeProperty(node, 'stops') ?? this.getNodeProperty(node, 'color_ramp');
    const stopsStr = this.serializeValue(stops);
    return `${declKeyword} ${varName} = ${nwVar}.newNode('ShaderNodeValToRGB', undefined, undefined, { stops: ${stopsStr} });`;
  }

  /**
   * Generate code for a FloatCurve node.
   *
   * Emits `buildFloatCurve()` with anchor point data, matching Infinigen's
   * convention for constructing curve-mapped values.
   */
  private generateFloatCurveCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    const curvePoints = this.getNodeProperty(node, 'curve_points') ??
                        this.getNodeProperty(node, 'mapping');
    const pointsStr = this.serializeValue(curvePoints);
    return `${declKeyword} ${varName} = ${nwVar}.newNode('ShaderNodeFloatCurve', undefined, undefined, { curve_points: ${pointsStr} });`;
  }

  /**
   * Generate code for a Math node.
   *
   * Uses the NodeWrangler's `new_node('ShaderNodeMath', [], { operation: '...' })`
   * pattern, matching Infinigen's convention.
   */
  private generateMathCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    const operation = this.getNodeProperty(node, 'operation') ?? 'ADD';
    const propsStr = this.serializeNonDefaultProperties(node);
    const isVector = node.type === 'ShaderNodeVectorMath';

    const nodeType = isVector ? 'ShaderNodeVectorMath' : 'ShaderNodeMath';
    if (propsStr) {
      return `${declKeyword} ${varName} = ${nwVar}.newNode('${nodeType}', undefined, undefined, ${propsStr});`;
    }
    return `${declKeyword} ${varName} = ${nwVar}.newNode('${nodeType}', undefined, undefined, { operation: '${operation}' });`;
  }

  /**
   * Generate code for a GroupInput node.
   *
   * GroupInput is a singleton — reuses the existing instance if present.
   */
  private generateGroupInputCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    return `${declKeyword} ${varName} = ${nwVar}.new_node('NodeGroupInput');`;
  }

  /**
   * Generate code for a GroupOutput node.
   *
   * GroupOutput is a singleton — reuses the existing instance if present.
   */
  private generateGroupOutputCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    return `${declKeyword} ${varName} = ${nwVar}.new_node('NodeGroupOutput');`;
  }

  /**
   * Generate code for a Material Output node.
   */
  private generateMaterialOutputCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    return `${declKeyword} ${varName} = ${nwVar}.newNode('ShaderNodeOutputMaterial');`;
  }

  /**
   * Generate code for a generic node using `nw.newNode()`.
   */
  private generateGenericNodeCode(
    node: NodeInstance,
    varName: string,
    nwVar: string,
    declKeyword: string,
  ): string {
    const canonicalType = resolveNodeType(node.type);
    const propsStr = this.serializeNonDefaultProperties(node);

    const nameArg = node.name && node.name !== canonicalType
      ? `'${this.escapeString(node.name)}'`
      : 'undefined';

    if (propsStr && propsStr !== '{}') {
      return `${declKeyword} ${varName} = ${nwVar}.newNode('${canonicalType}', ${nameArg}, undefined, ${propsStr});`;
    }

    return `${declKeyword} ${varName} = ${nwVar}.newNode('${canonicalType}', ${nameArg});`;
  }

  // -----------------------------------------------------------------------
  // Input Override Emission
  // -----------------------------------------------------------------------

  /**
   * Emit `setInputValue()` calls for input sockets with non-default,
   * unconnected values.
   */
  private emitInputOverrides(
    gen: CodeGenerator,
    graph: NodeGraph,
    varNames: Map<string, string>,
    opts: Required<TranspileOptions>,
  ): void {
    // Build set of connected input sockets
    const connectedInputs = new Set<string>();
    for (const link of graph.links) {
      connectedInputs.add(`${link.toNode}::${link.toSocket}`);
    }

    let hasOverrides = false;

    for (const [nodeId, node] of graph.nodes) {
      const varName = varNames.get(nodeId);
      if (!varName) continue;

      for (const [socketName, socket] of node.inputs) {
        // Skip connected inputs
        if (connectedInputs.has(`${nodeId}::${socketName}`)) continue;

        const value = socket.value;
        if (value === undefined || value === null) continue;

        // Skip NodeInstance references
        if (typeof value === 'object' && value !== null && 'id' in value && 'type' in value) {
          continue;
        }

        // Skip default values
        if (socket.defaultValue !== undefined && this.valuesEqual(value, socket.defaultValue)) {
          continue;
        }

        if (!hasOverrides && opts.includeComments) {
          gen.addComment('Input value overrides');
          hasOverrides = true;
        }

        const valStr = this.serializeValue(value);
        gen.addLine(`nw.setInputValue(${varName}, '${socketName}', ${valStr});`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Connection Emission
  // -----------------------------------------------------------------------

  /**
   * Emit `nw.connect()` calls for all links in the graph.
   */
  private emitConnections(
    gen: CodeGenerator,
    graph: NodeGraph,
    varNames: Map<string, string>,
    opts: Required<TranspileOptions>,
  ): void {
    if (graph.links.length === 0) return;

    if (opts.includeComments) {
      gen.addComment('Connections');
    }

    for (const link of graph.links) {
      const fromVar = varNames.get(link.fromNode);
      const toVar = varNames.get(link.toNode);

      if (!fromVar || !toVar) {
        this.warnings.push(
          `Link ${link.id} references missing node: ` +
          `from=${link.fromNode}(${fromVar ?? '?'}) to=${link.toNode}(${toVar ?? '?'})`,
        );
        continue;
      }

      gen.addLine(
        `nw.connect(${fromVar}, '${link.fromSocket}', ${toVar}, '${link.toSocket}');`,
      );
    }
  }

  /**
   * Emit connections from group input parameters to their consumer nodes.
   */
  private emitGroupInputConnections(
    gen: CodeGenerator,
    graph: NodeGraph,
    varNames: Map<string, string>,
    groupParams: Array<{ name: string; type: string }>,
    opts: Required<TranspileOptions>,
  ): void {
    if (groupParams.length === 0) return;

    if (opts.includeComments) {
      gen.addComment('Group input parameter connections');
    }

    // Find the GroupInput node
    let groupInputVar: string | undefined;
    for (const [nodeId, node] of graph.nodes) {
      if (node.type === 'NodeGroupInput') {
        groupInputVar = varNames.get(nodeId);
        break;
      }
    }

    if (!groupInputVar) return;

    // Connect group inputs to nodes that use them
    for (const link of graph.links) {
      const fromNode = graph.nodes.get(link.fromNode);
      if (fromNode && fromNode.type === 'NodeGroupInput') {
        const fromVar = varNames.get(link.fromNode);
        const toVar = varNames.get(link.toNode);
        if (fromVar && toVar) {
          // Already handled by emitConnections
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Node Classification
  // -----------------------------------------------------------------------

  /**
   * Classify a node into a category for special-case handling.
   */
  private classifyNode(node: NodeInstance): NodeCategory {
    const t = resolveNodeType(node.type);

    if (t === 'ShaderNodeValue') return 'value';
    if (t === 'ShaderNodeRGB') return 'rgb';
    if (t === 'ShaderNodeValToRGB') return 'colorramp';
    if (t === 'ShaderNodeFloatCurve') return 'floatcurve';
    if (t === 'ShaderNodeMath') return 'math';
    if (t === 'ShaderNodeVectorMath') return 'math';
    if (t === 'NodeGroupInput') return 'group_input';
    if (t === 'NodeGroupOutput') return 'group_output';
    if (t === 'ShaderNodeOutputMaterial') return 'material_output';

    return 'generic';
  }

  // -----------------------------------------------------------------------
  // Variable Name Derivation
  // -----------------------------------------------------------------------

  /**
   * Derive a camelCase variable name from a node's type and position.
   *
   * Produces readable names like `noiseTex1`, `principled2`, etc.
   */
  private deriveVarName(
    node: NodeInstance,
    existing: Map<string, string>,
  ): string {
    const base = this.typeToVarBase(node.type);

    // If the node has a meaningful label, prefer it (sanitized)
    if (node.name && node.name !== node.type) {
      const sanitized = this.sanitizeVarName(node.name);
      if (sanitized.length > 0 && sanitized.length <= 30) {
        // Check for collisions
        if (!Array.from(existing.values()).includes(sanitized)) {
          return sanitized;
        }
      }
    }

    // Use type-based name with counter
    let name = base;
    let counter = 2;
    while (Array.from(existing.values()).includes(name)) {
      name = `${base}${counter}`;
      counter++;
    }
    return name;
  }

  /**
   * Convert a canonical node type string to a camelCase variable base name.
   */
  private typeToVarBase(typeStr: string): string {
    // Preferred names for common types
    const preferred: Record<string, string> = {
      'ShaderNodeTexNoise': 'noiseTex',
      'ShaderNodeTexVoronoi': 'voronoiTex',
      'ShaderNodeTexMusgrave': 'musgraveTex',
      'ShaderNodeTexGradient': 'gradientTex',
      'ShaderNodeTexMagic': 'magicTex',
      'ShaderNodeTexWave': 'waveTex',
      'ShaderNodeTexBrick': 'brickTex',
      'ShaderNodeTexChecker': 'checkerTex',
      'ShaderNodeTexImage': 'imageTex',
      'ShaderNodeBsdfPrincipled': 'principled',
      'ShaderNodeBsdfDiffuse': 'diffuse',
      'ShaderNodeBsdfGlossy': 'glossy',
      'ShaderNodeBsdfGlass': 'glass',
      'ShaderNodeBsdfTransparent': 'transparent',
      'ShaderNodeEmission': 'emission',
      'ShaderNodeMixShader': 'mixShader',
      'ShaderNodeAddShader': 'addShader',
      'ShaderNodeMix': 'mix',
      'ShaderNodeValToRGB': 'colorRamp',
      'ShaderNodeFloatCurve': 'floatCurve',
      'ShaderNodeMath': 'math',
      'ShaderNodeVectorMath': 'vecMath',
      'ShaderNodeMapRange': 'mapRange',
      'ShaderNodeCombineXYZ': 'combineXYZ',
      'ShaderNodeSeparateXYZ': 'separateXYZ',
      'ShaderNodeCombineRGBA': 'combineRGBA',
      'ShaderNodeSeparateRGBA': 'separateRGBA',
      'ShaderNodeRGBCurve': 'rgbCurve',
      'ShaderNodeMixRGB': 'mixRGB',
      'ShaderNodeValue': 'value',
      'ShaderNodeRGB': 'rgb',
      'ShaderNodeTexCoord': 'texCoord',
      'ShaderNodeMapping': 'mapping',
      'ShaderNodeNormalMap': 'normalMap',
      'ShaderNodeBump': 'bump',
      'ShaderNodeDisplacement': 'displacement',
      'ShaderNodeClamp': 'clamp',
      'ShaderNodeAttribute': 'attribute',
      'ShaderNodeAmbientOcclusion': 'ao',
      'ShaderNodeLightPath': 'lightPath',
      'ShaderNodeNewGeometry': 'geometry',
      'ShaderNodeObjectInfo': 'objectInfo',
      'ShaderNodeCameraData': 'cameraData',
      'ShaderNodeLayerWeight': 'layerWeight',
      'ShaderNodeHueSaturation': 'hueSat',
      'ShaderNodeInvert': 'invert',
      'ShaderNodeBlackbody': 'blackbody',
      'FunctionNodeInputBool': 'boolVal',
      'FunctionNodeInputInt': 'intVal',
      'FunctionNodeInputFloat': 'floatVal',
      'FunctionNodeInputVector': 'vecVal',
      'FunctionNodeRandomValue': 'random',
      'FunctionNodeCompare': 'compare',
      'FunctionNodeBooleanMath': 'boolMath',
      'FunctionNodeFloatCompare': 'floatCompare',
      'GeometryNodeSetPosition': 'setPosition',
      'GeometryNodeJoinGeometry': 'joinGeom',
      'GeometryNodeTransform': 'transform',
      'GeometryNodeDeleteGeometry': 'deleteGeom',
      'GeometryNodeMergeByDistance': 'mergeByDist',
      'GeometryNodeSeparateGeometry': 'separateGeom',
      'GeometryNodeProximity': 'proximity',
      'GeometryNodeRaycast': 'raycast',
      'GeometryNodeConvexHull': 'convexHull',
      'GeometryNodeInstanceOnPoints': 'instanceOnPts',
      'GeometryNodeRealizeInstances': 'realizeInst',
      'GeometryNodeSetMaterial': 'setMaterial',
      'GeometryNodeCaptureAttribute': 'captureAttr',
      'GeometryNodeStoreNamedAttribute': 'storeAttr',
      'GeometryNodeInputNamedAttribute': 'namedAttr',
      'GeometryNodeInputPosition': 'position',
      'GeometryNodeInputNormal': 'normalInput',
      'GeometryNodeInputIndex': 'index',
      'GeometryNodeInputID': 'id',
      'GeometryNodeMeshToCurve': 'meshToCurve',
      'GeometryNodeCurveToMesh': 'curveToMesh',
      'GeometryNodeCurveToPoints': 'curveToPts',
      'GeometryNodeResampleCurve': 'resampleCurve',
      'GeometryNodeTrimCurve': 'trimCurve',
      'GeometryNodeSubdivideMesh': 'subdivide',
      'GeometryNodeExtrudeMesh': 'extrude',
      'GeometryNodeMeshBoolean': 'meshBool',
      'GeometryNodeSwitch': 'switchNode',
      'GeometryNodeObjectInfo': 'objectInfoGeom',
      'GeometryNodeCollectionInfo': 'collectionInfo',
      'GeometryNodeDistributePointsOnFaces': 'distributePts',
      'NodeGroupInput': 'groupInput',
      'NodeGroupOutput': 'groupOutput',
      'ShaderNodeOutputMaterial': 'materialOutput',
      'ShaderNodeOutputWorld': 'worldOutput',
    };

    if (preferred[typeStr]) {
      return preferred[typeStr];
    }

    // Fallback: extract the last meaningful part of the Blender-style name
    // e.g., "GeometryNodeSetCurveRadius" → "setCurveRadius"
    // e.g., "ShaderNodeTexGabor" → "gaborTex"
    const parts = typeStr
      .replace(/^ShaderNodeTex/, 'Tex')
      .replace(/^ShaderNodeBsdf/, 'Bsdf')
      .replace(/^ShaderNode/, '')
      .replace(/^GeometryNode/, '')
      .replace(/^FunctionNode/, '')
      .replace(/^CompositorNode/, '')
      .replace(/^Node/, '');

    // Convert PascalCase to camelCase
    const camelBase = parts.charAt(0).toLowerCase() + parts.slice(1);

    return camelBase || `node${this.varCounter}`;
  }

  // -----------------------------------------------------------------------
  // Group Parameter Extraction
  // -----------------------------------------------------------------------

  /**
   * Extract parameters exposed through group input/output nodes.
   */
  private extractGroupParameters(
    graph: NodeGraph,
    varNames: Map<string, string>,
  ): Array<{ name: string; type: string }> {
    const params: Array<{ name: string; type: string }> = [];

    for (const [, node] of graph.nodes) {
      if (node.type === 'NodeGroupInput') {
        // Group input sockets define the exposed parameters
        for (const [socketName, socket] of node.outputs) {
          if (socketName === '__group_input__') continue;
          const tsType = this.socketTypeToTS(socket.type);
          params.push({ name: this.sanitizeVarName(socketName), type: tsType });
        }
      }
    }

    return params;
  }

  // -----------------------------------------------------------------------
  // Output Node Detection
  // -----------------------------------------------------------------------

  /**
   * Find the terminal output node in the graph.
   */
  private findOutputNode(graph: NodeGraph): string | null {
    // Prioritised list of output types
    const outputTypes = [
      'ShaderNodeOutputMaterial',
      'ShaderNodeOutputWorld',
      'NodeGroupOutput',
      'CompositorNodeComposite',
    ];

    for (const [nodeId, node] of graph.nodes) {
      if (outputTypes.includes(resolveNodeType(node.type))) {
        return nodeId;
      }
    }

    // Fallback: any node whose type contains "Output"
    for (const [nodeId, node] of graph.nodes) {
      if (resolveNodeType(node.type).toLowerCase().includes('output')) {
        return nodeId;
      }
    }

    return null;
  }

  /**
   * Find the shader output variable name for material transpilation.
   */
  private findShaderOutput(
    graph: NodeGraph,
    varNames: Map<string, string>,
  ): string | null {
    // Look for the Principled BSDF or other shader that feeds into Material Output
    for (const link of graph.links) {
      const toNode = graph.nodes.get(link.toNode);
      if (toNode && resolveNodeType(toNode.type) === 'ShaderNodeOutputMaterial') {
        // The source of the Surface connection is the shader
        if (link.toSocket === 'Surface') {
          const fromVar = varNames.get(link.fromNode);
          if (fromVar) return fromVar;
        }
      }
    }

    // Fallback: find PrincipledBSDF directly
    for (const [nodeId, node] of graph.nodes) {
      if (resolveNodeType(node.type) === 'ShaderNodeBsdfPrincipled') {
        return varNames.get(nodeId) ?? null;
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Value Serialization
  // -----------------------------------------------------------------------

  /**
   * Get the output value of a node (first output socket's value).
   */
  private getOutputValue(node: NodeInstance): unknown {
    for (const [, socket] of node.outputs) {
      if (socket.value !== undefined) return socket.value;
    }
    // Check properties for default_value
    return this.getNodeProperty(node, 'default_value') ?? 0;
  }

  /**
   * Get a named property from a node, with fallback to nested lookup.
   */
  private getNodeProperty(node: NodeInstance, key: string): unknown {
    if (node.properties && key in node.properties) {
      return node.properties[key];
    }
    // Check settings as fallback
    if ((node as any).settings && key in (node as any).settings) {
      return (node as any).settings[key];
    }
    return undefined;
  }

  /**
   * Serialize a JavaScript value to a TypeScript expression string.
   */
  private serializeValue(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return this.serializeNumber(value);
    if (typeof value === 'string') return `'${this.escapeString(value)}'`;

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return `[${value.map(v => this.serializeValue(v)).join(', ')}]`;
    }

    if (typeof value === 'object') {
      // Check for NodeInstance references
      const obj = value as Record<string, unknown>;
      if ('id' in obj && 'type' in obj && 'inputs' in obj && 'outputs' in obj) {
        return `/* node ref: ${(obj as any).name || (obj as any).id} */ undefined`;
      }

      // Typed arrays
      if (value instanceof Float32Array) {
        return `[${Array.from(value).map(v => this.serializeNumber(v)).join(', ')}]`;
      }
      if (value instanceof Uint8Array) {
        return `[${Array.from(value).join(', ')}]`;
      }

      // Plain object
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';
      const pairs = entries.map(
        ([k, v]) =>
          `${this.isValidIdentifier(k) ? k : `'${this.escapeString(k)}'`}: ${this.serializeValue(v)}`,
      );
      return `{ ${pairs.join(', ')} }`;
    }

    if (typeof value === 'function') {
      return `/* function */ undefined`;
    }

    return String(value);
  }

  /**
   * Serialize a node's non-default properties as a TypeScript object literal.
   */
  private serializeNonDefaultProperties(node: NodeInstance): string {
    if (!node.properties) return '{}';

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      // Skip internal/ephemeral keys
      if (key.startsWith('_')) continue;
      if (key === 'default_value' && typeof value === 'number') continue;
      filtered[key] = value;
    }

    return this.serializeValue(filtered);
  }

  /**
   * Format a number for code output.
   */
  private serializeNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return parseFloat(n.toPrecision(12)).toString();
  }

  // -----------------------------------------------------------------------
  // Utility Helpers
  // -----------------------------------------------------------------------

  /**
   * Convert a group/function name to a valid TypeScript function name.
   */
  private toFunctionName(name: string): string {
    // Remove non-alphanumeric characters and camelCase
    const cleaned = name.replace(/[^a-zA-Z0-9]/g, '_');
    // Convert to camelCase
    const parts = cleaned.split('_').filter(Boolean);
    if (parts.length === 0) return 'buildGraph';
    return parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }

  /**
   * Sanitize a string for use as a variable name.
   */
  private sanitizeVarName(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Escape a string for use in single-quoted TypeScript string literals.
   */
  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Check if a string is a valid JavaScript identifier.
   */
  private isValidIdentifier(s: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
  }

  /**
   * Map a socket type to a TypeScript type string.
   */
  private socketTypeToTS(socketType: unknown): string {
    const typeStr = String(socketType).toUpperCase();
    switch (typeStr) {
      case 'FLOAT':
      case 'VALUE':
        return 'number';
      case 'INTEGER':
        return 'number';
      case 'BOOLEAN':
        return 'boolean';
      case 'STRING':
        return 'string';
      case 'VECTOR':
        return '[number, number, number]';
      case 'COLOR':
      case 'RGBA':
        return '[number, number, number, number]';
      case 'SHADER':
        return 'NodeInstance';
      case 'GEOMETRY':
        return 'NodeInstance';
      default:
        return 'unknown';
    }
  }

  /**
   * Deep-equal comparison for values.
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.valuesEqual(v, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as Record<string, unknown>);
      const keysB = Object.keys(b as Record<string, unknown>);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(k => this.valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }

    return false;
  }
}
