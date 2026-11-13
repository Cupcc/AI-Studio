import { stages, readState, executionOrder, fingerprint, stale, parseCandidates, nodePrompt, candidateSource, candidatesFor, selectedFor } from './model.js';
import {createCanvas} from './canvas.js';
import {connectionState} from './canvas-model.js';
const $ = id => document.getElementById(id), api = window.workbench;
let snapshot, state, runs = [], selectedNode = null, busy = false, queue = null, pollTimer, disposed = false, canvas = null, saving = Promise.resolve(), layoutQueued = false, layoutVersion = 0, activeCandidates = 'candidates', polling = null, active = false;
const outputs = new Map(), runErrors = new Map(), accepted = new Map();
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const running = run => run.session.activity !== 'none';
const currentRun = node => runs.findLast(run => run.request.key === node.id);
const locked = () => busy || runs.some(running) || queue !== null;
const collection = () => state.nodes.find(n=>n.id===activeCandidates && n.stage===2) || state.nodes.find(n=>n.stage===2);
const allCandidates = () => collection() ? candidatesFor(state,collection()) : [];
const chosen = () => collection() ? selectedFor(state,collection()) : [];
const preview = () => snapshot.target.kind === 'draft';
function notice(text, error = false) { $('notice').textContent = text; $('notice').dataset.tip = text; $('notice').classList.toggle('error', error); }
// Native title tooltips do not show inside the host iframe. Icon-only, collapsed or truncated controls name themselves through one floating tip.
const tip=document.createElement('div');tip.className='tip';tip.setAttribute('aria-hidden','true');document.body.append(tip);
let tipTarget=null,tipTimer=0;
function hideTip(){clearTimeout(tipTimer);tip.classList.remove('shown');}
function tipFor(el){
  if(el===tipTarget)return;tipTarget=el;hideTip();if(!el)return;
  tipTimer=setTimeout(()=>{
    const text=el.dataset.tip,label=el.querySelector(':scope>span')??(el.textContent.trim()?el:null);
    if(!text||!el.isConnected||el.getAttribute('aria-expanded')==='true')return;
    if(label&&label.offsetWidth>1&&label.scrollWidth<=label.clientWidth&&label.scrollHeight<=label.clientHeight)return;
    tip.textContent=text;const r=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,below=r.bottom+6+h<=innerHeight-8;
    tip.style.left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-8-w))+'px';tip.style.top=(below?r.bottom+6:r.top-6-h)+'px';tip.classList.add('shown');
  },500);
}
document.addEventListener('pointerover',event=>{if(!event.buttons)tipFor(event.target.closest('[data-tip]'));});
document.addEventListener('pointerout',event=>{if(!event.relatedTarget)tipFor(null);});
document.addEventListener('focusin',event=>tipFor(event.target.matches(':focus-visible')?event.target.closest('[data-tip]'):null));
document.addEventListener('focusout',()=>tipFor(null));
for(const type of ['pointerdown','wheel','keydown'])document.addEventListener(type,hideTip,{capture:true,passive:true});
function status(node) {
  const run = currentRun(node);
  if (run?.session.stopping) return ['running','正在停止'];
  if (run?.session.activity === 'needs_input') return ['running','需要输入'];
  if (run?.session.activity === 'running') return ['running','执行中'];
  if (runErrors.has(run?.request.requestId)) return ['failed','结果待修正'];
  if (run && run.session.lastOutcome === 'failed') return ['failed','执行失败'];
  if (run && run.session.lastOutcome === 'interrupted') return ['stale','已停止'];
  if (node.result) return stale(state,node) ? ['stale','需要更新'] : ['done','已完成'];
  return ['idle','待执行'];
}
function save(next = () => state) {
  const commit = async () => {
    const value = typeof next === 'function' ? next() : next;
    const saved = await api.updateState({...value,...(canvas ? {canvas:canvas.layout()} : {})}, snapshot.stateRevision);
    snapshot = saved; state = readState(saved.state);
  };
  saving = saving.then(commit,commit);
  return saving;
}
function saveLayout() {
  layoutVersion++;canvas.saving();
  if(layoutQueued)return;
  layoutQueued=true;
  void (async()=>{
    try {let version;do{version=layoutVersion;await save();}while(version!==layoutVersion&&!disposed);canvas.saved();}
    catch(error){canvas.failed(error.message);}
    finally{layoutQueued=false;}
  })();
}
async function action(fn) {
  if (polling) await polling;
  if (busy) return;
  busy = true; renderControls();
  try { await fn(); } catch (error) { queue = null; notice(error.message, true); }
  finally { busy = false; render(); }
}
function renderControls() {
  const lock = locked();
  $('brief').disabled = lock; $('sources').disabled = lock; $('save-task').disabled = lock;
  $('run-all').disabled = lock || preview(); $('add-node').disabled = lock;
  $('stop-all').hidden = !runs.some(running) && queue === null;
  const now=runs.some(running)||queue!==null;if(now&&!active)$('task-settings').open=true;active=now;
  $('stop-all').disabled = busy;
  $('compare').disabled = allCandidates().length === 0;
  $('export').disabled = chosen().length === 0;
}
function render() {
  if (!state) return;
  renderControls();
  $('progress').textContent = state.nodes.filter(n => n.result && !stale(state,n)).length+' / '+state.nodes.length+' 节点已有最新结果';
  canvas?.update(state,status,selectedNode);
  if (selectedNode && !$('detail').hidden) renderDetail(false);
}
function openNode(id) { selectedNode=id; if(state.nodes.find(n=>n.id===id)?.stage===2)activeCandidates=id; $('detail').hidden=false; renderDetail(true); render(); }
function renderDetail(force) {
  const node = state.nodes.find(n => n.id===selectedNode);
  if (!node) { $('detail').hidden=true; return; }
  const run=currentRun(node), [cls,label]=status(node);
  if (!force && $('detail').dataset.node === node.id) {
    $('node-status').textContent=label; $('node-status').className='status '+cls;
    $('node-result').textContent=outputs.get(run?.request.requestId) || node.result;
    $('node-error').textContent=runErrors.get(run?.request.requestId) || '';
    $('run-node').disabled=locked() || preview(); $('save-node').disabled=locked();
    $('node-title').disabled=locked(); $('node-prompt').disabled=locked();
    document.querySelectorAll('[data-dep], [data-select], [data-edit]').forEach(el => el.disabled=locked());
    if ($('candidate-id')) $('candidate-id').disabled=locked();
    $('stop-node').hidden=!run || !running(run); $('stop-node').disabled=busy;
    $('open-session').disabled=!run;
    $('node-log').textContent=run ? '本次执行：'+new Date(run.session.createdAt).toLocaleString()+'\n'+(run.session.activity==='needs_input'?'请打开会话处理审批或补充信息。':'') : '';
    return;
  }
  $('detail').dataset.node=node.id;
  const candidates=node.stage===2 ? candidatesFor(state,node).map(c => `<article class="candidate"><h3>${escape(c.id+' · '+c.title)}</h3><p>${escape(c.audience+' / '+c.price)}</p><p>${escape(c.material)}</p><p>${escape(c.rationale)}</p><p>风险：${escape(c.risk)}</p><div class="candidate-actions"><label class="check"><input type="checkbox" data-select="${c.id}" ${chosen().includes(c.id)?'checked':''} ${locked()?'disabled':''}>入选</label><button data-design="${c.id}">对应设计</button><button data-edit="${c.id}" ${locked()?'disabled':''}>修改材质</button></div></article>`).join('') : '';
  $('detail').innerHTML=`<div class="detail-head"><div><h2>${escape(node.title)}</h2><p><span id="node-status" class="status ${cls}">${label}</span></p></div><button id="close-detail" aria-label="关闭节点详情">关闭</button></div>
    <div class="detail-actions"><button id="run-node" class="primary" ${locked()||preview()?'disabled':''}>${node.result?'重新生成':'运行此节点'}</button><button id="stop-node" ${!run||!running(run)?'hidden':''}>停止</button><button id="open-session" ${!run?'disabled':''}>打开会话</button><button id="discuss">讨论此节点</button></div>
    <p class="draft-hint">${preview()?'草稿可编辑与预览。点击上方“添加至当前项目”后即可运行。':'节点由 Codex CLI 实际执行；关闭页面后会话继续运行。'}</p>
    <p id="node-error" class="danger" role="alert"></p><div id="node-log" class="run-log"></div>
    <section class="detail-section"><h3>节点结果</h3><div id="candidates">${candidates}</div><pre class="result" id="node-result"></pre></section>
    <section class="detail-section"><h3>节点要求</h3><label>名称<input id="node-title" maxlength="80" value="${escape(node.title)}" ${locked()?'disabled':''}></label><label>任务 Prompt<textarea id="node-prompt" rows="5" ${locked()?'disabled':''}>${escape(node.prompt)}</textarea></label>
    ${node.stage===3?`<label>对应候选<select id="candidate-id" ${locked()?'disabled':''}>${['A','B','C','D','E'].map(id=>`<option ${node.candidate===id?'selected':''}>${id}</option>`).join('')}</select></label>`:''}
    <h3>输入与来源</h3>${state.nodes.filter(n=>n.id!==node.id && n.stage<=node.stage).map(n=>`<label class="check"><input type="checkbox" data-dep="${escape(n.id)}" ${node.deps.includes(n.id)?'checked':''} ${locked()?'disabled':''}>${escape(n.title)}</label>`).join('')}
    <button id="save-node" ${locked()?'disabled':''}>保存节点要求</button><p>执行时固定本轮要求与上游结果。修改后保留历史，并提示重新生成。</p></section>
    <section class="detail-section"><h3>执行历史</h3><div class="history">${runs.filter(r=>r.request.key===node.id).toReversed().map(r=>`<button data-history="${r.request.requestId}">${escape(new Date(r.session.createdAt).toLocaleString())} · ${escape(r.session.lastOutcome || r.session.activity)}</button>`).join('')||'<p>暂无执行记录</p>'}</div></section>`;
  $('node-result').textContent=outputs.get(run?.request.requestId) || node.result;
  $('node-error').textContent=runErrors.get(run?.request.requestId)||'';
  $('close-detail').onclick=()=>{selectedNode=null;$('detail').hidden=true;render();};
  $('run-node').onclick=()=>action(()=>startNode(node.id));
  $('stop-node').onclick=()=>action(async()=>{queue=null;await api.stopAgent(currentRun(node).request.requestId);await refreshRuns();});
  $('open-session').onclick=()=>action(()=>api.openSession(currentRun(node).session.id));
  $('discuss').onclick=()=>action(()=>discussNode(node));
  $('save-node').onclick=()=>action(async()=>{
    if (runs.some(running)) throw new Error('请先停止执行再修改。');
    const title=$('node-title').value.trim(),prompt=$('node-prompt').value.trim();
    if(!title||!prompt) throw new Error('请填写节点名称与要求。');
    const next=structuredClone(state), item=next.nodes.find(n=>n.id===node.id);
    Object.assign(item,{title,prompt,deps:[...document.querySelectorAll('[data-dep]:checked')].map(el=>el.dataset.dep),candidate:$('candidate-id')?.value||null});
    executionOrder(next,next.nodes.map(n=>n.id));if(item.stage===3)candidateSource(next,item);await save(next);renderDetail(true);notice('节点要求已保存；受影响的结果需要重新生成。');
  });
  document.querySelectorAll('[data-history]').forEach(button=>button.onclick=()=>action(()=>api.openSession(runs.find(r=>r.request.requestId===button.dataset.history).session.id)));
  document.querySelectorAll('[data-design]').forEach(button=>button.onclick=()=>{const target=state.nodes.find(n=>n.stage===3&&n.candidate===button.dataset.design&&n.deps.includes(node.id));if(target)openNode(target.id);});
  document.querySelectorAll('[data-select]').forEach(box=>box.onchange=()=>action(async()=>{const next=structuredClone(state);const source=next.nodes.find(n=>n.id===node.id),selected=selectedFor(next,source);source.selected=box.checked?[...new Set([...selected,box.dataset.select])]:selected.filter(id=>id!==box.dataset.select);await save(next);renderDetail(true);}));
  document.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{
    const c=candidatesFor(state,node).find(c=>c.id===button.dataset.edit);
    editDialog('修改方案 '+c.id+' 的材质与工艺', c.material, false, async material=>{
      const next=structuredClone(state),source=next.nodes.find(n=>n.id===node.id);source.candidates=structuredClone(candidatesFor(next,source));source.candidates.find(x=>x.id===c.id).material=material;
      await save(next);renderDetail(true);notice('方案 '+c.id+' 已修改，对应设计需要更新。');
    });
  });
}
async function discussNode(node){await api.setDraft('请讨论选品节点“'+node.title+'”。\n任务：'+state.brief+'\n节点要求：'+node.prompt+'\n当前结果：'+node.result,{target:'new'});notice('已填入对话草稿，请检查后发送。');}
async function startNode(id) {
  if(preview())throw new Error('请先添加工作台。');
  if(runs.some(running))throw new Error('已有节点执行中，请等待或停止。');
  const node=state.nodes.find(n=>n.id===id);
  if(!state.brief.trim())throw new Error('请先填写并保存选品任务目标。');
  if(node.deps.some(id=>stale(state,state.nodes.find(n=>n.id===id))))throw new Error('上游结果缺失或过期。请先更新上游，或点击“运行四个流程”。');
  const text=nodePrompt(state,node), request={requestId:crypto.randomUUID(),key:node.id,title:node.title,text,model:null};
  const next=structuredClone(state), item=next.nodes.find(n=>n.id===id);
  item.pending={request,fingerprint:fingerprint(state,node)};
  await save(next);
  const run=await api.startAgent(request);runs.push(run);
  notice('正在执行 '+node.title+'，可打开会话查看工具调用或处理审批。');renderDetail(true);
}
async function refreshRuns() {
  if(preview())return;
  runs=await api.listAgents();
  for(const run of runs) {
    const node=state.nodes.find(n=>n.id===run.request.key);
    if(!node || currentRun(node)?.request.requestId!==run.request.requestId)continue;
    const id=run.request.requestId;
    const observed = run.session.updatedAt+':'+run.session.activity+':'+run.session.lastOutcome;
    if(accepted.get(id)===observed)continue;
    const page=await api.getAgent(id);
    run.session=page.session;
    const turnId=page.items.at(-1)?.turnId;
    const items=page.items.filter(item=>item.turnId===turnId);
    const messages=items.filter(item=>item.kind==='agent_message');
    runErrors.delete(id);
    const text=messages.map(item=>item.text).join('\n\n');
    outputs.set(id,text);
    const error=items.findLast(item=>item.kind==='error');
    if(error)runErrors.set(id,error.summary);
    if(run.session.activity==='none') {
      if(run.session.lastOutcome==='completed' && node.pending?.request.requestId===id) {
        try {
          const result=messages.findLast(item=>item.complete)?.text || text;
          if(!result.trim())throw new Error('Agent 已结束，但未返回可采纳的文本结果。请打开会话检查。');
          const next=structuredClone(state),item=next.nodes.find(n=>n.id===node.id);
          if(item.stage===2){item.candidates=parseCandidates(result);item.selected=selectedFor(next,item).filter(id=>item.candidates.some(c=>c.id===id));}
          item.result=result;item.fingerprint=item.pending.fingerprint;item.runId=id;item.revision++;delete item.pending;
          await save(next);notice(node.title+' 已完成，结果已保存。');
        } catch(error){queue=null;runErrors.set(id,error.message);notice(error.message,true);}
      } else if(run.session.lastOutcome!=='completed') {queue=null;notice(node.title+(run.session.lastOutcome==='interrupted'?' 已停止；原成果保留。':' 执行失败，请打开会话查看原因。'),run.session.lastOutcome==='failed');}
      accepted.set(id,observed);if(selectedNode===node.id)renderDetail(true);
    }
  }
}
async function poll() {
  busy=true;
  try {
    await refreshRuns();
    if(queue && !runs.some(running)) {
      while(queue.length && !stale(state,state.nodes.find(n=>n.id===queue[0])))queue.shift();
      if(queue.length)await startNode(queue.shift());else {queue=null;notice('四个流程已完成，结果已保存。');}
    }
  }catch(error){queue=null;notice(error.message,true);}
  finally{busy=false;render();}
}
async function tick() {
  if(disposed)return;
  if(!busy) { polling=poll();await polling;polling=null; }
  pollTimer=setTimeout(tick,1200);
}
$('task-toggle').onclick=()=>{$('task-settings').open=!$('task-settings').open;};
$('task-settings').ontoggle=()=>$('task-toggle').setAttribute('aria-expanded',String($('task-settings').open));
document.addEventListener('pointerdown',event=>{if($('task-settings').open&&!event.target.closest('#task-settings,#task-toggle,dialog'))$('task-settings').open=false;});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!$('task-settings').open||document.querySelector('dialog[open]'))return;const inside=$('task-settings').contains(document.activeElement);$('task-settings').open=false;if(inside)$('task-toggle').focus();});
$('notice-close').onclick=()=>{$('notice').textContent='';$('notice').dataset.tip='';};
for(const el of document.querySelectorAll('.canvas-top,.notice-bar'))el.addEventListener('wheel',event=>{const nav=event.target.closest('#stages');if(nav&&nav.scrollWidth>nav.clientWidth&&!event.ctrlKey&&!event.metaKey)return;event.preventDefault();$('canvas').dispatchEvent(new WheelEvent('wheel',event));},{passive:false});
$('save-task').onclick=()=>action(async()=>{await save({...state,brief:$('brief').value,sources:$('sources').value});notice('任务要求已保存。');});
$('run-all').onclick=()=>action(async()=>{if(!state.brief.trim())throw new Error('请先填写并保存选品任务目标。');queue=executionOrder(state,state.nodes.map(n=>n.id));notice('已按依赖安排执行；停止、失败会终止后续安排。');});
$('stop-all').onclick=()=>action(async()=>{queue=null;for(const run of runs.filter(running))await api.stopAgent(run.request.requestId);await refreshRuns();notice('已停止编排；历史成果保留。');});
function editDialog(title,value,showStage,onSave) {
  $('edit-label-text').textContent=showStage?'名称':'材质与工艺';
  $('edit-heading').textContent=title;$('edit-value').value=value;$('edit-stage-label').hidden=!showStage;
  $('edit-dialog').showModal();$('edit-value').focus();
  const confirm=()=>{const text=$('edit-value').value.trim();if(!text)return;
    $('edit-dialog').close();void action(async()=>{if(runs.some(running)||queue)throw new Error('请先停止执行。');await onSave(text);});
  };
  $('confirm-edit').onclick=confirm;
  $('edit-value').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();confirm();}};
}
$('cancel-edit').onclick=()=>$('edit-dialog').close();
$('add-node').onclick=()=>editDialog('新建节点','',true,async title=>{
  const stage=Number($('edit-stage').value),id=crypto.randomUUID();
  await save({...state,nodes:[...state.nodes,{id,title:title.slice(0,80),stage,deps:stage===3&&collection()?[collection().id]:[],prompt:'请依据任务目标完成此节点，注明来源与待核实信息。',candidate:stage===3?'A':null,revision:0,result:'',fingerprint:'',runId:null}]});openNode(id);
});
$('stages').innerHTML=stages.map((s,i)=>`<button data-stage="${i}" data-tip="${s.title}"><b>${i+1}</b><span>${s.title}</span></button>`).join('');
function currentStage(stage){for(const button of document.querySelectorAll('[data-stage]'))if(Number(button.dataset.stage)===stage)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}
$('auto-layout').onclick=()=>canvas.autoLayout();
document.querySelectorAll('[data-stage]').forEach(button=>button.onclick=()=>canvas.fit(Number(button.dataset.stage)));
$('compare').onclick=()=>{
  const list=allCandidates().filter(c=>chosen().includes(c.id));const candidates=list.length?list:allCandidates();
  $('comparison').innerHTML=`<h3>${escape(collection().title)}</h3><p>${list.length?'比较已入选的 '+list.length+' 个候选':'尚未入选方案，展示全部候选。可在方案节点勾选入选。'}</p><table><thead><tr><th>比较维度</th>${candidates.map(c=>`<th>${escape(c.id+' · '+c.title)}</th>`).join('')}</tr></thead><tbody>${[['audience','目标人群'],['material','材质工艺'],['price','建议价格'],['rationale','入选依据'],['risk','风险']].map(([key,label])=>`<tr><th>${label}</th>${candidates.map(c=>`<td>${escape(c[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;$('compare-dialog').showModal();
};
$('close-compare').onclick=()=>$('compare-dialog').close();
$('export').onclick=()=>{
  const selected=allCandidates().filter(c=>chosen().includes(c.id));
  const content='<!doctype html><meta charset="utf-8"><title>选品交接简报</title><style>body{font:15px/1.8 system-ui;max-width:900px;margin:40px auto;padding:20px}pre{white-space:pre-wrap}section{page-break-inside:avoid;border-top:1px solid #ccc;margin-top:30px}</style><h1>选品交接简报</h1><p>'+escape(state.brief)+'</p>'+selected.map(c=>{const n=state.nodes.find(n=>n.candidate===c.id&&n.deps.includes(collection().id));return '<section><h2>'+escape(c.id+' · '+c.title)+'</h2><p>'+escape(c.audience+' / '+c.price)+'</p><p>'+escape(c.material)+'</p><p>'+escape(c.rationale)+'</p><p>风险：'+escape(c.risk)+'</p><h3>设计说明'+(n&&stale(state,n)?'（需要更新）':'')+'</h3><pre>'+escape(n?.result||'尚未生成')+'</pre></section>';}).join('');
  const url=URL.createObjectURL(new Blob([content],{type:'text/html'})),link=document.createElement('a');link.href=url;link.download='选品交接简报.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已导出入选方案交接简报。');
};
window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(pollTimer);canvas?.dispose();});
try {
  snapshot=await api.getInstance();state=readState(snapshot.state);
  canvas=createCanvas($('canvas'),{
    state,open:openNode,select:id=>{selectedNode=id;$('detail').hidden=true;render();},preview,run:id=>action(async()=>{const node=state.nodes.find(n=>n.id===id),run=currentRun(node);if(run&&running(run)){queue=null;await api.stopAgent(run.request.requestId);await refreshRuns();}else await startNode(id);}),chat:id=>action(()=>discussNode(state.nodes.find(n=>n.id===id))),design:(source,id)=>{const target=state.nodes.find(n=>n.stage===3&&n.candidate===id&&n.deps.includes(source));openNode(target?.id??source);},locked:()=>(busy&&!polling)||runs.some(running)||queue!==null,notice,layoutChanged:saveLayout,stageChanged:currentStage,
    connect:(source,target,remove)=>action(async()=>{
      if(runs.some(running)||queue)throw new Error('执行中不能修改依赖，请先停止。');
      await save(connectionState(state,source,target,remove));
      if(selectedNode===target)renderDetail(true);
    })
  });
  $('brief').value=state.brief;$('sources').value=state.sources;
  const tools=$('canvas').querySelector('.canvas-tools'),placeNotice=()=>{const room=$('canvas').clientWidth-28-tools.offsetWidth-12;document.body.style.setProperty('--notice-room',room+'px');document.body.classList.toggle('notice-stacked',room<200);};
  new ResizeObserver(placeNotice).observe(tools);new ResizeObserver(placeNotice).observe($('canvas'));
  notice(preview()?'模板预览：编辑任务后，点击上方“添加至当前项目”开始真实执行。':'填写选品目标与资料，按节点生成或运行四个流程。');
  render();void tick();
}catch(error){notice(error.message,true);}
