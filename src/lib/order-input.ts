export interface CreateOrderInput {
  customer_email: string;
  total_amount: number;
  type: 'sale' | 'refund';
}

export function parseCreateOrderInput(body: unknown): CreateOrderInput | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const input = body as Record<string, unknown>;

  const customerEmail =
    typeof input.customer_email === 'string'
      ? input.customer_email.trim()
      : '';

  const totalAmount = input.total_amount;
  const type = input.type === undefined ? 'sale' : input.type;

  if (!customerEmail) {
    return null;
  }

  if (
    typeof totalAmount !== 'number' ||
    !Number.isFinite(totalAmount) ||
    totalAmount <= 0 ||
    !Number.isInteger(totalAmount)
  ) {
    return null;
  }

  if (type !== 'sale' && type !== 'refund') {
    return null;
  }

  return {
    customer_email: customerEmail,
    total_amount: totalAmount,
    type,
  };
}
