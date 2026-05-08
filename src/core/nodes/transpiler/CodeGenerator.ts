/**
 * Code Generator — Helper for producing clean TypeScript source code
 *
 * Provides a structured, indentation-aware builder for generating TypeScript
 * code programmatically. Used by {@link NodeTranspiler} to emit node-graph
 * reconstruction code.
 *
 * The generator tracks indentation level, collects imports, and provides
 * convenience methods for emitting functions, decorators, and statements
 * at the correct nesting depth.
 *
 * @module core/nodes/transpiler/CodeGenerator
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single import declaration.
 *
 * @example
 * ```ts
 * { from: './nodes', items: ['NodeWrangler', 'NodeTypes'], isTypeOnly: false }
 * // → import { NodeWrangler, NodeTypes } from './nodes';
 * ```
 */
export interface ImportEntry {
  /** Module specifier (the string after `from`) */
  from: string;
  /** Named imports to include in the braces */
  items: string[];
  /** If `true`, emit `import type { ... }` instead of `import { ... }` */
  isTypeOnly?: boolean;
}

// ---------------------------------------------------------------------------
// CodeGenerator
// ---------------------------------------------------------------------------

/**
 * Structured code generator with indentation tracking and import collection.
 *
 * ## Usage
 *
 * ```ts
 * const gen = new CodeGenerator();
 * gen.addImport('./nodes', ['NodeWrangler']);
 * gen.addDecorator('to_nodegroup', ['"RockTexture"']);
 * gen.addFunction('buildRockTexture', ['nw: NodeWrangler'], () => {
 *   gen.addLine("const noise = nw.newNode('ShaderNodeTexNoise', { scale: 5 });");
 *   gen.addLine('return noise;');
 * });
 *
 * console.log(gen.toString());
 * ```
 *
 * This produces:
 *
 * ```ts
 * import { NodeWrangler } from './nodes';
 *
 * @to_nodegroup("RockTexture")
 * function buildRockTexture(nw: NodeWrangler) {
 *   const noise = nw.newNode('ShaderNodeTexNoise', { scale: 5 });
 *   return noise;
 * }
 * ```
 */
export class CodeGenerator {
  // -----------------------------------------------------------------------
  // Private state
  // -----------------------------------------------------------------------

  /** Accumulated output lines */
  private lines: string[] = [];

  /** Current indentation depth (number of indent strings) */
  private indentLevel: number = 0;

  /** The string used for one level of indentation */
  private indentStr: string;

  /** Collected import entries, keyed by module specifier for deduplication */
  private imports: Map<string, ImportEntry> = new Map();

  /** Whether the code generator has been finalised (toString called) */
  private sealed: boolean = false;

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  /**
   * Create a new CodeGenerator.
   *
   * @param indent - The string to use for one level of indentation.
   *                 Defaults to two spaces (`'  '`).
   */
  constructor(indent: string = '  ') {
    this.indentStr = indent;
  }

  // -----------------------------------------------------------------------
  // Line management
  // -----------------------------------------------------------------------

  /**
   * Add a line of code at the current indentation level.
   *
   * Empty strings are added as blank lines (no indentation).
   *
   * @param line - The code line to add
   */
  addLine(line: string): void {
    if (line === '') {
      this.lines.push('');
    } else {
      this.lines.push(this.indentStr.repeat(this.indentLevel) + line);
    }
  }

  /**
   * Add a comment line at the current indentation level.
   *
   * Comments use `//` single-line style for maximum compatibility.
   *
   * @param comment - The comment text (without `//` prefix)
   */
  addComment(comment: string): void {
    this.addLine(`// ${comment}`);
  }

  /**
   * Add a block comment (JSDoc-style) at the current indentation level.
   *
   * @param lines - Array of lines for the block comment body
   */
  addBlockComment(lines: string[]): void {
    this.addLine('/**');
    for (const line of lines) {
      this.addLine(` * ${line}`);
    }
    this.addLine(' */');
  }

  /**
   * Add a blank line.
   */
  addBlankLine(): void {
    this.lines.push('');
  }

  // -----------------------------------------------------------------------
  // Import management
  // -----------------------------------------------------------------------

  /**
   * Add a named import declaration.
   *
   * If an import from the same module already exists, the new items are
   * merged into it (deduplication is automatic).
   *
   * @param from - The module specifier
   * @param items - Named bindings to import
   * @param isTypeOnly - If `true`, emit `import type` instead of `import`
   *
   * @example
   * ```ts
   * gen.addImport('./nodes', ['NodeWrangler']);
   * gen.addImport('./nodes', ['NodeTypes']);       // merged with above
   * gen.addImport('./types', ['NodeGraph'], true); // import type
   * ```
   */
  addImport(from: string, items: string[], isTypeOnly: boolean = false): void {
    const existing = this.imports.get(from);
    if (existing) {
      // Merge items, avoiding duplicates
      const mergedItems = new Set([...existing.items, ...items]);
      existing.items = Array.from(mergedItems);
      // If any import from this module is value-level, keep it value-level
      if (!isTypeOnly) {
        existing.isTypeOnly = false;
      }
    } else {
      this.imports.set(from, { from, items: [...items], isTypeOnly });
    }
  }

  /**
   * Get all collected import entries.
   *
   * @returns Array of import entries, sorted by module specifier
   */
  getImports(): ImportEntry[] {
    return Array.from(this.imports.values()).sort((a, b) =>
      a.from.localeCompare(b.from),
    );
  }

  /**
   * Render all collected imports as code lines.
   *
   * Type-only imports are emitted with `import type`, value imports
   * with `import`. Items within each import are sorted alphabetically.
   *
   * @returns Array of import statement strings
   */
  renderImports(): string[] {
    const result: string[] = [];

    for (const entry of this.getImports()) {
      const sortedItems = Array.from(new Set(entry.items)).sort();
      const keyword = entry.isTypeOnly ? 'import type' : 'import';
      result.push(`${keyword} { ${sortedItems.join(', ')} } from '${entry.from}';`);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Structural helpers
  // -----------------------------------------------------------------------

  /**
   * Add a function declaration with an auto-indented body.
   *
   * The function signature is emitted at the current indentation level,
   * then the body callback is called with indentation increased by one
   * level, and finally the closing brace is emitted.
   *
   * @param name - The function name
   * @param params - Array of parameter strings (e.g. `['nw: NodeWrangler']`)
   * @param body - Callback that emits the function body lines
   * @param isExport - Whether to prefix with `export`. Default: `true`
   * @param isAsync - Whether to prefix with `async`. Default: `false`
   *
   * @example
   * ```ts
   * gen.addFunction('buildNoise', ['nw: NodeWrangler'], () => {
   *   gen.addLine("const n = nw.newNode('ShaderNodeTexNoise');");
   *   gen.addLine('return n;');
   * });
   * // Emits:
   * // export function buildNoise(nw: NodeWrangler) {
   * //   const n = nw.newNode('ShaderNodeTexNoise');
   * //   return n;
   * // }
   * ```
   */
  addFunction(
    name: string,
    params: string[],
    body: () => void,
    isExport: boolean = true,
    isAsync: boolean = false,
  ): void {
    const modifiers: string[] = [];
    if (isExport) modifiers.push('export');
    if (isAsync) modifiers.push('async');

    const prefix = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    this.addLine(`${prefix}function ${name}(${params.join(', ')}) {`);

    this.indent();
    try {
      body();
    } finally {
      this.dedent();
    }

    this.addLine('}');
  }

  /**
   * Add an arrow function with an auto-indented body.
   *
   * @param name - The `const` variable name
   * @param params - Array of parameter strings
   * @param body - Callback that emits the function body lines
   * @param isExport - Whether to prefix with `export`. Default: `true`
   */
  addArrowFunction(
    name: string,
    params: string[],
    body: () => void,
    isExport: boolean = true,
  ): void {
    const prefix = isExport ? 'export ' : '';
    this.addLine(`${prefix}const ${name} = (${params.join(', ')}) => {`);

    this.indent();
    try {
      body();
    } finally {
      this.dedent();
    }

    this.addLine('};');
  }

  /**
   * Add a decorator line before the next declaration.
   *
   * Decorators are emitted at the current indentation level, typically
   * just before a function or class declaration.
   *
   * @param name - The decorator name (without `@`)
   * @param args - Optional array of argument strings
   *
   * @example
   * ```ts
   * gen.addDecorator('to_nodegroup', ['"RockTexture"', '{ seed: 0 }']);
   * // Emits: @to_nodegroup("RockTexture", { seed: 0 })
   * ```
   */
  addDecorator(name: string, args?: string[]): void {
    if (args && args.length > 0) {
      this.addLine(`@${name}(${args.join(', ')})`);
    } else {
      this.addLine(`@${name}`);
    }
  }

  /**
   * Add an `export default` statement.
   *
   * @param expression - The expression to export
   */
  addExportDefault(expression: string): void {
    this.addLine(`export default ${expression};`);
  }

  /**
   * Add a `return` statement.
   *
   * @param expression - The expression to return, or empty for bare `return`
   */
  addReturn(expression?: string): void {
    if (expression) {
      this.addLine(`return ${expression};`);
    } else {
      this.addLine('return;');
    }
  }

  // -----------------------------------------------------------------------
  // Indentation control
  // -----------------------------------------------------------------------

  /**
   * Increase indentation by one level.
   */
  indent(): void {
    this.indentLevel++;
  }

  /**
   * Decrease indentation by one level.
   *
   * Will not go below zero.
   */
  dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  /**
   * Get the current indentation level.
   */
  getIndentLevel(): number {
    return this.indentLevel;
  }

  // -----------------------------------------------------------------------
  // Output
  // -----------------------------------------------------------------------

  /**
   * Render the generated code as a complete TypeScript module string.
   *
   * The output includes:
   * 1. All collected import statements (sorted, deduplicated)
   * 2. A blank line separating imports from code
   * 3. All accumulated code lines
   *
   * Calling `toString()` seals the generator — no more lines or imports
   * may be added after this call.
   *
   * @returns The complete TypeScript source code
   */
  toString(): string {
    if (this.sealed) {
      // Return cached result
      return this.lines.join('\n');
    }

    // Build the final output: imports + body
    const importLines = this.renderImports();
    const allLines: string[] = [];

    // Add imports
    if (importLines.length > 0) {
      allLines.push(...importLines);
      allLines.push('');
    }

    // Add body lines
    allLines.push(...this.lines);

    this.sealed = true;
    this.lines = allLines;
    return this.lines.join('\n');
  }

  /**
   * Get just the body lines (no imports).
   *
   * Useful when you want to embed the generated code into an existing
   * file that already has the necessary imports.
   *
   * @returns The code body as a string (without import statements)
   */
  toBodyString(): string {
    return this.lines.join('\n');
  }

  /**
   * Get the number of code lines (excluding imports).
   */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * Reset the generator to its initial state.
   *
   * Clears all lines, imports, and indentation.
   */
  reset(): void {
    this.lines = [];
    this.indentLevel = 0;
    this.imports.clear();
    this.sealed = false;
  }
}
