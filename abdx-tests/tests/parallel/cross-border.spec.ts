import { test, expect } from '../../lib/fixtures';
import { payment } from '../../pages/intl-payment';
import { CBP_REF } from '../../lib/env';

test('TC-CBP-001 Adhoc US payment reaches review with derived intermediary', async ({ intl }) => {
  const p = payment({ amount: '40000', currency: 'USD' });
  await intl.goto();
  await intl.toReview(p);
  await expect(intl.el('review-bene-name')).toHaveText(p.name!);
  await expect(intl.el('review-intermediary-bic')).toHaveText('CITIUS33');
  await expect(intl.el('review-amount')).toHaveText('40000 USD');
});

test('TC-CBP-002 Submit for approval shows success with CBP ref', async ({ intl }) => {
  await intl.submit(payment({ amount: '40000' }));
  await expect(intl.el('success-message')).toHaveText('Payment Submitted for Approval');
  await expect(intl.el('txn-ref')).toHaveText(CBP_REF);
  await expect(intl.el('txn-status')).toHaveText('Pending Approval');
});

test('TC-CBP-003 View Transaction opens tracker with the new row', async ({ page, intl, approvals }) => {
  const ref = await intl.submit(payment());
  await intl.el('btn-view-transaction').click();
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(approvals.row(ref)).toHaveCount(1);
  await expect(approvals.row(ref).getByTestId('txn-status')).toHaveText('Pending Approval');
});

test('TC-CBP-004 Approving the new payment marks it Processed', async ({ intl, approvals }) => {
  const ref = await intl.submit(payment());
  await approvals.goto();
  await approvals.approve(ref);
  await expect(approvals.row(ref).getByTestId('btn-approve')).toHaveCount(0);
});

const inter: [string, string, string][] = [['TC-CBP-005', 'EUR', 'DEUTDEFF'], ['TC-CBP-006', 'GBP', 'HSBCGB2L'], ['TC-CBP-007', 'AED', 'ATHNAEAD'], ['TC-CBP-008', 'INR', 'SBININBB']];
for (const [id, ccy, bic] of inter) {
  test(`${id} Blank intermediary derives ${bic} for ${ccy}`, async ({ intl }) => {
    await intl.goto();
    await intl.toReview(payment({ currency: ccy }));
    await expect(intl.el('review-intermediary-bic')).toHaveText(bic);
  });
}

test('TC-CBP-009 User-entered intermediary BIC is kept', async ({ intl }) => {
  await intl.goto();
  await intl.toReview(payment({ intermediary: 'BNPAFRPP' }));
  await expect(intl.el('review-intermediary-bic')).toHaveText('BNPAFRPP');
});

test('TC-CBP-010 Back from review keeps entered values', async ({ page, intl }) => {
  const p = payment({ amount: '777', currency: 'GBP' });
  await intl.goto();
  await intl.toReview(p);
  await intl.el('btn-back').click();
  await expect(page).toHaveURL(/\/payment\/international/);
  await expect(intl.el('bene-name')).toHaveValue(p.name!);
  await expect(intl.el('bene-account')).toHaveValue(p.account!);
  await expect(intl.el('amount')).toHaveValue('777');
  await expect(intl.el('currency')).toHaveValue('GBP');
});

test('TC-CBP-011 Review shows every entered detail', async ({ page, intl }) => {
  const p = payment({ account: 'IN-ACC-55501', country: 'IN', code: 'HDFC0000123', currency: 'INR', amount: '2500', payVia: 'Wire', remarks: 'Review detail check' });
  await intl.goto();
  await intl.toReview(p);
  const main = page.locator('main');
  for (const text of ['IN-ACC-55501', 'IFSC Code', 'HDFC0000123', 'HDFC Bank', 'Mumbai', 'HDFCINBB', 'Wire', 'Review detail check', '2500 INR'])
    await expect(main).toContainText(text);
});

test('TC-CBP-012 Pay Via offers SWIFT, Wire, Correspondent', async ({ intl }) => {
  await intl.goto();
  await expect(intl.el('pay-via').locator('option')).toHaveText(['SWIFT', 'Wire', 'Correspondent']);
  await expect(intl.el('pay-via')).toHaveValue('SWIFT');
});

test('TC-CBP-013 Submitted payment is stored with the entered fields', async ({ intl, api }) => {
  const p = payment({ account: 'GB29NWBK60161331926819', country: 'GB', code: '40-05-15', amount: '1234.5', currency: 'GBP', payVia: 'Correspondent', remarks: 'Stored fields' });
  const ref = await intl.submit(p);
  const row = await api.transaction(ref);
  expect(row, `transaction ${ref} returned by API`).toBeTruthy();
  expect(row).toMatchObject({
    beneficiaryName: p.name, accountIban: p.account, country: 'GB', routingCode: '40-05-15', bankName: 'HSBC',
    swiftBic: 'HBUKGB4B', currency: 'GBP', payVia: 'Correspondent', intermediaryBic: 'HSBCGB2L', status: 'Pending Approval',
  });
  expect(Number(row.amount)).toBe(1234.5);
});

test('TC-CBP-014 Two submissions get different reference numbers', async ({ intl }) => {
  const a = await intl.submit(payment());
  const b = await intl.submit(payment());
  expect(a).toMatch(CBP_REF);
  expect(b).toMatch(CBP_REF);
  expect(a).not.toBe(b);
});
