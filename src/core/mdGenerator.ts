// ./src/core/mdGenerator.ts

import type { FunctionSignature } from "../types/types";
import path from "path";
import { BaseParser } from "./processors/baseParser";

// Define a type for the input data for clarity and reusability.
export type FileDocInput = {
  path: string;
  signatures: FunctionSignature[];
  code?: string;
};

/**
 * A collection of constants used for generating Markdown.
 * Centralizing these makes the format consistent and easy to change.
 *
 * Optimized to improve agent readability and reduce ambiguity.
 */
const MD = {
  // Document-level heading and guidance
  DOCUMENT_TITLE: "# Code Context",
  DOCUMENT_PREAMBLE: [
    "> This document contains extracted function signatures and source code from the provided files.",
    "> Signature format: `[optional class name] functionName(param1: type1, param2: type2, ...): returnType`",
    "> Reading guidance:",
    "> - Treat content inside code fences as the canonical source of truth.",
    "> - Function signatures list only parameter names and types (defaults/comments omitted).",
    "> - When no functions are found in a file, `_No functions found_` is shown.",
    "> - Class methods are prefixed with `[ClassName]`.",
    "> - Tell me if you need to see the full source code of any file.",
  ].join("\n"),

  // Per-file sections
  FILE_HEADER_PREFIX: "## ",
  SIGNATURES_HEADER: "### Function Signatures\n",
  FULL_SOURCE_HEADER: "### Full Source\n",
  NO_FUNCTIONS_FOUND: "_No functions found_",

  // Structural separators
  SEPARATOR: "\n---\n\n",

  // Code fences
  CODE_FENCE_START: (lang: string) => "```" + lang + "\n",
  CODE_FENCE_END: "\n```",
};

/**
 * A static utility class for generating Markdown documentation from source code.
 *
 * @description
 * This class follows a registration pattern. It does not know about specific language
 * parsers directly. Instead, parsers must be registered with it. This decouples the
 * generator from the parsers, making the system highly extensible.
 *
 * To add a new language, you simply create a new parser that implements `BaseParser`
 * and register it using `MarkdownGenerator.registerParser()`. No modifications to this
 * file are needed.
 *
 * @example
 * import { TypeScriptParser } from "./processors/tsParser";
 *
 * // Register parsers at application startup
 * MarkdownGenerator.registerParser(new TypeScriptParser());
 *
 * // Later, generate the document
 * const doc = MarkdownGenerator.generateDocument([...]);
 */
export class MarkdownGenerator {
  private static extensionToParserMap = new Map<string, BaseParser>();

  /**
   * Registers a language parser, making it available for document generation.
   * This builds a map of file extensions to their corresponding parsers.
   * @param parser - An instance of a class that extends `BaseParser`.
   */
  static registerParser(parser: BaseParser): void {
    parser.extensions.forEach((ext) => {
      if (this.extensionToParserMap.has(ext)) {
        console.warn(
          `[MarkdownGenerator] Warning: Overwriting parser for extension '${ext}'.`
        );
      }
      this.extensionToParserMap.set(ext, parser);
    });
  }

  /**
   * Clears all registered parsers. Useful for testing or dynamic reloading.
   */
  static clearParsers(): void {
    this.extensionToParserMap.clear();
  }

  /**
   * Retrieves the appropriate parser for a given file path based on its extension.
   * @param filePath - The path to the file.
   * @returns The corresponding `BaseParser` instance or `undefined` if no parser is registered for the file type.
   */
  static getParserForFile(filePath: string): BaseParser | undefined {
    const ext = path.extname(filePath);
    return this.extensionToParserMap.get(ext);
  }

  /**
   * Generates a complete markdown document from multiple file inputs.
   * @param files - An array of objects containing file path and extracted data.
   * @returns A single string containing the full Markdown document.
   */
  static generateDocument(files: FileDocInput[]): string {
    const fileDocs = files
      .map((file) =>
        this.generateFileDoc(file.path, file.signatures, file.code)
      )
      .join("");

    return [
      MD.DOCUMENT_TITLE,
      MD.DOCUMENT_PREAMBLE,
      MD.SEPARATOR.trimStart(),
      fileDocs,
    ].join("\n\n");
  }

  /**
   * Generates a Markdown section for a single file.
   * @param filePath - The path to the file, used for the section header.
   * @param signatures - An array of extracted function signatures.
   * @param fullCode - The full source code of the file (optional).
   * @returns A Markdown string for the file's documentation section.
   */
  static generateFileDoc(
    filePath: string,
    signatures: FunctionSignature[],
    fullCode?: string
  ): string {
    const parser = this.getParserForFile(filePath);
    // Default to 'plaintext' if no specific parser is found, ensuring robustness.
    const langId = parser ? parser.getMarkdownLanguageId() : "plaintext";

    const content = fullCode
      ? this._generateFullSourceBlock(fullCode, langId)
      : this._generateSignaturesBlock(signatures, langId);

    return `${MD.FILE_HEADER_PREFIX}${filePath}\n${content}${MD.SEPARATOR}`;
  }

  /**
   * Formats a single function signature object into a markdown-compatible string.
   * @private
   */
  private static _formatSignature(signature: FunctionSignature): string {
    const params = signature.parameters
      .map((p) => `${p.name}${p.type ? `: ${p.type}` : ""}`)
      .join(", ");
    const returnType = signature.returnType ? `: ${signature.returnType}` : "";
    const asyncPrefix = signature.isAsync ? "async " : "";

    return signature.className
      ? `[${signature.className}] ${asyncPrefix}${signature.name}(${params})${returnType}` // Class method
      : `${asyncPrefix}function ${signature.name}(${params})${returnType}`; // Standalone function
  }

  /**
   * Creates the Markdown block for function signatures.
   * @private
   */
  private static _generateSignaturesBlock(
    signatures: FunctionSignature[],
    langId: string
  ): string {
    if (signatures.length === 0) {
      return `${MD.NO_FUNCTIONS_FOUND}\n`;
    }

    const signatureLines = signatures.map(this._formatSignature).join("\n");
    return [
      MD.SIGNATURES_HEADER,
      MD.CODE_FENCE_START(langId),
      signatureLines,
      MD.CODE_FENCE_END,
    ].join("");
  }

  /**
   * Creates the Markdown block for the full source code.
   * @private
   */
  private static _generateFullSourceBlock(
    fullCode: string,
    langId: string
  ): string {
    return [
      MD.FULL_SOURCE_HEADER,
      MD.CODE_FENCE_START(langId),
      fullCode,
      MD.CODE_FENCE_END,
    ].join("");
  }
}
