import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const version = execFileSync('codex', ['--version'], {encoding:'utf8'}).trim();
let login='unknown'; try { login=/logged in/i.test(execFileSync('codex',['login','status'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))?'logged_in':'unknown'; } catch { login='unavailable'; }
const root=mkdtempSync(join(tmpdir(),'studio-turn-diff-'));
const report={version,login,root,scenarios:[]};
for (const git of [false,true]) {
 const cwd=join(root,git?'git':'non-git'); execFileSync('mkdir',['-p',cwd]);
 writeFileSync(join(cwd,'reference note.txt'),'fixture-verification-token: teal-orbit-742\n');
 writeFileSync(join(cwd,'native.txt'),'before\n'); writeFileSync(join(cwd,'shell.txt'),'before\n');
 if(git){execFileSync('git',['init','-q',cwd]);execFileSync('git',['-C',cwd,'add','.']);execFileSync('git',['-C',cwd,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline']);}
 const child=spawn('codex',['app-server','--listen','stdio://'],{cwd,stdio:['pipe','pipe','pipe']});
 let line='',seq=0,turnDone,active; const pending=new Map();
 const request=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
 child.stderr.resume();
 child.stdout.on('data',chunk=>{line+=chunk;for(;;){const n=line.indexOf('\n');if(n<0)break;const raw=line.slice(0,n);line=line.slice(n+1);let m;try{m=JSON.parse(raw)}catch{continue}
 if(m.id!==undefined&&!m.method){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(m.error.message)):p?.resolve(m.result);continue;}
 if(m.id!==undefined){ child.stdin.write(JSON.stringify({id:m.id,result:{decision:'decline'}})+'\n');continue; }
 const p=m.params;if(!active||!p)continue;
 if(m.method==='turn/diff/updated')active.diffs.push({threadId:p.threadId,turnId:p.turnId,diff:p.diff});
 if(m.method==='item/completed'&&p.item?.type==='fileChange')active.fileItems.push(p.item);
 if(m.method==='item/completed'&&p.item?.type==='commandExecution')active.commands.push({command:p.item.command,status:p.item.status});
 if(m.method==='item/completed'&&p.item?.type==='agentMessage')active.answer=(active.answer??'')+p.item.text;
 if(m.method==='turn/completed'){active.outcome=p.turn.status;active.error=p.turn.error?.message;turnDone?.();}
 }});
 try{
 const init=await request('initialize',{clientInfo:{name:'studio_diff_verification',version:'0.1.0'},capabilities:{experimentalApi:true}});report.userAgent=init.userAgent;
 child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
 const started=await request('thread/start',{cwd,approvalPolicy:'never',sandbox:'workspace-write'});
 for (const mode of ['reference-and-native','shell']) {
  active={git,mode,threadId:started.thread.id,diffs:[],fileItems:[],commands:[]};report.scenarios.push(active);
  const done=new Promise(resolve=>turnDone=resolve);
  const text=mode==='reference-and-native'?'Referenced files (paths relative to the Project root; these are references, not file contents):\n- "reference note.txt"\n\nRead the referenced file and report its verification token. Then use apply_patch to replace before with native-after in native.txt. Do not change any other file. Keep your final answer short.':'Use a shell command (not apply_patch) to write shell-after followed by a newline into shell.txt. Do not change other files. Keep your final answer short.';
  await request('turn/start',{threadId:started.thread.id,input:[{type:'text',text,text_elements:[]}]});await done;
  active.nativeFile=readFileSync(join(cwd,'native.txt'),'utf8');active.shellFile=readFileSync(join(cwd,'shell.txt'),'utf8');
  writeFileSync('.runtime/turn-diff/native-probe.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({git,mode,outcome:active.outcome,diffEvents:active.diffs.length,fileItems:active.fileItems.length,referenceReceived:active.answer?.includes('teal-orbit-742')}));
 }
 }catch(e){report.error=e.message;console.log(JSON.stringify({git,error:e.message}));}finally{child.stdin.end();child.kill('SIGTERM');}
}
writeFileSync('.runtime/turn-diff/native-probe.json',JSON.stringify(report,null,2));
