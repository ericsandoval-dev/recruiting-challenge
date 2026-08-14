# Validation design — <Eric Enrique Sandoval Sánchez>



## Authorship declaration


> - I used AI on this validation_design for the following limited purposes: Help understanding the requirements, feedback on the requirements for each section, verify that my statements match what we actually did. Everything else is mine.




### Class 1 — isolation between merchants / multi-tenant authorization

- **Instances I fixed:** ERROR EN GetById
- **The gate I built (or would build):** The getById signature requires merchantId + orderId, and the query filters by both.
- **What this gate would catch that a regression test would miss:** If we revert to validating only the order ID, there would be a conflict, since this endpoint requires two values.
- **Where to see the gate in the diff** src/dal/orders-dal.ts
- **If you did not build it,** 

### Class 2 — semantics of refunds

- **Instances I fixed:** sumAmountByMerchant, top-customers
- **The gate I built (or would build):** If any refund is added, it must be subtracted from the calculation and should not increase revenue.>
- **What this gate would catch that a regression test would miss:** <A change is made to the database but the function isn't updated—specifically, a new positive value is added, modified, and then subtracted.>
- **Where to see the gate in the diff** orders.test.ts general/invariant test for any amount
- **If you did not build it,** 

### Class 3 — data access architecture rule

- **Instances I fixed:** Metrics.ts
- **The gate I built (or would build):** a validation ensuring that the metrics file only contains calls to `orders-dal` and not to `sqlite3`
- **What this gate would catch that a regression test would miss:** The validation would find a direct connection to SQLite3, and that test would fail.>
- **Where to see the gate in the diff** metrics.ts and orders-dal.ts
- **If you did not build it,** Because the general goal of the fix was to remove the direct connection to SQLite3—not to validate that no file was making a direct connection—adding such a test would be a good future implementation; that way, if someone were to add a direct connection, the test would fail and alert them to it.
