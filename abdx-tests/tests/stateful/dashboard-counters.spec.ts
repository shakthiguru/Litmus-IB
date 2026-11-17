import { test, expect } from '../../lib/fixtures';
import { payment } from '../../pages/intl-payment';

// Runs last, on one worker: the pending count is global, so no other test may create or approve meanwhile.
test.describe.configure({ mode: 'serial' });

let ref = '';
let before = 0;

// The tile renders "0" while loading, so the baseline comes from the backend (DASH-001 proves UI and API agree).
const pendingCount = async (api: import('../../lib/api').Api) => (await api.transactions('Pending Approval')).length;

test('TC-DASH-001 Pending count matches backend pending transactions', async ({ page, api }) => {
  const expected = (await api.transactions('Pending Approval')).length;
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(expected));
});

test('TC-DASH-003 Pending count increments after a new submission', async ({ page, intl, api }) => {
  before = await pendingCount(api);
  ref = await intl.submit(payment());
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(before + 1));
});

test('TC-DASH-004 Pending count decrements after approval', async ({ page, approvals, api }) => {
  const now = await pendingCount(api);
  await approvals.goto();
  await approvals.approve(ref);
  await page.goto('/dashboard');
  await expect(page.getByTestId('pending-count')).toHaveText(String(now - 1));
});
