import { Page, expect } from '@playwright/test';
import { uid, CBP_REF } from '../lib/env';

export type Payment = {
  name?: string; account?: string; country?: string; code?: string; amount?: string; currency?: string;
  payVia?: string; remarks?: string; intermediary?: string;
};

/** A valid adhoc payment (US / JPMorgan Chase) with a unique beneficiary name. Override any field. */
export const payment = (o: Payment = {}): Payment => ({
  name: `QA Bene ${uid()}`, account: 'US999000111', country: 'US', code: '021000021', amount: '1000', currency: 'USD', ...o,
});

export const ERR = {
  name: 'Beneficiary Name is required.',
  account: 'Beneficiary Account / IBAN is required.',
  country: 'Beneficiary Bank Country is required.',
  amount: 'Transfer Amount must be a number greater than 0.',
  currency: 'Transfer Currency is required.',
  routing: 'Routing Code not present or invalid.',
};

export class IntlPaymentPage {
  constructor(public page: Page) {}
  el(id: string) { return this.page.getByTestId(id); }

  async goto() {
    await this.page.goto('/payment/international');
    await expect(this.el('btn-continue')).toBeVisible();
  }
  /** Select a country, type a routing code and leave the field (triggers the Accuity lookup). */
  async lookup(country: string, code: string) {
    await this.el('bene-country').selectOption(country);
    await this.el('routing-code').fill(code);
    await this.el('routing-code').blur();
  }
  async fill(p: Payment) {
    if (p.name !== undefined) await this.el('bene-name').fill(p.name);
    if (p.account !== undefined) await this.el('bene-account').fill(p.account);
    if (p.country !== undefined) await this.el('bene-country').selectOption(p.country);
    if (p.code !== undefined) {
      await this.el('routing-code').fill(p.code);
      await this.el('routing-code').blur();
      if (p.country) await expect(this.el('bank-name')).not.toHaveValue('');
    }
    if (p.intermediary !== undefined) await this.el('intermediary-bic').fill(p.intermediary);
    if (p.amount !== undefined) await this.el('amount').fill(p.amount);
    if (p.currency !== undefined) await this.el('currency').selectOption(p.currency);
    if (p.payVia !== undefined) await this.el('pay-via').selectOption(p.payVia);
    if (p.remarks !== undefined) await this.el('remarks').fill(p.remarks);
  }
  async continue() { await this.el('btn-continue').click(); }
  async toReview(p: Payment) {
    await this.fill(p);
    await this.continue();
    await this.page.waitForURL('**/payment/review');
  }
  /** Submit from the review page and return the generated reference number. */
  async submitFromReview(): Promise<string> {
    await this.el('btn-submit-approval').click();
    await this.page.waitForURL('**/payment/success');
    await expect(this.el('txn-ref')).toHaveText(CBP_REF);
    return (await this.el('txn-ref').innerText()).trim();
  }
  async submit(p: Payment): Promise<string> {
    await this.goto();
    await this.toReview(p);
    return this.submitFromReview();
  }
  async saveDraft(p: Payment) {
    await this.goto();
    await this.fill(p);
    await this.el('btn-save-draft').click();
  }
  async chooseSaved(label: string) {
    await this.el('bene-type-saved').check();
    await this.el('saved-bene-select').selectOption({ label });
  }
}
