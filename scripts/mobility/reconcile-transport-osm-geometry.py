#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import time
import urllib.request
from pathlib import Path

ROOT = Path(r"D:\datathon\new")
DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
CACHE = OUT / "service-osm-object-cache.json"
REPORT = OUT / "service-island-transport-osm-matches.json"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def norm(value: str | None) -> str:
    import unicodedata
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def pip(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    for i, a in enumerate(ring):
        b = ring[(i + 1) % len(ring)]
        if ((a[1] > y) != (b[1] > y)) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def in_geom(lon: float, lat: float, geom: dict) -> bool:
    if geom.get("type") == "Polygon":
        polys = [geom["coordinates"]]
    elif geom.get("type") == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return False
    return any(p and pip(lon, lat, p[0]) and not any(pip(lon, lat, h) for h in p[1:]) for p in polys)


def fetch(url: str) -> tuple[dict, str]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mobility-service-island-review/1.0"})
        with urllib.request.urlopen(req, timeout=35) as response:
            return json.loads(response.read().decode("utf-8")), "ok"
    except Exception as exc:
        return {}, f"error:{type(exc).__name__}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    services = [dict(row) for row in conn.execute("select id, island_id, service_type, subtype, name, latitude, longitude from service where island_id is null and service_type='transport' order by id")]
    islands = []
    for row in conn.execute("select id, name, atoll_id, geo_json from island"):
        islands.append({"id": row[0], "name": row[1], "atoll_id": row[2], "geometry": json.loads(row[3])})
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}
    matches = []
    for service in services:
        parts = service["id"].split(":")
        if len(parts) != 3 or parts[0] != "osm" or parts[1] not in ("node", "way"):
            continue
        typ, obj_id = parts[1], parts[2]
        url = f"https://api.openstreetmap.org/api/0.6/{typ}/{obj_id}{'/full' if typ == 'way' else ''}.json"
        if url not in cache:
            data, status = fetch(url)
            cache[url] = {"data": data, "status": status, "retrieved_at": now()}
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
            time.sleep(1.05)
        cached = cache[url]
        data = cached.get("data") or {}
        elements = data.get("elements") or []
        if not elements:
            continue
        primary = next((element for element in elements if element.get("type") == typ), elements[0])
        tags = primary.get("tags") or {}
        points = []
        if typ == "node" and primary.get("lat") is not None:
            points = [(float(primary["lon"]), float(primary["lat"]))]
        elif typ == "way":
            points = [(float(element["lon"]), float(element["lat"])) for element in elements if element.get("type") == "node" and element.get("lat") is not None]
        contained: dict[str, dict] = {}
        for lon, lat in points:
            for island in islands:
                if in_geom(lon, lat, island["geometry"]):
                    contained[island["id"]] = island
        if len(contained) != 1:
            continue
        island = next(iter(contained.values()))
        entry = entries[service["id"]]
        entry.update({
            "disposition": "confirmed",
            "island_id": island["id"],
            "island_name": island["name"],
            "atoll_id": island["atoll_id"],
            "confidence": "high",
            "query_variants": [service["name"], tags.get("name", "")],
            "source_urls": [url],
            "provider": "OpenStreetMap object geometry plus official island polygons",
            "provider_status": "live OSM geometry intersects one official island polygon",
            "returned_address": f"{island['atoll_id']}. {island['name']}",
            "returned_coordinates": {"latitude": service["latitude"], "longitude": service["longitude"]},
            "evidence_note": "The live OSM object geometry has at least one vertex inside exactly one official island polygon; no nearest-island inference was used.",
            "retrieved_at": now(),
        })
        matches.append({"service_id": service["id"], "name": service["name"], "osm_name": tags.get("name"), "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "source_url": url})
    with conn:
        for match in matches:
            conn.execute("update service set island_id = ? where id = ? and island_id is null", (match["island_id"], match["service_id"]))
    artifact["generated_at"] = now()
    artifact["counts"] = {key: sum(1 for entry in entries.values() if entry.get("disposition") == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    REVIEW.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps({"generated_at": now(), "matched_records": len(matches), "matches": matches}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"matched_records": len(matches), "db_mapped": conn.execute("select count(*) from service where island_id is not null").fetchone()[0], "db_missing": conn.execute("select count(*) from service where island_id is null").fetchone()[0], "counts": artifact["counts"]}, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
