import { GoParser } from "../core/processors/goParser";
import { describe, it, expect, beforeEach } from "bun:test";

describe("GoParser", () => {
  let parser: GoParser;

  beforeEach(() => {
    parser = new GoParser();
  });

  describe("extractSignatures", () => {
    it("should extract basic function declarations", () => {
      const code = `
        func Add(a int, b int) int {
          return a + b
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe("Add");
      expect(functions[0].parameters).toEqual([
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ]);
      expect(functions[0].returnType).toBe("int");
    });

    it("should extract functions with multiple return values", () => {
      const code = `
        func Divide(a, b float64) (float64, error) {
          if b == 0 {
            return 0, errors.New("division by zero")
          }
          return a / b, nil
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe("Divide");
      expect(functions[0].parameters).toEqual([
        { name: "a", type: "float64" },
        { name: "b", type: "float64" },
      ]);
      expect(functions[0].returnType).toBe("(float64, error)");
    });

    it("should extract methods with receivers", () => {
      const code = `
        type Calculator struct {
          value int
        }

        func (c *Calculator) Add(x int) int {
          c.value += x
          return c.value
        }

        func (c Calculator) GetValue() int {
          return c.value
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(2);

      expect(functions[0].name).toBe("Add");
      expect(functions[0].parameters).toEqual([{ name: "x", type: "int" }]);
      expect(functions[0].returnType).toBe("int");
      expect(functions[0].className).toBe("Calculator");

      expect(functions[1].name).toBe("GetValue");
      expect(functions[1].parameters).toEqual([]);
      expect(functions[1].returnType).toBe("int");
      expect(functions[1].className).toBe("Calculator");
    });

    it("should extract functions with generic types", () => {
      const code = `
        func Map[T any, U any](slice []T, fn func(T) U) []U {
          result := make([]U, len(slice))
          for i, v := range slice {
            result[i] = fn(v)
          }
          return result
        }

        func (s *Stack[T]) Push(item T) {
          s.items = append(s.items, item)
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(2);

      expect(functions[0].name).toBe("Map[T any, U any]");
      expect(functions[0].parameters).toEqual([
        { name: "slice", type: "[]T" },
        { name: "fn", type: "func(T) U" },
      ]);
      expect(functions[0].returnType).toBe("[]U");

      expect(functions[1].name).toBe("Push[T]");
      expect(functions[1].parameters).toEqual([{ name: "item", type: "T" }]);
      expect(functions[1].className).toBe("Stack");
    });

    it("should extract functions with variadic parameters", () => {
      const code = `
        func Sum(numbers ...int) int {
          total := 0
          for _, n := range numbers {
            total += n
          }
          return total
        }

        func Printf(format string, args ...interface{}) {
          fmt.Printf(format, args...)
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(2);

      expect(functions[0].name).toBe("Sum");
      expect(functions[0].parameters).toEqual([
        { name: "numbers", type: "...int" },
      ]);
      expect(functions[0].returnType).toBe("int");

      expect(functions[1].name).toBe("Printf");
      expect(functions[1].parameters).toEqual([
        { name: "format", type: "string" },
        { name: "args", type: "...interface{}" },
      ]);
    });

    it("should extract functions with complex parameter types", () => {
      const code = `
        func ProcessData(ctx context.Context, data map[string]interface{}, 
                        callback func(string) error) (*Result, error) {
          // implementation
          return nil, nil
        }

        func HandleChannel(ch chan<- string, wg *sync.WaitGroup) {
          defer wg.Done()
          ch <- "done"
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(2);

      expect(functions[0].name).toBe("ProcessData");
      expect(functions[0].parameters).toEqual([
        { name: "ctx", type: "context.Context" },
        { name: "data", type: "map[string]interface{}" },
        { name: "callback", type: "func(string) error" },
      ]);
      expect(functions[0].returnType).toBe("(*Result, error)");

      expect(functions[1].name).toBe("HandleChannel");
      expect(functions[1].parameters).toEqual([
        { name: "ch", type: "chan<- string" },
        { name: "wg", type: "*sync.WaitGroup" },
      ]);
    });

    it("should extract functions with grouped parameters", () => {
      const code = `
        func MultiParam(a, b int, c, d string) (int, string) {
          return a + b, c + d
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe("MultiParam");
      expect(functions[0].parameters).toEqual([
        { name: "a", type: "int" },
        { name: "b", type: "int" },
        { name: "c", type: "string" },
        { name: "d", type: "string" },
      ]);
      expect(functions[0].returnType).toBe("(int, string)");
    });

    it("should extract functions without return types", () => {
      const code = `
        func PrintMessage(message string) {
          fmt.Println(message)
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(1);
      expect(functions[0].name).toBe("PrintMessage");
      expect(functions[0].parameters).toEqual([
        { name: "message", type: "string" },
      ]);
      expect(functions[0].returnType).toBeUndefined();
    });

    it("should handle comments in code", () => {
      const code = `
        // This is a comment
        func Add(a int, b int) int {
          // Another comment
          return a + b
        }

        /* Multi-line comment
           describing the function */
        func Multiply(x, y int) int {
          return x * y
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(2);

      expect(functions[0].name).toBe("Add");
      expect(functions[0].parameters).toEqual([
        { name: "a", type: "int" },
        { name: "b", type: "int" },
      ]);

      expect(functions[1].name).toBe("Multiply");
      expect(functions[1].parameters).toEqual([
        { name: "x", type: "int" },
        { name: "y", type: "int" },
      ]);
    });

    it("should extract multiple functions", () => {
      const code = `
        package main

        func init() {
          // initialization
        }

        func main() {
          fmt.Println("Hello, World!")
        }

        type Service struct{}

        func (s *Service) Start() error {
          return nil
        }

        func Helper() string {
          return "helper"
        }
      `;

      const functions = parser.extractSignatures(code);
      expect(functions.length).toBe(4);

      expect(functions[0].name).toBe("init");
      expect(functions[1].name).toBe("main");
      expect(functions[2].name).toBe("Start");
      expect(functions[2].className).toBe("Service");
      expect(functions[3].name).toBe("Helper");
    });
  });

  describe("parseParameters", () => {
    it("should parse basic parameters", () => {
      const params = (parser as any).parseParameters("a int, b string");
      expect(params).toEqual([
        { name: "a", type: "int" },
        { name: "b", type: "string" },
      ]);
    });

    it("should parse parameters with grouped names", () => {
      const params = (parser as any).parseParameters(
        "a, b int, c string, d, e float64"
      );
      expect(params).toEqual([
        { name: "a", type: "int" },
        { name: "b", type: "int" },
        { name: "c", type: "string" },
        { name: "d", type: "float64" },
        { name: "e", type: "float64" },
      ]);
    });

    it("should parse variadic parameters", () => {
      const params = (parser as any).parseParameters(
        "format string, args ...interface{}"
      );
      expect(params).toEqual([
        { name: "format", type: "string" },
        { name: "args", type: "...interface{}" },
      ]);
    });

    it("should parse function type parameters", () => {
      const params = (parser as any).parseParameters(
        "callback func(string) error"
      );
      expect(params).toEqual([
        { name: "callback", type: "func(string) error" },
      ]);
    });

    it("should parse complex type parameters", () => {
      const params = (parser as any).parseParameters(
        "data map[string]interface{}, ch chan<- string"
      );
      expect(params).toEqual([
        { name: "data", type: "map[string]interface{}" },
        { name: "ch", type: "chan<- string" },
      ]);
    });

    it("should parse pointer type parameters", () => {
      const params = (parser as any).parseParameters(
        "ptr *MyStruct, slice *[]int"
      );
      expect(params).toEqual([
        { name: "ptr", type: "*MyStruct" },
        { name: "slice", type: "*[]int" },
      ]);
    });

    it("should handle empty parameters", () => {
      const params = (parser as any).parseParameters("");
      expect(params).toEqual([]);
    });
  });

  describe("extractReceiverType", () => {
    it("should extract receiver type from pointer receiver", () => {
      const receiverType = (parser as any).extractReceiverType("c *Calculator");
      expect(receiverType).toBe("Calculator");
    });

    it("should extract receiver type from value receiver", () => {
      const receiverType = (parser as any).extractReceiverType("c Calculator");
      expect(receiverType).toBe("Calculator");
    });

    it("should extract receiver type from package-qualified type", () => {
      const receiverType = (parser as any).extractReceiverType(
        "s *service.MyService"
      );
      expect(receiverType).toBe("MyService");
    });

    it("should handle empty receiver", () => {
      const receiverType = (parser as any).extractReceiverType("");
      expect(receiverType).toBeUndefined();
    });
  });

  describe("normalizeReturnType", () => {
    it("should normalize single return type", () => {
      const returnType = (parser as any).normalizeReturnType("int");
      expect(returnType).toBe("int");
    });

    it("should normalize multiple return types", () => {
      const returnType = (parser as any).normalizeReturnType("(int, error)");
      expect(returnType).toBe("(int, error)");
    });

    it("should handle empty return type", () => {
      const returnType = (parser as any).normalizeReturnType("");
      expect(returnType).toBeUndefined();
    });

    it("should handle whitespace in return type", () => {
      const returnType = (parser as any).normalizeReturnType("  string  ");
      expect(returnType).toBe("string");
    });
  });

  describe("removeComments", () => {
    it("should remove single-line comments", () => {
      const code = `
        // This is a comment
        func Test() int { return 42 }
      `;
      const cleaned = (parser as any).removeComments(code);
      expect(cleaned).not.toContain("// This is a comment");
    });

    it("should remove multi-line comments", () => {
      const code = `
        /* This is a
           multi-line comment */
        func Test() int { return 42 }
      `;
      const cleaned = (parser as any).removeComments(code);
      expect(cleaned).not.toContain("/*");
      expect(cleaned).not.toContain("*/");
    });

    it("should preserve code after removing comments", () => {
      const code = `
        // Comment
        func Test() int /* inline comment */ { return 42 }
      `;
      const cleaned = (parser as any).removeComments(code);
      expect(cleaned).toContain("func Test() int");
      expect(cleaned).toContain("{ return 42 }");
    });
  });
});
