// W5 Part 3 复验：只观察 PTY resize IPC 调用次数。包装 window.studio.terminal.resize，记录参数后原样转发；
// 若主世界里该属性不可写则返回 'not writable'（此时只能用 shell 内 SIGWINCH 计数近似）。须在打开 Terminal 之前安装。
(() => {
  const t = window.__w5resize = window.__w5resize || { calls: [] }
  const api = window.studio && window.studio.terminal
  if (!api || typeof api.resize !== 'function') return 'no terminal api'
  if (api.resize.__w5) return 'already installed'
  const orig = api.resize
  const wrapped = function (...args) { t.calls.push({ cols: args[0] && args[0].cols, rows: args[0] && args[0].rows, t: Math.round(performance.now()) }); return orig.apply(this, args) }
  wrapped.__w5 = true
  try { api.resize = wrapped } catch (e) { return 'failed: ' + e }
  return api.resize === wrapped ? 'installed' : 'not writable'
})()
