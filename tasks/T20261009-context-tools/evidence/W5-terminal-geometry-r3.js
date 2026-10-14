// W5 Part 2 复验：Terminal 网格与容器的几何关系（只读）。clip 为 .terminal-screen（overflow:hidden）的上下边缘；
// overflowPx = 最后一行底边 - clip 底边（>0 表示被裁）；fullyVisibleRows = 完全位于 clip 内的行数。
(() => {
  const s = [...document.querySelectorAll('.terminal-screen')].find(e => e.getBoundingClientRect().width > 0)
  const rows = s.querySelector('.xterm-rows'), sr = s.getBoundingClientRect()
  const x = s.querySelector('.xterm').getBoundingClientRect(), g = rows.getBoundingClientRect()
  const last = rows.lastElementChild.getBoundingClientRect(), first = rows.firstElementChild.getBoundingClientRect()
  const cur = s.querySelector('.xterm-cursor'), cr = cur && cur.getBoundingClientRect()
  const visible = [...rows.children].filter(r => { const q = r.getBoundingClientRect(); return q.top >= sr.top - 0.5 && q.bottom <= sr.bottom + 0.5 }).length
  const f = n => +n.toFixed(1)
  return JSON.stringify({
    viewport: [innerWidth, innerHeight], clip: [f(sr.top), f(sr.bottom)], xtermContentHeight: f(x.height), rows: rows.children.length, rowHeight: f(first.height), gridHeight: f(g.height),
    overflowPx: f(last.bottom - sr.bottom), fullyVisibleRows: visible, hiddenOrClippedRows: rows.children.length - visible, scrollTop: s.scrollTop,
    cursorRow: cr && [f(cr.top), f(cr.bottom)], cursorFullyVisible: cr ? (cr.top >= sr.top - 0.5 && cr.bottom <= sr.bottom + 0.5) : null, lastRowText: rows.lastElementChild.textContent.trim().slice(0, 16)
  })
})()
