# TriAgent — Specification Document

## Overview

TriAgent is an AI productivity web application that connects to Gmail and Google Calendar to reduce the time users spend reviewing email and preparing for meetings.

The product contains two core AI workflows:

1. **Email Triage Agent**
2. **Meeting Prep Agent**

It also includes a **contextual AI assistant** that answers questions using previously synchronized email analyses and meeting briefs.

TriAgent follows a human-in-the-loop model. It can analyze messages, prioritize them, suggest replies, and create Gmail drafts when confidence is high, but it does not send email automatically. It can read calendar events and prepare context, but it does not create, modify, or delete calendar events.

PostgreSQL is used to store:

- Google OAuth sessions and tokens
- Processed email analyses
- Generated meeting briefs

This allows TriAgent to provide fast cached reads and avoid unnecessarily sending the same email to the AI model multiple times.

---

## Core Product Capabilities

### 1. Email Triage

TriAgent reads recent Gmail inbox messages and determines:

- What the email is about
- How important it is
- Whether it deserves the user’s attention
- Whether a reply is needed
- What a suitable reply could be
- How confident the model is in its assessment

Previously processed emails are loaded from PostgreSQL instead of being analyzed again.

### 2. Meeting Preparation

TriAgent reads upcoming Google Calendar events and searches Gmail for related conversations using:

- Attendee email addresses
- Meaningful keywords from the event title
- Existing email threads related to the meeting

It then creates a meeting brief containing:

- Context summary
- Discussion points
- Open action items
- Suggested talking points

Upcoming meetings can be refreshed during later synchronizations so their briefs include newer email context.

### 3. Contextual AI Assistant

TriAgent includes a conversational assistant that answers questions using the user’s stored email analyses and meeting briefs.

Example questions include:

- Which emails need my reply?
- What is my highest-priority email?
- What should I prepare for my next meeting?
- Do I have any unresolved action items?
- Which upcoming meetings are required?
- Summarize what needs my attention today.

The assistant operates on synchronized TriAgent data. It does not directly fetch Gmail or Calendar data during every chat request.

---

# Agent 1: Email Triage Agent

## Purpose

The Email Triage Agent converts a Gmail inbox into an organized list of actionable email summaries.

For each email, the agent returns:

- **Summary**
- **Priority**
- **Worth Reviewing**
- **Reply Needed**
- **Draft Reply**
- **Confidence Score**
- **Gmail Draft Status**

---

## Email Synchronization Behavior

The frontend starts email synchronization by sending:

```http
POST /api/triage/sync
```

Example request:

```json
{
  "days_back": 7
}
```

The backend then:

1. Authenticates the user using the current TriAgent session.
2. Loads the user’s Google OAuth credentials from PostgreSQL.
3. Fetches recent inbox messages from Gmail.
4. Checks whether each email has already been processed for the current user.
5. Skips AI processing for previously stored emails.
6. Sends only new emails to Claude Haiku.
7. Creates Gmail drafts when the reply and confidence rules are satisfied.
8. Stores the resulting analysis in PostgreSQL.
9. Returns synchronization statistics and results to the frontend.

The current synchronization implementation can fetch up to 200 recent inbox messages in one run.

---

## Email Analysis Fields

### Summary

A one-to-three-sentence plain-English explanation of the email.

### Priority

One of:

```text
HIGH
MEDIUM
LOW
```

Suggested interpretation:

- `HIGH` — urgent, time-sensitive, important, or requiring immediate action
- `MEDIUM` — useful or actionable but not immediately urgent
- `LOW` — informational, promotional, automated, or unlikely to require action

### Worth Reviewing

One of:

```text
YES
NO
```

This indicates whether the user is likely to benefit from opening and reviewing the original message.

### Reply Needed

One of:

```text
YES
NO
```

This indicates whether the sender is reasonably expecting a response.

### Draft Reply

A suggested response generated only when `reply_needed` is `YES`.

When `reply_needed` is `NO`, the draft reply must be an empty string.

### Confidence

An integer from 0 to 100 representing the model’s overall confidence in its triage decisions.

---

## Gmail Draft Creation Logic

TriAgent creates a Gmail draft only when all of the following conditions are true:

```text
reply_needed == "YES"
confidence >= 85
draft_reply is not empty
```

### Draft Behavior

| Reply needed | Confidence | Draft shown in TriAgent | Draft created in Gmail |
|---|---:|---|---|
| NO | Any | No | No |
| YES | Below 85 | Yes | No |
| YES | 85 or above | Yes | Yes |

This threshold prevents lower-confidence suggestions from automatically filling the user’s Gmail Drafts folder.

Even when TriAgent creates a Gmail draft, the user must review and send it manually from Gmail.

TriAgent never sends an email automatically.

---

## Email Triage Output

Example structured result:

```json
{
  "email_id": "18f123example",
  "subject": "Project review follow-up",
  "sender": "alex@example.com",
  "received_at": "2026-06-21T10:30:00Z",
  "summary": "Alex is requesting confirmation of the revised project timeline and would like a response before tomorrow.",
  "priority": "HIGH",
  "worth_reviewing": "YES",
  "reply_needed": "YES",
  "draft_reply": "Hi Alex,\n\nThanks for following up. The revised timeline works for me, and I will have the requested items ready before tomorrow.\n\nBest,",
  "confidence": 93,
  "gmail_draft_created": true
}
```

---

## Reading Stored Email Results

The frontend retrieves stored results through:

```http
GET /api/triage
```

Supported query parameters:

```text
date_from=YYYY-MM-DD
date_to=YYYY-MM-DD
```

Example:

```http
GET /api/triage?date_from=2026-06-15&date_to=2026-06-21
```

This endpoint reads previously stored results from PostgreSQL. It does not trigger Gmail or Claude processing.

The Email Triage page uses date-range filtering independently from the synchronization range.

---

# Agent 2: Meeting Prep Agent

## Purpose

The Meeting Prep Agent helps users understand the context surrounding upcoming Google Calendar events.

For every relevant event, it:

1. Reads event details from Google Calendar.
2. Identifies attendees.
3. Searches Gmail for related conversations.
4. Sends the event and email context to Claude.
5. Generates an actionable pre-meeting brief.
6. Stores the brief in PostgreSQL.

---

## Meeting Synchronization Behavior

The frontend starts meeting synchronization by sending:

```http
POST /api/meeting-prep/sync
```

Example request:

```json
{
  "date_from": "2026-06-21",
  "date_to": "2026-07-21"
}
```

The backend then:

1. Authenticates the current session.
2. Loads the user’s Google OAuth credentials.
3. Reads Google Calendar events within the requested range.
4. Determines whether each event is new, cached, past, or upcoming.
5. Skips appropriate cached past events.
6. Refreshes new or upcoming events when current email context may have changed.
7. Searches Gmail for event-related messages.
8. Generates a meeting brief using Claude.
9. Inserts or updates the meeting brief in PostgreSQL.

The current Calendar query can retrieve up to 50 events in a synchronization run.

---

## Related Email Search

TriAgent searches for meeting context using:

- Attendee email addresses
- Significant words from the event title
- Related Gmail threads

The current implementation limits the related-email search to a manageable number of Gmail messages per event and deduplicates relevant content by thread where possible.

Up to approximately 10 related Gmail messages may be considered for a meeting brief.

If no relevant emails are found, TriAgent can still generate a brief using the calendar event title, time, attendees, and description.

---

## Meeting Brief Fields

### Context Summary

A plain-English paragraph explaining:

- Why the meeting is happening
- Relevant background from email conversations
- The current state of the discussion

### Discussion Points

A list of topics likely to be discussed.

### Open Action Items

A list of unresolved tasks, questions, deliverables, decisions, or follow-ups found in related conversations.

### Talking Points

Suggested points the user may want to mention, clarify, confirm, or ask during the meeting.

### Required or Optional Status

TriAgent stores whether the user’s attendance appears to be required or optional based on Calendar attendee information.

---

## Meeting Prep Output

Example structured result:

```json
{
  "event_id": "calendar-event-example",
  "title": "Product Launch Review",
  "start_time": "2026-06-23T14:00:00-07:00",
  "meeting_date": "2026-06-23",
  "attendees": [
    "alex@example.com",
    "priya@example.com"
  ],
  "is_optional": false,
  "related_emails_count": 4,
  "context_summary": "The team is meeting to finalize launch readiness. Recent email discussions focused on the delayed analytics integration and confirmation of the final release checklist.",
  "discussion_points": [
    "Status of the analytics integration",
    "Final launch checklist",
    "Ownership of unresolved release tasks"
  ],
  "open_action_items": [
    "Confirm whether analytics validation is complete",
    "Assign an owner for the final production review"
  ],
  "talking_points": [
    "Ask whether the analytics delay affects the launch date",
    "Confirm who will complete the production readiness review"
  ]
}
```

---

## Reading Stored Meeting Results

The frontend retrieves stored meeting briefs through:

```http
GET /api/meeting-prep
```

Supported query parameters:

```text
date_from=YYYY-MM-DD
date_to=YYYY-MM-DD
```

Example:

```http
GET /api/meeting-prep?date_from=2026-06-21&date_to=2026-07-05
```

This endpoint reads cached meeting briefs from PostgreSQL and does not independently call Google Calendar, Gmail, or Claude.

---

# Contextual AI Assistant

## Purpose

The contextual assistant provides a conversational interface over the data already synchronized by TriAgent.

It helps users retrieve useful information without manually filtering or opening every email and meeting card.

---

## Chat Request

```http
POST /api/chat
```

Example request:

```json
{
  "message": "What should I prepare for my next meeting?",
  "history": [
    {
      "role": "user",
      "content": "Which emails need a reply?"
    },
    {
      "role": "assistant",
      "content": "You have two messages that appear to need replies."
    }
  ]
}
```

---

## Chat Context

The backend builds the assistant’s context using stored information from PostgreSQL.

The current implementation may include:

- Up to 20 recent email analyses
- Up to 20 meeting briefs
- Up to 20 recent conversation messages

The assistant can use:

- Email subjects
- Senders
- Summaries
- Priority
- Review status
- Reply-needed status
- Confidence
- Upcoming meeting titles
- Meeting dates
- Attendees
- Context summaries
- Discussion points
- Open action items
- Talking points

---

## Chat Limitations

The assistant:

- Does not send emails
- Does not create Gmail drafts
- Does not modify Calendar events
- Does not directly query Gmail during each chat request
- Does not directly query Calendar during each chat request
- Can only answer based on data that has already been synchronized into TriAgent
- May have incomplete context if the user has not recently synchronized the application

---

# Technology Stack

## Backend

- **Python 3.11+**
- **FastAPI** — REST API framework
- **Uvicorn** — ASGI server
- **SQLAlchemy** — database models and persistence
- **PostgreSQL** — OAuth session, email analysis, and meeting brief storage
- **Pydantic** — request and response validation
- **Anthropic Python SDK** — Claude model integration
- **Google API Python Client** — Gmail and Google Calendar integration
- **google-auth**
- **google-auth-oauthlib**
- **google-auth-httplib2**

---

## Frontend

- **React**
- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **React Query**
- **Axios**

---

## AI Model

```text
claude-haiku-4-5
```

Claude Haiku is used because TriAgent may perform many short classification, summarization, and structured-extraction requests during synchronization.

The model is selected for:

- Low response latency
- Lower cost per email
- Strong summarization
- Reliable structured JSON generation
- Suitability for repeated productivity tasks

---

## External Services

- **Gmail API**
- **Google Calendar API**
- **Google OAuth 2.0**
- **Anthropic API**
- **PostgreSQL**
- **Render**

---

# Authentication and Authorization

## Google OAuth

TriAgent uses Google OAuth 2.0 to connect the user’s Gmail and Google Calendar account.

Required scopes:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/calendar.readonly
```

### Scope Purposes

#### `openid`

Supports the Google identity flow.

#### `userinfo.email`

Allows TriAgent to identify the connected Google account and associate database records with that user.

#### `gmail.readonly`

Allows TriAgent to read inbox messages and search for meeting-related email context.

#### `gmail.compose`

Allows TriAgent to create Gmail drafts without requesting broader Gmail modification access.

#### `calendar.readonly`

Allows TriAgent to read event details and attendee information without modifying the calendar.

---

## Session Handling

After a successful Google OAuth callback:

1. TriAgent creates or updates an authenticated session.
2. A session identifier is stored in an HTTP-only browser cookie.
3. The Google account email and OAuth credentials are stored in PostgreSQL under the session.
4. Authenticated API requests use the session cookie to retrieve the correct credentials and user-scoped data.

This design supports separate user sessions, but it is not a complete production identity or organization-level multi-tenant system.

---

## OAuth Token Storage

OAuth access and refresh tokens are stored in PostgreSQL.

The current prototype does not provide all production security controls that would be expected in a larger system, such as:

- Application-level token encryption
- Centralized secrets management
- User-facing active-session management
- Organization-level access controls
- Administrative audit logs

---

# Architecture

```text
User Browser
    |
    | HTTPS requests
    | HTTP-only session cookie
    v
React + TypeScript Frontend
Render Static Site
    |
    | REST API
    v
FastAPI Backend
Render Web Service
    |
    +---------------- Gmail API
    |
    +---------------- Google Calendar API
    |
    +---------------- Anthropic API
    |
    +---------------- PostgreSQL
                      |
                      +-- OAuth sessions
                      +-- Email analyses
                      +-- Meeting briefs
```

---

# Data Flow

## Email Triage Flow

```text
User clicks Sync Now
        |
        v
POST /api/triage/sync
        |
        v
Load user OAuth session from PostgreSQL
        |
        v
Fetch recent Gmail inbox messages
        |
        v
Check which emails already exist in PostgreSQL
        |
        +---- Existing email --> Reuse stored analysis
        |
        +---- New email ------> Send to Claude
                                  |
                                  v
                         Validate and normalize JSON
                                  |
                                  v
                 Create Gmail draft when confidence >= 85
                                  |
                                  v
                         Save result to PostgreSQL
        |
        v
Frontend refreshes GET /api/triage
```

---

## Meeting Prep Flow

```text
User clicks Sync Now
        |
        v
POST /api/meeting-prep/sync
        |
        v
Load user OAuth session from PostgreSQL
        |
        v
Fetch Calendar events for selected range
        |
        v
Determine whether event should be skipped or refreshed
        |
        v
Search Gmail by attendees and title keywords
        |
        v
Send event and email context to Claude
        |
        v
Validate and normalize meeting brief
        |
        v
Insert or update PostgreSQL record
        |
        v
Frontend refreshes GET /api/meeting-prep
```

---

## Chat Flow

```text
User submits a question
        |
        v
POST /api/chat
        |
        v
Load recent email analyses from PostgreSQL
        |
        v
Load recent meeting briefs from PostgreSQL
        |
        v
Combine stored data with conversation history
        |
        v
Send grounded context and question to Claude
        |
        v
Return conversational response
```

---

# API Endpoints

## Authentication

### Start Google login

```http
GET /api/auth/login
```

Redirects the browser to the Google OAuth consent screen.

### Handle OAuth callback

```http
GET /api/auth/callback
```

Processes the Google authorization response, stores credentials, creates the authenticated session, and redirects the user to the frontend.

### Check authentication status

```http
GET /api/auth/status
```

Returns whether the current browser session is authenticated and may include the connected Google account email.

### Log out

```http
GET /api/auth/logout
```

Clears or invalidates the current TriAgent session.

---

## Email Triage

### Read cached email results

```http
GET /api/triage
```

Query parameters:

```text
date_from=YYYY-MM-DD
date_to=YYYY-MM-DD
```

### Synchronize Gmail messages

```http
POST /api/triage/sync
```

Request body:

```json
{
  "days_back": 7
}
```

### Clear email triage cache

```http
DELETE /api/triage/cache
```

Deletes stored email triage results for the authenticated user.

---

## Meeting Preparation

### Read cached meeting briefs

```http
GET /api/meeting-prep
```

Query parameters:

```text
date_from=YYYY-MM-DD
date_to=YYYY-MM-DD
```

### Synchronize Calendar meetings

```http
POST /api/meeting-prep/sync
```

Request body:

```json
{
  "date_from": "2026-06-21",
  "date_to": "2026-07-21"
}
```

### Clear meeting prep cache

```http
DELETE /api/meeting-prep/cache
```

Deletes stored meeting briefs for the authenticated user.

---

## Contextual Assistant

### Submit chat message

```http
POST /api/chat
```

Request body:

```json
{
  "message": "Which email should I handle first?",
  "history": []
}
```

---

## Cache Management

### Clear all cached productivity data

```http
DELETE /api/cache/all
```

Clears stored email analyses and meeting briefs for the authenticated user.

This does not send or delete Gmail messages and does not modify Google Calendar events.

---

## Health Check

```http
GET /api/health
```

Returns the current backend service status.

---

# Claude Prompt Design

## Email Triage Prompt

The email triage prompt instructs Claude to return a fixed JSON structure.

Conceptual prompt:

```text
You are an email triage assistant.

Analyze the following email and return a valid JSON object containing exactly these fields:

- summary: a one-to-three-sentence plain-English summary
- priority: one of "HIGH", "MEDIUM", or "LOW"
- worth_reviewing: either "YES" or "NO"
- reply_needed: either "YES" or "NO"
- draft_reply: a professional suggested reply when reply_needed is "YES"; otherwise an empty string
- confidence: an integer from 0 to 100 representing confidence across the decisions

Email:
Subject: {subject}
From: {sender}
Date: {date}
Body: {body}

Return only valid JSON.
Do not include markdown or additional explanation.
```

The backend removes markdown code fences if the model includes them and normalizes unexpected field values when possible.

---

## Meeting Prep Prompt

Conceptual prompt:

```text
You are a meeting preparation assistant.

Given the following calendar event and related email conversations, return a valid JSON object containing:

- context_summary: a paragraph explaining the meeting context
- discussion_points: a list of likely discussion topics
- open_action_items: a list of unresolved actions or questions
- talking_points: a list of useful things the user may want to say, confirm, or ask

Calendar Event:
Title: {title}
Time: {start_time}
Attendees: {attendees}
Description: {description}

Related Email Conversations:
{email_threads}

Return only valid JSON.
Do not include markdown or additional explanation.
```

---

## Contextual Assistant Prompt

The chat prompt provides Claude with:

- Recent email analyses
- Recent meeting briefs
- Relevant conversation history
- The user’s latest question

The model is instructed to:

- Answer using the provided TriAgent context
- Avoid inventing unavailable email or meeting information
- Clearly state when the synchronized data does not contain the answer
- Keep responses useful and action-oriented
- Refer to specific emails or meetings when available

---

# Database Design

## OAuth Session Records

Stores information such as:

- Session identifier
- Connected Google account email
- Access token
- Refresh token
- Token URI
- OAuth client information
- OAuth scopes
- Token expiry information
- Session timestamps

---

## Email Triage Records

Stores information such as:

- Gmail message ID
- User email
- Subject
- Sender
- Received timestamp
- Summary
- Priority
- Worth-reviewing status
- Reply-needed status
- Suggested draft reply
- Confidence
- Whether a Gmail draft was created
- Record creation or update timestamp

Email results are associated with the authenticated user.

---

## Meeting Brief Records

Stores information such as:

- Google Calendar event ID
- User email
- Event title
- Start time
- Meeting date
- Attendees
- Optional or required status
- Number of related emails
- Context summary
- Discussion points
- Open action items
- Talking points
- Record creation or update timestamp

---

# Frontend User Experience

## Authentication View

When no valid TriAgent session exists, the user is presented with a Google connection flow.

The user signs in through Google OAuth and is redirected back to the TriAgent frontend after successful authentication.

---

## Global Navigation

The main interface includes navigation between:

- Email Triage
- Meeting Prep

It also includes:

- Connected account information
- Global synchronization control
- Logout
- Contextual chat assistant

---

## Global Sync

The primary **Sync Now** action starts both major synchronization workflows:

- Email triage synchronization
- Meeting preparation synchronization

The frontend can initiate these workflows concurrently.

The two backend workflows themselves process individual AI items sequentially in the current implementation.

The interface should communicate:

- When synchronization is running
- Whether synchronization succeeded
- Whether one workflow failed
- How many new or updated records were processed

---

## Email Triage View

### Date Controls

The user can select:

- Start date
- End date

The date range controls which cached email analyses are displayed.

### Filters

The interface supports filtering by:

- All priorities
- High priority
- Medium priority
- Low priority
- All emails
- Worth reviewing
- Draft saved

### Summary Cards

Interactive statistics include:

- Total emails
- High priority
- Medium priority
- Low priority
- Drafts saved

Selecting a summary card can apply the related filter.

### Email Card

Each email card can display:

- Subject
- Sender
- Received time
- Summary
- Priority badge
- Worth-reviewing status
- Reply-needed status
- Confidence percentage
- Draft reply, when applicable
- Gmail draft-created status
- Link or action to open Gmail, when available

The draft reply section is visible only when the agent determines that a reply is needed.

---

## Meeting Prep View

### Date Controls

The user can select:

- Start date
- End date

The range controls which stored meeting briefs are displayed.

### Attendance Filters

The interface supports:

- All meetings
- Required meetings
- Optional meetings

### Summary Cards

Interactive statistics include:

- Total meetings
- Required meetings
- Optional meetings

### Meeting Card

Each meeting card can display:

- Event title
- Date and time
- Attendees
- Required or optional status
- Number of related email conversations
- Context summary
- Discussion points
- Open action items
- Talking points

Meeting details can be expanded or collapsed.

---

## Chat Assistant Interface

The contextual assistant is available through a floating or persistent chat control.

The interface includes:

- User message input
- Assistant responses
- Conversation history for the current chat session
- Loading and error states

The assistant should clearly communicate when the requested information is unavailable because the application has not been synchronized recently.

---

# Project Structure

```text
TriAgent/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── triage.py
│   │   ├── meeting_prep.py
│   │   └── chat.py
│   ├── services/
│   │   ├── gmail_service.py
│   │   ├── calendar_service.py
│   │   └── claude_service.py
│   ├── models/
│   │   ├── schemas.py
│   │   └── db_models.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── components/
│   │   │   ├── TriageCard.tsx
│   │   │   ├── MeetingBriefCard.tsx
│   │   │   └── ChatBot.tsx
│   │   └── pages/
│   │       ├── EmailTriage.tsx
│   │       └── MeetingPrep.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── spec.md
├── APPROACH.md
├── docker-compose.yml
├── render.yaml
└── README.md
```

Files containing secrets or generated dependencies must not be committed:

```text
.env
client_secret.json
node_modules/
dist/
__pycache__/
*.pyc
```

---

# Environment Variables

## Backend

```bash
ANTHROPIC_API_KEY=
DATABASE_URL=
GOOGLE_CLIENT_SECRET_JSON=
GOOGLE_REDIRECT_URI=
FRONTEND_URL=
```

### Variable Descriptions

#### `ANTHROPIC_API_KEY`

API key used to call Claude.

#### `DATABASE_URL`

PostgreSQL connection string.

#### `GOOGLE_CLIENT_SECRET_JSON`

Production Google OAuth client configuration serialized as JSON.

#### `GOOGLE_REDIRECT_URI`

OAuth callback URL configured in Google Cloud.

Example:

```text
https://your-backend.onrender.com/api/auth/callback
```

#### `FRONTEND_URL`

Allowed frontend origin and post-authentication redirect destination.

Example:

```text
https://your-frontend.onrender.com
```

---

## Local OAuth Alternative

For local development, the backend may use a path to a Google OAuth client-secret file:

```bash
GOOGLE_OAUTH_CLIENT_SECRET_PATH=client_secret.json
```

The actual secret file must remain outside version control.

---

## Frontend

```bash
VITE_API_URL=
```

Example:

```text
https://your-backend.onrender.com
```

This variable tells the React frontend where to send API requests.

---

# Local Development

## Docker Compose

The repository includes:

```text
docker-compose.yml
```

Docker Compose can be used to run the required local services, including PostgreSQL and the application components where configured.

A typical local setup requires:

1. PostgreSQL
2. Backend environment variables
3. Google OAuth credentials
4. Anthropic API credentials
5. Backend service
6. Frontend development server

---

## Local URLs

Typical local URLs:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
Health:   http://localhost:8000/api/health
```

The local Google OAuth callback must match the callback configured in Google Cloud.

Example:

```text
http://localhost:8000/api/auth/callback
```

---

# Deployment

## Hosting Architecture

TriAgent is configured for deployment using Render.

### Frontend

- React and Vite static site
- Hosted through Render
- Uses `VITE_API_URL` to communicate with the backend

### Backend

- Docker-based FastAPI web service
- Hosted through Render
- Contains Gmail, Calendar, Claude, OAuth, and database logic

### Database

- Render PostgreSQL
- Stores OAuth sessions, email analyses, and meeting briefs

---

## Deployment Configuration

The root-level file:

```text
render.yaml
```

defines or supports deployment of the frontend, backend, and database resources.

Production deployment must configure:

- `ANTHROPIC_API_KEY`
- `DATABASE_URL`
- `GOOGLE_CLIENT_SECRET_JSON`
- `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`
- `VITE_API_URL`

The Google Cloud OAuth configuration must include the exact deployed callback URL and authorized frontend origin.

--

# Current Limits

The current implementation uses fixed operational limits to keep synchronization practical.

Examples include:

- Up to 200 Gmail messages during an email synchronization
- Up to 50 Calendar events during a meeting synchronization
- A limited number of related Gmail messages for each meeting
- Up to 20 recent email analyses in chat context
- Up to 20 meeting briefs in chat context
- Up to 20 recent conversation messages in chat history
- Email body truncation before AI processing
- Sequential Claude processing within each workflow

These limits are appropriate for a prototype and daily-use demonstration but would need additional pagination and background processing for larger accounts.

---

# Error Handling

The backend should handle:

- Missing authentication session
- Expired OAuth access token
- OAuth refresh failure
- Revoked Google access
- Gmail API errors
- Calendar API errors
- Anthropic API errors
- Invalid or malformed Claude JSON
- Database connection errors
- Individual email or meeting processing failures

Where possible, one failed item should not invalidate all successfully processed items.

The frontend should display clear states for:

- Authentication required
- Synchronization in progress
- Empty results
- Partial synchronization success
- Synchronization failure
- Chat failure
- Backend unavailable

---

# Security and Privacy

TriAgent accesses sensitive Gmail and Calendar information.

The product follows several privacy-conscious design choices:

- Gmail read access is used only to analyze email and meeting context.
- Gmail compose access is used only to create drafts.
- TriAgent does not automatically send email.
- Calendar access is read-only.
- TriAgent does not modify events.
- Data is associated with the authenticated Google account.
- Session cookies are used instead of exposing OAuth tokens to the frontend.

Before production use, additional controls would be required:

- Encryption of OAuth tokens at rest
- Secret rotation
- Formal data-retention rules
- User-controlled data deletion
- Session revocation
- Audit logging
- Database backup controls
- Stronger multi-tenant isolation
- Terms of service and privacy policy
- Google OAuth application verification, where required

---

# Intentionally Out of Scope

The current project intentionally does not include:

- Automatically sending emails
- Creating Calendar events
- Editing Calendar events
- Deleting Calendar events
- Real-time Gmail notifications
- Gmail Pub/Sub integration
- Calendar webhook integration
- Background job workers
- Organization-level accounts
- Roles and permissions
- Administrative dashboards
- Complete production multi-tenancy
- Full Gmail MIME reply-header handling
- Full mailbox pagination
- Complete Calendar pagination
- Long-term chat-history persistence
- Mobile-native applications

---

# Known Tradeoffs

## Human Control Over Full Automation

TriAgent creates drafts but requires the user to review and send them.

This reduces the risk of an AI-generated message being sent incorrectly.

## On-Demand Synchronization

The system synchronizes when the user requests it rather than monitoring Gmail and Calendar continuously.

This simplifies infrastructure and gives the user control over when data is processed.

## Structured JSON Through Prompting

Claude is instructed to return JSON with a fixed schema.

This is simple and effective for the prototype, but strict schema-based output, validation retries, or model tool use would improve reliability.

## Cached Database Reads

The UI primarily reads stored PostgreSQL results rather than calling Google and Claude every time the page loads.

This improves responsiveness and reduces external API usage.

## Sequential Item Processing

Items are currently processed sequentially inside the email and meeting workflows.

This is easier to reason about but increases synchronization time for large first-time imports.

## Session-Based Prototype

The application supports user-scoped sessions and records, but it does not provide a complete production authentication and tenancy system.

---

# What Is Likely to Break First Under Load

## 1. Long Synchronization Requests

A first synchronization containing many unprocessed emails may take longer than a standard HTTP request should remain open.

## 2. Sequential Claude Requests

Sending new items to Claude one at a time increases total synchronization latency.

## 3. External API Rate Limits

Large synchronization runs may encounter Gmail, Calendar, or Anthropic rate limits.

## 4. AI Output Validation

Claude may occasionally return malformed or incomplete JSON.

The backend includes normalization or fallback behavior, but stronger retry and validation logic would be preferable.

## 5. OAuth Revocation

If the user removes Google access or the refresh token becomes invalid, the application must require reconnection.

## 6. Database Multi-User Isolation

Database keys and uniqueness constraints should be reviewed carefully for resource IDs that could theoretically overlap between users.

Composite user-and-resource constraints would provide stronger isolation.

## 7. Token Protection

OAuth credentials stored in PostgreSQL should be encrypted at the application layer for production deployment.

---

# Future Improvements

## Performance

- Process Claude requests concurrently with a safe concurrency limit
- Move synchronization into background jobs
- Add job progress reporting
- Add pagination for Gmail and Calendar
- Cache related-email searches more aggressively
- Add database indexes for common date and user queries

## Reliability

- Use strict structured-output validation
- Retry malformed model responses
- Add exponential backoff for external APIs
- Add per-item retry queues
- Improve partial-failure reporting
- Add structured application logging
- Add monitoring and alerting

## Security

- Encrypt OAuth tokens at rest
- Add user-controlled session management
- Add automatic session expiration
- Add token revocation on logout
- Improve secrets management
- Add audit logging
- Strengthen user-scoped database constraints

## Product Features

- Gmail Pub/Sub synchronization
- Google Calendar webhooks
- Persistent triage history and trends
- User-adjustable draft confidence threshold
- User feedback on AI classifications
- Manual “Save to Gmail Drafts” action for lower-confidence replies
- Better thread-aware reply formatting
- Configurable synchronization ranges
- Configurable meeting-context search
- Search across stored email and meeting results
- Daily productivity digest
- Optional notification system

## AI Improvements

- User-specific priority preferences
- Personalized writing style for draft responses
- Better detection of deadlines and commitments
- Extraction of structured tasks
- Cross-meeting action-item tracking
- Source references inside chat answers
- Evaluation dataset for classification and draft quality

---

# Deliverables

The completed project includes:

1. **Working TriAgent application**
2. **Deployed frontend**
3. **Deployed backend**
4. **PostgreSQL database**
5. **Email Triage Agent**
6. **Meeting Prep Agent**
7. **Contextual AI assistant**
8. **Google OAuth integration**
9. **Gmail draft creation**
10. **APPROACH.md**
11. **spec.md**
12. **Demonstration video**
13. **AI coding-session history or submission artifact required by the take-home**

---

# Changelog

| Date | Change |
|---|---|
| 2026-06-20 | Initial specification created |
| 2026-06-20 | Added conditional Gmail draft behavior |
| 2026-06-20 | Standardized Gmail draft confidence threshold at 85% |
| 2026-06-20 | Updated API documentation to separate synchronization endpoints from cached read endpoints |
| 2026-06-20 | Added PostgreSQL persistence and incremental email processing |
| 2026-06-20 | Added session-based Google OAuth storage |
| 2026-06-20 | Updated Meeting Prep to use customizable date ranges |
| 2026-06-20 | Added required and optional meeting filtering |
| 2026-06-20 | Added contextual AI assistant |
| 2026-06-20 | Updated deployment architecture to Render frontend, backend, and PostgreSQL |
| 2026-06-20 | Updated project structure, environment variables, operational limits, and known tradeoffs |
