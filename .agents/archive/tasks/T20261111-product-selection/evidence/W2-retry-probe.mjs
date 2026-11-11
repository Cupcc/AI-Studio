import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(pathToFileURL(resolve('apps/desktop/node_modules/@playwright/test/index.mjs')));
const { initialState, fingerprint } = await import(pathToFileURL(resolve('apps/desktop/build/workbenches/product-selection/model.js')));
const root=resolve('apps/desktop/build/workbenches/product-selection');
const state=initialState();state.brief='独立检查';
const request={requestId:'retry-run',key:'market',title:'市场与趋势',text:'执行此节点',model:null};
state.nodes[0].pending={request,fingerprint:fingerprint(state,state.nodes[0])};
const server=createServer((req,res)=>{try {const name=req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(resolve(root,name)));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.addInitScript(({state,request})=>{
    let revision=1;let saved=state;window.__probe={phase:'failed',reads:0,savedResult:''};
    const session=()=>({id:'session',activity:window.__probe.phase==='running'?'running':'none',lastOutcome:window.__probe.phase==='completed'?'completed':'failed',createdAt:1,updatedAt:Date.now()});
    const snapshot=()=>({target:{projectId:'p',kind:'instance',id:'i'},state:structuredClone(saved),stateRevision:revision,appearance:{dark:false}});
    window.workbench={getInstance:async()=>snapshot(),listAgents:async()=>[{request,session:session()}],subscribe:()=>()=>{},getAgent:async()=>{window.__probe.reads++;return {session:session(),items:window.__probe.phase==='completed'?[{kind:'agent_message',text:'重试成功结果',complete:true}]:[{kind:'error',summary:'初次执行失败'}]};},updateState:async(next,expected)=>{if(expected!==revision)throw Error('conflict');saved=structuredClone(next);window.__probe.savedResult=saved.nodes[0].result;revision++;return snapshot();},setDraft:async()=>{},openSession:async()=>{}};
  },{state,request});
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  await page.waitForTimeout(300);
  const before=await page.evaluate(()=>({...window.__probe}));
  await page.evaluate(()=>window.__probe.phase='running');await page.waitForTimeout(1400);
  await page.evaluate(()=>window.__probe.phase='completed');await page.waitForTimeout(1500);
  const after=await page.evaluate(()=>({...window.__probe}));
  console.log(JSON.stringify({before,after,nodeLabel:await page.locator('[data-node="market"]').innerText()},null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
