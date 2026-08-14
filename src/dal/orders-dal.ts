import { db } from '../db.js';

export interface OrderRow {
  id: string;
  merchant_id: string;
  customer_email: string;
  total_amount: number;
  type: 'sale' | 'refund';
  status: string;
  created_at: string;
}

export interface MerchantSummary {
  total_orders: number;
  unique_customers: number;
  avg_order_value_cents: number;
}

export interface TopCustomer {
  customer_email: string;
  order_count: number;
  total_spent: number;
}

/**
 * Data-access layer for orders. All order queries should go through here.
 *
 * - centralized place for query patterns
 * - the place to add auditing, caching, tenancy filters
 * - the seam for swapping the underlying store
 */
export const ordersDal = {
  listByMerchant(
    merchantId: string,
    opts: { from?: string; to?: string; limit?: number } = {},
  ): OrderRow[] {
    const limit = opts.limit ?? 100;

    if (opts.from && opts.to) {
      return db
        .prepare(
          `SELECT * FROM orders
           WHERE merchant_id = ? AND created_at >= ? AND created_at < ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(merchantId, opts.from, opts.to, limit) as OrderRow[];
    }

    return db
      .prepare(
        `SELECT * FROM orders
         WHERE merchant_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(merchantId, limit) as OrderRow[];
  },

  getById(merchantId: string, id: string): OrderRow | undefined {
    return db
      .prepare(
        `SELECT * FROM orders
         WHERE merchant_id = ? AND id = ?`,
      )
      .get(merchantId, id) as OrderRow | undefined;
  },

  create(order: Omit<OrderRow, 'created_at'>): OrderRow {
    db.prepare(
      `INSERT INTO orders
       (id, merchant_id, customer_email, total_amount, type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      order.id,
      order.merchant_id,
      order.customer_email,
      order.total_amount,
      order.type,
      order.status,
    );

    return this.getById(order.merchant_id, order.id)!;
  },

  updateStatus(
    merchantId: string,
    id: string,
    status: string,
  ): OrderRow | undefined {
    const result = db
      .prepare(
        `UPDATE orders
         SET status = ?
         WHERE merchant_id = ? AND id = ?`,
      )
      .run(status, merchantId, id);

    if (result.changes === 0) {
      return undefined;
    }

    return this.getById(merchantId, id);
  },

  /**
   * Sum total_amount over a date range for a merchant.
   * Used by the revenue endpoint.
   */
  sumAmountByMerchant(
    merchantId: string,
    from: string,
    to: string,
  ): number {
    const row = db
      .prepare(
        `SELECT COALESCE(
           SUM(
             CASE
               WHEN type = 'refund' THEN -total_amount
               ELSE total_amount
             END
           ),
           0
         ) AS total
         FROM orders
         WHERE merchant_id = ?
           AND created_at >= ?
           AND created_at < ?`,
      )
      .get(merchantId, from, to) as { total: number };

    return row.total;
  },

  getSummaryByMerchant(merchantId: string): MerchantSummary {
    const totalOrdersRow = db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM orders
         WHERE merchant_id = ?`,
      )
      .get(merchantId) as { n: number };

    const totalCustomersRow = db
      .prepare(
        `SELECT COUNT(DISTINCT customer_email) AS n
         FROM orders
         WHERE merchant_id = ?`,
      )
      .get(merchantId) as { n: number };

    const avgOrderRow = db
      .prepare(
        `SELECT COALESCE(AVG(total_amount), 0) AS avg
         FROM orders
         WHERE merchant_id = ?`,
      )
      .get(merchantId) as { avg: number };

    return {
      total_orders: totalOrdersRow.n,
      unique_customers: totalCustomersRow.n,
      avg_order_value_cents: Math.round(avgOrderRow.avg),
    };
  },

  getTopCustomersByMerchant(
    merchantId: string,
    limit: number,
  ): TopCustomer[] {
    return db
      .prepare(
        `SELECT
           customer_email,
           COUNT(*) AS order_count,
           SUM(
             CASE
               WHEN type = 'refund' THEN -total_amount
               ELSE total_amount
             END
           ) AS total_spent
         FROM orders
         WHERE merchant_id = ?
         GROUP BY customer_email
         ORDER BY total_spent DESC
         LIMIT ?`,
      )
      .all(merchantId, limit) as TopCustomer[];
  },
};