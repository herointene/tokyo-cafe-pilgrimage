#!/usr/bin/env python3
"""Import the cafe catalogue and its visitor information."""

import argparse
import json
from collections import Counter
from pathlib import Path

from public_notes import public_note
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = ["page", "category", "name", "ward", "neighborhood", "station", "sourceNote"]


def read_workbook(path):
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            tree = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(item.itertext()) for item in tree]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next(s for s in workbook.findall("x:sheets/x:sheet", NS) if s.get("name") == "完整目錄")
        relation_id = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in relations if r.get("Id") == relation_id)
        target = target.lstrip("/") if target.startswith("/") else "xl/" + target
        rows = ET.fromstring(archive.read(target)).findall(".//x:row", NS)
        shops = []
        for row in rows:
            values = {}
            for cell in row.findall("x:c", NS):
                value = cell.find("x:v", NS)
                inline = cell.find("x:is", NS)
                text = value.text if value is not None else "".join(inline.itertext()) if inline is not None else ""
                if cell.get("t") == "s":
                    text = strings[int(text)]
                column = "".join(c for c in cell.get("r") if c.isalpha())
                values[column] = text or ""
            if values.get("B") not in {"カフェ編", "人気スイーツ", "喫茶店編"}:
                continue
            shop = dict(zip(FIELDS, (values.get(c, "") for c in "ABCDEFG")))
            shop["sourceNote"] = public_note(shop["sourceNote"])
            shop["page"] = int(shop["page"])
            shop["id"] = f"cafe-{len(shops) + 1:03d}"
            shop["sourceRow"] = int(row.get("r"))
            shops.append(shop)
        if not shops:
            raise ValueError("No catalogue shops found in 完整目錄")
        return shops


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", nargs="?", type=Path)
    args = parser.parse_args()
    workbooks = list(ROOT.glob("*.xlsx"))
    workbook = args.workbook or (workbooks[0] if len(workbooks) == 1 else None)
    if workbook is None:
        parser.error("Provide the Excel workbook path")
    shops = read_workbook(workbook)
    destination = ROOT / "data/source-shops.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(shops, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(shops)} shops, {len(set(s['ward'] for s in shops))} districts")
    print(dict(Counter(s["category"] for s in shops)))


if __name__ == "__main__":
    main()
