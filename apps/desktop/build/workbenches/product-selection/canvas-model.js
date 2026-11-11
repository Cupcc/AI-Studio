import {executionOrder,candidateSource} from './model.js';
export const NODE = { width: 300 };
export const nodeSize = node => ({width:NODE.width,height:node.stage===2?400:node.stage===3?196:246});
export const clampZoom = value => Math.max(.15, Math.min(2.5, value));
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
export function layoutFor(state) {
  const saved = state.canvas ?? {}, groups = {}, nodes = {};
  for (let stage=0;stage<4;stage++) {
    groups[stage] = point(saved.groups?.[stage]) ? {...saved.groups[stage]} : {x:stage*392+32,y:32};
    state.nodes.filter(n=>n.stage===stage).forEach((n,index)=>{
      nodes[n.id] = point(saved.nodes?.[n.id]) ? {x:Math.max(24,saved.nodes[n.id].x),y:Math.max(94,saved.nodes[n.id].y)} : {x:24,y:94+index*(stage===3?210:275)};
    });
  }
  const view = saved.viewport;
  return {groups,nodes,viewport:point(view)&&Number.isFinite(view.zoom)?{x:view.x,y:view.y,zoom:clampZoom(view.zoom)}:null};
}
export function groupBounds(state,layout,stage) {
  const positions=state.nodes.filter(n=>n.stage===stage).map(n=>({...layout.nodes[n.id],...nodeSize(n)}));
  return {...layout.groups[stage],width:Math.max(348,...positions.map(p=>p.x+p.width+24)),height:Math.max(360,...positions.map(p=>p.y+p.height+24))};
}
export function worldNode(state,layout,id) {
  const node=state.nodes.find(n=>n.id===id), position=layout.nodes[id], group=layout.groups[node.stage];
  return {x:group.x+position.x,y:group.y+position.y,...nodeSize(node)};
}
export function zoomAt(viewport,factor,anchor) {
  const zoom=clampZoom(viewport.zoom*factor),ratio=zoom/viewport.zoom;
  return {x:anchor.x-(anchor.x-viewport.x)*ratio,y:anchor.y-(anchor.y-viewport.y)*ratio,zoom};
}
export function fitBounds(bounds,size) {
  const left=Math.min(...bounds.map(b=>b.x)),top=Math.min(...bounds.map(b=>b.y));
  const width=Math.max(...bounds.map(b=>b.x+b.width))-left,height=Math.max(...bounds.map(b=>b.y+b.height))-top;
  const zoom=clampZoom(Math.min((size.width-80)/Math.max(1,width),(size.height-80)/Math.max(1,height),1));
  return {x:(size.width-width*zoom)/2-left*zoom,y:(size.height-height*zoom)/2-top*zoom,zoom};
}
export function connectionState(state,sourceId,targetId,remove=false) {
  const source=state.nodes.find(n=>n.id===sourceId),target=state.nodes.find(n=>n.id===targetId);
  if(!source||!target)throw new Error('连线节点已不存在。');
  if(sourceId===targetId)throw new Error('节点不能连接自身。');
  if(source.stage>target.stage)throw new Error('输入来源须位于同一流程或前面的流程。');
  const next=structuredClone(state),node=next.nodes.find(n=>n.id===targetId);
  node.deps=remove?node.deps.filter(id=>id!==sourceId):[...new Set([...node.deps,sourceId])];
  executionOrder(next,next.nodes.map(n=>n.id));
  if(node.stage===3)candidateSource(next,node);
  return next;
}
