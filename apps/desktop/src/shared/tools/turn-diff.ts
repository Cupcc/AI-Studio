import type { NativeTurnDiff, TurnOutcome } from '@ai-studio/agent-adapter'

export interface TurnDiffRef { projectId: string; sessionId: string; turnId: string }
export interface TurnDiffRecord extends TurnDiffRef, NativeTurnDiff {
  provider: 'codex' | 'claude-code'
  revision: number
  receivedAt: number
  final: boolean
  outcome: TurnOutcome | null
}

export const TURN_DIFF_COVERAGE = '仅显示 CLI 原生记录；Shell 或外部工具的修改可能未记录。项目变更包含当前共享工作区的变化。'
