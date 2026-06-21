from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, Date
from sqlalchemy.sql import func
from database import Base


class EmailTriage(Base):
    __tablename__ = "email_triage"

    email_id = Column(String, primary_key=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)   # which user owns this row
    subject = Column(Text, nullable=False)
    sender = Column(Text, nullable=False)
    received_at = Column(Text, nullable=False)
    received_date = Column(String(10), nullable=True, index=True)  # YYYY-MM-DD for fast date filtering
    summary = Column(Text, nullable=False)
    priority = Column(String(10), nullable=False)
    worth_reviewing = Column(String(3), nullable=False)
    reply_needed = Column(String(3), nullable=False)
    draft_reply = Column(Text, nullable=True)
    confidence = Column(Integer, nullable=False)
    gmail_draft_created = Column(Boolean, default=False)
    analyzed_at = Column(DateTime, server_default=func.now())


class MeetingBrief(Base):
    __tablename__ = "meeting_briefs"

    event_id = Column(String, primary_key=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)   # which user owns this row
    title = Column(Text, nullable=False)
    start_time = Column(Text, nullable=False)
    meeting_date = Column(String(10), nullable=True, index=True)
    attendees = Column(Text, nullable=False)
    is_optional = Column(Boolean, default=False)
    related_emails_count = Column(Integer, default=0)
    context_summary = Column(Text, nullable=False)
    discussion_points = Column(Text, nullable=False)
    open_action_items = Column(Text, nullable=False)
    talking_points = Column(Text, nullable=False)
    generated_at = Column(DateTime, server_default=func.now())
    last_synced_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class OAuthToken(Base):
    """One row per active login session. session_id lives in the browser cookie."""
    __tablename__ = "oauth_tokens"

    session_id = Column(String(36), primary_key=True)   # UUID set at login
    email = Column(Text, nullable=True, index=True)
    token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
