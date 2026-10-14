// W5 Part 3 复验：在 W5-terminal-probe-r3.js 基础上增加 host（xterm 的无内边距挂载点）、overflow、字体状态与滚动条轨道几何。
// 输出是 r3 字段的超集，可直接交给 W5-measure-r3.mjs。只读，不改变页面。
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
  const host = q('.terminal-screen__host', screen) || (screen && screen.firstElementChild)
  const measureEl = q('.xterm-char-measure-element', screen)
  const mono = [...document.fonts].filter(f => f.family.includes('Mono')).map(f => `${f.weight}:${f.status}`)
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
    host: host && { cls: host.className, box: rect(host.getBoundingClientRect()), overflow: cs(host, 'overflow'), padding: [cs(host, 'paddingTop'), cs(host, 'paddingBottom'), cs(host, 'paddingLeft'), cs(host, 'paddingRight')], scrollTop: host.scrollTop, scrollLeft: host.scrollLeft, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight },
    wrapper: screen && { cls: screen.className, overflow: cs(screen, 'overflow'), padding: [cs(screen, 'paddingTop'), cs(screen, 'paddingBottom'), cs(screen, 'paddingLeft'), cs(screen, 'paddingRight')], scrollTop: screen.scrollTop, scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight },
    fonts: { status: document.fonts.status, mono },
    cell: { measureWidth: measureEl && r1(measureEl.getBoundingClientRect().width), measureHeight: measureEl && r1(measureEl.getBoundingClientRect().height), cellWidthEstimate: measureEl && r1(measureEl.getBoundingClientRect().width / 32), rowHeight: firstRow && r1(firstRow.getBoundingClientRect().height) },
    computedTransparent: { viewport: cs(viewport, 'backgroundColor'), scrollable: cs(scrollable, 'backgroundColor'), scrollableInline: scrollable && scrollable.getAttribute('style') },
    cursor: cursor && { cls: cursor.className, box: rect(cursor.getBoundingClientRect()), background: cs(cursor, 'backgroundColor'), color: cs(cursor, 'color'), animationName: cs(cursor, 'animationName'), animationDuration: cs(cursor, 'animationDuration'), rowsClass: rowsEl && rowsEl.className },
    selectionLayer: [...screen.querySelectorAll('.xterm-selection div')].map(d => ({ box: rect(d.getBoundingClientRect()), background: cs(d, 'backgroundColor'), position: cs(d, 'position') })),
    scrollbars: bars,
    rows, spans
  })
})()
