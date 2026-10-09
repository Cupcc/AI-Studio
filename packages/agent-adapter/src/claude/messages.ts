import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { SessionSink } from '../core/session-controller.js';
import type { AdapterErrorCode, AdapterErrorInfo } from '../errors.js';
import type { ItemSnapshot } from '../types.js';

export function claudeError(message: string, nativeCode: string | number = 'unknown'): AdapterErrorInfo {
  const text = `${nativeCode} ${message}`;
  const code: AdapterErrorCode = /authentication|unauthoriz|not logged|invalid.*(?:key|token)|401|oauth_org/i.test(text) ? 'auth_required'
    : /rate.limit|billing|quota|usage.limit|429|budget/i.test(text) ? 'quota_exceeded'
    : /network|connection|ECONN|ENOTFOUND|fetch failed|timeout/i.test(text) ? 'network_error' : 'provider_error';
  return { code, message, native: { source: 'claude:result', code: nativeCode, message } };
}

/** One mapper per submitted turn. Partial blocks and complete messages share item ids. */
export class ClaudeMessages {
  model?: string;
  error?: AdapterErrorInfo;
  private readonly streamIds = new Map<string, string>();
  private readonly blocks = new Map<string, ItemSnapshot>();
  private readonly completed = new Set<string>();
  private readonly seenFrames = new Set<string>();
  constructor(private readonly sink: SessionSink, readonly turnId: string) {}

  accept(message: SDKMessage): void {
    // SDK full/replayed frames may repeat. Deltas have individual frame UUIDs.
    if ('uuid' in message && message.uuid) {
      if (this.seenFrames.has(message.uuid)) return;
      this.seenFrames.add(message.uuid);
    }
    if (message.type === 'stream_event') {
      const event = message.event;
      const scope = message.parent_tool_use_id ?? 'main';
      if (event.type === 'message_start') {
        this.streamIds.set(scope, event.message.id);
        if (scope === 'main') this.model = event.message.model;
      } else if (event.type === 'content_block_start') {
        const id = this.streamIds.get(scope);
        if (!id) return;
        const block = event.content_block;
        if (block.type === 'text' || block.type === 'thinking') {
          const item: ItemSnapshot = { itemId: `${id}:${event.index}`, kind: block.type === 'text' ? 'assistant_message' : 'reasoning', status: 'in_progress' };
          this.start(item);
          const text = block.type === 'text' ? block.text : block.thinking;
          if (text) this.sink.itemDelta(this.turnId, item.itemId, block.type === 'text' ? 'text' : 'reasoning', text);
        } else if (block.type === 'tool_use') this.start(toolItem(block.id, block.name, block.input));
      } else if (event.type === 'content_block_delta') {
        const id = this.streamIds.get(scope);
        if (!id) return;
        const itemId = `${id}:${event.index}`;
        if (this.completed.has(itemId)) return;
        if (event.delta.type === 'text_delta') this.sink.itemDelta(this.turnId, itemId, 'text', event.delta.text);
        if (event.delta.type === 'thinking_delta') this.sink.itemDelta(this.turnId, itemId, 'reasoning', event.delta.thinking);
      }
      return;
    }
    if (message.type === 'assistant') {
      if (message.error) this.error = claudeError(assistantErrorText(message.message.content), message.error);
      if (!message.parent_tool_use_id) this.model = message.message.model;
      message.message.content.forEach((block, index) => {
        if (block.type === 'text' || block.type === 'thinking') {
          const item: ItemSnapshot = { itemId: `${message.message.id}:${index}`, kind: block.type === 'text' ? 'assistant_message' : 'reasoning',
            status: message.error ? 'failed' : 'completed', text: block.type === 'text' ? block.text : block.thinking };
          if (!this.blocks.has(item.itemId)) this.start({ ...item, status: 'in_progress' });
          this.complete(item);
        } else if (block.type === 'tool_use') {
          const item = toolItem(block.id, block.name, block.input);
          if (!this.blocks.has(item.itemId)) this.start(item);
          else { this.blocks.set(item.itemId, item); this.sink.itemUpdated(this.turnId, item); }
        }
      });
      return;
    }
    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block.type !== 'tool_result') continue;
        const item = this.blocks.get(block.tool_use_id);
        if (!item) continue;
        const output = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
        this.complete({ ...item, status: block.is_error ? 'failed' : 'completed',
          ...(block.is_error ? { error: output } : {}),
          ...(item.command ? { command: { ...item.command, output } } : {}) });
      }
    }
  }

  private start(item: ItemSnapshot): void {
    if (this.blocks.has(item.itemId) || this.completed.has(item.itemId)) return;
    this.blocks.set(item.itemId, item);
    this.sink.itemStarted(this.turnId, item);
  }
  private complete(item: ItemSnapshot): void {
    if (this.completed.has(item.itemId)) return;
    this.completed.add(item.itemId);
    this.sink.itemCompleted(this.turnId, item);
  }
}

function assistantErrorText(content: readonly { type: string; text?: string }[]): string {
  return content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n') || 'Claude API request failed';
}

function toolItem(id: string, name: string, raw: unknown): ItemSnapshot {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const command = typeof input.command === 'string' ? input.command : '';
  const target = [input.file_path, input.path, input.pattern, input.url].find((value) => typeof value === 'string') as string | undefined;
  const verb = name === 'Bash' ? 'run' : name === 'Read' ? 'read' : ['Write', 'Edit', 'NotebookEdit'].includes(name) ? 'edit'
    : name === 'Glob' ? 'list' : ['Grep', 'WebSearch'].includes(name) ? 'search' : name === 'WebFetch' ? 'fetch'
    : ['Agent', 'Task'].includes(name) ? 'agent' : 'tool';
  return { itemId: id, kind: name === 'Bash' ? 'command' : verb === 'edit' ? 'file_change' : 'tool_call', status: 'in_progress',
    activity: { verb, label: `${name} ${command || target || ''}`.trim().replace(/\s+/g, ' ').slice(0, 240), target: command || target },
    tool: { name, input: raw }, nativeType: `tool_use:${name}`,
    ...(name === 'Bash' ? { command: { command } } : {}),
    ...(verb === 'edit' && target ? { files: [{ path: target, change: 'unknown' as const }] } : {}) };
}
