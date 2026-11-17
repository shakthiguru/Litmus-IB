import { test, expect } from '../../lib/fixtures';
import fs from 'fs';

test('TC-APR-002 Filter Pending Approval shows only pending', async ({ approvals }) => {
  await approvals.goto();
  await approvals.filter('Pending Approval');
  await expect.poll(async () => [...new Set(await approvals.statuses())]).toEqual(['Pending Approval']);
});

test('TC-APR-003 Filter Processed shows only processed', async ({ approvals }) => {
  await approvals.goto();
  await approvals.filter('Processed');
  await expect.poll(async () => [...new Set(await approvals.statuses())]).toEqual(['Processed']);
  await expect(approvals.row('CBP2000000002')).toHaveCount(1);
});

test('TC-APR-004 Filter All shows both statuses', async ({ approvals }) => {
  await approvals.goto();
  await approvals.filter('Processed');
  await approvals.filter('All');
  await expect.poll(async () => [...new Set(await approvals.statuses())].sort()).toEqual(['Pending Approval', 'Processed']);
});

test('TC-APR-005 Approve shown only on pending rows', async ({ page, approvals }) => {
  await approvals.goto();
  const rows = await page.getByTestId('txn-row').evaluateAll(rs => rs.map(r => ({
    status: r.querySelector('[data-testid=txn-status]')?.textContent?.trim(),
    approve: r.querySelectorAll('[data-testid=btn-approve]').length,
    download: r.querySelectorAll('[data-testid=btn-download]').length,
  })));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.download).toBe(1);
    expect(r.approve).toBe(r.status === 'Pending Approval' ? 1 : 0);
  }
});

test('TC-APR-006 Download returns the row as JSON', async ({ page, approvals }) => {
  await approvals.goto();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    approvals.row('CBP2000000002').getByTestId('btn-download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('CBP2000000002.json');
  const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(json).toMatchObject({ refNumber: 'CBP2000000002', beneficiaryName: 'Global Imports Inc', currency: 'USD', status: 'Processed' });
  expect(Number(json.amount)).toBe(42000);
});

test('TC-APR-007 Tracker columns are complete', async ({ page, approvals }) => {
  await approvals.goto();
  await expect(page.getByTestId('txn-table').locator('th')).toHaveText([
    /reference number/i, /beneficiary name/i, /amount/i, /currency/i, /country/i, /status/i, /created on/i, /action/i,
  ]);
});

test('TC-APR-008 Approved payment moves to Processed filter', async ({ api, approvals }) => {
  const txn = await api.createTxn({ beneficiaryName: 'APR-008 Bene' });
  await approvals.goto();
  await approvals.approve(txn.refNumber);
  await approvals.filter('Processed');
  await expect(approvals.row(txn.refNumber)).toHaveCount(1);
  await approvals.filter('Pending Approval');
  await expect(approvals.row(txn.refNumber)).toHaveCount(0);
});
