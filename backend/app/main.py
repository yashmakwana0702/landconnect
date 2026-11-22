"""FastAPI application factory."""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import get_settings
from app.errors import AppError
from app.routers import auth, calls, chat, listings, match, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class Health(BaseModel):
    """Health-check response."""

    status: str


def create_app() -> FastAPI:
    """Build the app: routers, CORS, static uploads and error mapping."""
    settings = get_settings()
    app = FastAPI(title="LandConnect API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.get("/health", response_model=Health, tags=["meta"])
    async def health() -> Health:
        return Health(status="ok")

    for module in (auth, listings, chat, calls, match, ws):
        app.include_router(module.router)

    os.makedirs(settings.upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
    return app


app = create_app()
