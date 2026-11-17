import { test, expect } from '../../lib/fixtures';

test('TC-NAV-001 Drawer lists Accounts and Payments sections', async ({ page }) => {
  await page.goto('/dashboard');
  const drawer = page.getByTestId('drawer');
  // Section headings are upper-cased by CSS, so match them case-insensitively.
  for (const text of [/accounts/i, /payments/i, 'International Payment', 'Pre-Existing Deal (IBG)', 'Payment Tracker', 'Drafts'])
    await expect(drawer).toContainText(text);
});

const items: [string, string, string][] = [
  ['TC-NAV-002', 'menu-item-dashboard', '/dashboard'],
  ['TC-NAV-003', 'menu-item-intl-payment', '/payment/international'],
  ['TC-NAV-004', 'menu-item-ibg-deal', '/payment/ibg-deal'],
  ['TC-NAV-005', 'menu-item-approvals', '/approvals'],
  ['TC-NAV-006', 'menu-item-drafts', '/drafts'],
];
for (const [id, testid, route] of items) {
  test(`${id} Menu ${testid} navigates to ${route}`, async ({ page }) => {
    await page.goto('/settings');
    await page.getByTestId(testid).click();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`));
  });
}

test('TC-NAV-007 Menu toggle collapses and restores the drawer', async ({ page }) => {
  await page.goto('/dashboard');
  const drawer = page.getByTestId('drawer');
  await expect(drawer).not.toHaveClass(/closed/);
  await page.getByTestId('menu-toggle').click();
  await expect(drawer).toHaveClass(/closed/);
  await page.getByTestId('menu-toggle').click();
  await expect(drawer).not.toHaveClass(/closed/);
});

test('TC-NAV-008 Payments menu group has data-testid menu-item-payments', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('drawer')).toBeVisible();
  await expect(page.getByTestId('menu-item-payments')).toHaveCount(1);
});

test('TC-NAV-009 Unknown route shows a not-found page', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
