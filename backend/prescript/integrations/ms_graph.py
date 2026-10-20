import os
import time

import requests

_token_cache = {"access_token": None, "expires_at": 0}


def graph_configured() -> bool:
    return bool(
        os.environ.get("MS_GRAPH_TENANT_ID")
        and os.environ.get("MS_GRAPH_CLIENT_ID")
        and os.environ.get("MS_GRAPH_CLIENT_SECRET")
    )


def get_graph_token() -> str:
    now = time.time()
    if _token_cache["access_token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    tenant_id = os.environ["MS_GRAPH_TENANT_ID"]
    resp = requests.post(
        f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        data={
            "client_id": os.environ["MS_GRAPH_CLIENT_ID"],
            "client_secret": os.environ["MS_GRAPH_CLIENT_SECRET"],
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 3600)
    return _token_cache["access_token"]


def list_directory_users():
    """Return tenant users as dicts with id/displayName/userPrincipalName/mail.

    Requires the app registration to have the `User.Read.All` Graph
    application permission (in addition to whatever Chat/Mail permissions
    you granted), with admin consent.
    """
    token = get_graph_token()
    users = []
    url = "https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail&$top=999"

    while url:
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"Graph users.list failed: {data['error'].get('message')}")

        users.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    return users


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()

    for user in list_directory_users():
        print(f"{user['userPrincipalName']}\t{user.get('displayName')}\t{user.get('mail') or ''}")
