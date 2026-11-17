import { Page, expect } from '@playwright/test';
import { IBG_REF } from '../lib/env';

export type Deal = {
  from?: string; bene?: string; dealId?: string; expiry?: string; dealer?: string;
  rateApplied?: 'Debit Account Currency' | 'Transfer Amount Currency'; rate?: string; amount?: string; currency?: string;
};

/** Seeded DEAL001: USD Operating Account debited, AED 1,000 transfer at 3.67. */
export const deal = (o: Deal = {}): Deal => ({
  from: '1234567890', bene: 'Athena Subsidiary FZE', dealId: 'DEAL001', expiry: '2027-12-31', dealer: 'John Smith',
  rateApplied: 'Debit Account Currency', rate: '3.67', amount: '1000', currency: 'AED', ...o,
});

export const IBG_ERR = {
  from: 'From Account is required.',
  dealId: 'Deal ID is required.',
  rate: 'Deal Rate must be a number greater than 0.',
  amount: 'Transfer Amount must be a number greater than 0.',
  currency: 'Transfer Currency is required.',
};

export class IbgPage {
  constructor(public page: Page) {}
  el(id: string) { return this.page.getByTestId(id); }
  async goto() {
    await this.page.goto('/payment/ibg-deal');
    await expect(this.el('btn-continue')).toBeVisible();
  }
  async fill(d: Deal) {
    if (d.from !== undefined) await this.el('from-account').selectOption(d.from);
    if (d.bene !== undefined) await this.el('ibg-beneficiary').selectOption({ label: d.bene });
    if (d.dealId !== undefined) await this.el('deal-id').fill(d.dealId);
    if (d.expiry !== undefined) await this.el('deal-expiry').fill(d.expiry);
    if (d.dealer !== undefined) await this.el('dealer-name').fill(d.dealer);
    if (d.rateApplied !== undefined) await this.el('rate-applied').selectOption(d.rateApplied);
    if (d.rate !== undefined) await this.el('deal-rate').fill(d.rate);
    if (d.amount !== undefined) await this.el('ibg-amount').fill(d.amount);
    if (d.currency !== undefined) await this.el('ibg-currency').selectOption(d.currency);
  }
  reviewHeading() { return this.page.getByText('Review & Confirm'); }
  async toReview(d: Deal) {
    await this.goto();
    await this.fill(d);
    await this.el('btn-continue').click();
    await expect(this.el('btn-submit-approval')).toBeVisible();
  }
  async submit(d: Deal): Promise<string> {
    await this.toReview(d);
    await this.el('btn-submit-approval').click();
    await this.page.waitForURL('**/payment/success');
    await expect(this.el('txn-ref')).toHaveText(IBG_REF);
    return (await this.el('txn-ref').innerText()).trim();
  }
}
