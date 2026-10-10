/* AI Developer Studio 原型 v02 — 演示数据。全部为示例内容，不代表真实项目。v02 的 Agent 回复使用 Markdown。 */
window.PD = (function () {
  var MIN = 60e3, HR = 60 * MIN, DAY = 24 * HR;

  var VIEWS = [
    { id: 'overview', name: 'Overview' },
    { id: 'progress', name: 'Progress' },
    { id: 'architecture', name: 'Architecture' },
    { id: 'agents', name: 'Agent Team' },
    { id: 'flow', name: 'Business Flow' }
  ];
  var TOOLS = [
    { id: 'files', name: 'Files' },
    { id: 'diff', name: 'Diff' },
    { id: 'browser', name: 'Browser' },
    { id: 'terminal', name: 'Terminal' }
  ];
  var CLI = {
    codex: { name: 'Codex CLI', short: 'Codex', tag: 'CX', models: ['Codex · 默认', 'Codex · 高推理', 'Codex · 快速'] },
    claude: { name: 'Claude Code', short: 'Claude Code', tag: 'CC', models: ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'] }
  };

  function ui(extra) {
    var u = { mode: 'view', viewId: 'overview', sessionId: null, viewSession: {}, drafts: {}, sideOpen: false,
      tool: 'diff', rtool: 'preview', convW: 440, sideW: 400, ctx: [], diffSel: 0, fileSel: null, open: {},
      term: ['~/Projects/{p}  main', '$ '], url: 'http://localhost:3000' };
    for (var k in extra) u[k] = extra[k];
    return u;
  }
  function m(role, text, extra) { var o = { role: role, text: text }; for (var k in extra) o[k] = extra[k]; return o; }

  var SAAS_KNOWLEDGE = {
    overview: {
      summary: '面向独立开发者的订阅制 SaaS：用户注册后创建 Project，并按月订阅高级功能。',
      stack: ['Next.js', 'Node.js API', 'PostgreSQL', 'Stripe'],
      pct: 62, focus: '支付模块与 OAuth 登录稳定性',
      arch: 'Web App 通过 API Gateway 调用 Auth 与支付相关服务，数据存储在 PostgreSQL。',
      agents: 'Codex 负责支付与测试，Claude Code 负责认证与架构讨论。',
      notes: []
    },
    progress: {
      stage: 'MVP 开发中', pct: 62,
      ms: [
        { t: '项目初始化与基础框架', done: true },
        { t: '用户注册与邮箱验证', done: true },
        { t: 'OAuth 登录', done: false, now: true },
        { t: '订阅与支付', done: false, now: true },
        { t: '部署与监控', done: false }
      ],
      next: ['修复 OAuth 回调后丢失登录状态', '完成订阅续费与取消', '补齐部署脚本'],
      notes: []
    },
    architecture: { split: false, notes: [] },
    agents: {
      list: [
        { name: 'Codex', role: '支付模块、测试与部署脚本', src: ['AGENTS.md 中的项目规则', 'Skill：运行测试'] },
        { name: 'Claude Code', role: 'OAuth 登录与架构讨论', src: ['CLAUDE.md 中的项目说明', 'Skill：code review'] }
      ],
      notes: []
    },
    flow: {
      steps: ['用户注册', '邮箱验证', 'Onboarding', '创建 Project', '订阅'],
      focus: 4,
      map: [['Trigger', '用户在定价页点击订阅'], ['Frontend', 'apps/web/pages/pricing.tsx'], ['API', 'POST /api/billing/subscribe'],
        ['Service', 'Payment Service'], ['Data', 'subscriptions 表'], ['Result', '订阅生效，发送确认邮件']],
      notes: []
    }
  };

  var SAAS_FILES = [
    { n: 'apps', c: [
      { n: 'web', c: [{ n: 'auth', c: [{ n: 'callback.ts' }, { n: 'session.ts' }] }, { n: 'pages', c: [{ n: 'index.tsx' }, { n: 'pricing.tsx' }] }] },
      { n: 'api', c: [{ n: 'routes', c: [{ n: 'auth.ts' }, { n: 'stripe.ts' }] }] }
    ] },
    { n: 'services', c: [{ n: 'payment', c: [{ n: 'index.ts' }, { n: 'amount.ts' }] }] },
    { n: 'AGENTS.md' }, { n: 'CLAUDE.md' }, { n: 'README.md' }, { n: 'package.json' }
  ];

  var SAAS_DIFF = [
    { f: 'apps/web/auth/callback.ts', s: 'M', a: 6, d: 3, hunk: [
      [' ', 'export async function handleCallback(req, res) {'],
      ['-', '  res.redirect(nextUrl);'],
      ['-', '  await writeSession(res, user);'],
      ['+', '  await writeSession(res, user);'],
      ['+', '  res.redirect(nextUrl);'],
      [' ', '}']] },
    { f: 'services/payment/amount.ts', s: 'M', a: 4, d: 2, hunk: [
      [' ', 'export function toChargeAmount(price: number) {'],
      ['-', '  return Math.round(price * 100) / 100;'],
      ['+', '  // 按最小货币单位计算，避免浮点误差'],
      ['+', '  return Math.round(price * 100);'],
      [' ', '}']] },
    { f: 'services/payment/index.ts', s: 'M', a: 18, d: 4, hunk: [
      [' ', 'export class PaymentService {'],
      ['+', '  async renew(subscriptionId: string) {'],
      ['+', '    const sub = await this.repo.find(subscriptionId);'],
      ['+', '    return this.charge(sub.customerId, sub.amount);'],
      ['+', '  }'],
      [' ', '}']] }
  ];

  function seed() {
    var now = Date.now();
    var S = [
      { id: 's1', p: 'my-saas', cli: 'codex', title: '支付模块开发', model: 'Codex · 默认', status: 'running', unread: false, origin: null,
        last: now - 6 * MIN, roundStart: now - 3 * MIN,
        msgs: [m('user', '实现支付模块的订阅续费与取消。'), m('tool', 'Read  services/payment/index.ts\nRead  apps/api/routes/stripe.ts'),
          m('agent', [
          '我先梳理了现有的 `PaymentService`：',
          '',
          '- **续费**：读取订阅记录，按 `amount` 重新扣款；',
          '- **取消**：先调用 Stripe 取消订阅，再更新本地 `subscriptions` 表。',
          '',
          '正在实现续费逻辑。'
        ].join('\n'))],
        run: [{ t: 'wait', ms: 9000 }, { t: 'tool', text: 'Edit  services/payment/index.ts' },
          { t: 'say', text: [
          '续费与取消已实现：',
          '',
          '| 方法 | 说明 |',
          '|---|---|',
          '| `renew(subscriptionId)` | 读取订阅并重新扣款 |',
          '| `cancel(subscriptionId)` | 同步 Stripe 后更新本地状态 |',
          '',
          '新增 6 个单元测试，全部通过。取消流程参考了 [Stripe 文档](https://docs.stripe.com/billing/subscriptions/cancel)。'
        ].join('\n') }, { t: 'done', files: ['services/payment/index.ts'] }] },
      { id: 's2', p: 'my-saas', cli: 'claude', title: '修复 OAuth 回调', model: 'Sonnet 5.5', status: 'needs', unread: false, origin: null,
        last: now - 25 * MIN, roundStart: now - 24 * MIN,
        msgs: [m('user', 'OAuth 登录回调后一直跳回登录页，帮我排查并修复。'), m('tool', 'Read  apps/web/auth/callback.ts\nEdit  apps/web/auth/callback.ts'),
          m('agent', [
          '原因是回调处理在写入 session cookie 之前就发起了重定向，浏览器跟随跳转时还没有登录状态，于是又回到登录页。',
          '',
          '调整后的顺序：',
          '',
          '1. 校验 `state` 参数并换取 token；',
          '2. 调用 `writeSession` 写入 cookie；',
          '3. 最后再 `res.redirect(nextUrl)`。',
          '',
          '```diff',
          ' export async function handleCallback(req, res) {',
          '-  res.redirect(nextUrl);',
          '-  await writeSession(res, user);',
          '+  await writeSession(res, user);',
          '+  res.redirect(nextUrl);',
          ' }',
          '```',
          '',
          '我补充了一个回归测试，需要运行确认。'
        ].join('\n')),
          m('need', 'Claude Code 请求运行命令：', { cmd: 'pnpm test apps/web/auth', opts: ['允许', '拒绝'] })],
        run: [{ t: 'tool', text: 'Run   pnpm test apps/web/auth' }, { t: 'wait', ms: 1500 },
          { t: 'say', text: '回归测试通过。OAuth 回调现在会**先写入 session，再重定向**到目标页面。' }, { t: 'done', files: ['apps/web/auth/callback.ts'] }] },
      { id: 's3', p: 'my-saas', cli: 'codex', title: '运行测试并修复失败用例', model: 'Codex · 默认', status: null, unread: true, origin: null,
        last: now - 70 * MIN,
        msgs: [m('user', '运行全部测试，修复失败的用例。'), m('tool', 'Run   pnpm test\nEdit  services/payment/amount.ts\nRun   pnpm test'),
          m('agent', [
          '失败的 3 个用例都来自金额单位：`toChargeAmount` 返回以元为单位的小数（如 `19.99`），而 Stripe 要求以分为单位的整数（`1999`），扣款金额因此相差 100 倍。',
          '',
          '### 修改',
          '',
          '- `services/payment/amount.ts`：改为按分计算，直接返回整数；',
          '- `services/payment/amount.test.ts`：补充 3 个边界用例（`0.1 + 0.2`、`19.99`、大额订单）。',
          '',
          '```ts',
          'export function toChargeAmount(price: number) {',
          '  // 按最小货币单位计算，避免浮点误差',
          '  return Math.round(price * 100);',
          '}',
          '```',
          '',
          '### 测试结果',
          '',
          '| 测试集 | 通过 | 失败 |',
          '|---|---:|---:|',
          '| payment | 24 | 0 |',
          '| auth | 18 | 0 |',
          '| api | 31 | 0 |',
          '',
          '全部 73 个用例通过。建议把“金额一律按分存储”写进 `AGENTS.md`，避免其他 Session 再按元计算。'
        ].join('\n')),
          m('done', '', { dur: 242, files: ['services/payment/amount.ts'] })] },
      { id: 's6', p: 'my-saas', cli: 'codex', title: '部署脚本调试', model: 'Codex · 默认', status: 'error', unread: false, origin: null,
        last: now - DAY - 2 * HR,
        msgs: [m('user', '检查 deploy.sh 为什么在 CI 中失败。'), m('tool', 'Read  scripts/deploy.sh\nRun   bash scripts/deploy.sh --dry-run'),
          m('error', 'CLI 进程意外退出（exit code 1）。', { detail: 'Error: connect ETIMEDOUT 10.0.0.12:22\n    at TCPConnectWrap.afterConnect' })] },
      { id: 's4', p: 'my-saas', cli: 'claude', title: '架构整体讨论', model: 'Opus 5.5', status: null, unread: false, origin: 'architecture',
        last: now - DAY - 4 * HR,
        msgs: [m('user', '梳理当前的服务边界和外部依赖。'), m('agent', '已整理：Web App、API Gateway、Auth Service、Payment Service，外部依赖为 Stripe 和邮件服务。'),
          m('done', '', { dur: 95, files: [] })] },
      { id: 's5', p: 'my-saas', cli: 'codex', title: 'AI 模块设计', model: 'Codex · 高推理', status: null, unread: false, origin: 'architecture',
        last: now - 3 * DAY,
        msgs: [m('user', '讨论 AI 能力的模块边界。'), m('agent', '建议先作为 API Gateway 后的独立模块，后续再决定是否拆分为服务。'), m('done', '', { dur: 61, files: [] })] },
      { id: 's7', p: 'my-saas', cli: 'claude', title: '初始化项目结构', model: 'Sonnet 5.5', status: null, unread: false, origin: null,
        last: now - 9 * DAY,
        msgs: [m('user', '初始化 monorepo 结构。'), m('agent', '已创建 apps/web、apps/api 与 services 目录。'), m('done', '', { dur: 130, files: [] })] },

      { id: 's8', p: 'landing-page', cli: 'claude', title: '更新首页文案', model: 'Sonnet 5.5', status: null, unread: true, origin: null,
        last: now - 40 * MIN,
        msgs: [m('user', '把首屏标题改得更直接。'), m('agent', '已更新首屏标题和副标题。'), m('done', '', { dur: 48, files: ['src/pages/index.astro'] })] },
      { id: 's9', p: 'landing-page', cli: 'codex', title: '首屏性能优化', model: 'Codex · 快速', status: 'running', unread: false, origin: null,
        last: now - 2 * MIN, roundStart: now - 2 * MIN,
        msgs: [m('user', '优化首屏加载速度。'), m('tool', 'Read  src/pages/index.astro')],
        run: [{ t: 'wait', ms: 40000 }, { t: 'say', text: '已压缩首屏图片并延迟加载非关键脚本。' }, { t: 'done', files: ['src/pages/index.astro'] }] },
      { id: 's10', p: 'admin-console', cli: 'claude', title: '权限页面重构', model: 'Opus 5.5', status: 'running', unread: false, origin: null,
        last: now - 4 * MIN, roundStart: now - 4 * MIN,
        msgs: [m('user', '重构权限管理页面，拆分角色与成员两个标签页。'), m('tool', 'Read  src/routes/permissions.tsx')],
        run: [{ t: 'wait', ms: 25000 }, { t: 'say', text: '组件已拆分。需要安装一个表格依赖。' },
          { t: 'need', text: 'Claude Code 请求运行命令：', cmd: 'pnpm add @tanstack/react-table', opts: ['允许', '拒绝'] },
          { t: 'tool', text: 'Run   pnpm add @tanstack/react-table' }, { t: 'say', text: '依赖已安装，角色与成员标签页可以正常切换。' },
          { t: 'done', files: ['src/routes/permissions.tsx', 'package.json'] }] }
    ];

    var projects = {
      'my-saas': { id: 'my-saas', name: 'my-saas', path: '~/Projects/my-saas', cli: 'codex', git: true,
        k: JSON.parse(JSON.stringify(SAAS_KNOWLEDGE)), files: SAAS_FILES, diff: JSON.parse(JSON.stringify(SAAS_DIFF)), ui: ui({ mode: 'session', sessionId: 's3' }) },
      'landing-page': { id: 'landing-page', name: 'landing-page', path: '~/Projects/landing-page', cli: 'claude', git: true,
        k: { overview: { summary: '产品官网，静态站点。', stack: ['Astro', 'Tailwind CSS'], pct: 80, focus: '首屏性能', arch: '静态页面，部署在 CDN。', agents: '主要使用 Claude Code。', notes: [] } },
        files: [{ n: 'src', c: [{ n: 'pages', c: [{ n: 'index.astro' }] }] }, { n: 'package.json' }],
        diff: [], ui: ui({ mode: 'session', drafts: { chat: { cli: 'claude' } } }) },
      'admin-console': { id: 'admin-console', name: 'admin-console', path: '~/Projects/admin-console', cli: 'claude', git: true,
        k: {}, files: [{ n: 'src', c: [{ n: 'routes', c: [{ n: 'permissions.tsx' }] }] }, { n: 'package.json' }],
        diff: [], ui: ui({}) }
    };
    var sessions = {};
    S.forEach(function (s) { sessions[s.id] = s; });

    return {
      projects: projects, sessions: sessions,
      tabs: [{ id: 't1', p: 'my-saas' }, { id: 't2', p: 'landing-page' }, { id: 't3', p: 'admin-console' }],
      active: 't1', navCollapsed: false, cliAvail: { codex: true, claude: true }, seq: 100,
      recent: [
        { p: 'my-saas', path: '~/Projects/my-saas', at: '今天' },
        { p: 'landing-page', path: '~/Projects/landing-page', at: '今天' },
        { p: 'admin-console', path: '~/Projects/admin-console', at: '昨天' },
        { p: 'docs-site', path: '~/Projects/docs-site', at: '9 月 30 日' }
      ],
      dirs: [
        { p: 'my-saas', path: '~/Projects/my-saas' },
        { p: 'docs-site', path: '~/Projects/docs-site' },
        { p: 'cli-tools', path: '~/Projects/cli-tools' }
      ]
    };
  }

  function newProject(id, path) {
    return { id: id, name: id, path: path, cli: 'codex', git: id !== 'cli-tools', k: {},
      files: [{ n: 'docs', c: [{ n: 'getting-started.md' }] }, { n: 'README.md' }, { n: 'package.json' }], diff: [], ui: ui({}) };
  }

  return { VIEWS: VIEWS, TOOLS: TOOLS, CLI: CLI, seed: seed, newProject: newProject, MIN: MIN, HR: HR, DAY: DAY };
})();
