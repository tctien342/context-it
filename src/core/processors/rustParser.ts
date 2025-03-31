import type { FunctionSignature, Param } from '../../types/types';
import { BaseParser } from './baseParser';

export class RustParser extends BaseParser {
  extensions = ['.rs'];
  
  public extractFunctionMatches(code: string): string[] {
    const matches: string[] = [];
    
    // Match top-level functions
    const functionRegex = /^fn\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^{=\n]+))?\s*{/gm;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      const [, name, params, returnType] = match;
      const signature = `fn ${name}(${params})${returnType ? ` -> ${returnType}` : ''}`.trim();
      matches.push(signature);
    }

    // Match impl blocks for methods
    const implRegex = /impl\s+(\w+)\s*{([^}]*)}/gm;
    while ((match = implRegex.exec(code)) !== null) {
      const [, typeName, implBody] = match;
      const methodMatches = this.extractImplMethods(implBody, typeName);
      matches.push(...methodMatches);
    }

    // Match trait definitions
    const traitRegex = /trait\s+(\w+)\s*{([^}]*)}/g;
    while ((match = traitRegex.exec(code)) !== null) {
      const [, traitName, traitBody] = match;
      const methodMatches = this.extractTraitMethods(traitBody, traitName);
      matches.push(...methodMatches);
    }

    return matches;
  }

  private extractImplMethods(implBody: string, typeName: string): string[] {
    const matches: string[] = [];
    const methodRegex = /fn\s+(\w+)\s*\((&?self,?\s*([^)]*))?\)(?:\s*->\s*([^{=\n]+))?/g;
    let match;
    while ((match = methodRegex.exec(implBody)) !== null) {
      const [, name, params = '', , returnType] = match;
      const fullParams = params.includes('self') ? params : `&self${params ? `, ${params}` : ''}`;
      const signature = `fn ${typeName}::${name}(${fullParams})${returnType ? ` -> ${returnType}` : ''}`.trim();
      matches.push(signature);
    }
    return matches;
  }

  private extractTraitMethods(traitBody: string, traitName: string): string[] {
    const matches: string[] = [];
    const methodRegex = /fn\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^{=\n;]+))?/g;
    let match;
    while ((match = methodRegex.exec(traitBody)) !== null) {
      const [, name, params = '', returnType] = match;
      const signature = `fn ${traitName}::${name}(${params})${returnType ? ` -> ${returnType}` : ''}`.trim();
      matches.push(signature);
    }
    return matches;
  }

  public parseFunctionSignature(fnDeclaration: string): FunctionSignature | null {
    try {
      // Match standalone functions and methods
      const functionMatch = fnDeclaration.match(
        /fn\s+(\w+)(?:::(\w+))?\s*\(([^)]*)\)(?:\s*->\s*([^{=\n]+))?/
      );

      if (!functionMatch) return null;

      const [, name, typeName, params = '', returnType] = functionMatch;
      const fullName = typeName ? `${name}::${typeName}` : name;
      const isMethod = params.includes('self');

      return {
        name: fullName,
        parameters: this.parseParameters(params),
        ...(returnType && { returnType: returnType.trim() }),
        ...(isMethod && { isMethod: true })
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
        // Handle self parameter specially
        if (param === '&self' || param === 'self' || param === '&mut self') {
          return { name: 'self' };
        }

        // Handle type annotations
        const [nameAndMut, type] = param.split(':').map(s => s.trim());
        const name = nameAndMut.replace(/^mut\s+/, '');
        const isMutable = nameAndMut.startsWith('mut ');

        return {
          name,
          ...(type && { type: type.trim() }),
          ...(isMutable && { isMutable: true })
        };
      });
  }

  public extractReturnType(fnDeclaration: string): string | undefined {
    const match = fnDeclaration.match(/\)(?:\s*->\s*([^{=\n]+))?/);
    return match?.[1]?.trim();
  }
}