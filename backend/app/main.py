from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import catalogue, health, pipeline_results

app = FastAPI(
    title="SIH 2026 PS-26143 — Oil Spill Detection & AIS Attribution",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(catalogue.router)
app.include_router(pipeline_results.router)
