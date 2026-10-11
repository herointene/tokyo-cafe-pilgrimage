#!/usr/bin/env python3
"""Fetch researched public pages and record link status and published map links."""

import html
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def review(item):
    shop_id, record = item
    url = record["officialUrl"] or record["sourceUrl"]
    result = {"id": shop_id, "url": url, "checkedAt": "2026-10-11"}
    if any(host in url for host in ["instagram.com", "facebook.com", "x.com"]):
        result["status"] = "social-login-required"
        return result
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 TokyoCafeGuide/1.0"})
        with urlopen(request, timeout=12) as response:
            body = response.read(2000000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            result.update(status=response.status, finalUrl=response.url)
        title = re.search(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
        result["title"] = html.unescape(re.sub(r"\s+", " ", title.group(1))) if title else ""
        links = re.findall(r'(?:href|src)=[\"\']([^\"\']+)[\"\']', body, re.I)
        result["mapLinks"] = list(dict.fromkeys(html.unescape(link) for link in links
            if re.search(r"maps\.app\.goo\.gl|goo\.gl/maps|google\.(?:com|co\.jp)/maps|maps\.google\.", link)
            and not re.search(r"(?:[?&](?:amp;)?key=|maps/api|maps/embed)", link)))
        result["socialLinks"] = list(dict.fromkeys(html.unescape(link) for link in links if re.search(r"instagram\.com|facebook\.com|twitter\.com|x\.com/", link)))[:6]
        body = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", body, flags=re.I | re.S)
        text = html.unescape(re.sub(r"<[^>]+>", " ", body))
        result["addressSnippets"] = list(dict.fromkeys(re.findall(r"東京都[^<>\n\r]{0,110}", text)))[:6]
    except HTTPError as error:
        result["status"] = error.code
    except Exception as error:
        result["status"] = "network-error"
        result["error"] = str(error)[:120]
    return result


def main():
    records = json.loads((ROOT / "data/enrichment.json").read_text())
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(review, records.items()))
    (ROOT / "data/link-audit.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    for result in results:
        print(result["id"], result["status"], result.get("title", ""))


if __name__ == "__main__":
    main()
