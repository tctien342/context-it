import type { FunctionSignature, Param } from '../../types/types';
import { BaseParser } from './baseParser';
import ts from 'typescript';

export class TypeScriptParser extends BaseParser {
  extensions = ['.ts', '.tsx', '.js', '.jsx'];
  
  protected extractFunctionMatches(code: string): string[] {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const matches: string[] = [];
    this.findFunctionNodes(sourceFile, matches);
    
    // Remove duplicates while preserving order
    return [...new Set(matches)];
  }

  private findFunctionNodes(node: ts.Node, matches: string[]): void {
    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const exportMod = node.modifiers?.find(m => m.kind === ts.SyntaxKind.ExportKeyword);
      const prefix = exportMod ? 'export class' : 'class';
      const typeParams = node.typeParameters?.length
        ? `<${node.typeParameters.map(tp => this.getTypeParamString(tp)).join(', ')}>`
        : '';
      matches.push(`${prefix} ${node.name.text}${typeParams}`);

      // Process class members
      node.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          const sig = this.createMethodSignature(member as ts.MethodDeclaration & { name: ts.Identifier }, '');
          if (sig) matches.push(`  ${sig}`);
        } else if (ts.isConstructorDeclaration(member)) {
          const params = this.getParamsString(member.parameters);
          matches.push(`  constructor(${params})`);
        }
      });
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const exportMod = node.modifiers?.find(m => m.kind === ts.SyntaxKind.ExportKeyword);
      const prefix = exportMod ? 'export function' : 'function';
      const sig = this.createFunctionSignature(node as ts.FunctionDeclaration & { name: ts.Identifier }, prefix);
      if (sig) matches.push(sig);
    }

    // Arrow functions in variable declarations
    if (ts.isVariableStatement(node)) {
      const isExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      node.declarationList.declarations.forEach(decl => {
        if (ts.isVariableDeclaration(decl) &&
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            ts.isArrowFunction(decl.initializer)) {
          const prefix = isExport ? 'export const' : 'const';
          const sig = this.getArrowFunctionSignature(decl.name.text, decl.initializer, prefix);
          if (sig) matches.push(sig);
        }
      });
    }

    // Standalone class methods
    if (ts.isMethodDeclaration(node) && !ts.isConstructorDeclaration(node) && ts.isIdentifier(node.name)) {
      const prefix = node.modifiers?.map(m => m.getText()).join(' ') || '';
      const sig = this.createMethodSignature(node as ts.MethodDeclaration & { name: ts.Identifier }, prefix);
      if (sig) matches.push(sig);
    }

    ts.forEachChild(node, child => this.findFunctionNodes(child, matches));
  }

  private createFunctionSignature(node: ts.FunctionDeclaration, prefix: string): string {
    if (!node.name || !ts.isIdentifier(node.name)) return '';
    const typeParams = node.typeParameters?.length
      ? `<${node.typeParameters.map(tp => this.getTypeParamString(tp)).join(', ')}>`
      : '';
    const params = this.getParamsString(node.parameters);
    const returnType = node.type ? `: ${this.getTypeString(node.type)}` : '';
    const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
    const asyncPrefix = isAsync ? 'async ' : '';
    return `${prefix} ${asyncPrefix}${node.name.text}${typeParams}(${params})${returnType}`;
  }

  private createMethodSignature(node: ts.MethodDeclaration, prefix: string): string {
    if (!node.name || !ts.isIdentifier(node.name)) return '';
    const typeParams = node.typeParameters?.length
      ? `<${node.typeParameters.map(tp => this.getTypeParamString(tp)).join(', ')}>`
      : '';
    const params = this.getParamsString(node.parameters);
    const returnType = node.type ? `: ${this.getTypeString(node.type)}` : '';
    const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
    const asyncPrefix = isAsync ? 'async ' : '';
    return `${prefix} ${asyncPrefix}${node.name.text}${typeParams}(${params})${returnType}`;
  }

  private getArrowFunctionSignature(
    name: string,
    node: ts.ArrowFunction,
    prefix: string
  ): string {
    const params = this.getParamsString(node.parameters);
    const returnType = node.type ? `: ${this.getTypeString(node.type)}` : '';
    return `${prefix} ${name} = (${params})${returnType}`;
  }

  private getTypeParamString(param: ts.TypeParameterDeclaration): string {
    const name = param.name.getText();
    const constraint = param.constraint ? ` extends ${this.getTypeString(param.constraint)}` : '';
    const defaultType = param.default ? ` = ${this.getTypeString(param.default)}` : '';
    return `${name}${constraint}${defaultType}`;
  }

  private getParamsString(params: ts.NodeArray<ts.ParameterDeclaration>): string {
    return params
      .map(param => {
        if (!ts.isIdentifier(param.name)) return '';
        
        const name = param.name.text;
        const type = param.type ? `: ${this.getTypeString(param.type)}` : '';
        const defaultValue = param.initializer ? ` = ${param.initializer.getText()}` : '';
        
        return `${name}${type}${defaultValue}`;
      })
      .filter(Boolean)
      .join(', ');
  }

  private getTypeString(type: ts.TypeNode): string {
    if (ts.isUnionTypeNode(type)) {
      return type.types.map(t => this.getTypeString(t)).join(' | ');
    }

    if (ts.isTypeReferenceNode(type)) {
      const typeName = type.typeName.getText();
      if (!type.typeArguments?.length) return typeName;
      const args = type.typeArguments.map(t => this.getTypeString(t)).join(', ');
      return `${typeName}<${args}>`;
    }

    if (ts.isArrayTypeNode(type)) {
      return `${this.getTypeString(type.elementType)}[]`;
    }

    if (ts.isFunctionTypeNode(type)) {
      const params = type.parameters
        .map(p => ts.isIdentifier(p.name) ? 
          `${p.name.text}${p.type ? `: ${this.getTypeString(p.type)}` : ''}` : '')
        .filter(Boolean)
        .join(', ');
      const returnType = type.type ? this.getTypeString(type.type) : 'void';
      return `(${params}) => ${returnType}`;
    }

    if (ts.isLiteralTypeNode(type)) {
      return type.literal.getText();
    }

    return type.getText();
  }

  protected parseFunctionSignature(fnDeclaration: string): FunctionSignature | null {
    try {
      const functionMatch = fnDeclaration.match(
        /(?:export\s+)?(?:public\s+|private\s+|protected\s+|async\s+)*(?:function\s+|const\s+)?(\w+)(?:<([^>]*)>)?\s*\((.*?)\)(?:\s*:\s*([^{=\n]+))?/
      );

      if (!functionMatch) {
        const arrowMatch = fnDeclaration.match(
          /(?:export\s+)?const\s+(\w+)\s*=\s*\((.*?)\)(?:\s*:\s*([^{=\n]+))?\s*=>/
        );
        if (!arrowMatch) return null;

        const [, name, params = '', returnType] = arrowMatch;
        return {
          name,
          parameters: this.parseParameters(params),
          ...(returnType && { returnType: returnType.trim() })
        };
      }

      const [, name, generics, params = '', returnType] = functionMatch;
      const fullName = generics ? `${name}<${generics}>` : name;
      const isAsync = fnDeclaration.includes('async');

      return {
        name: fullName,
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
        if (param.includes('=>')) {
          const [paramName, funcType] = param.split(':').map(s => s.trim());
          return {
            name: paramName,
            type: funcType
          };
        }

        const [nameAndDefault, type] = param.split(':').map(s => s.trim());
        return {
          name: nameAndDefault.split('=')[0].trim(),
          ...(type && { type: type.trim() })
        };
      });
  }

  protected extractReturnType(fnDeclaration: string): string | undefined {
    const match = fnDeclaration.match(/\)(?:\s*:\s*([^{=\n]+))?/);
    return match?.[1]?.trim();
  }
}