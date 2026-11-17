/**
 * SafeRegex: Prevents Regular Expression Denial of Service (ReDoS - CWE-1333)
 * Enforces strict pattern length bounds, candidate string truncation,
 * and rejection of catastrophic backtracking constructs (nested quantifiers,
 * consecutive quantifiers, and repeated overlapping alternations).
 */
export class SafeRegex {
  /** Maximum permitted pattern length to mitigate complexity attacks */
  public static readonly MAX_PATTERN_LENGTH = 128;

  /** Maximum candidate string length evaluated against regex to protect event loop */
  public static readonly MAX_TEST_STRING_LENGTH = 4096;

  /**
   * Detects nested quantifiers e.g. (a+)+, (a*)*, (a+)*, (a*)+, (\w+)+, (a{1,5})+
   */
  private static readonly NESTED_QUANTIFIERS =
    /\((?:\?:)?[^()]*[*+]\)[*+]|\((?:\?:)?[^()]*\{[0-9]+,[0-9]*\}\)[*+]|\((?:\?:)?[^()]*[*+]\)\{[0-9]+,[0-9]*\}/;

  /**
   * Detects consecutive or possessive/backtracking quantifier stacking e.g. a++, a**
   */
  private static readonly CONSECUTIVE_QUANTIFIERS = /[*+?]{2,}/;

  /**
   * Detects repeated alternations that cause exponential branching e.g. (a|a)+, (a|b|c)+
   */
  private static readonly REPEATED_ALTERNATION = /\((?:\?:)?(?:[^|()]*\|)+[^|()]*\)[*+]/;

  /**
   * Validates if a regex pattern string is structurally safe against ReDoS.
   */
  public static isSafe(pattern: string): boolean {
    if (!pattern || typeof pattern !== 'string') return false;
    const trimmed = pattern.trim();
    if (trimmed.length === 0 || trimmed.length > this.MAX_PATTERN_LENGTH) {
      return false;
    }

    if (this.NESTED_QUANTIFIERS.test(trimmed)) {
      return false;
    }

    if (this.CONSECUTIVE_QUANTIFIERS.test(trimmed)) {
      return false;
    }

    if (this.REPEATED_ALTERNATION.test(trimmed)) {
      return false;
    }

    return true;
  }

  /**
   * Safely compiles a pattern into a RegExp instance.
   * Returns null if the pattern is unsafe, exceeds length bounds, or has invalid syntax.
   */
  public static safeCompile(pattern: string, flags: string = 'i'): RegExp | null {
    if (!this.isSafe(pattern)) {
      return null;
    }

    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }

  /**
   * Evaluates a regex safely against a candidate string, truncating overly long candidates.
   */
  public static test(regex: RegExp, candidate: string): boolean {
    if (!regex || typeof candidate !== 'string') return false;
    const bounded =
      candidate.length > this.MAX_TEST_STRING_LENGTH
        ? candidate.slice(0, this.MAX_TEST_STRING_LENGTH)
        : candidate;
    return regex.test(bounded);
  }
}

