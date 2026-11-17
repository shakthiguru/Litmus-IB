import { test, expect } from '../../lib/fixtures';

const labels: [string, string][] = [['US', 'Fedwire Code'], ['CA', 'Sort Code'], ['GB', 'Sort Code'], ['NZ', 'Sort Code'], ['IN', 'IFSC Code'], ['AU', 'BSB Code']];
labels.forEach(([country, label], i) => {
  test(`TC-RL-00${i + 1} Country ${country} sets label "${label}"`, async ({ intl }) => {
    await intl.goto();
    await intl.el('bene-country').selectOption(country);
    await expect(intl.el('routing-code-label')).toHaveText(label);
  });
});

test('TC-RL-007 Default label before country selected', async ({ intl }) => {
  await intl.goto();
  await expect(intl.el('routing-code-label')).toHaveText('Routing Code');
});

test('TC-RL-008 Label follows repeated country changes', async ({ intl }) => {
  await intl.goto();
  for (const [c, l] of [['US', 'Fedwire Code'], ['IN', 'IFSC Code'], ['AU', 'BSB Code'], ['GB', 'Sort Code']]) {
    await intl.el('bene-country').selectOption(c);
    await expect(intl.el('routing-code-label')).toHaveText(l);
  }
});
