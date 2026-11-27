import { inject } from 'vitest';

// getDb() läser DATABASE_URL första gången den anropas, så variabeln måste
// vara satt innan någon testfil importerar appens moduler.
process.env.DATABASE_URL = inject('databaseUrl');

// .env.local kan ha riktiga SMTP-uppgifter. Ett test får aldrig skicka ett
// riktigt mejl, till en kund eller som driftlarm. Test som vill se ett mejl
// byter ut `@/lib/mailer` själva.
for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'CONTACT_EMAIL_TO', 'OPS_ALERT_TO']) {
  delete process.env[key];
}
