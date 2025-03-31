#!/usr/bin/env bun
import { Command } from 'commander';
import { walkSourceFiles, readSourceFile } from '../core/fileWalker';
import { MarkdownGenerator } from '../core/mdGenerator';
import type { FunctionSignature } from '../types/types';
import clipboardy from 'clipboardy'

const VERSION = '0.1.0';

const program = new Command();

program
  .name('context-it')
  .description('CLI tool for generating code documentation and function signatures')
  .version(VERSION);

program
  .option('-i, --input <path>', 'Source directory path', process.cwd())
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-o, --output <path>', 'Output file path (omit for clipboard)')
  .option('-f, --functions-only', 'Extract function signatures only', false)
  .action(async (options) => {
    try {
      const { input, output, functionsOnly, verbose } = options;

      console.log('Processing files...');

      const fileResults: Array<{
        path: string;
        signatures: FunctionSignature[];
        code?: string;
      }> = [];

      // Process all source files
      for await (const filePath of walkSourceFiles(input)) {
        const parser = MarkdownGenerator.getParserForFile(filePath);

        if (parser) {
          const code = await readSourceFile(filePath);
          const signatures = parser.extractSignatures(code);

          if (signatures.length > 0) {
            fileResults.push({
              path: filePath,
              signatures,
              ...(functionsOnly ? {} : { code })
            });
          }
        }
      }

      // Generate markdown
      const markdown = MarkdownGenerator.generateDocument(fileResults);

      // Output results
      if (output) {
        await Bun.write(output, markdown);
        console.log(`Documentation written to ${output}`);
        return
      }
      await clipboardy.write(markdown).then(() => {
        console.log('Documentation copied to clipboard');
      }).catch((err) => {
        console.error('Error copying to clipboard:', err);
      })

      if (verbose) {
        console.log('Verbose output:');
        const success = await Bun.write(Bun.stdout, markdown);
        if (!success) {
          throw new Error('Failed to write to stdout');
        }
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();