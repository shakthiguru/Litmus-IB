import { useEffect, useMemo, useRef, useState } from 'react';
import { recordTitle, fmtDateTime, todayISO } from './schema.js';
import { applyOps, byId, userName, getAISettings } from './store.js';
import { KINDS, detectKind, defaultInstruction, taskContext, startJob, cancelJob, useJobs, readAttachment, deleteDeliverable, updateDeliverableContent } from './agent.js';
import { mdToHtml, docHtml, deckHtml, parseDeck } from './markdown.js';

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function splitEmail(text) {
  const m = text.match(/^\s*subject:\s*(.*)\n?/i);
  return m ? { subject: m[1].trim(), body: text.slice(m[0].length).trim() } : { subject: '', body: text };
}

export function DeliverablePreview({ kind, content, live }) {
  const [slide, setSlide] = useState(0);
  if (kind === 'deck') {
    const slides = parseDeck(content);
    const i = Math.min(slide, Math.max(slides.length - 1, 0));
    const s = slides[live ? slides.length - 1 : i];
    if (!s) return <div className="muted tiny">Building slides...</div>;
    return (
      <div className="deck-view">
        <div className={'slide-frame' + ((live ? slides.length - 1 : i) === 0 ? ' cover' : '')}>
          <h2>{s.title}</h2>
          <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(s.body) }} />
          {s.notes && <div className="slide-notes">Notes: {s.notes}</div>}
        </div>
        <div className="row between">
          <button className="btn sm" disabled={live || i === 0} onClick={() => setSlide(i - 1)}>Previous</button>
          <span className="tiny muted">Slide {(live ? slides.length - 1 : i) + 1} of {slides.length}</span>
          <button className="btn sm" disabled={live || i >= slides.length - 1} onClick={() => setSlide(i + 1)}>Next</button>
        </div>
        <div className="thumbs">
          {slides.map((x, j) => <button key={j} className={'thumb' + (j === i && !live ? ' on' : '')} onClick={() => setSlide(j)}>{j + 1}. {x.title}</button>)}
        </div>
      </div>
    );
  }
  if (kind === 'email') {
    const { subject, body } = splitEmail(content);
    return (
      <div className="email-view">
        <div className="email-subj"><span className="muted">Subject</span> {subject || '...'}</div>
        <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
      </div>
    );
  }
  return <div className="md doc-view" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;
}

export function AIWorkspace({ db, user, taskId, initialDeliverableId, autoRun, onClose, open }) {
  const task = byId(db, 'tasks', taskId);
  const jobs = useJobs();
  const job = jobs.get(taskId);
  const ctx = useMemo(() => (task ? taskContext(db, task) : null), [db, task]);
  const versions = useMemo(() => (db.deliverables || []).filter((d) => d.taskId === taskId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.deliverables, taskId]);
  const [selId, setSelId] = useState(initialDeliverableId || null);
  const sel = versions.find((v) => v.id === selId) || versions[0] || null;
  const [kind, setKind] = useState(() => sel?.kind || detectKind(task?.title));
  const [instruction, setInstruction] = useState(() => (task && ctx ? defaultInstruction(task, ctx, sel?.kind || detectKind(task.title)) : ''));
  const [attachments, setAttachments] = useState([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');
  const [showRequest, setShowRequest] = useState(!versions.length);
  const fileRef = useRef(null);
  const outRef = useRef(null);
  const ai = getAISettings();
  const running = job?.status === 'running';

  const run = (refine = null) => {
    setErr('');
    setEditing(false);
    setShowRequest(false);
    startJob({ task, kind, instruction, attachments, user, base: refine ? sel : null, refine });
  };

  useEffect(() => {
    if (autoRun && task && !running && !versions.length) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // when a job finishes, show its result
  useEffect(() => {
    if (job?.status === 'done' && job.deliverableId) setSelId(job.deliverableId);
  }, [job?.status, job?.deliverableId]);
  useEffect(() => {
    if (running && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [job?.text, running]);
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  if (!task) return null;
  const say = (t) => { setFlash(t); setTimeout(() => setFlash(''), 3000); };

  const addFiles = async (files) => {
    setErr('');
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) { setErr(`${f.name} is larger than 20 MB.`); continue; }
      try {
        const a = await readAttachment(f);
        if (a.kind !== 'text' && !ai.apiKey) { setErr(`${f.name}: PDFs and images need the Claude copilot (add an API key in Settings). Paste the text instead.`); continue; }
        setAttachments((s) => [...s, a]);
      } catch (e) { setErr(e.message); }
    }
  };

  const changeKind = (k) => {
    setKind(k);
    setInstruction(defaultInstruction(task, ctx, k));
  };

  const doneActions = {
    markDone: () => { applyOps([{ op: 'update', entity: 'tasks', id: task.id, data: { status: 'Done' } }], { actor: user.id, via: 'ui' }); say('Task marked as done.'); },
    logNote: () => {
      const data = { body: `AI deliverable created: "${sel.title}" (v${sel.version}) for task "${task.title}".` };
      if (task.dealId) data.dealId = task.dealId;
      if (ctx.company) data.companyId = ctx.company.id;
      if (ctx.contact) data.contactId = ctx.contact.id;
      applyOps([{ op: 'create', entity: 'notes', data }], { actor: user.id, via: 'ui' });
      say('Logged a note on the deal.');
    },
    followUp: () => {
      applyOps([{ op: 'create', entity: 'tasks', data: { title: `Follow up on ${sel.kind === 'deck' ? 'deck' : sel.kind === 'email' ? 'email' : 'document'}: ${sel.title.replace(/^Email:\s*/, '')}`.slice(0, 120), dueDate: todayISO(3), status: 'Open', priority: 'Medium', dealId: task.dealId || '', contactId: task.contactId || '', companyId: task.companyId || '', assigneeId: user.id } }], { actor: user.id, via: 'ui' });
      say('Follow-up task created for 3 days from now.');
    },
  };

  const exportAs = (fmt) => {
    const base = slug(sel.title) + '-v' + sel.version;
    if (fmt === 'md') return download(base + '.md', sel.content, 'text/markdown');
    if (sel.kind === 'deck') return download(base + '.html', deckHtml(sel.title, sel.content), 'text/html');
    if (fmt === 'doc') return download(base + '.doc', docHtml(sel.title, sel.content), 'application/msword');
    return download(base + '.html', docHtml(sel.title, sel.content), 'text/html');
  };

  const mailto = () => {
    const { subject, body } = splitEmail(sel.content);
    const to = ctx.contact?.email || '';
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\*\*/g, ''))}`;
  };

  const statusPill = running ? <span className="pill st-pending">Working</span>
    : job?.status === 'error' ? <span className="pill st-failed">Failed</span>
    : job?.status === 'cancelled' ? <span className="pill">Stopped</span>
    : sel ? <span className="pill st-applied">AI action completed</span>
    : <span className="pill">Not started</span>;

  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer workspace" aria-label="AI workspace">
        <div className="ws-head">
          <div className="ws-title">
            <div className="row"><span className="spark">AI</span><span className="tiny muted">Task workspace</span>{statusPill}</div>
            <h3>{task.title}</h3>
            <div className="ws-ctx">
              {ctx.deal && <button className="chip sm" onClick={() => open('deals', ctx.deal.id)}>Deal: {ctx.deal.name}</button>}
              {ctx.company && <button className="chip sm" onClick={() => open('companies', ctx.company.id)}>{ctx.company.name}</button>}
              {ctx.contact && <button className="chip sm" onClick={() => open('contacts', ctx.contact.id)}>{recordTitle('contacts', ctx.contact)}</button>}
              <span className="chip sm static">Due {task.dueDate}</span>
            </div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        {flash && <div className="callout ok">{flash}</div>}
        {err && <div className="error">{err}</div>}

        {/* ---------- request ---------- */}
        <section className="ws-card">
          <button className="ws-card-head" onClick={() => setShowRequest((s) => !s)}>
            <span className="strong">Request</span>
            <span className="tiny muted">{KINDS[kind].label} - {ai.apiKey ? `Claude ${ai.model}` : 'offline template mode'} {showRequest ? '(hide)' : '(edit)'}</span>
          </button>
          {showRequest && (
            <div className="stack-sm">
              <div className="seg">
                {Object.entries(KINDS).map(([k, v]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => changeKind(k)}>{v.label}</button>)}
              </div>
              <label>What should the AI produce?
                <textarea rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              </label>
              <div className="tiny muted">
                Context the AI will use: task, {ctx.deal ? 'deal, ' : ''}{ctx.company ? 'company, ' : ''}{ctx.contact ? 'contact, ' : ''}{ctx.notes.length} note(s), {ctx.otherTasks.length} related task(s){ctx.previous.length ? `, latest previous deliverable "${ctx.previous[0].title}" v${ctx.previous[0].version}` : ''}.
              </div>
              <div className="attach">
                {attachments.map((a, i) => (
                  <span key={i} className="chip sm static">{a.name} <button className="link tiny" onClick={() => setAttachments((s) => s.filter((_, j) => j !== i))}>remove</button></span>
                ))}
                <button className="btn sm" onClick={() => fileRef.current?.click()}>Attach files</button>
                <button className="btn sm" onClick={() => setPasteOpen((s) => !s)}>Paste email or text</button>
                <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.eml,.json,.html,image/*" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
              </div>
              {pasteOpen && (
                <div className="stack-sm">
                  <textarea rows={5} placeholder="Paste the client's latest email, the previous proposal, call notes..." value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                  <div className="row end">
                    <button className="btn sm primary" disabled={!pasteText.trim()} onClick={() => { setAttachments((s) => [...s, { name: `Pasted text ${s.length + 1}`, kind: 'text', text: pasteText }]); setPasteText(''); setPasteOpen(false); }}>Add as context</button>
                  </div>
                </div>
              )}
              <div className="row end">
                {running ? <button className="btn danger" onClick={() => cancelJob(task.id)}>Stop</button>
                  : <button className="btn primary" onClick={() => run()} disabled={!instruction.trim()}>{versions.length ? 'Generate new version' : 'Run AI'}</button>}
              </div>
            </div>
          )}
        </section>

        {/* ---------- activity ---------- */}
        {job && (
          <section className="ws-card">
            <div className="strong">Agent activity</div>
            <ul className="steps-list">
              {job.steps.map((s) => (
                <li key={s.label} className={s.state}>
                  <span className="st-icon">{s.state === 'done' ? '✓' : s.state === 'error' ? '!' : ''}</span>{s.label}
                </li>
              ))}
            </ul>
            {job.status === 'error' && <div className="error tiny">{job.error}</div>}
          </section>
        )}

        {/* ---------- output ---------- */}
        {(running || sel) && (
          <section className="ws-card grow">
            <div className="row between wrap">
              <div className="strong">{running ? 'Drafting...' : 'Deliverable'}</div>
              {!running && versions.length > 0 && (
                <select className="w-auto" value={sel.id} onChange={(e) => { setSelId(e.target.value); setEditing(false); }}>
                  {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} - {KINDS[v.kind].label} - {fmtDateTime(v.createdAt)}</option>)}
                </select>
              )}
            </div>
            {running ? (
              <div className="ws-output" ref={outRef}>
                <DeliverablePreview kind={job.kind} content={job.text} live />
                <span className="cursor" />
              </div>
            ) : editing ? (
              <div className="stack-sm">
                <textarea className="mono" rows={18} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="row end">
                  <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                  <button className="btn primary" onClick={() => { updateDeliverableContent(sel.id, editText); setEditing(false); say('Saved your edits.'); }}>Save edits</button>
                </div>
              </div>
            ) : (
              <>
                <div className="file-row">
                  <div className={'file-icon k-' + sel.kind}>{sel.kind === 'deck' ? 'PPT' : sel.kind === 'email' ? 'MAIL' : 'DOC'}</div>
                  <div>
                    <div className="strong">{sel.title}</div>
                    <div className="tiny muted">v{sel.version} - {sel.model === 'template' ? 'offline template' : sel.model} - by {userName(db, sel.createdBy)} {fmtDateTime(sel.createdAt)}{sel.editedAt ? ' - edited' : ''}</div>
                  </div>
                </div>
                <div className="ws-output"><DeliverablePreview kind={sel.kind} content={sel.content} /></div>
                <div className="row wrap">
                  {sel.kind === 'email' ? (
                    <button className="btn primary sm" onClick={mailto}>Open in email app</button>
                  ) : sel.kind === 'deck' ? (
                    <button className="btn primary sm" onClick={() => exportAs('html')}>Download deck (.html)</button>
                  ) : (
                    <button className="btn primary sm" onClick={() => exportAs('doc')}>Download Word (.doc)</button>
                  )}
                  {sel.kind === 'document' && <button className="btn sm" onClick={() => exportAs('html')}>HTML</button>}
                  <button className="btn sm" onClick={() => exportAs('md')}>Markdown</button>
                  <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(sel.content); say('Copied to clipboard.'); }}>Copy</button>
                  <button className="btn sm" onClick={() => { setEditText(sel.content); setEditing(true); }}>Edit</button>
                  <button className="btn sm danger" onClick={() => { if (confirm('Delete this version?')) { deleteDeliverable(sel.id); setSelId(null); } }}>Delete</button>
                </div>
                <div className="next-actions">
                  <div className="tiny muted">Next actions</div>
                  <div className="row wrap">
                    {task.status !== 'Done' && <button className="btn sm" onClick={doneActions.markDone}>Mark task done</button>}
                    <button className="btn sm" onClick={doneActions.logNote}>Log note on deal</button>
                    <button className="btn sm" onClick={doneActions.followUp}>Create follow-up task</button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ---------- refine ---------- */}
        {sel && !running && !editing && (
          <form className="composer" onSubmit={(e) => { e.preventDefault(); if (feedback.trim()) { run({ previous: sel.content, feedback: feedback.trim() }); setFeedback(''); } }}>
            <textarea rows={2} placeholder="Ask for changes, e.g. offer 5% discount, add a phased option, make it shorter..." value={feedback} onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
            <button className="btn primary" disabled={!feedback.trim()}>Revise</button>
          </form>
        )}
        {!ai.apiKey && <p className="tiny muted">Offline mode builds deliverables from CRM data with templates. Add an Anthropic API key in Settings for Claude-written deliverables that read your attachments and apply your feedback.</p>}
      </aside>
    </div>
  );
}

/** Small status cell used in task lists. */
export function TaskAICell({ db, task, onOpen }) {
  const jobs = useJobs();
  const job = jobs.get(task.id);
  const latest = (db.deliverables || []).filter((d) => d.taskId === task.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const stop = (e) => e.stopPropagation();
  if (job?.status === 'running') {
    return <button className="ai-btn running" onClick={(e) => { stop(e); onOpen(task.id, null, false); }}><span className="spin" />Working...</button>;
  }
  if (latest) {
    return (
      <div className="ai-cell" onClick={stop}>
        <span className="pill st-applied">AI done</span>
        <button className="link tiny deliv-link" title={latest.title} onClick={() => onOpen(task.id, latest.id, false)}>
          <span className={'mini-icon k-' + latest.kind}>{latest.kind === 'deck' ? 'PPT' : latest.kind === 'email' ? 'MAIL' : 'DOC'}</span>
          {latest.title.length > 34 ? latest.title.slice(0, 32) + '...' : latest.title} v{latest.version}
        </button>
      </div>
    );
  }
  return <button className="ai-btn" onClick={(e) => { stop(e); onOpen(task.id, null, true); }}><span className="spark sm">AI</span>Use AI</button>;
}
