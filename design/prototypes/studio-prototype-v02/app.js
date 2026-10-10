/* AI Developer Studio 原型 v02 — 状态、事件与 Agent 运行模拟。 */
(function () {
  var D = window.PD, R = window.R, ST, runs = {}, raf = 0, lastKey = null, toastT = 0, copyT = 0;
  var composing = false, pendingRender = false, rendering = false;

  function init() {
    Object.keys(runs).forEach(function (k) { clearTimeout(runs[k].timer); });
    runs = {};
    ST = window.ST = D.seed();
    ST.pop = null; ST.dlg = null; ST.renaming = null; ST.demoOpen = false; ST.toast = null; ST.focus = null; ST.v01 = false; ST.copied = null;
    Object.keys(ST.sessions).forEach(function (id) {
      var s = ST.sessions[id];
      if (s.run && (s.status === 'running' || s.status === 'needs')) {
        runs[id] = { steps: s.run, i: 0, timer: null };
        if (s.status === 'running') step(id);
      }
    });
    render();
  }

  /* ---------- 渲染 ---------- */
  /* 输入法组合输入期间不重绘，避免打断中文输入 */
  function render() { if (composing) { pendingRender = true; return; } if (!raf) raf = requestAnimationFrame(doRender); }
  function convKey(p) { return p ? p.id + ':' + p.ui.mode + ':' + (R.viewingSid(p) || p.ui.viewId) : 'launch'; }
  function markViewed() {
    var p = R.proj(), sid = R.viewingSid(p);
    if (!sid) return;
    var s = ST.sessions[sid];
    s.unread = false;
    if (s.status === 'error') s.status = null;
  }
  function doRender() {
    raf = 0;
    if (composing) { pendingRender = true; return; }
    var app = document.getElementById('app'), ae = document.activeElement, aid = ae && ae.id;
    var selS = ae && ae.selectionStart, selE = ae && ae.selectionEnd;
    var feed = document.getElementById('feed');
    var atBottom = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40, prevTop = feed ? feed.scrollTop : 0;
    var keep = Array.prototype.map.call(app.querySelectorAll('.nav-scroll,.scroll'), function (e) { return e.scrollTop; });
    markViewed();
    var p = R.proj(), key = convKey(p);
    rendering = true;
    app.classList.toggle('v01', !!ST.v01);
    app.innerHTML = R.app();
    rendering = false;
    Array.prototype.forEach.call(app.querySelectorAll('.nav-scroll,.scroll'), function (e, i) { if (keep[i] != null) e.scrollTop = keep[i]; });
    var nf = document.getElementById('feed');
    if (nf) nf.scrollTop = (atBottom || key !== lastKey) ? nf.scrollHeight : prevTop;
    lastKey = key;
    var term = document.getElementById('term');
    if (term) term.scrollTop = term.scrollHeight;
    Array.prototype.forEach.call(app.querySelectorAll('textarea[data-input]'), autosize);
    var fid = ST.focus || aid;
    ST.focus = null;
    if (fid) {
      var el = document.getElementById(fid);
      if (el) {
        el.focus({ preventScroll: true });
        if (fid === aid && selS != null && el.setSelectionRange) { try { el.setSelectionRange(selS, selE); } catch (e) { /* 非文本输入 */ } }
      }
    }
    if (ST.renaming) { var ri = document.getElementById('ren-input'); if (ri && document.activeElement !== ri) { ri.focus(); ri.select(); } }
  }
  function autosize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 176) + 'px'; }
  function toast(t) { ST.toast = t; render(); clearTimeout(toastT); toastT = setTimeout(function () { ST.toast = null; render(); }, 2400); }

  /* ---------- Agent 运行模拟 ---------- */
  function startRun(s, steps) {
    if (runs[s.id]) clearTimeout(runs[s.id].timer);
    s.status = 'running'; s.roundStart = Date.now();
    runs[s.id] = { steps: steps, i: 0, timer: null };
    step(s.id);
  }
  function next(sid, ms) { var r = runs[sid]; if (r) r.timer = setTimeout(function () { step(sid); }, ms); }
  function step(sid) {
    var r = runs[sid], s = ST.sessions[sid];
    if (!r || !s) return;
    if (r.pending) { r.steps.splice(r.i, 0, r.pending); r.pending = null; }
    if (r.i >= r.steps.length) { delete runs[sid]; return; }
    var st = r.steps[r.i++];
    if (st.t === 'wait') return next(sid, st.ms);
    if (st.t === 'tool') { s.msgs.push({ role: 'tool', text: st.text }); render(); return next(sid, 550); }
    if (st.t === 'say') {
      var m = { role: 'agent', text: '', streaming: true }, pos = 0;
      s.msgs.push(m); r.streaming = true;
      (function tick() {
        pos += Math.max(3, Math.ceil(st.text.length / 90)); m.text = st.text.slice(0, pos); render();
        if (pos < st.text.length) r.timer = setTimeout(tick, 60);
        else { m.streaming = false; r.streaming = false; render(); next(sid, 400); }
      })();
      return;
    }
    if (st.t === 'need') { s.msgs.push({ role: 'need', text: st.text, cmd: st.cmd, opts: st.opts }); s.status = 'needs'; render(); return; }
    if (st.t === 'kn') { applyKnowledge(s.p, st); render(); return next(sid, 300); }
    if (st.t === 'error') { s.msgs.push({ role: 'error', text: st.text, detail: st.detail }); s.status = 'error'; delete runs[sid]; render(); return; }
    if (st.t === 'done') {
      var p = ST.projects[s.p];
      s.msgs.push({ role: 'done', dur: (Date.now() - s.roundStart) / 1000, files: st.files || [] });
      s.status = null; addDiff(p, st.files || []);
      s.unread = !(R.proj() === p && R.viewingSid(p) === s.id);
      delete runs[sid]; render();
    }
  }
  function stopRun(s, note) {
    var r = runs[s.id];
    if (r) { clearTimeout(r.timer); delete runs[s.id]; }
    s.msgs.forEach(function (m) { if (m.streaming) m.streaming = false; if (m.role === 'need' && !m.answer) m.answer = note || '已停止'; });
    if (s.status === 'running' || s.status === 'needs') { s.status = null; s.msgs.push({ role: 'stopped' }); }
  }
  function addDiff(p, files) {
    files.forEach(function (f) {
      if (p.diff.some(function (d) { return d.f === f; })) return;
      p.diff.push({ f: f, s: 'M', a: 12, d: 3, hunk: [[' ', '// ' + f], ['-', '// 修改前的实现'], ['+', '// Agent 本轮修改的内容（原型示例）'], [' ', '']] });
    });
  }
  function applyKnowledge(pid, st) {
    var p = ST.projects[pid], v = st.view, k = p.k[v];
    if (st.op === 'gen') {
      var G = {
        overview: { summary: p.name + ' 的项目概况：根据 README 与代码结构生成。', stack: ['TypeScript', 'Node.js'], pct: 30, focus: '根据最近的对话与提交总结', arch: '单一 Web 应用，依赖少量外部服务。', agents: '尚未在 CLI 中配置专门的 Agent 规则。', notes: [] },
        progress: { stage: '早期开发', pct: 30, ms: [{ t: '项目初始化', done: true }, { t: '核心功能', now: true }, { t: '首次发布' }], next: ['补齐核心功能', '完善 README'], notes: [] },
        architecture: { layers: [['客户端', [['Web App', '用户界面']]], ['服务', [['API', '业务接口']]], ['数据', [['Database', '数据存储']]]], notes: [] },
        agents: { list: [{ name: 'Codex', role: '通用开发', src: ['AGENTS.md（如存在）'] }], notes: [] },
        flow: { steps: ['访问', '注册', '使用核心功能'], focus: 2, map: [['Trigger', '用户打开功能入口'], ['Frontend', '待 Agent 识别'], ['API', '待 Agent 识别'], ['Service', '待 Agent 识别'], ['Data', '待 Agent 识别'], ['Result', '完成核心操作']], notes: [] }
      };
      k = p.k[v] = G[v];
    } else if (st.op === 'split') k.split = true;
    else if (st.op === 'note') k.notes.unshift('“' + st.text + '”');
    k.updated = Date.now();
  }
  function scriptFor(p, s, text, vid) {
    var cli = D.CLI[s.cli].short, steps = [{ t: 'wait', ms: 700 }];
    if (vid) {
      var k = p.k[vid], name = R.viewName(vid);
      if (!k) {
        steps.push({ t: 'tool', text: 'Read  README.md\nRead  package.json' }, { t: 'say', text: '已根据代码和文档生成 ' + name + '，结果写入 Project Knowledge，右侧 Preview 已更新。' },
          { t: 'kn', view: vid, op: 'gen' }, { t: 'tool', text: '✓ 写入 Project Knowledge · ' + vid + '\n✓ 生成 ' + name + ' View' }, { t: 'done', files: [] });
      } else if (vid === 'architecture' && !k.layers && !k.split && /拆|Billing|Webhook|支付/i.test(text)) {
        steps.push({ t: 'tool', text: 'Read  services/payment/index.ts\nRead  apps/api/routes/stripe.ts' },
          { t: 'say', text: '已将 Payment Service 拆分为 Billing Service 与 Webhook Service：Stripe 回调统一进入 Webhook Service，校验签名后交给 Billing Service 更新订阅状态。需要我同步调整代码目录结构吗？' },
          { t: 'kn', view: vid, op: 'split' }, { t: 'tool', text: '✓ 更新 Project Knowledge · architecture\n✓ 重新生成 Architecture View' }, { t: 'done', files: [] });
      } else {
        steps.push({ t: 'tool', text: 'Read  Project Knowledge · ' + vid }, { t: 'say', text: '已按你的要求更新 ' + name + '。（原型模拟回复：真实产品中由 ' + cli + ' 修改 Project Knowledge 并重新生成 View。）' },
          { t: 'kn', view: vid, op: 'note', text: text }, { t: 'tool', text: '✓ 更新 Project Knowledge · ' + vid }, { t: 'done', files: [] });
      }
      return steps;
    }
    var file = p.id === 'my-saas' ? 'services/payment/index.ts' : 'README.md';
    steps.push({ t: 'tool', text: 'Read  README.md' }, { t: 'say', text: '收到。我先看了 `README.md` 和相关目录，准备这样做：\n\n1. 找到与需求相关的模块；\n2. 修改实现并补充测试；\n3. 运行测试确认没有回归。\n\n（原型模拟回复：真实产品中这里是 ' + cli + ' 的流式输出。）' });
    if (/测试|test|运行|安装|部署/i.test(text)) {
      steps.push({ t: 'need', text: cli + ' 请求运行命令：', cmd: 'pnpm test', opts: ['允许', '拒绝'] }, { t: 'tool', text: 'Run   pnpm test' },
        { t: 'say', text: '测试已运行完成：\n\n| 测试集 | 通过 | 失败 |\n|---|---:|---:|\n| unit | 42 | 0 |\n| e2e | 8 | 0 |' });
    }
    steps.push({ t: 'wait', ms: 1800 }, { t: 'say', text: '### 本轮修改\n\n- `' + file + '`：按需求调整实现，公共接口不变。\n- 补充了对应的单元测试。\n\n```ts\n// ' + file + '\nexport async function handle(input: string) {\n  const result = await run(input);\n  return { ok: true, result };\n}\n```\n\n可以在右侧 **Diff** 中查看完整变更。' }, { t: 'done', files: [file] });
    return steps;
  }
  function backgroundRun() {
    var p = R.proj(), viewing = R.viewingSid(p), best = null;
    Object.keys(runs).forEach(function (id) {
      var s = ST.sessions[id];
      if (s.status === 'running' && id !== viewing && (!best || s.p === (p && p.id))) best = s;
    });
    if (!best) toast('当前没有在后台运行的 Session。先发起一个对话，再切换到其他页面。');
    return best;
  }
  function inject(s, stepObj) {
    var r = runs[s.id];
    if (r.streaming) { r.pending = stepObj; return; }
    clearTimeout(r.timer); r.steps.splice(r.i, 0, stepObj); step(s.id);
  }

  /* ---------- 操作 ---------- */
  function P() { return R.proj(); }
  function closeTab(id) {
    var i = ST.tabs.findIndex(function (t) { return t.id === id; });
    if (i < 0) return;
    ST.tabs.splice(i, 1);
    if (!ST.tabs.length) ST.tabs.push({ id: 't' + (++ST.seq), p: null });
    if (ST.active === id || !ST.tabs.some(function (t) { return t.id === ST.active; })) ST.active = ST.tabs[Math.max(0, i - 1)].id;
  }
  function blockers(pid) { return R.sessionsOf(pid).filter(function (s) { return s.status === 'running' || s.status === 'needs'; }); }
  function title(text) { var t = text.replace(/[。！？!?\n].*$/, '').trim(); return t.length > 18 ? t.slice(0, 18) + '…' : (t || '新对话'); }
  function viewOf(p, s) { return p.ui.mode === 'view' && p.ui.viewSession[p.ui.viewId] === s.id ? p.ui.viewId : null; }

  var A = {
    'nav-toggle': function () { ST.navCollapsed = !ST.navCollapsed; },
    'tab': function (id) { ST.active = id; },
    'tab-add': function () { var t = { id: 't' + (++ST.seq), p: null }; ST.tabs.push(t); ST.active = t.id; },
    'tab-close': function (id) {
      var t = ST.tabs.filter(function (x) { return x.id === id; })[0];
      var b = t && t.p ? blockers(t.p) : [];
      if (b.length) ST.dlg = { type: 'close', tab: id, name: ST.projects[t.p].name, n: b.length };
      else closeTab(id);
    },
    'tab-close-confirm': function (id) {
      var t = ST.tabs.filter(function (x) { return x.id === id; })[0];
      blockers(t.p).forEach(function (s) { stopRun(s, '关闭 Project 时停止'); });
      ST.dlg = null; closeTab(id);
    },
    'pick-dir': function () { ST.dlg = { type: 'pick' }; },
    'open-dir': function (pid) {
      ST.dlg = null;
      var cur = R.tab(), open = ST.tabs.filter(function (t) { return t.p === pid; })[0];
      if (open) { if (!cur.p) closeTab(cur.id); ST.active = open.id; toast(pid + ' 已经打开，已切换到该 Tab'); return; }
      if (!ST.projects[pid]) { var d = ST.dirs.concat(ST.recent).filter(function (x) { return x.p === pid; })[0]; ST.projects[pid] = D.newProject(pid, d ? d.path : '~/Projects/' + pid); }
      if (!cur.p) cur.p = pid; else { var t = { id: 't' + (++ST.seq), p: pid }; ST.tabs.push(t); ST.active = t.id; }
    },
    'new-chat': function () { var p = P(); p.ui.mode = 'session'; p.ui.sessionId = null; p.ui.drafts.chat = { cli: p.cli }; ST.focus = 'ta-chat'; },
    'new-chat-cli': function (cli) { var p = P(); p.ui.mode = 'session'; p.ui.sessionId = null; p.ui.drafts.chat = { cli: cli }; ST.focus = 'ta-chat'; },
    'set-default': function (cli) { P().cli = cli; toast('已将 ' + D.CLI[cli].short + ' 设为此 Project 的默认 CLI'); },
    'pop': function (a) { ST.pop = ST.pop === a ? null : a; },
    'open-view': function (v) { var u = P().ui; u.mode = 'view'; u.viewId = v; u.viewSession[v] = null; },
    'open-session': function (id) { var u = P().ui; u.mode = 'session'; u.sessionId = id; },
    'open-in-view': function (id) { var u = P().ui, s = ST.sessions[id]; u.mode = 'view'; u.viewId = s.origin; u.viewSession[s.origin] = id; },
    'view-continue': function (id) { var u = P().ui; u.viewSession[u.viewId] = id; },
    'view-new': function () { var u = P().ui; u.viewSession[u.viewId] = null; u.drafts['view:' + u.viewId] = {}; ST.focus = 'ta-view:' + u.viewId; },
    'rtool': function (id) { var u = P().ui; u.rtool = id; if (id !== 'preview') u.tool = id; },
    'side-toggle': function () { var u = P().ui; if (u.mode === 'view') u.rtool = u.rtool === 'preview' ? u.tool : 'preview'; else u.sideOpen = !u.sideOpen; },
    'side-close': function () { P().ui.sideOpen = false; },
    'tool': function (id) { P().ui.tool = id; },
    'open-diff': function (f) {
      var p = P(), u = p.ui, i = p.diff.findIndex(function (d) { return d.f === f; });
      u.diffSel = Math.max(0, i); u.tool = 'diff';
      if (u.mode === 'view') u.rtool = 'diff'; else u.sideOpen = true;
    },
    'diff-sel': function (i) { P().ui.diffSel = +i; },
    'tree': function (path) { var o = P().ui.open; o[path] = !o[path]; },
    'file-sel': function (path) { P().ui.fileSel = path; },
    'ctx-add': function () { var u = P().ui; if (u.fileSel && u.ctx.indexOf(u.fileSel) < 0) u.ctx.push(u.fileSel); toast('已添加到当前对话的上下文'); },
    'ctx-files': function () { var u = P().ui; u.tool = 'files'; if (u.mode === 'view') u.rtool = 'files'; else u.sideOpen = true; },
    'ctx-remove': function (i) { P().ui.ctx.splice(+i, 1); },
    'set-model': function (a) {
      var parts = a.split('|'), key = parts[0], mdl = parts[1], p = P();
      if (ST.sessions[key]) ST.sessions[key].model = mdl; else (p.ui.drafts[key] = p.ui.drafts[key] || {}).model = mdl;
    },
    'send': function (key) {
      var p = P(), d = p.ui.drafts[key] || {}, text = (d.text || '').trim();
      if (!text) return;
      var s = ST.sessions[key], vid;
      if (s) {
        if (s.status === 'running') return;
        if (s.status === 'needs') s.msgs.forEach(function (m) { if (m.role === 'need' && !m.answer) m.answer = '在输入框中回复'; });
        vid = viewOf(p, s);
      } else {
        vid = key.indexOf('view:') === 0 ? key.slice(5) : null;
        var cli = d.cli || p.cli;
        if (!ST.cliAvail[cli]) { toast(D.CLI[cli].name + ' 未登录，请先在终端完成登录'); return; }
        s = { id: 's' + (++ST.seq), p: p.id, cli: cli, title: title(text), model: d.model || D.CLI[cli].models[0], status: null, unread: false, origin: vid, msgs: [] };
        ST.sessions[s.id] = s;
        if (vid) p.ui.viewSession[vid] = s.id; else p.ui.sessionId = s.id;
        ST.focus = 'ta-' + s.id;
      }
      s.msgs.push({ role: 'user', text: text });
      if (p.ui.ctx.length) { s.msgs.push({ role: 'tool', text: 'Context  ' + p.ui.ctx.join(', ') }); p.ui.ctx = []; }
      s.last = Date.now(); p.ui.drafts[key] = {};
      startRun(s, scriptFor(p, s, text, vid));
    },
    'stop': function (id) { stopRun(ST.sessions[id]); },
    'answer': function (a) {
      var parts = a.split('|'), s = ST.sessions[parts[0]], m = s.msgs[+parts[1]], opt = parts[2];
      m.answer = opt;
      var decline = [{ t: 'say', text: '好的，不执行这个操作。需要我换一种方式继续吗？' }, { t: 'done', files: [] }];
      if (!runs[s.id]) runs[s.id] = { steps: [{ t: 'done', files: [] }], i: 0, timer: null };
      if (m.opts.indexOf(opt) !== 0) { runs[s.id].steps = decline; runs[s.id].i = 0; }
      s.status = 'running'; step(s.id);
    },
    'retry': function (id) {
      var s = ST.sessions[id];
      startRun(s, [{ t: 'tool', text: 'Resume  CLI session' }, { t: 'say', text: '已恢复对应的 CLI 会话，并重新执行上一步。（原型模拟回复）' }, { t: 'done', files: [] }]);
    },
    'err-detail': function (a) { var parts = a.split('|'), m = ST.sessions[parts[0]].msgs[+parts[1]]; m.show = !m.show; },
    'gen-view': function (vid) {
      var u = P().ui, name = R.viewName(vid);
      u.viewSession[vid] = null;
      u.drafts['view:' + vid] = { text: '根据当前代码、文档和对话，生成 ' + name + '。内容写入 Project Knowledge，并保持与 View 展示分离。' };
      ST.focus = 'ta-view:' + vid;
    },
    'rename': function (id) { ST.renaming = id; ST.renameVal = null; },
    'browser-reload': function () { toast('已刷新（原型模拟）'); },
    'dlg-cancel': function () { ST.dlg = null; },
    'demo': function () { ST.demoOpen = !ST.demoOpen; },
    'demo-complete': function () {
      var s = backgroundRun(); if (!s) return;
      var r = runs[s.id], done = r.steps.slice(r.i).filter(function (x) { return x.t === 'done'; })[0] || { t: 'done', files: [] };
      clearTimeout(r.timer); s.msgs.forEach(function (m) { m.streaming = false; }); r.streaming = false;
      r.steps = [done]; r.i = 0; step(s.id); toast('“' + s.title + '”已在后台完成');
    },
    'demo-need': function () {
      var s = backgroundRun(); if (!s) return;
      inject(s, { t: 'need', text: D.CLI[s.cli].short + ' 请求确认：', cmd: '是否覆盖现有实现？', opts: ['覆盖', '保留现有实现'] });
      toast('“' + s.title + '”正在等待你的确认');
    },
    'demo-error': function () {
      var s = backgroundRun(); if (!s) return;
      inject(s, { t: 'error', text: 'CLI 进程意外退出（exit code 1）。', detail: 'Error: CLI process exited unexpectedly\n    at Session.run' });
      toast('“' + s.title + '”出错');
    },
    'demo-cli': function () { ST.cliAvail.claude = !ST.cliAvail.claude; },
    'demo-reset': function () { init(); },
    'demo-v01': function () { ST.v01 = !ST.v01; },
    'copy-code': function (id) {
      var text = R.code(id) || '';
      function done() { ST.copied = id; render(); clearTimeout(copyT); copyT = setTimeout(function () { ST.copied = null; render(); }, 1600); }
      /* 剪贴板不可用时退回到选中代码，由用户自己复制 */
      function fallback() {
        toast('已选中代码，按 ⌘C 复制');
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          var pre = document.querySelector('#' + id + ' pre'), r = document.createRange(), sel = window.getSelection();
          if (!pre) return;
          r.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(r);
        }); });
      }
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    }
  };

  function commitRename(v) { var s = ST.sessions[ST.renaming]; if (s && v.trim()) s.title = v.trim(); ST.renaming = null; ST.renameVal = null; render(); }
  function termRun(cmd) {
    var p = P(), t = p.ui.term;
    ST.termVal = '';
    t[t.length - 1] = '$ ' + cmd;
    if (cmd === 'pwd') t.push(p.path);
    else if (cmd === 'git status') t.push('On branch main', p.diff.length + ' 个文件有未提交的变更');
    else if (cmd) t.push('（原型模拟）已在 ' + p.path + ' 中执行：' + cmd);
    t.push('$ ');
    ST.focus = 'term-input'; render();
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) { if (ST.pop && !e.target.closest('.pop')) { ST.pop = null; render(); } return; }
    if (t.disabled) return;
    var inPop = !!t.closest('.pop'), act = t.dataset.act;
    if (act !== 'pop' && !inPop) ST.pop = null;
    if (A[act]) A[act](t.dataset.arg, t, e);
    if (inPop) ST.pop = null;
    render();
  });
  document.addEventListener('compositionstart', function () { composing = true; });
  document.addEventListener('compositionend', function () { composing = false; if (pendingRender) { pendingRender = false; render(); } });
  document.addEventListener('input', function (e) {
    var el = e.target, k = el.dataset && el.dataset.input;
    if (el.id === 'ren-input') ST.renameVal = el.value;
    if (el.id === 'term-input') ST.termVal = el.value;
    if (el.id === 'url-input') P().ui.urlDraft = el.value;
    if (!k) return;
    var p = P(); (p.ui.drafts[k] = p.ui.drafts[k] || {}).text = el.value;
    var b = document.getElementById('send-' + k); if (b) b.disabled = !el.value.trim();
    autosize(el);
  });
  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.input && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); A.send(el.dataset.input); render(); return; }
    if (el.id === 'ren-input' && !e.isComposing) { if (e.key === 'Enter') commitRename(el.value); if (e.key === 'Escape') { ST.renaming = null; render(); } return; }
    if (el.id === 'term-input' && e.key === 'Enter' && !e.isComposing) { termRun(el.value.trim()); return; }
    if (el.id === 'url-input' && e.key === 'Enter') { P().ui.url = el.value; P().ui.urlDraft = null; toast('已在原型中模拟加载 ' + el.value); return; }
    if (e.key === 'Escape' && (ST.pop || ST.dlg)) { ST.pop = null; ST.dlg = null; render(); }
  });
  document.addEventListener('focusout', function (e) { if (e.target.id === 'ren-input' && ST.renaming && !rendering) commitRename(e.target.value); });
  document.addEventListener('mousedown', function (e) {
    var h = e.target.closest('[data-drag]');
    if (!h) return;
    e.preventDefault();
    var u = P().ui, kind = h.dataset.drag, x0 = e.clientX, w0 = kind === 'conv' ? u.convW : u.sideW;
    var navW = ST.navCollapsed ? 0 : 248;
    function mv(ev) {
      var dx = ev.clientX - x0;
      if (kind === 'conv') u.convW = Math.max(360, Math.min(560, window.innerWidth - navW - 400, w0 + dx));
      else u.sideW = Math.max(320, Math.min(560, window.innerWidth - navW - 400, w0 - dx));
      render();
    }
    function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });

  init();
})();
