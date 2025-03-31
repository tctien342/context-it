import type { FunctionSignature, Param } from '../../types/types';
import { BaseParser } from './baseParser';

export class PythonParser extends BaseParser {
  extensions = ['.py'];
  
  public extractFunctionMatches(code: string): string[] {
    const matches: string[] = [];
    
    // Match all functions including async and class methods
    const functionRegex = /(?:^|\n)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:\n]+))?/g;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      const [, asyncKeyword, name, params, returnType] = match;
      const asyncPrefix = asyncKeyword ? 'async ' : '';
      const signature = `${asyncPrefix}def ${name}(${params})${returnType ? ` -> ${returnType}` : ''}`;
      matches.push(signature);
    }

    // Match class definitions
    const classRegex = /class\s+(\w+)(?:\(([^)]*)\))?/g;
    while ((match = classRegex.exec(code)) !== null) {
      const [, name, baseClasses] = match;
      const signature = `class ${name}${baseClasses ? `(${baseClasses})` : ''}`;
      matches.push(signature);
      
      // Find methods within the class
      const classBody = this.findClassBody(code, match.index);
      const methodMatches = this.extractClassMethods(classBody);
      matches.push(...methodMatches);
    }

    return matches;
  }

  private findClassBody(code: string, startIndex: number): string {
    let openBraces = 0;
    let i = startIndex;
    
    // Find the start of the class body
    while (i < code.length) {
      if (code[i] === ':') {
        i++;
        break;
      }
      i++;
    }

    // Extract the class body
    const start = i;
    while (i < code.length) {
      if (code[i] === '{') {
        openBraces++;
      } else if (code[i] === '}') {
        openBraces--;
        if (openBraces === 0) {
          break;
        }
      }
      i++;
    }

    return code.slice(start, i);
  }

  private extractClassMethods(classBody: string): string[] {
    const matches: string[] = [];
    
    // Match methods with self parameter
    const methodRegex = /(?:async\s+)?def\s+(\w+)\s*\(self(?:,\s*([^)]*))?\)(?:\s*->\s*([^:\n]+))?/g;
    let match;
    while ((match = methodRegex.exec(classBody)) !== null) {
      const [, name, params, returnType] = match;
      const signature = `def ${name}(self${params ? `, ${params}` : ''})${returnType ? ` -> ${returnType}` : ''}`;
      matches.push(signature);
    }

    return matches;
  }

  public parseFunctionSignature(fnDeclaration: string): FunctionSignature | null {
    try {
      // Match both regular functions and methods
      const functionMatch = fnDeclaration.match(
        /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:\n]+))?/
      );

      if (!functionMatch) return null;

      const [, name, params = '', returnType] = functionMatch;
      const isAsync = fnDeclaration.includes('async');

      return {
        name,
        parameters: this.parseParameters(params),
        ...(returnType && { returnType: returnType.trim() }),
        ...(isAsync && { isAsync: true })
      };
    } catch (error) {
      console.error('Error parsing function signature:', error);
      return null;
    }
  }

  protected parseParameters(paramsStr: string): Param[] {
    return paramsStr
      .split(',')
      .map(param => param.trim())
      .filter(Boolean)
      .map(param => {
        // Handle type hints
        const [name, type] = param.split(':').map(s => s.trim());
        return {
          name: name || param,
          ...(type && { type: type.trim() })
        };
      });
  }

  public extractReturnType(fnDeclaration: string): string | undefined {
    const match = fnDeclaration.match(/\)(?:\s*->\s*([^:\n]+))?/);
    return match?.[1]?.trim();
  }
}