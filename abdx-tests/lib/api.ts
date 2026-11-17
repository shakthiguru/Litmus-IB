import { APIRequestContext, expect } from '@playwright/test';

/** Thin client over the ABDX backend used for setup, data creation and contract checks. */
export class Api {
  constructor(private r: APIRequestContext) {}

  private async json(p: Promise<any>, expectOk = true) {
    const res = await p;
    if (expectOk) expect(res.ok(), `${res.url()} -> ${res.status()}`).toBeTruthy();
    return res.json();
  }
  health() { return this.r.get('/api/health'); }
  login(username: string, password: string) { return this.r.post('/api/auth/login', { data: { username, password } }); }
  logout() { return this.r.post('/api/auth/logout', { data: {} }); }
  reset() { return this.r.post('/api/reset'); }
  accuity(country: string, code: string) { return this.r.get('/api/accuity', { params: { country, code } }); }
  intermediary(currency: string, beneBic = '') { return this.r.get('/api/accuity/intermediary', { params: { currency, beneBic } }); }
  dealCalc(p: { rate: string; amount: string; rateApplied: string; transferCcy: string; debitCcy: string }) {
    return this.r.get('/api/deal-calc', { params: p });
  }
  beneficiaries(kind: 'CROSS_BORDER' | 'INTERNAL'): Promise<any[]> { return this.json(this.r.get('/api/beneficiaries', { params: { kind } })); }
  transactions(status = 'All'): Promise<any[]> { return this.json(this.r.get('/api/transactions', { params: { status } })); }
  async transaction(ref: string) { return (await this.transactions('All')).find(t => t.refNumber === ref); }
  createTxn(overrides: Record<string, any> = {}) {
    return this.json(this.r.post('/api/transactions', {
      data: {
        type: 'CBP', beneficiaryName: 'API Bene', accountIban: 'US0000API', country: 'US', routingCode: '021000021',
        bankName: 'JPMorgan Chase', bankAddress: 'New York, NY', swiftBic: 'CHASUS33', amount: '100', currency: 'USD',
        intermediaryBic: 'CITIUS33', payVia: 'SWIFT', remarks: '', ...overrides,
      },
    }));
  }
  approve(id: number | string) { return this.r.post(`/api/transactions/${id}/approve`); }
  download(id: number | string) { return this.r.get(`/api/transactions/${id}/download`); }
  drafts(): Promise<any[]> { return this.json(this.r.get('/api/drafts')); }
  createDraft(data: Record<string, any>, label: string) { return this.json(this.r.post('/api/drafts', { data: { data, label } })); }
  getDraft(id: number | string) { return this.r.get(`/api/drafts/${id}`); }
  deleteDraft(id: number | string) { return this.r.delete(`/api/drafts/${id}`); }
}
