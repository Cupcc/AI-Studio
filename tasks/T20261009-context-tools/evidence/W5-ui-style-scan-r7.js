// W5 Part 6 复验：应用 UI（终端以外）里的 style 属性：数量、样式文本、以及声明是否在 computed style 中生效。只读。
// 与 W5-style-attr-scan-r3.js 的区别：排除 .terminal-screen（xterm 的 style 属性是预期的），并列出元素明细，供对照 CSP 放宽前后 UI 有无差异。
(() => {
  const tmp = document.createElement('div')
  const els = [...document.querySelectorAll('[style]')].filter(e => !e.closest('.terminal-screen'))
  const items = els.map(el => {
    const text = el.getAttribute('style'); tmp.style.cssText = text
    const cs = getComputedStyle(el), bad = []
    for (let i = 0; i < tmp.style.length; i++) {
      const p = tmp.style[i], want = tmp.style.getPropertyValue(p), got = cs.getPropertyValue(p)
      if (/^-?[\d.]+px$/.test(want) || /^rgb/.test(want)) { if (got !== want) bad.push({ p, want, got }) }
    }
    return { tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 50), role: el.getAttribute('role'), style: text.slice(0, 120), mismatches: bad }
  })
  return JSON.stringify({ count: items.length, mismatched: items.filter(i => i.mismatches.length).length, items: items.slice(0, 12) })
})()
