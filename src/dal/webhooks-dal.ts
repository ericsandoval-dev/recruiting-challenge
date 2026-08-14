import { db } from '../db.js';

export type WebhookEvent =
  | 'order.created'
  | 'order.refunded'
  | 'order.status_changed';

export interface WebhookSubscriptionRow {
  id: string;
  merchant_id: string;
  url: string;
  event: WebhookEvent;
  secret: string;
  active: number;
  created_at: string;
}

export const webhooksDal = {
  create(
    subscription: Omit<WebhookSubscriptionRow, 'active' | 'created_at'>,
  ): WebhookSubscriptionRow {
    db.prepare(
      `INSERT INTO webhook_subscriptions
       (id, merchant_id, url, event, secret)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      subscription.id,
      subscription.merchant_id,
      subscription.url,
      subscription.event,
      subscription.secret,
    );

    return db
      .prepare(`SELECT * FROM webhook_subscriptions WHERE id = ?`)
      .get(subscription.id) as WebhookSubscriptionRow;
  },

  getById(id: string): WebhookSubscriptionRow | undefined {
  return db
    .prepare(
      `SELECT * FROM webhook_subscriptions
       WHERE id = ?`,
    )
    .get(id) as WebhookSubscriptionRow | undefined;
},

  listActiveByMerchantAndEvent(
    merchantId: string,
    event: WebhookEvent,
  ): WebhookSubscriptionRow[] {
    return db
      .prepare(
        `SELECT * FROM webhook_subscriptions
         WHERE merchant_id = ?
           AND event = ?
           AND active = 1`,
      )
      .all(merchantId, event) as WebhookSubscriptionRow[];
  },
};