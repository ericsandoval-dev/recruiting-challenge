import { parsePositiveIntegerQuery } from '../lib/query-input.js';
import { Router } from 'express';
import { ordersDal } from '../dal/orders-dal.js';
import { randomUUID } from 'node:crypto';
import { parseCreateOrderInput } from '../lib/order-input.js';
import { deliverWebhookEvent } from '../services/webhook-delivery.js';

export const ordersRouter = Router();

ordersRouter.get('/', (req, res) => {
  const limit = parsePositiveIntegerQuery(
    req.query.limit,
    100,
  );

  if (limit === null) {
    res.status(400).json({ error: 'invalid_limit' });
    return;
  }

  const orders = ordersDal.listByMerchant(req.merchantId!, {
    from:
      typeof req.query.from === 'string'
        ? req.query.from
        : undefined,
    to:
      typeof req.query.to === 'string'
        ? req.query.to
        : undefined,
    limit,
  });

  res.json({ orders });
});
ordersRouter.get('/:id', (req, res) => {
  const order = ordersDal.getById(req.merchantId!, req.params.id);

  if (!order) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({ order });
});

ordersRouter.post('/', (req, res) => {
  const input = parseCreateOrderInput(req.body);

  if (!input) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const order = ordersDal.create({
    id: randomUUID(),
    merchant_id: req.merchantId!,
    customer_email: input.customer_email,
    total_amount: input.total_amount,
    type: input.type,
    status: 'completed',
  });

  const event =
    order.type === 'refund'
      ? 'order.refunded'
      : 'order.created';

  void deliverWebhookEvent(
    req.merchantId!,
    event,
    order,
  ).catch((error) => {
    console.error('Webhook delivery error:', error);
  });

  res.status(201).json({ order });
});

ordersRouter.patch('/:id/status', (req, res) => {
  if (
    typeof req.body !== 'object' ||
    req.body === null ||
    typeof req.body.status !== 'string'
  ) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const status = req.body.status.trim();

  if (!status) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const existingOrder = ordersDal.getById(
    req.merchantId!,
    req.params.id,
  );

  if (!existingOrder) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (existingOrder.status === status) {
    res.json({ order: existingOrder });
    return;
  }

  const updatedOrder = ordersDal.updateStatus(
    req.merchantId!,
    req.params.id,
    status,
  );

  if (!updatedOrder) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  void deliverWebhookEvent(
    req.merchantId!,
    'order.status_changed',
    updatedOrder,
  ).catch((error) => {
    console.error('Webhook delivery error:', error);
  });

  res.json({ order: updatedOrder });
});