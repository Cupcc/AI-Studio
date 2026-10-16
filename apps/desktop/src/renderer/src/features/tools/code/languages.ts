/**
 * File path -> Monaco language id. Pure data: no Monaco import, so the panels' bundle and the tests never load it.
 *
 * Only Monarch grammars (`monaco-editor/languages/definitions/*`) are used. The language-service features (TypeScript,
 * JSON, CSS, HTML workers) are deliberately not part of the bundle: the production CSP forbids workers.
 * `language-loaders.ts` holds the matching lazy imports; `languages.test.ts` checks that both sides agree.
 */
export const PLAIN_TEXT = 'plaintext'

/** Grammar written in this folder because Monaco ships JSON only together with its (worker based) language service. */
export const JSON_LANGUAGE = 'json'

/** Language id -> extensions (no dot, lower case). Exported for the consistency tests. */
export const LANGUAGE_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  typescript: ['ts', 'tsx', 'mts', 'cts'],
  javascript: ['js', 'jsx', 'mjs', 'cjs', 'es6'],
  json: ['json', 'jsonc', 'json5', 'jsonl', 'ndjson', 'code-workspace', 'webmanifest'],
  css: ['css'],
  scss: ['scss'],
  less: ['less'],
  html: ['html', 'htm', 'xhtml', 'shtml', 'vue'],
  markdown: ['md', 'markdown', 'mdown', 'mkd'],
  mdx: ['mdx'],
  yaml: ['yml', 'yaml'],
  xml: ['xml', 'svg', 'plist', 'xsd', 'xsl', 'xslt', 'csproj', 'props', 'targets', 'xaml', 'dtd'],
  ini: ['ini', 'toml', 'cfg', 'conf', 'properties', 'editorconfig', 'gitconfig'],
  shell: ['sh', 'bash', 'zsh', 'ksh'],
  powershell: ['ps1', 'psm1', 'psd1'],
  bat: ['bat', 'cmd'],
  python: ['py', 'pyi', 'pyw'],
  go: ['go'],
  rust: ['rs'],
  java: ['java'],
  kotlin: ['kt', 'kts'],
  swift: ['swift'],
  c: ['c', 'h'],
  cpp: ['cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx'],
  'objective-c': ['m'],
  csharp: ['cs', 'csx'],
  php: ['php', 'phtml'],
  ruby: ['rb', 'rake', 'gemspec'],
  perl: ['pl', 'pm'],
  lua: ['lua'],
  r: ['r'],
  scala: ['scala', 'sbt'],
  dart: ['dart'],
  julia: ['jl'],
  elixir: ['ex', 'exs'],
  clojure: ['clj', 'cljs', 'cljc', 'edn'],
  coffeescript: ['coffee'],
  sql: ['sql'],
  graphql: ['graphql', 'gql'],
  proto: ['proto'],
  hcl: ['tf', 'tfvars', 'hcl'],
  dockerfile: ['dockerfile'],
  handlebars: ['hbs', 'handlebars'],
  pug: ['pug', 'jade'],
  twig: ['twig'],
  restructuredtext: ['rst'],
  sol: ['sol'],
  vb: ['vb'],
  tcl: ['tcl']
}

/** Whole file names (lower case) that carry no usable extension. */
const FILE_NAMES: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  podfile: 'ruby',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.bash_aliases': 'shell',
  '.zshrc': 'shell',
  '.zprofile': 'shell',
  '.zshenv': 'shell',
  '.profile': 'shell',
  '.gitconfig': 'ini',
  '.editorconfig': 'ini',
  '.gitattributes': 'ini',
  '.babelrc': 'json',
  '.eslintrc': 'json',
  '.prettierrc': 'json'
}

const BY_EXTENSION = new Map<string, string>(
  Object.entries(LANGUAGE_EXTENSIONS).flatMap(([language, extensions]) => extensions.map((extension): [string, string] => [extension, language]))
)

/** Every language id this module can return except plain text (the loaders must cover exactly these). */
export const CODE_LANGUAGE_IDS: readonly string[] = [...new Set([...BY_EXTENSION.values(), ...Object.values(FILE_NAMES)])].sort()

/**
 * Language of a Project-relative or absolute path, by its last segment: whole file name first, then `Dockerfile.*`,
 * then the final extension (`a.test.ts` -> typescript). Unknown or extension-less files are plain text.
 */
export function languageIdForPath(path: string): string {
  const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase()
  if (!name) return PLAIN_TEXT
  const whole = FILE_NAMES[name]
  if (whole) return whole
  if (name.startsWith('dockerfile.')) return 'dockerfile'
  const dot = name.lastIndexOf('.')
  // A leading dot alone (`.env`, `.gitignore`) is a hidden file, not an extension.
  if (dot <= 0) return PLAIN_TEXT
  return BY_EXTENSION.get(name.slice(dot + 1)) ?? PLAIN_TEXT
}
