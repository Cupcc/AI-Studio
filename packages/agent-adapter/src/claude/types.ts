import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { execBounded, resolveExecutable } from '../core/exec.js';
import type { ProcessLister } from '../core/process-probe.js';
import type { RuntimeHandle, RuntimeSpawnOptions } from '../core/runtime-process.js';

/** Narrow SDK surface permits deterministic tests without launching the CLI. */
export type ClaudeQuery = AsyncIterable<SDKMessage> & Pick<Query, 'interrupt' | 'setModel' | 'supportedModels' | 'close'>;
export type ClaudeQueryFactory = (args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => ClaudeQuery;

/** Only these explicit SDK overrides are accepted in SessionOptions.providerOptions. */
export interface ClaudeProviderOptions {
  settingSources?: Options['settingSources'];
  systemPrompt?: Options['systemPrompt'];
  tools?: Options['tools'];
  allowedTools?: Options['allowedTools'];
  disallowedTools?: Options['disallowedTools'];
  additionalDirectories?: Options['additionalDirectories'];
  allowDangerouslySkipPermissions?: boolean;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export interface ClaudeProviderDependencies {
  query?: ClaudeQueryFactory;
  startRuntime?: (options: RuntimeSpawnOptions) => Promise<RuntimeHandle>;
  resolveExecutable?: typeof resolveExecutable;
  exec?: typeof execBounded;
  processLister?: ProcessLister;
}
