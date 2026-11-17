# Litmus CRM

An AI-powered CRM built on the architecture of "CRM as system of record + knowledge graph read model + natural-language query + approval-gated AI actions + connectors".

Live app: https://shakthiguru.github.io/Litmus-IB/

## Demo logins

| Role   | Email            | Password     |
|--------|------------------|--------------|
| Admin  | admin@litmus.app | Litmus@2026  |
| Member | sales@litmus.app | Sales@2026   |
| Member | rahul@litmus.app | Rahul@2026   |

Change these in Settings after your first login.

## What is inside

| Layer | Where | What it does |
|---|---|---|
| System of record | `src/store.js` (`applyOps`) | Companies, contacts, deals, tasks, notes. Every write (UI, CSV import, AI) goes through one validated, all-or-nothing API. |
| Audit + temporal model | `history` in the store | Every change is logged with who, when, source and field-level before/after. Record drawers have a time-travel slider ("what was true when"). |
| Knowledge graph | `src/graph.js` | Read model built live from the records: companies, contacts, deals, tasks, notes, owners and their relationships. Interactive graph view plus traversal tool for the AI. |
| Natural-language query | `src/ai.js` | Built-in offline assistant (no key needed) plus a Claude copilot (paste an Anthropic API key in Settings) that uses tools: `search_records`, `get_record`, `graph_neighbors`, `pipeline_summary`. |
| AI actions with guardrails | `propose_changes` tool + Approvals page | AI never writes directly. It proposes operations; a human approves; then they are applied through the CRM API and logged. Deletes and bulk changes always need approval. |
| Connectors | Connectors page | Outbound webhooks for every record event (Zapier, Make, Activepieces, n8n, your own service), Slack notifications, CSV import/export, JSON backup/restore, tool manifest for external agents. |

## Important limits of this hosted version

This build is a static web app on GitHub Pages, so:

- **Data lives in each browser** (localStorage). Two people on two laptops do not see the same data. Use Settings > Backup to move data. A shared multi-user deployment needs a backend (for example Postgres/Supabase or Twenty CRM as the system of record); the store API (`applyOps`) is the seam to swap.
- **Login is a client-side gate**, not real security. Passwords are hashed, but anyone can read the app code and data in their own browser. Do not put confidential client data in it until it has a real backend with server-side auth.
- **The Anthropic API key** is kept in your browser and sent directly to api.anthropic.com. Use a key with a spend limit.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Every push runs `.github/workflows/deploy.yml`, which builds the app and publishes it to GitHub Pages.
If the first run fails at "configure-pages", open the repository Settings > Pages and set Source to "GitHub Actions", then re-run the workflow.
