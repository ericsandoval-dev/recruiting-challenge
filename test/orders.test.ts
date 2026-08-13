// Set DB_PATH before importing the db module — the connection is created on import.
if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initSchema, db } from '../src/db.js';
import { ordersDal } from '../src/dal/orders-dal.js';

test('orders DAL: create + listByMerchant returns the order', () => {
  initSchema();
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES ('m_test', 'Test')`).run();
  const created = ordersDal.create({
    id: 'o1',
    merchant_id: 'm_test',
    customer_email: 'a@b.com',
    total_amount: 5000,
    type: 'sale',
    status: 'completed',
  });
  assert.equal(created.id, 'o1');
  const list = ordersDal.listByMerchant('m_test');
  assert.equal(list.length, 1);
  assert.equal(list[0]!.total_amount, 5000);
});

test('orders DAL: getById returns the order', () => {
  initSchema();
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES ('m_test', 'Test')`).run();
  ordersDal.create({
    id: 'o2',
    merchant_id: 'm_test',
    customer_email: 'c@d.com',
    total_amount: 1200,
    type: 'sale',
    status: 'completed',
  });
  const got = ordersDal.getById('m_test', 'o2');
  assert.equal(got?.total_amount, 1200);
});


test('orders DAL: a merchant cannot get an order from another merchant', () => {
  initSchema();

  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES ('m_a', 'Merchant A')`).run();
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES ('m_b', 'Merchant B')`).run();

  ordersDal.create({
    id: 'o3',
    merchant_id: 'm_b',
    customer_email: 'test@example.com',
    total_amount: 2000,
    type: 'sale',
    status: 'completed',
  });

  const got = ordersDal.getById('m_a', 'o3');

  assert.equal(got, undefined);
});

test('revenue subtracts refunds', () => {
  initSchema();

  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES ('m_revenue', 'Revenue Test')`).run();

  ordersDal.create({
    id: 'sale1',
    merchant_id: 'm_revenue',
    customer_email: 'test@example.com',
    total_amount: 10000,
    type: 'sale',
    status: 'completed',
  });

  ordersDal.create({
    id: 'refund1',
    merchant_id: 'm_revenue',
    customer_email: 'test@example.com',
    total_amount: 2000,
    type: 'refund',
    status: 'completed',
  });

  const total = ordersDal.sumAmountByMerchant(
    'm_revenue',
    '2000-01-01',
    '2100-01-01',
  );

  assert.equal(total, 8000);
});

