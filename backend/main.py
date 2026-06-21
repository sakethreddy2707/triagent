from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from database import init_db
from routers import auth, triage, meeting_prep, chat
from routers.auth import get_current_user, CurrentUser

app = FastAPI(title="TriAgent API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    """Clear all synced data for the currently signed-in user."""
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
