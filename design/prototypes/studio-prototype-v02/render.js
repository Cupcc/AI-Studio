/* AI Developer Studio 原型 v02 — 渲染函数。状态在 window.ST，交互通过 data-act 交给 app.js 处理。
   相对 v01：Agent 回复按 Markdown 渲染、新对话草稿居中；ST.v01 为 true 时恢复 v01 的呈现，用于对比。 */
window.R = (function () {
  var D = window.PD;
  function S() { return window.ST; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var P = {
    sideL: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.2 3v10"/>',
    sideR: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M9.8 3v10"/>',
    pencil: '<path d="M3 13l.8-3.2L10.5 3l2.5 2.5-6.8 6.7z"/>',
    chev: '<path d="M4 6l4 4 4-4"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    up: '<path d="M8 13V3M4 7l4-4 4 4"/>',
    stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor"/>',
    files: '<path d="M2 4.5h4.2l1.5 1.5H14v6.5H2z"/>',
    diff: '<path d="M5 2.5v6M2 5.5h6M9 12.5h5"/>',
    browser: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.2h12"/>',
    terminal: '<path d="M3 5l3 3-3 3M8.5 11H13"/>',
    preview: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 6.5h11M6.5 6.5v7"/>',
    x: '<path d="M4 4l8 8M12 4l-8 8"/>',
    dots: '<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>',
    file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    caretR: '<path d="M6 4l4 4-4 4"/>',
    caretD: '<path d="M4 6l4 4 4-4"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5"/>',
    overview: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    progress: '<path d="M3 13V9M8 13V5M13 13V3"/>',
    architecture: '<rect x="5" y="2" width="6" height="3.5" rx="1"/><rect x="2" y="10.5" width="5" height="3.5" rx="1"/><rect x="9" y="10.5" width="5" height="3.5" rx="1"/><path d="M8 5.5V8M4.5 10.5V8h7v2.5"/>',
    agents: '<circle cx="6" cy="5.5" r="2.2"/><path d="M2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5M10.5 3.6a2.2 2.2 0 0 1 0 4M12 9.8c1 .5 1.7 1.6 2 3.2"/>',
    flow: '<circle cx="3.5" cy="8" r="1.5"/><circle cx="12.5" cy="8" r="1.5"/><path d="M5 8h5.5M8.5 6l2 2-2 2"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/>',
    check: '<path d="M3 8.5l3.2 3L13 4.5"/>'
  };
  function ic(n, s) { s = s || 16; return '<svg viewBox="0 0 16 16" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>'; }

  /* ---------- 派生数据 ---------- */
  function tab() { var st = S(); return st.tabs.filter(function (t) { return t.id === st.active; })[0]; }
  function proj() { var t = tab(); return t && t.p ? S().projects[t.p] : null; }
  function sessionsOf(pid) {
    var all = S().sessions, out = [];
    for (var k in all) if (all[k].p === pid) out.push(all[k]);
    return out.sort(function (a, b) { return b.last - a.last; });
  }
  function attention(pid) {
    var ss = sessionsOf(pid), r = null;
    ss.forEach(function (s) {
      if (s.status === 'needs') r = 'need';
      else if (s.status === 'error' && r !== 'need') r = 'err';
      else if (s.unread && !r) r = 'ok';
    });
    return r;
  }
  function viewingSid(p) {
    if (!p) return null;
    return p.ui.mode === 'session' ? p.ui.sessionId : (p.ui.viewSession[p.ui.viewId] || null);
  }
  function viewName(id) { return D.VIEWS.filter(function (v) { return v.id === id; })[0].name; }
  function toolName(id) { return D.TOOLS.filter(function (v) { return v.id === id; })[0].name; }
  function rel(ts) {
    var d = Date.now() - ts;
    if (d < D.MIN) return '刚刚';
    if (d < D.HR) return Math.floor(d / D.MIN) + ' 分钟前';
    var a = new Date(ts), b = new Date(), days = Math.round((new Date(b.toDateString()) - new Date(a.toDateString())) / D.DAY);
    if (days === 0) return Math.floor(d / D.HR) + ' 小时前';
    if (days === 1) return '昨天';
    return days + ' 天前';
  }
  function dayGroup(ts) {
    var a = new Date(ts), days = Math.round((new Date(new Date().toDateString()) - new Date(a.toDateString())) / D.DAY);
    return days <= 0 ? '今天' : days === 1 ? '昨天' : days <= 7 ? '过去 7 天' : '更早';
  }
  function dur(sec) { sec = Math.max(1, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m ? m + 'm ' + s + 's' : s + 's'; }
  function dotFor(a) { return a ? '<span class="dot d-' + a + '" aria-label="需要关注"></span>' : ''; }
  function statusEl(s) {
    if (s.status === 'running') return '<span class="spin" role="img" aria-label="Running"></span>';
    if (s.status === 'needs') return '<span class="dot d-need" role="img" aria-label="Needs Input"></span>';
    if (s.status === 'error') return '<span class="dot d-err" role="img" aria-label="Error"></span>';
    if (s.unread) return '<span class="dot d-ok" role="img" aria-label="Completed"></span>';
    return '';
  }
  function cliTag(cli) { return '<span class="cli">' + D.CLI[cli].tag + '</span>'; }

  /* ---------- 顶栏 ---------- */
  function top() {
    var st = S(), p = proj(), h = '<div class="top"><div class="lights" aria-hidden="true"><i></i><i></i><i></i></div>';
    var navAtt = p && st.navCollapsed ? attention(p.id) : null;
    h += '<button class="tb" style="margin-right:6px" data-act="nav-toggle" data-tip="' + (st.navCollapsed ? '展开导航' : '折叠导航') + '" aria-label="' + (st.navCollapsed ? '展开导航' : '折叠导航') + '">' + ic('sideL') + (navAtt ? '<span class="dot d-' + navAtt + ' adot"></span>' : '') + '</button>';
    if (st.navCollapsed && p) h += '<button class="tb" style="margin-right:6px" data-act="new-chat" data-tip="New Chat" aria-label="New Chat">' + ic('pencil', 15) + '</button>';
    h += '<div class="tabs" role="tablist">';
    st.tabs.forEach(function (t) {
      var on = t.id === st.active, name = t.p ? st.projects[t.p].name : '新标签页';
      var a = (!on && t.p) ? attention(t.p) : null;
      h += '<div class="tab' + (on ? ' on' : '') + '"><button class="tn" role="tab" aria-selected="' + on + '" data-act="tab" data-arg="' + t.id + '">' + dotFor(a) + '<span class="nm">' + esc(name) + '</span></button>' +
        '<button class="cx" data-act="tab-close" data-arg="' + t.id + '" aria-label="关闭 ' + esc(name) + '">' + ic('x', 12) + '</button></div>';
    });
    h += '</div><button class="tadd" data-act="tab-add" data-tip="打开 Project" aria-label="打开 Project">' + ic('plus', 14) + '</button><span class="grow"></span>';
    if (p) {
      var on = p.ui.mode === 'view' ? p.ui.rtool !== 'preview' : p.ui.sideOpen;
      h += '<button class="tb' + (on ? ' on' : '') + '" data-act="side-toggle" data-tip="右侧边栏" data-tip-r aria-pressed="' + on + '" aria-label="右侧边栏">' + ic('sideR') + '</button>';
    }
    return h + '</div>';
  }

  /* ---------- 左侧导航 ---------- */
  function nav(p) {
    var st = S(), ui = p.ui, h = '<nav class="nav" aria-label="Project 导航">';
    h += '<div class="newchat"><button class="nc-main" data-act="new-chat">' + ic('pencil', 15) + 'New Chat<span style="margin-left:auto">' + cliTag(p.cli) + '</span></button>' +
      '<button class="nc-more" data-act="pop" data-arg="cli" aria-label="选择 CLI" aria-expanded="' + (st.pop === 'cli') + '">' + ic('chev', 14) + '</button>';
    if (st.pop === 'cli') {
      h += '<div class="pop" style="top:40px;left:0;right:0"><div class="pg">选择 CLI 新建对话</div>';
      ['codex', 'claude'].forEach(function (c) {
        var ok = st.cliAvail[c];
        h += '<button class="mi" data-act="new-chat-cli" data-arg="' + c + '"' + (ok ? '' : ' disabled') + '>' + cliTag(c) +
          '<span><span>' + D.CLI[c].name + '</span>' + (ok ? '' : '<br><span class="sub">未登录，请先在终端完成登录</span>') + '</span>' +
          '<span class="r">' + (p.cli === c ? '<span class="meta">默认</span>' : '') + '</span></button>';
      });
      var other = p.cli === 'codex' ? 'claude' : 'codex';
      h += '<div class="popdiv"></div><button class="mi" data-act="set-default" data-arg="' + other + '"' + (st.cliAvail[other] ? '' : ' disabled') + '>将 ' + D.CLI[other].short + ' 设为此 Project 默认</button></div>';
    }
    h += '</div><div class="nav-scroll"><div class="sec">Project Views</div>';
    D.VIEWS.forEach(function (v) {
      var on = ui.mode === 'view' && ui.viewId === v.id;
      h += '<button class="item' + (on ? ' on' : '') + '" data-act="open-view" data-arg="' + v.id + '"' + (on ? ' aria-current="page"' : '') + '><span class="vico">' + ic(v.id) + '</span>' + v.name + '</button>';
    });
    h += '<div class="navdiv"></div><div class="sec">Sessions</div>';
    var ss = sessionsOf(p.id), grp = null;
    if (!ss.length) h += '<div class="empty-nav">还没有对话。点击 New Chat 开始。</div>';
    ss.forEach(function (s) {
      var g = dayGroup(s.last);
      if (g !== grp) { h += '<div class="grp">' + g + '</div>'; grp = g; }
      var on = ui.mode === 'session' && ui.sessionId === s.id, stat = statusEl(s);
      h += '<div class="sitem">';
      if (st.renaming === s.id) {
        h += '<div class="srow on">' + cliTag(s.cli) + '<input class="ren" id="ren-input" data-ren="' + s.id + '" value="' + esc(st.renameVal != null ? st.renameVal : s.title) + '" aria-label="重命名 Session"></div>';
      } else {
        h += '<button class="srow' + (on ? ' on' : '') + '" data-act="open-session" data-arg="' + s.id + '">' + cliTag(s.cli) + '<span class="t" style="--mr:' + (stat ? 24 : 4) + 'px">' + esc(s.title) + '</span>' + stat + '</button>' +
          '<button class="more' + (st.pop === 'more:' + s.id ? ' open' : '') + '" style="position:absolute;top:5px;right:' + (stat ? 24 : 6) + 'px" data-act="pop" data-arg="more:' + s.id + '" aria-label="更多操作">' + ic('dots', 14) + '</button>';
        if (st.pop === 'more:' + s.id) h += '<div class="pop" style="top:30px;right:0;min-width:150px"><button class="mi" data-act="rename" data-arg="' + s.id + '">Rename</button></div>';
      }
      h += '</div>';
    });
    return h + '</div></nav>';
  }

  /* ---------- Markdown（v02）---------- */
  /* 先转义再套用格式，不渲染原始 HTML；链接只接受 http(s)。支持标题、列表、表格、引用、分隔线、行内代码、加粗与代码块。 */
  var codeStore = {};
  var LANG = { ts: 'ts', tsx: 'ts', js: 'ts', jsx: 'ts', typescript: 'ts', javascript: 'ts', json: 'ts', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh' };
  var TOK = {
    ts: /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g,
    sh: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|\b(\d+(?:\.\d+)?)\b|([A-Za-z_][\w-]*)/g
  };
  var KW = {
    ts: /^(?:const|let|var|function|return|if|else|for|of|in|while|await|async|export|import|from|default|class|new|this|throw|try|catch|finally|interface|type|extends|implements|private|readonly|static|true|false|null|undefined)$/,
    sh: /^(?:if|then|else|fi|for|do|done|in|case|esac|export|cd|echo|set)$/
  };
  function hl(code, lang) {
    if (lang === 'diff') return code.split('\n').map(function (l) { return '<span class="dl' + (l[0] === '+' ? ' add' : l[0] === '-' ? ' del' : '') + '">' + (esc(l) || ' ') + '</span>'; }).join('');
    var k = LANG[lang], re = TOK[k], out = '', last = 0, m;
    if (!re) return esc(code);
    re.lastIndex = 0;
    while ((m = re.exec(code))) {
      var t = esc(m[0]);
      out += esc(code.slice(last, m.index)) + (m[1] ? '<span class="hc">' + t + '</span>' : m[2] ? '<span class="hs">' + t + '</span>' : m[3] ? '<span class="hn">' + t + '</span>' : KW[k].test(m[0]) ? '<span class="hk">' + t + '</span>' : t);
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }
  function fmt(t) {
    return esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function inl(s) {
    var out = '', re = /`([^`\n]+)`/g, last = 0, m;
    while ((m = re.exec(s))) { out += fmt(s.slice(last, m.index)) + '<code>' + esc(m[1]) + '</code>'; last = re.lastIndex; }
    return out + fmt(s.slice(last));
  }
  function cells(l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); }); }
  function md(src, id) {
    var L = src.split('\n'), h = '', i = 0, n = 0, para = [];
    function flush() { if (para.length) { h += '<p>' + para.map(inl).join('<br>') + '</p>'; para = []; } }
    while (i < L.length) {
      var l = L[i], f, hm, lm;
      if ((f = /^```\s*([\w+-]*)\s*$/.exec(l))) {
        flush();
        var code = [], cid = id + '-' + (n++), lang = f[1].toLowerCase();
        for (i++; i < L.length && !/^```\s*$/.test(L[i]); i++) code.push(L[i]);
        i++;
        codeStore[cid] = code.join('\n');
        h += '<div class="cb" id="' + cid + '"><div class="cb-h"><span>' + esc(lang || 'text') + '</span><button class="cb-copy" data-act="copy-code" data-arg="' + cid + '" aria-label="复制代码">' +
          (S().copied === cid ? ic('check', 13) + '已复制' : ic('copy', 13) + '复制') + '</button></div><pre><code>' + hl(codeStore[cid], lang) + '</code></pre></div>';
      } else if (/^\s*$/.test(l)) { flush(); i++; }
      else if ((hm = /^(#{1,4})\s+(.*)$/.exec(l))) {
        flush();
        var tag = hm[1].length <= 2 ? 'h3' : 'h4';
        h += '<' + tag + '>' + inl(hm[2]) + '</' + tag + '>'; i++;
      } else if (/^\|.*\|\s*$/.test(l) && /^\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
        flush();
        var al = cells(L[i + 1]).map(function (c) { return /-:$/.test(c) ? ' class="r"' : ''; });
        h += '<div class="tw"><table><thead><tr>' + cells(l).map(function (c, j) { return '<th' + (al[j] || '') + '>' + inl(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        for (i += 2; i < L.length && /^\|/.test(L[i]); i++) h += '<tr>' + cells(L[i]).map(function (c, j) { return '<td' + (al[j] || '') + '>' + inl(c) + '</td>'; }).join('') + '</tr>';
        h += '</tbody></table></div>';
      } else if ((lm = /^\s*([-*]|\d+[.)])\s+/.exec(l))) {
        flush();
        var ol = /\d/.test(lm[1]), item = ol ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
        h += ol ? '<ol>' : '<ul>';
        for (; i < L.length && item.test(L[i]); i++) h += '<li>' + inl(L[i].replace(item, '')) + '</li>';
        h += ol ? '</ol>' : '</ul>';
      } else if (/^>\s?/.test(l)) {
        flush();
        var q = [];
        for (; i < L.length && /^>\s?/.test(L[i]); i++) q.push(L[i].replace(/^>\s?/, ''));
        h += '<blockquote>' + q.map(inl).join('<br>') + '</blockquote>';
      } else if (/^-{3,}\s*$/.test(l)) { flush(); h += '<hr>'; i++; }
      else { para.push(l); i++; }
    }
    flush();
    return h;
  }
  /* 流式输出时把光标放进最后一个块内部，而不是另起一行 */
  function withCaret(h) { var c = '<span class="caret"></span>', m = /(<\/[a-z0-9]+>)+$/.exec(h); return m ? h.slice(0, m.index) + c + h.slice(m.index) : h + c; }

  /* ---------- Conversation ---------- */
  function msgs(s) {
    var h = '';
    s.msgs.forEach(function (m, i) {
      if (m.role === 'user') h += '<div class="mu">' + esc(m.text) + '</div>';
      else if (m.role === 'agent') {
        if (S().v01) h += '<div class="ma plain">' + esc(m.text) + (m.streaming ? '<span class="caret"></span>' : '') + '</div>';
        else { var body = md(m.text, 'cb-' + s.id + '-' + i); h += '<div class="ma">' + (m.streaming ? withCaret(body) : body) + '</div>'; }
      }
      else if (m.role === 'tool') h += '<div class="tool">' + esc(m.text) + '</div>';
      else if (m.role === 'done') {
        h += '<div class="doneln">Worked for ' + dur(m.dur) + ' · Done';
        if (m.files && m.files.length) h += ' · <button class="linkbtn" data-act="open-diff" data-arg="' + esc(m.files[0]) + '">修改了 ' + m.files.length + ' 个文件</button>';
        h += '</div>';
      } else if (m.role === 'stopped') h += '<div class="doneln">已停止 · 当前一轮未完成</div>';
      else if (m.role === 'need') {
        if (m.answer) h += '<div class="card past"><div class="ch" style="font-weight:500"><span class="meta">' + esc(m.text) + '</span></div><div class="cmd">' + esc(m.cmd) + '</div><div class="meta">你选择了：' + esc(m.answer) + '</div></div>';
        else {
          h += '<div class="card need"><div class="ch"><span class="dot d-need"></span>等待你的确认</div><div style="font-size:13.5px">' + esc(m.text) + '</div><div class="cmd">' + esc(m.cmd) + '</div><div class="acts">';
          m.opts.forEach(function (o, j) { h += '<button class="btn' + (j === 0 ? ' pri' : '') + '" data-act="answer" data-arg="' + s.id + '|' + i + '|' + esc(o) + '">' + esc(o) + '</button>'; });
          h += '<span class="meta" style="margin-left:auto">也可以在下方直接回复</span></div></div>';
        }
      } else if (m.role === 'error') {
        var last = i === s.msgs.length - 1;
        h += '<div class="card err"><div class="ch"><span class="dot d-err"></span>' + esc(m.text) + '</div>' +
          (m.show ? '<div class="cmd">' + esc(m.detail) + '</div>' : '') + '<div class="acts">' +
          (last ? '<button class="btn pri" data-act="retry" data-arg="' + s.id + '">重试</button>' : '') +
          '<button class="btn" data-act="err-detail" data-arg="' + s.id + '|' + i + '">' + (m.show ? '收起详情' : '查看详情') + '</button></div></div>';
      }
    });
    return h;
  }

  function composer(key, opts) {
    var st = S(), p = proj(), text = (p.ui.drafts[key] || {}).text || '';
    var running = opts.session && opts.session.status === 'running';
    var model = opts.session ? opts.session.model : ((p.ui.drafts[key] || {}).model || D.CLI[opts.cli].models[0]);
    var h = '<div class="compose"><div class="compose-in"><div class="input">' +
      '<textarea id="ta-' + esc(key) + '" data-input="' + esc(key) + '" rows="1" aria-label="输入消息" placeholder="' + esc(opts.ph) + '">' + esc(text) + '</textarea><div class="irow">' +
      '<button class="ib" style="width:26px;height:26px" data-act="pop" data-arg="ctx:' + esc(key) + '" data-tip="添加上下文" aria-label="添加上下文">' + ic('plus', 15) + '</button>';
    if (st.pop === 'ctx:' + key) h += '<div class="pop" style="bottom:34px;left:0"><button class="mi" data-act="ctx-files">从 Files 选择文件</button><button class="mi" disabled>上传图片<span class="r sub">原型未实现</span></button></div>';
    if (opts.view) h += '<span class="chip">' + ic('preview', 12) + '<span class="cn">' + viewName(opts.view) + '</span></span>';
    p.ui.ctx.forEach(function (f, i) { h += '<span class="chip">' + ic('file', 12) + '<span class="cn">' + esc(f) + '</span><button data-act="ctx-remove" data-arg="' + i + '" aria-label="移除 ' + esc(f) + '">' + ic('x', 10) + '</button></span>'; });
    h += '<button class="model" data-act="pop" data-arg="model:' + esc(key) + '" aria-label="选择模型">' + esc(model) + ic('chev', 12) + '</button>';
    if (st.pop === 'model:' + key) {
      h += '<div class="pop" style="bottom:34px;right:34px"><div class="pg">' + D.CLI[opts.cli].name + ' 支持的模型</div>';
      D.CLI[opts.cli].models.forEach(function (mm) { h += '<button class="mi" data-act="set-model" data-arg="' + esc(key) + '|' + esc(mm) + '">' + esc(mm) + (mm === model ? '<span class="r meta">当前</span>' : '') + '</button>'; });
      h += '</div>';
    }
    h += running
      ? '<button class="send stop" data-act="stop" data-arg="' + opts.session.id + '" data-tip="停止" data-tip-r aria-label="停止">' + ic('stop', 14) + '</button>'
      : '<button class="send" id="send-' + esc(key) + '" data-act="send" data-arg="' + esc(key) + '" aria-label="发送"' + (text.trim() ? '' : ' disabled') + '>' + ic('up', 14) + '</button>';
    return h + '</div></div></div></div>';
  }

  function sessionMain(p) {
    var ui = p.ui, s = ui.sessionId ? S().sessions[ui.sessionId] : null, h = '<div class="main"><section class="col grow" style="min-width:400px" aria-label="Conversation">';
    if (s) {
      h += '<div class="hdr">' + cliTag(s.cli) + '<span class="ttl">' + esc(s.title) + '</span><span class="meta">' + D.CLI[s.cli].name + '</span>';
      if (s.origin) h += '<span class="meta">· 来自 ' + viewName(s.origin) + '</span><button class="linkbtn" data-act="open-in-view" data-arg="' + s.id + '">在 View 中打开</button>';
      h += '</div><div class="feed" id="feed"><div class="feed-in">' + msgs(s) + '</div></div>' + composer(s.id, { session: s, cli: s.cli, ph: '回复 ' + D.CLI[s.cli].short + '…' });
    } else {
      var d = ui.drafts.chat || {}, cli = d.cli || p.cli;
      if (S().v01) {
        h += '<div class="hdr">' + cliTag(cli) + '<span class="ttl">新对话</span><span class="meta">' + D.CLI[cli].name + ' · 发送第一条消息后创建 Session</span></div>' +
          '<div class="draft-empty"><h2>在 ' + esc(p.name) + ' 中开始新的对话</h2><div class="meta">Agent 会直接在 ' + esc(p.path) + ' 中执行</div></div>' +
          composer('chat', { cli: cli, ph: '描述你的开发需求…' });
      } else {
        /* v02：问候语与输入框一起居中；发送第一条消息后进入 Session，输入框回到底部，消息从顶部开始 */
        h += '<div class="hdr">' + cliTag(cli) + '<span class="ttl">新对话</span></div>' +
          '<div class="draft-c"><div class="greet"><h2>今天要在 ' + esc(p.name) + ' 中做什么？</h2><div class="where">' + D.CLI[cli].name + ' 会直接在 ' + esc(p.path) + ' 中执行</div></div>' +
          composer('chat', { cli: cli, ph: '描述你的开发需求…' }) + '</div>';
      }
    }
    h += '</section>';
    if (ui.sideOpen) h += '<div class="drag" data-drag="side" role="separator" aria-label="调整右侧边栏宽度"></div><aside class="side" style="width:' + ui.sideW + 'px" aria-label="右侧边栏">' + sideHdr(p) + tool(p, ui.tool) + '</aside>';
    return h + '</div>';
  }

  function sideHdr(p) {
    var h = '<div class="hdr" style="padding:0 8px 0 10px;gap:2px">';
    D.TOOLS.forEach(function (t) { h += '<button class="ib' + (p.ui.tool === t.id ? ' on' : '') + '" data-act="tool" data-arg="' + t.id + '" data-tip="' + t.name + '" aria-label="' + t.name + '">' + ic(t.id) + '</button>'; });
    return h + '<span class="ttl" style="margin-left:8px">' + toolName(p.ui.tool) + '</span><span class="grow"></span><button class="ib" data-act="side-close" data-tip="关闭" data-tip-r aria-label="关闭右侧边栏">' + ic('x', 15) + '</button></div>';
  }

  /* ---------- Project View ---------- */
  function viewMain(p) {
    var ui = p.ui, vid = ui.viewId, sid = ui.viewSession[vid], s = sid ? S().sessions[sid] : null;
    var h = '<div class="main"><section class="col vconv" style="width:' + ui.convW + 'px" aria-label="Conversation">';
    if (s) {
      h += '<div class="hdr" style="padding-left:16px">' + cliTag(s.cli) + '<span class="ttl">' + esc(s.title) + '</span><span class="grow"></span>' +
        '<button class="ib" data-act="view-new" data-tip="新建对话" aria-label="在此 View 中新建对话">' + ic('pencil') + '</button></div>' +
        '<div class="feed" id="feed"><div class="feed-in" style="padding:20px 20px 8px">' + msgs(s) + '</div></div>' +
        composer(s.id, { session: s, cli: s.cli, view: vid, ph: '继续描述修改…' });
    } else {
      var key = 'view:' + vid, d = ui.drafts[key] || {}, cli = d.cli || p.cli;
      var rec = sessionsOf(p.id).filter(function (x) { return x.origin === vid; }).slice(0, 3);
      h += '<div class="hdr"><span class="ttl">新对话</span><span class="meta">· ' + viewName(vid) + ' · 未发送前不创建 Session</span></div>' +
        '<div class="draft-empty"><h2>描述你想对 ' + viewName(vid) + ' 做的调整</h2><div class="meta">发送后作为普通 Session 进入左侧 Session History</div></div>';
      if (rec.length) {
        h += '<div class="recent"><div class="grp" style="padding:6px 10px">继续最近的对话</div>';
        rec.forEach(function (x) { h += '<button class="srow" data-act="view-continue" data-arg="' + x.id + '">' + cliTag(x.cli) + '<span class="t">' + esc(x.title) + '</span><span class="meta">' + rel(x.last) + '</span>' + statusEl(x) + '</button>'; });
        h += '</div>';
      }
      h += composer(key, { cli: cli, view: vid, ph: vid === 'architecture' ? '例如：把支付模块拆分成 Billing Service 和 Webhook Service' : '描述修改…' });
    }
    h += '</section><div class="drag" data-drag="conv" role="separator" aria-label="调整 Conversation 宽度"></div>';
    var isTool = ui.rtool !== 'preview', k = p.k[vid];
    h += '<section class="rarea' + (isTool ? ' tool-on' : '') + '" aria-label="右侧区域"><div class="hdr" style="background:var(--bg);border-bottom:1px solid var(--line)">';
    if (!isTool) h += '<span class="ttl" style="font-weight:600">' + viewName(vid) + '</span>' + (k ? '<span class="demo">示例数据</span>' + (k.updated ? '<span class="meta">已更新 · ' + rel(k.updated) + '</span>' : '') : '');
    else h += '<span class="ttl" style="font-weight:600">' + toolName(ui.rtool) + '</span>';
    h += '<span class="grow"></span><button class="ib' + (!isTool ? ' on' : '') + '" data-act="rtool" data-arg="preview" data-tip="Preview · ' + viewName(vid) + '" aria-label="Preview">' + ic('preview') + '</button><span class="vsep"></span>';
    D.TOOLS.forEach(function (t, i) { h += '<button class="ib' + (ui.rtool === t.id ? ' on' : '') + '" data-act="rtool" data-arg="' + t.id + '" data-tip="' + t.name + '"' + (i === 3 ? ' data-tip-r' : '') + ' aria-label="' + t.name + '">' + ic(t.id) + '</button>'; });
    h += '</div>' + (isTool ? tool(p, ui.rtool) : '<div class="scroll">' + preview(p, vid) + '</div>');
    return h + '</section></div>';
  }

  function noteList(k) {
    if (!k.notes || !k.notes.length) return '';
    return '<div><div class="lyr">最近修改</div>' + k.notes.map(function (n) { return '<div class="meta" style="padding:2px 0">' + esc(n) + '</div>'; }).join('') + '</div>';
  }
  function sessLinks(list, empty) {
    if (!list.length) return '<div class="meta">' + empty + '</div>';
    return list.map(function (s) { return '<button class="srow" data-act="open-session" data-arg="' + s.id + '">' + cliTag(s.cli) + '<span class="t">' + esc(s.title) + '</span><span class="meta">' + rel(s.last) + '</span>' + statusEl(s) + '</button>'; }).join('');
  }

  function preview(p, vid) {
    var k = p.k[vid], ss = sessionsOf(p.id);
    var client = '<div class="g2"><div><div class="lyr">需要处理</div>' + sessLinks(ss.filter(function (s) { return s.status === 'needs' || s.status === 'error'; }), '没有等待处理的 Session') + '</div>' +
      '<div><div class="lyr">最近完成</div>' + sessLinks(ss.filter(function (s) { return s.unread; }), '没有未查看的结果') + '</div></div>' +
      '<div><div class="lyr">最近对话</div>' + sessLinks(ss.slice(0, 4), '还没有对话') + '</div>';
    if (!k) {
      return '<div class="pv-empty" style="min-height:300px"><span class="vico" style="width:auto;height:auto">' + ic(vid, 28) + '</span><h3>还没有 ' + viewName(vid) + '</h3>' +
        '<p class="meta" style="max-width:360px;margin:0">' + viewName(vid) + ' 由 Agent 根据代码、文档和对话生成。生成请求会作为普通 Session 发送，发送前可以修改指令。</p>' +
        '<button class="btn pri" data-act="gen-view" data-arg="' + vid + '">生成 ' + viewName(vid) + '</button></div>' +
        (vid === 'overview' ? '<div class="pvb" style="padding-top:0">' + client + '</div>' : '');
    }
    var h = '<div class="pvb">';
    if (vid === 'overview') {
      h += '<div style="font-size:15px;line-height:1.7;max-width:640px">' + esc(k.summary) + '</div>' +
        '<div><div class="lyr">整体进度 · ' + k.pct + '%</div><div class="bar"><i style="width:' + k.pct + '%"></i></div></div>' +
        '<dl class="kv"><dt>当前重点</dt><dd>' + esc(k.focus) + '</dd><dt>技术栈</dt><dd>' + k.stack.map(esc).join(' · ') + '</dd><dt>架构</dt><dd>' + esc(k.arch) + '</dd><dt>Agent</dt><dd>' + esc(k.agents) + '</dd></dl>' + client;
    } else if (vid === 'progress') {
      h += '<div><div class="lyr">当前阶段</div><div style="font-size:16px;font-weight:500">' + esc(k.stage) + ' · ' + k.pct + '%</div><div class="bar" style="margin-top:8px"><i style="width:' + k.pct + '%"></i></div></div>' +
        '<div><div class="lyr">里程碑</div><div class="ms">' + k.ms.map(function (x) { return '<div class="' + (x.done ? 'done' : '') + '">' + esc(x.t) + (x.now ? ' <span class="meta">· 进行中</span>' : '') + (x.done ? ' <span class="meta">· 已完成</span>' : '') + '</div>'; }).join('') + '</div></div>' +
        '<div><div class="lyr">接下来</div>' + k.next.map(function (x) { return '<div style="padding:3px 0">' + esc(x) + '</div>'; }).join('') + '</div>';
    } else if (vid === 'architecture' && k.layers) {
      k.layers.forEach(function (L) { h += '<div><div class="lyr">' + esc(L[0]) + '</div><div class="g3">' + L[1].map(function (b) { return '<div class="box"><b>' + esc(b[0]) + '</b>' + esc(b[1]) + '</div>'; }).join('') + '</div></div>'; });
    } else if (vid === 'architecture') {
      var svc = k.split
        ? '<div class="box"><b>API Gateway</b>路由与鉴权入口</div><div class="box"><b>Auth Service</b>登录与 OAuth</div><div class="box new"><b>Billing Service</b>订阅、续费与账单</div><div class="box new"><b>Webhook Service</b>接收并校验 Stripe 回调</div>'
        : '<div class="box"><b>API Gateway</b>路由与鉴权入口</div><div class="box"><b>Auth Service</b>登录与 OAuth</div><div class="box"><b>Payment Service</b>订阅、账单与 Stripe 回调</div>';
      var fl = k.split ? ['Stripe', 'Webhook Service', 'Billing Service', 'PostgreSQL'] : ['Stripe', 'Payment Service', 'PostgreSQL'];
      h += '<div><div class="lyr">客户端</div><div class="box" style="width:220px"><b>Web App</b>Next.js · 用户界面</div></div>' +
        '<div><div class="lyr">服务</div><div class="g2">' + svc + '</div></div>' +
        '<div><div class="lyr">数据与外部服务</div><div class="g3"><div class="box"><b>PostgreSQL</b>主数据库</div><div class="box"><b>Stripe</b>支付（外部）</div><div class="box"><b>Email Provider</b>邮件（外部）</div></div></div>' +
        '<div><div class="lyr">关键数据流</div><div class="flowchips">' + fl.map(function (x) { return '<span class="chip">' + x + '</span>'; }).join('<span class="meta">→</span>') + '</div></div>';
    } else if (vid === 'agents') {
      h += '<div class="g2">' + k.list.map(function (a) { return '<div class="box" style="padding:14px"><b>' + esc(a.name) + '</b><div style="margin:4px 0 8px">' + esc(a.role) + '</div>' + a.src.map(function (x) { return '<div class="meta">· ' + esc(x) + '</div>'; }).join('') + '</div>'; }).join('') + '</div>' +
        '<div class="meta">Agent 与 Skill 来自 CLI 原生配置，客户端只做展示，不定义自己的 Agent Profile。</div>';
    } else if (vid === 'flow') {
      h += '<div><div class="lyr">主流程</div><div class="flowchips">' + k.steps.map(function (x, i) { return '<span class="chip"' + (i === k.focus ? ' style="border-color:var(--fg);color:var(--fg)"' : '') + '>' + esc(x) + '</span>'; }).join('<span class="meta">→</span>') + '</div></div>' +
        '<div><div class="lyr">“' + esc(k.steps[k.focus]) + '”与代码的映射</div><dl class="kv">' + k.map.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl></div>';
    }
    return h + noteList(k) + '</div>';
  }

  /* ---------- 工具 ---------- */
  function tree(p, nodes, path, depth) {
    return nodes.map(function (n) {
      var fp = path ? path + '/' + n.n : n.n, pad = 'padding-left:' + (10 + depth * 16) + 'px';
      if (n.c) {
        var open = !!p.ui.open[fp];
        return '<button class="frow" style="' + pad + '" data-act="tree" data-arg="' + esc(fp) + '" aria-expanded="' + open + '">' + ic(open ? 'caretD' : 'caretR', 12) + ic('files', 14) + '<span class="t">' + esc(n.n) + '</span></button>' + (open ? tree(p, n.c, fp, depth + 1) : '');
      }
      return '<button class="frow' + (p.ui.fileSel === fp ? ' on' : '') + '" style="' + pad + ';padding-left:' + (28 + depth * 16) + 'px" data-act="file-sel" data-arg="' + esc(fp) + '">' + ic('file', 14) + '<span class="t">' + esc(n.n) + '</span></button>';
    }).join('');
  }

  function tool(p, id) {
    var ui = p.ui;
    if (id === 'files') {
      return '<div class="scroll tree" style="padding:8px">' + tree(p, p.files, '', 0) + '</div>' +
        (ui.fileSel ? '<div style="padding:10px 12px;border-top:1px solid var(--line-soft);display:flex;align-items:center;gap:8px"><span class="meta t">' + esc(ui.fileSel) + '</span><button class="btn sm" data-act="ctx-add">添加到对话</button></div>' : '');
    }
    if (id === 'diff') {
      if (!p.git) return '<div class="pv-empty"><h3>这个目录不是 Git 仓库</h3><p class="meta" style="margin:0">V1 的 Diff 基于 Git 显示未提交的变更。</p></div>';
      if (!p.diff.length) return '<div class="pv-empty"><h3>没有未提交的变更</h3><p class="meta" style="margin:0">Agent 修改文件后，这里会显示相对 HEAD 的变更。</p></div>';
      var sel = p.diff[ui.diffSel] || p.diff[0];
      var h = '<div class="meta" style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--line-soft)"><span>工作区变更（相对 HEAD）</span><span>' + p.diff.length + ' 个文件</span></div><div class="scroll"><div style="padding:8px;display:flex;flex-direction:column;gap:2px">';
      p.diff.forEach(function (d, i) { h += '<button class="frow' + (d === sel ? ' on' : '') + '" data-act="diff-sel" data-arg="' + i + '"><span class="fst">' + d.s + '</span><span class="t">' + esc(d.f) + '</span><span class="meta">+' + d.a + (d.d ? ' −' + d.d : '') + '</span></button>'; });
      h += '</div><div style="margin:4px 16px 16px;border:1px solid var(--line-soft);border-radius:10px;overflow:hidden"><div style="padding:8px 14px;background:var(--bg-sub);border-bottom:1px solid var(--line-soft);font:12px var(--mono);color:var(--fg-3)">' + esc(sel.f) + '</div><div class="code">';
      sel.hunk.forEach(function (l) { h += '<div class="ln' + (l[0] === '+' ? ' add' : l[0] === '-' ? ' del' : '') + '">' + (l[0] === ' ' ? '  ' : l[0] + ' ') + esc(l[1]) + '</div>'; });
      return h + '</div></div></div>';
    }
    if (id === 'browser') {
      return '<div class="urlbar"><button class="ib" data-act="browser-reload" data-tip="刷新" aria-label="刷新">' + ic('refresh') + '</button><input id="url-input" aria-label="地址" value="' + esc(ui.urlDraft != null ? ui.urlDraft : ui.url) + '"></div>' +
        '<div class="site"><div style="padding:14px 20px;border-bottom:1px solid var(--line-soft);display:flex;justify-content:space-between;font-size:13px"><b>' + esc(p.name) + '</b><span class="meta">Pricing · Docs · Sign in</span></div>' +
        '<div style="padding:40px 28px;display:flex;flex-direction:column;gap:10px"><div style="font-size:22px;font-weight:600;text-wrap:balance">本地预览：' + esc(p.name) + '</div><div class="meta">这是 localhost 页面的示例。真实产品中显示本地开发服务器的页面。</div><div><span class="btn pri" style="display:inline-flex">Get started</span></div></div></div>';
    }
    var lines = ui.term.map(function (l) { return esc(l.replace('{p}', p.id)); });
    var lastPrompt = lines.pop();
    return '<div class="term" id="term">' + lines.join('\n') + (lines.length ? '\n' : '') + lastPrompt + '<input id="term-input" aria-label="终端输入" autocomplete="off" spellcheck="false" value="' + esc(S().termVal || '') + '"></div>';
  }

  /* ---------- 启动页、对话框、演示控制 ---------- */
  function launch() {
    var st = S(), h = '<div class="launch"><div class="launch-in"><div><h1>AI Developer Studio</h1><div class="meta" style="margin-top:4px">打开一个本地目录作为 Project。</div></div>' +
      '<div><button class="btn pri" data-act="pick-dir">打开本地目录</button></div><div><div class="sec" style="padding-left:12px">最近打开</div>';
    st.recent.forEach(function (r) { h += '<button class="lp" data-act="open-dir" data-arg="' + r.p + '"><span>' + esc(r.p) + '</span><span class="p">' + esc(r.path) + ' · ' + r.at + '</span></button>'; });
    return h + '</div></div></div>';
  }
  function dialog() {
    var st = S(), d = st.dlg;
    if (!d) return '';
    if (d.type === 'close') {
      return '<div class="scrim"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">关闭 ' + esc(d.name) + '？</h3><p>' + d.n + ' 个 Session 仍在运行或等待你的确认。关闭后，它们的当前一轮会停止，对话记录会保留，重新打开 Project 后可以继续。</p>' +
        '<div class="acts"><button class="btn" data-act="dlg-cancel">取消</button><button class="btn danger" data-act="tab-close-confirm" data-arg="' + d.tab + '">关闭并停止</button></div></div></div>';
    }
    var h = '<div class="scrim"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">选择目录</h3><p>原型中模拟系统目录选择器。</p><div>';
    st.dirs.forEach(function (x) { h += '<button class="lp" data-act="open-dir" data-arg="' + x.p + '"><span>' + esc(x.p) + (st.projects[x.p] && st.tabs.some(function (t) { return t.p === x.p; }) ? ' <span class="meta">· 已打开</span>' : '') + '</span><span class="p">' + esc(x.path) + '</span></button>'; });
    return h + '</div><div class="acts"><button class="btn" data-act="dlg-cancel">取消</button></div></div></div>';
  }
  var AC = [
    ['AC-01 多项目', '在顶部三个 Project 之间切换，各自的 Session、View 与右侧边栏状态独立保留。'],
    ['AC-02 创建 Session', '点击 New Chat 并发送需求：Session 出现在左侧，显示 Running，回复流式输出。'],
    ['AC-03 并发执行', '“支付模块开发”（Codex）运行时，再发起一个 Claude Code 对话；切换不会打断后台执行。'],
    ['AC-04 完成提醒', '停留在其他页面，约 10 秒后“支付模块开发”完成并出现绿点；点击后直达最新内容，绿点消失。'],
    ['AC-05 Needs Input', '“修复 OAuth 回调”显示橙点，打开后在对话末尾看到等待卡片。admin-console 约 25 秒后也会请求确认。'],
    ['AC-06 Project View', '打开 Architecture，输入“把支付模块拆分成 Billing Service 和 Webhook Service”，右侧 Preview 会更新。'],
    ['AC-07 工具面板', '用右上角按钮或图标打开 Files / Diff / Browser / Terminal，关闭后空间恢复；Agent 不会自动打开它们。']
  ];
  function demo() {
    var st = S(), h = '<button class="dm-btn" data-act="demo" aria-expanded="' + !!st.demoOpen + '">演示控制</button>';
    if (st.toast) h += '<div class="toast" role="status">' + esc(st.toast) + '</div>';
    if (!st.demoOpen) return h;
    h += '<div class="dm" role="dialog" aria-label="演示控制"><div class="v2"><h4>v02 变更（探索中）</h4>' +
      '<div class="acrow"><b>从顶部开始</b>不足一屏的对话从顶部排列，不再贴在输入框上方。</div>' +
      '<div class="acrow"><b>Markdown 渲染</b>“运行测试并修复失败用例”“修复 OAuth 回调”：标题、列表、表格、行内代码，代码块带语言标签、高亮与复制按钮。</div>' +
      '<div class="acrow"><b>新对话居中</b>landing-page 标签页或点 New Chat：问候语与输入框在画布中部，发送后输入框回到底部。</div>' +
      '<div class="acrow"><b>消息列与输入框等宽</b>宽窗口下两者左右边缘对齐（720）。</div>' +
      '<div class="btns"><button class="btn sm' + (st.v01 ? ' on' : '') + '" data-act="demo-v01" aria-pressed="' + !!st.v01 + '">' + (st.v01 ? '正在显示 v01，切回 v02' : '对比 v01') + '</button></div></div><h4>验收场景</h4>';
    AC.forEach(function (a) { h += '<div class="acrow"><b>' + a[0] + '</b>' + a[1] + '</div>'; });
    h += '<h4>触发事件</h4><div class="btns"><button class="btn sm" data-act="demo-complete">后台 Session 完成</button><button class="btn sm" data-act="demo-need">后台请求确认</button>' +
      '<button class="btn sm" data-act="demo-error">后台出错</button><button class="btn sm" data-act="demo-cli">' + (st.cliAvail.claude ? '模拟 Claude Code 未登录' : '恢复 Claude Code 登录') + '</button>' +
      '<button class="btn sm" data-act="demo-reset">重置原型</button></div><div class="meta">所有数据均为示例，Agent 回复由原型模拟。</div></div>';
    return h;
  }

  function app() {
    var st = S(), p = proj(), h = top() + '<div class="body">';
    if (!p) h += launch();
    else {
      if (!st.navCollapsed) h += nav(p);
      h += p.ui.mode === 'view' ? viewMain(p) : sessionMain(p);
    }
    return h + '</div>' + dialog() + demo();
  }

  return { app: app, esc: esc, proj: proj, tab: tab, sessionsOf: sessionsOf, attention: attention, viewingSid: viewingSid, viewName: viewName, dur: dur, code: function (id) { return codeStore[id]; } };
})();
