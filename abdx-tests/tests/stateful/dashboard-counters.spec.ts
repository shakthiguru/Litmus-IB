import { test, expect } from '../../lib/fixtures';
import { payment } from '../../pages/intl-payment';

// Runs last, on one worker: the pending count is global, so no other test may create or approve meanwhile.
test.describe.configure({ mode: 'serial' });

let ref = '';
let before = 0;

async function pendingCount(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  const el = page.getByTestId('pending-count');
  await expect(el).toHaveText(/^\d+$/);
  return Number(await el.innerText());
}

test('TC-DASH-001 Pending count matches backend pending transactions', async ({ page, api }) => {
  const expected = (await api.transactions('Pending Approval')).length;
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(expected));
});

test('TC-DASH-003 Pending count increments after a new submission', async ({ page, intl }) => {
  before = await pendingCount(page);
  ref = await intl.submit(payment());
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(before + 1));
});

test('TC-DASH-004 Pending count decrements after approval', async ({ page, approvals }) => {
  const now = await pendingCount(page);
  await approvals.goto();
  await approvals.approve(ref);
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(now - 1));
});
