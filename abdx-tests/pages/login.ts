import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/login'); await expect(this.page.getByTestId('btn-login')).toBeVisible(); }
  async login(username: string, password: string) {
    await this.goto();
    await this.page.getByTestId('login-username').fill(username);
    await this.page.getByTestId('login-password').fill(password);
    await this.page.getByTestId('btn-login').click();
  }
  async loginOk(username: string, password: string) {
    await this.login(username, password);
    await this.page.waitForURL('**/dashboard');
  }
  async logout() {
    await this.page.getByTestId('user-menu').click();
    await this.page.getByTestId('btn-logout').click();
    await this.page.waitForURL('**/login');
  }
}
