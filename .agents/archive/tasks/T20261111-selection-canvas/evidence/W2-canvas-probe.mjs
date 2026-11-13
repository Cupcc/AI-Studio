import { createServer } from 'node:http';
import { readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(resolve('apps/desktop/node_modules/@playwright/test/index.mjs')));
const {initialState}=await import(pathToFileURL(resolve('apps/desktop/build/workbenches/product-selection/model.js')));
const root=resolve('apps/desktop/build/workbenches/product-selection'), state=initialState();
const server=createServer((req,res)=>{try{const name=req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(resolve(root,name)));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900}});page.setDefaultTimeout(4000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({state})=>{let saved=state,revision=1;window.__review={writes:[],delay:0};const snapshot=()=>({target:{projectId:'p',kind:'instance',id:'i'},state:structuredClone(saved),stateRevision:revision,appearance:{dark:false}});window.workbench={getInstance:async()=>snapshot(),subscribe:()=>()=>{},listAgents:async()=>[],updateState:async(next,expected)=>{if(window.__review.delay)await new Promise(r=>setTimeout(r,window.__review.delay));if(expected!==revision)throw Error('conflict');saved=structuredClone(next);window.__review.saved=saved;window.__review.writes.push(structuredClone(next));revision++;return snapshot();}};},{state});
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForSelector('.canvas-node');
 const getLayout=()=>page.evaluate(()=>window.__review.saved?.canvas);
 const node=page.locator('[data-node="market"]');const b=await node.boundingBox();const zoom=Number(await page.locator('#canvas').getAttribute('data-zoom'));
 await page.mouse.move(b.x+30,b.y+30);await page.mouse.down();await page.mouse.move(b.x+90,b.y+60,{steps:5});await page.mouse.up();await page.waitForTimeout(200);
 const moved=await getLayout();
 const out=page.locator('[data-owner="market"][data-port="output"]'),input=page.locator('[data-owner="competition"][data-port="input"]');
 await out.click();const target=await input.boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2);await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();await page.waitForTimeout(200);
 const connection=await page.evaluate(()=>({deps:window.__review.saved?.nodes.find(n=>n.id==='competition').deps,notice:document.querySelector('#notice').textContent}));
 const group=page.locator('[data-group="0"]');await group.focus();await page.keyboard.press('Alt+ArrowRight');await page.waitForTimeout(150);const grouped=await getLayout();
 const result={zoom,nodeMoved:moved?.nodes.market,expectedDelta:{x:60/zoom,y:30/zoom},groupAfterKeyboard:grouped?.groups[0],connection,errors};
 console.log(JSON.stringify(result,null,2));
 await page.screenshot({path:resolve('tasks/T20261111-selection-canvas/evidence/W2-headless-canvas.png')});
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
