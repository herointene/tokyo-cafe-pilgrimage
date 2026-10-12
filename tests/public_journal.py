"""Publication checks use temporary collections, never real public notes."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/import_public_journal.py"
AUTHOR = {"name": "Test author", "url": "https://github.com/herointene"}


def entry(shop="cafe-012", day="2026-10-10", note="Test visit"):
    return {"id": f"{shop}--{day or 'note'}", "shopId": shop, "date": day,
            "drink": "Test coffee", "note": note, "visited": True}


def collection(*entries):
    return {"version": 1, "author": AUTHOR, "entries": list(entries)}


class PublicationChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.output = self.directory / "public.json"
        self.selection = self.directory / "selection.json"
        self.output.write_text(json.dumps(collection(entry(), entry("cafe-043"))), encoding="utf-8")

    def run_import(self, payload=None, *options):
        arguments = [sys.executable, str(SCRIPT), "--output", str(self.output)]
        if payload is not None:
            self.selection.write_text(json.dumps(payload), encoding="utf-8")
            arguments.append(str(self.selection))
        return subprocess.run(arguments + list(options), capture_output=True, text=True)

    def test_merge_update_and_distinct_visit_dates(self):
        new = collection(entry(note="Updated visit"), entry(day="2026-10-12"), entry("cafe-001", ""))
        before = self.output.read_bytes()
        self.assertEqual(self.run_import(new, "--check").returncode, 0)
        self.assertEqual(self.output.read_bytes(), before)
        self.assertEqual(self.run_import(new).returncode, 0)
        published = json.loads(self.output.read_text())
        self.assertEqual(len(published["entries"]), 4)
        self.assertEqual(published["entries"][0]["date"], "2026-10-12")
        self.assertEqual(next(e for e in published["entries"] if e["id"] == entry()["id"])["note"], "Updated visit")
        self.assertIn(entry("cafe-043"), published["entries"])
        merged = self.output.read_bytes()
        self.assertEqual(self.run_import(new).returncode, 0)
        self.assertEqual(self.output.read_bytes(), merged)
        self.assertEqual(self.run_import(None, "--remove", entry()["id"]).returncode, 0)
        self.assertEqual(len(json.loads(self.output.read_text())["entries"]), 3)

    def test_private_or_invalid_input_never_changes_public_file(self):
        before = self.output.read_bytes()
        private = {"version": 2, "saved": ["cafe-001"], "visited": ["cafe-012"],
                   "entries": {"cafe-012": {"note": "Private test record"}}}
        invalid = [private, collection(entry(day="2026-02-30")), collection(entry("cafe-999")),
                   collection(entry(), entry()), collection(entry(note="😀" * 401))]
        extra = collection(entry())
        extra["entries"][0]["privateBackup"] = "Not a public field"
        invalid.append(extra)
        for payload in invalid:
            with self.subTest(case=len(json.dumps(payload))):
                self.assertNotEqual(self.run_import(copy.deepcopy(payload)).returncode, 0)
                self.assertEqual(self.output.read_bytes(), before)
        self.assertNotEqual(self.run_import(None, "--remove", "unknown-entry").returncode, 0)
        self.assertEqual(self.output.read_bytes(), before)

    def test_duplicate_json_keys_and_corrupt_current_collection(self):
        before = self.output.read_bytes()
        self.selection.write_text('{"version":1,"version":2,"author":{},"entries":[]}', encoding="utf-8")
        result = subprocess.run([sys.executable, str(SCRIPT), str(self.selection), "--output", str(self.output)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.output.read_bytes(), before)
        self.output.write_text('{"version": 1, "entries": []}', encoding="utf-8")
        corrupt = self.output.read_bytes()
        self.assertNotEqual(self.run_import(collection(entry())).returncode, 0)
        self.assertEqual(self.output.read_bytes(), corrupt)

    def test_check_does_not_create_a_collection(self):
        self.output.unlink()
        self.assertEqual(self.run_import(collection(entry()), "--check").returncode, 0)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
