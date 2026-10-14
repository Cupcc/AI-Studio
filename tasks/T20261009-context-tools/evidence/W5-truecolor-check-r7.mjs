// W5 Part 6 复验（W5-F6）：24 位色是否真的生效。用法：node W5-truecolor-check-r7.mjs <probe-r7.json> [--ratio 4.5] [--bg 255,255,255]
// 对 W5-scenes-r7.mjs 的 S4 场景（N = 56 个单元格的四条渐变）：
//   - 背景渐变（bg hue ramp / bg gray ramp）：每个单元格 computed background-color 必须等于请求的 rgb（背景不会被调整）；
//   - 前景渐变（fg hue ramp / fg gray ramp，默认背景上）：请求色对名义背景（默认白色 / 深色 #212121）对比度 >= ratio 的必须原样应用，
//     低于 ratio 的应被 xterm 调整（computed 与请求不同）且调整后 >= ratio；
//   - 显式用例 PASS-A / PASS-B / PASS-C 必须原样应用。
import { readFileSync } from 'node:fs'
const [probeFile, ...rest] = process.argv.slice(2)
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d }
let probe = JSON.parse(readFileSync(probeFile, 'utf8')); if (typeof probe === 'string') probe = JSON.parse(probe)
const ratio = Number(opt('--ratio', 4.5))
const nominalBg = (opt('--bg', probe.attrs.scheme === 'dark' ? '33,33,33' : '255,255,255')).split(',').map(Number)
const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const rgb = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || ''); return m ? [+m[1], +m[2], +m[3]] : null }
const hue = (h) => { const c = 0.8, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0.5 - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r, g, b].map(v => Math.round((v + m) * 255)) }
const N = 56
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
// 每行从第 label 列之后每个单元格 1 个字符 'M'；按 row 文本前缀定位行，再按列顺序取 span
const rowsByLabel = {}
for (const r of probe.rows) for (const k of ['fg hue ramp:', 'bg hue ramp:', 'bg gray ramp:', 'fg gray ramp:']) if (r.text.startsWith(k)) rowsByLabel[k] = r.index
const out = { scheme: probe.attrs.scheme, ratio, nominalBg, ramps: {}, explicit: [] }
const cells = (rowIndex) => probe.spans.filter(s => s.row === rowIndex && s.text === 'M').sort((a, b) => a.col - b.col)
const test = (label, rowIndex, kind) => {
  const sp = cells(rowIndex)
  let exact = 0, adjusted = 0, adjustedOk = 0, mismatchBg = 0, requestedBelowButExact = 0
  sp.forEach((s, i) => {
    const gray = Math.round((i / (N - 1)) * 255), req = kind.endsWith('gray') ? [gray, gray, gray] : hue((i / N) * 360)
    if (kind.startsWith('bg')) { if (same(rgb(s.background), req)) exact++; else mismatchBg++ }
    else {
      const got = rgb(s.color), c0 = cr(req, nominalBg)
      if (same(got, req)) { exact++; if (c0 < ratio) requestedBelowButExact++ } else { adjusted++; if (cr(got, nominalBg) >= ratio - 0.02) adjustedOk++ }
    }
  })
  out.ramps[label] = { cells: sp.length, exact, adjusted, adjustedReachRatio: adjustedOk, bgMismatch: mismatchBg, requestedBelowRatioButUnadjusted: requestedBelowButExact }
}
test('fg hue ramp', rowsByLabel['fg hue ramp:'], 'fg')
test('bg hue ramp', rowsByLabel['bg hue ramp:'], 'bg')
test('bg gray ramp', rowsByLabel['bg gray ramp:'], 'bg-gray')
test('fg gray ramp', rowsByLabel['fg gray ramp:'], 'fg-gray')
const want = { 'PASS-A': { fg: [0, 60, 140] }, 'PASS-B': { fg: [255, 255, 255], bg: [20, 60, 110] }, 'PASS-C': { fg: [40, 20, 0], bg: [255, 220, 120] } }
for (const [name, w] of Object.entries(want)) {
  const s = probe.spans.find(x => x.text.includes(name))
  out.explicit.push({ name, found: !!s, fgExact: s ? same(rgb(s.color), w.fg) : null, bgExact: w.bg ? (s ? same(rgb(s.background), w.bg) : null) : undefined })
}
console.log(JSON.stringify(out))
