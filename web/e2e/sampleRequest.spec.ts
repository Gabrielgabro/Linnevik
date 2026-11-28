import { expect, test } from '@playwright/test';
import { e2eSql } from './db';

/**
 * §14.1: vem som helst kan beställa prov med namn, e-post, företag och
 * adress. Förr krävdes också telefon, org.nr och land, och en beställning
 * utan prover sparades ändå (plan.md, H3, H13).
 */
test('ett prov beställs med bara de uppgifter §14.1 kräver', async ({ page }) => {
  const products = await (await page.request.get('/api/products?locale=sv')).json();
  expect(products.length).toBeGreaterThan(0);
  const product = products[0];
  const company = `E2E Prov ${Date.now()} AB`;

  await page.goto('/sv/samples');
  await page.evaluate(id => localStorage.setItem('linnevik:sample-selection', JSON.stringify([id])), product.id);
  await page.goto('/sv/samples/checkout');

  await page.locator('input[name="contactName"]').fill('Petra Prov');
  await page.locator('input[name="email"]').fill('petra@e2e.linnevik.test');
  await page.locator('input[name="organizationName"]').fill(company);
  await page.locator('input[name="address"]').fill('Provgatan 1');
  await page.locator('input[name="postalCode"]').fill('111 22');
  await page.locator('input[name="city"]').fill('Stockholm');
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/sv\/thank-you/);
  const [request] = await e2eSql()`
    select r.country, count(i.*)::int as items
    from sample_requests r left join sample_request_items i on i.request_id = r.id
    where r.organization_name = ${company} group by r.id
  `;
  expect(request).toEqual({ country: 'SE', items: 1 });
});

test('utan valda prover går beställningen inte att skicka', async ({ page }) => {
  await page.goto('/sv/samples');
  await page.evaluate(() => localStorage.setItem('linnevik:sample-selection', JSON.stringify(['finns-inte'])));
  await page.goto('/sv/samples/checkout');
  await expect(page.getByText('Du har inte valt några prover.')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeDisabled();
});
