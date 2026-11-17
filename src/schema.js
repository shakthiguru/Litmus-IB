// Data model for the CRM system of record.
// Every write (UI, import, AI) goes through store.applyOps, which validates against this schema.

export const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
export const STAGE_PROBABILITY = { Lead: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };
export const INDUSTRIES = ['Banking', 'Insurance', 'Fintech', 'Retail', 'Telecom', 'Healthcare', 'Manufacturing', 'Technology', 'Other'];
export const TASK_STATUS = ['Open', 'Done'];
export const PRIORITIES = ['Low', 'Medium', 'High'];

export const SCHEMA = {
  companies: {
    label: 'Companies',
    singular: 'Company',
    event: 'company',
    prefix: 'co',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'industry', label: 'Industry', type: 'select', options: INDUSTRIES },
      { key: 'employees', label: 'Employees', type: 'number' },
      { key: 'website', label: 'Website' },
      { key: 'city', label: 'City' },
      { key: 'ownerId', label: 'Owner', type: 'user' },
    ],
    title: (r) => r.name,
  },
  contacts: {
    label: 'Contacts',
    singular: 'Contact',
    event: 'contact',
    prefix: 'ct',
    fields: [
      { key: 'firstName', label: 'First name', required: true },
      { key: 'lastName', label: 'Last name' },
      { key: 'title', label: 'Job title' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone' },
      { key: 'companyId', label: 'Company', type: 'ref', ref: 'companies' },
      { key: 'ownerId', label: 'Owner', type: 'user' },
    ],
    title: (r) => [r.firstName, r.lastName].filter(Boolean).join(' '),
  },
  deals: {
    label: 'Deals',
    singular: 'Deal',
    event: 'deal',
    prefix: 'dl',
    fields: [
      { key: 'name', label: 'Deal name', required: true },
      { key: 'companyId', label: 'Company', type: 'ref', ref: 'companies' },
      { key: 'contactId', label: 'Primary contact', type: 'ref', ref: 'contacts' },
      { key: 'amount', label: 'Amount (USD)', type: 'number' },
      { key: 'stage', label: 'Stage', type: 'select', options: STAGES, required: true },
      { key: 'closeDate', label: 'Expected close', type: 'date' },
      { key: 'ownerId', label: 'Owner', type: 'user' },
    ],
    title: (r) => r.name,
  },
  tasks: {
    label: 'Tasks',
    singular: 'Task',
    event: 'task',
    prefix: 'tk',
    fields: [
      { key: 'title', label: 'Title', required: true },
      { key: 'dueDate', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: TASK_STATUS },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
      { key: 'dealId', label: 'Deal', type: 'ref', ref: 'deals' },
      { key: 'contactId', label: 'Contact', type: 'ref', ref: 'contacts' },
      { key: 'companyId', label: 'Company', type: 'ref', ref: 'companies' },
      { key: 'assigneeId', label: 'Assignee', type: 'user' },
    ],
    title: (r) => r.title,
  },
  notes: {
    label: 'Notes',
    singular: 'Note',
    event: 'note',
    prefix: 'nt',
    fields: [
      { key: 'body', label: 'Note', type: 'textarea', required: true },
      { key: 'dealId', label: 'Deal', type: 'ref', ref: 'deals' },
      { key: 'contactId', label: 'Contact', type: 'ref', ref: 'contacts' },
      { key: 'companyId', label: 'Company', type: 'ref', ref: 'companies' },
    ],
    title: (r) => (r.body || '').slice(0, 60),
  },
};

export const ENTITY_KEYS = Object.keys(SCHEMA);

export function recordTitle(entity, rec) {
  if (!rec) return '(deleted)';
  return SCHEMA[entity]?.title(rec) || rec.id;
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return '$' + v.toLocaleString();
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
