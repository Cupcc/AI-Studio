import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { deferred, type Deferred } from '../core/async.js';
import type { InputRequestInit, PendingInputRecord, SessionSink } from '../core/session-controller.js';
import { adapterError } from '../errors.js';
import type { InputResponse } from '../types.js';

type PermissionContext = Parameters<CanUseTool>[2];
interface PermissionRef {
  input: Record<string, unknown>;
  context: PermissionContext;
  result: Deferred<PermissionResult>;
  requestId?: string;
}

export class ClaudePermissions {
  private readonly pending = new Set<PermissionRef>();
  constructor(private readonly sink: SessionSink) {}

  request(turnId: string | undefined, toolName: string, input: Record<string, unknown>, context: PermissionContext): Promise<PermissionResult> {
    if (!turnId || context.signal.aborted) return Promise.resolve(deny('This turn is no longer accepting input.'));
    let init: InputRequestInit;
    try { init = toolName === 'AskUserQuestion' ? questionRequest(input, context) : approvalRequest(toolName, input, context); }
    catch { return Promise.resolve(deny('The tool supplied an invalid input request.')); }
    const ref: PermissionRef = { input, context, result: deferred<PermissionResult>() };
    this.pending.add(ref);
    const abort = () => {
      ref.result.resolve(deny('The native request was cancelled.'));
      if (ref.requestId) this.sink.inputResolvedNatively(ref.requestId);
    };
    context.signal.addEventListener('abort', abort, { once: true });
    ref.requestId = this.sink.inputRequested(turnId, init, ref);
    if (!ref.requestId) ref.result.resolve(deny('This turn is no longer accepting input.'));
    if (context.signal.aborted) abort();
    return ref.result.promise.finally(() => {
      context.signal.removeEventListener('abort', abort);
      this.pending.delete(ref);
    });
  }

  async respond(record: PendingInputRecord, response: InputResponse): Promise<void> {
    const ref = this.ref(record);
    if (response.kind === 'approval') {
      if (response.optionId === 'allow' || response.optionId === 'allow_always') {
        ref.result.resolve({ behavior: 'allow', updatedInput: ref.input, toolUseID: ref.context.toolUseID,
          decisionClassification: response.optionId === 'allow_always' ? 'user_permanent' : 'user_temporary',
          ...(response.optionId === 'allow_always' ? { updatedPermissions: ref.context.suggestions } : {}) });
      } else ref.result.resolve(deny(response.message ?? 'User declined this tool request.', ref.context.toolUseID));
      return;
    }
    if (record.request.kind !== 'question') throw adapterError('invalid_argument', 'Expected a question request');
    const answers: Record<string, string> = {};
    for (const question of record.request.questions) {
      const answer = response.answers[question.id]!;
      const selections = (answer.optionIds ?? []).map((id) => question.options.find((option) => option.id === id)!.label);
      if (answer.text !== undefined) selections.push(answer.text);
      answers[question.prompt] = selections.join(', ');
    }
    ref.result.resolve({ behavior: 'allow', updatedInput: { ...ref.input, answers }, toolUseID: ref.context.toolUseID,
      decisionClassification: 'user_temporary' });
  }

  decline(records: readonly PendingInputRecord[], text: string): void {
    for (const record of records) {
      const ref = this.ref(record);
      ref.result.resolve(deny(text, ref.context.toolUseID));
    }
  }
  cancel(record: PendingInputRecord): void {
    const ref = record.nativeRef as PermissionRef;
    ref.result.resolve(deny('The request was cancelled.', ref.context.toolUseID));
  }
  close(): void { for (const ref of this.pending) ref.result.resolve(deny('The runtime was closed.', ref.context.toolUseID)); }
  private ref(record: PendingInputRecord): PermissionRef {
    const ref = record.nativeRef as PermissionRef;
    if (!this.pending.has(ref) || ref.result.settled) throw adapterError('invalid_state', 'The native input request is no longer pending');
    return ref;
  }
}

function deny(message: string, toolUseID?: string): PermissionResult {
  return { behavior: 'deny', message, decisionClassification: 'user_reject', ...(toolUseID ? { toolUseID } : {}) };
}

function approvalRequest(toolName: string, input: Record<string, unknown>, context: PermissionContext): InputRequestInit {
  const command = typeof input.command === 'string' ? input.command : undefined;
  const path = typeof input.file_path === 'string' ? input.file_path : context.blockedPath;
  const options: Extract<InputRequestInit, { kind: 'approval' }>['options'][number][] = [
    { id: 'allow', label: 'Allow once', intent: 'allow', primary: !context.defaultToNo },
  ];
  if (context.suggestions?.length && !context.suppressAlwaysAllowRule) options.push({
    id: 'allow_always', label: 'Allow and apply suggested permissions', intent: 'allow_always', description: JSON.stringify(context.suggestions),
  });
  options.push({ id: 'deny', label: 'Deny', intent: 'deny', primary: context.defaultToNo === true });
  return { kind: 'approval', nativeType: `canUseTool:${toolName}`, itemId: context.toolUseID,
    subject: toolName === 'Bash' ? 'command' : ['Edit', 'Write', 'NotebookEdit'].includes(toolName) ? 'file_change' : 'tool',
    title: context.title ?? context.displayName ?? `Allow ${toolName}?`,
    description: context.description ?? context.decisionReason,
    toolName, toolInput: input, command, paths: path ? [path] : undefined, options, allowsMessage: true };
}

function questionRequest(input: Record<string, unknown>, context: PermissionContext): InputRequestInit {
  if (!Array.isArray(input.questions) || input.questions.length === 0) throw new Error('Missing questions');
  const prompts = new Set<string>();
  const questions = input.questions.map((raw: unknown, index) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid question');
    const question = raw as Record<string, unknown>;
    if (typeof question.question !== 'string' || prompts.has(question.question)) throw new Error('Invalid or duplicate question text');
    prompts.add(question.question);
    return { id: `q${index}`, prompt: question.question,
      header: typeof question.header === 'string' ? question.header : undefined,
      options: Array.isArray(question.options) ? question.options.map((rawOption: unknown, optionIndex) => {
        const option = rawOption as Record<string, unknown>;
        if (!option || typeof option.label !== 'string') throw new Error('Invalid option');
        return { id: `o${optionIndex}`, label: option.label,
          description: typeof option.description === 'string' ? option.description : undefined };
      }) : [], multiSelect: question.multiSelect === true, allowFreeText: true, secret: false };
  });
  return { kind: 'question', nativeType: 'canUseTool:AskUserQuestion', itemId: context.toolUseID,
    title: context.title, questions };
}
