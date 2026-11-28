import { expect, test } from '@playwright/test';
import { loginAdmin } from './admin';
import { e2eSql, uniqueOrgNumber } from './db';

/**
 * §9: admin skapar en faktura för hand. Felet som startade granskningen:
 * formuläret skickade raderna under ett annat namn än servern läste, och
 * ingen faktura gick att räkna fram.
 */
test('admin skapar en manuell faktura från formuläret', async ({ page }) => {
  const sql = e2eSql();
  const stamp = Date.now();
  const name = `E2E Hotellet ${stamp} AB`;
  const orgNumber = uniqueOrgNumber();
  await sql`
    insert into clients (customer_no, name, org_number, address_line1, postal_code, city)
    values (${`E2E${stamp}`}, ${name}, ${`SE${orgNumber.replace('-', '')}01`}, 'Testgatan 1', '111 22', 'Stockholm')
  `;
  const [variant] = await sql`
    select v.sku, v.price_minor from product_variants v
    join products p on p.id = v.product_id
    where p.status = 'active' and v.price_minor > 0 and (not v.inventory_tracked or v.inventory_quantity - v.inventory_reserved >= 36)
    order by v.id limit 1
  `;

  await loginAdmin(page);
  await page.goto('/admin/orders/ny-faktura');

  await page.getByPlaceholder('Namn, kundnummer, org.nr eller e-post').fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).first().click();

  await page.getByPlaceholder('ekonomi@foretag.se').fill('ekonomi@e2e.linnevik.test');
  await page.locator('input[name="orgNumber"], input[name="organizationNumber"]').first().fill(orgNumber);
  await page.locator('input[name="line1"]').fill('Testgatan 1');
  await page.locator('input[name="postalCode"]').fill('111 22');
  await page.locator('input[name="city"]').fill('Stockholm');

  await page.getByPlaceholder('Lägg till produkt: namn eller SKU').fill(variant.sku);
  await page.getByRole('option', { name: new RegExp(variant.sku) }).first().click();
  const row = page.locator('tr', { hasText: variant.sku });
  await row.getByRole('spinbutton').or(row.locator('input').first()).first().fill('36');
  await page.getByLabel('Ingen frakt').check();

  // Offerten ska räknas fram: 36 × listpriset, exkl. moms.
  const subtotal = (36 * Number(variant.price_minor)) / 100;
  const kronor = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(subtotal)
    .replace(/ /g, ' ');
  await expect(page.getByText('Summan kunde inte räknas fram.')).toHaveCount(0);
  await expect(row).toContainText(kronor.replace(/,00$/, ''));

  page.once('dialog', dialog => dialog.accept());
  const create = page.getByRole('button', { name: 'Skapa och skicka faktura' });
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page).toHaveURL(/\/admin\/orders\/\d+$/);
  const orderId = Number(page.url().split('/').pop());
  const [order] = await sql`
    select o.payment_method, o.subtotal_minor, i.number
    from orders o left join invoices i on i.order_id = o.id
    where o.id = ${orderId}
  `;
  expect(order.payment_method).toBe('invoice');
  expect(Number(order.subtotal_minor)).toBe(36 * Number(variant.price_minor));
  expect(order.number).toBeTruthy();
});
