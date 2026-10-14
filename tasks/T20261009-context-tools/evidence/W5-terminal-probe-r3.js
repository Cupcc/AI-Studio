// W5 Part 2 复验：只读 DOM / computed style / 几何，供 W5-measure-r3.mjs 与截图像素合并。
// 用法：agent-browser eval --stdin < W5-terminal-probe-r3.js（只有一个 Project 打开时取第一个可见 .terminal-screen）。
(() => {
  const r1 = n => +n.toFixed(2)
  const rect = r => ({ x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height) })
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null)
  const q = (s, root = document) => root.querySelector(s)
  const visible = el => el && el.getBoundingClientRect().width > 0
  const root = document.documentElement
  const screen = [...document.querySelectorAll('.terminal-screen')].find(visible) || q('.terminal-screen')
  const xterm = q('.xterm', screen)
  const xscreen = q('.xterm-screen', screen)
  const scrollable = q('.xterm-scrollable-element', screen)
  const viewport = q('.xterm-viewport', screen)
  const rowsEl = q('.xterm-rows', screen)
  const area = screen ? screen.getBoundingClientRect() : null
  const inside = r => area && r.width > 0 && r.height > 0 && r.bottom > area.top && r.top < area.bottom
  const styled = el => !!el.querySelector('[class*="xterm-fg-"],[class*="xterm-bg-"],.xterm-bold,.xterm-inverse,.xterm-dim,.xterm-italic,.xterm-underline')
  const rows = [...screen.querySelectorAll('.xterm-rows > div')].flatMap((row, i) => {
    const text = row.textContent.replace(/\s+$/, '')
    if (!text.trim()) return []
    const range = document.createRange(); range.selectNodeContents(row)
    const r = range.getBoundingClientRect()
    if (!inside(r)) return []
    return [{ index: i, text, box: rect(r), rowBox: rect(row.getBoundingClientRect()), hasStyledSpan: styled(row), color: cs(row.querySelector('span') || row, 'color') }]
  })
  const spans = [...screen.querySelectorAll('.xterm-rows span')].flatMap(s => {
    if (!s.textContent.trim() || !/xterm-(fg|bg)-|xterm-(bold|italic|underline|dim|inverse)/.test(s.className)) return []
    const r = s.getBoundingClientRect()
    if (!inside(r)) return []
    return [{ text: s.textContent, cls: s.className, box: rect(r), color: cs(s, 'color'), background: cs(s, 'backgroundColor'), fontWeight: cs(s, 'fontWeight') }]
  })
  const cursor = q('.xterm-cursor', screen)
  const bars = [...screen.querySelectorAll('.xterm-scrollable-element > .scrollbar')].map(b => {
    const slider = q('.slider', b)
    return { cls: b.className, box: rect(b.getBoundingClientRect()), bg: cs(b, 'backgroundColor'), opacity: cs(b, 'opacity'), sliderBox: slider && rect(slider.getBoundingClientRect()), sliderBg: slider && cs(slider, 'backgroundColor') }
  })
  const firstRow = rowsEl && rowsEl.firstElementChild
  const lastRow = rowsEl && rowsEl.lastElementChild
  return JSON.stringify({
    attrs: { theme: root.dataset.theme, scheme: root.dataset.scheme, glassColor: root.dataset.glassColor },
    area: area && rect(area),
    styleElements: [...document.querySelectorAll('style')].map(s => ({ chars: s.textContent.length, head: s.textContent.slice(0, 60), hasSheet: !!s.sheet })),
    font: { family: cs(rowsEl, 'fontFamily'), size: cs(rowsEl, 'fontSize'), weight: cs(rowsEl, 'fontWeight'), color: cs(rowsEl, 'color') },
    backgrounds: { terminalScreen: cs(screen, 'backgroundColor'), xterm: cs(xterm, 'backgroundColor'), viewport: cs(viewport, 'backgroundColor'), scrollable: cs(scrollable, 'backgroundColor'), xtermScreen: cs(xscreen, 'backgroundColor') },
    geometry: {
      terminalScreen: area && rect(area), padding: [cs(screen, 'paddingTop'), cs(screen, 'paddingBottom')], overflow: cs(screen, 'overflow'),
      scrollTop: screen.scrollTop, scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight,
      xterm: xterm && rect(xterm.getBoundingClientRect()), xtermScreen: xscreen && rect(xscreen.getBoundingClientRect()),
      rowCount: rowsEl ? rowsEl.children.length : 0, firstRow: firstRow && rect(firstRow.getBoundingClientRect()), lastRow: lastRow && rect(lastRow.getBoundingClientRect())
    },
    xtermClass: xterm && xterm.className,
    cursor: cursor && { cls: cursor.className, box: rect(cursor.getBoundingClientRect()), background: cs(cursor, 'backgroundColor'), color: cs(cursor, 'color'), animationName: cs(cursor, 'animationName'), animationDuration: cs(cursor, 'animationDuration'), rowsClass: rowsEl && rowsEl.className },
    selectionLayer: [...screen.querySelectorAll('.xterm-selection div')].map(d => ({ box: rect(d.getBoundingClientRect()), background: cs(d, 'backgroundColor'), position: cs(d, 'position') })),
    scrollbars: bars,
    rows, spans
  })
})()
