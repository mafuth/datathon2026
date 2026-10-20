#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import sqlite3
from pathlib import Path

DB = Path(r"C:\Users\mafaa\AppData\Local\hermes\attachments\local.db")
ROOT = Path(r"D:\datathon\new")
OUT = ROOT / "data/mobility/derived"
REVIEW = OUT / "service-island-mapping-review.json"
REPORT = OUT / "service-island-transport-airport-matches.json"
MAPPINGS = {
    "airport:vrkm": {"island_id": "island:868", "island_name": "Muli", "atoll_id": "M", "sources": ["https://caa.gov.mv/attachments/RkSqFCz1wZL9uF3eK2Zq.pdf", "https://api.openstreetmap.org/api/0.6/way/1557297319/full.json"], "note": "The named Muli Airport object and the official island record agree on Muli in Meemu Atoll."},
    "osm:way:1557297319": {"island_id": "island:868", "island_name": "Muli", "atoll_id": "M", "sources": ["https://api.openstreetmap.org/api/0.6/way/1557297319/full.json"], "note": "The OSM aerodrome is explicitly named Muli Airport; the name agrees with one official Muli island record."},
    "airport:vrmu": {"island_id": "island:260", "island_name": "Kudahuvadhoo", "atoll_id": "Dh", "sources": ["https://www.dhaalu-airport.com/", "https://nominatim.openstreetmap.org/reverse?lat=2.6670769&lon=72.8871628&format=jsonv2&zoom=18&addressdetails=1"], "note": "Nominatim reverse context identifies Kudahuvadhoo and the official airport site identifies Dhaalu Airport; the island is an exact official-universe match."},
    "osm:way:602758011": {"island_id": "island:260", "island_name": "Kudahuvadhoo", "atoll_id": "Dh", "sources": ["https://api.openstreetmap.org/api/0.6/way/602758011/full.json", "https://nominatim.openstreetmap.org/reverse?lat=2.6670769&lon=72.8871628&format=jsonv2&zoom=18&addressdetails=1"], "note": "The OSM aerodrome is explicitly named Dhaalu Airport and reverse location context identifies Kudahuvadhoo."},
    "osm:way:207073193": {"island_id": "island:51", "island_name": "Dhiggiri", "atoll_id": "Adh", "sources": ["https://api.openstreetmap.org/api/0.6/way/207073193/full.json"], "note": "The named aerodrome object is Landing Dhiggiri and the local official island universe has one Dhiggiri in the matching atoll context."},
    "osm:way:364296622": {"island_id": "island:10", "island_name": "Maayafushi", "atoll_id": "AA", "sources": ["https://api.openstreetmap.org/api/0.6/way/364296622/full.json"], "note": "The named aerodrome object is Landing Maayafushi and the local official island universe has one Maayafushi in the matching atoll context."},
    "osm:way:870478342": {"island_id": "island:1442", "island_name": "Hulhumalé", "atoll_id": "MLE", "sources": ["https://api.openstreetmap.org/api/0.6/way/870478342/full.json", "https://nominatim.openstreetmap.org/reverse?lat=4.1956433&lon=73.5361866&format=jsonv2&zoom=18&addressdetails=1"], "note": "The reverse location context identifies Hulhumalé for this waterdrome; it is mapped to the exact official Hulhumalé island record even though the water feature is outside the polygon."},
    "osm:way:978090098": {"island_id": "island:165", "island_name": "Finolhas", "atoll_id": "B", "sources": ["https://api.openstreetmap.org/api/0.6/way/978090098/full.json", "https://www.amilla.com/"], "note": "The named floating terminal is the Amilla resort terminal; public resort location evidence identifies Amilla with Finolhas in Baa Atoll, matching one official island record."},
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> None:
    artifact = json.loads(REVIEW.read_text(encoding="utf-8"))
    entries = {entry["service_id"]: entry for entry in artifact["entries"]}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    matches = []
    for service_id, mapping in MAPPINGS.items():
        row = conn.execute("select id, island_id, service_type, subtype, name from service where id = ?", (service_id,)).fetchone()
        island = conn.execute("select id, name, atoll_id from island where id = ?", (mapping["island_id"],)).fetchone()
        if row is None or island is None:
            raise RuntimeError(f"missing mapping precondition: {service_id}")
        if row["island_id"] is not None:
            continue
        entry = entries[service_id]
        entry.update({
            "disposition": "confirmed",
            "island_id": island["id"],
            "island_name": island["name"],
            "atoll_id": island["atoll_id"],
            "confidence": "high",
            "query_variants": [row["name"], f"{row['name']} Maldives"],
            "source_urls": mapping["sources"],
            "provider": "OSM object plus public location/operator evidence",
            "provider_status": "named transport feature and official island-context match",
            "returned_address": f"{island['atoll_id']}. {island['name']}",
            "returned_coordinates": None,
            "evidence_note": mapping["note"],
            "retrieved_at": now(),
        })
        matches.append({"service_id": service_id, "name": row["name"], "island_id": island["id"], "island_name": island["name"], "atoll_id": island["atoll_id"], "source_urls": mapping["sources"]})
    with conn:
        for match in matches:
            conn.execute("update service set island_id = ? where id = ? and island_id is null", (match["island_id"], match["service_id"]))
    artifact["generated_at"] = now()
    artifact["counts"] = {key: sum(1 for entry in entries.values() if entry.get("disposition") == key) for key in ("confirmed", "provisional", "ambiguous", "unresolved", "source_not_found", "no_coordinates", "already_mapped")}
    REVIEW.write_text(json.dumps(artifact, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT.write_text(json.dumps({"generated_at": now(), "matches": matches}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"matched_records": len(matches), "db_mapped": conn.execute("select count(*) from service where island_id is not null").fetchone()[0], "db_missing": conn.execute("select count(*) from service where island_id is null").fetchone()[0], "counts": artifact["counts"]}, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
