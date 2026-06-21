import anthropic
import json
import os

MODEL = "claude-haiku-4-5"

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def triage_email(email: dict) -> dict:
    prompt = f"""You are an email triage assistant. Analyze the following email and return a JSON object with exactly these fields:

- summary: 1-3 sentence plain English summary
- priority: one of "HIGH", "MEDIUM", "LOW"
- worth_reviewing: "YES" or "NO"
- reply_needed: "YES" or "NO"
- draft_reply: a suggested reply if reply_needed is YES, else empty string
- confidence: integer 0-100 representing your confidence across all decisions

Email:
Subject: {email['subject']}
From: {email['sender']}
Date: {email['received_at']}
Body: {email['body']}

Return only valid JSON. No explanation."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    result = json.loads(text)
    return {
        "summary": result.get("summary", ""),
        "priority": result.get("priority", "MEDIUM"),
        "worth_reviewing": result.get("worth_reviewing", "NO"),
        "reply_needed": result.get("reply_needed", "NO"),
        "draft_reply": result.get("draft_reply", ""),
        "confidence": int(result.get("confidence", 50)),
    }


def generate_meeting_brief(event: dict, related_emails: list[dict]) -> dict:
    email_context = ""
    for i, e in enumerate(related_emails, 1):
        email_context += f"\n--- Email {i} ---\nFrom: {e['sender']}\nSubject: {e['subject']}\nDate: {e['received_at']}\n{e['body'][:800]}\n"

    if not email_context:
        email_context = "No related emails found."

    prompt = f"""You are a meeting preparation assistant. Given the following calendar event and related email threads, produce a pre-meeting brief as a JSON object with these fields:

- context_summary: paragraph summarizing what this meeting is about based on the event and email history
- discussion_points: list of key topics likely to come up (array of strings)
- open_action_items: list of unresolved items from prior emails (array of strings)
- talking_points: list of suggested things to say or raise (array of strings)

Calendar Event:
Title: {event['title']}
Time: {event['start_time']}
Attendees: {', '.join(event['attendees']) if event['attendees'] else 'None listed'}
Description: {event.get('description', 'None')}

Related Email Threads:
{email_context}

Return only valid JSON. No explanation."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=1536,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    result = json.loads(text)
    return {
        "context_summary": result.get("context_summary", ""),
        "discussion_points": result.get("discussion_points", []),
        "open_action_items": result.get("open_action_items", []),
        "talking_points": result.get("talking_points", []),
    }
