// W5 Part 7 复验：minimumContrastRatio 4.5 → 5.5 的前后对照（同一批 fixture / 场景 / 测量工具）。
// 用法：node W5-compare-r8.mjs <r8 scratch 目录> <r7 scratch 目录> <输出 json>
//   r8 = `7eea417` / `a0e7d49` 构建（5.5）；r7 = Part 6 的 `42a2e31` 构建（4.5）。r7 的场景统计取自 W5-color-matrix-r7.json，
//   真实程序与反显取自 r7 scratch 里的测量文件，并把数值写进输出，使结果自包含。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const [d8, d7, outFile] = process.argv.slice(2)
const here = fileURLToPath(new URL('.', import.meta.url))
const J = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)
const P = f => { let p = J(f); if (typeof p === 'string') p = JSON.parse(p); return p }
const cells = ['gl-light', 'gl-light-none', 'gl-dark', 'gl-dark-none', 'so-light', 'so-dark']
const r4 = J(join(here, 'W5-theme-measurements-r4.json'))
const idx = { 'gl-light': 0, 'gl-light-none': 1, 'gl-dark': 2, 'gl-dark-none': 3, 'so-light': 4, 'so-dark': 5 }
const sum8 = (() => { execFileSync('node', [join(here, 'W5-summarize-r7.mjs'), d8, join(d8, 'matrix-summary-r8.json')]); return J(join(d8, 'matrix-summary-r8.json')) })()
const sum7 = J(join(here, 'W5-color-matrix-r7.json'))
const st = x => x && { n: x.n, min: x.min, p50: x.p50, below4_5: x.below4_5 }
const out = { generatedAt: new Date().toISOString(), note: 'ratio 4.5 (42a2e31, Part 6) vs 5.5 (7eea417 / a0e7d49, Part 7). nomPx = computed fg vs real pixel background; px = real-pixel farthest-pixel measure (thin glyphs read low); css = computed fg vs computed bg.', cells: {} }
for (const c of cells) {
  const o = { scenes: {}, real: {}, reverse: {}, palette: sum8.cells[c].regression.paletteCheck && { checked: sum8.cells[c].regression.paletteCheck.checked, mismatches: sum8.cells[c].regression.paletteCheck.mismatches } }
  for (const s of ['s1', 's2', 's3a', 's3b', 's4', 's5']) {
    const a = sum7.cells[c].scenes[s], b = sum8.cells[c].scenes[s]
    const kind = ['s3a', 's4', 's5'].includes(s) ? 'defaultBg' : 'explicitBg'
    const pick = (x, k) => (x ? (kind === 'defaultBg' ? (k === 'nom' ? st(x.defaultBgColoured && x.defaultBgColoured.nominalVsPixelBg) : st(x.defaultBgColoured && x.defaultBgColoured.measured)) : (k === 'nom' ? st(x.explicitBg && x.explicitBg.nominalCss) : st(x.explicitBg && x.explicitBg.measured))) : null)
    o.scenes[s] = { basis: kind === 'defaultBg' ? 'default-bg text: nominal = fg vs pixel bg' : 'explicit-bg text: nominal = css', r4_5: { nominal: pick(a, 'nom'), px: pick(a, 'px') }, r5_5: { nominal: pick(b, 'nom'), px: pick(b, 'px') } }
  }
  for (const p of ['bat-monokai', 'bat-github', 'eza']) {
    const j8 = J(join(d8, `real-${c}-${p}.measure.json`))
    let j7 = null
    if (c === 'gl-light') j7 = J(join(d7, `real-${p}.measure.json`))
    if (c === 'so-dark') j7 = J(join(d7, 'real-dark', `real-${p}.measure.json`))
    o.real[p] = { r5_5: j8 && { nomPx: st(j8.defaultBgColoured && j8.defaultBgColoured.nominalVsPixelBg), px: st(j8.defaultBgColoured && j8.defaultBgColoured.measured) }, r4_5: j7 && { nomPx: st(j7.defaultBgColoured && j7.defaultBgColoured.nominalVsPixelBg), px: st(j7.defaultBgColoured && j7.defaultBgColoured.measured) } }
  }
  const p8 = P(join(d8, `m-${c}.probe.json`)), p7 = P(join(d7, `m-${c}.probe.json`))
  const rev = (dir, lab) => { const j = J(join(dir, `m-${c}.measure3.json`)); const s = j && j.results.find(r => r.kind === 'span' && r.label.includes(lab)); return s ? s.contrastMeasured : null }
  for (const lab of ['REV-DEFAULT', 'REV-RED', 'REV-GREEN']) {
    const s8 = p8.spans.find(x => x.text === lab), s7 = p7.spans.find(x => x.text === lab), b = r4.cells[idx[c]].spans[lab]
    o.reverse[lab] = { part3_none: b && b.measuredContrast, r4_5: rev(d7, lab), r5_5: rev(d8, lab), colours5_5: s8 && { fg: s8.color, bg: s8.background }, colours4_5: s7 && { fg: s7.color, bg: s7.background } }
  }
  const revDist = (dir, name) => { const j = J(join(dir, `m-${c}-s7.measure.json`)); const v = j ? j.details.filter(d => /^rev\d+$/.test(d.text.trim())).map(d => d.nominalCss).filter(x => x != null) : []; return v.length ? { n: v.length, min: Math.min(...v), max: Math.max(...v) } : null }
  o.reverse.s7 = { r4_5: revDist(d7), r5_5: revDist(d8) }
  const status = name => { const j = J(join(d8, `real-${c}-${name}.measure.json`)); if (!j) return null; const last = Math.max(...j.details.map(d => d.row)); return j.details.filter(d => d.row >= last - 1 && d.measured !== undefined && (d.cls || d.style) && (d.bgCss || '').startsWith('rgb(')).slice(0, 2).map(d => ({ text: d.text.slice(0, 22), fg: d.fgCss, bg: d.bgCss, css: d.nominalCss, px: d.measured })) }
  o.reverse.less = status('less'); o.reverse.vim = status('vim')
  out.cells[c] = o
}
writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n')
console.log('written', outFile)
