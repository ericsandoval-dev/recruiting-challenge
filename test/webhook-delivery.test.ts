if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

import { initSchema, db } from '../src/db.js';
import { webhooksDal } from '../src/dal/webhooks-dal.js';
import { deliverWebhookEvent } from '../src/services/webhook-delivery.js';

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