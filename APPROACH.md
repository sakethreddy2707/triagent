# APPROACH.md — TriAgent

## What I Built

TriAgent is a two-agent AI productivity app that connects to your Gmail and Google Calendar. It has two core features:

1. **Email Triage Agent** — sweeps your inbox, summarizes each email, assigns priority (HIGH/MEDIUM/LOW), flags whether it's worth reviewing, and drafts a reply when needed. If the AI's confidence is ≥90% on a draft, it automatically creates the draft in Gmail so you can send it in one click.

2. **Meeting Prep Agent** — reads your upcoming Google Calendar events, searches for related email threads by attendee addresses and event keywords, and generates a pre-meeting brief: context summary, discussion points, open action items, and talking points.

**Live URL:** *(add after deployment)*

## Why This Problem

Email triage and meeting prep are two of the highest-friction tasks in a knowledge worker's day. The signal-to-noise ratio in email is terrible, and walking into a meeting without context is a common failure mode. This app collapses both into one place with AI doing the reading.

## Key Decisions

**Claude Haiku 4.5 for both agents** — cost-effective for per-email processing where you might run 20-50 Claude calls per triage run. Haiku handles summarization and structured JSON extraction reliably at a fraction of Opus/Sonnet cost.

**Structured JSON output via prompt** — rather than function calling or tool use, the prompts instruct Claude to return pure JSON with a fixed schema. Simple and reliable for this use case; the backend strips any markdown code fences if Claude wraps the output.

**Gmail draft threshold at ≥85% confidence** — high bar prevents flooding the Drafts folder with low-quality suggestions. Below 90, the draft is shown in the UI only, giving the user control.

**FastAPI + React (Vite)** — clean separation between Python backend (where Google APIs and Anthropic SDK live) and React frontend. FastAPI's async support handles multiple Gmail API calls per triage run efficiently.

**Token-file OAuth storage** — credentials stored in `/tmp/triagent_token.json`. Simple for a single-user app; would need a proper secrets/database layer for multi-user.

## What I Intentionally Left Out

- **Sending emails** — only drafting. Sending from a third-party app raises trust issues; the one-click send from Gmail is the right UX here.
- **Multi-user support** — single Google account per deployment. Token file approach doesn't scale.
- **Real-time updates** — polling on demand. Push via Gmail Pub/Sub or Calendar webhooks would improve UX but adds significant infrastructure complexity.
- **Email threading** — drafts target the original sender only, not the full thread. Full threading support would require parsing In-Reply-To headers.
- **Pagination** — triage caps at 50 emails and meeting prep caps at 20 events. Sufficient for the daily-use case.

## What Breaks First Under Pressure

1. **Rate limits** — the Gmail API and Anthropic API both have rate limits. Running triage on 50 emails fires 50 Claude API calls synchronously. This is the first thing to parallelize (asyncio.gather) for production.
2. **Token expiry** — the OAuth token refresh works, but if the refresh token is revoked (user removes app access), the backend returns 401 with no clear user-facing message.
3. **Claude JSON parsing** — if Claude returns malformed JSON (rare with Haiku), the triage endpoint returns a fallback result. Could be hardened with retry logic.
4. **Email body size** — body is capped at 4000 characters. Very long emails get truncated, which may affect summary quality.

## What I'd Build Next

- Async parallel Claude calls per triage run (10x latency improvement)
- "Send" button in the UI that triggers the Gmail send API for ≥85% confidence drafts
- Add "Save to Draft" button in the UI that triggers the Gmail save draft for < 85% confidence
- Webhook-based real-time triage via Gmail Pub/Sub
- Persistent triage history so you can see how emails were categorized over time
- Multi-account support with proper user sessions
