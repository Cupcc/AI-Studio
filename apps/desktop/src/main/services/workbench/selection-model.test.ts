import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { expect, it } from 'vitest'
const source = readFileSync(new URL('../../../../build/workbenches/product-selection/model.js', import.meta.url), 'utf8').replace(/^export /gm, '')
function run(script: string): unknown { const context = createContext({}); runInContext(source, context); return runInContext(script, context) }
it('orders every dependency before its consumer and rejects cycles and missing inputs', () => {
  expect(run("executionOrder(initialState(), ['design-A'])")).toEqual(['market','competition','brand','analysis','candidates','design-A'])
  expect(() => run("const s=initialState();s.nodes[0].deps=['analysis'];executionOrder(s,['analysis'])")).toThrow('循环')
  expect(() => run("executionOrder(initialState(),['missing'])")).toThrow('找不到')
})
it('invalidates downstream results after upstream requirements change without erasing old results', () => {
  expect(run(`const s=initialState();for(const n of s.nodes){n.result='saved';n.fingerprint=fingerprint(s,n)};s.nodes[0].prompt+=' changed';[stale(s,s.nodes[0]),stale(s,s.nodes[3]),s.nodes[3].result]`)).toEqual([true,true,'saved'])
})
it('a local candidate material change invalidates only its matching design', () => {
  expect(run(`const s=initialState();s.candidates='ABCDE'.split('').map(id=>({id,material:'wood'}));for(const n of s.nodes){n.result='saved';n.fingerprint=fingerprint(s,n)};s.candidates[1].material='ceramic';[stale(s,s.nodes[5]),stale(s,s.nodes[6]),stale(s,s.nodes[7])]`)).toEqual([false,true,false])
})
it('requires complete structured candidates and refuses invented fallback content', () => {
  expect(() => run("parseCandidates('not json')")).toThrow('有效 JSON')
  expect(() => run("parseCandidates('{\"candidates\":[]}')")).toThrow('五条')
  expect(run(`const candidates='ABCDE'.split('').map(id=>({id,title:'cup',audience:'home',material:'wood',price:'100',rationale:'source',risk:'unverified'}));parseCandidates(JSON.stringify({candidates})).length`)).toBe(5)
})
it('design prompts include only their assigned candidate and refuse missing candidates', () => {
  expect(() => run('nodePrompt(initialState(),initialState().nodes[5])')).toThrow('先生成')
  expect(run(`const s=initialState();s.candidates=[{id:'A',title:'specific-A'},{id:'B',title:'specific-B'}];const p=nodePrompt(s,s.nodes[5]);[p.includes('specific-A'),p.includes('specific-B')]`)).toEqual([true,false])
})
it('keeps candidate collections bound to their source node when more than one collection exists', () => {
  expect(run(`const s=initialState();s.candidates=[{id:'A',title:'original-A'}];const second={...s.nodes[4],id:'second',candidates:[{id:'A',title:'second-A'}]};s.nodes.push(second);const p=nodePrompt(s,s.nodes[5]);s.nodes[5].deps=['second'];const q=nodePrompt(s,s.nodes[5]);[p.includes('original-A'),p.includes('second-A'),q.includes('second-A'),q.includes('original-A')]`)).toEqual([true,false,true,false])
  expect(() => run(`const s=initialState();s.nodes[5].deps=[];nodePrompt(s,s.nodes[5])`)).toThrow('仅连接一个')
})
const canvasSource = readFileSync(new URL('../../../../build/workbenches/product-selection/canvas-model.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
function canvasRun(script: string): unknown { const context=createContext({structuredClone});runInContext(source+'\n'+canvasSource,context);return runInContext(script,context) }
it('restores layout separately from business results and moves a whole group in world coordinates',()=>{
  expect(canvasRun(`const s=initialState(),l=layoutFor(s),before=fingerprint(s,s.nodes[0]),p=worldNode(s,l,'market');l.groups[0].x+=250;l.groups[0].y-=180;s.canvas=l;const restored=layoutFor(s),q=worldNode(s,restored,'market');[q.x-p.x,q.y-p.y,before===fingerprint(s,s.nodes[0]),s.nodes.length]`)).toEqual([250,-180,true,10])
})
it('ignores a saved viewport so every entry starts from the same view',()=>{
  expect(canvasRun(`const s=initialState();s.canvas={...layoutFor(s),viewport:{x:-400,y:90,zoom:2}};Object.keys(layoutFor(s))`)).toEqual(['groups','nodes'])
})
it('cursor zoom preserves the world point and fitting contains every group',()=>{
  expect(canvasRun(`const v={x:-120,y:80,zoom:.7},p={x:320,y:190},z=zoomAt(v,2,p);Math.abs((p.x-v.x)/v.zoom-(p.x-z.x)/z.zoom)<1e-8 && Math.abs((p.y-v.y)/v.zoom-(p.y-z.y)/z.zoom)<1e-8`)).toBe(true)
  expect(canvasRun(`const s=initialState(),l=layoutFor(s),b=[0,1,2,3].map(i=>groupBounds(s,l,i)),v=fitBounds(b,{width:1200,height:800});b.every(r=>r.x*v.zoom+v.x>=0&&r.y*v.zoom+v.y>=0&&(r.x+r.width)*v.zoom+v.x<=1200&&(r.y+r.height)*v.zoom+v.y<=800)`)).toBe(true)
})
it('fitting and the start view keep groups clear of the floating bars and begin at the first stage',()=>{
  expect(canvasRun(`const s=initialState(),l=layoutFor(s),b=[0,1,2,3].map(i=>groupBounds(s,l,i)),near=(a,c)=>Math.abs(a-c)<1e-9,v=fitBounds(b,{width:1200,height:800}),one=fitBounds([b[3]],{width:1200,height:800}),start=startView(b,{width:400,height:700});[b.every(r=>r.x*v.zoom+v.x>=INSET.left&&r.y*v.zoom+v.y>=INSET.top-1e-9&&(r.x+r.width)*v.zoom+v.x<=1200-INSET.right&&(r.y+r.height)*v.zoom+v.y<=800-INSET.bottom),near(b[3].y*one.zoom+one.y,INSET.top),start.zoom,near(b[0].x*start.zoom+start.x,INSET.left),near(b[0].y*start.zoom+start.y,INSET.top)]`)).toEqual([true,true,.75,true,true])
})
it('canvas dependencies use the same graph and design-source rules as node detail edits',()=>{
  expect(canvasRun(`const s=initialState();connectionState(s,'market','competition').nodes.find(n=>n.id==='competition').deps`)).toEqual(['market'])
  expect(()=>canvasRun(`const s=connectionState(initialState(),'market','competition');connectionState(s,'competition','market')`)).toThrow('循环')
  expect(()=>canvasRun(`connectionState(initialState(),'market','market')`)).toThrow('自身')
  expect(()=>canvasRun(`connectionState(initialState(),'candidates','design-A',true)`)).toThrow('仅连接一个')
  expect(canvasRun(`const s=connectionState(initialState(),'market','competition');connectionState(s,'market','competition',true).nodes.find(n=>n.id==='competition').deps`)).toEqual([])
})
