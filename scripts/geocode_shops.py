#!/usr/bin/env python3
"""Resolve verified cafe addresses, with a one-second interval and a local cache.

Coordinates from GSI's public address search describe an address, not an exact
entrance. The site retains this distinction and links to the original map.
The cache is deliberately outside the published checkout.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch"
CACHE = Path("/tmp/tokyo-cafe-pilgrimage-geocoding-cache.json")


def street_address(address: str) -> str:
    """Remove floors/building names; retain the verified Japanese street number."""
    match = re.match(r"^(.*?[0-9]+(?:-[0-9]+){1,2})", address)
    return match.group(1) if match else address.split(" ")[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="/tmp/tokyo-cafe-geocoded.json")
    args = parser.parse_args()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    shops = json.loads((ROOT / "data/shops.json").read_text())["shops"]
    results = {}
    for shop in shops:
        query = street_address(shop["address"])
        url = ENDPOINT + "?" + urllib.parse.urlencode({"q": query})
        if query not in cache:
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "TokyoCafePilgrimage/1.0 (one-time verified address research)",
                })
                with urllib.request.urlopen(req, timeout=20) as response:
                    cache[query] = json.load(response)
                CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n")
            except Exception as exc:
                print(shop["id"], "request failed", type(exc).__name__, flush=True)
                cache[query] = []
            time.sleep(1.1)
        candidates = cache[query]
        entry = {"query": query, "coordinateSource": url, "candidates": candidates}
        if len(candidates) == 1:
            candidate = candidates[0]
            lng, lat = candidate["geometry"]["coordinates"]
            title = candidate["properties"]["title"]
            if not (35.4 < lat < 35.95 and 139.0 < lng < 140.1):
                print(shop["id"], "outside expected Tokyo bounds", flush=True)
            else:
                normalized_title = unicodedata.normalize("NFKC", title)
                precision = "address"
                if query.count("-") >= 2 and "号" not in normalized_title:
                    precision = "approximate"
                # The service resolves POUND's 208-2 address to the parent 208
                # land parcel. Retain that explicit limit in the exported data.
                if shop["id"] == "cafe-014":
                    precision = "approximate"
                entry.update(lat=lat, lng=lng, coordinatePrecision=precision, coordinateLabel=title)
        results[shop["id"]] = entry
        print(shop["id"], len(candidates), entry.get("coordinateLabel", "needs review"), flush=True)
    Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    print("Resolved", sum("lat" in row for row in results.values()), "of", len(shops), flush=True)


if __name__ == "__main__":
    main()
