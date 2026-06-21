from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os

load_dotenv()

from database import init_db
from routers import auth, triage, meeting_prep, chat
from routers.auth import get_current_user, CurrentUser


def _allowed_origins() -> list[str]:
    """Build CORS origin list from FRONTEND_URL (comma-separated for transitions)."""
    origins = {"http://localhost:5173", "http://localhost:5174"}
    for url in os.getenv("FRONTEND_URL", "").split(","):
        url = url.strip()
        if url:
            origins.add(url)
    return list(origins)


app = FastAPI(title="TriAgent API", version="2.0.0")

ORIGINS = _allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Ensure CORS headers are present even on unhandled 500 errors, otherwise
# the browser reports "Network Error" instead of the real exception message.
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
        headers=headers,
    )


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(triage.router, prefix="/api", tags=["triage"])
app.include_router(meeting_prep.router, prefix="/api", tags=["meeting-prep"])
app.include_router(chat.router, prefix="/api", tags=["chat"])


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.delete("/api/cache/all")
def clear_all_cache(current_user: CurrentUser = Depends(get_current_user)):
    from fastapi import HTTPException
    if not current_user.is_authenticated:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    from database import SessionLocal
    from models.db_models import EmailTriage, MeetingBrief
    db = SessionLocal()
    try:
        emails_deleted = db.query(EmailTriage).filter(
            EmailTriage.user_email == current_user.email
        ).delete()
        meetings_deleted = db.query(MeetingBrief).filter(
            MeetingBrief.user_email == current_user.email
        ).delete()
        db.commit()
        return {
            "emails_deleted": emails_deleted,
            "meetings_deleted": meetings_deleted,
            "message": "All synced data cleared. Click Sync Now to repopulate.",
        }
    finally:
        db.close()
