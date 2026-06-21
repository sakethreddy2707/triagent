from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models.schemas import MeetingSyncRequest, MeetingBrief
from models.db_models import MeetingBrief as MeetingBriefModel
from services import calendar_service, gmail_service, claude_service
from routers.auth import get_current_user, CurrentUser
from datetime import date
import json
import pydantic

router = APIRouter()


def _row_to_brief(row: MeetingBriefModel) -> MeetingBrief:
    def _loads(val) -> list:
        if not val:
            return []
        try:
            return json.loads(val)
        except Exception:
            return []

    return MeetingBrief(
        event_id=row.event_id,
        title=row.title or '',
        start_time=row.start_time or '',
        meeting_date=row.meeting_date,
        attendees=_loads(row.attendees),
        is_optional=bool(row.is_optional),
        related_emails_count=row.related_emails_count or 0,
        context_summary=row.context_summary or '',
        discussion_points=_loads(row.discussion_points),
        open_action_items=_loads(row.open_action_items),
        talking_points=_loads(row.talking_points),
    )


# ── Read from DB ──────────────────────────────────────────────────────────────

@router.get("/meeting-prep", response_model=list[MeetingBrief])
def get_meeting_briefs(
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in first.")

    query = db.query(MeetingBriefModel).filter(
        MeetingBriefModel.user_email == current_user.email
    )
    if date_from:
        query = query.filter(MeetingBriefModel.meeting_date >= date_from)
    if date_to:
        query = query.filter(MeetingBriefModel.meeting_date <= date_to)
    rows = query.order_by(MeetingBriefModel.start_time.asc()).all()
    return [_row_to_brief(r) for r in rows]


# ── Sync: Calendar → Claude → DB ──────────────────────────────────────────────

class SyncResult(pydantic.BaseModel):
    fetched: int
    new_meetings: int
    refreshed: int
    skipped: int


@router.post("/meeting-prep/sync", response_model=SyncResult)
def sync_meeting_prep(
    request: MeetingSyncRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated. Please log in first.")

    today = date.today().isoformat()
    try:
        events = calendar_service.fetch_events_for_range(
            current_user.creds, request.date_from, request.date_to
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Google Calendar fetch failed: {exc}")

    new_meetings = 0
    refreshed = 0
    skipped = 0

    for event in events:
        try:
            is_future = (event.get("meeting_date") or "") >= today
            cached = db.query(MeetingBriefModel).filter(
                MeetingBriefModel.event_id == event["event_id"],
                MeetingBriefModel.user_email == current_user.email,
            ).first()

            # Past meetings already in DB are stable — skip
            if cached and not is_future:
                skipped += 1
                continue

            try:
                related_emails = gmail_service.search_threads_for_event(
                    current_user.creds,
                    keywords=event.get("keywords", []),
                    attendees=event.get("attendees", []),
                )
            except Exception:
                related_emails = []

            try:
                brief_data = claude_service.generate_meeting_brief(event, related_emails)
            except Exception:
                brief_data = {
                    "context_summary": "Could not generate brief for this meeting.",
                    "discussion_points": [],
                    "open_action_items": [],
                    "talking_points": [],
                }

            if cached:
                cached.title = event["title"]
                cached.start_time = event["start_time"]
                cached.meeting_date = event.get("meeting_date")
                cached.attendees = json.dumps(event.get("attendees", []))
                cached.is_optional = event.get("is_optional", False)
                cached.related_emails_count = len(related_emails)
                cached.context_summary = brief_data["context_summary"]
                cached.discussion_points = json.dumps(brief_data["discussion_points"])
                cached.open_action_items = json.dumps(brief_data["open_action_items"])
                cached.talking_points = json.dumps(brief_data["talking_points"])
                refreshed += 1
            else:
                db.add(MeetingBriefModel(
                    event_id=event["event_id"],
                    user_email=current_user.email,
                    title=event["title"],
                    start_time=event["start_time"],
                    meeting_date=event.get("meeting_date"),
                    attendees=json.dumps(event.get("attendees", [])),
                    is_optional=event.get("is_optional", False),
                    related_emails_count=len(related_emails),
                    context_summary=brief_data["context_summary"],
                    discussion_points=json.dumps(brief_data["discussion_points"]),
                    open_action_items=json.dumps(brief_data["open_action_items"]),
                    talking_points=json.dumps(brief_data["talking_points"]),
                ))
                new_meetings += 1

            db.commit()
        except Exception:
            db.rollback()

    return SyncResult(fetched=len(events), new_meetings=new_meetings, refreshed=refreshed, skipped=skipped)


@router.delete("/meeting-prep/cache")
def clear_meeting_cache(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    deleted = db.query(MeetingBriefModel).filter(
        MeetingBriefModel.user_email == current_user.email
    ).delete()
    db.commit()
    return {"deleted": deleted, "message": "Meeting brief cache cleared."}
