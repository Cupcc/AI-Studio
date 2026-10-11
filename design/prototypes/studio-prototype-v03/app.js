/* AI Developer Studio 原型 v03 — 状态、事件与 Agent 运行模拟。
   v03：Agent 写入 .ai-studio/ 时 Preview 先显示“更新中”再换成新快照；校验失败保留上一版；
   每轮完成时保存原生变更记录（本轮 Diff）；Terminal 按 Project 管理多个实例。 */
(function () {
  var D = window.PD, R = window.R, PV = window.PV, ST, runs = {}, raf = 0, lastKey = null, toastT = 0, copyT = 0, zoomAcc = 0;
  var composing = false, pendingRender = false, rendering = false;

  function init() {
    Object.keys(runs).forEach(function (k) { clearTimeout(runs[k].timer); });
    runs = {};
    ST = window.ST = D.seed();
    ST.pop = null; ST.dlg = null; ST.renaming = null; ST.demoOpen = false; ST.toast = null; ST.focus = null; ST.copied = null;
    ST.ctxOpen = null; ST.termConfirm = null; ST.scrollTo = null;
    Object.keys(ST.projects).forEach(function (id) { ST.projects[id].pv = {}; });
    Object.keys(ST.sessions).forEach(function (id) {
      var s = ST.sessions[id];
      if (s.run && (s.status === 'running' || s.status === 'needs')) {
        runs[id] = { steps: s.run, i: 0, timer: null, written: [] };
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
  function pvOf(p, vid) { p.pv = p.pv || {}; return p.pv[vid] = p.pv[vid] || { zoom: 1 }; }
  /* 没有成功快照时读取：超过 200 ms 才显示骨架（2026-10-11 确认）。原型模拟一次约 450 ms 的读取 */
  function startReading(st) {
    st.reading = true; st.skel = false;
    clearTimeout(st.skelT);
    st.skelT = setTimeout(function () { if (st.reading) { st.skel = true; render(); } }, 200);
  }
  function endReading(st) { st.reading = false; st.skel = false; clearTimeout(st.skelT); }
  function ensureRead() {
    var p = R.proj();
    if (!p || p.ui.mode !== 'view') return;
    var st = pvOf(p, p.ui.viewId);
    if (st.seen) return;
    st.seen = true; startReading(st);
    setTimeout(function () { endReading(st); render(); }, 450);
  }
  function doRender() {
    raf = 0;
    if (composing) { pendingRender = true; return; }
    var app = document.getElementById('app'), ae = document.activeElement, aid = ae && ae.id;
    var selS = ae && ae.selectionStart, selE = ae && ae.selectionEnd;
    var feed = document.getElementById('feed');
    var atBottom = !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40, prevTop = feed ? feed.scrollTop : 0;
    var keep = Array.prototype.map.call(app.querySelectorAll('.nav-scroll,.scroll'), function (e) { return e.scrollTop; });
    var keepX = Array.prototype.map.call(app.querySelectorAll('.nav-scroll,.scroll'), function (e) { return e.scrollLeft; });
    ensureRead();
    markViewed();
    var p = R.proj(), key = convKey(p);
    rendering = true;
    app.innerHTML = R.app();
    rendering = false;
    Array.prototype.forEach.call(app.querySelectorAll('.nav-scroll,.scroll'), function (e, i) { if (keep[i] != null) { e.scrollTop = keep[i]; e.scrollLeft = keepX[i]; } });
    var nf = document.getElementById('feed');
    if (nf) nf.scrollTop = (atBottom || key !== lastKey) ? nf.scrollHeight : prevTop;
    lastKey = key;
    var term = document.getElementById('term');
    if (term) term.scrollTop = term.scrollHeight;
    if (ST.scrollTo) { var se = document.getElementById(ST.scrollTo); if (se) se.scrollIntoView({ block: 'center' }); ST.scrollTo = null; }
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
  function copyText(text, mark) {
    function done() { ST.copied = mark; render(); clearTimeout(copyT); copyT = setTimeout(function () { ST.copied = null; render(); }, 1600); }
    try { navigator.clipboard.writeText(text).then(done, function () { toast('剪贴板不可用：' + text.split('\n')[0]); }); } catch (e) { toast('剪贴板不可用'); }
  }

  /* ---------- Project View：Agent 写入 .ai-studio/ 后的读取、校验与刷新 ---------- */
  /* result：{ kn, def } 为有效写入；{ err } 为稳定读取后仍失败。delay 模拟文件稳定与补扫的等待 */
  function viewWrite(p, vid, result, delay) {
    var st = pvOf(p, vid), had = !!p.views[vid];
    st.seen = true;
    if (had) st.stale = true; else startReading(st);
    render();
    setTimeout(function () {
      st.stale = false; endReading(st);
      if (result.err) st.err = result.err;
      else {
        var prev = p.views[vid];
        p.views[vid] = { kn: result.kn, def: result.def !== undefined ? result.def : (prev ? prev.def : null), updated: Date.now() };
        st.err = null;
      }
      render();
    }, delay || 1000);
  }
  function fileErr(vid, which, msg, path) { return { msg: msg, file: PV.files(vid)[which === 'def' ? 1 : 0], path: path || '', at: Date.now() }; }
  function jsonHunk(lines, sign) { return lines.map(function (l) { return [sign || '+', l]; }); }
  /* Agent 在 View 中的修改：返回写入的文件，供本轮 Diff 记录 */
  function applyKnowledge(p, op, vid) {
    var v = p.views[vid], f = PV.files(vid), name = R.viewName(vid);
    if (op === 'gen') {
      var kn = PV.generated(vid, p.name);
      viewWrite(p, vid, { kn: kn, def: null }, 1100);
      return [D.df(f[0], 'A', jsonHunk(JSON.stringify(kn, null, 2).split('\n').slice(0, 8).concat(['  …'])))];
    }
    if (op === 'split') {
      var r = PV.splitArchitecture(v.kn);
      viewWrite(p, vid, { kn: r.knowledge, def: r.definition }, 1200);
      return [
        D.df(f[0], 'M', [[' ', '  "modules": ['], ['-', '    { "id": "payment", "name": "Payment Service", "layer": "service", … },'],
          ['+', '    { "id": "billing", "name": "Billing Service", "layer": "service", … },'], ['+', '    { "id": "webhook", "name": "Webhook Service", "layer": "service", … },'],
          [' ', '  "relations": ['], ['-', '    { "from": "payment", "to": "stripe", "label": "扣款 / 回调" },'], ['+', '    { "from": "webhook", "to": "billing", "label": "订阅事件" },'], ['+', '    { "from": "billing", "to": "stripe", "label": "扣款" },']]),
        D.df(f[1], 'A', [['+', '{'], ['+', '  "schemaVersion": 1,'], ['+', '  "viewId": "architecture",'], ['+', '  "root": { "type": "stack", "children": [ …与内置定义相同… ] },'], ['+', '  // 只在关系图上增加强调'], ['+', '  "emphasis": ["billing", "webhook"]'], ['+', '}']])
      ];
    }
    viewWrite(p, vid, { kn: PV.clone(v.kn) }, 1000);
    return [D.df(f[0], 'M', [[' ', '  "data": {'], ['-', '    …修改前的事实'], ['+', '    …按你的要求更新的事实（原型示例，内容未变化）'], [' ', '  }']])];
  }
  function demoWrite(kind) {
    var p = R.proj();
    if (!p || p.ui.mode !== 'view' || p.ui.rtool !== 'preview') { toast('先打开一个 Project View，并让右侧显示 Preview'); return; }
    var vid = p.ui.viewId, v = p.views[vid];
    if (kind === 'steps') { viewWrite(p, vid, v ? { kn: PV.clone(v.kn) } : { kn: PV.generated(vid, p.name), def: null }, 1500); toast('Agent 分两步写入：中间状态不完整，保留旧内容，稳定后刷新'); }
    else if (kind === 'partial') { viewWrite(p, vid, { err: fileErr(vid, 'kn', 'JSON 不完整，第 41 行意外结束') }, 1600); toast('Agent 写入了半个 JSON：稳定读取后仍失败'); }
    else if (kind === 'bad') {
      var def = PV.clone(v ? (v.def || PV.BUILTIN[vid]) : PV.BUILTIN[vid]);
      def.root.children.splice(1, 0, { type: 'html', value: '<iframe src="https://example.com">' });
      var e = PV.validate(def)[0];
      viewWrite(p, vid, { err: fileErr(vid, 'def', e.msg + '，位置 ' + e.path, e.path) }, 700);
      toast('Agent 在 View Definition 中写入了不受支持的组件');
    } else { viewWrite(p, vid, v ? { kn: PV.clone(v.kn) } : { kn: PV.generated(vid, p.name), def: null }, 800); toast('Agent 写入了有效版本，Preview 自动恢复'); }
  }

  /* ---------- Agent 运行模拟 ---------- */
  function startRun(s, steps) {
    if (runs[s.id]) clearTimeout(runs[s.id].timer);
    s.status = 'running'; s.roundStart = Date.now();
    runs[s.id] = { steps: steps, i: 0, timer: null, written: [] };
    step(s.id);
  }
  function next(sid, ms) { var r = runs[sid]; if (r) r.timer = setTimeout(function () { step(sid); }, ms); }
  function step(sid) {
    var r = runs[sid], s = ST.sessions[sid];
    if (!r || !s) return;
    r.written = r.written || [];
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
    if (st.t === 'kn') { r.written = r.written.concat(applyKnowledge(ST.projects[s.p], st.op, st.view)); render(); return next(sid, 300); }
    if (st.t === 'error') { s.msgs.push({ role: 'error', text: st.text, detail: st.detail }); s.status = 'error'; delete runs[sid]; render(); return; }
    if (st.t === 'done') {
      var p = ST.projects[s.p];
      /* 本轮原生记录：代码文件 + .ai-studio/ 下的文件；.ai-studio/ 被 Git 忽略，不进入项目变更 */
      var files = (st.files || []).map(function (f) { return turnFile(p, f); }).concat(r.written);
      s.msgs.push({ role: 'done', dur: (Date.now() - s.roundStart) / 1000, turn: { at: Date.now(), files: files } });
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
  function sampleHunk(f) { return [[' ', '// ' + f], ['-', '// 修改前的实现'], ['+', '// Agent 本轮修改的内容（原型示例）'], [' ', '']]; }
  function turnFile(p, f) {
    var d = p.diff.filter(function (x) { return x.f === f; })[0];
    return d ? JSON.parse(JSON.stringify(d)) : D.df(f, 'M', sampleHunk(f));
  }
  function addDiff(p, files) {
    files.forEach(function (f) {
      if (p.diff.some(function (d) { return d.f === f; })) return;
      p.diff.push(D.df(f, 'M', sampleHunk(f)));
    });
  }
  function hasPayment(v) { return v && v.kn.data.modules && v.kn.data.modules.some(function (m) { return m.id === 'payment'; }); }
  function scriptFor(p, s, text, vid) {
    var cli = D.CLI[s.cli].short, steps = [{ t: 'wait', ms: 700 }];
    if (vid) {
      var v = p.views[vid], name = R.viewName(vid), f = PV.files(vid);
      if (!v) {
        steps.push({ t: 'tool', text: 'Read  README.md\nRead  package.json' }, { t: 'say', text: '已根据代码和文档整理出 ' + name + ' 的事实，写入 `' + f[0] + '`。呈现沿用内置定义，右侧 Preview 会自动刷新。' },
          { t: 'kn', view: vid, op: 'gen' }, { t: 'tool', text: 'Write ' + f[0] }, { t: 'done', files: [] });
      } else if (vid === 'architecture' && hasPayment(v) && /拆|Billing|Webhook|支付/i.test(text)) {
        steps.push({ t: 'tool', text: 'Read  services/payment/index.ts\nRead  apps/api/routes/stripe.ts\nRead  ' + f[0] },
          { t: 'say', text: '已将 Payment Service 拆分为 **Billing Service** 与 **Webhook Service**：Stripe 回调统一进入 Webhook Service，校验签名后交给 Billing Service 更新订阅状态。\n\n- `' + f[0] + '`：更新模块与关系；\n- `' + f[1] + '`：在关系图上强调两个新模块。\n\n需要我同步调整代码目录结构吗？' },
          { t: 'kn', view: vid, op: 'split' }, { t: 'tool', text: 'Edit  ' + f[0] + '\nWrite ' + f[1] }, { t: 'done', files: [] });
      } else {
        steps.push({ t: 'tool', text: 'Read  ' + f[0] }, { t: 'say', text: '已按你的要求更新 ' + name + '。（原型模拟回复：真实产品中由 ' + cli + ' 修改 Knowledge 与 View Definition，Preview 自动刷新。）' },
          { t: 'kn', view: vid, op: 'note' }, { t: 'tool', text: 'Edit  ' + f[0] }, { t: 'done', files: [] });
      }
      return steps;
    }
    var file = p.id === 'my-saas' ? 'services/payment/index.ts' : 'README.md';
    steps.push({ t: 'tool', text: 'Read  README.md' }, { t: 'say', text: '收到。我先看了 `README.md` 和相关目录，准备这样做：\n\n1. 找到与需求相关的模块；\n2. 修改实现并补充测试；\n3. 运行测试确认没有回归。\n\n（原型模拟回复：真实产品中这里是 ' + cli + ' 的流式输出。）' });
    if (/测试|test|运行|安装|部署/i.test(text)) {
      steps.push({ t: 'need', text: cli + ' 请求运行命令：', cmd: 'pnpm test', opts: ['允许', '拒绝'] }, { t: 'tool', text: 'Run   pnpm test' },
        { t: 'say', text: '测试已运行完成：\n\n| 测试集 | 通过 | 失败 |\n|---|---:|---:|\n| unit | 42 | 0 |\n| e2e | 8 | 0 |' });
    }
    steps.push({ t: 'wait', ms: 1800 }, { t: 'say', text: '### 本轮修改\n\n- `' + file + '`：按需求调整实现，公共接口不变。\n- 补充了对应的单元测试。\n\n```ts\n// ' + file + '\nexport async function handle(input: string) {\n  const result = await run(input);\n  return { ok: true, result };\n}\n```\n\n完成行的文件数会打开这一轮的变更。' }, { t: 'done', files: [file] });
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

  /* ---------- Terminal（模拟）---------- */
  function curTerm(p) { return p.terms.filter(function (t) { return t.id === p.ui.termSel; })[0] || p.terms[0]; }
  function newTerm(p) {
    var t = { id: 'k' + (++ST.seq), title: 'zsh', run: null, lines: ['$ '], val: '' };
    p.terms.push(t); p.ui.termSel = t.id; ST.termConfirm = null; ST.focus = 'term-input';
    return t;
  }
  function removeTerm(p, id) {
    var i = p.terms.findIndex(function (t) { return t.id === id; });
    if (i < 0) return;
    p.terms.splice(i, 1); ST.termConfirm = null;
    if (p.ui.termSel === id) p.ui.termSel = p.terms.length ? p.terms[Math.max(0, i - 1)].id : null;
  }
  function tops(p) { return p.files.map(function (n) { return n.n + (n.c ? '/' : ''); }).join('  '); }
  function termRun(cmd) {
    var p = P(), t = curTerm(p);
    if (!t) return;
    t.val = '';
    if (t.run) { t.lines.push(cmd); ST.focus = 'term-input'; render(); return; }
    t.lines[t.lines.length - 1] = '$ ' + cmd;
    var L = t.lines;
    if (!cmd) { /* 空命令 */ }
    else if (cmd === 'clear') { t.lines = ['$ ']; ST.focus = 'term-input'; render(); return; }
    else if (cmd === 'exit') { removeTerm(p, t.id); toast('终端已退出'); render(); return; }
    else if (cmd === 'pwd') L.push(p.path.replace('~', '/Users/you'));
    else if (cmd === 'ls') L.push(tops(p));
    else if (/^git status/.test(cmd)) {
      if (!p.git) L.push('fatal: not a git repository (or any of the parent directories): .git');
      else if (!p.diff.length) L.push('On branch ' + p.branch, 'nothing to commit, working tree clean');
      else p.diff.forEach(function (d) { L.push((d.u ? '??' : ' ' + d.s) + ' ' + d.f); });
    } else if (cmd === 'git init') L.push('Initialized empty Git repository in ' + p.path.replace('~', '/Users/you') + '/.git/', '（原型不会改变这个 Project 的 Git 状态）');
    else if (/^(pnpm|npm run|yarn) (dev|start)$/.test(cmd)) {
      t.run = cmd; t.title = cmd;
      L.push('', '> ' + p.name + '@0.1.0 dev', '', '  - Local:   http://localhost:3000', '', ' ✓ Ready in 1.6s');
      ST.focus = 'term-input'; render(); return;
    } else if (/test/.test(cmd)) L.push('', ' ✓ services/payment/amount.test.ts (2)', ' ✓ apps/web/auth/callback.test.ts (3)', '', ' Test Files  2 passed (2)', '      Tests  5 passed (5)');
    else L.push('（原型模拟）已在 ' + p.path + ' 中执行：' + cmd);
    L.push('$ ');
    ST.focus = 'term-input'; render();
  }
  function termInterrupt() {
    var p = P(), t = curTerm(p);
    if (!t) return;
    if (t.run) { t.lines.push('^C'); t.run = null; t.title = 'zsh'; t.lines.push('$ '); }
    else { t.lines[t.lines.length - 1] = '$ ' + (t.val || '') + '^C'; t.lines.push('$ '); }
    t.val = ''; ST.focus = 'term-input'; render();
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
  /* 打开工具：Session Mode 打开右侧边栏，Project View Mode 替换右侧 Preview */
  function openTool(p, id) { var u = p.ui; u.tool = id; if (u.mode === 'view') u.rtool = id; else u.sideOpen = true; }
  function findNode(nodes, parts) {
    var n = nodes.filter(function (x) { return x.n === parts[0]; })[0];
    if (!n) return null;
    return parts.length === 1 ? n : (n.c ? findNode(n.c, parts.slice(1)) : null);
  }
  function activate(pid) { var t = ST.tabs.filter(function (x) { return x.p === pid; })[0]; if (t) ST.active = t.id; return ST.projects[pid]; }

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
      if (!ST.projects[pid]) { var d = ST.dirs.concat(ST.recent).filter(function (x) { return x.p === pid; })[0]; ST.projects[pid] = D.newProject(pid, d ? d.path : '~/Projects/' + pid); ST.projects[pid].pv = {}; }
      if (!cur.p) cur.p = pid; else { var t = { id: 't' + (++ST.seq), p: pid }; ST.tabs.push(t); ST.active = t.id; }
    },
    'new-chat': function () { var p = P(); p.ui.mode = 'session'; p.ui.sessionId = null; p.ui.drafts.chat = { cli: p.cli }; ST.focus = 'ta-chat'; },
    'new-chat-cli': function (cli) { var p = P(); p.ui.mode = 'session'; p.ui.sessionId = null; p.ui.drafts.chat = { cli: cli }; ST.focus = 'ta-chat'; },
    'set-default': function (cli) { P().cli = cli; toast('已将 ' + D.CLI[cli].short + ' 设为此 Project 的默认 CLI'); },
    'pop': function (a) { ST.pop = ST.pop === a ? null : a; },
    'open-view': function (v) { var u = P().ui; u.mode = 'view'; u.viewId = v; u.viewSession[v] = null; u.rtool = 'preview'; },
    'open-session': function (id) { var u = P().ui; u.mode = 'session'; u.sessionId = id; },
    'open-in-view': function (id) { var u = P().ui, s = ST.sessions[id]; u.mode = 'view'; u.viewId = s.origin; u.viewSession[s.origin] = id; },
    'view-continue': function (id) { var u = P().ui; u.viewSession[u.viewId] = id; },
    'view-new': function () { var u = P().ui; u.viewSession[u.viewId] = null; u.drafts['view:' + u.viewId] = {}; ST.focus = 'ta-view:' + u.viewId; },
    /* 从工具入口打开 Diff 时总是项目变更；本轮变更只从完成行进入 */
    'rtool': function (id) { var u = P().ui; u.rtool = id; if (id !== 'preview') u.tool = id; if (id === 'diff') u.diffScope = { type: 'project' }; },
    'side-toggle': function () {
      var u = P().ui;
      if (u.tool === 'diff') u.diffScope = { type: 'project' };
      if (u.mode === 'view') u.rtool = u.rtool === 'preview' ? u.tool : 'preview'; else u.sideOpen = !u.sideOpen;
    },
    'side-close': function () { P().ui.sideOpen = false; },
    'tool': function (id) { var u = P().ui; u.tool = id; if (id === 'diff') u.diffScope = { type: 'project' }; },
    'open-turn': function (a) {
      var parts = a.split('|'), p = P(), s = ST.sessions[parts[0]], m = s.msgs[+parts[1]];
      p.ui.diffScope = { type: 'turn', sid: s.id, idx: +parts[1] };
      p.ui.diffSel = m.turn && m.turn.files[0] ? m.turn.files[0].f : null;
      openTool(p, 'diff');
    },
    'diff-project': function () { P().ui.diffScope = { type: 'project' }; },
    'diff-project-open': function () { var p = P(); p.ui.diffScope = { type: 'project' }; openTool(p, 'diff'); },
    'diff-sel': function (f) { P().ui.diffSel = f; },
    'rtool-terminal': function () { openTool(P(), 'terminal'); },
    'tree': function (path) { var o = P().ui.open; o[path] = !o[path]; },
    'file-sel': function (path) { P().ui.fileSel = path; },
    /* Preview 中的代码路径：用户点击后在 Files 中定位，不由 Agent 打开 */
    'open-path': function (path) {
      var p = P(), parts = path.split('/'), n = findNode(p.files, parts);
      if (!n) { toast('原型中没有这个路径：' + path); return; }
      for (var i = 1; i <= parts.length; i++) { var sub = parts.slice(0, i).join('/'); if (i < parts.length || n.c) p.ui.open[sub] = true; }
      p.ui.fileSel = n.c ? null : path;
      ST.scrollTo = 'f-' + path.replace(/[^\w]/g, '_');
      openTool(p, 'files');
    },
    'ctx-add': function () { var u = P().ui; if (u.fileSel && u.ctx.indexOf(u.fileSel) < 0) u.ctx.push(u.fileSel); toast('已添加到当前对话的上下文'); },
    'ctx-files': function () { openTool(P(), 'files'); },
    'ctx-remove': function (i) { P().ui.ctx.splice(+i, 1); },
    'vctx-remove': function (key) { var d = P().ui.drafts; (d[key] = d[key] || {}).noView = true; },
    'vctx-add': function (key) { var d = P().ui.drafts; (d[key] = d[key] || {}).noView = false; },
    'ctx-toggle': function (id) { ST.ctxOpen = ST.ctxOpen === id ? null : id; },
    'set-model': function (a) {
      var parts = a.split('|'), key = parts[0], mdl = parts[1], p = P();
      if (ST.sessions[key]) ST.sessions[key].model = mdl; else (p.ui.drafts[key] = p.ui.drafts[key] || {}).model = mdl;
    },
    'send': function (key) {
      var p = P(), d = p.ui.drafts[key] || {}, text = (d.text || '').trim();
      if (!text) return;
      var s = ST.sessions[key], vid, ctx = { view: null, files: p.ui.ctx.slice() };
      if (s) {
        if (s.status === 'running') return;
        if (s.status === 'needs') s.msgs.forEach(function (m) { if (m.role === 'need' && !m.answer) m.answer = '在输入框中回复'; });
        vid = viewOf(p, s);
      } else {
        vid = key.indexOf('view:') === 0 ? key.slice(5) : null;
        var cli = d.cli || p.cli;
        if (!ST.cliAvail[cli]) { toast(D.CLI[cli].name + ' 未登录，请先在终端完成登录'); return; }
        /* 首条消息：附加 View Context（标签未移除时）；无论是否附加都记录来源 View */
        if (vid && !d.noView) ctx.view = vid;
        s = { id: 's' + (++ST.seq), p: p.id, cli: cli, title: title(text), model: d.model || D.CLI[cli].models[0], status: null, unread: false, origin: vid, msgs: [] };
        ST.sessions[s.id] = s;
        if (vid) p.ui.viewSession[vid] = s.id; else p.ui.sessionId = s.id;
        ST.focus = 'ta-' + s.id;
      }
      s.msgs.push({ role: 'user', text: text, ctx: (ctx.view || ctx.files.length) ? ctx : null });
      p.ui.ctx = [];
      s.last = Date.now(); p.ui.drafts[key] = {};
      startRun(s, scriptFor(p, s, text, vid));
    },
    'stop': function (id) { stopRun(ST.sessions[id]); },
    'answer': function (a) {
      var parts = a.split('|'), s = ST.sessions[parts[0]], m = s.msgs[+parts[1]], opt = parts[2];
      m.answer = opt;
      var decline = [{ t: 'say', text: '好的，不执行这个操作。需要我换一种方式继续吗？' }, { t: 'done', files: [] }];
      if (!runs[s.id]) runs[s.id] = { steps: [{ t: 'done', files: [] }], i: 0, timer: null, written: [] };
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
      u.drafts['view:' + vid] = { text: '根据当前代码、文档和对话，整理 ' + name + ' 需要的事实。' };
      ST.focus = 'ta-view:' + vid;
    },
    'zoom': function (a) {
      var p = P(), st = pvOf(p, p.ui.viewId), z = st.zoom || 1;
      st.zoom = a === 'reset' ? 1 : Math.max(0.5, Math.min(2, Math.round((z + (a === 'in' ? 0.1 : -0.1)) * 10) / 10));
    },
    'copy-err': function (vid) {
      var p = P(), e = pvOf(p, vid).err;
      if (!e) return;
      copyText(['View：' + vid, '文件：' + e.file, e.path ? '位置：' + e.path : '', '错误：' + e.msg, '时间：' + new Date(e.at).toLocaleString()].filter(Boolean).join('\n'), 'err:' + vid);
    },
    'dlg-gallery': function () { ST.dlg = { type: 'gallery' }; },
    'dlg-data': function () { var p = P(); if (!p) { toast('先打开一个 Project'); return; } ST.dlg = { type: 'data', pid: p.id, vid: p.ui.viewId, tab: 'kn' }; },
    'dlg-tab': function (t) { ST.dlg.tab = t; },
    'term-new': function () { newTerm(P()); },
    'term-sel': function (id) { P().ui.termSel = id; ST.termConfirm = null; ST.focus = 'term-input'; },
    /* 关闭运行中的终端前确认；收起面板不会触发这里 */
    'term-close': function (id) {
      var p = P(), t = p.terms.filter(function (x) { return x.id === id; })[0];
      if (t && t.run) { p.ui.termSel = id; ST.termConfirm = id; } else removeTerm(p, id);
    },
    'term-close-cancel': function () { ST.termConfirm = null; },
    'term-close-confirm': function (id) { var p = P(), t = p.terms.filter(function (x) { return x.id === id; })[0]; removeTerm(p, id); toast('已结束“' + (t ? t.run : '') + '”并关闭终端'); },
    'rename': function (id) { ST.renaming = id; ST.renameVal = null; },
    'browser-reload': function () { toast('已刷新（原型模拟）'); },
    'dlg-cancel': function () { ST.dlg = null; },
    'demo': function () { ST.demoOpen = !ST.demoOpen; },
    'demo-pv': function (k) { demoWrite(k); },
    'demo-go': function (k) {
      ST.demoOpen = false;
      if (k === 'nongit') { A['open-dir']('cli-tools'); var q = ST.projects['cli-tools']; q.ui.mode = 'session'; q.ui.sessionId = null; q.ui.diffScope = { type: 'project' }; openTool(q, 'diff'); return; }
      var p = activate('my-saas'), u = p.ui;
      if (k === 'arch') { u.mode = 'view'; u.viewId = 'architecture'; u.viewSession.architecture = null; u.rtool = 'preview'; }
      else if (k === 'ctx') { u.mode = 'session'; u.sessionId = 's4'; ST.ctxOpen = 's4:0'; }
      else if (k === 'project-diff') { u.mode = 'session'; u.sessionId = 's3'; u.diffScope = { type: 'project' }; u.diffSel = 'services/payment/amount.ts'; openTool(p, 'diff'); }
      else if (k === 'turn') {
        u.mode = 'session'; u.sessionId = 's3';
        var s = ST.sessions.s3, idx = s.msgs.findIndex(function (m) { return m.role === 'done'; });
        u.diffScope = { type: 'turn', sid: 's3', idx: idx }; u.diffSel = 'services/payment/amount.ts'; openTool(p, 'diff');
      } else if (k === 'unavail') { u.mode = 'session'; u.sessionId = 's7'; }
      else if (k === 'term') openTool(p, 'terminal');
    },
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

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    /* 查看类对话框：点击对话框外部关闭 */
    if (!t && ST.dlg && (ST.dlg.type === 'gallery' || ST.dlg.type === 'data') && e.target.classList.contains('scrim')) { ST.dlg = null; render(); return; }
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
    if (el.id === 'term-input') { var t = curTerm(P()); if (t) t.val = el.value; }
    if (el.id === 'url-input') P().ui.urlDraft = el.value;
    if (!k) return;
    var p = P(); (p.ui.drafts[k] = p.ui.drafts[k] || {}).text = el.value;
    var b = document.getElementById('send-' + k); if (b) b.disabled = !el.value.trim();
    autosize(el);
  });
  function inPreview(el) { return el && el.closest && el.closest('#pvs'); }
  document.addEventListener('keydown', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.input && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); A.send(el.dataset.input); render(); return; }
    if (el.id === 'ren-input' && !e.isComposing) { if (e.key === 'Enter') commitRename(el.value); if (e.key === 'Escape') { ST.renaming = null; render(); } return; }
    if (el.id === 'term-input' && !e.isComposing) {
      if (e.key === 'Enter') { termRun(el.value.trim()); return; }
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); termInterrupt(); return; }
    }
    if (el.id === 'url-input' && e.key === 'Enter') { P().ui.url = el.value; P().ui.urlDraft = null; toast('已在原型中模拟加载 ' + el.value); return; }
    /* Preview 内：⌘ + / − / 0 缩放 */
    if ((e.metaKey || e.ctrlKey) && inPreview(el)) {
      var a = e.key === '=' || e.key === '+' ? 'in' : e.key === '-' ? 'out' : e.key === '0' ? 'reset' : null;
      if (a) { e.preventDefault(); A.zoom(a); render(); return; }
    }
    if (e.key === 'Escape' && (ST.pop || ST.dlg || ST.termConfirm)) { ST.pop = null; ST.dlg = null; ST.termConfirm = null; render(); }
  });
  /* Preview 内：⌘ / Ctrl + 滚轮，或触控板捏合（浏览器以 ctrlKey 滚轮事件传入） */
  document.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey) || !inPreview(e.target)) return;
    e.preventDefault();
    zoomAcc += e.deltaY;
    if (Math.abs(zoomAcc) < 40) return;
    A.zoom(zoomAcc < 0 ? 'in' : 'out'); zoomAcc = 0; render();
  }, { passive: false });
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
