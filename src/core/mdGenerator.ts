import type { FunctionSignature } from '../types/types';
import path from 'path';
import { TypeScriptParser } from './processors/tsParser';
import { JavaParser } from './processors/javaParser';
import { PythonParser } from './processors/pyParser';
import { RustParser } from './processors/rustParser';
import { BaseParser } from './processors/baseParser';

export class MarkdownGenerator {
  private static parsers: BaseParser[] = [
    new TypeScriptParser(),
    new JavaParser(),
    new PythonParser(),
    new RustParser(),
  ];

  private static extensionToParserMap: Map<string, BaseParser> = MarkdownGenerator.buildParserMap();

  /**
   * Build a map of file extensions to parsers for quick lookup
   */
  private static buildParserMap(): Map<string, BaseParser> {
    const map = new Map<string, BaseParser>();
    MarkdownGenerator.parsers.forEach(parser => {
      parser.extensions.forEach(ext => {
        map.set(ext, parser);
      });
    });
    return map;
  }

  /**
   * Get the appropriate parser for a given file path
   */
  static getParserForFile(filePath: string): BaseParser | undefined {
    const ext = path.extname(filePath);
    return this.extensionToParserMap.get(ext);
  }

  /**
   * Generate markdown documentation for extracted functions
   */
  static generateFunctionDoc(
    filePath: string,
    signatures: FunctionSignature[],
    fullCode?: string
  ): string {
    let markdown = `## ${filePath}\n\n`;

    if (signatures.length === 0) {
      return markdown + '_No functions found_\n\n';
    }

    // Determine the language for code blocks based on file extension
    const ext = path.extname(filePath);
    let codeLanguage = 'typescript'; // Default

    // Map file extensions to markdown code block language identifiers
    switch (ext) {
      case '.js':
      case '.jsx':
        codeLanguage = 'javascript';
        break;
      case '.ts':
      case '.tsx':
        codeLanguage = 'typescript';
        break;
      case '.py':
        codeLanguage = 'python';
        break;
      case '.java':
        codeLanguage = 'java';
        break;
      case '.rs':
        codeLanguage = 'rust';
        break;
      default:
        codeLanguage = 'typescript'; // Default fallback
    }

    // Generate function signatures section
    markdown += '### Function Signatures\n\n';
    markdown += `"""${codeLanguage}\n`;
    signatures.forEach(sig => {
      markdown += this.formatSignature(sig) + '\n';
    });
    markdown += '"""';

    // Add full code section if provided
    if (fullCode) {
      markdown += '\n\n### Full Source\n\n';
      markdown += `"""${codeLanguage}\n`;
      markdown += fullCode;
      markdown += '\n"""';
    }

    markdown += '\n---\n\n';

    return markdown;
  }

  /**
   * Format a single function signature as markdown
   */
  private static formatSignature(signature: FunctionSignature): string {
    const params = signature.parameters
      .map(p => `${p.name}${p.type ? `: ${p.type}` : ''}`)
      .join(', ');

    const returnType = signature.returnType ? `: ${signature.returnType}` : '';

    return `function ${signature.name}(${params})${returnType}`;
  }

  /**
   * Generate a complete markdown document from multiple files
   */
  static generateDocument(
    files: Array<{
      path: string;
      signatures: FunctionSignature[];
      code?: string;
    }>
  ): string {
    let markdown = '# Code Documentation\n\n';

    files.forEach(file => {
      markdown += this.generateFunctionDoc(file.path, file.signatures, file.code);
    });

    return markdown;
  }
}