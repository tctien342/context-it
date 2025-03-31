export interface FunctionSignature {
  name: string;
  parameters: Param[];
  returnType?: string;
}

export interface Param {
  name: string;
  type?: string;
}

export interface LanguageProcessor {
  extensions: string[];
  extractSignatures(code: string): FunctionSignature[];
}