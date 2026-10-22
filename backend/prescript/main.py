"""FastAPI app. In production the built frontend (frontend/dist) is served from
the same origin; in development Vite proxies /api to this server."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import api_router
from .config import PROJECT_ROOT, get_settings
from .db import init_db
from .services.storage import StorageError

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


def create_app() -> FastAPI:
    settings = get_settings()
    init_db()
    app = FastAPI(title="Prescript", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.exception_handler(StorageError)
    def storage_unavailable(_: Request, error: StorageError):
        print(f"storage error: {error}")
        return JSONResponse({"detail": "File storage is unavailable right now. Please try again."}, status_code=503)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    if FRONTEND_DIST.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            candidate = FRONTEND_DIST / path
            if path and candidate.is_file() and candidate.resolve().is_relative_to(FRONTEND_DIST.resolve()):
                return FileResponse(candidate)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
