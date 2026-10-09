import { execFile } from 'node:child_process';
import { adapterError } from '../errors.js';
import { sleep } from './async.js';

/**
 * System process probing used as exit evidence (04 §4 rule 5: protocol acknowledgements are
 * not proof that a process exited). Implemented with `ps` (macOS first, also works on Linux).
 */
export interface ProcessInfo {
  pid: number;
  ppid: number;
  pgid: number;
  /** `ps` state letters; a leading `Z` means zombie (exited, not yet reaped). */
  state: string;
  /** Start time as printed by `ps -o lstart` under the C locale; used with pid as identity. */
  startedAt: string;
  command: string;
}

/** Identity that survives pid reuse: a different start time means a different process. */
export interface ProcessIdentity {
  pid: number;
  startedAt: string;
}

export interface ProcessLister {
  list(): Promise<ProcessInfo[]>;
}

const PS_COLUMNS = 'pid=,ppid=,pgid=,stat=,lstart=,args=';

export function parsePsOutput(output: string): ProcessInfo[] {
  const rows: ProcessInfo[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    // pid ppid pgid stat + 5 lstart tokens (e.g. "Thu Oct  9 07:17:00 2026") + args
    if (tokens.length < 9) continue;
    const [pid, ppid, pgid, state, ...rest] = tokens;
    const lstart = rest.slice(0, 5).join(' ');
    const pidNum = Number(pid);
    if (!Number.isInteger(pidNum)) continue;
    // Recover args with original spacing by skipping the first nine whitespace-separated fields.
    const command = line.replace(/^(\S+\s+){8}\S+\s*/, '');
    rows.push({
      pid: pidNum,
      ppid: Number(ppid),
      pgid: Number(pgid),
      state: state ?? '',
      startedAt: lstart,
      command,
    });
  }
  return rows;
}

/** Default lister running `/bin/ps` asynchronously with a stable locale. */
export class PsProcessLister implements ProcessLister {
  constructor(private readonly options: { psPath?: string; timeoutMs?: number } = {}) {}

  list(): Promise<ProcessInfo[]> {
    const psPath = this.options.psPath ?? '/bin/ps';
    return new Promise((resolve, reject) => {
      execFile(
        psPath,
        ['-axww', '-o', PS_COLUMNS],
        {
          encoding: 'utf8',
          timeout: this.options.timeoutMs ?? 10_000,
          maxBuffer: 32 * 1024 * 1024,
          env: { LC_ALL: 'C', LANG: 'C', PATH: '/bin:/usr/bin' },
        },
        (error, stdout) => {
          if (error) {
            reject(adapterError('unknown', `Process listing failed: ${error.message}`, { cause: error }));
            return;
          }
          resolve(parsePsOutput(stdout));
        },
      );
    });
  }
}

export const defaultProcessLister: ProcessLister = new PsProcessLister();

export function isZombie(info: ProcessInfo): boolean {
  return info.state.startsWith('Z');
}

export function identityOf(info: ProcessInfo): ProcessIdentity {
  return { pid: info.pid, startedAt: info.startedAt };
}

/** Descendants of `rootPid` (by parent chain) in breadth-first order, excluding zombies. */
export function descendantsIn(processes: readonly ProcessInfo[], rootPid: number, includeRoot = false): ProcessInfo[] {
  const children = new Map<number, ProcessInfo[]>();
  for (const info of processes) {
    const list = children.get(info.ppid);
    if (list) list.push(info);
    else children.set(info.ppid, [info]);
  }
  const result: ProcessInfo[] = [];
  const root = processes.find((p) => p.pid === rootPid);
  if (includeRoot && root && !isZombie(root)) result.push(root);
  const queue = [rootPid];
  const seen = new Set<number>([rootPid]);
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    for (const child of children.get(pid) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      if (!isZombie(child)) result.push(child);
      queue.push(child.pid);
    }
  }
  return result;
}

export async function listDescendants(
  rootPid: number,
  options: { includeRoot?: boolean; lister?: ProcessLister } = {},
): Promise<ProcessInfo[]> {
  const processes = await (options.lister ?? defaultProcessLister).list();
  return descendantsIn(processes, rootPid, options.includeRoot ?? false);
}

/** Live (non-zombie) members of a process group. */
export async function listProcessGroup(pgid: number, lister: ProcessLister = defaultProcessLister): Promise<ProcessInfo[]> {
  const processes = await lister.list();
  return processes.filter((p) => p.pgid === pgid && !isZombie(p));
}

/** Returns the identities that are still alive (same pid and start time, not zombie). */
export async function findAlive(
  targets: readonly ProcessIdentity[],
  lister: ProcessLister = defaultProcessLister,
): Promise<ProcessInfo[]> {
  if (targets.length === 0) return [];
  const processes = await lister.list();
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const alive: ProcessInfo[] = [];
  for (const target of targets) {
    const current = byPid.get(target.pid);
    if (current && current.startedAt === target.startedAt && !isZombie(current)) alive.push(current);
  }
  return alive;
}

export interface ExitVerification {
  /** True only when no target is alive; this is the exit evidence. */
  exited: boolean;
  survivors: ProcessInfo[];
  elapsedMs: number;
}

/** Polls until every target has exited or the timeout expires. */
export async function waitForExit(
  targets: readonly ProcessIdentity[],
  options: { timeoutMs: number; intervalMs?: number; lister?: ProcessLister; signal?: AbortSignal },
): Promise<ExitVerification> {
  const started = Date.now();
  const lister = options.lister ?? defaultProcessLister;
  let survivors = await findAlive(targets, lister);
  while (survivors.length > 0 && Date.now() - started < options.timeoutMs) {
    await sleep(Math.min(options.intervalMs ?? 100, Math.max(1, options.timeoutMs - (Date.now() - started))), options.signal);
    survivors = await findAlive(targets, lister);
  }
  return { exited: survivors.length === 0, survivors, elapsedMs: Date.now() - started };
}

/**
 * Sends `signal` to each target that is still the same process (identity re-checked just
 * before signalling). Never signals a pid whose start time no longer matches.
 */
export async function signalProcesses(
  targets: readonly ProcessIdentity[],
  signal: NodeJS.Signals,
  lister: ProcessLister = defaultProcessLister,
): Promise<{ signalled: number[]; gone: number[] }> {
  const alive = await findAlive(targets, lister);
  const alivePids = new Set(alive.map((p) => p.pid));
  const signalled: number[] = [];
  const gone: number[] = [];
  for (const target of targets) {
    if (!alivePids.has(target.pid)) {
      gone.push(target.pid);
      continue;
    }
    try {
      process.kill(target.pid, signal);
      signalled.push(target.pid);
    } catch {
      gone.push(target.pid);
    }
  }
  return { signalled, gone };
}
