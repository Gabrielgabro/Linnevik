/**
 * §15.6: admin skriver kommentarer på en order, ett företag och en
 * provbeställning. Varje kommentar sparas med vem och när och kan inte
 * ändras eller raderas (A31). Förr var det ett enda textfält som skrevs över.
 *
 * Admininloggningen är utbytt. Allt annat körs på riktigt mot grenen.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';

let adminUser = 'Johan';
vi.mock('@/lib/adminRoute', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/adminRoute')>()),
  requireAdmin: vi.fn(async () => ({ user: adminUser })),
}));
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { listComments } from '@/lib/adminComments';
import { createManualInvoice } from '@/lib/manualInvoice';
import { createSampleRequest } from '@/lib/sampleRequestsDb';
import { createProduct, createVariant } from '@/lib/productsDb';
import { POST } from '../../app/api/admin/comments/route';

let clientId: number;
let variantId: number;

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  const stamp = Date.now();
  const [client] = await getDb()
    .insert(clients)
    .values({
      customerNo: `C${stamp}`,
      name: 'Kommentarhotellet AB',
      orgNumber: 'SE556777123201',
      addressLine1: 'Gränden 2',
      postalCode: '753 10',
      city: 'Uppsala',
    })
    .returning();
  clientId = client.id;
  const product = await createProduct({ title: `Kommentar ${stamp}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `KOM-${stamp}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

async function comment(subject: string, subjectId: number, body: string) {
  return POST(
    new NextRequest('http://localhost/api/admin/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, subjectId, body }),
    })
  );
}

describe('kommentarer', () => {
  it('sparas med vem som skrev och när, och läggs till i stället för att skriva över', async () => {
    adminUser = 'Johan';
    expect((await comment('client', clientId, 'Ringde, vill ha offert i januari.')).status).toBe(201);
    adminUser = 'Ahron';
    expect((await comment('client', clientId, '  Offert skickad.  ')).status).toBe(201);

    const rows = await listComments('client', clientId);
    expect(rows.map(row => [row.author, row.body])).toEqual([
      ['Johan', 'Ringde, vill ha offert i januari.'],
      ['Ahron', 'Offert skickad.'],
    ]);
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].createdAt.getTime()).toBeLessThanOrEqual(rows[1].createdAt.getTime());
  });

  it('kan inte ändras eller raderas, inte ens direkt i databasen', async () => {
    adminUser = 'Gabriel';
    await comment('client', clientId, 'Ska stå kvar.');
    const [first] = await listComments('client', clientId);

    await expect(
      getDb().execute(sql`update admin_comments set body = 'ändrad' where id = ${first.id}`)
    ).rejects.toThrow();
    await expect(getDb().execute(sql`delete from admin_comments where id = ${first.id}`)).rejects.toThrow();
    expect((await listComments('client', clientId))[0].body).toBe(first.body);
  });

  it('avvisar tom text, okänd sak och ett id som inte finns', async () => {
    expect((await comment('client', clientId, '   ')).status).toBe(400);
    expect((await comment('product', clientId, 'Hej')).status).toBe(400);
    expect((await comment('order', 2_000_000_000, 'Hej')).status).toBe(404);
  });

  it('finns på provbeställningar', async () => {
    const requestId = await createSampleRequest({
      contactName: 'Pia Prov',
      email: `prov-${Date.now()}@test.linnevik.se`,
      organizationName: 'Provhotellet AB',
      organizationNumber: '556888-3218',
      phone: '',
      address: 'Vägen 3',
      postalCode: '753 10',
      city: 'Uppsala',
      country: 'SE',
      items: [],
    });
    adminUser = 'Ahron';
    expect((await comment('sample_request', requestId, 'Skickat med PostNord.')).status).toBe(201);
    const rows = await listComments('sample_request', requestId);
    expect(rows.map(row => [row.author, row.body])).toEqual([['Ahron', 'Skickat med PostNord.']]);
  });

  it('en manuell fakturas interna anteckning blir orderns första kommentar', async () => {
    const result = await createManualInvoice(
      {
        clientId,
        recipient: {
          email: 'ekonomi@kommentarhotellet.test',
          companyName: 'Kommentarhotellet AB',
          organizationNumber: '556777-1232',
          address: { line1: 'Gränden 2', line2: '', postalCode: '753 10', city: 'Uppsala' },
        },
        reference: '',
        purchaseOrder: '',
        lines: [{ variantId, quantity: 1, unitAmountMinor: null }],
        shipping: { mode: 'none' },
        daysUntilDue: 30,
        memo: '',
        note: 'Avtalat pris per telefon.',
      },
      'Gabriel'
    );
    const rows = await listComments('order', result.orderId);
    expect(rows.map(row => [row.author, row.body])).toEqual([['Gabriel', 'Avtalat pris per telefon.']]);
  });
});
