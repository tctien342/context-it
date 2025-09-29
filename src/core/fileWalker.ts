/**
 * File walker utility to recursively traverse directories and find source files
 */
import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import fs from "fs";
import { spawnSync } from "node:child_process";
import { sym } from "../constants/log";

const DEFAULT_EXTENSIONS = [
  ".json",
  ".yaml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".php",
  ".rust",
];

interface WalkOptions {
  extensions?: string[];
  ignoreGit?: boolean;
  nativeGit?: boolean;
}

/**
 * Find the git repository root for a given directory (traverse upwards looking for .git)
 * Limits traversal to a maximum depth to avoid long/hanging climbs.
 */
function findGitRoot(startDir: string, maxDepth = 3): string | null {
  let cur = startDir;
  let depth = 0;
  while (true) {
    try {
      if (fs.existsSync(join(cur, ".git"))) {
        return cur;
      }
    } catch (e) {
      // ignore
    }
    const parent = dirname(cur);
    if (!parent || parent === cur) return null;
    depth++;
    if (depth >= maxDepth) return null;
    cur = parent;
  }
}

// Simple cache for git availability checks to avoid repeated spawnSync calls
const _gitAvailCache: {
  checked: boolean;
  available: boolean;
  native: boolean;
} = {
  checked: false,
  available: false,
  native: false,
};

function isGitAvailable(root: string): boolean {
  if (_gitAvailCache.checked) return _gitAvailCache.available;
  if (_gitAvailCache.native) {
    try {
      const r = spawnSync("git", ["--version"], { cwd: root });
      _gitAvailCache.checked = true;
      _gitAvailCache.available = r.status === 0;
      return _gitAvailCache.available;
    } catch {
      console.log(`${sym.warn} native git not available, use fallback`);
    }
  }
  _gitAvailCache.checked = true;
  _gitAvailCache.available = false;
  return false;
}

/**
 * Load .gitignore patterns from the repo root (if present).
 * Returns null if no .gitignore exists or on error.
 */
function loadGitignorePatterns(root: string): string[] | null {
  const gi = join(root, ".gitignore");
  try {
    if (!fs.existsSync(gi)) return null;
    const data = fs.readFileSync(gi, "utf8");
    return data
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch (e) {
    return null;
  }
}

function globToRegex(pat: string): RegExp {
  // basic conversion: '**' -> '.*' , '*' -> '[^/]*' , '?' -> '.'
  // escape regexp meta-chars first
  let s = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  s = s.replace(/\*\*/g, "::DOUBLESTAR::"); // temporary placeholder
  s = s.replace(/\*/g, "[^/]*");
  s = s.replace(/\?/g, ".");
  s = s.replace(/::DOUBLESTAR::/g, ".*");
  // match anywhere within the path segment(s)
  return new RegExp(`^${s}$`);
}

function matchesPatterns(
  fullPath: string,
  root: string,
  patterns: string[]
): boolean {
  let rel = fullPath.startsWith(root) ? fullPath.slice(root.length) : fullPath;
  if (rel.startsWith("/") || rel.startsWith("\\")) rel = rel.slice(1);
  const relPosix = rel.split(/[/\\]/).join("/");

  let matched = false;

  for (const raw of patterns) {
    let pattern = raw;
    let negate = false;

    if (pattern.startsWith("!")) {
      negate = true;
      pattern = pattern.slice(1);
    }

    const anchored = pattern.startsWith("/");
    if (anchored) pattern = pattern.slice(1);

    // Handle directory patterns
    const hasWildcards = pattern.includes("*") || pattern.includes("?");
    let effectivePattern = pattern;

    if (!hasWildcards && !pattern.includes(".")) {
      effectivePattern = pattern + "/**";
    }

    const regex = globToRegex(effectivePattern);

    if (regex.test(relPosix)) {
      matched = !negate;
    }
  }

  return matched;
}

/**
 * Check whether a path is ignored by git. Behavior:
 * - If the directory is not inside a git repo -> return false.
 * - If `git` binary is available -> use `git check-ignore`.
 * - Else if a .gitignore exists at the repo root -> fall back to basic pattern matching.
 * - Otherwise, return false.
 */
function isPathIgnoredByGit(fullPath: string): boolean {
  const root = findGitRoot(dirname(fullPath));
  if (!root) return false;

  // prefer using git if available
  if (isGitAvailable(root)) {
    try {
      const res = spawnSync("git", ["check-ignore", "-q", fullPath], {
        cwd: root,
      });
      return res.status === 0;
    } catch {}
  }

  // git not available; fallback to parsing .gitignore at repo root if present
  const patterns = loadGitignorePatterns(root);

  if (!patterns || patterns.length === 0) return false;
  try {
    return matchesPatterns(fullPath, root, patterns);
  } catch (e) {
    return false;
  }
}

export async function* walkSourceFiles(
  dir: string,
  options: WalkOptions = {}
): AsyncGenerator<string> {
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  const ignoreGit = options.ignoreGit ?? true;
  _gitAvailCache.native = options.nativeGit ?? false;

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const fileStat = await stat(fullPath);

      if (fileStat.isDirectory()) {
        if (ignoreGit && isPathIgnoredByGit(fullPath)) {
          continue;
        }
        yield* walkSourceFiles(fullPath, options);
      } else if (
        fileStat.isFile() &&
        extensions.some((ext) => entry.endsWith(ext))
      ) {
        // If this path is within a git repo, let git determine ignore status.
        // `git check-ignore -q <path>` exits 0 when ignored.
        if (ignoreGit && isPathIgnoredByGit(fullPath)) {
          continue;
        }
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
    return await fs.promises.readFile(path, "utf8");
  } catch (error) {
    console.error(`Error reading file ${path}:`, error);
    throw error;
  }
}
