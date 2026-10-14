// W5 Part 3 复验：在打开第一个 Terminal 之前安装的页面内采样器（每 25 ms 一次，只读）。
// 记录 Mono 字体状态、xterm 行数 / 行高 / 屏幕宽高、host 与 wrapper 的 scrollTop，用于还原首次 fit 的时间线。结果在 window.__w5first.samples。
(() => {
  if (window.__w5first) return 'already installed'
  const t = window.__w5first = { samples: [], t0: performance.now() }
  const rect = e => { const r = e.getBoundingClientRect(); return [+r.width.toFixed(1), +r.height.toFixed(1)] }
  t.timer = setInterval(() => {
    const wrap = [...document.querySelectorAll('.terminal-screen')].find(e => e.getBoundingClientRect().width > 0)
    const mono = [...document.fonts].filter(f => f.family.includes('Mono')).map(f => f.weight + ':' + f.status).join('/')
    if (!wrap) { if (t.samples.length < 4000) t.samples.push({ t: Math.round(performance.now() - t.t0), mono, term: false }); return }
    const host = wrap.querySelector('.terminal-screen__host') || wrap.firstElementChild
    const rows = wrap.querySelector('.xterm-rows'), screen = wrap.querySelector('.xterm-screen'), first = rows && rows.firstElementChild
    const s = { t: Math.round(performance.now() - t.t0), mono, term: true, rows: rows ? rows.children.length : 0, rowH: first ? +first.getBoundingClientRect().height.toFixed(1) : null, screen: screen ? rect(screen) : null, host: host ? rect(host) : null, wrapScrollTop: wrap.scrollTop, hostScrollTop: host ? host.scrollTop : null }
    const last = t.samples[t.samples.length - 1], key = JSON.stringify({ ...s, t: 0 })
    if (!last || last.key !== key) { s.key = key; if (t.samples.length < 4000) t.samples.push(s) }
  }, 25)
  return 'installed'
})()
