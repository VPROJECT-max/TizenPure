"""Remove identifiers (IP, MAC, DUID, UUID, e-mail, SSID) from text before it leaves the PC."""

import re

PATTERNS = (
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "<ip>"),
    (re.compile(r"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b"), "<mac>"),
    (re.compile(r"\buuid:[0-9a-fA-F-]{36}\b"), "uuid:<redacted>"),
    (re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"), "<uuid>"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "<email>"),
)
SENSITIVE_KEYS = {"duid", "id", "udn", "wifiMac", "ip", "developerIP", "ssid", "name", "deviceid"}


def text(value):
    for pattern, replacement in PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def mapping(value):
    """Redact a JSON-like structure: drop sensitive keys, scrub strings."""
    if isinstance(value, dict):
        return {k: ("<redacted>" if k in SENSITIVE_KEYS else mapping(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [mapping(v) for v in value]
    if isinstance(value, str):
        return text(value)
    return value
