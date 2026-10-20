#!/usr/bin/env python3
"""Apply conservative fuzzy-name matches to the official Ministry health directory."""
from __future__ import annotations

import csv
import datetime as dt
import difflib
import html
import json
import re
import sqlite3
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
ROOT = Path(r"D:\datathon\new")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
REPORT = OUT / "service-island-official-health-fuzzy-matches.json"
CSV_OUT = OUT / "service-island-official-health-fuzzy-matches.csv"
DIRECTORY_URL = "https://maaharaa.health.gov.mv/Public/Home/ListHealthCare"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def norm(value: str | None) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    value = value.replace("&", " and ")
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\bclosed\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def clean(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())


def fetch_directory() -> list[dict[str, str]]:
    req = urllib.request.Request(DIRECTORY_URL, headers={"User-Agent": "mobility-service-island-review/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        source = response.read().decode("utf-8", "replace")
    records: list[dict[str, str]] = []
    row_re = re.compile(r'<tr\b[^>]*data-id="([^"]+)"[^>]*data-url="([^"]*)"[^>]*>(.*?)</tr>', re.I | re.S)
    for row in row_re.finditer(source):
        block = row.group(3)
        primaries = [clean(x) for x in re.findall(r'<div\s+class="pp-cell-primary">(.*?)</div>', block, re.I | re.S)]
        muted = [clean(x) for x in re.findall(r'<div\s+class="pp-cell-muted">(.*?)</div>', block, re.I | re.S)]
        if len(primaries) >= 3:
            records.append({"directory_id": row.group(1), "detail_url": urllib.parse.urljoin(DIRECTORY_URL, row.group(2)), "name": primaries[0], "locality": muted[0] if muted else "", "address": primaries[2]})
    return records


def island_candidates(text: str, islands: list[dict[str, str]]) -> list[dict[str, str]]:
    haystack = norm(text)
    found: dict[str, dict[str, str]] = {}
    for island in sorted(islands, key=lambda x: len(norm(x["name"])), reverse=True):
        alias = norm(island["name"])
        if len(alias) < 4:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", haystack):
            found[island["id"]] = island
    return list(found.values())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    directory = fetch_directory()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    services = [dict(row) for row in conn.execute("select id, island_id, service_type, subtype, name, latitude, longitude from service where island_id is null and service_type='health' order by id")]
    islands = [dict(row) for row in conn.execute("select id, name, atoll_id from island")]
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}
    matches: list[dict[str, object]] = []

    for service in services:
        service_name = norm(service["name"])
        ranked = sorted(
            ((difflib.SequenceMatcher(None, service_name, norm(record["name"])).ratio(), record) for record in directory),
            key=lambda item: item[0],
            reverse=True,
        )
        if not ranked or ranked[0][0] < 0.94:
            continue
        best_score = ranked[0][0]
        tied = [record for score, record in ranked if score >= best_score - 0.005]
        if len(tied) != 1:
            continue
        record = tied[0]
        candidates = island_candidates(f"{record['locality']} {record['address']}", islands)
        if len(candidates) != 1:
            continue
        island = candidates[0]
        entry = entries[service["id"]]
        entry.update(
            {
                "disposition": "confirmed",
                "island_id": island["id"],
                "island_name": island["name"],
                "atoll_id": island["atoll_id"],
                "confidence": "high",
                "query_variants": [service["name"], record["name"], f"{record['name']} Maldives"],
                "source_urls": [DIRECTORY_URL, record["detail_url"]],
                "provider": "Maldives Ministry of Health Maaharaa directory",
                "provider_status": "official directory high-confidence name variant and island-context match",
                "returned_address": record["address"],
                "returned_coordinates": None,
                "evidence_note": f"Official Ministry directory name variant matched at similarity {best_score:.3f}; the directory address contains one official island name. No nearest-island inference was used.",
                "retrieved_at": now(),
            }
        )
        matches.append({"service_id": service["id"], "name": service["name"], "directory_name": record["name"], "similarity": round(best_score, 4), "address": record["address"], "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "source_url": record["detail_url"]})

    with conn:
        for match in matches:
            conn.execute("update service set island_id = ? where id = ? and island_id is null", (match["island_id"], match["service_id"]))
    artifact["generated_at"] = now()
    artifact["counts"] = {key: sum(1 for entry in entries.values() if entry.get("disposition") == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    REVIEW.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps({"generated_at": now(), "source_url": DIRECTORY_URL, "matched_records": len(matches), "matches": matches}, ensure_ascii=False, indent=2), encoding="utf-8")
    with CSV_OUT.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["service_id", "name", "directory_name", "similarity", "address", "island_id", "island_name", "atoll_id", "source_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(matches)
    print(json.dumps({"matched_records": len(matches), "db_mapped": conn.execute("select count(*) from service where island_id is not null").fetchone()[0], "db_missing": conn.execute("select count(*) from service where island_id is null").fetchone()[0], "counts": artifact["counts"]}, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
