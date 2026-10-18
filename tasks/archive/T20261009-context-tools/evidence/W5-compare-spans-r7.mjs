// W5 Part 6：比较两个 W5-terminal-probe-r7.js 输出里的彩色 span（行、列、文字、类、style 属性去掉 letter-spacing、computed 颜色）。
// 用法：node W5-compare-spans-r7.mjs <probeA.json> <probeB.json>
// 纯文本 span（没有类，且 style 只含 letter-spacing）不参与比较：xterm 只在部分渲染路径给它们写 letter-spacing。
import { readFileSync } from 'node:fs'
const L = f => { let p = JSON.parse(readFileSync(f, 'utf8')); if (typeof p === 'string') p = JSON.parse(p); return p }
const [a, b] = [L(process.argv[2]), L(process.argv[3])]
const styleOf = s => (s.style || '').replace(/letter-spacing:[^;]*;?/, '').trim()
const keep = s => s.cls || styleOf(s)
// style 属性原文不比较（同一颜色可能写成 `color: rgb(1, 2, 3);` 或 `color:#010203;`），只比较是否有 style 与 computed 颜色
const key = s => [s.row, s.col, s.text, s.cls, !!styleOf(s), s.color, s.background, s.decoColor, s.opacity].join('|')
const ka = a.spans.filter(keep).map(key), kb = b.spans.filter(keep).map(key)
const setB = new Set(kb), onlyA = ka.filter(k => !setB.has(k)), setA = new Set(ka), onlyB = kb.filter(k => !setA.has(k))
console.log(JSON.stringify({ coloredSpansA: ka.length, coloredSpansB: kb.length, rowTextEqual: JSON.stringify(a.rows.map(r => r.text)) === JSON.stringify(b.rows.map(r => r.text)), onlyInA: onlyA.length, onlyInB: onlyB.length, example: [...onlyA.slice(0, 2), ...onlyB.slice(0, 2)] }))
