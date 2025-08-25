import { describe, it, expect } from "bun:test";
import { PhpParser } from "../core/processors/phpParser";

describe("PhpParser", () => {
  const parser = new PhpParser();

  describe("extractFunctionMatches", () => {
    it("should parse simple global function with types and return type", () => {
      const code = `<?php
function add(int $a, int $b): int {
  return $a + $b;
}
`;
      const matches = parser.extractFunctionMatches(code);
      expect(matches).toContain("function add(int $a, int $b): int");
    });

    it("should parse global function without return type", () => {
      const code = `<?php
function greet(string $name) {
  echo "Hello $name";
}
`;
      const matches = parser.extractFunctionMatches(code);
      expect(matches).toContain("function greet(string $name)");
    });

    it("should parse class with methods", () => {
      const code = `<?php
class Calculator {
  public function add(int $a, int $b): int { return $a + $b; }
  protected static function version(): string { return "1.0"; }
}
`;
      const matches = parser.extractFunctionMatches(code);
      // Contains class declaration
      expect(matches).toContain("class Calculator");

      // Contains methods synthesized as function lines; we don't assert the internal class marker,
      // just that a function line for each method exists
      const addLine = matches.find((m) => m.startsWith("function add("));
      const verLine = matches.find((m) => m.startsWith("function version("));
      expect(addLine).toBeTruthy();
      expect(verLine).toBeTruthy();
      expect(addLine).toContain("int $a, int $b): int");
      expect(verLine).toContain("): string");
    });

    it("should handle comments", () => {
      const code = `<?php
// single line
/* block
comment */
function hello(/*inline*/ string $name): void {
  // noop
}
`;
      const matches = parser.extractFunctionMatches(code);
      expect(matches).toContain("function hello(string $name): void");
    });
  });

  describe("parseFunctionSignature", () => {
    it("should parse global function signature", () => {
      const decl = "function add(int $a, int $b): int";
      const sig = parser.parseFunctionSignature(decl);
      expect(sig).toEqual({
        name: "add",
        parameters: [
          { name: "a", type: "int" },
          { name: "b", type: "int" },
        ],
        returnType: "int",
      });
    });

    it("should parse function without return type", () => {
      const decl = "function greet(string $name)";
      const sig = parser.parseFunctionSignature(decl);
      expect(sig).toEqual({
        name: "greet",
        parameters: [{ name: "name", type: "string" }],
      });
    });

    it("should parse class method signature and attach className", () => {
      // Simulate synthesized method line coming from extractFunctionMatches
      const decl =
        "function add(int $a, int $b): int /*__CLASS:Calculator__*/";
      const sig = parser.parseFunctionSignature(decl);
      expect(sig).toEqual({
        name: "add",
        parameters: [
          { name: "a", type: "int" },
          { name: "b", type: "int" },
        ],
        returnType: "int",
        className: "Calculator",
      });
    });

    it("should parse union, nullable, by-ref and variadic typed params", () => {
      // union type
      let decl = "function f1(int|string $v)";
      let sig = parser.parseFunctionSignature(decl)!;
      expect(sig.parameters).toEqual([{ name: "v", type: "int|string" }]);

      // nullable
      decl = "function f2(?User $user)";
      sig = parser.parseFunctionSignature(decl)!;
      expect(sig.parameters).toEqual([{ name: "user", type: "?User" }]);

      // by-reference (ampersand removed from type)
      decl = "function f3(string &$output): void";
      sig = parser.parseFunctionSignature(decl)!;
      expect(sig.parameters).toEqual([{ name: "output", type: "string" }]);
      expect(sig.returnType).toBe("void");

      // variadic with type
      decl = "function sum(int ...$nums): int";
      sig = parser.parseFunctionSignature(decl)!;
      expect(sig.parameters).toEqual([{ name: "nums", type: "...int" }]);
      expect(sig.returnType).toBe("int");

      // variadic without type
      decl = "function joinAll(...$parts): string";
      sig = parser.parseFunctionSignature(decl)!;
      expect(sig.parameters).toEqual([{ name: "parts", type: "..." }]);
      expect(sig.returnType).toBe("string");
    });

    it("should parse class declaration entry", () => {
      const decl = "class Service";
      const sig = parser.parseFunctionSignature(decl);
      expect(sig).toEqual({
        name: "Service",
        parameters: [],
      });
    });
  });

  describe("parseParameters", () => {
    it("should parse basic typed parameters", () => {
      const params = (parser as any).parseParameters("int $a, string $name");
      expect(params).toEqual([
        { name: "a", type: "int" },
        { name: "name", type: "string" },
      ]);
    });

    it("should parse complex parameters", () => {
      const params = (parser as any).parseParameters(
        "?User $user = null, int|string $value, string &$out, int ...$nums"
      );
      expect(params).toEqual([
        { name: "user", type: "?User" },
        { name: "value", type: "int|string" },
        { name: "out", type: "string" },
        { name: "nums", type: "...int" },
      ]);
    });

    it("should parse untyped and variadic without type", () => {
      const params = (parser as any).parseParameters("$x, ...$rest");
      expect(params).toEqual([
        { name: "x" },
        { name: "rest", type: "..." },
      ]);
    });
  });
});