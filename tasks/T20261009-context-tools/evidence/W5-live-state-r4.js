// W5 Part 3 复验：外观切换前后的屏幕状态快照（只读）：可见行文本、光标位置、滚动条拇指几何、几个代表性 computed 颜色。
(() => {
  const s = [...document.querySelectorAll('.terminal-screen')].find(e => e.getBoundingClientRect().width > 0)
  const rowsEl = s.querySelector('.xterm-rows'), root = document.documentElement
  const cur = s.querySelector('.xterm-cursor'), thumb = [...s.querySelectorAll('.xterm-scrollable-element .scrollbar.vertical .slider')].map(e => e.getBoundingClientRect()).find(r => r.height > 0)
  const track = [...s.querySelectorAll('.xterm-scrollable-element .scrollbar.vertical')].map(e => e.getBoundingClientRect()).find(r => r.height > 0)
  const span = txt => [...rowsEl.querySelectorAll('span')].find(e => e.textContent === txt)
  const col = (el, p) => el ? getComputedStyle(el)[p] : null
  const f = n => +n.toFixed(1)
  return JSON.stringify({
    attrs: { theme: root.dataset.theme, scheme: root.dataset.scheme, glassColor: root.dataset.glassColor },
    rowsText: [...rowsEl.children].map(r => r.textContent.replace(/\s+$/, '')).join('\n'),
    cursor: cur ? [f(cur.getBoundingClientRect().x), f(cur.getBoundingClientRect().y), col(cur, 'backgroundColor')] : null,
    thumb: thumb ? [f(thumb.y), f(thumb.height)] : null, track: track ? [f(track.y), f(track.height)] : null,
    colours: { defaultFg: col(rowsEl, 'color'), ansi1: col(span('ANSI-1'), 'color'), ansi4: col(span('ANSI-4'), 'color'), rev: col(span('REV-DEFAULT'), 'backgroundColor'), scrollable: col(s.querySelector('.xterm-scrollable-element'), 'backgroundColor') },
    wrapScrollTop: s.scrollTop
  })
})()
