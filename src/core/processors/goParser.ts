import type { FunctionSignature, Param } from "../../types/types";
import { BaseParser } from "./baseParser";

/**
 * GoParser extracts Go function & method signatures.
 * Re-implemented with a lightweight state machine for better handling of:
 *  - Nested parentheses inside parameter lists (func types)
 *  - Generic receivers & functions
 *  - Grouped parameters (a, b int)
 *  - Complex channel / map / variadic / pointer types
 */
export class GoParser extends BaseParser {
  extensions = [".go"];

  getExtensions(): string[] {
    return this.extensions;
  }

  getMarkdownLanguageId(): string {
    return "go";
  }

  /**
   * Extract raw function or method signature fragments (up to and including the opening '{').
   * We strip comments first, then scan for 'func' tokens and accumulate until the first '{'
   * encountered at top-level (not inside parentheses / brackets).
   */
  protected extractFunctionMatches(code: string): string[] {
    const src = this.removeComments(code);
    const matches: string[] = [];
    const len = src.length;

    let i = 0;
    while (i < len) {
      // Fast path search for 'func'
      const idx = src.indexOf("func", i);
      if (idx === -1) break;

      // Ensure boundary (previous char not identifier)
      if (idx > 0 && /[A-Za-z0-9_]/.test(src[idx - 1])) {
        i = idx + 4;
        continue;
      }
      // Ensure next char is whitespace or '('
      const after = src[idx + 4];
      if (after && !/\s|\(/.test(after)) {
        i = idx + 4;
        continue;
      }

      // Collect from idx forward until we meet an opening '{' at top-level
      let j = idx + 4;
      let parenDepth = 0;
      let bracketDepth = 0;

      // We only need the signature portion (can span multiple lines)
      while (j < len) {
        const ch = src[j];

        if (ch === "(") parenDepth++;
        else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
        else if (ch === "[") bracketDepth++;
        else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
        else if (ch === "{") {
          if (parenDepth === 0 && bracketDepth === 0) {
            // include '{'
            j++;
            break;
          }
        }
        // Stop early if we hit a newline before we've seen params '(' (invalid / false-positive)
        j++;
      }

      const fragment = src.slice(idx, j);
      // Basic validation: must contain '(' after function name
      if (/func\s+[^\n{]*\(/.test(fragment)) {
        matches.push(fragment);
      }
      i = j;
    }

    return matches;
  }

  protected parseFunctionSignature(decl: string): FunctionSignature | null {
    // Work on a copy
    let s = decl.trim();
    // Remove trailing body opener if present
    // Ensure we only look at the signature line
    // Keep the '{' for simple end detection, but it's optional in parsing below
    // Format assumptions:
    // func (receiver)? Name [Generics]? (params) (returns?) {
    if (!s.startsWith("func")) return null;
    s = s.slice(4).trim(); // drop 'func'

    // 1. Optional receiver
    let receiverRaw: string | undefined;
    if (s.startsWith("(")) {
      const { content, rest } = this.readBalanced(s, 0, "(", ")");
      receiverRaw = content.slice(1, -1).trim(); // strip outer parens
      s = rest.trim();
    }

    // 2. Function name (identifier)
    const nameMatch = s.match(/^([A-Za-z_]\w*)/);
    if (!nameMatch) return null;
    let name = nameMatch[1];
    s = s.slice(name.length).trim();

    // 3. Optional generics after name: [ ... ]
    let genericRaw: string | undefined;
    if (s.startsWith("[")) {
      const endIdx = s.indexOf("]");
      if (endIdx !== -1) {
        genericRaw = s.slice(1, endIdx).trim();
        s = s.slice(endIdx + 1).trim();
      }
    }

    // 4. Parameters: must start with '('
    if (!s.startsWith("(")) return null;
    const paramsBalanced = this.readBalanced(s, 0, "(", ")");
    const paramsRaw = paramsBalanced.content.slice(1, -1); // inside
    s = paramsBalanced.rest.trim();

    // 5. Return type (optional)
    let returnType: string | undefined;
    if (s.startsWith("(")) {
      // multiple returns
      const returnsBalanced = this.readBalanced(s, 0, "(", ")");
      returnType = "(" + returnsBalanced.content.slice(1, -1).trim() + ")";
      s = returnsBalanced.rest.trim();
    } else {
      // single return token sequence until '{' or end
      const singleReturnMatch = s.match(/^([^{\n]+)\{/);
      if (singleReturnMatch) {
        const rt = singleReturnMatch[1].trim();
        if (rt) {
          returnType = rt;
        }
        // consume up to '{'
        // s = s.slice(singleReturnMatch[0].length).trim(); // not needed further
      } else {
        // maybe no '{' captured (edge) - try up to whitespace
        const rt2 = s.replace(/\{.*/, "").trim();
        if (rt2) returnType = rt2;
      }
    }

    // Parameter parsing
    const parameters = this.parseParameters(paramsRaw);

    // Receiver className extraction + possible generic inheritance
    let className: string | undefined;
    let receiverGenerics: string | undefined;
    if (receiverRaw) {
      className = this.extractReceiverType(receiverRaw);
      const rg = receiverRaw.match(/([A-Za-z_]\w*)\s*\[([^\]]+)\]/);
      if (rg) {
        receiverGenerics = rg[2].trim();
      }
    }

    // Compose function name (attach generics either from explicit or receiver if missing)
    let finalName = name;
    if (genericRaw) {
      finalName += `[${genericRaw}]`;
    } else if (receiverGenerics) {
      // Attach receiver generics only if function itself has none (test expectation for Push[T])
      finalName += `[${receiverGenerics}]`;
    }

    const normalizedReturn = this.normalizeReturnType(returnType || "");

    return {
      name: finalName,
      parameters,
      ...(normalizedReturn && { returnType: normalizedReturn }),
      ...(className && { className }),
    };
  }

  /**
   * New parameter parser that correctly handles grouped names:
   *   a, b int, c string, d, e float64
   * And complex types:
   *   map[string]interface{}, chan<- string, func(T) U, ...interface{}, *[]int
   */
  protected parseParameters(paramsStr: string): Param[] {
    if (!paramsStr.trim()) return [];

    // First, split on commas at top-level NOT inside nested parentheses.
    const segments: string[] = [];
    let buf = "";
    let parenDepth = 0;
    for (let i = 0; i < paramsStr.length; i++) {
      const ch = paramsStr[i];
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);

      if (ch === "," && parenDepth === 0) {
        if (buf.trim()) segments.push(buf.trim());
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) segments.push(buf.trim());

    const params: Param[] = [];
    let pendingNames: string[] = [];

    const TYPE_SIGNAL = /^(?:\*|\.{3}|map$|chan$|func$|\[|<-)/;

    const pushTyped = (names: string[], type: string) => {
      const cleanType = type.replace(/\s+/g, " ").trim();
      for (const n of names) {
        if (!n) continue;
        params.push({ name: n, type: cleanType });
      }
    };

    for (const raw of segments) {
      if (!raw) continue;

      // Detect an anonymous function type param (rare). Example: "func(string) error"
      if (raw.startsWith("func(")) {
        params.push({ name: "(anonymous)", type: raw });
        continue;
      }

      // If the raw segment clearly contains a type (space present)
      if (/\s/.test(raw)) {
        // Pattern: first token(s) are the final name, rest is type
        const tokens = raw.split(/\s+/);
        const first = tokens[0];
        const restType = tokens.slice(1).join(" ");
        // If we had pending names before, they share this type
        if (pendingNames.length) {
          pushTyped(pendingNames.concat([first]), restType);
          pendingNames = [];
        } else {
          // Might still be grouped inside 'first' (unlikely because comma split earlier)
          pushTyped([first], restType);
        }
      } else {
        // No space: likely just a name awaiting a future typed segment (grouped param)
        // Edge case: a standalone typed param without type (will be left without type)
        pendingNames.push(raw.replace(/,$/, ""));
      }
    }

    // Any trailing pending names without a discovered type: push without type (edge case)
    for (const n of pendingNames) {
      params.push({ name: n });
    }

    return params;
  }

  protected extractReturnType(_fnDeclaration: string): string | undefined {
    return undefined; // handled directly in parseFunctionSignature
  }

  private normalizeReturnType(ret: string): string | undefined {
    const cleaned = ret.trim();
    return cleaned ? cleaned : undefined;
  }

  /**
   * Extract the type name (struct/class concept) from receiver.
   * Removes pointer, package qualifier and generic instantiation.
   *   "c *Calculator"          => "Calculator"
   *   "c *pkg.Service[T]"      => "Service"
   *   "*MyType"                => "MyType"
   *   "m MyMap[K,V]"           => "MyMap"
   */
  private extractReceiverType(receiver: string): string | undefined {
    if (!receiver) return undefined;
    const parts = receiver.split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) return undefined;
    const noPtr = last.replace(/^\*/, "");         // strip leading pointer
    const noPkg = noPtr.split(".").pop() || noPtr; // strip package
    const base = noPkg.replace(/\[.*\]$/, "");     // drop generic instantiation
    return base;
  }

  private removeComments(code: string): string {
    // Remove // comments
    let out = code.replace(/\/\/.*$/gm, "");
    // Remove /* */ comments
    out = out.replace(/\/\*[\s\S]*?\*\//g, "");
    return out;
  }

  /**
   * Read a balanced pair from the start index (which must point at the opening char).
   * Returns the full balanced substring and the remainder.
   */
  private readBalanced(src: string, start: number, open: string, close: string): { content: string; rest: string } {
    if (src[start] !== open) {
      return { content: "", rest: src };
    }
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const content = src.slice(start, i + 1);
            return { content, rest: src.slice(i + 1) };
        }
      }
    }
    // Unbalanced; fallback
    return { content: src.slice(start), rest: "" };
  }
}
