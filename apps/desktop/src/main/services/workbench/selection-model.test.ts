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
