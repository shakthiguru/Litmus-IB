import { test as base, expect } from '@playwright/test';
import { Api } from './api';
import { LoginPage } from '../pages/login';
import { IntlPaymentPage } from '../pages/intl-payment';
import { ApprovalsPage } from '../pages/approvals';
import { DraftsPage } from '../pages/drafts';
import { IbgPage } from '../pages/ibg';

type Fixtures = { api: Api; login: LoginPage; intl: IntlPaymentPage; approvals: ApprovalsPage; drafts: DraftsPage; ibg: IbgPage };

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => use(new Api(request)),
  login: async ({ page }, use) => use(new LoginPage(page)),
  intl: async ({ page }, use) => use(new IntlPaymentPage(page)),
  approvals: async ({ page }, use) => use(new ApprovalsPage(page)),
  drafts: async ({ page }, use) => use(new DraftsPage(page)),
  ibg: async ({ page }, use) => use(new IbgPage(page)),
});
export { expect };
export const NO_SESSION = { cookies: [], origins: [] };
