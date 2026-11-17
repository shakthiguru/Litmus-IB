import { test, expect } from '../../lib/fixtures';
import { USER, PASS, CBP_REF } from '../../lib/env';
import { ACCUITY } from '../../lib/data';

const ROUTING_ERR = 'Routing Code not present or invalid.';

test('TC-API-001 GET /api/health', async ({ api }) => {
  const res = await api.health();
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, service: 'abdx-backend', db: 'up' });
});

test('TC-API-002 POST /api/auth/login valid', async ({ api }) => {
  const res = await api.login(USER(), PASS);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.token).toBeTruthy();
  expect(body).toMatchObject({ username: USER(), partyName: 'Athena Corporate Ltd', branchName: 'Downtown Branch' });
  expect(typeof body.userId).toBe('number');
});

test('TC-API-003 POST /api/auth/login invalid', async ({ api }) => {
  const res = await api.login(USER(), 'nope');
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: 'Invalid username or password.' });
});

test('TC-API-004 GET /api/accuity all 10 seeded codes', async ({ api }) => {
  for (const [country, code, bankName, bankAddress, swiftBic] of ACCUITY) {
    const res = await api.accuity(country, code);
    expect(res.status(), `${country} ${code}`).toBe(200);
    expect(await res.json(), `${country} ${code}`).toEqual({ bankName, bankAddress, swiftBic });
  }
});

test('TC-API-005 GET /api/accuity invalid code', async ({ api }) => {
  const res = await api.accuity('US', '000000');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: ROUTING_ERR });
});

test('TC-API-006 GET /api/accuity valid code wrong country', async ({ api }) => {
  const res = await api.accuity('GB', '021000021');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: ROUTING_ERR });
});

test('TC-API-007 GET /api/accuity/intermediary all 5 currencies', async ({ api }) => {
  const map = { USD: 'CITIUS33', EUR: 'DEUTDEFF', GBP: 'HSBCGB2L', AED: 'ATHNAEAD', INR: 'SBININBB' };
  for (const [ccy, bic] of Object.entries(map)) {
    const res = await api.intermediary(ccy);
    expect(res.status(), ccy).toBe(200);
    expect((await res.json()).intermediaryBic, ccy).toBe(bic);
  }
});

test('TC-API-008 GET /api/deal-calc Debit Account Currency', async ({ api }) => {
  const res = await api.dealCalc({ rate: '3.67', amount: '1000', rateApplied: 'Debit Account Currency', transferCcy: 'AED', debitCcy: 'USD' });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ calculatedAmount: 272.48, formattedRate: '1 USD = 3.67 AED' });
});

test('TC-API-009 GET /api/deal-calc Transfer Amount Currency', async ({ api }) => {
  const res = await api.dealCalc({ rate: '3.67', amount: '1000', rateApplied: 'Transfer Amount Currency', transferCcy: 'AED', debitCcy: 'USD' });
  expect((await res.json()).calculatedAmount).toBe(3670);
});

test('TC-API-010 GET /api/beneficiaries?kind=CROSS_BORDER', async ({ api }) => {
  const list = await api.beneficiaries('CROSS_BORDER');
  expect(list).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'ACME Trading LLC', accountIban: 'DE89370400440532013000', country: 'GB', routingCode: '20-00-00', bankName: 'Barclays', swiftBic: 'BARCGB22' }),
    expect.objectContaining({ name: 'Global Imports Inc', accountIban: 'US1234567890', country: 'US', routingCode: '021000021', bankName: 'JPMorgan Chase', swiftBic: 'CHASUS33' }),
  ]));
});

test('TC-API-011 GET /api/beneficiaries?kind=INTERNAL', async ({ api }) => {
  const list = await api.beneficiaries('INTERNAL');
  expect(list).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Athena Subsidiary FZE', accountIban: 'AE070331234567890123456', currency: 'AED' }),
    expect.objectContaining({ name: 'Athena Logistics DMCC', accountIban: 'AE480330000010203040506', currency: 'AED' }),
  ]));
});

test('TC-API-012 POST /api/transactions then approve', async ({ api }) => {
  const txn = await api.createTxn({ beneficiaryName: 'API-012 Bene' });
  expect(txn.refNumber).toMatch(CBP_REF);
  expect(txn.status).toBe('Pending Approval');
  const res = await api.approve(txn.id);
  expect(res.ok()).toBeTruthy();
  expect((await api.transaction(txn.refNumber)).status).toBe('Processed');
});

test('TC-API-013 GET /api/transactions?status=Pending Approval', async ({ api }) => {
  const rows = await api.transactions('Pending Approval');
  expect(rows.length).toBeGreaterThan(0);
  expect([...new Set(rows.map(r => r.status))]).toEqual(['Pending Approval']);
});

test('TC-API-014 Drafts CRUD', async ({ api }) => {
  const created = await api.createDraft({ type: 'CBP', beneName: 'API Draft', amount: '10', currency: 'USD' }, 'API Draft — USD 10');
  expect(created.id).toBeTruthy();
  const got = await api.getDraft(created.id);
  expect(got.status()).toBe(200);
  expect((await got.json()).data.beneName).toBe('API Draft');
  expect((await api.deleteDraft(created.id)).ok()).toBeTruthy();
  expect((await api.getDraft(created.id)).status()).toBe(404);
});

test('TC-API-015 GET /api/transactions/:id/download', async ({ api }) => {
  const txn = await api.createTxn({ beneficiaryName: 'API-015 Bene' });
  const res = await api.download(txn.id);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ id: txn.id, refNumber: txn.refNumber, beneficiaryName: 'API-015 Bene' });
});

test('TC-API-016 POST /api/auth/logout', async ({ api }) => {
  const res = await api.logout();
  expect(res.status()).toBeLessThan(300);
});
