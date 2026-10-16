// W17：Monaco 文字 span 探针（只读）。返回每个有字 span 的像素框与 computed 颜色，以及 diff 编辑器的插入 / 删除背景。
(() => {
  const ws = document.querySelector('.project-workspace:not([hidden])') || document
  const spans = []
  for (const s of ws.querySelectorAll('.monaco-editor .view-line > span > span')) {
    const text = s.textContent.replace(/ /g, ' ')
    if (!text.trim()) continue
    const b = s.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    spans.push({ text: text.slice(0, 24), cls: s.className, color: getComputedStyle(s).color, box: { x: b.x, y: b.y, w: b.width, h: b.height } })
  }
  const rect = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
  const diffBg = [...ws.querySelectorAll('.line-insert, .line-delete, .char-insert, .char-delete, .gutter-insert, .gutter-delete, .diff-hidden-lines, .inline-deleted-margin-view-zone')].slice(0, 60).map(e => ({ cls: String(e.className).slice(0, 60), bg: getComputedStyle(e).backgroundColor, box: rect(e) }))
  const editor = ws.querySelector('.monaco-editor')
  return JSON.stringify({
    attrs: { theme: document.documentElement.dataset.theme, scheme: document.documentElement.dataset.scheme, glass: document.documentElement.dataset.glassColor },
    editorBg: editor && getComputedStyle(editor).backgroundColor, editorClass: editor && String(editor.className).slice(0, 80),
    spans, diffBg
  })
})()
