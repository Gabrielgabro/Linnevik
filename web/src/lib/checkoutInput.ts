export type CheckoutInput = {
  cartId: string;
  discountCode: string | null;
  email: string | null;
};

export class CheckoutInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutInputError';
  }
}

const CART_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse the only client-controlled values accepted by card checkout. */
export function parseCheckoutInput(input: unknown): CheckoutInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CheckoutInputError('Invalid request.');
  }

  const body = input as Record<string, unknown>;
  if (typeof body.cartId !== 'string') {
    throw new CheckoutInputError('A valid cartId is required.');
  }
  const cartId = body.cartId.trim();
  if (!CART_ID_PATTERN.test(cartId)) {
    throw new CheckoutInputError('A valid cartId is required.');
  }

  let discountCode: string | null = null;
  if (body.discountCode !== undefined && body.discountCode !== null) {
    if (typeof body.discountCode !== 'string') {
      throw new CheckoutInputError('discountCode must be text.');
    }
    discountCode = body.discountCode.trim() || null;
    if (discountCode && discountCode.length > 80) {
      throw new CheckoutInputError('discountCode is too long.');
    }
  }

  let email: string | null = null;
  if (body.email !== undefined && body.email !== null) {
    if (typeof body.email !== 'string') {
      throw new CheckoutInputError('email must be text.');
    }
    email = body.email.trim().toLowerCase() || null;
    if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
      throw new CheckoutInputError('A valid email is required.');
    }
  }

  return { cartId, discountCode, email };
}
