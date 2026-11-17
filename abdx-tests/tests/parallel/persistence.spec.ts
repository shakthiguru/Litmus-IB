import { test, expect, NO_SESSION } from '../../lib/fixtures';
import { payment } from '../../pages/intl-payment';
import { LoginPage } from '../../pages/login';
import { ApprovalsPage } from '../../pages/approvals';
import { DraftsPage } from '../../pages/drafts';
import { BASE_URL, USER, PASS, PROXY } from '../../lib/env';
import type { Browser } from '@playwright/test';

async function freshSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE_URL, proxy: PROXY, storageState: NO_SESSION });
  const page = await context.newPage();
  await new LoginPage(page).loginOk(USER(), PASS);
  return { context, page };
}

test('TC-PER-001 Payment visible after reload', async ({ page, intl, approvals }) => {
  const ref = await intl.submit(payment());
  await approvals.goto();
  await expect(approvals.row(ref)).toHaveCount(1);
  await page.reload();
  await expect(approvals.row(ref)).toHaveCount(1);
});

test('TC-PER-002 Payment visible from a fresh browser session', async ({ browser, intl }) => {
  const ref = await intl.submit(payment());
  const { context, page } = await freshSession(browser);
  const approvals = new ApprovalsPage(page);
  await approvals.goto();
  await expect(approvals.row(ref)).toHaveCount(1);
  await context.close();
});

test('TC-PER-003 Draft visible from a fresh browser session', async ({ browser, page, intl }) => {
  const p = payment();
  await intl.saveDraft(p);
  await page.waitForURL('**/drafts');
  const { context, page: page2 } = await freshSession(browser);
  const drafts = new DraftsPage(page2);
  await drafts.goto();
  await expect(drafts.row(p.name!)).toHaveCount(1);
  await context.close();
});
