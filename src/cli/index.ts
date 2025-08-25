#!/usr/bin/env bun
import { Command } from "commander";
import { walkSourceFiles, readSourceFile } from "../core/fileWalker";
import { MarkdownGenerator } from "../core/mdGenerator";
import type { FunctionSignature } from "../types/types";
import clipboardy from "clipboardy";
import { stat } from "node:fs/promises";
import { TypeScriptParser } from "../core/processors/tsParser";
import { GoParser } from "../core/processors/goParser";
import { JavaParser } from "../core/processors/javaParser";
import { RustParser } from "../core/processors/rustParser";
import { PythonParser } from "../core/processors/pyParser";
import { PhpParser } from "../core/processors/phpParser";

const VERSION = "0.1.0";

const program = new Command();

MarkdownGenerator.registerParser(new TypeScriptParser());
MarkdownGenerator.registerParser(new GoParser());
MarkdownGenerator.registerParser(new JavaParser());
MarkdownGenerator.registerParser(new RustParser());
MarkdownGenerator.registerParser(new PythonParser());
MarkdownGenerator.registerParser(new PhpParser());

program
  .name("context-it")
  .description(
    "CLI tool for generating code documentation and function signatures"
  )
  .version(VERSION);

program
  .argument("[paths...]", "Source file or directory paths")
  .option(
    "-i, --input <paths>",
    "Comma-separated source file or directory paths (deprecated, use positional arguments)"
  )
  .option("-v, --verbose", "Enable verbose output", false)
  .option("-o, --output <path>", "Output file path (omit for clipboard)")
  .option("-f, --functions-only", "Extract function signatures only", false)
  .action(async (paths, options) => {
    const start = performance.now();
    const { input, output, functionsOnly, verbose } = options;

    // Simple ANSI color helpers (no external deps)
    const c = {
      dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
      gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
      green: (s: string) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
      red: (s: string) => `\x1b[31m${s}\x1b[0m`,
      cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
      bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
      magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
    };

    const sym = {
      ok: c.green("✔"),
      warn: c.yellow("⚠"),
      fail: c.red("✖"),
      info: c.cyan("ℹ"),
      dot: c.gray("•"),
      spark: c.magenta("❯"),
    };

    console.log(
      `${sym.spark} ${c.bold("context-it")} ${c.dim(
        `(v${VERSION})`
      )} – generating ${functionsOnly ? "function signatures" : "code context"}`
    );

    const fileResults: Array<{
      path: string;
      signatures: FunctionSignature[];
      code?: string;
    }> = [];

    let totalFilesScanned = 0;
    let totalWithSignatures = 0;
    let totalSignatures = 0;

    try {
      // Resolve input targets
      let pathsToProcess: string[];
      if (paths && paths.length > 0) {
        pathsToProcess = paths;
      } else if (input) {
        pathsToProcess = input
          .split(",")
          .map((p: string) => p.trim())
          .filter((p: string) => p.length > 0);
      } else {
        pathsToProcess = [process.cwd()];
      }

      console.log(
        `${sym.info} Targets: ${pathsToProcess
          .map((p) => c.bold(p))
          .join(c.gray(", "))}`
      );

      for (const basePath of pathsToProcess) {
        let fileStat;
        try {
          fileStat = await stat(basePath);
        } catch {
          console.log(`${sym.warn} Skipping ${basePath} (not found)`);
          continue;
        }

        if (fileStat.isFile()) {
          totalFilesScanned++;
          const parser = MarkdownGenerator.getParserForFile(basePath);
          const code = await readSourceFile(basePath);
            const signatures = parser ? parser.extractSignatures(code) : [];
          if (signatures.length > 0) {
            totalWithSignatures++;
            totalSignatures += signatures.length;
          }

          fileResults.push({
            path: basePath,
            signatures,
            ...(functionsOnly ? {} : { code }),
          });

          console.log(
            `${signatures.length > 0 ? sym.ok : sym.dot} ${basePath} ${c.dim(
              `[${signatures.length} sig${
                signatures.length === 1 ? "" : "s"
              }]${parser ? "" : " (no parser)"}`
            )}`
          );
        } else if (fileStat.isDirectory()) {
          for await (const filePath of walkSourceFiles(basePath)) {
            totalFilesScanned++;
            const parser = MarkdownGenerator.getParserForFile(filePath);
            const code = await readSourceFile(filePath);
            const signatures = parser ? parser.extractSignatures(code) : [];
            if (signatures.length > 0) {
              totalWithSignatures++;
              totalSignatures += signatures.length;
            }

            fileResults.push({
              path: filePath,
              signatures,
              ...(functionsOnly ? {} : { code }),
            });

            if (verbose) {
              console.log(
                `${signatures.length > 0 ? sym.ok : sym.dot} ${filePath} ${c.dim(
                  `[${signatures.length} sig${
                    signatures.length === 1 ? "" : "s"
                  }]`
                )}`
              );
            }
          }
        } else {
          console.log(`${sym.warn} Skipping ${basePath} (not a file/dir)`);
        }
      }

      if (totalFilesScanned === 0) {
        console.log(`${sym.warn} No files processed. Exiting.`);
        return;
      }

      // Generate markdown
      const markdown = MarkdownGenerator.generateDocument(fileResults);

      // Output
      if (output) {
        await Bun.write(output, markdown);
        console.log(
          `${sym.ok} Wrote ${c.bold("documentation")} → ${c.cyan(output)}`
        );
      } else {
        await clipboardy.write(markdown);
        console.log(`${sym.ok} Copied documentation to clipboard`);
      }

      const ms = performance.now() - start;
      const summaryLines = [
        `${sym.info} Summary`,
        `  ${sym.dot} Files scanned:        ${c.bold(totalFilesScanned.toString())}`,
        `  ${sym.dot} Files w/ signatures:  ${c.bold(
          totalWithSignatures.toString()
        )}`,
        `  ${sym.dot} Total signatures:     ${c.bold(totalSignatures.toString())}`,
        `  ${sym.dot} Mode:                 ${functionsOnly ? "signatures-only" : "full"}`,
        `  ${sym.dot} Output:               ${
          output ? c.cyan(output) : "clipboard"
        }`,
        `  ${sym.dot} Elapsed:              ${c.bold(ms.toFixed(0) + "ms")}`,
      ];

      console.log(summaryLines.join("\n"));

      if (verbose) {
        console.log(`\n${sym.info} ${c.bold("Markdown Preview")}:\n`);
        await Bun.write(Bun.stdout, markdown);
      } else {
        console.log(
          `${sym.info} Run again with ${c.bold(
            "-v"
          )} to print the generated markdown`
        );
      }
    } catch (error) {
      console.error(
        `${sym.fail} Error:`,
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program.parse();
