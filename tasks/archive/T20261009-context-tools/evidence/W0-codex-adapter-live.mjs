import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { CodexProvider } from '../../../../../packages/agent-adapter/dist/codex/index.js';
const root=mkdtempSync(join(tmpdir(),'studio-native-reference-'));
writeFileSync(join(root,'native reference.txt'),'verification-token: maple-harbor-918\n');
const p=new CodexProvider();
const login=spawnSync('codex',['login','status'],{encoding:'utf8'});
const report={version:spawnSync('codex',['--version'],{encoding:'utf8'}).stdout.trim(),login:/logged in/i.test(`${login.stdout}\n${login.stderr}`)?'logged_in':'unknown',root,scenarios:[]};
try {
 const session=await p.createSession({cwd:root,environment:{env:process.env},overrides:{approvalPolicy:'never',sandboxMode:'workspace-write'}});
 for(const mode of ['native-mention','native-patch']){
  const record={mode,diffs:[],files:[],answer:''};report.scenarios.push(record);
  const done=new Promise(resolve=>{const off=session.subscribe(e=>{if(e.type==='turn.diff.updated')record.diffs.push(e.diff);if(e.type==='item.completed'&&e.item.kind==='assistant_message')record.answer+=e.item.text??'';if(e.type==='turn.completed'){record.outcome=e.outcome;off();resolve();}if(e.type==='session.error'){record.error=e.error.message;}})});
  await session.sendUserInput(mode==='native-mention'?{text:'Read the attached referenced file and reply with only its verification token. Do not write any files.',attachments:[{kind:'file',path:join(root,'native reference.txt'),name:'native reference.txt'}]}:{text:'Use apply_patch to create result.txt containing native-diff-verified followed by a newline. Do not change any other file. Reply briefly.'});await done;
  console.log(JSON.stringify({mode,outcome:record.outcome,diffs:record.diffs.length,referenceReceived:record.answer.includes('maple-harbor-918')}));
 }
} catch(e){report.error=e.message;console.log(JSON.stringify({error:e.message}));}finally{await p.dispose();writeFileSync('.runtime/turn-diff/adapter-live.json',JSON.stringify(report,null,2));}
