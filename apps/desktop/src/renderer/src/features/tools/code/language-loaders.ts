/**
 * Lazy registration of Monaco's Monarch grammars, one dynamic import per language so each lands in its own chunk and is
 * fetched only when a file of that language is shown. Importing a definition's `register.js` registers the language id
 * and its extensions; the grammar itself (`<language>.js`) loads when Monaco first tokenises a model of that language.
 *
 * Keys are the Monaco language ids from `languages.ts` (JSON excluded: see `json-language.ts`). A language whose
 * register module is not a literal import here cannot be bundled, so every id needs its own line.
 */
export const LANGUAGE_LOADERS: Readonly<Record<string, () => Promise<unknown>>> = {
  typescript: () => import('monaco-editor/languages/definitions/typescript/register.js'),
  javascript: () => import('monaco-editor/languages/definitions/javascript/register.js'),
  css: () => import('monaco-editor/languages/definitions/css/register.js'),
  scss: () => import('monaco-editor/languages/definitions/scss/register.js'),
  less: () => import('monaco-editor/languages/definitions/less/register.js'),
  html: () => import('monaco-editor/languages/definitions/html/register.js'),
  markdown: () => import('monaco-editor/languages/definitions/markdown/register.js'),
  mdx: () => import('monaco-editor/languages/definitions/mdx/register.js'),
  yaml: () => import('monaco-editor/languages/definitions/yaml/register.js'),
  xml: () => import('monaco-editor/languages/definitions/xml/register.js'),
  ini: () => import('monaco-editor/languages/definitions/ini/register.js'),
  shell: () => import('monaco-editor/languages/definitions/shell/register.js'),
  powershell: () => import('monaco-editor/languages/definitions/powershell/register.js'),
  bat: () => import('monaco-editor/languages/definitions/bat/register.js'),
  python: () => import('monaco-editor/languages/definitions/python/register.js'),
  go: () => import('monaco-editor/languages/definitions/go/register.js'),
  rust: () => import('monaco-editor/languages/definitions/rust/register.js'),
  java: () => import('monaco-editor/languages/definitions/java/register.js'),
  kotlin: () => import('monaco-editor/languages/definitions/kotlin/register.js'),
  swift: () => import('monaco-editor/languages/definitions/swift/register.js'),
  c: () => import('monaco-editor/languages/definitions/cpp/register.js'),
  cpp: () => import('monaco-editor/languages/definitions/cpp/register.js'),
  'objective-c': () => import('monaco-editor/languages/definitions/objective-c/register.js'),
  csharp: () => import('monaco-editor/languages/definitions/csharp/register.js'),
  php: () => import('monaco-editor/languages/definitions/php/register.js'),
  ruby: () => import('monaco-editor/languages/definitions/ruby/register.js'),
  perl: () => import('monaco-editor/languages/definitions/perl/register.js'),
  lua: () => import('monaco-editor/languages/definitions/lua/register.js'),
  r: () => import('monaco-editor/languages/definitions/r/register.js'),
  scala: () => import('monaco-editor/languages/definitions/scala/register.js'),
  dart: () => import('monaco-editor/languages/definitions/dart/register.js'),
  julia: () => import('monaco-editor/languages/definitions/julia/register.js'),
  elixir: () => import('monaco-editor/languages/definitions/elixir/register.js'),
  clojure: () => import('monaco-editor/languages/definitions/clojure/register.js'),
  coffeescript: () => import('monaco-editor/languages/definitions/coffee/register.js'),
  sql: () => import('monaco-editor/languages/definitions/sql/register.js'),
  graphql: () => import('monaco-editor/languages/definitions/graphql/register.js'),
  proto: () => import('monaco-editor/languages/definitions/protobuf/register.js'),
  hcl: () => import('monaco-editor/languages/definitions/hcl/register.js'),
  dockerfile: () => import('monaco-editor/languages/definitions/dockerfile/register.js'),
  handlebars: () => import('monaco-editor/languages/definitions/handlebars/register.js'),
  pug: () => import('monaco-editor/languages/definitions/pug/register.js'),
  twig: () => import('monaco-editor/languages/definitions/twig/register.js'),
  restructuredtext: () => import('monaco-editor/languages/definitions/restructuredtext/register.js'),
  sol: () => import('monaco-editor/languages/definitions/solidity/register.js'),
  vb: () => import('monaco-editor/languages/definitions/vb/register.js'),
  tcl: () => import('monaco-editor/languages/definitions/tcl/register.js')
}
