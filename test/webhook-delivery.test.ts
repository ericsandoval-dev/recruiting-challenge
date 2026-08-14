if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

import { initSchema, db } from '../src/db.js';
import { webhooksDal } from '../src/dal/webhooks-dal.js';
import {
  deliverWebhookEvent,
  processDueWebhookDeliveries,
} from '../src/services/webhook-delivery.js';

test('webhook delivery sends event, payload and valid HMAC signature', async () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_delivery', 'Delivery Test')`,
  ).run();

  const secret = 'test-webhook-secret';

  let receivedBody = '';
  let receivedEvent: string | undefined;
  let receivedSignature: string | undefined;

  const server = createServer((req, res) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      receivedBody = body;
      receivedEvent = req.headers['x-webhook-event'] as string | undefined;
      receivedSignature = req.headers[
        'x-webhook-signature'
      ] as string | undefined;

      res.writeHead(200, {
        'Content-Type': 'application/json',
      });

      res.end(JSON.stringify({ received: true }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    const url = `http://127.0.0.1:${address.port}/webhook`;

    webhooksDal.create({
      id: 'webhook-delivery-test',
      merchant_id: 'm_delivery',
      url,
      event: 'order.created',
      secret,
    });

    const order = {
      id: 'delivery-order-1',
      customer_email: 'delivery@example.com',
      total_amount: 5000,
      type: 'sale',
      status: 'completed',
      created_at: '2026-08-14 00:00:00',
    };

    await deliverWebhookEvent(
      'm_delivery',
      'order.created',
      order,
    );

    assert.equal(receivedEvent, 'order.created');

    const payload = JSON.parse(receivedBody);

    assert.deepEqual(payload, {
      event: 'order.created',
      order,
    });

    const expectedSignature = createHmac(
      'sha256',
      secret,
    )
      .update(receivedBody)
      .digest('hex');

    assert.equal(
      receivedSignature,
      expectedSignature,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test('webhook delivery retries a persisted delivery and removes it after recovery', async () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_recovery', 'Recovery Test')`,
  ).run();

  let requestCount = 0;

  const server = createServer((_req, res) => {
    requestCount += 1;

    if (requestCount === 1) {
      res.writeHead(500);
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ received: true }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    webhooksDal.create({
      id: 'recovery-subscription',
      merchant_id: 'm_recovery',
      url: `http://127.0.0.1:${address.port}/webhook`,
      event: 'order.created',
      secret: 'recovery-secret',
    });

    const order = {
      id: 'recovery-order',
      customer_email: 'recovery@example.com',
      total_amount: 4200,
      type: 'sale',
      status: 'completed',
      created_at: '2026-08-14 00:00:00',
    };

    // First attempt returns HTTP 500.
    await deliverWebhookEvent(
      'm_recovery',
      'order.created',
      order,
    );

    assert.equal(requestCount, 1);

    const pendingAfterFailure = db
      .prepare(
        `SELECT *
         FROM webhook_deliveries
         WHERE subscription_id = ?`,
      )
      .get('recovery-subscription') as
      | { attempt_count: number; last_error: string }
      | undefined;

    assert.ok(pendingAfterFailure);
    assert.equal(pendingAfterFailure.attempt_count, 1);
    assert.equal(pendingAfterFailure.last_error, 'HTTP 500');

    // First retry uses a 100ms backoff.
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // Simulate the worker checking due deliveries.
    await processDueWebhookDeliveries();

    assert.equal(requestCount, 2);

    const pendingAfterRecovery = db
      .prepare(
        `SELECT *
         FROM webhook_deliveries
         WHERE subscription_id = ?`,
      )
      .get('recovery-subscription');

    assert.equal(pendingAfterRecovery, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test('webhook delivery removes pending delivery when subscription is deactivated', async () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_deactivated_delivery', 'Deactivated Delivery Test')`,
  ).run();

  let requestCount = 0;

  const server = createServer((_req, res) => {
    requestCount += 1;

    // Simulamos que el receptor está fallando.
    res.writeHead(500);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    webhooksDal.create({
      id: 'deactivated-subscription',
      merchant_id: 'm_deactivated_delivery',
      url: `http://127.0.0.1:${address.port}/webhook`,
      event: 'order.created',
      secret: 'deactivated-secret',
    });

    const order = {
      id: 'deactivated-order',
      customer_email: 'deactivated@example.com',
      total_amount: 3500,
      type: 'sale',
      status: 'completed',
      created_at: '2026-08-14 00:00:00',
    };

    // Primer intento: falla y queda pendiente.
    await deliverWebhookEvent(
      'm_deactivated_delivery',
      'order.created',
      order,
    );

    assert.equal(requestCount, 1);

    const pendingBeforeDeactivate = db
      .prepare(
        `SELECT *
         FROM webhook_deliveries
         WHERE subscription_id = ?`,
      )
      .get('deactivated-subscription');

    assert.ok(pendingBeforeDeactivate);

    // El merchant decide dejar de recibir este webhook.
    const deactivated = webhooksDal.deactivate(
      'm_deactivated_delivery',
      'deactivated-subscription',
    );

    assert.equal(deactivated, true);

    // Esperamos a que llegue el momento del retry.
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    // El worker revisa los pendientes.
    await processDueWebhookDeliveries();

    // Sigue siendo 1:
    // no hizo un segundo POST porque la suscripción está desactivada.
    assert.equal(requestCount, 1);

    const pendingAfterDeactivate = db
      .prepare(
        `SELECT *
         FROM webhook_deliveries
         WHERE subscription_id = ?`,
      )
      .get('deactivated-subscription');

    // El delivery pendiente también debe desaparecer.
    assert.equal(pendingAfterDeactivate, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});