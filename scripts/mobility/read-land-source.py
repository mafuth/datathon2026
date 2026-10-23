"""Read-only national OSM PBF / island-polygon source investigation (stdlib only)."""
import json
import struct
import zlib
from pathlib import Path


def varints(data):
    value = shift = 0
    for byte in data:
        value |= (byte & 127) << shift
        if byte < 128:
            yield value
            value = shift = 0
        else:
            shift += 7


def fields(data):
    index = 0
    def integer():
        nonlocal index
        value = shift = 0
        while True:
            byte = data[index]
            index += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7
    result = {}
    while index < len(data):
        tag = integer()
        wire = tag & 7
        if wire == 0:
            value = integer()
        elif wire == 2:
            size = integer()
            value = data[index:index + size]
            index += size
        else:
            size = 8 if wire == 1 else 4
            value = data[index:index + size]
            index += size
        result.setdefault(tag >> 3, []).append(value)
    return result


def deltas(data):
    total = 0
    for value in varints(data):
        total += (value >> 1) ^ -(value & 1)
        yield total


def inside(point, ring):
    x, y = point
    result = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            result = not result
    return result


def main():
    root = Path(__file__).resolve().parents[2]
    baseline = json.loads((root / 'data/mobility/normalized/current-db-baseline.json').read_text(encoding='utf-8'))
    shapes = []
    for island in baseline['islands']:
        geometry = json.loads(island['geoJson'])
        polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
        points = [p for polygon in polygons for ring in polygon for p in ring]
        shapes.append((island['id'], polygons, (min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))))
    def owner(point):
        hits = []
        for identity, polygons, (x1, y1, x2, y2) in shapes:
            if x1 <= point[0] <= x2 and y1 <= point[1] <= y2 and any(inside(point, p[0]) and not any(inside(point, h) for h in p[1:]) for p in polygons):
                hits.append(identity)
        return hits[0] if len(hits) == 1 else None
    nodes = {}
    candidates = []
    aerodromes = []
    with (root / 'data/mobility/raw/osm/maldives-latest.osm.pbf').open('rb') as stream:
        while size := stream.read(4):
            header = fields(stream.read(struct.unpack('>I', size)[0]))
            blob = fields(stream.read(header[3][0]))
            if header[1][0] != b'OSMData':
                continue
            block = fields(blob[1][0] if 1 in blob else zlib.decompress(blob[3][0]))
            strings = [s.decode('utf-8') for s in fields(block[1][0])[1]]
            granularity = block.get(17, [100])[0]
            lat_offset, lon_offset = block.get(19, [0])[0], block.get(20, [0])[0]
            for group_data in block.get(2, []):
                group = fields(group_data)
                for dense_data in group.get(2, []):
                    dense = fields(dense_data)
                    for identity, lat, lon in zip(deltas(dense[1][0]), deltas(dense[8][0]), deltas(dense[9][0])):
                        nodes[identity] = [(lon_offset + granularity * lon) * 1e-9, (lat_offset + granularity * lat) * 1e-9]
                for way_data in group.get(3, []):
                    way = fields(way_data)
                    tags = {strings[k]: strings[v] for k, v in zip(varints(way.get(2, [b''])[0]), varints(way.get(3, [b''])[0]))}
                    if tags.get('aeroway') in {'aerodrome', 'seaplane', 'waterdrome'}:
                        aerodromes.append({'id': f'osm:way:{way[1][0]}', 'tags': tags})
                    if tags.get('highway') not in {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}:
                        continue
                    if tags.get('area') == 'yes' or tags.get('access') in {'no', 'private'}:
                        continue
                    refs = list(deltas(way[8][0]))
                    if any(ref not in nodes for ref in refs):
                        continue
                    coordinates = [nodes[ref] for ref in refs]
                    sequence = []
                    crossings = []
                    last_index = None
                    for index, point in enumerate(coordinates):
                        identity = owner(point)
                        if identity and (not sequence or identity != sequence[-1]):
                            if sequence:
                                crossings.append({'from': sequence[-1], 'to': identity, 'vertex_range': [last_index, index], 'coordinates': [[round(p[0], 7), round(p[1], 7)] for p in coordinates[last_index:index + 1]]})
                            sequence.append(identity)
                        if identity:
                            last_index = index
                    if len(set(sequence)) > 1:
                        candidates.append({'id': f'osm:way:{way[1][0]}', 'tags': {k: v for k, v in tags.items() if k in {'highway', 'bridge', 'man_made', 'name:en', 'name', 'oneway', 'access'}}, 'crossings': crossings})
    import sys
    print(json.dumps({'source': 'data/mobility/raw/osm/maldives-latest.osm.pbf', **({'aerodromes': aerodromes} if '--airports' in sys.argv else {'elements': candidates})}, ensure_ascii=True, separators=(',', ':')))


if __name__ == '__main__':
    main()
