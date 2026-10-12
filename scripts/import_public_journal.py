#!/usr/bin/env python3
"""Validate and merge explicitly selected public coffee notes."""

import argparse
import json
import os
import re
import tempfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data/public-journal.json"
ENTRY_KEYS = {"id", "shopId", "date", "drink", "note", "visited"}
ENTRY_ID = re.compile(r"[a-zA-Z0-9_-]{1,80}")
PROFILE = re.compile(r"https://github\.com/[A-Za-z0-9-]+/?")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON contains a repeated object key")
        result[key] = value
    return result


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (json.JSONDecodeError, UnicodeError) as error:
        raise ValueError("File is not valid UTF-8 JSON") from error


def text_with_limit(value, limit, label):
    if not isinstance(value, str):
        raise ValueError(f"{label} must be text")
    try:
        length = len(value.encode("utf-16-le")) // 2
    except UnicodeError as error:
        raise ValueError(f"{label} contains invalid Unicode") from error
    if length > limit:
        raise ValueError(f"{label} exceeds {limit} characters")
    return value


def validate(payload, shop_ids):
    if not isinstance(payload, dict) or set(payload) != {"version", "author", "entries"}:
        raise ValueError("Use a public selection file, not a full private journal backup")
    if type(payload["version"]) is not int or payload["version"] != 1:
        raise ValueError("Only public journal version 1 is supported")
    author = payload["author"]
    if not isinstance(author, dict) or set(author) != {"name", "url"}:
        raise ValueError("Author must have a name and GitHub profile URL")
    name = text_with_limit(author["name"], 60, "Author name").strip()
    if not name or not isinstance(author["url"], str) or not PROFILE.fullmatch(author["url"]):
        raise ValueError("Author needs a name and an HTTPS GitHub profile URL")
    if not isinstance(payload["entries"], list):
        raise ValueError("Entries must be a list of selected public notes")
    ids, entries = set(), []
    for record in payload["entries"]:
        if not isinstance(record, dict) or set(record) != ENTRY_KEYS:
            raise ValueError("A public entry must contain only id, shopId, date, drink, note and visited")
        record_id = record["id"]
        if not isinstance(record_id, str) or not ENTRY_ID.fullmatch(record_id) or record_id in ids:
            raise ValueError("Entry IDs must be valid and unique")
        if not isinstance(record["shopId"], str) or record["shopId"] not in shop_ids:
            raise ValueError("Entry refers to an unknown shop")
        visit_date = record["date"]
        if not isinstance(visit_date, str):
            raise ValueError("Visit date must be YYYY-MM-DD or empty")
        if visit_date:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", visit_date):
                raise ValueError("Visit date must be YYYY-MM-DD or empty")
            try:
                date.fromisoformat(visit_date)
            except ValueError as error:
                raise ValueError("Visit date is not a real calendar date") from error
        if type(record["visited"]) is not bool:
            raise ValueError("Visited must be true or false")
        drink = text_with_limit(record["drink"], 100, "Drink")
        note = text_with_limit(record["note"], 800, "Note")
        ids.add(record_id)
        entries.append({"id": record_id, "shopId": record["shopId"], "date": visit_date,
                        "drink": drink, "note": note, "visited": record["visited"]})
    entries.sort(key=lambda entry: entry["id"])
    entries.sort(key=lambda entry: entry["date"], reverse=True)
    return {"version": 1, "author": {"name": name, "url": author["url"]}, "entries": entries}


def merge(current, incoming, shop_ids):
    current, incoming = validate(current, shop_ids), validate(incoming, shop_ids)
    records = {entry["id"]: entry for entry in current["entries"]}
    records.update({entry["id"]: entry for entry in incoming["entries"]})
    return validate({"version": 1, "author": incoming["author"], "entries": list(records.values())}, shop_ids)


def atomic_write(path, payload):
    contents = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=f".{path.name}.", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selection", nargs="?", type=Path, help="Downloaded public selection JSON")
    parser.add_argument("--check", action="store_true", help="Validate without writing")
    parser.add_argument("--remove", action="append", default=[], metavar="ENTRY_ID", help="Remove a published entry")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Public collection to update")
    args = parser.parse_args()
    if not args.selection and not args.remove and not args.check:
        parser.error("Provide a public selection, --remove, or --check")
    try:
        catalogue = json.loads((ROOT / "data/shops.json").read_text(encoding="utf-8"))
        shop_ids = {shop["id"] for shop in catalogue["shops"]}
        incoming = validate(read_json(args.selection), shop_ids) if args.selection else None
        if args.output.exists():
            current = validate(read_json(args.output), shop_ids)
        elif incoming is not None:
            current = {"version": 1, "author": incoming["author"], "entries": []}
        else:
            raise ValueError("Public collection does not exist")
        payload = merge(current, incoming, shop_ids) if incoming is not None else current
        remove_ids = set(args.remove)
        if remove_ids - {entry["id"] for entry in payload["entries"]}:
            raise ValueError("A requested removal ID was not found")
        payload["entries"] = [entry for entry in payload["entries"] if entry["id"] not in remove_ids]
        payload = validate(payload, shop_ids)
        if not args.check:
            atomic_write(args.output, payload)
        action = "Validated" if args.check else "Saved"
        print(f"{action} public journal: {len(payload['entries'])} entries; {len(remove_ids)} removed.")
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
