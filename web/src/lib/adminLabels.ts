/**
 * Svenska namn på lägen och händelser i admin (source_of_truth §15.4).
 * Databasen behåller sina engelska nycklar. Det som visas är svenska, även
 * statusar: ingen "paid", "unfulfilled" eller "fulfillment".
 */

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Väntar på betalning',
  paid: 'Betald',
  partially_refunded: 'Delvis återbetald',
  refunded: 'Återbetald',
  failed: 'Ej betald',
  expired: 'Utgången',
};

export const FULFILLMENT_STATUS_LABEL: Record<string, string> = {
  unfulfilled: 'Ej skickad',
  partially_fulfilled: 'Delvis skickad',
  partial: 'Delvis skickad',
  fulfilled: 'Skickad',
  shipped: 'Skickad',
  delivered: 'Levererad',
  returned: 'Returnerad',
  partially_returned: 'Delvis returnerad',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Väntar',
  paid: 'Betald',
  stock_exception: 'Lager saknas',
  disputed: 'Tvist',
  on_hold: 'Pausad',
  closed: 'Avslutad',
  failed: 'Misslyckad',
  cancelled: 'Avbokad',
  expired: 'Utgången',
};

export const REFUND_STATUS_LABEL: Record<string, string> = {
  pending: 'Pågår',
  succeeded: 'Genomförd',
  failed: 'Misslyckad',
  canceled: 'Avbruten',
  requires_action: 'Kräver åtgärd',
};

export const SAMPLE_STATUS_LABEL: Record<string, string> = {
  new: 'Ny',
  in_progress: 'Påbörjad',
  sent: 'Skickad',
  declined: 'Avböjd',
};

export const ORDER_EVENT_LABEL: Record<string, string> = {
  'payment.paid': 'Betald med kort',
  'payment.bank_registered': 'Bankbetalning registrerad',
  'payment.disputed': 'Tvist öppnad',
  'payment.dispute_closed': 'Tvist avgjord',
  'payment.expired': 'Betalsidan gick ut',
  'payment.failed': 'Betalningen misslyckades',
  'inventory.stock_exception': 'Lager saknas',
  'inventory.reserved_again': 'Lager reserverat igen',
  'inventory.returned': 'Lager återfört',
  'fulfillment.created': 'Leverans registrerad',
  'order.shipped': 'Skickad',
  'refund.created': 'Återbetalning',
  'refund.updated': 'Återbetalning ändrad',
  'refund.failed': 'Återbetalning misslyckades',
  'order.updated': 'Ändrad',
  'order.paused': 'Pausad',
  'order.resumed': 'Återupptagen',
  'order.closed': 'Avslutad',
  'order.note': 'Anteckning',
  'order.invoice': 'Faktura skickad',
  'order.invoice_reminder': 'Påminnelse skickad',
  'order.credit_note': 'Kreditfaktura',
  'order.confirmation': 'Orderbekräftelse',
  'invoice.created_manually': 'Faktura skapad för hand',
  'email.sent': 'Mejl skickat',
  'email.failed': 'Mejl gick inte fram',
};

const label = (map: Record<string, string>) => (value: string | null | undefined) =>
  value ? (map[value] ?? value) : '—';

export const paymentStatusLabel = label(PAYMENT_STATUS_LABEL);
export const fulfillmentStatusLabel = label(FULFILLMENT_STATUS_LABEL);
export const orderStatusLabel = label(ORDER_STATUS_LABEL);
export const refundStatusLabel = label(REFUND_STATUS_LABEL);
export const sampleStatusLabel = label(SAMPLE_STATUS_LABEL);
export const orderEventLabel = label(ORDER_EVENT_LABEL);
