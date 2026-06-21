from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from datetime import datetime, timedelta, timezone
from typing import Optional
import base64
import email as email_lib
from email.mime.text import MIMEText


def get_gmail_client(creds: Credentials):
    return build("gmail", "v1", credentials=creds)


def fetch_emails(creds: Credentials, max_emails: int = 20, hours_back: int = 24) -> list[dict]:
    service = get_gmail_client(creds)
    # Use YYYY/MM/DD format so Gmail applies the date in the user's account timezone,
    # not UTC — this avoids off-by-one-day errors at date boundaries.
    after_date = (datetime.now() - timedelta(hours=hours_back)).strftime("%Y/%m/%d")
    query = f"after:{after_date} in:inbox"

    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_emails,
    ).execute()

    messages = result.get("messages", [])
    emails = []
    for msg in messages:
        detail = service.users().messages().get(
            userId="me",
            id=msg["id"],
            format="full",
        ).execute()
        parsed = _parse_message(detail)
        if parsed:
            emails.append(parsed)
    return emails


def _parse_message(msg: dict) -> Optional[dict]:
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    subject = headers.get("subject", "(no subject)")
    sender = headers.get("from", "")
    date_str = headers.get("date", "")

    body = _extract_body(msg.get("payload", {}))

    return {
        "email_id": msg["id"],
        "thread_id": msg.get("threadId", ""),
        "subject": subject,
        "sender": sender,
        "received_at": date_str,
        "body": body[:4000],  # cap to avoid token overflow
    }


def _extract_body(payload: dict) -> str:
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")

    if mime_type.startswith("multipart/"):
        for part in payload.get("parts", []):
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
        for part in payload.get("parts", []):
            text = _extract_body(part)
            if text:
                return text

    return ""


def search_threads_for_event(creds: Credentials, keywords: list[str], attendees: list[str]) -> list[dict]:
    service = get_gmail_client(creds)
    query_parts = []
    if keywords:
        query_parts.append(" OR ".join(f'"{k}"' for k in keywords[:3]))
    if attendees:
        query_parts.append(" OR ".join(f"from:{a} OR to:{a}" for a in attendees[:5]))
    query = " OR ".join(query_parts) if query_parts else ""

    if not query:
        return []

    result = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=10,
    ).execute()

    messages = result.get("messages", [])
    threads = []
    seen_threads = set()
    for msg in messages:
        thread_id = msg.get("threadId")
        if thread_id in seen_threads:
            continue
        seen_threads.add(thread_id)
        detail = service.users().messages().get(
            userId="me",
            id=msg["id"],
            format="full",
        ).execute()
        parsed = _parse_message(detail)
        if parsed:
            threads.append(parsed)
    return threads


def create_draft(creds: Credentials, to: str, subject: str, body: str, thread_id: str) -> str:
    service = get_gmail_client(creds)
    mime_msg = MIMEText(body)
    mime_msg["to"] = to
    mime_msg["subject"] = subject
    raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode()

    draft_body = {"message": {"raw": raw, "threadId": thread_id}}
    draft = service.users().drafts().create(userId="me", body=draft_body).execute()
    return draft.get("id", "")
