// W5 Part 4 复验：按精确 PID + 启动时间记录某个进程的全部后代（只读，基于 ps）。
// 用法：node W5-proc-tree.mjs <rootPid> [--out file.json] ；与 W5-proc-alive.mjs 配合判断某批进程是否仍存活。
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
export function listProcesses() {
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,lstart=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\n').filter(Boolean).map(line => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/.exec(line)
    return m ? { pid: +m[1], ppid: +m[2], pgid: +m[3], start: m[4].replace(/\s+/g, ' '), command: m[5] } : null
  }).filter(Boolean)
}
export function descendants(rootPid, all = listProcesses()) {
  const byParent = new Map(); for (const p of all) { if (!byParent.has(p.ppid)) byParent.set(p.ppid, []); byParent.get(p.ppid).push(p) }
  const out = [], queue = [rootPid]
  while (queue.length) { const pid = queue.shift(); for (const c of byParent.get(pid) || []) { out.push(c); queue.push(c.pid) } }
  return out
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, ...rest] = process.argv.slice(2), oi = rest.indexOf('--out')
  const all = listProcesses(), self = all.find(p => p.pid === +root)
  const result = { root: +root, rootStart: self && self.start, descendants: descendants(+root, all).map(p => ({ ...p, command: p.command.slice(0, 160) })) }
  if (oi >= 0) writeFileSync(rest[oi + 1], JSON.stringify(result, null, 1))
  console.log(result.descendants.map(p => `${String(p.pid).padStart(6)} ppid=${String(p.ppid).padStart(6)} pgid=${String(p.pgid).padStart(6)} ${p.command.slice(0, 110)}`).join('\n'))
}
