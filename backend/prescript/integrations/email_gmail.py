from .google import google_configured, send_email as gmail_send_email

from .base import Notifier


class GmailNotifier(Notifier):
    channel = "gmail"

    def is_configured(self) -> bool:
        return google_configured()

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.email:
            return False
        return gmail_send_email(recipient.email, subject, text, html_body=html, attachments=attachments)
