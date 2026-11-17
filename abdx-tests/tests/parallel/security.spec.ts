import { test, expect, NO_SESSION } from '../../lib/fixtures';
import { USER, PASS } from '../../lib/env';

// Checks raised by the AI Lens field report. Several are expected to fail today: that confirms the finding.

test('TC-SEC-001 Transactions API rejects calls without a token', async ({ request }) => {
  const res = await request.get('/api/transactions', { params: { status: 'All' } });
  expect([401, 403], `got ${res.status()}`).toContain(res.status());
});

test('TC-SEC-002 Drafts and beneficiaries APIs reject calls without a token', async ({ request }) => {
  const drafts = await request.get('/api/drafts');
  const benes = await request.get('/api/beneficiaries', { params: { kind: 'CROSS_BORDER' } });
  expect.soft([401, 403], `drafts got ${drafts.status()}`).toContain(drafts.status());
  expect.soft([401, 403], `beneficiaries got ${benes.status()}`).toContain(benes.status());
});

test.describe('fresh login', () => {
  test.use({ storageState: NO_SESSION });
  test('TC-SEC-003 Logout clears payment form data from sessionStorage', async ({ page, login, intl }) => {
    await login.loginOk(USER(), PASS);
    await intl.goto();
    await intl.el('bene-name').fill('Leak Probe Bene');
    await login.logout();
    const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }));
    expect.soft(stored, 'browser storage after logout').not.toContain('Leak Probe Bene');
    await login.loginOk(USER(), PASS);
    await intl.goto();
    await expect(intl.el('bene-name')).toHaveValue('');
  });
});

test('TC-SEC-004 Corporate Maker is not offered Approve', async ({ page, approvals }) => {
  await approvals.goto();
  await approvals.filter('Pending Approval');
  await expect(page.getByTestId('txn-row').first()).toBeVisible();
  await expect(page.getByTestId('btn-approve'), 'maker should not see Approve (segregation of duties)').toHaveCount(0);
});

test('TC-SEC-005 Transfer Money Continue does something', async ({ page }) => {
  await page.goto('/payment/transfer');
  await page.locator('main input[type=number]').fill('100');
  await page.locator('main').getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(1_500);
  const navigated = !/\/payment\/transfer$/.test(page.url());
  const feedback = await page.locator('[data-testid^="error"], [role=alert], .error, .toast').count();
  expect(navigated || feedback > 0, 'Continue should open review or show validation').toBe(true);
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('TC-SEC-006 No horizontal scroll at phone width', async ({ page }) => {
    for (const route of ['/dashboard', '/payment/international']) {
      await page.goto(route);
      await expect(page.getByTestId('user-menu')).toBeVisible();
      const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
      expect.soft(sw, `${route} scrollWidth vs viewport ${vw}`).toBeLessThanOrEqual(vw);
    }
  });
});

test('TC-SEC-007 Canada and New Zealand use correct routing terms', async ({ intl }) => {
  await intl.goto();
  await intl.el('bene-country').selectOption('CA');
  await expect.soft(intl.el('routing-code-label'), 'CA label').not.toHaveText('Sort Code');
  await intl.el('bene-country').selectOption('NZ');
  await expect.soft(intl.el('routing-code-label'), 'NZ label').not.toHaveText('Sort Code');
});

test('TC-SEC-008 Saved GB payee has a GB IBAN', async ({ api }) => {
  const acme = (await api.beneficiaries('CROSS_BORDER')).find(b => b.name === 'ACME Trading LLC');
  expect(acme.country).toBe('GB');
  expect(acme.accountIban, 'IBAN country prefix should match beneficiary country').toMatch(/^GB/);
});
