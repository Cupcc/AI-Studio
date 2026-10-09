// Independent no-CLI probe: native withdrawal must free both wire and UI state.
import assert from 'node:assert/strict';
import { CodexProvider } from '../../../packages/agent-adapter/dist/codex/index.js';
import { JsonRpcPeer } from '../../../packages/agent-adapter/dist/core/json-rpc.js';
import { createLinkedTransports, ScriptedJsonRpcServer } from '../../../packages/agent-adapter/dist/testing/fake-transport.js';
import { FakeRuntime } from '../../../packages/agent-adapter/dist/testing/fake-runtime.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
const [a,b]=createLinkedTransports(), wire=[], captured=[];
b.onLine(line=>wire.push(JSON.parse(line)));
const peer=new JsonRpcPeer(a);peer.onRequest(r=>captured.push(r));
for(const id of [12,'12'])b.send(JSON.stringify({id,method:'approval',params:{}}));
await tick();assert.equal(peer.pendingIncoming.length,2);
assert.equal(peer.dismissIncoming(12),true);assert.equal(peer.pendingIncoming.length,1);
assert.equal(captured[0].responded,true);assert.throws(()=>captured[0].respond({}),{code:'invalid_state'});
assert.equal(wire.length,0);assert.equal(peer.dismissIncoming(12),false);
b.send(JSON.stringify({id:12,method:'approval',params:{}}));await tick();
assert.equal(peer.pendingIncoming.length,2);captured[2].respond({accepted:true});
assert.equal(peer.pendingIncoming.length,1);captured[1].respond({accepted:true});await tick();
assert.equal(peer.pendingIncoming.length,0);assert.equal(wire.length,2);peer.close();
let runtime,server;const traffic=[];
const provider=new CodexProvider({resolveExecutable:async()=>({path:'/fixture/codex',source:'explicit'}),
  processLister:{list:async()=>[]},runtimeFactory:async options=>{
    runtime=new FakeRuntime({generation:options.generation});server=new ScriptedJsonRpcServer(runtime.cliTransport);
    runtime.cliTransport.onLine(line=>traffic.push(JSON.parse(line)));
    server.handle('initialize',()=>({}));server.handle('thread/start',()=>({thread:{id:'withdrawal-thread'},model:'fixture'}));
    server.handle('thread/backgroundTerminals/list',()=>({data:[],nextCursor:null}));
    server.handle('turn/start',()=>({turn:{id:'native-turn',status:'inProgress',error:null,items:[]}}));return runtime;
  }});
const records={modelCalls:0,installedCliCalls:0,core:{numericAndStringIdsIndependent:true,dismissalWritesNoResponse:true,
  staleCallbackInvalid:true,idReuseSafe:true}};
try{
  const session=await provider.createSession({cwd:'/tmp',environment:{env:{PATH:'/fixture'}}});const events=[];session.subscribe(e=>events.push(e));
  await session.sendUserInput({text:'fixture'});await tick();await tick();
  const request=id=>runtime.cliTransport.send(JSON.stringify({id,method:'item/commandExecution/requestApproval',params:{
    threadId:'withdrawal-thread',turnId:'native-turn',itemId:`item-${id}`,command:'fixture',cwd:'/tmp',availableDecisions:['accept','decline']}}));
  request(500);request('500');await tick();assert.equal(session.pendingInputs.length,2);
  server.notify('serverRequest/resolved',{threadId:'different-thread',requestId:500});await tick();assert.equal(session.pendingInputs.length,2);
  server.notify('serverRequest/resolved',{threadId:'withdrawal-thread',requestId:500});await tick();assert.equal(session.pendingInputs.length,1);
  assert.equal(traffic.filter(m=>m.id===500&&!m.method).length,0);
  assert.equal(events.filter(e=>e.type==='input.resolved'&&e.resolution.reason==='native_resolved').length,1);
  await session.respondToInput(session.pendingInputs[0].requestId,{kind:'approval',optionId:'0'});
  await tick();assert.equal(session.pendingInputs.length,0);assert.equal(traffic.filter(m=>m.id==='500'&&!m.method).length,1);
  request(500);await tick();assert.equal(session.pendingInputs.length,1);
  await session.respondToInput(session.pendingInputs[0].requestId,{kind:'approval',optionId:'1'});
  await tick();assert.equal(traffic.filter(m=>m.id===500&&!m.method).length,1);
  server.notify('turn/completed',{threadId:'withdrawal-thread',turn:{id:'native-turn',status:'completed',error:null,items:[]}});
  await tick();assert.equal(session.state,'idle');
  records.provider={foreignThreadIgnored:true,uiInputCleared:true,withdrawalWritesNoResponse:true,concurrentRequestStillAnswerable:true,reusedIdAnswerable:true};
}finally{await provider.dispose()}
console.log(JSON.stringify(records,null,2));
