# Architecture

This application is a small Express + SQLite merchant dashboard.

The main architectural goal is to keep HTTP concerns, validation, business/application behavior, and database access separated through explicit module boundaries.

---

## High-level structure

```text
Client / Dashboard
        |
        v
   Express routes
        |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
 Query validation         Orders DAL          Webhook service
        |                      |                      |
        |                      v                      |
        |                    SQLite                   |
        |                                             |
        |                          +------------------+
        |                          |                  |
        |                          v                  v
        |                   Webhooks DAL      Deliveries DAL
        |                          |                  |
        |                          +--------+---------+
        |                                   |
        |                                   v
        |                                 SQLite
        |                                   |
        |                                   v
        |                           Delivery worker
        |                                   |
        |                                   v
        +--------------------------> Merchant HTTPS endpoint
```

The application remains a single Node.js process, but the code separates responsibilities so the main boundaries are explicit.

---

## Modules

### `server.ts`

Application bootstrapper.

Responsibilities:

- initializes the SQLite schema;
- seeds the database when needed;
- configures Express;
- serves the static dashboard;
- mounts API routers;
- installs the global error handler;
- starts the webhook delivery worker.

The webhook worker runs in the same Node.js process as the HTTP server.

---

### `db.ts`

Owns the shared SQLite connection and schema initialization.

The database path defaults to:

```text
data/dashboard.db
```

and can be overridden with:

```text
DB_PATH
```

SQLite runs with:

```text
journal_mode = WAL
foreign_keys = ON
```

`db.ts` contains the canonical schema definition.

---

### `auth.ts`

Provides the authentication boundary for API routes.

For this challenge, authentication is intentionally simplified.

Clients identify the current merchant using:

```text
X-Merchant-Id
```

The middleware copies this value to:

```text
req.merchantId
```

A missing header returns:

```text
401 Unauthorized
```

This is not production authentication.

A production system would validate a trusted credential, such as a signed token or another authenticated identity mechanism, instead of trusting a caller-provided merchant identifier.

---

### `lib/query-input.ts`

Contains shared validation for numeric query parameters.

The current helper:

```text
parsePositiveIntegerQuery
```

accepts an HTTP query value and ensures that it represents a positive safe integer before the value reaches the data-access layer.

For example:

```text
"10"   -> 10
"1"    -> 1

"abc"  -> invalid
"-5"   -> invalid
"0"    -> invalid
"2.5"  -> invalid
```

If a query parameter is omitted, the caller can provide the endpoint-specific default.

Current defaults are:

```text
GET /api/orders
limit = 100

GET /api/metrics/top-customers
limit = 5
```

This prevents invalid values such as `NaN` or negative limits from reaching SQLite.

The intended boundary is:

```text
HTTP query string
        |
        v
query validation
        |
        v
validated number
        |
        v
DAL
        |
        v
SQLite
```

Invalid client input is therefore rejected at the HTTP boundary instead of being discovered later as a database error.

---

### `routes/`

Express routers define the HTTP API boundary.

Current resources:

```text
routes/orders.ts
routes/revenue.ts
routes/metrics.ts
routes/webhooks.ts
```

Routes are responsible for:

- reading HTTP inputs;
- validating request data;
- validating supported query parameters;
- calling the appropriate DAL or service;
- translating results into HTTP responses.

Routes do not directly query SQLite.

For example, invalid `limit` values are rejected with:

```text
400 Bad Request
```

before they can reach the DAL.

---

### `dal/orders-dal.ts`

Central data-access layer for orders.

All order reads, writes, and order-based metrics go through `ordersDal`.

It currently owns operations such as:

- listing merchant orders;
- retrieving an order;
- creating an order;
- changing an order status;
- calculating revenue;
- calculating dashboard summary metrics;
- calculating top customers.

Merchant-sensitive reads and updates include `merchant_id` in their query boundary.

For example, retrieving an order uses both:

```text
merchant_id + order_id
```

instead of querying only by order ID.

This prevents one merchant from retrieving or modifying another merchant's order through the API.

Keeping order queries behind this DAL also provides one consistent data-access boundary instead of allowing routes or metric modules to create independent SQLite access paths.

---

### `dal/webhooks-dal.ts`

Owns persistence for webhook subscriptions.

It supports:

- creating subscriptions;
- listing a merchant's subscriptions;
- finding active subscriptions for a merchant and event;
- deactivating a merchant-owned subscription;
- internal lookup of a subscription by ID.

Merchant-facing operations are scoped by:

```text
merchant_id
```

The internal `getById` lookup is used by the delivery worker after it receives a persisted `subscription_id`.

It is not exposed as a merchant-facing API lookup.

---

### `dal/webhook-deliveries-dal.ts`

Owns persistence for pending webhook deliveries.

A row in:

```text
webhook_deliveries
```

represents webhook work that still needs to be delivered.

The DAL supports:

- creating a pending delivery;
- finding deliveries whose retry time has arrived;
- recording a failed attempt;
- updating the next retry time;
- storing the last error;
- removing a completed or cancelled delivery.

There is no separate in-memory queue.

SQLite is the source of truth for pending webhook work, allowing retries to survive an application restart.

---

### `services/webhook-delivery.ts`

Contains webhook delivery behavior.

This service is the boundary between internal order events and external merchant systems.

Its responsibilities include:

- finding active subscriptions for an event;
- building the webhook payload;
- persisting delivery work before sending it;
- generating HMAC signatures;
- making outbound HTTP requests;
- handling successful and failed attempts;
- calculating retry delays;
- processing pending deliveries.

Keeping this behavior outside route handlers avoids mixing HTTP request handling with retry processing and external delivery logic.

---

## Data model

The application currently uses four SQLite tables:

```text
merchants
orders
webhook_subscriptions
webhook_deliveries
```

---

### `merchants`

Represents a merchant account.

Important fields:

```text
id
name
created_at
```

---

### `orders`

Stores merchant orders.

Important fields:

```text
id
merchant_id
customer_email
total_amount
type
status
created_at
```

`merchant_id` references:

```text
merchants.id
```

`type` is currently:

```text
sale
refund
```

Refunds are represented as separate order rows with a positive stored amount.

Financial aggregate queries determine how each row affects a metric.

For revenue and top-customer spending:

```text
sale   -> adds amount
refund -> subtracts amount
```

---

### `webhook_subscriptions`

Stores webhook event subscriptions.

Important fields:

```text
id
merchant_id
url
event
secret
active
created_at
```

`merchant_id` references:

```text
merchants.id
```

A registration request may contain multiple events.

The implementation stores one subscription row per event.

Rows created from the same registration request share the generated secret.

Supported events are:

```text
order.created
order.refunded
order.status_changed
```

Subscriptions are soft-deactivated using:

```text
active = 0
```

rather than being physically deleted.

---

### `webhook_deliveries`

Stores pending webhook delivery work.

Important fields:

```text
id
subscription_id
event
payload
attempt_count
next_attempt_at
last_error
created_at
```

`subscription_id` references:

```text
webhook_subscriptions.id
```

The presence of a row means that delivery is still pending.

A successful delivery removes the row.

An index on:

```text
next_attempt_at
```

supports finding deliveries that are ready for another attempt.

---

## Request validation boundary

Validation is performed before data reaches the DAL when the request contains values that cannot safely be trusted.

For order creation, the API validates fields such as:

```text
customer_email
total_amount
type
```

For numeric query parameters such as `limit`, the API uses:

```text
parsePositiveIntegerQuery
```

The previous behavior allowed values such as:

```text
limit=abc
```

to become:

```text
NaN
```

and reach SQLite.

That could cause a database exception and produce a server error for what was actually invalid client input.

The current flow is:

```text
GET /api/orders?limit=abc
        |
        v
parsePositiveIntegerQuery()
        |
        v
invalid
        |
        v
400 invalid_limit
```

instead of:

```text
GET /api/orders?limit=abc
        |
        v
Number("abc")
        |
        v
NaN
        |
        v
DAL
        |
        v
SQLite error
        |
        v
500
```

This keeps invalid HTTP input outside the database boundary.

---

## Order flow

A normal order creation follows this path:

```text
POST /api/orders
        |
        v
Validate request
        |
        v
ordersDal.create()
        |
        v
SQLite orders
        |
        v
Choose event
   |             |
   |             |
 sale          refund
   |             |
   v             v
order.created  order.refunded
        |
        v
deliverWebhookEvent()
        |
        v
HTTP response to client
```

Webhook delivery is started without making the API client wait for the external merchant endpoint to complete delivery.

The order API therefore does not depend on the external webhook receiver being available.

---

## Order listing flow

Order listing follows:

```text
GET /api/orders
        |
        v
Read query parameters
        |
        v
Validate limit
        |
        +------------------+
        |                  |
      valid              invalid
        |                  |
        v                  v
   ordersDal            400 response
        |
        v
      SQLite
```

If `limit` is omitted, the route uses:

```text
100
```

If it is provided, it must be a positive integer.

---

## Metrics flow

Metrics use the same order data-access boundary as normal order operations.

For example:

```text
GET /api/metrics/top-customers
        |
        v
Validate limit
        |
        v
ordersDal
        |
        v
SQLite
```

The default top-customer limit is:

```text
5
```

Invalid numeric input is rejected before the DAL is called.

Dashboard metrics no longer maintain a separate direct SQLite path.

---

## Order status flow

Status changes use:

```text
PATCH /api/orders/:id/status
```

The route first retrieves the order using both:

```text
authenticated merchant
+
order ID
```

If the requested status is unchanged, the current order is returned without generating another event.

When the value changes:

```text
ordersDal.updateStatus()
        |
        v
order.status_changed
        |
        v
Webhook delivery service
```

The challenge does not define a fixed order-status vocabulary.

For that reason, the implementation accepts a non-empty status string instead of introducing a business-state enum that was not specified.

---

## Revenue calculation

Revenue is calculated through:

```text
ordersDal
```

instead of directly from a route or metric module.

The aggregate treats sales and refunds differently:

```text
sale amount
    +
refund amount multiplied by -1
```

Conceptually:

```text
revenue = sales - refunds
```

This prevents refunds from being counted as positive revenue.

---

## Top-customer calculation

Top-customer spending is also calculated through:

```text
ordersDal
```

Refunds reduce the customer's total spending.

Conceptually:

```text
customer total spent
=
sales
-
refunds
```

The endpoint optionally accepts a positive integer:

```text
limit
```

which is validated before reaching SQLite.

---

## Webhook registration flow

A merchant registers an endpoint using:

```text
POST /api/webhooks
```

The request provides:

```text
HTTPS URL
+
one or more events
```

The route follows:

```text
Validate URL and events
        |
        v
Generate random secret
        |
        v
Create one subscription row per event
        |
        v
Return subscription IDs + secret
```

Only HTTPS URLs are accepted.

The generated secret is returned at creation time and is not exposed by the subscription listing endpoint.

---

## Webhook delivery flow

For each active subscription matching an event:

```text
Internal order event
        |
        v
Find active subscriptions
        |
        v
Build JSON payload
        |
        v
Persist webhook_delivery row
        |
        v
Attempt HTTP POST
        |
        +--------------------------+
        |                          |
      2xx                       failure
        |                          |
        v                          v
Remove delivery          Increment attempt count
                                  |
                                  v
                           Store last error
                                  |
                                  v
                       Schedule next attempt
```

Persisting the delivery before the HTTP attempt means a temporary receiver failure does not immediately lose the delivery.

---

## Webhook payload

A webhook contains:

```text
event
order
```

The order payload includes:

```text
id
merchant_id
customer_email
total_amount
type
status
created_at
```

Including `merchant_id` makes the event payload explicitly identify the merchant context associated with the order.

---

## Delivery worker

`server.ts` starts a background worker when the application starts.

The worker periodically checks SQLite for deliveries where:

```text
next_attempt_at <= current time
```

Due deliveries are processed sequentially.

A process-local guard prevents two worker loops in the same Node.js process from overlapping.

Because delivery state is stored in SQLite, restarting the application does not remove pending deliveries.

When the application starts again, the worker can continue processing previously persisted work.

---

## Retry policy

Failed webhook deliveries use exponential backoff.

The delay begins approximately as:

```text
100 ms
200 ms
400 ms
800 ms
1600 ms
...
```

and is capped at:

```text
60 seconds
```

There is currently no fixed maximum number of attempts.

Once the delay reaches the cap, a still-failing delivery continues to be retried with a maximum delay of 60 seconds between attempts.

This keeps the challenge implementation simple and allows recovery from temporary receiver outages without introducing a separate dead-letter workflow.

A production implementation would likely introduce additional controls such as:

- a maximum-attempt policy;
- dead-letter handling;
- alerting;
- delivery observability;
- explicit replay tools.

These were intentionally not introduced for the current challenge scope.

---

## Webhook authentication

Each webhook request includes:

```text
X-Webhook-Event
X-Webhook-Signature
X-Webhook-Delivery-Id
```

The signature is generated using:

```text
HMAC-SHA256(subscription_secret, exact_request_body)
```

The resulting signature is encoded as a lowercase hexadecimal string.

The receiver can calculate the same HMAC using the shared secret and compare it with:

```text
X-Webhook-Signature
```

This provides a way for the receiving system to verify that the body was signed with the shared subscription secret.

---

## Delivery identity

Each persisted delivery has its own identifier.

That identifier is sent as:

```text
X-Webhook-Delivery-Id
```

A receiver can use this value as part of its own duplicate-detection strategy.

This is useful because webhook delivery does not claim exactly-once semantics.

---

## Subscription deactivation

Webhook subscriptions are soft-deactivated.

```text
DELETE /api/webhooks/:id
        |
        v
active = 0
```

Deactivation is scoped to the authenticated merchant.

A merchant cannot deactivate another merchant's subscription.

Inactive subscriptions are excluded when new webhook events are generated.

If a previously created delivery becomes due after its subscription has been deactivated, the pending delivery is removed instead of being sent again.

---

## Merchant isolation

Merchant isolation is enforced at the data-access boundary for sensitive operations.

For orders:

```text
merchant_id + order_id
```

are used when retrieving or updating a specific order.

For webhook management:

```text
merchant_id + subscription_id
```

are used when deactivating subscriptions.

Webhook listings are also filtered by merchant.

This avoids a pattern such as:

```text
find resource globally
        |
        v
check ownership later
```

and instead moves ownership into the database query boundary itself.

Conceptually:

```text
SELECT ...
WHERE merchant_id = ?
AND id = ?
```

This makes the tenancy requirement visible in both the DAL methods and database queries.

---

## Metrics and data-access boundary

Dashboard metrics previously had a separate path to SQLite.

The current architecture routes order-based metrics through:

```text
ordersDal
```

Current flow:

```text
metrics route
     |
     v
input validation
     |
     v
 ordersDal
     |
     v
   SQLite
```

This keeps order data access behind one boundary instead of allowing multiple modules to independently define order queries.

---

## Delivery guarantees

For a delivery that has already been persisted in:

```text
webhook_deliveries
```

the worker continues retrying until:

- the receiver returns a successful HTTP response;
- or the subscription is deactivated.

Duplicate delivery is possible.

For example:

```text
Receiver successfully processes request
        |
        v
Application fails before observing success
        |
        v
Delivery remains pending
        |
        v
Retry sends same delivery again
```

Consumers should therefore not assume exactly-once delivery.

The stable:

```text
X-Webhook-Delivery-Id
```

provides an identifier that can be used for deduplication.

---

## Order-to-webhook persistence boundary

The implementation does not provide one atomic transaction covering both:

```text
saving an order
```

and:

```text
creating its webhook delivery records
```

The flow is currently:

```text
save order
    |
    v
commit
    |
    v
create webhook delivery
```

There is therefore a small failure window where an order could be committed but the process could terminate before its webhook delivery is persisted.

A transactional outbox is a common production solution to this problem.

It was intentionally not implemented here because it would add additional complexity beyond the scope of the challenge.

For that reason, the implementation should not be described as providing a complete end-to-end at-least-once guarantee.

Persistent retry applies once a delivery has been successfully enqueued in:

```text
webhook_deliveries
```

---

## Webhook URL boundary

Webhook registration requires:

```text
https://
```

URLs.

This protects the transport requirement and avoids registering plain HTTP endpoints through the public API.

However, HTTPS validation alone is not complete SSRF protection.

A production implementation would also consider restrictions such as:

```text
private/internal IP ranges
DNS resolution
redirect behavior
network egress policies
```

Complete SSRF protection is outside the current challenge scope.

---

## Worker scaling boundary

The webhook worker is designed for the current single-process application.

The worker uses a process-local guard to prevent overlapping processing loops inside one Node.js instance.

It does not implement distributed delivery claiming or locking between several application instances.

Therefore, running multiple application workers against the same SQLite delivery table would require additional coordination to prevent competing delivery processing.

The current implementation intentionally does not introduce distributed locks, Redis, Kafka, SQS, or another queueing platform.

---

## Known limitations and production considerations

The current architecture is intentionally sized for the challenge rather than a distributed production deployment.

Known limitations include:

- `X-Merchant-Id` is a simplified authentication mechanism and is not trusted production identity.
- Webhook URL validation requires HTTPS but does not provide complete SSRF protection.
- Retry attempts do not currently have a terminal maximum or dead-letter state.
- Order creation and webhook-delivery persistence are not one atomic transaction.
- The delivery worker is designed for a single application process.
- Distributed delivery claiming is not implemented.
- Exactly-once webhook delivery is not guaranteed.
- Order status accepts any non-empty string because no status vocabulary was specified by the challenge.
- Date parameters do not implement a complete date-validation layer.
- SQLite is appropriate for the current challenge size, but the worker/storage design would need reconsideration for significantly larger or distributed workloads.

These are explicit boundaries of the current implementation rather than guarantees provided by the system.

---

## Testing boundaries

Tests cover the main behavior introduced or changed during the challenge, including:

- merchant isolation for order retrieval;
- merchant isolation for status updates;
- refund-aware revenue;
- refund-aware top-customer spending;
- dashboard summary metrics;
- order input validation;
- invalid order `limit` rejection;
- negative order `limit` rejection;
- valid order `limit` behavior;
- invalid top-customer `limit` rejection;
- webhook subscription persistence;
- webhook subscription isolation;
- webhook deactivation;
- persisted delivery retries;
- recovery after a failed webhook attempt;
- HMAC signature verification;
- removal of pending deliveries after subscription deactivation;
- HTTP routes for listing and deactivating webhook subscriptions.

Webhook delivery tests use local HTTP servers rather than depending on an external webhook provider.

This keeps the automated test suite deterministic while still exercising real HTTP requests and signature generation.

The current automated suite contains:

```text
31 tests
```

and the TypeScript project also passes:

```text
npm run build
```

without compilation errors.

---

## Architectural summary

The current application follows these main boundaries:

```text
HTTP request
    |
    v
Authentication
    |
    v
Input validation
    |
    v
Route
    |
    +------------------+
    |                  |
    v                  v
   DAL          Webhook service
    |                  |
    v                  v
 SQLite        Persistent delivery
                       |
                       v
                 Delivery worker
                       |
                       v
                Merchant endpoint
```

The most important architectural choices in the current implementation are:

```text
Merchant ownership
        ->
enforced in data-access queries

Order data
        ->
accessed through ordersDal

Invalid query input
        ->
rejected before SQLite

Webhook subscriptions
        ->
stored per merchant and event

Webhook authenticity
        ->
HMAC-SHA256 signature

Webhook failures
        ->
persisted in SQLite and retried

Application restart
        ->
pending deliveries survive

External receiver unavailable
        ->
order API does not wait for recovery
```

The architecture intentionally favors a small, understandable implementation with explicit boundaries over introducing infrastructure that is not required for the challenge.