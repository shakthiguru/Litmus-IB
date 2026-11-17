// Knowledge graph built live from the system of record (read model).
// Nodes: companies, contacts, deals, tasks, notes, users. Edges come from reference fields.
import { SCHEMA, recordTitle } from './schema.js';

export const NODE_TYPES = {
  companies: { label: 'Company', plural: 'Companies', color: 'var(--c-company)' },
  contacts: { label: 'Contact', color: 'var(--c-contact)' },
  deals: { label: 'Deal', color: 'var(--c-deal)' },
  tasks: { label: 'Task', color: 'var(--c-task)' },
  notes: { label: 'Note', color: 'var(--c-note)' },
  users: { label: 'Owner', color: 'var(--c-user)' },
};

const REL_NAMES = {
  'contacts.companyId': 'works at',
  'deals.companyId': 'deal with',
  'deals.contactId': 'primary contact',
  'tasks.dealId': 'task on',
  'tasks.contactId': 'task for',
  'tasks.companyId': 'task for',
  'notes.dealId': 'note on',
  'notes.contactId': 'note on',
  'notes.companyId': 'note on',
  ownerId: 'owned by',
  assigneeId: 'assigned to',
};

export function buildGraph(db, types) {
  const nodes = [];
  const edges = [];
  const key = (e, id) => e + ':' + id;
  const want = (t) => !types || types.includes(t);
  for (const entity of Object.keys(SCHEMA)) {
    if (!want(entity)) continue;
    for (const r of db[entity]) nodes.push({ key: key(entity, r.id), entity, id: r.id, title: recordTitle(entity, r), rec: r });
  }
  if (want('users')) for (const u of db.users) nodes.push({ key: key('users', u.id), entity: 'users', id: u.id, title: u.name, rec: u });
  const present = new Set(nodes.map((n) => n.key));
  for (const [entity, sch] of Object.entries(SCHEMA)) {
    if (!want(entity)) continue;
    for (const r of db[entity]) {
      for (const f of sch.fields) {
        const v = r[f.key];
        if (!v) continue;
        const target = f.type === 'ref' ? key(f.ref, v) : f.type === 'user' ? key('users', v) : null;
        if (!target || !present.has(target)) continue;
        // skip redundant task/note -> company edges when the record is already linked to a deal or contact of that company
        if ((entity === 'tasks' || entity === 'notes') && f.key === 'companyId' && (r.dealId || r.contactId)) continue;
        edges.push({ source: key(entity, r.id), target, rel: REL_NAMES[`${entity}.${f.key}`] || REL_NAMES[f.key] || f.label });
      }
    }
  }
  return { nodes, edges };
}

/** Breadth-first traversal from a record. */
export function neighbors(db, entity, id, depth = 1) {
  const { nodes, edges } = buildGraph(db);
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const start = entity + ':' + id;
  if (!byKey.has(start)) throw new Error(`${entity} ${id} not found`);
  const seen = new Map([[start, 0]]);
  const out = [];
  let frontier = [start];
  for (let d = 1; d <= depth; d++) {
    const nextF = [];
    for (const k of frontier) {
      for (const e of edges) {
        const other = e.source === k ? e.target : e.target === k ? e.source : null;
        if (!other || seen.has(other)) continue;
        seen.set(other, d);
        nextF.push(other);
        const n = byKey.get(other);
        out.push({ entity: n.entity, id: n.id, title: n.title, relation: e.source === k ? e.rel : `linked: ${e.rel}`, depth: d });
      }
    }
    frontier = nextF;
  }
  return out;
}

/** Simple deterministic force-directed layout. */
export function layout(nodes, edges, width, height) {
  const idx = new Map(nodes.map((n, i) => [n.key, i]));
  const order = ['users', 'companies', 'contacts', 'deals', 'tasks', 'notes'];
  const pos = nodes.map((n, i) => {
    const ring = order.indexOf(n.entity);
    const a = (i / nodes.length) * Math.PI * 2 * 7 + ring;
    const r = 60 + ring * 55;
    return { x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r, vx: 0, vy: 0 };
  });
  const links = edges.map((e) => [idx.get(e.source), idx.get(e.target)]).filter(([a, b]) => a != null && b != null);
  const N = nodes.length;
  const k = Math.sqrt((width * height) / Math.max(N, 1)) * 0.55;
  for (let it = 0; it < 320; it++) {
    const temp = 1 - it / 320;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy || 0.01;
        if (d2 > 160000) continue;
        const f = (k * k) / d2;
        pos[i].vx += dx * f * 0.05; pos[i].vy += dy * f * 0.05;
        pos[j].vx -= dx * f * 0.05; pos[j].vy -= dy * f * 0.05;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - k) * 0.04;
      pos[a].vx += (dx / d) * f; pos[a].vy += (dy / d) * f;
      pos[b].vx -= (dx / d) * f; pos[b].vy -= (dy / d) * f;
    }
    for (const p of pos) {
      p.vx += (width / 2 - p.x) * 0.012;
      p.vy += (height / 2 - p.y) * 0.012;
      const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const max = 18 * temp + 1;
      if (sp > max) { p.vx = (p.vx / sp) * max; p.vy = (p.vy / sp) * max; }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  // fit everything into the viewport
  if (!pos.length) return [];
  const pad = 40;
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const sc = Math.min((width - pad * 2) / Math.max(maxX - minX, 1), (height - pad * 2) / Math.max(maxY - minY, 1), 1.6);
  const ox = (width - (maxX - minX) * sc) / 2, oy = (height - (maxY - minY) * sc) / 2;
  return pos.map((p) => ({ x: ox + (p.x - minX) * sc, y: oy + (p.y - minY) * sc }));
}
