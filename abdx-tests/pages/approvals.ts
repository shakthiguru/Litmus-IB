import { Page, expect } from '@playwright/test';

export class ApprovalsPage {
  constructor(private page: Page) {}
  async goto() {
    await this.page.goto('/approvals');
    await expect(this.page.getByTestId('txn-table')).toBeVisible();
    await expect(this.page.getByTestId('txn-row').first()).toBeVisible();
  }
  row(ref: string) {
    return this.page.getByTestId('txn-row').filter({ has: this.page.getByTestId('txn-ref').getByText(ref, { exact: true }) });
  }
  async filter(status: 'All' | 'Pending Approval' | 'Processed') { await this.page.getByTestId('status-filter').selectOption(status); }
  async statuses() { return this.page.getByTestId('txn-row').getByTestId('txn-status').allInnerTexts(); }
  async approve(ref: string) {
    await this.row(ref).getByTestId('btn-approve').click();
    await expect(this.row(ref).getByTestId('txn-status')).toHaveText('Processed');
  }
}
