import type { FunctionSignature, Param } from "../../types/types";
import { BaseParser } from "./baseParser";

/**
 * Lightweight TypeScript/JavaScript parser WITHOUT depending on the heavy "typescript" package.
 *
 * Supported constructs (as required by existing tests):
 *  - Function declarations:        function sum(a: number, b: number): number { ... }
 *  - Async functions:              async function fetchData(url: string): Promise<any> { ... }
 *  - Arrow functions (const):      const multiply = (a: number, b: number): number => a * b
 *  - Exported arrow functions:     export const divide = (a: number, b: number): number => a / b
 *  - Classes with methods:         class Calculator { add(a: number,b:number): number {...} async compute(...): Promise<number> {...} }
 *  - Constructors:                 constructor(name: string, age: number) { ... }
 *  - Generics on functions/methods: function identity<T>(v: T): T; class Container<T> { map<U>(...) : U }
 *  - Function type parameters inside parameter lists: fn: (err: Error, data: string) => void
 *
 * Design goal:
 *  Keep enough correctness to satisfy current test suite with balanced-parentheses scanning,
 *  while avoiding full AST parsing.
 */
export class TypeScriptParser extends BaseParser {
  extensions = [".ts", ".tsx", ".js", ".jsx"];

  getExtensions(): string[] {
    return this.extensions;
  }

  getMarkdownLanguageId(): string {
    return "typescript";
  }

  /**
   * Public API used by tests (distinct from BaseParser.extractSignatures)
   */
  public extractFunctions(code: string): FunctionSignature[] {
    const matches = this.extractFunctionMatches(code);
    return matches
      .map((m) => this.parseFunctionSignature(m))
      .filter((f): f is FunctionSignature => f !== null);
  }

  /**
   * Remove line and block comments (simple heuristic).
   */
  private stripComments(src: string): string {
    // Remove /* ... */ including newlines
    src = src.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove // ... end of line
    src = src.replace(/\/\/.*$/gm, "");
    return src;
  }

  /**
   * Read balanced parentheses from given index (which must point to '(').
   */
  private readBalanced(
    src: string,
    start: number,
    open: string,
    close: string
  ): { content: string; end: number } {
    if (src[start] !== open) {
      return { content: "", end: start };
    }
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          return { content: src.slice(start, i + 1), end: i + 1 };
        }
      }
    }
    return { content: src.slice(start), end: src.length };
  }

  /**
   * Core extractor: produce normalized signature strings compatible with existing parseFunctionSignature().
   * We DO NOT include method bodies; only signature portions plus @class:ClassName markers.
   */
  /**
   * Extract only top-level function & arrow function signatures plus class methods.
   * "Max scan depth = 1" requirement means:
   *  - Include: declarations at module (brace depth 0) + class methods (handled separately)
   *  - Exclude: any function/arrow nested inside other functions, blocks, if/for scopes, etc.
   */
  protected extractFunctionMatches(code: string): string[] {
    const src = this.stripComments(code);

    // Precompute brace depth for every index to cheaply test top-level status.
    const depth: number[] = new Array(src.length).fill(0);
    {
      let d = 0;
      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === "{") {
          d++;
          depth[i] = d;
        } else if (ch === "}") {
          depth[i] = d;
          d = Math.max(0, d - 1);
        } else {
          depth[i] = d;
        }
      }
    }

    // Collect separately to enforce order: functions, arrows, then class methods.
    const funcDecls: string[] = [];
    const arrows: string[] = [];
    const methods: string[] = [];

    // Top-level only (depth 0)
    this.extractFunctionDeclarations(src, funcDecls, depth);
    this.extractArrowFunctions(src, arrows, depth);
    // Support React.forwardRef component arrows:
    this.extractForwardRefComponents(src, arrows, depth);
    // Support top-level constant aliases to components (e.g., const Select = SelectPrimitive.Root;)
    this.extractConstAliases(src, arrows, depth);
    this.extractClassesAndMethods(src, methods, depth);

    // Merge in the required order and deduplicate while preserving order.
    const merged = [...funcDecls, ...arrows, ...methods];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const m of merged) {
      const trimmed = m.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        unique.push(trimmed);
      }
    }
    return unique;
  }

  private extractClassesAndMethods(
    src: string,
    matches: string[],
    depth: number[]
  ) {
    const classRegex = /class\s+([A-Za-z_]\w*)(<[^>{]+>)?\s*\{/g;
    let m: RegExpExecArray | null;

    while ((m = classRegex.exec(src)) !== null) {
      // Only consider classes defined at top-level (depth at 'c' of 'class' must be 0)
      if (depth[m.index] !== 0) continue;

      const className = m[1];
      const bodyStart = classRegex.lastIndex - 1;
      const { body, end } = this.captureBalancedBraces(src, bodyStart);
      this.extractMethodsFromClassBody(body, className, matches);
      classRegex.lastIndex = end;
    }
  }

  private captureBalancedBraces(
    src: string,
    startBraceIndex: number
  ): { body: string; end: number } {
    if (src[startBraceIndex] !== "{") {
      return { body: "", end: startBraceIndex };
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
            end: i + 1,
          };
        }
      }
    }
    return { body: src.slice(startBraceIndex + 1), end: src.length };
  }

  private extractMethodsFromClassBody(
    body: string,
    className: string,
    matches: string[]
  ) {
    // We scan for method candidates by locating identifier + '(' with optional generics.
    // Pattern anchor at line starts to reduce false positives.
    const methodRegex =
      /(^|\n|\r)\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_]\w*)(<[^>]+>)?\s*\(/g;

    let mm: RegExpExecArray | null;
    while ((mm = methodRegex.exec(body)) !== null) {
      const prefixSegment = mm[0];
      const fullMatchIndex = mm.index + mm[1].length; // skip leading newline captured group
      const beforeName = prefixSegment
        .slice(0, prefixSegment.lastIndexOf(mm[2]))
        .trim();

      const possibleAsync = /\basync\b/.test(beforeName);
      const methodName = mm[2];
      const generics = mm[3] || "";
      const parenStart = methodRegex.lastIndex - 1; // position at '('
      const { content: paramGroup, end: afterParamsIndex } = this.readBalanced(
        body,
        parenStart,
        "(",
        ")"
      );
      if (!paramGroup) continue;
      const paramsInside = paramGroup.slice(1, -1); // drop parentheses

      // After params -> optional return type
      let rest = body.slice(afterParamsIndex).trimStart();
      let returnType = "";
      if (rest.startsWith(":")) {
        rest = rest.slice(1).trimStart();
        // Capture until first { or newline or =>
        const rtMatch = rest.match(/^([^={;\n]+)/);
        if (rtMatch) {
          returnType = rtMatch[1].trim();
        }
      }

      // Normalize signature string for downstream parsing
      if (methodName === "constructor") {
        matches.push(`constructor(${paramsInside}) @class:${className}`);
      } else {
        const asyncPrefix = possibleAsync ? "async " : "";
        const nameWithGenerics = `${methodName}${generics}`;
        matches.push(
          `${asyncPrefix}${nameWithGenerics}(${paramsInside})${
            returnType ? `: ${returnType}` : ""
          } @class:${className}`
        );
      }
    }
  }

  private extractFunctionDeclarations(
    src: string,
    matches: string[],
    depth?: number[]
  ) {
    const funcRegex =
      /(?:^|\n|\r)\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)(<[^>]+>)?\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = funcRegex.exec(src)) !== null) {
      // If depth is provided, ensure the 'function' keyword is at top-level
      if (depth) {
        const functionKeywordIndex = src.indexOf("function", m.index);
        if (functionKeywordIndex === -1 || depth[functionKeywordIndex] !== 0) {
          continue;
        }
      }

      const fullStart = funcRegex.lastIndex - 1; // '(' position
      const isAsync = /async\s+function/.test(m[0]);
      const name = m[2];
      const generics = m[3] || "";
      const { content: paramGroup, end: afterParamsIndex } = this.readBalanced(
        src,
        fullStart,
        "(",
        ")"
      );
      if (!paramGroup) continue;
      const paramsInside = paramGroup.slice(1, -1);

      let rest = src.slice(afterParamsIndex).trimStart();
      let returnType = "";
      if (rest.startsWith(":")) {
        rest = rest.slice(1).trimStart();
        const rtMatch = rest.match(/^([^={;\n]+)/);
        if (rtMatch) returnType = rtMatch[1].trim();
      }

      const asyncPrefix = isAsync ? "async " : "";
      const nameWithGenerics = `${name}${generics}`;
      matches.push(
        `${asyncPrefix}${nameWithGenerics}(${paramsInside})${
          returnType ? `: ${returnType}` : ""
        }`
      );
    }
  }

  private extractArrowFunctions(
    src: string,
    matches: string[],
    depth?: number[]
  ) {
    const arrowRegex =
      /(?:^|\n|\r)\s*(export\s+)?const\s+([A-Za-z_]\w+)\s*=\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = arrowRegex.exec(src)) !== null) {
      // If depth is provided, ensure 'const' is at top-level
      if (depth) {
        const constIndex = src.indexOf("const", m.index);
        if (constIndex === -1 || depth[constIndex] !== 0) {
          continue;
        }
      }

      const exportPrefix = m[1] ? "export const" : "const";
      const name = m[2];
      const parenStart = arrowRegex.lastIndex - 1;
      const { content: paramGroup, end: afterParamsIndex } = this.readBalanced(
        src,
        parenStart,
        "(",
        ")"
      );
      if (!paramGroup) continue;
      const paramsInside = paramGroup.slice(1, -1);

      const rest = src.slice(afterParamsIndex);
      // Look for return annotation before =>
      const arrowMatch = rest.match(/^\s*(?::\s*([^=;\n]+))?\s*=>/);
      let returnType = "";
      if (arrowMatch) {
        returnType = (arrowMatch[1] || "").trim();
      }

      matches.push(
        `${exportPrefix} ${name} = (${paramsInside})${
          returnType ? `: ${returnType}` : ""
        } =>`
      );
    }
  }

  /**
   * Signature parsing reused from previous implementation (regex-based).
   * Accepts:
   *   - const name = (params): ReturnType =>
   *   - async function / function / method forms with optional generics and return types
   *   - method/constructor lines terminated by annotation @class:ClassName
   */
  /**
   * Support for React.forwardRef (and forwardRef) component declarations:
   *   const Name = React.forwardRef<...>((props, ref) => (...))
   *   const Name = forwardRef<...>((props, ref) => (...))
   * Extracts as: "const Name = (props, ref) =>"
   * Optionally captures a return type if annotated directly on the inner arrow.
   * Respects max scan depth = 1 (top-level only) via optional 'depth' array.
   */
  private extractForwardRefComponents(
    src: string,
    matches: string[],
    depth?: number[]
  ) {
    const frRegex =
      /(?:^|\n|\r)\s*(export\s+)?const\s+([A-Za-z_]\w+)\s*=\s*(?:React\.)?forwardRef\s*(?:<[^>]*>)?\s*\(/g;
    let m: RegExpExecArray | null;

    while ((m = frRegex.exec(src)) !== null) {
      // If depth is provided, ensure the 'const' is at top-level
      if (depth) {
        const constIdx = src.indexOf("const", m.index);
        if (constIdx === -1 || depth[constIdx] !== 0) continue;
      }

      // Position now at '(' after forwardRef<...>(
      const parenStart = frRegex.lastIndex - 1;
      const { content: argsGroup, end: afterArgsIdx } = this.readBalanced(
        src,
        parenStart,
        "(",
        ")"
      );
      if (!argsGroup) continue;

      // Inside argsGroup, find the inner arrow function parameter list "(...)" before =>
      // Trim leading whitespace
      const inner = argsGroup.trimStart();
      const firstParen = inner.indexOf("(");
      if (firstParen < 0) continue;

      const innerBalanced = this.readBalanced(inner, firstParen, "(", ")");
      if (!innerBalanced.content) continue;

      const paramsInside = innerBalanced.content.slice(1, -1);

      // After params, attempt to capture optional return type before =>
      const afterParams = inner.slice(innerBalanced.end);
      const rtMatch = afterParams.match(/^\s*:\s*([^=)\n]+)\s*=>/);
      const returnType = rtMatch ? rtMatch[1].trim() : "";

      const name = m[2];
      matches.push(
        `const ${name} = (${paramsInside})${returnType ? `: ${returnType}` : ""} =>`
      );
    }
  }

  /**
   * Support top-level constant aliases to component factories or primitives:
   *   const Select = SelectPrimitive.Root;
   *   const SelectGroup = SelectPrimitive.Group;
   * These are not functions per se, but we synthesize an empty-params arrow signature
   * so downstream signature parsing can treat them as callable components.
   */
  private extractConstAliases(
    src: string,
    matches: string[],
    depth?: number[]
  ) {
    const aliasRegex =
      /(?:^|\n|\r)\s*(export\s+)?const\s+([A-Za-z_]\w+)\s*=\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*;?/g;
    let m: RegExpExecArray | null;

    while ((m = aliasRegex.exec(src)) !== null) {
      if (depth) {
        const constIdx = src.indexOf("const", m.index);
        if (constIdx === -1 || depth[constIdx] !== 0) continue;
      }
      const name = m[2];
      // Synthesize minimal arrow so parseFunctionSignature can parse it
      matches.push(`const ${name} = () =>`);
    }
  }

  protected parseFunctionSignature(
    fnDeclaration: string
  ): FunctionSignature | null {
    // Preserve existing class annotation handling
    const classMatch = fnDeclaration.match(/@class:(\w+)/);
    const className = classMatch ? classMatch[1] : undefined;
    const cleanDeclaration = fnDeclaration.replace(/@class:\w+/, "").trim();

    try {
      // Arrow functions
      const arrowMatch = cleanDeclaration.match(
        /(?:export\s+)?const\s+(\w+)\s*=\s*\((.*?)\)(?:\s*:\s*([^=\n]+))?\s*=>/
      );
      if (arrowMatch) {
        const [, name, params = "", returnType] = arrowMatch;
        return {
          name,
          parameters: this.parseParameters(params),
          ...(returnType && { returnType: returnType.trim() }),
          ...(className && { className }),
        };
      }

      // Standard function / method / constructor
      const headerMatch = cleanDeclaration.match(
        /^(?:export\s+)?(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(?:function\s+)?([\w$]+)(?:<([^>]*)>)?\s*\(/
      );
      if (!headerMatch) return null;

      const [, baseName, generics] = headerMatch;
      const name = generics ? `${baseName}<${generics}>` : baseName;

      const firstParenIndex = cleanDeclaration.indexOf(
        "(",
        headerMatch[0].length - 1
      );
      if (firstParenIndex === -1) return null;

      // Find matching ')'
      let depth = 0;
      let paramEnd = -1;
      for (let i = firstParenIndex; i < cleanDeclaration.length; i++) {
        const ch = cleanDeclaration[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
            if (depth === 0) {
            paramEnd = i;
            break;
          }
        }
      }
      if (paramEnd === -1) return null;

      const paramsRaw = cleanDeclaration.slice(firstParenIndex + 1, paramEnd);
      const remainder = cleanDeclaration.slice(paramEnd + 1);

      let returnType: string | undefined;
      const returnMatch = remainder.match(/^\s*:\s*([^@]+)/);
      if (returnMatch) {
        returnType = returnMatch[1].trim();
        if (returnType.endsWith(";")) {
          returnType = returnType.slice(0, -1).trim();
        }
      }

      const isAsync = /\basync\b/.test(cleanDeclaration);

      return {
        name,
        parameters: this.parseParameters(paramsRaw),
        ...(returnType && { returnType }),
        ...(isAsync && { isAsync: true }),
        ...(className && { className }),
      };
    } catch (error) {
      console.error("Error parsing function signature:", error);
      return null;
    }
  }

  /**
   * Parameter parser (unchanged from previous implementation) that splits while
   * respecting nested parentheses / brackets / generics.
   */
  protected parseParameters(paramsStr: string): Param[] {
    if (!paramsStr.trim()) return [];

    const params: Param[] = [];
    let buffer = "";
    let depth = {
      paren: 0,
      angle: 0,
      square: 0,
      curly: 0,
    };

    const insideBrackets = () =>
      depth.paren > 0 ||
      depth.angle > 0 ||
      depth.square > 0 ||
      depth.curly > 0;

    const processParam = (paramText: string) => {
      paramText = paramText.trim();
      if (!paramText) return;

      const colonPos = paramText.indexOf(":");

      // No type
      if (colonPos === -1) {
        params.push({ name: paramText });
        return;
      }

      const name = paramText.substring(0, colonPos).trim();
      let type = paramText.substring(colonPos + 1).trim();

      // Strip default values (not function arrows)
      if (type.includes("=") && !type.includes("=>")) {
        let eqPos = type.lastIndexOf("=");
        while (eqPos > 0 && type[eqPos - 1] !== "=" && type[eqPos + 1] === ">") {
          eqPos = type.lastIndexOf("=", eqPos - 1);
        }
        if (eqPos !== -1) {
          type = type.substring(0, eqPos).trim();
        }
      }

      params.push({ name, type });
    };

    for (let i = 0; i < paramsStr.length; i++) {
      const char = paramsStr[i];
      buffer += char;

      switch (char) {
        case "(":
          depth.paren++;
          break;
        case ")":
          depth.paren--;
          break;
        case "<":
          depth.angle++;
          break;
        case ">":
          if (i === 0 || paramsStr[i - 1] !== "=") depth.angle--;
          break;
        case "[":
          depth.square++;
          break;
        case "]":
          depth.square--;
          break;
        case "{":
          depth.curly++;
          break;
        case "}":
          depth.curly--;
          break;
      }

      if (char === "," && !insideBrackets()) {
        processParam(buffer.slice(0, -1).trim());
        buffer = "";
      }
    }

    if (buffer.trim()) {
      processParam(buffer);
    }

    return params;
  }

  protected extractReturnType(fnDeclaration: string): string | undefined {
    const match = fnDeclaration.match(/\)(?:\s*:\s*([^{=\n]+))?/);
    return match?.[1]?.trim();
  }
}
