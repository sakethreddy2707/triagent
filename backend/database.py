from sqlalchemy import create_engine, text, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker, declarative_base
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./triagent.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    _run_migrations()
    Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Idempotent schema migrations — safe to run on every startup."""
    inspector = sa_inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.connect() as conn:

        # ── oauth_tokens: migrate from id-based (single-user) to session_id-based ──
        if "oauth_tokens" in existing_tables:
            cols = {c["name"] for c in inspector.get_columns("oauth_tokens")}
            if "session_id" not in cols:
                # Old single-user table — recreate with new schema.
                # Existing token is dropped; the current user will need to re-login once.
                conn.execute(text("DROP TABLE oauth_tokens"))
                conn.execute(text("""
                    CREATE TABLE oauth_tokens (
                        session_id TEXT PRIMARY KEY,
                        email      TEXT,
                        token      TEXT,
                        refresh_token TEXT,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.commit()

        # ── email_triage: add user_email column ──────────────────────────────────
        _add_column_if_missing(conn, "email_triage", "user_email", "TEXT")

        # ── meeting_briefs: add missing columns ──────────────────────────────────
        for col, typedef in [
            ("user_email",     "TEXT"),
            ("meeting_date",   "TEXT"),
            ("is_optional",    "INTEGER DEFAULT 0"),
            ("last_synced_at", "DATETIME"),
        ]:
            _add_column_if_missing(conn, "meeting_briefs", col, typedef)


def _add_column_if_missing(conn, table: str, column: str, typedef: str):
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {typedef}"))
        conn.commit()
    except Exception:
        pass  # column already exists
