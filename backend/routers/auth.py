from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from googleapiclient.discovery import build
from typing import Optional
from sqlalchemy.orm import Session
from database import SessionLocal
from models.db_models import OAuthToken
import os
import json
import uuid
import dataclasses
import tempfile

# Render sets the RENDER env var automatically; use it to detect production
_IS_PRODUCTION = bool(os.getenv("RENDER") or os.getenv("IS_PRODUCTION"))

# Cache the temp file path so we don't rewrite on every request
_client_secret_temp: str | None = None

router = APIRouter()

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

SESSION_COOKIE = "triagent_session"
COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days


def _set_session_cookie(response, session_id: str, max_age: int = COOKIE_MAX_AGE):
    """Set the session cookie — SameSite=None;Secure in production for cross-origin."""
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="none" if _IS_PRODUCTION else "lax",
        secure=_IS_PRODUCTION,
        max_age=max_age,
    )


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _client_secret_path() -> str:
    global _client_secret_temp
    # In production the JSON is stored as an env var to keep it out of the image
    json_content = os.getenv("GOOGLE_CLIENT_SECRET_JSON")
    if json_content:
        if not _client_secret_temp or not os.path.exists(_client_secret_temp):
            tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
            tmp.write(json_content)
            tmp.close()
            _client_secret_temp = tmp.name
        return _client_secret_temp
    # Local dev: read from the file on disk
    path = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET_PATH", "client_secret.json")
    if not os.path.isabs(path):
        path = os.path.join(os.path.dirname(__file__), "..", path)
    return os.path.abspath(path)


def get_flow() -> Flow:
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
    return Flow.from_client_secrets_file(
        _client_secret_path(),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )


def _load_client_info() -> dict:
    with open(_client_secret_path()) as f:
        data = json.load(f)
    return data.get("web") or data.get("installed") or {}


def _fetch_google_email(creds: Credentials) -> Optional[str]:
    try:
        svc = build("oauth2", "v2", credentials=creds)
        info = svc.userinfo().get().execute()
        return info.get("email")
    except Exception:
        return None


# ── Session / credential helpers ──────────────────────────────────────────────

@dataclasses.dataclass
class CurrentUser:
    """Resolved identity for one request."""
    creds: Optional[Credentials]
    email: Optional[str]

    @property
    def is_authenticated(self) -> bool:
        return bool(self.creds and self.creds.valid and self.email)


def _build_credentials_from_row(row: OAuthToken) -> Optional[Credentials]:
    if not row or not row.refresh_token:
        return None
    client = _load_client_info()
    return Credentials(
        token=row.token,
        refresh_token=row.refresh_token,
        token_uri=client.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=client.get("client_id"),
        client_secret=client.get("client_secret"),
        scopes=SCOPES,
    )


def get_current_user(request: Request) -> CurrentUser:
    """FastAPI dependency — reads the session cookie and returns (creds, email)."""
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return CurrentUser(None, None)

    db: Session = SessionLocal()
    try:
        row = db.query(OAuthToken).filter(OAuthToken.session_id == session_id).first()
        if not row:
            return CurrentUser(None, None)

        creds = _build_credentials_from_row(row)
        if creds is None:
            return CurrentUser(None, None)

        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(GoogleAuthRequest())
                row.token = creds.token
                db.commit()
            except Exception:
                return CurrentUser(None, None)

        return CurrentUser(creds, row.email)
    finally:
        db.close()


# ── Auth routes ───────────────────────────────────────────────────────────────

@router.get("/login")
def login():
    """Start Google OAuth — generates a fresh session_id and embeds it as OAuth state."""
    session_id = str(uuid.uuid4())
    flow = get_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=session_id,
    )
    response = RedirectResponse(auth_url)
    _set_session_cookie(response, session_id, max_age=600)
    return response


@router.get("/callback")
def callback(code: str, state: Optional[str] = None, request: Request = None):
    """OAuth callback — exchanges code for tokens and stores them under the session_id."""
    # The session_id travels through the OAuth state parameter
    session_id = state or request.cookies.get(SESSION_COOKIE)
    if not session_id:
        session_id = str(uuid.uuid4())  # fallback: create a new one

    flow = get_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    email = _fetch_google_email(creds)

    db: Session = SessionLocal()
    try:
        row = db.query(OAuthToken).filter(OAuthToken.session_id == session_id).first()
        if row:
            row.token = creds.token
            row.refresh_token = creds.refresh_token or row.refresh_token
            row.email = email or row.email
        else:
            db.add(OAuthToken(
                session_id=session_id,
                token=creds.token,
                refresh_token=creds.refresh_token,
                email=email,
            ))
        db.commit()
    finally:
        db.close()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    response = RedirectResponse(f"{frontend_url}?auth=success")
    _set_session_cookie(response, session_id)
    return response


@router.get("/status")
def status(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return {"authenticated": False, "email": None}

    db: Session = SessionLocal()
    try:
        row = db.query(OAuthToken).filter(OAuthToken.session_id == session_id).first()
        if not row or not row.refresh_token:
            return {"authenticated": False, "email": None}

        creds = _build_credentials_from_row(row)
        if creds is None:
            return {"authenticated": False, "email": None}

        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(GoogleAuthRequest())
                row.token = creds.token
                db.commit()
            except Exception:
                return {"authenticated": False, "email": None}

        if not row.email:
            # Backfill email for sessions that didn't capture it
            email = _fetch_google_email(creds)
            if email:
                row.email = email
                db.commit()

        return {"authenticated": True, "email": row.email}
    finally:
        db.close()


@router.get("/logout")
def logout(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        db: Session = SessionLocal()
        try:
            db.query(OAuthToken).filter(OAuthToken.session_id == session_id).delete()
            db.commit()
        finally:
            db.close()

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    response = RedirectResponse(frontend_url)
    response.delete_cookie(SESSION_COOKIE)
    return response
