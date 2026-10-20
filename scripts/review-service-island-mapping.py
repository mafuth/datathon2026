#!/usr/bin/env python3
"""Resumable, evidence-preserving service-to-island review.

The script deliberately uses only exact Nominatim searches and official local
island polygons. It never assigns an island from nearest-distance matching.
Run with --all to process every unresolved row in batches of 15.
"""

import argparse
import csv
import datetime as dt
import json
import math
import shutil
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
BACKUP = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db.bak-before-island-mapping")
ROOT = Path(r"D:\datathon\new")
OUT = ROOT / "data/mobility/derived"
STATE = OUT / ".service-island-mapping-progress.json"
JSON_OUT = OUT / "service-island-mapping-review.json"
CSV_OUT = OUT / "service-island-mapping-review.csv"
BATCH_SIZE = 15


def now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def point_in_ring(x, y, ring):
    inside = False
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        ax, ay = a[0], a[1]
        bx, by = b[0], b[1]
        if ((ay > y) != (by > y)) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def point_in_geometry(lon, lat, geometry):
    if not geometry or geometry.get("type") not in ("Polygon", "MultiPolygon"):
        return False
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return any(point_in_ring(lon, lat, p[0]) and not any(point_in_ring(lon, lat, h) for h in p[1:]) for p in polygons)


def read_state():
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"version": 1, "updated_at": now(), "entries": {}}


def save_state(state):
    state["updated_at"] = now()
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def island_for_point(lon, lat, islands):
    matches = [i for i in islands if point_in_geometry(lon, lat, i["geometry"])]
    return matches[0] if len(matches) == 1 else None


def nominatim(name, subtype):
    query = " ".join(part for part in (name or "", subtype, "Maldives") if part)
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": "5", "addressdetails": "1"})
    url = "https://nominatim.openstreetmap.org/search?" + params
    request = urllib.request.Request(url, headers={"User-Agent": "mobility-service-island-review/1.0 (public research)"})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return url, json.loads(response.read().decode("utf-8")), "ok"
    except Exception as exc:
        return url, [], f"error:{type(exc).__name__}"


def make_entry(row, status="unresolved", **extra):
    entry = {
        "service_id": row[0], "service_type": row[1], "subtype": row[2], "name": row[3],
        "original_island_id": row[4], "latitude": row[5], "longitude": row[6],
        "disposition": status, "island_id": None, "island_name": None, "atoll_id": None,
        "confidence": "none", "query_variants": [], "source_urls": [], "provider": None,
        "provider_status": None, "returned_address": None, "returned_coordinates": None,
        "evidence_note": None, "retrieved_at": now(),
    }
    entry.update(extra)
    return entry


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if not BACKUP.exists():
        shutil.copy2(DB, BACKUP)

    connection = sqlite3.connect(DB)
    rows = connection.execute("select id, service_type, subtype, name, island_id, latitude, longitude from service order by id").fetchall()
    islands = []
    for island_id, name, atoll_id, geo_json in connection.execute("select id, name, atoll_id, geo_json from island"):
        geometry = json.loads(geo_json)
        geometry = {"type": geometry.get("type", "Polygon"), "coordinates": geometry["coordinates"]}
        islands.append({"id": island_id, "name": name, "atoll_id": atoll_id, "geometry": geometry})
    islands_by_id = {island["id"]: island for island in islands}

    state = read_state()
    entries = state["entries"]
    for row in rows:
        if row[4] is not None and row[0] not in entries:
            entries[row[0]] = make_entry(row, "already_mapped", island_id=row[4], confidence="preserved", provider="local database", provider_status="existing mapping", source_urls=[DB.as_uri()], evidence_note="Existing non-null island_id preserved exactly.")
    for entry in entries.values():
        if entry.get("provider") in ("local database", "local database coordinate + official island polygon") and not entry.get("source_urls"):
            entry["source_urls"] = [DB.as_uri()]
        existing_id = entry.get("original_island_id")
        if existing_id and existing_id in islands_by_id:
            entry["island_id"] = existing_id
            entry["island_name"] = islands_by_id[existing_id]["name"]
            entry["atoll_id"] = islands_by_id[existing_id]["atoll_id"]

    pending = [row for row in rows if row[4] is None and (row[0] not in entries or entries[row[0]].get("disposition") == "unresolved")]
    limit = len(pending) if args.all else min(args.batch_size, len(pending))
    for row in pending[:limit]:
        entry = make_entry(row)
        if row[5] is not None and row[6] is not None:
            island = island_for_point(row[6], row[5], islands)
            if island:
                entry.update({"disposition": "confirmed", "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "confidence": "high", "provider": "local database coordinate + official island polygon", "provider_status": "point-in-polygon", "source_urls": [DB.as_uri()], "returned_coordinates": {"latitude": row[5], "longitude": row[6]}, "evidence_note": "The source row's existing coordinate falls inside exactly one official island polygon; no nearest-island inference was used."})
            else:
                entry.update({"disposition": "ambiguous", "confidence": "none", "provider": "local database coordinate + official island polygon", "provider_status": "no unique polygon match", "source_urls": [DB.as_uri()], "returned_coordinates": {"latitude": row[5], "longitude": row[6]}, "evidence_note": "Coordinate does not fall inside exactly one official island polygon; mapping withheld."})
        else:
            url, results, provider_status = nominatim(row[3], row[2])
            entry["query_variants"] = [" ".join(part for part in (row[3] or "", row[2], "Maldives") if part)]
            entry.update({"source_urls": [url], "provider": "OpenStreetMap Nominatim", "provider_status": provider_status})
            candidates = []
            for result in results:
                try:
                    lat, lon = float(result["lat"]), float(result["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                island = island_for_point(lon, lat, islands)
                if island:
                    candidates.append((result, island, lat, lon))
            if len(candidates) == 1:
                result, island, lat, lon = candidates[0]
                entry.update({"disposition": "provisional", "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "confidence": "medium", "returned_address": result.get("display_name"), "returned_coordinates": {"latitude": lat, "longitude": lon}, "evidence_note": "A single Nominatim result falls inside one official island polygon, but the source row had no coordinate; retained as provisional pending identity confirmation."})
            elif len(candidates) > 1:
                entry.update({"disposition": "ambiguous", "confidence": "none", "evidence_note": "Multiple place results fall on official island polygons; no deterministic identity or atoll context."})
            else:
                disposition = "source_not_found" if provider_status != "ok" else "no_coordinates"
                entry.update({"disposition": disposition, "confidence": "none", "evidence_note": "No exact public place result could be polygon-confirmed; mapping withheld."})
            time.sleep(1.05)
        entries[row[0]] = entry
        save_state(state)

    # Materialize the complete artifact after every batch, including untouched rows as explicit unresolved.
    for row in rows:
        if row[0] not in entries:
            entries[row[0]] = make_entry(row, "unresolved", evidence_note="Research not yet processed; resumable checkpoint.")
    ordered = [entries[row[0]] for row in rows]
    counts = {key: sum(1 for e in ordered if e["disposition"] == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    artifact = {"version": 1, "generated_at": now(), "source_database": str(DB), "backup_database": str(BACKUP), "service_count": len(ordered), "missing_island_count": sum(row[4] is None for row in rows), "counts": counts, "entries": ordered}
    JSON_OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    with CSV_OUT.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["service_id", "service_type", "subtype", "name", "original_island_id", "disposition", "island_id", "island_name", "atoll_id", "latitude", "longitude", "confidence", "provider", "provider_status", "returned_address", "returned_coordinates", "source_urls", "query_variants", "evidence_note", "retrieved_at"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for entry in ordered:
            writer.writerow({key: json.dumps(entry[key], ensure_ascii=False) if isinstance(entry[key], (dict, list)) else entry[key] for key in fields})

    confirmed = {e["service_id"]: e["island_id"] for e in ordered if e["disposition"] == "confirmed" and e["original_island_id"] is None and e["island_id"]}
    with connection:
        for service_id, island_id in confirmed.items():
            connection.execute("update service set island_id = ? where id = ? and island_id is null", (island_id, service_id))
    print(json.dumps({"processed_this_run": limit, "remaining_checkpoint_rows": len([r for r in rows if r[0] not in state["entries"]]), "counts": counts, "updated_ids": sorted(confirmed)}, indent=2))


if __name__ == "__main__":
    main()
