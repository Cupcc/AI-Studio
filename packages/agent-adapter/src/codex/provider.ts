import { isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { adapterError } from '../errors.js';
import { failed, ok, skipped, buildAvailabilityReport } from '../availability.js';
import type { AgentProvider, AgentSession, AvailabilityOptions, AvailabilityReport, CheckResult, CreateSessionOptions,
  ExecutableInfo, LoginInfo, ModelCatalog, ProviderCapabilities, ProviderEnvironment, ResumeSessionOptions, VersionInfo } from '../provider.js';
import type { ModelInfo } from '../types.js';
import { execBounded, parseVersion, resolveExecutable } from '../core/exec.js';
import { RuntimeProcess, type RuntimeHandle } from '../core/runtime-process.js';
import { defaultProcessLister } from '../core/process-probe.js';
import { LiveSessions } from '../core/live-sessions.js';
import { SessionController } from '../core/session-controller.js';
import { withTimeout } from '../core/async.js';
import { CodexDriver, type CodexProviderOptions, type DriverDependencies } from './driver.js';
import { CODEX_PROTOCOL_VERSION, CodexConnection } from './connection.js';
import { codexError } from './errors.js';

export const CODEX_CAPABILITIES: ProviderCapabilities = Object.freeze({ nativeSessionIdTiming: 'on_create', inputWhileRunning: 'none',
  questionRequests: true, freeTextAnswers: { questions: true, approvals: false }, nativeTitle: true, runtimeRecovery: true });

/** Injection seams for simulated transports and OS process tables; production defaults use the shared core. */
export interface CodexProviderDependencies extends Partial<DriverDependencies> {
  resolveExecutable?: typeof resolveExecutable;
  exec?: typeof execBounded;
}

export class CodexProvider implements AgentProvider {
  readonly id = 'codex';
  readonly displayName = 'Codex';
  readonly capabilities = CODEX_CAPABILITIES;
  private readonly live = new LiveSessions();
  private readonly dependencies: DriverDependencies;
  private readonly resolve;
  private readonly exec;
  private readonly opening = new Set<Promise<AgentSession>>();
  private readonly probes = new Set<Promise<ModelInfo[]>>();
  private readonly lifetime = new AbortController();
  private disposed = false;
  private disposal: Promise<void> | undefined;

  constructor(dependencies: CodexProviderDependencies = {}) {
    this.dependencies = { runtimeFactory: dependencies.runtimeFactory ?? RuntimeProcess.start, processLister: dependencies.processLister ?? defaultProcessLister };
    this.resolve = dependencies.resolveExecutable ?? resolveExecutable;
    this.exec = dependencies.exec ?? execBounded;
  }

  async checkAvailability(options: AvailabilityOptions): Promise<AvailabilityReport> {
    let executable: CheckResult<ExecutableInfo> = skipped('Executable was not checked');
    let version: CheckResult<VersionInfo> = skipped('Executable unavailable');
    let login: CheckResult<LoginInfo> = skipped('Executable unavailable');
    let models: CheckResult<ModelCatalog> = skipped('Model catalog not requested');
    try {
      const found = await this.resolve('codex', { env: options.environment.env, explicitPath: options.environment.executablePath });
      if (!found) throw adapterError('not_installed', 'Codex executable was not found in the supplied environment');
      executable = ok(found);
      const results = await Promise.allSettled([
        this.exec(found.path, ['--version'], { env: options.environment.env, timeoutMs: options.timeoutMs, signal: options.signal }),
        this.exec(found.path, ['login', 'status'], { env: options.environment.env, timeoutMs: options.timeoutMs, signal: options.signal }),
      ]);
      const v = results[0];
      if (v.status === 'fulfilled') {
        const value = parseVersion(v.value.stdout || v.value.stderr);
        version = v.value.timedOut ? failed(adapterError('timeout', 'Codex version check timed out').info)
          : v.value.code === 0 && value ? ok({ version: value, raw: `codex-cli ${value}`,
            compatibility: value === CODEX_PROTOCOL_VERSION ? 'tested' : 'untested', testedVersions: CODEX_PROTOCOL_VERSION })
            : failed(adapterError('protocol_error', 'Codex version check failed').info);
      } else version = failed(codexError(v.reason, 'version').info);
      const l = results[1];
      if (l.status === 'fulfilled') {
        const result = l.value;
        // Never retain raw authentication output, account identities, or API keys.
        const text = `${result.stdout}\n${result.stderr}`;
        login = result.timedOut ? failed(adapterError('timeout', 'Codex login check timed out').info)
          : result.code === 0 && /logged in/i.test(text) ? ok({ state: 'logged_in',
            ...(/chatgpt/i.test(text) ? { method: 'chatgpt' } : /api key/i.test(text) ? { method: 'api_key' } : {}) })
          : /not logged in/i.test(text) ? ok({ state: 'logged_out' })
          : failed(adapterError('provider_error', 'Codex login state could not be determined').info);
      } else login = failed(adapterError('provider_error', 'Codex login check could not run').info);
      if (options.includeModels) {
        try {
          const catalog = await this.probeModels(options.environment, undefined, options.signal, options.timeoutMs);
          models = ok({ models: catalog, defaultModelId: catalog.find((entry) => entry.isDefault)?.id });
        } catch (error) { models = failed(codexError(error, 'model/list').info); }
      }
    } catch (error) { executable = failed(codexError(error, 'executable', 'not_installed').info); }
    return buildAvailabilityReport(this.id, { executable, version, login, models });
  }

  async listModels(options: { environment: ProviderEnvironment; cwd?: string; signal?: AbortSignal }): Promise<ModelInfo[]> {
    this.assertLive();
    return this.probeModels(options.environment, options.cwd, options.signal);
  }

  createSession(options: CreateSessionOptions): Promise<AgentSession> { return this.open(options); }
  resumeSession(options: ResumeSessionOptions): Promise<AgentSession> {
    if (typeof options.nativeSessionId !== 'string' || !options.nativeSessionId.trim()) return Promise.reject(adapterError('invalid_argument', 'Native Session id is required'));
    return this.open(options, options.nativeSessionId);
  }

  private open(options: CreateSessionOptions, resumeId?: string): Promise<AgentSession> {
    this.assertLive();
    const extras = validateOptions(options);
    const operation = (async () => {
      const executable = await this.executable(options.environment);
      this.assertLive();
      let driver!: CodexDriver;
      const session = new SessionController({ providerId: this.id, capabilities: this.capabilities, timeouts: options.timeouts,
        expectedNativeSessionId: resumeId, initialModel: options.overrides?.model }, (sink) => {
        driver = new CodexDriver(sink, options, extras, executable.path, this.dependencies); return driver;
      });
      this.live.add(session);
      try {
        await driver.initialize(resumeId);
        if (this.disposed || session.state === 'closed') throw adapterError('disposed', 'Provider closed during Session startup');
        return session;
      } catch (error) { await session.dispose(); throw error; }
    })();
    this.opening.add(operation);
    void operation.then(() => this.opening.delete(operation), () => this.opening.delete(operation));
    return operation;
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.lifetime.abort(adapterError('disposed', 'Codex Provider is disposed'));
    this.disposal ??= (async () => { await this.live.disposeAll(); await Promise.allSettled([...this.opening, ...this.probes]); await this.live.disposeAll(); })();
    return this.disposal;
  }

  private assertLive(): void { if (this.disposed) throw adapterError('disposed', 'Codex Provider is disposed'); }
  private async executable(environment: ProviderEnvironment): Promise<ExecutableInfo> {
    const found = await this.resolve('codex', { env: environment.env, explicitPath: environment.executablePath });
    if (!found) throw adapterError('not_installed', 'Codex executable was not found in the supplied environment');
    return found;
  }

  private probeModels(environment: ProviderEnvironment, cwd = tmpdir(), signal?: AbortSignal, timeoutMs = 30_000): Promise<ModelInfo[]> {
    const operation = this.runProbeModels(environment, cwd, signal, timeoutMs);
    this.probes.add(operation);
    void operation.then(() => this.probes.delete(operation), () => this.probes.delete(operation));
    return operation;
  }

  private async runProbeModels(environment: ProviderEnvironment, cwd: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<ModelInfo[]> {
    this.assertLive();
    signal?.throwIfAborted();
    const executable = await this.executable(environment);
    let runtime: RuntimeHandle | undefined;
    let connection: CodexConnection | undefined;
    try {
      return await withTimeout(async (bounded) => {
        const combined = AbortSignal.any([this.lifetime.signal, bounded, ...(signal ? [signal] : [])]);
        combined.throwIfAborted();
        runtime = await this.dependencies.runtimeFactory({ command: executable.path, args: ['app-server', '--listen', 'stdio://'],
          cwd, env: environment.env, label: 'codex model catalog', generation: 1, lister: this.dependencies.processLister });
        if (combined.aborted) { await runtime.terminate(); combined.throwIfAborted(); }
        connection = new CodexConnection(runtime, timeoutMs);
        await connection.initialize(combined);
        return connection.models(combined);
      }, timeoutMs, 'Codex model catalog');
    } finally {
      connection?.peer.close();
      if (runtime) {
        const report = await runtime.terminate();
        if (!report.confirmed) throw adapterError('stop_cleanup_failed', 'Model catalog Runtime exit was not confirmed');
      }
    }
  }
}

function validateOptions(options: CreateSessionOptions): CodexProviderOptions {
  if (!isAbsolute(options.cwd)) throw adapterError('invalid_argument', 'Project cwd must be absolute');
  for (const key of Object.keys(options.overrides ?? {})) {
    if (!['model', 'approvalPolicy', 'sandboxMode', 'permissionMode'].includes(key)) throw adapterError('unsupported', `Unsupported Codex override: ${key}`);
  }
  if (options.overrides?.permissionMode !== undefined) throw adapterError('unsupported', 'Codex does not support Claude permissionMode');
  if (options.overrides?.approvalPolicy !== undefined && !['untrusted', 'on-failure', 'on-request', 'never'].includes(options.overrides.approvalPolicy)) {
    throw adapterError('invalid_argument', 'Unsupported Codex approval policy');
  }
  if (options.overrides?.sandboxMode !== undefined && !['read-only', 'workspace-write', 'danger-full-access'].includes(options.overrides.sandboxMode)) {
    throw adapterError('invalid_argument', 'Unsupported Codex sandbox mode');
  }
  if (options.overrides?.model !== undefined && (typeof options.overrides.model !== 'string' || !options.overrides.model.trim())) throw adapterError('invalid_argument', 'Model must be a non-empty string');
  const extras = options.providerOptions ?? {};
  for (const key of Object.keys(extras)) {
    if (!['config', 'baseInstructions', 'developerInstructions', 'effort', 'collaborationMode'].includes(key)) throw adapterError('unsupported', `Unsupported Codex provider option: ${key}`);
  }
  if (extras.effort !== undefined && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'ultra'].includes(String(extras.effort))) throw adapterError('invalid_argument', 'Invalid reasoning effort');
  for (const key of ['baseInstructions', 'developerInstructions']) {
    if (extras[key] !== undefined && typeof extras[key] !== 'string') throw adapterError('invalid_argument', `${key} must be a string`);
  }
  if (extras.config !== undefined && (!extras.config || typeof extras.config !== 'object' || Array.isArray(extras.config))) throw adapterError('invalid_argument', 'config must be an object');
  if (extras.collaborationMode !== undefined) {
    const mode = extras.collaborationMode as { mode?: string; settings?: { model?: string } };
    if (!mode || !['plan', 'default'].includes(mode.mode ?? '') || !mode.settings || typeof mode.settings.model !== 'string') throw adapterError('invalid_argument', 'Invalid collaborationMode');
  }
  return extras as CodexProviderOptions;
}
