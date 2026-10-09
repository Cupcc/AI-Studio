import { isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { buildAvailabilityReport, failed, ok, skipped } from '../availability.js';
import { execBounded, parseVersion, resolveExecutable } from '../core/exec.js';
import { LiveSessions } from '../core/live-sessions.js';
import { SessionController } from '../core/session-controller.js';
import { adapterError, toAdapterError } from '../errors.js';
import type { AgentProvider, AgentSession, AvailabilityOptions, AvailabilityReport, CheckResult, CreateSessionOptions,
  LoginInfo, ModelCatalog, ProviderCapabilities, ProviderEnvironment, ResumeSessionOptions, SessionOptionsBase, VersionInfo } from '../provider.js';
import type { ModelInfo, UserInput } from '../types.js';
import { ClaudeDriver } from './driver.js';
import type { ClaudeProviderDependencies, ClaudeProviderOptions } from './types.js';

export const CLAUDE_CAPABILITIES: ProviderCapabilities = {
  nativeSessionIdTiming: 'after_first_input', inputWhileRunning: 'none', questionRequests: true,
  freeTextAnswers: { questions: true, approvals: false }, nativeTitle: false, runtimeRecovery: true,
};

/** Official Streaming Input SDK driving the host's installed Claude Code executable. */
export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly capabilities = CLAUDE_CAPABILITIES;
  private readonly sessions = new LiveSessions();
  private readonly dependencies;
  private disposed = false;
  constructor(dependencies: ClaudeProviderDependencies = {}) {
    this.dependencies = { ...dependencies, query: dependencies.query ?? query };
  }

  async checkAvailability(options: AvailabilityOptions): Promise<AvailabilityReport> {
    const env = options.environment.env;
    const resolve = this.dependencies.resolveExecutable ?? resolveExecutable;
    const exec = this.dependencies.exec ?? execBounded;
    let executable;
    try { executable = await resolve('claude', { env, explicitPath: options.environment.executablePath }); }
    catch (error) { return this.missing(toAdapterError(error, 'not_installed').info); }
    if (!executable) return this.missing({ code: 'not_installed', message: 'Claude Code executable was not found' });
    const runOptions = { env, timeoutMs: options.timeoutMs, signal: options.signal };
    const [version, login] = await Promise.all([
      (async (): Promise<CheckResult<VersionInfo>> => {
        try {
          const result = await exec(executable.path, ['--version'], runOptions);
          const version = parseVersion(result.stdout);
          if (result.timedOut) throw adapterError('timeout', 'Claude version check timed out');
          if (result.code !== 0 || !version) throw adapterError('protocol_error', 'Claude version check failed');
          return ok({ version, raw: result.stdout.trim(), compatibility: ['2.1.294', '2.1.295'].includes(version) ? 'tested' : 'untested', testedVersions: '2.1.294, 2.1.295' });
        } catch (error) { return failed(toAdapterError(error).info); }
      })(),
      (async (): Promise<CheckResult<LoginInfo>> => {
        try {
          const result = await exec(executable.path, ['auth', 'status', '--json'], runOptions);
          if (result.timedOut) throw adapterError('timeout', 'Claude login check timed out');
          // Never retain the native response: it can contain email and organization data.
          const parsed: unknown = JSON.parse(result.stdout);
          if (!parsed || typeof parsed !== 'object' || !('loggedIn' in parsed) || typeof parsed.loggedIn !== 'boolean') {
            throw adapterError('protocol_error', 'Claude login status response was not recognized');
          }
          const method = 'authMethod' in parsed && typeof parsed.authMethod === 'string' ? parsed.authMethod : undefined;
          return ok({ state: parsed.loggedIn ? 'logged_in' : 'logged_out',
            ...(['claude.ai', 'oauth', 'api_key', 'console', 'apiKeyHelper', 'third_party'].includes(method ?? '') ? { method } : {}) });
        } catch (error) {
          // JSON parse errors can quote input; only report a generic explanation.
          return failed({ code: error instanceof SyntaxError ? 'protocol_error' : toAdapterError(error).code, message: 'Claude login status check failed' });
        }
      })(),
    ]);
    let models: CheckResult<ModelCatalog> = skipped('Model catalog was not requested');
    if (options.includeModels) {
      try { models = ok({ models: await this.listModels({ environment: options.environment, signal: options.signal }) }); }
      catch (error) { models = failed(toAdapterError(error).info); }
    }
    return buildAvailabilityReport(this.id, { executable: ok(executable), version, login, models });
  }

  async listModels(options: { environment: ProviderEnvironment; cwd?: string; signal?: AbortSignal }): Promise<ModelInfo[]> {
    this.assertOpen();
    const { session, driver } = await this.open({ cwd: options.cwd ?? tmpdir(), environment: options.environment }, undefined, true, options.signal);
    try { return await driver.listModels(); } finally { await session.dispose(); }
  }
  async createSession(options: CreateSessionOptions): Promise<AgentSession> { return (await this.open(options)).session; }
  async resumeSession(options: ResumeSessionOptions): Promise<AgentSession> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.nativeSessionId)) {
      throw adapterError('resume_failed', 'Claude native session id must be a UUID');
    }
    return (await this.open(options, options.nativeSessionId)).session;
  }
  async dispose(): Promise<void> { this.disposed = true; await this.sessions.disposeAll(); }

  private async open(options: SessionOptionsBase, nativeId?: string, probeOnly = false, signal?: AbortSignal) {
    this.assertOpen();
    const extras = validateOptions(options);
    const executable = await (this.dependencies.resolveExecutable ?? resolveExecutable)('claude', {
      env: options.environment.env, explicitPath: options.environment.executablePath,
    });
    if (!executable) throw adapterError('not_installed', 'Claude Code executable was not found');
    this.assertOpen();
    let driver!: ClaudeDriver;
    const session = new ClaudeSession({ providerId: this.id, capabilities: this.capabilities,
      expectedNativeSessionId: nativeId, initialModel: options.overrides?.model, timeouts: options.timeouts,
    }, (sink) => driver = new ClaudeDriver(sink, options, executable.path, extras, this.dependencies, nativeId, probeOnly));
    this.sessions.add(session);
    try {
      await driver.initialize(signal);
      this.assertOpen();
      if (session.state === 'closed') throw adapterError(nativeId ? 'resume_failed' : 'spawn_failed', 'Claude closed during startup');
      return { session, driver };
    } catch (error) { await session.dispose(); throw error; }
  }
  private assertOpen(): void { if (this.disposed) throw adapterError('disposed', 'Claude provider is disposed'); }
  private missing(error: Parameters<typeof failed>[0]): AvailabilityReport {
    return buildAvailabilityReport(this.id, { executable: failed(error), version: skipped('Executable unavailable'),
      login: skipped('Executable unavailable'), models: skipped('Executable unavailable') });
  }
}

/** Keep unsupported attachments in the precondition error channel, before Running. */
class ClaudeSession extends SessionController {
  override async sendUserInput(input: UserInput): Promise<{ turnId: string }> {
    if (input?.attachments?.length) throw adapterError('unsupported', 'Claude attachment blocks are not implemented; send a textual file reference');
    return super.sendUserInput(input);
  }
}

export function createClaudeProvider(dependencies?: ClaudeProviderDependencies): ClaudeProvider { return new ClaudeProvider(dependencies); }

function validateOptions(options: SessionOptionsBase): ClaudeProviderOptions {
  if (!isAbsolute(options.cwd)) throw adapterError('invalid_argument', 'Claude cwd must be absolute');
  if (options.overrides?.approvalPolicy !== undefined || options.overrides?.sandboxMode !== undefined) {
    throw adapterError('unsupported', 'Claude does not support Codex approvalPolicy or sandboxMode overrides');
  }
  const mode = options.overrides?.permissionMode;
  if (options.overrides?.model !== undefined && (!options.overrides.model.trim())) {
    throw adapterError('invalid_argument', 'Claude model must be non-empty');
  }
  if (mode !== undefined && !['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'].includes(mode)) {
    throw adapterError('invalid_argument', 'Unknown Claude permission mode');
  }
  const extras = options.providerOptions ?? {};
  const allowed = ['settingSources', 'systemPrompt', 'tools', 'allowedTools', 'disallowedTools', 'additionalDirectories',
    'allowDangerouslySkipPermissions', 'maxTurns', 'maxBudgetUsd'];
  for (const key of Object.keys(extras)) if (!allowed.includes(key)) throw adapterError('unsupported', `Unsupported Claude provider option: ${key}`);
  for (const key of ['allowedTools', 'disallowedTools', 'additionalDirectories']) {
    if (extras[key] !== undefined && (!Array.isArray(extras[key]) || !(extras[key] as unknown[]).every((value) => typeof value === 'string'))) {
      throw adapterError('invalid_argument', `${key} must be a string array`);
    }
  }
  if (extras.settingSources !== undefined && (!Array.isArray(extras.settingSources)
    || !extras.settingSources.every((source) => ['user', 'project', 'local'].includes(source)))) {
    throw adapterError('invalid_argument', 'Invalid Claude settingSources');
  }
  if (extras.allowDangerouslySkipPermissions !== undefined && typeof extras.allowDangerouslySkipPermissions !== 'boolean') {
    throw adapterError('invalid_argument', 'allowDangerouslySkipPermissions must be a boolean');
  }
  if (extras.systemPrompt !== undefined && typeof extras.systemPrompt !== 'string') {
    const prompt = extras.systemPrompt as Record<string, unknown> | null;
    if (!prompt || prompt.type !== 'preset' || prompt.preset !== 'claude_code'
      || (prompt.append !== undefined && typeof prompt.append !== 'string')) throw adapterError('invalid_argument', 'Invalid Claude systemPrompt');
  }
  if (extras.tools !== undefined) {
    const tools = extras.tools as Record<string, unknown> | null;
    if (Array.isArray(tools) ? !tools.every((tool) => typeof tool === 'string') : !tools || tools.type !== 'preset' || tools.preset !== 'claude_code') {
      throw adapterError('invalid_argument', 'Invalid Claude tools');
    }
  }
  for (const key of ['maxTurns', 'maxBudgetUsd']) if (extras[key] !== undefined
    && (typeof extras[key] !== 'number' || !Number.isFinite(extras[key]) || extras[key] <= 0)) {
    throw adapterError('invalid_argument', `${key} must be positive`);
  }
  if (mode === 'bypassPermissions' && extras.allowDangerouslySkipPermissions !== true) {
    throw adapterError('invalid_argument', 'bypassPermissions requires allowDangerouslySkipPermissions: true');
  }
  return extras as ClaudeProviderOptions;
}
