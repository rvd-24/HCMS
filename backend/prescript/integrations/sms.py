import os
import re

import requests

from .base import Notifier

_LINK_LINE_RE = re.compile(r'^.*https?://\S+.*$\n?', re.MULTILINE)


def _strip_links(text: str) -> str:
    stripped = _LINK_LINE_RE.sub('', text)
    return re.sub(r'\n{3,}', '\n\n', stripped).strip()


class SMSNotifier(Notifier):
    channel = "sms"

    def is_configured(self) -> bool:
        return bool(
            os.environ.get("TWILIO_ACCOUNT_SID")
            and os.environ.get("TWILIO_AUTH_TOKEN")
            and os.environ.get("TWILIO_FROM_NUMBER")
        )

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.phone_number:
            return False

        sid = os.environ["TWILIO_ACCOUNT_SID"]
        token = os.environ["TWILIO_AUTH_TOKEN"]
        from_number = os.environ["TWILIO_FROM_NUMBER"]
        text = _strip_links(text)
        body = f"{subject}: {text}" if subject else text

        try:
            resp = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                auth=(sid, token),
                data={"Body": body[:1500], "From": from_number, "To": recipient.phone_number},
                timeout=10,
            )
            if resp.status_code >= 300:
                print(f"SMS send failed for {recipient.name}: {resp.status_code} {resp.text}")
                return False
            return True
        except requests.RequestException as error:
            print(f"SMS send error for {recipient.name}: {error}")
            return False
