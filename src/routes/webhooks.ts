import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  webhooksDal,
  type WebhookEvent,
} from '../dal/webhooks-dal.js';

export const webhooksRouter = Router();

const ALLOWED_EVENTS: WebhookEvent[] = [
  'order.created',
  'order.refunded',
  'order.status_changed',
];

function parseWebhookInput(body: unknown): {
  url: string;
  events: WebhookEvent[];
} | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const input = body as Record<string, unknown>;

  if (typeof input.url !== 'string') {
    return null;
  }

  const url = input.url.trim();

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }

  if (!Array.isArray(input.events) || input.events.length === 0) {
    return null;
  }

  const events = input.events;

  if (
    !events.every(
      (event): event is WebhookEvent =>
        typeof event === 'string' &&
        ALLOWED_EVENTS.includes(event as WebhookEvent),
    )
  ) {
    return null;
  }

  return {
    url,
    events: [...new Set(events)],
  };
}

webhooksRouter.delete('/:id', (req, res) => {
  const deactivated = webhooksDal.deactivate(
    req.merchantId!,
    req.params.id,
  );

  if (!deactivated) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.status(204).send();
});

webhooksRouter.get('/', (req, res) => {
  const subscriptions = webhooksDal.listByMerchant(
    req.merchantId!,
  );

  const webhooks = subscriptions.map((subscription) => ({
    id: subscription.id,
    url: subscription.url,
    event: subscription.event,
    active: subscription.active === 1,
    created_at: subscription.created_at,
  }));

  res.json({ webhooks });
});

webhooksRouter.post('/', (req, res) => {
  const input = parseWebhookInput(req.body);

  if (!input) {
    res.status(400).json({ error: 'invalid_body' });
    return;
  }

  const secret = randomBytes(32).toString('hex');

  const subscriptions = input.events.map((event) =>
    webhooksDal.create({
      id: randomUUID(),
      merchant_id: req.merchantId!,
      url: input.url,
      event,
      secret,
    }),
  );

  res.status(201).json({
    webhook: {
      url: input.url,
      events: input.events,
      secret,
      subscription_ids: subscriptions.map((subscription) => subscription.id),
    },
  });
});