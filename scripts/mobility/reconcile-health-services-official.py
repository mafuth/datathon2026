#!/usr/bin/env python3
"""Reconcile missing health services against the official Ministry directory."""
from __future__ import annotations

import csv
import datetime as dt
import html
import json
import re
import sqlite3
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
ROOT = Path(r"D:\datathon\new")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
CSV_OUT = OUT / "service-island-official-health-matches.csv"
REPORT = OUT / "service-island-official-health-matches.json"
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


class DirectoryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[dict[str, object]] = []
        self.row: dict[str, object] | None = None
        self.cell: list[str] | None = None
        self.cell_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "tr" and attrs_dict.get("data-id"):
            self.row = {"data_id": attrs_dict["data-id"], "url": attrs_dict.get("data-url"), "cells": []}
        elif self.row is not None and tag == "td":
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.row is not None and self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self.row is not None and self.cell is not None:
            cells = self.row["cells"]
            assert isinstance(cells, list)
            cells.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
            self.cell = None


def _clean_fragment(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())


def fetch_directory() -> list[dict[str, str]]:
    request = urllib.request.Request(DIRECTORY_URL, headers={"User-Agent": "mobility-service-island-review/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        source = html.unescape(response.read().decode("utf-8", "replace"))
    result: list[dict[str, str]] = []
    for row_match in re.finditer(r'<tr\b[^>]*data-id="([^"]+)"[^>]*data-url="([^"]*)"[^>]*>(.*?)</tr>', source, re.I | re.S):
        row_html = row_match.group(3)
        primaries = [_clean_fragment(value) for value in re.findall(r'<div\s+class="pp-cell-primary">(.*?)</div>', row_html, re.I | re.S)]
        muted = [_clean_fragment(value) for value in re.findall(r'<div\s+class="pp-cell-muted">(.*?)</div>', row_html, re.I | re.S)]
        if len(primaries) < 3:
            continue
        result.append(
            {
                "directory_id": row_match.group(1),
                "detail_url": urllib.parse.urljoin(DIRECTORY_URL, row_match.group(2)),
                "name": primaries[0],
                "locality": muted[0] if muted else "",
                "address": primaries[2],
            }
        )
    return result


def atoll_norm(value: str | None) -> str:
    return norm(value).replace(" ", "")


def island_candidates(text: str, islands: list[dict[str, str]]) -> list[dict[str, str]]:
    haystack = norm(text)
    found: list[dict[str, str]] = []
    for island in sorted(islands, key=lambda item: len(norm(item["name"])), reverse=True):
        alias = norm(island["name"])
        if len(alias) < 4:
            continue
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", haystack):
            found.append(island)
    unique: dict[str, dict[str, str]] = {item["id"]: item for item in found}
    return list(unique.values())


def main() -> None:
    import urllib.parse

    OUT.mkdir(parents=True, exist_ok=True)
    directory = fetch_directory()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    services = [dict(row) for row in conn.execute("select id, island_id, service_type, subtype, name, latitude, longitude from service order by id")]
    islands = [dict(row) for row in conn.execute("select id, name, atoll_id from island")]
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}

    by_name: dict[str, list[dict[str, str]]] = {}
    for record in directory:
        by_name.setdefault(norm(record["name"]), []).append(record)

    matches: list[dict[str, object]] = []
    for service in services:
        if service["island_id"] is not None or service["service_type"] != "health":
            continue
        candidates = by_name.get(norm(service["name"]), [])
        if len(candidates) != 1:
            continue
        record = candidates[0]
        text = f"{record['name']} {record['address']}"
        island_matches = island_candidates(text, islands)
        if len(island_matches) != 1:
            continue
        island = island_matches[0]
        entry = entries[service["id"]]
        entry.update(
            {
                "disposition": "confirmed",
                "island_id": island["id"],
                "island_name": island["name"],
                "atoll_id": island["atoll_id"],
                "confidence": "high",
                "query_variants": [service["name"], f"{service['name']} Maldives"],
                "source_urls": [DIRECTORY_URL, record["detail_url"]],
                "provider": "Maldives Ministry of Health Maaharaa directory",
                "provider_status": "official directory exact-name and island-context match",
                "returned_address": record["address"],
                "returned_coordinates": None,
                "evidence_note": "The official Ministry of Health directory contains the exact service name and an address containing one official island name; the island was selected from the local official island universe, not by nearest distance.",
                "retrieved_at": now(),
            }
        )
        matches.append(
            {
                "service_id": service["id"],
                "name": service["name"],
                "island_id": island["id"],
                "island_name": island["name"],
                "atoll_id": island["atoll_id"],
                "directory_name": record["name"],
                "address": record["address"],
                "source_url": record["detail_url"],
            }
        )

    by_id = {row["id"]: row for row in services}
    with conn:
        for match in matches:
            conn.execute("update service set island_id = ? where id = ? and island_id is null", (match["island_id"], match["service_id"]))

    artifact["generated_at"] = now()
    counts = {key: sum(1 for entry in entries.values() if entry.get("disposition") == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    artifact["counts"] = counts
    REVIEW.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps({"generated_at": now(), "source_url": DIRECTORY_URL, "directory_records": len(directory), "matched_records": len(matches), "matches": matches}, ensure_ascii=False, indent=2), encoding="utf-8")
    with CSV_OUT.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["service_id", "name", "island_id", "island_name", "atoll_id", "directory_name", "address", "source_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(matches)

    verified = conn.execute("select count(*) from service where island_id is not null").fetchone()[0]
    null_count = conn.execute("select count(*) from service where island_id is null").fetchone()[0]
    conn.close()
    print(json.dumps({"directory_records": len(directory), "matched_records": len(matches), "db_mapped": verified, "db_missing": null_count, "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
