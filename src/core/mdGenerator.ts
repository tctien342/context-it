import type { FunctionSignature } from '../types/types';

export class MarkdownGenerator {
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

    // Generate function signatures section
    markdown += '### Function Signatures\n\n';
    markdown += '```typescript\n';
    signatures.forEach(sig => {
      markdown += this.formatSignature(sig) + '\n';
    });
    markdown += '```\n\n';

    // Add full code section if provided
    if (fullCode) {
      markdown += '\n### Full Source\n\n';
      markdown += '```typescript\n';
      markdown += fullCode;
      markdown += '\n```\n\n';
    }

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