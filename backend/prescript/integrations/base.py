from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class Recipient:
    name: str
    email: Optional[str] = None
    slack_user_id: Optional[str] = None
    teams_upn: Optional[str] = None
    whatsapp_number: Optional[str] = None
    phone_number: Optional[str] = None


class Notifier(ABC):
    channel: str = "base"

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    @abstractmethod
    def send(
        self,
        recipient: Recipient,
        subject: str,
        text: str,
        html: Optional[str] = None,
        attachments: Optional[List[str]] = None,
    ) -> bool:
        ...
