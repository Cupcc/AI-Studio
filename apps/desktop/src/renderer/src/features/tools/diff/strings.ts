import { displayName } from '../../../lib/display-path'
// User-facing copy of the project Diff panel (FR-TOOL-002; specs/tools/spec.md §3). The contracts carry reason codes only;
// the wording lives here. Wording rules: `no_head` and `not_git` never say "no changes" (FR-TOOL-002 item 3), and the
// client never initializes Git or creates commits, so the text only tells the user what they can do themselves.
import type { DiffAvailability, DiffChangeKind, DiffSideOmitted } from '@shared/tools/diff'

/** Words between backticks render as <code> (see InlineText). */
export interface StateMessage { title: string; body: readonly string[] }

export const KIND_LETTER: Record<DiffChangeKind, string> = {
  added: 'A', modified: 'M', deleted: 'D', renamed: 'R', copied: 'C', typechange: 'T', conflicted: 'U'
}
export const KIND_LABEL: Record<DiffChangeKind, string> = {
  added: '新增', modified: '修改', deleted: '删除', renamed: '重命名', copied: '复制', typechange: '类型变更', conflicted: '冲突'
}

/** Why one side of a file has no text. Sizes are appended by the caller when known. */
export const OMITTED: Record<DiffSideOmitted, string> = {
  binary: '二进制文件，不显示文本对比。',
  too_large: '文件过大，超过两侧对比的显示上限。',
  unsupported_encoding: '文件不是 UTF-8 编码，无法按文本对比。',
  symlink: '符号链接：只显示补丁，不跟随链接目标。',
  submodule: '子模块：只显示补丁，不展开子模块内容。',
  unreadable: '无法读取文件内容。',
  changed_while_reading: '读取时文件仍在变化，请稍后刷新。'
}

/** Messages for every availability except `ready`. Shared by the project list and the single-file view. */
export const AVAILABILITY: Record<Exclude<DiffAvailability, 'ready'>, StateMessage> = {
  clean: {
    title: '没有未提交变更',
    body: ['工作区与 HEAD 一致：没有已暂存、未暂存或未跟踪的内容。']
  },
  no_head: {
    title: '还没有首个提交，基线（HEAD）不可用',
    body: [
      '没有 HEAD 就无法比较变更，所以这里列出的是 Git 可见的非忽略文件，按新增显示；这并不表示它们已被添加或提交。',
      '本客户端不会替你创建提交或仓库；在 Terminal 中完成首次提交后，这里会显示相对 HEAD 的变更。'
    ]
  },
  not_git: {
    title: '此目录不是 Git 仓库',
    body: [
      '项目变更依赖 Git：当前 Project 目录不在任何 Git 仓库内，因此无法显示变更。',
      '需要时可以在 Terminal 中自行运行 `git init` 创建仓库。本客户端不会自动初始化 Git，也不会替你创建提交。'
    ]
  },
  git_missing: {
    title: '未检测到 Git',
    body: [
      '项目变更需要本机安装 Git 命令行工具，但没有找到可用的 Git。',
      '可以在 Terminal 中运行 `xcode-select --install`，或用 Homebrew 运行 `brew install git`，安装后点击刷新。'
    ]
  },
  git_unsafe_directory: {
    title: 'Git 不信任此目录',
    body: [
      '该目录的所有者与当前用户不同，Git 出于安全考虑拒绝读取它（detected dubious ownership）。',
      '确认目录可信后，可以在 Terminal 中运行 `git config --global --add safe.directory <项目目录的绝对路径>`，再点击刷新。本客户端不会代你修改 Git 配置。'
    ]
  },
  project_unavailable: {
    title: '项目目录不可用',
    body: ['无法访问该 Project 的目录：它可能已被移动、删除，或没有访问权限。']
  },
  project_closing: {
    title: '项目正在关闭',
    body: ['该 Project 正在关闭，暂时无法读取变更。']
  },
  timeout: {
    title: '读取变更超时',
    body: ['Git 没有在限定时间内完成，项目可能很大或磁盘较慢。可以稍后重试。']
  },
  failed: {
    title: '无法读取变更',
    body: ['Git 返回了错误。']
  }
}

export const D = {
  title: '项目变更',
  baselineUnknown: '相对 HEAD',
  baseline: (branch: string, commit: string) => `相对 HEAD (${displayName(branch)} @ ${commit})`,
  baselineDetached: (commit: string) => `相对 HEAD (已分离 @ ${commit})`,
  baselineBranchOnly: (branch: string) => `相对 HEAD (${displayName(branch)})`,
  baselineNoHead: 'HEAD 不可用（尚无首个提交）',
  fileCount: (count: number) => `${count} 个文件`,
  fileCountTruncated: (count: number) => `显示前 ${count} 个文件`,
  additions: (count: number) => `+${count}`,
  deletions: (count: number) => `−${count}`,
  additionsLabel: (count: number) => `新增 ${count} 行`,
  deletionsLabel: (count: number) => `删除 ${count} 行`,
  refresh: '刷新项目变更',
  refreshing: '正在刷新…',
  loading: '正在读取项目变更…',
  inactive: '切换到 Diff 后读取项目变更。',
  retry: '重试',
  watchUnavailable: '自动刷新不可用',
  watchUnavailableTip: '无法监听文件变化。可以手动刷新，窗口回到前台时也会自动刷新。',
  loadFailed: (reason: string) => `无法读取项目变更：${reason}`,
  staleResult: '以下是上次读取的结果，可能已过期。',
  detailLabel: '诊断信息',
  repoPrefix: (prefix: string) => `此 Project 位于 Git 仓库的子目录 \`${displayName(prefix)}\` 中，只显示该目录内的变更，路径相对于 Project 目录。`,
  unsettled: '文件仍在变化，结果可能不是最终状态',
  truncated: (count: number) => `变更文件过多，只显示前 ${count} 个。`,
  noHeadEmpty: {
    title: '还没有首个提交，目录中也没有可列出的文件',
    body: ['基线（HEAD）不可用，目录里暂时没有可显示的文件。在 Terminal 中创建文件并完成首次提交后，这里会显示相对 HEAD 的变更。']
  },
  untracked: '未跟踪',
  modeOnly: '仅模式变化',
  binary: '二进制',
  symlink: '符号链接',
  submodule: '子模块',
  listLabel: '变更文件',
  selectHint: '选择一个文件查看变更。',
  selectionCleared: (path: string) => `之前选中的 \`${displayName(path)}\` 已没有变更，已取消选择。`,
  dismiss: '知道了',
  splitterLabel: '调整文件列表与文件变更的高度',
  fileTitle: (path: string) => `${displayName(path)} 的变更`,
  closeFile: '关闭文件变更',
  fileLoading: '正在读取文件变更…',
  fileLoadFailed: (reason: string) => `无法读取该文件的变更：${reason}`,
  fileUnchanged: '该文件已无变更',
  fileUnchangedHint: '文件列表会在下次刷新后更新。',
  fileUnsettled: '文件仍在变化，结果可能不是最终状态',
  fileConflicted: '该文件有未解决的合并冲突，显示的是工作区内容相对 HEAD 的差异。',
  contentUnchanged: '内容没有变化。',
  modeChange: (from: string, to: string) => `文件模式：${from} → ${to}`,
  sideOriginal: '修改前',
  sideModified: '修改后',
  sizeSuffix: (size: string) => `（${size}）`,
  noContent: '没有可显示的内容。',
  patchLabel: '补丁内容',
  patchTruncated: '补丁过大，已截断，只显示开头部分。',
  patchLinesHidden: (count: number) => `补丁较长，已省略其余 ${count} 行。`,
  viewerLoading: '正在加载代码视图…',
  viewerInactive: '回到 Diff 后显示代码视图。',
  viewerFailed: '代码视图加载失败，改为显示补丁。',
  renameArrow: '→'
} as const
