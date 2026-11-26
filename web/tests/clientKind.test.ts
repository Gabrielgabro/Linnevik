import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENT_KIND_HREF, CLIENT_KIND_LABEL, CLIENT_KINDS } from '@/lib/clients';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('Tvätterikunder och Kunder är två register', () => {
  it('har en uttrycklig kolumn med två värden, och ringlistan som förval', () => {
    const migration = read('drizzle/0042_client_kind.sql');
    expect(migration).toContain(`"kind" text NOT NULL DEFAULT 'lead'`);
    expect(migration).toContain(`CHECK ("kind" IN ('lead', 'customer'))`);
    // Allt som redan har webbkonto eller skapats av kassan blir kund.
    expect(migration).toContain(`SELECT "client_id" FROM "customers"`);
    expect(CLIENT_KINDS).toEqual(['lead', 'customer']);
    expect(CLIENT_KIND_LABEL).toEqual({ lead: 'Tvätterikund', customer: 'Kund' });
    expect(CLIENT_KIND_HREF).toEqual({ lead: '/admin/clients', customer: '/admin/customers' });
  });

  it('visar bara ringlistan under Tvätterikunder och bara kunder under Kunder', () => {
    expect(read('app/admin/(dashboard)/clients/page.tsx')).toContain("listClients('lead')");
    expect(read('app/admin/(dashboard)/customers/page.tsx')).toContain("listClients('customer')");
  });

  it('gör ett företag som registrerar sig eller handlar till kund', () => {
    const commerce = read('src/lib/commerceOperations.ts');
    expect(commerce).toContain("kind: 'customer',");
    expect(commerce).toContain("if (client.kind !== 'customer') {");
  });

  it('fakturerar bara kunder: en tvätterikund görs till kund innan fakturan skapas', () => {
    const manual = read('src/lib/manualInvoice.ts');
    // Formuläret listar båda registren och flyttar en vald tvätterikund till
    // Kunder; servern vägrar ändå fakturera något som inte är kund.
    expect(manual).toContain("kind: client.kind === 'customer'");
    expect(manual).toContain("if (client.kind !== 'customer') {");
  });

  it('flyttar inte ett företag med webbkonton tillbaka till ringlistan', () => {
    const route = read('app/api/admin/clients/[id]/kind/route.ts');
    expect(route).toContain('requireAdmin(request)');
    expect(route).toContain("if (kind === 'lead') {");
    expect(route).toContain('status: 409');
  });

  it('skickar ett kundkort till det register det hör till', () => {
    expect(read('app/admin/(dashboard)/clients/[id]/page.tsx')).toContain("if (data.client.kind !== 'lead') redirect(");
    expect(read('app/admin/(dashboard)/customers/[id]/page.tsx')).toContain("if (data.client.kind !== 'customer') redirect(");
  });
});
