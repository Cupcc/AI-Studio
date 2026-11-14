import { useCallback, useSyncExternalStore, type ComponentType } from 'react'
import type { MainCanvas, ProjectAttention, ProjectRecord, ToolId, ViewId } from '@shared/project/types'
import type { TurnDiffRef } from '@shared/tools/turn-diff'

/** Session owns attention and read rules. Focus changes are never user-open operations. */
export interface RendererSessionPort {
  getProjectAttention(projectId: string): ProjectAttention
  subscribeAttention(listener: () => void): () => void
  onProjectOpened(projectId: string): void | Promise<void>
  onProjectClosed(projectId: string): void
  sessionExists(projectId: string, sessionId: string): boolean | Promise<boolean>
  setViewing(projectId: string, sessionId: string | null): void
  setWindowForeground(foreground: boolean): void
  userOpenedSession(projectId: string, sessionId: string): void
  startNewChat(projectId: string): void
  /** Persist pending composer drafts before Project close or application quit. */
  flush?(): Promise<void>
}

export interface ShellSlotProps { project: ProjectRecord; canvas: MainCanvas; active: boolean }
export interface RightSlotProps extends ShellSlotProps { area: ToolId; fileViewerHost?: HTMLElement | null }
export interface ViewSlotProps extends ShellSlotProps { viewId: ViewId }
/** Workbench column header: `status` follows the title, `actions` and `menu` precede the close button. */
export interface PreviewHeaderProps extends ViewSlotProps { part: 'status' | 'actions' | 'menu' }
export interface ShellIntegration {
  openTurnDiff?(ref: TurnDiffRef): void
  /**
   * Saves the open files with unsaved changes of one Project (or of all), before a confirmed Project close or quit
   * (TOOLS-Q13). Resolves the files that could not be saved, as readable lines; empty when all were saved.
   */
  saveFiles?(projectId?: string): Promise<string[]>
  toolSelected?(projectId: string, area: ToolId): void
  session: RendererSessionPort
  Workbenches?: ComponentType<ShellSlotProps>
  SessionHistory?: ComponentType<ShellSlotProps>
  Conversation?: ComponentType<ShellSlotProps>
  ConversationHeader?: ComponentType<ShellSlotProps>
  ViewConversation?: ComponentType<ViewSlotProps>
  ViewConversationHeader?: ComponentType<ViewSlotProps>
  Preview?: ComponentType<ViewSlotProps>
  PreviewHeader?: ComponentType<PreviewHeaderProps>
  Tool?: ComponentType<RightSlotProps>
  CliMenu?: ComponentType<ShellSlotProps & { dismiss(): void }>
  /** Default CLI shown on the New Chat button (prototype v01). */
  NewChatBadge?: ComponentType<ShellSlotProps>
  /** Fixed bottom row of the navigation: the settings entry (FR-SET-001). */
  NavigationFooter?: ComponentType<ShellSlotProps>
  /** Window-level overlay above the workspace (Quick Open). */
  Overlay?: ComponentType
}

const placeholderSession: RendererSessionPort = {
  getProjectAttention: () => null,
  subscribeAttention: () => () => {},
  onProjectOpened: () => {}, onProjectClosed: () => {},
  // Until Session is connected, IDs represent placeholder canvases.
  sessionExists: () => true,
  setViewing: () => {}, setWindowForeground: () => {}, userOpenedSession: () => {},
  startNewChat: () => {}
}
let current: ShellIntegration = { session: placeholderSession }
const listeners = new Set<() => void>()
export function shellIntegration(): ShellIntegration { return current }
export function registerShellIntegration(next: Partial<ShellIntegration>): () => void {
  const previous = current
  current = { ...current, ...next }
  listeners.forEach((listener) => listener())
  return () => { current = previous; listeners.forEach((listener) => listener()) }
}
export function useShellIntegration(): ShellIntegration {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, shellIntegration)
}
export function useProjectAttention(projectId: string | null): ProjectAttention {
  const { session } = useShellIntegration()
  const subscribe = useCallback((listener: () => void) => session.subscribeAttention(listener), [session])
  return useSyncExternalStore(subscribe, () => projectId ? session.getProjectAttention(projectId) : null)
}
