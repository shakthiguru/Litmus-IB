import { Page, expect } from '@playwright/test';

export class DraftsPage {
  constructor(private page: Page) {}
  async goto() {
    await this.page.goto('/drafts');
    await expect(this.page.getByTestId('drafts-table')).toBeVisible();
  }
  row(text: string) { return this.page.getByTestId('draft-row').filter({ hasText: text }); }
  async open(text: string) {
    await this.row(text).getByTestId('btn-open-draft').click();
    await this.page.waitForURL(/\/payment\/international\?draft=\d+/);
  }
  async remove(text: string) {
    this.page.once('dialog', d => d.accept());
    await this.row(text).getByTestId('btn-delete-draft').click();
  }
}
