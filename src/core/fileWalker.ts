/**
 * File walker utility to recursively traverse directories and find source files
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.py', '.java', '.go'];

interface WalkOptions {
  extensions?: string[];
}

export async function* walkSourceFiles(
  dir: string,
  options: WalkOptions = {}
): AsyncGenerator<string> {
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  
  try {
    const entries = await readdir(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const fileStat = await stat(fullPath);
      
      if (fileStat.isDirectory()) {
        yield* walkSourceFiles(fullPath, options);
      } else if (
        fileStat.isFile() && 
        extensions.some(ext => entry.endsWith(ext))
      ) {
        yield fullPath;
      }
    }
  } catch (error) {
    console.error(`Error walking directory ${dir}:`, error);
    throw error;
  }
}

/**
 * Read file contents using Bun's optimized file I/O
 */
export async function readSourceFile(path: string): Promise<string> {
  try {
    const file = Bun.file(path);
    return await file.text();
  } catch (error) {
    console.error(`Error reading file ${path}:`, error);
    throw error;
  }
}