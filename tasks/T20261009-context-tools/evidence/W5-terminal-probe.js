// W5 Part 1 复验：在 Renderer 内只读取 DOM / computed style / 几何信息（不改变页面状态），
// 供 W5-measure.mjs 与截图像素一起计算对比度。用法：agent-browser eval --stdin < W5-terminal-probe.js
(() => {
  const r1 = n => +n.toFixed(1)
  const rect = r => ({ x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height) })
  const css = (el, p) => (el ? getComputedStyle(el)[p] : null)
  const q = s => document.querySelector(s)
  const root = document.documentElement
  const screen = q('.terminal-screen')
  const xterm = q('.terminal-screen .xterm')
  const viewport = q('.terminal-screen .xterm-viewport')
  const scrollable = q('.terminal-screen .xterm-scrollable-element')
  const xscreen = q('.terminal-screen .xterm-screen')
  const area = screen ? screen.getBoundingClientRect() : null
  const inside = r => area && r.width > 0 && r.height > 0 && r.bottom > area.top && r.top < area.bottom
  const rows = [...document.querySelectorAll('.terminal-screen .xterm-rows > div')].flatMap((row, i) => {
    const text = row.textContent.replace(/\s+$/, '')
    if (!text.trim()) return []
    const range = document.createRange(); range.selectNodeContents(row)
    const r = range.getBoundingClientRect()
    if (!inside(r)) return []
    const first = row.querySelector('span')
    return [{ index: i, text, box: rect(r), color: css(first || row, 'color') }]
  })
  const spans = [...document.querySelectorAll('.terminal-screen .xterm-rows span')].flatMap(s => {
    if (!/xterm-(fg|bg)-|xterm-(bold|italic|underline|dim|inverse)/.test(s.className) || !s.textContent.trim()) return []
    const r = s.getBoundingClientRect()
    if (!inside(r)) return []
    return [{ text: s.textContent, cls: s.className, box: rect(r), color: css(s, 'color'), background: css(s, 'backgroundColor') }]
  })
  const cursor = q('.terminal-screen .xterm-cursor')
  const slider = q('.terminal-screen .xterm-scrollable-element > .scrollbar > .slider')
  const bars = [...document.querySelectorAll('.terminal-screen .xterm-scrollable-element > .scrollbar')].map(b => ({ cls: b.className, box: rect(b.getBoundingClientRect()), bg: css(b, 'backgroundColor'), opacity: css(b, 'opacity') }))
  return JSON.stringify({
    attrs: { theme: root.dataset.theme, scheme: root.dataset.scheme, glassColor: root.dataset.glassColor },
    cssVars: Object.fromEntries(['--color-pane', '--color-text', '--color-selected'].map(v => [v, getComputedStyle(root).getPropertyValue(v).trim()])),
    area: area && rect(area),
    backgrounds: { terminalScreen: css(screen, 'backgroundColor'), xterm: css(xterm, 'backgroundColor'), viewport: css(viewport, 'backgroundColor'), scrollable: css(scrollable, 'backgroundColor'), xtermScreen: css(xscreen, 'backgroundColor'), scrollableInline: scrollable && scrollable.getAttribute('style'), viewportInline: viewport && viewport.getAttribute('style') },
    cursor: cursor && { cls: cursor.className, box: rect(cursor.getBoundingClientRect()), background: css(cursor, 'backgroundColor'), color: css(cursor, 'color'), outline: css(cursor, 'outlineStyle') },
    selectionLayer: [...document.querySelectorAll('.terminal-screen .xterm-selection div')].map(d => ({ box: rect(d.getBoundingClientRect()), background: css(d, 'backgroundColor'), position: css(d, 'position') })),
    scrollbars: bars,
    slider: slider && { box: rect(slider.getBoundingClientRect()), bg: css(slider, 'backgroundColor') },
    styleElementsApplied: [...document.querySelectorAll('style')].map(s => !!s.sheet),
    rows, spans
  })
})()
