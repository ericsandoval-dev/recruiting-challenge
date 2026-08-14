# Written answers — ERIC ENRIQUE SANDOVAL SANCHEZ



## Authorship declaration

> Replace this block with one of the two statements below, in your own words if you prefer:

-I used AI on this written_answers for the following limited purposes: Help understanding the requirements, feedback on the requirements for each section, verify that my statements match what we actually did. Everything else is mine.



## Q1 — Production correctness validation

-When I was building AURA I detected a problem in the Google authentication module. The system was validating the user session but it was not comparing the session token with the token stored in the database.

This created a gap because the application could keep a session active even when the token stored in the database was already different. The session state and the authentication state were not always synchronized.

I implemented an additional validation during the login process where the token received from the authentication flow is compared with the token stored in Supabase. This way both sides need to match before allowing the user to continue.

This was a preventive improvement because we detected the risk before having a production incident. The validation helped to keep the authentication state consistent.

One thing that I would improve is adding automated tests for token expiration, token changes and invalid sessions. At that moment the validation was implemented, but we did not have enough tests covering those scenarios.



## Q2 — Scaling-forced structural change

- AURA is a voice assistant I built from scratch. Initially, I had only a few testers and the architecture worked well, but when I started running more realistic tests, the server began to struggle: connections slowed down, voice responses took longer, and in some cases, WebSockets dropped.

I had to modify the architecture to handle a heavier load. I improved connection handling, added asynchronous processing and connection pooling, increased server resources, and implemented API limits to prevent overload.

I did all of this with the user experience in mind.



## Q3 — A time you rejected AI output (or accepted bad output and changed your process)

-While working on the challenge, I asked ChatGPT which feature I should build. It recommended "Search" because it was easier and lower-risk than Webhooks.

At first, I thought that might be a good option since it was quicker to implement, but upon reviewing the choices, I wasn't fully convinced; I felt it wouldn't really showcase my architectural skills—it was more of a standard feature.

That’s why I decided to switch to Webhooks instead. Even though it was more complex, it involved more architectural decisions, allowing me to better demonstrate my problem-solving approach.

During implementation, I realized I could add plenty of other features—such as maximum retries, SSRF protection, and a configuration UI—but I decided against including everything to avoid going out of scope; I preferred to focus on executing the core functionality well.

What I learned is that while ChatGPT is great for generating ideas, you shouldn't always follow its first recommendation; you have to analyze whether it truly aligns with what you want to achieve.
