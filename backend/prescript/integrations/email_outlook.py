import base64
import mimetypes
import os

import requests

from .base import Notifier
from .ms_graph import get_graph_token, graph_configured


class OutlookNotifier(Notifier):
    channel = "outlook"

    def is_configured(self) -> bool:
        return graph_configured() and bool(os.environ.get("MS_GRAPH_SENDER_UPN"))

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.email:
            return False

        sender = os.environ["MS_GRAPH_SENDER_UPN"]
        file_attachments = []
        for item in attachments or []:
            if isinstance(item, tuple):
                filename, data = item
            else:
                if not os.path.exists(item):
                    print(f"Skipping missing attachment: {item}")
                    continue
                filename = os.path.basename(item)
                with open(item, "rb") as f:
                    data = f.read()

            mime_type, _ = mimetypes.guess_type(filename)
            file_attachments.append({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": filename,
                "contentType": mime_type or "application/octet-stream",
                "contentBytes": base64.b64encode(data).decode(),
            })

        body = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML" if html else "Text",
                    "content": html or text,
                },
                "toRecipients": [{"emailAddress": {"address": recipient.email}}],
                "attachments": file_attachments,
            },
            "saveToSentItems": "true",
        }

        try:
            token = get_graph_token()
            resp = requests.post(
                f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail",
                headers={"Authorization": f"Bearer {token}"},
                json=body,
                timeout=10,
            )
            if resp.status_code >= 300:
                print(f"Outlook send failed for {recipient.name}: {resp.status_code} {resp.text}")
                return False
            return True
        except requests.RequestException as error:
            print(f"Outlook send error for {recipient.name}: {error}")
            return False
