// W5 Part 6 复验：minimumContrastRatio 打开后，默认背景上的 ANSI 0–15 前景是否被 xterm 重新着色。
// 用法：node W5-palette-check-r7.mjs <probe-r7.json> [--scheme light|dark]
// 对 scene（W5-theme-helpers-r4.sh 的 scene）里的 `ANSI-n`（SGR 30–37 / 90–97）与 `BOLD-n`（加粗 + 30–37，xterm 默认把粗体前景提亮为 n+8）span，
// 期望 computed color 等于 terminal-theme.ts 里该方案的调色板值，且没有内联 `color:` 样式（没有被调整）。调色板从应用源码解析。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [probeFile, ...rest] = process.argv.slice(2)
let probe = JSON.parse(readFileSync(probeFile, 'utf8'))
if (typeof probe === 'string') probe = JSON.parse(probe)
const scheme = rest.includes('--scheme') ? rest[rest.indexOf('--scheme') + 1] : probe.attrs.scheme
const src = readFileSync(fileURLToPath(new URL('../../../../apps/desktop/src/renderer/src/features/tools/terminal-theme.ts', import.meta.url)), 'utf8')
const m = new RegExp(`const ${scheme}: TerminalPalette = \\{([\\s\\S]*?)\\n\\}`).exec(src)
const palette = {}; for (const [, k, v] of m[1].matchAll(/(\w+): '(#[0-9a-fA-F]{6})'/g)) palette[k] = v.toLowerCase()
const KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']
const hex = css => { const x = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css); return x ? '#' + [x[1], x[2], x[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : null }
const checked = [], mismatches = []
for (const s of probe.spans) {
  const t = /^(ANSI|BOLD)-(\d+)$/.exec(s.text.trim())
  if (!t) continue
  const k = Number(t[2]), idx = t[1] === 'BOLD' ? k + 8 : k
  const expected = palette[KEYS[idx]], got = hex(s.color)
  const inline = /(^|;)\s*color\s*:/.test(s.style || '')
  const row = { text: s.text.trim(), expected, got, inlineColor: inline, weight: s.fontWeight }
  checked.push(row)
  if (expected !== got || inline) mismatches.push(row)
}
console.log(JSON.stringify({ scheme, checked: checked.length, mismatches: mismatches.length, details: mismatches }))
