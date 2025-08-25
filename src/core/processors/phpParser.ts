import type { FunctionSignature, Param } from "../../types/types";
import { BaseParser } from "./baseParser";

/**
 * PhpParser extracts PHP function, method and class signatures.
 *
 * Supported:
 *  - Global functions
 *  - Class declarations
 *  - Class methods (public/protected/private/static)
 *  - Parameters with types, union types, nullable types (?Type), variadic (...$x), by-reference (&$x)
 *  - Default values are ignored for signature purposes
 *  - Return types (single / union / nullable) after colon
 *
 * Limitations:
 *  - Does not fully parse attributes, traits, interfaces (basic class only)
 *  - Does not distinguish visibility in output (not part of FunctionSignature model)
 *  - Generic-like PHPDoc templates not parsed (PHP does not have runtime generics)
 */
export class PhpParser extends BaseParser {
  extensions = [".php"];

  getExtensions(): string[] {
    return this.extensions;
  }

  getMarkdownLanguageId(): string {
    return "php";
  }

  public extractFunctionMatches(code: string): string[] {
    const matches: string[] = [];

    // Strip comments (simple)
    const withoutComments = this.removeComments(code);

    // 1. Class declarations (capture body to extract methods)
    const classRegex = /class\s+([A-Za-z_]\w*)[^{]*\{/g;
    let cm: RegExpExecArray | null;

    while ((cm = classRegex.exec(withoutComments)) !== null) {
      const className = cm[1];
      const bodyStart = cm.index + cm[0].length - 1; // position at '{'
      const { body, endIndex } = this.captureBalancedBlock(
        withoutComments,
        bodyStart
      );
      // Push class signature
      matches.push(`class ${className}`);

      // Extract methods inside body
      const methodRegex =
        /\b(public|protected|private)?\s*(static\s+)?function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^{;\n]+))?/g;
      let mm: RegExpExecArray | null;
      while ((mm = methodRegex.exec(body)) !== null) {
        const [, _vis, _static, methodName, params, returnType] = mm;
        // Clean leading whitespace that might remain after comment stripping
        const cleanedParams = params.replace(/^\s+/, "");
        // Synthesize a function declaration for downstream parse
        // Include a leading marker to associate class (we keep normal "function" to reuse parser)
        matches.push(
          `function ${methodName}(${cleanedParams})${
            returnType ? `: ${returnType.trim()}` : ""
          } /*__CLASS:${className}__*/`
        );
      }

      // Advance outer regex to end of this class body to prevent nested re-scan confusion
      classRegex.lastIndex = endIndex;
    }

    // 2. Global functions (not already captured as class methods)
    // Pattern: function name(params) : returnType {
    const globalFuncRegex =
      /\bfunction\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^{;\n]+))?/g;
    let gf: RegExpExecArray | null;
    while ((gf = globalFuncRegex.exec(withoutComments)) !== null) {
      const [full, name, params, returnType] = gf;

      // Skip if this occurrence was inside a class body already processed.
      if (full.includes("/*__CLASS:")) continue;

      const cleanedParams = params.replace(/^\s+/, "");

      matches.push(
        `function ${name}(${cleanedParams})${
          returnType ? `: ${returnType.trim()}` : ""
        }`
      );
    }

    // Normalize spacing after '(' introduced by comment stripping (e.g. '( string $x' -> '(string $x')
    for (let i = 0; i < matches.length; i++) {
      matches[i] = matches[i].replace(/\(\s+/g, "(");
    }

    return matches;
  }

  public parseFunctionSignature(decl: string): FunctionSignature | null {
    decl = decl.trim();

    // Class declaration
    if (decl.startsWith("class ")) {
      const classNameMatch = decl.match(/^class\s+([A-Za-z_]\w*)/);
      if (!classNameMatch) return null;
      return {
        name: classNameMatch[1],
        parameters: [],
      };
    }

    if (!decl.startsWith("function")) return null;

    // Remove trailing class marker if present
    let className: string | undefined;
    const classMarkerMatch = decl.match(/\/\*__CLASS:([A-Za-z_]\w*)__\*\/$/);
    if (classMarkerMatch) {
      className = classMarkerMatch[1];
      decl = decl.replace(/\/\*__CLASS:[A-Za-z_]\w*__\*\/$/, "").trim();
    }

    // function name(params) : returnType
    const fnMatch = decl.match(
      /^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^{;\n]+))?/
    );
    if (!fnMatch) return null;

    const [, name, paramsRaw, returnRaw] = fnMatch;
    const parameters = this.parseParameters(paramsRaw || "");
    const returnType = this.normalizeReturnType(returnRaw);

    return {
      name,
      parameters,
      ...(returnType && { returnType }),
      ...(className && { className }),
    };
  }

  protected parseParameters(paramsStr: string): Param[] {
    if (!paramsStr.trim()) return [];

    return paramsStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map<Param>((raw) => {
        // Remove default value
        const noDefault = raw.split("=")[0].trim();

        // Variadic indicator
        const isVariadic = /\.\.\.\$/.test(noDefault);

        // By-reference indicator
        // Keep for name extraction but not type
        // Remove attributes (#[...]) if present (simple strip)
        let cleaned = noDefault.replace(/#\[[^\]]*\]\s*/g, "");

        // Name extraction: find $identifier
        const nameMatch = cleaned.match(/\$[A-Za-z_]\w*/);
        const name = nameMatch ? nameMatch[0].substring(1) : cleaned;

        // Portion before $ is the type/qualifiers
        let typePart = "";
        if (nameMatch) {
          typePart = cleaned.slice(0, nameMatch.index).trim();
        }

        // Remove ampersand & and variadic ...
        typePart = typePart
          .replace(/&/g, "")
          .replace(/\.\.\./g, "")
          .trim();

        // If empty, no type
        let type: string | undefined = typePart || undefined;

        // Represent variadic as ...Type or ... if no type
        if (isVariadic) {
          type = type ? `...${type}` : "...";
        }

        return {
          name,
          ...(type && { type }),
        };
      });
  }

  public extractReturnType(_fnDeclaration: string): string | undefined {
    return undefined; // handled inline
  }

  // Helpers
  private normalizeReturnType(ret?: string): string | undefined {
    if (!ret) return undefined;
    const cleaned = ret.trim().replace(/[{;]\s*$/, "");
    return cleaned || undefined;
  }

  private removeComments(code: string): string {
    // // single line
    code = code.replace(/\/\/.*$/gm, "");
    // # single line
    code = code.replace(/#.*$/gm, "");
    // /* block */
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    return code;
  }

  private captureBalancedBlock(
    src: string,
    startBraceIndex: number
  ): { body: string; endIndex: number } {
    if (src[startBraceIndex] !== "{") {
      return { body: "", endIndex: startBraceIndex };
    }
    let depth = 0;
    for (let i = startBraceIndex; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return {
            body: src.slice(startBraceIndex + 1, i),
            endIndex: i + 1,
          };
        }
      }
    }
    return { body: src.slice(startBraceIndex + 1), endIndex: src.length };
  }
}
