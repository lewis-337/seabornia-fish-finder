"""Fetch fixed GEBCO2026 model cells near public area markers; retain successes.

WMS1.3 EPSG:4326 has latitude/longitude axis order. Cell-aligned 3x3
queries avoid a resampling/no-results ambiguity for very small arbitrary boxes.
Not a navigational sounding, tide-corrected depth or area-wide depth range.
"""
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://wms.gebco.net/2026/mapserv'
SOURCE = 'https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid'


def query(area):
    lat = (math.floor((area['lat'] + 90) * 240) + .5) / 240 - 90
    lng = (math.floor((area['lng'] + 180) * 240) + .5) / 240 - 180
    d = 1.5 / 240
    return ENDPOINT + '?' + urlencode(dict(SERVICE='WMS', REQUEST='GetFeatureInfo', VERSION='1.3.0',
        LAYERS='GEBCO_2026_2', QUERY_LAYERS='GEBCO_2026_2', STYLES='', CRS='EPSG:4326',
        BBOX=f'{lat-d:.9f},{lng-d:.9f},{lat+d:.9f},{lng+d:.9f}', WIDTH=3, HEIGHT=3,
        I=1, J=1, FORMAT='image/png', INFO_FORMAT='text/plain'))


def parse(text, area):
    fields = dict(re.findall(r"\b(x|y|value_list)\s*=\s*'([^']+)'", text))
    if 'ServiceException' in text or not all(k in fields for k in ('x', 'y', 'value_list')):
        raise ValueError('No numeric model cell')
    lng, lat, elevation = (float(fields[k]) for k in ('x', 'y', 'value_list'))
    if not all(math.isfinite(v) for v in (lng, lat, elevation)) or not -12000 < elevation < 9000:
        raise ValueError('Invalid/no-data elevation')
    if abs(lat - area['lat']) > .005 or abs(lng - area['lng']) > .005:
        raise ValueError('Sample outside requested grid cell')
    return dict(elevation_m=elevation, sample_lat=lat, sample_lng=lng,
                requested_lat=area['lat'], requested_lng=area['lng'])


def collect(fetch=None):
    fetch = fetch or (lambda u: urlopen(Request(u, headers={'User-Agent': 'Seabornia/7 public reference depth'}), timeout=40).read().decode())
    path = ROOT / 'data/area_depths.json'
    old = json.loads(path.read_text()) if path.exists() else {}
    data = dict(schema_version=1, release='GEBCO2026', grid_arcseconds=15, source=SOURCE,
                endpoint=ENDPOINT, licence='Public domain', areas=old.get('areas', {}), status=[])
    now = datetime.now(timezone.utc).isoformat()
    for a in json.loads((ROOT / 'data/latest.json').read_text())['areas']:
        try:
            sample = parse(fetch(query(a)), a)
            data['areas'][a['id']] = dict(sample, fetched_at=now, source=SOURCE, release='GEBCO2026')
            data['status'].append(dict(area_id=a['id'], ok=True, checked_at=now))
        except Exception as e:
            data['status'].append(dict(area_id=a['id'], ok=False, checked_at=now, error=str(e)[:180]))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    return data


if __name__ == '__main__':
    result = collect()
    print(f"Depth reference: {sum(r['ok'] for r in result['status'])}/{len(result['status'])}; previous successes retained")
