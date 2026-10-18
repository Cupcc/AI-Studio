// W5 Part 6 复验：在 W5-terminal-probe-r4.js 基础上扩展，适配 `style-src-attr` 放宽与 minimumContrastRatio 之后的 DOM：
//   - spans 不再只收带 xterm-fg- / xterm-bg- 类的元素，凡是带 `style` 属性（24 位色、对比度调整）或这些类的有字的 span 都收，
//     并给出 `style` 属性原文、computed color / background-color / text-decoration-color、行序号与列估计。
//   - 其余字段与 r4 一致，可以直接交给 W5-measure-r3.mjs（回归矩阵）或 W5-measure-r7.mjs（色块扫描）。
// 只读，不改变页面。
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
  const measureEl = q('.xterm-char-measure-element', screen)
  const cellW = measureEl ? measureEl.getBoundingClientRect().width / 32 : 0
  const styled = el => !!el.querySelector('[class*="xterm-fg-"],[class*="xterm-bg-"],.xterm-bold,.xterm-inverse,.xterm-dim,.xterm-italic,.xterm-underline,[style]')
  const rowEls = [...screen.querySelectorAll('.xterm-rows > div')]
  const rows = rowEls.flatMap((row, i) => {
    const text = row.textContent.replace(/\s+$/, '')
    if (!text.trim()) return []
    const range = document.createRange(); range.selectNodeContents(row)
    const r = range.getBoundingClientRect()
    if (!inside(r)) return []
    return [{ index: i, text, box: rect(r), rowBox: rect(row.getBoundingClientRect()), hasStyledSpan: styled(row), color: cs(row.querySelector('span') || row, 'color') }]
  })
  const spans = rowEls.flatMap((row, i) => [...row.querySelectorAll('span')].flatMap(s => {
    if (!s.textContent.trim()) return []
    const hasStyle = s.hasAttribute('style')
    if (!hasStyle && !/xterm-(fg|bg)-|xterm-(bold|italic|underline|dim|inverse|strikethrough|overline|hidden)/.test(s.className)) return []
    const r = s.getBoundingClientRect()
    if (!inside(r)) return []
    const rr = row.getBoundingClientRect()
    return [{
      row: i, col: cellW ? Math.round((r.left - rr.left) / cellW) : null, text: s.textContent, cls: s.className, style: s.getAttribute('style'), box: rect(r),
      color: cs(s, 'color'), background: cs(s, 'backgroundColor'), fontWeight: cs(s, 'fontWeight'), opacity: cs(s, 'opacity'),
      decoLine: cs(s, 'textDecorationLine'), decoColor: cs(s, 'textDecorationColor'), decoStyle: cs(s, 'textDecorationStyle'), fontStyle: cs(s, 'fontStyle')
    }]
  }))
  const cursor = q('.xterm-cursor', screen)
  const bars = [...screen.querySelectorAll('.xterm-scrollable-element > .scrollbar')].map(b => {
    const slider = q('.slider', b)
    return { cls: b.className, box: rect(b.getBoundingClientRect()), bg: cs(b, 'backgroundColor'), opacity: cs(b, 'opacity'), sliderBox: slider && rect(slider.getBoundingClientRect()), sliderBg: slider && cs(slider, 'backgroundColor') }
  })
  const host = q('.terminal-screen__host', screen) || (screen && screen.firstElementChild)
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
    host: host && { cls: host.className, box: rect(host.getBoundingClientRect()), overflow: cs(host, 'overflow'), scrollTop: host.scrollTop, scrollHeight: host.scrollHeight, clientHeight: host.clientHeight },
    fonts: { status: document.fonts.status, mono },
    cell: { cellWidthEstimate: r1(cellW), rowHeight: firstRow && r1(firstRow.getBoundingClientRect().height) },
    computedTransparent: { viewport: cs(viewport, 'backgroundColor'), scrollable: cs(scrollable, 'backgroundColor'), scrollableInline: scrollable && scrollable.getAttribute('style') },
    cursor: cursor && { cls: cursor.className, box: rect(cursor.getBoundingClientRect()), background: cs(cursor, 'backgroundColor'), color: cs(cursor, 'color'), animationName: cs(cursor, 'animationName'), animationDuration: cs(cursor, 'animationDuration'), rowsClass: rowsEl && rowsEl.className },
    selectionLayer: [...screen.querySelectorAll('.xterm-selection div')].map(d => ({ box: rect(d.getBoundingClientRect()), background: cs(d, 'backgroundColor'), position: cs(d, 'position') })),
    helperTextarea: (t => t ? { valueLength: t.value.length, value: t.value.slice(0, 200) } : null)(q('.xterm-helper-textarea', screen)),
    scrollbars: bars,
    rows, spans
  })
})()
