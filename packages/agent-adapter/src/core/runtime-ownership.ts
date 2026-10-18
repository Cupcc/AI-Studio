import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sleep } from './async.js';
import { defaultProcessLister, descendantsIn, identityOf, isZombie, type ProcessIdentity, type ProcessInfo, type ProcessLister } from './process-probe.js';
import { RuntimeProcess, RuntimeStartupError, type RuntimeHandle, type RuntimeSpawnOptions } from './runtime-process.js';

type OwnedProcess = ProcessIdentity & { pgid: number };
interface OwnershipRecord {
  version: 1;
  instanceId: string;
  host: ProcessIdentity;
  runtime: OwnedProcess;
  sessionId: string | null;
  processes: OwnedProcess[];
}
export interface OwnershipRecovery {
  record: string;
  status: 'cleaned' | 'active_host' | 'unconfirmed';
  survivors?: number[];
  detail?: string;
}
export interface OwnershipOptions {
  directory: string;
  hostPid?: number;
  lister?: ProcessLister;
  sampleMs?: number;
  graceMs?: number;
  killWaitMs?: number;
  signal?: (pid: number, signal: NodeJS.Signals) => void;
  onError?: (error: unknown) => void;
}
const owned = (p: ProcessInfo): OwnedProcess => ({ ...identityOf(p), pgid: p.pgid });
const matches = (p: ProcessInfo, id: ProcessIdentity) => p.pid === id.pid && p.startedAt === id.startedAt && !isZombie(p);
function parseRecord(raw: string): OwnershipRecord {
  const record = JSON.parse(raw) as OwnershipRecord;
  const identity = (p: ProcessIdentity) => p && Number.isSafeInteger(p.pid) && p.pid > 1 && typeof p.startedAt === 'string' && p.startedAt.length > 0;
  if (record.version !== 1 || typeof record.instanceId !== 'string' || !identity(record.host) || !identity(record.runtime)
    || record.runtime.pgid !== record.runtime.pid || !Array.isArray(record.processes) || record.processes.length > 10000
    || record.processes.some(p => !identity(p) || !Number.isSafeInteger(p.pgid) || p.pid === record.host.pid)) throw new Error('Invalid Runtime ownership record');
  return record;
}

/** Explicit host-owned persistence. Records contain identities, never command arguments or environment. */
export class RuntimeOwnershipRegistry {
  private readonly instanceId = randomUUID();
  private readonly lister: ProcessLister;
  private readonly signal: NonNullable<OwnershipOptions['signal']>;
  constructor(private readonly options: OwnershipOptions) {
    this.lister = options.lister ?? defaultProcessLister;
    this.signal = options.signal ?? ((pid, signal) => { process.kill(pid, signal); });
  }
  private async save(path: string, record: OwnershipRecord): Promise<void> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${this.instanceId}.tmp`;
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, path);
  }
  private async remove(path: string): Promise<void> {
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  private collect(record: OwnershipRecord, table: ProcessInfo[]): ProcessInfo[] {
    const roots = [record.runtime, ...record.processes].flatMap(id => table.filter(p => matches(p, id)));
    const byIdentity = new Map(roots.map(p => [`${p.pid}@${p.startedAt}`, p]));
    // A matching live member pins its process-group id. Never adopt a recycled group.
    for (const root of roots) {
      for (const p of descendantsIn(table, root.pid)) byIdentity.set(`${p.pid}@${p.startedAt}`, p);
      if (root.pgid === record.runtime.pgid) for (const p of table) {
        if (p.pgid === root.pgid && !isZombie(p)) byIdentity.set(`${p.pid}@${p.startedAt}`, p);
      }
    }
    return [...byIdentity.values()].filter(p => p.pid !== record.host.pid);
  }
  private remember(record: OwnershipRecord, processes: ProcessInfo[]): void {
    // collect() already carries every matching live recorded identity, including
    // detached children. Dead identities must not accumulate in long Sessions.
    record.processes = processes.map(owned);
  }
  /** Called before new providers are exposed. Ambiguous records survive for diagnosis/retry. */
  async recover(): Promise<OwnershipRecovery[]> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const results: OwnershipRecovery[] = [];
    for (const name of (await readdir(this.options.directory)).filter(name => /^[0-9a-f-]+\.json$/.test(name))) {
      const path = join(this.options.directory, name);
      try {
        const record = parseRecord(await readFile(path, 'utf8'));
        let table = await this.lister.list();
        if (table.some(p => matches(p, record.host))) { results.push({ record: name, status: 'active_host' }); continue; }
        let targets = this.collect(record, table);
        this.remember(record, targets);
        await this.save(path, record);
        for (const [signal, waitMs] of [['SIGTERM', this.options.graceMs ?? 2000], ['SIGKILL', this.options.killWaitMs ?? 3000]] as const) {
          // Re-probe each identity immediately before signalling; never kill by name or numeric group.
          for (const target of targets) {
            table = await this.lister.list();
            if (table.some(p => matches(p, record.host))) throw new Error('Host identity became active during cleanup');
            if (table.some(p => matches(p, target))) {
              try { this.signal(target.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
            }
          }
          const deadline = Date.now() + waitMs;
          do {
            table = await this.lister.list();
            targets = this.collect(record, table);
            this.remember(record, targets);
            await this.save(path, record);
            if (!targets.length || Date.now() >= deadline) break;
            await sleep(Math.min(50, Math.max(1, deadline - Date.now())));
          } while (true);
          if (!targets.length) break;
        }
        if (targets.length) results.push({ record: name, status: 'unconfirmed', survivors: targets.map(p => p.pid) });
        else { await this.remove(path); results.push({ record: name, status: 'cleaned' }); }
      } catch (error) {
        results.push({ record: name, status: 'unconfirmed', detail: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }
  /** Register before returning the Runtime; a failed registration aborts startup and attempts cleanup. */
  async start(options: RuntimeSpawnOptions, factory: (options: RuntimeSpawnOptions) => Promise<RuntimeHandle> = RuntimeProcess.start): Promise<RuntimeHandle> {
    const table = await this.lister.list();
    const host = table.find(p => p.pid === (this.options.hostPid ?? process.pid) && !isZombie(p));
    if (!host) throw new Error('Cannot establish Runtime host identity');
    const runtime = await factory(options);
    const path = join(this.options.directory, `${randomUUID()}.json`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let pending = Promise.resolve();
    let record: OwnershipRecord;
    const sample = async () => {
      const table = await this.lister.list();
      this.remember(record, this.collect(record, table));
      await this.save(path, record);
    };
    try {
      const processes = await this.lister.list();
      const root = processes.find(p => p.pid === runtime.pid && p.pgid === runtime.pid && !isZombie(p));
      if (!root) throw new Error('Cannot establish isolated Runtime identity');
      record = { version: 1, instanceId: this.instanceId, host: identityOf(host), runtime: owned(root), sessionId: options.sessionId ?? null, processes: [] };
      this.remember(record, this.collect(record, processes));
      await this.save(path, record);
    } catch (error) {
      await runtime.terminate().catch(cleanup => this.options.onError?.(cleanup));
      throw new RuntimeStartupError('Runtime ownership registration failed', runtime, { cause: error });
    }
    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(() => {
        pending = pending.then(sample).catch(error => this.options.onError?.(error));
        void pending.then(schedule);
      }, this.options.sampleMs ?? 250);
      timer.unref();
    };
    schedule();
    const terminate = runtime.terminate.bind(runtime);
    let terminating: ReturnType<RuntimeHandle['terminate']> | undefined;
    runtime.terminate = termination => {
      if (terminating) return terminating;
      const attempt = (async () => {
      const report = await terminate(termination);
      if (report.confirmed) {
        stopped = true;
        if (timer) clearTimeout(timer);
        await pending;
        let survivors = this.collect(record, await this.lister.list());
        // The registry can observe detached children between the Runtime's own snapshots.
        // Verify and clean those exact identities before discarding their only durable record.
        for (const [signal, waitMs] of [['SIGTERM', this.options.graceMs ?? 2000], ['SIGKILL', this.options.killWaitMs ?? 3000]] as const) {
          for (const target of survivors) {
            if ((await this.lister.list()).some(p => matches(p, target))) {
              try { this.signal(target.pid, signal); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
            }
          }
          const deadline = Date.now() + waitMs;
          do {
            survivors = this.collect(record, await this.lister.list());
            this.remember(record, survivors);
            await this.save(path, record);
            if (!survivors.length || Date.now() >= deadline) break;
            await sleep(Math.min(50, Math.max(1, deadline - Date.now())));
          } while (true);
          if (!survivors.length) break;
        }
        if (survivors.length) return { ...report, confirmed: false, survivors };
        await this.remove(path);
      }
      return report;
      })();
      terminating = attempt;
      void attempt.then(report => { if (!report.confirmed && terminating === attempt) terminating = undefined; }, () => { if (terminating === attempt) terminating = undefined; });
      return attempt;
    };
    return runtime;
  }
}
