import { createHmac } from 'node:crypto';
import {
  webhooksDal,
  type WebhookEvent,
} from '../dal/webhooks-dal.js';


type OrderPayload = {
  id: string;
  customer_email: string;
  total_amount: number;
  type: string;
  status: string;
  created_at: string;
};

export async function deliverWebhookEvent(
  merchantId: string,
  event: WebhookEvent,
  order: OrderPayload,
): Promise<void> {
  const subscriptions =
    webhooksDal.listActiveByMerchantAndEvent(merchantId, event);

  for (const subscription of subscriptions) {
    const payload = {
      event,
      order,
    };

    const body = JSON.stringify(payload);

    // Firmamos el body usando el secret de esa suscripción.
    const signature = createHmac('sha256', subscription.secret)
      .update(body)
      .digest('hex');

    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(
          `Webhook failed: ${subscription.id} returned ${response.status}`,
        );
      }
    } catch (error) {
      console.error(`Webhook failed: ${subscription.id}`, error);
    }
  }
}