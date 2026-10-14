// W5 Part 1 复验：把 W5-terminal-probe.js 的 DOM 几何与截图像素合并，输出每个文字行 / ANSI span 的实测对比度。
// 用法：node W5-measure.mjs <capture.png> <probe.json> [--scale 1] [--label name]
// 方法见 W5-png-contrast.mjs。额外给出 viewport 空白区（右侧文字外）相对 .terminal-screen 内边距条带的亮度差与「黑色填充」像素占比。
import { readFileSync } from 'node:fs'
import { decodePng, measure, luminance } from './W5-png-contrast.mjs'

const [png, probeFile, ...rest] = process.argv.slice(2)
const opt = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined }
const scale = Number(opt('--scale') || 1)
const img = decodePng(png)
let probe = JSON.parse(readFileSync(probeFile, 'utf8'))
if (typeof probe === 'string') probe = JSON.parse(probe)

const rgbToHex = css => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || '')
  return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : undefined
}
const shrink = (b, dy = 1) => ({ x: b.x, y: b.y + dy, w: b.w, h: Math.max(1, b.h - dy * 2) })

const results = []
for (const row of probe.rows) results.push({ kind: 'row', ...measure(img, { label: `row${row.index}: ${row.text.slice(0, 28)}`, ...shrink(row.box), fg: rgbToHex(row.color) }, scale) })
for (const span of probe.spans) results.push({ kind: 'span', cls: span.cls, ...measure(img, { label: `span: ${span.text.slice(0, 20)}`, ...shrink(span.box), fg: rgbToHex(span.color) }, scale) })

// viewport 空白区与内边距条带
const area = probe.area
const textRight = Math.max(area.x + 40, ...probe.rows.map(r => r.box.x + r.box.w))
const emptyBox = { x: Math.min(textRight + 12, area.x + area.w - 60), y: area.y + 8, w: Math.max(20, area.x + area.w - 24 - Math.min(textRight + 12, area.x + area.w - 60)), h: Math.min(area.h - 16, 400) }
const stripBox = { x: area.x + 1, y: area.y + 8, w: 5, h: Math.min(area.h - 16, 400) }
const region = (label, box) => {
  const x0 = Math.round(box.x * scale), y0 = Math.round(box.y * scale), x1 = Math.round((box.x + box.w) * scale), y1 = Math.round((box.y + box.h) * scale)
  let n = 0, dark = 0, sum = 0, min = 1, max = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4, l = luminance(img.rgba[i], img.rgba[i + 1], img.rgba[i + 2])
    n++; sum += l; if (l < 0.02) dark++; min = Math.min(min, l); max = Math.max(max, l)
  }
  return { label, box, pixels: n, meanLum: +(sum / n).toFixed(4), minLum: +min.toFixed(4), maxLum: +max.toFixed(4), darkFraction: +(dark / n).toFixed(4) }
}
const empty = region('viewport-empty-right-of-text', emptyBox)
const strip = region('terminal-screen-padding-strip', stripBox)

const rowRes = results.filter(r => r.kind === 'row' && r.contrastMeasured !== undefined)
const summary = {
  label: opt('--label') || null,
  png, attrs: probe.attrs, cssVars: probe.cssVars, backgrounds: probe.backgrounds,
  cursor: probe.cursor, selectionLayer: probe.selectionLayer, slider: probe.slider, styleElementsApplied: probe.styleElementsApplied,
  rowContrastMeasured: { min: Math.min(...rowRes.map(r => r.contrastMeasured)), max: Math.max(...rowRes.map(r => r.contrastMeasured)) },
  rowContrastWorstBg: { min: Math.min(...rowRes.map(r => r.contrastWorstBg)), max: Math.max(...rowRes.map(r => r.contrastWorstBg)) },
  rowContrastNominal: { min: Math.min(...rowRes.map(r => r.contrastNominalVsWorstBg ?? Infinity)) },
  empty, strip,
  emptyVsStripLumDelta: +Math.abs(empty.meanLum - strip.meanLum).toFixed(4),
  results
}
console.log(JSON.stringify(summary, null, 1))
