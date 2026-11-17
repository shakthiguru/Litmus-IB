import { APP_NAME, APP_SLUG } from './brand.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SCHEMA, STAGES, STAGE_PROBABILITY, recordTitle, fmtMoney, fmtDate, fmtDateTime, todayISO } from './schema.js';
import {
  applyOps, byId, userName, pipelineSummary, decideProposal, getAISettings, saveAISettings, updateSettings, updateConnectors,
  testWebhook, notifySlack, upsertUser, deleteUser, resetDB, replaceDB, uid, getState,
} from './store.js';
import { buildGraph, layout, NODE_TYPES } from './graph.js';
import { runLocal, runClaude, TOOL_DEFS } from './ai.js';
import { Modal, RecordForm, DataTable, changeText } from './ui.jsx';
import { TaskAICell, DeliverablePreview } from './workspace.jsx';
import { KINDS } from './agent.js';

// ---------------------------------------------------------------- Dashboard
export function Dashboard({ db, user, open, useAI }) {
  const s = pipelineSummary(db);
  const maxStage = Math.max(...s.byStage.map((x) => x.amount), 1);
  const overdue = db.tasks.filter((t) => t.status !== 'Done' && t.dueDate && t.dueDate < todayISO());
  const myTasks = db.tasks.filter((t) => t.status !== 'Done' && t.assigneeId === user.id).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const pending = db.proposals.filter((p) => p.status === 'pending');
  const recent = [...db.history].reverse().slice(0, 8);
  const closing = db.deals.filter((d) => !['Won', 'Lost'].includes(d.stage)).sort((a, b) => (a.closeDate || '').localeCompare(b.closeDate || '')).slice(0, 5);
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Open pipeline</div><div className="kpi-value">{fmtMoney(s.openValue)}</div><div className="tiny muted">{s.openCount} open deals</div></div>
        <div className="kpi"><div className="kpi-label">Weighted forecast</div><div className="kpi-value">{fmtMoney(s.weighted)}</div><div className="tiny muted">by stage probability</div></div>
        <div className="kpi"><div className="kpi-label">Won</div><div className="kpi-value">{fmtMoney(s.wonValue)}</div><div className="tiny muted">win rate {s.winRate}%</div></div>
        <div className="kpi"><div className="kpi-label">Overdue tasks</div><div className={'kpi-value' + (overdue.length ? ' danger-text' : '')}>{overdue.length}</div><div className="tiny muted"><a href="#/approvals">{pending.length} AI proposals pending</a></div></div>
      </div>

      <div className="grid2">
        <div className="card">
          <h4>Pipeline by stage</h4>
          <div className="bars">
            {s.byStage.map((x) => (
              <div key={x.stage} className="bar-row">
                <span className="bar-label">{x.stage}</span>
                <div className="bar-track"><div className={'bar-fill stage-bg-' + x.stage.toLowerCase()} style={{ width: (x.amount / maxStage) * 100 + '%' }} /></div>
                <span className="bar-val">{fmtMoney(x.amount)} <span className="muted">({x.count})</span></span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h4>Next closing deals</h4>
          <ul className="list">
            {closing.map((d) => (
              <li key={d.id} onClick={() => open('deals', d.id)}>
                <div className="strong">{d.name}</div>
                <div className="tiny muted">{recordTitle('companies', byId(db, 'companies', d.companyId))} - {fmtMoney(d.amount)} - {d.stage} - closes {fmtDate(d.closeDate)}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h4>My open tasks</h4>
          <ul className="list">
            {myTasks.slice(0, 6).map((t) => (
              <li key={t.id} onClick={() => open('tasks', t.id)} className="row between">
                <div>
                  <div className="strong">{t.title}</div>
                  <div className={'tiny ' + (t.dueDate < todayISO() ? 'danger-text' : 'muted')}>due {fmtDate(t.dueDate)} - {t.priority}</div>
                </div>
                <TaskAICell db={db} task={t} onOpen={useAI} />
              </li>
            ))}
            {!myTasks.length && <li className="muted">Nothing open. Nice.</li>}
          </ul>
        </div>
        <div className="card">
          <h4>Recent activity</h4>
          <ul className="list">
            {recent.map((h) => (
              <li key={h.id} onClick={() => open(h.entity, h.entityId)}>
                <div><span className="strong">{h.actorName}</span> {h.action}d {SCHEMA[h.entity].singular.toLowerCase()} <span className="strong">{recordTitle(h.entity, h.after || h.before)}</span>{h.via === 'ai' && <span className="pill ai">AI</span>}</div>
                <div className="tiny muted">{fmtDateTime(h.ts)}{h.changes?.length ? ' - ' + h.changes.map(changeText).join('; ') : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Generic entity list
const LIST_COLUMNS = {
  companies: ['name', 'industry', 'city', 'employees', 'ownerId'],
  contacts: ['firstName', 'title', 'companyId', 'email', 'phone', 'ownerId'],
  tasks: ['title', 'dueDate', 'status', 'priority', 'dealId', 'assigneeId'],
  deals: ['name', 'companyId', 'amount', 'stage', 'closeDate', 'ownerId'],
};

export function EntityPage({ db, user, entity, open, useAI }) {
  const sch = SCHEMA[entity];
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState(entity === 'tasks' ? 'Open' : '');
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return db[entity].filter((r) => {
      if (filter && r.status !== filter) return false;
      if (!t) return true;
      return sch.fields.some((f) => {
        const v = r[f.key];
        const s = f.type === 'ref' ? recordTitle(f.ref, byId(db, f.ref, v)) : f.type === 'user' ? userName(db, v) : v;
        return String(s ?? '').toLowerCase().includes(t);
      });
    });
  }, [db, entity, q, filter, sch]);
  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder={`Search ${sch.label.toLowerCase()}...`} value={q} onChange={(e) => setQ(e.target.value)} />
        {entity === 'tasks' && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option><option>Open</option><option>Done</option>
          </select>
        )}
        <span className="muted tiny">{rows.length} of {db[entity].length}</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>New {sch.singular.toLowerCase()}</button>
      </div>
      <DataTable db={db} entity={entity} rows={rows} columns={LIST_COLUMNS[entity]} open={open}
        extra={entity === 'tasks' ? { label: 'AI action', render: (r) => <TaskAICell db={db} task={r} onOpen={useAI} /> } : null} />
      {creating && (
        <Modal title={'New ' + sch.singular.toLowerCase()} onClose={() => setCreating(false)}>
          <RecordForm db={db} user={user} entity={entity} onDone={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Deals board
export function DealsBoard({ db, user, open }) {
  const [view, setView] = useState('board');
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [dragId, setDragId] = useState(null);
  const deals = db.deals.filter((d) => !q || (d.name + ' ' + recordTitle('companies', byId(db, 'companies', d.companyId))).toLowerCase().includes(q.toLowerCase()));
  const move = (id, stage) => {
    const d = byId(db, 'deals', id);
    if (d && d.stage !== stage) applyOps([{ op: 'update', entity: 'deals', id, data: { stage } }], { actor: user.id, via: 'ui' });
  };
  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>New deal</button>
      </div>
      {view === 'table' ? (
        <DataTable db={db} entity="deals" rows={deals} columns={LIST_COLUMNS.deals} open={open} />
      ) : (
        <div className="board">
          {STAGES.map((s) => {
            const col = deals.filter((d) => d.stage === s);
            return (
              <div key={s} className="col" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) move(dragId, s); setDragId(null); }}>
                <div className="col-head">
                  <span className={'pill stage-' + s.toLowerCase()}>{s}</span>
                  <span className="tiny muted">{col.length} - {fmtMoney(col.reduce((a, d) => a + (Number(d.amount) || 0), 0))}</span>
                </div>
                {col.map((d) => (
                  <div key={d.id} className="deal-card" draggable onDragStart={() => setDragId(d.id)} onClick={() => open('deals', d.id)}>
                    <div className="strong">{d.name}</div>
                    <div className="tiny muted">{recordTitle('companies', byId(db, 'companies', d.companyId))}</div>
                    <div className="row between tiny">
                      <span>{fmtMoney(d.amount)}</span>
                      <span className="muted">{fmtDate(d.closeDate)}</span>
                    </div>
                    <select className="stage-select" value={d.stage} onClick={(e) => e.stopPropagation()} onChange={(e) => move(d.id, e.target.value)} aria-label="Change stage">
                      {STAGES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <p className="tiny muted">Drag cards between columns (desktop) or use the stage picker on each card. Stage probabilities: {STAGES.map((s) => `${s} ${STAGE_PROBABILITY[s]}%`).join(', ')}.</p>
      {creating && (
        <Modal title="New deal" onClose={() => setCreating(false)}>
          <RecordForm db={db} user={user} entity="deals" defaults={{ closeDate: todayISO(45) }} onDone={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Knowledge graph
export function GraphPage({ db, open }) {
  const [types, setTypes] = useState(['companies', 'contacts', 'deals', 'users']);
  const [focus, setFocus] = useState(() => {
    try { const f = sessionStorage.getItem('graph-focus'); sessionStorage.removeItem('graph-focus'); return f; } catch { return null; }
  });
  const [q, setQ] = useState('');
  const W = 1100, H = 760;
  const effectiveTypes = useMemo(() => {
    const t = [...types];
    if (focus) { const e = focus.split(':')[0]; if (!t.includes(e)) t.push(e); }
    return t;
  }, [types, focus]);
  const graph = useMemo(() => buildGraph(db, effectiveTypes), [db, effectiveTypes]);
  const pos = useMemo(() => layout(graph.nodes, graph.edges, W, H), [graph]);
  const idx = useMemo(() => new Map(graph.nodes.map((n, i) => [n.key, i])), [graph]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef(null);

  const focusSet = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of graph.edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [focus, graph]);
  const matches = q ? new Set(graph.nodes.filter((n) => n.title.toLowerCase().includes(q.toLowerCase())).map((n) => n.key)) : null;
  const fNode = focus && graph.nodes[idx.get(focus)];

  const onWheel = (e) => {
    const k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };
  return (
    <div className="stack">
      <div className="toolbar wrap">
        {Object.entries(NODE_TYPES).map(([t, m]) => (
          <label key={t} className="chk">
            <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes((s) => (e.target.checked ? [...s, t] : s.filter((x) => x !== t)))} />
            <span className="dot" style={{ background: m.color }} />{m.plural || m.label + 's'}
          </label>
        ))}
        <input className="search" placeholder="Highlight..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm" onClick={() => setView({ x: 0, y: 0, k: 1 })}>Reset view</button>
      </div>
      <div className="graph-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="graph"
          onWheel={onWheel}
          onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }}
          onMouseMove={(e) => { if (drag.current) setView((v) => ({ ...v, x: drag.current.vx + (e.clientX - drag.current.x) / v.k, y: drag.current.vy + (e.clientY - drag.current.y) / v.k })); }}
          onMouseUp={() => { drag.current = null; }}
          onMouseLeave={() => { drag.current = null; }}
        >
          <g transform={`translate(${W / 2} ${H / 2}) scale(${view.k}) translate(${-W / 2 + view.x} ${-H / 2 + view.y})`}>
            {graph.edges.map((e, i) => {
              const a = pos[idx.get(e.source)], b = pos[idx.get(e.target)];
              const dim = focusSet && !(focusSet.has(e.source) && focusSet.has(e.target) && (e.source === focus || e.target === focus));
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={'edge' + (dim ? ' dim' : '')} />;
            })}
            {graph.nodes.map((n, i) => {
              const p = pos[i];
              const dim = (focusSet && !focusSet.has(n.key)) || (matches && !matches.has(n.key));
              const r = n.entity === 'companies' ? 11 : n.entity === 'deals' ? 8 + Math.min(8, (Number(n.rec.amount) || 0) / 100000) : n.entity === 'users' ? 10 : 6;
              return (
                <g key={n.key} className={'node' + (dim ? ' dim' : '') + (focus === n.key ? ' focus' : '')} transform={`translate(${p.x} ${p.y})`}
                  onClick={(e) => { e.stopPropagation(); setFocus(focus === n.key ? null : n.key); }}>
                  <circle r={r} fill={NODE_TYPES[n.entity].color} />
                  {(n.entity === 'companies' || n.entity === 'users' || focusSet?.has(n.key) || matches?.has(n.key)) && (
                    <text y={-r - 4} textAnchor="middle">{n.title.length > 28 ? n.title.slice(0, 26) + '...' : n.title}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {fNode && (
          <div className="graph-panel">
            <div className="tiny muted">{NODE_TYPES[fNode.entity].label}</div>
            <div className="strong">{fNode.title}</div>
            <ul className="rel-list">
              {graph.edges.filter((e) => e.source === focus || e.target === focus).map((e, i) => {
                const other = graph.nodes[idx.get(e.source === focus ? e.target : e.source)];
                return (
                  <li key={i}>
                    <span className="dot" style={{ background: NODE_TYPES[other.entity].color }} />
                    <button className="link" onClick={() => setFocus(other.key)}>{other.title}</button>
                    <span className="tiny muted"> {e.source === focus ? e.rel : e.rel + ' (in)'}</span>
                  </li>
                );
              })}
            </ul>
            {fNode.entity !== 'users' && <button className="btn sm" onClick={() => open(fNode.entity, fNode.id)}>Open record</button>}
          </div>
        )}
      </div>
      <p className="tiny muted">The graph is a read model built live from the CRM records. Click a node to focus its neighborhood, scroll to zoom, drag to pan. {graph.nodes.length} nodes, {graph.edges.length} edges.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Copilot
const SUGGESTIONS = [
  'Pipeline summary',
  'Open BFSI deals over 100k',
  'Overdue tasks',
  'Who is at Northwind Bank?',
  'History of Northwind core banking',
  'Move Lumen Capital mobile banking to won',
  'Create task send pricing for Bluepeak claims due tomorrow',
];

export function CopilotPage({ db, user, open }) {
  const ai = getAISettings();
  const useClaude = !!ai.apiKey;
  const [chat, setChat] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('copilot-chat') || '[]'); } catch { return []; }
  });
  const [apiMessages, setApiMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('copilot-api') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const endRef = useRef(null);
  useEffect(() => {
    try { sessionStorage.setItem('copilot-chat', JSON.stringify(chat.slice(-60))); sessionStorage.setItem('copilot-api', JSON.stringify(apiMessages.slice(-60))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, apiMessages, liveSteps]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    setChat((c) => [...c, { role: 'user', text: msg }]);
    setBusy(true);
    try {
      if (useClaude) {
        setLiveSteps([]);
        // keep history bounded and starting on a plain user turn
        let hist = apiMessages;
        while (hist.length > 40) {
          const i = hist.findIndex((m, j) => j > 0 && m.role === 'user' && typeof m.content === 'string');
          if (i < 0) break;
          hist = hist.slice(i);
        }
        const res = await runClaude({ apiMessages: [...hist, { role: 'user', content: msg }], user, settings: ai, onStep: (s) => setLiveSteps((x) => [...x, s]) });
        setApiMessages(res.messages);
        setChat((c) => [...c, { role: 'assistant', text: res.text || '(no answer)', steps: res.steps.map((s) => ({ tool: s.tool, ok: s.ok, error: s.error, proposal: s.tool === 'propose_changes' ? s.result?.proposal_id : null })) }]);
      } else {
        const res = runLocal(msg, user);
        setChat((c) => [...c, { role: 'assistant', ...res }]);
      }
    } catch (e) {
      setChat((c) => [...c, { role: 'assistant', text: 'Error: ' + (e?.message || String(e)), error: true }]);
    } finally {
      setBusy(false);
      setLiveSteps([]);
    }
  };

  const proposalStatus = (id) => db.proposals.find((p) => p.id === id);

  return (
    <div className="copilot">
      <div className="copilot-head">
        <span className={'pill ' + (useClaude ? 'ai' : '')}>{useClaude ? `Claude (${ai.model})` : 'Built-in assistant (offline)'}</span>
        <span className="tiny muted">{useClaude ? 'Reads the CRM and knowledge graph with tools. Writes go to the approval queue.' : 'Add an Anthropic API key in Settings to enable the Claude copilot.'}</span>
        <div className="spacer" />
        {chat.length > 0 && <button className="btn ghost sm" onClick={() => { setChat([]); setApiMessages([]); }}>New chat</button>}
      </div>
      <div className="chat">
        {!chat.length && (
          <div className="empty">
            <h3>Ask your CRM anything</h3>
            <p className="muted">Query records, traverse relationships, and request changes in plain language. Every change is proposed, approved by a human, applied through the CRM API and written to the audit log.</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={'msg ' + m.role + (m.error ? ' err' : '')}>
            {m.steps?.length > 0 && (
              <div className="steps">{m.steps.map((s, j) => <span key={j} className={'step' + (s.ok ? '' : ' bad')}>{s.tool.replace(/_/g, ' ')}</span>)}</div>
            )}
            <div className="msg-text">{m.text}</div>
            {m.table && m.table.rows.length > 0 && (
              <div className="table-wrap">
                <table className="table compact">
                  <thead><tr>{(m.table.entity ? ['title', ...m.table.columns] : m.table.columns).map((c) => <th key={c}>{c === 'title' ? 'Name' : c.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())}</th>)}</tr></thead>
                  <tbody>
                    {m.table.rows.map((r, j) => (
                      <tr key={j} onClick={() => (m.table.entity ? open(m.table.entity, r.id) : r._entity && open(r._entity, r.id))}>
                        {(m.table.entity ? ['title', ...m.table.columns] : m.table.columns).map((c) => <td key={c}>{r[c] ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {[m.proposalId, ...(m.steps || []).map((s) => s.proposal)].filter(Boolean).map((pid) => {
              const p = proposalStatus(pid);
              if (!p) return null;
              return (
                <div key={pid} className="proposal-inline">
                  <span className={'pill st-' + p.status}>{p.status}</span> {p.summary}
                  {p.status === 'pending' && (
                    <span className="row">
                      <button className="btn sm primary" onClick={() => decideProposal(pid, true, user.id)}>Approve</button>
                      <button className="btn sm" onClick={() => decideProposal(pid, false, user.id)}>Reject</button>
                    </span>
                  )}
                  {p.error && <div className="error tiny">{p.error}</div>}
                </div>
              );
            })}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="steps">{liveSteps.map((s, j) => <span key={j} className={'step' + (s.ok ? '' : ' bad')}>{s.tool.replace(/_/g, ' ')}</span>)}</div>
            <div className="typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea rows={2} placeholder="Ask a question or request a change..." value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Approvals
function OpView({ db, op }) {
  const sch = SCHEMA[op.entity];
  const rec = op.id ? byId(db, op.entity, op.id) : null;
  const fmt = (k, v) => {
    const f = sch?.fields.find((x) => x.key === k);
    if (!f) return String(v);
    if (f.type === 'ref') return recordTitle(f.ref, byId(db, f.ref, v)) || v;
    if (f.type === 'user') return userName(db, v) || v;
    return String(v ?? '');
  };
  return (
    <div className="op">
      <span className={'pill op-' + op.op}>{op.op}</span> {sch?.singular || op.entity}{' '}
      {rec && <span className="strong">{recordTitle(op.entity, rec)}</span>}
      {op.data && (
        <ul>
          {Object.entries(op.data).map(([k, v]) => (
            <li key={k} className="tiny">
              {k}: {rec && op.op === 'update' ? <><span className="muted strike">{fmt(k, rec[k]) || '-'}</span> {'->'} </> : null}<span className="strong">{fmt(k, v) || '-'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ApprovalsPage({ db, user }) {
  const [tab, setTab] = useState('pending');
  const list = db.proposals.filter((p) => (tab === 'pending' ? p.status === 'pending' : p.status !== 'pending'));
  return (
    <div className="stack">
      <div className="callout">
        Guardrails: AI never writes to records directly. It proposes operations, a person approves them here, and only then are they applied through the same validated CRM API used by the UI. Deletes and bulk changes (more than 3 operations) always need approval.
        {db.settings.autoApproveSafe ? ' Small non-destructive changes are currently auto-approved (Settings).' : ''}
      </div>
      <div className="seg">
        <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>Pending ({db.proposals.filter((p) => p.status === 'pending').length})</button>
        <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Decided</button>
      </div>
      {!list.length && <p className="muted">{tab === 'pending' ? 'No changes waiting for approval. Ask the AI Copilot to change something.' : 'No decisions yet.'}</p>}
      {list.map((p) => (
        <div key={p.id} className="card">
          <div className="row between">
            <div>
              <div className="strong">{p.summary}</div>
              <div className="tiny muted">Requested by {userName(db, p.requestedBy)} via {p.source} - {fmtDateTime(p.ts)}</div>
            </div>
            <span className={'pill st-' + p.status}>{p.status}</span>
          </div>
          {p.ops.map((op, i) => <OpView key={i} db={db} op={op} />)}
          {p.error && <div className="error tiny">{p.error}</div>}
          {p.status === 'pending' ? (
            <div className="row end">
              <button className="btn" onClick={() => decideProposal(p.id, false, user.id)}>Reject</button>
              <button className="btn primary" onClick={() => decideProposal(p.id, true, user.id)} disabled={!!p.error}>Approve and apply</button>
            </div>
          ) : (
            <div className="tiny muted">{p.status} by {userName(db, p.decidedBy)} {fmtDateTime(p.decidedAt)} {p.reason}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Audit log
export function AuditPage({ db, open }) {
  const [via, setVia] = useState('');
  const [ent, setEnt] = useState('');
  const rows = [...db.history].reverse().filter((h) => (!via || h.via === via) && (!ent || h.entity === ent)).slice(0, 300);
  return (
    <div className="stack">
      <div className="toolbar">
        <select value={via} onChange={(e) => setVia(e.target.value)}>
          <option value="">All sources</option><option value="ui">UI</option><option value="ai">AI (approved)</option><option value="import">Import</option>
        </select>
        <select value={ent} onChange={(e) => setEnt(e.target.value)}>
          <option value="">All records</option>
          {Object.entries(SCHEMA).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <span className="tiny muted">Showing {rows.length} of {db.history.length} changes. History doubles as the temporal model: every record can be viewed as of any past change.</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Source</th><th>Action</th><th>Record</th><th>Changes</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} onClick={() => open(h.entity, h.entityId)}>
                <td className="nowrap">{fmtDateTime(h.ts)}</td>
                <td>{h.actorName}</td>
                <td>{h.via === 'ai' ? <span className="pill ai">AI</span> : h.via}</td>
                <td>{h.action}</td>
                <td>{SCHEMA[h.entity].singular}: <span className="strong">{recordTitle(h.entity, h.after || h.before)}</span></td>
                <td className="tiny">{h.changes?.map(changeText).join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Connectors
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function toCSV(db, entity) {
  const sch = SCHEMA[entity];
  const cols = ['id', ...sch.fields.map((f) => f.key)];
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...db[entity].map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ConnectorsPage({ db, user }) {
  const conn = db.connectors;
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState('*');
  const [slackUrl, setSlackUrl] = useState(conn.slack?.url || '');
  const [importEntity, setImportEntity] = useState('companies');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const addHook = () => {
    if (!/^https?:\/\//.test(hookUrl)) return setMsg('Webhook URL must start with http(s)://');
    updateConnectors({ webhooks: [...(conn.webhooks || []), { id: 'wh_' + uid(), url: hookUrl, events: hookEvents || '*', enabled: true }] });
    setHookUrl('');
  };
  const importCSV = async (file) => {
    const rows = parseCSV(await file.text());
    if (rows.length < 2) return setMsg('CSV needs a header row and at least one data row.');
    const header = rows[0].map((h) => h.trim());
    const sch = SCHEMA[importEntity];
    const resolve = (f, v) => {
      if (!v) return '';
      if (f.type === 'ref') return getState()[f.ref].find((r) => r.id === v || recordTitle(f.ref, r).toLowerCase() === v.toLowerCase())?.id || '';
      if (f.type === 'user') return db.users.find((u) => u.id === v || u.name.toLowerCase() === v.toLowerCase() || u.email.toLowerCase() === v.toLowerCase())?.id || '';
      return v;
    };
    const ops = rows.slice(1).map((r) => {
      const data = {};
      header.forEach((h, i) => {
        const f = sch.fields.find((x) => x.key.toLowerCase() === h.toLowerCase() || x.label.toLowerCase() === h.toLowerCase());
        if (f) data[f.key] = resolve(f, (r[i] || '').trim());
      });
      return { op: 'create', entity: importEntity, data };
    });
    try {
      applyOps(ops, { actor: user.id, via: 'import' });
      setMsg(`Imported ${ops.length} ${sch.label.toLowerCase()}.`);
    } catch (e) {
      setMsg('Import failed (nothing was imported): ' + e.message);
    }
  };

  return (
    <div className="stack">
      {msg && <div className="callout" onClick={() => setMsg('')}>{msg}</div>}
      <div className="grid2">
        <div className="card">
          <h4>Outbound webhooks</h4>
          <p className="tiny muted">POST a JSON event to any URL when records change (works with Zapier, Make, Activepieces, n8n, or your own service). Events: company/contact/deal/task/note .created .updated .deleted, or * for all.</p>
          <div className="row wrap">
            <input placeholder="https://hooks.example.com/..." value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
            <input style={{ maxWidth: 160 }} placeholder="* or deal.updated" value={hookEvents} onChange={(e) => setHookEvents(e.target.value)} />
            <button className="btn primary" onClick={addHook}>Add</button>
          </div>
          <ul className="list">
            {(conn.webhooks || []).map((w) => (
              <li key={w.id} className="row between wrap">
                <div><div className="strong break">{w.url}</div><div className="tiny muted">events: {w.events}</div></div>
                <div className="row">
                  <label className="chk"><input type="checkbox" checked={w.enabled} onChange={(e) => updateConnectors({ webhooks: conn.webhooks.map((x) => (x.id === w.id ? { ...x, enabled: e.target.checked } : x)) })} />on</label>
                  <button className="btn sm" onClick={async () => setMsg('Test: ' + (await testWebhook(w.url)))}>Test</button>
                  <button className="btn sm danger" onClick={() => updateConnectors({ webhooks: conn.webhooks.filter((x) => x.id !== w.id) })}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h4>Slack</h4>
          <p className="tiny muted">Paste a Slack incoming-webhook URL to get notified about deal stage changes and AI proposals.</p>
          <div className="row wrap">
            <input placeholder="https://hooks.slack.com/services/..." value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} />
            <button className="btn primary" onClick={() => { updateConnectors({ slack: { url: slackUrl, enabled: !!slackUrl } }); setMsg(slackUrl ? 'Slack connected.' : 'Slack disconnected.'); }}>Save</button>
            <button className="btn" disabled={!conn.slack?.enabled} onClick={() => { notifySlack(`Test message from ${APP_NAME}`); setMsg('Test message sent to Slack.'); }}>Test</button>
          </div>
          <div className="tiny muted">Status: {conn.slack?.enabled ? 'connected' : 'not connected'}</div>
        </div>

        <div className="card">
          <h4>CSV import / export</h4>
          <p className="tiny muted">Import uses column headers matching field names or labels (e.g. name, industry, city, Company, Owner). References can be given by name.</p>
          <div className="row wrap">
            <select value={importEntity} onChange={(e) => setImportEntity(e.target.value)}>
              {['companies', 'contacts', 'deals', 'tasks'].map((k) => <option key={k} value={k}>{SCHEMA[k].label}</option>)}
            </select>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Import CSV</button>
            <button className="btn" onClick={() => download(importEntity + '.csv', toCSV(db, importEntity))}>Export CSV</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ''; }} />
          </div>
        </div>

        <div className="card">
          <h4>AI agents and MCP</h4>
          <p className="tiny muted">The copilot uses these tools. Download the manifest to wire the same contract into an external agent (Claude Agent SDK, LangGraph, or an MCP server in front of a hosted backend).</p>
          <ul className="tiny">
            <li><b>search_records</b>, <b>get_record</b>, <b>graph_neighbors</b>, <b>pipeline_summary</b>: read the system of record and the graph</li>
            <li><b>propose_changes</b>: write path, always through human approval</li>
          </ul>
          <button className="btn" onClick={() => download(`${APP_SLUG}-tools.json`, JSON.stringify({ name: APP_SLUG, tools: TOOL_DEFS, schema: Object.fromEntries(Object.entries(SCHEMA).map(([k, s]) => [k, s.fields])) }, null, 2), 'application/json')}>Download tool manifest</button>
        </div>
      </div>

      <div className="card">
        <h4>Recent deliveries</h4>
        <ul className="list">
          {(conn.deliveries || []).slice(0, 15).map((d) => (
            <li key={d.id} className="tiny"><span className="muted">{fmtDateTime(d.ts)}</span> {d.event} {'->'} <span className="break">{d.target}</span>: {d.status}</li>
          ))}
          {!(conn.deliveries || []).length && <li className="muted tiny">No deliveries yet.</li>}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings
export function SettingsPage({ db, user }) {
  const [ai, setAi] = useState(getAISettings());
  const [saved, setSaved] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [err, setErr] = useState('');
  const restoreRef = useRef(null);
  const isAdmin = user.role === 'admin';
  const flash = (t) => { setSaved(t); setTimeout(() => setSaved(''), 2500); };

  return (
    <div className="stack">
      {saved && <div className="callout ok">{saved}</div>}
      <div className="grid2">
        <div className="card">
          <h4>AI copilot (Claude)</h4>
          <p className="tiny muted">Paste an Anthropic API key from console.anthropic.com to enable the Claude copilot. The key is stored only in this browser and is sent only to api.anthropic.com. Without a key, the built-in offline assistant is used.</p>
          <label>API key<input type="password" placeholder="sk-ant-..." value={ai.apiKey} onChange={(e) => setAi({ ...ai, apiKey: e.target.value.trim() })} /></label>
          <div className="row wrap">
            <label>Model
              <select value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })}>
                <option value="claude-opus-5-5">Claude Opus 5.5 (default)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
                <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
              </select>
            </label>
            <label>Effort
              <select value={ai.effort} onChange={(e) => setAi({ ...ai, effort: e.target.value })}>
                {['low', 'medium', 'high'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => { saveAISettings(ai); flash('AI settings saved.'); }}>Save</button>
            {ai.apiKey && <button className="btn" onClick={() => { const n = { ...ai, apiKey: '' }; setAi(n); saveAISettings(n); flash('API key removed.'); }}>Remove key</button>}
          </div>
        </div>

        <div className="card">
          <h4>Guardrails and workspace</h4>
          <label>Workspace / company name (used in AI deliverables)<input defaultValue={db.settings.orgName} onBlur={(e) => updateSettings({ orgName: e.target.value || 'My workspace' })} disabled={!isAdmin} /></label>
          <label className="chk">
            <input type="checkbox" checked={!!db.settings.autoApproveSafe} disabled={!isAdmin} onChange={(e) => updateSettings({ autoApproveSafe: e.target.checked })} />
            Auto-approve small AI changes (up to 3 operations, no deletes)
          </label>
          <p className="tiny muted">Deletes and bulk changes always require a human approval.</p>
        </div>

        <div className="card">
          <h4>Change my password</h4>
          <input type="password" placeholder="New password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
          <input type="password" placeholder="Repeat new password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
          {err && <div className="error">{err}</div>}
          <button className="btn primary" onClick={async () => {
            setErr('');
            if (pw.a.length < 8) return setErr('Use at least 8 characters.');
            if (pw.a !== pw.b) return setErr('Passwords do not match.');
            await upsertUser({ ...user, password: pw.a });
            setPw({ a: '', b: '' });
            flash('Password changed.');
          }}>Update password</button>
        </div>

        <div className="card">
          <h4>Backup and restore</h4>
          <p className="tiny muted">Data is stored in this browser. Download a backup to keep it safe or to move it to another device or browser. The API key is never included.</p>
          <div className="row wrap">
            <button className="btn" onClick={() => download(`${APP_SLUG}-backup-` + todayISO() + '.json', JSON.stringify(db, null, 2), 'application/json')}>Download backup</button>
            {isAdmin && <button className="btn" onClick={() => restoreRef.current?.click()}>Restore backup</button>}
            {isAdmin && <button className="btn danger" onClick={async () => { if (confirm('Replace all CRM data with the demo data? Users and connectors are kept.')) { await resetDB(); flash('Demo data restored.'); } }}>Reset to demo data</button>}
            <input ref={restoreRef} type="file" accept="application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { replaceDB(JSON.parse(await f.text())); flash('Backup restored.'); } catch (ex) { alert(ex.message); }
            }} />
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="row between">
            <h4>Users</h4>
            <button className="btn primary sm" onClick={() => setEditUser({ name: '', email: '', role: 'member', password: '' })}>Add user</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
              <tbody>
                {db.users.map((u) => (
                  <tr key={u.id}>
                    <td className="strong">{u.name}</td><td>{u.email}</td><td>{u.role}</td>
                    <td className="row end">
                      <button className="btn sm" onClick={() => setEditUser({ ...u, password: '' })}>Edit</button>
                      {u.id !== user.id && <button className="btn sm danger" onClick={() => confirm('Remove ' + u.name + '?') && deleteUser(u.id)}>Remove</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editUser && <UserModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}

function UserModal({ user, onClose }) {
  const [v, setV] = useState(user);
  const [err, setErr] = useState('');
  return (
    <Modal title={user.id ? 'Edit user' : 'Add user'} onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        try { await upsertUser(v); onClose(); } catch (ex) { setErr(ex.message); }
      }}>
        <label>Name<input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label>Email<input required type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
        <label>Role<select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}><option value="member">member</option><option value="admin">admin</option></select></label>
        <label>{user.id ? 'New password (leave blank to keep)' : 'Password'}<input type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} minLength={user.id && !v.password ? 0 : 8} /></label>
        {err && <div className="error">{err}</div>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- AI deliverables
export function DeliverablesPage({ db, useAI, open }) {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const list = (db.deliverables || []).filter((d) => (!kind || d.kind === kind) && (!q || (d.title + ' ' + d.content).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack">
      <div className="toolbar">
        <input className="search" placeholder="Search deliverables..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="tiny muted">{list.length} file(s)</span>
      </div>
      {!list.length && (
        <div className="card">
          <h4>No AI deliverables yet</h4>
          <p className="muted">Open <a href="#/tasks">Tasks</a> and press <b>Use AI</b> on any task. The AI reads the task, deal, company, contact, notes and earlier versions, then produces the finished proposal, email or deck. Everything it creates is saved here.</p>
        </div>
      )}
      <div className="deliv-grid">
        {list.map((d) => {
          const task = byId(db, 'tasks', d.taskId);
          return (
            <div key={d.id} className="card deliv-card">
              <div className="file-row">
                <div className={'file-icon k-' + d.kind}>{d.kind === 'deck' ? 'PPT' : d.kind === 'email' ? 'MAIL' : 'DOC'}</div>
                <div className="min0">
                  <div className="strong clamp">{d.title}</div>
                  <div className="tiny muted">v{d.version} - {fmtDateTime(d.createdAt)} - {d.model === 'template' ? 'template' : d.model}</div>
                </div>
              </div>
              <div className="tiny muted clamp">Task: {task ? task.title : '(deleted task)'}{d.dealId ? ' - ' + recordTitle('deals', byId(db, 'deals', d.dealId)) : ''}</div>
              <div className="row">
                <button className="btn sm" onClick={() => setPreview(d)}>Preview</button>
                {task && <button className="btn sm primary" onClick={() => useAI(d.taskId, d.id, false)}>Open workspace</button>}
                {d.dealId && <button className="btn sm ghost" onClick={() => open('deals', d.dealId)}>Deal</button>}
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <Modal title={preview.title + ' v' + preview.version} onClose={() => setPreview(null)} wide>
          <div className="ws-output"><DeliverablePreview kind={preview.kind} content={preview.content} /></div>
        </Modal>
      )}
    </div>
  );
}
