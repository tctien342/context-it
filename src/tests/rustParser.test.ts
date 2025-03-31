import { RustParser } from '../core/processors/rustParser';
import { describe, it, expect } from 'bun:test';

describe('RustParser', () => {
  const parser = new RustParser();

  it('should parse simple function', () => {
    const code = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['fn add(a: i32, b: i32) -> i32']);
  });

  it('should parse method with self', () => {
    const code = `
impl Calculator {
    fn add(&self, a: i32, b: i32) -> i32 {
        a + b
    }
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['fn Calculator::add(&self, a: i32, b: i32) -> i32']);
  });

  it('should parse trait method', () => {
    const code = `
trait Addable {
    fn add(&self, a: i32, b: i32) -> i32;
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['fn Addable::add(&self, a: i32, b: i32) -> i32']);
  });

  it('should parse function with complex parameters', () => {
    const code = `
fn process(data: Vec<String>, callback: impl Fn(i32) -> String) -> Result<(), Error> {
    // implementation
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual([
      'fn process(data: Vec<String>, callback: impl Fn(i32) -> String) -> Result<(), Error>'
    ]);
  });

  it('should parse mutable parameters', () => {
    const code = `
fn modify(mut data: Vec<i32>) {
    data.push(42);
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['fn modify(mut data: Vec<i32>)']);
  });

  it('should parse function without return type', () => {
    const code = `
fn print_hello() {
    println!("Hello");
}
    `;
    const matches = parser.extractFunctionMatches(code);
    expect(matches).toEqual(['fn print_hello()']);
  });

  it('should parse function signatures correctly', () => {
    const code = `fn add(a: i32, b: i32) -> i32`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'add',
      parameters: [
        { name: 'a', type: 'i32' },
        { name: 'b', type: 'i32' }
      ],
      returnType: 'i32'
    });
  });

  it('should parse method signatures', () => {
    const code = `fn Calculator::add(&self, a: i32, b: i32) -> i32`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'Calculator::add',
      parameters: [
        { name: 'self' },
        { name: 'a', type: 'i32' },
        { name: 'b', type: 'i32' }
      ],
      returnType: 'i32',
      isMethod: true
    });
  });

  it('should parse mutable parameters in signatures', () => {
    const code = `fn modify(mut data: Vec<i32>)`;
    const signature = parser.parseFunctionSignature(code);
    expect(signature).toEqual({
      name: 'modify',
      parameters: [
        { name: 'data', type: 'Vec<i32>', isMutable: true }
      ]
    });
  });

  it('should extract return type', () => {
    const code = `fn process() -> Result<(), Error>`;
    const returnType = parser.extractReturnType(code);
    expect(returnType).toBe('Result<(), Error>');
  });

  it('should handle missing return type', () => {
    const code = `fn process()`;
    const returnType = parser.extractReturnType(code);
    expect(returnType).toBeUndefined();
  });
});