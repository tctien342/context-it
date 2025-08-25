export interface FunctionSignature {
  name: string;
  parameters: Param[];
  returnType?: string;
  isAsync?: boolean;
  isMethod?: boolean;
  className?: string; // Add this field to track class context
}

export interface Param {
  name: string;
  type?: string;
  isMutable?: boolean;
}

export interface LanguageProcessor {
  extensions: string[];
  extractSignatures(code: string): FunctionSignature[];
}