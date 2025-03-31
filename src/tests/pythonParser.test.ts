import { PythonParser } from '../core/processors/pyParser';
import { describe, it, expect } from 'bun:test';

describe('PythonParser', () => {
  const parser = new PythonParser();

  it('should parse simple function', () => {
    const code = `
def add(a: int, b: int) -> int:
    return a + b
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['def add(a: int, b: int) -> int']);
  });

  it('should parse async function', () => {
    const code = `
async def fetch_data(url: str) -> dict:
    return await get(url)
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['async def fetch_data(url: str) -> dict']);
  });

  it('should parse class with methods', () => {
    const code = `
class Calculator:
    def __init__(self):
        pass
        
    def add(self, a: int, b: int) -> int:
        return a + b
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual([
      'class Calculator',
      'def __init__(self)',
      'def add(self, a: int, b: int) -> int'
    ]);
  });

  it('should parse function without return type', () => {
    const code = `
def greet(name):
    print(f"Hello {name}")
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['def greet(name)']);
  });

  it('should parse function with complex parameters', () => {
    const code = `
def process(data: list[dict], callback: Callable[[int], str]) -> None:
    pass
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual([
      'def process(data: list[dict], callback: Callable[[int], str]) -> None'
    ]);
  });

  it('should parse function signatures correctly', () => {
    const code = `def add(a: int, b: int) -> int`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'add',
      parameters: [
        { name: 'a', type: 'int' },
        { name: 'b', type: 'int' }
      ],
      returnType: 'int'
    });
  });

  it('should parse async method signatures', () => {
    const code = `async def fetch(url: str) -> dict`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'fetch',
      parameters: [{ name: 'url', type: 'str' }],
      returnType: 'dict',
      isAsync: true
    });
  });

  it('should parse parameters without type hints', () => {
    const code = `def process(data, callback)`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'process',
      parameters: [
        { name: 'data' },
        { name: 'callback' }
      ]
    });
  });

  it('should extract return type', () => {
    const code = `def process() -> list[dict]`;
    const returnType = parser.extractReturnType(code);
    expect(returnType).toBe('list[dict]');
  });

  it('should handle missing return type', () => {
    const code = `def process()`;
    const returnType = parser.extractReturnType(code);
    expect(returnType).toBeUndefined();
  });
});