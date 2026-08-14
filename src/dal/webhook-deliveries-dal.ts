import { db } from '../db.js';
import type { WebhookEvent } from './webhooks-dal.js';

export interface WebhookDeliveryRow {
  id: string;
  subscription_id: string;
  event: WebhookEvent;
  payload: string;
  attempt_count: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: string;
}

export const webhookDeliveriesDal = {
  create(
    delivery: Pick<
      WebhookDeliveryRow,
      'id' | 'subscription_id' | 'event' | 'payload' | 'next_attempt_at'
    >,
  ): WebhookDeliveryRow {
    db.prepare(
      `INSERT INTO webhook_deliveries
       (id, subscription_id, event, payload, next_attempt_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      delivery.id,
      delivery.subscription_id,
      delivery.event,
      delivery.payload,
      delivery.next_attempt_at,
    );

    return db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE id = ?`,
      )
      .get(delivery.id) as WebhookDeliveryRow;
  },

  listDue(
    now: number,
    limit = 50,
  ): WebhookDeliveryRow[] {
    return db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE next_attempt_at <= ?
         ORDER BY next_attempt_at ASC
         LIMIT ?`,
      )
      .all(now, limit) as WebhookDeliveryRow[];
  },

  markFailure(
    id: string,
    attemptCount: number,
    nextAttemptAt: number,
    lastError: string,
  ): void {
    db.prepare(
      `UPDATE webhook_deliveries
       SET attempt_count = ?,
           next_attempt_at = ?,
           last_error = ?
       WHERE id = ?`,
    ).run(
      attemptCount,
      nextAttemptAt,
      lastError,
      id,
    );
  },

  remove(id: string): void {
    db.prepare(
      `DELETE FROM webhook_deliveries
       WHERE id = ?`,
    ).run(id);
  },
};