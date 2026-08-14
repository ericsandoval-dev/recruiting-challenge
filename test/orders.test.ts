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

test('top customers subtracts refunds from total spent', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_top', 'Top Customers Test')`,
  ).run();

  ordersDal.create({
    id: 'top-sale',
    merchant_id: 'm_top',
    customer_email: 'customer@example.com',
    total_amount: 10000,
    type: 'sale',
    status: 'completed',
  });

  ordersDal.create({
    id: 'top-refund',
    merchant_id: 'm_top',
    customer_email: 'customer@example.com',
    total_amount: 2000,
    type: 'refund',
    status: 'completed',
  });

  const customers = ordersDal.getTopCustomersByMerchant('m_top', 5);

  assert.equal(customers.length, 1);
  assert.equal(customers[0].order_count, 2);
  assert.equal(customers[0].total_spent, 8000);
});

test('merchant summary returns order and customer metrics', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_summary', 'Summary Test')`,
  ).run();

  ordersDal.create({
    id: 'summary-1',
    merchant_id: 'm_summary',
    customer_email: 'one@example.com',
    total_amount: 1000,
    type: 'sale',
    status: 'completed',
  });

  ordersDal.create({
    id: 'summary-2',
    merchant_id: 'm_summary',
    customer_email: 'two@example.com',
    total_amount: 3000,
    type: 'sale',
    status: 'completed',
  });

  const summary = ordersDal.getSummaryByMerchant('m_summary');

  assert.equal(summary.total_orders, 2);
  assert.equal(summary.unique_customers, 2);
  assert.equal(summary.avg_order_value_cents, 2000);
});


test('orders DAL: updateStatus changes the order status', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_status', 'Status Test')`,
  ).run();

  ordersDal.create({
    id: 'status-order-1',
    merchant_id: 'm_status',
    customer_email: 'status@example.com',
    total_amount: 1500,
    type: 'sale',
    status: 'completed',
  });

  const updated = ordersDal.updateStatus(
    'm_status',
    'status-order-1',
    'cancelled',
  );

  assert.equal(updated?.status, 'cancelled');

  const stored = ordersDal.getById(
    'm_status',
    'status-order-1',
  );

  assert.equal(stored?.status, 'cancelled');
});

test('orders DAL: a merchant cannot update another merchant order', () => {
  initSchema();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_status_a', 'Merchant A')`,
  ).run();

  db.prepare(
    `INSERT OR IGNORE INTO merchants (id, name)
     VALUES ('m_status_b', 'Merchant B')`,
  ).run();

  ordersDal.create({
    id: 'status-order-2',
    merchant_id: 'm_status_b',
    customer_email: 'other@example.com',
    total_amount: 2500,
    type: 'sale',
    status: 'completed',
  });

  const updated = ordersDal.updateStatus(
    'm_status_a',
    'status-order-2',
    'cancelled',
  );

  assert.equal(updated, undefined);

  const original = ordersDal.getById(
    'm_status_b',
    'status-order-2',
  );

  assert.equal(original?.status, 'completed');
});