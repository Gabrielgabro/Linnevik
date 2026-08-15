/**
 * Utgående e-post. Går via Linneviks egen SMTP-leverantör (wsr.se) — inte via
 * Gmail, som den här filen tidigare pekade på.
 *
 * Det är inte en detalj: SPF-posten för domänen är
 * `v=spf1 mx a a:smtp.wsr.se a:smtp2.wsr.se -all`, alltså hard fail, och DMARC
 * står på `p=quarantine` med strikt inpassning (`aspf=s; adkim=s`). Post som
 * skickas från någon annan värd än wsr.se saknar både godkänd SPF och en
 * DKIM-signatur som är inpassad mot linnevik.se, och hamnar därför i skräpposten
 * hos mottagaren. Avsändaradressen måste av samma skäl ligga på linnevik.se —
 * strikt inpassning tillåter inte ens en subdomän.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const DEFAULT_HOST = 'smtp.wsr.se';
const DEFAULT_PORT = 465;

/** Avsändaren är skild från inloggningen: kontot kan heta något annat. */
export function mailFrom(): string {
  return process.env.MAIL_FROM ?? process.env.SMTP_USER ?? '';
}

/** Adressen som interna formulärutskick landar på. */
export function mailTo(): string | null {
  return process.env.CONTACT_EMAIL_TO ?? process.env.SMTP_USER ?? null;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && mailFrom());
}

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT ?? DEFAULT_PORT);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? DEFAULT_HOST,
    port,
    // 465 är implicit TLS. 587 börjar i klartext och lyfts med STARTTLS, vilket
    // nodemailer gör själv när secure är false.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

/**
 * Escapar text som ska in i ett HTML-mejl. Formulärfälten går rakt in i
 * brödtexten, och utan det här kan innehållet i ett fält bryta ut och skriva
 * egen markup i mejlet.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Ren text för klienter som inte visar HTML. Härleds ur html om den utelämnas. */
  text?: string;
  replyTo?: string;
}

export type SendResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

/** Enkel nedmontering av HTML till läsbar text, för text/plain-delen. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: EmailOptions): Promise<SendResult> {
  if (!mailConfigured()) {
    // Tyst avbrott i stället för ett kastat fel: anropen ligger i webhooks och
    // formulär som inte ska falla bara för att SMTP saknas i en miljö.
    console.warn('[mailer] SMTP är inte konfigurerat — hoppar över utskick till', to);
    return { success: false, error: 'SMTP is not configured.' };
  }

  try {
    const info = await transporter().sendMail({
      from: `"Linnevik" <${mailFrom()}>`,
      to,
      subject,
      html,
      text: text ?? htmlToText(html),
      replyTo,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[mailer] Utskicket misslyckades:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Send failed.' };
  }
}
