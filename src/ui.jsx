import { useMemo, useState } from 'react';
import { SCHEMA, recordTitle, fmtMoney, fmtDate, fmtDateTime, todayISO } from './schema.js';
import { applyOps, byId, userName, recordAsOf } from './store.js';
import { neighbors, NODE_TYPES } from './graph.js';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FieldValue({ db, field, value, open }) {
  if (value === undefined || value === null || value === '') return <span className="muted">-</span>;
  if (field.type === 'ref') {
    const r = byId(db, field.ref, value);
    if (!r) return <span className="muted">(missing)</span>;
    return <button className="link" onClick={() => open?.(field.ref, value)}>{recordTitle(field.ref, r)}</button>;
  }
  if (field.type === 'user') return <span>{userName(db, value)}</span>;
  if (field.key === 'amount') return <span>{fmtMoney(value)}</span>;
  if (field.type === 'date') {
    const overdue = field.key === 'dueDate' && value < todayISO();
    return <span className={overdue ? 'danger-text' : ''}>{fmtDate(value)}</span>;
  }
  if (field.key === 'stage') return <span className={'pill stage-' + value.toLowerCase()}>{value}</span>;
  if (field.key === 'status') return <span className={'pill ' + (value === 'Done' ? 'ok' : '')}>{value}</span>;
  if (field.key === 'priority') return <span className={'pill pri-' + value.toLowerCase()}>{value}</span>;
  if (field.key === 'website') return <span>{value}</span>;
  if (field.type === 'email') return <a href={'mailto:' + value}>{value}</a>;
  return <span>{String(value)}</span>;
}

export function RecordForm({ db, user, entity, record, defaults, onDone }) {
  const sch = SCHEMA[entity];
  const [vals, setVals] = useState(() => {
    const v = {};
    for (const f of sch.fields) v[f.key] = record?.[f.key] ?? defaults?.[f.key] ?? (f.type === 'user' ? user.id : f.key === 'stage' ? 'Lead' : f.key === 'status' ? 'Open' : f.key === 'priority' ? 'Medium' : '');
    return v;
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    try {
      const data = { ...vals };
      if (record) {
        for (const k of Object.keys(data)) if ((data[k] ?? '') === (record[k] ?? '')) delete data[k];
        if (Object.keys(data).length) applyOps([{ op: 'update', entity, id: record.id, data }], { actor: user.id, via: 'ui' });
      } else {
        applyOps([{ op: 'create', entity, data }], { actor: user.id, via: 'ui' });
      }
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="form-grid">
        {sch.fields.map((f) => (
          <label key={f.key} className={f.type === 'textarea' ? 'span2' : ''}>
            {f.label}{f.required && ' *'}
            {f.type === 'select' ? (
              <select value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                {!f.required && <option value="">-</option>}
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : f.type === 'ref' ? (
              <select value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">-</option>
                {db[f.ref].map((r) => <option key={r.id} value={r.id}>{recordTitle(f.ref, r)}</option>)}
              </select>
            ) : f.type === 'user' ? (
              <select value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">-</option>
                {db.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows={4} value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'} value={vals[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      {err && <div className="error">{err}</div>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn primary">{record ? 'Save changes' : 'Create ' + sch.singular.toLowerCase()}</button>
      </div>
    </form>
  );
}

export function changeText(c) {
  const f = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
  return `${c.field}: ${f(c.from)} -> ${f(c.to)}`;
}

export function RecordDrawer({ db, user, entity, id, onClose, open, useAI }) {
  const sch = SCHEMA[entity];
  const live = byId(db, entity, id);
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const hist = useMemo(() => db.history.filter((h) => h.entity === entity && h.entityId === id), [db.history, entity, id]);
  const times = hist.map((h) => h.ts);
  const [asOfIdx, setAsOfIdx] = useState(null); // null = now
  const asOfTs = asOfIdx === null ? null : times[asOfIdx];
  const rec = asOfTs ? recordAsOf(db, entity, id, asOfTs) : live;
  const related = useMemo(() => {
    try { return neighbors(db, entity, id, 1); } catch { return []; }
  }, [db, entity, id]);

  if (!live && !hist.length) return null;
  if (!sch) return null;

  const del = () => {
    if (!confirm(`Delete this ${sch.singular.toLowerCase()}? This is recorded in the audit log.`)) return;
    applyOps([{ op: 'delete', entity, id }], { actor: user.id, via: 'ui' });
    onClose();
  };
  const addNote = () => {
    if (!noteText.trim()) return;
    const data = { body: noteText.trim() };
    if (entity === 'deals') Object.assign(data, { dealId: id, companyId: live.companyId || '' });
    if (entity === 'contacts') Object.assign(data, { contactId: id, companyId: live.companyId || '' });
    if (entity === 'companies') data.companyId = id;
    applyOps([{ op: 'create', entity: 'notes', data }], { actor: user.id, via: 'ui' });
    setNoteText('');
  };
  const notes = related.filter((r) => r.entity === 'notes').map((r) => byId(db, 'notes', r.id)).filter(Boolean);

  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <div className="modal-head">
          <div>
            <div className="tiny muted">{sch.singular}</div>
            <h3>{recordTitle(entity, rec || hist[hist.length - 1]?.before)}</h3>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        {editing && live ? (
          <RecordForm db={db} user={user} entity={entity} record={live} onDone={() => setEditing(false)} />
        ) : (
          <>
            {times.length > 1 && (
              <div className="asof">
                <div className="row between">
                  <span className="tiny">Time travel: {asOfTs ? 'as of ' + fmtDateTime(asOfTs) : 'current state'}</span>
                  {asOfIdx !== null && <button className="link tiny" onClick={() => setAsOfIdx(null)}>Back to now</button>}
                </div>
                <input type="range" min={0} max={times.length} value={asOfIdx === null ? times.length : asOfIdx} onChange={(e) => setAsOfIdx(Number(e.target.value) === times.length ? null : Number(e.target.value))} />
              </div>
            )}
            {!rec ? (
              <p className="muted">{asOfTs ? 'This record did not exist at that time.' : 'This record has been deleted.'}</p>
            ) : (
              <dl className="fields">
                {sch.fields.map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd><FieldValue db={db} field={f} value={rec[f.key]} open={open} /></dd>
                  </div>
                ))}
              </dl>
            )}
            {live && !asOfTs && (
              <div className="row">
                <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                {entity === 'tasks' && <button className="btn primary" onClick={() => useAI(id, null, !(db.deliverables || []).some((d) => d.taskId === id))}>Use AI</button>}
                {entity === 'tasks' && live.status !== 'Done' && (
                  <button className="btn" onClick={() => applyOps([{ op: 'update', entity, id, data: { status: 'Done' } }], { actor: user.id, via: 'ui' })}>Mark done</button>
                )}
                <a className="btn" href="#/graph" onClick={() => sessionStorage.setItem('graph-focus', entity + ':' + id)}>Show in graph</a>
                <button className="btn danger" onClick={del}>Delete</button>
              </div>
            )}
          </>
        )}

        {(() => {
          const ds = (db.deliverables || []).filter((d) => (entity === 'tasks' ? d.taskId === id : entity === 'deals' ? d.dealId === id : entity === 'companies' ? d.companyId === id : entity === 'contacts' ? d.contactId === id : false));
          if (!ds.length) return null;
          return (
            <section>
              <h4>AI deliverables</h4>
              <ul className="rel-list">
                {ds.map((d) => (
                  <li key={d.id}>
                    <span className={'mini-icon k-' + d.kind}>{d.kind === 'deck' ? 'PPT' : d.kind === 'email' ? 'MAIL' : 'DOC'}</span>
                    <button className="link" onClick={() => useAI(d.taskId, d.id, false)}>{d.title} v{d.version}</button>
                    <span className="tiny muted">{fmtDateTime(d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        {live && ['deals', 'contacts', 'companies'].includes(entity) && (
          <section>
            <h4>Notes</h4>
            <div className="note-add">
              <textarea rows={2} placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} />
              <button className="btn sm" onClick={addNote}>Add</button>
            </div>
            {notes.map((n) => (
              <div key={n.id} className="note">
                <div>{n.body}</div>
                <div className="tiny muted">{userName(db, n.authorId)} - {fmtDateTime(n.createdAt)}</div>
              </div>
            ))}
          </section>
        )}

        {related.filter((r) => r.entity !== 'notes').length > 0 && (
          <section>
            <h4>Connected in the knowledge graph</h4>
            <ul className="rel-list">
              {related.filter((r) => r.entity !== 'notes').map((r) => (
                <li key={r.entity + r.id}>
                  <span className="dot" style={{ background: NODE_TYPES[r.entity].color }} />
                  {r.entity === 'users' ? <span>{r.title}</span> : <button className="link" onClick={() => open(r.entity, r.id)}>{r.title}</button>}
                  <span className="tiny muted"> {r.relation}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4>Timeline</h4>
          <ul className="timeline">
            {[...hist].reverse().map((h) => (
              <li key={h.id}>
                <div className="tiny muted">{fmtDateTime(h.ts)} - {h.actorName} via {h.via}</div>
                <div>{h.action === 'update' ? h.changes.map(changeText).join('; ') : h.action === 'create' ? 'Created' : 'Deleted'}</div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

export function DataTable({ db, entity, rows, columns, open, extra }) {
  const sch = SCHEMA[entity];
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const f = sch.fields.find((x) => x.key === sort.key);
    const val = (r) => {
      const v = r[sort.key];
      if (f?.type === 'ref') return recordTitle(f.ref, byId(db, f.ref, v)).toLowerCase();
      if (f?.type === 'user') return userName(db, v).toLowerCase();
      if (f?.type === 'number') return Number(v) || 0;
      return String(v ?? '').toLowerCase();
    };
    return [...rows].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, sort, db, sch]);
  const cols = columns.map((k) => sch.fields.find((f) => f.key === k));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {cols.map((f) => (
              <th key={f.key} onClick={() => setSort((s) => ({ key: f.key, dir: s.key === f.key ? -s.dir : 1 }))}>
                {f.label}{sort.key === f.key ? (sort.dir > 0 ? ' ^' : ' v') : ''}
              </th>
            ))}
            {extra && <th className="ai-col">{extra.label}</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} onClick={() => open(entity, r.id)}>
              {cols.map((f, i) => (
                <td key={f.key} className={i === 0 ? 'strong' : ''}>
                  {i === 0 && f.key === 'firstName' ? recordTitle(entity, r) : <FieldValue db={db} field={f} value={r[f.key]} />}
                </td>
              ))}
              {extra && <td className="ai-col">{extra.render(r)}</td>}
            </tr>
          ))}
          {!sorted.length && (
            <tr><td colSpan={cols.length + (extra ? 1 : 0)} className="muted center">No records</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
