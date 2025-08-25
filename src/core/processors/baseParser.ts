import type {
  FunctionSignature,
  LanguageProcessor,
  Param,
} from "../../types/types";

export abstract class BaseParser implements LanguageProcessor {
  abstract extensions: string[];

  /**
   * Default implementation for extracting function signatures using regex
   * Can be overridden by specific language parsers for more accurate parsing
   */
  extractSignatures(code: string): FunctionSignature[] {
    try {
      const signatures = this.extractFunctionMatches(code)
        .map((match) => this.parseFunctionSignature(match))
        .filter((sig): sig is FunctionSignature => sig !== null);

      return signatures;
    } catch (error) {
      console.error("Error extracting signatures:", error);
      return [];
    }
  }

  /**
   * Extract function declaration matches from code
   * Override this method in language-specific parsers
   */
  protected abstract extractFunctionMatches(code: string): string[];

  /**
   * Parse a function declaration into a structured signature
   * Override this method in language-specific parsers
   */
  protected abstract parseFunctionSignature(
    fnDeclaration: string
  ): FunctionSignature | null;

  /**
   * Helper method to parse parameters string into structured params
   * Override this method in language-specific parsers
   */
  protected abstract parseParameters(paramsStr: string): Param[];

  /**
   * Helper method to extract return type if present
   * Override this method in language-specific parsers
   */
  protected abstract extractReturnType(
    fnDeclaration: string
  ): string | undefined;

  /**
   * Returns an array of file extensions this parser supports (e.g., ['.ts', '.tsx']).
   */
  abstract getExtensions(): string[];

  /**
   * Returns the string identifier used for Markdown code fences (e.g., 'typescript').
   */
  abstract getMarkdownLanguageId(): string;
}
