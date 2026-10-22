from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from ..config import get_settings
from .models import Base

settings = get_settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)

_is_sqlite = settings.resolved_database_url.startswith("sqlite")
if _is_sqlite:
    engine = create_engine(settings.resolved_database_url, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        settings.resolved_database_url,
        # Poolers (Supabase/Supavisor) drop idle connections; test before reuse.
        pool_pre_ping=True,
        pool_recycle=300,
        # Supabase's session pooler allows only a handful of clients per project.
        pool_size=5,
        max_overflow=5,
        # Server-side prepared statements break behind a transaction-mode pooler
        # (port 6543); disabling them keeps either pooler mode working.
        connect_args={"prepare_threshold": None},
    )

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    try:
        Base.metadata.create_all(engine)
    except DBAPIError as error:
        # Two processes starting together (a reload and a CLI run, or two workers on deploy)
        # can both see a new table missing and both CREATE it; the loser fails here. A second
        # pass finds the table and carries on.
        message = str(error.orig).lower()
        if "already exists" not in message and "pg_type_typname_nsp_index" not in message:
            raise
        Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        _enable_row_level_security()


def _enable_row_level_security() -> None:
    """Supabase serves every table in `public` through its REST API to anyone
    holding the (public) anon key. RLS with no policies makes that API return
    nothing; this app connects as the table owner, which RLS doesn't apply to."""
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            conn.execute(text(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY'))


def get_db():
    """FastAPI dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Session:
    """For background jobs and the CLI: commits on success, rolls back on error."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
