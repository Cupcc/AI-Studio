// W5 Part 4 复验：给定 W5-proc-tree.mjs 的快照（可选只看 command 匹配的条目），按「PID + 启动时间」判断每个进程是否仍是同一个进程且存活。
// 用法：node W5-proc-alive.mjs <snapshot.json> [--only <regex on command>] [--json]
import { readFileSync } from 'node:fs'
import { listProcesses } from './W5-proc-tree.mjs'
const [file, ...rest] = process.argv.slice(2)
const oi = rest.indexOf('--only'), only = oi >= 0 ? new RegExp(rest[oi + 1]) : null
const snap = JSON.parse(readFileSync(file, 'utf8')), now = new Map(listProcesses().map(p => [p.pid, p]))
// 应用自身周期性执行的 /bin/ps（归属探测）是瞬时进程，不计入存活判断
const rows = [{ pid: snap.root, start: snap.rootStart, command: 'ROOT (Electron main)' }, ...snap.descendants].filter(p => !/^\/bin\/ps /.test(p.command)).filter(p => !only || only.test(p.command))
  .map(p => { const cur = now.get(p.pid); return { pid: p.pid, command: p.command.slice(0, 90), alive: !!cur && cur.start === p.start, pidReused: !!cur && cur.start !== p.start } })
if (rest.includes('--json')) console.log(JSON.stringify(rows, null, 1))
else for (const r of rows) console.log(`${r.alive ? 'ALIVE' : 'gone '} ${String(r.pid).padStart(6)} ${r.pidReused ? '(pid reused by another process) ' : ''}${r.command}`)
console.log(`summary: ${rows.filter(r => r.alive).length} alive, ${rows.filter(r => !r.alive).length} gone, of ${rows.length}`)
