# context-it

> High‑signal code context & function signature extraction for multi‑language repositories (TypeScript / JavaScript, Go, Java, Python, Rust, PHP)

[![NPM Version](https://img.shields.io/npm/v/@saintno/context-it?style=flat-square)](https://www.npmjs.com/package/@saintno/context-it)
[![License](https://img.shields.io/npm/l/@saintno/context-it?style=flat-square)](https://github.com/tctien342/context-it/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-donate-yellow.svg)](https://www.buymeacoffee.com/tctien342)

---

## 📦 Installation

Global install:

```bash
npm i -g @saintno/context-it
```

Verify:

```bash
ctx --version
```

## ✨ What It Does

`context-it` walks your source tree, detects supported source files, extracts function & method signatures (optionally full source), and produces a clean, uniform Markdown dossier you can drop into an AI prompt, code review, or architecture discussion.

Core goals:

- Minimize noise, maximize semantic relevance
- Normalize cross‑language function representation
- Provide optional full file source on demand
- Be fast (Bun runtime + lightweight parsing heuristics)
- Be extensible via pluggable parsers

---

## ✅ Supported Languages

| Language | Extensions | Parser |
|----------|------------|--------|
| TypeScript / JavaScript | `.ts`, `.tsx`, `.js`, `.jsx` | [TypeScriptParser](src/core/processors/tsParser.ts:1) |
| Go | `.go` | [GoParser](src/core/processors/goParser.ts:1) |
| Java | `.java` | [JavaParser](src/core/processors/javaParser.ts:1) |
| Python | `.py` | [PythonParser](src/core/processors/pyParser.ts:1) |
| Rust | `.rs` | [RustParser](src/core/processors/rustParser.ts:1) |
| PHP | `.php` | [PhpParser](src/core/processors/phpParser.ts:1) |

---

## 🚀 Quick Start

Install dependencies:

```bash
bun install
```

Generate function signatures for current directory (copied to clipboard):

```bash
ctx
```

Generate full code + signatures for specific paths:

```bash
ctx ./src/core ./src/tests
```

Output to a file:

```bash
ctx ./src --output CODE_CONTEXT.md
```

Signatures only (no full source embedding):

```bash
ctx -f
```

Verbose mode (also prints the Markdown to stdout):

```bash
ctx -f -v ./src/core/processors
```

---

## 🧠 Output Format

A file section looks like:

````markdown
## src/core/processors/tsParser.ts
### Function Signatures
```typescript
function identity<T>(value: T): T
[Container] map<U>(fn: (value: T) => U): U
```
---
````

Class methods are prefixed with `[ClassName]`.
Return types follow a trailing colon.
Parameters show `name: type` where available.

---

## 🏗 Architecture Overview

| Layer | Responsibility | Key File |
|-------|----------------|----------|
| CLI | Argument parsing, orchestration | [src/cli/index.ts](src/cli/index.ts:1) |
| Parser abstraction | Shared interface & lifecycle | [BaseParser](src/core/processors/baseParser.ts:1) |
| Language parsers | Heuristic signature extraction | (See table above) |
| Markdown generation | Uniform document assembly | [MarkdownGenerator](src/core/mdGenerator.ts:1) |
| File traversal | Recursive, filter by extension | [fileWalker](src/core/fileWalker.ts:1) |
| Types | Shared structures | [types.ts](src/types/types.ts:1) |

Parsers register themselves via:

```typescript
MarkdownGenerator.registerParser(new TypeScriptParser())
```

(See initialization in [src/cli/index.ts](src/cli/index.ts:19))

---

## 🔍 Parsing Philosophy

Rather than full AST fidelity (expensive / brittle per language), parsers aim for 90–95% semantic accuracy optimized for:

- AI prompt priming
- Quick capability overviews
- Architectural summarization

Examples:
- [GoParser](src/core/processors/goParser.ts:1) uses a lightweight state machine to handle nested generics & multi‑return forms.
- [TypeScriptParser](src/core/processors/tsParser.ts:1) avoids `typescript` dependency, scanning top‑level depth, supporting `forwardRef`, alias exports, generics, and class methods.
- [PhpParser](src/core/processors/phpParser.ts:1) synthesizes method context and normalizes variadic / union / nullable forms.

---

## 🧪 Test Coverage

All language parsers include focused test suites under `src/tests/` verifying:

- Grouped / complex parameters
- Class / receiver / trait / interface methods
- Generics & variadic forms
- Comment stripping robustness
- Multi‑return or union types
- Edge constructs (e.g. forwardRef wrappers in TypeScript, channel directions in Go)

Run:

```bash
bun test
```

---

## 🛠 Extending with a New Language

1. Create a parser implementing `BaseParser` methods in `src/core/processors/`.
2. Implement:
   - `extensions`
   - `extractFunctionMatches(code)`
   - `parseFunctionSignature(match)`
   - `parseParameters(str)`
3. Register it in the CLI bootstrap (or provide dynamic plugin discovery).
4. Add a test file under `src/tests/`.
5. (Optional) Add language → markdown alias in [MarkdownGenerator](src/core/mdGenerator.ts:20) if new.

Template snippet:

```typescript
export class FooParser extends BaseParser {
  extensions = [".foo"];

  protected extractFunctionMatches(code: string): string[] {
    // return raw declaration fragments
    return [];
  }

  protected parseFunctionSignature(decl: string): FunctionSignature | null {
    return {
      name: "helloFoo",
      parameters: [],
      returnType: "Foo"
    };
  }

  protected parseParameters(paramsStr: string): Param[] {
    return [];
  }

  protected extractReturnType(_decl: string): string | undefined {
    return undefined;
  }
}
```

---

## 📋 CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `paths...` | One or more files / directories | `process.cwd()` |
| `-i, --input <paths>` | (Deprecated) Comma-separated paths | – |
| `-o, --output <file>` | Write Markdown to file | Clipboard |
| `-f, --functions-only` | Exclude full source blocks | `false` |
| `-v, --verbose` | Echo generated markdown | `false` |
| `-h, --help` | Show help | – |

---

## 📑 Example Signature Normalization

| Original Code | Normalized Output |
|---------------|------------------|
| `func (s *Service) Start() error` | `[Service] Start(): error` |
| `function greet(name: string = "Hi"): string` | `function greet(name: string): string` |
| `public <R> map(Function<T,R> f)` | `[Container] map<R>(f: Function<T, R>): R` |
| `fn process(data: Vec<String>) -> Result<(), Error>` | `function process(data: Vec<String>): Result<(), Error>` |

---

## 📌 Design Principles

- **Deterministic formatting** (stable diff‑ability)
- **Shallow parsing where “good enough”** beats full grammar
- **Extensibility first** via registration API
- **Clipboard‑first UX** for frictionless prompt assembly
- **Language parity** in signature style

---

## 🧩 Roadmap Ideas

- Optional inline docstring / comment summarization
- Plugin loader (e.g. `~/.context-it/parsers`)
- Graph mode: call relationships (best‑effort)
- Incremental / cached runs
- HTML export with navigation index
- Embeddings vector export (LLM retrieval)

---

## 🤝 Contributing

1. Fork & branch
2. Add / modify parser or generator
3. Include / update tests under `src/tests`
4. Run `bun test`
5. Open PR with rationale

---

## 🐛 Reporting Issues

Please include:

- Reproducer snippet
- Expected vs actual signature
- Language & version
- Parser name (e.g. `[TypeScriptParser](src/core/processors/tsParser.ts:1)`)

---

## ⚙️ Performance Notes

- Bun’s FS + fast regex scanning keeps large trees quick
- TypeScript parsing avoids AST building overhead
- Go & Rust use single‑pass scans for function tokens
- Memory profile stays proportional to concurrently processed file set

---

## 🔒 Limitations

- Does not fully parse advanced grammar edge cases (e.g. ultra‑complex nested generics with constraints intersections)
- Formatting assumes UTF‑8 & normalized line endings
- Multi‑language mixed embedded DSLs not yet parsed (e.g. SQL inside strings)
- Return type inference is not performed if omitted in original source

---

## 🧾 License

MIT (or your chosen license—add one if missing).
Add a `LICENSE` file if you intend to distribute publicly.

---

## 🙌 Acknowledgments

- Bun for speed & DX
- Radix / React patterns inspired forwardRef support
- Community language syntax references

---

## 📣 Final Tip

Run with `-f` first to scope relevance. If you need deeper inspection on a subset, re-run including full source only for those paths. This keeps prompt size lean and focus tight.

Happy context harvesting!
