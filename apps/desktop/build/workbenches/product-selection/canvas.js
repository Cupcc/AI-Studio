import {stages,candidatesFor} from './model.js';
import {NODE,nodeSize,layoutFor,groupBounds,worldNode,zoomAt,fitBounds,startView,INSET} from './canvas-model.js';
const svgNS='http://www.w3.org/2000/svg';
const svgElement=(name,attributes)=>{const el=document.createElementNS(svgNS,name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));return el;};
export function createCanvas(root,options) {
  let state=options.state,layout=layoutFor(state),view=null,gesture=null,space=false,connecting=null,edgeSelection=null,ignoreClick=false,lastNodeClick=null,current=null;
  const groups=new Map(),cards=new Map(),edges=new Map();
  root.innerHTML='<div class="canvas-world"><div class="canvas-groups"></div><svg class="canvas-edges" aria-label="节点依赖连线"></svg><div class="canvas-nodes"></div></div><div class="canvas-tools" role="toolbar" aria-label="画布控制"><button data-tool="out" aria-label="缩小画布">−</button><button data-tool="reset" aria-label="画布恢复100%">100%</button><button data-tool="in" aria-label="放大画布">+</button><button data-tool="fit">适应全图</button><button data-tool="delete" hidden>删除连线</button><span class="layout-status" role="status"></span><button data-tool="retry" hidden>重试保存布局</button><button data-tool="help" aria-label="画布操作说明" title="画布操作说明">?</button></div><p class="canvas-help" id="canvas-help">拖动空白平移 · Ctrl/⌘ + 滚轮缩放 · 拖动节点圆点连线 · 空格拖动平移 · 画布聚焦时方向键平移、加减键缩放</p>';
  root.setAttribute('aria-describedby','canvas-help');
  const world=root.querySelector('.canvas-world'),groupLayer=root.querySelector('.canvas-groups'),nodeLayer=root.querySelector('.canvas-nodes'),svg=root.querySelector('svg');
  const tool=name=>root.querySelector(`[data-tool="${name}"]`),layoutStatus=root.querySelector('.layout-status');
  const defs=svgElement('defs',{}),marker=svgElement('marker',{id:'dependency-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto'});
  marker.append(svgElement('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'currentColor'}));defs.append(marker);svg.append(defs);
  const icon=(name)=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{source:'<path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9"/>',analysis:'<path d="M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',open:'<path d="M7 17 17 7M7 7h10v10"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/>',play:'<path d="m8 5 11 7-11 7Z"/>',bot:'<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 7V3M9 12v2m6-2v2M1 12v5m22-5v5"/>'}[name]}</svg>`;
  const preview=svgElement('path',{class:'connecting-edge',fill:'none'});svg.append(preview);
  const size=()=>({width:root.clientWidth,height:root.clientHeight});
  function local(event){const rect=root.getBoundingClientRect();return {x:(event.clientX-rect.left)*root.clientWidth/rect.width,y:(event.clientY-rect.top)*root.clientHeight/rect.height};}
  const coords=point=>({x:(point.x-view.x)/view.zoom,y:(point.y-view.y)/view.zoom});
  const title=id=>state.nodes.find(n=>n.id===id)?.title ?? id;
  const point=(id,output)=>{const n=worldNode(state,layout,id);return {x:n.x+(output?NODE.width:0),y:n.y+n.height/2};};
  const curve=(a,b)=>{
    if(Math.abs(b.y-a.y)<1)return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    if(b.x-a.x<40)return `M ${a.x} ${a.y} C ${a.x+70} ${a.y}, ${b.x-70} ${b.y}, ${b.x} ${b.y}`;
    const mid=(a.x+b.x)/2,sign=Math.sign(b.y-a.y),radius=Math.min(8,Math.abs(b.y-a.y)/2);
    return `M ${a.x} ${a.y} L ${mid-radius} ${a.y} Q ${mid} ${a.y} ${mid} ${a.y+sign*radius} L ${mid} ${b.y-sign*radius} Q ${mid} ${b.y} ${mid+radius} ${b.y} L ${b.x} ${b.y}`;
  };
  function paint() {
    if(!view)return;
    world.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
    root.dataset.zoom=String(view.zoom);root.dataset.panX=String(view.x);root.dataset.panY=String(view.y);
    tool('reset').textContent=Math.round(view.zoom*100)+'%';tool('out').disabled=view.zoom<=.15;tool('in').disabled=view.zoom>=2.5;
    for(const [stage,element] of groups){const b=groupBounds(state,layout,stage);Object.assign(element.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});}
    for(const [id,element] of cards){element.querySelector('.output-port').classList.toggle('connecting',connecting?.source===id);const p=worldNode(state,layout,id);element.style.left=p.x+'px';element.style.top=p.y+'px';element.style.height=p.height+'px';}
    for(const edge of edges.values()){const d=curve(point(edge.source,true),point(edge.target,false));edge.line.setAttribute('d',d);edge.hit.setAttribute('d',d);edge.hit.setAttribute('stroke-width',String(18/view.zoom));}
    let best=0,stage=current;for(const i of groups.keys()){const b=groupBounds(state,layout,i),w=Math.min(root.clientWidth-INSET.right,view.x+(b.x+b.width)*view.zoom)-Math.max(INSET.left,view.x+b.x*view.zoom),h=Math.min(root.clientHeight-INSET.bottom,view.y+(b.y+b.height)*view.zoom)-Math.max(INSET.top,view.y+b.y*view.zoom);if(w>0&&h>0&&w*h>best){best=w*h;stage=i;}}
    if(stage!==current){current=stage;options.stageChanged?.(stage);}
    if(connecting){preview.setAttribute('d',curve(point(connecting.source,true),connecting.end));preview.style.display='';}else preview.style.display='none';
  }
  function changed(){options.layoutChanged();}
  function fit(stage){if(!root.clientWidth||!root.clientHeight)return;view=fitBounds(stage===undefined?[0,1,2,3].map(i=>groupBounds(state,layout,i)):[groupBounds(state,layout,stage)],size());paint();}
  function zoom(factor,anchor={x:root.clientWidth/2,y:root.clientHeight/2}){view=zoomAt(view,factor,anchor);paint();}
  function selectEdge(edge){edgeSelection=edge;for(const item of edges.values())item.line.classList.toggle('selected',item===edge);tool('delete').hidden=!edge;tool('delete').disabled=options.locked();}
  function connect(source,target){connecting=null;paint();void options.connect(source,target,false);}
  function portAction(id,output){
    if(options.locked()){options.notice('执行中不能修改依赖，请先停止。',true);return;}
    if(output){connecting={source:id,end:point(id,true)};selectEdge(null);options.notice('将连线拖到目标输入点，或点击目标节点的输入点。Esc 取消。');paint();}
    else if(connecting)connect(connecting.source,id);
    else options.notice('先选择上游节点的输出点，再连接此输入点。');
  }
  function update(next,status,selected) {
    state=next;
    const defaults=layoutFor(state);
    for(const n of state.nodes)if(!layout.nodes[n.id])layout.nodes[n.id]=defaults.nodes[n.id];
    for(let stage=0;stage<4;stage++)if(!groups.has(stage)){
      const el=document.createElement('section');el.className='canvas-group';el.id='stage-'+stage;el.setAttribute('aria-label',stages[stage].title);
      const handle=document.createElement('button');handle.className='group-handle';handle.dataset.group=String(stage);handle.setAttribute('aria-label','移动分组 '+stages[stage].title);
      const number=document.createElement('span');number.textContent=String(stage+1);const text=document.createElement('span');const heading=document.createElement('strong');heading.textContent=stages[stage].title;const subtitle=document.createElement('small');subtitle.textContent=stages[stage].subtitle;text.append(heading,subtitle);const count=document.createElement('small');count.className='group-count';handle.append(number,text,count);el.append(handle);groups.set(stage,el);groupLayer.append(el);
    }
    for(const [stage,el] of groups)el.querySelector('.group-count').textContent=state.nodes.filter(n=>n.stage===stage).length+' 节点';
    for(const [id,el] of cards)if(!state.nodes.some(n=>n.id===id)){el.remove();cards.delete(id);delete layout.nodes[id];}
    for(const n of state.nodes){
      let el=cards.get(n.id);
      if(!el){
        el=document.createElement('article');el.className='canvas-node';el.dataset.canvasNode=n.id;
        el.innerHTML=`<button class="node" data-node=""><span class="work-card-header"><span class="node-icon">${icon(n.stage===0?'source':n.stage===1?'analysis':'image')}</span><strong class="node-title"></strong></span><span class="node-state"><span class="status"></span><span class="version-label"></span><span class="node-agent">${icon('bot')}独立 Agent</span></span><span class="node-description"></span><span class="dependency"></span></button><button class="expand-node node-action" data-action="open" title="展开节点">${icon('open')}</button><div class="candidate-preview-list"></div><footer><button class="node-action card-run" data-action="run">${icon('play')}<span>生成</span></button><button class="node-action card-chat" data-action="chat">${icon('chat')}讨论此节点</button></footer><button class="node-port input-port" data-port="input"></button><button class="node-port output-port" data-port="output"></button>`;
        el.querySelector('.node').dataset.node=n.id;cards.set(n.id,el);nodeLayer.append(el);
      }
      const [cls,label]=status(n),body=el.querySelector('.node');el.classList.toggle('is-selected',n.id===selected);el.classList.toggle('material',n.stage===0);el.classList.toggle('design',n.stage===3);el.classList.toggle('proposals',n.stage===2);
      body.setAttribute('aria-label',n.title+' · '+label);el.querySelector('.expand-node').setAttribute('aria-label','展开'+n.title);el.querySelector('.version-label').textContent=n.revision?'v'+n.revision:'';
      const badge=el.querySelector('.status');badge.textContent=cls==='done'?'✓ 已有结果':label==='需要更新'?'需复核更新':label;badge.className='status '+cls;
      el.querySelector('.node-title').textContent=n.title;el.querySelector('.node-description').textContent=n.stage===3&&n.result?n.result.slice(0,110):n.prompt;
      el.querySelector('.dependency').textContent=n.deps.length?n.deps.length+' 个明确输入 · '+n.deps.map(title).join(' / '):'来源：任务目标与用户资料';
      const runButton=el.querySelector('.card-run');runButton.querySelector('span').textContent=cls==='running'?'停止':n.result?'重新生成':'生成';runButton.disabled=options.preview()||(options.locked()&&cls!=='running');runButton.setAttribute('aria-label',runButton.textContent+' '+n.title);
      const list=el.querySelector('.candidate-preview-list');
      if(n.stage===2){const candidates=candidatesFor(state,n),signature=JSON.stringify(candidates);if(list.dataset.signature!==signature){list.replaceChildren();for(const c of candidates){const row=document.createElement('button');row.className='candidate-route node-action';row.dataset.action='design';row.dataset.candidate=c.id;const letter=document.createElement('span');letter.className='candidate-letter';letter.textContent=c.id;const name=document.createElement('span');name.textContent=c.title;const arrow=document.createElement('span');arrow.textContent='对应设计 ↗';row.append(letter,name,arrow);list.append(row);}list.dataset.signature=signature;}}
      for(const port of el.querySelectorAll('[data-port]')){port.dataset.owner=n.id;port.setAttribute('aria-label',n.title+(port.dataset.port==='output'?' 输出端点':' 输入端点'));port.disabled=options.locked();}
    }
    const wanted=new Set();
    for(const target of state.nodes)for(const source of target.deps){
      const key=JSON.stringify([source,target.id]);wanted.add(key);let edge=edges.get(key);
      if(!edge){const line=svgElement('path',{class:'dependency-edge','marker-end':'url(#dependency-arrow)',fill:'none'}),hit=svgElement('path',{class:'edge-hit',fill:'none',stroke:'transparent',tabindex:0,role:'button'});edge={source,target:target.id,line,hit};edges.set(key,edge);svg.insertBefore(line,preview);svg.insertBefore(hit,preview);hit.onclick=event=>{event.stopPropagation();selectEdge(edge);root.focus({preventScroll:true});};hit.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEdge(edge);}if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();void options.connect(edge.source,edge.target,true);}};}
      edge.hit.setAttribute('aria-label',title(source)+' → '+target.title+' 依赖连线');edge.hit.dataset.source=source;edge.hit.dataset.target=target.id;
    }
    for(const [key,edge] of edges)if(!wanted.has(key)){edge.line.remove();edge.hit.remove();edges.delete(key);if(edge===edgeSelection)selectEdge(null);}
    tool('delete').disabled=options.locked();
    if(!view&&root.clientWidth&&root.clientHeight)view=startView([0,1,2,3].map(i=>groupBounds(state,layout,i)),size());
    paint();
  }
  function pointerDown(event){
    if(event.button!==0&&event.button!==1)return;
    if(event.target.closest('.canvas-tools,.node-action'))return;
    const port=event.target.closest('[data-port]'),node=event.target.closest('.node'),group=event.target.closest('[data-group]');
    const start=local(event);
    if(port&&!space&&event.button===0){
      if(options.locked())return;
      if(port.dataset.port==='input')return;
      connecting={source:port.dataset.owner,end:point(port.dataset.owner,true)};gesture={kind:'connect',start,pointer:event.pointerId,moved:false};
    }else if(space||event.button===1||(!node&&!group&&!event.target.closest('.edge-hit'))){
      root.focus({preventScroll:true});selectEdge(null);gesture={kind:'pan',start,origin:{...view},pointer:event.pointerId,moved:false};
    }else if(node){node.focus({preventScroll:true});gesture={kind:'node',id:node.dataset.node,start,origin:{...layout.nodes[node.dataset.node]},pointer:event.pointerId,moved:false};}
    else if(group){const stage=Number(group.dataset.group);gesture={kind:'group',stage,start,origin:{...layout.groups[stage]},pointer:event.pointerId,moved:false};}
    if(gesture){event.preventDefault();root.setPointerCapture(event.pointerId);root.classList.add('gesturing');paint();}
  }
  function pointerMove(event){
    if(!gesture||gesture.pointer!==event.pointerId)return;
    const p=local(event),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
    if(Math.hypot(dx,dy)>3)gesture.moved=true;
    if(!gesture.moved)return;
    if(gesture.kind==='pan')view={...view,x:gesture.origin.x+dx,y:gesture.origin.y+dy};
    else if(gesture.kind==='node')layout.nodes[gesture.id]={x:Math.max(24,gesture.origin.x+dx/view.zoom),y:Math.max(94,gesture.origin.y+dy/view.zoom)};
    else if(gesture.kind==='group')layout.groups[gesture.stage]={x:gesture.origin.x+dx/view.zoom,y:gesture.origin.y+dy/view.zoom};
    else connecting.end=coords(p);
    paint();
  }
  function pointerUp(event){
    if(!gesture||gesture.pointer!==event.pointerId)return;
    const done=gesture;gesture=null;root.classList.remove('gesturing');if(root.hasPointerCapture(event.pointerId))root.releasePointerCapture(event.pointerId);
    if(done.kind==='connect'&&done.moved){const port=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-port="input"]');if(port)connect(connecting.source,port.dataset.owner);else{connecting=null;paint();}}
    else if(done.kind==='node'&&!done.moved){
      const double=lastNodeClick?.id===done.id&&event.timeStamp-lastNodeClick.time<450&&Math.hypot(done.start.x-lastNodeClick.point.x,done.start.y-lastNodeClick.point.y)<5;
      lastNodeClick=double?null:{id:done.id,time:event.timeStamp,point:done.start};
      if(double)options.open(done.id);else options.select(done.id);
    }else lastNodeClick=null;
    if(done.moved&&(done.kind==='node'||done.kind==='group'))changed();
    if(done.kind!=='connect'||done.moved){ignoreClick=true;setTimeout(()=>ignoreClick=false,0);}
  }
  function cancel(){
    if(gesture){if(gesture.kind==='pan')view=gesture.origin;else if(gesture.kind==='node')layout.nodes[gesture.id]=gesture.origin;else if(gesture.kind==='group')layout.groups[gesture.stage]=gesture.origin;const id=gesture.pointer;gesture=null;if(root.hasPointerCapture(id))root.releasePointerCapture(id);}
    connecting=null;space=false;lastNodeClick=null;root.classList.remove('gesturing','pan-ready');paint();
  }
  root.onpointerdown=pointerDown;root.onpointermove=pointerMove;root.onpointerup=pointerUp;root.onpointercancel=cancel;
  root.onclick=event=>{
    if(ignoreClick)return;const control=event.target.closest('[data-action]');if(control){const id=control.closest('.canvas-node').dataset.canvasNode;const method=control.dataset.action;if(method==='open')options.open(id);else if(method==='run')options.run(id);else if(method==='chat')options.chat(id);else options.design(id,control.dataset.candidate);return;}const port=event.target.closest('[data-port]');if(port){portAction(port.dataset.owner,port.dataset.port==='output');return;}
    if(event.detail===0&&event.target.closest('.node'))options.open(event.target.closest('.node').dataset.node);
  };
  root.ondblclick=event=>{const id=event.target.closest('.node')?.dataset.node??lastNodeClick?.id;if(id)options.open(id);};
  root.addEventListener('wheel',event=>{
    if(event.target.closest('.canvas-tools,.node-action'))return;event.preventDefault();
    const scale=event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1;
    if(event.ctrlKey||event.metaKey)zoom(Math.exp(-event.deltaY*scale*.008),local(event));
    else{view={...view,x:view.x-event.deltaX*scale,y:view.y-event.deltaY*scale};paint();}
  },{passive:false});
  root.onkeydown=event=>{
    if(event.key==='Escape'){cancel();selectEdge(null);return;}
    const node=event.target.closest('.node'),group=event.target.closest('[data-group]');
    if((node||group)&&event.altKey&&event.key.startsWith('Arrow')){
      event.preventDefault();const p=node?layout.nodes[node.dataset.node]:layout.groups[Number(group.dataset.group)],step=event.shiftKey?40:10;
      p.x+=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;p.y+=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
      if(node){p.x=Math.max(24,p.x);p.y=Math.max(94,p.y);}paint();changed();return;
    }
    if(event.target!==root)return;
    if(event.key===' '){event.preventDefault();space=true;root.classList.add('pan-ready');}
    if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2);}
    if(event.key==='-'){event.preventDefault();zoom(1/1.2);}
    if(event.key==='0'){event.preventDefault();fit();}
    if(event.key==='Delete'||event.key==='Backspace'){if(edgeSelection){event.preventDefault();void options.connect(edgeSelection.source,edgeSelection.target,true);}}
    if(event.key.startsWith('Arrow')){event.preventDefault();view={...view,x:view.x+(event.key==='ArrowLeft'?60:event.key==='ArrowRight'?-60:0),y:view.y+(event.key==='ArrowUp'?60:event.key==='ArrowDown'?-60:0)};paint();}
  };
  const spaceDown=event=>{if(event.code==='Space'&&root.contains(event.target)&&!event.target.closest('button')){space=true;root.classList.add('pan-ready');event.preventDefault();}};
  const spaceUp=event=>{if(event.code==='Space'){space=false;root.classList.remove('pan-ready');}};
  document.addEventListener('keydown',spaceDown);document.addEventListener('keyup',spaceUp);window.addEventListener('blur',cancel);
  tool('in').onclick=()=>zoom(1.2);tool('out').onclick=()=>zoom(1/1.2);tool('reset').onclick=()=>zoom(1/view.zoom);tool('fit').onclick=()=>fit();tool('help').onclick=()=>options.notice(root.querySelector('.canvas-help').textContent);
  tool('delete').onclick=()=>{if(edgeSelection)void options.connect(edgeSelection.source,edgeSelection.target,true);};tool('retry').onclick=()=>options.layoutChanged();
  const observer=new ResizeObserver(()=>{if(!view&&root.clientWidth&&root.clientHeight){view=startView([0,1,2,3].map(i=>groupBounds(state,layout,i)),size());paint();}else paint();});observer.observe(root);
  return {
    update,fit,autoLayout:()=>{layout=layoutFor({...state,canvas:undefined});view=null;fit();changed();},
    layout:()=>{const committed=structuredClone(layout);if(gesture?.kind==='node')committed.nodes[gesture.id]={...gesture.origin};if(gesture?.kind==='group')committed.groups[gesture.stage]={...gesture.origin};return committed;},
    saving:()=>{layoutStatus.textContent='保存布局中…';tool('retry').hidden=true;},
    saved:()=>{layoutStatus.textContent='布局已保存';tool('retry').hidden=true;},
    failed:message=>{layoutStatus.textContent='布局未保存';tool('retry').hidden=false;options.notice(message,true);},
    dispose:()=>{observer.disconnect();document.removeEventListener('keydown',spaceDown);document.removeEventListener('keyup',spaceUp);window.removeEventListener('blur',cancel);cancel();}
  };
}
