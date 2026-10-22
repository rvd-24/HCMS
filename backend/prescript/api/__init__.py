from fastapi import APIRouter

from .routes import admin, appointments, auth, dashboard, doctors, documents, patients, scans, visits

api_router = APIRouter(prefix="/api")
for module in (auth, dashboard, appointments, patients, scans, visits, documents, doctors, admin):
    api_router.include_router(module.router)
