import { SIDEBAR_WIDTH, VIEW_CONVERSATION_WIDTH, SESSION_CONVERSATION_MIN_WIDTH, VIEW_RIGHT_AREA_MIN_WIDTH } from './ui-state'
export function effectiveConversationWidth(available: number, preferred: number | null): number {
  return Math.max(VIEW_CONVERSATION_WIDTH.min, Math.min(preferred ?? VIEW_CONVERSATION_WIDTH.default, available - VIEW_RIGHT_AREA_MIN_WIDTH))
}
export function effectiveSidebarWidth(available: number, preferred: number | null): number {
  return Math.max(SIDEBAR_WIDTH.min, Math.min(preferred ?? SIDEBAR_WIDTH.default, available - SESSION_CONVERSATION_MIN_WIDTH))
}
