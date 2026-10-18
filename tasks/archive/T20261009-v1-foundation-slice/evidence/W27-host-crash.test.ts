import { expect, it } from '../../../../packages/agent-adapter/node_modules/vitest/dist/index.js'
import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeOwnershipRegistry } from '../../../../packages/agent-adapter/src/core/runtime-ownership.js'
import { defaultProcessLister, findAlive, identityOf, signalProcesses, waitForExit, type ProcessIdentity } from '../../../../packages/agent-adapter/src/core/process-probe.js'

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
async function until<T>(read: () => Promise<T | undefined>, timeout = 6000): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) { const result = await read(); if (result !== undefined) return result; await pause(25) }
  throw new Error('Fixture did not reach the requested state')
}

it('W27 real OS: cleans a killed host and its observed detached descendant while preserving a live instance and unrelated service', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'w27-host-crash-'))
  const children: ChildProcess[] = []
  const identities: ProcessIdentity[] = []
  const registrySource = fileURLToPath(new URL('../../../../packages/agent-adapter/src/core/runtime-ownership.ts', import.meta.url))
  const desktopRequire = createRequire(new URL('../../../../apps/desktop/package.json', import.meta.url))
  const electronViteRequire = createRequire(desktopRequire.resolve('electron-vite'))
  const { build } = electronViteRequire('esbuild') as { build: (options: unknown) => Promise<unknown> }
  try {
    await writeFile(join(directory, 'intermediate.cjs'), `
      const {spawn}=require('node:child_process');
      const {writeFileSync}=require('node:fs');
      const {join}=require('node:path');
      const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
      child.unref();
      writeFileSync(join(process.argv[2],process.argv[3]+'-detached.pid'),String(child.pid));
      setTimeout(()=>process.exit(0),1000);
    `)
    await writeFile(join(directory, 'runtime.cjs'), `
      const {spawn}=require('node:child_process');
      const {join}=require('node:path');
      spawn(process.execPath,[join(process.argv[2],'intermediate.cjs'),process.argv[2],process.argv[3]],{stdio:'ignore'}).unref();
      setInterval(()=>{},1000);
    `)
    await build({ stdin: { contents: `
      import {RuntimeOwnershipRegistry} from ${JSON.stringify(registrySource)};
      import {readFile,writeFile,readdir} from 'node:fs/promises';
      import {join} from 'node:path';
      const directory=process.argv[2],tag=process.argv[3];
      const journal=join(directory,'journal');
      const registry=new RuntimeOwnershipRegistry({directory:journal,sampleMs:25,graceMs:100,killWaitMs:1000});
      const runtime=await registry.start({command:process.execPath,args:[join(directory,'runtime.cjs'),directory,tag],cwd:directory,env:{PATH:'/bin:/usr/bin'},sessionId:'w27-'+tag});
      let detached;
      for(let attempt=0;attempt<200;attempt++){
        try{
          detached=Number(await readFile(join(directory,tag+'-detached.pid'),'utf8'));
          const records=await Promise.all((await readdir(journal)).filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(join(journal,n),'utf8'))));
          if(records.some(r=>r.host.pid===process.pid&&r.processes.some(p=>p.pid===detached)))break;
          detached=undefined;
        }catch{}
        await new Promise(r=>setTimeout(r,25));
      }
      if(!detached)throw new Error('Detached identity was not durably observed');
      await writeFile(join(directory,tag+'-ready.json'),JSON.stringify({host:process.pid,runtime:runtime.pid,detached}));
      process.once('SIGTERM',()=>{void runtime.terminate({graceMs:100,killWaitMs:1000}).then(()=>process.exit(0),()=>process.exit(1))});
      setInterval(()=>{},1000);
    `, resolveDir: directory, sourcefile: 'W27-isolated-host.ts', loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: join(directory, 'host.mjs') })

    async function host(tag: string) {
      const child = spawn(process.execPath, [join(directory, 'host.mjs'), directory, tag], { stdio: 'ignore' })
      children.push(child)
      const ready = await until(async () => { try { return JSON.parse(await readFile(join(directory, tag + '-ready.json'), 'utf8')) as { host: number; runtime: number; detached: number } } catch { return undefined } })
      const table = await defaultProcessLister.list()
      for (const pid of Object.values(ready)) { const process = table.find(p => p.pid === pid); if (process) identities.push(identityOf(process)) }
      return { child, ready }
    }
    const first = await host('one')
    const second = await host('two')
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' })
    children.push(unrelated)
    const externalIdentity = await until(async () => { const p = (await defaultProcessLister.list()).find(p => p.pid === unrelated.pid); return p ? identityOf(p) : undefined })
    identities.push(externalIdentity)
    await until(async () => { const p = (await defaultProcessLister.list()).find(p => p.pid === first.ready.detached); return p?.ppid === 1 ? true : undefined })
    const firstOwned = identities.filter(id => id.pid === first.ready.runtime || id.pid === first.ready.detached)
    const secondOwned = identities.filter(id => Object.values(second.ready).includes(id.pid))
    first.child.kill('SIGKILL')
    await until(async () => first.child.exitCode !== null || first.child.signalCode !== null ? true : undefined)
    expect(await findAlive(firstOwned)).toHaveLength(2)
    const recovery = await new RuntimeOwnershipRegistry({ directory: join(directory, 'journal'), graceMs: 100, killWaitMs: 1000 }).recover()
    expect(recovery.map(item => item.status).sort()).toEqual(['active_host', 'cleaned'])
    expect(await findAlive(firstOwned)).toHaveLength(0)
    expect(await findAlive(secondOwned)).toHaveLength(3)
    expect(await findAlive([externalIdentity])).toHaveLength(1)
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await pause(100)
    await signalProcesses(identities, 'SIGKILL').catch(() => {})
    await waitForExit(identities, { timeoutMs: 2000 }).catch(() => {})
    // If setup failed before ready.json, the durable registry still owns any spawned fixture.
    await new RuntimeOwnershipRegistry({ directory: join(directory, 'journal'), graceMs: 100, killWaitMs: 1000 }).recover().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
}, 20000)
