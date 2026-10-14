// W5 Part 1 复验：无第三方依赖的 PNG 解码 + WCAG 对比度测量（本机没有 PIL / ImageMagick）。
// 用法：node W5-png-contrast.mjs <file.png> <boxes.json> [--scale 1]
//   boxes.json: [{ "label": "...", "x": 0, "y": 0, "w": 10, "h": 10, "fg": "#rrggbb"? }]  坐标为 CSS px，乘 --scale 得到图像像素。
// 方法：每个 box 内按亮度取中位像素作为背景估计（文字覆盖像素少于一半）；
//       以与背景 RGB 欧氏距离最远的像素作为文字核心色（抗锯齿使细笔画只有核心像素接近真实前景）；
//       对比度按 WCAG 2.x：(L1 + 0.05) / (L2 + 0.05)，L 为 sRGB 线性化后的相对亮度。
//       另给出 box 内背景亮度的 min / p5 / p95 / max，worst 对比度用对文字不利一侧的背景极值（p5 或 p95）计算。
//       若 box 提供 fg（CSS 前景色），再给出 nominal 对比度（前景色 vs 测得背景中位 / 最不利背景）。
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

export function decodePng(file) {
  const buf = readFileSync(file)
  const sig = '89504e470d0a1a0a'
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('not a PNG: ' + file)
  let off = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0
  const idat = [], chunks = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    chunks.push(type)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; interlace = data[12] }
    else if (type === 'IDAT') idat.push(data)
    off += 12 + len
    if (type === 'IEND') break
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) throw new Error(`unsupported PNG depth=${depth} color=${colorType} interlace=${interlace}`)
  const ch = colorType === 6 ? 4 : 3, stride = width * ch
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0, b = y > 0 ? out[dst - stride + x] : 0, c = x >= ch && y > 0 ? out[dst - stride + x - ch] : 0
      let v = raw[src + x]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      out[dst + x] = v & 255
    }
  }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = out[i * ch]; rgba[i * 4 + 1] = out[i * ch + 1]; rgba[i * 4 + 2] = out[i * ch + 2]; rgba[i * 4 + 3] = ch === 4 ? out[i * ch + 3] : 255
  }
  return { width, height, rgba, chunks }
}

const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
export const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
const parseHex = s => { const m = /^#?([0-9a-f]{6})/i.exec(s || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null }
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]

export function measure(png, box, scale = 1) {
  const x0 = Math.max(0, Math.round(box.x * scale)), y0 = Math.max(0, Math.round(box.y * scale))
  const x1 = Math.min(png.width, Math.round((box.x + box.w) * scale)), y1 = Math.min(png.height, Math.round((box.y + box.h) * scale))
  const px = []
  let alphaMin = 255
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.width + x) * 4
    const r = png.rgba[i], g = png.rgba[i + 1], b = png.rgba[i + 2], a = png.rgba[i + 3]
    alphaMin = Math.min(alphaMin, a)
    px.push({ r, g, b, l: luminance(r, g, b) })
  }
  if (!px.length) return { label: box.label, error: 'empty box' }
  const byL = [...px].sort((p, q) => p.l - q.l)
  const bg = byL[Math.floor(byL.length / 2)]
  let far = px[0], farD = -1
  for (const p of px) { const d = (p.r - bg.r) ** 2 + (p.g - bg.g) ** 2 + (p.b - bg.b) ** 2; if (d > farD) { farD = d; far = p } }
  // 背景像素集合：与背景中位色的 RGB 距离小于「到文字核心色距离」的 15%，排除抗锯齿和文字像素后再取亮度分布。
  const limit = farD * 0.15 * 0.15
  const bgSet = px.filter(p => (p.r - bg.r) ** 2 + (p.g - bg.g) ** 2 + (p.b - bg.b) ** 2 <= limit)
  const ls = bgSet.map(p => p.l).sort((p, q) => p - q)
  const bgMin = ls[0], bgMax = ls[ls.length - 1], bgP5 = pct(ls, 0.05), bgP95 = pct(ls, 0.95)
  const inkDarker = far.l < bg.l
  // 对文字不利的背景：文字比背景暗时，背景越暗越不利（p5）；文字更亮则背景越亮越不利（p95）。
  const worstBg = inkDarker ? bgP5 : bgP95
  const res = {
    label: box.label, pixels: px.length, alphaMin,
    bg: hex(bg.r, bg.g, bg.b), bgLum: +bg.l.toFixed(4), bgLumRange: [+bgMin.toFixed(4), +bgP5.toFixed(4), +bgP95.toFixed(4), +bgMax.toFixed(4)],
    ink: hex(far.r, far.g, far.b), inkLum: +far.l.toFixed(4),
    contrastMeasured: +contrast(far.l, bg.l).toFixed(2),
    contrastWorstBg: +contrast(far.l, worstBg).toFixed(2)
  }
  const fg = parseHex(box.fg)
  if (fg) {
    const fl = luminance(...fg)
    res.nominalFg = hex(...fg)
    res.contrastNominalVsBg = +contrast(fl, bg.l).toFixed(2)
    res.contrastNominalVsWorstBg = +contrast(fl, fl < bg.l ? bgP5 : bgP95).toFixed(2)
  }
  return res
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, boxesFile, ...rest] = process.argv.slice(2)
  const si = rest.indexOf('--scale'), scale = si >= 0 ? Number(rest[si + 1]) : 1
  const png = decodePng(file)
  const boxes = JSON.parse(readFileSync(boxesFile, 'utf8'))
  console.log(JSON.stringify({ file, width: png.width, height: png.height, chunks: [...new Set(png.chunks)], scale, results: boxes.map(b => measure(png, b, scale)) }, null, 1))
}
