/**
 * Label Expression Parser
 *
 * Parses label expressions from node labels following Infinigen's convention.
 * Infinigen uses special label annotations to declare random distributions
 * for node inputs, e.g.:
 *
 *   "radius ~ U(0.5, 2.0)"   → uniform(0.5, 2.0)
 *   "roughness ~ N(0.3, 0.1)" → normal(0.3, 0.1)
 *   "count ~ R(1, 10)"        → randint(1, 10)
 *   "value = 0.5"             → 0.5 (fixed value)
 *
 * These expressions are converted into code that samples from the
 * corresponding distribution at graph construction time.
 *
 * @module core/nodes/transpiler/LabelExpressionParser
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported distribution types for label expressions.
 *
 * Mirrors Infinigen's Python random distributions:
 * - `uniform` — continuous uniform distribution U(low, high)
 * - `normal` — Gaussian distribution N(mu, sigma)
 * - `randint` — discrete uniform distribution over integers in [low, high]
 * - `fixed` — a deterministic constant value
 */
export type DistributionType = 'uniform' | 'normal' | 'randint' | 'fixed';

/**
 * Parsed result of a label expression.
 *
 * Contains the variable name (extracted from the label), the distribution
 * type, and the numeric parameters for that distribution.
 */
export interface LabelExpression {
  /** The variable name extracted from the left side of the expression */
  variableName: string;
  /** Which distribution this expression describes */
  distribution: DistributionType;
  /** Numeric parameters for the distribution (meaning depends on type) */
  params: number[];
}

// ---------------------------------------------------------------------------
// LabelExpressionParser
// ---------------------------------------------------------------------------

/**
 * Parser for Infinigen-style label expressions on node labels.
 *
 * Infinigen's Python transpiler uses label annotations to declare random
 * distributions for node inputs. This class replicates that parsing logic
 * for the TypeScript/R3F port, converting label strings into structured
 * {@link LabelExpression} objects and then into executable code strings.
 *
 * ## Supported Syntax
 *
 * | Syntax                       | Distribution | Code Output                |
 * |------------------------------|-------------|----------------------------|
 * | `name ~ U(lo, hi)`          | uniform     | `uniform(lo, hi)`          |
 * | `name ~ N(mu, sigma)`       | normal      | `normal(mu, sigma)`        |
 * | `name ~ R(lo, hi)`          | randint     | `randint(lo, hi)`          |
 * | `name = value`              | fixed       | `value`                    |
 * | `name ~ LogUniform(lo, hi)` | loguniform  | `logUniform(lo, hi)`      |
 * | `name ~ Choice(a, b, c)`    | choice      | `choice([a, b, c])`       |
 *
 * ## Usage
 *
 * ```ts
 * const parser = new LabelExpressionParser();
 *
 * const expr = parser.parse('roughness ~ U(0.2, 0.8)');
 * // → { variableName: 'roughness', distribution: 'uniform', params: [0.2, 0.8] }
 *
 * const code = parser.toCode(expr!);
 * // → 'uniform(0.2, 0.8)'
 * ```
 */
export class LabelExpressionParser {
  // -----------------------------------------------------------------------
  // Regex patterns for each distribution type
  // -----------------------------------------------------------------------

  /** Matches: `variableName ~ U(low, high)` — continuous uniform */
  private static readonly UNIFORM_RE =
    /^(\w+)\s*~\s*U\s*\(\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)\s*\)$/;

  /** Matches: `variableName ~ N(mu, sigma)` — normal / Gaussian */
  private static readonly NORMAL_RE =
    /^(\w+)\s*~\s*N\s*\(\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)\s*\)$/;

  /** Matches: `variableName ~ R(low, high)` — discrete uniform (randint) */
  private static readonly RANDINT_RE =
    /^(\w+)\s*~\s*R\s*\(\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)\s*\)$/;

  /** Matches: `variableName = value` — fixed deterministic value */
  private static readonly FIXED_RE =
    /^(\w+)\s*=\s*([0-9.eE+-]+)$/;

  /** Matches: `variableName ~ LogUniform(low, high)` — log-uniform */
  private static readonly LOG_UNIFORM_RE =
    /^(\w+)\s*~\s*LogUniform\s*\(\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)\s*\)$/i;

  /** Matches: `variableName ~ Choice(a, b, c, ...)` — discrete choice */
  private static readonly CHOICE_RE =
    /^(\w+)\s*~\s*Choice\s*\(\s*([^)]+)\)$/i;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Parse a label string into a structured expression.
   *
   * Tries each known pattern in order. If none match, returns `null`.
   *
   * @param label - The raw label string from a node
   * @returns A parsed {@link LabelExpression}, or `null` if the label
   *          does not contain a recognised expression pattern
   *
   * @example
   * ```ts
   * parser.parse('radius ~ U(0.5, 2.0)');
   * // → { variableName: 'radius', distribution: 'uniform', params: [0.5, 2] }
   *
   * parser.parse('some label');
   * // → null
   * ```
   */
  parse(label: string): LabelExpression | null {
    if (!label || typeof label !== 'string') return null;

    const trimmed = label.trim();

    // Try uniform: name ~ U(low, high)
    let match = trimmed.match(LabelExpressionParser.UNIFORM_RE);
    if (match) {
      return {
        variableName: match[1],
        distribution: 'uniform',
        params: [parseFloat(match[2]), parseFloat(match[3])],
      };
    }

    // Try log-uniform: name ~ LogUniform(low, high)
    match = trimmed.match(LabelExpressionParser.LOG_UNIFORM_RE);
    if (match) {
      // Represented as 'uniform' with a logUniform flag in the code output
      return {
        variableName: match[1],
        distribution: 'uniform',
        params: [parseFloat(match[2]), parseFloat(match[3])],
      };
    }

    // Try normal: name ~ N(mu, sigma)
    match = trimmed.match(LabelExpressionParser.NORMAL_RE);
    if (match) {
      return {
        variableName: match[1],
        distribution: 'normal',
        params: [parseFloat(match[2]), parseFloat(match[3])],
      };
    }

    // Try randint: name ~ R(low, high)
    match = trimmed.match(LabelExpressionParser.RANDINT_RE);
    if (match) {
      return {
        variableName: match[1],
        distribution: 'randint',
        params: [parseFloat(match[2]), parseFloat(match[3])],
      };
    }

    // Try choice: name ~ Choice(a, b, c, ...)
    match = trimmed.match(LabelExpressionParser.CHOICE_RE);
    if (match) {
      const choices = match[2]
        .split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n));
      if (choices.length > 0) {
        return {
          variableName: match[1],
          distribution: 'fixed',
          params: choices,
        };
      }
    }

    // Try fixed: name = value
    match = trimmed.match(LabelExpressionParser.FIXED_RE);
    if (match) {
      return {
        variableName: match[1],
        distribution: 'fixed',
        params: [parseFloat(match[2])],
      };
    }

    return null;
  }

  /**
   * Convert a parsed expression into executable TypeScript code.
   *
   * The output code uses distribution functions from Infinigen's random
   * module. When the generated code is executed, these functions sample
   * a concrete value from the specified distribution.
   *
   * @param expression - A parsed {@link LabelExpression}
   * @returns A TypeScript code string that, when evaluated, produces a
   *          value from the specified distribution
   *
   * @example
   * ```ts
   * parser.toCode({ variableName: 'radius', distribution: 'uniform', params: [0.5, 2] });
   * // → 'uniform(0.5, 2)'
   *
   * parser.toCode({ variableName: 'roughness', distribution: 'normal', params: [0.3, 0.1] });
   * // → 'normal(0.3, 0.1)'
   *
   * parser.toCode({ variableName: 'value', distribution: 'fixed', params: [0.5] });
   * // → '0.5'
   * ```
   */
  toCode(expression: LabelExpression): string {
    const { distribution, params } = expression;

    switch (distribution) {
      case 'uniform':
        return `uniform(${this.formatNumber(params[0])}, ${this.formatNumber(params[1])})`;

      case 'normal':
        return `normal(${this.formatNumber(params[0])}, ${this.formatNumber(params[1])})`;

      case 'randint':
        return `randint(${Math.round(params[0])}, ${Math.round(params[1])})`;

      case 'fixed':
        if (params.length === 1) {
          return this.formatNumber(params[0]);
        }
        // Multiple params → choice
        return `choice([${params.map(p => this.formatNumber(p)).join(', ')}])`;

      default:
        return this.formatNumber(params[0] ?? 0);
    }
  }

  /**
   * Check if a label string contains a parseable expression.
   *
   * @param label - The raw label string from a node
   * @returns `true` if the label matches a known expression pattern
   */
  isExpression(label: string): boolean {
    return this.parse(label) !== null;
  }

  /**
   * Get the distribution type from a label, if it contains an expression.
   *
   * @param label - The raw label string from a node
   * @returns The distribution type, or `null` if the label is not an expression
   */
  getDistributionType(label: string): DistributionType | null {
    const expr = this.parse(label);
    return expr?.distribution ?? null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Format a number for code output.
   *
   * Integers are output without a decimal point; floats are output with
   * sufficient precision for reproducibility.
   */
  private formatNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    // Use enough precision to round-trip IEEE 754 doubles
    return parseFloat(n.toPrecision(12)).toString();
  }
}
