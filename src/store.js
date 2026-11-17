// The system of record. All writes go through applyOps (the "CRM API"):
// validated, all-or-nothing, logged to history (audit + temporal model), and broadcast to connectors.
import { useSyncExternalStore } from 'react';
import { SCHEMA, STAGES, STAGE_PROBABILITY, recordTitle } from './schema.js';
import { buildSeed, DEFAULT_USERS } from './seed.js';

const DB_KEY = 'litmus-crm-db-v1';
const SESSION_KEY = 'litmus-crm-session';
const AI_KEY = 'litmus-crm-ai-settings';

let state = null;
const listeners = new Set();

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* storage unavailable */ }
}
function safeDel(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

export async function hashPassword(email, password) {
  const data = new TextEncoder().encode('litmus-crm:' + email.trim().toLowerCase() + ':' + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function seededDB() {
  const db = buildSeed();
  db.users = await Promise.all(
    DEFAULT_USERS.map(async ({ password, ...u }) => ({ ...u, passHash: await hashPassword(u.email, password), createdAt: new Date().toISOString() })),
  );
  return db;
}

export async function initDB() {
  const raw = safeGet(DB_KEY);
  if (raw) {
    try { state = JSON.parse(raw); } catch { state = null; }
  }
  if (!state || !state.users?.length) {
    state = await seededDB();
    safeSet(DB_KEY, JSON.stringify(state));
  }
  if (!Array.isArray(state.deliverables)) state.deliverables = [];
}

/** Low-level update for collections outside the record schema (e.g. AI deliverables). */
export function mutate(fn) {
  commit(fn(state));
}

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function useDB() { return useSyncExternalStore(subscribe, getState); }

function commit(next) {
  state = next;
  safeSet(DB_KEY, JSON.stringify(next));
  listeners.forEach((f) => f());
}

export async function resetDB() {
  const fresh = await seededDB();
  // keep users and connector config, reset business data
  fresh.users = state.users;
  fresh.connectors = state.connectors;
  fresh.deliverables = [];
  commit(fresh);
}

export function replaceDB(db) {
  if (!db || !Array.isArray(db.users) || !Array.isArray(db.deals)) throw new Error('Not a Litmus CRM backup file.');
  commit(db);
}

// ---------- session / auth ----------
export function currentUserId() { return safeGet(SESSION_KEY); }
export function setSession(id) { id ? safeSet(SESSION_KEY, id) : safeDel(SESSION_KEY); listeners.forEach((f) => f()); }
export function useSession() {
  const db = useDB();
  const id = useSyncExternalStore(subscribe, currentUserId);
  return db?.users.find((u) => u.id === id) || null;
}

export async function login(email, password) {
  const u = state.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u) return null;
  const h = await hashPassword(u.email, password);
  if (h !== u.passHash) return null;
  setSession(u.id);
  return u;
}

export async function upsertUser({ id, name, email, role, password }) {
  const next = structuredClone(state);
  if (next.users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== id)) throw new Error('A user with that email already exists.');
  if (id) {
    const u = next.users.find((x) => x.id === id);
    Object.assign(u, { name, email, role });
    if (password) u.passHash = await hashPassword(email, password);
    else if (u.email !== email) throw new Error('Set a new password when changing email.');
  } else {
    if (!password) throw new Error('Password is required.');
    next.users.push({ id: 'u_' + uid(), name, email, role, passHash: await hashPassword(email, password), createdAt: new Date().toISOString() });
  }
  commit(next);
}

export function deleteUser(id) {
  const next = structuredClone(state);
  next.users = next.users.filter((u) => u.id !== id);
  commit(next);
}

// ---------- AI settings (per browser, never exported) ----------
export function getAISettings() {
  try { return { model: 'claude-opus-5-5', effort: 'medium', apiKey: '', ...JSON.parse(safeGet(AI_KEY) || '{}') }; } catch { return { model: 'claude-opus-5-5', effort: 'medium', apiKey: '' }; }
}
export function saveAISettings(s) { safeSet(AI_KEY, JSON.stringify(s)); listeners.forEach((f) => f()); }

export function updateSettings(patch) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}
export function updateConnectors(patch) {
  commit({ ...state, connectors: { ...state.connectors, ...patch } });
}

// ---------- the CRM API ----------
export function uid() {
  return (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 10);
}

function coerce(field, value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return field.type === 'number' ? null : '';
  if (field.type === 'number') {
    const n = Number(String(value).replace(/[$,\s]/g, ''));
    if (isNaN(n)) throw new Error(`${field.label} must be a number`);
    return n;
  }
  if (field.type === 'date') {
    const d = new Date(value);
    if (isNaN(d)) throw new Error(`${field.label} must be a date (YYYY-MM-DD)`);
    return d.toISOString().slice(0, 10);
  }
  return String(value);
}

function validateRecord(db, entity, rec) {
  const sch = SCHEMA[entity];
  for (const f of sch.fields) {
    const v = rec[f.key];
    if (f.required && (v === undefined || v === null || v === '')) throw new Error(`${sch.singular}: ${f.label} is required`);
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'select' && !f.options.includes(v)) throw new Error(`${sch.singular}: ${f.label} must be one of ${f.options.join(', ')}`);
    if (f.type === 'ref' && !db[f.ref].some((r) => r.id === v)) throw new Error(`${sch.singular}: ${f.label} refers to a missing ${SCHEMA[f.ref].singular.toLowerCase()} (${v})`);
    if (f.type === 'user' && !db.users.some((u) => u.id === v)) throw new Error(`${sch.singular}: ${f.label} refers to an unknown user (${v})`);
    if (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) throw new Error(`${sch.singular}: ${f.label} is not a valid email`);
  }
}

/**
 * Apply a batch of operations atomically.
 * op: { op: 'create'|'update'|'delete', entity, id?, data? }
 * ctx: { actor: userId, via: 'ui'|'ai'|'import'|'connector', proposalId? }
 */
export function applyOps(ops, ctx) {
  const { next, logged, results } = computeOps(state, ops, ctx);
  commit(next);
  dispatchEvents(logged);
  return results;
}

/** Pure: returns the next DB without committing. Throws on any invalid op (all-or-nothing). */
function computeOps(db, ops, ctx) {
  const next = structuredClone(db);
  const actor = next.users.find((u) => u.id === ctx.actor);
  const now = new Date().toISOString();
  const entries = [];
  const results = [];

  for (const raw of ops) {
    const { op, entity } = raw;
    const sch = SCHEMA[entity];
    if (!sch) throw new Error(`Unknown entity "${entity}"`);
    const data = {};
    for (const f of sch.fields) {
      if (raw.data && Object.prototype.hasOwnProperty.call(raw.data, f.key)) data[f.key] = coerce(f, raw.data[f.key]);
    }
    const unknown = Object.keys(raw.data || {}).filter((k) => !sch.fields.some((f) => f.key === k) && k !== 'id');
    if (unknown.length) throw new Error(`${sch.singular}: unknown field(s) ${unknown.join(', ')}`);

    if (op === 'create') {
      const rec = { id: raw.id || sch.prefix + '_' + uid(), ...data, createdAt: now, updatedAt: now };
      if (entity === 'deals' && !rec.stage) rec.stage = 'Lead';
      if (entity === 'tasks' && !rec.status) rec.status = 'Open';
      if (entity === 'notes') rec.authorId = ctx.actor;
      if (['companies', 'contacts', 'deals'].includes(entity) && !rec.ownerId) rec.ownerId = ctx.actor;
      validateRecord(next, entity, rec);
      next[entity].push(rec);
      entries.push({ entity, entityId: rec.id, action: 'create', before: null, after: rec, changes: [] });
      results.push(rec);
    } else if (op === 'update') {
      const idx = next[entity].findIndex((r) => r.id === raw.id);
      if (idx < 0) throw new Error(`${sch.singular} ${raw.id} not found`);
      const before = next[entity][idx];
      const after = { ...before, ...data, updatedAt: now };
      validateRecord(next, entity, after);
      const changes = Object.keys(data)
        .filter((k) => (before[k] ?? '') !== (after[k] ?? ''))
        .map((k) => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
      if (!changes.length) { results.push(before); continue; }
      next[entity][idx] = after;
      entries.push({ entity, entityId: after.id, action: 'update', before, after, changes });
      results.push(after);
    } else if (op === 'delete') {
      const rec = next[entity].find((r) => r.id === raw.id);
      if (!rec) throw new Error(`${sch.singular} ${raw.id} not found`);
      next[entity] = next[entity].filter((r) => r.id !== raw.id);
      // detach references so nothing points at a deleted record
      for (const [ek, es] of Object.entries(SCHEMA)) {
        for (const f of es.fields.filter((x) => x.type === 'ref' && x.ref === entity)) {
          next[ek] = next[ek].map((r) => (r[f.key] === raw.id ? { ...r, [f.key]: '' } : r));
        }
      }
      entries.push({ entity, entityId: rec.id, action: 'delete', before: rec, after: null, changes: [] });
      results.push(rec);
    } else {
      throw new Error(`Unknown operation "${op}"`);
    }
  }

  const logged = entries.map((e) => ({
    id: 'h_' + uid(), ts: now, actor: ctx.actor, actorName: actor?.name || 'Unknown', via: ctx.via || 'ui', proposalId: ctx.proposalId || null, ...e,
  }));
  next.history = [...next.history, ...logged].slice(-5000);
  return { next, logged, results };
}

// ---------- AI action guardrails ----------
export function isSafeProposal(ops) {
  return ops.length <= 3 && ops.every((o) => o.op !== 'delete');
}

export function submitProposal({ summary, ops, source, requestedBy }) {
  const proposal = {
    id: 'pr_' + uid(), ts: new Date().toISOString(), summary, ops, source, requestedBy,
    status: 'pending', decidedBy: null, decidedAt: null, error: null,
  };
  // dry-run validation so obviously broken proposals are flagged immediately
  try { dryRun(ops, requestedBy); } catch (e) { proposal.error = e.message; }
  commit({ ...state, proposals: [proposal, ...state.proposals] });
  if (!proposal.error && state.settings.autoApproveSafe && isSafeProposal(ops)) {
    return decideProposal(proposal.id, true, requestedBy, 'Auto-approved: small, non-destructive change');
  }
  notifySlack(`New AI proposal awaiting approval: ${summary}`);
  return getState().proposals.find((p) => p.id === proposal.id);
}

function dryRun(ops, actor) {
  computeOps(state, ops, { actor, via: 'ai' });
}

export function decideProposal(id, approve, userId, reason = '') {
  const p = state.proposals.find((x) => x.id === id);
  if (!p || p.status !== 'pending') return p;
  let status = approve ? 'approved' : 'rejected';
  let error = null;
  if (approve) {
    try {
      applyOps(p.ops, { actor: p.requestedBy, via: 'ai', proposalId: p.id });
      status = 'applied';
    } catch (e) {
      status = 'failed';
      error = e.message;
    }
  }
  const updated = { ...p, status, error, decidedBy: userId, decidedAt: new Date().toISOString(), reason };
  commit({ ...state, proposals: state.proposals.map((x) => (x.id === id ? updated : x)) });
  if (status === 'applied') notifySlack(`AI proposal applied: ${p.summary}`);
  return updated;
}

// ---------- connectors: outbound events ----------
function eventName(e) {
  return `${SCHEMA[e.entity].event}.${e.action === 'create' ? 'created' : e.action === 'update' ? 'updated' : 'deleted'}`;
}

async function postJSON(url, body) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return 'ok';
  } catch {
    // Many receivers do not send CORS headers. Fall back to an opaque request (delivered, response unreadable).
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
      return 'sent (opaque)';
    } catch (e) {
      return 'failed: ' + e.message;
    }
  }
}

function logDelivery(target, event, status) {
  const entry = { id: 'dv_' + uid(), ts: new Date().toISOString(), target, event, status };
  const conn = state.connectors;
  commit({ ...state, connectors: { ...conn, deliveries: [entry, ...(conn.deliveries || [])].slice(0, 100) } });
}

function dispatchEvents(entries) {
  const hooks = (state.connectors.webhooks || []).filter((w) => w.enabled);
  for (const e of entries) {
    const name = eventName(e);
    const payload = { event: name, ts: e.ts, actor: e.actorName, via: e.via, entity: e.entity, id: e.entityId, changes: e.changes, record: e.after || e.before };
    for (const w of hooks) {
      const list = (w.events || '*').split(',').map((s) => s.trim()).filter(Boolean);
      if (list.includes('*') || list.includes(name)) {
        postJSON(w.url, payload).then((st) => logDelivery(w.url, name, st));
      }
    }
    if (e.entity === 'deals' && e.changes.some((c) => c.field === 'stage')) {
      const c = e.changes.find((x) => x.field === 'stage');
      notifySlack(`Deal "${recordTitle('deals', e.after)}" moved ${c.from} -> ${c.to} by ${e.actorName}`);
    }
  }
}

export function notifySlack(text) {
  const s = state.connectors.slack;
  if (!s?.enabled || !s.url) return;
  fetch(s.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ text }) })
    .then(() => logDelivery('slack', 'notification', 'sent (opaque)'))
    .catch((e) => logDelivery('slack', 'notification', 'failed: ' + e.message));
}

export async function testWebhook(url) {
  const st = await postJSON(url, { event: 'test.ping', ts: new Date().toISOString(), message: 'Hello from Litmus CRM' });
  logDelivery(url, 'test.ping', st);
  return st;
}

// ---------- read helpers used by UI, graph and AI ----------
export function byId(db, entity, id) {
  return id ? db[entity]?.find((r) => r.id === id) : undefined;
}
export function userName(db, id) {
  return db.users.find((u) => u.id === id)?.name || '';
}

export function pipelineSummary(db) {
  const byStage = STAGES.map((s) => {
    const ds = db.deals.filter((d) => d.stage === s);
    return { stage: s, count: ds.length, amount: ds.reduce((a, d) => a + (Number(d.amount) || 0), 0) };
  });
  const open = db.deals.filter((d) => !['Won', 'Lost'].includes(d.stage));
  const openValue = open.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const weighted = open.reduce((a, d) => a + (Number(d.amount) || 0) * (STAGE_PROBABILITY[d.stage] / 100), 0);
  const won = db.deals.filter((d) => d.stage === 'Won');
  const lost = db.deals.filter((d) => d.stage === 'Lost');
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;
  const byOwner = db.users.map((u) => {
    const ds = open.filter((d) => d.ownerId === u.id);
    return { owner: u.name, count: ds.length, amount: ds.reduce((a, d) => a + (Number(d.amount) || 0), 0) };
  }).filter((x) => x.count);
  return { byStage, openValue, weighted, wonValue: won.reduce((a, d) => a + (Number(d.amount) || 0), 0), winRate, openCount: open.length, byOwner };
}

/** Reconstruct a record as it was at time `ts` by walking history backwards. */
export function recordAsOf(db, entity, id, ts) {
  const hist = db.history.filter((h) => h.entity === entity && h.entityId === id).sort((a, b) => b.ts.localeCompare(a.ts));
  let rec = byId(db, entity, id) || null;
  for (const h of hist) {
    if (h.ts <= ts) break;
    rec = h.before;
  }
  return rec;
}
