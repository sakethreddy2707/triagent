from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from datetime import datetime, timezone


def get_calendar_client(creds: Credentials):
    return build("calendar", "v3", credentials=creds)


def fetch_events_for_range(creds: Credentials, date_from: str, date_to: str) -> list[dict]:
    """Fetch calendar events between date_from and date_to (YYYY-MM-DD, inclusive)."""
    service = get_calendar_client(creds)
    time_min = f"{date_from}T00:00:00Z"
    time_max = f"{date_to}T23:59:59Z"

    result = service.events().list(
        calendarId="primary",
        timeMin=time_min,
        timeMax=time_max,
        maxResults=50,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    return [_parse_event(e) for e in result.get("items", [])]


def _parse_event(event: dict) -> dict:
    start = event.get("start", {})
    start_time = start.get("dateTime", start.get("date", ""))
    meeting_date = start_time[:10] if start_time else ""

    attendees = []
    is_optional = False
    for a in event.get("attendees", []):
        email = a.get("email", "")
        if email:
            attendees.append(email)
        # Google sets self=True on the logged-in user's attendee entry
        if a.get("self", False):
            is_optional = bool(a.get("optional", False))

    title = event.get("summary", "(no title)")
    # Use meaningful words (>3 chars) as search keywords for Gmail
    keywords = [w for w in title.split() if len(w) > 3]

    return {
        "event_id": event.get("id", ""),
        "title": title,
        "start_time": start_time,
        "meeting_date": meeting_date,
        "attendees": attendees,
        "is_optional": is_optional,
        "keywords": keywords,
        "description": event.get("description", ""),
    }
