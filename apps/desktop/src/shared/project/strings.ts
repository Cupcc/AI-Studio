// Shell UI copy in one place (NAV-Q13 recommendation: Chinese copy with
// English product terms). Proposed wording from the project / navigation
// specs; final copy is pending review.
import type { OpenFailureReason, ToolId, ViewId } from './types'

export const PRODUCT_NAME = 'AI Developer Studio'

export const VIEW_NAMES: Record<ViewId, string> = {
  overview: 'Overview',
  progress: 'Progress',
  architecture: 'Architecture',
  'agent-team': 'Agent Team',
  'business-flow': 'Business Flow'
}

export const TOOL_NAMES: Record<ToolId, string> = {
  files: 'Files',
  search: 'Search',
  diff: 'Diff',
  browser: 'Browser',
  terminal: 'Terminal'
}

export const S = {
  // Tabs and top bar
  launcherTabTitle: '新标签页',
  newTab: '新建标签页',
  closeTab: (name: string) => `关闭 ${name}`,
  collapseNav: '折叠导航',
  expandNav: '展开导航',
  rightSidebar: '右侧边栏',
  availableAfterOpen: '打开 Project 后可用',
  tabAttention: {
    needs_input: '有等待你输入的对话',
    error: '有出错的对话',
    completed_unread: '有已完成未查看的对话'
  },

  // Launcher
  launcherSubtitle: '打开一个本地目录作为 Project。',
  openDirectory: '打开本地目录',
  recentProjects: '最近打开',
  alreadyOpen: '已打开',
  removeFromRecent: '从列表移除',
  openErrors: {
    not_found: '目录不存在。',
    not_directory: '所选路径不是目录。',
    unreadable: '无法读取该目录，请检查访问权限。'
  } satisfies Record<OpenFailureReason, string>,
  privacyHint: '可在系统设置的隐私与安全性中允许访问。',
  recentStatus: {
    not_found: '目录不存在',
    not_directory: '目录不存在',
    unreadable: '无法访问'
  } satisfies Record<OpenFailureReason, string>,
  pickerTitle: '选择 Project 目录',
  pickerButton: '打开',

  // Left navigation
  navLabel: 'Project 导航',
  newChat: 'New Chat',
  chooseCli: '选择 CLI',
  projectViews: 'PROJECT VIEWS',
  sessions: 'SESSIONS',
  sessionsEmpty: '还没有对话',
  untitledSession: '未命名对话',
  cliMenuPending: 'CLI 菜单由 Session 模块提供',

  // Canvas placeholders (content mounted by other tasks)
  draftTitle: '新对话',
  placeholderConversation: '对话内容将在这里显示。',
  placeholderDraft: '新的对话将在这里显示。',
  placeholderViewConversation: '当前 Project View 的对话将在这里显示。',
  placeholderPreview: (view: string) => `${view} 的项目预览将在这里显示。`,
  placeholderTool: (tool: string) => `${tool} 的工具内容将在这里显示。`,
  preview: 'Preview',
  close: '关闭',
  resizeSidebar: '调整右侧边栏宽度',
  resizeConversation: '调整对话列宽度',

  // Close and quit confirmation (D-10; PROJ-Q6, PROJ-Q7)
  closeTitle: (name: string) => `关闭 ${name}？`,
  closeBody: (n: number, terminals = 0) => [
    n ? `${n} 个对话仍在运行或等待你的输入。当前一轮将停止，对话记录会保留。` : '',
    terminals ? `${terminals} 个终端尚未退出，终端及其运行的命令将结束。` : ''
  ].filter(Boolean).join(' '),
  closeConfirm: '关闭并停止',
  cancel: '取消',
  stopping: '正在停止…',
  stopFailedTitle: '部分资源未能停止',
  stopFailedBody: '以下资源未能完成清理，Project 保持打开。请检查原因后重试。',
  stopTimeout: '停止超时',
  retry: '重试',
  quitTitle: `退出 ${PRODUCT_NAME}？`,
  quitBody: (sessions: number, projects: number, terminals = 0) =>
    `${projects} 个 Project 中有${sessions ? ` ${sessions} 个活动对话` : ''}${sessions && terminals ? '及' : ''}${terminals ? ` ${terminals} 个未退出终端` : ''}。`
    + `${[sessions ? '对话当前一轮将停止，历史保留' : '', terminals ? '终端及其运行的命令将结束' : ''].filter(Boolean).join('；')}。`,
  quitFailedTitle: '退出未完成',
  quitFailedBody: '部分资源未能清理，应用保持打开。请检查原因后重试。',
  quitConfirm: '停止并退出',

  // Application menu (PROJ-Q17)
  menu: {
    file: '文件',
    edit: '编辑',
    view: '显示',
    window: '窗口',
    newTab: '新建标签页',
    openDirectory: '打开本地目录…',
    closeTab: '关闭标签页',
    nextTab: '显示下一个标签页',
    previousTab: '显示上一个标签页',
    go: '转到',
    quickOpen: '快速打开文件…',
    showFiles: 'Files',
    showSearch: '在文件中搜索',
    showDiff: '源代码变更（Diff）',
    showBrowser: 'Browser',
    toggleTerminal: '切换 Terminal'
  }
} as const
