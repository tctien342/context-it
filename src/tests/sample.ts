/**
 * Example TypeScript code for testing the parser
 */

export function add(a: number, b: number): number {
  return a + b;
}

export const multiply = (x: number, y: number): number => {
  return x * y;
};

class Calculator {
  constructor(private initial: number = 0) {}

  public async calculate(
    operation: 'add' | 'multiply',
    value: number
  ): Promise<number> {
    if (operation === 'add') {
      return this.initial + value;
    }
    return this.initial * value;
  }
}

// Should handle this type of function declaration too
function processItems<T>(items: T[], callback: (item: T) => void): void {
  items.forEach(callback);
}