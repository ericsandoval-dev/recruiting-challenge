if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { initSchema, db } from '../src/db.js';
import { authMiddleware } from '../src/auth.js';
import { ordersRouter } from '../src/routes/orders.js';
import { metricsRouter } from '../src/routes/metrics.js';
import { ordersDal } from '../src/dal/orders-dal.js';

function createTestApp() {
  const app = express();

  app.use(express.json());
  app.use('/api/orders', authMiddleware, ordersRouter);
  app.use('/api/metrics', authMiddleware, metricsRouter);

  return app;
}

async function startTestServer() {
  const app = createTestApp();
  const server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server port');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeTestServer(
  server: ReturnType<typeof express.prototype.listen>,
) {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

test('GET /api/orders rejects a non-numeric limit', async () => {
  initSchema();

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/orders?limit=abc`,
      {
        headers: {
          'X-Merchant-Id': 'm_limit_invalid',
        },
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.deepEqual(body, {
      error: 'invalid_limit',
    });
  } finally {
    await closeTestServer(server);
  }
});

test('GET /api/orders rejects a negative limit', async () => {
  initSchema();

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/orders?limit=-5`,
      {
        headers: {
          'X-Merchant-Id': 'm_limit_negative',
        },
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.deepEqual(body, {
      error: 'invalid_limit',
    });
  } finally {
    await closeTestServer(server);
  }
});

test('GET /api/metrics/top-customers rejects a non-numeric limit', async () => {
  initSchema();

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/metrics/top-customers?limit=xyz`,
      {
        headers: {
          'X-Merchant-Id': 'm_metrics_limit',
        },
      },
    );

    assert.equal(response.status, 400);

    const body = await response.json();

    assert.deepEqual(body, {
      error: 'invalid_limit',
    });
  } finally {
    await closeTestServer(server);
  }
});

test('GET /api/orders accepts a positive integer limit', async () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_valid_limit', 'Valid Limit Test')`,
  ).run();

  ordersDal.create({
    id: 'limit-order-1',
    merchant_id: 'm_valid_limit',
    customer_email: 'one@example.com',
    total_amount: 1000,
    type: 'sale',
    status: 'completed',
  });

  ordersDal.create({
    id: 'limit-order-2',
    merchant_id: 'm_valid_limit',
    customer_email: 'two@example.com',
    total_amount: 2000,
    type: 'sale',
    status: 'completed',
  });

  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/orders?limit=1`,
      {
        headers: {
          'X-Merchant-Id': 'm_valid_limit',
        },
      },
    );

    assert.equal(response.status, 200);

    const body = await response.json() as {
      orders: unknown[];
    };

    assert.equal(body.orders.length, 1);
  } finally {
    await closeTestServer(server);
  }
});
