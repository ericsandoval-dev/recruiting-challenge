// Set DB_PATH before importing the db module.
if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initSchema, db } from '../src/db.js';
import { webhooksDal } from '../src/dal/webhooks-dal.js';

test('webhooks DAL: creates a subscription', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_webhook', 'Webhook Test')`,
  ).run();

  const created = webhooksDal.create({
    id: 'wh_1',
    merchant_id: 'm_webhook',
    url: 'https://example.com/webhooks',
    event: 'order.created',
    secret: 'test-secret',
  });

  assert.equal(created.id, 'wh_1');
  assert.equal(created.merchant_id, 'm_webhook');
  assert.equal(created.event, 'order.created');
  assert.equal(created.active, 1);
});

test('webhooks DAL: returns only subscriptions for the merchant and event', () => {
  initSchema();

  db.prepare(`
    INSERT OR IGNORE INTO merchants (id, name)
    VALUES
      ('m_webhook_a', 'Merchant A'),
      ('m_webhook_b', 'Merchant B')
  `).run();

  webhooksDal.create({
    id: 'wh_a_created',
    merchant_id: 'm_webhook_a',
    url: 'https://a.example.com/webhooks',
    event: 'order.created',
    secret: 'secret-a',
  });

  webhooksDal.create({
    id: 'wh_a_refunded',
    merchant_id: 'm_webhook_a',
    url: 'https://a.example.com/refunds',
    event: 'order.refunded',
    secret: 'secret-b',
  });

  webhooksDal.create({
    id: 'wh_b_created',
    merchant_id: 'm_webhook_b',
    url: 'https://b.example.com/webhooks',
    event: 'order.created',
    secret: 'secret-c',
  });

  const subscriptions =
    webhooksDal.listActiveByMerchantAndEvent(
      'm_webhook_a',
      'order.created',
    );

  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0]!.id, 'wh_a_created');
});

test('webhooks DAL: merchant can deactivate its own subscription', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_deactivate', 'Deactivate Test')`,
  ).run();

  webhooksDal.create({
    id: 'wh_deactivate',
    merchant_id: 'm_deactivate',
    url: 'https://example.com/webhook',
    event: 'order.created',
    secret: 'deactivate-secret',
  });

  const result = webhooksDal.deactivate(
    'm_deactivate',
    'wh_deactivate',
  );

  assert.equal(result, true);

  const subscription = webhooksDal.getById(
    'wh_deactivate',
  );

  assert.equal(subscription?.active, 0);
});

test('webhooks DAL: merchant cannot deactivate another merchant subscription', () => {
  initSchema();

  db.prepare(`
    INSERT OR IGNORE INTO merchants (id, name)
    VALUES
      ('m_owner', 'Owner Merchant'),
      ('m_attacker', 'Other Merchant')
  `).run();

  webhooksDal.create({
    id: 'wh_private',
    merchant_id: 'm_owner',
    url: 'https://example.com/private-webhook',
    event: 'order.created',
    secret: 'private-secret',
  });

  const result = webhooksDal.deactivate(
    'm_attacker',
    'wh_private',
  );

  assert.equal(result, false);

  const subscription = webhooksDal.getById(
    'wh_private',
  );

  assert.equal(subscription?.active, 1);
});