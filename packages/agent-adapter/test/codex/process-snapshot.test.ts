import { describe, expect, it } from 'vitest';
import { CodexProvider } from '../../src/codex/index.js';
import { RuntimeProcess } from '../../src/core/runtime-process.js';
import { defaultProcessLister, descendantsIn, findAlive, identityOf } from '../../src/core/process-probe.js';
import { EventRecorder } from '../../src/testing/event-recorder.js';

// A local Node fixture simulates App Server messages. It never starts Codex or
// calls a model; unlike the pure fake-process tests, ps observes real children.
const fixture = String.raw`
const {spawn}=require('node:child_process');
let buffer='', count=0; const children=new Map();
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
const turn=(id,status)=>({id,status,error:null,items:[],durationMs:null});
process.stdin.on('data',chunk=>{buffer+=chunk;let boundary;while((boundary=buffer.indexOf('\n'))>=0){
 const line=buffer.slice(0,boundary);buffer=buffer.slice(boundary+1);const m=JSON.parse(line);if(m.id===undefined)continue;
 const reply=result=>send({id:m.id,result}); const p=m.params;
 if(m.method==='initialize')reply({});
 else if(m.method==='thread/start')reply({thread:{id:'os-fixture-thread'},model:'fixture'});
 else if(m.method==='thread/backgroundTerminals/list')reply({data:[...children].map(([id,c])=>({itemId:id,processId:id,osPid:null,command:id,cwd:'/tmp',cpuPercent:null,rssKb:null})),nextCursor:null});
 else if(m.method==='turn/start'){
   const index=++count,id='turn-'+index,item='exec-'+index;
   const script=index===1?'setInterval(()=>{},1000)':"require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)";
   const child=spawn(process.execPath,['-e',script],{detached:true,stdio:'ignore'});children.set(item,child);
   send({method:'turn/started',params:{threadId:'os-fixture-thread',turn:turn(id,'inProgress')}});reply({turn:turn(id,'inProgress')});
   send({method:'item/started',params:{threadId:'os-fixture-thread',turnId:id,item:{id:item,type:'commandExecution',processId:item,command:item,cwd:'/tmp',status:'inProgress',commandActions:[],aggregatedOutput:null,exitCode:null}}});
   if(index===1)send({method:'turn/completed',params:{threadId:'os-fixture-thread',turn:turn(id,'completed')}});
 }else if(m.method==='turn/interrupt'){
   send({method:'turn/completed',params:{threadId:'os-fixture-thread',turn:turn(p.turnId,'interrupted')}});reply({});
 }else if(m.method==='thread/backgroundTerminals/terminate'){
   const child=children.get(p.processId);if(child){try{process.kill(-child.pid,'SIGKILL')}catch{}children.delete(p.processId)}reply({terminated:Boolean(child)});
 }else send({id:m.id,error:{code:-32601,message:'Fixture method not supported'}});
}});
`;

describe('Codex OS snapshots with simulated App Server (no real CLI)', () => {
  it('verifies actual nested process exit with native osPid:null while preserving the previous service', async () => {
    let runtime: RuntimeProcess | undefined;
    const provider = new CodexProvider({ resolveExecutable: async () => ({ path: process.execPath, source: 'explicit' }),
      runtimeFactory: async (options) => { runtime = await RuntimeProcess.start({ ...options, command: process.execPath, args: ['-e', fixture] }); return runtime; } });
    try {
      const session = await provider.createSession({ cwd: '/tmp', environment: { env: { PATH: '/usr/bin:/bin' } }, timeouts: { cleanupMs: 3000 } });
      const recorder = new EventRecorder(session);
      const first = await session.sendUserInput({ text: 'first fixture turn' });
      await recorder.waitFor('turn.completed', (event) => event.turnId === first.turnId);
      const older = await runtime!.snapshotDescendants();
      expect(older).toHaveLength(1);
      const second = await session.sendUserInput({ text: 'second fixture turn' });
      const deadline = Date.now() + 3000;
      let before = await runtime!.snapshotDescendants();
      while (before.length < 3 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        before = await runtime!.snapshotDescendants();
      }
      expect(before).toHaveLength(3);
      const targets = before.filter((p) => p.pid !== older[0]!.pid);
      const stop = await session.stop();
      expect(stop).toMatchObject({ status: 'stopped', summary: { cleanup: 'confirmed', cleanupReport: { scope: 'turn',
        verifiedExited: expect.arrayContaining(targets.map(({ pid, command }) => ({ pid, command }))),
      } } });
      expect(await findAlive(targets.map(identityOf))).toHaveLength(0);
      expect(await findAlive(older.map(identityOf))).toHaveLength(1);
      expect(recorder.ofType('turn.completed').filter((e) => e.turnId === second.turnId)).toHaveLength(1);
      expect(recorder.ofType('runtime.started')).toHaveLength(1);
    } finally {
      await provider.dispose();
      if (runtime?.pid) expect(descendantsIn(await defaultProcessLister.list(), runtime.pid)).toHaveLength(0);
    }
  }, 15_000);
});
