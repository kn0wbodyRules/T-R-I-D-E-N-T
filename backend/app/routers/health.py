from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.ollama_client import list_models

router = APIRouter(tags=["health"])

REQUIRED_EXTENSIONS = {"postgis", "vector"}


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(db: Session = Depends(get_db)) -> JSONResponse:
    checks: dict[str, dict] = {}

    try:
        db.execute(text("SELECT 1"))
        installed = {
            row[0] for row in db.execute(text("SELECT extname FROM pg_extension"))
        }
        missing = sorted(REQUIRED_EXTENSIONS - installed)
        checks["database"] = {
            "ok": not missing,
            "extensions": sorted(REQUIRED_EXTENSIONS & installed),
            "missing_extensions": missing,
        }
    except Exception as exc:
        checks["database"] = {"ok": False, "error": str(exc)}

    settings = get_settings()
    try:
        models = await list_models()
        checks["ollama"] = {
            "ok": True,
            "models": models,
            "configured_model": settings.ollama_model,
            "configured_model_pulled": settings.ollama_model in models,
        }
    except Exception as exc:
        checks["ollama"] = {"ok": False, "error": str(exc)}

    ready = all(check["ok"] for check in checks.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready", "checks": checks},
    )
