// Probe withdrawal while an asynchronous composer reply is in flight and fails.
import assert from 'node:assert/strict';
import { CodexProvider } from '../../../../packages/agent-adapter/dist/codex/index.js';
import { ScriptedJsonRpcServer } from '../../../../packages/agent-adapter/dist/testing/fake-transport.js';
import { FakeRuntime } from '../../../../packages/agent-adapter/dist/testing/fake-runtime.js';
const tick=()=>new Promise(r=>setTimeout(r,0));let runtime,server,rejectSteer;
const provider=new CodexProvider({resolveExecutable:async()=>({path:'/fixture/codex',source:'explicit'}),
processLister:{list:async()=>[]},runtimeFactory:async options=>{
 runtime=new FakeRuntime({generation:options.generation});server=new ScriptedJsonRpcServer(runtime.cliTransport);
 server.handle('initialize',()=>({}));server.handle('thread/start',()=>({thread:{id:'race-thread'},model:'fixture'}));
 server.handle('thread/backgroundTerminals/list',()=>({data:[],nextCursor:null}));
 server.handle('turn/start',()=>({turn:{id:'race-turn',status:'inProgress',error:null,items:[]}}));
 server.handle('turn/steer',()=>new Promise((_,reject)=>{rejectSteer=reject}));return runtime;
}});
const records={modelCalls:0,installedCliCalls:0};
try{
 const session=await provider.createSession({cwd:'/tmp',environment:{env:{PATH:'/fixture'}}});const events=[];session.subscribe(e=>events.push(e));
 await session.sendUserInput({text:'fixture'});await tick();await tick();
 runtime.cliTransport.send(JSON.stringify({id:100,method:'item/commandExecution/requestApproval',params:{
  threadId:'race-thread',turnId:'race-turn',itemId:'a',command:'fixture',cwd:'/tmp',availableDecisions:['accept','decline']}}));
 await tick();assert.equal(session.pendingInputs.length,1);
 const requestId=session.pendingInputs[0].requestId;
 const reply=session.replyWithText('Change direction').then(()=>({success:true}),error=>({success:false,code:error.code}));
 await server.waitFor('turn/steer');await tick();
 server.notify('serverRequest/resolved',{threadId:'race-thread',requestId:100});await tick();
 rejectSteer(new Error('Fixture steer failure'));records.reply=await reply;
 records.pendingAfterWithdrawnReplyFailure=session.pendingInputs.length;
 records.nativeResolvedEvents=events.filter(e=>e.type==='input.resolved'&&e.resolution.reason==='native_resolved').length;
 if(session.pendingInputs.length){
  records.followupAnswer=await session.respondToInput(requestId,{kind:'approval',optionId:'0'}).then(()=>({success:true}),e=>({success:false,code:e.code}));
 }
 server.notify('turn/completed',{threadId:'race-thread',turn:{id:'race-turn',status:'completed',error:null,items:[]}});await tick();
 records.expected={pendingAfterWithdrawnReplyFailure:0,nativeResolvedEvents:1};
 records.passed=records.pendingAfterWithdrawnReplyFailure===0&&records.nativeResolvedEvents===1;
}finally{await provider.dispose()}
console.log(JSON.stringify(records,null,2));
assert.equal(records.passed,true,'Withdrawn input must disappear even when in-flight composer reply fails');
