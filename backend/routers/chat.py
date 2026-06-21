from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.db_models import EmailTriage, MeetingBrief
from routers.auth import get_current_user, CurrentUser
from services.claude_service import client, MODEL
import pydantic
import json

router = APIRouter()


class ChatMessage(pydantic.BaseModel):
    role: str    # "user" or "assistant"
    content: str


class ChatRequest(pydantic.BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(pydantic.BaseModel):
    reply: str


def _safe_loads(val) -> list:
    if not val:
        return []
    try:
        return json.loads(val)
    except Exception:
        return []


def _build_context(emails: list, meetings: list) -> str:
    sections = []

    # ── Emails ───────────────────────────────────────────────────────────────
    if emails:
        lines = ["## EMAILS (most recent first)"]
        for i, e in enumerate(emails, 1):
            reply_flag = " · Reply needed" if e.reply_needed == "YES" else ""
            date = e.received_date or (e.received_at[:10] if e.received_at else "unknown date")
            lines.append(
                f"{i}. [{e.priority}] {e.subject}\n"
                f"   From: {e.sender} | {date}{reply_flag}\n"
                f"   Summary: {e.summary}"
            )
            if e.draft_reply:
                preview = e.draft_reply[:150].replace("\n", " ")
                lines.append(f"   Draft reply: {preview}{'…' if len(e.draft_reply) > 150 else ''}")
        sections.append("\n".join(lines))
    else:
        sections.append("## EMAILS\n(none synced yet — user should click Sync Now)")

    # ── Meetings ─────────────────────────────────────────────────────────────
    if meetings:
        lines = ["## MEETINGS"]
        for m in meetings:
            attendance = "Optional" if m.is_optional else "Required"
            attendees = _safe_loads(m.attendees)
            discussion = _safe_loads(m.discussion_points)
            action_items = _safe_loads(m.open_action_items)
            talking = _safe_loads(m.talking_points)

            date = m.meeting_date or (m.start_time[:10] if m.start_time else "unknown date")
            lines.append(
                f"• {m.title} | {date} | {attendance}\n"
                f"  Attendees: {', '.join(attendees) if attendees else 'None listed'}\n"
                f"  Context: {m.context_summary}"
            )
            if discussion:
                lines.append(f"  Discussion points: {'; '.join(discussion[:4])}")
            if action_items:
                lines.append(f"  Open action items: {'; '.join(action_items[:4])}")
            if talking:
                lines.append(f"  Talking points: {'; '.join(talking[:3])}")
        sections.append("\n".join(lines))
    else:
        sections.append("## MEETINGS\n(none synced yet — user should click Sync Now)")

    return "\n\n".join(sections)


SYSTEM_PROMPT = """\
You are a personal AI assistant embedded in TriAgent, a productivity app. \
You have access to the user's triaged emails and meeting briefs stored in their database.

Your job is to answer questions about their emails and meetings clearly and helpfully. Examples:
- "Which emails need a reply?" → list emails where a reply is needed
- "What's my highest priority email?" → look at HIGH priority items
- "What meetings do I have this week?" → check the meetings list
- "Give me an overview of my inbox" → summarize priorities and reply-needed items
- "What should I prepare for my meeting with X?" → pull talking points and action items

Keep responses concise and conversational. Reference specific subjects or meeting titles. \
If the user asks about something not in the data, say so clearly rather than guessing.

Here is the user's current synced data:

"""


@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    emails = (
        db.query(EmailTriage)
        .filter(EmailTriage.user_email == current_user.email)
        .order_by(EmailTriage.received_at.desc())
        .limit(20)
        .all()
    )
    meetings = (
        db.query(MeetingBrief)
        .filter(MeetingBrief.user_email == current_user.email)
        .order_by(MeetingBrief.start_time.asc())
        .limit(20)
        .all()
    )

    context = _build_context(emails, meetings)
    system = SYSTEM_PROMPT + context

    # Keep last 10 exchanges (20 messages) for conversational context
    history_tail = request.history[-20:]
    messages = [{"role": m.role, "content": m.content} for m in history_tail]
    messages.append({"role": "user", "content": request.message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    )

    return ChatResponse(reply=response.content[0].text.strip())
