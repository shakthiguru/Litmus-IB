import { test, expect } from '../../lib/fixtures';

test('TC-DASH-002 Payment Tracker mini shows ref, beneficiary, amount, status', async ({ page }) => {
  await page.goto('/dashboard');
  const tracker = page.getByTestId('dashboard-tracker');
  for (const h of [/reference/i, /beneficiary/i, /amount/i, /status/i]) await expect(tracker.locator('th', { hasText: h })).toHaveCount(1);
  await expect(tracker.locator('tbody tr').first()).toContainText(/(CBP|IBG)\d{10}/);
});

test('TC-DASH-005 Pending tile "Open Payment Tracker" opens Approvals', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByTestId('tile-pending-approvals').getByRole('link', { name: /Open Payment Tracker/ }).click();
  await expect(page).toHaveURL(/\/approvals$/);
});

test('TC-DASH-006 Notifications bell opens a panel', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByTestId('topbar-notifications').click();
  await expect(page.getByText(/notifications/i).first()).toBeVisible({ timeout: 5_000 });
});
