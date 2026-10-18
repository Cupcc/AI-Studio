// W5 Part 2 复验：找出带 style 属性、但声明未在 computed style 中生效的元素（即被 style-src-attr 阻断的内联声明）。只读。
(() => {
  const tmp = document.createElement('div')
  const out = []
  for (const el of document.querySelectorAll('[style]')) {
    const text = el.getAttribute('style')
    tmp.style.cssText = text           // CSSOM 赋值不受 style-src-attr 限制，仅用于解析声明
    const cs = getComputedStyle(el), bad = []
    for (let i = 0; i < tmp.style.length; i++) {
      const prop = tmp.style[i], want = tmp.style.getPropertyValue(prop), got = cs.getPropertyValue(prop)
      // 对已解析为 px / 颜色的值比较；auto / normal 等不可比较的跳过
      if (/^-?[\d.]+px$/.test(want) || /^rgb/.test(want)) { if (got !== want) bad.push({ prop, want, got }) }
    }
    if (bad.length) out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 70), style: text.slice(0, 140), mismatches: bad.slice(0, 6), rect: (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(el.getBoundingClientRect()) })
  }
  return JSON.stringify({ elementsWithStyleAttr: document.querySelectorAll('[style]').length, mismatched: out })
})()
