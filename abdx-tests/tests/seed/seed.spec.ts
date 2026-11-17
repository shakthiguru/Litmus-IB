import { test, expect } from '../../lib/fixtures';

// Runs first, on one worker, in file order. Resets the shared database and verifies the seed
// before any other test creates or approves anything.
test.describe.configure({ mode: 'default' });

test('TC-API-017 POST /api/reset response shape', async ({ api }) => {
  const res = await api.reset();
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(Number.isNaN(Date.parse(body.resetAt))).toBe(false);
  const refs = (await api.transactions('All')).map(t => t.refNumber);
  expect(refs).toEqual(expect.arrayContaining(['CBP1000000001', 'CBP2000000002']));
});

test('TC-DR-001 Seeded Sunrise Textiles draft present after reset', async ({ drafts }) => {
  await drafts.goto();
  const row = drafts.row('Sunrise Textiles Ltd');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('GBP 25000');
});

test('TC-APR-001 Seeded transactions have expected status', async ({ approvals }) => {
  await approvals.goto();
  await expect(approvals.row('CBP1000000001').getByTestId('txn-status')).toHaveText('Pending Approval');
  await expect(approvals.row('CBP2000000002').getByTestId('txn-status')).toHaveText('Processed');
});
