// W17：Monaco token / diff 背景的真实像素对比度（无第三方依赖；复用 W5-png-contrast.mjs 的 PNG 解码与 WCAG 公式）。
// 用法：node W17-monaco-contrast.mjs <capture.png> <probe.json> [--label x] [--clip x0,y0,x1,y1]
// 对每个 token span：背景 = 框内亮度中位像素；nominal = computed 前景 vs 实测背景；measured = 距背景最远像素（含抗锯齿，偏保守）。
// 对 diff 背景：取每个 .line-insert / .line-delete / .char-* 元素框内的中位像素为「增 / 删背景」，再计算该背景与最近 token 前景色的对比度。
import { readFileSync } from 'node:fs'
import { decodePng, measure, luminance, contrast } from './W5-png-contrast.mjs'
const [pngFile, probeFile, ...rest] = process.argv.slice(2)
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d }
const img = decodePng(pngFile)
let probe = JSON.parse(readFileSync(probeFile, 'utf8')); if (typeof probe === 'string') probe = JSON.parse(probe)
const clip = opt('--clip', null)?.split(',').map(Number)
const inClip = b => !clip || (b.x >= clip[0] && b.y >= clip[1] && b.x + b.w <= clip[2] && b.y + b.h <= clip[3])
const rgb = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(css || ''); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null }
const hexRgb = h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
const lum = c => luminance(c.r, c.g, c.b)
const rows = []
for (const s of probe.spans) {
  if (!inClip(s.box)) continue
  const b = { x: s.box.x + 1, y: s.box.y + 2, w: Math.max(1, s.box.w - 2), h: Math.max(1, s.box.h - 4) }
  const m = measure(img, { label: s.text, ...b }, 1); if (m.error) continue
  const fg = rgb(s.color); const bg = hexRgb(m.bg)
  // 该 token 落在哪种 diff 装饰里：字符级 (char-*) 优先，其次行级 (line-*)；否则为普通文字
  const cx = s.box.x + s.box.w / 2, cy = s.box.y + s.box.h / 2
  const hit = kinds => (probe.diffBg || []).filter(d => kinds.some(k => String(d.cls).split(' ').includes(k)) && cx >= d.box.x && cx <= d.box.x + d.box.w && cy >= d.box.y && cy <= d.box.y + d.box.h).map(d => String(d.cls).split(' ').find(c => kinds.includes(c)))[0]
  const diffKind = hit(['char-insert', 'char-delete']) || hit(['line-insert', 'line-delete']) || 'plain'
  rows.push({ text: s.text, cls: s.cls, fg: s.color, bg: m.bg, nominal: +contrast(lum(fg), lum(bg)).toFixed(2), measured: m.contrastMeasured, len: s.text.length, diffKind })
}
const stat = (arr) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const p = q => a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]; return { n: a.length, min: a[0], p5: p(0.05), median: p(0.5), below4_5: a.filter(v => v < 4.5).length } }
const nominal = rows.map(r => r.nominal), measured = rows.filter(r => r.len >= 3).map(r => r.measured)
const byColour = {}
for (const r of rows) { const k = r.fg; (byColour[k] ||= { fg: k, bg: new Set(), min: 99, n: 0, sample: r.text }); byColour[k].n++; byColour[k].bg.add(r.bg); byColour[k].min = Math.min(byColour[k].min, r.nominal) }
const colours = Object.values(byColour).map(c => ({ fg: c.fg, n: c.n, minNominal: c.min, bgSample: [...c.bg].slice(0, 2), sample: c.sample })).sort((a, b) => a.minNominal - b.minNominal)
// diff 背景
const diff = []
for (const d of probe.diffBg || []) {
  if (!inClip(d.box) || d.box.w < 4 || d.box.h < 4) continue
  const m = measure(img, { label: d.cls, x: d.box.x + 2, y: d.box.y + 1, w: Math.max(1, d.box.w - 4), h: Math.max(1, d.box.h - 2) }, 1)
  if (!m.error) diff.push({ cls: d.cls.split(' ').slice(0, 2).join(' '), cssBg: d.bg, pixelBg: m.bg, bgLum: m.bgLum, box: d.box })
}
// 每个 diff 背景框内的 token：把 token 前景放在该背景像素上
const diffText = []
for (const d of diff) {
  const inside = probe.spans.filter(s => s.box.y >= d.box.y - 1 && s.box.y + s.box.h <= d.box.y + d.box.h + 1 && s.box.x >= d.box.x - 1 && s.box.x + s.box.w <= d.box.x + d.box.w + 1)
  for (const s of inside) { const fg = rgb(s.color), bg = hexRgb(d.pixelBg); diffText.push({ kind: d.cls, text: s.text, fg: s.color, pixelBg: d.pixelBg, nominal: +contrast(lum(fg), lum(bg)).toFixed(2) }) }
}
const byKind = {}
for (const r of rows) { const k = r.diffKind; (byKind[k] ||= []).push(r) }
const kindStats = Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.length, min: Math.min(...v.map(r => r.nominal)), below4_5: v.filter(r => r.nominal < 4.5).length, below3: v.filter(r => r.nominal < 3).length, worst: v.sort((a, b) => a.nominal - b.nominal).slice(0, 2).map(r => ({ text: r.text, fg: r.fg, bg: r.bg, nominal: r.nominal })) }]))
const out = { kindStats, label: opt('--label', ''), attrs: probe.attrs, editorBg: probe.editorBg, tokens: { all: stat(nominal), measuredInk: stat(measured), distinctColours: colours.length, worstColours: colours.slice(0, 6) }, diffBackgrounds: diff.slice(0, 12), diffText: { n: diffText.length, min: diffText.length ? Math.min(...diffText.map(d => d.nominal)) : null, below4_5: diffText.filter(d => d.nominal < 4.5).length, worst: diffText.sort((a, b) => a.nominal - b.nominal).slice(0, 5) } }
console.log(JSON.stringify(out, null, 1))
