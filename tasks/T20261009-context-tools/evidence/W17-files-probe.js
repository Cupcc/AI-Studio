// W17：Files 面板只读探针（agent-browser eval --stdin）。返回树行、roving tabindex、焦点、查看器与 Monaco 的摘要。
(() => {
  const ws = document.querySelector('.project-workspace:not([hidden])') || document
  const tree = ws.querySelector('[role="tree"]')
  const rows = tree ? [...tree.querySelectorAll('[role="treeitem"]')].map(r => ({
    name: (r.querySelector('.files-row__name') || r).textContent.trim().slice(0, 60), kind: r.dataset.kind || 'note', level: r.getAttribute('aria-level'),
    expanded: r.getAttribute('aria-expanded'), selected: r.getAttribute('aria-selected'), tabindex: r.getAttribute('tabindex'), disabled: r.getAttribute('aria-disabled'),
    title: r.getAttribute('title'), pos: r.getAttribute('aria-posinset') + '/' + r.getAttribute('aria-setsize'), badge: (r.querySelector('.files-row__badge') || {}).textContent || null
  })) : null
  const viewer = ws.querySelector('[aria-label="文件查看器"]')
  const mon = ws.querySelector('.monaco-editor')
  const active = document.activeElement
  const out = {
    treeAria: tree && { label: tree.getAttribute('aria-label'), busy: tree.getAttribute('aria-busy') },
    rowCount: rows && rows.length, rows,
    tabStops: rows && rows.filter(r => r.tabindex === '0').map(r => r.name),
    focus: active && { tag: active.tagName, role: active.getAttribute('role'), text: (active.textContent || '').trim().slice(0, 40), cls: String(active.className).slice(0, 60) },
    watchBadge: (ws.querySelector('.files-watch') || {}).textContent || null,
    viewer: viewer && {
      name: (viewer.querySelector('.files-viewer__name') || {}).textContent, meta: (viewer.querySelector('.files-viewer__meta') || {}).textContent,
      message: (viewer.querySelector('.files-viewer__message') || {}).textContent, unavailable: (viewer.querySelector('.files-viewer__unavailable') || {}).textContent || null,
      reason: (viewer.querySelector('.files-viewer__unavailable') || { dataset: {} }).dataset.reason || null,
      addButton: !![...viewer.querySelectorAll('button')].find(b => b.textContent.trim() === '添加到对话'), plain: !!viewer.querySelector('.files-viewer__plain')
    },
    monaco: mon && (() => {
      const line = mon.querySelector('.view-line'), ln = mon.querySelector('.line-numbers')
      const spans = [...mon.querySelectorAll('.view-line span span')]
      const colours = new Set(spans.map(s => getComputedStyle(s).color))
      return { fontFamily: line && getComputedStyle(line).fontFamily, fontSize: line && getComputedStyle(line).fontSize, lineNumbers: !!ln, firstLineNumber: ln && ln.textContent,
        distinctTokenColours: colours.size, readOnly: !!mon.querySelector('textarea[readonly], .monaco-editor.no-user-select') || null,
        viewLines: mon.querySelectorAll('.view-line').length, text: [...mon.querySelectorAll('.view-line')].slice(0, 3).map(l => l.textContent).join(' | ').slice(0, 160) }
    })(),
    composerTags: [...document.querySelectorAll('.composer__tag')].map(t => ({ text: t.textContent.trim().slice(0, 40), title: t.getAttribute('title') }))
  }
  return JSON.stringify(out)
})()
