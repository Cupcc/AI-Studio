import {createServer} from 'node:http';import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
const {chromium}=await import(pathToFileURL(resolve('apps/desktop/node_modules/@playwright/test/index.mjs')));
const {initialState,fingerprint}=await import(pathToFileURL(resolve('apps/desktop/build/workbenches/product-selection/model.js')));
const state=initialState(),request={requestId:'run',key:'market',title:'market',text:'test',model:null};state.brief='test';state.nodes[0].pending={request,fingerprint:fingerprint(state,state.nodes[0])};
const root=resolve('apps/desktop/build/workbenches/product-selection');const server=createServer((req,res)=>{try{const name=req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(resolve(root,name)));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1200,height:900}});await page.addInitScript(({state,request})=>{let saved=state,revision=1;window.__review={phase:'running',saved:null};const session=()=>({id:'s',createdAt:1,updatedAt:window.__review.phase==='running'?1:2,activity:window.__review.phase==='running'?'running':'none',lastOutcome:window.__review.phase==='running'?undefined:'completed'});const snap=()=>({target:{projectId:'p',kind:'instance',id:'i'},state:structuredClone(saved),stateRevision:revision});window.workbench={getInstance:async()=>snap(),subscribe:()=>()=>{},listAgents:async()=>[{request,session:session()}],getAgent:async()=>({session:session(),items:window.__review.phase==='running'?[]:[{kind:'agent_message',text:'done',complete:true,turnId:'turn'}]}),updateState:async(next,expected)=>{if(expected!==revision)throw Error('conflict');saved=structuredClone(next);window.__review.saved=saved;revision++;return snap();}};},{state,request});
await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForSelector('[data-node="market"]');
const card=page.locator('[data-canvas-node="market"]'),b=await card.boundingBox(),before=await card.evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
await page.mouse.move(b.x+25,b.y+25);await page.mouse.down();await page.mouse.move(b.x+110,b.y+60,{steps:5});
await page.evaluate(()=>window.__review.phase='completed');await page.waitForFunction(()=>window.__review.saved?.nodes[0].result==='done');
const savedDuringDrag=await page.evaluate(()=>window.__review.saved.canvas.nodes.market);
await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(200);
const visualAfterCancel=await card.evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)})),savedAfterCancel=await page.evaluate(()=>window.__review.saved.canvas.nodes.market);
const storedWorldAfterCancel=await page.evaluate(()=>{const c=window.__review.saved.canvas;return {x:c.groups[0].x+c.nodes.market.x,y:c.groups[0].y+c.nodes.market.y};});
console.log(JSON.stringify({before,savedDuringDrag,visualAfterCancel,savedAfterCancel,storedWorldAfterCancel},null,2));
if(Math.abs(storedWorldAfterCancel.x-before.x)>1||Math.abs(storedWorldAfterCancel.y-before.y)>1)throw Error('Cancelled drag persisted intermediate position');
}finally{await browser.close();await new Promise(r=>server.close(r));}
