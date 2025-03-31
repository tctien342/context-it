import { JavaParser } from '../core/processors/javaParser';
import { describe, test, expect } from 'bun:test';

describe('JavaParser', () => {
  const parser = new JavaParser();

  test('should parse basic Java class', () => {
    const code = `
      public class Example {
        public static void main(String[] args) {
          System.out.println("Hello World");
        }
        
        private int add(int a, int b) {
          return a + b;
        }
      }
    `;

    const signatures = parser.extractSignatures(code);
    expect(signatures).toHaveLength(3);
    expect(signatures).toMatchObject([
      {
        name: 'Example',
        parameters: []
      },
      {
        name: 'main',
        parameters: [
          { name: 'args', type: 'String[]' }
        ],
        returnType: 'void'
      },
      {
        name: 'add',
        parameters: [
          { name: 'a', type: 'int' },
          { name: 'b', type: 'int' }
        ],
        returnType: 'int'
      }
    ]);
  });

  test('should parse class with generics', () => {
    const code = `
      public class Container<T> {
        private T value;
        
        public Container(T initialValue) {
          this.value = initialValue;
        }
        
        public <R> R transform(Function<T, R> transformer) {
          return transformer.apply(value);
        }
      }
    `;

    const signatures = parser.extractSignatures(code);
    expect(signatures).toHaveLength(3);
    expect(signatures).toMatchObject([
      {
        name: 'Container',
        parameters: []
      },
      {
        name: 'Container',
        parameters: [
          { name: 'initialValue', type: 'T' }
        ]
      },
      {
        name: 'transform',
        parameters: [
          { name: 'transformer', type: 'Function<T, R>' }
        ],
        returnType: 'R'
      }
    ]);
  });

  test('should parse interface methods', () => {
    const code = `
      public interface UserService {
        User findById(Long id);
        List<User> findAll();
        void save(User user);
        default Optional<User> findByEmail(String email) {
          return Optional.empty();
        }
      }
    `;

    const signatures = parser.extractSignatures(code);
    expect(signatures).toHaveLength(5);
    expect(signatures).toMatchObject([
      {
        name: 'UserService',
        parameters: []
      },
      {
        name: 'findById',
        parameters: [
          { name: 'id', type: 'Long' }
        ],
        returnType: 'User'
      },
      {
        name: 'findAll',
        parameters: [],
        returnType: 'List<User>'
      },
      {
        name: 'save',
        parameters: [
          { name: 'user', type: 'User' }
        ],
        returnType: 'void'
      },
      {
        name: 'findByEmail',
        parameters: [
          { name: 'email', type: 'String' }
        ],
        returnType: 'Optional<User>'
      }
    ]);
  });
});