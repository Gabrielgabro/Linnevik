import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/lib/mailer';
import { magicLinkEmail, orderConfirmationEmail, shipmentEmail } from '@/lib/emailTemplates';

const order = {
  id: 1042,
  currency: 'sek',
  customerName: 'Anna Ek',
  subtotalMinor: 100_000,
  discountMinor: 10_000,
  discountCode: 'VÅR25',
  shippingMinor: 4_900,
  taxMinor: 23_725,
  totalMinor: 94_900,
  shippingAddress: {
    line1: 'Kungsgatan 1',
    line2: null,
    city: 'Uppsala',
    postal_code: '753 21',
    state: null,
    country: 'SE',
  },
  items: [
    { title: 'Lakan', sku: 'LAK-001', quantity: 2, unitAmountMinor: 30_000 },
    { title: 'Örngott', sku: 'ORN-002', quantity: 1, unitAmountMinor: 40_000 },
  ],
};

describe('escapeHtml', () => {
  it('neutralises markup so a form field cannot inject into the email body', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('escapes quotes so a value cannot break out of an attribute', () => {
    expect(escapeHtml('" onload="evil()')).toBe('&quot; onload=&quot;evil()');
  });

  it('renders null and undefined as empty rather than as the words', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('order confirmation', () => {
  it('names the order in the subject', () => {
    expect(orderConfirmationEmail(order).subject).toBe('Orderbekräftelse · order #1042');
  });

  it('lists every line with its line total, not its unit price', () => {
    const { html } = orderConfirmationEmail(order);
    expect(html).toContain('Lakan');
    expect(html).toContain('LAK-001');
    // 2 × 300,00 = 600,00 — raden ska visa summan, inte styckpriset.
    expect(html).toMatch(/600[\s ]*,?\s*00|600/);
  });

  it('shows the discount code and omits rows that are zero', () => {
    const { html } = orderConfirmationEmail(order);
    expect(html).toContain('VÅR25');
    const noExtras = orderConfirmationEmail({
      ...order,
      discountMinor: 0,
      discountCode: null,
      shippingMinor: 0,
      taxMinor: 0,
    }).html;
    expect(noExtras).not.toContain('Rabatt');
    expect(noExtras).not.toContain('Frakt');
    expect(noExtras).not.toContain('Varav moms');
  });

  it('escapes the customer name instead of trusting it', () => {
    const { html } = orderConfirmationEmail({
      ...order,
      customerName: '<b>Anna</b>',
    });
    expect(html).toContain('&lt;b&gt;Anna&lt;/b&gt;');
    expect(html).not.toContain('<b>Anna</b>');
  });

  it('drops the address block when no address was captured', () => {
    expect(orderConfirmationEmail({ ...order, shippingAddress: null }).html).not.toContain(
      'Leveransadress'
    );
  });
});

describe('shipment notice', () => {
  const shipment = {
    status: 'shipped' as const,
    carrier: 'PostNord',
    trackingNumber: 'AB123',
    trackingUrl: 'https://tracking.example/AB123',
    items: order.items,
  };

  it('distinguishes shipped from delivered in the subject', () => {
    expect(shipmentEmail(order, shipment).subject).toBe('Din order #1042 har skickats');
    expect(shipmentEmail(order, { ...shipment, status: 'delivered' }).subject).toBe(
      'Din order #1042 är levererad'
    );
  });

  it('includes the tracking link when there is one', () => {
    expect(shipmentEmail(order, shipment).html).toContain('https://tracking.example/AB123');
  });

  it('omits the tracking block entirely when no number was recorded', () => {
    const { html } = shipmentEmail(order, {
      ...shipment,
      carrier: null,
      trackingNumber: null,
      trackingUrl: null,
    });
    expect(html).not.toContain('Spårning');
  });

  it('says so when the shipment covers only part of the order', () => {
    const { html } = shipmentEmail(order, { ...shipment, items: [order.items[0]] });
    expect(html).toContain('en del av ordern');
  });

  it('stays silent about partial delivery when everything ships at once', () => {
    expect(shipmentEmail(order, shipment).html).not.toContain('en del av ordern');
  });
});

describe('magic link email', () => {
  const url = 'https://linnevik.se/sv/login/verify?token=abc123';

  it('includes the link as both the button target and the plain-text fallback', () => {
    const { html } = magicLinkEmail(url);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(url);
  });

  it('escapes the url so it cannot break out of the href attribute', () => {
    const hostile = 'https://linnevik.se/sv/login/verify?token=" onload="evil()';
    const { html } = magicLinkEmail(hostile);
    expect(html).not.toContain('" onload="evil()');
  });
});
