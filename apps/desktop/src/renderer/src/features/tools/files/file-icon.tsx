// File-type icons for the tree, tabs and Quick Open (VS Code shows one per language). Outline glyphs tinted per group
// keep the low-noise look of the app; colours live in files.css per scheme.

const GROUPS: [RegExp, string][] = [
  [/\.(ts|tsx|mts|cts)$/i, 'ts'],
  [/\.(js|jsx|mjs|cjs)$/i, 'js'],
  [/\.(json|jsonc|json5)$/i, 'json'],
  [/\.(md|mdx|markdown|txt|rst)$/i, 'doc'],
  [/\.(css|scss|sass|less|styl)$/i, 'style'],
  [/\.(html?|vue|svelte|astro|xml)$/i, 'markup'],
  [/\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i, 'image'],
  [/\.(py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|zsh|bash|lua|sql)$/i, 'code'],
  [/(^|\/)(package\.json|tsconfig.*\.json|\.env.*|\.gitignore|\.npmrc|\.editorconfig|dockerfile|makefile|.*\.(ya?ml|toml|ini|lock|config\.[cm]?[jt]s))$/i, 'config']
]

export function fileGroup(name: string): string {
  // Config names are checked first: package.json is configuration rather than data.
  const config = GROUPS.at(-1)!
  if (config[0].test(name)) return config[1]
  return GROUPS.find(([pattern]) => pattern.test(name))?.[1] ?? 'plain'
}

export function FileIcon({ name, kind, expanded = false, size = 14 }: { name: string; kind: 'file' | 'directory' | 'symlink' | 'other'; expanded?: boolean; size?: number }) {
  if (kind === 'directory') {
    return <svg className="file-icon file-icon--folder" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      {expanded ? <path d="M2 4.5h4.2l1.5 1.5H13v1.5H5.2L3.4 12.5H2zM3.4 12.5h9.2l1.4-5H5.2" /> : <path d="M2 4.5h4.2l1.5 1.5H14v6.5H2z" />}
    </svg>
  }
  const group = kind === 'file' ? fileGroup(name) : 'plain'
  return <svg className={`file-icon file-icon--${group}`} data-group={group} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" />
    {group !== 'plain' && <path d="M6 9.5h4M6 11.5h3" />}
  </svg>
}
