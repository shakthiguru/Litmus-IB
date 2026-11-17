import { test, expect } from '../../lib/fixtures';
import { payment } from '../../pages/intl-payment';
import { CBP_REF } from '../../lib/env';

const fullDraft = () => payment({ account: 'IN-ACC-' + Date.now().toString().slice(-6), country: 'IN', code: 'HDFC0000123', amount: '123', currency: 'INR', payVia: 'Wire', remarks: 'draft remarks' });

test('TC-DR-002 Save as Draft shows toast', async ({ intl }) => {
  await intl.saveDraft(payment());
  await expect(intl.el('draft-toast')).toHaveText('Draft saved.');
});

test('TC-DR-003 Saved draft listed with label', async ({ page, intl, drafts }) => {
  const p = fullDraft();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  await drafts.goto();
  await expect(drafts.row(`${p.name} — INR 123`)).toHaveCount(1);
});

test('TC-DR-004 Open draft repopulates every field', async ({ page, intl, drafts }) => {
  const p = fullDraft();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  await drafts.goto();
  await drafts.open(p.name!);
  await expect(intl.el('bene-name')).toHaveValue(p.name!);
  await expect(intl.el('bene-account')).toHaveValue(p.account!);
  await expect(intl.el('bene-country')).toHaveValue('IN');
  await expect(intl.el('routing-code-label')).toHaveText('IFSC Code');
  await expect(intl.el('routing-code')).toHaveValue('HDFC0000123');
  await expect(intl.el('bank-name')).toHaveValue('HDFC Bank');
  await expect(intl.el('swift-bic')).toHaveValue('HDFCINBB');
  await expect(intl.el('amount')).toHaveValue('123');
  await expect(intl.el('currency')).toHaveValue('INR');
  await expect(intl.el('pay-via')).toHaveValue('Wire');
  await expect(intl.el('remarks')).toHaveValue('draft remarks');
});

test('TC-DR-005 Delete removes the draft row', async ({ page, intl, drafts }) => {
  const p = fullDraft();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  await drafts.goto();
  await expect(drafts.row(p.name!)).toHaveCount(1);
  await drafts.remove(p.name!);
  await expect(drafts.row(p.name!)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('drafts-table')).toBeVisible();
  await expect(drafts.row(p.name!)).toHaveCount(0);
});

test('TC-DR-006 Delete asks for confirmation', async ({ page, intl, drafts }) => {
  const p = fullDraft();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  await drafts.goto();
  let dialogShown = false;
  page.on('dialog', d => { dialogShown = true; d.accept(); });
  await drafts.row(p.name!).getByTestId('btn-delete-draft').click();
  await page.waitForTimeout(1_000);
  expect(dialogShown, 'a confirmation dialog before deleting a draft').toBe(true);
});

test('TC-DR-007 Seeded draft opens with GB / HSBC values', async ({ intl, drafts }) => {
  await drafts.goto();
  await drafts.open('Sunrise Textiles Ltd');
  await expect(intl.el('bene-name')).toHaveValue('Sunrise Textiles Ltd');
  await expect(intl.el('bene-country')).toHaveValue('GB');
  await expect(intl.el('routing-code')).toHaveValue('40-05-15');
  await expect(intl.el('bank-name')).toHaveValue('HSBC');
  await expect(intl.el('swift-bic')).toHaveValue('HBUKGB4B');
  await expect(intl.el('currency')).toHaveValue('GBP');
  await expect(intl.el('amount')).toHaveValue('25000');
});

test('TC-DR-008 Opened draft can be submitted', async ({ page, intl, drafts }) => {
  const p = fullDraft();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  await drafts.goto();
  await drafts.open(p.name!);
  await expect(intl.el('bank-name')).toHaveValue('HDFC Bank');
  await intl.continue();
  await page.waitForURL('**/payment/review');
  expect(await intl.submitFromReview()).toMatch(CBP_REF);
});
