import { defineContract, event, invoke } from './contract'
import type {
  TerminalAckRequest, TerminalAttachment, TerminalChanged, TerminalCloseRequest,
  TerminalCloseResult, TerminalCreateRequest, TerminalInputRequest, TerminalOutput,
  TerminalRef, TerminalRenameRequest, TerminalResizeRequest, TerminalSnapshot, TerminalSummary
} from '../tools/terminal'

export const terminalContract = defineContract('terminal', {
  invoke: {
    list: invoke<{ projectId: string }, TerminalSummary[]>('terminal:list'),
    create: invoke<TerminalCreateRequest, TerminalSummary>('terminal:create'),
    attach: invoke<TerminalRef, TerminalSnapshot>('terminal:attach'),
    detach: invoke<TerminalAttachment, void>('terminal:detach'),
    ack: invoke<TerminalAckRequest, void>('terminal:ack'),
    input: invoke<TerminalInputRequest, void>('terminal:input'),
    resize: invoke<TerminalResizeRequest, void>('terminal:resize'),
    close: invoke<TerminalCloseRequest, TerminalCloseResult>('terminal:close'),
    rename: invoke<TerminalRenameRequest, TerminalSummary>('terminal:rename'),
    /** ⌘K: clears the Project-held screen too, so a re-attach does not bring the old output back. */
    clear: invoke<TerminalRef, void>('terminal:clear')
  },
  events: {
    output: event<TerminalOutput>('terminal:output'),
    changed: event<TerminalChanged>('terminal:changed')
  }
})
