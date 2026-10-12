"""Keep catalogue notes focused on information useful to visitors."""

import re

EDITORIAL_TEXT = re.compile(
    r"(?:用户|用戶|使用者).*(?:更正|修正)"
    r"|(?:原始目錄|原表|原整理|原目錄).*(?:更正|修正|店名)"
    r"|(?:舊址|旧址|原址)"
)


def public_note(value):
    text = str(value or "").strip()
    return "" if EDITORIAL_TEXT.search(text) else text
