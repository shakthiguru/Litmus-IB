import { test, expect } from '../../lib/fixtures';
import type { Page } from '@playwright/test';

const screens: [string, string][] = [
  ['/accounts/casa', 'Current & Savings Accounts'], ['/accounts/deposits', 'Deposits'], ['/accounts/loans', 'Loans & Finances'],
  ['/payment/transfer', 'Transfer Money'], ['/payees', 'Manage Payees'], ['/file-upload', 'Bulk File Upload'],
  ['/trade', 'Trade Finance'], ['/cash-mgmt', 'Cash Management'], ['/forex', 'Forex Deal'], ['/reports', 'Reports'],
  ['/settings', 'Account Setting'],
];
screens.forEach(([route, heading], i) => {
  test(`TC-MOCK-${String(i + 1).padStart(3, '0')} ${route} renders "${heading}" inside the shell`, async ({ page }) => {
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await expect(page.getByTestId('drawer')).toBeVisible();
    await expect(page.getByTestId('user-menu')).toBeVisible();
  });
});

async function expectRow(page: Page, key: string, parts: string[]) {
  const row = page.locator('tr').filter({ hasText: key });
  await expect(row).toHaveCount(1);
  for (const p of parts) await expect(row).toContainText(p);
}

test('TC-MOCK-012 CASA table matches seeded accounts', async ({ page }) => {
  await page.goto('/accounts/casa');
  await expectRow(page, '1234567890', ['Operating Account', 'USD', '4,520,000.75']);
  await expectRow(page, '9876543210', ['AED Collections', 'AED', '18,750,000.00']);
  await expectRow(page, '5555000011', ['Payroll Account', 'USD', '980,000.00']);
});

test('TC-MOCK-013 Deposits table matches seeded accounts', async ({ page }) => {
  await page.goto('/accounts/deposits');
  await expectRow(page, '7001234567', ['Fixed Deposit 12M', 'USD', '2,500,000.00']);
  await expectRow(page, '7009988776', ['Recurring Deposit', 'AED', '600,000.00']);
});

test('TC-MOCK-014 Loans table shows Term Loan Facility', async ({ page }) => {
  await page.goto('/accounts/loans');
  await expectRow(page, '8001112223', ['Term Loan Facility', 'USD', '3,200,000.00']);
});
