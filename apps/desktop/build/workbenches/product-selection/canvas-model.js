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
  return {groups,nodes};
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
export const INSET = {top:60,right:24,bottom:56,left:24};
const extent = bounds => {const left=Math.min(...bounds.map(b=>b.x)),top=Math.min(...bounds.map(b=>b.y));return {left,top,width:Math.max(...bounds.map(b=>b.x+b.width))-left,height:Math.max(...bounds.map(b=>b.y+b.height))-top};};
export function fitBounds(bounds,size,inset=INSET) {
  const {left,top,width,height}=extent(bounds),room={width:size.width-inset.left-inset.right,height:size.height-inset.top-inset.bottom};
  const zoom=clampZoom(Math.min(room.width/Math.max(1,width),room.height/Math.max(1,height),1));
  return {x:inset.left+Math.max(0,(room.width-width*zoom)/2)-left*zoom,y:inset.top-top*zoom,zoom};
}
export function startView(bounds,size,inset=INSET,readable=.75) {
  const fit=fitBounds(bounds,size,inset);
  if(fit.zoom>=readable)return fit;
  const {left,top}=extent(bounds),zoom=clampZoom(Math.min(1,readable));
  return {x:inset.left-left*zoom,y:inset.top-top*zoom,zoom};
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
