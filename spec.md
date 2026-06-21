# TriAgent — Specification Document

## Overview

TriAgent is a two-agent AI productivity web app that connects to your Gmail and Google Calendar to automate email triage and meeting preparation. It surfaces the right information at the right time with minimal manual effort.

---

## Agents

### Agent 1: Email Triage Agent

**What it does:**
- Sweeps your Gmail inbox (configurable: last N emails or last N hours)
- For each email, produces:
  - **Summary** — 1–3 sentence plain-English summary
  - **Priority** — `HIGH`, `MEDIUM`, or `LOW`
  - **Worth Reviewing** — `YES` or `NO`
  - **Reply Needed** — `YES` or `NO`
  - **Draft Reply** — suggested reply body, only generated when reply is needed
  - **Confidence Score** — 0–100 integer representing confidence across all decisions

**Draft Reply Logic:**

| `reply_needed` | `confidence` | Draft shown in UI | Auto-created in Gmail |
|---|---|---|---|
| NO | any | No | No |
| YES | < 90 | Yes | No |
| YES | ≥ 90 | Yes | Yes (Gmail Drafts API) |

- If `reply_needed = NO` — no draft is generated at all (neither in UI nor in Gmail)
- If `reply_needed = YES` and `confidence < 90` — draft is shown in the UI for the user to review or copy, but nothing is pushed to Gmail
- If `reply_needed = YES` and `confidence ≥ 90` — draft is shown in the UI AND automatically created as a Gmail draft via the Gmail Drafts API

**Structured output per email:**
```json
{
  "email_id": "...",
  "subject": "...",
  "sender": "...",
  "received_at": "...",
  "summary": "...",
  "priority": "HIGH | MEDIUM | LOW",
  "worth_reviewing": "YES | NO",
  "reply_needed": "YES | NO",
  "draft_reply": "...",
  "confidence": 92,
  "gmail_draft_created": true
}
```

---

### Agent 2: Meeting Prep Agent

**What it does:**
- Reads your upcoming Google Calendar events (configurable window: next 24h, 48h, or 7 days)
- For each event:
  - Identifies attendees
  - Searches your Gmail for threads related to the event (by attendee emails, event title keywords)
  - Produces a pre-meeting brief

**Pre-meeting brief includes:**
- Event name, time, attendees
- Summary of related email threads
- Key discussion topics inferred from email history
- Open action items or unresolved questions from prior correspondence
- Suggested talking points

**Structured output per event:**
```json
{
  "event_id": "...",
  "title": "...",
  "start_time": "...",
  "attendees": ["..."],
  "related_emails_count": 4,
  "context_summary": "...",
  "discussion_points": ["..."],
  "open_action_items": ["..."],
  "talking_points": ["..."]
}
```

---

## Tech Stack

### Backend
- **Python 3.11+**
- **FastAPI** — REST API framework
- **Anthropic Python SDK** — calling Claude Haiku 4.5
- **Google API Python Client** — Gmail and Calendar
- **google-auth / google-auth-oauthlib** — OAuth 2.0 flow
- **Pydantic** — data validation and structured schemas
- **uvicorn** — ASGI server

### Frontend
- **React** (with Vite) — standalone SPA
- **TypeScript** — type safety
- **TailwindCSS** — styling
- **React Query** — data fetching and caching

### AI Model
- **Claude Haiku 4.5** (`claude-haiku-4-5`) — cost-effective, fast, well-suited for structured extraction and summarization

### APIs
- **Gmail API** — read inbox, read threads, create drafts
- **Google Calendar API** — read events and attendees
- **Google OAuth 2.0** — single login covering all three scopes

---

## Google OAuth Scopes Required

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/calendar.readonly
```

`gmail.compose` is the minimum scope for creating drafts without granting broader write access. Can be upgraded to `gmail.modify` if more write operations are ever needed.

---

## Architecture

```
User Browser (React SPA — Vercel)
        |
        | HTTP/REST
        v
FastAPI Backend (Python — Railway / Fly.io)
  |           |              |
  v           v              v
Gmail API  Calendar API  Anthropic API
                           (Haiku 4.5)
```

### Flow — Email Triage Agent

1. React UI sends `POST /api/triage` with optional filters (max emails, hours back)
2. FastAPI fetches emails from Gmail API using the stored OAuth token
3. For each email, calls Claude Haiku 4.5 with email content + structured output schema
4. Claude returns JSON: `{summary, priority, worth_reviewing, reply_needed, draft_reply, confidence}`
5. If `reply_needed == "YES"` and `confidence >= 90`, FastAPI calls Gmail Drafts API to create the draft
6. Returns full triage results to React UI

### Flow — Meeting Prep Agent

1. React UI sends `POST /api/meeting-prep` with time window
2. FastAPI fetches upcoming events from Google Calendar API
3. For each event, searches Gmail for related threads (by attendee addresses, event title keywords)
4. Sends event details + related email content to Claude Haiku 4.5
5. Claude returns pre-meeting brief JSON
6. Returns all meeting briefs to React UI

---

## API Endpoints (FastAPI)

```
GET  /api/auth/login        → Redirect to Google OAuth consent screen
GET  /api/auth/callback     → Handle OAuth callback, store token
GET  /api/auth/status       → Check if user is authenticated

POST /api/triage            → Run Email Triage Agent
     Body: { "max_emails": 20, "hours_back": 24 }
     Returns: list of TriageResult

POST /api/meeting-prep      → Run Meeting Prep Agent
     Body: { "days_ahead": 2 }
     Returns: list of MeetingBrief

GET  /api/health            → Health check
```

---

## Claude Haiku Prompt Design

### Email Triage Prompt

```
You are an email triage assistant. Analyze the following email and return a JSON object with exactly these fields:

- summary: 1-3 sentence plain English summary
- priority: one of "HIGH", "MEDIUM", "LOW"
- worth_reviewing: "YES" or "NO"
- reply_needed: "YES" or "NO"
- draft_reply: a suggested reply if reply_needed is YES, else empty string
- confidence: integer 0-100 representing your confidence across all decisions

Email:
Subject: {subject}
From: {sender}
Date: {date}
Body: {body}

Return only valid JSON. No explanation.
```

### Meeting Prep Prompt

```
You are a meeting preparation assistant. Given the following calendar event and related email threads, produce a pre-meeting brief as a JSON object with these fields:

- context_summary: paragraph summarizing what this meeting is about based on email history
- discussion_points: list of key topics likely to come up
- open_action_items: list of unresolved items from prior emails
- talking_points: list of suggested things to say or raise

Calendar Event:
Title: {title}
Time: {start_time}
Attendees: {attendees}

Related Email Threads:
{email_threads}

Return only valid JSON. No explanation.
```

---

## Gmail Draft Creation Logic

```python
def maybe_create_draft(gmail_service, triage_result, original_email):
    if (
        triage_result["reply_needed"] == "YES"
        and triage_result["confidence"] >= 90
        and triage_result["draft_reply"]
    ):
        raw_message = encode_email(
            to=original_email["sender"],
            subject=f"Re: {original_email['subject']}",
            body=triage_result["draft_reply"],
            thread_id=original_email["thread_id"],
        )
        gmail_service.users().drafts().create(
            userId="me",
            body={"message": {"raw": raw_message, "threadId": original_email["thread_id"]}}
        ).execute()
        return True
    return False
```

---

## Frontend UI Design

### Email Triage View
- Header: "Run Triage" button + filters (max emails, time window)
- Card list — one card per email:
  - Subject, sender, received time
  - Summary (expandable)
  - Priority badge — color-coded (red = HIGH, yellow = MEDIUM, green = LOW)
  - Worth Reviewing badge (YES / NO)
  - Draft reply section — **only visible when `reply_needed = YES`**
    - Shows Claude's suggested reply
    - Shows "Draft created in Gmail" badge when confidence ≥ 90 and draft was auto-pushed
  - Confidence % label
- Sort/filter controls: by priority, by worth-reviewing status

### Meeting Prep View
- Header: "Generate Briefs" button + time window selector (24h / 48h / 7 days)
- Card list — one card per upcoming event:
  - Event title, time, attendees
  - Context Summary
  - Discussion Points (bulleted)
  - Open Action Items (bulleted)
  - Talking Points (bulleted)
  - Expand/collapse for full detail

---

## Project Structure

```
Triagent/
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── triage.py
│   │   └── meeting_prep.py
│   ├── services/
│   │   ├── gmail_service.py
│   │   ├── calendar_service.py
│   │   └── claude_service.py
│   ├── models/
│   │   └── schemas.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TriageCard.tsx
│   │   │   └── MeetingBriefCard.tsx
│   │   └── pages/
│   │       ├── EmailTriage.tsx
│   │       └── MeetingPrep.tsx
│   ├── package.json
│   └── vite.config.ts
├── spec.md
├── APPROACH.md
└── docker-compose.yml
```

---

## Environment Variables

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-xxxxx
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback
FRONTEND_URL=http://localhost:5173
```

---

## Deployment

- **Frontend (React):** Vercel — connect GitHub repo, set `VITE_API_URL` env var pointing to the backend
- **Backend (FastAPI):** Railway or Fly.io — Python-native hosting; set all env vars in the dashboard
- **Note:** Vercel does not run Python servers natively, so the FastAPI backend must live on a separate host. This is expected and will be resolved during the deployment phase.

---

## Deliverables (per README)

1. **Working software** — deployed web app, live URL in APPROACH.md
2. **APPROACH.md** — what was built, key decisions, tradeoffs, what's left out, what breaks first
3. **Video walkthrough** — ~5 minutes demoing both agent flows
4. **AI session history** — auto-packaged by `./submit.sh`

---

## Intentionally Out of Scope

- Sending emails (drafting only, not sending)
- Creating or modifying calendar events
- Multi-user or multi-account support
- Real-time push notifications (on-demand polling only)
- Email reply threading beyond the original sender

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-20 | Initial spec created |
| 2026-06-20 | Draft reply section only shown when reply_needed = YES; Gmail Drafts API called only when reply_needed = YES AND confidence ≥ 90 |
