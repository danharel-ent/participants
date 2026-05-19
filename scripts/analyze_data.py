import json
import re
import csv
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent

html = (ROOT / "ticket_manager.html").read_text(encoding="utf-8")
m = re.search(r"const D=(\[.*?\]);", html, re.DOTALL)
D = json.loads(m.group(1)) if m else []
print("=== ticket_manager.html participants ===")
by_event = Counter(p["אירוע"] for p in D)
for ev, c in sorted(by_event.items(), key=lambda x: -x[1]):
    print(f"  {ev}: {c}")
print(f"Total: {len(D)}")

for path in [
    "purim/משתמשים גו אאוט הרצליה.csv",
    "purim/גו אאוט פרדס חנה.csv",
]:
    p = ROOT / path
    with open(p, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    scanned = [
        r
        for r in rows
        if str(r.get("scan_status", "")).lower() == "true"
        or (r.get("scan_time") or "").strip()
    ]
    print(f"\n=== {path} ===")
    print(f"  total rows: {len(rows)}")
    print(f"  scanned: {len(scanned)}")

for path in [
    "future projects/שבועות.csv",
    "future projects/זיגו תל אביב רוקח.csv",
    "purim/¿WineNot_ - Back2Rea-bought-tickets.csv",
]:
    p = ROOT / path
    if not p.exists():
        print(f"Missing {path}")
        continue
    with open(p, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    scanned = [
        r
        for r in rows
        if str(r.get("Scanned", "")).lower() == "true"
        or (r.get("Scanned_At") or "").strip()
    ]
    print(f"\n=== {path} ===")
    print(f"  total: {len(rows)}, scanned: {len(scanned)}")
