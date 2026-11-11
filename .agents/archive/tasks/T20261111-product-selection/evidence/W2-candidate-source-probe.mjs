import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { initialState,nodePrompt,stale }=await import(pathToFileURL(resolve('apps/desktop/build/workbenches/product-selection/model.js')));
const state=initialState();state.brief='选品';
const first='ABCDE'.split('').map(id=>({id,title:'原候选-'+id,audience:'人群',material:'材质',price:'价格',rationale:'理由',risk:'风险'}));
const second=first.map(c=>({...c,title:'另一候选节点-'+c.id}));
const original=state.nodes.find(n=>n.id==='candidates');original.result=JSON.stringify({candidates:first});original.candidates=first;
state.nodes.push({...structuredClone(original),id:'candidates-2',title:'另一候选节点',result:JSON.stringify({candidates:second}),candidates:second});
const design=state.nodes.find(n=>n.id==='design-A'),prompt=nodePrompt(state,design);
const linked={usesLinkedSource:prompt.includes('原候选-A'),usesUnlinkedSource:prompt.includes('另一候选节点-A')};
design.deps=['candidates-2'];const relinked=nodePrompt(state,design);
design.deps=[];design.result='历史设计结果';let invalidDependencyRender;
try {invalidDependencyRender={stale:stale(state,design),threw:false};}catch(error){invalidDependencyRender={threw:true,message:error.message};}
console.log(JSON.stringify({linked,relinkedUsesSecond:relinked.includes('另一候选节点-A'),invalidDependencyRender},null,2));
