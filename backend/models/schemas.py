from pydantic import BaseModel
from typing import Optional


class TriageRequest(BaseModel):
    max_emails: int = 20
    hours_back: int = 24


class TriageResult(BaseModel):
    email_id: str
    subject: str
    sender: str
    received_at: str
    summary: str
    priority: str
    worth_reviewing: str
    reply_needed: str
    draft_reply: Optional[str] = None
    confidence: int
    gmail_draft_created: bool = False


class MeetingSyncRequest(BaseModel):
    date_from: str   # YYYY-MM-DD
    date_to: str     # YYYY-MM-DD


class MeetingBrief(BaseModel):
    event_id: str
    title: str
    start_time: str
    meeting_date: Optional[str] = None
    attendees: list[str]
    is_optional: bool = False
    related_emails_count: int
    context_summary: str
    discussion_points: list[str]
    open_action_items: list[str]
    talking_points: list[str]


class AuthStatus(BaseModel):
    authenticated: bool
    email: Optional[str] = None
