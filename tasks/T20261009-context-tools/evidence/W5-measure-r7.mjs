// W5 Part 6 复验：彩色背景 / 24 位色上的文字对比度，真实像素测量（W5-F9）。
// 用法：node W5-measure-r7.mjs <capture.png> <probe-r7.json> [--scene sweep|plain] [--label name] [--scheme light|dark] [--first-row N]
// 方法：
//   - 每个有字的 span（带 xterm-fg/bg 类或 style 属性）取其像素框（四周各缩 1px）：背景 = 框内按亮度取中位像素，墨色 = 距背景 RGB 最远的像素；
//     measured = 墨色 vs 背景的 WCAG 2.x 对比度（真实像素，含抗锯齿，因此对细笔画略偏保守）；
//     nominal = computed `color`（xterm 调整后）vs 实测背景中位色。
//   - `--scene sweep`：S1 的 16×8 色块（行 = 前景 0–15，列 = 背景 0–7，单元格从第 4 + 5b 列开始）。
//     requested = 调色板前景 vs 调色板背景（xterm 调整前）；adjusted = computed 前景与调色板前景不同。
//     调色板从 terminal-theme.ts 解析，不另抄一份。
// 输出：每个 span 的明细 + 分布（min / p5 / p50 / max、分档计数）+ 最差 10 对。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodePng, measure, luminance, contrast } from './W5-png-contrast.mjs'

const [pngFile, probeFile, ...rest] = process.argv.slice(2)
const opt = (name, d) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : d }
const img = decodePng(pngFile)
let probe = JSON.parse(readFileSync(probeFile, 'utf8'))
if (typeof probe === 'string') probe = JSON.parse(probe)
const scene = opt('--scene', 'plain')
const scheme = opt('--scheme', probe.attrs.scheme || 'light')
const firstRow = Number(opt('--first-row', 1))

const rgb = css => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(css || ''); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null }
const hex = ({ r, g, b }) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
const lumOf = c => luminance(c.r, c.g, c.b)
const parseHexColor = h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })

// 调色板（来自应用源码）
const themeSrc = readFileSync(fileURLToPath(new URL('../../../apps/desktop/src/renderer/src/features/tools/terminal-theme.ts', import.meta.url)), 'utf8')
const block = name => { const m = new RegExp(`const ${name}: TerminalPalette = \\{([\\s\\S]*?)\\n\\}`).exec(themeSrc); const o = {}; for (const [, k, v] of m[1].matchAll(/(\w+): '(#[0-9a-fA-F]{6})'/g)) o[k] = v; return o }
const palette = block(scheme)
const KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']
const ansi = i => palette[KEYS[i]]

const shrink = b => ({ x: b.x + 1, y: b.y + 1, w: Math.max(1, b.w - 2), h: Math.max(1, b.h - 2) })
const details = []
for (const s of probe.spans) {
  const m = measure(img, { label: s.text.slice(0, 18), ...shrink(s.box) }, 1)
  if (m.error) continue
  const fg = rgb(s.color), bgCss = rgb(s.background)
  const bgMeasured = parseHexColor(m.bg)
  // powerline / 私有区 / 方块 / 盒绘字符：xterm 不对它们做对比度调整（excludeFromContrastRatioDemands），它们是形状不是文字
  const glyphOnly = [...s.text.replace(/\s+/g, "")].every(ch => { const c = ch.codePointAt(0); return (c >= 0xE000 && c <= 0xF8FF) || (c >= 0x2500 && c <= 0x259F) })
  const d = {
    row: s.row, col: s.col, text: s.text.slice(0, 18), glyphOnly, cls: s.cls, style: s.style,
    fgCss: s.color, bgCss: s.background, bgPixel: m.bg, inkPixel: m.ink,
    nominal: fg ? +contrast(lumOf(fg), lumOf(bgMeasured)).toFixed(2) : null,
    // CSS 色彩空间内的对比度（xterm 自己计算所用的两个颜色，背景为不透明 computed 背景色时才有）；与像素测得的差别来自显示色彩管理 / 抗锯齿
    nominalCss: fg && bgCss && bgCss.a === 1 ? +contrast(lumOf(fg), lumOf(bgCss)).toFixed(2) : null,
    measured: m.contrastMeasured
  }
  if (scene === 'sweep' && s.row >= firstRow && s.col >= 4 && (s.col - 4) % 5 === 0) {
    const f = s.row - firstRow, b = (s.col - 4) / 5
    if (f >= 0 && f < 16 && b >= 0 && b < 8) {
      const reqFg = parseHexColor(ansi(f)), reqBg = parseHexColor(ansi(b))
      d.f = f; d.b = b
      d.requested = +contrast(lumOf(reqFg), lumOf(reqBg)).toFixed(2)
      d.adjusted = !!fg && hex(fg) !== ansi(f)
      d.bgIsPalette = !!bgCss && hex(bgCss) === ansi(b)
    }
  }
  details.push(d)
}
const pool = scene === 'sweep' ? details.filter(d => d.f !== undefined) : details.filter(d => d.measured !== undefined && !d.glyphOnly)
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : null
const dist = key => {
  const v = pool.map(d => d[key]).filter(x => typeof x === 'number').sort((a, b) => a - b)
  return v.length ? { n: v.length, min: v[0], p5: pct(v, 0.05), p50: pct(v, 0.5), max: v[v.length - 1], below3: v.filter(x => x < 3).length, below4_5: v.filter(x => x < 4.5).length, below4_0: v.filter(x => x < 4).length, between4_5_and_7: v.filter(x => x >= 4.5 && x < 7).length, atLeast7: v.filter(x => x >= 7).length } : null
}
const out = { note: "measured = real captured pixels (display colour management shifts saturated colours slightly); nominal = computed fg vs pixel bg; nominalCss = computed fg vs computed bg (what xterm computes).", file: pngFile, label: opt('--label', null), scene, scheme, attrs: probe.attrs, spansMeasured: details.length, pairs: pool.length, nominal: dist('nominal'), nominalCss: dist('nominalCss'), measured: dist('measured') }
if (scene === 'sweep') {
  out.requested = dist('requested')
  out.needAdjustment = pool.filter(d => d.requested < 4.5).length
  out.adjusted = pool.filter(d => d.adjusted).length
  out.adjustedButStillBelow = pool.filter(d => d.adjusted && (d.nominalCss ?? d.nominal) < 4.5).map(d => ({ f: d.f, b: d.b, nominal: d.nominal, measured: d.measured }))
  out.identicalColourPairs = pool.filter(d => d.f % 8 === d.b || (d.f >= 8 && d.f - 8 === d.b)).map(d => ({ f: d.f, b: d.b, requested: d.requested, adjusted: d.adjusted, nominal: d.nominal, measured: d.measured }))
  out.notAdjustedBelow = pool.filter(d => !d.adjusted && d.measured < 4.5).map(d => ({ f: d.f, b: d.b, requested: d.requested, measured: d.measured }))
  out.bgNotPalette = pool.filter(d => !d.bgIsPalette).map(d => ({ f: d.f, b: d.b, bgCss: d.bgCss }))
}
out.worstMeasured = [...pool].sort((a, b) => a.measured - b.measured).slice(0, 10).map(d => ({ row: d.row, col: d.col, text: d.text, f: d.f, b: d.b, fgCss: d.fgCss, bgPixel: d.bgPixel, nominal: d.nominal, measured: d.measured }))
out.excludedGlyphOnly = details.filter(d => d.glyphOnly).map(d => ({ row: d.row, col: d.col, fgCss: d.fgCss, bgCss: d.bgCss, nominal: d.nominal }))
// 默认背景（透明 / 毛玻璃）上被 xterm 调整过或带颜色的前景：xterm 以不透明的名义背景计算 4.5:1，这里用真实像素背景复算
const defaultBg = details.filter(d => !d.glyphOnly && d.bgCss && rgb(d.bgCss).a === 0 && (d.cls.includes('xterm-fg-') || /(^|;)\s*color\s*:/.test(d.style || '')) && d.nominal !== null)
const dd = key => { const v = defaultBg.map(d => d[key]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? { n: v.length, min: v[0], p5: pct(v, 0.05), p50: pct(v, 0.5), max: v[v.length - 1], below4_5: v.filter(x => x < 4.5).length, below3: v.filter(x => x < 3).length } : null }
out.defaultBgColoured = { nominalVsPixelBg: dd('nominal'), measured: dd('measured'), bgPixelRange: defaultBg.length ? [defaultBg.map(d => d.bgPixel).sort()[0], defaultBg.map(d => d.bgPixel).sort().slice(-1)[0]] : null }
// 显式背景色（ANSI / 256 / 24 位背景，不透明）上的文字：xterm 以该单元格自己的背景计算 4.5:1
const explicitBg = details.filter(d => !d.glyphOnly && d.bgCss && rgb(d.bgCss).a === 1 && d.measured !== undefined)
const ed = key => { const v = explicitBg.map(d => d[key]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? { n: v.length, min: v[0], p5: pct(v, 0.05), p50: pct(v, 0.5), max: v[v.length - 1], below4_5: v.filter(x => x < 4.5).length, below4_0: v.filter(x => x < 4).length, below3: v.filter(x => x < 3).length } : null }
out.explicitBg = { nominalCss: ed('nominalCss'), measured: ed('measured'), worst: [...explicitBg].sort((a, b) => a.measured - b.measured).slice(0, 5).map(d => ({ row: d.row, col: d.col, text: d.text, fgCss: d.fgCss, bgCss: d.bgCss, nominalCss: d.nominalCss, measured: d.measured })) }
out.details = details
console.log(JSON.stringify(out, null, 1))
