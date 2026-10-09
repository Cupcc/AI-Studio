// Independent W4 probe. Actual OS processes; simulated Codex protocol and SDK.
// Starts no installed CLI and makes no model calls. Run after adapter build.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { CodexProvider } from '../../../packages/agent-adapter/dist/codex/index.js';
import { ClaudeProvider } from '../../../packages/agent-adapter/dist/claude/index.js';
import { RuntimeProcess } from '../../../packages/agent-adapter/dist/core/runtime-process.js';
import { AsyncQueue } from '../../../packages/agent-adapter/dist/core/async-queue.js';
import { EventRecorder } from '../../../packages/agent-adapter/dist/testing/event-recorder.js';
import { findAlive, identityOf, defaultProcessLister } from '../../../packages/agent-adapter/dist/core/process-probe.js';

const fixture = String.raw`
const {spawn}=require('node:child_process'); let buffer='', n=0; const children=new Map();
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const turn=(id,status)=>({id,status,error:null,items:[],durationMs:null});
process.stdin.on('data',chunk=>{buffer+=chunk; let pos; while((pos=buffer.indexOf('\n'))>=0){
const m=JSON.parse(buffer.slice(0,pos)); buffer=buffer.slice(pos+1); if(m.id===undefined)continue;
const reply=result=>send({id:m.id,result}), p=m.params;
if(m.method==='initialize')reply({});
else if(m.method==='thread/start'||m.method==='thread/resume')reply({thread:{id:'independent-fixture-thread'},model:'fixture'});
else if(m.method==='thread/backgroundTerminals/list')reply({data:[...children].map(([id,c])=>({itemId:id,processId:id,osPid:null,command:id,cwd:'/tmp',cpuPercent:null,rssKb:null})),nextCursor:null});
else if(m.method==='turn/start'){
const index=++n,id='turn-'+index,item='command-'+index;
const script=index===1?'setInterval(()=>{},1000)':"require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)";
const c=spawn(process.execPath,['-e',script],{detached:true,stdio:'ignore'}); children.set(item,c);
send({method:'turn/started',params:{threadId:'independent-fixture-thread',turn:turn(id,'inProgress')}});reply({turn:turn(id,'inProgress')});
send({method:'item/started',params:{threadId:'independent-fixture-thread',turnId:id,item:{id:item,type:'commandExecution',processId:item,command:item,cwd:'/tmp',status:'inProgress',commandActions:[],aggregatedOutput:null,exitCode:null}}});
if(index===1)send({method:'turn/completed',params:{threadId:'independent-fixture-thread',turn:turn(id,'completed')}});
}else if(m.method==='turn/interrupt'){send({method:'turn/completed',params:{threadId:'independent-fixture-thread',turn:turn(p.turnId,'interrupted')}});reply({});}
else if(m.method==='thread/backgroundTerminals/terminate'){const c=children.get(p.processId);if(c){try{process.kill(-c.pid,'SIGKILL')}catch{} children.delete(p.processId)}reply({terminated:Boolean(c)});}
else send({id:m.id,error:{code:-32601,message:'No fixture handler'}});
}});`;
const options = { cwd: '/tmp', environment: { env: { PATH: '/usr/bin:/bin' } },
  timeouts: { cleanupMs: 3000, terminalMs: 2000, startupMs: 3000 } };
let codexRuntime, claudeRuntime, query; const owned=[];
const codex = new CodexProvider({
  resolveExecutable: async () => ({path:process.execPath,source:'explicit'}),
  runtimeFactory: async o => codexRuntime = await RuntimeProcess.start({...o,command:process.execPath,args:['-e',fixture]}),
});
class Query {
  output=new AsyncQueue(); inputs=[]; models=[];
  constructor({prompt,options}) {
    options.spawnClaudeCodeProcess({command:process.execPath,args:['-e','process.stdin.resume();setInterval(()=>{},1000)'],
      cwd:'/tmp',env:{PATH:'/usr/bin:/bin'},signal:new AbortController().signal});
    void (async()=>{for await(const m of prompt)this.inputs.push(m)})();
  }
  [Symbol.asyncIterator](){return this.output[Symbol.asyncIterator]()}
  async supportedModels(){return[{value:'fixture-a',displayName:'Fixture A',description:'simulated'}]}
  async setModel(model){this.models.push(model)}
  async interrupt(){this.end(false);return{still_queued:[]}}
  end(success){this.output.push({type:'result',subtype:success?'success':'error_during_execution',is_error:!success,
    result:'fixture',errors:['cancelled'],duration_ms:1,session_id:'11111111-1111-4111-8111-111111111111',uuid:randomUUID()})}
  close(){this.output.end()}
}
const claude = new ClaudeProvider({
  resolveExecutable:async()=>({path:process.execPath,source:'explicit'}),
  query:args=>query=new Query(args),
  startRuntime:async o=>claudeRuntime=await RuntimeProcess.start(o),
});
const external=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
const pause=()=>new Promise(r=>setTimeout(r,20));
async function until(f){const end=Date.now()+3000;while(!await f()){assert.ok(Date.now()<end,'condition timed out');await pause()}}
const records={modelCalls:0,installedCliCalls:0,protocol:'simulated',processTable:'real OS'};
try{
  const cs=await codex.createSession(options), hs=await claude.createSession(options);
  const ce=new EventRecorder(cs), he=new EventRecorder(hs);
  query.output.push({type:'system',subtype:'init',session_id:'11111111-1111-4111-8111-111111111111'});
  const first=await cs.sendUserInput({text:'retain old fixture service'});
  await ce.waitFor('turn.completed',e=>e.turnId===first.turnId);
  const earlier=await codexRuntime.snapshotDescendants();assert.equal(earlier.length,1);
  const second=await cs.sendUserInput({text:'current fixture command'});
  await hs.sendUserInput({text:'concurrent SDK fixture'});
  await until(async()=> (await codexRuntime.snapshotDescendants()).length===3);
  const current=(await codexRuntime.snapshotDescendants()).filter(p=>p.pid!==earlier[0].pid);owned.push(...earlier,...current);
  const [one,two]=await Promise.all([cs.stop(),cs.stop()]);assert.deepEqual(one,two);
  assert.equal(one.status,'stopped');assert.equal(one.summary.cleanup,'confirmed');
  assert.equal((await findAlive(current.map(identityOf))).length,0);
  assert.equal((await findAlive(earlier.map(identityOf))).length,1);
  assert.equal(hs.state,'running');assert.equal(claudeRuntime.running,true);assert.equal(external.exitCode,null);
  assert.equal(ce.ofType('turn.completed').filter(e=>e.turnId===second.turnId).length,1);
  assert.equal(ce.ofType('runtime.started').length,1);
  records.codexStop={cleanup:one.summary.cleanup,currentNestedCommandExited:true,earlierServiceAlive:true,
    claudeRuntimeAlive:true,claudeState:hs.state,externalTerminalAlive:true,repeatedStopIdentical:true};
  const stopped=await hs.stop();assert.equal(stopped.status,'stopped');assert.equal(hs.nativeSessionId,'11111111-1111-4111-8111-111111111111');
  await hs.setModel('fixture-b');await hs.sendUserInput({text:'continue same native SDK fixture'});
  await until(()=>query.inputs.length===2);query.end(true);await until(()=>hs.state==='idle');assert.deepEqual(query.models,['fixture-b']);
  records.claudeStop={outcome:he.ofType('turn.completed')[0].outcome,continued:true,sameNativeId:true,nextTurnModel:'fixture-b'};
  const native=cs.nativeSessionId;await cs.sendUserInput({text:'remain active during Claude crash'});
  await hs.sendUserInput({text:'crash SDK fixture'});process.kill(claudeRuntime.pid,'SIGKILL');
  await until(()=>hs.state==='closed');assert.equal(cs.state,'running');assert.equal(cs.nativeSessionId,native);
  assert.equal(codexRuntime.running,true);assert.equal(external.exitCode,null);
  records.claudeCrash={codexUnaffected:true,codexState:cs.state,externalTerminalAlive:true};
}finally{
  owned.push(...(await codexRuntime?.snapshotDescendants()??[]));
  const roots=(await defaultProcessLister.list()).filter(p=>[codexRuntime?.pid,claudeRuntime?.pid,external.pid].includes(p.pid));owned.push(...roots);
  await Promise.all([codex.dispose(),claude.dispose()]);external.kill('SIGTERM');await once(external,'exit').catch(()=>{});
  assert.equal((await findAlive(owned.map(identityOf))).length,0);records.recordedProcessIdentitiesExited=true;
  assert.equal(codexRuntime?.running,false);assert.equal(claudeRuntime?.running,false);
  const processes=await defaultProcessLister.list();
  assert.equal(processes.filter(p=>p.ppid===codexRuntime?.pid||p.ppid===claudeRuntime?.pid).length,0);
}
console.log(JSON.stringify({...records,cleanupConfirmed:true},null,2));
