import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const actions = readFileSync(resolve('app/[locale]/login/actions.ts'), 'utf8');
const form = readFileSync(
  resolve('app/[locale]/login/create-account/CreateAccountClient.tsx'),
  'utf8'
);
const operations = readFileSync(resolve('src/lib/commerceOperations.ts'), 'utf8');

describe('account creation hardening contracts', () => {
  it('normalizes identity and rate-limits both the source and address', () => {
    expect(actions).toContain("trim().toLowerCase()");
    expect(actions).toContain("scope: 'register'");
    expect(actions).toContain("scope: 'register_email'");
  });

  it('does not reveal whether the email already has an account', () => {
    expect(actions).not.toContain("result.status === 'exists'");
    expect(actions).toContain('Existing and newly created addresses get the same response');
  });

  it('does not claim an email was sent when delivery failed', () => {
    expect(actions).toContain('linkSent ? t.register.success : t.register.emailDeliveryFailed');
  });

  it('prevents duplicate submissions while the server action is pending', () => {
    expect(form).toContain('formAction, isPending');
    expect(form).toContain('disabled={isPending}');
  });

  it('serializes concurrent contact creation for the same account', () => {
    expect(operations).toContain('pg_advisory_xact_lock');
    expect(operations).toContain('where client_id = ${client.id} and lower(email) = ${email}');
  });
});
