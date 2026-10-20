import os

import requests

from .base import Notifier
from .ms_graph import get_graph_token, graph_configured


class TeamsNotifier(Notifier):
    channel = "teams"

    def is_configured(self) -> bool:
        return graph_configured() and bool(os.environ.get("MS_GRAPH_SENDER_UPN"))

    def _get_or_create_chat(self, token, sender_upn, recipient_upn) -> str:
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {
            "chatType": "oneOnOne",
            "members": [
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{sender_upn}')",
                },
                {
                    "@odata.type": "#microsoft.graph.aadUserConversationMember",
                    "roles": ["owner"],
                    "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{recipient_upn}')",
                },
            ],
        }
        resp = requests.post(
            "https://graph.microsoft.com/v1.0/chats", headers=headers, json=payload, timeout=10
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.teams_upn:
            return False

        sender = os.environ["MS_GRAPH_SENDER_UPN"]
        try:
            token = get_graph_token()
            chat_id = self._get_or_create_chat(token, sender, recipient.teams_upn)
            body_html = (html or text).replace("\n", "<br>")
            resp = requests.post(
                f"https://graph.microsoft.com/v1.0/chats/{chat_id}/messages",
                headers={"Authorization": f"Bearer {token}"},
                json={"body": {"contentType": "html", "content": f"<b>{subject}</b><br>{body_html}"}},
                timeout=10,
            )
            if resp.status_code >= 300:
                print(f"Teams send failed for {recipient.name}: {resp.status_code} {resp.text}")
                return False
            return True
        except requests.RequestException as error:
            print(f"Teams send error for {recipient.name}: {error}")
            return False
