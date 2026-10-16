import type { languages } from 'monaco-editor/editor/editor.api.js'

/**
 * JSON / JSONC highlighting as a small Monarch grammar. Monaco's own JSON support ships inside its language service,
 * which needs a web worker (blocked by the production CSP), so only the tokeniser is reproduced here. Token names follow
 * Monaco's JSON tokeniser (`string.key`, `string.value`, `number`, `keyword`, `delimiter`, `comment`) so
 * the theme rules apply unchanged. Strings cannot span lines in JSON, so a key is recognised by a `:` on the same line.
 */
export const JSON_MONARCH: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.json',
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'string.key'],
      [/"(?:[^"\\]|\\.)*"/, 'string.value'],
      [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/[{}[\],:]/, 'delimiter'],
      [/\s+/, '']
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment']
    ]
  }
}

export const JSON_CONFIGURATION: languages.LanguageConfiguration = {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [['{', '}'], ['[', ']']]
}
