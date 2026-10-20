import dataclasses
from typing import List, Optional

from ..config import get_settings
from .base import Recipient
from .email_gmail import GmailNotifier
from .email_outlook import OutlookNotifier
from .slack import SlackNotifier
from .teams import TeamsNotifier
from .whatsapp import WhatsAppNotifier

# SMS paused for now — re-add SMSNotifier() below (and its import) to re-enable.
NOTIFIERS = [
    GmailNotifier(),
    OutlookNotifier(),
    SlackNotifier(),
    TeamsNotifier(),
    WhatsAppNotifier(),
]

EMAIL_CHANNELS = {"gmail", "outlook"}


def email_address_for(address: Optional[str]) -> Optional[str]:
    """Where an email to `address` actually goes: nowhere while email is disabled,
    the redirect address while one is set, otherwise the real address."""
    settings = get_settings()
    if not settings.email_enabled:
        return None
    if settings.email_redirect:
        return settings.email_redirect
    return address


def send_to_recipient(
    recipient: Recipient,
    subject: str,
    text: str,
    html: Optional[str] = None,
    attachments: Optional[List[str]] = None,
) -> dict:
    settings = get_settings()
    results = {}
    for notifier in NOTIFIERS:
        if not notifier.is_configured():
            results[notifier.channel] = "not configured"
            continue
        target = recipient
        if notifier.channel in EMAIL_CHANNELS:
            if not settings.email_enabled:
                results[notifier.channel] = "disabled (PRESCRIPT_EMAIL_ENABLED is off)"
                continue
            if not recipient.email:
                results[notifier.channel] = "skipped (no contact info)"
                continue
            target = dataclasses.replace(recipient, email=email_address_for(recipient.email))
        try:
            ok = notifier.send(target, subject, text, html=html, attachments=attachments)
            results[notifier.channel] = ("sent" if ok else "skipped (no contact info)") + (
                f" -> redirected to {target.email}" if ok and target.email != recipient.email else ""
            )
        except Exception as error:
            results[notifier.channel] = f"error: {error}"
    return results


def channel_status() -> dict:
    """Which notification channels can actually deliver right now — surfaced in
    the admin Settings screen so it's obvious why a message did or didn't go out."""
    settings = get_settings()
    return {
        notifier.channel: notifier.is_configured() and (notifier.channel not in EMAIL_CHANNELS or settings.email_enabled)
        for notifier in NOTIFIERS
    }
