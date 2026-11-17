import { test, expect } from '../../lib/fixtures';
import { CBP_REF } from '../../lib/env';

const ACME = 'ACME Trading LLC (GB)';
const GLOBAL = 'Global Imports Inc (US)';

test('TC-SB-001 Saved list shows seeded beneficiaries', async ({ intl }) => {
  await intl.goto();
  await intl.el('bene-type-saved').check();
  await expect(intl.el('saved-bene-select').locator('option')).toContainText([ACME, GLOBAL]);
});

test('TC-SB-002 ACME Trading LLC prefills GB / Barclays', async ({ intl }) => {
  await intl.goto();
  await intl.chooseSaved(ACME);
  await expect(intl.el('bene-name')).toHaveValue('ACME Trading LLC');
  await expect(intl.el('bene-account')).toHaveValue('DE89370400440532013000');
  await expect(intl.el('bene-country')).toHaveValue('GB');
  await expect(intl.el('routing-code-label')).toHaveText('Sort Code');
  await expect(intl.el('routing-code')).toHaveValue('20-00-00');
  await expect(intl.el('bank-name')).toHaveValue('Barclays');
  await expect(intl.el('bank-address')).toHaveValue('London');
  await expect(intl.el('swift-bic')).toHaveValue('BARCGB22');
});

test('TC-SB-003 Global Imports Inc prefills US / JPMorgan', async ({ intl }) => {
  await intl.goto();
  await intl.chooseSaved(GLOBAL);
  await expect(intl.el('bene-account')).toHaveValue('US1234567890');
  await expect(intl.el('bene-country')).toHaveValue('US');
  await expect(intl.el('routing-code-label')).toHaveText('Fedwire Code');
  await expect(intl.el('routing-code')).toHaveValue('021000021');
  await expect(intl.el('bank-name')).toHaveValue('JPMorgan Chase');
  await expect(intl.el('swift-bic')).toHaveValue('CHASUS33');
});

test('TC-SB-004 Prefilled saved fields are read-only', async ({ intl }) => {
  await intl.goto();
  await intl.chooseSaved(ACME);
  await expect(intl.el('bene-name')).toHaveValue('ACME Trading LLC');
  for (const id of ['bene-name', 'bene-account', 'routing-code']) await expect(intl.el(id)).not.toBeEditable();
});

test('TC-SB-005 Saved beneficiary end to end creates CBP ref', async ({ page, intl }) => {
  await intl.goto();
  await intl.chooseSaved(ACME);
  await expect(intl.el('bank-name')).toHaveValue('Barclays');
  await intl.fill({ amount: '500', currency: 'GBP' });
  await intl.continue();
  await page.waitForURL('**/payment/review');
  await expect(intl.el('review-bene-name')).toHaveText('ACME Trading LLC');
  await expect(intl.el('review-intermediary-bic')).toHaveText('HSBCGB2L');
  expect(await intl.submitFromReview()).toMatch(CBP_REF);
});

test('TC-SB-006 Switching back to adhoc clears saved values', async ({ intl }) => {
  await intl.goto();
  await intl.chooseSaved(ACME);
  await expect(intl.el('bene-name')).toHaveValue('ACME Trading LLC');
  await intl.el('bene-type-adhoc').check();
  await expect(intl.el('bene-name')).toBeEditable();
  await expect(intl.el('bene-name')).toHaveValue('');
  await expect(intl.el('bene-account')).toHaveValue('');
});
