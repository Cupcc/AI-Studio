// W5 Part 6 复验：把六个外观单元格的测量文件汇总成一个 JSON，并与 Part 3（W5-theme-measurements-r4.json）逐项对照。
// 用法：node W5-summarize-r7.mjs <scratch 目录（含 m-<cell>*.measure*.json / .probe.json）> <输出 json>
// 只读已有测量输出，不访问应用。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const [dir, outFile] = process.argv.slice(2)
const here = fileURLToPath(new URL('.', import.meta.url))
const baseline = JSON.parse(readFileSync(join(here, 'W5-theme-measurements-r4.json'), 'utf8'))
const cells = [['gl-light', 0], ['gl-light-none', 1], ['gl-dark', 2], ['gl-dark-none', 3], ['so-light', 4], ['so-dark', 5]]
const J = f => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null)
const P = f => { const p = J(f); return typeof p === 'string' ? JSON.parse(p) : p }
const strip = d => d && { n: d.n, min: d.min, p5: d.p5, p50: d.p50, max: d.max, below4_5: d.below4_5, below3: d.below3 }
const out = { generatedAt: new Date().toISOString(), baseline: 'f06ba98 -> 42a2e31 (b24ba9b: style-src-attr + minimumContrastRatio 4.5); Part 3 reference = W5-theme-measurements-r4.json (2223dad)', method: 'W5-terminal-probe-r7.js + W5-measure-r3.mjs (regression scene) + W5-measure-r7.mjs (colour scenes) + W5-palette-check-r7.mjs; window screenshots by window id (DPR 1)', cells: {} }
for (const [name, idx] of cells) {
  const m = `m-${name}`
  const base = J(`${m}.measure3.json`), sel = J(`${m}-sel.measure3.json`), inact = J(`${m}-inactive.measure3.json`), scroll = J(`${m}-scroll.measure3.json`)
  const probe = P(`${m}.probe.json`)
  const r4 = baseline.cells[idx]
  let palette = null
  try { palette = JSON.parse(execFileSync('node', [join(here, 'W5-palette-check-r7.mjs'), join(dir, `${m}.probe.json`)], { encoding: 'utf8' })) } catch (e) { palette = { error: String(e.message).slice(0, 120) } }
  const c = {
    attrs: base && base.attrs,
    regression: {
      plainRowContrast: base && base.plainRowContrast, plainRowWorstBg: base && base.plainRowWorstBg,
      cursor: base && base.cursor && base.cursor.contrast,
      selectionActive: sel && sel.selection.map(s => ({ vsSurround: s.contrast, selectedText: s.selectedText && s.selectedText.contrastMeasured })),
      selectionInactive: inact && inact.selection.map(s => ({ vsSurround: s.contrast, selectedText: s.selectedText && s.selectedText.contrastMeasured })),
      scrollbarThumb: scroll && scroll.sliders.map(s => s.contrast),
      viewportEmptyMeanLum: base && base.empty && base.empty.meanLum, paddingStripMeanLum: base && base.strip && base.strip.meanLum,
      computedTransparent: probe && probe.computedTransparent,
      geometry: base && { rows: base.geometry.rowCount, scrollTop: base.geometry.scrollTop, clientHeight: base.geometry.clientHeight },
      paletteCheck: palette && { checked: palette.checked, mismatches: palette.mismatches, details: palette.details }
    },
    part3Baseline: r4 && {
      plainRowContrast: r4.plainRowContrast, cursor: r4.cursorActive && r4.cursorActive.contrast,
      selectionActive: (r4.selectionActive || []).map(s => ({ vsSurround: s.contrast, selectedText: s.selectedText && s.selectedText.contrastMeasured })),
      selectionInactive: (r4.selectionInactive || []).map(s => ({ vsSurround: s.contrast, selectedText: s.selectedText && s.selectedText.contrastMeasured })),
      scrollbarThumb: (r4.scrollbarThumb || []).map(s => s.contrast), viewportEmptyMeanLum: r4.viewportEmptyMeanLum, paddingStripMeanLum: r4.paddingStripMeanLum, computedTransparent: r4.computedTransparent
    },
    scenes: {}
  }
  for (const s of ['s1', 's2', 's3a', 's3b', 's4', 's5', 's6', 's7']) {
    const j = J(`${m}-${s}.measure.json`)
    if (!j) continue
    c.scenes[s] = {
      pairs: j.pairs, measured: strip(j.measured), nominalCss: strip(j.nominalCss), nominalVsPixelBg: strip(j.nominal),
      defaultBgColoured: j.defaultBgColoured && { nominalVsPixelBg: j.defaultBgColoured.nominalVsPixelBg, measured: j.defaultBgColoured.measured, bgPixelRange: j.defaultBgColoured.bgPixelRange },
      explicitBg: j.explicitBg && { nominalCss: j.explicitBg.nominalCss, measured: j.explicitBg.measured, worst: j.explicitBg.worst },
      excludedGlyphOnly: (j.excludedGlyphOnly || []).length,
      ...(s === 's1' ? { needAdjustment: j.needAdjustment, adjusted: j.adjusted, requestedMin: j.requested && j.requested.min, requestedMax: j.requested && j.requested.max, adjustedButStillBelowInCss: j.adjustedButStillBelow, notAdjustedBelow: j.notAdjustedBelow, identicalColourPairs: j.identicalColourPairs.length, identicalAllAdjusted: j.identicalColourPairs.every(p => p.adjusted) } : {}),
      worst: j.worstMeasured.slice(0, 5).map(w => ({ row: w.row, col: w.col, text: w.text, f: w.f, b: w.b, fgCss: w.fgCss, bgPixel: w.bgPixel, nominal: w.nominal, measured: w.measured }))
    }
  }
  out.cells[name] = c
}
writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n')
console.log('written', outFile)
