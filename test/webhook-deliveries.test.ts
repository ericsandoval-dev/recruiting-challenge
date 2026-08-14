if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';

import { initSchema, db } from '../src/db.js';
import { webhooksDal } from '../src/dal/webhooks-dal.js';
import { webhookDeliveriesDal } from '../src/dal/webhook-deliveries-dal.js';

test('webhook deliveries DAL: creates and returns a due delivery', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_queue', 'Queue Test')`,
  ).run();

  webhooksDal.create({
    id: 'sub-queue-1',
    merchant_id: 'm_queue',
    url: 'https://example.com/webhook',
    event: 'order.created',
    secret: 'queue-secret',
  });

  webhookDeliveriesDal.create({
    id: 'delivery-1',
    subscription_id: 'sub-queue-1',
    event: 'order.created',
    payload: JSON.stringify({
      event: 'order.created',
      order: { id: 'order-1' },
    }),
    next_attempt_at: 1000,
  });

  const due = webhookDeliveriesDal.listDue(1000);

  const delivery = due.find(
    (item) => item.id === 'delivery-1',
  );

  assert.ok(delivery);
  assert.equal(delivery.attempt_count, 0);
  assert.equal(delivery.last_error, null);
});

test('webhook deliveries DAL: records failure and removes successful delivery', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_queue_failure', 'Queue Failure Test')`,
  ).run();

  webhooksDal.create({
    id: 'sub-queue-2',
    merchant_id: 'm_queue_failure',
    url: 'https://example.com/webhook',
    event: 'order.created',
    secret: 'queue-failure-secret',
  });

  webhookDeliveriesDal.create({
    id: 'delivery-2',
    subscription_id: 'sub-queue-2',
    event: 'order.created',
    payload: '{"event":"order.created"}',
    next_attempt_at: 1000,
  });

  webhookDeliveriesDal.markFailure(
    'delivery-2',
    1,
    2000,
    'receiver returned 500',
  );

  const tooEarly = webhookDeliveriesDal
    .listDue(1999)
    .find((item) => item.id === 'delivery-2');

  assert.equal(tooEarly, undefined);

  const due = webhookDeliveriesDal
    .listDue(2000)
    .find((item) => item.id === 'delivery-2');

  assert.ok(due);
  assert.equal(due.attempt_count, 1);
  assert.equal(due.last_error, 'receiver returned 500');

  webhookDeliveriesDal.remove('delivery-2');

  const afterRemoval = webhookDeliveriesDal
    .listDue(Number.MAX_SAFE_INTEGER)
    .find((item) => item.id === 'delivery-2');

  assert.equal(afterRemoval, undefined);
});