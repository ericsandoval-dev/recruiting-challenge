# Decision Log — Eric Enrique Sandoval Sánchez

 **Write this yourself, without AI assistance.** Spell-check is fine. AI-drafted, AI-rewritten, or AI-polished decision logs are an automatic decline — see `SUBMISSION.md` for why.
>
> Two pages max. Specifics over generalities. Confidence and disagreement are part of the score — own both.

I used AI on this decision log for the following limited purposes: Help understanding the requirements, feedback on the requirements for each section, verify that my statements match what we actually did. Everything else is mine.

## Issues addressed

> Defects, security smells, architectural problems, missing pieces, scaling risks — anything you decided was worth your time. For each, fill in **every** sub-field. An empty field is a worse signal than an awkward answer.

- **Issue 1 — Revenue error: refunds were being added instead of subtracted.**
  - What was wrong or weak: What it did was take all the records and sum them up to calculate the final revenue, but refunds were never subtracted—they were always positive—so the final calculation treated them as sales.
  - Shape of my improvement: Now, when calculating the final total, all sales remain positive, while refunds are subtracted; everything is then summed up. This change was also applied to TOP-CUSTOMERS as it was using the same logic.
  - **Confidence (1–10): 9**
  - **What would falsify this fix** If there were three sales of $100 and a refund of $10, and my result was 310, that would be incorrect because the actual result should be $290.
  - **I disagreed with Claude on:** I didn't disagree
  - Alternatives I considered and rejected: I was thinking of implementing a complete module that would query the database, check all the refunds, sum them up, and then subtract that total from the final amount.


- **Issue 2 — Merchant validation error when querying orders**
  - What was wrong or weak: When querying orders, the system only used the order ID to display the order but did not validate that it actually belonged to the merchant's ID, consequently another merchant could access other stores' orders if they knew the order ID.
  - Shape of my improvement: We now pass two parameters to `getById`: the order ID and the current merchant's ID. This way, when querying orders, the system verifies that the order belongs to the current merchant, preventing another merchant from viewing orders simply by knowing the ID.
  - **Confidence (1–10):** 10
  - **What would falsify this fix:** If we use the Order ID in a request with a Merchant ID different from the registered one, and it returns the order information
  - **I disagreed with Claude on:** I didn't disagree
  - Alternatives I considered and rejected: I initially wanted to implement a full token-based authentication system to sign all requests, but GPT-5.6 corrected me, noting that it was a fix outside the scope of the main fix

- **Issue 3 — METRICS QUERIED SQLITE3 DIRECTLY AND BYPASSED ORDERS-DAL.**
  - What was wrong or weak: The documentation indicated that everything should go through the Order-DAL, but Metrics was making direct queries to SQLite; the risk was having two different paths, which could lead to data inconsistency
  - Shape of my improvement: We are removing the direct query and querying ORDERS-DAL directly; this avoids two routes, centralizes data access, and prevents the duplication of functions
  - **Confidence (1–10):**10
  - **What would falsify this fix:** Finding a line with a direct connection to the database means it is still making direct queries to SQLite3 and bypassing orders-dal
  - **I disagreed with Claude on:** Initially, GPT had created a copy of the database to extract values ​​from—arguing that this was to protect the data—but I didn't think it was the right approach, as we would end up with two paths again and a risk of failure
  - Alternatives I considered and rejected:I didn't consider anything else; I based the final version on the original idea from GPT


## Feature chosen

- **Feature:** Webhooks
- **Why this one and not the others:**  It was the feature that required the most architectural work and opened up the most avenues for us; the others were interesting, but didn't involve as many architectural decisions. I wanted to demonstrate my problem-solving skills and the analysis performed prior to implementation, as well as better showcase my technical judgment.
- **What I cut to ship it in budget:** We excluded max retries, SSRF, and the configuration UI; based on our feature prioritization criteria, we decided to put them on hold for future improvements, as they were decisions that did not directly affect the feature's behavior or results during this initial phase.
- **Confidence (1–10) that the shape I picked is the right one:** 8 
- **What would change my mind:** requirements such as stress tests involving thousands of users, high security requirements, additional state-specific criteria, and specific routes.

## Things I noticed but did NOT fix

Issues such as date inconsistencies, timestamp formatting, merchant-ID security limitations, and stored XSS—which involved security, architectural, and correctness risks—were excluded based on time and impact considerations; I prioritized the issues with the greatest impact.

## Docs / code I left alone deliberately

- Regarding the frontend: on the backend, we had a "top customers" feature, but it wasn't being displayed anywhere. It did provide real value, yes, but it wasn't a priority issue. As for token-based or JWT authentication—was it necessary? Not strictly, since the existing documentation already covered the approach, but it was a significant area for improvement that fell outside the project scope.

## What I'd do with another 6 hours

-I would prioritize security as it's the weakest point, then webhooks and max retries, and finally the interface, including displaying top customers

## Where I felt uncertain
-Regarding webhook statuses: we are currently limiting ourselves to 3 states per order, but we don't know which payment statuses are actually handled.

-Regarding the actual purpose or scope of the UI: what should or shouldn't be displayed—for instance, there is a "top customers" function, but it isn't currently being shown.

-Regarding security layers: which ones would actually be useful—specifically, are there strict security requirements?
