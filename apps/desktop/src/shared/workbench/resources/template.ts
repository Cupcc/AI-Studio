export const TEMPLATE_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>随手记</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif;background:#f5f2e9;color:#28271f}*{box-sizing:border-box}body{margin:0;padding:32px;max-width:760px}h1{font-size:30px;letter-spacing:-1px;margin:0 0 8px}p{line-height:1.6;color:#706f63}.counter{display:flex;align-items:center;gap:20px;margin:28px 0}output{font-variant-numeric:tabular-nums;font-size:40px;min-width:64px}button{border:1px solid #b8b8a6;background:#fffdf5;color:#28271f;border-radius:8px;padding:10px 16px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}textarea{width:100%;min-height:140px;resize:vertical;padding:14px;border:1px solid #b8b8a6;border-radius:8px;background:#fffdf5;color:#28271f;font:inherit}label{display:block;font-weight:600;margin-bottom:8px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}[role=status]{min-height:24px}@media(prefers-color-scheme:dark){:root{background:#24251f;color:#efefe4}p{color:#b5b8a5}button,textarea{background:#303228;color:#efefe4;border-color:#6a705b}}
</style></head><body>
<h1>随手记</h1><p>记录一个想法，或用计数器跟进进度。内容保存在当前工作台。</p>
<div class="counter"><output id="count" aria-label="计数">0</output><button id="increment">增加一次</button></div>
<label for="note">笔记</label><textarea id="note" placeholder="写下下一步…"></textarea>
<div class="actions"><button id="save">保存笔记</button><button id="draft">填入对话</button></div><p id="status" role="status">正在读取…</p>
<script>
let snapshot;
const count = document.getElementById('count'), note = document.getElementById('note'), status = document.getElementById('status');
const buttons = Array.from(document.querySelectorAll('button'));
function render(value) {
  snapshot = value;
  const state = value.state && typeof value.state === 'object' && !Array.isArray(value.state) ? value.state : {};
  count.textContent = String(typeof state.count === 'number' ? state.count : 0);
  note.value = typeof state.note === 'string' ? state.note : '';
  status.textContent = value.target.kind === 'draft' ? '草稿预览 · 内容不会写入已添加的工作台' : '内容已保存';
}
async function run(action) {
  buttons.forEach(button => button.disabled = true);
  try { await action(); } catch(error) { status.textContent = error.message; }
  finally { buttons.forEach(button => button.disabled = false); }
}
document.getElementById('increment').onclick = () => run(async () => render(await window.workbench.updateState({count:Number(count.textContent)+1,note:note.value},snapshot.stateRevision)));
document.getElementById('save').onclick = () => run(async () => render(await window.workbench.updateState({count:Number(count.textContent),note:note.value},snapshot.stateRevision)));
document.getElementById('draft').onclick = () => run(async () => { await window.workbench.setDraft(note.value || '请帮我整理下一步。'); status.textContent = '已填入对话草稿，请检查后发送'; });
window.workbench.subscribe(render);
run(async () => render(await window.workbench.getInstance()));
</script></body></html>`
