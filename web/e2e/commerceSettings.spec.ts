import { expect, test } from '@playwright/test';
import { loginAdmin } from './admin';

/**
 * §4.8: admin skapar rabattkoder. Förr kraschade formuläret efter att koden
 * sparats: listan uppdaterades inte, och nästa klick gav en dubblett med ett
 * rått databasfel (plan.md, K3).
 */
test('en ny rabattkod syns direkt, och samma kod igen ger ett begripligt fel', async ({ page }) => {
  const code = `E2E${Date.now()}`;
  await loginAdmin(page);
  await page.goto('/admin/commerce');

  const form = page.locator('form', { hasText: 'Skapa rabattkod' });
  await form.locator('input[name="code"]').fill(code);
  await form.locator('input[name="title"]').fill('E2E-rabatt');
  await form.locator('select[name="kind"]').selectOption('percentage');
  await form.locator('input[name="value"]').fill('10');
  await form.getByRole('button', { name: 'Skapa rabattkod' }).click();

  await expect(page.locator('li', { hasText: code })).toBeVisible();
  await expect(form.locator('input[name="code"]')).toHaveValue('');

  await form.locator('input[name="code"]').fill(code);
  await form.locator('input[name="title"]').fill('E2E-rabatt igen');
  await form.getByRole('button', { name: 'Skapa rabattkod' }).click();
  await expect(page.getByText('Det finns redan en rabattkod med den koden.')).toBeVisible();
  await expect(page.locator('li', { hasText: code })).toHaveCount(1);
});
