#!/usr/bin/env python3
from __future__ import annotations

import csv
import datetime as dt
import json
import sqlite3
from pathlib import Path

DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
ROOT = Path(r"D:\datathon\new")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
REPORT = OUT / "service-island-official-school-matches.json"
CSV_OUT = OUT / "service-island-official-school-matches.csv"
SOURCE = "https://www.moe.gov.mv/en/schools"
DETAILS = {
    "facility:school:439": ("island:625", "Dhidhdhoo", "HA", "https://www.moe.gov.mv/en/schools/439"),
    "facility:school:465": ("island:1192", "Komandoo", "Sh", "https://www.moe.gov.mv/en/schools/465"),
    "facility:school:601": ("island:429", "Vilin'gili", "GA", "https://www.moe.gov.mv/en/schools/601"),
    "facility:school:632": ("island:1559", "Addu Meedhoo", "S", "https://www.moe.gov.mv/en/schools/632"),
    "facility:school:648": ("island:1443", "Malé", "MLE", "https://www.moe.gov.mv/en/schools/648"),
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> None:
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    matches = []
    for service_id, (island_id, island_name, atoll_id, detail_url) in DETAILS.items():
        row = conn.execute("select id, island_id, name from service where id = ?", (service_id,)).fetchone()
        island = conn.execute("select id, name, atoll_id from island where id = ?", (island_id,)).fetchone()
        if row is None or island is None or row["island_id"] is not None:
            raise RuntimeError(f"precondition failed for {service_id}")
        entry = entries[service_id]
        entry.update({
            "disposition": "confirmed",
            "island_id": island["id"],
            "island_name": island["name"],
            "atoll_id": island["atoll_id"],
            "confidence": "high",
            "query_variants": [row["name"], f"{row['name']} Maldives Ministry of Education"],
            "source_urls": [SOURCE, detail_url],
            "provider": "Maldives Ministry of Education school directory",
            "provider_status": "official school detail page with explicit island and atoll",
            "returned_address": f"{atoll_id}. {island_name}",
            "returned_coordinates": None,
            "evidence_note": "The official Ministry of Education school detail page explicitly names the island and atoll; the mapping was joined to the matching official island record.",
            "retrieved_at": now(),
        })
        matches.append({"service_id": service_id, "name": row["name"], "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "source_url": detail_url})
    with conn:
        for match in matches:
            conn.execute("update service set island_id = ? where id = ? and island_id is null", (match["island_id"], match["service_id"]))
    artifact["generated_at"] = now()
    artifact["counts"] = {key: sum(1 for entry in entries.values() if entry.get("disposition") == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    REVIEW.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps({"generated_at": now(), "source_url": SOURCE, "matches": matches}, ensure_ascii=False, indent=2), encoding="utf-8")
    with CSV_OUT.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["service_id", "name", "island_id", "island_name", "atoll_id", "source_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(matches)
    print(json.dumps({"matched_records": len(matches), "db_mapped": conn.execute("select count(*) from service where island_id is not null").fetchone()[0], "db_missing": conn.execute("select count(*) from service where island_id is null").fetchone()[0], "counts": artifact["counts"]}, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
