// Read-only local version/login probes. No catalog, prompt or model call.
import { CodexProvider } from '../../../../packages/agent-adapter/dist/codex/index.js';
import { ClaudeProvider } from '../../../../packages/agent-adapter/dist/claude/index.js';
const outputs=[];
for(const provider of [new CodexProvider(),new ClaudeProvider()]){
 try{
  const report=await provider.checkAvailability({environment:{env:{...process.env}},includeModels:false,timeoutMs:15000});
  outputs.push({provider:provider.id,status:report.status,executableStatus:report.executable.status,
   versionStatus:report.version.status,version:report.version.status==='ok'?report.version.value.version:undefined,
   loginStatus:report.login.status,loginState:report.login.status==='ok'?report.login.value.state:undefined,
   modelsStatus:report.models.status});
 }finally{await provider.dispose()}
}
console.log(JSON.stringify({modelCalls:0,catalogCalls:0,fullAuthenticationOutputRetained:false,reports:outputs},null,2));
