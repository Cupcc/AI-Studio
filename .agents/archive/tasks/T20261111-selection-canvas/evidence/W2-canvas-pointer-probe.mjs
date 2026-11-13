import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium }=await import(pathToFileURL(resolve('apps/desktop/node_modules/@playwright/test/index.mjs')));
const { initialState }=await import(pathToFileURL(resolve('apps/desktop/build/workbenches/product-selection/model.js')));
const root=resolve('apps/desktop/build/workbenches/product-selection');
const server=createServer((req,res)=>{try{const name=req.url.slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(resolve(root,name)));}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});page.setDefaultTimeout(4000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(state=>{let saved=state,revision=0;const snapshot=()=>({target:{projectId:'p',kind:'instance',id:'i'},state:structuredClone(saved),stateRevision:revision,appearance:{dark:true}});const run={request:{requestId:'stopped-review-run',key:'market',title:'市场与趋势'},session:{id:'stopped-session',activity:'none',stopping:false,lastOutcome:'interrupted',updatedAt:1,createdAt:1}};window.workbench={getInstance:async()=>snapshot(),subscribe:()=>()=>{},listAgents:async()=>[structuredClone(run)],getAgent:async()=>({session:run.session,items:[]}),updateState:async(next,expected)=>{if(expected!==revision)throw Error('conflict');saved=structuredClone(next);revision++;return snapshot();}};},initialState());
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.waitForSelector('.canvas-node');
 const market=page.locator('.canvas-node[data-canvas-node="market"]');await market.locator('.status').filter({hasText:'已停止'}).waitFor();
 await market.locator('.node').dblclick();await page.locator('#detail:not([hidden])').waitFor();const doubleOpened=await page.locator('#detail h2').textContent();assert.equal(doubleOpened,'市场与趋势');
 await page.locator('#close-detail').click();await market.locator('.expand-node').click();await page.locator('#detail:not([hidden])').waitFor();assert.equal(await page.locator('#detail h2').textContent(),'市场与趋势');
 const colors=await page.evaluate(()=>({canvas:getComputedStyle(document.querySelector('#canvas')).backgroundColor,card:getComputedStyle(document.querySelector('.canvas-node')).backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme}));assert.equal(colors.canvas,'rgb(242, 245, 241)');assert.equal(colors.card,'rgb(255, 255, 255)');assert.equal(colors.scheme,'light');assert.deepEqual(errors,[]);
 const result={doubleClickOpens:doubleOpened,expandButtonOpens:true,stoppedLabel:await market.locator('.status').textContent(),hostDarkFixture:true,colors,errors,passed:true};writeFileSync(resolve('tasks/T20261111-selection-canvas/evidence/W2-canvas-pointer-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} finally {await browser.close();await new Promise(done=>server.close(done));}
