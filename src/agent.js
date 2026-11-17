// Task agent: turns a CRM task into a finished deliverable (document, email or deck).
// It gathers CRM context, reads attachments and previous versions, drafts with Claude
// (or an offline template), saves a versioned deliverable and exposes live job state.
import { useSyncExternalStore } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { recordTitle, fmtMoney, fmtDate, todayISO, STAGE_PROBABILITY } from './schema.js';
import { getState, getAISettings, mutate, byId, userName, uid } from './store.js';

// ---------------------------------------------------------------- job store
const jobs = new Map(); // taskId -> job
const jobListeners = new Set();
let jobsVersion = 0;
const emit = () => { jobsVersion++; jobListeners.forEach((f) => f()); };
export function useJobs() {
  useSyncExternalStore((f) => { jobListeners.add(f); return () => jobListeners.delete(f); }, () => jobsVersion);
  return jobs;
}
export function getJob(taskId) { return jobs.get(taskId); }

// ---------------------------------------------------------------- task understanding
export const KINDS = {
  document: { label: 'Document', icon: 'doc' },
  email: { label: 'Email', icon: 'mail' },
  deck: { label: 'Slide deck', icon: 'deck' },
};

export function detectKind(title = '') {
  const t = title.toLowerCase();
  if (/\b(deck|presentation|slides?|pitch|demo)\b/.test(t)) return 'deck';
  if (/\b(proposal|report|assessment|review|redlines?|sow|plan|document|brief|summary|sample)\b/.test(t)) return 'document';
  if (/\b(email|follow ?up|schedule|call|meeting|kickoff|reply|reach out|intro|remind)\b/.test(t)) return 'email';
  return 'document';
}

export function deliverableName(task, kind) {
  const base = task.title.replace(/^(send|share|prepare|create|draft|write|make|do|demo|schedule|follow up on|follow up)\s+/i, '').trim();
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  if (kind === 'email') return 'Email: ' + task.title;
  return cap || task.title;
}

export function taskContext(db, task) {
  const deal = byId(db, 'deals', task.dealId);
  const company = byId(db, 'companies', task.companyId || deal?.companyId);
  const contact = byId(db, 'contacts', task.contactId || deal?.contactId);
  const notes = db.notes
    .filter((n) => (deal && n.dealId === deal.id) || (company && n.companyId === company.id) || (contact && n.contactId === contact.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const otherTasks = db.tasks.filter((t) => t.id !== task.id && ((deal && t.dealId === deal.id) || (company && t.companyId === company.id)));
  const contacts = company ? db.contacts.filter((c) => c.companyId === company.id) : [];
  const otherDeals = company ? db.deals.filter((d) => d.companyId === company.id && d.id !== deal?.id) : [];
  const dealHistory = deal ? db.history.filter((h) => h.entity === 'deals' && h.entityId === deal.id && h.action === 'update') : [];
  const previous = (db.deliverables || [])
    .filter((d) => d.taskId === task.id || (deal && d.dealId === deal.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { task, deal, company, contact, contacts, notes, otherTasks, otherDeals, dealHistory, previous, owner: userName(db, deal?.ownerId || task.assigneeId), org: db.settings.orgName || 'Litmus CRM' };
}

export function defaultInstruction(task, ctx, kind) {
  const who = ctx.contact ? `${recordTitle('contacts', ctx.contact)} (${ctx.contact.title || 'contact'})` : 'the client';
  const t = task.title.toLowerCase();
  const prevSame = ctx.previous.find((p) => p.kind === kind);
  if (kind === 'deck') return `Build a client-ready slide deck for "${task.title}" for ${who} at ${ctx.company?.name || 'the client'}. Tell a clear story: their situation, our approach, scope, timeline, commercials and next steps. Use the deal notes for what matters to them.`;
  if (kind === 'email') return `Write the email to ${who} that completes the task "${task.title}". Keep it short, specific to the deal, with one clear ask and proposed times or next step where relevant.`;
  if (/revis/.test(t) && /proposal/.test(t))
    return `Produce the revised commercial proposal for ${ctx.deal?.name || 'this deal'}. ${prevSame ? `Start from the latest version (v${prevSame.version}) and` : 'Based on the deal details,'} apply the changes implied by the latest notes, emails and attachments (scope, pricing, discount requests, timelines). Include a "What changed in this revision" section at the top, a commercial table and clear terms.`;
  if (/proposal/.test(t)) return `Produce the commercial proposal for ${ctx.deal?.name || 'this deal'}: executive summary, understanding of needs, scope, approach, timeline, team, commercials table, assumptions and next steps.`;
  if (/redline|msa|legal/.test(t)) return `Prepare a redline review memo for "${task.title}": list each likely contested clause, our position, fallback position and risk rating, then a recommended response to the client.`;
  if (/assessment|report|sample/.test(t)) return `Produce the "${deliverableName(task, kind)}" as a finished, client-ready document tailored to ${ctx.company?.name || 'the client'}.`;
  return `Complete the task "${task.title}" by producing the finished deliverable, ready to send or use.`;
}

// ---------------------------------------------------------------- context as text for the model
function contextText(ctx) {
  const L = [];
  const { task, deal, company, contact } = ctx;
  L.push(`## Task\n- Title: ${task.title}\n- Due: ${task.dueDate || 'n/a'} | Priority: ${task.priority || 'n/a'} | Status: ${task.status}\n- Assignee: ${userName(getState(), task.assigneeId) || 'n/a'}`);
  if (deal) L.push(`## Deal\n- Name: ${deal.name}\n- Stage: ${deal.stage} (${STAGE_PROBABILITY[deal.stage]}% probability)\n- Amount: ${fmtMoney(deal.amount)} (USD ${Number(deal.amount || 0).toLocaleString()})\n- Expected close: ${deal.closeDate || 'n/a'}\n- Owner: ${ctx.owner}`);
  if (ctx.dealHistory.length) L.push(`## Deal history\n` + ctx.dealHistory.map((h) => `- ${h.ts.slice(0, 10)} ${h.actorName}: ${h.changes.map((c) => `${c.field} ${c.from} -> ${c.to}`).join('; ')}`).join('\n'));
  if (company) L.push(`## Company\n- ${company.name}, ${company.industry || ''}, ${company.employees ? company.employees.toLocaleString() + ' employees' : ''}, ${company.city || ''}, ${company.website || ''}`);
  if (contact) L.push(`## Primary contact\n- ${recordTitle('contacts', contact)}, ${contact.title || ''}, ${contact.email || ''}, ${contact.phone || ''}`);
  const others = ctx.contacts.filter((c) => c.id !== contact?.id);
  if (others.length) L.push(`## Other contacts at the company\n` + others.map((c) => `- ${recordTitle('contacts', c)}, ${c.title || ''}`).join('\n'));
  if (ctx.notes.length) L.push(`## Notes (newest first)\n` + ctx.notes.slice(0, 15).map((n) => `- ${n.createdAt.slice(0, 10)}: ${n.body}`).join('\n'));
  if (ctx.otherTasks.length) L.push(`## Related tasks\n` + ctx.otherTasks.map((t) => `- [${t.status}] ${t.title} (due ${t.dueDate})`).join('\n'));
  if (ctx.otherDeals.length) L.push(`## Other deals with this company\n` + ctx.otherDeals.map((d) => `- ${d.name}: ${fmtMoney(d.amount)}, ${d.stage}`).join('\n'));
  return L.join('\n\n');
}

const FORMAT_RULES = {
  document: 'Output a complete document in Markdown. Start with a single "# " title line. Use "## " section headings, bullet lists and Markdown tables (| col | col |) for commercials and timelines.',
  email: 'Output the email only. First line: "Subject: <subject>". Then a blank line, then the body in plain text or light Markdown, ending with a sign-off from the deal owner.',
  deck: 'Output a slide deck in Markdown. Separate slides with a line containing only "---". Each slide starts with "# <slide title>", then 3 to 6 concise bullets or a small table, then optionally a line "Notes: <speaker notes>". 7 to 10 slides; the first slide is the title slide.',
};

function systemPrompt(ctx, kind) {
  return `You are a senior enterprise sales and delivery professional at ${ctx.org}, working inside its CRM. You complete CRM tasks by producing the finished deliverable itself, not advice about how to do it.

Rules:
- Use the CRM context, attachments and any previous versions provided. Do not invent facts about the client; where something essential is unknown, insert a clear placeholder like [confirm: ...].
- When a previous version exists and the task is a revision, carry over everything still valid and apply only the changes justified by newer notes, emails or attachments. List the changes.
- Amounts are USD unless the context says otherwise. Today is ${todayISO()}.
- Write in a crisp, professional, client-ready tone.
- ${FORMAT_RULES[kind]}
- Output only the deliverable, with no preamble or closing commentary.`;
}

function userContent({ ctx, kind, instruction, attachments, base }) {
  const blocks = [];
  for (const a of attachments) {
    if (a.kind === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 }, title: a.name });
    else if (a.kind === 'image') blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.base64 } });
  }
  let text = `# CRM context\n\n${contextText(ctx)}\n`;
  const textAtt = attachments.filter((a) => a.kind === 'text');
  if (textAtt.length) text += `\n# Attachments provided by the user\n` + textAtt.map((a) => `<attachment name="${a.name}">\n${a.text.slice(0, 60000)}\n</attachment>`).join('\n') + '\n';
  const pdfs = attachments.filter((a) => a.kind !== 'text');
  if (pdfs.length) text += `\n(The user also attached: ${pdfs.map((a) => a.name).join(', ')}; see the attached files above.)\n`;
  const prev = base || ctx.previous.find((p) => p.kind === kind);
  if (prev) text += `\n# Latest previous version (v${prev.version}, ${prev.createdAt.slice(0, 10)}): ${prev.title}\n<previous_version>\n${prev.content}\n</previous_version>\n`;
  text += `\n# Your job\nDeliverable type: ${KINDS[kind].label}\n${instruction}`;
  blocks.push({ type: 'text', text });
  return blocks;
}

// ---------------------------------------------------------------- offline template drafts
function templateDraft(ctx, kind, instruction, base, attachments) {
  const { task, deal, company, contact } = ctx;
  const co = company?.name || '[confirm: client name]';
  const cn = contact ? recordTitle('contacts', contact) : '[confirm: contact name]';
  const first = contact?.firstName || 'there';
  const amount = Number(deal?.amount || 0);
  const discountNote = ctx.notes.find((n) => /discount|price|budget|cost/i.test(n.body));
  const pct = discountNote && (discountNote.body.match(/(\d{1,2})\s*(%|percent)/i) || [])[1];
  const revised = /revis/i.test(task.title) || !!base;
  const newAmount = pct ? Math.round(amount * (1 - Number(pct) / 200)) : amount; // offer half the requested discount as a counter
  const textAtt = attachments.filter((a) => a.kind === 'text');

  if (kind === 'email') {
    const subject = /schedule|call|meeting/i.test(task.title) ? `${deal?.name || task.title}: scheduling our next conversation` : `${deal?.name || task.title}: ${task.title.toLowerCase()}`;
    return `Subject: ${subject}

Hi ${first},

Thank you for your time on ${deal?.name || 'this initiative'}. ${/schedule|call/i.test(task.title) ? 'I would like to set up a 45-minute scoping call to align on objectives, environments and success criteria.' : `As discussed, here is the next step on "${task.title.toLowerCase()}".`}

${ctx.notes[0] ? `Based on our last conversation (${ctx.notes[0].body.replace(/\.$/, '')}), we will focus on what matters most to your team.\n\n` : ''}Could you let me know which of these slots works for you?
- ${fmtDate(todayISO(2))}, 11:00 to 11:45
- ${fmtDate(todayISO(3))}, 15:00 to 15:45
- ${fmtDate(todayISO(4))}, 10:00 to 10:45

Happy to adjust to your calendar.

Best regards,
${ctx.owner || '[your name]'}
${ctx.org}`;
  }

  if (kind === 'deck') {
    return `# ${deal?.name || task.title}
Prepared for ${co} | ${fmtDate(todayISO())}
Notes: Open by thanking ${cn} and restating the goal of the session.
---
# Where ${co} is today
- ${company?.industry || 'Industry'} organisation, ${company?.employees ? company.employees.toLocaleString() + ' employees' : '[confirm size]'}, based in ${company?.city || '[confirm]'}
${ctx.notes.slice(0, 3).map((n) => '- ' + n.body).join('\n') || '- [confirm: current challenges]'}
---
# What success looks like
- Faster, safer releases with measurable quality gates
- Lower cost of quality through automation and reuse
- Clear visibility for leadership on risk before go-live
---
# Our approach
- Discover: assess current state, environments and priorities (weeks 1 to 2)
- Build: accelerators, automation and test assets (weeks 3 to 8)
- Run: execute, report and continuously improve (week 9 onwards)
---
# Scope
- In scope: ${deal?.name || '[confirm scope]'}
- Out of scope: [confirm]
- Dependencies: environment access, test data, SME availability
---
# Timeline
| Phase | Duration | Outcome |
| --- | --- | --- |
| Discover | 2 weeks | Assessment and plan |
| Build | 6 weeks | Automation and assets ready |
| Run | Ongoing | Release quality reports |
---
# Commercials
| Item | Value |
| --- | --- |
| Total investment | ${fmtMoney(newAmount)} |
| Target start | ${fmtDate(todayISO(14))} |
| Expected close | ${fmtDate(deal?.closeDate)} |
---
# Next steps
- Confirm scope and success criteria with ${cn}
- Share commercial proposal and agree timeline
- Kick off discovery by ${fmtDate(todayISO(14))}`;
  }

  // document
  const title = deliverableName(task, kind) + (deal ? ` - ${deal.name}` : '');
  const changes = revised
    ? `## What changed in this revision
${base ? `- Based on v${base.version} dated ${base.createdAt.slice(0, 10)}` : '- First formal revision generated from CRM data'}
${ctx.notes.slice(0, 3).map((n) => `- Reflects note of ${n.createdAt.slice(0, 10)}: ${n.body}`).join('\n')}
${pct ? `- Commercial adjustment: counter-offer of ${Number(pct) / 2}% against the requested ${pct}% discount` : ''}
${textAtt.length ? textAtt.map((a) => `- Considered attachment: ${a.name}`).join('\n') : ''}
`
    : '';
  if (/redline|msa|legal/i.test(task.title)) {
    return `# ${title}

${changes}## Summary
Review of the MSA redlines for ${co}. Owner: ${ctx.owner}.

## Clause review
| Clause | Client position | Our position | Fallback | Risk |
| --- | --- | --- | --- | --- |
| Limitation of liability | [confirm] | Capped at 12 months fees | 18 months fees | High |
| Payment terms | [confirm] | Net 30 | Net 45 | Medium |
| IP ownership | [confirm] | Client owns deliverables, we keep accelerators | Perpetual licence to accelerators | Medium |
| Termination for convenience | [confirm] | 60 days notice | 30 days with wind-down fees | Medium |

## Recommended response
- Accept non-material wording changes
- Hold on liability cap and accelerator IP
- Propose a call with ${cn} and legal to close open points by ${fmtDate(todayISO(5))}`;
  }
  return `# ${title}

**Prepared for:** ${cn}, ${co}
**Prepared by:** ${ctx.owner}, ${ctx.org}
**Date:** ${fmtDate(todayISO())}${base ? `  \n**Version:** v${base.version + 1}` : ''}

${changes}## Executive summary
${co} has asked ${ctx.org} to support the ${deal ? deal.name : 'programme'} initiative. This proposal sets out our understanding of your needs, scope, approach, timeline and commercials${revised ? ', updated to reflect the latest discussions' : ''}.

## Understanding of your needs
${ctx.notes.map((n) => '- ' + n.body).join('\n') || '- [confirm: key needs from discovery]'}

## Scope of work
- Assessment of current processes, tools and environments
- Design and build of the solution and reusable assets
- Execution, reporting and knowledge transfer
- Out of scope: [confirm]

## Timeline
| Phase | Duration | Key outcome |
| --- | --- | --- |
| Discovery | 2 weeks | Assessment report and plan |
| Build | 6 weeks | Solution and assets ready |
| Execute and transition | 4 weeks | Results and handover |

## Commercials
| Item | Amount (USD) |
| --- | --- |
| Professional services | ${fmtMoney(newAmount * 0.85)} |
| Accelerators and tooling | ${fmtMoney(newAmount * 0.15)} |
| **Total** | **${fmtMoney(newAmount)}** |
${pct ? `\nA ${Number(pct) / 2}% commercial concession is included in response to the requested ${pct}% discount, conditional on signature by ${fmtDate(deal?.closeDate)}.\n` : ''}
## Assumptions
- Timely access to environments, data and subject matter experts
- Prices exclude applicable taxes
- Validity: 30 days from the date above

## Next steps
1. Review this proposal with ${cn}
2. Confirm scope and commercials
3. Sign and kick off by ${fmtDate(todayISO(14))}`;
}

// ---------------------------------------------------------------- run a job
export function startJob({ task, kind, instruction, attachments = [], base = null, user, refine = null }) {
  const db = getState();
  const ctx = taskContext(db, task);
  const ai = getAISettings();
  const useClaude = !!ai.apiKey;
  const job = {
    taskId: task.id, kind, status: 'running', text: '', error: null, deliverableId: null,
    steps: [], startedAt: Date.now(), model: useClaude ? ai.model : 'template', abort: null,
  };
  const step = (label, state = 'done') => { job.steps = [...job.steps.filter((s) => s.label !== label), { label, state }]; emit(); };
  jobs.set(task.id, job);
  emit();

  (async () => {
    try {
      step(`Read task, deal${ctx.deal ? ` "${ctx.deal.name}"` : ''}, company and contact`);
      step(`Read ${ctx.notes.length} note(s), ${ctx.otherTasks.length} related task(s) and deal history`);
      const prev = base || ctx.previous.find((p) => p.kind === kind);
      if (prev) step(`Reviewed latest version: ${prev.title} v${prev.version}`);
      if (attachments.length) step(`Read ${attachments.length} attachment(s): ${attachments.map((a) => a.name).join(', ')}`);
      const draftLabel = useClaude ? `Drafting with Claude (${ai.model})` : 'Drafting from CRM template (offline mode)';
      step(draftLabel, 'running');

      let content = '';
      if (useClaude) {
        const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
        const messages = [{ role: 'user', content: userContent({ ctx, kind, instruction, attachments, base: prev }) }];
        if (refine) {
          messages.push({ role: 'assistant', content: refine.previous });
          messages.push({ role: 'user', content: `Revise the deliverable with this feedback and output the complete updated deliverable in the same format:\n${refine.feedback}` });
        }
        const params = { model: ai.model || 'claude-opus-5-5', max_tokens: 32000, system: systemPrompt(ctx, kind), output_config: { effort: ai.effort || 'medium' }, messages };
        const run = async (withFallbacks) => {
          const stream = withFallbacks
            ? client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
            : client.messages.stream(params);
          job.abort = () => stream.abort();
          stream.on('text', (d) => { job.text += d; emit(); });
          return stream.finalMessage();
        };
        let final;
        try { final = await run(true); } catch (e) {
          if (e?.status === 400 && /fallback/i.test(e.message || '')) { job.text = ''; final = await run(false); } else throw e;
        }
        if (final.stop_reason === 'refusal') throw new Error('The model declined this request. Try rephrasing the instruction.');
        content = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
        if (final.stop_reason === 'max_tokens') content += '\n\n[Output was cut off at the token limit.]';
      } else {
        const full = refine
          ? refine.previous + `\n\n## Requested changes (apply manually or add an API key for Claude)\n- ${refine.feedback}`
          : templateDraft(ctx, kind, instruction, prev, attachments);
        // simulate streaming so the workspace behaves the same in both modes
        for (let i = 0; i < full.length; i += 60) {
          if (job.status !== 'running') return;
          job.text = full.slice(0, i + 60);
          emit();
          await new Promise((r) => setTimeout(r, 12));
        }
        content = full;
      }
      step(draftLabel, 'done');

      const sameTask = (getState().deliverables || []).filter((d) => d.taskId === task.id && d.kind === kind);
      const version = Math.max(prev && prev.kind === kind ? prev.version : 0, ...sameTask.map((d) => d.version), 0) + 1;
      let title = deliverableName(task, kind);
      if (kind === 'email') { const m = content.match(/^subject:\s*(.+)$/im); if (m) title = 'Email: ' + m[1].trim(); }
      if (kind === 'document') { const m = content.match(/^#\s+(.+)$/m); if (m) title = m[1].trim(); }
      const d = {
        id: 'dv_' + uid(), taskId: task.id, dealId: ctx.deal?.id || '', companyId: ctx.company?.id || '', contactId: ctx.contact?.id || '',
        title, kind, content, version, model: job.model, instruction: refine ? refine.feedback : instruction,
        sources: job.steps.map((s) => s.label).filter((l) => !/^Drafting/.test(l)),
        attachments: attachments.map((a) => a.name), createdAt: new Date().toISOString(), createdBy: user.id,
      };
      mutate((s) => ({ ...s, deliverables: [d, ...(s.deliverables || [])].slice(0, 300) }));
      step(`Saved deliverable v${version}`);
      Object.assign(job, { status: 'done', deliverableId: d.id, text: content, abort: null });
      emit();
    } catch (e) {
      Object.assign(job, { status: job.status === 'cancelled' ? 'cancelled' : 'error', error: e?.message || String(e), abort: null });
      job.steps = job.steps.map((s) => (s.state === 'running' ? { ...s, state: 'error' } : s));
      emit();
    }
  })();
  return job;
}

export function cancelJob(taskId) {
  const j = jobs.get(taskId);
  if (!j || j.status !== 'running') return;
  j.status = 'cancelled';
  j.abort?.();
  emit();
}

export function deleteDeliverable(id) {
  mutate((s) => ({ ...s, deliverables: s.deliverables.filter((d) => d.id !== id) }));
}

export function updateDeliverableContent(id, content) {
  mutate((s) => ({ ...s, deliverables: s.deliverables.map((d) => (d.id === id ? { ...d, content, editedAt: new Date().toISOString() } : d)) }));
}

export async function readAttachment(file) {
  const name = file.name;
  const mime = file.type || '';
  const toB64 = async () => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return { name, kind: 'pdf', mime: 'application/pdf', base64: await toB64(), size: file.size };
  if (/^image\/(png|jpe?g|gif|webp)$/.test(mime)) return { name, kind: 'image', mime, base64: await toB64(), size: file.size };
  if (/\.(docx|pptx|xlsx)$/i.test(name)) throw new Error(`${name}: Office files are not supported yet. Save as PDF or paste the text instead.`);
  return { name, kind: 'text', text: await file.text(), size: file.size };
}
