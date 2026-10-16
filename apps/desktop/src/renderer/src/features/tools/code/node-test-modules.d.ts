// Test-only declarations. The renderer program has no Node typings (`types: []`), and Vitest does not process CSS files
// (`?raw` yields an empty string), so the token-sync test reads `styles/tokens.css` through these three Node modules.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
declare module 'node:path' {
  export function dirname(path: string): string
  export function join(...parts: string[]): string
}
declare module 'node:url' {
  export function fileURLToPath(url: string): string
}
