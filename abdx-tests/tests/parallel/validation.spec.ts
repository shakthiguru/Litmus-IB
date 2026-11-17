import { test, expect } from '../../lib/fixtures';
import { ERR, payment } from '../../pages/intl-payment';

test('TC-VAL-001 Empty form shows every required error', async ({ page, intl }) => {
  await intl.goto();
  await intl.continue();
  await expect(intl.el('error-bene-name')).toHaveText(ERR.name);
  await expect(intl.el('error-bene-account')).toHaveText(ERR.account);
  await expect(intl.el('error-country')).toHaveText(ERR.country);
  await expect(intl.el('error-amount')).toHaveText(ERR.amount);
  await expect(intl.el('error-currency')).toHaveText(ERR.currency);
  await expect(intl.el('routing-error')).toHaveText(ERR.routing);
  await expect(page).toHaveURL(/\/payment\/international/);
});

const single: [string, string, keyof typeof ERR, string, object][] = [
  ['TC-VAL-002', 'bene-name', 'name', 'error-bene-name', { name: undefined }],
  ['TC-VAL-003', 'bene-account', 'account', 'error-bene-account', { account: undefined }],
  ['TC-VAL-004', 'bene-country', 'country', 'error-country', { country: undefined, code: undefined }],
  ['TC-VAL-005', 'currency', 'currency', 'error-currency', { currency: undefined }],
];
for (const [id, field, key, errId, override] of single) {
  test(`${id} Only ${field} missing shows its error`, async ({ page, intl }) => {
    await intl.goto();
    await intl.fill(payment(override as any));
    await intl.continue();
    await expect(intl.el(errId)).toHaveText(ERR[key]);
    await expect(page).toHaveURL(/\/payment\/international/);
  });
}

test('TC-VAL-006 Amount 0 rejected', async ({ intl }) => {
  await intl.goto();
  await intl.fill(payment({ amount: '0' }));
  await intl.continue();
  await expect(intl.el('error-amount')).toHaveText(ERR.amount);
});

test('TC-VAL-007 Negative amount rejected', async ({ intl }) => {
  await intl.goto();
  await intl.fill(payment({ amount: '-5' }));
  await intl.continue();
  await expect(intl.el('error-amount')).toHaveText(ERR.amount);
});

test('TC-VAL-008 Smallest positive amount 0.01 accepted', async ({ intl }) => {
  await intl.goto();
  await intl.toReview(payment({ amount: '0.01' }));
  await expect(intl.el('review-amount')).toContainText('0.01');
});

test('TC-VAL-009 Errors clear once corrected and review opens', async ({ page, intl }) => {
  await intl.goto();
  await intl.continue();
  await expect(intl.el('error-bene-name')).toBeVisible();
  await intl.toReview(payment());
  await expect(page.locator('[data-testid^="error-"]')).toHaveCount(0);
});

test('TC-VAL-010 Beneficiary name rejects markup', async ({ page, intl }) => {
  await intl.goto();
  await intl.fill(payment({ name: '<script>alert(1)</script>' }));
  await intl.continue();
  await page.waitForTimeout(1_500);
  await expect(page, 'markup in the beneficiary name should be rejected, not sent to review').toHaveURL(/\/payment\/international/);
});
