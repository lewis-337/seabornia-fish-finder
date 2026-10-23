"""Public regional forecasts and Aburatsubo predictions; never reads private records."""
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json
import math
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
JST = timezone(timedelta(hours=9))
WEATHER = 'https://api.open-meteo.com/v1/forecast'
MARINE = 'https://marine-api.open-meteo.com/v1/marine'
TIDE = 'https://api.tide736.net/get_tide.php'

def read(path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default

def write(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(path)

def fetch(url, params):
    request = urllib.request.Request(url + '?' + urllib.parse.urlencode(params), headers={'User-Agent': 'Seabornia-personal-fishing/1.0'})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                return json.load(response)
        except Exception:
            if attempt: raise
            time.sleep(1)

def number(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None

def normalize_forecast(raw, kind, stamp):
    hourly = raw.get('hourly', {})
    times = hourly.get('time', [])
    fields = ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'precipitation_probability', 'temperature_2m'] if kind == 'weather' else ['wave_height', 'wave_period', 'wave_direction']
    units = raw.get('hourly_units', {})
    expected = {'wind_speed_10m': 'm/s', 'wind_gusts_10m': 'm/s', 'precipitation': 'mm', 'wave_height': 'm', 'wave_period': 's'}
    if not times or raw.get('timezone') != 'Asia/Tokyo' or any(units.get(k) != v for k,v in expected.items() if k in fields):
        raise ValueError('Invalid forecast units/timezone')
    hours = []
    for i, value in enumerate(times):
        datetime.fromisoformat(value)
        row = {'time': value}
        for field in fields:
            values = hourly.get(field, [])
            row[field] = number(values[i]) if i < len(values) else None
        hours.append(row)
    if not any(row.get(fields[0]) is not None for row in hours):
        raise ValueError('No forecast values')
    daily = raw.get('daily', {})
    days = [{'date': d, 'sunrise': daily.get('sunrise', [])[i], 'sunset': daily.get('sunset', [])[i]} for i,d in enumerate(daily.get('time', []))]
    return {'fetchedAt': stamp, 'status': 'ok', 'source': 'Open-Meteo', 'grid': {'lat': raw.get('latitude'), 'lng': raw.get('longitude')}, 'hours': hours, 'days': days, 'units': units}

def normalize_tide(raw, date, stamp, pc=14, hc=16):
    if raw.get('status') != 1 or raw.get('tide', {}).get('port', {}).get('harbor_code') != hc or raw.get('tide', {}).get('port', {}).get('prefecture_code',pc) != pc:
        raise ValueError('Wrong tide station or failed request')
    source = raw['tide']['chart'][date]
    def row(item):
        at = item.get('unix')
        if not isinstance(at, (int,float)) or at < 1000000000000 or datetime.fromtimestamp(at/1000, JST).isoformat(timespec='minutes')[:16] != (date+'T'+item.get('time','') if item.get('time') != '24:00' else (datetime.fromisoformat(date)+timedelta(days=1)).date().isoformat()+'T00:00') or number(item.get('cm')) is None:
            raise ValueError('Invalid tide timestamp/height')
        return {'at': int(at), 'cm': item['cm']}
    curve = [row(p) for p in source['tide']]
    if len(curve) < 60: raise ValueError('Incomplete tide curve')
    events = sorted([dict(row(p), kind=kind) for key,kind in [('flood','high'),('edd','low')] for p in source.get(key,[])], key=lambda p:p['at'])
    return {'name': source['moon']['title'], 'curve': curve, 'events': events, 'sunrise': source['sun']['rise'], 'sunset': source['sun']['set'], 'fetchedAt': stamp}

def collect(root=ROOT, getter=fetch, now=None, budget_seconds=180):
    now = now or datetime.now(JST)
    stamp = now.isoformat(timespec='seconds')
    deadline = time.monotonic() + budget_seconds
    def get(url, params):
        if time.monotonic() >= deadline:
            raise TimeoutError('Collection time budget reached')
        return getter(url, params)
    db = read(root/'data/latest.json', {})
    areas = [dict(a) for a in db['areas']] + [dict(db['marina'], id='marina')]
    conditions = read(root/'data/conditions.json', {'schema_version':1,'areas':{}})
    conditions.update(schema_version=1, checkedAt=stamp, source='Open-Meteo', weatherSource=WEATHER, marineSource=MARINE, timezone='Asia/Tokyo')
    errors = 0
    for area in areas:
        item = conditions['areas'].setdefault(area['id'], {})
        item.update({k:area[k] for k in ['id','name','lat','lng']})
        for kind,url in [('weather', WEATHER),('marine', MARINE)]:
            params = {'latitude':area['lat'], 'longitude':area['lng'], 'timezone':'Asia/Tokyo', 'forecast_days':7}
            if kind == 'weather':
                params.update(hourly='temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m',daily='sunrise,sunset',wind_speed_unit='ms')
            else: params['hourly'] = 'wave_height,wave_direction,wave_period'
            try:
                item[kind] = normalize_forecast(get(url,params), kind, stamp)
            except Exception as error:
                errors += 1
                old = item.setdefault(kind, {})
                old.update(status='failed', checkedAt=stamp, error=type(error).__name__)
    write(root/'data/conditions.json',conditions)
    tides = read(root/'data/tides.json', {'schema_version':1, 'days':{}})
    tides.update(schema_version=1, checkedAt=stamp, source='tide736', url='https://tide736.net/', station='油壺・推算', pc=14, hc=16, timezone='Asia/Tokyo')
    dates = {(now.date()+timedelta(days=d)).isoformat() for d in range(-1,9)}
    dates.update(r['date'] for r in db.get('reports',[]) if r.get('date'))
    # Adjacent dates make tidal phases and next events across midnight explicit.
    dates |= {(datetime.fromisoformat(d).date()+timedelta(days=delta)).isoformat() for d in list(dates) for delta in [-1,1]}
    failures = []
    for date in sorted(dates):
        if date in tides['days']: continue  # deterministic predictions, keep verified cached days
        y,m,d = map(int,date.split('-'))
        try:
            tides['days'][date] = normalize_tide(get(TIDE, dict(pc=14,hc=16,yr=y,mn=m,dy=d,rg='day')), date, stamp)
        except Exception as error:
            failures.append({'date':date,'error':type(error).__name__})
    tides['failures'] = failures
    tides['status'] = 'partial' if failures else 'ok'
    write(root/'data/tides.json',tides)
    print(f"Conditions: {len(areas)} public locations; {errors} forecast failures; {len(tides['days'])} tide dates; {len(failures)} tide failures")
    return conditions,tides

if __name__ == '__main__': collect()
