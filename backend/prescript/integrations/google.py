import base64
import mimetypes
import os.path
from email.message import EmailMessage
from typing import List, Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ..config import get_settings

# If modifying these scopes, delete the file token.json.
SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send',
]


class GoogleAuthRequired(RuntimeError):
    pass


def get_credentials(interactive: bool = False):
    """Load (and refresh) the saved Google token. The browser consent flow only
    runs when interactive=True (the `prescript google-auth` CLI command) — a web
    server request must never block waiting on a local browser login."""
    settings = get_settings()
    token_path = str(settings.google_token_path)
    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as error:
                print(f"token.json refresh failed ({error}); removing it and re-authenticating.")
                os.remove(token_path)
                creds = None
        elif creds:
            # Expired with no refresh token, or otherwise invalid — can't be
            # salvaged, so drop it and fall through to a fresh auth flow.
            os.remove(token_path)
            creds = None

        if not creds:
            if not interactive:
                raise GoogleAuthRequired("Google is not authorised — run `uv run prescript google-auth` once")
            flow = InstalledAppFlow.from_client_secrets_file(
                str(settings.google_credentials_path), SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    return creds


def google_configured() -> bool:
    return get_settings().google_token_path.exists()


def get_calendar_service():
    try:
        return build('calendar', 'v3', credentials=get_credentials())
    except (HttpError, GoogleAuthRequired) as error:
        print(f'An error occurred: {error}')
        return None


def get_gmail_service():
    try:
        return build('gmail', 'v1', credentials=get_credentials())
    except (HttpError, GoogleAuthRequired) as error:
        print(f'An error occurred: {error}')
        return None


def send_email(to_email, subject, body_text, html_body=None, attachments: Optional[List] = None):
    """attachments: each item is either a file path (str) or a (filename, bytes)
    tuple — the latter is how already-compressed in-memory attachments arrive."""
    service = get_gmail_service()
    if service is None:
        print("Failed to get Gmail service.")
        return False

    message = EmailMessage()
    message.set_content(body_text)
    if html_body:
        message.add_alternative(html_body, subtype='html')
    message['To'] = to_email
    message['Subject'] = subject

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
        maintype, subtype = (mime_type or "application/octet-stream").split("/", 1)
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)

    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
    try:
        sent = service.users().messages().send(userId='me', body={'raw': encoded_message}).execute()
        print(f"Email sent to {to_email}: {sent['id']}")
        return True
    except HttpError as error:
        print(f'An error occurred sending email to {to_email}: {error}')
        return False


def schedule_meet(summary, description, start_time, end_time, attendees_emails, location=None):
    service = get_calendar_service()
    if service is None:
        print("Failed to get calendar service.")
        return None

    event = {
        'summary': summary,
        'description': description,
        'start': {
            'dateTime': start_time.isoformat(),
            'timeZone': get_settings().clinic_timezone,
        },
        'end': {
            'dateTime': end_time.isoformat(),
            'timeZone': get_settings().clinic_timezone,
        },
        'attendees': [{'email': email} for email in attendees_emails],
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'popup', 'minutes': 24 * 60},
                {'method': 'email', 'minutes': 60},
            ],
        },
    }
    if location:
        event['location'] = location

    try:
        event = service.events().insert(calendarId='primary', body=event, sendUpdates='all').execute()
        print(f'Event created: {event.get("htmlLink")}')
        return event.get('htmlLink')
    except HttpError as error:
        print(f'An error occurred: {error}')
        return None
