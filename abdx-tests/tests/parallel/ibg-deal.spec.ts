import { test, expect } from '../../lib/fixtures';
import { deal, IBG_ERR } from '../../pages/ibg';
import { IBG_REF } from '../../lib/env';

test('TC-IBG-001 Screen loads with accounts and internal beneficiaries', async ({ ibg }) => {
  await ibg.goto();
  await expect(ibg.el('from-account').locator('option')).toContainText(['1234567890', '9876543210']);
  await expect(ibg.el('ibg-beneficiary').locator('option')).toContainText(['Athena Subsidiary FZE', 'Athena Logistics DMCC']);
});

test('TC-IBG-002 Empty submit shows all IBG errors', async ({ ibg }) => {
  await ibg.goto();
  await ibg.el('btn-continue').click();
  await expect(ibg.el('error-from-account')).toHaveText(IBG_ERR.from);
  await expect(ibg.el('error-deal-id')).toHaveText(IBG_ERR.dealId);
  await expect(ibg.el('error-deal-rate')).toHaveText(IBG_ERR.rate);
  await expect(ibg.el('error-amount')).toHaveText(IBG_ERR.amount);
  await expect(ibg.el('error-currency')).toHaveText(IBG_ERR.currency);
});

const negative: [string, string, object, string, string][] = [
  ['TC-IBG-003', 'Missing Deal ID only', { dealId: undefined }, 'error-deal-id', IBG_ERR.dealId],
  ['TC-IBG-004', 'Missing From Account only', { from: undefined }, 'error-from-account', IBG_ERR.from],
  ['TC-IBG-005', 'Deal rate 0 rejected', { rate: '0' }, 'error-deal-rate', IBG_ERR.rate],
  ['TC-IBG-006', 'Negative deal rate rejected', { rate: '-1' }, 'error-deal-rate', IBG_ERR.rate],
];
for (const [id, title, override, errId, msg] of negative) {
  test(`${id} ${title}`, async ({ ibg }) => {
    await ibg.goto();
    await ibg.fill(deal(override as any));
    await ibg.el('btn-continue').click();
    await expect(ibg.el(errId)).toHaveText(msg);
    await expect(ibg.el('btn-submit-approval')).toHaveCount(0);
  });
}

test('TC-IBG-007 Calc on Debit Account Currency', async ({ ibg }) => {
  await ibg.goto();
  await ibg.fill(deal());
  await expect(ibg.el('calculated-amount')).toHaveValue('272.48');
  await expect(ibg.el('deal-rate-line')).toHaveText('1 USD = 3.67 AED');
});

test('TC-IBG-008 Calc on Transfer Amount Currency', async ({ ibg }) => {
  await ibg.goto();
  await ibg.fill(deal({ rateApplied: 'Transfer Amount Currency' }));
  await expect(ibg.el('calculated-amount')).toHaveValue('3670');
  await expect(ibg.el('deal-rate-line')).toHaveText('1 USD = 3.67 AED');
});

test('TC-IBG-009 Calculated amount shows a currency', async ({ ibg }) => {
  await ibg.goto();
  await ibg.fill(deal());
  await expect(ibg.el('calculated-amount')).not.toHaveValue('');
  await expect(ibg.el('calculated-amount'), 'calculated amount should carry its currency code').toHaveValue(/[A-Z]{3}/);
});

test('TC-IBG-010 Review shows all deal details', async ({ page, ibg }) => {
  await ibg.toReview(deal());
  await expect(ibg.reviewHeading()).toBeVisible();
  const main = page.locator('main');
  for (const text of ['1234567890', 'Athena Subsidiary FZE', 'DEAL001', '2027-12-31', 'John Smith', 'Debit Account Currency', '3.67', '1000 AED', '272.48', '1 USD = 3.67 AED'])
    await expect(main).toContainText(text);
});

test('TC-IBG-011 Back from review keeps deal values', async ({ ibg }) => {
  await ibg.toReview(deal());
  await ibg.el('btn-back').click();
  await expect(ibg.el('deal-id')).toHaveValue('DEAL001');
  await expect(ibg.el('ibg-amount')).toHaveValue('1000');
});

test('TC-IBG-012 Submit IBG creates IBG ref', async ({ ibg }) => {
  const ref = await ibg.submit(deal());
  expect(ref).toMatch(IBG_REF);
  await expect(ibg.el('txn-status')).toHaveText('Pending Approval');
});

test('TC-IBG-013 IBG payment visible and approvable in tracker', async ({ ibg, approvals }) => {
  const ref = await ibg.submit(deal());
  await approvals.goto();
  await expect(approvals.row(ref)).toHaveCount(1);
  await approvals.approve(ref);
});

test('TC-IBG-014 Expired deal expiry rejected', async ({ page, ibg }) => {
  await ibg.goto();
  await ibg.fill(deal({ expiry: '2020-01-01' }));
  await ibg.el('btn-continue').click();
  await page.waitForTimeout(1_500);
  await expect(ibg.el('btn-submit-approval'), 'an expired deal should not reach review').toHaveCount(0);
});
