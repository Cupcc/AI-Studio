import { useCallback, useSyncExternalStore, type ComponentType } from 'react'
import type { MainCanvas, ProjectAttention, ProjectRecord, RightArea, ViewId } from '@shared/project/types'

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
export interface RightSlotProps extends ShellSlotProps { area: RightArea }
export interface ViewSlotProps extends ShellSlotProps { viewId: ViewId }
export interface ShellIntegration {
  session: RendererSessionPort
  SessionHistory?: ComponentType<ShellSlotProps>
  Conversation?: ComponentType<ShellSlotProps>
  ConversationHeader?: ComponentType<ShellSlotProps>
  ViewConversation?: ComponentType<ViewSlotProps>
  ViewConversationHeader?: ComponentType<ViewSlotProps>
  Preview?: ComponentType<ViewSlotProps>
  Tool?: ComponentType<RightSlotProps>
  CliMenu?: ComponentType<ShellSlotProps & { dismiss(): void }>
  /** Default CLI shown on the New Chat button (prototype v01). */
  NewChatBadge?: ComponentType<ShellSlotProps>
  /** Fixed bottom row of the navigation: the settings entry (FR-SET-001). */
  NavigationFooter?: ComponentType<ShellSlotProps>
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
