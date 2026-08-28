import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isValidCompanyRegistrationNumber,
  normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';

/**
 * Kontoträdet enligt architecture/client_account_workflow.md: organisationen
 * är föräldern, representanternas webbkonton är löven. Reglerna nedan är de
 * som avgör om två anställda hamnar under samma förälder och vad som händer
 * när ett konto tas bort — de går inte att läsa ur en enskild funktion.
 */
const registerActions = readFileSync(resolve('app/[locale]/login/actions.ts'), 'utf8');
const accountActions = readFileSync(resolve('app/[locale]/account/actions.ts'), 'utf8');
const accountClient = readFileSync(resolve('app/[locale]/account/AccountClient.tsx'), 'utf8');
const operations = readFileSync(resolve('src/lib/commerceOperations.ts'), 'utf8');
const clientsDb = readFileSync(resolve('src/lib/clientsDb.ts'), 'utf8');
const adminAccountRoute = readFileSync(
  resolve('app/api/admin/clients/[id]/customers/[customerId]/route.ts'),
  'utf8'
);
const adminClientRoute = readFileSync(resolve('app/api/admin/clients/[id]/route.ts'), 'utf8');

describe('§1 organisationsnumret är nyckeln', () => {
  it('ger samma nyckel oavsett hur kunden skriver numret', () => {
    const forms = [
      '556016-0680',
      '5560160680',
      'SE5560160680',
      'SE556016-0680',
      'SE 556016-0680 01',
      'se556016068001',
    ];
    const keys = new Set(forms.map(normalizeCompanyRegistrationNumber));
    expect(keys).toEqual(new Set(['SE556016068001']));
  });

  it('avvisar en form som kan läsas som två olika företag', () => {
    // "16" + organisationsnummer går inte att skilja från ett momsnummer utan
    // landskod. En gissning som slår fel skapar en andra förälder.
    expect(
      isValidCompanyRegistrationNumber(normalizeCompanyRegistrationNumber('165560160680'))
    ).toBe(false);
  });

  it('normaliserar innan numret används som nyckel, inte efteråt', () => {
    expect(registerActions).toContain('normalizeCompanyRegistrationNumber(');
    expect(registerActions).toContain('isValidCompanyRegistrationNumber(companyRegistrationNumber)');
  });
});

describe('§1.1 representanten är ett löv med namn och mejl', () => {
  it('vägrar skapa ett konto utan mejladress och fullständigt namn', () => {
    expect(registerActions).toContain('!email || !firstName || !lastName');
  });
});

describe('§1.2 kontot skapas under organisationen, inte bredvid den', () => {
  it('slår upp organisationen på numret innan en ny post skapas', () => {
    expect(operations).toContain('if (!client && input.orgNumber)');
    expect(operations).toContain('.where(eq(clients.orgNumber, input.orgNumber))');
  });

  it('läser den befintliga posten i stället för att skapa en till vid krock', () => {
    // Två kollegor som registrerar sig i samma ögonblick hinner båda förbi
    // uppslagningen; då är det databasens unika spärr som avgör.
    expect(operations).toContain('.onConflictDoNothing()');
  });

  it('äldsta posten vinner om registret redan har dubbletter', () => {
    expect(operations).toContain('.orderBy(asc(clients.id))');
  });
});

describe('§1.3 representanten tar bort sitt eget konto', () => {
  it('finns som en åtgärd kunden själv kan nå', () => {
    expect(accountActions).toContain('export async function deleteOwnAccount');
    expect(accountClient).toContain('deleteOwnAccount');
  });

  it('kräver en inloggad session och raderar bara det egna kontot', () => {
    expect(accountActions).toContain("customer.source !== 'owned'");
    expect(accountActions).toContain('deletePortalAccount(Number(customer.id))');
  });

  it('lämnar organisationen orörd — även när det var den enda representanten', () => {
    // deletePortalAccount rör bara customers. Radering av företagsposten är
    // en annan funktion, och kontosidan får inte nå den.
    expect(clientsDb).toContain(
      'export async function deletePortalAccount(id: number): Promise<CustomerRow | null>'
    );
    // Namnet får nämnas i en kommentar; det är anropet som inte får finnas.
    expect(accountActions).not.toMatch(/deleteClientsWithAccounts\s*\(/);
    expect(accountActions).not.toMatch(/delete\(clients\)/);
  });

  it('rensar sessionen, så att kakan inte pekar på ett borttaget konto', () => {
    expect(accountActions).toContain('cookieStore.delete(CUSTOMER_SESSION_COOKIE)');
  });

  it('kräver en bekräftelse innan raderingen går iväg', () => {
    expect(accountClient).toContain('confirmingDelete');
  });
});

describe('§1.4 admin raderar på båda nivåerna', () => {
  it('kan ta bort en enskild representant utan att röra företaget', () => {
    expect(adminAccountRoute).toContain('export async function DELETE');
    expect(adminAccountRoute).toContain('deletePortalAccount(customerId)');
  });

  it('binder kontot till företaget i sökvägen, så ett id inte kan radera fel konto', () => {
    expect(adminAccountRoute).toContain(
      'and(eq(customers.id, customerId), eq(customers.clientId, clientId))'
    );
  });

  it('tar med representanterna när hela organisationen raderas', () => {
    expect(adminClientRoute).toContain('deleteClientsWithAccounts([id])');
    expect(clientsDb).toContain('db.delete(customers).where(inArray(customers.clientId, ids))');
  });
});
