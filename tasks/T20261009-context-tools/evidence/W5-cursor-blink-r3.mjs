// W5 Part 2 复验：对同一个光标框在多帧窗口截图里取「框内中位色 vs 外圈中位色」对比度，判断光标是否在闪烁。
// 用法：node W5-cursor-blink-r3.mjs <x> <y> <w> <h> <frame1.png> <frame2.png> ...   坐标为 CSS px（DPR=1）
import { decodePng, luminance, contrast } from './W5-png-contrast.mjs'
const [x, y, w, h, ...files] = process.argv.slice(2)
const b = { x: +x, y: +y, w: +w, h: +h }
const med = pts => { const s = pts.map(p => ({ p, l: luminance(...p) })).sort((a, c) => a.l - c.l); return s[Math.floor(s.length / 2)] }
const frames = files.map(f => {
  const img = decodePng(f), px = (X, Y) => { const i = (Y * img.width + X) * 4; return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]] }
  const inner = [], ring = []
  for (let Y = Math.floor(b.y) - 4; Y <= Math.ceil(b.y + b.h) + 4; Y++) for (let X = Math.floor(b.x) - 4; X <= Math.ceil(b.x + b.w) + 4; X++) {
    const inBox = X >= b.x + 1 && X < b.x + b.w - 1 && Y >= b.y + 1 && Y < b.y + b.h - 1, near = X >= b.x - 1 && X < b.x + b.w + 1 && Y >= b.y - 1 && Y < b.y + b.h + 1
    if (inBox) inner.push(px(X, Y)); else if (!near) ring.push(px(X, Y))
  }
  const a = med(inner), r = med(ring)
  return { frame: f.split('/').pop(), innerLum: +a.l.toFixed(3), ringLum: +r.l.toFixed(3), contrast: +contrast(a.l, r.l).toFixed(2) }
})
const on = frames.filter(f => f.contrast >= 3).length
console.log(JSON.stringify({ frames, onFrames: on, offFrames: frames.length - on, blinking: on > 0 && on < frames.length }))
