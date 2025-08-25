import { TypeScriptParser } from '../core/processors/tsParser';
import { describe, it, expect, beforeEach } from 'bun:test';

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('extractFunctions', () => {
    it('should extract regular function declarations', () => {
      const code = `
        function sum(a: number, b: number): number {
          return a + b;
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('sum');
      expect(functions[0].parameters).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' }
      ]);
      expect(functions[0].returnType).toBe('number');
    });

    it('should extract async function declarations', () => {
      const code = `
        async function fetchData(url: string): Promise<any> {
          return fetch(url).then(res => res.json());
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('fetchData');
      expect(functions[0].parameters).toEqual([{ name: 'url', type: 'string' }]);
      expect(functions[0].returnType).toBe('Promise<any>');
      expect(functions[0].isAsync).toBe(true);
    });

    it('should extract arrow functions', () => {
      const code = `
        const multiply = (a: number, b: number): number => a * b;
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('multiply');
      expect(functions[0].parameters).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' }
      ]);
      expect(functions[0].returnType).toBe('number');
    });

    it('should extract exported arrow functions', () => {
      const code = `
        export const divide = (a: number, b: number): number => a / b;
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('divide');
      expect(functions[0].parameters).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' }
      ]);
      expect(functions[0].returnType).toBe('number');
    });

    it('should extract class methods', () => {
      const code = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
          
          async compute(operation: string, values: number[]): Promise<number> {
            return Promise.resolve(0);
          }
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(2);
      
      expect(functions[0].name).toBe('add');
      expect(functions[0].parameters).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'number' }
      ]);
      expect(functions[0].returnType).toBe('number');
      expect(functions[0].className).toBe('Calculator');
      
      expect(functions[1].name).toBe('compute');
      expect(functions[1].parameters).toEqual([
        { name: 'operation', type: 'string' },
        { name: 'values', type: 'number[]' }
      ]);
      expect(functions[1].returnType).toBe('Promise<number>');
      expect(functions[1].className).toBe('Calculator');
      expect(functions[1].isAsync).toBe(true);
    });

    it('should extract constructor', () => {
      const code = `
        class Person {
          constructor(name: string, age: number) {
            this.name = name;
            this.age = age;
          }
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('constructor');
      expect(functions[0].parameters).toEqual([
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' }
      ]);
      expect(functions[0].className).toBe('Person');
    });

    it('should extract functions with generic types', () => {
      const code = `
        function identity<T>(value: T): T {
          return value;
        }
        
        class Container<T> {
          map<U>(fn: (value: T) => U): U {
            return fn(this.value);
          }
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(2);
      
      expect(functions[0].name).toBe('identity<T>');
      expect(functions[0].parameters).toEqual([{ name: 'value', type: 'T' }]);
      expect(functions[0].returnType).toBe('T');
      
      expect(functions[1].name).toBe('map<U>');
      expect(functions[1].parameters).toEqual([{ name: 'fn', type: '(value: T) => U' }]);
      expect(functions[1].returnType).toBe('U');
      expect(functions[1].className).toBe('Container');
    });

    it('should extract functions with default parameters', () => {
      const code = `
        function greet(name: string, greeting: string = "Hello"): string {
          return \`\${greeting}, \${name}!\`;
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe('greet');
      expect(functions[0].parameters).toEqual([
        { name: 'name', type: 'string' },
        { name: 'greeting', type: 'string' }
      ]);
      expect(functions[0].returnType).toBe('string');
    });

    it('should extract multiple functions', () => {
      const code = `
        function add(a: number, b: number): number { return a + b; }
        const subtract = (a: number, b: number): number => a - b;
        class Math {
          multiply(a: number, b: number): number { return a * b; }
        }
      `;
      
      const functions = parser.extractFunctions(code);
      expect(functions.length).toBe(3);
      
      expect(functions[0].name).toBe('add');
      expect(functions[1].name).toBe('subtract');
      expect(functions[2].name).toBe('multiply');
      expect(functions[2].className).toBe('Math');
    });
  });

  describe('parseParameters', () => {
    it('should parse parameters with types', () => {
      const params = (parser as any).parseParameters('a: number, b: string');
      expect(params).toEqual([
        { name: 'a', type: 'number' },
        { name: 'b', type: 'string' }
      ]);
    });

    it('should parse parameters with complex types', () => {
      const params = (parser as any).parseParameters('arr: Array<number>, map: Record<string, boolean>');
      expect(params).toEqual([
        { name: 'arr', type: 'Array<number>' },
        { name: 'map', type: 'Record<string, boolean>' }
      ]);
    });

    it('should parse function type parameters', () => {
      const params = (parser as any).parseParameters('callback: (err: Error, data: string) => void');
      expect(params).toEqual([
        { name: 'callback', type: '(err: Error, data: string) => void' }
      ]);
    });
  });
});
