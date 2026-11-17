import { test, expect, NO_SESSION } from '../../lib/fixtures';
import { USER, PASS } from '../../lib/env';

const LOGIN_ERR = 'Invalid username or password.';

test.describe('Authentication without a session', () => {
  test.use({ storageState: NO_SESSION });

  test('TC-AUTH-001 Valid login lands on Dashboard', async ({ page, login }) => {
    await login.login(USER(), PASS);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('tile-pending-approvals')).toBeVisible();
  });

  test('TC-AUTH-002 Username is case-insensitive', async ({ page, login }) => {
    await login.login(USER().toLowerCase(), PASS);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('TC-AUTH-003 Wrong password shows exact error', async ({ page, login }) => {
    await login.login(USER(), 'Wrong@123');
    await expect(page.getByTestId('login-error')).toHaveText(LOGIN_ERR);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-AUTH-004 Unknown user shows exact error', async ({ page, login }) => {
    await login.login('NOUSER', PASS);
    await expect(page.getByTestId('login-error')).toHaveText(LOGIN_ERR);
  });

  test('TC-AUTH-005 Empty credentials show exact error', async ({ page, login }) => {
    await login.goto();
    await page.getByTestId('btn-login').click();
    await expect(page.getByTestId('login-error')).toHaveText(LOGIN_ERR);
  });

  test('TC-AUTH-006 Password field is masked', async ({ page, login }) => {
    await login.goto();
    await expect(page.getByTestId('login-password')).toHaveAttribute('type', 'password');
  });

  test('TC-AUTH-008 Logout returns to login', async ({ page, login }) => {
    await login.loginOk(USER(), PASS);
    await login.logout();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-AUTH-009 Protected route blocked after logout', async ({ page, login }) => {
    await login.loginOk(USER(), PASS);
    await login.logout();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-AUTH-010 Deep link without session redirects to login', async ({ page }) => {
    await page.goto('/approvals');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('TC-AUTH-012 Root URL redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Authentication with a session', () => {
  test('TC-AUTH-007 Top bar shows user, branch and party', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('user-menu')).toContainText(USER());
    await expect(page.getByTestId('topbar-branch')).toHaveText('Downtown Branch');
    await expect(page.getByTestId('topbar-party')).toHaveText('Athena Corporate Ltd');
  });

  test('TC-AUTH-011 Session survives page reload', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('user-menu')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('user-menu')).toBeVisible();
  });
});
