import { DEMO_WORKSPACE, DEMO_DOMAIN } from './brand.js';
// Demo data so the CRM is useful on first login. All names are fictional.
import { todayISO } from './schema.js';

export const DEFAULT_USERS = [
  { id: 'u_admin', name: 'Admin User', email: `admin@${DEMO_DOMAIN}`, role: 'admin', password: 'Nodus@2026' },
  { id: 'u_sales', name: 'Priya Sharma', email: `sales@${DEMO_DOMAIN}`, role: 'member', password: 'Sales@2026' },
  { id: 'u_rahul', name: 'Rahul Mehta', email: `rahul@${DEMO_DOMAIN}`, role: 'member', password: 'Rahul@2026' },
];

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};

export function buildSeed() {
  const companies = [
    ['co_1', 'Northwind Bank', 'Banking', 12000, 'northwind-bank.example', 'Mumbai', 'u_sales'],
    ['co_2', 'Bluepeak Insurance', 'Insurance', 4200, 'bluepeak.example', 'Bengaluru', 'u_rahul'],
    ['co_3', 'Kestrel Payments', 'Fintech', 650, 'kestrelpay.example', 'Singapore', 'u_sales'],
    ['co_4', 'Orbit Telecom', 'Telecom', 18000, 'orbit-tel.example', 'Delhi', 'u_rahul'],
    ['co_5', 'Greenleaf Retail', 'Retail', 9000, 'greenleaf.example', 'Pune', 'u_sales'],
    ['co_6', 'Meridian Health', 'Healthcare', 3100, 'meridian-health.example', 'Chennai', 'u_admin'],
    ['co_7', 'Ironclad Manufacturing', 'Manufacturing', 7600, 'ironclad.example', 'Ahmedabad', 'u_rahul'],
    ['co_8', 'Lumen Capital', 'Banking', 2100, 'lumencap.example', 'Dubai', 'u_sales'],
    ['co_9', 'Cobalt Cloud', 'Technology', 900, 'cobaltcloud.example', 'Hyderabad', 'u_admin'],
    ['co_10', 'Harbor Mutual', 'Insurance', 5400, 'harbormutual.example', 'Kolkata', 'u_rahul'],
  ].map(([id, name, industry, employees, website, city, ownerId], i) => ({
    id, name, industry, employees, website, city, ownerId,
    createdAt: daysAgo(120 - i * 5), updatedAt: daysAgo(120 - i * 5),
  }));

  const contacts = [
    ['ct_1', 'Anita', 'Rao', 'CTO', 'co_1', 'u_sales'],
    ['ct_2', 'Vikram', 'Iyer', 'Head of QA', 'co_1', 'u_sales'],
    ['ct_3', 'Sara', 'Khan', 'VP Digital', 'co_2', 'u_rahul'],
    ['ct_4', 'Daniel', 'Tan', 'Engineering Director', 'co_3', 'u_sales'],
    ['ct_5', 'Meera', 'Nair', 'CIO', 'co_4', 'u_rahul'],
    ['ct_6', 'Arjun', 'Kapoor', 'Procurement Lead', 'co_4', 'u_rahul'],
    ['ct_7', 'Leela', 'Joshi', 'Head of Ecommerce', 'co_5', 'u_sales'],
    ['ct_8', 'Thomas', 'George', 'CTO', 'co_6', 'u_admin'],
    ['ct_9', 'Kavya', 'Reddy', 'Plant IT Manager', 'co_7', 'u_rahul'],
    ['ct_10', 'Omar', 'Farouk', 'COO', 'co_8', 'u_sales'],
    ['ct_11', 'Nisha', 'Verma', 'Platform Lead', 'co_9', 'u_admin'],
    ['ct_12', 'Rohan', 'Das', 'Head of Claims Tech', 'co_10', 'u_rahul'],
    ['ct_13', 'Isha', 'Malhotra', 'Release Manager', 'co_2', 'u_rahul'],
    ['ct_14', 'Karan', 'Bose', 'Security Architect', 'co_3', 'u_sales'],
  ].map(([id, firstName, lastName, title, companyId, ownerId], i) => ({
    id, firstName, lastName, title, companyId, ownerId,
    email: `${firstName}.${lastName}`.toLowerCase() + '@' + companies.find((c) => c.id === companyId).website,
    phone: '+91 98' + String(10000000 + i * 734521).slice(0, 8),
    createdAt: daysAgo(110 - i * 4), updatedAt: daysAgo(110 - i * 4),
  }));

  const deals = [
    ['dl_1', 'Northwind core banking test automation', 'co_1', 'ct_1', 420000, 'Negotiation', 20, 'u_sales'],
    ['dl_2', 'Bluepeak claims app performance testing', 'co_2', 'ct_3', 180000, 'Proposal', 35, 'u_rahul'],
    ['dl_3', 'Kestrel payments gateway security audit', 'co_3', 'ct_14', 95000, 'Qualified', 45, 'u_sales'],
    ['dl_4', 'Orbit 5G billing QA program', 'co_4', 'ct_5', 760000, 'Proposal', 60, 'u_rahul'],
    ['dl_5', 'Greenleaf ecommerce peak readiness', 'co_5', 'ct_7', 140000, 'Won', -10, 'u_sales'],
    ['dl_6', 'Meridian patient portal accessibility', 'co_6', 'ct_8', 65000, 'Lead', 75, 'u_admin'],
    ['dl_7', 'Ironclad MES integration testing', 'co_7', 'ct_9', 210000, 'Qualified', 50, 'u_rahul'],
    ['dl_8', 'Lumen Capital mobile banking revamp QA', 'co_8', 'ct_10', 330000, 'Negotiation', 15, 'u_sales'],
    ['dl_9', 'Cobalt Cloud SRE observability', 'co_9', 'ct_11', 120000, 'Lead', 90, 'u_admin'],
    ['dl_10', 'Harbor Mutual AI agent evaluation', 'co_10', 'ct_12', 260000, 'Proposal', 40, 'u_rahul'],
    ['dl_11', 'Northwind API contract testing', 'co_1', 'ct_2', 88000, 'Won', -30, 'u_sales'],
    ['dl_12', 'Orbit network ops automation', 'co_4', 'ct_6', 150000, 'Lost', -20, 'u_rahul'],
  ].map(([id, name, companyId, contactId, amount, stage, closeIn, ownerId], i) => ({
    id, name, companyId, contactId, amount, stage, ownerId,
    closeDate: todayISO(closeIn),
    createdAt: daysAgo(90 - i * 5), updatedAt: daysAgo(90 - i * 5),
  }));

  const tasks = [
    ['tk_1', 'Send revised commercial proposal', 2, 'Open', 'High', 'dl_1', 'ct_1', 'co_1', 'u_sales'],
    ['tk_2', 'Schedule performance test scoping call', -1, 'Open', 'High', 'dl_2', 'ct_3', 'co_2', 'u_rahul'],
    ['tk_3', 'Share security audit sample report', 4, 'Open', 'Medium', 'dl_3', 'ct_14', 'co_3', 'u_sales'],
    ['tk_4', 'Prepare 5G billing solution deck', 6, 'Open', 'High', 'dl_4', 'ct_5', 'co_4', 'u_rahul'],
    ['tk_5', 'Kickoff meeting with Greenleaf team', -12, 'Done', 'Medium', 'dl_5', 'ct_7', 'co_5', 'u_sales'],
    ['tk_6', 'Discovery call with Meridian CTO', 3, 'Open', 'Medium', 'dl_6', 'ct_8', 'co_6', 'u_admin'],
    ['tk_7', 'Follow up on MES test environment access', -3, 'Open', 'Low', 'dl_7', 'ct_9', 'co_7', 'u_rahul'],
    ['tk_8', 'Legal review of MSA redlines', 1, 'Open', 'High', 'dl_8', 'ct_10', 'co_8', 'u_sales'],
    ['tk_9', 'Send SRE maturity assessment', 8, 'Open', 'Low', 'dl_9', 'ct_11', 'co_9', 'u_admin'],
    ['tk_10', 'Demo agent evaluation harness', 5, 'Open', 'High', 'dl_10', 'ct_12', 'co_10', 'u_rahul'],
  ].map(([id, title, due, status, priority, dealId, contactId, companyId, assigneeId], i) => ({
    id, title, dueDate: todayISO(due), status, priority, dealId, contactId, companyId, assigneeId,
    createdAt: daysAgo(30 - i * 2), updatedAt: daysAgo(30 - i * 2),
  }));

  const notes = [
    ['nt_1', 'Anita wants test automation coverage for 3 core modules first. Budget approved for FY27 Q1.', 'dl_1', 'ct_1', 'co_1'],
    ['nt_2', 'Procurement asked for a 10 percent discount; holding until scope is final.', 'dl_8', 'ct_10', 'co_8'],
    ['nt_3', 'Meera is evaluating two other vendors. Our differentiator is the 5G billing accelerator.', 'dl_4', 'ct_5', 'co_4'],
    ['nt_4', 'Rohan is interested in evaluating their claims chatbot for hallucinations and policy errors.', 'dl_10', 'ct_12', 'co_10'],
  ].map(([id, body, dealId, contactId, companyId], i) => ({
    id, body, dealId, contactId, companyId, authorId: 'u_sales',
    createdAt: daysAgo(20 - i * 3), updatedAt: daysAgo(20 - i * 3),
  }));

  // Seed history so the timeline and "as of" view have something to show.
  const history = [];
  let hid = 0;
  const push = (h) => history.push({ id: 'h_seed_' + ++hid, actor: 'u_admin', actorName: 'System import', via: 'import', ...h });
  for (const [entity, rows] of [['companies', companies], ['contacts', contacts], ['deals', deals], ['tasks', tasks], ['notes', notes]]) {
    for (const r of rows) push({ ts: r.createdAt, entity, entityId: r.id, action: 'create', before: null, after: r, changes: [] });
  }
  const stageMoves = [
    ['dl_1', 'Qualified', 'Proposal', 40], ['dl_1', 'Proposal', 'Negotiation', 12],
    ['dl_4', 'Qualified', 'Proposal', 9], ['dl_8', 'Proposal', 'Negotiation', 6],
    ['dl_5', 'Negotiation', 'Won', 10], ['dl_12', 'Proposal', 'Lost', 18],
  ];
  for (const [id, from, to, ago] of stageMoves) {
    const d = deals.find((x) => x.id === id);
    push({
      ts: daysAgo(ago), entity: 'deals', entityId: id, action: 'update', actorName: 'Priya Sharma', actor: 'u_sales', via: 'ui',
      before: { ...d, stage: from }, after: { ...d, stage: to }, changes: [{ field: 'stage', from, to }],
    });
  }
  // Make the create snapshots consistent with the first stage in the move chain.
  for (const id of ['dl_1', 'dl_4', 'dl_8', 'dl_5', 'dl_12']) {
    const first = stageMoves.find((m) => m[0] === id);
    const created = history.find((h) => h.entityId === id && h.action === 'create');
    created.after = { ...created.after, stage: first[1] };
  }
  history.sort((a, b) => a.ts.localeCompare(b.ts));

  return {
    version: 1,
    users: [],
    companies, contacts, deals, tasks, notes,
    history,
    proposals: [],
    deliverables: [],
    connectors: { webhooks: [], slack: { url: '', enabled: false } },
    settings: { orgName: DEMO_WORKSPACE, autoApproveSafe: false },
  };
}
