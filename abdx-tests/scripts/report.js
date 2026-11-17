// Builds reports/abdx-report.html: an executive dashboard joined to the test catalogue.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'reports');
const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(out, 'run-meta.json'), 'utf8'));
const catalogue = Object.fromEntries(require('../catalogue/testcases.js').map(c => [c.id, c]));

// Plain-language reading of each failure we expect to be a real defect (shown only when that test fails).
const FINDINGS = {
  'TC-NAV-008': ['Low', 'Selector contract gap: menu-item-payments listed in the brief does not exist in the app.'],
  'TC-NAV-009': ['Low', 'Unknown URLs silently redirect to Dashboard instead of showing a not-found page.'],
  'TC-DASH-005': ['Medium', 'The "Open Payment Tracker" link on the Pending Approvals tile does not navigate.'],
  'TC-DASH-006': ['Low', 'Notifications bell does nothing when clicked.'],
  'TC-DR-006': ['Medium', 'Drafts are deleted immediately with no confirmation.'],
  'TC-IBG-009': ['Low', 'Calculated Amount has no currency code, so the user cannot tell which currency it is in.'],
  'TC-IBG-014': ['High', 'An expired deal (expiry in the past) is accepted and reaches review.'],
  'TC-SB-006': ['Medium', 'Switching from Saved back to Adhoc keeps the saved beneficiary values in the form.'],
  'TC-SEC-001': ['Critical', 'Transactions API returns data with no authentication token.'],
  'TC-SEC-002': ['Critical', 'Drafts and beneficiaries APIs return data with no authentication token.'],
  'TC-SEC-003': ['High', 'Payment form data (beneficiary details) stays in sessionStorage after logout and reappears for the next login.'],
  'TC-SEC-004': ['High', 'A Corporate Maker can approve payments: no segregation of duties.'],
  'TC-SEC-005': ['Medium', 'Transfer Money Continue does nothing: no review, no validation.'],
  'TC-SEC-006': ['Medium', 'Layout overflows at phone width (horizontal scroll).'],
  'TC-SEC-007': ['Low', 'Canada and New Zealand routing codes are labelled "Sort Code" (Canada uses Transit/Institution numbers, New Zealand uses bank codes).'],
  'TC-SEC-008': ['Low', 'Seeded GB beneficiary ACME Trading LLC carries a German (DE) IBAN.'],
  'TC-VAL-010': ['Medium', 'Beneficiary name accepts script markup and sends it to review.'],
};

const strip = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
const esc = s => strip(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rows = [];
(function walk(suites) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) for (const t of spec.tests) {
      const id = (spec.title.match(/TC-[A-Z]+-\d+/) || [])[0];
      const r = t.results[t.results.length - 1] || {};
      const status = t.status === 'expected' ? 'passed' : t.status === 'flaky' ? 'flaky' : t.status === 'skipped' ? 'skipped' : 'failed';
      const err = strip((r.errors || []).map(e => e.message).join('\n') || (r.error && r.error.message) || '');
      const shot = (r.attachments || []).find(a => a.contentType === 'image/png' && a.path && fs.existsSync(a.path));
      rows.push({ id, title: spec.title.replace(/^TC-[A-Z]+-\d+\s*/, ''), project: t.projectName, status, duration: r.duration || 0, err, shot: shot && shot.path, cat: catalogue[id] || {}, file: spec.file });
    }
    walk(s.suites);
  }
})(results.suites);
rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

const total = rows.length, passed = rows.filter(r => r.status === 'passed').length, failed = rows.filter(r => r.status === 'failed').length;
const flaky = rows.filter(r => r.status === 'flaky').length, skipped = rows.filter(r => r.status === 'skipped').length;
const sumSec = rows.reduce((s, r) => s + r.duration, 0) / 1000;
const wall = meta.wallSeconds, rate = total ? Math.round((passed + flaky) / total * 1000) / 10 : 0;
const notRun = Object.keys(catalogue).filter(id => !rows.some(r => r.id === id));

const byModule = {};
for (const r of rows) { const m = r.cat.module || 'Other'; byModule[m] = byModule[m] || { p: 0, f: 0 }; r.status === 'failed' ? byModule[m].f++ : byModule[m].p++; }
const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3, Unclassified: 4 };
const fails = rows.filter(r => r.status === 'failed').map(r => ({ ...r, sev: (FINDINGS[r.id] || ['Unclassified'])[0], finding: (FINDINGS[r.id] || [null, 'Unexpected failure: investigate (possible regression or environment issue).'])[1] }))
  .sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev] || a.id.localeCompare(b.id));
const sevCount = fails.reduce((m, f) => (m[f.sev] = (m[f.sev] || 0) + 1, m), {});
const img = p => `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
const fmt = s => s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;

const moduleBars = Object.entries(byModule).map(([m, v]) => {
  const t = v.p + v.f;
  return `<div class="mrow"><div class="mname">${esc(m)}</div><div class="bar"><span class="bp" style="width:${v.p / t * 100}%"></span><span class="bf" style="width:${v.f / t * 100}%"></span></div><div class="mnum">${v.p}/${t}</div></div>`;
}).join('');
const failCards = fails.map(f => `<div class="fc sev-${f.sev}"><div class="fh"><span class="sev">${f.sev}</span><span class="fid">${f.id}</span><span class="ft">${esc(f.title)}</span></div>
<div class="fm">${esc(f.cat.module || '')} | ${f.cat.pri || ''} | Source: ${esc(f.cat.source || '')}</div>
<p class="fd">${esc(f.finding)}</p><details><summary>Expected vs actual${f.shot ? ' and screenshot' : ''}</summary>
<div class="k">Expected</div><div>${esc(f.cat.expected || '')}</div><div class="k">Actual</div><pre>${esc(f.err.split('\n').filter(l => l.trim() && !/^\s+at |Call log|waiting for/.test(l)).slice(0, 8).join('\n'))}</pre>
${f.shot ? `<img loading="lazy" alt="Failure screenshot for ${f.id}" src="${img(f.shot)}">` : ''}</details></div>`).join('');
const table = rows.map(r => `<tr data-s="${r.status}" data-m="${esc(r.cat.module || '')}"><td class="mono">${r.id}</td><td>${esc(r.title)}</td><td>${esc(r.cat.module || '')}</td><td>${r.cat.pri || ''}</td><td>${r.project}</td><td><span class="st ${r.status}">${r.status}</span></td><td class="num">${(r.duration / 1000).toFixed(1)}s</td></tr>`).join('');
const passRows = meta.passes.map((p, i) => `<tr><td>${i + 1}</td><td>${p.project}</td><td class="num">${p.workers}</td><td class="num">${rows.filter(r => r.project === p.project).length}</td><td class="num">${fmt(p.seconds)}</td></tr>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABDX Test Report</title><style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#17202b;--mut:#5d6877;--line:#e2e6eb;--ok:#12805c;--bad:#c4320a;--warn:#b54708;--acc:#1f5fbf;--chip:#eef1f5;--crit:#912018;--high:#c4320a;--med:#b54708;--low:#475467}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e1116;--card:#161b22;--fg:#e6e9ee;--mut:#9aa5b4;--line:#2a313b;--ok:#3ccb8f;--bad:#ff7a59;--warn:#f5b041;--acc:#6ea0ff;--chip:#21272f;--crit:#ff6b6b;--high:#ff8a5c;--med:#f5b041;--low:#a0aab8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0}h2{font-size:16px;margin:28px 0 10px}.sub{color:var(--mut);margin:4px 0 18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:26px;font-variant-numeric:tabular-nums}.kpi span{color:var(--mut);font-size:12px}.kpi.ok b{color:var(--ok)}.kpi.bad b{color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}.grid2{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}@media(max-width:760px){.grid2{grid-template-columns:1fr}}
.mrow{display:grid;grid-template-columns:170px 1fr 52px;gap:10px;align-items:center;margin:5px 0}.mname{font-size:13px}.bar{height:12px;background:var(--chip);border-radius:6px;overflow:hidden;display:flex}.bp{background:var(--ok)}.bf{background:var(--bad)}.mnum{text-align:right;font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
@media(max-width:520px){.mrow{grid-template-columns:110px 1fr 44px}}
.sevs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.sevs div{border:1px solid var(--line);border-radius:8px;padding:6px 12px;background:var(--card)}.sevs b{font-size:18px;margin-right:6px}
.fc{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--low);border-radius:8px;padding:10px 14px;margin-bottom:8px}.sev-Critical{border-left-color:var(--crit)}.sev-High{border-left-color:var(--high)}.sev-Medium{border-left-color:var(--med)}
.fh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.sev{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.sev-Critical .sev{color:var(--crit)}.sev-High .sev{color:var(--high)}.sev-Medium .sev{color:var(--med)}.sev-Low .sev{color:var(--low)}
.fid,.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}.ft{font-weight:600}.fm{color:var(--mut);font-size:12px}.fd{margin:6px 0}details summary{cursor:pointer;color:var(--acc);font-size:12px}.k{font-weight:600;margin-top:8px;font-size:12px}
pre{white-space:pre-wrap;word-break:break-word;background:var(--chip);padding:8px;border-radius:6px;font-size:12px;margin:4px 0}img{max-width:100%;border:1px solid var(--line);border-radius:6px;margin-top:8px}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card)}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;color:var(--mut);text-transform:uppercase}.num{text-align:right;font-variant-numeric:tabular-nums}
.st{font-size:12px;font-weight:600}.st.passed{color:var(--ok)}.st.failed{color:var(--bad)}.st.flaky{color:var(--warn)}.st.skipped{color:var(--mut)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.filters select,.filters input{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit}.filters input{flex:1;min-width:160px}
.note{color:var(--mut);font-size:13px}a{color:var(--acc)}</style></head><body><div class="wrap">
<h1>ABDX Test Report</h1>
<p class="sub">${esc(meta.baseURL)} | run started ${new Date(meta.startedAt).toUTCString()} | Playwright, Chromium headless</p>
<div class="kpis">
<div class="kpi"><b>${total}</b><span>Tests executed</span></div><div class="kpi ok"><b>${passed}</b><span>Passed</span></div><div class="kpi bad"><b>${failed}</b><span>Failed</span></div>
<div class="kpi"><b>${rate}%</b><span>Pass rate</span></div><div class="kpi"><b>${fmt(wall)}</b><span>Wall-clock time</span></div><div class="kpi"><b>${fmt(sumSec)}</b><span>Total test time</span></div>
<div class="kpi"><b>${(sumSec / wall).toFixed(1)}x</b><span>Parallel speed-up</span></div><div class="kpi"><b>${meta.workers}</b><span>Parallel browsers</span></div></div>
${flaky || skipped || notRun.length ? `<p class="note">${flaky} flaky, ${skipped} skipped${notRun.length ? `, not executed: ${notRun.join(', ')}` : ''}.</p>` : ''}
<div class="grid2" style="margin-top:12px"><div class="card"><h2 style="margin-top:0">Pass rate by module</h2>${moduleBars}</div>
<div class="card"><h2 style="margin-top:0">Execution passes</h2><div class="tw"><table><thead><tr><th>#</th><th>Pass</th><th class="num">Workers</th><th class="num">Tests</th><th class="num">Time</th></tr></thead><tbody>${passRows}</tbody></table></div>
<p class="note">Seed checks run first right after the data reset, then everything else in parallel, then the dashboard counter checks on their own so parallel tests cannot disturb them.</p></div></div>
<h2>Defects found (${failed})</h2>
<div class="sevs">${['Critical', 'High', 'Medium', 'Low', 'Unclassified'].filter(s => sevCount[s]).map(s => `<div><b>${sevCount[s]}</b>${s}</div>`).join('')}</div>
${failCards || '<p class="note">No failures.</p>'}
<h2>All results</h2>
<div class="filters"><input id="q" placeholder="Search ID or title"><select id="fs"><option value="">All statuses</option><option>passed</option><option>failed</option><option>flaky</option><option>skipped</option></select><select id="fm"><option value="">All modules</option>${Object.keys(byModule).map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
<div class="tw"><table><thead><tr><th>ID</th><th>Test case</th><th>Module</th><th>Pri</th><th>Pass</th><th>Status</th><th class="num">Time</th></tr></thead><tbody id="tb">${table}</tbody></table></div>
<p class="note">Full Playwright report with per-step detail: playwright-html/index.html (next to this file).</p>
</div><script>const q=document.getElementById('q'),fs=document.getElementById('fs'),fm=document.getElementById('fm');
function f(){const s=q.value.toLowerCase();document.querySelectorAll('#tb tr').forEach(r=>{r.style.display=(!fs.value||r.dataset.s===fs.value)&&(!fm.value||r.dataset.m===fm.value)&&(!s||r.textContent.toLowerCase().includes(s))?'':'none'})}
[q,fs,fm].forEach(e=>e.addEventListener('input',f));</script></body></html>`;
fs.writeFileSync(path.join(out, 'abdx-report.html'), html);
console.log(`Report: reports/abdx-report.html  (${passed} passed, ${failed} failed, ${flaky} flaky, ${skipped} skipped of ${total}; wall ${fmt(wall)})`);
