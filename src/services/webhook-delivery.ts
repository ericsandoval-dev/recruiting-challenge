import { createHmac, randomUUID } from 'node:crypto';

import {
  webhooksDal,
  type WebhookEvent,
} from '../dal/webhooks-dal.js';

import {
  webhookDeliveriesDal,
  type WebhookDeliveryRow,
} from '../dal/webhook-deliveries-dal.js';

type OrderPayload = {
  id: string;
  merchant_id: string;
  customer_email: string;
  total_amount: number;
  type: string;
  status: string;
  created_at: string;
};

const MAX_BACKOFF_MS = 60_000;

let processingDeliveries = false;

function retryDelayMs(attemptCount: number): number {
  return Math.min(
    100 * 2 ** Math.max(0, attemptCount - 1),
    MAX_BACKOFF_MS,
  );
}

async function attemptWebhookDelivery(
  delivery: WebhookDeliveryRow,
): Promise<void> {
  const subscription = webhooksDal.getById(
    delivery.subscription_id,
);

if (!subscription || subscription.active !== 1) {
  webhookDeliveriesDal.remove(delivery.id);
  return;
}

  const signature = createHmac(
    'sha256',
    subscription.secret,
  )
    .update(delivery.payload)
    .digest('hex');

  try {
    const response = await fetch(subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Signature': signature,
        'X-Webhook-Delivery-Id': delivery.id,
      },
      body: delivery.payload,
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      webhookDeliveriesDal.remove(delivery.id);
      return;
    }

    const nextAttemptCount = delivery.attempt_count + 1;
    const delay = retryDelayMs(nextAttemptCount);

    webhookDeliveriesDal.markFailure(
      delivery.id,
      nextAttemptCount,
      Date.now() + delay,
      `HTTP ${response.status}`,
    );

    console.error(
      `Webhook failed: ${delivery.id} returned ${response.status}. ` +
      `Retry in ${delay}ms`,
    );
  } catch (error) {
    const nextAttemptCount = delivery.attempt_count + 1;
    const delay = retryDelayMs(nextAttemptCount);

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    webhookDeliveriesDal.markFailure(
      delivery.id,
      nextAttemptCount,
      Date.now() + delay,
      message,
    );

    console.error(
      `Webhook failed: ${delivery.id}. Retry in ${delay}ms`,
      error,
    );
  }
}

export async function processDueWebhookDeliveries(): Promise<void> {
  if (processingDeliveries) {
    return;
  }

  processingDeliveries = true;

  try {
    const deliveries = webhookDeliveriesDal.listDue(
      Date.now(),
    );

    for (const delivery of deliveries) {
      await attemptWebhookDelivery(delivery);
    }
  } finally {
    processingDeliveries = false;
  }
}

export async function deliverWebhookEvent(
  merchantId: string,
  event: WebhookEvent,
  order: OrderPayload,
): Promise<void> {
  const subscriptions =
    webhooksDal.listActiveByMerchantAndEvent(
      merchantId,
      event,
    );

  for (const subscription of subscriptions) {
    const payload = JSON.stringify({
      event,
      order,
    });

    webhookDeliveriesDal.create({
      id: randomUUID(),
      subscription_id: subscription.id,
      event,
      payload,
      next_attempt_at: Date.now(),
    });
  }

  await processDueWebhookDeliveries();
}

export function startWebhookDeliveryWorker(
  intervalMs = 250,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void processDueWebhookDeliveries().catch((error) => {
      console.error(
        'Webhook delivery worker error:',
        error,
      );
    });
  }, intervalMs);

  timer.unref();

  return timer;
}