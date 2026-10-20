import os

import requests

from .base import Notifier


def list_members():
    """Return active human members of the workspace as dicts with id/name/real_name/email.

    Requires the bot token to have the `users:read` scope (add `users:read.email`
    too if you want the email field populated).
    """
    token = os.environ["SLACK_BOT_TOKEN"]
    members = []
    cursor = None

    while True:
        params = {"limit": 200}
        if cursor:
            params["cursor"] = cursor

        resp = requests.get(
            "https://slack.com/api/users.list",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=10,
        )
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Slack users.list failed: {data.get('error')}")

        for user in data.get("members", []):
            if user.get("deleted") or user.get("is_bot") or user.get("id") == "USLACKBOT":
                continue
            profile = user.get("profile", {})
            members.append({
                "id": user["id"],
                "name": user.get("name"),
                "real_name": profile.get("real_name") or user.get("real_name"),
                "email": profile.get("email"),
            })

        cursor = data.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break

    return members


def lookup_user_id_by_email(email):
    """Return the Slack member ID for the given email, or None if not found.

    Requires the bot token to have the `users:read.email` scope.
    """
    token = os.environ["SLACK_BOT_TOKEN"]
    resp = requests.get(
        "https://slack.com/api/users.lookupByEmail",
        headers={"Authorization": f"Bearer {token}"},
        params={"email": email},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        return None
    return data["user"]["id"]


class SlackNotifier(Notifier):
    channel = "slack"

    def is_configured(self) -> bool:
        return bool(os.environ.get("SLACK_BOT_TOKEN"))

    def send(self, recipient, subject, text, html=None, attachments=None) -> bool:
        if not recipient.slack_user_id:
            return False

        token = os.environ["SLACK_BOT_TOKEN"]
        try:
            resp = requests.post(
                "https://slack.com/api/chat.postMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"channel": recipient.slack_user_id, "text": f"*{subject}*\n\n{text}"},
                timeout=10,
            )
            data = resp.json()
            if not data.get("ok"):
                print(f"Slack send failed for {recipient.name}: {data.get('error')}")
                return False
            return True
        except requests.RequestException as error:
            print(f"Slack send error for {recipient.name}: {error}")
            return False


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()

    for member in list_members():
        print(f"{member['id']}\t{member['real_name'] or member['name']}\t{member['email'] or ''}")
