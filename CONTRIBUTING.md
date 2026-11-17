# Contributing to Nodus CRM

Thanks for helping build an open-source AI CRM where agents do the work.

## Getting started

```bash
git clone https://github.com/shakthiguru/Litmus-IB.git nodus-crm
cd nodus-crm
npm install
npm run dev
```

Open the URL Vite prints and sign in with `admin@nodus.app` / `Nodus@2026`.

## Project map

| File | What lives there |
|---|---|
| `src/brand.js` | Product name, tagline, demo domain |
| `src/schema.js` | Record types and fields (companies, contacts, deals, tasks, notes) |
| `src/store.js` | System of record: `applyOps` (the only write path), history, proposals, connectors |
| `src/graph.js` | Knowledge graph read model, traversal and layout |
| `src/ai.js` | Copilot: read tools, `propose_changes`, Claude agent loop, offline assistant |
| `src/agent.js` | Task agent behind **Use AI**: context gathering, drafting, versioned deliverables |
| `src/workspace.jsx` | The AI task workspace UI |
| `src/pages.jsx`, `src/ui.jsx`, `src/App.jsx` | Screens and shared components |

## Ground rules

1. **Every write goes through `applyOps`.** Never mutate records anywhere else; that is what keeps validation, audit history and webhooks consistent.
2. **AI never writes directly.** AI-initiated record changes go through `submitProposal` and human approval.
3. **Keep it dependency-light.** React, Vite and the Anthropic SDK are the only runtime dependencies today. Discuss before adding more.
4. **Keep the offline mode working.** Features should degrade gracefully when no API key is set.

## Pull requests

- One focused change per PR, with a short description and screenshots for UI changes.
- Run `npm run build` before opening the PR.
- Good first areas: real `.pptx` / `.docx` export, a Postgres or Supabase backend behind the store API, more connectors, tests.

## Reporting security issues

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository instead.
