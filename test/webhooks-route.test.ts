if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { initSchema, db } from '../src/db.js';
import { authMiddleware } from '../src/auth.js';
import { webhooksRouter } from '../src/routes/webhooks.js';
import { webhooksDal } from '../src/dal/webhooks-dal.js';

function createTestApp() {
  const app = express();

  app.use(express.json());

  app.use(
    '/api/webhooks',
    authMiddleware,
    webhooksRouter,
  );

  return app;
}

test('GET /api/webhooks returns only merchant subscriptions without secret', async () => {
  initSchema();

  db.prepare(`
    INSERT OR IGNORE INTO merchants (id, name)
    VALUES
      ('m_route_a', 'Merchant A'),
      ('m_route_b', 'Merchant B')
  `).run();

  webhooksDal.create({
    id: 'route-wh-a',
    merchant_id: 'm_route_a',
    url: 'https://a.example.com/webhook',
    event: 'order.created',
    secret: 'secret-a',
  });

  webhooksDal.create({
    id: 'route-wh-b',
    merchant_id: 'm_route_b',
    url: 'https://b.example.com/webhook',
    event: 'order.created',
    secret: 'secret-b',
  });

  const app = createTestApp();

  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/webhooks`,
      {
        headers: {
          'X-Merchant-Id': 'm_route_a',
        },
      },
    );

    assert.equal(response.status, 200);

    const body = await response.json() as {
      webhooks: Array<Record<string, unknown>>;
    };

    assert.equal(body.webhooks.length, 1);
    assert.equal(body.webhooks[0]!.id, 'route-wh-a');

    assert.equal(
      Object.hasOwn(body.webhooks[0]!, 'secret'),
      false,
    );
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

test('DELETE /api/webhooks/:id deactivates merchant subscription', async () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_route_delete', 'Delete Test')`,
  ).run();

  webhooksDal.create({
    id: 'route-wh-delete',
    merchant_id: 'm_route_delete',
    url: 'https://example.com/webhook',
    event: 'order.created',
    secret: 'delete-secret',
  });

  const app = createTestApp();

  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/webhooks/route-wh-delete`,
      {
        method: 'DELETE',
        headers: {
          'X-Merchant-Id': 'm_route_delete',
        },
      },
    );

    assert.equal(response.status, 204);

    const subscription =
      webhooksDal.getById('route-wh-delete');

    assert.equal(subscription?.active, 0);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});

test('DELETE /api/webhooks/:id cannot deactivate another merchant subscription', async () => {
  initSchema();

  db.prepare(`
    INSERT OR IGNORE INTO merchants (id, name)
    VALUES
      ('m_route_owner', 'Owner'),
      ('m_route_other', 'Other')
  `).run();

  webhooksDal.create({
    id: 'route-wh-private',
    merchant_id: 'm_route_owner',
    url: 'https://example.com/private',
    event: 'order.created',
    secret: 'private-secret',
  });

  const app = createTestApp();

  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/webhooks/route-wh-private`,
      {
        method: 'DELETE',
        headers: {
          'X-Merchant-Id': 'm_route_other',
        },
      },
    );

    assert.equal(response.status, 404);

    const subscription =
      webhooksDal.getById('route-wh-private');

    assert.equal(subscription?.active, 1);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});