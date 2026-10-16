import { describe, expect, it } from 'vitest'
import { LANGUAGE_LOADERS } from './language-loaders'
import loaderSource from './language-loaders.ts?raw'
import { CODE_LANGUAGE_IDS, JSON_LANGUAGE, LANGUAGE_EXTENSIONS, languageIdForPath, PLAIN_TEXT } from './languages'

describe('languageIdForPath', () => {
  it.each([
    ['src/app.ts', 'typescript'], ['src/App.TSX', 'typescript'], ['types.d.ts', 'typescript'], ['a.mts', 'typescript'],
    ['lib/index.js', 'javascript'], ['x.mjs', 'javascript'], ['c.jsx', 'javascript'],
    ['package.json', 'json'], ['tsconfig.jsonc', 'json'], ['.eslintrc', 'json'],
    ['styles/main.css', 'css'], ['a.scss', 'scss'], ['a.less', 'less'], ['index.html', 'html'], ['App.vue', 'html'],
    ['README.md', 'markdown'], ['page.mdx', 'mdx'], ['ci.yml', 'yaml'], ['ci.yaml', 'yaml'], ['logo.svg', 'xml'],
    ['Cargo.toml', 'ini'], ['.gitconfig', 'ini'], ['run.sh', 'shell'], ['.zshrc', 'shell'], ['go.go', 'go'], ['main.rs', 'rust'],
    ['tool.py', 'python'], ['Foo.java', 'java'], ['a.kt', 'kotlin'], ['a.swift', 'swift'], ['a.c', 'c'], ['a.h', 'c'],
    ['a.cpp', 'cpp'], ['a.hpp', 'cpp'], ['a.cs', 'csharp'], ['a.php', 'php'], ['a.rb', 'ruby'], ['Gemfile', 'ruby'],
    ['q.sql', 'sql'], ['Dockerfile', 'dockerfile'], ['Dockerfile.dev', 'dockerfile'], ['a.dockerfile', 'dockerfile'],
    ['a.proto', 'proto'], ['a.tf', 'hcl'], ['a.ps1', 'powershell'], ['a.bat', 'bat'], ['a.graphql', 'graphql']
  ])('maps %s to %s', (path, language) => { expect(languageIdForPath(path)).toBe(language) })

  it('uses the last segment and the last extension, whatever the directories and separators look like', () => {
    expect(languageIdForPath('/Users/me/my.project/src/a.test.ts')).toBe('typescript')
    expect(languageIdForPath('C:\\repo\\dir.js\\notes')).toBe(PLAIN_TEXT)
    expect(languageIdForPath('archive.tar.gz')).toBe(PLAIN_TEXT)
  })

  it('treats names without a real extension as plain text', () => {
    for (const path of ['', 'LICENSE', 'Makefile', '.gitignore', '.env', 'dir/.hidden', 'trailing.', 'noext/', 'notes.unknownext', 'image.png']) {
      expect(languageIdForPath(path), path).toBe(PLAIN_TEXT)
    }
  })

  it('is case-insensitive for extensions and whole file names', () => {
    expect(languageIdForPath('A.PY')).toBe('python')
    expect(languageIdForPath('DOCKERFILE')).toBe('dockerfile')
  })
})

describe('language tables', () => {
  it('assign every extension to exactly one language', () => {
    const seen = new Map<string, string>()
    for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
      for (const extension of extensions) {
        expect(seen.get(extension), `.${extension} is listed for ${seen.get(extension)} and ${language}`).toBeUndefined()
        expect(extension).toBe(extension.toLowerCase())
        seen.set(extension, language)
      }
    }
  })

  it('have a lazy loader for every language but JSON (own grammar), and no loader without a language', () => {
    const needed = CODE_LANGUAGE_IDS.filter((id) => id !== JSON_LANGUAGE)
    expect(Object.keys(LANGUAGE_LOADERS).sort()).toEqual([...needed].sort())
    expect(CODE_LANGUAGE_IDS).toContain(JSON_LANGUAGE)
    expect(LANGUAGE_LOADERS[PLAIN_TEXT]).toBeUndefined()
  })

  it('import one Monaco definition module per language, each literally (a bundler can only split literal specifiers)', () => {
    const specifiers = [...loaderSource.matchAll(/import\('(monaco-editor\/[^']+)'\)/g)].map((match) => match[1]!)
    expect(specifiers).toHaveLength(Object.keys(LANGUAGE_LOADERS).length)
    for (const specifier of specifiers) expect(specifier, specifier).toMatch(/^monaco-editor\/languages\/definitions\/[a-z0-9-]+\/register\.js$/)
    // Existence of each module is checked by the type checker (every `register.d.ts` exists) and by the build.
  })
})
