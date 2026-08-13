# Sign-off — Eric Enrique Sandoval Sanchez



## Authorship declaration

> - I used AI on this validation_design for the following limited purposes: Help understanding the requirements, feedback on the requirements for each section, verify that my statements match what we actually did. Everything else is mine.

## How to fill this in

For each commit, pick the line that matches what actually happened. Mix is expected — a submission that claims "I have read this fully" on every single commit is treated as a calibration failure, not a strength signal. Honest accounting earns more credit than performed thoroughness.

Use one of these line shapes:

- ✅ **`<sha>` — I have read this. I checked <specific things>. I would stake my name on it shipping to a 1.5k-RPS production system tonight.**
- ⚠️ **`<sha>` — I have read most of this. I'm confident on <X> but uncertain on <Y>. I'd want <a code reviewer / a load test / a property-based test> before staking my name on prod.**
- ❌ **`<sha>` — I have NOT fully read this. Claude generated it and I accepted because <specific reason — e.g. "boilerplate scaffolding", "test fixtures I will re-verify before merge"). Risks I accept: <named risks>.**

Be specific about what you actually checked — *"I read it"* without naming what you looked for is worth less than *"I checked the SQL parameterization, the WHERE clause against the IDOR fix in commit X, and ran the integration test against an in-memory DB"*.

---

## Sign-offs

> Add lines below. List by commit SHA (or a short commit-title prefix if you prefer); ordering by time is fine.

- ⚠️ e60706f - I’ve read through most of this change, and I’m confident that `getById` now requires both `merchantId` and `orderId`, and that the test covers cross-merchant access, though I didn’t review every single line in depth.
- ⚠️fec7a06 — I understood what the error was and the solution as well; previously, everything was added up regardless of whether it was a sale or a refund, whereas in the code, refund values ​​are subtracted when calculating the total. I have a superficial understanding of the code, but I cannot explain it line by line.
- ⚠️d56df14 - I understood the changes, the validation for each field, and the test cases used to simulate invalid data; I grasped the architecture and concepts well, though I can only explain the code at a high level.
- ⚠️782e0ea - The metrics component was bypassing the `orders-dal` layer and connecting directly to SQLite3; this created two separate paths, potentially leading to data duplication or errors. I grasped the solution of centralizing everything through `orders-dal`, though I only understand the code-level implementation superficially.
- ⚠️6175d55 - The workflow is as follows: a new order is created and temporarily saved to a queue. If the response is 200, it means the order successfully reached the HTTP destination and is removed. If the response is anything other than 200, the order is stored in a database table and a retry counter is initiated; currently, there is no maximum retry limit, so it keeps retrying indefinitely. Once a connection is established, the worker sends the order and removes it from the table. That is the general workflow, though I haven't reviewed the entire codebase in detail.
- ⚠️17e9a5f - To ensure persistence, each order is saved in a temporary storage table; if `response.ok` is returned, the order is removed from the queue, whereas a different response code triggers an exponential backoff without a maximum retry limit. Once the order is successfully delivered, it is removed from the queue. We tested the actual workflow by stopping the server and the localhost, then restarting them after a few minutes to verify that persistence was actually working.
- ⚠️91e037f -We use a secret to sign the webhooks; this key is generated when the webhook is sent. Upon receipt, we validate that the order belongs to the `merchantId` and display it; we also include three webhook events.
- ⚠️29bf0c2 - The problem was that inputs like -5 or "abc" returned an invalid response but didn't invalidate the operation, resulting in erroneous data.


---

## What this artifact measures

The signal is not "did you read every line" — that's not what an architect does. The signal is **whether you can honestly account for what you read, what you trusted, and what you took on faith** — and whether the language you use is first-person ownership ("I accepted") rather than tool-deflection ("Claude wrote it"). The latter is what we score.
