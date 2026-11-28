import { expect, test } from '@playwright/test';
import { loginAdmin } from './admin';
import { e2eSql, uniqueOrgNumber } from './db';

/**
 * En fakturaorder från skapad till skickad, med knapparna på ordersidan.
 * §8.9: en pausad order förblir pausad när betalningen kommer (F1), och
 * leveransen registreras en gång även om knappen klickas två gånger (F2).
 */
test('pausad fakturaorder betalas, återupptas och levereras en gång', async ({ page }) => {
  const sql = e2eSql();
  const stamp = Date.now();
  const orgNumber = uniqueOrgNumber();
  const [client] = await sql`
    insert into clients (customer_no, name, org_number, address_line1, postal_code, city)
    values (${`E2F${stamp}`}, ${`E2E Flöde ${stamp} AB`}, ${`SE${orgNumber.replace('-', '')}01`}, 'Testgatan 1', '111 22', 'Stockholm')
    returning id
  `;
  const [variant] = await sql`
    select v.id from product_variants v join products p on p.id = v.product_id
    where p.status = 'active' and v.price_minor > 0 and not v.inventory_tracked
    order by v.id limit 1
  `;

  await loginAdmin(page);
  const created = await page.request.post('/api/admin/invoices', {
    data: {
      clientId: client.id,
      recipient: {
        email: 'ekonomi@e2e.linnevik.test',
        companyName: `E2E Flöde ${stamp} AB`,
        organizationNumber: orgNumber,
        address: { line1: 'Testgatan 1', line2: '', postalCode: '111 22', city: 'Stockholm' },
      },
      reference: '', purchaseOrder: '',
      lines: [{ variantId: variant.id, quantity: 3, unitAmountMinor: null }],
      shipping: { mode: 'none' }, daysUntilDue: 30, memo: '', note: '',
    },
  });
  expect(created.ok()).toBe(true);
  const { orderId, totalMinor } = await created.json();

  await page.goto(`/admin/orders/${orderId}`);
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(page.getByRole('button', { name: 'Återuppta' })).toBeVisible();

  const kronor = (totalMinor / 100).toFixed(2);
  await page.locator('input[name="amount"]').first().fill(kronor);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Registrera bankbetalning' }).click();
  await expect(page.getByText('Betalningen är registrerad')).toBeVisible();

  const [paused] = await sql`select status, payment_status from orders where id = ${orderId}`;
  expect(paused).toEqual({ status: 'on_hold', payment_status: 'paid' });
  await expect(page.getByText('Ordern är pausad. Återuppta den först.')).toBeVisible();

  await page.getByRole('button', { name: 'Återuppta' }).click();
  await expect(page.getByRole('button', { name: 'Registrera leverans' })).toBeVisible();
  // En delleverans: 1 av 3. Ett andra klick gav förr en andra försändelse.
  await page.locator('input[name^="qty_"]').fill('1');
  await page.locator('input[name="carrier"]').fill('PostNord');
  await page.getByRole('button', { name: 'Registrera leverans' }).dblclick();
  await expect(page.getByText('Delvis levererad')).toBeVisible();

  const [shipped] = await sql`
    select count(distinct f.id)::int as shipments, coalesce(sum(fi.quantity), 0)::int as units
    from fulfillments f join fulfillment_items fi on fi.fulfillment_id = f.id
    where f.order_id = ${orderId}
  `;
  expect(shipped).toEqual({ shipments: 1, units: 1 });
});
