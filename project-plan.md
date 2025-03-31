### Implementation Plan for Code Snapshot CLI

#### Project Overview

CLI tool that processes source files to generate either:

1. Full code markdown documentation
2. Function signatures only (name + typed parameters)
   Supports multiple languages, uses Bun runtime, and handles clipboard output.

Key considerations:

- Language-agnostic file processing
- Balance between parsing accuracy and implementation complexity
- Bun-specific APIs for file handling and clipboard access

Architecture: Modular parser system with plugin-style language handlers

---

#### Component Breakdown

```
src/
├── cli/                 # CLI entrypoint
│   └── index.ts         # Command definitions
├── core/                # Processing logic
│   ├── fileWalker.ts    # Directory traversal
│   ├── processors/      # Language-specific handlers
│   │   ├── tsParser.ts  # TypeScript processor
│   │   ├── pyParser.ts  # Python processor
│   │   └── ...         # Other language handlers
│   └── mdGenerator.ts   # Markdown formatting
├── types/               # Type definitions
│   └── types.ts
└── tests/               # Test suite
```

Key interfaces:

```typescript
// types.ts
interface FunctionSignature {
  name: string;
  parameters: Param[];
  returnType?: string;
}

interface Param {
  name: string;
  type?: string;
}

interface LanguageProcessor {
  extensions: string[];
  extractSignatures(code: string): FunctionSignature[];
}
```

---

#### Implementation Sequence

1. **CLI Setup** (Medium)

   - Use `bunx commander` for command parsing
   - Implement options:
     ```shell
     -i, --input [path]    # Default: process.cwd()
     -o, --output [path]   # Omit for clipboard
     -f, --functions-only  # Signature mode
     ```

2. **File Walker** (Medium)

   - Recursive directory traversal
   - Filter by common extensions (`.ts`, `.js`, `.py`, `.java`, `.go`)
   - Handle large files with Bun's file I/O

3. **Base Parser** (High)

   - Create abstract language processor
   - Implement regex-based signature extraction (initial approach)
   - Fallback to full code output when parsing fails

4. **Markdown Generator** (Low)

   - Format code blocks with language tags

   ````markdown
   ```typescript
   // ...formatted code
   ```
   ````

5. **Clipboard Integration** (Low)
   - Use `Bun.write()` for file output
   - Implement clipboard access via `bun:ffi`

---

#### TypeScript Specifications

Key configurations (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "outDir": "dist",
    "types": ["bun-types"]
  }
}
```

Critical type safety considerations:

- Validate file extensions against known processors
- Type guards for signature extraction results
- Strict null checks for file operations

---

#### Testing Strategy

1. Unit Tests (Bun test)

   - File extension detection
   - Signature extraction for sample code snippets
   - Clipboard mock integration

2. Integration Tests
   - Full pipeline execution with test fixtures
   - Cross-language validation

Critical test cases:

- Nested functions
- Type annotations in different languages
- Edge cases: anonymous functions, async methods

---

#### CI/CD Integration

`.github/workflows/test.yml`:

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: oven-sh/setup-bun@v1
      - run: bun test
```

Deployment:

- Bundle as standalone executable via `bun build`

---

#### Reference Documentation

1. Essential Bun APIs:

   - [File System](https://bun.sh/docs/api/file-io)
   - [FFI for clipboard](https://bun.sh/docs/api/ffi)

2. Recommended packages (if regex approach insufficient):
   - TypeScript: `@babel/parser`
   - Python: `@node-python-parser/node-python-parser`
   - Java: `java-parser`

---

#### Challenges & Alternatives

Key challenges:

1. Regex limitations for complex syntax
2. Language-specific edge cases
3. Performance with large codebases

Recommendations:

1. Start with regex MVP for JS/TS/Python
2. Consider AST-based parsing for critical languages
3. Add parallel processing for large directories
