import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateOrderInput } from '../src/lib/order-input.js';

test('order input: accepts a valid sale', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: 1000,
    type: 'sale',
  });

  assert.deepEqual(result, {
    customer_email: 'test@example.com',
    total_amount: 1000,
    type: 'sale',
  });
});

test('order input: rejects a negative amount', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: -1000,
    type: 'sale',
  });

  assert.equal(result, null);
});

test('order input: rejects an invalid order type', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: 1000,
    type: 'other',
  });

  assert.equal(result, null);
});

test('order input: rejects an empty customer email', () => {
  const result = parseCreateOrderInput({
    customer_email: '   ',
    total_amount: 1000,
    type: 'sale',
  });

  assert.equal(result, null);
});

test('order input: defaults type to sale when omitted', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: 1000,
  });

  assert.deepEqual(result, {
    customer_email: 'test@example.com',
    total_amount: 1000,
    type: 'sale',
  });
});

test('order input: rejects a fractional amount', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: 1000.5,
    type: 'sale',
  });

  assert.equal(result, null);
});

test('order input: rejects null as order type', () => {
  const result = parseCreateOrderInput({
    customer_email: 'test@example.com',
    total_amount: 1000,
    type: null,
  });

  assert.equal(result, null);
});
