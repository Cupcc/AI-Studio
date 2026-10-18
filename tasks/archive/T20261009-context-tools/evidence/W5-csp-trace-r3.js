// W5 Part 2 复验：只观察，不改变页面行为。记录 securitypolicyviolation 的来源位置，
// 并包装 Element.prototype.setAttribute 只在 name==='style' 时记录调用栈后原样转发，用于定位 style-src-attr 违规的代码来源。
(() => {
  if (window.__w5csp) return 'already installed'
  const t = window.__w5csp = { violations: [], styleSetAttribute: [] }
  document.addEventListener('securitypolicyviolation', e => t.violations.push({
    directive: e.violatedDirective, effective: e.effectiveDirective, blocked: e.blockedURI, file: (e.sourceFile || '').split('/').pop(), line: e.lineNumber, col: e.columnNumber,
    sample: e.sample, disposition: e.disposition, t: Math.round(performance.now())
  }))
  const orig = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === 'style' && t.styleSetAttribute.length < 400) {
      const frames = (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().replace(/^at /, '').replace(/\(?[^()\s]*\/assets\//, '('))
      t.styleSetAttribute.push({ tag: this.tagName.toLowerCase(), cls: String(this.className || '').slice(0, 60), value: String(value).slice(0, 100), frames, t: Math.round(performance.now()) })
    }
    return orig.call(this, name, value)
  }
  return 'installed'
})()
