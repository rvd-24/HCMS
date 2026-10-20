import os

import requests

from .base import Notifier


class WhatsAppNotifier(Notifier):
    channel = "whatsapp"

    def is_configured(self) -> bool:
        return bool(os.environ.get("WHATSAPP_TOKEN") and os.environ.get("WHATSAPP_PHONE_NUMBER_ID"))

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.whatsapp_number:
            return False

        token = os.environ["WHATSAPP_TOKEN"]
        phone_number_id = os.environ["WHATSAPP_PHONE_NUMBER_ID"]
        template_name = os.environ.get("WHATSAPP_TEMPLATE_NAME")
        template_lang = os.environ.get("WHATSAPP_TEMPLATE_LANG", "en_US")

        # Meta requires an approved template for any message sent outside a
        # 24-hour customer-initiated session window. Free-form text below is
        # only usable if the recipient messaged this WhatsApp number first.
        if template_name:
            payload = {
                "messaging_product": "whatsapp",
                "to": recipient.whatsapp_number,
                "type": "template",
                "template": {
                    "name": template_name,
                    "language": {"code": template_lang},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": recipient.name or "there"},
                                {"type": "text", "text": text[:1000]},
                            ],
                        }
                    ],
                },
            }
        else:
            payload = {
                "messaging_product": "whatsapp",
                "to": recipient.whatsapp_number,
                "type": "text",
                "text": {"body": f"{subject}\n\n{text}"},
            }

        try:
            resp = requests.post(
                f"https://graph.facebook.com/v20.0/{phone_number_id}/messages",
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
                timeout=10,
            )
            if resp.status_code >= 300:
                print(f"WhatsApp send failed for {recipient.name}: {resp.status_code} {resp.text}")
                return False
            return True
        except requests.RequestException as error:
            print(f"WhatsApp send error for {recipient.name}: {error}")
            return False
