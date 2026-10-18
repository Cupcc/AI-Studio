// W17：Diff 面板只读探针。返回头部、计数、横幅、文件列表（aria-label 即读屏名称）、单文件视图与 Monaco diff 摘要。
(() => {
  const ws = document.querySelector('.project-workspace:not([hidden])') || document
  const tool = ws.querySelector('.diff-tool')
  if (!tool) return JSON.stringify({ error: 'no diff tool' })
  const txt = e => e ? e.textContent.replace(/\s+/g, ' ').trim() : null
  const rows = [...tool.querySelectorAll('[role=option]')].map(r => ({ label: r.getAttribute('aria-label'), selected: r.getAttribute('aria-selected'), tabindex: r.getAttribute('tabindex'), badge: txt(r.querySelector('.diff-badge')), counts: txt(r.querySelector('.diff-row__counts')), tags: txt(r.querySelector('.diff-row__tags')), rename: txt(r.querySelector('.diff-row__rename')), title: r.getAttribute('title') }))
  const file = tool.querySelector('.diff-file')
  const mon = tool.querySelector('.monaco-diff-editor')
  return JSON.stringify({
    title: txt(tool.querySelector('.diff-header__title')), meta: txt(tool.querySelector('.diff-header__meta')),
    banners: [...tool.querySelectorAll('.diff-banner')].map(b => ({ cls: b.className.replace('diff-banner', '').trim(), text: txt(b) })),
    state: txt(tool.querySelector('.diff-state')), stateTitle: txt(tool.querySelector('.diff-state h3')),
    rowCount: rows.length, rows, tabStops: rows.filter(r => r.tabindex === '0').map(r => r.title),
    file: file && { label: file.getAttribute('aria-label'), header: txt(file.querySelector('.diff-file__header')), notes: [...file.querySelectorAll('.diff-note')].map(n => txt(n)), patch: !!file.querySelector('.diff-patch'), patchLines: file.querySelectorAll('.diff-patch__line').length, monaco: !!mon, busy: file.getAttribute('aria-busy') },
    monaco: mon && { lineInsert: mon.querySelectorAll('.line-insert').length, lineDelete: mon.querySelectorAll('.line-delete').length, charInsert: mon.querySelectorAll('.char-insert').length, charDelete: mon.querySelectorAll('.char-delete').length, readOnly: !!mon.querySelector('.editor.original, .editor.modified'), sides: mon.querySelectorAll('.monaco-editor').length, text: [...mon.querySelectorAll('.view-line')].slice(0, 6).map(l => l.textContent.replace(/ /g, ' ')).join(' | ').slice(0, 220) }
  })
})()
