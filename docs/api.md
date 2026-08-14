# API reference

All API endpoints except `GET /api/health` require the `X-Merchant-Id` header.

---

## Authentication

Authenticated endpoints expect the merchant identifier in the following header:

```text
X-Merchant-Id: <merchant-id>
```

If the header is missing, the API returns:

```http
401 Unauthorized
```

```json
{
  "error": "missing_merchant_id"
}
```

API resources such as orders and webhook subscriptions are scoped to the authenticated merchant.

---

## Health

### `GET /api/health`

No authentication required.

Response:

```json
{
  "ok": true
}
```

---

## Orders

### `GET /api/orders`

Returns orders for the authenticated merchant.

Optional query parameters:

- `from`
- `to`
- `limit` — positive integer, defaults to `100`.

Example:

```text
GET /api/orders?limit=10
```

If `limit` is provided, it must be a positive integer.

Examples of invalid values include:

```text
limit=abc
limit=-5
limit=0
limit=2.5
```

An invalid `limit` returns:

```http
400 Bad Request
```

```json
{
  "error": "invalid_limit"
}
```

Response:

```json
{
  "orders": []
}
```

---

### `GET /api/orders/:id`

Returns a single order belonging to the authenticated merchant.

Returns `404` when the order does not exist or belongs to another merchant.

Example response:

```json
{
  "order": {
    "id": "order-id",
    "merchant_id": "merchant-id",
    "customer_email": "customer@example.com",
    "total_amount": 5000,
    "type": "sale",
    "status": "completed",
    "created_at": "2026-08-14 00:00:00"
  }
}
```

---

### `POST /api/orders`

Creates an order for the authenticated merchant.

Body:

```json
{
  "customer_email": "customer@example.com",
  "total_amount": 5000,
  "type": "sale"
}
```

Rules:

- `customer_email` must be a non-empty string.
- `total_amount` must be a positive integer.
- `type` may be `sale` or `refund`.
- `type` defaults to `sale` when omitted.
- New orders are created with status `completed`.

When validation fails, the API returns:

```http
400 Bad Request
```

```json
{
  "error": "invalid_body"
}
```

Creating a sale emits the webhook event:

```text
order.created
```

Creating a refund emits:

```text
order.refunded
```

---

### `PATCH /api/orders/:id/status`

Updates the status of an order belonging to the authenticated merchant.

Body:

```json
{
  "status": "cancelled"
}
```

The `status` field must be a non-empty string.

Returns:

- `400` when the request body is invalid.
- `404` when the order does not exist or belongs to another merchant.

When the status actually changes, the API emits:

```text
order.status_changed
```

If the requested status is already the current status, the order is returned without emitting another webhook event.

---

## Revenue

### `GET /api/revenue?from=...&to=...`

Returns revenue for the authenticated merchant within the requested date range.

Both `from` and `to` are required.

Refund amounts are subtracted from revenue.

Example response:

```json
{
  "merchant_id": "merchant-id",
  "from": "2026-08-01",
  "to": "2026-09-01",
  "revenue_cents": 12500,
  "revenue": 125
}
```

If `from` or `to` is missing, the API returns:

```http
400 Bad Request
```

```json
{
  "error": "missing_date_range",
  "detail": "from and to are required (YYYY-MM-DD)"
}
```

---

## Metrics

### `GET /api/metrics/summary`

Returns dashboard summary metrics for the authenticated merchant.

Example response:

```json
{
  "merchant_id": "merchant-id",
  "total_orders": 10,
  "unique_customers": 7,
  "avg_order_value_cents": 4200
}
```

---

### `GET /api/metrics/top-customers`

Returns customers ordered by total spent.

Optional query parameter:

- `limit` — positive integer, defaults to `5`.

Example:

```text
GET /api/metrics/top-customers?limit=10
```

If `limit` is provided, it must be a positive integer.

Examples of invalid values include:

```text
limit=abc
limit=-5
limit=0
limit=2.5
```

An invalid `limit` returns:

```http
400 Bad Request
```

```json
{
  "error": "invalid_limit"
}
```

Refunds are subtracted from each customer's `total_spent`.

Example response:

```json
{
  "customers": [
    {
      "customer_email": "customer@example.com",
      "order_count": 3,
      "total_spent": 12000
    }
  ]
}
```

---

## Webhooks

Supported webhook events:

- `order.created`
- `order.refunded`
- `order.status_changed`

---

### `POST /api/webhooks`

Registers an HTTPS webhook endpoint for one or more supported events.

Body:

```json
{
  "url": "https://example.com/webhooks",
  "events": [
    "order.created",
    "order.refunded"
  ]
}
```

Rules:

- `url` must be a valid HTTPS URL.
- At least one supported event must be provided.
- Unsupported events are rejected.
- Duplicate events within the same request are ignored.

Example response:

```json
{
  "webhook": {
    "url": "https://example.com/webhooks",
    "events": [
      "order.created",
      "order.refunded"
    ],
    "secret": "generated-secret",
    "subscription_ids": [
      "subscription-id-1",
      "subscription-id-2"
    ]
  }
}
```

A secret is generated when the webhook is registered.

The secret is returned during registration so the receiving system can validate webhook signatures.

The secret is not returned when subscriptions are later listed.

Internally, one subscription record is stored for each selected event.

---

### `GET /api/webhooks`

Lists webhook subscriptions belonging to the authenticated merchant.

Webhook secrets are not returned.

Example response:

```json
{
  "webhooks": [
    {
      "id": "subscription-id",
      "url": "https://example.com/webhooks",
      "event": "order.created",
      "active": true,
      "created_at": "2026-08-14 00:00:00"
    }
  ]
}
```

Both active and previously deactivated subscriptions may appear in the response.

The `active` field indicates whether the subscription is currently enabled.

---

### `DELETE /api/webhooks/:id`

Deactivates a webhook subscription belonging to the authenticated merchant.

The subscription is not physically deleted. Instead, it is marked as inactive so its record can be retained.

A successful deactivation returns:

```http
204 No Content
```

The API returns `404` when:

- the subscription does not exist;
- the subscription is already inactive;
- or the subscription belongs to another merchant.

A merchant cannot deactivate another merchant's webhook subscription.

---

## Webhook delivery

Webhook events are delivered using HTTP `POST`.

The request body contains the event name and the related order.

Example:

```json
{
  "event": "order.created",
  "order": {
    "id": "order-id",
    "merchant_id": "merchant-id",
    "customer_email": "customer@example.com",
    "total_amount": 5000,
    "type": "sale",
    "status": "completed",
    "created_at": "2026-08-14 00:00:00"
  }
}
```

Webhook requests include the following headers:

```text
Content-Type: application/json
X-Webhook-Event: order.created
X-Webhook-Signature: <signature>
X-Webhook-Delivery-Id: <delivery-id>
```

---

### Signature verification

`X-Webhook-Signature` contains an HMAC-SHA256 signature of the exact JSON request body.

The subscription secret is used as the HMAC key.

Conceptually:

```text
HMAC-SHA256(subscription_secret, request_body)
```

The resulting signature is encoded as a lowercase hexadecimal string.

A receiver can calculate the HMAC over the exact request body using the subscription secret and compare the resulting hexadecimal value with `X-Webhook-Signature`.

---

## Delivery persistence and retries

Webhook deliveries are persisted before delivery is attempted.

A pending delivery remains stored until:

- delivery succeeds;
- or its webhook subscription is deactivated.

If the receiving endpoint returns a non-successful HTTP response or cannot be reached, the delivery remains pending and is scheduled for retry.

Retries use exponential backoff.

The delay begins approximately as:

```text
100 ms
200 ms
400 ms
800 ms
1600 ms
...
```

The retry delay is capped at:

```text
60 seconds
```

After reaching the cap, failed deliveries continue to be retried with a maximum delay of 60 seconds between attempts.

There is currently no fixed maximum number of retry attempts.

When a delivery succeeds, its pending delivery record is removed.

If a subscription is deactivated while a delivery is still pending, that delivery is removed and is not sent again.

---

## Merchant isolation

API access is scoped using the `X-Merchant-Id` header.

Orders and webhook subscriptions are restricted to the authenticated merchant.

A merchant cannot:

- retrieve another merchant's order;
- update another merchant's order status;
- deactivate another merchant's webhook subscription.

Requests attempting to access another merchant's protected resources behave as if that resource were unavailable to the requesting merchant.