import { APP_NAME } from './brand.js';
// AI layer: read tools over the system of record + knowledge graph, and a propose_changes tool
// whose writes never touch data directly. They become proposals that a human approves (guardrails).
import Anthropic from '@anthropic-ai/sdk';
import { SCHEMA, STAGES, ENTITY_KEYS, recordTitle, fmtMoney, todayISO } from './schema.js';
import { getState, pipelineSummary, byId, userName, submitProposal } from './store.js';
import { neighbors } from './graph.js';

// ---------------- shared read tools ----------------

function displayRow(db, entity, r) {
  const out = { id: r.id, title: recordTitle(entity, r) };
  for (const f of SCHEMA[entity].fields) {
    const v = r[f.key];
    if (v === undefined || v === '' || v === null) continue;
    if (f.type === 'ref') out[f.key.replace(/Id$/, '')] = recordTitle(f.ref, byId(db, f.ref, v));
    else if (f.type === 'user') out[f.key.replace(/Id$/, '')] = userName(db, v);
    out[f.key] = v;
  }
  return out;
}

export function searchRecords(db, { entity, text = '', filters = {}, min_amount, max_amount, overdue, limit = 25 }) {
  if (!SCHEMA[entity]) throw new Error('Unknown entity ' + entity);
  const t = text.toLowerCase().trim();
  let rows = db[entity].filter((r) => {
    if (t) {
      const hay = [recordTitle(entity, r), ...SCHEMA[entity].fields.map((f) => {
        const v = r[f.key];
        if (f.type === 'ref') return recordTitle(f.ref, byId(db, f.ref, v));
        if (f.type === 'user') return userName(db, v);
        return v;
      })].join(' ').toLowerCase();
      if (!t.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    for (const [k, v] of Object.entries(filters || {})) {
      if (v === undefined || v === null || v === '') continue;
      const f = SCHEMA[entity].fields.find((x) => x.key === k);
      if (!f) continue;
      const rv = r[k];
      if (f.type === 'ref' || f.type === 'user') {
        const name = f.type === 'ref' ? recordTitle(f.ref, byId(db, f.ref, rv)) : userName(db, rv);
        if (rv !== v && !name.toLowerCase().includes(String(v).toLowerCase())) return false;
      } else if (String(rv ?? '').toLowerCase() !== String(v).toLowerCase()) return false;
    }
    if (min_amount != null && !(Number(r.amount) >= min_amount)) return false;
    if (max_amount != null && !(Number(r.amount) <= max_amount)) return false;
    if (overdue && !(r.dueDate && r.dueDate < todayISO() && r.status !== 'Done')) return false;
    return true;
  });
  const total = rows.length;
  rows = rows.slice(0, Math.min(limit, 100)).map((r) => displayRow(db, entity, r));
  return { entity, total, rows };
}

export function getRecordDetail(db, { entity, id }) {
  const r = byId(db, entity, id);
  if (!r) throw new Error(`${entity} ${id} not found`);
  const related = {};
  for (const [ek, es] of Object.entries(SCHEMA)) {
    const refFields = es.fields.filter((f) => f.type === 'ref' && f.ref === entity);
    if (!refFields.length) continue;
    const rows = db[ek].filter((x) => refFields.some((f) => x[f.key] === id));
    if (rows.length) related[ek] = rows.slice(0, 20).map((x) => displayRow(db, ek, x));
  }
  const history = db.history
    .filter((h) => h.entity === entity && h.entityId === id)
    .slice(-15)
    .map((h) => ({ ts: h.ts, by: h.actorName, via: h.via, action: h.action, changes: h.changes }));
  return { record: displayRow(db, entity, r), related, history };
}

export const TOOL_DEFS = [
  {
    name: 'search_records',
    description: 'Search CRM records of one entity type. Use free text and/or exact filters. Ref and user filters accept an id or part of a name. Returns matching rows with resolved names.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ENTITY_KEYS },
        text: { type: 'string', description: 'Free-text match across all fields (all words must match).' },
        filters: { type: 'object', description: 'Field -> value, e.g. {"stage":"Proposal"} or {"companyId":"Northwind"} or {"ownerId":"Priya"}.' },
        min_amount: { type: 'number' },
        max_amount: { type: 'number' },
        overdue: { type: 'boolean', description: 'Tasks only: open tasks whose due date has passed.' },
        limit: { type: 'number' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'get_record',
    description: 'Get one record with its related records (from the knowledge graph) and its change history (who changed what, when).',
    input_schema: {
      type: 'object',
      properties: { entity: { type: 'string', enum: ENTITY_KEYS }, id: { type: 'string' } },
      required: ['entity', 'id'],
    },
  },
  {
    name: 'graph_neighbors',
    description: 'Traverse the knowledge graph from a record: returns connected companies, contacts, deals, tasks, notes and owners up to the given depth (1-3).',
    input_schema: {
      type: 'object',
      properties: { entity: { type: 'string', enum: ENTITY_KEYS }, id: { type: 'string' }, depth: { type: 'number' } },
      required: ['entity', 'id'],
    },
  },
  {
    name: 'pipeline_summary',
    description: 'Pipeline analytics: count and value per stage, open and weighted pipeline, won value, win rate, open pipeline by owner.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'propose_changes',
    description:
      'Propose create/update/delete operations on CRM records. Nothing is written directly: the change goes to a human approval queue and is applied through the CRM API only after approval. Use exact record ids from search results. For updates send only changed fields.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One sentence describing the change for the approver.' },
        ops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: ['create', 'update', 'delete'] },
              entity: { type: 'string', enum: ENTITY_KEYS },
              id: { type: 'string', description: 'Required for update and delete.' },
              data: { type: 'object', description: 'Field values using schema field keys (ids for ref and user fields).' },
            },
            required: ['op', 'entity'],
          },
        },
      },
      required: ['summary', 'ops'],
    },
  },
];

function runTool(name, input, user, source) {
  const db = getState();
  switch (name) {
    case 'search_records': return searchRecords(db, input);
    case 'get_record': return getRecordDetail(db, input);
    case 'graph_neighbors': {
      const n = neighbors(db, input.entity, input.id, Math.min(Math.max(input.depth || 1, 1), 3));
      return n.map((x) => ({ entity: x.entity, id: x.id, title: x.title, relation: x.relation, depth: x.depth }));
    }
    case 'pipeline_summary': return pipelineSummary(db);
    case 'propose_changes': {
      if (!Array.isArray(input.ops) || !input.ops.length) throw new Error('ops must be a non-empty array');
      const p = submitProposal({ summary: input.summary || 'AI proposed change', ops: input.ops, source, requestedBy: user.id });
      if (p.error) return { status: 'invalid', error: p.error, proposal_id: p.id, note: 'Fix the ops and propose again.' };
      return { status: p.status, proposal_id: p.id, note: p.status === 'applied' ? 'Auto-approved and applied.' : 'Queued for human approval in the Approvals page. Tell the user it is pending.' };
    }
    default: throw new Error('Unknown tool ' + name);
  }
}

function schemaDoc() {
  return Object.entries(SCHEMA)
    .map(([k, s]) => `- ${k}: ` + s.fields.map((f) => `${f.key}${f.type === 'select' ? ` (${f.options.join('|')})` : f.type === 'ref' ? ` (id of ${f.ref})` : f.type === 'user' ? ' (user id)' : f.type ? ` (${f.type})` : ''}${f.required ? ' *' : ''}`).join(', '))
    .join('\n');
}

function systemPrompt(user) {
  const db = getState();
  return `You are the AI copilot inside ${APP_NAME}, an AI-powered CRM. The CRM is the system of record; a knowledge graph links companies, contacts, deals, tasks, notes and owners.

Answer questions by calling the read tools; never invent records, numbers or ids. Be concise and use short tables or bullet lists when listing records. Amounts are USD.

To change data, call propose_changes. Every write is a proposal that a human approves on the Approvals page, so after proposing, tell the user what you proposed and that it is waiting for approval (or that it was auto-applied if the tool says so). Look up ids with search_records before proposing. Ask a short clarifying question if a request is ambiguous about which record to change.

Schema (* = required):
${schemaDoc()}
Deal stages in order: ${STAGES.join(' -> ')}.
Users: ${db.users.map((u) => `${u.name} (${u.id})`).join(', ')}.
Current user: ${user.name} (${user.id}). Today: ${todayISO()}.`;
}

// ---------------- Claude-powered agent ----------------

export async function runClaude({ apiMessages, user, settings, onStep }) {
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
  const messages = [...apiMessages];
  const steps = [];
  let useFallbacks = true;

  for (let i = 0; i < 10; i++) {
    const params = {
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 16000,
      system: systemPrompt(user),
      tools: TOOL_DEFS,
      output_config: { effort: settings.effort || 'medium' },
      messages,
    };
    let resp;
    try {
      resp = useFallbacks
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
    } catch (e) {
      if (useFallbacks && e?.status === 400 && /fallback/i.test(e.message || '')) { useFallbacks = false; i--; continue; }
      throw e;
    }
    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'refusal') {
      return { messages, steps, text: 'The model declined this request. Try rephrasing it.' };
    }
    if (resp.stop_reason === 'pause_turn') continue;
    if (resp.stop_reason === 'max_tokens') {
      return { messages, steps, text: textOf(resp.content) + '\n\n(Response was cut off at the token limit.)' };
    }
    const toolUses = resp.content.filter((b) => b.type === 'tool_use');
    if (resp.stop_reason !== 'tool_use' || !toolUses.length) {
      return { messages, steps, text: textOf(resp.content) };
    }
    const results = toolUses.map((tu) => {
      const step = { tool: tu.name, input: tu.input };
      try {
        const out = runTool(tu.name, tu.input || {}, user, 'copilot-claude');
        step.ok = true;
        step.result = out;
        steps.push(step);
        onStep?.(step);
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 60000) };
      } catch (e) {
        step.ok = false;
        step.error = e.message;
        steps.push(step);
        onStep?.(step);
        return { type: 'tool_result', tool_use_id: tu.id, content: 'Error: ' + e.message, is_error: true };
      }
    });
    messages.push({ role: 'user', content: results });
  }
  return { messages, steps, text: 'Stopped after too many tool steps. Try a narrower question.' };
}

function textOf(content) {
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// ---------------- built-in offline assistant (no API key needed) ----------------

function findRecord(db, entity, phrase) {
  const p = phrase.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/\s+(deal|company|contact|task)$/, '').trim();
  if (!p) return null;
  const list = db[entity].map((r) => ({ r, t: recordTitle(entity, r).toLowerCase() }));
  return (
    list.find((x) => x.t === p)?.r ||
    list.find((x) => x.t.startsWith(p))?.r ||
    list.find((x) => x.t.includes(p))?.r ||
    list.find((x) => p.split(/\s+/).every((w) => x.t.includes(w)))?.r ||
    (entity === 'deals' ? db.deals.find((d) => recordTitle('companies', byId(db, 'companies', d.companyId)).toLowerCase().includes(p)) : null) ||
    null
  );
}

function parseDue(text) {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return todayISO(0);
  if (/\btomorrow\b/.test(t)) return todayISO(1);
  if (/next week/.test(t)) return todayISO(7);
  const m = t.match(/in (\d+) days?/);
  if (m) return todayISO(Number(m[1]));
  const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return '';
}

function parseAmount(s) {
  const m = s.match(/\$?\s*([\d,.]+)\s*(k|m|thousand|million)?/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3;
  if (u === 'm' || u === 'million') n *= 1e6;
  return n;
}

const table = (entity, rows, cols) => ({ entity, columns: cols, rows });

export function runLocal(text, user) {
  const db = getState();
  const q = text.trim();
  const t = q.toLowerCase();
  const stage = STAGES.find((s) => new RegExp(`\\b${s.toLowerCase()}\\b`).test(t));

  // ----- actions -----
  let m;
  if ((m = t.match(/^(?:move|set|change|update)\s+(.+?)\s+(?:deal\s+)?(?:to|stage to|into)\s+(lead|qualified|proposal|negotiation|won|lost)\b/))) {
    const d = findRecord(db, 'deals', m[1]);
    if (!d) return { text: `I could not find a deal matching "${m[1]}".` };
    const to = STAGES.find((s) => s.toLowerCase() === m[2]);
    return propose(user, `Move deal "${d.name}" from ${d.stage} to ${to}`, [{ op: 'update', entity: 'deals', id: d.id, data: { stage: to } }]);
  }
  if ((m = t.match(/^(?:set|change|update)\s+(?:the\s+)?amount\s+(?:of|for)\s+(.+?)\s+to\s+(.+)$/))) {
    const d = findRecord(db, 'deals', m[1]);
    const amt = parseAmount(m[2]);
    if (!d || amt == null) return { text: 'Try: "set amount of Northwind core banking to 450k".' };
    return propose(user, `Change amount of "${d.name}" from ${fmtMoney(d.amount)} to ${fmtMoney(amt)}`, [{ op: 'update', entity: 'deals', id: d.id, data: { amount: amt } }]);
  }
  if ((m = q.match(/^(?:create|add|new)\s+(?:a\s+)?task\s+(?:to\s+)?["']?(.+?)["']?(?:\s+(?:for|on)\s+(.+?))?(?:\s+(?:due|by)\s+(.+))?$/i))) {
    const title = m[1].replace(/\s+(today|tomorrow|next week)$/i, '');
    const due = parseDue(m[3] || q) || todayISO(1);
    const data = { title: title.charAt(0).toUpperCase() + title.slice(1), dueDate: due, status: 'Open', priority: 'Medium', assigneeId: user.id };
    if (m[2]) {
      const target = m[2];
      const d = findRecord(db, 'deals', target);
      const c = !d && findRecord(db, 'contacts', target);
      const co = !d && !c && findRecord(db, 'companies', target);
      if (d) Object.assign(data, { dealId: d.id, companyId: d.companyId || '', contactId: d.contactId || '' });
      else if (c) Object.assign(data, { contactId: c.id, companyId: c.companyId || '' });
      else if (co) data.companyId = co.id;
    }
    return propose(user, `Create task "${data.title}" due ${data.dueDate}`, [{ op: 'create', entity: 'tasks', data }]);
  }
  if ((m = q.match(/^(?:add|create)\s+(?:a\s+)?note\s+(?:to|on|for)\s+(.+?)\s*:\s*(.+)$/i))) {
    const target = m[1];
    const d = findRecord(db, 'deals', target);
    const c = !d && findRecord(db, 'contacts', target);
    const co = !d && !c && findRecord(db, 'companies', target);
    if (!d && !c && !co) return { text: `I could not find a deal, contact or company matching "${target}".` };
    const data = { body: m[2] };
    if (d) Object.assign(data, { dealId: d.id, companyId: d.companyId || '' });
    if (c) Object.assign(data, { contactId: c.id, companyId: c.companyId || '' });
    if (co) data.companyId = co.id;
    return propose(user, `Add note to ${recordTitle(d ? 'deals' : c ? 'contacts' : 'companies', d || c || co)}`, [{ op: 'create', entity: 'notes', data }]);
  }
  if ((m = t.match(/^(?:mark|complete|close)\s+(?:task\s+)?(.+?)\s*(?:as\s+)?(?:done|complete|completed)?$/)) && /mark|complete|close/.test(t.split(' ')[0])) {
    const tk = findRecord(db, 'tasks', m[1]);
    if (!tk) return { text: `I could not find a task matching "${m[1]}".` };
    return propose(user, `Mark task "${tk.title}" as done`, [{ op: 'update', entity: 'tasks', id: tk.id, data: { status: 'Done' } }]);
  }
  if ((m = q.match(/^(?:create|add|new)\s+(?:a\s+)?company\s+["']?(.+?)["']?(?:\s+in\s+(\w+))?$/i))) {
    const industry = m[2] ? (['Banking', 'Insurance', 'Fintech', 'Retail', 'Telecom', 'Healthcare', 'Manufacturing', 'Technology'].find((x) => x.toLowerCase() === m[2].toLowerCase()) || '') : '';
    return propose(user, `Create company "${m[1]}"`, [{ op: 'create', entity: 'companies', data: { name: m[1], industry } }]);
  }
  if ((m = q.match(/^(?:create|add|new)\s+(?:a\s+)?contact\s+(\S+)(?:\s+(\S+))?(?:\s+at\s+(.+?))?(?:\s+(\S+@\S+))?$/i))) {
    const co = m[3] && findRecord(db, 'companies', m[3]);
    const data = { firstName: m[1], lastName: m[2] || '', companyId: co?.id || '', email: m[4] || '' };
    return propose(user, `Create contact ${m[1]} ${m[2] || ''}${co ? ' at ' + co.name : ''}`.trim(), [{ op: 'create', entity: 'contacts', data }]);
  }
  if ((m = q.match(/^(?:create|add|new)\s+(?:a\s+)?deal\s+["']?(.+?)["']?\s+(?:for|with)\s+(.+?)(?:\s+(?:worth|for|at)\s+(.+))?$/i))) {
    const co = findRecord(db, 'companies', m[2]);
    if (!co) return { text: `I could not find a company matching "${m[2]}". Create it first: "create company ${m[2]}".` };
    const amount = m[3] ? parseAmount(m[3]) : 0;
    return propose(user, `Create deal "${m[1]}" for ${co.name}`, [{ op: 'create', entity: 'deals', data: { name: m[1], companyId: co.id, amount, stage: 'Lead', closeDate: todayISO(60) } }]);
  }

  // ----- questions -----
  if (/pipeline|forecast|summary|how are we doing|win rate/.test(t) && !/deals? (in|at)/.test(t)) {
    const s = pipelineSummary(db);
    return {
      text: `Open pipeline is ${fmtMoney(s.openValue)} across ${s.openCount} deals (weighted ${fmtMoney(s.weighted)}). Won so far: ${fmtMoney(s.wonValue)}. Win rate: ${s.winRate}%.`,
      table: table(null, s.byStage.map((x) => ({ Stage: x.stage, Deals: x.count, Value: fmtMoney(x.amount) })), ['Stage', 'Deals', 'Value']),
    };
  }
  if (/overdue/.test(t)) {
    const r = searchRecords(db, { entity: 'tasks', overdue: true });
    return { text: r.total ? `${r.total} overdue task(s):` : 'No overdue tasks.', table: r.total ? table('tasks', r.rows, ['dueDate', 'deal', 'assignee']) : null };
  }
  if (/tasks?/.test(t) && /(my|mine|today|this week|open)/.test(t)) {
    const horizon = /today/.test(t) ? todayISO(0) : /week/.test(t) ? todayISO(7) : '9999';
    const rows = db.tasks.filter((x) => x.status !== 'Done' && (!/\bmy|mine\b/.test(t) || x.assigneeId === user.id) && (x.dueDate || '') <= horizon);
    const r = rows.map((x) => displayRow(db, 'tasks', x));
    return { text: `${r.length} open task(s):`, table: table('tasks', r, ['dueDate', 'priority', 'deal', 'assignee']) };
  }
  if ((m = t.match(/(?:history|changes|what changed|timeline)\s+(?:of|for|on)\s+(.+)/))) {
    const d = findRecord(db, 'deals', m[1]) ;
    const co = !d && findRecord(db, 'companies', m[1]);
    const entity = d ? 'deals' : 'companies';
    const rec = d || co;
    if (!rec) return { text: `I could not find "${m[1]}".` };
    const h = getRecordDetail(db, { entity, id: rec.id }).history;
    return {
      text: `History of ${recordTitle(entity, rec)}:`,
      table: table(null, h.map((x) => ({ When: x.ts.slice(0, 10), Who: x.by, What: x.action === 'update' ? x.changes.map((c) => `${c.field}: ${c.from ?? '-'} -> ${c.to ?? '-'}`).join('; ') : x.action })), ['When', 'Who', 'What']),
    };
  }
  if ((m = t.match(/(?:who is|who's|contacts? (?:at|for|in)|people at)\s+(.+?)\??$/))) {
    const co = findRecord(db, 'companies', m[1].replace(/^(the )?contacts? (at|for) /, '').replace(/^(at|from|in|with)\s+/, ''));
    if (co) {
      const r = searchRecords(db, { entity: 'contacts', filters: { companyId: co.id } });
      return { text: `${r.total} contact(s) at ${co.name}:`, table: table('contacts', r.rows, ['title', 'email', 'phone']) };
    }
  }
  if (/deals?|opportunit/.test(t)) {
    const input = { entity: 'deals', filters: {} };
    if (stage) input.filters.stage = stage;
    if (/\bopen\b/.test(t)) input.text = '';
    if ((m = t.match(/(?:over|above|more than|greater than|>)\s*(\$?[\d,.]+\s*[km]?)/))) input.min_amount = parseAmount(m[1]);
    if ((m = t.match(/(?:under|below|less than|<)\s*(\$?[\d,.]+\s*[km]?)/))) input.max_amount = parseAmount(m[1]);
    const ownerName = db.users.find((u) => t.includes(u.name.split(' ')[0].toLowerCase()));
    if (ownerName) input.filters.ownerId = ownerName.id;
    if (/\bmy\b/.test(t)) input.filters.ownerId = user.id;
    if ((m = t.match(/(?:for|with|at)\s+([a-z][\w\s]+?)(?:\s+(?:in|over|under|above|below)\b|\?|$)/))) {
      const co = findRecord(db, 'companies', m[1]);
      if (co) input.filters.companyId = co.id;
    }
    const ind = ['banking', 'insurance', 'fintech', 'retail', 'telecom', 'healthcare', 'manufacturing', 'technology', 'bfsi'].find((x) => t.includes(x));
    let r = searchRecords(db, { ...input, limit: 100 });
    if (ind) {
      const inds = ind === 'bfsi' ? ['Banking', 'Insurance', 'Fintech'] : [ind[0].toUpperCase() + ind.slice(1)];
      r = { ...r, rows: r.rows.filter((x) => inds.includes(byId(db, 'companies', x.companyId)?.industry)) };
      r.total = r.rows.length;
    }
    if (/\bopen\b/.test(t)) { r.rows = r.rows.filter((x) => !['Won', 'Lost'].includes(x.stage)); r.total = r.rows.length; }
    if (/top|biggest|largest/.test(t)) r.rows.sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const n = (m = t.match(/top\s+(\d+)/)) ? Number(m[1]) : null;
    if (n) r.rows = r.rows.slice(0, n);
    const sum = r.rows.reduce((a, x) => a + (Number(x.amount) || 0), 0);
    return {
      text: r.rows.length ? `${r.rows.length} deal(s), total ${fmtMoney(sum)}:` : 'No deals match that.',
      table: r.rows.length ? table('deals', r.rows.map((x) => ({ ...x, amount: fmtMoney(x.amount) })), ['company', 'amount', 'stage', 'closeDate', 'owner']) : null,
    };
  }
  for (const entity of ['companies', 'contacts', 'tasks']) {
    if (new RegExp(SCHEMA[entity].label.toLowerCase().replace(/s$/, '') + 's?\\b').test(t) || (entity === 'contacts' && /people/.test(t))) {
      const textQ = t.replace(/^(show|list|find|get|search)\s+(me\s+)?(all\s+)?/, '').replace(/companies|company|contacts?|people|tasks?/g, '').replace(/\b(in|at|for|with|the)\b/g, ' ').trim();
      let r = searchRecords(db, { entity, text: textQ });
      if (!r.total) r = searchRecords(db, { entity });
      const cols = { companies: ['industry', 'city', 'employees', 'owner'], contacts: ['title', 'company', 'email'], tasks: ['dueDate', 'status', 'deal', 'assignee'] }[entity];
      return { text: `${r.total} ${SCHEMA[entity].label.toLowerCase()}:`, table: table(entity, r.rows, cols) };
    }
  }
  // generic search across everything
  const hits = ENTITY_KEYS.flatMap((e) => searchRecords(db, { entity: e, text: q, limit: 5 }).rows.map((r) => ({ Type: SCHEMA[e].singular, Name: r.title, id: r.id, _entity: e })));
  if (hits.length) return { text: `Found ${hits.length} matching record(s):`, table: table(null, hits, ['Type', 'Name']) };
  return {
    text:
      'The built-in assistant understands commands like:\n' +
      '- "pipeline summary", "open deals over 100k", "top 5 deals", "deals in negotiation", "BFSI deals"\n' +
      '- "overdue tasks", "my tasks this week", "who is at Northwind Bank", "history of Northwind core banking"\n' +
      '- "move Lumen Capital to won", "set amount of Orbit 5G billing to 800k"\n' +
      '- "create task send pricing for Bluepeak due tomorrow", "add note to Kestrel: CFO joined the call"\n' +
      '- "create company Acme Corp in retail", "create contact Jane Doe at Acme Corp jane@acme.example"\n\n' +
      'For free-form questions and multi-step actions, add your Anthropic API key in Settings to switch on the Claude copilot.',
  };
}

function propose(user, summary, ops) {
  const p = submitProposal({ summary, ops, source: 'copilot-local', requestedBy: user.id });
  if (p.error) return { text: `I could not prepare that change: ${p.error}` };
  return {
    text: p.status === 'applied' ? `Done. ${summary}. (Auto-approved as a small, non-destructive change.)` : `Proposed: ${summary}. It is waiting for approval on the Approvals page.`,
    proposalId: p.id,
  };
}
