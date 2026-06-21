from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models.schemas import TriageResult
from models.db_models import EmailTriage
from services import gmail_service, claude_service
from routers.auth import get_current_user, CurrentUser
from email.utils import parsedate_to_datetime
from datetime import datetime
import pydantic

router = APIRouter()


def _parse_received_date(received_at: str) -> str:
    """Parse RFC 2822 date into YYYY-MM-DD in the email's own timezone."""
    try:
        dt = parsedate_to_datetime(received_at)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return datetime.now().strftime("%Y-%m-%d")


def _row_to_result(row: EmailTriage) -> TriageResult:
    return TriageResult(
        email_id=row.email_id,
        subject=row.subject,
        sender=row.sender,
        received_at=row.received_at,
        summary=row.summary,
        priority=row.priority,
        worth_reviewing=row.worth_reviewing,
        reply_needed=row.reply_needed,
        draft_reply=row.draft_reply,
        confidence=row.confidence,
        gmail_draft_created=row.gmail_draft_created,
    )


# ── Read from DB only ─────────────────────────────────────────────────────────

@router.get("/triage", response_model=list[TriageResult])
def get_triage(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD start date (inclusive)"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD end date (inclusive)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in first.")

    query = db.query(EmailTriage).filter(EmailTriage.user_email == current_user.email)
    if date_from:
        query = query.filter(EmailTriage.received_date >= date_from)
    if date_to:
        query = query.filter(EmailTriage.received_date <= date_to)
    rows = query.order_by(EmailTriage.received_at.desc()).all()
    return [_row_to_result(r) for r in rows]


# ── Sync: pull Gmail → run Claude on new emails only ─────────────────────────

class SyncRequest(pydantic.BaseModel):
    days_back: int = 7


class SyncResult(pydantic.BaseModel):
    fetched: int
    already_cached: int
    newly_processed: int


@router.post("/triage/sync", response_model=SyncResult)
def sync_triage(
    request: SyncRequest = SyncRequest(),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in first.")

    emails = gmail_service.fetch_emails(
        current_user.creds, max_emails=200, hours_back=request.days_back * 24
    )

    fetched = len(emails)
    already_cached = 0
    newly_processed = 0

    for email in emails:
        exists = db.query(EmailTriage.email_id).filter(
            EmailTriage.email_id == email["email_id"],
            EmailTriage.user_email == current_user.email,
        ).first()
        if exists:
            already_cached += 1
            continue

        try:
            analysis = claude_service.triage_email(email)
        except Exception:
            analysis = {
                "summary": "Could not analyze this email.",
                "priority": "MEDIUM",
                "worth_reviewing": "YES",
                "reply_needed": "NO",
                "draft_reply": "",
                "confidence": 0,
            }

        draft_created = False
        if (
            analysis["reply_needed"] == "YES"
            and analysis["confidence"] >= 90
            and analysis["draft_reply"]
        ):
            try:
                gmail_service.create_draft(
                    current_user.creds,
                    to=email["sender"],
                    subject=f"Re: {email['subject']}",
                    body=analysis["draft_reply"],
                    thread_id=email["thread_id"],
                )
                draft_created = True
            except Exception:
                pass

        draft_reply = analysis["draft_reply"] if analysis["reply_needed"] == "YES" else None

        db.add(EmailTriage(
            email_id=email["email_id"],
            user_email=current_user.email,
            subject=email["subject"],
            sender=email["sender"],
            received_at=email["received_at"],
            received_date=_parse_received_date(email["received_at"]),
            summary=analysis["summary"],
            priority=analysis["priority"],
            worth_reviewing=analysis["worth_reviewing"],
            reply_needed=analysis["reply_needed"],
            draft_reply=draft_reply,
            confidence=analysis["confidence"],
            gmail_draft_created=draft_created,
        ))
        db.commit()
        newly_processed += 1

    return SyncResult(fetched=fetched, already_cached=already_cached, newly_processed=newly_processed)


@router.delete("/triage/cache")
def clear_triage_cache(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    deleted = db.query(EmailTriage).filter(EmailTriage.user_email == current_user.email).delete()
    db.commit()
    return {"deleted": deleted, "message": "Cache cleared. Next sync will re-process all emails."}
