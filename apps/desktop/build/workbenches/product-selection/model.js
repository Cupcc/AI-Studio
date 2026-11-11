export const stages = [
  { title: '数据收集与整理', short: '收集', subtitle: '找到可靠的市场线索' },
  { title: '数据汇总分析', short: '分析', subtitle: '把线索变成判断依据' },
  { title: '方案生成', short: '候选', subtitle: '比较与选择产品方向' },
  { title: '方案对应的设计', short: '设计', subtitle: '细化材质、工艺与造型' }
];
export function initialState() {
  const node = (id, title, stage, deps, prompt, candidate = null) => ({ id, title, stage, deps, prompt, candidate, revision: 0, result: '', fingerprint: '', runId: null });
  return { version: 1, brief: '', sources: '', selected: [], candidates: [], nodes: [
    node('market', '市场与趋势', 0, [], '整理市场趋势、消费人群与需求。区分可核实的事实、来源与假设；无法访问的资料明确列出。'),
    node('competition', '竞品与价格', 0, [], '分析竞品定位、价格带、卖点与空缺。引用实际来源，不虚构销量或市场规模。'),
    node('brand', '品牌与供应链', 0, [], '整理品牌约束、成本、材质、工艺及供应链信息。缺少的条件列为待核实。'),
    node('analysis', '四维选品分析', 1, ['market', 'competition', 'brand'], '综合上游资料，从市场需求、差异化、商业可行性、生产可行性四个维度分析机会。给出证据、风险与推荐方向。'),
    node('candidates', '五个候选方案', 2, ['analysis'], '提出五个差异化、可比较的产品候选，标注需要验证的假设。'),
    ...['A','B','C','D','E'].map(id => node('design-'+id, '方案 '+id+' · 设计', 3, ['candidates'], '针对指定候选给出造型、材料、尺寸、配色、工艺与打样建议。若实际工具支持出图可生成并说明产物位置；否则明确交付设计说明，不宣称图片已生成。', id))
  ] };
}
export function readState(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return initialState();
  if (value.version !== 1 || typeof value.brief !== 'string' || typeof value.sources !== 'string' || !Array.isArray(value.nodes) || !Array.isArray(value.candidates) || !Array.isArray(value.selected)) throw new Error('工作台数据格式不受支持，请保留原数据并通过编辑工作台修复。');
  for (const n of value.nodes) if (!n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.prompt !== 'string' || !Number.isInteger(n.stage) || n.stage < 0 || n.stage > 3 || !Array.isArray(n.deps) || !n.deps.every(d => typeof d === 'string') || typeof n.result !== 'string' || typeof n.fingerprint !== 'string') throw new Error('节点数据不完整，请通过编辑工作台修复。');
  if (new Set(value.nodes.map(n => n.id)).size !== value.nodes.length) throw new Error('节点编号重复');
  executionOrder(value, value.nodes.map(n => n.id));
  return value;
}
export function executionOrder(state, targets) {
  const done = new Set(), visiting = new Set(), result = [];
  function visit(id) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error('节点依赖存在循环');
    const node = state.nodes.find(n => n.id === id);
    if (!node) throw new Error('找不到依赖节点：'+id);
    visiting.add(id); node.deps.forEach(visit); visiting.delete(id); done.add(id); result.push(id);
  }
  targets.forEach(visit); return result;
}
export function candidateSource(state, node) {
  if (node.stage === 2) return node;
  const sources = node.deps.map(id => state.nodes.find(n => n.id === id)).filter(n => n?.stage === 2);
  if (sources.length !== 1) throw new Error('设计节点需要连接且仅连接一个候选方案节点。');
  return sources[0];
}
export function candidatesFor(state, source) { return source.candidates ?? (source.id === 'candidates' ? state.candidates : []) ?? []; }
export function selectedFor(state, source) { return source.selected ?? (source.id === 'candidates' ? state.selected : []) ?? []; }
export function fingerprint(state, node) {
  const candidate = node.candidate ? candidatesFor(state, candidateSource(state,node)).find(c => c.id === node.candidate) : null;
  return JSON.stringify([state.brief, state.sources, node.prompt, node.candidate, candidate, node.deps.map(id => { const n = state.nodes.find(n => n.id === id); return [id, node.candidate && n?.stage === 2 ? candidate : n?.result]; })]);
}
export function stale(state, node, seen = new Set()) {
  if (seen.has(node.id)) return true;
  seen.add(node.id);
  return !node.result || node.fingerprint !== fingerprint(state, node) || node.deps.some(id => { const n = state.nodes.find(n => n.id === id); return !n || stale(state, n, new Set(seen)); });
}
export function parseCandidates(text) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let value;
  try { value = JSON.parse(block ? block[1] : text); } catch { throw new Error('候选结果不是有效 JSON。请查看会话后调整要求并重新生成。'); }
  const list = value.candidates;
  if (!Array.isArray(list) || list.length !== 5 || list.some((c, i) => c.id !== 'ABCDE'[i] || ['title','audience','material','price','rationale','risk'].some(key => typeof c[key] !== 'string' || !c[key].trim()))) throw new Error('候选结果须包含 A–E 五条完整方案，请查看会话并重新生成。');
  return list.map(c => Object.fromEntries(['id','title','audience','material','price','rationale','risk'].map(k => [k,c[k]])));
}
export function nodePrompt(state, node) {
  const candidate = node.candidate ? candidatesFor(state, candidateSource(state,node)).find(c => c.id === node.candidate) : null;
  if (node.candidate && !candidate) throw new Error('请先生成候选方案 '+node.candidate);
  const upstream = node.deps.map(id => { const n = state.nodes.find(n => n.id === id); return n.title+'\n'+(node.candidate && n.stage === 2 ? JSON.stringify(candidate) : n.result); }).join('\n\n');
  return ['你是选品工作台中负责“'+node.title+'”的专业 Agent。按用户授权执行本节点，交付结果，不修改工作台代码。',
    '任务目标：\n'+state.brief, '用户资料（含可读取的项目相对路径/网址）：\n'+state.sources,
    '上游已完成结果：\n'+upstream, candidate ? '仅处理此候选：\n'+JSON.stringify(candidate) : '',
    '节点要求：\n'+node.prompt,
    node.stage === 2 ? '严格仅返回 JSON（可用 json 代码块）：{"candidates":[{"id":"A","title":"产品名","audience":"人群","material":"材质与工艺","price":"建议价格/待验证","rationale":"理由与证据","risk":"风险"}]}。必须按 A、B、C、D、E 顺序给出五条。内容需依据上述资料；推断应注明。' : '用中文交付清晰、可审阅的 Markdown 结果。不要把假设、模拟数据或未生成的图片说成真实成果。'
  ].filter(Boolean).join('\n\n');
}
