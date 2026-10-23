# -*- coding: utf-8 -*-
"""Hourly public-only regional forecasts and verified per-coast tide stations.
One forecast point per base + deduplicated sourced grounds. No private inputs.
"""
from pathlib import Path
from datetime import datetime,timedelta
import json,concurrent.futures,time
from update_conditions import fetch,read,write,normalize_forecast,normalize_tide,JST,WEATHER,MARINE,TIDE
ROOT=Path(__file__).resolve().parents[1]
STATIONS={
 'pacific':(8,5,'大洗'), 'tokyo-bay':(13,14,'晴海'), 'sagami':(14,16,'油壺'),
 'okinawa-west':(47,23,'都屋'), 'okinawa-east':(47,32,'泡瀬')}
OVERRIDES={'J12-0045':(13,3,'羽田'),'J12-0060':(12,12,'君津'),'J14-0010':(14,2,'末広'),'J14-0020':(14,3,'新港'),'J14-0040':(14,5,'根岸'),'J14-0130':(14,9,'浦賀'),'J14-0140':(14,17,'小田和湾'),'J14-0100':(14,18,'新宿湾'),'J14-0110':(14,18,'新宿湾'),'J14-0120':(14,18,'新宿湾'),'J14-0200':(14,14,'向ヶ崎'),'J14-0190':(14,20,'真鶴'),**dict.fromkeys(['J14-0080','J14-0050','J14-0045','J14-0060'],(14,19,'江ノ島'))}
# Offshore regional forecast samples, not fishing locations or routes.
SAMPLES={'J47-0010':(26.315,127.71),'J47-0020':(26.25,127.85),'J47-0030':(26.25,127.85),'J08-0040':(36.30,140.62),'J14-0190':(35.13,139.17)}

def station_for(m):
 pc,hc,name=OVERRIDES.get(m['id'],STATIONS.get(m['basin'],(None,None,'')))
 return dict(id=f'{pc}-{hc}',pc=pc,hc=hc,name=name+'・推算（地域参考）') if pc is not None else None

def collect(root=ROOT,getter=fetch,now=None):
 now=now or datetime.now(JST);stamp=now.isoformat(timespec='seconds')
 registry=read(root/'data/marinas.json',{});stations={};points={};mappings={}
 for m in registry['marinas']:
  if m['status']=='excluded':continue
  station=station_for(m);m['tideStation']=station
  if station:stations[station['id']]=station
  pack=read(root/'data/marinas'/f"{m['id']}.json",{'areas':[]})
  rows=[dict(a) for a in pack['areas']]
  lat,lng=SAMPLES.get(m['id'],(m['lat'],m['lng']))
  rows.append(dict(id='marina',name=m['name']+'周辺（地域予報）',lat=lat,lng=lng))
  mappings[m['id']]=[]
  for a in rows:
   key=f"{m['basin']}:{a['lat']:.3f}:{a['lng']:.3f}"
   coverage=[a['lng']-.06,a['lat']-.05,a['lng']+.06,a['lat']+.05]
   if m['basin']=='okinawa-west':coverage[2]=min(coverage[2],127.77)
   if m['basin']=='okinawa-east':coverage[0]=max(coverage[0],127.80)
   if m['basin']=='sagami' and a['lat']<35.35:coverage[2]=min(coverage[2],139.665)
   if m['basin']=='tokyo-bay' and a['lat']<35.35:coverage[0]=max(coverage[0],139.69)
   mappings[m['id']].append((a,key,coverage))
   points[key]=a
 # Public grid points share results. At the v10 inventory: 45 regional + 11
 # legacy points, 2 providers, 28 hourly/six-hourly runs = at most 3,136
 # location/provider calls per day, within the personal free-tier allowance.
 if len(points)>100:raise ValueError('Forecast budget exceeded; audit coverage before expanding')
 old=read(root/'data/marina-forecast-grid.json',{'points':{}});old.update(schema_version=1,checkedAt=stamp,points=old.get('points',{}))
 def one(item):
  key,a=item;value=old['points'].get(key,{})
  for kind,url in [('weather',WEATHER),('marine',MARINE)]:
   params=dict(latitude=a['lat'],longitude=a['lng'],timezone='Asia/Tokyo',forecast_days=7)
   if kind=='weather':params.update(hourly='temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m',daily='sunrise,sunset',wind_speed_unit='ms')
   else:params['hourly']='wave_height,wave_direction,wave_period'
   try:value[kind]=normalize_forecast(getter(url,params),kind,stamp)
   except Exception as e:value.setdefault(kind,{}).update(status='failed',checkedAt=stamp,error=type(e).__name__)
  return key,value
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  for k,v in ex.map(one,points.items()):old['points'][k]=v
 write(root/'data/marina-forecast-grid.json',old)
 for id,rows in mappings.items():
  areas={a['id']:{**old['points'][key],**{k:a[k] for k in ['id','name','lat','lng']},'coverage':coverage,'basin':key.split(':')[0]} for a,key,coverage in rows}
  write(root/'data/marinas'/f'{id}-conditions.json',dict(schema_version=1,marinaId=id,checkedAt=stamp,areas=areas,timezone='Asia/Tokyo'))
 for st in stations.values():
  path=root/'data/tide-stations'/f"{st['id']}.json"
  tides=read(path,{'days':{}});tides.update(schema_version=1,station=st['name'],pc=st['pc'],hc=st['hc'],checkedAt=stamp,timezone='Asia/Tokyo',source='tide736',url='https://tide736.net/')
  # Reuse a fully verified existing oil-tsubo cache.
  if st['id']=='14-16':tides['days'].update(read(root/'data/tides.json',{}).get('days',{}))
  dates={(now.date()+timedelta(days=d)).isoformat() for d in range(-2,10)}
  for id in mappings:
   m=next(m for m in registry['marinas'] if m['id']==id)
   if m['tideStation']['id']==st['id']:
    for r in read(root/'data/marinas'/f'{id}.json',{}).get('reports',[]):
     if r.get('date'):
      for delta in [-1,0,1]:dates.add((datetime.fromisoformat(r['date'])+timedelta(days=delta)).date().isoformat())
  failures=[]
  # Request a 30-day block once per missing period; normalize each returned date.
  missing=sorted((d for d in dates if d not in tides['days']), key=lambda d:(d < (now.date()-timedelta(days=2)).isoformat(), d))
  requested=0
  while missing and requested<3:
   requested+=1
   first=missing[0];y,m,d=map(int,first.split('-'))
   try:
    raw=getter(TIDE,dict(pc=st['pc'],hc=st['hc'],yr=y,mn=m,dy=d,rg='month'))
    for date in raw.get('tide',{}).get('chart',{}):
     try:tides['days'][date]=normalize_tide(raw,date,stamp,st['pc'],st['hc'])
     except Exception:pass
    if first not in tides['days']:raise ValueError('Station or date mismatch')
   except Exception as e:
    failures.append(dict(date=first,error=type(e).__name__))
    break  # Avoid hundreds of per-date retries during a provider outage.
   missing=[x for x in missing[1:] if x not in tides['days']]
  tides['failures']=failures;tides['pendingDates']=len(missing);tides['status']='partial' if failures or missing else 'ok';write(path,tides)
 write(root/'data/marinas.json',registry)
 print('Regional forecast grid:',len(points),'points;',len(stations),'tide stations')
 return registry
if __name__=='__main__':collect()
