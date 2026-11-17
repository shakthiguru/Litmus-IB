import { test, expect } from '../../lib/fixtures';
import { ERR } from '../../pages/intl-payment';
import { ACCUITY } from '../../lib/data';



ACCUITY.forEach(([country, code, bank, address, bic], i) => {
  test(`TC-ACC-${String(i + 1).padStart(3, '0')} ${country} ${code} autofills ${bank}`, async ({ intl }) => {
    await intl.goto();
    await intl.lookup(country, code);
    await expect(intl.el('bank-name')).toHaveValue(bank);
    await expect(intl.el('bank-address')).toHaveValue(address);
    await expect(intl.el('swift-bic')).toHaveValue(bic);
    await expect(intl.el('routing-error')).toHaveCount(0);
  });
});

const invalid: [string, string, string][] = [['TC-ACC-011', 'US', '000000'], ['TC-ACC-012', 'US', '999'], ['TC-ACC-013', 'GB', '12-34-56'], ['TC-ACC-014', 'GB', '021000021']];
for (const [id, country, code] of invalid) {
  const kind = id === 'TC-ACC-014' ? 'Valid code with wrong country' : 'Invalid code';
  test(`${id} ${kind} ${country} ${code} rejected`, async ({ intl }) => {
    await intl.goto();
    await intl.lookup(country, code);
    await expect(intl.el('routing-error')).toHaveText(ERR.routing);
    await expect(intl.el('bank-name')).toHaveValue('');
  });
}

test('TC-ACC-015 Correcting an invalid code clears the error', async ({ intl }) => {
  await intl.goto();
  await intl.lookup('US', '000000');
  await expect(intl.el('routing-error')).toHaveText(ERR.routing);
  await intl.lookup('US', '021000021');
  await expect(intl.el('bank-name')).toHaveValue('JPMorgan Chase');
  await expect(intl.el('routing-error')).toHaveCount(0);
});

test('TC-ACC-016 Bank name, address and BIC are read-only', async ({ intl }) => {
  await intl.goto();
  for (const id of ['bank-name', 'bank-address', 'swift-bic']) await expect(intl.el(id)).not.toBeEditable();
});

test('TC-ACC-017 Invalid code after valid one clears bank fields', async ({ intl }) => {
  await intl.goto();
  await intl.lookup('US', '021000021');
  await expect(intl.el('bank-name')).toHaveValue('JPMorgan Chase');
  await intl.lookup('US', '000000');
  await expect(intl.el('routing-error')).toHaveText(ERR.routing);
  await expect(intl.el('bank-name')).toHaveValue('');
  await expect(intl.el('swift-bic')).toHaveValue('');
});
