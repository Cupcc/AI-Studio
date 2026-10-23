/* AI Developer Studio 原型 v05（继承 v04 / v03）— Project View：Knowledge / View Definition 示例与受信组件 Renderer。
   Renderer 只认识 Project View spec §4.2 的 12 个组件；属性只取有限 JSON 值，文本全部转义输出，
   不执行脚本、HTML、CSS 或表达式。关系图只接收节点与边，坐标由 Renderer 计算。全部数据为示例。 */
window.PV = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var COMPONENTS = {
    stack: '纵向排列子组件，控制间距',
    grid: '多列网格；列数是上限，Preview 变窄时自动减少',
    section: '带标题的分区',
    text: '段落文本：lead / body / caption',
    metric: '单个指标，可带进度条',
    badge: '状态或标签，可按取值映射色调',
    list: '记录列表：行或卡片，可带字段与代码路径',
    table: '表格或键值表',
    timeline: '里程碑：done / active / todo',
    diagram: '关系图 / 流程图：只给节点与边，布局由 Renderer 计算',
    callout: '提示或风险说明',
    empty: '组件级空状态'
  };
  var LIMIT = { bytes: 256 * 1024, nodes: 500 };
  var VIEW_FILES = function (vid) { return ['.ai-studio/knowledge/' + vid + '.json', '.ai-studio/views/' + vid + '.view.json']; };

  /* ---------- 内置 View Definition（应用资源，Project 可覆盖）---------- */
  var BUILTIN = {
    overview: { schemaVersion: 1, viewId: 'overview', root: { type: 'stack', children: [
      { type: 'text', bind: 'summary', variant: 'lead' },
      { type: 'grid', columns: 3, children: [
        { type: 'metric', label: '整体进度', bind: 'progress', format: 'percent', bar: true },
        { type: 'metric', label: '当前阶段', bind: 'stage' },
        { type: 'metric', label: '下一个里程碑', bind: 'nextMilestone' }
      ] },
      { type: 'table', variant: 'kv', fields: [
        { label: '当前重点', bind: 'focus' },
        { label: '技术栈', bind: 'stack', format: 'badges' },
        { label: '架构', bind: 'architecture' },
        { label: 'Agent', bind: 'agents' }
      ] }
    ] } },
    progress: { schemaVersion: 1, viewId: 'progress', root: { type: 'stack', children: [
      { type: 'grid', columns: 2, children: [
        { type: 'metric', label: '整体进度', bind: 'progress', format: 'percent', bar: true },
        { type: 'metric', label: '当前阶段', bind: 'stage' }
      ] },
      { type: 'section', title: '里程碑', children: [
        { type: 'timeline', bind: 'milestones', title: 'title', status: 'status', meta: 'note' }
      ] },
      { type: 'section', title: '接下来', children: [
        { type: 'list', bind: 'next', title: 'title', meta: 'source' }
      ] },
      { type: 'callout', tone: 'attention', title: '风险', bind: 'risk' }
    ] } },
    architecture: { schemaVersion: 1, viewId: 'architecture', root: { type: 'stack', children: [
      { type: 'section', title: '模块关系', children: [
        { type: 'diagram', nodes: 'modules', edges: 'relations', direction: 'TB', nodeTitle: 'name', nodeCaption: 'role',
          laneBy: 'layer', lanes: [{ title: '客户端', keys: ['client'] }, { title: '入口', keys: ['entry'] }, { title: '服务', keys: ['service'] }, { title: '数据与外部服务', keys: ['data', 'external'] }],
          variantBy: 'layer', variants: { external: 'dashed' } }
      ] },
      { type: 'section', title: '模块与代码', children: [
        { type: 'table', bind: 'modules', columns: [{ label: '模块', key: 'name' }, { label: '职责', key: 'role' }, { label: '代码位置', key: 'path', format: 'path' }] }
      ] },
      { type: 'section', title: '技术栈', children: [
        { type: 'table', bind: 'stack', columns: [{ label: '层', key: 'layer' }, { label: '技术', key: 'tech' }] }
      ] }
    ] } },
    'agent-team': { schemaVersion: 1, viewId: 'agent-team', root: { type: 'stack', children: [
      { type: 'list', variant: 'cards', columns: 2, bind: 'agents', title: 'name', subtitle: 'role', badge: 'cli', paths: 'sources' },
      { type: 'section', title: 'Skill 与子 Agent', children: [
        { type: 'table', bind: 'skills', columns: [{ label: '名称', key: 'name', format: 'mono' }, { label: 'CLI', key: 'cli', format: 'badge' }, { label: '用途', key: 'purpose' }, { label: '文件', key: 'path', format: 'path' }] }
      ] },
      { type: 'section', title: '项目规则', children: [
        { type: 'list', bind: 'rules', title: 'text', paths: 'path' }
      ] },
      { type: 'text', variant: 'caption', value: '只展示 CLI 原生的 Agent、Skill 与规则文件；客户端不定义自己的 Agent 配置。' }
    ] } },
    'business-flow': { schemaVersion: 1, viewId: 'business-flow', root: { type: 'stack', children: [
      { type: 'section', title: '主流程', children: [
        { type: 'diagram', nodes: 'steps', edges: 'flow', direction: 'TB', nodeTitle: 'name', nodeCaption: 'actor', emphasis: { bind: 'focus' } }
      ] },
      { type: 'section', title: '步骤与代码', children: [
        { type: 'list', variant: 'cards', bind: 'mappings', title: 'step', badge: 'status', badgeTones: { '开发中': 'active', '已上线': 'done' },
          fields: [{ label: 'Trigger', key: 'trigger' }, { label: 'Frontend', key: 'frontend', format: 'path' }, { label: 'API', key: 'api', format: 'mono' },
            { label: 'Service', key: 'service' }, { label: 'Data', key: 'data', format: 'mono' }, { label: 'Result', key: 'result' }] }
      ] }
    ] } }
  };

  /* ---------- my-saas 的 Knowledge（事实，一个 View 一份）---------- */
  function k(vid, data) { return { schemaVersion: 1, viewId: vid, data: data }; }
  var SAAS = {
    overview: k('overview', {
      summary: '面向独立开发者的订阅制 SaaS：用户注册后创建 Project，并按月订阅高级功能。',
      progress: 62, stage: 'MVP 开发中', nextMilestone: 'OAuth 登录',
      focus: '支付模块与 OAuth 登录稳定性',
      stack: ['Next.js', 'Node.js API', 'PostgreSQL', 'Stripe'],
      architecture: 'Web App 通过 API Gateway 调用 Auth 与 Payment Service，数据存储在 PostgreSQL。',
      agents: 'Codex 负责支付与测试，Claude Code 负责认证与架构讨论。'
    }),
    progress: k('progress', {
      progress: 62, stage: 'MVP 开发中',
      milestones: [
        { title: '项目初始化与基础框架', status: 'done', note: '9 月 12 日完成' },
        { title: '用户注册与邮箱验证', status: 'done', note: '9 月 24 日完成' },
        { title: 'OAuth 登录', status: 'active', note: '回调后丢失登录状态，修复中' },
        { title: '订阅与支付', status: 'active', note: '续费与取消开发中' },
        { title: '部署与监控', status: 'todo', note: '' }
      ],
      next: [
        { title: '修复 OAuth 回调后丢失登录状态', source: 'Session · 修复 OAuth 回调' },
        { title: '完成订阅续费与取消', source: 'Session · 支付模块开发' },
        { title: '补齐部署脚本', source: 'scripts/deploy.sh' }
      ],
      risk: '部署脚本在 CI 中连接部署主机超时，原因尚未定位。'
    }),
    architecture: k('architecture', {
      modules: [
        { id: 'web', name: 'Web App', layer: 'client', role: 'Next.js · 用户界面', path: 'apps/web' },
        { id: 'gateway', name: 'API Gateway', layer: 'entry', role: '路由与鉴权入口', path: 'apps/api' },
        { id: 'auth', name: 'Auth Service', layer: 'service', role: '登录与 OAuth', path: 'apps/web/auth' },
        { id: 'payment', name: 'Payment Service', layer: 'service', role: '订阅、账单与 Stripe 回调', path: 'services/payment' },
        { id: 'db', name: 'PostgreSQL', layer: 'data', role: '主数据库', path: '' },
        { id: 'stripe', name: 'Stripe', layer: 'external', role: '支付（外部服务）', path: '' },
        { id: 'email', name: 'Email Provider', layer: 'external', role: '邮件（外部服务）', path: '' }
      ],
      relations: [
        { from: 'web', to: 'gateway', label: 'HTTPS' },
        { from: 'gateway', to: 'auth' },
        { from: 'gateway', to: 'payment' },
        { from: 'auth', to: 'db' },
        { from: 'auth', to: 'email', label: '验证邮件' },
        { from: 'payment', to: 'db' },
        { from: 'payment', to: 'stripe', label: '扣款 / 回调' }
      ],
      stack: [
        { layer: '前端', tech: 'Next.js · React' },
        { layer: 'API', tech: 'Node.js' },
        { layer: '数据', tech: 'PostgreSQL' },
        { layer: '支付', tech: 'Stripe Billing' }
      ]
    }),
    'agent-team': k('agent-team', {
      agents: [
        { name: 'Codex', cli: 'Codex CLI', role: '支付模块、测试与部署脚本', sources: ['AGENTS.md'] },
        { name: 'Claude Code', cli: 'Claude Code', role: 'OAuth 登录与架构讨论', sources: ['CLAUDE.md', '.claude/agents/reviewer.md'] }
      ],
      skills: [
        { name: 'reviewer', cli: 'Claude Code', purpose: '按项目规则审阅改动', path: '.claude/agents/reviewer.md' },
        { name: 'code-review', cli: 'Claude Code', purpose: '提交前检查改动', path: '.claude/skills/code-review/SKILL.md' }
      ],
      rules: [
        { text: '金额一律按分存储，不使用浮点数', path: 'AGENTS.md' },
        { text: '修改认证流程时补充回归测试', path: 'CLAUDE.md' }
      ]
    }),
    'business-flow': k('business-flow', {
      focus: 'charge',
      steps: [
        { id: 'signup', name: '注册', actor: '访客' },
        { id: 'verify', name: '邮箱验证', actor: '用户' },
        { id: 'onboard', name: 'Onboarding', actor: '用户' },
        { id: 'create', name: '创建 Project', actor: '用户' },
        { id: 'plan', name: '选择套餐', actor: '用户' },
        { id: 'charge', name: '扣款', actor: 'Stripe' },
        { id: 'active', name: '订阅生效', actor: '系统' },
        { id: 'dunning', name: '扣款失败提醒', actor: '系统' }
      ],
      flow: [
        { from: 'signup', to: 'verify' }, { from: 'verify', to: 'onboard' }, { from: 'onboard', to: 'create' },
        { from: 'create', to: 'plan' }, { from: 'plan', to: 'charge' },
        { from: 'charge', to: 'active', label: '成功' }, { from: 'charge', to: 'dunning', label: '失败' }
      ],
      mappings: [
        { step: '选择套餐', status: '已上线', trigger: '用户在定价页点击订阅', frontend: 'apps/web/pages/pricing.tsx', api: 'POST /api/billing/subscribe', service: 'Payment Service', data: 'subscriptions', result: '创建待支付的订阅' },
        { step: '扣款', status: '开发中', trigger: 'Stripe 回调扣款结果', frontend: '', api: 'POST /api/stripe/webhook', service: 'Payment Service', data: 'payments', result: '记录扣款结果并更新订阅' }
      ]
    })
  };

  /* Agent 在 Architecture 中“拆分支付模块”后写入的两份文件：Knowledge 更新事实，Project 覆盖的 Definition 只增加强调 */
  function splitArchitecture(kn) {
    var d = clone(kn); d.data.modules = d.data.modules.filter(function (m) { return m.id !== 'payment'; });
    d.data.modules.splice(3, 0,
      { id: 'billing', name: 'Billing Service', layer: 'service', role: '订阅、续费与账单', path: 'services/billing' },
      { id: 'webhook', name: 'Webhook Service', layer: 'service', role: '接收并校验 Stripe 回调', path: 'services/webhook' });
    d.data.relations = d.data.relations.filter(function (r) { return r.from !== 'payment' && r.to !== 'payment'; }).concat([
      { from: 'gateway', to: 'billing' }, { from: 'gateway', to: 'webhook', label: 'Stripe 回调' },
      { from: 'webhook', to: 'billing', label: '订阅事件' }, { from: 'billing', to: 'db' }, { from: 'billing', to: 'stripe', label: '扣款' }]);
    var def = clone(BUILTIN.architecture);
    def.root.children[0].children[0].emphasis = ['billing', 'webhook'];
    return { knowledge: d, definition: def };
  }

  /* 新 Project 生成时 Agent 写入的 Knowledge（示例）；呈现沿用内置 Definition */
  function generated(vid, name) {
    var G = {
      overview: { summary: name + ' 的项目概况：根据 README 与代码结构生成。', progress: 30, stage: '早期开发', nextMilestone: '核心功能', focus: '根据最近的对话与提交总结', stack: ['TypeScript', 'Node.js'], architecture: '单一 Web 应用，依赖少量外部服务。', agents: '尚未在 CLI 中配置专门的 Agent 规则。' },
      progress: { progress: 30, stage: '早期开发', milestones: [{ title: '项目初始化', status: 'done', note: '' }, { title: '核心功能', status: 'active', note: '进行中' }, { title: '首次发布', status: 'todo', note: '' }], next: [{ title: '补齐核心功能', source: 'README.md' }, { title: '完善 README', source: 'README.md' }], risk: '' },
      architecture: { modules: [{ id: 'app', name: 'Web App', layer: 'client', role: '用户界面', path: 'src' }, { id: 'api', name: 'API', layer: 'service', role: '业务接口', path: 'src/routes' }, { id: 'db', name: 'Database', layer: 'data', role: '数据存储', path: '' }], relations: [{ from: 'app', to: 'api' }, { from: 'api', to: 'db' }], stack: [{ layer: '语言', tech: 'TypeScript' }] },
      'agent-team': { agents: [{ name: 'Codex', cli: 'Codex CLI', role: '通用开发', sources: ['AGENTS.md'] }], skills: [], rules: [] },
      'business-flow': { focus: 'use', steps: [{ id: 'visit', name: '访问', actor: '访客' }, { id: 'signup', name: '注册', actor: '用户' }, { id: 'use', name: '使用核心功能', actor: '用户' }], flow: [{ from: 'visit', to: 'signup' }, { from: 'signup', to: 'use' }], mappings: [] }
    };
    return k(vid, G[vid]);
  }

  /* ---------- 校验：只接受内置 Schema 允许的组件与值 ---------- */
  var BAD_KEY = /^(on[a-z]\w*|html|innerhtml|script|style|css|classname|src|href|url|module|import|eval)$/i;
  var BAD_VAL = /<\s*\/?\s*[a-z!]|^\s*(javascript|data|https?):/i;
  function bytes(o) { return new TextEncoder().encode(JSON.stringify(o, null, 2)).length; }
  function countNodes(n) { if (!n || typeof n !== 'object') return 0; return 1 + (n.children || []).reduce(function (a, c) { return a + countNodes(c); }, 0); }
  function validate(def) {
    var errs = [], count = 0;
    function walk(n, path) {
      if (errs.length) return;
      count++;
      if (!n || typeof n !== 'object' || Array.isArray(n)) { errs.push({ path: path, msg: '组件必须是对象' }); return; }
      if (!COMPONENTS[n.type]) { errs.push({ path: path, msg: '不受支持的组件“' + n.type + '”' }); return; }
      Object.keys(n).forEach(function (key) {
        if (errs.length) return;
        if (BAD_KEY.test(key)) errs.push({ path: path + '.' + key, msg: '不允许的属性“' + key + '”' });
        else if (key !== 'children') scan(n[key], path + '.' + key);
      });
      (n.children || []).forEach(function (c, i) { walk(c, path + '.children[' + i + ']'); });
    }
    function scan(v, path) {
      if (errs.length) return;
      if (typeof v === 'function') errs.push({ path: path, msg: '不允许函数' });
      else if (typeof v === 'string' && BAD_VAL.test(v)) errs.push({ path: path, msg: '不允许 HTML、脚本或网络地址' });
      else if (v && typeof v === 'object') Object.keys(v).forEach(function (kk) { scan(v[kk], path + '.' + kk); });
    }
    if (!def || def.schemaVersion !== 1) errs.push({ path: 'schemaVersion', msg: '不支持的 schemaVersion“' + (def && def.schemaVersion) + '”，当前只支持 1' });
    else walk(def.root, 'root');
    if (!errs.length && count > LIMIT.nodes) errs.push({ path: 'root', msg: '组件节点 ' + count + ' 个，超过上限 ' + LIMIT.nodes });
    if (!errs.length && bytes(def) > LIMIT.bytes) errs.push({ path: '', msg: '文件超过 256 KB' });
    return errs;
  }

  /* ---------- 渲染 ---------- */
  function get(data, path) {
    if (typeof path !== 'string' || !/^[A-Za-z_]\w*(\.\w+)*$/.test(path)) return undefined;
    return path.split('.').reduce(function (o, kk) { return o == null ? undefined : o[kk]; }, data);
  }
  function miss(what) { return '<div class="vr-miss">缺少数据：' + esc(what) + '</div>'; }
  function safePath(p) { return typeof p === 'string' && p && !/^\/|\.\.|^[a-z]+:/i.test(p); }
  /* 路径只在“/”后换行 */
  function brk(p) { return esc(p).replace(/\//g, '/<wbr>'); }
  function pathBtn(p) { return safePath(p) ? '<button class="vr-path" data-act="open-path" data-arg="' + esc(p) + '">' + brk(p) + '</button>' : '<span class="vr-mono">' + esc(p) + '</span>'; }
  var TONE = { done: 'done', active: 'active', todo: 'neutral', attention: 'attention', neutral: 'neutral' };
  function badge(v, tone) { return '<span class="vr-badge t-' + (TONE[tone] || 'neutral') + '">' + esc(v) + '</span>'; }
  function cell(v, fmt, tones) {
    if (v == null || v === '') return '<span class="vr-dim">—</span>';
    if (fmt === 'path') return pathBtn(v);
    if (fmt === 'mono') return '<span class="vr-mono">' + esc(v) + '</span>';
    if (fmt === 'badge') return badge(v, tones && tones[v]);
    if (fmt === 'badges') return '<span class="vr-badges">' + [].concat(v).map(function (x) { return badge(x); }).join('') + '</span>';
    if (fmt === 'percent') return esc(v) + '%';
    return esc(v);
  }

  function node(n, data) {
    var f = R[n.type];
    return f ? f(n, data) : '';
  }
  function kids(n, data) { return (n.children || []).map(function (c) { return node(c, data); }).join(''); }
  var R = {
    stack: function (n, d) { return '<div class="vr-stack g-' + (n.gap || 'md') + '">' + kids(n, d) + '</div>'; },
    grid: function (n, d) { return '<div class="vr-grid" style="--n:' + Math.max(1, Math.min(4, n.columns || 2)) + '">' + kids(n, d) + '</div>'; },
    section: function (n, d) { return '<section class="vr-sec"><div class="lyr">' + esc(n.title) + '</div>' + (n.caption ? '<div class="meta">' + esc(n.caption) + '</div>' : '') + '<div class="vr-sec-b">' + kids(n, d) + '</div></section>'; },
    text: function (n, d) {
      var v = n.bind ? get(d, n.bind) : n.value;
      if (v == null || v === '') return n.bind ? miss(n.bind) : '';
      return '<p class="vr-text v-' + (n.variant || 'body') + '">' + esc(v) + '</p>';
    },
    metric: function (n, d) {
      var v = get(d, n.bind);
      if (v == null) return '<div class="vr-metric"><div class="lyr">' + esc(n.label) + '</div>' + miss(n.bind) + '</div>';
      var pct = n.format === 'percent' ? Math.max(0, Math.min(100, +v)) : null;
      return '<div class="vr-metric"><div class="lyr">' + esc(n.label) + '</div><div class="v' + (pct == null && typeof v !== 'number' ? ' txt' : '') + '">' + cell(v, n.format) + '</div>' +
        (n.bar && pct != null ? '<div class="bar" role="img" aria-label="' + pct + '%"><i style="width:' + pct + '%"></i></div>' : '') + '</div>';
    },
    badge: function (n, d) { var v = n.bind ? get(d, n.bind) : n.value; return v == null ? miss(n.bind) : '<span class="vr-badges">' + [].concat(v).map(function (x) { return badge(x, (n.tones || {})[x]); }).join('') + '</span>'; },
    list: function (n, d) {
      var items = get(d, n.bind);
      if (!Array.isArray(items)) return miss(n.bind);
      if (!items.length) return '<div class="vr-empty">暂无记录</div>';
      var cards = n.variant === 'cards';
      var h = cards ? '<div class="vr-cards" style="--n:' + Math.max(1, Math.min(3, n.columns || 1)) + '">' : '<div class="vr-rows">';
      items.forEach(function (it) {
        var paths = n.paths ? [].concat(it[n.paths] || []).filter(Boolean) : [];
        h += '<div class="' + (cards ? 'vr-card' : 'vr-row') + '"><div class="vr-rt"><span class="tt">' + esc(it[n.title]) + '</span>' +
          (n.badge && it[n.badge] ? badge(it[n.badge], (n.badgeTones || {})[it[n.badge]]) : '') +
          (n.meta && it[n.meta] ? '<span class="meta">' + esc(it[n.meta]) + '</span>' : '') + '</div>' +
          (n.subtitle && it[n.subtitle] ? '<div class="vr-sub">' + esc(it[n.subtitle]) + '</div>' : '');
        if (n.fields) h += '<dl class="vr-kv sm">' + n.fields.map(function (fd) { return '<dt>' + esc(fd.label) + '</dt><dd>' + cell(it[fd.key], fd.format) + '</dd>'; }).join('') + '</dl>';
        if (paths.length) h += '<div class="vr-paths">' + paths.map(pathBtn).join('') + '</div>';
        h += '</div>';
      });
      return h + '</div>';
    },
    table: function (n, d) {
      if (n.variant === 'kv') {
        return '<dl class="vr-kv">' + (n.fields || []).map(function (fd) { return '<dt>' + esc(fd.label) + '</dt><dd>' + cell(get(d, fd.bind), fd.format) + '</dd>'; }).join('') + '</dl>';
      }
      var rows = get(d, n.bind);
      if (!Array.isArray(rows)) return miss(n.bind);
      if (!rows.length) return '<div class="vr-empty">暂无记录</div>';
      var cols = n.columns || [];
      return '<div class="tw vr-tw"><table class="vr-t"><thead><tr>' + cols.map(function (c) { return '<th' + (c.align === 'right' ? ' class="r"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td' + (c.align === 'right' ? ' class="r"' : '') + '>' + cell(r[c.key], c.format, c.tones) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    },
    timeline: function (n, d) {
      var items = get(d, n.bind);
      if (!Array.isArray(items)) return miss(n.bind);
      var label = { done: '已完成', active: '进行中', todo: '未开始' };
      return '<ol class="vr-tl">' + items.map(function (it) {
        var s = it[n.status] in label ? it[n.status] : 'todo';
        return '<li class="s-' + s + '"><div class="vr-rt"><span class="tt">' + esc(it[n.title]) + '</span>' + badge(label[s], s) + '</div>' + (n.meta && it[n.meta] ? '<div class="vr-sub">' + esc(it[n.meta]) + '</div>' : '') + '</li>';
      }).join('') + '</ol>';
    },
    callout: function (n, d) {
      var v = n.bind ? get(d, n.bind) : n.value;
      if (v == null || v === '') return '';
      return '<div class="vr-call t-' + (n.tone === 'attention' ? 'attention' : 'info') + '">' + (n.title ? '<b>' + esc(n.title) + '</b>' : '') + '<span>' + esc(v) + '</span></div>';
    },
    empty: function (n) { return '<div class="vr-empty">' + esc(n.value || '暂无内容') + '</div>'; },
    diagram: function (n, d) { return diagram(n, d); }
  };

  /* 关系图布局：有 lanes 时按分组排行；否则按最长路径分层（先去掉回边）。每层按上一层相连节点的平均位置排序。 */
  function diagram(n, d) {
    var nodes = get(d, n.nodes), edges = get(d, n.edges) || [];
    if (!Array.isArray(nodes) || !nodes.length) return miss(n.nodes);
    var key = n.nodeKey || 'id', tKey = n.nodeTitle || 'name', cKey = n.nodeCaption;
    var LR = n.direction === 'LR', lanes = !LR && n.lanes, W = lanes ? 136 : 148, H = cKey ? 50 : 36, GX = LR ? 56 : (lanes ? 24 : 16), GY = LR ? 14 : (lanes ? 44 : 34), G = lanes ? 64 : 0;
    var by = {};
    nodes.forEach(function (x, i) { by[x[key]] = { d: x, i: i, r: 0 }; });
    var E = edges.filter(function (e) { return by[e.from] && by[e.to] && e.from !== e.to; });
    var titles = [];
    if (lanes) {
      var used = n.lanes.filter(function (l) { return nodes.some(function (x) { return l.keys.indexOf(x[n.laneBy]) >= 0; }); });
      nodes.forEach(function (x) { var r = -1; used.forEach(function (l, j) { if (l.keys.indexOf(x[n.laneBy]) >= 0) r = j; }); by[x[key]].r = r < 0 ? used.length : r; });
      titles = used.map(function (l) { return l.title; });
    } else {
      var st = {}, back = {};
      var dfs = function (id) { st[id] = 1; E.forEach(function (e, j) { if (e.from !== id) return; if (st[e.to] === 1) back[j] = 1; else if (!st[e.to]) dfs(e.to); }); st[id] = 2; };
      nodes.forEach(function (x) { if (!st[x[key]]) dfs(x[key]); });
      for (var it = 0; it < nodes.length; it++) E.forEach(function (e, j) { if (!back[j] && by[e.to].r < by[e.from].r + 1) by[e.to].r = by[e.from].r + 1; });
    }
    var rows = [];
    nodes.forEach(function (x) { var o = by[x[key]]; (rows[o.r] = rows[o.r] || []).push(o); });
    rows = rows.filter(Boolean);
    rows.forEach(function (row, r) {
      if (r) row.forEach(function (o) {
        var ps = E.filter(function (e) { return by[e.to] === o && by[e.from].r < o.r; }).map(function (e) { return by[e.from].k; });
        o.bc = ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : o.i;
      });
      if (r) row.sort(function (a, b) { return a.bc - b.bc || a.i - b.i; });
      row.forEach(function (o, kk) { o.k = kk; o.row = r; });
    });
    var maxN = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    var span = maxN * (LR ? H : W) + (maxN - 1) * (LR ? GY : GX);
    rows.forEach(function (row, r) {
      var len = row.length * (LR ? H : W) + (row.length - 1) * (LR ? GY : GX), o0 = (span - len) / 2;
      row.forEach(function (o, kk) {
        if (LR) { o.x = r * (W + GX); o.y = o0 + kk * (H + GY); }
        else { o.x = G + o0 + kk * (W + GX); o.y = r * (H + GY); }
      });
    });
    var TW = LR ? rows.length * (W + GX) - GX : G + span, TH = LR ? span : rows.length * (H + GY) - GY;
    var em = Array.isArray(n.emphasis) ? n.emphasis : (n.emphasis && n.emphasis.bind ? [].concat(get(d, n.emphasis.bind) || []) : []);
    var svg = '<svg class="dg-svg" width="' + TW + '" height="' + TH + '" viewBox="0 0 ' + TW + ' ' + TH + '" aria-hidden="true"><defs><marker id="dg-a" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" class="dg-ah"/></marker></defs>';
    var labels = '';
    /* 分组之间画一条浅分隔线，分组名放在左侧栏，避免与连线重叠 */
    if (lanes) for (var sr = 1; sr < rows.length; sr++) svg += '<path class="dg-sep" d="M0 ' + (sr * (H + GY) - GY / 2) + 'H' + TW + '"/>';
    E.forEach(function (e) {
      var a = by[e.from], b = by[e.to], x1, y1, x2, y2, p;
      if (a.row === b.row) {
        var l2r = a.x < b.x || (LR && a.y < b.y);
        if (LR) { x1 = a.x + W / 2; x2 = b.x + W / 2; y1 = l2r ? a.y + H : a.y; y2 = l2r ? b.y : b.y + H; }
        else { y1 = a.y + H / 2; y2 = b.y + H / 2; x1 = l2r ? a.x + W : a.x; x2 = l2r ? b.x : b.x + W; }
        p = 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2;
      } else if (LR) {
        var fw = b.row > a.row; x1 = fw ? a.x + W : a.x; x2 = fw ? b.x : b.x + W; y1 = a.y + H / 2; y2 = b.y + H / 2;
        var cx = (x2 - x1) / 2; p = 'M' + x1 + ' ' + y1 + 'C' + (x1 + cx) + ' ' + y1 + ',' + (x2 - cx) + ' ' + y2 + ',' + x2 + ' ' + y2;
      } else {
        var dn = b.row > a.row; x1 = a.x + W / 2; x2 = b.x + W / 2; y1 = dn ? a.y + H : a.y; y2 = dn ? b.y : b.y + H;
        var cy = (y2 - y1) / 2; p = 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + (y1 + cy) + ',' + x2 + ' ' + (y2 - cy) + ',' + x2 + ' ' + y2;
      }
      /* 同层相邻节点之间放不下文字：只画箭头，标签放进悬停提示 */
      svg += '<path class="dg-e" d="' + p + '" marker-end="url(#dg-a)">' + (e.label ? '<title>' + esc(e.label) + '</title>' : '') + '</path>';
      if (e.label && a.row !== b.row) labels += '<text class="dg-l" x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2) + '" text-anchor="middle" dominant-baseline="central">' + esc(e.label) + '</text>';
    });
    svg += labels + '</svg>';
    var h = '<div class="vr-dg"><div class="dg-in" style="width:' + TW + 'px;height:' + TH + 'px">' + svg;
    titles.forEach(function (t, r) { h += '<div class="dg-lane" style="top:' + (r * (H + GY)) + 'px;width:' + (G - 10) + 'px;height:' + H + 'px">' + esc(t) + '</div>'; });
    nodes.forEach(function (x) {
      var o = by[x[key]], v = n.variantBy && n.variants ? n.variants[x[n.variantBy]] : '';
      h += '<div class="dg-n' + (em.indexOf(x[key]) >= 0 ? ' em' : '') + (v === 'dashed' ? ' dashed' : '') + '" style="left:' + o.x + 'px;top:' + o.y + 'px;width:' + W + 'px;height:' + H + 'px" title="' + esc(x[tKey] + (cKey && x[cKey] ? ' · ' + x[cKey] : '')) + '">' +
        '<b>' + esc(x[tKey]) + '</b>' + (cKey ? '<span>' + esc(x[cKey] || '') + '</span>' : '') + '</div>';
    });
    return h + '</div></div>';
  }

  function render(def, kn) { return node(def.root, (kn && kn.data) || {}); }

  /* ---------- 组件清单（演示控制中打开）---------- */
  var GALLERY = [
    ['stack', { type: 'stack', gap: 'sm', children: [{ type: 'text', value: '第一段' }, { type: 'text', value: '第二段' }] }, {}],
    ['grid', { type: 'grid', columns: 3, children: [{ type: 'metric', label: '测试', bind: 'a' }, { type: 'metric', label: '覆盖率', bind: 'b', format: 'percent' }, { type: 'metric', label: '构建', bind: 'c' }] }, { a: 73, b: 81, c: '通过' }],
    ['section', { type: 'section', title: '模块与代码', caption: '可选说明', children: [{ type: 'text', bind: 'x' }] }, { x: '分区内容' }],
    ['text', { type: 'stack', gap: 'sm', children: [{ type: 'text', bind: 's', variant: 'lead' }, { type: 'text', bind: 's' }, { type: 'text', bind: 's', variant: 'caption' }] }, { s: '订阅制 SaaS，按月订阅高级功能。' }],
    ['metric', { type: 'metric', label: '整体进度', bind: 'p', format: 'percent', bar: true }, { p: 62 }],
    ['badge', { type: 'badge', bind: 'b', tones: { '已上线': 'done', '开发中': 'active', '阻塞': 'attention' } }, { b: ['已上线', '开发中', '阻塞', 'Stripe'] }],
    ['list', { type: 'list', variant: 'cards', columns: 2, bind: 'items', title: 'name', subtitle: 'role', badge: 'cli', paths: 'src' }, { items: [{ name: 'Codex', role: '支付与测试', cli: 'Codex CLI', src: ['AGENTS.md'] }, { name: 'Claude Code', role: '认证与架构', cli: 'Claude Code', src: ['CLAUDE.md'] }] }],
    ['table', { type: 'table', bind: 'rows', columns: [{ label: '测试集', key: 'n' }, { label: '通过', key: 'p', align: 'right' }, { label: '文件', key: 'f', format: 'path' }] }, { rows: [{ n: 'payment', p: 24, f: 'services/payment' }, { n: 'auth', p: 18, f: 'apps/web/auth' }] }],
    ['timeline', { type: 'timeline', bind: 'm', title: 't', status: 's', meta: 'n' }, { m: [{ t: '基础框架', s: 'done', n: '9 月 12 日完成' }, { t: 'OAuth 登录', s: 'active', n: '修复中' }, { t: '部署与监控', s: 'todo' }] }],
    ['diagram', { type: 'diagram', nodes: 'n', edges: 'e', direction: 'LR', nodeTitle: 'name', emphasis: ['b'] }, { n: [{ id: 'a', name: '定价页' }, { id: 'b', name: '订阅 API' }, { id: 'c', name: 'Stripe' }, { id: 'd', name: 'subscriptions' }], e: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: '扣款' }, { from: 'b', to: 'd' }] }],
    ['callout', { type: 'callout', tone: 'attention', title: '风险', bind: 'r' }, { r: '部署脚本在 CI 中连接超时。' }],
    ['empty', { type: 'empty', value: '还没有里程碑' }, {}]
  ];
  function gallery() {
    return GALLERY.map(function (g) {
      return '<div class="gal-i"><div class="gal-h"><b class="vr-mono">' + g[0] + '</b><span class="meta">' + esc(COMPONENTS[g[0]]) + '</span></div>' +
        '<div class="gal-b"><pre class="gal-j">' + esc(JSON.stringify(g[1], null, 2)) + '</pre><div class="gal-r">' + node(g[1], g[2]) + '</div></div></div>';
    }).join('');
  }

  return {
    COMPONENTS: COMPONENTS, LIMIT: LIMIT, BUILTIN: BUILTIN, SAAS: SAAS, files: VIEW_FILES,
    splitArchitecture: splitArchitecture, generated: generated, validate: validate, render: render,
    bytes: bytes, countNodes: countNodes, gallery: gallery, clone: clone
  };
})();
