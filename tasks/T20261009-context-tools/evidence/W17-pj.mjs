// W17：读取 agent-browser eval 的输出（可能被 JSON 双重编码），解析后按 --pick a.b,c 取字段，--rows 把 rows 压成一行一个，其余原样输出。
import { readFileSync } from 'node:fs'
let text = readFileSync(0, 'utf8').trim(), v = text
for (let i = 0; i < 3 && typeof v === 'string'; i++) { try { v = JSON.parse(v) } catch { break } }
const args = process.argv.slice(2)
const pick = args.includes('--pick') ? args[args.indexOf('--pick') + 1].split(',') : null
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
if (typeof v !== 'object' || v === null) { console.log(v); process.exit(0) }
if (args.includes('--rows') && v.rows) {
  for (const r of v.rows) console.log(`${'  '.repeat(Number(r.level) - 1)}${r.name} [${r.kind}${r.expanded ? ' exp=' + r.expanded : ''}${r.selected === 'true' ? ' SEL' : ''}${r.tabindex === '0' ? ' tab0' : ''}${r.disabled ? ' disabled' : ''}${r.badge ? ' badge=' + r.badge : ''}] ${r.pos} title=${JSON.stringify(r.title)}`)
  delete v.rows
}
if (pick) { const o = {}; for (const p of pick) o[p] = get(v, p); console.log(JSON.stringify(o, null, 1)) } else console.log(JSON.stringify(v, null, 1))
