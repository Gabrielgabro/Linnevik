import { expect, type Page } from '@playwright/test';

export async function loginAdmin(page: Page, user = 'Gabriel') {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD saknas i .env.local.');
  await page.goto('/admin/login');
  await page.locator('select[name="user"]').selectOption(user);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}
