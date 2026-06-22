# APPROACH.md — TriAgent

## What I Built 

I chose Option 2. An App that triages my emails and calendar events - named TriAgent.

TriAgent is an AI productivity application with two core agents—Email Triage and Meeting Prep—plus a conversational assistant that answers questions using the user’s synced email analyses and meeting briefs. It has two core features:

1. **Email Triage Agent** — sweeps your inbox, summarizes each email, assigns priority (HIGH/MEDIUM/LOW), flags whether it's worth reviewing, and drafts a reply when needed. If the AI's confidence is ≥85% on a draft, it automatically creates the draft in Gmail so you can send it in one click.

2. **Meeting Prep Agent** — reads your upcoming Google Calendar events, searches for related email threads by attendee addresses and event keywords, and generates a pre-meeting brief: context summary, discussion points, open action items, and talking points.

**Live URL:** https://triagent-frontend.onrender.com

## Why This Problem

Email triage and meeting prep are two of the highest-friction tasks in a knowledge worker's day. The signal-to-noise ratio in email is terrible, and walking into a meeting without context is a common failure mode. This app collapses both into one place with AI doing the reading.

## Key Decisions

**Claude Haiku 4.5 for both agents** — cost-effective for per-email processing where you might run 20-50 Claude calls per triage run. Haiku handles summarization and structured JSON extraction reliably at a fraction of Opus/Sonnet cost.

**Structured JSON output via prompt** — rather than function calling or tool use, the prompts instruct Claude to return pure JSON with a fixed schema. Simple and reliable for this use case; the backend strips any markdown code fences if Claude wraps the output.

**Gmail draft threshold at ≥85% confidence** — high bar prevents flooding the Drafts folder with low-quality suggestions. Below 85, the draft is shown in the UI only, giving the user control.

**FastAPI + React (Vite)** — FastAPI + React separation — FastAPI contains the Google API, Claude, authentication, and persistence logic, while the React frontend handles filtering, synchronization controls, cached data retrieval, and user interaction. The frontend starts email and meeting synchronization concurrently, while items inside each workflow are currently processed sequentially.

**Session-based OAuth storage in PostgreSQL** — each login receives a session identifier stored in an HTTP-only cookie. Google OAuth access and refresh tokens are associated with that session in PostgreSQL, allowing authenticated sessions to remain separate across users and deployments.

**PostgreSQL-backed caching and incremental synchronization** — analyzed emails and generated meeting briefs are stored in PostgreSQL. Previously processed emails are reused rather than being sent to Claude again, reducing latency and API cost. Upcoming meeting briefs are refreshed because their related email context can change over time.

## What I Intentionally Left Out

- **Sending emails** — only drafting. Sending from a third-party app raises trust issues; the one-click send from Gmail is the right UX here.
- **Real-time updates** — polling on demand. Push via Gmail Pub/Sub or Calendar webhooks would improve UX but adds significant infrastructure complexity.
- **Complete reply metadata handling** — drafts are associated with the Gmail thread using its thread ID, but recipient handling and email reply headers are simplified. Production support would parse sender addresses more carefully and include complete In-Reply-To and References metadata.
- **Pagination** — The current implementation uses fixed safety limits for email synchronization, calendar events, meeting-related email searches, and chatbot context rather than complete pagination. Sufficient for the daily-use case.
- **Production-grade multi-tenancy** — the application supports separate OAuth sessions and user-scoped records, but it does not include account management, roles, organization-level tenancy, encrypted token storage, or a complete identity system.

## What Breaks First Under Pressure

1. **Sequential AI processing** — synchronization can fetch up to 200 emails, and new items are sent to Claude sequentially.
2. **Long-running HTTP requests** — a large first synchronization may take too long for a normal web request or free hosting instance.
3. **Rate limits and cost** — Gmail, Calendar, and Anthropic limits become important during large synchronizations.
4. **Malformed structured output** — triage and meeting prep use fallback results, but stronger schema validation and retries are needed.
5. **Token security and revocation** — OAuth tokens are stored in the database but are not application-level encrypted.
6. **Simplified database tenancy** — email and event IDs are primary keys by themselves rather than composite keys with the user identity.

## What I'd Build Next

- Async parallel Claude calls per triage run (10x latency improvement)
- "Send" button in the UI that triggers the Gmail send API for ≥85% confidence drafts
- Add "Save to Draft" button in the UI that triggers the Gmail save draft for < 85% confidence
- Parallel or bounded-concurrency Claude processing
- Background job queue for long synchronizations
- Retry and strict schema validation for Claude responses
- Application-level encryption for OAuth tokens
- Gmail Pub/Sub and Calendar webhooks
- Composite user-and-resource database keys
- Better reply-address parsing and MIME reply headers
- Production account management and session controls
