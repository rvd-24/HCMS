"""LLM extraction of structured visit data from prescription / case-sheet images.

Moved from schedule_meet.py unchanged in behaviour; the model deployment name
and API version now come from settings instead of being hardcoded. Uses plain
OpenAI when OPENAI_API_KEY is set, otherwise Azure OpenAI.
"""
import base64
import os
from typing import List, Optional

from pydantic import BaseModel, Field

from ..config import get_settings


class NextVisit(BaseModel):
    date: str = Field(description="Next visit date in YYYY-MM-DD format")
    time: str = Field(description="Next visit time in 24-hour HH:MM format")
    reason: Optional[str] = Field(default=None, description="Reason or purpose of the next visit")
    location: Optional[str] = Field(default=None, description="Clinic/hospital name or address for the next visit, if mentioned")


class PrescriptionSummary(BaseModel):
    patient_id: Optional[str] = Field(default=None, description="Patient ID / MRN, if printed on the prescription")
    patient_name: Optional[str] = Field(default=None, description="Name of the patient")
    doctor_name: Optional[str] = Field(default=None, description="Name of the prescribing doctor")
    clinic_name: Optional[str] = Field(default=None, description="Clinic/hospital name or address where this visit took place, if mentioned")
    diagnosis: Optional[str] = Field(
        default=None,
        description=(
            "ONLY the clinical diagnosis/condition/findings themselves, as a clean clinical statement — "
            "e.g. 'Working length determined 11 & 25mm; BMP done to file #25; temporary dressing placed.' "
            "Read every section (chief complaint, exam findings, assessment, impression, procedure notes), "
            "not just text literally labeled 'Diagnosis' — but write out only the clinical content itself. "
            "Do NOT narrate the extraction: no 'handwritten notes appear to read', 'the image shows', 'there "
            "is also a note that says', document-type descriptions (that belongs in summary, not here), or "
            "sentences hedging about legibility. If a specific word is illegible, either omit it or tag just "
            "that word '(unclear)' — don't write a sentence explaining what might be unclear. Only leave this "
            "null if the image truly contains no clinical content at all (e.g. it's purely an appointment slip)."
        ),
    )
    medications: List[str] = Field(default_factory=list, description="Prescribed medications with dosage")
    summary: str = Field(
        description=(
            "A concise 1-2 sentence summary, written after you've extracted the detailed diagnosis above — "
            "condense that detail here rather than re-reading the image independently."
        )
    )
    visit_date: Optional[str] = Field(default=None, description="Date this prescription/visit was issued, in YYYY-MM-DD format if determinable from the image")
    next_visit: Optional[NextVisit] = Field(default=None, description="Details of the next scheduled visit, if mentioned")


class ExtractionNotConfigured(RuntimeError):
    pass


def get_llm():
    settings = get_settings()
    if not settings.llm_configured:
        raise ExtractionNotConfigured(
            "Set OPENAI_API_KEY (or AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY) in .env to enable extraction"
        )
    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key)
    from langchain_openai import AzureChatOpenAI

    return AzureChatOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        azure_deployment=settings.azure_openai_deployment,
        api_version=settings.azure_openai_api_version,
        api_key=settings.azure_openai_key,
    )


def _image_data_url(image_path: str) -> str:
    with open(image_path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    ext = os.path.splitext(image_path)[1].lstrip(".").lower() or "jpeg"
    if ext == "jpg":
        ext = "jpeg"
    return f"data:image/{ext};base64,{image_data}"


EXTRACTION_PROMPT = (
    "Read this prescription image carefully, including all handwritten notes — not just "
    "printed/typed fields. First, work through the clinical content in detail: chief "
    "complaint, exam findings, assessment/impression, and any procedure notes. Diagnostic "
    "information is often embedded in freeform clinical notes without an explicit 'Diagnosis:' "
    "label — look for it there too, and don't leave diagnosis null just because there's no "
    "such label. Put ONLY the clinical findings themselves into the diagnosis field, written as "
    "a plain clinical statement — not a description of what you're reading. Do not write things "
    "like 'handwritten notes appear to read', 'the image shows', or sentences explaining that "
    "something is hard to read; if a word is illegible, either skip it or tag just that word "
    "'(unclear)'. Then write the concise summary from that detail. Also extract the patient "
    "name, patient ID, doctor name, clinic/hospital name, medications, the date this visit/"
    "prescription was issued (visit_date), and next visit date/time/reason/location if mentioned."
)

EXTRA_PAGES_PROMPT = (
    " The following image(s) are additional pages of this SAME case sheet (e.g. the reverse "
    "side) — read them together as one document, not as separate visits; combine medications "
    "and clinical content from all pages into the single result."
)


def generate_prescription_summary(image_path: str, extra_image_paths: Optional[List[str]] = None) -> PrescriptionSummary:
    """extra_image_paths: additional pages of the SAME case sheet (e.g. the
    backside) to read together with image_path as one document — not separate
    visits. Medications/diagnosis are often split across front and back, so
    passing linked extra pages here (rather than extracting each in isolation)
    is what makes the combined result complete."""
    from langchain_core.messages import HumanMessage

    text = EXTRACTION_PROMPT + (EXTRA_PAGES_PROMPT if extra_image_paths else "")
    content = [{"type": "text", "text": text}]
    for path in [image_path, *(extra_image_paths or [])]:
        content.append({"type": "image_url", "image_url": {"url": _image_data_url(path)}})

    llm = get_llm().with_structured_output(PrescriptionSummary)
    return llm.invoke([HumanMessage(content=content)])
