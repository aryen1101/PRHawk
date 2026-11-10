/** Files that are generated, vendored, or lock files and not worth reviewing. */
const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
  "go.sum",
]);

const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build", "vendor"]);

const IGNORED_SUFFIXES = [".lock", ".min.js", ".min.css", ".map", ".snap"];

export function isIgnoredFile(path: string): boolean {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (IGNORED_FILE_NAMES.has(name)) return true;
  if (segments.slice(0, -1).some((segment) => IGNORED_DIRECTORIES.has(segment))) return true;
  const lower = name.toLowerCase();
  return IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}
