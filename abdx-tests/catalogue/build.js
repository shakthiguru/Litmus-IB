// Renders catalogue/testcases.js into testcases.html (review page) and testcases.csv
const fs = require('fs'), path = require('path');
const C = require('./testcases.js');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csvq = s => '"' + String(s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(__dirname, 'testcases.csv'),
  ['ID,Module,Title,Priority,Type,Run mode,Source,Test data,Steps,Expected result']
    .concat(C.map(c => [c.id, c.module, c.title, c.pri, c.type, c.mode, c.source, c.data, c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), c.expected].map(csvq).join(','))).join('\n'));
const count = (k) => C.reduce((m, c) => (m[c[k]] = (m[c[k]] || 0) + 1, m), {});
const mods = count('module'), pri = count('pri'), src = count('source'), mode = count('mode'), type = count('type');
const chips = (o) => Object.entries(o).map(([k, v]) => `<span class="chip"><b>${v}</b> ${esc(k)}</span>`).join('');
const rows = C.map(c => `<tr data-mod="${esc(c.module)}" data-pri="${c.pri}" data-src="${esc(c.source)}" data-mode="${c.mode}">
<td class="id">${c.id}</td><td>${esc(c.title)}<details><summary>Steps and expected</summary>
<div class="d"><div><span class="k">Test data</span> ${esc(c.data)}</div><ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
<div><span class="k">Expected</span> ${esc(c.expected)}</div></div></details></td>
<td>${esc(c.module)}</td><td><span class="p ${c.pri}">${c.pri}</span></td><td>${c.type}</td><td><span class="m ${c.mode}">${c.mode}</span></td><td>${esc(c.source)}</td></tr>`).join('\n');
const opt = (o) => Object.keys(o).map(k => `<option>${esc(k)}</option>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABDX Test Catalogue</title><style>
:root{--bg:#f7f8fa;--card:#fff;--fg:#1b1f24;--mut:#5b6573;--line:#e3e6ea;--acc:#1f5fbf;--p1:#b42318;--p2:#b54708;--p3:#475467;--chip:#eef2f7}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0f1216;--card:#171b21;--fg:#e6e9ed;--mut:#9aa4b2;--line:#2a3039;--acc:#6ea0ff;--p1:#f97066;--p2:#fdb022;--p3:#98a2b3;--chip:#222831}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:14px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:24px}.kpi span{color:var(--mut);font-size:12px}
.chip{display:inline-block;background:var(--chip);border-radius:999px;padding:2px 10px;margin:3px 4px 3px 0;font-size:12px}.lbl{font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;margin:6px 0 2px}
.filters{display:flex;flex-wrap:wrap;gap:8px}.filters input,.filters select{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit}.filters input{flex:1;min-width:180px}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card)}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--mut);text-transform:uppercase;position:sticky;top:0;background:var(--card)}
td.id{font-family:ui-monospace,Menlo,monospace;white-space:nowrap;font-size:12px}details summary{cursor:pointer;color:var(--acc);font-size:12px;margin-top:2px}.d{font-size:13px;color:var(--mut);padding:6px 0}.d ol{margin:6px 0;padding-left:20px}.k{font-weight:600;color:var(--fg)}
.p{font-weight:700;font-size:12px}.P1{color:var(--p1)}.P2{color:var(--p2)}.P3{color:var(--p3)}.m{font-size:12px;border:1px solid var(--line);border-radius:4px;padding:0 6px}
.note li{margin:4px 0}#n{color:var(--mut);font-size:12px;margin:8px 0}</style></head><body><div class="wrap">
<h1>ABDX Test Catalogue</h1><p class="sub">Step 1 for review. Application: https://abdx.vercel.app. Built from the testing brief, the AI Lens report and a live walk of the app on 17 Nov 2026.</p>
<div class="kpis"><div class="kpi"><b>${C.length}</b><span>Test cases</span></div><div class="kpi"><b>${Object.keys(mods).length}</b><span>Modules</span></div><div class="kpi"><b>${pri.P1 || 0}</b><span>P1 critical</span></div><div class="kpi"><b>${C.length - (mode.seed || 0) - (mode.stateful || 0)}</b><span>Fully parallel</span></div></div>
<div class="card"><div class="lbl">By module</div>${chips(mods)}<div class="lbl">By priority</div>${chips(pri)}<div class="lbl">By type</div>${chips(type)}<div class="lbl">By source</div>${chips(src)}<div class="lbl">By run mode</div>${chips(mode)}</div>
<div class="card note"><div class="lbl">How the run will be ordered</div><ul>
<li><b>seed</b>: runs first, one after another, right after <code>POST /api/reset</code>. These check the original seed data before anything changes it.</li>
<li><b>parallel</b>: runs in as many browsers as the machine allows. Each test creates its own data and finds it by the captured reference number.</li>
<li><b>stateful</b>: runs last, one after another, because it checks global counters (dashboard pending count) that parallel tests would change.</li>
<li>Source <b>AI Lens</b> cases come from that report's suspected defects, so several are expected to fail today. That is the point: they confirm or clear each finding on the live app.</li></ul></div>
<div class="card filters"><input id="q" placeholder="Search ID, title, expected..."><select id="fm"><option value="">All modules</option>${opt(mods)}</select><select id="fp"><option value="">All priorities</option>${opt(pri)}</select><select id="fs"><option value="">All sources</option>${opt(src)}</select></div>
<div id="n"></div><div class="tw"><table><thead><tr><th>ID</th><th>Test case</th><th>Module</th><th>Pri</th><th>Type</th><th>Mode</th><th>Source</th></tr></thead><tbody id="tb">${rows}</tbody></table></div>
</div><script>
const q=document.getElementById('q'),fm=document.getElementById('fm'),fp=document.getElementById('fp'),fs=document.getElementById('fs'),n=document.getElementById('n');
function f(){let k=0;const s=q.value.toLowerCase();document.querySelectorAll('#tb tr').forEach(r=>{const ok=(!fm.value||r.dataset.mod===fm.value)&&(!fp.value||r.dataset.pri===fp.value)&&(!fs.value||r.dataset.src===fs.value)&&(!s||r.textContent.toLowerCase().includes(s));r.style.display=ok?'':'none';if(ok)k++});n.textContent=k+' of ${C.length} test cases shown'}
[q,fm,fp,fs].forEach(e=>e.addEventListener('input',f));f();</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'testcases.html'), html);
console.log('wrote testcases.html and testcases.csv for', C.length, 'cases');
