# ABDX Playwright suite

154 automated test cases for ABDX (https://abdx.vercel.app), one Playwright test per catalogue ID.

| Path | What it is |
|---|---|
| `catalogue/testcases.js` | The test catalogue (single source of truth). `npm run catalogue` renders `testcases.html` and `testcases.csv`. |
| `tests/seed` | Resets the app and checks seed data. Runs first, one worker. |
| `tests/parallel` | Every other test. Fully parallel; each test creates its own data and finds it by captured reference number. |
| `tests/stateful` | Dashboard pending-count checks. Runs last, one worker. |
| `pages/` | Page objects (login, international payment, approvals, drafts, IBG deal). |
| `lib/api.ts` | Backend API client used for data setup and contract tests. |
| `scripts/run-all.js` | Runs the three passes in order, merges results, builds the report. |

## Run

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
WORKERS=12 npm run test:all
```

Open `reports/abdx-report.html` (executive summary) or `reports/playwright-html/index.html` (step-level detail).

Environment variables: `ABDX_BASE_URL` (default `https://abdx.vercel.app`), `ABDX_USER` (default `MASHREQCORP`, falls back to `demo`), `ABDX_PASS` (default `Test@123`), `WORKERS` (default 12).

## Scale out

`.github/workflows/abdx-tests.yml` runs the same three passes on GitHub Actions, splitting the parallel pass across N runners (manual trigger, default 8), and publishes the merged report as a build artifact.

## Notes

- The app's database is shared. Never run `POST /api/reset` while other tests are running; only the seed pass does it.
- Tests from the AI Lens report (`TC-SEC-*` and a few others) are expected to fail until the defects are fixed.
