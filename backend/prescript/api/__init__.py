from fastapi import APIRouter

from .routes import admin, appointments, auth, dashboard, doctors, documents, patients, visits

api_router = APIRouter(prefix="/api")
for module in (auth, dashboard, appointments, patients, visits, documents, doctors, admin):
    api_router.include_router(module.router)
