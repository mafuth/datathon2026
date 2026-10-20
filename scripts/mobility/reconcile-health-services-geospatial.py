#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import difflib
import importlib.util
import json
import re
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"D:\datathon\new")
DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
CACHE = OUT / "service-health-geospatial-cache.json"
REPORT = OUT / "service-island-health-geospatial-matches.json"


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def norm(value: str | None) -> str:
    import unicodedata
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    value = re.sub(r"\([^)]*\)", " ", value)
    value = re.sub(r"\bclosed\b", " ", value)
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


def nominatim(query: str) -> tuple[str, list[dict], str]:
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": query, "format": "jsonv2", "limit": 5, "addressdetails": 1})
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mobility-service-island-review/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return url, json.loads(response.read().decode("utf-8")), "ok"
    except Exception as exc:
        return url, [], f"error:{type(exc).__name__}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location("official", ROOT / "scripts/mobility/reconcile-health-services-official.py")
    official = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(official)
    directory = official.fetch_directory()
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    services = [dict(row) for row in conn.execute("select id, island_id, service_type, subtype, name from service where island_id is null and service_type='health' order by id")]
    islands = []
    for row in conn.execute("select id, name, atoll_id, geo_json from island"):
        islands.append({"id": row[0], "name": row[1], "atoll_id": row[2], "geometry": json.loads(row[3])})
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}
    matches = []
    for service in services:
        ranked = sorted(((difflib.SequenceMatcher(None, norm(service["name"]), norm(record["name"])).ratio(), record) for record in directory), key=lambda item: item[0], reverse=True)
        if not ranked or ranked[0][0] < 0.92:
            continue
        score, record = ranked[0]
        if sum(1 for other_score, _ in ranked if other_score >= score - 0.005) != 1:
            continue
        query = f"{record['name']} {record['address']} Maldives"
        key = query.lower()
        if key not in cache:
            url, results, status = nominatim(query)
            cache[key] = {"url": url, "results": results, "status": status, "retrieved_at": now()}
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
            time.sleep(1.05)
        result_set = cache[key]
        candidates = []
        for result in result_set.get("results", []):
            try:
                lat, lon = float(result["lat"]), float(result["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            contained = [island for island in islands if in_geom(lon, lat, island["geometry"])]
            if len(contained) == 1:
                candidates.append((result, contained[0], lat, lon))
        if len(candidates) != 1:
            continue
        result, island, lat, lon = candidates[0]
        entry = entries[service["id"]]
        entry.update({
            "disposition": "confirmed",
            "island_id": island["id"],
            "island_name": island["name"],
            "atoll_id": island["atoll_id"],
            "confidence": "high",
            "query_variants": [service["name"], record["name"], query],
            "source_urls": ["https://maaharaa.health.gov.mv/Public/Home/ListHealthCare", record["detail_url"], result_set["url"]],
            "provider": "Maldives Ministry of Health directory plus bounded Nominatim geocoding",
            "provider_status": "official directory name match and geocoded point inside one official island polygon",
            "returned_address": result.get("display_name"),
            "returned_coordinates": {"latitude": lat, "longitude": lon},
            "evidence_note": f"Official directory name variant matched at similarity {score:.3f}; the bounded public geocoder returned one result whose coordinate falls inside exactly one official island polygon.",
            "retrieved_at": now(),
        })
        matches.append({"service_id": service["id"], "name": service["name"], "directory_name": record["name"], "similarity": round(score, 4), "returned_address": result.get("display_name"), "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "source_url": result_set["url"]})
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
