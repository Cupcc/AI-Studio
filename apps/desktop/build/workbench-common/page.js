(() => {
  'use strict';
  const root = document.getElementById('workbench-root');
  const status = document.createElement('p'); status.className = 'page-status muted'; status.setAttribute('role', 'status');
  const error = document.createElement('div'); error.className = 'view-preview-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  const content = document.createElement('div'); content.className = 'view-preview-document';
  const sessions = document.createElement('div'); sessions.className = 'view-client-sessions'; sessions.setAttribute('aria-label', '项目 Session 摘要'); sessions.hidden = true;
  root.append(status, error, content, sessions);
  let lastAttempt = null, lastDocument = null, renderFailure = null, latest = null, subscriptionRevision = 0;
  function text(tag, value, className) {
    const node = document.createElement(tag); node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function showError(title, message) {
    error.replaceChildren(text('strong', title));
    if (message) error.append(text('p', message));
    if (lastDocument) error.append(text('p', '仍显示上一版有效内容。请在左侧对话中修正文件。'));
    error.hidden = false;
  }
  function applyAppearance(appearance) {
    if (!appearance) return;
    document.documentElement.dataset.scheme = appearance.dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = appearance.dark ? 'dark' : 'light';
    for (const [name, value] of Object.entries(appearance.variables)) document.documentElement.style.setProperty(name, value);
  }
  function renderSessions(items) {
    if (!document.body.hasAttribute('data-sessions') || !items) { sessions.hidden = true; return; }
    const sorted = [...items].sort((a, b) => b.lastUserMessageAt - a.lastUserMessageAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const groups = [
      ['Recent Sessions', sorted.slice(0, 3)],
      ['Needs Input', sorted.filter(item => item.activity === 'needs_input').slice(0, 3)],
      ['Recently Completed', sorted.filter(item => item.lastOutcome === 'completed' || item.status === 'completed_unread').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)]
    ];
    const fragment = document.createDocumentFragment();
    for (const [title, entries] of groups) {
      const section = text('section', ''); section.append(text('h3', title));
      if (!entries.length) section.append(text('p', '暂无', 'muted'));
      for (const item of entries) {
        const button = text('button', item.title, 'view-session-link'); button.type = 'button';
        button.onclick = () => window.workbench.openSession(item.id).catch(failure => showError('无法打开对话', failure.message));
        section.append(button);
      }
      fragment.append(section);
    }
    sessions.replaceChildren(fragment); sessions.hidden = false;
  }
  function render(snapshot) {
    latest = snapshot; applyAppearance(snapshot.appearance); renderSessions(snapshot.resources?.sessions);
    const state = snapshot.resources?.knowledge;
    if (!state) { status.textContent = '正在读取项目知识…'; return; }
    const documentSnapshot = state.snapshot;
    status.textContent = state.status === 'loading' ? '正在读取…' : state.status === 'stale' ? '更新中…' : documentSnapshot ? `更新于 ${new Date(documentSnapshot.updatedAt).toLocaleTimeString()}` : '只读 Preview';
    error.hidden = true;
    if (state.error) showError('无法更新此工作台', state.error);
    const identity = documentSnapshot ? `${state.projectId}:${state.viewId}:${documentSnapshot.revision}` : null;
    if (documentSnapshot && identity !== lastAttempt) {
      lastAttempt = identity; renderFailure = null;
      try {
        if (window.WorkbenchDocument.hasRenderableContent(documentSnapshot.knowledge, documentSnapshot.definition)) {
          const next = window.WorkbenchDocument.renderDocument(documentSnapshot);
          content.replaceChildren(next); lastDocument = documentSnapshot;
          return;
        }
        lastDocument = null;
      } catch (failure) { renderFailure = failure.message; showError('工作台渲染失败，保留上一版。', renderFailure); return; }
    }
    if (renderFailure) { showError('工作台渲染失败，保留上一版。', renderFailure); return; }
    if (lastDocument || state.status === 'loading' || state.status === 'error') return;
    const empty = text('div', '', 'view-empty'), title = snapshot.manifest.title;
    empty.append(text('h2', title), text('p', '尚无项目知识。生成指令会填入左侧草稿，由你确认发送。'));
    const button = text('button', `生成 ${title}`, 'primary-button'); button.type = 'button';
    button.onclick = () => window.workbench.setDraft(`请根据当前项目的实际文件生成 ${latest.manifest.title}，更新对应的 Project Knowledge；如需调整呈现，再更新 View Definition。不要编造事实。`, { target: 'new' }).catch(failure => showError('无法填写对话草稿', failure.message));
    empty.append(button); content.replaceChildren(empty);
  }
  const unsubscribe = window.workbench.subscribe(snapshot => { subscriptionRevision++; render(snapshot); });
  const initialRevision = subscriptionRevision;
  window.workbench.getInstance().then(snapshot => { if (subscriptionRevision === initialRevision) render(snapshot); }).catch(failure => showError('无法读取工作台', failure.message));
  window.addEventListener('pagehide', unsubscribe, { once: true });
})();
