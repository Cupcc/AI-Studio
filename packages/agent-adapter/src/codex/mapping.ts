import { basename } from 'node:path';
import type { ApprovalOption, InputResponse, ItemSnapshot, ItemStatus, UserInput } from '../types.js';
import type { InputRequestInit } from '../core/session-controller.js';
import type { IncomingRequest } from '../core/json-rpc.js';
import { adapterError } from '../errors.js';
import type { ThreadItem } from './protocol/v2/ThreadItem.js';
import type { UserInput as NativeUserInput } from './protocol/v2/UserInput.js';
import type { CommandExecutionRequestApprovalParams } from './protocol/v2/CommandExecutionRequestApprovalParams.js';
import type { CommandExecutionApprovalDecision } from './protocol/v2/CommandExecutionApprovalDecision.js';
import type { FileChangeRequestApprovalParams } from './protocol/v2/FileChangeRequestApprovalParams.js';
import type { ToolRequestUserInputParams } from './protocol/v2/ToolRequestUserInputParams.js';
import type { ToolRequestUserInputResponse } from './protocol/v2/ToolRequestUserInputResponse.js';
import type { PermissionsRequestApprovalParams } from './protocol/v2/PermissionsRequestApprovalParams.js';
import type { PermissionsRequestApprovalResponse } from './protocol/v2/PermissionsRequestApprovalResponse.js';

export function nativeInput(input: UserInput): NativeUserInput[] {
  const result: NativeUserInput[] = [];
  if (input.text) result.push({ type: 'text', text: input.text, text_elements: [] });
  for (const attachment of input.attachments ?? []) {
    if (attachment.kind === 'image') result.push({ type: 'localImage', path: attachment.path });
    else if (attachment.kind === 'file') result.push({ type: 'mention', name: attachment.name ?? basename(attachment.path), path: attachment.path });
    else throw adapterError('unsupported', 'Unsupported Codex attachment');
  }
  return result;
}

const line = (text: string) => text.replace(/\s+/g, ' ').trim();
function status(native: string, completed: boolean): ItemStatus {
  if (native === 'failed' || native === 'declined' || native === 'interrupted') return native;
  return completed || native === 'completed' ? 'completed' : 'in_progress';
}

export function mapItem(item: ThreadItem, completed: boolean): ItemSnapshot | undefined {
  const base = { itemId: item.id, status: (completed ? 'completed' : 'in_progress') as ItemStatus, nativeType: item.type };
  switch (item.type) {
    case 'userMessage': return undefined;
    case 'agentMessage': return { ...base, kind: 'assistant_message', text: item.text };
    case 'reasoning': return { ...base, kind: 'reasoning', text: (item.summary.length ? item.summary : item.content).join('\n') };
    case 'plan': return { ...base, kind: 'plan', text: item.text };
    case 'commandExecution': {
      const action = item.commandActions?.[0];
      const verb = action?.type === 'read' ? 'read' : action?.type === 'listFiles' ? 'list' : action?.type === 'search' ? 'search' : 'run';
      return { ...base, kind: 'command', status: status(item.status, completed),
        activity: { verb, label: line(item.command), target: action && 'path' in action && action.path ? action.path : item.command },
        command: { command: item.command, cwd: item.cwd, exitCode: item.exitCode, ...(item.aggregatedOutput !== null ? { output: item.aggregatedOutput } : {}) } };
    }
    case 'fileChange': return { ...base, kind: 'file_change', status: status(item.status, completed),
      activity: { verb: 'edit', label: item.changes.map((change) => change.path).join(', ') },
      files: item.changes.map((change) => ({ path: change.path, change: change.kind.type === 'update' ? (change.kind.move_path ? 'rename' : 'modify') : change.kind.type })) };
    case 'mcpToolCall': return { ...base, kind: 'tool_call', status: status(item.status, completed),
      activity: { verb: 'tool', label: `${item.server} / ${item.tool}` }, tool: { name: item.tool, server: item.server, input: item.arguments },
      ...(item.error ? { error: item.error.message } : {}) };
    case 'dynamicToolCall': return { ...base, kind: 'tool_call', status: status(item.status, completed),
      activity: { verb: 'tool', label: item.tool }, tool: { name: item.tool, input: item.arguments } };
    case 'collabAgentToolCall': return { ...base, kind: 'tool_call', status: status(item.status, completed),
      activity: { verb: 'agent', label: item.tool }, tool: { name: item.tool } };
    case 'webSearch': return { ...base, kind: 'web_search', activity: { verb: 'search', label: item.query } };
    default: return { ...base, kind: 'other', activity: { verb: 'other', label: item.type } };
  }
}

export interface NativeInputRef {
  request: IncomingRequest;
  nativeTurnId: string;
  init: InputRequestInit;
  responses?: Map<string, unknown>;
  decline: unknown;
}

export function mapRequest(request: IncomingRequest): NativeInputRef | undefined {
  const common = request.params as { turnId: string; itemId: string };
  const base = { nativeType: request.method, itemId: common.itemId };
  if (request.method === 'item/tool/requestUserInput') {
    const params = request.params as ToolRequestUserInputParams;
    if (!Array.isArray(params.questions) || params.questions.length === 0) throw adapterError('protocol_error', 'Empty native question request');
    return { request, nativeTurnId: params.turnId, decline: { answers: {} } satisfies ToolRequestUserInputResponse,
      init: { ...base, kind: 'question', questions: params.questions.map((q) => ({
        id: q.id, header: q.header, prompt: q.question, multiSelect: false,
        allowFreeText: q.isOther, secret: q.isSecret,
        options: (q.options ?? []).map((option, index) => ({ id: String(index), label: option.label, description: option.description })),
      })) } };
  }
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    const isCommand = request.method === 'item/commandExecution/requestApproval';
    const params = request.params as CommandExecutionRequestApprovalParams & FileChangeRequestApprovalParams;
    const decisions: CommandExecutionApprovalDecision[] = isCommand ? params.availableDecisions ?? ['accept', 'acceptForSession', 'decline', 'cancel'] : ['accept', 'acceptForSession', 'decline', 'cancel'];
    if (decisions.length === 0) throw adapterError('protocol_error', 'Native approval has no decisions');
    const responses = new Map(decisions.map((decision, index) => [String(index), { decision }]));
    return { request, nativeTurnId: params.turnId, responses, decline: { decision: 'decline' }, init: {
      ...base, kind: 'approval', subject: isCommand ? (params.networkApprovalContext ? 'network' : 'command') : 'file_change',
      title: params.reason ?? (isCommand ? params.command ?? 'Approve command execution' : 'Approve file changes'),
      ...(params.command ? { command: params.command } : {}), ...(params.cwd ? { cwd: params.cwd } : {}),
      ...(params.grantRoot ? { paths: [params.grantRoot] } : {}),
      ...(params.additionalPermissions ? { toolInput: params.additionalPermissions } : {}),
      options: decisions.map((decision, index) => decisionOption(decision, String(index))), allowsMessage: false,
    } };
  }
  if (request.method === 'item/permissions/requestApproval') {
    const params = request.params as PermissionsRequestApprovalParams;
    const permissions = { ...(params.permissions.network ? { network: params.permissions.network } : {}),
      ...(params.permissions.fileSystem ? { fileSystem: params.permissions.fileSystem } : {}) };
    const responses = new Map<string, PermissionsRequestApprovalResponse>([
      ['turn', { permissions, scope: 'turn' }], ['session', { permissions, scope: 'session' }], ['deny', { permissions: {}, scope: 'turn' }],
    ]);
    return { request, nativeTurnId: params.turnId, responses, decline: responses.get('deny'), init: {
      ...base, kind: 'approval', subject: 'permissions', title: params.reason ?? 'Approve additional permissions', cwd: params.cwd,
      toolInput: params.permissions, allowsMessage: false, options: [
        { id: 'turn', label: 'Allow for this turn', intent: 'allow' },
        { id: 'session', label: 'Allow for this session', intent: 'allow_always' },
        { id: 'deny', label: 'Deny', intent: 'deny' },
      ],
    } };
  }
  return undefined;
}

function decisionOption(decision: CommandExecutionApprovalDecision, id: string): ApprovalOption {
  const tag = typeof decision === 'string' ? decision : Object.keys(decision)[0];
  if (tag === 'accept') return { id, label: 'Accept', intent: 'allow' };
  if (tag === 'acceptForSession') return { id, label: 'Accept for this session', intent: 'allow_always' };
  if (tag === 'decline') return { id, label: 'Decline', intent: 'deny' };
  if (tag === 'cancel') return { id, label: 'Cancel', intent: 'cancel' };
  return { id, label: tag === 'acceptWithExecpolicyAmendment' ? 'Accept with rule amendment' : 'Apply network policy amendment',
    description: JSON.stringify(decision), intent: tag === 'acceptWithExecpolicyAmendment' ? 'allow_always' : 'other' };
}

export function answerRequest(ref: NativeInputRef, response: InputResponse): unknown {
  if (response.kind === 'approval') {
    if (!ref.responses?.has(response.optionId)) throw adapterError('invalid_argument', 'Unknown native approval decision');
    return ref.responses.get(response.optionId);
  }
  if (ref.init.kind !== 'question') throw adapterError('invalid_argument', 'Not a question request');
  const answers: ToolRequestUserInputResponse['answers'] = {};
  for (const q of ref.init.questions) {
    const answer = response.answers[q.id]!;
    answers[q.id] = { answers: [...(answer.optionIds ?? []).map((id) => q.options.find((option) => option.id === id)!.label),
      ...(answer.text !== undefined ? [answer.text] : [])] };
  }
  return { answers } satisfies ToolRequestUserInputResponse;
}
