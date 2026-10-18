// W5 Part 2 复验：合并 W5-terminal-probe-r3.js 的 DOM 几何与窗口截图像素，输出实测 WCAG 对比度。
// 用法：node W5-measure-r3.mjs <capture.png> <probe.json> [--label name]
// 方法（见 W5-png-contrast.mjs）：文字框取背景中位像素，文字核心色取距背景最远像素；另给 nominal（computed 前景色 vs 实测背景）。
// 额外：光标块 / 选区 / 滚动条拇指取「框内中位色 vs 外圈背景中位色」对比度；plain 文字行汇总只统计不含 ANSI span 的行。
import { readFileSync } from 'node:fs'
import { decodePng, measure, luminance, contrast } from 'W5-png-contrast.mjs'

const [png, probeFile, ...rest] = process.argv.slice(2)
const opt = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined }
const img = decodePng(png)
let probe = JSON.parse(readFileSync(probeFile, 'utf8'))
if (typeof probe === 'string') probe = JSON.parse(probe)

const rgbToHex = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('') : undefined }
const shrink = (b, dy = 1) => ({ x: b.x, y: b.y + dy, w: b.w, h: Math.max(1, b.h - dy * 2) })
const px = (x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4; return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]] }
const median = pts => { const s = pts.map(p => ({ p, l: luminance(...p) })).sort((a, b) => a.l - b.l); return s[Math.floor(s.length / 2)] }
const hex = p => '#' + p.map(v => v.toString(16).padStart(2, '0')).join('')

// 框内中位色 vs 外圈（上下左右各 pad px，排除框本身）中位色
function blockVsRing(label, b, pad = 3, inset = 1) {
  const inner = [], ring = []
  const x0 = Math.max(0, Math.floor(b.x - pad)), y0 = Math.max(0, Math.floor(b.y - pad)), x1 = Math.min(img.width - 1, Math.ceil(b.x + b.w + pad)), y1 = Math.min(img.height - 1, Math.ceil(b.y + b.h + pad))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const inBox = x >= b.x + inset && x < b.x + b.w - inset && y >= b.y + inset && y < b.y + b.h - inset
    const nearBox = x >= b.x - 1 && x < b.x + b.w + 1 && y >= b.y - 1 && y < b.y + b.h + 1
    if (inBox) inner.push(px(x, y)); else if (!nearBox) ring.push(px(x, y))
  }
  if (!inner.length || !ring.length) return { label, error: 'empty', box: b }
  const a = median(inner), r = median(ring)
  return { label, box: b, inner: hex(a.p), ring: hex(r.p), innerLum: +a.l.toFixed(4), ringLum: +r.l.toFixed(4), contrast: +contrast(a.l, r.l).toFixed(2) }
}

const results = []
for (const row of probe.rows) results.push({ kind: 'row', styled: row.hasStyledSpan, ...measure(img, { label: `row${row.index}: ${row.text.slice(0, 28)}`, ...shrink(row.box), fg: rgbToHex(row.color) }, 1) })
for (const s of probe.spans) results.push({ kind: 'span', cls: s.cls, fontWeight: s.fontWeight, ...measure(img, { label: `span: ${s.text.slice(0, 20)}`, ...shrink(s.box), fg: rgbToHex(s.color) }, 1) })

const plain = results.filter(r => r.kind === 'row' && !r.styled && r.contrastMeasured !== undefined)
const range = (arr, key) => arr.length ? { min: Math.min(...arr.map(r => r[key])), max: Math.max(...arr.map(r => r[key])), n: arr.length } : null
const cursor = probe.cursor && probe.cursor.box.w > 0 ? blockVsRing('cursor', probe.cursor.box) : { label: 'cursor', error: 'no cursor box', domCursor: probe.cursor }
const selection = probe.selectionLayer.filter(d => d.box.w > 1 && d.box.h > 1).map((d, i) => {
  // 选区块 vs 外圈，以及选区内部文字（该行前景色）对选区背景的对比度
  const row = probe.rows.find(r => r.rowBox.y < d.box.y + d.box.h / 2 && r.rowBox.y + r.rowBox.h > d.box.y + d.box.h / 2)
  const inside = measure(img, { label: `selected-text${i}`, x: d.box.x + 1, y: d.box.y + 2, w: d.box.w - 2, h: Math.max(1, d.box.h - 4), fg: rgbToHex(row && row.color) }, 1)
  return { ...blockVsRing(`selection${i}`, d.box, 3, 1), selectedText: { bg: inside.bg, ink: inside.ink, contrastMeasured: inside.contrastMeasured, nominalFg: inside.nominalFg, contrastNominalVsBg: inside.contrastNominalVsBg } }
})
const sliders = probe.scrollbars.filter(b => b.sliderBox && b.sliderBox.w > 0 && b.sliderBox.h > 0).map(b => ({ cls: b.cls, sliderBg: b.sliderBg, ...blockVsRing('scrollbar-slider', b.sliderBox, 4, 1) }))

// viewport 空白区（文字右侧）与内边距条带，检查有无黑色填充
const area = probe.area
const textRight = Math.max(area.x + 40, ...probe.rows.map(r => r.box.x + r.box.w))
const ex = Math.min(textRight + 12, area.x + area.w - 60)
const region = (label, b) => { let n = 0, dark = 0, sum = 0; for (let y = Math.round(b.y); y < Math.round(b.y + b.h); y++) for (let x = Math.round(b.x); x < Math.round(b.x + b.w); x++) { const l = luminance(...px(x, y)); n++; sum += l; if (l < 0.02) dark++ } return { label, meanLum: +(sum / n).toFixed(4), darkFraction: +(dark / n).toFixed(4) } }
const empty = region('viewport-empty-right-of-text', { x: ex, y: area.y + 8, w: Math.max(20, area.x + area.w - 24 - ex), h: Math.min(area.h - 16, 400) })
const strip = region('padding-strip', { x: area.x + 1, y: area.y + 8, w: 5, h: Math.min(area.h - 16, 400) })

console.log(JSON.stringify({
  label: opt('--label') || null, png, attrs: probe.attrs, font: probe.font, backgrounds: probe.backgrounds, styleElements: probe.styleElements, geometry: probe.geometry, xtermClass: probe.xtermClass,
  plainRowContrast: range(plain, 'contrastMeasured'), plainRowWorstBg: range(plain, 'contrastWorstBg'),
  cursor, cursorDom: probe.cursor, selection, selectionDom: probe.selectionLayer, sliders, empty, strip, results
}, null, 1))
